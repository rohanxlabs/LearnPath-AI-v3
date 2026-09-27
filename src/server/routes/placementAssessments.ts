import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/drizzle';
import { getPlacementQuestionSources, getUserSkill } from '../db/queries';
import { learningEvents, placementAttempts } from '../../../drizzle/schema';
import { createLimiter, requireAuth } from '../lib/middleware';
import { gradePlacementAnswers, toPublicPlacementQuestion, validatePlacementQuestions } from '../lib/placementAssessment';
import { mapCurriculumSkillTags, normalizeSkillTag, recalibrateSkillsForTags } from '../lib/skillCalibration';
import { logger } from '../lib/logger';
import { LEARNING_EVENT } from '../../types';

const router = Router();
const assessmentLimiter = createLimiter({ windowMs: 60_000, max: 20, message: { error: 'Too many assessment requests. Please slow down.' } });

function buildRoadmapAssessment(sources: any[]) {
  const questions: any[] = [];
  const seenIds = new Set<string>();
  for (const source of sources) {
    const skills = mapCurriculumSkillTags(source.skillTags).map((tag) => tag.skillName);
    if (skills.length === 0 || !Array.isArray(source.questions)) continue;
    const rawDifficulty = String(source.difficulty ?? '').toLowerCase();
    const difficulty = rawDifficulty === 'intermediate' ? 'developing' : rawDifficulty;
    if (!['beginner', 'developing', 'competent', 'advanced'].includes(difficulty)) continue;
    for (const item of source.questions) {
      if (!item || typeof item !== 'object') continue;
      try {
        const id = `${String(source.lessonId)}_${String(item.id ?? questions.length)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        if (seenIds.has(id)) continue;
        const [validated] = validatePlacementQuestions([{
          id,
          prompt: item.question, skillTags: skills, difficulty, options: item.options,
          correctIndex: item.correctIndex, explanation: item.explanation,
        }]);
        questions.push(validated);
        seenIds.add(id);
      } catch { /* skip malformed or duplicate legacy quiz items */ }
    }
  }
  return questions.slice(0, 60);
}

function publicAttempt(attempt: any) {
  const questions = validatePlacementQuestions(attempt.questions).map(toPublicPlacementQuestion);
  return { id: attempt.id, status: attempt.status, questions, result: attempt.result ?? null, completedAt: attempt.completedAt ?? null };
}

router.post('/placement-assessments/start', assessmentLimiter, requireAuth, async (req, res) => {
  const { roadmapId, idempotencyKey } = req.body ?? {};
  if (typeof roadmapId !== 'string' || !roadmapId || roadmapId.length > 200) return res.status(400).json({ error: 'A valid roadmapId is required', code: 'INVALID_ROADMAP' });
  if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ error: 'A valid idempotencyKey is required', code: 'INVALID_IDEMPOTENCY_KEY' });
  const ownerEmail = req.supabaseUser!.email.toLowerCase();
  try {
    const existing = await db.select().from(placementAttempts)
      .where(and(eq(placementAttempts.ownerEmail, ownerEmail), eq(placementAttempts.idempotencyKey, idempotencyKey))).limit(1);
    if (existing[0]) {
      if (existing[0].roadmapId !== roadmapId) return res.status(409).json({ error: 'Idempotency key was already used for another roadmap', code: 'IDEMPOTENCY_CONFLICT' });
      return res.json({ attempt: publicAttempt(existing[0]) });
    }

    const sources = await getPlacementQuestionSources(ownerEmail, roadmapId);
    let questions;
    try { questions = buildRoadmapAssessment(sources); }
    catch { return res.status(422).json({ error: 'This roadmap does not have enough tagged quiz questions for a placement check yet', code: 'ASSESSMENT_UNAVAILABLE' }); }
    if (questions.length < 3) return res.status(422).json({ error: 'This roadmap does not have enough tagged quiz questions for a placement check yet', code: 'ASSESSMENT_UNAVAILABLE' });

    const attemptId = `placement-${randomUUID()}`;
    const outcome = await db.transaction(async (tx) => {
      const inserted = await tx.insert(placementAttempts).values({ id: attemptId, ownerEmail, roadmapId, idempotencyKey, status: 'started', questions })
        .onConflictDoNothing({ target: [placementAttempts.ownerEmail, placementAttempts.idempotencyKey] }).returning();
      if (inserted[0]) {
        await tx.insert(learningEvents).values({
          id: `evt-${randomUUID()}`, ownerEmail, eventType: LEARNING_EVENT.assessmentStarted, roadmapId,
          properties: { attemptId },
        });
        return { attempt: inserted[0], created: true };
      }
      const raced = await tx.select().from(placementAttempts)
        .where(and(eq(placementAttempts.ownerEmail, ownerEmail), eq(placementAttempts.idempotencyKey, idempotencyKey))).limit(1);
      if (!raced[0]) throw new Error('Could not resolve idempotent placement attempt');
      return { attempt: raced[0], created: false };
    });
    return res.status(outcome.created ? 201 : 200).json({ attempt: publicAttempt(outcome.attempt) });
  } catch (error) {
    logger.error({ err: error }, 'Could not start placement assessment');
    return res.status(503).json({ error: 'Placement assessment is temporarily unavailable', code: 'ASSESSMENT_UNAVAILABLE' });
  }
});

router.get('/placement-assessments/attempts/:attemptId', assessmentLimiter, requireAuth, async (req, res) => {
  const ownerEmail = req.supabaseUser!.email.toLowerCase();
  try {
    const rows = await db.select().from(placementAttempts).where(and(eq(placementAttempts.id, req.params.attemptId), eq(placementAttempts.ownerEmail, ownerEmail))).limit(1);
    if (!rows[0]) return res.status(404).json({ error: 'Assessment attempt not found', code: 'ATTEMPT_NOT_FOUND' });
    return res.json({ attempt: publicAttempt(rows[0]) });
  } catch (error) {
    logger.error({ err: error }, 'Could not read placement assessment');
    return res.status(503).json({ error: 'Assessment result is temporarily unavailable', code: 'ATTEMPT_UNAVAILABLE' });
  }
});

router.post('/placement-assessments/attempts/:attemptId/complete', assessmentLimiter, requireAuth, async (req, res) => {
  const ownerEmail = req.supabaseUser!.email.toLowerCase();
  try {
    const outcome = await db.transaction(async (tx) => {
      const rows = await tx.select().from(placementAttempts)
        .where(and(eq(placementAttempts.id, req.params.attemptId), eq(placementAttempts.ownerEmail, ownerEmail)))
        .for('update').limit(1);
      const attempt = rows[0];
      if (!attempt) return { notFound: true as const };
      if (attempt.status === 'completed') return { alreadyCompleted: true as const, attempt };

      const questions = validatePlacementQuestions(attempt.questions);
      const graded = gradePlacementAnswers(questions, req.body?.answers);
      const bySkill = new Map<string, { correct: number; total: number; skillName: string }>();
      const allSkillTags = [...new Set(graded.flatMap((answer) => answer.skillTags))];
      for (const answer of graded) {
        for (const tag of mapCurriculumSkillTags(answer.skillTags)) {
          const entry = bySkill.get(tag.skillKey) ?? { correct: 0, total: 0, skillName: tag.skillName };
          entry.total++;
          if (answer.correct) entry.correct++;
          bySkill.set(tag.skillKey, entry);
        }
        await tx.insert(learningEvents).values({
          id: `evt-${randomUUID()}`, ownerEmail, eventType: LEARNING_EVENT.placementQuestionAnswered, roadmapId: attempt.roadmapId,
          properties: { correct: answer.correct, difficulty: answer.difficulty, skillTags: answer.skillTags, attemptId: attempt.id },
        });
      }
      const result = {
        correct: graded.filter((item) => item.correct).length,
        total: graded.length,
        skills: [...bySkill.entries()].map(([skillKey, value]) => ({ skillKey, skillName: value.skillName, correct: value.correct, total: value.total })),
      };
      const responses = graded.map(({ questionId, selectedIndex, correct }) => ({ questionId, selectedIndex, correct }));
      await tx.insert(learningEvents).values({
        id: `evt-${randomUUID()}`, ownerEmail, eventType: LEARNING_EVENT.assessmentCompleted, roadmapId: attempt.roadmapId,
        properties: { attemptId: attempt.id, correct: result.correct, total: result.total },
      });
      const updated = await tx.update(placementAttempts)
        .set({ status: 'completed', responses, result, completedAt: new Date() })
        .where(eq(placementAttempts.id, attempt.id)).returning();
      return { attempt: updated[0], skillTags: allSkillTags };
    });
    if ('notFound' in outcome) return res.status(404).json({ error: 'Assessment attempt not found', code: 'ATTEMPT_NOT_FOUND' });
    if (!('alreadyCompleted' in outcome)) await recalibrateSkillsForTags(ownerEmail, outcome.skillTags);
    const storedResult: any = outcome.attempt.result;
    const skillStates = await Promise.all((storedResult?.skills ?? []).map(async (skill: any) => {
      const normalized = normalizeSkillTag(skill.skillKey);
      const state = normalized ? await getUserSkill(ownerEmail, normalized.skillKey) : null;
      return { ...skill, proficiencyLevel: state?.proficiencyLevel ?? 'unknown', confidenceLevel: state?.confidenceLevel ?? 'low' };
    }));
    return res.json({ attempt: { id: outcome.attempt.id, status: outcome.attempt.status, completedAt: outcome.attempt.completedAt, result: { ...storedResult, skills: skillStates } } });
  } catch (error) {
    logger.warn({ err: error }, 'Could not complete placement assessment');
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid assessment answers', code: 'ASSESSMENT_SUBMIT_FAILED' });
  }
});

export default router;
