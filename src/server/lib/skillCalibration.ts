import { eq, sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/drizzle';
import { learningEvents, users, userSkills } from '../../../drizzle/schema';
import { logger } from './logger';
import { LEARNING_EVENT } from '../../types';
import type { LearnerProfile, SkillConfidenceLevel, SkillProficiencyLevel } from '../../types';

/** Explainable first-pass policy. These weights are heuristic, not scientific measurement. */
export const SKILL_CALIBRATION_POLICY = {
  quizWeight: 2,
  placementWeight: 2.5,
  completionWeight: 0.5,
  selfReportWeight: 0.25,
  recentDays: 90,
  agingDays: 365,
  agedEvidenceMultiplier: 0.5,
  oldEvidenceMultiplier: 0.25,
  mediumConfidenceWeight: 3,
  highConfidenceWeight: 6,
  conflictStdDev: 0.3,
  strongConflictStdDev: 0.5,
} as const;

const RESERVED_TAGS = new Set(['basics', 'basic', 'concepts', 'concept', 'fundamentals', 'intro', 'introduction', 'overview', 'misc', 'miscellaneous', 'general', 'things', 'stuff', 'skills', 'learning', 'theory']);
const EVIDENCE_TYPES = [LEARNING_EVENT.lessonCompleted, LEARNING_EVENT.quizAttempted, LEARNING_EVENT.placementQuestionAnswered] as const;

export interface SkillEvidence {
  eventType: string;
  occurredAt: string | Date;
  properties?: Record<string, unknown> | null;
  difficulty?: string | null;
}

export interface CalibratedSkill {
  proficiencyLevel: SkillProficiencyLevel;
  confidenceLevel: SkillConfidenceLevel;
  evidenceCount: number;
  lastEvidenceAt: Date | null;
}

export function normalizeSkillTag(value: unknown): { skillKey: string; skillName: string } | null {
  if (typeof value !== 'string' || value.length > 160 || /[\x00-\x1f\x7f]/.test(value)) return null;
  const skillName = value.trim().replace(/\s+/g, ' ');
  if (!skillName || skillName.length > 120) return null;
  const skillKey = skillName.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  if (!skillKey || skillKey.length > 160 || !/[\p{L}\p{N}]/u.test(skillKey)) return null;
  if (RESERVED_TAGS.has(skillKey)) return null;
  return { skillKey, skillName };
}

export function mapCurriculumSkillTags(value: unknown): Array<{ skillKey: string; skillName: string }> {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, { skillKey: string; skillName: string }>();
  for (const rawTag of value.slice(0, 20)) {
    const normalized = normalizeSkillTag(rawTag);
    if (normalized && !unique.has(normalized.skillKey)) unique.set(normalized.skillKey, normalized);
  }
  return [...unique.values()];
}

function recencyMultiplier(date: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  if (ageDays <= SKILL_CALIBRATION_POLICY.recentDays) return 1;
  if (ageDays <= SKILL_CALIBRATION_POLICY.agingDays) return SKILL_CALIBRATION_POLICY.agedEvidenceMultiplier;
  return SKILL_CALIBRATION_POLICY.oldEvidenceMultiplier;
}

function selfReportedPrior(experienceLevel: unknown): number | null {
  if (typeof experienceLevel !== 'string') return null;
  const key = experienceLevel.trim().toLowerCase();
  const values: Record<string, number> = {
    'complete beginner': 0.1,
    beginner: 0.25,
    'some experience': 0.4,
    intermediate: 0.55,
    advanced: 0.7,
    expert: 0.8,
  };
  return values[key] ?? null;
}

function proficiencyFor(mean: number): SkillProficiencyLevel {
  if (mean < 0.3) return 'beginner';
  if (mean < 0.5) return 'developing';
  if (mean < 0.75) return 'competent';
  return 'advanced';
}

function confidenceFor(weight: number, standardDeviation: number): SkillConfidenceLevel {
  let rank = weight >= SKILL_CALIBRATION_POLICY.highConfidenceWeight ? 2
    : weight >= SKILL_CALIBRATION_POLICY.mediumConfidenceWeight ? 1 : 0;
  if (standardDeviation >= SKILL_CALIBRATION_POLICY.strongConflictStdDev) rank -= 2;
  else if (standardDeviation >= SKILL_CALIBRATION_POLICY.conflictStdDev) rank -= 1;
  return (['low', 'medium', 'high'] as const)[Math.max(0, rank)];
}

/**
 * Replays only observable event evidence. Completion is a weak signal; quiz
 * percentages are stronger but remain client-reported in the current product.
 */
export function aggregateSkillEvidence(
  evidence: SkillEvidence[],
  experienceLevel?: unknown,
  now = new Date(),
): CalibratedSkill {
  const signals: Array<{ value: number; weight: number }> = [];
  let evidenceCount = 0;
  let lastEvidenceAt: Date | null = null;

  for (const item of evidence) {
    if (!EVIDENCE_TYPES.includes(item.eventType as typeof EVIDENCE_TYPES[number])) continue;
    const occurredAt = item.occurredAt instanceof Date ? item.occurredAt : new Date(item.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) continue;
    const properties = item.properties ?? {};
    let value: number;
    let weight: number;
    if (item.eventType === LEARNING_EVENT.quizAttempted) {
      const score = Number(properties.score);
      const total = Number(properties.totalQuestions);
      if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 100 || score < 0 || score > total) continue;
      value = score / total;
      weight = SKILL_CALIBRATION_POLICY.quizWeight;
    } else if (item.eventType === LEARNING_EVENT.placementQuestionAnswered) {
      if (typeof properties.correct !== 'boolean') continue;
      const difficulty = String(item.difficulty ?? '').toLowerCase();
      const difficultyBase: Record<string, number> = { beginner: 0.35, developing: 0.5, competent: 0.65, advanced: 0.8 };
      const base = difficultyBase[difficulty] ?? 0.5;
      // A missed advanced item is not evidence of beginner-level skill.
      value = properties.correct ? Math.min(0.95, base + 0.2) : Math.max(0.3, base - 0.2);
      weight = SKILL_CALIBRATION_POLICY.placementWeight;
    } else {
      const difficulty = String(item.difficulty ?? '').toLowerCase();
      value = difficulty === 'beginner' ? 0.2 : difficulty === 'intermediate' ? 0.3 : difficulty === 'advanced' ? 0.45 : 0.3;
      weight = SKILL_CALIBRATION_POLICY.completionWeight;
    }
    signals.push({ value, weight: weight * recencyMultiplier(occurredAt, now) });
    evidenceCount++;
    if (!lastEvidenceAt || occurredAt > lastEvidenceAt) lastEvidenceAt = occurredAt;
  }

  const prior = selfReportedPrior(experienceLevel);
  if (prior !== null) signals.push({ value: prior, weight: SKILL_CALIBRATION_POLICY.selfReportWeight });
  if (evidenceCount === 0) {
    return { proficiencyLevel: 'unknown', confidenceLevel: 'low', evidenceCount: 0, lastEvidenceAt: null };
  }

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const mean = signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / totalWeight;
  const variance = signals.reduce((sum, signal) => sum + signal.weight * (signal.value - mean) ** 2, 0) / totalWeight;
  return {
    proficiencyLevel: proficiencyFor(mean),
    confidenceLevel: confidenceFor(totalWeight, Math.sqrt(variance)),
    evidenceCount,
    lastEvidenceAt,
  };
}

