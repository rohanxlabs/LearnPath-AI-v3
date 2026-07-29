import { Router } from 'express';
import { requireAuth, aiLimiter, aiDailyQuota, lessonLimiter, HttpError, withUserLock } from '../lib/middleware';
import { loadUserDB, saveUserDB, updateStreak, unlockAchievement, addUserXp } from '../lib/db';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';
import {
  findLessonContext,
  completeLessonForUser,
  getLessonProgress,
  upsertUserLessonProgress,
  getResourcesForLessonContext,
  getProjectForPhase,
  getRoadmapById
} from '../db/queries';
import {
  getOrGenerateLessonContent,
  assembleLessonResponse,
  buildLessonMetadata,
  resolveLessonNames,
  getLessonLastOpened,
  recordLessonOpened,
  getOrGenerateQuizForLesson,
  findYouTubeVideoForTopic,
  clearLessonContentCacheEntry,
  generateQuizQuestions
} from '../lib/lesson';
import { sql } from '../lib/db';

const router = Router();

// ---------------------------------------------------------------------------
// Shared ownership guard — returns true if the lesson belongs to a roadmap
// owned by userEmail.  Returns false (→ 404) otherwise.
// Uses 404 (not 403) to avoid lesson/roadmap ID enumeration.
// ---------------------------------------------------------------------------
async function userOwnsLesson(userEmail: string, roadmapId: string): Promise<boolean> {
  return Boolean(await getRoadmapById(roadmapId, userEmail));
}

// Lesson content (lazy generate on first access) — counts against the AI quota
// because getOrGenerateLessonContent may call Groq to generate content.
router.get('/lessons/:lessonId/content', requireAuth, aiDailyQuota, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const ctx = await findLessonContext(lessonId);
    if (!ctx) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    if (!await userOwnsLesson(userEmail, ctx.roadmap_id)) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    const result = await getOrGenerateLessonContent(lessonId);
    if (!result) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json(payload);
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Lesson-Gen] content retrieval error');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'lesson-generation');
      scope.setExtra('lessonId', req.params.lessonId);
      Sentry.captureException(error);
    });
    return res.status(500).json({ error: 'Failed to load lesson content', code: 'LESSON_CONTENT_FAILED' });
  }
});

// Force-regenerate lesson content
router.post('/lessons/:lessonId/generate', requireAuth, aiLimiter, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  const regenerate = req.body?.regenerate === true || req.query?.regenerate === 'true';
  try {
    const ctx = await findLessonContext(lessonId);
    if (!ctx) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    if (!await userOwnsLesson(userEmail, ctx.roadmap_id)) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    const result = await getOrGenerateLessonContent(lessonId, { regenerate });
    if (!result) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json({ ...payload, regenerated: regenerate && !result.cached });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Lesson-Gen] generation error');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'lesson-generation');
      scope.setExtra('lessonId', req.params.lessonId);
      Sentry.captureException(error);
    });
    return res.status(500).json({ error: 'Failed to generate lesson content', code: 'LESSON_GEN_FAILED' });
  }
});

// Lesson metadata (no generation)
router.get('/lessons/:lessonId/meta', requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    // Use findLessonContext instead of getLessonById so we get roadmap_id for ownership check.
    const lesson = await findLessonContext(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    if (!await userOwnsLesson(userEmail, lesson.roadmap_id)) return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    const prerequisiteNames = await resolveLessonNames(Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []);
    const generatedAt = lesson.generated_at ? new Date(lesson.generated_at).toISOString() : null;
    const hasContent = !!(lesson.markdown_content && String(lesson.markdown_content).trim().length > 0);
    const lastOpenedAt = await getLessonLastOpened(userEmail, lessonId);
    const metadata = buildLessonMetadata({ lessonRow: lesson, content: hasContent ? lesson.markdown_content : '', prerequisiteNames, generatedAt, lastOpenedAt, contentStatus: lesson.content_status || 'pending' });

    let progress: { completed: boolean; studyMinutes: number; completedAt: string | null } = { completed: false, studyMinutes: 0, completedAt: null };
    try {
      const rows = await sql`SELECT completed, study_minutes, completed_at FROM user_lesson_progress WHERE owner_email = ${userEmail.toLowerCase()} AND lesson_id = ${lessonId} LIMIT 1`;
      if (rows[0]) progress = { completed: !!rows[0].completed, studyMinutes: Number(rows[0].study_minutes) || 0, completedAt: rows[0].completed_at ? new Date(rows[0].completed_at).toISOString() : null };
    } catch (_) { /* best-effort */ }

    return res.json({ lessonId, name: lesson.title, hasContent, metadata, progress });
  } catch (error: unknown) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Lesson-Gen] meta retrieval error');
    Sentry.captureException(error);
    return res.status(500).json({ error: 'Failed to load lesson metadata', code: 'LESSON_META_FAILED' });
  }
});

