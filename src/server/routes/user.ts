import { Router } from 'express';
import { requireAuth } from '../lib/middleware';
import { loadUserDB, saveUserDB, updateStreak } from '../lib/db';
import {
  getUserLessonCompletionStats,
  getRoadmapProgressSnapshot
} from '../db/schema';

const router = Router();

// Get user stats
router.get('/user-stats', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) return res.json({ xp: 0, streak: 0, hoursStudied: 0, lessonsCompleted: 0, overallMastery: 0 });
    const { totalLessons, completedLessons } = await getUserLessonCompletionStats(userEmail);
    const overallMastery = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;
    return res.json({ xp: dbData.xp || 0, streak: dbData.streak ?? 0, hoursStudied: (dbData.profile as any)?.hoursStudied || 0, lessonsCompleted: completedLessons, overallMastery: Math.round(overallMastery) });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.json({ xp: 0, streak: 0, hoursStudied: 0, lessonsCompleted: 0, overallMastery: 0 });
  }
});

// Get user resource states
router.get('/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
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
  const userEmail = req.session.userEmail!;
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
  const userEmail = req.session.userEmail!;
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
  const userEmail = req.session.userEmail!;
  const { profile, settings, achievements, notifications, chats } = req.body;

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
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    console.error('Update user profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Topic-wise quizzes
router.get('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    return res.json(dbData?.topic_wise_quizzes || []);
  } catch (error) {
    console.error('Get topic wise quizzes error:', error);
    return res.json([]);
  }
});

router.post('/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
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
    return res.json({ success: true, attempt: quizzes[idx >= 0 ? idx : quizzes.length - 1] });
  } catch (error) {
    console.error('Upsert topic wise quiz error:', error);
    return res.status(500).json({ error: 'Failed to save quiz attempt' });
  }
});

// Progress tracking
router.post('/progress', requireAuth, async (req, res) => {
  const { roadmapId, lessonId, action } = req.body;
  const userEmail = req.session.userEmail!;
  if (!roadmapId || !lessonId) return res.status(400).json({ error: 'roadmapId and lessonId are required' });

  // dynamic import to avoid circular deps
  const { findLessonContext, completeLessonForUser, getRoadmapState, upsertRoadmapState } = await import('../db/schema');
  const { sql } = await import('../lib/db');

  try {
    const lessonCtx = await findLessonContext(lessonId);
    if (!lessonCtx || lessonCtx.roadmap_id !== roadmapId) return res.status(404).json({ error: 'Lesson or roadmap not found' });

    if (action === 'complete') {
      await completeLessonForUser(userEmail, lessonId, lessonCtx.module_id, lessonCtx.phase_id, roadmapId, null, 0);
      const lessonRows = await sql`SELECT status FROM lessons WHERE roadmap_id = ${roadmapId}`;
      const totalLessons = lessonRows.length;
      const completedLessons = lessonRows.filter((l: any) => l.status === 'completed').length;
      if (totalLessons > 0 && completedLessons >= totalLessons) {
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
router.post('/feedback', async (req, res) => {
  const { sentiment, message, context } = req.body;
  if (!sentiment || !['positive', 'neutral', 'negative'].includes(sentiment)) {
    return res.status(400).json({ error: 'Valid sentiment is required' });
  }
  try {
    const userEmail = req.session.userEmail || 'anonymous';
    const { sql } = await import('../lib/db');
    // Best-effort — table may not exist yet; ignore errors
    await sql`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_email TEXT,
        sentiment TEXT NOT NULL,
        message TEXT,
        context TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.catch(() => {});
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
  const userEmail = req.session.userEmail!;
  try {
    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ progress });
  } catch (error: any) {
    console.error('Get progress error:', error);
    return res.json({ progress: null });
  }
});

export default router;