const eventSkillTags = drizzleSql.raw(`CASE
  WHEN e.event_type = 'placement_question_answered' THEN COALESCE(e.properties->'skillTags', '[]'::jsonb)
  WHEN l.id IS NOT NULL AND jsonb_typeof(l.skill_tags) = 'array' THEN
    CASE WHEN jsonb_array_length(l.skill_tags) > 0 THEN l.skill_tags ELSE COALESCE(p.skills_covered, '[]'::jsonb) END
  ELSE COALESCE(p.skills_covered, '[]'::jsonb)
END`);

const ownedContextJoins = drizzleSql.raw(`
  LEFT JOIN lessons l ON l.id = COALESCE(
      e.lesson_id,
      CASE WHEN e.event_type = 'quiz_attempted' THEN e.properties->>'quizId' END
    )
    AND EXISTS (SELECT 1 FROM roadmaps lr WHERE lr.id = l.roadmap_id AND lr.owner_email = e.owner_email)
  LEFT JOIN phases p ON p.id = COALESCE(e.phase_id, l.phase_id, e.properties->>'quizId')
    AND EXISTS (SELECT 1 FROM roadmaps pr WHERE pr.id = p.roadmap_id AND pr.owner_email = e.owner_email)`);

async function findEvidenceEvent(ownerEmail: string, eventId: string): Promise<any | null> {
  const result = await db.execute(drizzleSql`
    SELECT e.id, e.event_type AS "eventType", e.occurred_at AS "occurredAt", e.properties,
           COALESCE(l.difficulty, e.properties->>'difficulty') AS difficulty, ${eventSkillTags} AS "skillTags"
    FROM learning_events e ${ownedContextJoins}
    WHERE e.id = ${eventId} AND e.owner_email = ${ownerEmail.toLowerCase()}
      AND e.event_type IN ('lesson_completed', 'quiz_attempted', 'placement_question_answered')
    LIMIT 1`) as unknown as { rows: any[] };
  return result.rows?.[0] ?? null;
}

