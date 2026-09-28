import { describe, expect, it } from 'vitest';
import { determineNextLearningAction } from '../lib/adaptiveLearning';
import { aggregateSkillEvidence } from '../lib/skillCalibration';

const lessons = [
  { id: 'lesson-1', title: 'HTTP requests', skillTags: ['HTTP requests'] },
  { id: 'lesson-2', title: 'HTML parsing', skillTags: ['HTML parsing'] },
];

describe('adaptive learning decisions', () => {
  it('advances after a strong quiz result without repeating the lesson', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: [], currentLessonId: 'lesson-1', quizEvidence: [{ lessonId: 'lesson-1', score: 5, totalQuestions: 5 }] })).toMatchObject({ action: 'advance', targetLessonId: 'lesson-2' });
  });

  it('recommends reinforcement for partial results', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: [], currentLessonId: 'lesson-1', quizEvidence: [{ lessonId: 'lesson-1', score: 3, totalQuestions: 5 }] })).toMatchObject({ action: 'reinforce', targetLessonId: 'lesson-1' });
  });

  it('recommends remediation only after repeated low results', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: [], currentLessonId: 'lesson-1', quizEvidence: [
      { lessonId: 'lesson-1', score: 1, totalQuestions: 5 }, { lessonId: 'lesson-1', score: 2, totalQuestions: 5 },
    ] })).toMatchObject({ action: 'remediate', targetLessonId: 'lesson-1' });
  });

  it('does not treat a single failed attempt as loss of mastery', () => {
    const decision = determineNextLearningAction({ lessons, completedLessonIds: [], currentLessonId: 'lesson-1', quizEvidence: [{ lessonId: 'lesson-1', score: 1, totalQuestions: 5 }], skills: [
      { skillKey: 'http-requests', proficiencyLevel: 'advanced', confidenceLevel: 'high', evidenceCount: 6 },
    ] });
    expect(decision.action).toBe('reinforce');
    expect(decision.targetLessonId).toBe('lesson-1');
  });

  it('does not infer mastery from lesson completion or no evidence', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: ['lesson-1'] })).toMatchObject({ action: 'continue', targetLessonId: 'lesson-2' });
    expect(determineNextLearningAction({ lessons, completedLessonIds: [] })).toMatchObject({ action: 'continue', targetLessonId: 'lesson-1' });
  });

  it('uses high-confidence demonstrated skills to move past existing introductory lessons', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: [], skills: [
      { skillKey: 'http-requests', proficiencyLevel: 'competent', confidenceLevel: 'high', evidenceCount: 4 },
    ] })).toMatchObject({ action: 'advance', targetLessonId: 'lesson-2', confidence: 'high' });
  });

  it('verifies partial knowledge and teaches unknown capabilities normally', () => {
    expect(determineNextLearningAction({ lessons, completedLessonIds: [], skills: [
      { skillKey: 'http-requests', proficiencyLevel: 'developing', confidenceLevel: 'medium', evidenceCount: 2 },
    ] }).action).toBe('verify');
    expect(determineNextLearningAction({ lessons, completedLessonIds: [] }).action).toBe('continue');
  });

  it('ignores unrelated skills and never adds or removes roadmap lessons', () => {
    const decision = determineNextLearningAction({ lessons, completedLessonIds: [], skills: [
      { skillKey: 'react', proficiencyLevel: 'advanced', confidenceLevel: 'high', evidenceCount: 20 },
    ] });
    expect(decision).toMatchObject({ action: 'continue', targetLessonId: 'lesson-1' });
    expect(lessons.map((lesson) => lesson.id)).toEqual(['lesson-1', 'lesson-2']);
  });

  it('connects a quiz event through existing calibration into the next-step decision', () => {
    const now = new Date();
    const events = [1, 2, 3].map((attempt) => ({
      eventType: 'quiz_attempted', occurredAt: new Date(now.getTime() - attempt * 1000),
      properties: { score: 5, totalQuestions: 5 },
    }));
    const calibrated = aggregateSkillEvidence(events);
    expect(calibrated.confidenceLevel).toBe('high');
    const decision = determineNextLearningAction({ lessons, completedLessonIds: [], skills: [{
      skillKey: 'http-requests', proficiencyLevel: calibrated.proficiencyLevel,
      confidenceLevel: calibrated.confidenceLevel, evidenceCount: calibrated.evidenceCount,
    }] });
    expect(decision).toMatchObject({ action: 'advance', targetLessonId: 'lesson-2' });
  });

  it('returns only an existing roadmap lesson as a target', () => {
    const decision = determineNextLearningAction({ lessons, completedLessonIds: [], currentLessonId: 'lesson-1', quizEvidence: [
      { lessonId: 'lesson-1', score: 1, totalQuestions: 5 }, { lessonId: 'lesson-1', score: 1, totalQuestions: 5 },
    ] });
    expect(lessons.some((lesson) => lesson.id === decision.targetLessonId)).toBe(true);
  });
});
