import { Router } from 'express';
import { requireAuth, createLimiter } from '../lib/middleware';
import { loadUserDB, saveUserDB, updateStreak, unlockAchievement, sql } from '../lib/db';
import {
  getUserLessonCompletionStats,
  getRoadmapProgressSnapshot,
  getQuizForLesson,
} from '../db/queries';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';

// ---------------------------------------------------------------------------
// Public stats cache — TTL 5 minutes so the landing page is fast.
// ---------------------------------------------------------------------------
let publicStatsCache: { roadmapsGenerated: number; skillsCovered: number; ts: number } | null = null;
const PUBLIC_STATS_TTL = 5 * 60 * 1000;

const feedbackLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
  message: { error: 'Too many feedback submissions. Please slow down.' },
});

const router = Router();

// Get user stats
router.get('/user-stats', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    const [dbData, completionStats, studyMinutesRows] = await Promise.all([
      loadUserDB(userEmail, { createIfMissing: false }),
      getUserLessonCompletionStats(userEmail),
      // Sum all study_minutes from completed lessons for this user — the
      // authoritative source for hours studied (profile.hoursStudied is never written).
      sql`
        SELECT COALESCE(SUM(study_minutes), 0) AS total_minutes
        FROM user_lesson_progress
        WHERE owner_email = ${userEmail.toLowerCase()}
          AND completed = TRUE
      `.catch(() => [{ total_minutes: 0 }] as any[]),
    ]);

    if (!dbData) return res.json({ xp: 0, streak: 0, hoursStudied: 0, lessonsCompleted: 0, overallMastery: 0, daysSinceLastVisit: null });

    const { totalLessons, completedLessons } = completionStats;
    const overallMastery = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    const totalMinutes = Number((studyMinutesRows as any[])[0]?.total_minutes ?? 0);
    const hoursStudied = Math.round((totalMinutes / 60) * 10) / 10;

    // Compute days since last active date (null = no prior visit recorded)
    let daysSinceLastVisit: number | null = null;
    if (dbData.last_active_date) {
      const last = new Date(dbData.last_active_date);
      const today = new Date();
      const diffMs = today.setHours(0,0,0,0) - last.setHours(0,0,0,0);
      daysSinceLastVisit = Math.max(0, Math.floor(diffMs / 86_400_000));
    }

    return res.json({
      xp: dbData.xp || 0,
      streak: dbData.streak ?? 0,
      hoursStudied,
      lessonsCompleted: completedLessons,
      overallMastery: Math.round(overallMastery),
      daysSinceLastVisit,
    });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'user-stats query failed');
    Sentry.captureException(error);
    return res.status(503).json({ error: 'Stats temporarily unavailable', code: 'STATS_FAILED' });
  }
});

// Get user resource states
router.get('/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const states = dbData?.progress?.resource_states || { completedIds: [], savedIds: [] };
    return res.json(states);
  } catch (error) {
    logger.error({ err: error }, 'user-resource-states query failed');
    return res.status(503).json({ error: 'Resource states temporarily unavailable', code: 'RESOURCE_STATES_FAILED' });
  }
});

router.post('/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const { completedIds, savedIds } = req.body;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData) return res.status(503).json({ error: 'Resource states temporarily unavailable', code: 'RESOURCE_STATES_FAILED' });
    if (!dbData.progress) dbData.progress = {};
    dbData.progress.resource_states = { completedIds: Array.isArray(completedIds) ? completedIds : [], savedIds: Array.isArray(savedIds) ? savedIds : [] };
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Save resource states error');
    Sentry.captureException(error);
    return res.status(500).json({ error: 'Failed to save resource states', code: 'RESOURCE_SAVE_FAILED' });
  }
});

// Get user profile
router.get('/user-profile', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress || {};
    return res.json({ profile: progress.profile || {}, settings: progress.settings || {}, achievements: progress.achievements || [], notifications: progress.notifications || [], chats: progress.chats || [] });
  } catch (error) {
    logger.error({ err: error }, 'user-profile query failed');
    return res.status(503).json({ error: 'Profile temporarily unavailable', code: 'PROFILE_FAILED' });
  }
});

