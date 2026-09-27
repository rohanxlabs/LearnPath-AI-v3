import { EXPERIENCE_LEVELS, GOAL_TYPES, LEARNER_TYPES, LEARNING_STYLES, SESSION_LENGTHS } from '../../types';
import type { LearnerProfile } from '../../types';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value: unknown, field: string, max = 120): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) throw new Error(`Invalid ${field}`);
  return value.trim();
};

export function validateLearnerProfile(input: unknown): LearnerProfile {
  if (!isRecord(input)) throw new Error('profile must be an object');
  const out: LearnerProfile = {};
  if (input.learnerType !== undefined) {
    if (typeof input.learnerType !== 'string' || !(LEARNER_TYPES as readonly string[]).includes(input.learnerType)) throw new Error('Invalid learnerType');
    out.learnerType = input.learnerType as LearnerProfile['learnerType'];
  }
  if (input.primaryGoal !== undefined) {
    if (input.primaryGoal !== null && (typeof input.primaryGoal !== 'string' || !(GOAL_TYPES as readonly string[]).includes(input.primaryGoal))) throw new Error('Invalid primaryGoal');
    out.primaryGoal = input.primaryGoal as LearnerProfile['primaryGoal'];
  }
  if (input.goalDescription !== undefined) {
    if (input.goalDescription === null) out.goalDescription = null;
    else {
      const description = cleanText(input.goalDescription, 'goalDescription', 500);
      if (!description || description.length < 3) throw new Error('goalDescription must be between 3 and 500 characters');
      out.goalDescription = description;
    }
  }
  if (input.targetDate !== undefined) {
    if (input.targetDate !== null && (typeof input.targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate) || Number.isNaN(Date.parse(`${input.targetDate}T00:00:00Z`)) || new Date(`${input.targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.targetDate)) throw new Error('Invalid targetDate');
    out.targetDate = input.targetDate as string | null;
  }
  if (input.preferences !== undefined) {
    if (!isRecord(input.preferences)) throw new Error('Invalid preferences');
    const p: NonNullable<LearnerProfile['preferences']> = {};
    if (input.preferences.learningStyle !== undefined) {
      if (typeof input.preferences.learningStyle !== 'string' || !(LEARNING_STYLES as readonly string[]).includes(input.preferences.learningStyle)) throw new Error('Invalid learningStyle');
      p.learningStyle = input.preferences.learningStyle as NonNullable<typeof p.learningStyle>;
    }
    if (input.preferences.weeklyHours !== undefined) {
      if (typeof input.preferences.weeklyHours !== 'number' || !Number.isFinite(input.preferences.weeklyHours) || input.preferences.weeklyHours < 1 || input.preferences.weeklyHours > 80) throw new Error('weeklyHours must be between 1 and 80');
      p.weeklyHours = input.preferences.weeklyHours;
    }
    if (input.preferences.sessionLength !== undefined) {
      if (input.preferences.sessionLength !== null && (typeof input.preferences.sessionLength !== 'number' || !(SESSION_LENGTHS as readonly number[]).includes(input.preferences.sessionLength))) throw new Error('Invalid sessionLength');
      p.sessionLength = input.preferences.sessionLength as NonNullable<typeof p.sessionLength>;
    }
    out.preferences = p;
  }
  if (input.background !== undefined) {
    if (!isRecord(input.background)) throw new Error('Invalid background');
    const b: NonNullable<LearnerProfile['background']> = {};
    if (input.background.experienceLevel !== undefined) {
      const level = cleanText(input.background.experienceLevel, 'experienceLevel', 60)!;
      if (level && !(EXPERIENCE_LEVELS as readonly string[]).includes(level)) throw new Error('Invalid experienceLevel');
      b.experienceLevel = level;
    }
    for (const key of ['occupation', 'industry'] as const) {
      const value = cleanText(input.background[key], key, 120);
      if (value !== undefined) b[key] = value;
    }
    if (input.background.education !== undefined) {
      if (!isRecord(input.background.education)) throw new Error('Invalid education');
      const education: NonNullable<NonNullable<LearnerProfile['background']>['education']> = {};
      for (const key of ['level', 'field', 'institution'] as const) {
        const value = cleanText(input.background.education[key], `education.${key}`, 160);
        if (value !== undefined) education[key] = value;
      }
      b.education = education;
    }
    out.background = b;
  }
  return out;
}

export function mergeLearnerProfile(existing: unknown, update: LearnerProfile): Record<string, unknown> {
  const current = isRecord(existing) ? existing : {};
  const currentPreferences = isRecord(current.preferences) ? current.preferences : {};
  const currentBackground = isRecord(current.background) ? current.background : {};
  const currentEducation = isRecord(currentBackground.education) ? currentBackground.education : {};
  const updateBackground = update.background;
  return {
    ...current,
    ...update,
    preferences: update.preferences ? { ...currentPreferences, ...update.preferences } : current.preferences,
    background: updateBackground ? {
      ...currentBackground,
      ...updateBackground,
      education: updateBackground.education ? { ...currentEducation, ...updateBackground.education } : currentBackground.education,
    } : current.background,
  };
}