async function findAllEvidenceEvents(ownerEmail: string): Promise<any[]> {
  const result = await db.execute(drizzleSql`
    SELECT e.id, e.event_type AS "eventType", e.occurred_at AS "occurredAt", e.properties,
           COALESCE(l.difficulty, e.properties->>'difficulty') AS difficulty, ${eventSkillTags} AS "skillTags"
    FROM learning_events e ${ownedContextJoins}
    WHERE e.owner_email = ${ownerEmail.toLowerCase()}
      AND e.event_type IN ('lesson_completed', 'quiz_attempted', 'placement_question_answered')`) as unknown as { rows: any[] };
  return result.rows ?? [];
}

async function findHistoryForSkills(ownerEmail: string, skillKeys: string[]): Promise<any[]> {
  if (skillKeys.length === 0) return [];
  const skillTagExpression = eventSkillTags;
  const normalizedTag = drizzleSql.raw(`trim(both '-' from regexp_replace(lower(tag.value), '[^[:alnum:].]+', '-', 'g'))`);
  const skillPredicates = drizzleSql.join(skillKeys.map((key) => drizzleSql`${normalizedTag} = ${key}`), drizzleSql` OR `);
  const result = await db.execute(drizzleSql`
    SELECT e.event_type AS "eventType", e.occurred_at AS "occurredAt", e.properties,
           COALESCE(l.difficulty, e.properties->>'difficulty') AS difficulty, ${eventSkillTags} AS "skillTags"
    FROM learning_events e ${ownedContextJoins}
    WHERE e.owner_email = ${ownerEmail.toLowerCase()} AND e.event_type IN ('lesson_completed', 'quiz_attempted', 'placement_question_answered')
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${skillTagExpression}) AS tag(value)
        WHERE ${skillPredicates}
      )`) as unknown as { rows: any[] };
  return result.rows ?? [];
}

function profileExperience(progress: unknown): string | undefined {
  if (!progress || typeof progress !== 'object') return undefined;
  const profile = (progress as any).profile;
  const level = profile?.learnerProfile?.background?.experienceLevel;
  return typeof level === 'string' ? level : undefined;
}

