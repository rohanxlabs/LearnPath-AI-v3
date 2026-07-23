import { Router } from 'express';
import { requireAuth, aiLimiter, lessonLimiter, HttpError, withUserLock } from '../lib/middleware';
import { loadUserDB, saveUserDB, updateStreak, unlockAchievement } from '../lib/db';
import {
  findLessonContext,
  completeLessonForUser,
  getLessonById,
  getResourcesForLessonContext,
  getProjectForPhase
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

// Lesson content (lazy generate on first access)
router.get('/lessons/:lessonId/content', requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const result = await getOrGenerateLessonContent(lessonId);
    if (!result) return res.status(404).json({ error: 'Lesson not found' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json(payload);
  } catch (error: any) {
    console.error('[Lesson-Gen] content retrieval error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load lesson content' });
  }
});

// Force-regenerate lesson content
router.post('/lessons/:lessonId/generate', aiLimiter, requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  const regenerate = req.body?.regenerate === true || req.query?.regenerate === 'true';
  try {
    const result = await getOrGenerateLessonContent(lessonId, { regenerate });
    if (!result) return res.status(404).json({ error: 'Lesson not found' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json({ ...payload, regenerated: regenerate && !result.cached });
  } catch (error: any) {
    console.error('[Lesson-Gen] generation error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to generate lesson content' });
  }
});

// Lesson metadata (no generation)
router.get('/lessons/:lessonId/meta', requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const lesson = await getLessonById(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
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
  } catch (error: any) {
    console.error('[Lesson-Gen] meta retrieval error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load lesson metadata' });
  }
});

