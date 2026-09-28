import { normalizeSkillTag } from './skillCalibration';

export type AdaptiveAction = 'continue' | 'reinforce' | 'review' | 'remediate' | 'verify' | 'advance' | 'challenge';
export type AdaptiveConfidence = 'low' | 'medium' | 'high';

export interface AdaptiveLesson {
  id: string;
  title?: string;
  type?: string;
  skillTags?: unknown;
  prerequisites?: unknown;
}

export interface AdaptiveQuizEvidence {
  lessonId?: string;
  score: number;
  totalQuestions: number;
  occurredAt?: string | Date;
}

export interface AdaptiveSkillState {
  skillKey: string;
  proficiencyLevel: string;
  confidenceLevel: string;
  evidenceCount: number;
}

export interface AdaptiveDecision {
  action: AdaptiveAction;
  reason: string;
  targetLessonId: string | null;
  capability?: string;
  confidence: AdaptiveConfidence;
}

/** Pure next-step policy. It can only point at lessons that already exist. */
export function determineNextLearningAction(input: {
  lessons: AdaptiveLesson[];
  completedLessonIds: string[];
  currentLessonId?: string | null;
  quizEvidence?: AdaptiveQuizEvidence[];
  skills?: AdaptiveSkillState[];
}): AdaptiveDecision {
  const { lessons, completedLessonIds, currentLessonId } = input;
  const completed = new Set(completedLessonIds);
  if (lessons.length === 0) return { action: 'continue', reason: 'This roadmap has no lessons to recommend.', targetLessonId: null, confidence: 'low' };

  const incomplete = lessons.filter((lesson) => !completed.has(lesson.id));
  if (incomplete.length === 0) return { action: 'challenge', reason: 'The planned roadmap is complete; optional practice may be useful.', targetLessonId: null, confidence: 'medium' };
  const current = currentLessonId ? incomplete.find((lesson) => lesson.id === currentLessonId) : undefined;
  const next = current ?? incomplete[0];

  const tags = Array.isArray(next.skillTags) ? next.skillTags.map(normalizeSkillTag).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag)) : [];
  const relevantSkills = (input.skills ?? []).filter((skill) => tags.some((tag) => tag.skillKey === skill.skillKey));
  const established = relevantSkills.some((skill) =>
    ['competent', 'advanced'].includes(skill.proficiencyLevel) && skill.confidenceLevel === 'high' && skill.evidenceCount >= 3,
  );
  if (!current && established) {
    const later = incomplete[incomplete.indexOf(next) + 1];
    const prerequisites = Array.isArray(later?.prerequisites) ? later.prerequisites.map(String) : [];
    const prerequisitesSatisfied = prerequisites.every((id) => completed.has(id) || id === next.id);
    if (later && prerequisitesSatisfied) return {
      action: 'advance', reason: 'High-confidence calibration already demonstrates this lesson’s tagged capability; continue with the next existing lesson.',
      targetLessonId: later.id, capability: tags[0]?.skillName, confidence: 'high',
    };
  }

  const attempts = (input.quizEvidence ?? []).filter((item) => (!item.lessonId || item.lessonId === next.id) && item.totalQuestions > 0 && item.score >= 0 && item.score <= item.totalQuestions)
    .slice(0, 10);
  const failed = attempts.filter((item) => item.score / item.totalQuestions < 0.5).length;
  const recent = attempts[0];
  const capability = tags[0]?.skillName;
  if (failed >= 2) return { action: 'remediate', reason: 'Repeated low quiz results suggest revisiting this lesson before moving on.', targetLessonId: next.id, capability, confidence: 'medium' };
  if (recent) {
    const ratio = recent.score / recent.totalQuestions;
    if (ratio < 0.7) return {
      action: 'reinforce', reason: 'The latest quiz result is below the existing 70% practice threshold; use focused practice before advancing.',
      targetLessonId: next.id, capability, confidence: 'low',
    };
    if (ratio >= 0.7) {
      const later = incomplete[incomplete.indexOf(next) + 1];
      return { action: 'advance', reason: 'The latest quiz result meets the existing practice threshold; continue without repeating this lesson.', targetLessonId: later?.id ?? next.id, capability, confidence: 'medium' };
    }
  }

  if (relevantSkills.some((skill) => skill.proficiencyLevel === 'developing' || skill.confidenceLevel === 'low')) {
    return { action: 'verify', reason: 'Calibration is incomplete or uncertain, so verify the capability while learning this lesson.', targetLessonId: next.id, capability, confidence: 'low' };
  }
  return { action: 'continue', reason: 'No meaningful performance evidence calls for a detour; continue with the next planned lesson.', targetLessonId: next.id, capability, confidence: 'medium' };
}