router.put('/user-profile', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  // achievements and activityLog are intentionally excluded from the client-writable surface.
  // achievements: must only be modified server-side via unlockAchievement() to prevent self-unlocking.
  // activityLog: must only be written by server-side lesson completion handlers to prevent fabrication.
  const { profile, settings, notifications, chats } = req.body;

  const PROFILE_BLOCKLIST = ['xp', 'level', 'streak', 'isPro', 'email', 'createdAt', 'id', 'tier'];
  // Maximum length for any single string value in the profile object.
  // Prevents a user from submitting a multi-MB bio and bloating the JSONB column.
  const PROFILE_STRING_MAX = 500;
  function sanitizeProfile(input: any): Record<string, any> | null {
    if (input === undefined || input === null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) return {};
    const clean: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      if (PROFILE_BLOCKLIST.includes(key)) continue;
      const val = input[key];
      // Truncate strings; pass through other scalar types; drop nested objects/arrays.
      if (typeof val === 'string') {
        clean[key] = val.slice(0, PROFILE_STRING_MAX);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        clean[key] = val;
      }
      // Silently drop objects / arrays — they are not valid profile fields.
    }
    return clean;
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData) return res.status(503).json({ error: 'Profile temporarily unavailable', code: 'PROFILE_UNAVAILABLE' });
    if (!dbData.progress) dbData.progress = {};
    const safeProfile = sanitizeProfile(profile);
    if (safeProfile) {
      const merged = { ...(dbData.progress.profile || {}), ...safeProfile };
      dbData.progress.profile = merged;
      dbData.profile = merged;
    }
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) dbData.progress.settings = settings;
    if (notifications) dbData.progress.notifications = Array.isArray(notifications) ? notifications : [];
    if (chats) dbData.progress.chats = Array.isArray(chats) ? chats : [];
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Update user profile error');
    Sentry.captureException(error);
    return res.status(500).json({ error: 'Failed to update profile', code: 'PROFILE_UPDATE_FAILED' });
  }
});

// Topic-wise quizzes
router.get('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    return res.json(dbData?.topic_wise_quizzes || []);
  } catch (error) {
    logger.error({ err: error }, 'topic-wise-quizzes query failed');
    return res.status(503).json({ error: 'Quizzes temporarily unavailable', code: 'TOPIC_QUIZZES_FAILED' });
  }
});

router.post('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const attempt = req.body;
  if (!attempt || !attempt.quizId) return res.status(400).json({ error: 'quizId is required', code: 'MISSING_QUIZ_ID' });

  try {
    // Determine the authoritative question count from the database.
    // If the quiz exists in the DB, cap score against its actual length.
    // For seed/topic quizzes not in the DB, use the client-supplied totalQuestions
    // but still enforce score <= total so a crafted request cannot inflate counts.
    const dbQuiz = await getQuizForLesson(attempt.quizId).catch(() => null);
    const authoritativeTotal: number = dbQuiz && Array.isArray(dbQuiz.questions) && dbQuiz.questions.length > 0
      ? dbQuiz.questions.length
      : Math.max(0, Number(attempt.totalQuestions) || 0);
    const sanitizedScore = Math.min(Math.max(0, Number(attempt.score) || 0), authoritativeTotal);

    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) return res.status(404).json({ error: 'User data not found', code: 'USER_NOT_FOUND' });
    const quizzes = dbData.topic_wise_quizzes || [];
    const idx = quizzes.findIndex((q: any) => q.quizId === attempt.quizId);
    const sanitizedAttempt = {
      id: attempt.id || `quiz-${Date.now()}`,
      quizId: attempt.quizId,
      quizName: attempt.quizName || 'Untitled Quiz',
      score: sanitizedScore,
      totalQuestions: authoritativeTotal,
      attemptsCount: attempt.attemptsCount || 0,
      lastAttemptedAt: attempt.lastAttemptedAt || new Date().toISOString(),
    };
    if (idx >= 0) {
      quizzes[idx] = { ...quizzes[idx], ...sanitizedAttempt };
    } else {
      quizzes.push(sanitizedAttempt);
    }
    dbData.topic_wise_quizzes = quizzes;
    await saveUserDB(userEmail, dbData);

    // Unlock "Quiz Master" achievement when user scores 100% on any quiz.
    // Uses sanitizedScore and authoritativeTotal so the check cannot be spoofed.
    let newAchievement: { id: string; name: string; icon: string; xpReward: number } | null = null;
    if (authoritativeTotal > 0 && sanitizedScore === authoritativeTotal) {
      newAchievement = await unlockAchievement(userEmail, 'ach-2');
    }

    return res.json({ success: true, attempt: quizzes[idx >= 0 ? idx : quizzes.length - 1], newAchievement });
  } catch (error) {
    logger.error({ err: error }, 'Upsert topic wise quiz error');
    Sentry.captureException(error);
    return res.status(500).json({ error: 'Failed to save quiz attempt', code: 'QUIZ_SAVE_FAILED' });
  }
});