// Topic content (workspace view)
router.get('/topics/:topicId', requireAuth, async (req, res) => {
  const { topicId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const lesson = await findLessonContext(topicId);
    if (!lesson) return res.status(404).json({ error: 'Topic not found' });

    let markdownContent = '', summary: string | null = null, generatedAt: string | null = null;
    let contentStatus: string = lesson.content_status || 'pending';
    try {
      const generated = await getOrGenerateLessonContent(topicId);
      if (generated) { markdownContent = generated.content || ''; summary = generated.summary; generatedAt = generated.generatedAt; contentStatus = generated.contentStatus; }
    } catch (genErr: any) {
      console.warn('[Lesson-Gen] topic content generation failed, serving metadata only:', genErr?.message || genErr);
    }

    let lastOpenedAt: string | null = null;
    try {
      lastOpenedAt = (await recordLessonOpened(userEmail, { lessonId: lesson.id, moduleId: lesson.module_id, phaseId: lesson.phase_id, roadmapId: lesson.roadmap_id })) || (await getLessonLastOpened(userEmail, lesson.id));
    } catch (_) { /* best-effort */ }

    if (!summary) {
      const name = lesson.title;
      summary = `### ${name}\n\n**Key Concepts:**\n- Core principles of ${name.toLowerCase()}\n- Practical applications and examples\n\n**Common Mistakes:**\n- Misunderstanding basic concepts\n- Forgetting syntax details`;
    }

    const objectives = Array.isArray(lesson.learning_objectives) && lesson.learning_objectives.length
      ? lesson.learning_objectives
      : [`Understand ${lesson.title.toLowerCase()} fundamentals`, `Apply concepts in practical scenarios`, `Complete exercises to reinforce learning`];

    const prerequisiteNames = await resolveLessonNames(Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []);
    const metadata = buildLessonMetadata({ lessonRow: lesson, content: markdownContent, prerequisiteNames, generatedAt, lastOpenedAt, contentStatus });

    const [resources, project, quiz, video] = await Promise.all([
      getResourcesForLessonContext(lesson.module_id, lesson.phase_id).catch(() => []),
      getProjectForPhase(lesson.phase_id).catch(() => null),
      getOrGenerateQuizForLesson(lesson),
      findYouTubeVideoForTopic(lesson.title).catch(() => ({ videoId: null, title: null, searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(lesson.title + ' tutorial')}` }))
    ]);

    const topic = {
      id: lesson.id, name: lesson.title, type: lesson.type, phaseId: lesson.phase_id, levelId: lesson.module_id,
      status: lesson.status, xpReward: lesson.xp_reward, content: markdownContent, summary, objectives,
      estimatedTime: lesson.estimated_minutes ?? lesson.xp_reward ?? 15,
      difficulty: metadata.difficulty, skillsCovered: metadata.skillsCovered, prerequisites: metadata.prerequisites,
      completionChecklist: metadata.completionChecklist, contentStatus, generatedAt, lastOpenedAt, metadata,
      resources: resources.map((r: any) => ({ id: r.id, title: r.title, type: r.type, provider: r.provider, url: r.url, description: r.description, duration: r.duration })),
      project: project ? { id: project.id, title: project.title, difficulty: project.difficulty, description: project.description, techStack: project.tech_stack, features: project.features, githubUrl: project.github_url } : null,
      quiz: quiz ? { id: quiz.id, title: quiz.title, questions: quiz.questions } : null, video
    };

    return res.json({ topic });
  } catch (error) {
    console.error('Get topic error:', error);
    return res.status(500).json({ error: 'Failed to load topic' });
  }
});

// Complete a lesson
// Note: any `xpEarned` value the client sends in the body is intentionally not
// destructured here. XP is authoritative from `lessonCtx.xp_reward` in the DB.
router.post('/complete-lesson', lessonLimiter, requireAuth, async (req, res) => {
  const { lessonId, roadmapId } = req.body;
  const userEmail = req.supabaseUser!.email;
  if (!lessonId) return res.status(400).json({ error: 'lessonId is required' });

  try {
    const result = await withUserLock(userEmail, async () => {
      const lessonCtx = await findLessonContext(lessonId);
      if (!lessonCtx) throw new HttpError(404, 'Lesson not found');

      const targetRoadmapId = roadmapId || lessonCtx.roadmap_id;
      if (targetRoadmapId && targetRoadmapId !== lessonCtx.roadmap_id) throw new HttpError(400, 'Lesson does not belong to the provided roadmap');

      if (lessonCtx.status === 'completed') {
        const dbData = await loadUserDB(userEmail, { createIfMissing: false });
        const { getCurrentStreak, getRoadmapProgressPercent } = await import('../db/queries');
        return { xp: dbData?.xp || 0, streak: await getCurrentStreak(userEmail), completionPercent: await getRoadmapProgressPercent(lessonCtx.roadmap_id), alreadyCompleted: true, message: 'Lesson already completed.' };
      }

      const xpValue = Number(lessonCtx.xp_reward) || 0;
      if (xpValue <= 0) throw new HttpError(400, 'Lesson has no valid XP reward');

      const clientStudyMinutes = Number((req.body as any)?.studyMinutes);
      const autoStudyMinutes = Number(lessonCtx.estimated_minutes) || 0;
      const studyMinutes = Number.isFinite(clientStudyMinutes) && clientStudyMinutes > 0 ? Math.min(clientStudyMinutes, 600) : autoStudyMinutes;

      const counters = await completeLessonForUser(userEmail, lessonId, lessonCtx.module_id, lessonCtx.phase_id, lessonCtx.roadmap_id, null, studyMinutes);
      clearLessonContentCacheEntry(lessonId);

      const dbData = await loadUserDB(userEmail, { createIfMissing: false });
      if (!dbData) throw new HttpError(404, 'User data not found');

      const newXP = (dbData.xp || 0) + xpValue;
      dbData.xp = newXP;
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
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Complete lesson error:', error);
    return res.status(500).json({ error: 'Failed to complete lesson. Database unavailable.' });
  }
});

// Generate quiz
router.post('/generate-quiz', aiLimiter, requireAuth, async (req, res) => {
  const { topicName } = req.body;
  if (!topicName) return res.status(400).json({ error: 'Topic name is required for quiz' });
  const questions = await generateQuizQuestions(topicName);
  return res.json(questions);
});

export default router;
