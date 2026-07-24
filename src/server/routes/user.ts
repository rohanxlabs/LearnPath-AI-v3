import { Router } from 'express';
import { requireAuth, createLimiter } from '../lib/middleware';
import { loadUserDB, saveUserDB, updateStreak, unlockAchievement, sql } from '../lib/db';
import {
  getUserLessonCompletionStats,
  getRoadmapProgressSnapshot
} from '../db/queries';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Public stats cache — TTL 5 minutes so the landing page is fast.
// ---------------------------------------------------------------------------
let publicStatsCache: { roadmapsGenerated: number; skillsCovered: number; ts: number } | null = null;
const PUBLIC_STATS_TTL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Feedback table bootstrap (idempotent) — called at module load, never inside handlers.
// ---------------------------------------------------------------------------
let feedbackTableReady: Promise<void> | null = null;
function ensureFeedbackTable(): Promise<void> {
  if (!feedbackTableReady) {
    feedbackTableReady = sql`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_email TEXT,
        sentiment TEXT NOT NULL,
        message TEXT,
        context TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.then(() => undefined as void).catch((err: any) => {
      logger.warn({ err: err?.message }, '[Feedback] Table setup failed — feedback writes will silently fail');
    });
  }
  return feedbackTableReady!;
}
// Kick off table creation at module load time (fire-and-forget).
ensureFeedbackTable();

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
  } catch (error: any) {
    logger.error({ err: error?.message }, 'user-stats query failed');
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
    console.error('Get resource states error:', error);
    return res.json({ completedIds: [], savedIds: [] });
  }
});

router.post('/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const { completedIds, savedIds } = req.body;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData.progress) dbData.progress = {};
    dbData.progress.resource_states = { completedIds: Array.isArray(completedIds) ? completedIds : [], savedIds: Array.isArray(savedIds) ? savedIds : [] };
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    console.error('Save resource states error:', error);
    return res.status(500).json({ error: 'Failed to save resource states' });
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
    console.error('Get user profile error:', error);
    return res.json({ profile: {}, settings: {}, achievements: [], notifications: [], chats: [] });
  }
});

router.put('/user-profile', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const { profile, settings, achievements, notifications, chats, activityLog } = req.body;

  const PROFILE_BLOCKLIST = ['xp', 'level', 'streak', 'isPro', 'email', 'createdAt', 'id', 'tier'];
  function sanitizeProfile(input: any): Record<string, any> | null {
    if (input === undefined || input === null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) return {};
    const clean: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      if (PROFILE_BLOCKLIST.includes(key)) continue;
      clean[key] = input[key];
    }
    return clean;
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData.progress) dbData.progress = {};
    const safeProfile = sanitizeProfile(profile);
    if (safeProfile) {
      const merged = { ...(dbData.progress.profile || {}), ...safeProfile };
      dbData.progress.profile = merged;
      dbData.profile = merged;
    }
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) dbData.progress.settings = settings;
    if (achievements) dbData.progress.achievements = Array.isArray(achievements) ? achievements : [];
    if (notifications) dbData.progress.notifications = Array.isArray(notifications) ? notifications : [];
    if (chats) dbData.progress.chats = Array.isArray(chats) ? chats : [];
    if (activityLog && typeof activityLog === 'object' && !Array.isArray(activityLog)) {
      dbData.progress.activityLog = activityLog;
      dbData.activityLog = activityLog;
    }
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    console.error('Update user profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Topic-wise quizzes
router.get('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    return res.json(dbData?.topic_wise_quizzes || []);
  } catch (error) {
    console.error('Get topic wise quizzes error:', error);
    return res.json([]);
  }
});

router.post('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const attempt = req.body;
  if (!attempt || !attempt.quizId) return res.status(400).json({ error: 'quizId is required' });

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) return res.status(404).json({ error: 'User data not found' });
    const quizzes = dbData.topic_wise_quizzes || [];
    const idx = quizzes.findIndex((q: any) => q.quizId === attempt.quizId);
    if (idx >= 0) {
      quizzes[idx] = { ...quizzes[idx], ...attempt };
    } else {
      quizzes.push({ ...attempt, id: attempt.id || `quiz-${Date.now()}`, quizId: attempt.quizId, quizName: attempt.quizName || 'Untitled Quiz', score: attempt.score || 0, totalQuestions: attempt.totalQuestions || 0, attemptsCount: attempt.attemptsCount || 0, lastAttemptedAt: attempt.lastAttemptedAt || new Date().toISOString() });
    }
    dbData.topic_wise_quizzes = quizzes;
    await saveUserDB(userEmail, dbData);

    // Unlock "Quiz Master" achievement when user scores 100% on any quiz.
    let newAchievement: { id: string; name: string; icon: string; xpReward: number } | null = null;
    if (attempt.totalQuestions > 0 && attempt.score === attempt.totalQuestions) {
      newAchievement = await unlockAchievement(userEmail, 'ach-2');
    }

    return res.json({ success: true, attempt: quizzes[idx >= 0 ? idx : quizzes.length - 1], newAchievement });
  } catch (error) {
    console.error('Upsert topic wise quiz error:', error);
    return res.status(500).json({ error: 'Failed to save quiz attempt' });
  }
});

// Progress tracking
router.post('/progress', requireAuth, async (req, res) => {
  const { roadmapId, lessonId, action } = req.body;
  const userEmail = req.supabaseUser!.email;
  if (!roadmapId || !lessonId) return res.status(400).json({ error: 'roadmapId and lessonId are required' });

  // dynamic import to avoid circular deps
  const { findLessonContext, completeLessonForUser, getRoadmapState, upsertRoadmapState } = await import('../db/queries');

  try {
    const lessonCtx = await findLessonContext(lessonId);
    if (!lessonCtx || lessonCtx.roadmap_id !== roadmapId) return res.status(404).json({ error: 'Lesson or roadmap not found' });

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
  } catch (error: any) {
    console.error('Progress tracking error:', error);
    return res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Feedback endpoint
router.post('/feedback', feedbackLimiter, async (req, res) => {
  const { sentiment, message, context } = req.body;
  if (!sentiment || !['positive', 'neutral', 'negative'].includes(sentiment)) {
    return res.status(400).json({ error: 'Valid sentiment is required' });
  }
  try {
    const userEmail = req.supabaseUser?.email || 'anonymous';
    await ensureFeedbackTable();
    await sql`
      INSERT INTO feedback (user_email, sentiment, message, context)
      VALUES (${userEmail}, ${sentiment}, ${(message || '').slice(0, 500)}, ${(context || '').slice(0, 200)})
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
    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ progress });
  } catch (error: any) {
    console.error('Get progress error:', error);
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
        DATE(completed_at) AS day,
        COALESCE(SUM(study_minutes), 0) AS total_minutes
      FROM user_lesson_progress
      WHERE owner_email = ${userEmail.toLowerCase()}
        AND completed_at >= NOW() - INTERVAL '7 days'
        AND completed = TRUE
      GROUP BY DATE(completed_at)
    `.catch(() => [] as any[]);

    const minutesByDay: Record<string, number> = {};
    for (const row of rows) {
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
    console.error('User analytics error:', error);
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