// Progress tracking
router.post('/progress', requireAuth, async (req, res) => {
  const { roadmapId, lessonId, action } = req.body;
  const userEmail = req.supabaseUser!.email;
  if (!roadmapId || !lessonId) return res.status(400).json({ error: 'roadmapId and lessonId are required', code: 'MISSING_IDS' });

  // dynamic import to avoid circular deps
  const { findLessonContext, completeLessonForUser, getRoadmapState, upsertRoadmapState, getRoadmapById } = await import('../db/queries');

  try {
    const lessonCtx = await findLessonContext(lessonId);
    if (!lessonCtx || lessonCtx.roadmap_id !== roadmapId) return res.status(404).json({ error: 'Lesson or roadmap not found', code: 'LESSON_OR_ROADMAP_NOT_FOUND' });
    // Do not let a valid lesson/roadmap pair from another account mutate this
    // user's progress rows or the roadmap's aggregate counters.
    if (!await getRoadmapById(roadmapId, userEmail)) {
      return res.status(404).json({ error: 'Lesson or roadmap not found', code: 'LESSON_OR_ROADMAP_NOT_FOUND' });
    }

    if (action === 'complete') {
      const counters = await completeLessonForUser(userEmail, lessonId, lessonCtx.module_id, lessonCtx.phase_id, roadmapId, null, 0);
      // Use per-user progress percent (already computed from user_lesson_progress inside completeLessonForUser)
      if (counters.totalLessons > 0 && counters.completedLessons >= counters.totalLessons) {
        const state = await getRoadmapState(userEmail, roadmapId);
        await upsertRoadmapState({ ownerEmail: userEmail, roadmapId, completedAt: state?.completed_at ?? new Date().toISOString() });
      }
    } else if (action === 'set-current') {
      await upsertRoadmapState({ ownerEmail: userEmail, roadmapId, currentLessonId: lessonId });
    }

    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ success: true, progress });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Progress tracking error');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'progress-tracking');
      scope.setExtra('roadmapId', req.body?.roadmapId);
      scope.setExtra('lessonId', req.body?.lessonId);
      Sentry.captureException(error);
    });
    return res.status(500).json({ error: 'Failed to update progress', code: 'PROGRESS_UPDATE_FAILED' });
  }
});

// Strip null bytes and ASCII control characters (except tab/newline/CR) from
// user-supplied strings before they reach the database.
function sanitizeFeedbackText(raw: unknown, maxLen: number): string {
  return String(raw || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
}

// Feedback endpoint — requires authentication to prevent anonymous spam.
router.post('/feedback', requireAuth, feedbackLimiter, async (req, res) => {
  const { sentiment, message, context } = req.body;
  if (!sentiment || !['positive', 'neutral', 'negative'].includes(sentiment)) {
    return res.status(400).json({ error: 'Valid sentiment is required', code: 'INVALID_SENTIMENT' });
  }
  try {
    const userEmail = req.supabaseUser!.email;
    await sql`
      INSERT INTO feedback (user_email, sentiment, message, context)
      VALUES (${userEmail}, ${sentiment}, ${sanitizeFeedbackText(message, 500)}, ${sanitizeFeedbackText(context, 200)})
    `.catch(() => {});
    return res.json({ ok: true });
  } catch (error) {
    return res.json({ ok: true }); // never fail the user on feedback
  }
});

router.get('/progress/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    // Ownership check — getRoadmapProgressSnapshot is keyed by ownerEmail so it
    // already scopes to the requesting user; no cross-user data can leak here.
    // Confirm roadmap exists and belongs to this user before any DB query.
    const { getRoadmapById } = await import('../db/queries');
    const owned = await getRoadmapById(roadmapId, userEmail);
    if (!owned) return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });
    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ progress });
  } catch (error: unknown) {
    logger.error({ err: error }, 'Get progress error');
    return res.json({ progress: null });
  }
});

