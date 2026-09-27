import { describe, expect, it } from 'vitest';
import { mergeLearnerProfile, validateLearnerProfile } from '../lib/learnerProfile';

describe('learner profile validation', () => {
  it('accepts universal learner types without education fields', () => {
    expect(validateLearnerProfile({ learnerType: 'professional', primaryGoal: 'learn_skill', background: { experienceLevel: 'Intermediate' } })).toEqual({
      learnerType: 'professional', primaryGoal: 'learn_skill', background: { experienceLevel: 'Intermediate' },
    });
    expect(validateLearnerProfile({ learnerType: 'self_learner', primaryGoal: 'personal_interest' })).toEqual({ learnerType: 'self_learner', primaryGoal: 'personal_interest' });
  });

  it('accepts optional education and existing preference values', () => {
    expect(validateLearnerProfile({
      preferences: { learningStyle: 'Hands-on', weeklyHours: 12, sessionLength: 45 },
      background: { education: { level: 'Graduate', field: 'Physics', institution: 'Optional University' } },
    })).toMatchObject({ preferences: { learningStyle: 'Hands-on', weeklyHours: 12, sessionLength: 45 } });
  });

  it('accepts an optional universal goal, description, deadline, and capacity preferences', () => {
    expect(validateLearnerProfile({
      primaryGoal: 'certification',
      goalDescription: 'Earn a recognized project management certification.',
      targetDate: '2027-01-15',
      preferences: { weeklyHours: 8, sessionLength: 45 },
    })).toEqual({
      primaryGoal: 'certification',
      goalDescription: 'Earn a recognized project management certification.',
      targetDate: '2027-01-15',
      preferences: { weeklyHours: 8, sessionLength: 45 },
    });
    expect(validateLearnerProfile({ primaryGoal: 'personal_interest', goalDescription: 'Learn photography for fun.' }))
      .toMatchObject({ primaryGoal: 'personal_interest', goalDescription: 'Learn photography for fun.' });
  });

  it('rejects invalid goal values, oversized descriptions, and invalid session lengths', () => {
    expect(() => validateLearnerProfile({ primaryGoal: 'career_magic' })).toThrow(/primaryGoal/);
    expect(() => validateLearnerProfile({ goalDescription: 'ok' })).toThrow(/goalDescription/);
    expect(() => validateLearnerProfile({ goalDescription: 'x'.repeat(501) })).toThrow(/goalDescription/);
    expect(() => validateLearnerProfile({ preferences: { sessionLength: 17 } })).toThrow(/sessionLength/);
    expect(() => validateLearnerProfile({ preferences: { weeklyHours: 81 } })).toThrow(/weeklyHours/);
  });

  it('clears optional goal fields explicitly without dropping unrelated profile data', () => {
    expect(mergeLearnerProfile({ legacy: true, primaryGoal: 'learn_skill', goalDescription: 'Old goal', targetDate: '2027-01-15' }, {
      primaryGoal: null, goalDescription: null, targetDate: null,
    })).toMatchObject({ legacy: true, primaryGoal: null, goalDescription: null, targetDate: null });
  });

  it('rejects invalid enums, hours, and dates', () => {
    expect(() => validateLearnerProfile({ learnerType: 'engineering_student' })).toThrow(/learnerType/);
    expect(() => validateLearnerProfile({ primaryGoal: 'college_only' })).toThrow(/primaryGoal/);
    expect(() => validateLearnerProfile({ preferences: { weeklyHours: 0 } })).toThrow(/weeklyHours/);
    expect(() => validateLearnerProfile({ targetDate: '2026-02-31' })).toThrow(/targetDate/);
  });

  it('patches known nested sections and preserves unknown legacy fields', () => {
    expect(mergeLearnerProfile({ legacyPreference: 'keep', preferences: { sessionLength: 30 }, background: { occupation: 'Teacher' } }, {
      preferences: { weeklyHours: 4 }, background: { industry: 'Education' },
    })).toEqual({
      legacyPreference: 'keep', preferences: { sessionLength: 30, weeklyHours: 4 },
      background: { occupation: 'Teacher', industry: 'Education', education: undefined },
    });
  });
});