async function persistSkillKeys(ownerEmail: string, affectedKeys: string[]): Promise<void> {
  if (affectedKeys.length === 0) return;
  const [history, profileRows] = await Promise.all([
    findHistoryForSkills(ownerEmail, affectedKeys),
    db.select({ progress: users.progress }).from(users).where(eq(users.email, ownerEmail)).limit(1),
  ]);
  const experienceLevel = profileExperience(profileRows[0]?.progress);

  for (const skillKey of affectedKeys) {
    const relevant = history.filter((row) => mapCurriculumSkillTags(row.skillTags).some((tag) => tag.skillKey === skillKey));
    const labels: string[] = [...new Set<string>(relevant.flatMap((row) => mapCurriculumSkillTags(row.skillTags)
      .filter((tag) => tag.skillKey === skillKey).map((tag) => tag.skillName)))].sort((a, b) => a.localeCompare(b));
    const calibrated = aggregateSkillEvidence(relevant.map((row) => ({
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      properties: row.properties,
      difficulty: row.difficulty,
    })), experienceLevel);
    await db.insert(userSkills).values({
      id: `skill-${randomUUID()}`,
      ownerEmail,
      skillKey,
      skillName: labels[0] ?? skillKey,
      proficiencyLevel: calibrated.proficiencyLevel,
      confidenceLevel: calibrated.confidenceLevel,
      evidenceCount: calibrated.evidenceCount,
      lastEvidenceAt: calibrated.lastEvidenceAt,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [userSkills.ownerEmail, userSkills.skillKey],
      set: {
        skillName: labels[0] ?? skillKey,
        proficiencyLevel: calibrated.proficiencyLevel,
        confidenceLevel: calibrated.confidenceLevel,
        evidenceCount: calibrated.evidenceCount,
        lastEvidenceAt: calibrated.lastEvidenceAt,
        updatedAt: new Date(),
      },
    });
  }
}

function skillKeysFromRows(rows: any[]): string[] {
  return [...new Set(rows.flatMap((row) => mapCurriculumSkillTags(row.skillTags).map((tag) => tag.skillKey)))];
}

/** Replays event history for only the tags affected by the new event. */
export async function recalibrateSkillsFromEvent(ownerEmail: string, eventId: string): Promise<void> {
  const normalizedEmail = ownerEmail.toLowerCase();
  const event = await findEvidenceEvent(normalizedEmail, eventId);
  if (!event) return;
  await persistSkillKeys(normalizedEmail, skillKeysFromRows([event]));
}

/** Replays only skill keys represented by a completed placement attempt. */
export async function recalibrateSkillsForTags(ownerEmail: string, skillTags: unknown[]): Promise<void> {
  const normalizedEmail = ownerEmail.toLowerCase();
  const affectedKeys = [...new Set(mapCurriculumSkillTags(skillTags).map((tag) => tag.skillKey))];
  await persistSkillKeys(normalizedEmail, affectedKeys);
}

/** One-time lazy replay so Phase 1 events become visible when a learner first opens Skills. */
export async function backfillUserSkillStates(ownerEmail: string): Promise<void> {
  const normalizedEmail = ownerEmail.toLowerCase();
  const rows = await findAllEvidenceEvents(normalizedEmail);
  await persistSkillKeys(normalizedEmail, skillKeysFromRows(rows));
}

export async function recordSkillCalibrationBestEffort(ownerEmail: string, eventId: string): Promise<void> {
  try {
    await recalibrateSkillsFromEvent(ownerEmail, eventId);
  } catch (error) {
    logger.warn({ err: error, eventId }, 'Could not update learner skill calibration');
  }
}

export async function backfillUserSkillStatesBestEffort(ownerEmail: string): Promise<void> {
  try {
    await backfillUserSkillStates(ownerEmail);
  } catch (error) {
    logger.warn({ err: error }, 'Could not replay existing learner skill evidence');
  }
}
