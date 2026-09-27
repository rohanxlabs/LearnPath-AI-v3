import { describe, expect, it } from 'vitest';
import { aggregateSkillEvidence, mapCurriculumSkillTags, normalizeSkillTag } from '../lib/skillCalibration';
import { LEARNING_EVENT } from '../../types';

const now = new Date('2026-09-27T00:00:00.000Z');
const quiz = (score: number, totalQuestions = 5, occurredAt = now, attempt = 1) => ({
  eventType: LEARNING_EVENT.quizAttempted,
  occurredAt,
  properties: { score, totalQuestions, attempt },
});

describe('skill key normalization', () => {
  it('creates stable generic keys and drops empty or generic tags', () => {
    expect(normalizeSkillTag('  Python Functions  ')).toEqual({ skillKey: 'python-functions', skillName: 'Python Functions' });
    expect(normalizeSkillTag('statistics.probability')).toEqual({ skillKey: 'statistics.probability', skillName: 'statistics.probability' });
    expect(normalizeSkillTag('Fundamentals')).toBeNull();
    expect(normalizeSkillTag('x'.repeat(161))).toBeNull();
  });

  it('maps each valid lesson or phase tag and removes duplicate and generic tags', () => {
    expect(mapCurriculumSkillTags(['Python', 'functions', 'Python', 'Basics']).map((tag) => tag.skillKey))
      .toEqual(['python', 'functions']);
  });
});

describe('deterministic skill evidence calibration', () => {
  it('keeps no evidence unknown and lesson completion alone below competent', () => {
    expect(aggregateSkillEvidence([], undefined, now)).toMatchObject({ proficiencyLevel: 'unknown', confidenceLevel: 'low', evidenceCount: 0 });
    const completed = aggregateSkillEvidence([{
      eventType: LEARNING_EVENT.lessonCompleted,
      occurredAt: now,
      difficulty: 'advanced',
    }], undefined, now);
    expect(completed.proficiencyLevel).toBe('developing');
    expect(completed.confidenceLevel).toBe('low');
    expect(completed.evidenceCount).toBe(1);
  });

  it('treats one excellent quiz as advanced with low confidence', () => {
    expect(aggregateSkillEvidence([quiz(5)], undefined, now)).toMatchObject({
      proficiencyLevel: 'advanced', confidenceLevel: 'low', evidenceCount: 1,
    });
  });

  it('uses repeated consistent results to raise confidence', () => {
    const result = aggregateSkillEvidence([quiz(4), quiz(4), quiz(4)], undefined, now);
    expect(result).toMatchObject({ proficiencyLevel: 'advanced', confidenceLevel: 'high', evidenceCount: 3 });
  });

  it('reduces confidence when strong evidence conflicts', () => {
    const result = aggregateSkillEvidence([quiz(0), quiz(5)], undefined, now);
    expect(result.proficiencyLevel).toBe('competent');
    expect(result.confidenceLevel).toBe('low');
  });

  it('discounts older evidence and lets observed performance outweigh self-report', () => {
    const oldQuiz = quiz(0, 5, new Date('2024-01-01T00:00:00.000Z'));
    const recentResult = aggregateSkillEvidence([oldQuiz, quiz(4)], undefined, now);
    expect(recentResult.proficiencyLevel).toBe('competent');

    const selfReport = aggregateSkillEvidence([quiz(0)], 'Expert', now);
    expect(selfReport.proficiencyLevel).toBe('beginner');
  });

  it('does not treat pass/fail duplicates, opens, or resource events as extra evidence', () => {
    const result = aggregateSkillEvidence([
      quiz(4),
      { eventType: LEARNING_EVENT.quizPassed, occurredAt: now, properties: { score: 5, totalQuestions: 5 } },
      { eventType: LEARNING_EVENT.lessonOpened, occurredAt: now },
      { eventType: LEARNING_EVENT.resourceOpened, occurredAt: now },
    ], undefined, now);
    expect(result.evidenceCount).toBe(1);
  });
});
