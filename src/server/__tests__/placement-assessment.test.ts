import { describe, expect, it } from 'vitest';
import { gradePlacementAnswers, toPublicPlacementQuestion, validatePlacementQuestions } from '../lib/placementAssessment';
import { aggregateSkillEvidence } from '../lib/skillCalibration';
import { LEARNING_EVENT } from '../../types';

const bank = [
  { id: 'q-beginner', prompt: 'Choose the correct foundational statement.', skillTags: ['Language basics', 'Functions'], difficulty: 'beginner', options: ['Correct', 'Wrong'], correctIndex: 0 },
  { id: 'q-advanced', prompt: 'Choose the correct advanced statement.', skillTags: ['Functions'], difficulty: 'advanced', options: ['Wrong', 'Correct'], correctIndex: 1 },
];

describe('placement assessment question and grading policy', () => {
  it('validates tagged questions and removes answer keys from the learner view', () => {
    const [question] = validatePlacementQuestions(bank);
    expect(question.skillTags).toEqual(['Language basics', 'Functions']);
    expect(toPublicPlacementQuestion(question)).not.toHaveProperty('correctIndex');
    expect(toPublicPlacementQuestion(question)).not.toHaveProperty('explanation');
  });

  it('rejects invalid difficulty, answer indexes, and untagged questions', () => {
    expect(() => validatePlacementQuestions([{ ...bank[0], difficulty: 'expert' }])).toThrow(/difficulty/);
    expect(() => validatePlacementQuestions([{ ...bank[0], correctIndex: 8 }])).toThrow(/correct answer/);
    expect(() => validatePlacementQuestions([{ ...bank[0], skillTags: [] }])).toThrow(/skill tags/);
  });

  it('grades every answer once and retains separate skill associations', () => {
    const questions = validatePlacementQuestions(bank);
    const graded = gradePlacementAnswers(questions, [
      { questionId: 'q-beginner', selectedIndex: 0 },
      { questionId: 'q-advanced', selectedIndex: 0 },
    ]);
    expect(graded.map((item) => item.correct)).toEqual([true, false]);
    expect(graded[0].skillTags).toEqual(['Language basics', 'Functions']);
    expect(() => gradePlacementAnswers(questions, [{ questionId: 'q-beginner', selectedIndex: 0 }])).toThrow(/every question/);
  });

  it('records difficulty-weighted placement evidence without treating a missed advanced item as beginner evidence', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    const result = aggregateSkillEvidence([
      { eventType: LEARNING_EVENT.placementQuestionAnswered, occurredAt: now, difficulty: 'advanced', properties: { correct: false } },
    ], undefined, now);
    expect(result.proficiencyLevel).toBe('competent');
    expect(result.confidenceLevel).toBe('low');
    expect(result.evidenceCount).toBe(1);
    expect(result.lastEvidenceAt).toEqual(now);
  });

  it('uses recency and repeat evidence in the existing confidence model', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    const result = aggregateSkillEvidence(Array.from({ length: 3 }, (_, i) => ({
      eventType: LEARNING_EVENT.placementQuestionAnswered,
      occurredAt: new Date(now.getTime() - i * 86_400_000),
      difficulty: 'competent',
      properties: { correct: true },
    })), undefined, now);
    expect(result.proficiencyLevel).toBe('advanced');
    expect(result.confidenceLevel).toBe('high');
    expect(result.evidenceCount).toBe(3);
  });
});
