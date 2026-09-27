import { describe, expect, it } from 'vitest';
import { validateLearningEventProperties, validateLearningEventType } from '../lib/learningEvents';

describe('learning event validation', () => {
  it('accepts only centralized event types', () => {
    expect(validateLearningEventType('lesson_opened')).toBe(true);
    expect(validateLearningEventType('made_up_event')).toBe(false);
  });

  it('accepts bounded structured properties', () => {
    expect(validateLearningEventProperties({ durationSeconds: 420, score: 82, attempt: 2 })).toEqual({ durationSeconds: 420, score: 82, attempt: 2 });
  });

  it('rejects unknown keys, oversized strings, huge values, and non-object payloads', () => {
    expect(() => validateLearningEventProperties({ token: 'secret' })).toThrow(/Unsupported/);
    expect(() => validateLearningEventProperties({ source: 'x'.repeat(201) })).toThrow(/Invalid/);
    expect(() => validateLearningEventProperties({ score: 1_000_001 })).toThrow(/Invalid/);
    expect(() => validateLearningEventProperties([])).toThrow(/object/);
  });
});
