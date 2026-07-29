/**
 * Application identity endpoints.
 *
 * Supabase Auth owns registration, password verification, recovery and session
 * revocation. This router deliberately contains no credential, refresh-token
 * or cookie implementation.
 */
import { Router } from 'express';
import { requireAuth } from '../lib/middleware';
import { getDefaultUserDB, loadUserDB, saveUserDB, sql } from '../lib/db';
import { getUserRoadmapsReconstructed, backfillUserLessonProgress } from '../db/queries';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';

const router = Router();

router.get('/session', requireAuth, (req, res) => {
  res.json({ authenticated: true, email: req.supabaseUser!.email });
});

/** Loads product data for an authenticated Supabase session. */
router.get('/bootstrap', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  try {
    let dbData = await loadUserDB(userEmail, { createIfMissing: false });
    // The first authenticated session provisions the product-data record. The
    // email primary key and UPSERT prevent duplicate profile records.
    if (!dbData) {
      dbData = getDefaultUserDB();
      await saveUserDB(userEmail, dbData);
    }
    const progress = dbData?.progress || {};
    if (!dbData?.progress_backfilled_at) {
      await backfillUserLessonProgress(userEmail);
      await sql`UPDATE users SET progress_backfilled_at = NOW() WHERE email = ${userEmail.toLowerCase()}`
        .catch((error: unknown) => logger.warn({ error }, 'bootstrap: unable to stamp progress backfill'));
    }
    // Bootstrap fetches up to 50 roadmaps — enough for the initial load without
    // reconstructing an unbounded set.  The client can call GET /api/roadmaps with
    // ?offset=50 to page through the rest if needed.
    const { roadmaps } = await getUserRoadmapsReconstructed(userEmail, { limit: 50, offset: 0 });
    res.json({
      authenticated: true,
      email: userEmail,
      profile: { ...(progress.profile || {}), xp: dbData?.xp ?? 0, streak: dbData?.streak ?? 0 },
      settings: progress.settings || {}, achievements: progress.achievements || [],
      notifications: progress.notifications || [], chats: progress.chats || [],
      activityLog: progress.activityLog || {}, roadmaps,
    });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'bootstrap failed');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'authentication');
      scope.setExtra('route', 'bootstrap');
      Sentry.captureException(error);
    });
    res.status(503).json({ error: 'Could not load your data right now. Please retry in a moment.', code: 'BOOTSTRAP_FAILED' });
  }
});

export default router;
