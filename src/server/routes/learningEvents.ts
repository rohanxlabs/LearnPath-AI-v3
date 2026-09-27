import { Router } from 'express';
import { createLimiter, requireAuth } from '../lib/middleware';
import { getRoadmapById, findLessonContext, insertLearningEvent, getResourceByIdForOwner } from '../db/queries';
import { LEARNING_EVENT, newLearningEventId, validateLearningEventProperties, validateLearningEventType } from '../lib/learningEvents';
import { recordSkillCalibrationBestEffort } from '../lib/skillCalibration';

const router = Router();
const eventLimiter = createLimiter({ windowMs: 60_000, max: 120, message: { error: 'Too many learning events. Please slow down.' } });
const serverOwnedTypes: Set<string> = new Set([LEARNING_EVENT.lessonOpened, LEARNING_EVENT.lessonCompleted, LEARNING_EVENT.quizPassed, LEARNING_EVENT.quizFailed, LEARNING_EVENT.assessmentStarted, LEARNING_EVENT.assessmentCompleted, LEARNING_EVENT.placementQuestionAnswered]);

router.post('/learning-events', eventLimiter, requireAuth, async (req, res) => {
  const { eventType, roadmapId, phaseId, moduleId, lessonId } = req.body ?? {};
  if (!validateLearningEventType(eventType)) return res.status(400).json({ error: 'Invalid eventType', code: 'INVALID_EVENT_TYPE' });
  // These events are emitted at the trusted action handlers, not accepted as client claims.
  if (serverOwnedTypes.has(eventType)) return res.status(400).json({ error: 'This event is recorded by the learning action', code: 'SERVER_RECORDED_EVENT' });
  for (const [name, value] of Object.entries({ roadmapId, phaseId, moduleId, lessonId })) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > 200)) return res.status(400).json({ error: `Invalid ${name}`, code: 'INVALID_EVENT_CONTEXT' });
  }
  if ((phaseId || moduleId) && !lessonId) return res.status(400).json({ error: 'A lessonId is required with phaseId or moduleId', code: 'INVALID_EVENT_CONTEXT' });
  let properties;
  try { properties = validateLearningEventProperties(req.body?.properties); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid properties', code: 'INVALID_EVENT_PROPERTIES' }); }

  const ownerEmail = req.supabaseUser!.email;
  try {
    let lessonContext: any = null;
    if (lessonId) {
      lessonContext = await findLessonContext(lessonId);
      if (!lessonContext || !await getRoadmapById(lessonContext.roadmap_id, ownerEmail)) return res.status(404).json({ error: 'Learning item not found', code: 'EVENT_CONTEXT_NOT_FOUND' });
      if (roadmapId && roadmapId !== lessonContext.roadmap_id) return res.status(400).json({ error: 'Lesson does not belong to roadmap', code: 'EVENT_CONTEXT_MISMATCH' });
      if (phaseId && phaseId !== lessonContext.phase_id) return res.status(400).json({ error: 'Invalid phase for lesson', code: 'EVENT_CONTEXT_MISMATCH' });
      if (moduleId && moduleId !== lessonContext.module_id) return res.status(400).json({ error: 'Invalid module for lesson', code: 'EVENT_CONTEXT_MISMATCH' });
    } else if (roadmapId && !await getRoadmapById(roadmapId, ownerEmail)) {
      return res.status(404).json({ error: 'Roadmap not found', code: 'EVENT_CONTEXT_NOT_FOUND' });
    }
    if (eventType === LEARNING_EVENT.resourceOpened || eventType === LEARNING_EVENT.resourceCompleted) {
      const resourceId = properties.resourceId;
      if (typeof resourceId !== 'string' || !await getResourceByIdForOwner(resourceId, ownerEmail)) return res.status(404).json({ error: 'Resource not found', code: 'EVENT_CONTEXT_NOT_FOUND' });
    }
    if (eventType === LEARNING_EVENT.quizAttempted) {
      const score = properties.score;
      const totalQuestions = properties.totalQuestions;
      if (typeof score !== 'number' || typeof totalQuestions !== 'number' || !Number.isInteger(score) || !Number.isInteger(totalQuestions) || totalQuestions < 1 || totalQuestions > 100 || score < 0 || score > totalQuestions || !lessonId) {
        return res.status(400).json({ error: 'Quiz events require valid score, totalQuestions, and lessonId', code: 'INVALID_QUIZ_EVENT' });
      }
    }
    const eventId = newLearningEventId();
    await insertLearningEvent({
      id: eventId, ownerEmail, eventType,
      roadmapId: lessonContext?.roadmap_id ?? roadmapId ?? null,
      phaseId: lessonContext?.phase_id ?? phaseId ?? null,
      moduleId: lessonContext?.module_id ?? moduleId ?? null,
      lessonId: lessonId ?? null, properties,
    });
    if (eventType === LEARNING_EVENT.quizAttempted) {
      const total = properties.totalQuestions as number;
      await insertLearningEvent({
        id: newLearningEventId(), ownerEmail, eventType: properties.score === total ? LEARNING_EVENT.quizPassed : LEARNING_EVENT.quizFailed,
        roadmapId: lessonContext?.roadmap_id, phaseId: lessonContext?.phase_id, moduleId: lessonContext?.module_id, lessonId,
        properties,
      });
      await recordSkillCalibrationBestEffort(ownerEmail, eventId);
    }
    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Could not record learning event', code: 'EVENT_WRITE_FAILED' });
  }
});

export default router;
