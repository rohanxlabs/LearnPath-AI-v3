import type { LearnerProfile, SkillConfidenceLevel, SkillProficiencyLevel } from '../../types';
import type { CurriculumIntent } from './curriculum';

export type KnowledgeState = 'known' | 'partially_known' | 'unknown' | 'uncertain';
export type LearningDecision = 'compress' | 'review_and_verify' | 'teach' | 'teach_prerequisite';

export interface LearnerSkillEvidence {
  skillKey: string;
  skillName: string;
  proficiencyLevel: SkillProficiencyLevel | string;
  confidenceLevel: SkillConfidenceLevel | string;
  evidenceCount: number;
  lastEvidenceAt?: string | Date | null;
}

export interface CapabilityKnowledge {
  capability: string;
  state: KnowledgeState;
  decision: LearningDecision;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface LearnerContext {
  experienceLevel: string;
  currentKnowledge: CapabilityKnowledge[];
  demonstratedCapabilities: string[];
  relevantHistory: string[];
  availableTime?: number;
  sessionLength?: number;
  learningPreference?: string;
  evidenceSummary: string;
}

const GENERIC_SKILL_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'using', 'learn', 'learning', 'core', 'basic', 'basics',
  'fundamental', 'fundamentals', 'concept', 'concepts', 'practical', 'working', 'common', 'skills', 'skill',
  'handling', 'understanding', 'introduction', 'intro', 'advanced', 'intermediate', 'beginner', 'data',
]);

function skillTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}+#.]+/gu)
    ?.map(token => token.replace(/^[+#.]+|[+#.]+$/g, ''))
    .filter(token => token.length > 2 && !GENERIC_SKILL_WORDS.has(token)) || []);
}

function relevantEvidence(capability: string, skills: LearnerSkillEvidence[]): LearnerSkillEvidence[] {
  const required = skillTokens(capability);
  return skills.filter(skill => {
    const evidenceText = `${skill.skillName} ${skill.skillKey}`;
    const candidate = skillTokens(evidenceText);
    if (required.size === 0 || candidate.size === 0) return false;
    const overlap = [...candidate].filter(token => required.has(token)).length;
    // Exact capability labels are strongest; otherwise require meaningful overlap.
    // A single subject tag (e.g. "python") may support a broader capability, while
    // unrelated tags cannot leak into the learner context.
    return capability.toLowerCase().trim() === skill.skillName.toLowerCase().trim()
      || overlap >= 2
      || (candidate.size === 1 && overlap === 1);
  });
}

function stateForEvidence(evidence: LearnerSkillEvidence[]): Pick<CapabilityKnowledge, 'state' | 'decision' | 'confidence'> {
  const credible = evidence.filter(item => Number(item.evidenceCount) > 0);
  if (credible.length === 0) {
    return evidence.length
      ? { state: 'uncertain', decision: 'teach_prerequisite', confidence: 'low' }
      : { state: 'unknown', decision: 'teach_prerequisite', confidence: 'low' };
  }
  const strong = credible.some(item => item.confidenceLevel === 'high'
    && ['competent', 'advanced'].includes(String(item.proficiencyLevel)));
  if (strong) return { state: 'known', decision: 'compress', confidence: 'high' };

  const moderate = credible.some(item => ['medium', 'high'].includes(String(item.confidenceLevel))
    && ['competent', 'advanced', 'developing'].includes(String(item.proficiencyLevel)));
  if (moderate) {
    return { state: 'partially_known', decision: 'review_and_verify', confidence: credible.some(item => item.confidenceLevel === 'high') ? 'high' : 'medium' };
  }
  return { state: 'uncertain', decision: 'teach_prerequisite', confidence: 'low' };
}

export function buildLearnerContext(input: {
  intent: CurriculumIntent;
  skills?: LearnerSkillEvidence[];
  profile?: LearnerProfile | null;
  experienceLevel?: string;
  weeklyHours?: number | string;
  preferredStyle?: string;
}): LearnerContext {
  const profile = input.profile || {};
  const preferences = profile.preferences || {};
  const profileLevel = profile.background?.experienceLevel;
  const experienceLevel = input.experienceLevel || profileLevel || 'Beginner';
  const skills = (input.skills || []).slice(0, 500);
  const currentKnowledge = input.intent.requiredCapabilities.map(capability => {
    const evidence = relevantEvidence(capability, skills);
    const state = stateForEvidence(evidence);
    return {
      capability,
      ...state,
      evidence: evidence.map(item => item.skillName).slice(0, 5),
    };
  });
  const demonstratedCapabilities = currentKnowledge.filter(item => item.state === 'known').map(item => item.capability);
  const relevantHistory = currentKnowledge.filter(item => item.evidence.length > 0).map(item => item.capability);
  const weeklyHours = input.weeklyHours !== undefined && input.weeklyHours !== null && input.weeklyHours !== ''
    ? Number(input.weeklyHours)
    : preferences.weeklyHours;
  const learningStyle = input.preferredStyle || preferences.learningStyle;
  const evidenceSummary = skills.length === 0
    ? 'No relevant calibrated skill evidence was found; treat required capabilities as unknown rather than mastered.'
    : `${skills.length} calibrated skill record(s) were checked against this goal only. Evidence combines the existing lesson-completion, quiz, and placement calibration system.`;

  return {
    experienceLevel,
    currentKnowledge,
    demonstratedCapabilities,
    relevantHistory,
    availableTime: Number.isFinite(weeklyHours) && weeklyHours! > 0 ? weeklyHours : undefined,
    sessionLength: preferences.sessionLength ?? undefined,
    learningPreference: learningStyle,
    evidenceSummary,
  };
}

export function learningGaps(context: LearnerContext): CapabilityKnowledge[] {
  return context.currentKnowledge.filter(item => item.state !== 'known');
}

export function formatLearnerContext(context: LearnerContext): string {
  const lines = [
    `Experience level (broad self-report, not proof of specific skill): ${context.experienceLevel}`,
    'Capability evidence (goal-specific):',
    ...context.currentKnowledge.map(item => `- ${item.capability}: ${item.state.toUpperCase().replace('_', ' ')}; ${item.decision}; confidence ${item.confidence}${item.evidence.length ? ` (evidence: ${item.evidence.join(', ')})` : ''}`),
    `Available study time: ${context.availableTime ? `${context.availableTime} hours/week; use for pacing only, never to enlarge the curriculum` : 'not provided'}`,
    `Preferred learning style: ${context.learningPreference || 'not provided'}${context.sessionLength ? `; preferred session ${context.sessionLength} minutes` : ''}`,
    `Evidence note: ${context.evidenceSummary}`,
  ];
  return lines.join('\n');
}