// Real user analytics from DB — replaces synthetic data in userDataService.ts
router.get('/user-analytics', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    // Last 7 days of study hours per day from user_lesson_progress
    const today = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const rows = await sql`
      SELECT
        DATE(completed_at AT TIME ZONE 'UTC') AS day,
        COALESCE(SUM(study_minutes), 0) AS total_minutes
      FROM user_lesson_progress
      WHERE owner_email = ${userEmail.toLowerCase()}
        AND completed_at >= NOW() - INTERVAL '7 days'
        AND completed = TRUE
      GROUP BY DATE(completed_at AT TIME ZONE 'UTC')
    `.catch(() => [] as any[]);

    const minutesByDay: Record<string, number> = {};
    for (const row of rows) {
      // `DATE(... AT TIME ZONE 'UTC')` returns a date string in YYYY-MM-DD format.
      const dayStr = typeof row.day === 'string' ? row.day : new Date(row.day).toISOString().split('T')[0];
      minutesByDay[dayStr] = Number(row.total_minutes) || 0;
    }

    const weeklyHoursPerDay = days.map(d =>
      Math.round(((minutesByDay[d] || 0) / 60) * 10) / 10
    );

    // Overall mastery %
    const { totalLessons, completedLessons } = await getUserLessonCompletionStats(userEmail);
    const overallMasteryPercent = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    return res.json({ weeklyHoursPerDay, overallMasteryPercent });
  } catch (error) {
    logger.error({ err: error }, 'User analytics error');
    return res.json({ weeklyHoursPerDay: [0, 0, 0, 0, 0, 0, 0], overallMasteryPercent: 0 });
  }
});

// Checkout / subscription endpoint.
// Payment processor (Stripe/Razorpay) is not yet integrated. Return a clear
// 503 so the frontend can show an honest message rather than fake state.
router.post('/checkout', requireAuth, async (_req, res) => {
  return res.status(503).json({ error: 'Payments are not yet enabled. Pro features are coming soon.' });
});

// Public stats — no auth required, used by the landing page.
// Returns real DB counts with a 5-minute in-memory cache so every landing
// page load doesn't hit the database.
router.get('/public-stats', async (_req, res) => {
  const now = Date.now();
  if (publicStatsCache && now - publicStatsCache.ts < PUBLIC_STATS_TTL) {
    return res.json(publicStatsCache);
  }
  try {
    const [rmRow, skillRow] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM roadmaps`.catch(() => [{ count: 0 }]),
      // Count distinct skill tags across all lessons — a good proxy for "skills covered".
      sql`SELECT COUNT(DISTINCT skill_tag) AS count FROM (
            SELECT jsonb_array_elements_text(skill_tags) AS skill_tag FROM lessons
          ) t`.catch(() => [{ count: 0 }]),
    ]);
    const roadmapsGenerated = Number((rmRow as any[])[0]?.count ?? 0);
    const skillsCovered = Number((skillRow as any[])[0]?.count ?? 0);
    publicStatsCache = { roadmapsGenerated, skillsCovered, ts: now };
    return res.json({ roadmapsGenerated, skillsCovered });
  } catch (err) {
    logger.warn({ err }, '[public-stats] DB query failed, returning zeros');
    return res.json({ roadmapsGenerated: 0, skillsCovered: 0 });
  }
});

export default router;