// Topic content (workspace view)
router.get('/topics/:topicId', requireAuth, async (req, res) => {
  const { topicId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const lesson = await findLessonContext(topicId);
    if (!lesson) return res.status(404).json({ error: 'Topic not found', code: 'TOPIC_NOT_FOUND' });
    if (!await userOwnsLesson(userEmail, lesson.roadmap_id)) return res.status(404).json({ error: 'Topic not found', code: 'TOPIC_NOT_FOUND' });

    let markdownContent = '', summary: string | null = null, generatedAt: string | null = null;
    let contentStatus: string = lesson.contentStatus || 'pending';

    // Check if content already exists in DB/cache without waiting for generation.
    // If it does, serve it immediately. If not, kick off background generation and
    // return right away so the client isn't blocked for 10-30 seconds — the workspace
    // polls every 8s and will pick it up once generation completes.
    const cached = await getOrGenerateLessonContent(topicId, { peekOnly: true });
    if (cached && cached.content) {
      markdownContent = cached.content;
      summary = cached.summary;
      generatedAt = cached.generatedAt;
      contentStatus = cached.contentStatus;
    } else {
      // Fire-and-forget: start generation in the background so the next poll hits cache.
      getOrGenerateLessonContent(topicId).catch((genErr: any) => {
        logger.warn({ err: genErr?.message || genErr }, '[Lesson-Gen] background generation failed');
      });
      contentStatus = 'generating';
    }

    let lastOpenedAt: string | null = null;
    try {
      lastOpenedAt = (await recordLessonOpened(userEmail, { lessonId: lesson.id, moduleId: lesson.module_id, phaseId: lesson.phase_id, roadmapId: lesson.roadmap_id })) || (await getLessonLastOpened(userEmail, lesson.id));
    } catch (_) { /* best-effort */ }

    if (!summary) {
      const name = lesson.title;
      summary = `### ${name}\n\n**Key Concepts:**\n- Core principles of ${name.toLowerCase()}\n- Practical applications and examples\n\n**Common Mistakes:**\n- Misunderstanding basic concepts\n- Forgetting syntax details`;
    }

    const objectives = Array.isArray(lesson.learningObjectives) && lesson.learningObjectives.length
      ? lesson.learningObjectives
      : [`Understand ${lesson.title.toLowerCase()} fundamentals`, `Apply concepts in practical scenarios`, `Complete exercises to reinforce learning`];

    const prerequisiteNames = await resolveLessonNames(Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []);
    const metadata = buildLessonMetadata({ lessonRow: lesson, content: markdownContent, prerequisiteNames, generatedAt, lastOpenedAt, contentStatus });

    // Quiz generation can take several seconds — run it in the background so it
    // doesn't block the initial topic load. The client polls every 5 s; by the
    // second poll the quiz will be cached in the DB and served instantly.
    getOrGenerateQuizForLesson(lesson).catch((err: any) => {
      logger.warn({ err: err?.message || err }, '[Quiz-Gen] background quiz generation failed');
    });

    const [resources, project, existingQuiz, video] = await Promise.all([
      getResourcesForLessonContext(lesson.module_id, lesson.phase_id).catch(() => []),
      getProjectForPhase(lesson.phase_id).catch(() => null),
      // Only serve a quiz that is already in the DB — don't block for AI generation.
      import('../db/queries').then(q => q.getQuizForLesson(lesson.id)).catch(() => null),
      findYouTubeVideoForTopic(lesson.title).catch(() => ({ videoId: null, title: null, searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(lesson.title + ' tutorial')}` }))
    ]);

    const topic = {
      id: lesson.id, name: lesson.title, type: lesson.type, phaseId: lesson.phase_id, levelId: lesson.module_id,
      status: lesson.status, xpReward: lesson.xpReward, content: markdownContent, summary, objectives,
      estimatedTime: lesson.estimatedMinutes ?? lesson.xpReward ?? 15,
      difficulty: metadata.difficulty, skillsCovered: metadata.skillsCovered, prerequisites: metadata.prerequisites,
      completionChecklist: metadata.completionChecklist, contentStatus, generatedAt, lastOpenedAt, metadata,
      resources: resources.map((r: any) => ({ id: r.id, title: r.title, type: r.type, provider: r.provider, url: r.url, description: r.description, duration: r.duration })),
      // Drizzle returns camelCase field names — use techStack/githubUrl, not tech_stack/github_url.
      project: project ? { id: project.id, title: project.title, difficulty: project.difficulty, description: project.description, techStack: project.techStack ?? project.tech_stack, features: project.features, githubUrl: project.githubUrl ?? project.github_url } : null,
      quiz: (existingQuiz && Array.isArray(existingQuiz.questions) && existingQuiz.questions.length > 0)
        ? { id: existingQuiz.id, title: existingQuiz.title, questions: existingQuiz.questions }
        : null,
      video
    };

    return res.json({ topic });
  } catch (error) {
    logger.error({ err: error }, 'Get topic error');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'lesson-generation');
      scope.setExtra('topicId', req.params.topicId);
      Sentry.captureException(error);
    });
    return res.status(500).json({ error: 'Failed to load topic', code: 'TOPIC_FAILED' });
  }
});

// Complete a lesson
// Note: any `xpEarned` value the client sends in the body is intentionally not
// destructured here. XP is authoritative from `lessonCtx.xp_reward` in the DB.
router.post('/complete-lesson', lessonLimiter, requireAuth, async (req, res) => {
  const { lessonId, roadmapId } = req.body;
  const userEmail = req.supabaseUser!.email;
  if (!lessonId) return res.status(400).json({ error: 'lessonId is required', code: 'MISSING_LESSON_ID' });

  try {
    const result = await withUserLock(userEmail, async () => {
      const lessonCtx = await findLessonContext(lessonId);
      if (!lessonCtx) throw new HttpError(404, 'Lesson not found');

      const targetRoadmapId = roadmapId || lessonCtx.roadmap_id;
      if (targetRoadmapId && targetRoadmapId !== lessonCtx.roadmap_id) throw new HttpError(400, 'Lesson does not belong to the provided roadmap');
      // A lesson ID is not an authorization boundary. Verify ownership before
      // creating progress, unlocking lessons, or changing roadmap counters.
      if (!await userOwnsLesson(userEmail, lessonCtx.roadmap_id)) {
        throw new HttpError(404, 'Lesson not found');
      }

      if (lessonCtx.status === 'completed') {
        // The global lessons.status is 'completed', but user_lesson_progress may
        // not have a row for this user yet (e.g. completions that pre-date the
        // per-user table, or lessons completed on another session). Backfill the
        // row so reconstructRoadmapJson correctly shows this lesson as completed
        // for this user via _completedByUser.
        const existingProgress = await getLessonProgress(userEmail, lessonId);
        if (!existingProgress) {
          await upsertUserLessonProgress({
            ownerEmail: userEmail,
            roadmapId: lessonCtx.roadmap_id,
            lessonId,
            moduleId: lessonCtx.module_id,
            phaseId: lessonCtx.phase_id,
            completed: true,
            completedAt: new Date().toISOString(),
            attempts: 1,
            studyMinutes: Number(lessonCtx.estimatedMinutes) || 0,
          });
        }
        const dbData = await loadUserDB(userEmail, { createIfMissing: false });
        const { getCurrentStreak, getRoadmapProgressPercent } = await import('../db/queries');
        return { xp: dbData?.xp || 0, streak: await getCurrentStreak(userEmail), completionPercent: await getRoadmapProgressPercent(lessonCtx.roadmap_id, userEmail), alreadyCompleted: true, message: 'Lesson already completed.' };
      }

      const xpValue = Number(lessonCtx.xpReward) || 0;
      if (xpValue <= 0) throw new HttpError(400, 'Lesson has no valid XP reward');

      const clientStudyMinutes = Number((req.body as any)?.studyMinutes);
      const autoStudyMinutes = Number(lessonCtx.estimatedMinutes) || 0;
      const studyMinutes = Number.isFinite(clientStudyMinutes) && clientStudyMinutes > 0 ? Math.min(clientStudyMinutes, 600) : autoStudyMinutes;

      const counters = await completeLessonForUser(userEmail, lessonId, lessonCtx.module_id, lessonCtx.phase_id, lessonCtx.roadmap_id, null, studyMinutes);
      clearLessonContentCacheEntry(lessonId);

      // Atomically increment XP — avoids the read-modify-write race where two
      // concurrent completions both read the same XP value and one award is lost.
      const newXP = await addUserXp(userEmail, xpValue);

      // Persist activityLog and profile fields (XP is excluded — handled above atomically).
      const dbData = await loadUserDB(userEmail, { createIfMissing: false });
      if (!dbData) throw new HttpError(404, 'User data not found');

      if (!dbData.profile) dbData.profile = {};
      dbData.profile.xp = newXP;
      if (!dbData.activityLog) dbData.activityLog = {};
      const activityDateKey = new Date().toISOString().split('T')[0];
      const dayEntry = dbData.activityLog[activityDateKey] || { xp: 0, lessonsCompleted: 0 };
      dayEntry.xp += xpValue;
      dayEntry.lessonsCompleted += 1;
      dbData.activityLog[activityDateKey] = dayEntry;
      await saveUserDB(userEmail, dbData);

      const newStreak = await updateStreak(userEmail);

      // Unlock "First Steps" achievement on first ever lesson completion.
      let newAchievement: { id: string; name: string; icon: string; xpReward: number } | null = null;
      if (counters.completedLessons === 1) {
        newAchievement = await unlockAchievement(userEmail, 'ach-1');
      }

      return { xp: newXP, streak: newStreak, completionPercent: counters.progressPercent, message: 'Lesson complete!', newAchievement };
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: (error instanceof Error ? error.message : String(error)) });
    logger.error({ err: error }, 'Complete lesson error');
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'lesson-completion');
      scope.setExtra('lessonId', req.body?.lessonId);
      Sentry.captureException(error);
    });
    return res.status(500).json({ error: 'Failed to complete lesson. Database unavailable.', code: 'COMPLETE_LESSON_FAILED' });
  }
});

// Generate quiz — requires a lessonId so we can verify the lesson belongs to
// the requesting user before spending an AI call.
router.post('/generate-quiz', requireAuth, aiLimiter, async (req, res) => {
  const { topicName, lessonId } = req.body;
  if (!topicName) return res.status(400).json({ error: 'Topic name is required for quiz', code: 'MISSING_TOPIC_NAME' });
  const userEmail = req.supabaseUser!.email;

  // Ownership check: if a lessonId is provided, verify the lesson belongs to
  // a roadmap owned by this user. This prevents using the endpoint as a free
  // AI quiz generator for arbitrary topics.
  if (lessonId) {
    const ctx = await findLessonContext(lessonId);
    if (!ctx || !await userOwnsLesson(userEmail, ctx.roadmap_id)) {
      return res.status(404).json({ error: 'Lesson not found', code: 'LESSON_NOT_FOUND' });
    }
  }

  Sentry.setTag('feature', 'quiz-generation');
  const questions = await generateQuizQuestions(topicName);
  return res.json(questions);
});

export default router;
