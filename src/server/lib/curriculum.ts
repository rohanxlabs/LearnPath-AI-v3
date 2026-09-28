import { cleanAndParseJSON, callGroqChatCompletion, sanitizeForPrompt, GROQ_MODELS } from './ai';
import { logger } from './logger';
import { formatLearnerContext, learningGaps, type LearnerContext } from './curriculumPersonalization';

// ---------------------------------------------------------------------------
// Curriculum constants & types
// ---------------------------------------------------------------------------

export const DIFFICULTY_LADDER = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTY_LADDER)[number];
export const LESSON_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export const CURRICULUM_LIMITS = {
  minPhases: 6,
  maxPhases: 10,
  minModulesPerPhase: 3,
  maxModulesPerPhase: 6,
  minLessonsPerModule: 4,
  maxLessonsPerModule: 8,
  minTotalModules: 18,
  minTotalLessons: 45,
  minLessonMinutes: 15,
  maxLessonMinutes: 40
} as const;

// Budget policy for future roadmap generation. Module counts are totals across
// the whole roadmap, unlike CURRICULUM_LIMITS.maxModulesPerPhase.
export type CurriculumLevel = 'standard' | 'intermediate' | 'advanced';
export type CurriculumScope = 'small' | 'medium' | 'large';

export interface CurriculumIntent {
  subject: string;
  desiredOutcome: string;
  requiredCapabilities: string[];
  scope: CurriculumScope;
}

export interface CurriculumBudget {
  level: CurriculumLevel;
  scope: CurriculumScope;
  goal: string;
  targetPhases: number;
  targetModules: number;
  maximumPhases: number;
  maximumModules: number;
  lessons: { minPerModule: number; maxPerModule: number; totalSoftMaximum: number };
  rationale: string[];
}

export const CURRICULUM_BUDGET_POLICY = {
  levelTargets: {
    standard: { phases: 3, modules: 5 },
    intermediate: { phases: 5, modules: 8 },
    advanced: { phases: 8, modules: 11 },
  },
  scopeAdjustments: {
    small: { phases: -1, modules: -2 },
    medium: { phases: 0, modules: 0 },
    large: { phases: 1, modules: 2 },
  },
  hardCaps: { phases: 9, modules: 13 },
  lessonSoftLimits: { minPerModule: 1, maxPerModule: 8, totalSoftMaximum: 80 },
  fallbackLevel: 'standard' as CurriculumLevel,
  fallbackScope: 'medium' as CurriculumScope,
} as const;

function normalizeCurriculumLevel(value: unknown): CurriculumLevel {
  if (typeof value !== 'string') return CURRICULUM_BUDGET_POLICY.fallbackLevel;
  switch (value.trim().toLowerCase()) {
    case 'beginner':
    case 'standard':
    case 'complete beginner': return 'standard';
    case 'intermediate':
    case 'some experience': return 'intermediate';
    case 'advanced':
    case 'expert': return 'advanced';
    default: return CURRICULUM_BUDGET_POLICY.fallbackLevel;
  }
}

function normalizeCurriculumScope(value: unknown): CurriculumScope {
  if (typeof value !== 'string') return CURRICULUM_BUDGET_POLICY.fallbackScope;
  const normalized = value.trim().toLowerCase();
  return (['small', 'medium', 'large'] as const).includes(normalized as CurriculumScope)
    ? normalized as CurriculumScope
    : CURRICULUM_BUDGET_POLICY.fallbackScope;
}

/** Calculate a deterministic phase and total-module budget for a new roadmap. */
export function calculateCurriculumBudget(input: { level?: unknown; scope?: unknown; goal?: string }): CurriculumBudget {
  const level = normalizeCurriculumLevel(input.level);
  const scope = normalizeCurriculumScope(input.scope);
  const target = CURRICULUM_BUDGET_POLICY.levelTargets[level];
  const adjustment = CURRICULUM_BUDGET_POLICY.scopeAdjustments[scope];
  const targetPhases = Math.min(CURRICULUM_BUDGET_POLICY.hardCaps.phases, Math.max(1, target.phases + adjustment.phases));
  const targetModules = Math.min(CURRICULUM_BUDGET_POLICY.hardCaps.modules, Math.max(1, target.modules + adjustment.modules));
  return {
    level, scope, goal: typeof input.goal === 'string' ? input.goal.trim() : '',
    targetPhases, targetModules,
    maximumPhases: CURRICULUM_BUDGET_POLICY.hardCaps.phases,
    maximumModules: CURRICULUM_BUDGET_POLICY.hardCaps.modules,
    lessons: { ...CURRICULUM_BUDGET_POLICY.lessonSoftLimits },
    rationale: [
      `Level "${level}" establishes a center of ${target.phases} phases and ${target.modules} total modules.`,
      `Scope "${scope}" adjusts that center by ${adjustment.phases} phase(s) and ${adjustment.modules} module(s).`,
      'The goal is retained for future relevance planning; it does not yet affect size calculation.',
    ],
  };
}

/** Conservative keyword policy until goal scope is inferred by a richer planner. */
export function classifyGoalScope(goal: string): CurriculumScope {
  const text = String(goal || '').toLowerCase();
  if (/\b(basics?|intro(duction)?|syntax|getting started|fundamentals|essentials)\b/.test(text)) return 'small';
  if (/\b(advanced|deeply|mastery|expert|job.?ready|career|engineer|full.?stack|end.?to.?end|comprehensive|production|machine.?learn|deep.?learn|robotics|data.?science)\b/.test(text)) return 'large';
  return 'medium';
}

function inferGoalSubject(goal: string): string {
  const text = goal.toLowerCase();
  if (/\b(machine learning|deep learning|ml)\b/.test(text)) return /\bpython\b/.test(text) ? 'Machine Learning with Python' : 'Machine Learning';
  const knownSubjects = ['Python', 'JavaScript', 'TypeScript', 'React', 'SQL', 'Docker', 'Git', 'Machine Learning', 'Robotics', 'Data Science'];
  const found = knownSubjects.find(subject => new RegExp(`\\b${subject.toLowerCase()}\\b`, 'i').test(goal));
  if (found) return found;
  const prefix = goal.split(/\b(?:for|to|with|using|basics?|fundamentals|from)\b/i)[0].replace(/^(learn|study|master)\s+/i, '').trim();
  return (prefix || goal).slice(0, 100);
}

/** Deterministic fallback intent used when interpretation is unavailable or malformed. */
export function buildFallbackCurriculumIntent(goal: string): CurriculumIntent {
  const text = goal.toLowerCase();
  const subject = inferGoalSubject(goal);
  let desiredOutcome: string;
  let requiredCapabilities: string[];
  if (/scrap/.test(text)) {
    desiredOutcome = 'Build practical web scrapers that collect and export structured website data.';
    requiredCapabilities = ['Python scripting fundamentals', 'HTTP requests and response handling', 'HTML structure and CSS selectors', 'HTML parsing and data extraction', 'Pagination and respectful request handling', 'Error handling and retry decisions', 'Data cleaning and export', 'Debugging and testing a scraper'];
  } else if (/machine.?learn|deep.?learn|\bml\b/.test(text)) {
    desiredOutcome = 'Use Python and relevant data tools to build and evaluate machine-learning workflows.';
    requiredCapabilities = ['Python programming for data workflows', 'NumPy and tabular data handling', 'Data cleaning and feature preparation', 'Core supervised and unsupervised learning concepts', 'Model training and evaluation', 'Experiment tracking and result interpretation'];
  } else if (/automat|excel|spreadsheet|repetitive task|reports?/.test(text)) {
    desiredOutcome = 'Use Python to automate practical repetitive tasks and verify the results.';
    requiredCapabilities = ['Python scripting fundamentals', 'Functions and reusable scripts', 'File and structured-data handling', 'Error handling and logging', 'Task-specific automation libraries or APIs', 'Testing and safely rerunning automation'];
  } else if (/backend|back-end|server|api engineer/.test(text)) {
    desiredOutcome = 'Build and operate reliable Python backend services.';
    requiredCapabilities = ['Advanced Python language features', 'HTTP APIs and request validation', 'Data persistence and database access', 'Concurrency and background work', 'Automated testing and debugging', 'Authentication and application security', 'Configuration, logging, and observability', 'Deployment and production operations'];
  } else if (/personal finance tracker|finance tracker|budget tracker/.test(text)) {
    desiredOutcome = 'Build a personal finance tracker in Python for recording and reviewing transactions.';
    requiredCapabilities = ['Python programming fundamentals', 'Transaction and category data modelling', 'Persistent storage for financial records', 'Income, spending, and balance calculations', 'Input validation and error handling', 'Testing calculations and stored data'];
  } else if (/\b(basics?|intro(duction)?|syntax|fundamentals|getting started)\b/.test(text)) {
    desiredOutcome = `Learn ${subject} fundamentals and use them to complete small practical tasks.`;
    requiredCapabilities = [`${subject} syntax and core vocabulary`, 'Working with common values and data', 'Control flow and reusable operations', 'Reading errors and debugging small programs', 'Applying fundamentals in a focused exercise'];
  } else {
    desiredOutcome = `Learn the core capabilities of ${subject} and apply them to the stated goal: ${goal.trim()}.`;
    requiredCapabilities = [`${subject} foundations`, `Core concepts and workflows in ${subject}`, `Practising the main tasks involved in ${goal.trim()}`, 'Debugging and checking work against the intended result'];
  }
  const scope = /machine.?learn|deep.?learn|\brobotics\b|data.?science/.test(text)
    ? 'large'
    : classifyGoalScope(goal);
  return { subject, desiredOutcome, requiredCapabilities, scope };
}

export function normalizeCurriculumIntent(input: unknown, goal: string): CurriculumIntent {
  const fallback = buildFallbackCurriculumIntent(goal);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const value = input as Record<string, unknown>;
  const subject = typeof value.subject === 'string' ? value.subject.trim().slice(0, 100) : '';
  const desiredOutcome = typeof value.desiredOutcome === 'string' ? value.desiredOutcome.trim().slice(0, 300) : '';
  const capabilities = Array.isArray(value.requiredCapabilities)
    ? Array.from(new Set(value.requiredCapabilities.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 160)).filter(Boolean))).slice(0, 12)
    : [];
  const scope = typeof value.scope === 'string' && ['small', 'medium', 'large'].includes(value.scope.toLowerCase())
    ? value.scope.toLowerCase() as CurriculumScope : fallback.scope;
  if (!subject || !desiredOutcome || capabilities.length < 2) return fallback;
  return { subject, desiredOutcome, requiredCapabilities: capabilities, scope };
}

export function buildCurriculumIntentPrompt(goal: string): string {
  return `Interpret this learner request for a bounded curriculum. Return JSON only with exactly these fields: subject (string), desiredOutcome (string), requiredCapabilities (array of 3-10 concise strings), scope (small|medium|large). Request: "${sanitizeForPrompt(goal, 240)}". Separate the subject from the outcome. Stay faithful to the request; do not invent a career, project, or adjacent domain. List only capabilities needed to reach the stated outcome. A subject-only request should have a modest general outcome. Scope reflects the breadth of the stated outcome, not everything associated with its technology. Do not include phases, modules, lessons, or a curriculum budget.`;
}

export async function interpretCurriculumIntent(goal: string): Promise<CurriculumIntent> {
  const fallback = buildFallbackCurriculumIntent(goal);
  try {
    const response = await callGroqChatCompletion(buildCurriculumIntentPrompt(goal), { temperature: 0.1, asJSON: true, timeoutMs: 15000, maxTokens: 1200 });
    return normalizeCurriculumIntent(cleanAndParseJSON(response, '{}'), goal);
  } catch (error: any) {
    logger.warn({ err: error?.message || error }, '[Curriculum] Goal interpretation failed; using bounded deterministic intent');
    return fallback;
  }
}

export async function createCurriculumPlan(goal: string, level: unknown): Promise<{ intent: CurriculumIntent; budget: CurriculumBudget }> {
  const intent = await interpretCurriculumIntent(goal);
  const budget = calculateCurriculumBudget({ level, scope: intent.scope, goal });
  return { intent, budget };
}

export function calculateRoadmapGenerationBudget(level: unknown, goal: string): CurriculumBudget {
  return calculateCurriculumBudget({ level, scope: classifyGoalScope(goal), goal });
}

export function buildCurriculumGenerationPrompt(input: {
  goal: string; experienceLevel?: string; weeklyHours?: number | string; preferredStyle?: string;
  college?: string; branch?: string; year?: string; budget: CurriculumBudget; intent?: CurriculumIntent;
  learnerContext?: LearnerContext;
}): string {
  const { goal, budget } = input;
  const intent = input.intent || buildFallbackCurriculumIntent(goal);
  const capabilityList = intent.requiredCapabilities.map(capability => `- ${sanitizeForPrompt(capability, 160)}`).join('\n');
  const learnerSection = input.learnerContext
    ? `\n\nLEARNER CONTEXT (goal-specific evidence):\n${formatLearnerContext(input.learnerContext)}\n\nPERSONALIZATION RULES: Prioritize the learning gaps listed below. Do not reteach demonstrated knowledge unnecessarily; compress or use a brief verification when useful. Teach unknown prerequisites. Give partially known capabilities concise review and verification. Treat uncertain capabilities conservatively and teach them lightly. Experience level is a broad prior, not proof of specific knowledge. Available time affects pacing and lesson granularity only; do not expand module or phase counts.\nLEARNING GAPS TO COVER:\n${learningGaps(input.learnerContext).map(item => `- ${sanitizeForPrompt(item.capability, 160)} (${item.state}; ${item.decision})`).join('\n') || '- No unmet capability identified; provide a concise outcome integration/verification path.'}`
    : '';
  const universityContext = input.college && input.branch && input.year
    ? ` Learner context: ${sanitizeForPrompt(input.year)} student at ${sanitizeForPrompt(input.college)}, studying ${sanitizeForPrompt(input.branch)}.` : '';
  return `You are a curriculum architect. Plan the smallest coherent curriculum required for this learner's specific outcome.\n\nORIGINAL REQUEST: "${sanitizeForPrompt(goal, 240)}"\nSUBJECT: ${sanitizeForPrompt(intent.subject, 100)}\nDESIRED OUTCOME: ${sanitizeForPrompt(intent.desiredOutcome, 300)}\nREQUIRED CAPABILITIES (preserve outcome coverage; modules map to exact strings in supportsCapabilities):\n${capabilityList}\nSCOPE: ${intent.scope}\nLEVEL: ${budget.level} (learner selected: ${sanitizeForPrompt(input.experienceLevel || 'Beginner')})\nPACE: ${sanitizeForPrompt(input.weeklyHours || 5)} hours/week. STYLE: ${sanitizeForPrompt(input.preferredStyle || 'Hands-on')}.${universityContext}${learnerSection}\n\nCURRICULUM BUDGET (application-controlled hard boundary):\n- Target approximately ${budget.targetPhases} phases and ${budget.targetModules} TOTAL modules across the entire roadmap. Module count is global, not per phase.\n- Never exceed ${budget.maximumPhases} phases or ${budget.maximumModules} TOTAL modules. Use fewer than target whenever sufficient; extra structure is justified only when genuinely necessary and still within both caps. Do not inflate the curriculum to reach target counts.\n- Lesson metadata only: lesson counts are variable and follow module objectives. Avoid padding.\n\nGOAL RELEVANCE AND STOP CONDITION: Generate only the curriculum necessary to achieve the desired outcome. Every module must contribute meaningfully to one or more required capabilities. Do not add unrelated subject areas or adjacent technologies. Stop when the learner has sufficient knowledge to achieve the outcome.\n\nSTRUCTURE AND QUALITY:\n- Organize meaningful phases and coherent modules. Counts are flexible targets, not quotas. No artificial phases, modules, or lessons.\n- Use specific, distinct titles and concise descriptions; order prerequisites logically. No duplicate lesson titles or module names.\n- Lessons: id, name, description, learningObjectives (2-4 measurable phrases), prerequisites (earlier lesson IDs; first lesson []), skillTags, difficulty beginner|intermediate|advanced, estimatedMinutes ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}, type "learn", status "available" for first lesson only else "locked", contentStatus "pending".\n- Modules: id, name, description, supportsCapabilities (exact strings from the required capability list), difficulty, estimatedHours, lessons, and 0-2 topic-matched resources.\n- Phases: id, name, description, estimatedHours, difficulty, skillsCovered, modules, and projects only when they directly support the outcome. Projects are optional.\n- Return JSON only, shaped as {"goal":"...","phases":[{"id":"ph-1","name":"...","description":"...","estimatedHours":8,"difficulty":"beginner","skillsCovered":["..."],"modules":[{"id":"mod-1-1","name":"...","description":"...","supportsCapabilities":["exact capability"],"difficulty":"beginner","estimatedHours":3,"lessons":[{"id":"les-1-1-1","name":"...","description":"...","learningObjectives":["..."],"prerequisites":[],"skillTags":["..."],"difficulty":"beginner","estimatedMinutes":20,"type":"learn","status":"available","contentStatus":"pending"}],"resources":[]}],"projects":[]}]}.`;
}

export function buildCurriculumRetryPrompt(goal: string, budget: CurriculumBudget, issues: string[], intent?: CurriculumIntent, learnerContext?: LearnerContext): string {
  const plan = intent || buildFallbackCurriculumIntent(goal);
  const capabilities = plan.requiredCapabilities.map(capability => `- ${sanitizeForPrompt(capability, 160)}`).join('\n');
  const personalization = learnerContext ? `\nLearner context:\n${formatLearnerContext(learnerContext)}\nPrioritize gaps; compress demonstrated capabilities, briefly verify partial knowledge, and teach unknown or uncertain prerequisites. Study time affects pacing only.` : '';
  return `Revise the curriculum for request "${sanitizeForPrompt(goal, 240)}" to fix these issues:\n${issues.slice(0, 12).map(issue => `- ${issue}`).join('\n')}\nSubject: ${sanitizeForPrompt(plan.subject, 100)}. Desired outcome: ${sanitizeForPrompt(plan.desiredOutcome, 300)}. Required capabilities:\n${capabilities}${personalization}\nPreserve outcome coverage and map every module to one or more exact required capabilities. Target approximately ${budget.targetPhases} phases and ${budget.targetModules} TOTAL modules; never exceed ${budget.maximumPhases} phases or ${budget.maximumModules} total modules. Use fewer when sufficient. Lessons are variable and should not pad the curriculum. Do not reintroduce unrelated topics or projects. Return the corrected complete JSON only.`;
}

export const PROJECT_LADDER = ['mini-exercise', 'mini-project', 'real-application', 'portfolio-project', 'capstone'] as const;
export const PROJECT_LADDER_RANK: Record<string, number> = Object.fromEntries(PROJECT_LADDER.map((tier, i) => [tier, i]));

export const GENERIC_NAMES = new Set([
  'introduction', 'intro', 'overview', 'basics', 'basic', 'fundamentals', 'getting started',
  'misc', 'miscellaneous', 'extra', 'additional', 'other', 'more', 'next',
  'lesson 1', 'lesson 2', 'lesson 3', 'module 1', 'module 2', 'module 3', 'project',
  'assignment', 'exercise', 'topic', 'concepts', 'concept', 'things', 'stuff', 'etc',
  'conclusion', 'summary', 'wrap up', 'final', 'part', 'section', 'chapter', 'untitled'
]);

export const PROHIBITED_SKILL_TAGS = new Set([
  'basics', 'basic', 'concepts', 'concept', 'fundamentals', 'intro', 'introduction',
  'overview', 'misc', 'miscellaneous', 'general', 'things', 'stuff', 'skills', 'learning', 'theory'
]);

export const DIFFICULTY_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, expert: 3 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function normalizeProjectTier(value: any): string | null {
  const s = String(value || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  if (s in PROJECT_LADDER_RANK) return s;
  const map: Record<string, string> = {
    beginner: 'mini-project', intermediate: 'real-application',
    advanced: 'portfolio-project', expert: 'capstone'
  };
  return map[s] || null;
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

export function validateCurriculumQuality(input: any, budget?: CurriculumBudget, intent?: CurriculumIntent, learnerContext?: LearnerContext): { ok: boolean; score: number; issues: string[] } {
  const issues: string[] = [];
  const phases = Array.isArray(input?.phases) ? input.phases : [];
  const totalPhases = phases.length;

  const phaseMaximum = budget?.maximumPhases ?? CURRICULUM_LIMITS.maxPhases;
  if (totalPhases > phaseMaximum) issues.push(`Too many phases (${totalPhases}); budget maximum is ${phaseMaximum}.`);

  let totalModules = 0, totalLessons = 0, lessonsWithEmptyTags = 0, lessonsMissingPrereqs = 0;
  let genericPhaseNames = 0, genericModuleNames = 0, duplicateLessonTitles = 0, duplicateModuleNames = 0;
  let brokenPrereqs = 0, forwardPrereqs = 0, genericLessonTitles = 0, unrealisticTime = 0;
  let resourceMismatch = 0, emptyObjectives = 0, weakObjectives = 0;
  let modulesWithoutIntentSupport = 0;
  const coveredCapabilities = new Set<string>();
  const requiredCapabilities = new Set((intent?.requiredCapabilities || []).map(capability => capability.trim().toLowerCase()));
  const knownCapabilities = new Set((learnerContext?.currentKnowledge || []).filter(item => item.state === 'known').map(item => item.capability.trim().toLowerCase()));

  const lessonOrder = new Map<string, number>();
  let ordinal = 0;
  for (const phase of phases) {
    for (const mod of Array.isArray(phase?.modules) ? phase.modules : []) {
      for (const les of Array.isArray(mod?.lessons) ? mod.lessons : []) {
        const id = String(les?.id || '').trim();
        if (id && !lessonOrder.has(id)) lessonOrder.set(id, ordinal);
        ordinal++;
      }
    }
  }

  const seenLessonTitles = new Set<string>();
  const seenModuleNames = new Set<string>();
  const phaseDiffs: string[] = [];

  for (const phase of phases) {
    const mods = Array.isArray(phase?.modules) ? phase.modules : [];
    totalModules += mods.length;
    if (mods.length > CURRICULUM_LIMITS.maxModulesPerPhase) issues.push(`Phase "${phase?.name || '?'}" exceeds the per-phase structural limit of ${CURRICULUM_LIMITS.maxModulesPerPhase} modules.`);
    if (typeof phase?.difficulty === 'string') phaseDiffs.push(String(phase.difficulty).toLowerCase());

    const phaseName = String(phase?.name || '').trim().toLowerCase();
    if (phaseName && GENERIC_NAMES.has(phaseName)) genericPhaseNames++;

    for (const mod of mods) {
      const modName = String(mod?.name || '').trim().toLowerCase();
      if (modName) {
        if (seenModuleNames.has(modName)) duplicateModuleNames++;
        else if (GENERIC_NAMES.has(modName)) genericModuleNames++;
        seenModuleNames.add(modName);
      }

      if (intent) {
        const moduleCapabilities = asStringArray(mod?.supportsCapabilities);
        const relevantCapabilities = moduleCapabilities.filter(capability => requiredCapabilities.has(capability.toLowerCase()));
        if (relevantCapabilities.length === 0) modulesWithoutIntentSupport++;
        relevantCapabilities.forEach(capability => coveredCapabilities.add(capability.toLowerCase()));
      }

      const lessons = Array.isArray(mod?.lessons) ? mod.lessons : [];
      totalLessons += lessons.length;
      if (lessons.length > CURRICULUM_BUDGET_POLICY.lessonSoftLimits.maxPerModule) issues.push(`Module "${mod?.name || '?'}" exceeds the lesson soft limit of ${CURRICULUM_BUDGET_POLICY.lessonSoftLimits.maxPerModule}.`);

      const modTopicWords = modName.split(/\s+/).filter((w) => w.length > 3);
      const goalWords = String(input?.goal || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const r of Array.isArray(mod?.resources) ? mod.resources : []) {
        const hay = `${String(r?.title || '')} ${String(r?.provider || '')} ${String(r?.description || '')}`.toLowerCase();
        const matchesTopic = modTopicWords.some((w) => hay.includes(w));
        const matchesGoal = goalWords.some((w) => hay.includes(w));
        if (modTopicWords.length && !matchesTopic && !matchesGoal) resourceMismatch++;
      }

      for (const les of lessons) {
        const title = String(les?.name || '').trim().toLowerCase();
        if (title) {
          if (seenLessonTitles.has(title)) duplicateLessonTitles++;
          else if (GENERIC_NAMES.has(title)) genericLessonTitles++;
          seenLessonTitles.add(title);
        }

        const tags = asStringArray(les?.skillTags).filter((t) => !PROHIBITED_SKILL_TAGS.has(t.toLowerCase()));
        if (tags.length === 0) lessonsWithEmptyTags++;

        const objectives = asStringArray(les?.learningObjectives);
        if (objectives.length === 0) emptyObjectives++;
        else if (objectives.every((o) => o.split(/\s+/).length < 3)) weakObjectives++;

        const lesId = String(les?.id || '').trim();
        const lesOrd = lesId ? lessonOrder.get(lesId) : undefined;
        const isFirstOverall = lesOrd === 0;
        const prereqs = asStringArray(les?.prerequisites);
        if (!isFirstOverall && prereqs.length === 0) lessonsMissingPrereqs++;
        for (const pr of prereqs) {
          const prOrd = lessonOrder.get(pr);
          if (prOrd === undefined) brokenPrereqs++;
          else if (lesOrd !== undefined && prOrd >= lesOrd) forwardPrereqs++;
        }

        const em = Number(les?.estimatedMinutes);
        if (!Number.isFinite(em) || em < CURRICULUM_LIMITS.minLessonMinutes || em > CURRICULUM_LIMITS.maxLessonMinutes) unrealisticTime++;
      }
    }
  }

  const projTiers: number[] = [];
  for (const phase of phases) {
    const projs = Array.isArray(phase?.projects) ? phase.projects : [];
    for (const pr of projs) {
      const tier = normalizeProjectTier(pr?.difficulty);
      if (tier) projTiers.push(PROJECT_LADDER_RANK[tier]);
    }
  }
  for (let i = 1; i < projTiers.length; i++) {
    if (projTiers[i] < projTiers[i - 1]) {
      issues.push('Project difficulty does not rise across phases (mini-exercise -> capstone).');
      break;
    }
  }

  for (let i = 1; i < phaseDiffs.length; i++) {
    if ((DIFFICULTY_RANK[phaseDiffs[i]] ?? 0) < (DIFFICULTY_RANK[phaseDiffs[i - 1]] ?? 0)) {
      issues.push('Phase difficulty does not rise monotonically (beginner -> expert).');
      break;
    }
  }

  if (lessonsWithEmptyTags > 0) issues.push(`${lessonsWithEmptyTags} lesson(s) have empty or meaningless skill tags.`);
  if (lessonsMissingPrereqs > 0) issues.push(`${lessonsMissingPrereqs} non-first lesson(s) are missing prerequisites.`);
  if (genericPhaseNames > 0) issues.push(`${genericPhaseNames} phase(s) have generic names.`);
  if (genericModuleNames > 0) issues.push(`${genericModuleNames} module(s) have generic names.`);
  if (duplicateLessonTitles > 0) issues.push(`${duplicateLessonTitles} duplicate lesson title(s).`);
  if (duplicateModuleNames > 0) issues.push(`${duplicateModuleNames} duplicate module name(s).`);
  if (brokenPrereqs > 0) issues.push(`${brokenPrereqs} prerequisite reference(s) point to non-existent lessons.`);
  if (forwardPrereqs > 0) issues.push(`${forwardPrereqs} prerequisite(s) point forward instead of to earlier lessons.`);

  // Cycle detection: build adjacency list and run DFS topological sort.
  // A cycle in prerequisites means the curriculum can never be started.
  const adjList = new Map<string, string[]>();
  for (const [id] of lessonOrder) adjList.set(id, []);
  for (const phase of phases) {
    for (const mod of Array.isArray(phase?.modules) ? phase.modules : []) {
      for (const les of Array.isArray(mod?.lessons) ? mod.lessons : []) {
        const id = String(les?.id || '').trim();
        if (!id) continue;
        for (const pr of asStringArray(les?.prerequisites)) {
          if (adjList.has(pr)) adjList.get(pr)!.push(id);
        }
      }
    }
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  let cycleDetected = false;
  function dfsVisit(node: string): void {
    if (cycleDetected || inStack.has(node)) { cycleDetected = true; return; }
    if (visited.has(node)) return;
    inStack.add(node);
    for (const neighbour of adjList.get(node) ?? []) dfsVisit(neighbour);
    inStack.delete(node);
    visited.add(node);
  }
  for (const [id] of adjList) dfsVisit(id);
  if (cycleDetected) issues.push('Prerequisite graph contains a cycle — the curriculum cannot be started.');
  if (genericLessonTitles > 0) issues.push(`${genericLessonTitles} lesson(s) have generic titles.`);
  if (unrealisticTime > 0) issues.push(`${unrealisticTime} lesson(s) have unrealistic estimatedMinutes (must be ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}).`);
  if (emptyObjectives > 0) issues.push(`${emptyObjectives} lesson(s) have empty learning objectives.`);
  if (weakObjectives > 0) issues.push(`${weakObjectives} lesson(s) have vague, one-word learning objectives.`);
  if (resourceMismatch > 0) issues.push(`${resourceMismatch} resource(s) do not match their module topic or the goal.`);
  if (budget && totalModules > budget.maximumModules) issues.push(`Too many total modules (${totalModules}); budget maximum is ${budget.maximumModules}.`);
  if (modulesWithoutIntentSupport > 0) issues.push(`${modulesWithoutIntentSupport} module(s) do not map to a required outcome capability.`);
  const missingCapabilities = [...requiredCapabilities].filter(capability => !knownCapabilities.has(capability) && !coveredCapabilities.has(capability));
  if (missingCapabilities.length > 0) issues.push(`Required outcome capabilities are not covered: ${missingCapabilities.slice(0, 8).join(', ')}.`);
  if (learnerContext) {
    const hasLearningGaps = learningGaps(learnerContext).length > 0;
    const unnecessaryKnownOnlyModules = phases.flatMap((phase: any) => Array.isArray(phase?.modules) ? phase.modules : [])
      .filter((mod: any) => {
        const mapped = asStringArray(mod?.supportsCapabilities).map(capability => capability.toLowerCase());
        return hasLearningGaps && mapped.length > 0 && mapped.every(capability => knownCapabilities.has(capability));
      }).length;
    if (unnecessaryKnownOnlyModules > 0) issues.push(`${unnecessaryKnownOnlyModules} module(s) focus only on demonstrated capabilities and should be compressed or removed.`);
  }

  const score = Math.max(0, 100 - Math.min(60, issues.length * 6));
  return { ok: issues.length === 0, score, issues };
}

// ---------------------------------------------------------------------------
// Resource normalization
// ---------------------------------------------------------------------------

const RESOURCE_TYPES = ['documentation', 'video', 'practice', 'book'] as const;
const REPUTABLE_PROVIDERS = [
  'official docs', 'documentation', 'mdn', 'freecodecamp', 'the odin project', 'khan academy',
  'coursera', 'edx', 'youtube', 'leetcode', 'hackerrank', 'codewars', 'exercism', 'kaggle',
  'w3schools', 'geeksforgeeks', 'roadmap.sh', 'digitalocean', 'refactoring guru'
];

function inferResourceType(raw: any): (typeof RESOURCE_TYPES)[number] {
  const declared = String(raw?.type || '').toLowerCase();
  if ((RESOURCE_TYPES as readonly string[]).includes(declared)) return declared as (typeof RESOURCE_TYPES)[number];
  const hay = `${String(raw?.title || '')} ${String(raw?.provider || '')} ${String(raw?.url || '')}`.toLowerCase();
  if (/youtube|video|playlist|course|lecture/.test(hay)) return 'video';
  if (/leetcode|hackerrank|codewars|exercism|kaggle|practice|exercise|challenge/.test(hay)) return 'practice';
  if (/book|o'reilly|manning|press|isbn/.test(hay)) return 'book';
  return 'documentation';
}

function cleanProvider(raw: any): string {
  const provider = String(raw?.provider || '').trim();
  if (provider) return provider;
  const url = String(raw?.url || '');
  const host = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i)?.[1];
  return host || 'Official Docs';
}

// Domains that LLMs commonly hallucinate as real resource URLs but are either
// placeholder examples, dead, or fictional. Any URL matching these patterns is
// replaced with the curated MDN search fallback.
const HALLUCINATED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?example\.(com|org|net)/i,
  /^https?:\/\/(www\.)?yoursite\./i,
  /^https?:\/\/(www\.)?website\.(com|org)/i,
  /^https?:\/\/(www\.)?placeholder\./i,
  /^https?:\/\/(www\.)?learnmore\./i,
  /^https?:\/\/(www\.)?samplecourse\./i,
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\.0\.0\.1/i,
  /\/course\/(course-title|course-name|your-course)/i,
  /\/learn\/(topic|subject|skill)-\d+/i,
  // Commonly hallucinated YouTube video IDs that are known-invalid patterns
  /youtube\.com\/watch\?v=XXXXXXXXXXX/i,
  /youtube\.com\/watch\?v=dQw4w9WgXcQ/i, // rickroll placeholder
];

function isHallucinatedUrl(url: string): boolean {
  return HALLUCINATED_URL_PATTERNS.some((re) => re.test(url));
}

export function normalizeResources(
  raw: any[],
  ctx: { phase: number; module: number; moduleName: string; goal: string }
): any[] {
  const seen = new Set<string>();
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r: any, ri: number) => {
      const rawUrl = typeof r.url === 'string' ? r.url.trim() : '';
      const looksLikeUrl = /^https?:\/\//i.test(rawUrl);
      // Reject hallucinated/placeholder URLs in addition to non-URLs.
      const url = looksLikeUrl && !isHallucinatedUrl(rawUrl) ? rawUrl : '';
      const provider = cleanProvider(r);
      // Fallback: search MDN or freeCodeCamp based on topic, never show a dead link.
      const fallbackUrl = `https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(ctx.moduleName || ctx.goal)}`;
      return {
        id: typeof r.id === 'string' ? r.id : `res-${ctx.phase}-${ctx.module}-${ri + 1}`,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : `${ctx.moduleName || 'Topic'} reference`,
        type: inferResourceType(r),
        provider,
        url: url || fallbackUrl,
        description: typeof r.description === 'string' ? r.description.trim() : '',
        reputable: REPUTABLE_PROVIDERS.some((p) => provider.toLowerCase().includes(p))
      };
    })
    .filter((r) => {
      const key = `${r.title.toLowerCase()}|${r.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.reputable) - Number(a.reputable))
    .slice(0, 4)
    .map(({ reputable, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Normalize a full AI-generated curriculum
// ---------------------------------------------------------------------------

export function validateAndNormalizeCurriculum(
  input: any,
  meta: { goal: string; experienceLevel?: string; weeklyHours?: string | number; preferredStyle?: string; college?: string; branch?: string; year?: string; roadmapId?: string },
  budget?: CurriculumBudget
): any {
  const goal = meta.goal || (typeof input.goal === 'string' ? input.goal : 'Learning Goal');
  // Use a caller-supplied roadmapId when available so all child IDs are globally unique
  // across multiple roadmaps for the same user.  Fallback to timestamp for backward compat.
  const roadmapId = meta.roadmapId || `roadmap-${Date.now()}`;

  // Helper: scope a raw AI-supplied short ID (e.g. "ph-1") to this roadmap so two roadmaps
  // never produce the same phase/module/lesson primary key.
  const scope = (rawId: string) =>
    rawId.startsWith(`${roadmapId}-`) ? rawId : `${roadmapId}-${rawId}`;

  let phases = Array.isArray(input.phases) ? input.phases : [];
  if (phases.length > (budget?.maximumPhases ?? CURRICULUM_LIMITS.maxPhases)) phases = phases.slice(0, budget?.maximumPhases ?? CURRICULUM_LIMITS.maxPhases);
  if (budget) {
    let remainingModules = budget.maximumModules;
    phases = phases.map((phase: any) => {
      const modules = Array.isArray(phase?.modules) ? phase.modules : [];
      const kept = modules.slice(0, Math.min(CURRICULUM_LIMITS.maxModulesPerPhase, remainingModules));
      remainingModules -= kept.length;
      return { ...phase, modules: kept };
    }).filter((phase: any) => phase.modules.length > 0);
  }

  const numPhases = Math.max(1, phases.length);
  const phaseDifficulties: Difficulty[] = [];
  for (let i = 0; i < numPhases; i++) {
    const t = i / Math.max(1, numPhases - 1);
    const idx = Math.min(DIFFICULTY_LADDER.length - 1, Math.floor(t * (DIFFICULTY_LADDER.length - 1) + 0.0001));
    phaseDifficulties.push(DIFFICULTY_LADDER[idx]);
  }

  // Pre-scan: build an ordered lesson ID list using SCOPED IDs so prerequisite resolution
  // (which compares IDs from this map) matches the scoped IDs used in the main loop below.
  const orderedLessonIds: string[] = [];
  const lessonIndexById = new Map<string, number>();
  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p] || {};
    const modules = Array.isArray(phase.modules) ? phase.modules.slice(0, CURRICULUM_LIMITS.maxModulesPerPhase) : [];
    for (let m = 0; m < modules.length; m++) {
      const module = modules[m] || {};
      const lessons = Array.isArray(module.lessons) ? module.lessons.slice(0, CURRICULUM_LIMITS.maxLessonsPerModule) : [];
      for (let l = 0; l < lessons.length; l++) {
        const raw = lessons[l] || {};
        const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        const id = scope(rawId);
        if (!lessonIndexById.has(id)) { lessonIndexById.set(id, orderedLessonIds.length); orderedLessonIds.push(id); }
      }
    }
  }

  const normalizedPhases: any[] = [];
  let globalLessonCounter = 0;
  let previousLessonId: string | null = null;

  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p] || {};
    const rawPhaseId = typeof phase.id === 'string' ? phase.id : `ph-${p + 1}`;
    const phaseId = scope(rawPhaseId);
    const phaseDiff = phaseDifficulties[p] || 'beginner';
    const modules = Array.isArray(phase.modules) ? phase.modules.slice(0, CURRICULUM_LIMITS.maxModulesPerPhase) : [];
    const moduleCount = Math.max(1, modules.length);

    const moduleDifficulties: string[] = [];
    for (let i = 0; i < moduleCount; i++) {
      const t = i / Math.max(1, moduleCount - 1);
      const idx = Math.min(LESSON_DIFFICULTIES.length - 1, Math.floor(t * (LESSON_DIFFICULTIES.length - 1) + 0.0001));
      moduleDifficulties.push(LESSON_DIFFICULTIES[idx]);
    }

    const normalizedModules: any[] = [];
    let phaseEstimatedMinutes = 0;
    const phaseSkills = new Set<string>();

    for (let m = 0; m < modules.length; m++) {
      const module = modules[m] || {};
      const rawModuleId = typeof module.id === 'string' ? module.id : `mod-${p + 1}-${m + 1}`;
      const moduleId = scope(rawModuleId);
      const moduleDiff = moduleDifficulties[m] || phaseDiff;
      const lessons = Array.isArray(module.lessons) ? module.lessons.slice(0, CURRICULUM_LIMITS.maxLessonsPerModule) : [];
      const normalizedLessons: any[] = [];

      for (let l = 0; l < lessons.length; l++) {
        const lesson = lessons[l] || {};
        globalLessonCounter++;
        const rawLessonId = typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        const lessonId = scope(rawLessonId);
        const lessonOrd = lessonIndexById.get(lessonId) ?? -1;
        const isFirstOverall = lessonOrd === 0;

        const declaredDiff = String(lesson.difficulty || '').toLowerCase();
        const lessonDiff = (LESSON_DIFFICULTIES as readonly string[]).includes(declaredDiff)
          ? declaredDiff
          : moduleDiff === 'expert' ? 'advanced' : moduleDiff;

        // Prerequisites: the AI sends raw (unscoped) IDs — scope them before lookup so they
        // resolve correctly against the scoped lessonIndexById map.
        let prereqs = asStringArray(lesson.prerequisites).map(scope).filter((id) => {
          const ord = lessonIndexById.get(id);
          return ord !== undefined && ord < lessonOrd;
        });
        if (!isFirstOverall && prereqs.length === 0 && previousLessonId) prereqs = [previousLessonId];

        let skillTags = asStringArray(lesson.skillTags).map((t) => t.toLowerCase()).filter((t) => t && !PROHIBITED_SKILL_TAGS.has(t));
        skillTags = Array.from(new Set(skillTags));
        if (skillTags.length === 0 && typeof lesson.name === 'string') {
          skillTags = lesson.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w: string) => w.length > 3 && !PROHIBITED_SKILL_TAGS.has(w)).slice(0, 3);
        }
        skillTags.forEach((s) => phaseSkills.add(s));

        const lessonName = typeof lesson.name === 'string' && lesson.name.trim() ? lesson.name.trim() : `Lesson ${l + 1}`;
        const objectives = asStringArray(lesson.learningObjectives);
        const estMinutes = clampInt(lesson.estimatedMinutes, CURRICULUM_LIMITS.minLessonMinutes, CURRICULUM_LIMITS.maxLessonMinutes, 20 + ((globalLessonCounter * 5) % 20));
        phaseEstimatedMinutes += estMinutes;

        // Derive XP from estimated study time: ~1 XP per minute, min 15, max 50.
        const derivedXp = Math.min(50, Math.max(15, Math.round(estMinutes)));

        normalizedLessons.push({
          id: lessonId,
          name: lessonName,
          description: typeof lesson.description === 'string' ? lesson.description.trim() : '',
          learningObjectives: objectives.length ? objectives : [`Understand and apply ${lessonName}`],
          prerequisites: prereqs,
          skillTags,
          difficulty: lessonDiff,
          estimatedMinutes: estMinutes,
          type: 'learn',
          status: isFirstOverall ? 'available' : 'locked',
          contentStatus: 'pending',
          xpReward: derivedXp
        });
        previousLessonId = lessonId;
      }

      const normalizedResources = normalizeResources(
        Array.isArray(module.resources) ? module.resources : [],
        { phase: p + 1, module: m + 1, moduleName: typeof module.name === 'string' ? module.name : '', goal }
      );

      const lessonMinutesForModule = normalizedLessons.reduce((a, les) => a + (les.estimatedMinutes || 0), 0);
      const moduleEstimatedHours = clampInt(module.estimatedHours, 3, 8, Math.max(3, Math.min(8, Math.round(lessonMinutesForModule / 60) || 4)));

      normalizedModules.push({
        id: moduleId,
        name: typeof module.name === 'string' && module.name.trim() ? module.name.trim() : `Module ${m + 1}`,
        description: typeof module.description === 'string' ? module.description.trim() : '',
        difficulty: moduleDiff,
        estimatedHours: moduleEstimatedHours,
        lessons: normalizedLessons,
        resources: normalizedResources,
        // Alias — the client Roadmap type uses `levels`, the DB migration accepts both.
        type: moduleDiff,
        status: 'current',
      });
    }

    const rawProjects = Array.isArray(phase.projects) ? phase.projects.slice(0, 3) : [];
    const defaultTier = PROJECT_LADDER[Math.min(PROJECT_LADDER.length - 1, p)];
    const normalizedProjects = rawProjects.map((proj: any, pi: number) => ({
      id: typeof proj.id === 'string' ? scope(proj.id) : scope(`proj-${p + 1}-${pi + 1}`),
      title: typeof proj.title === 'string' && proj.title.trim() ? proj.title.trim() : `${phase.name || `Phase ${p + 1}`} Project`,
      difficulty: normalizeProjectTier(proj.difficulty) || defaultTier,
      description: typeof proj.description === 'string' && proj.description.trim() ? proj.description.trim() : `Apply the skills from ${phase.name || `Phase ${p + 1}`} to build a project for: ${goal}.`,
      techStack: asStringArray(proj.techStack),
      features: asStringArray(proj.features),
      progress: 0
    }));

    const phaseEstimatedHours = clampInt(phase.estimatedHours, 10, 30, Math.max(10, Math.min(30, normalizedModules.reduce((a, mod) => a + (mod.estimatedHours || 0), 0))));

    normalizedPhases.push({
      id: phaseId,
      name: typeof phase.name === 'string' && phase.name.trim() ? phase.name.trim() : `Phase ${p + 1}`,
      description: typeof phase.description === 'string' ? phase.description.trim() : '',
      estimatedHours: phaseEstimatedHours,
      difficulty: phaseDiff,
      skillsCovered: phaseSkills.size ? Array.from(phaseSkills) : asStringArray(phase.skillsCovered),
      // Use `levels` — the client Roadmap type and all UI components expect this key.
      // Keep `modules` as an alias so the DB migration (which accepts both) still works.
      levels: normalizedModules,
      modules: normalizedModules,
      projects: normalizedProjects,
      progress: 0,
      xpEarned: 0,
      status: 'current',
    });
  }

  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of normalizedPhases) {
    projects.push(...phase.projects);
    for (const module of phase.levels) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) for (const tag of les.skillTags) allSkillTags.add(tag);
      for (const r of module.resources) resources.push({ ...r, phaseId: phase.id, moduleId: module.id,
        id: r.id ? scope(r.id) : r.id });
    }
  }

  return {
    id: roadmapId,
    title: typeof input.title === 'string' ? input.title : goal,
    goal,
    experienceLevel: meta.experienceLevel || 'Beginner',
    weeklyHours: Number(meta.weeklyHours) || 5,
    preferredStyle: meta.preferredStyle || 'Hands-on',
    college: meta.college || null,
    branch: meta.branch || null,
    year: meta.year || null,
    progressPercent: 0,
    totalXp: 0,
    lessonsCompleted: 0,
    hoursRemaining: normalizedPhases.reduce((a, p) => a + (p.estimatedHours || 0), 0),
    status: 'current',
    createdAt: new Date().toISOString(),
    metadata: {
      totalPhases: normalizedPhases.length,
      totalModules: normalizedPhases.reduce((a, p) => a + p.modules.length, 0),
      totalLessons,
      skillTags: Array.from(allSkillTags),
      schemaVersion: 2
    },
    phases: normalizedPhases,
    resources,
    projects
  };
}

// ---------------------------------------------------------------------------
// Offline fallback curriculum
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Real fallback resource URLs keyed by goal keyword.
// Used when AI generation fails so users never see example.com dead links.
// ---------------------------------------------------------------------------
const FALLBACK_RESOURCE_MAP: Record<string, { doc: string; docProvider: string; video: string; videoProvider: string; practice: string; practiceProvider: string }> = {
  python:     { doc: 'https://docs.python.org/3/tutorial/', docProvider: 'Python Docs', video: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc', videoProvider: 'Programming with Mosh', practice: 'https://www.hackerrank.com/domains/python', practiceProvider: 'HackerRank' },
  javascript: { doc: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', docProvider: 'MDN Web Docs', video: 'https://www.youtube.com/watch?v=W6NZfCO5SIk', videoProvider: 'Programming with Mosh', practice: 'https://www.hackerrank.com/domains/tutorials/10-days-of-javascript', practiceProvider: 'HackerRank' },
  web:        { doc: 'https://developer.mozilla.org/en-US/docs/Learn', docProvider: 'MDN Web Docs', video: 'https://www.youtube.com/watch?v=UB1O30fR-EE', videoProvider: 'Traversy Media', practice: 'https://www.freecodecamp.org/learn/responsive-web-design/', practiceProvider: 'freeCodeCamp' },
  react:      { doc: 'https://react.dev/learn', docProvider: 'React Docs', video: 'https://www.youtube.com/watch?v=SqcY0GlETPk', videoProvider: 'Programming with Mosh', practice: 'https://www.freecodecamp.org/learn/front-end-development-libraries/', practiceProvider: 'freeCodeCamp' },
  node:       { doc: 'https://nodejs.org/en/docs/guides/', docProvider: 'Node.js Docs', video: 'https://www.youtube.com/watch?v=TlB_eWDSMt4', videoProvider: 'Programming with Mosh', practice: 'https://www.hackerrank.com/domains/tutorials/10-days-of-javascript', practiceProvider: 'HackerRank' },
  java:       { doc: 'https://docs.oracle.com/javase/tutorial/', docProvider: 'Oracle Java Tutorials', video: 'https://www.youtube.com/watch?v=eIrMbAQSU34', videoProvider: 'Programming with Mosh', practice: 'https://www.hackerrank.com/domains/java', practiceProvider: 'HackerRank' },
  sql:        { doc: 'https://www.w3schools.com/sql/', docProvider: 'W3Schools SQL', video: 'https://www.youtube.com/watch?v=7S_tz1z_5bA', videoProvider: 'Programming with Mosh', practice: 'https://sqlzoo.net/', practiceProvider: 'SQLZoo' },
  data:       { doc: 'https://pandas.pydata.org/docs/getting_started/index.html', docProvider: 'Pandas Docs', video: 'https://www.youtube.com/watch?v=vmEHCJofslg', videoProvider: 'Keith Galli', practice: 'https://www.kaggle.com/learn', practiceProvider: 'Kaggle Learn' },
  machine:    { doc: 'https://scikit-learn.org/stable/getting_started.html', docProvider: 'scikit-learn Docs', video: 'https://www.youtube.com/watch?v=NWONeJKn6kc', videoProvider: 'StatQuest', practice: 'https://www.kaggle.com/learn/intro-to-machine-learning', practiceProvider: 'Kaggle Learn' },
  ai:         { doc: 'https://huggingface.co/learn/nlp-course/chapter1/1', docProvider: 'HuggingFace NLP Course', video: 'https://www.youtube.com/watch?v=aircAruvnKk', videoProvider: '3Blue1Brown', practice: 'https://www.kaggle.com/learn/intro-to-machine-learning', practiceProvider: 'Kaggle Learn' },
  design:     { doc: 'https://www.figma.com/resources/learn-design/', docProvider: 'Figma Learn', video: 'https://www.youtube.com/watch?v=FTFaQWZBqQ8', videoProvider: 'Flux Academy', practice: 'https://www.freecodecamp.org/learn/responsive-web-design/', practiceProvider: 'freeCodeCamp' },
  devops:     { doc: 'https://docs.docker.com/get-started/', docProvider: 'Docker Docs', video: 'https://www.youtube.com/watch?v=fqMOX6JJhGo', videoProvider: 'TechWorld with Nana', practice: 'https://labs.play-with-docker.com/', practiceProvider: 'Play with Docker' },
  cpp:        { doc: 'https://cppreference.com/', docProvider: 'cppreference.com', video: 'https://www.youtube.com/watch?v=vLnPwxZdW4Y', videoProvider: 'freeCodeCamp', practice: 'https://www.hackerrank.com/domains/cpp', practiceProvider: 'HackerRank' },
};

const FALLBACK_RESOURCE_DEFAULT = { doc: 'https://developer.mozilla.org/en-US/', docProvider: 'MDN Web Docs', video: 'https://www.youtube.com/@freecodecamp', videoProvider: 'freeCodeCamp YouTube', practice: 'https://www.theodinproject.com/', practiceProvider: 'The Odin Project' };

function getFallbackResources(goal: string, theme: string, pIdx: number, mIdx: number): Array<{ id: string; title: string; type: string; provider: string; url: string; description: string }> {
  const key = Object.keys(FALLBACK_RESOURCE_MAP).find(k => goal.toLowerCase().includes(k) || theme.toLowerCase().includes(k));
  const r = key ? FALLBACK_RESOURCE_MAP[key] : FALLBACK_RESOURCE_DEFAULT;
  return [
    { id: `res-${pIdx + 1}-${mIdx + 1}-1`, title: `${theme} — Official Documentation`, type: 'documentation', provider: r.docProvider, url: r.doc, description: `Authoritative reference for ${theme}.` },
    { id: `res-${pIdx + 1}-${mIdx + 1}-2`, title: `${theme} — Video Course`, type: 'video', provider: r.videoProvider, url: r.video, description: `Structured video walkthrough covering ${theme}.` },
    { id: `res-${pIdx + 1}-${mIdx + 1}-3`, title: `${theme} — Practice Exercises`, type: 'practice', provider: r.practiceProvider, url: r.practice, description: `Hands-on exercises to reinforce ${theme}.` },
  ];
}

// ---------------------------------------------------------------------------
// Domain detection helpers for goal-aware fallback
// ---------------------------------------------------------------------------

type DomainPlan = {
  phases: Array<{
    name: string;
    description: string;
    difficulty: Difficulty;
    moduleThemes: string[];
    projectTitle: string;
    projectTech: string[];
    skillTags: string[];
  }>;
};

/** Detect the primary technical domain from the goal string. */
function detectGoalDomain(goal: string): string {
  const g = goal.toLowerCase();
  if (/machine.?learn|ml\b|deep.?learn|neural|tensorflow|pytorch|scikit|sklearn/.test(g)) return 'ml';
  if (/data.?sci|data.?analy|pandas|numpy|matplotlib|seaborn|visualization/.test(g)) return 'data-science';
  if (/large.?lang|llm|gpt|chatgpt|langchain|rag|vector.?db|embedding|genai|generative.?ai/.test(g)) return 'llm';
  if (/react\b|next\.?js|vue|svelte|frontend|front.?end|ui\b|tailwind|css\b/.test(g)) return 'frontend';
  if (/node\.?js|express|fastapi|django|flask|spring|backend|back.?end|rest.?api|graphql/.test(g)) return 'backend';
  if (/full.?stack|mern|mean|fullstack/.test(g)) return 'fullstack';
  if (/devops|docker|kubernetes|k8s|ci.?cd|terraform|ansible|aws|gcp|azure|cloud/.test(g)) return 'devops';
  if (/android|ios|swift|kotlin|flutter|react.?native|mobile/.test(g)) return 'mobile';
  if (/dsa|data.?struct|algorithm|leetcode|competitive|system.?design/.test(g)) return 'dsa';
  if (/python\b/.test(g)) return 'python';
  if (/javascript|typescript|js\b|ts\b/.test(g)) return 'javascript';
  if (/java\b/.test(g)) return 'java';
  if (/c\+\+|cpp|competitive\s+c/.test(g)) return 'cpp';
  if (/sql|database|postgres|mysql|mongodb|nosql/.test(g)) return 'database';
  if (/cyber.?sec|security|hacking|pentest|ctf/.test(g)) return 'security';
  if (/blockchain|solidity|web3|smart.?contract/.test(g)) return 'blockchain';
  return 'software'; // generic software engineering fallback
}

/** Return a domain-specific 6-phase plan with concrete names and tech stacks. */
function getDomainPhasePlan(domain: string, goal: string, goalTitle: string): DomainPlan['phases'] {
  const plans: Record<string, DomainPlan['phases']> = {
    ml: [
      { name: 'Python & Math Foundations for ML', description: `Set up Python, NumPy, and the linear algebra / statistics that underpin every ML algorithm.`, difficulty: 'beginner', moduleThemes: ['Python for Data Science', 'Linear Algebra with NumPy', 'Statistics & Probability', 'Pandas Data Wrangling'], projectTitle: 'Exploratory Data Analysis: Real Dataset Report', projectTech: ['Python', 'NumPy', 'Pandas', 'Matplotlib'], skillTags: ['python', 'numpy', 'pandas', 'statistics'] },
      { name: 'Core Machine Learning Algorithms', description: 'Implement and evaluate supervised and unsupervised algorithms using scikit-learn.', difficulty: 'beginner', moduleThemes: ['Supervised Learning: Regression', 'Supervised Learning: Classification', 'Unsupervised Clustering', 'Model Evaluation & Cross-Validation'], projectTitle: 'Classification Pipeline: Iris / Titanic Dataset', projectTech: ['scikit-learn', 'Pandas', 'Matplotlib'], skillTags: ['scikit-learn', 'classification', 'regression', 'cross-validation'] },
      { name: 'Neural Networks & Deep Learning', description: 'Build neural networks from scratch, then use PyTorch to train CNNs and RNNs.', difficulty: 'intermediate', moduleThemes: ['Backpropagation & Gradient Descent', 'PyTorch Tensors & Autograd', 'Convolutional Neural Networks', 'Sequence Models & RNNs'], projectTitle: 'Image Classifier: CIFAR-10 with CNN', projectTech: ['PyTorch', 'torchvision', 'CUDA'], skillTags: ['pytorch', 'cnn', 'backpropagation', 'deep-learning'] },
      { name: 'Applied ML: NLP & Computer Vision', description: 'Apply deep learning to text and image problems using HuggingFace and transfer learning.', difficulty: 'intermediate', moduleThemes: ['Text Preprocessing & Embeddings', 'Transfer Learning with HuggingFace', 'Object Detection & Segmentation', 'Fine-Tuning Pretrained Models'], projectTitle: 'Sentiment Classifier with BERT Fine-Tuning', projectTech: ['HuggingFace Transformers', 'PyTorch', 'tokenizers'], skillTags: ['nlp', 'transformers', 'fine-tuning', 'huggingface'] },
      { name: 'MLOps & Production Systems', description: 'Deploy, monitor, and maintain ML models in production with best engineering practices.', difficulty: 'advanced', moduleThemes: ['Model Serialization & APIs', 'Experiment Tracking with MLflow', 'Docker & CI for ML Pipelines', 'Model Monitoring & Data Drift'], projectTitle: 'End-to-End ML API with FastAPI + Docker', projectTech: ['FastAPI', 'Docker', 'MLflow', 'Prometheus'], skillTags: ['mlops', 'docker', 'fastapi', 'mlflow'] },
      { name: 'Capstone: Real-World ML Project', description: 'Design, train, and ship a complete ML system for a real problem, with full documentation.', difficulty: 'expert', moduleThemes: ['Problem Framing & Dataset Curation', 'Model Architecture Design', 'Hyperparameter Tuning at Scale', 'Production Deployment & Monitoring'], projectTitle: 'Capstone: End-to-End ML Product', projectTech: ['PyTorch', 'FastAPI', 'Docker', 'Cloud (GCP/AWS)'], skillTags: ['system-design', 'ml-engineering', 'deployment', 'research'] },
    ],
    'data-science': [
      { name: 'Python for Data Analysis', description: 'Master Python, Pandas, and NumPy for cleaning, transforming, and exploring datasets.', difficulty: 'beginner', moduleThemes: ['Python Data Types & Control Flow', 'NumPy Arrays & Broadcasting', 'Pandas DataFrames', 'Data Cleaning & Missing Values'], projectTitle: 'Dataset Audit: Clean & Profile a Raw CSV', projectTech: ['Python', 'Pandas', 'NumPy'], skillTags: ['python', 'pandas', 'numpy', 'data-cleaning'] },
      { name: 'Statistics & Exploratory Analysis', description: 'Apply statistical thinking to find patterns, test hypotheses, and validate findings.', difficulty: 'beginner', moduleThemes: ['Descriptive Statistics', 'Distributions & Hypothesis Testing', 'Correlation & Causation', 'EDA with Seaborn'], projectTitle: 'EDA Report: Business Dataset Deep-Dive', projectTech: ['Seaborn', 'SciPy', 'Pandas'], skillTags: ['statistics', 'eda', 'seaborn', 'hypothesis-testing'] },
      { name: 'Data Visualization & Storytelling', description: 'Build compelling, accurate visualizations that communicate insights to stakeholders.', difficulty: 'intermediate', moduleThemes: ['Matplotlib Internals', 'Plotly Interactive Charts', 'Dashboard Design Principles', 'Communicating with Data'], projectTitle: 'Interactive Dashboard with Plotly Dash', projectTech: ['Plotly', 'Dash', 'Pandas'], skillTags: ['plotly', 'visualization', 'dashboards', 'storytelling'] },
      { name: 'SQL & Database Querying', description: 'Query, aggregate, and join relational data from databases with confidence.', difficulty: 'intermediate', moduleThemes: ['SQL SELECT, WHERE, JOIN', 'Window Functions & CTEs', 'Query Optimization', 'Python + PostgreSQL with psycopg2'], projectTitle: 'SQL Analytics Report on Business Database', projectTech: ['PostgreSQL', 'psycopg2', 'DBeaver'], skillTags: ['sql', 'postgresql', 'window-functions', 'database'] },
      { name: 'Machine Learning for Data Scientists', description: 'Apply ML models to real datasets and communicate results in business terms.', difficulty: 'advanced', moduleThemes: ['Regression & Classification with scikit-learn', 'Feature Engineering', 'Model Selection & Pipeline', 'Business Metrics & Model Evaluation'], projectTitle: 'Predictive Model: Customer Churn Analysis', projectTech: ['scikit-learn', 'XGBoost', 'SHAP'], skillTags: ['scikit-learn', 'feature-engineering', 'xgboost', 'model-evaluation'] },
      { name: 'Capstone: Full Data Science Project', description: 'Scope, execute, and present a full end-to-end data science project on a real business problem.', difficulty: 'expert', moduleThemes: ['Problem Definition & Scope', 'Data Pipeline Architecture', 'Model Deployment & APIs', 'Stakeholder Presentation'], projectTitle: 'Capstone: Data Science Portfolio Project', projectTech: ['FastAPI', 'Docker', 'PostgreSQL', 'Streamlit'], skillTags: ['data-pipeline', 'deployment', 'presentation', 'portfolio'] },
    ],
    llm: [
      { name: 'Python & NLP Foundations', description: 'Build the Python and text-processing skills required for modern LLM work.', difficulty: 'beginner', moduleThemes: ['Python for NLP', 'Text Tokenization & Preprocessing', 'Word Embeddings (Word2Vec, GloVe)', 'Attention Mechanism Intuition'], projectTitle: 'Text Classifier with TF-IDF + Logistic Regression', projectTech: ['Python', 'NLTK', 'scikit-learn'], skillTags: ['python', 'nlp', 'tokenization', 'embeddings'] },
      { name: 'Transformers & HuggingFace', description: 'Understand the Transformer architecture and use HuggingFace to fine-tune and run models.', difficulty: 'beginner', moduleThemes: ['Transformer Architecture Deep Dive', 'HuggingFace Pipelines & Tokenizers', 'Fine-Tuning BERT for Classification', 'Model Hub & Deployment'], projectTitle: 'Fine-Tuned Sentiment Classifier on HuggingFace Hub', projectTech: ['HuggingFace Transformers', 'PyTorch', 'Datasets'], skillTags: ['transformers', 'bert', 'fine-tuning', 'huggingface'] },
      { name: 'Prompt Engineering & LLM APIs', description: 'Design effective prompts, chain calls, and use OpenAI / Gemini APIs for real applications.', difficulty: 'intermediate', moduleThemes: ['Prompt Design Principles', 'Few-Shot & Chain-of-Thought Prompting', 'OpenAI & Gemini API Integration', 'Output Parsing & Structured Responses'], projectTitle: 'AI-Powered Document Summarizer with GPT-4', projectTech: ['OpenAI API', 'Python', 'Pydantic'], skillTags: ['prompt-engineering', 'openai', 'gpt', 'structured-output'] },
      { name: 'RAG — Retrieval-Augmented Generation', description: 'Build RAG pipelines that ground LLMs in your own documents using vector databases.', difficulty: 'intermediate', moduleThemes: ['Vector Embeddings & Semantic Search', 'Vector Databases (Pinecone / ChromaDB)', 'RAG Pipeline Architecture', 'Evaluation & Hallucination Reduction'], projectTitle: 'Document Q&A System with RAG + ChromaDB', projectTech: ['LangChain', 'ChromaDB', 'OpenAI', 'FastAPI'], skillTags: ['rag', 'vector-db', 'langchain', 'chromadb'] },
      { name: 'LLM Agents & Tool Use', description: 'Build autonomous agents that plan, use tools, and execute multi-step tasks.', difficulty: 'advanced', moduleThemes: ['ReAct & Agent Frameworks', 'Tool Calling & Function Calling', 'LangChain Agents & LangGraph', 'Multi-Agent Orchestration'], projectTitle: 'Autonomous Research Agent with Tool Calling', projectTech: ['LangChain', 'LangGraph', 'OpenAI', 'Python'], skillTags: ['agents', 'tool-calling', 'langgraph', 'orchestration'] },
      { name: 'Capstone: Production LLM Application', description: 'Ship a complete LLM-powered product with evaluation, monitoring, and CI/CD.', difficulty: 'expert', moduleThemes: ['LLM Application Architecture', 'Evaluation & LLM Testing (LangSmith)', 'Deployment with FastAPI + Docker', 'Cost & Latency Optimization'], projectTitle: 'Capstone: Production LLM SaaS Application', projectTech: ['FastAPI', 'Docker', 'LangSmith', 'OpenAI'], skillTags: ['llm-ops', 'evaluation', 'deployment', 'optimization'] },
    ],
    frontend: [
      { name: 'HTML, CSS & JavaScript Fundamentals', description: 'Build a solid foundation in the three core languages of the web.', difficulty: 'beginner', moduleThemes: ['HTML Semantics & Accessibility', 'CSS Layout: Flexbox & Grid', 'JavaScript ES6+ Essentials', 'DOM Manipulation & Events'], projectTitle: 'Portfolio Landing Page (HTML + CSS)', projectTech: ['HTML5', 'CSS3', 'JavaScript'], skillTags: ['html', 'css', 'javascript', 'dom'] },
      { name: 'React Fundamentals', description: 'Learn component-based UI development with React hooks and state management.', difficulty: 'beginner', moduleThemes: ['JSX & Component Architecture', 'useState & useEffect Hooks', 'Props, Context & Lifting State', 'React Router & Navigation'], projectTitle: 'Weather App with React + Public API', projectTech: ['React', 'Vite', 'CSS Modules'], skillTags: ['react', 'hooks', 'jsx', 'state-management'] },
      { name: 'Advanced React & State Management', description: 'Master performance patterns, global state, and advanced React APIs.', difficulty: 'intermediate', moduleThemes: ['useMemo, useCallback & Memoization', 'Zustand / Redux Toolkit', 'Custom Hooks & Code Sharing', 'React Query & Data Fetching'], projectTitle: 'E-commerce Product Listing with Cart (Zustand)', projectTech: ['React', 'Zustand', 'React Query', 'Tailwind CSS'], skillTags: ['zustand', 'react-query', 'memoization', 'custom-hooks'] },
      { name: 'TypeScript & Testing', description: 'Add type safety with TypeScript and ship confidence with automated tests.', difficulty: 'intermediate', moduleThemes: ['TypeScript Generics & Utility Types', 'Typed React Components & Hooks', 'Unit Testing with Vitest', 'Integration Testing with Testing Library'], projectTitle: 'Fully-Typed React Dashboard with Tests', projectTech: ['TypeScript', 'Vitest', 'Testing Library'], skillTags: ['typescript', 'vitest', 'testing', 'generics'] },
      { name: 'Next.js & Full-Stack React', description: 'Build server-rendered, SEO-friendly React apps with Next.js App Router.', difficulty: 'advanced', moduleThemes: ['Next.js App Router & RSC', 'Server Actions & API Routes', 'Authentication with NextAuth.js', 'Deployment on Vercel'], projectTitle: 'Full-Stack Blog with Next.js + PostgreSQL', projectTech: ['Next.js', 'NextAuth.js', 'PostgreSQL', 'Vercel'], skillTags: ['nextjs', 'rsc', 'nextauth', 'vercel'] },
      { name: 'Capstone: Production-Grade Frontend App', description: 'Design and ship a complete, performant, accessible frontend application.', difficulty: 'expert', moduleThemes: ['Performance Auditing & Core Web Vitals', 'Accessibility (WCAG) Testing', 'CI/CD with GitHub Actions', 'Micro-frontends & Monorepos'], projectTitle: 'Capstone: Full-Featured SaaS Frontend', projectTech: ['Next.js', 'TypeScript', 'Storybook', 'Vercel'], skillTags: ['performance', 'accessibility', 'ci-cd', 'monorepo'] },
    ],
    backend: [
      { name: 'HTTP, APIs & Server Fundamentals', description: 'Understand how the web works and build your first REST APIs.', difficulty: 'beginner', moduleThemes: ['HTTP Methods, Status Codes & Headers', 'REST API Design Principles', 'Node.js + Express Basics', 'JSON & Request/Response Cycle'], projectTitle: 'REST API: Todo CRUD with Express', projectTech: ['Node.js', 'Express', 'Postman'], skillTags: ['http', 'rest', 'express', 'node'] },
      { name: 'Databases & Data Modelling', description: 'Design schemas and write queries for both relational and document databases.', difficulty: 'beginner', moduleThemes: ['SQL: Tables, Joins & Indexes', 'PostgreSQL with Prisma ORM', 'MongoDB & Mongoose', 'Database Schema Design'], projectTitle: 'User Authentication API with PostgreSQL + Prisma', projectTech: ['PostgreSQL', 'Prisma', 'Node.js'], skillTags: ['postgresql', 'prisma', 'mongodb', 'schema-design'] },
      { name: 'Authentication & Security', description: 'Implement secure auth flows and protect APIs from common attacks.', difficulty: 'intermediate', moduleThemes: ['JWT & Session Authentication', 'OAuth 2.0 & Social Login', 'Rate Limiting & Input Validation', 'OWASP Top 10 for APIs'], projectTitle: 'Secure Auth System: JWT + Refresh Tokens', projectTech: ['Node.js', 'jsonwebtoken', 'bcrypt', 'express-rate-limit'], skillTags: ['jwt', 'oauth', 'security', 'rate-limiting'] },
      { name: 'Scalability & Distributed Systems', description: 'Design backends that handle load, failures, and horizontal scaling.', difficulty: 'intermediate', moduleThemes: ['Caching with Redis', 'Message Queues with BullMQ', 'Horizontal Scaling & Load Balancers', 'WebSockets & Real-Time APIs'], projectTitle: 'Real-Time Chat API with Redis + WebSockets', projectTech: ['Redis', 'BullMQ', 'Socket.io', 'Node.js'], skillTags: ['redis', 'queues', 'websockets', 'scaling'] },
      { name: 'Microservices & DevOps', description: 'Break monoliths into services and automate deployment pipelines.', difficulty: 'advanced', moduleThemes: ['Microservice Architecture Patterns', 'Docker & Docker Compose', 'Kubernetes Basics', 'CI/CD with GitHub Actions'], projectTitle: 'Microservices App Deployed with Docker Compose', projectTech: ['Docker', 'Docker Compose', 'GitHub Actions'], skillTags: ['microservices', 'docker', 'kubernetes', 'ci-cd'] },
      { name: 'Capstone: Production Backend System', description: 'Architect and deploy a production-grade backend service from scratch.', difficulty: 'expert', moduleThemes: ['System Design for Scale', 'Observability: Logs, Metrics, Traces', 'Database Performance Tuning', 'API Gateway & Service Mesh'], projectTitle: 'Capstone: Production Backend API Platform', projectTech: ['Node.js', 'PostgreSQL', 'Redis', 'Kubernetes'], skillTags: ['system-design', 'observability', 'performance', 'api-gateway'] },
    ],
    fullstack: [
      { name: 'Web Fundamentals: HTML, CSS & JavaScript', description: 'Master the building blocks of every web application.', difficulty: 'beginner', moduleThemes: ['HTML5 Semantics & Forms', 'CSS Flexbox, Grid & Responsive Design', 'JavaScript ES6+: Arrays, Promises, Async', 'Git & Version Control Workflow'], projectTitle: 'Responsive Personal Portfolio Site', projectTech: ['HTML', 'CSS', 'JavaScript', 'Git'], skillTags: ['html', 'css', 'javascript', 'git'] },
      { name: 'React Frontend Development', description: 'Build modern, component-driven UIs with React.', difficulty: 'beginner', moduleThemes: ['React Components & JSX', 'Hooks: useState, useEffect, useContext', 'API Calls with Fetch & Axios', 'React Router v6'], projectTitle: 'Movie Browser App: React + TMDB API', projectTech: ['React', 'Vite', 'Axios', 'React Router'], skillTags: ['react', 'hooks', 'axios', 'routing'] },
      { name: 'Node.js & Express Backend', description: 'Build REST APIs, connect to databases, and handle auth.', difficulty: 'intermediate', moduleThemes: ['Node.js & Express REST API', 'PostgreSQL with Prisma', 'JWT Authentication', 'Input Validation & Error Handling'], projectTitle: 'Full-Stack Blog: React Frontend + Express API', projectTech: ['Node.js', 'Express', 'PostgreSQL', 'Prisma'], skillTags: ['nodejs', 'express', 'prisma', 'jwt'] },
      { name: 'TypeScript, Testing & Advanced React', description: 'Harden the codebase with types and tests.', difficulty: 'intermediate', moduleThemes: ['TypeScript in React & Node', 'React Query for Server State', 'Unit & Integration Testing', 'State Management with Zustand'], projectTitle: 'TypeScript Task Manager with Tests', projectTech: ['TypeScript', 'Zustand', 'Vitest', 'React Query'], skillTags: ['typescript', 'react-query', 'zustand', 'testing'] },
      { name: 'Next.js, DevOps & Deployment', description: 'Ship full-stack apps with SSR, CI/CD, and cloud infrastructure.', difficulty: 'advanced', moduleThemes: ['Next.js App Router & Server Actions', 'Docker & GitHub Actions CI/CD', 'Cloud Deployment (Vercel / Railway)', 'Performance & Security Hardening'], projectTitle: 'Full-Stack SaaS App with Next.js + Auth', projectTech: ['Next.js', 'Docker', 'PostgreSQL', 'Vercel'], skillTags: ['nextjs', 'docker', 'ci-cd', 'deployment'] },
      { name: 'Capstone: Full-Stack Product', description: 'Build a complete, shippable web product with real users in mind.', difficulty: 'expert', moduleThemes: ['System Architecture & Database Design', 'Real-Time Features & WebSockets', 'Monitoring & Error Tracking', 'Launch Checklist & SEO'], projectTitle: 'Capstone: Full-Stack SaaS Product Launch', projectTech: ['Next.js', 'PostgreSQL', 'Redis', 'Vercel'], skillTags: ['architecture', 'real-time', 'monitoring', 'seo'] },
    ],
    devops: [
      { name: 'Linux & Shell Scripting', description: 'Get comfortable with the Linux command line and Bash automation.', difficulty: 'beginner', moduleThemes: ['Linux File System & Permissions', 'Bash Scripting & Cron Jobs', 'SSH & Remote Server Management', 'Networking Fundamentals for DevOps'], projectTitle: 'Automated Server Setup Script with Bash', projectTech: ['Bash', 'Linux', 'SSH', 'cron'], skillTags: ['linux', 'bash', 'ssh', 'networking'] },
      { name: 'Docker & Containerization', description: 'Package applications into reproducible containers and orchestrate with Compose.', difficulty: 'beginner', moduleThemes: ['Docker Images & Containers', 'Writing Dockerfiles', 'Docker Compose Multi-Service Apps', 'Docker Volumes & Networks'], projectTitle: 'Containerized Full-Stack App with Docker Compose', projectTech: ['Docker', 'Docker Compose', 'Nginx'], skillTags: ['docker', 'containers', 'dockerfile', 'compose'] },
      { name: 'CI/CD & Automation', description: 'Automate testing and deployment with modern CI/CD pipelines.', difficulty: 'intermediate', moduleThemes: ['GitHub Actions Workflows', 'Automated Testing in Pipelines', 'Semantic Versioning & Release Management', 'Artifact Registry & Image Push'], projectTitle: 'CI/CD Pipeline: Test, Build, Push to Registry', projectTech: ['GitHub Actions', 'Docker Hub', 'Jest'], skillTags: ['ci-cd', 'github-actions', 'automation', 'release-management'] },
      { name: 'Kubernetes & Orchestration', description: 'Deploy and manage containerized apps at scale with Kubernetes.', difficulty: 'intermediate', moduleThemes: ['Kubernetes Architecture & Objects', 'Deployments, Services & Ingress', 'ConfigMaps, Secrets & RBAC', 'Helm Charts for Package Management'], projectTitle: 'Kubernetes Deployment: Microservice App on minikube', projectTech: ['Kubernetes', 'Helm', 'kubectl', 'minikube'], skillTags: ['kubernetes', 'helm', 'ingress', 'rbac'] },
      { name: 'Infrastructure as Code & Cloud', description: 'Provision and manage cloud infrastructure reproducibly with Terraform.', difficulty: 'advanced', moduleThemes: ['Terraform Core: Providers, Resources, State', 'AWS/GCP Infrastructure Provisioning', 'Ansible for Configuration Management', 'Cost Optimization & Tagging'], projectTitle: 'Terraform-Provisioned Cloud Infra on AWS', projectTech: ['Terraform', 'AWS', 'Ansible'], skillTags: ['terraform', 'aws', 'iac', 'ansible'] },
      { name: 'Capstone: Production DevOps Platform', description: 'Design and implement a complete DevOps platform for a real application.', difficulty: 'expert', moduleThemes: ['Observability: Prometheus, Grafana, Loki', 'GitOps with ArgoCD', 'Security Scanning in CI', 'Disaster Recovery Planning'], projectTitle: 'Capstone: Full DevOps Platform with Observability', projectTech: ['Kubernetes', 'Prometheus', 'Grafana', 'ArgoCD'], skillTags: ['observability', 'gitops', 'security', 'disaster-recovery'] },
    ],
    dsa: [
      { name: 'Programming Fundamentals & Complexity', description: 'Build problem-solving instincts and understand Big-O analysis.', difficulty: 'beginner', moduleThemes: ['Time & Space Complexity (Big-O)', 'Arrays & Strings', 'Recursion & Call Stack', 'Two Pointers & Sliding Window'], projectTitle: 'LeetCode Easy Set: Arrays & Strings (15 problems)', projectTech: ['Python', 'C++', 'LeetCode'], skillTags: ['big-o', 'arrays', 'recursion', 'two-pointers'] },
      { name: 'Core Data Structures', description: 'Implement and use stacks, queues, linked lists, trees, and hash maps.', difficulty: 'beginner', moduleThemes: ['Stacks & Queues', 'Linked Lists', 'Binary Trees & BSTs', 'Hash Maps & Sets'], projectTitle: 'Data Structures Library: Implement from Scratch', projectTech: ['Python', 'C++'], skillTags: ['stacks', 'linked-lists', 'trees', 'hash-maps'] },
      { name: 'Sorting, Searching & Divide-and-Conquer', description: 'Master the classic algorithmic strategies that appear in 60% of coding interviews.', difficulty: 'intermediate', moduleThemes: ['Merge Sort & Quick Sort', 'Binary Search & Variants', 'Divide & Conquer Patterns', 'LeetCode Medium: Sorting Problems'], projectTitle: '10 Binary Search Problems on LeetCode', projectTech: ['Python', 'LeetCode'], skillTags: ['sorting', 'binary-search', 'divide-conquer', 'algorithms'] },
      { name: 'Dynamic Programming & Greedy', description: 'Solve optimization problems with DP memoization, tabulation, and greedy strategies.', difficulty: 'intermediate', moduleThemes: ['1D Dynamic Programming', '2D DP: Grid & String Problems', 'Greedy Algorithms', 'Classic DP Problems (Knapsack, LCS, Coin Change)'], projectTitle: '15 DP Problems: Memoization to Tabulation', projectTech: ['Python', 'LeetCode'], skillTags: ['dynamic-programming', 'memoization', 'greedy', 'knapsack'] },
      { name: 'Graphs, Trees & Advanced Algorithms', description: 'Master graph traversal, shortest paths, and advanced tree algorithms.', difficulty: 'advanced', moduleThemes: ['Graph BFS & DFS', 'Dijkstra & Bellman-Ford', 'Topological Sort & Union Find', 'Segment Trees & Fenwick Trees'], projectTitle: '10 Graph Problems: BFS + DFS + Dijkstra', projectTech: ['Python', 'LeetCode'], skillTags: ['graphs', 'bfs', 'dijkstra', 'union-find'] },
      { name: 'System Design & Interview Preparation', description: 'Design scalable systems and practice full interview loops for top tech companies.', difficulty: 'expert', moduleThemes: ['System Design: Scalability Patterns', 'Designing Distributed Systems', 'Behavioral Interview Frameworks (STAR)', 'Mock Interview & Time Management'], projectTitle: 'System Design Doc: URL Shortener / Rate Limiter', projectTech: ['Excalidraw', 'Notion', 'LeetCode Premium'], skillTags: ['system-design', 'distributed-systems', 'interview-prep', 'behavioral'] },
    ],
    mobile: [
      { name: 'Mobile Development Fundamentals', description: 'Understand mobile platforms, UX patterns, and set up your development environment.', difficulty: 'beginner', moduleThemes: ['Mobile UX Principles & Navigation Patterns', 'Development Environment Setup', 'Component Architecture for Mobile', 'State Management Basics'], projectTitle: 'Counter App with Navigation', projectTech: ['React Native / Flutter', 'Expo', 'VS Code'], skillTags: ['mobile-ux', 'navigation', 'components', 'state'] },
      { name: 'Core UI & Layouts', description: 'Build flexible, responsive mobile UIs using the target framework.', difficulty: 'beginner', moduleThemes: ['Flexbox Layouts for Mobile', 'Lists, FlatList & ScrollView', 'Forms, Inputs & Validation', 'Styling & Theming'], projectTitle: 'Product List App with Search & Filter', projectTech: ['React Native', 'StyleSheet', 'Expo'], skillTags: ['flatlist', 'flexbox', 'forms', 'theming'] },
      { name: 'Networking & Local Storage', description: 'Connect to APIs and persist data locally on the device.', difficulty: 'intermediate', moduleThemes: ['REST API Integration with Axios', 'AsyncStorage & SQLite', 'Authentication with JWT', 'Offline-First Data Sync'], projectTitle: 'Notes App: API-backed with Offline Storage', projectTech: ['Axios', 'AsyncStorage', 'SQLite'], skillTags: ['axios', 'asyncstorage', 'jwt', 'offline'] },
      { name: 'Native Features & Device APIs', description: 'Access camera, location, notifications, and other native capabilities.', difficulty: 'intermediate', moduleThemes: ['Camera & Media Picker', 'Geolocation & Maps', 'Push Notifications', 'Biometric Authentication'], projectTitle: 'Location-Based App with Maps Integration', projectTech: ['react-native-maps', 'Expo Camera', 'Firebase'], skillTags: ['camera', 'maps', 'notifications', 'biometrics'] },
      { name: 'Testing, Performance & Publishing', description: 'Test thoroughly, optimize performance, and publish to the App Store and Google Play.', difficulty: 'advanced', moduleThemes: ['Unit Testing with Jest', 'E2E Testing with Detox', 'Performance Profiling & Optimization', 'App Store / Play Store Submission'], projectTitle: 'Optimized & Tested Production App', projectTech: ['Jest', 'Detox', 'Expo EAS'], skillTags: ['jest', 'detox', 'performance', 'app-store'] },
      { name: 'Capstone: Full-Featured Mobile App', description: 'Build and publish a complete, feature-rich mobile application.', difficulty: 'expert', moduleThemes: ['Architecture: Clean Architecture for Mobile', 'CI/CD for Mobile with Expo EAS', 'Analytics & Crash Reporting', 'Monetization & App Growth'], projectTitle: 'Capstone: Published Mobile App', projectTech: ['React Native', 'Expo EAS', 'Firebase', 'RevenueCat'], skillTags: ['architecture', 'eas', 'analytics', 'monetization'] },
    ],
    security: [
      { name: 'Networking & Security Fundamentals', description: 'Understand how networks work and the threat landscape you will operate in.', difficulty: 'beginner', moduleThemes: ['OSI Model & TCP/IP Stack', 'DNS, HTTP & TLS Deep Dive', 'Common Attack Vectors (OWASP Top 10)', 'Linux for Security Practitioners'], projectTitle: 'Network Traffic Analysis with Wireshark', projectTech: ['Wireshark', 'Linux', 'Nmap'], skillTags: ['networking', 'tcp-ip', 'owasp', 'linux'] },
      { name: 'Web Application Security', description: 'Find and exploit web vulnerabilities in lab environments (ethically).', difficulty: 'beginner', moduleThemes: ['SQL Injection & XSS', 'CSRF & Insecure Authentication', 'SSRF & XXE Vulnerabilities', 'OWASP Juice Shop Walkthroughs'], projectTitle: 'OWASP Juice Shop: Complete All Challenges', projectTech: ['Burp Suite', 'OWASP Juice Shop', 'Docker'], skillTags: ['sqli', 'xss', 'csrf', 'burp-suite'] },
      { name: 'Penetration Testing Methodology', description: 'Execute structured pentests: reconnaissance, exploitation, reporting.', difficulty: 'intermediate', moduleThemes: ['Reconnaissance & OSINT', 'Exploitation with Metasploit', 'Post-Exploitation & Pivoting', 'Professional Report Writing'], projectTitle: 'Full Pentest Report on TryHackMe Lab', projectTech: ['Metasploit', 'Nmap', 'TryHackMe'], skillTags: ['recon', 'metasploit', 'post-exploitation', 'reporting'] },
      { name: 'Cryptography & PKI', description: 'Understand cryptographic primitives and implement secure systems.', difficulty: 'intermediate', moduleThemes: ['Symmetric & Asymmetric Encryption', 'Hashing & Digital Signatures', 'TLS/SSL Certificate Lifecycle', 'Implementing Crypto in Python'], projectTitle: 'Secure Messaging CLI with Asymmetric Encryption', projectTech: ['Python', 'cryptography library', 'OpenSSL'], skillTags: ['cryptography', 'rsa', 'tls', 'digital-signatures'] },
      { name: 'Cloud & Infrastructure Security', description: 'Secure cloud environments, IAM policies, and container workloads.', difficulty: 'advanced', moduleThemes: ['AWS/GCP Security Best Practices', 'IAM Policies & Least Privilege', 'Container Security & Docker Hardening', 'SIEM & Log Analysis'], projectTitle: 'AWS Security Audit & Hardening Report', projectTech: ['AWS Security Hub', 'CloudTrail', 'Prowler'], skillTags: ['aws-security', 'iam', 'container-security', 'siem'] },
      { name: 'Capstone: Full Bug Bounty / CTF Portfolio', description: 'Build a portfolio of real findings and CTF write-ups to land security roles.', difficulty: 'expert', moduleThemes: ['Bug Bounty Platforms & Scope Reading', 'Advanced Web Exploitation', 'Reverse Engineering & Binary Exploitation', 'CTF Competition Strategy'], projectTitle: 'Capstone: 3 Bug Bounty Reports + CTF Write-ups', projectTech: ['HackerOne', 'Burp Suite Pro', 'Ghidra'], skillTags: ['bug-bounty', 'reverse-engineering', 'binary-exploitation', 'ctf'] },
    ],
  };

  // Return domain-specific plan if available, otherwise build a goal-specific generic plan
  if (domain in plans) return plans[domain];

  // Generic software engineering fallback — still uses the goal title, not "Foundations"
  return [
    { name: `${goalTitle}: Environment & Core Concepts`, description: `Set up your environment and learn the foundational concepts behind ${goal}.`, difficulty: 'beginner' as Difficulty, moduleThemes: [`${goalTitle} Environment Setup`, `Core Vocabulary & Mental Models`, `First Hands-on Exercise`, `Tooling & Workflow`], projectTitle: `Hello-World Build: ${goalTitle}`, projectTech: ['Git', 'CLI', 'Editor'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'tooling', 'git', 'fundamentals'] },
    { name: `${goalTitle}: Essential Patterns`, description: `Learn the day-to-day patterns and operations every practitioner in ${goal} relies on.`, difficulty: 'beginner' as Difficulty, moduleThemes: [`Working with Data in ${goalTitle}`, `Core Patterns & Idioms`, `Debugging & Error Handling`, `Testing Basics`], projectTitle: `Guided Mini-Project: First Functional ${goalTitle} Build`, projectTech: ['Git', 'Testing Framework'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'patterns', 'debugging', 'testing'] },
    { name: `Intermediate ${goalTitle}`, description: `Move into structured, reusable approaches and real integrations for ${goal}.`, difficulty: 'intermediate' as Difficulty, moduleThemes: [`Abstractions & Architecture`, `Design Patterns`, `External Integrations`, `Code Organization`], projectTitle: `Component Suite: Reusable ${goalTitle} Modules`, projectTech: ['Package Manager', 'Framework', 'CI'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'architecture', 'design-patterns', 'integration'] },
    { name: `Applied ${goalTitle}`, description: `Build end-to-end systems combining all skills from ${goal}.`, difficulty: 'intermediate' as Difficulty, moduleThemes: [`End-to-End Feature Development`, `Persistence & State`, `APIs & External Services`, `Observability & Logging`], projectTitle: `Integrated Service: End-to-End ${goalTitle} Feature`, projectTech: ['REST/HTTP', 'Database', 'Docker'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'rest', 'database', 'observability'] },
    { name: `Advanced ${goalTitle}`, description: `Tackle performance, architecture, and production-grade engineering for ${goal}.`, difficulty: 'advanced' as Difficulty, moduleThemes: [`Performance & Optimization`, `Architecture & Scaling`, `Security & Reliability`, `Automation & CI/CD`], projectTitle: `Production-Grade ${goalTitle} System`, projectTech: ['Cloud', 'Containers', 'Monitoring'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'performance', 'security', 'ci-cd'] },
    { name: `${goalTitle} Capstone & Expert Track`, description: `Mastery-level engineering, specialization, and a portfolio-ready capstone for ${goal}.`, difficulty: 'expert' as Difficulty, moduleThemes: [`Advanced Specialization`, `System Design at Scale`, `Research & Emerging Patterns`, `Portfolio & Career Readiness`], projectTitle: `Capstone: ${goalTitle} Portfolio Masterpiece`, projectTech: ['Cloud-Native', 'Distributed Systems', 'Open Source'], skillTags: [goal.toLowerCase().split(' ')[0] || 'software', 'system-design', 'distributed-systems', 'portfolio'] },
  ];
}

export function buildFallbackCurriculum(meta: { goal: string; experienceLevel?: string; weeklyHours?: string | number; preferredStyle?: string; college?: string; branch?: string; year?: string; roadmapId?: string }, suppliedBudget?: CurriculumBudget, suppliedIntent?: CurriculumIntent, learnerContext?: LearnerContext): any {
  const goal = meta.goal || 'the learning goal';
  const goalTitle = goal.charAt(0).toUpperCase() + goal.slice(1);
  const roadmapId = meta.roadmapId || `roadmap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Scope every child ID to this roadmap so fallback IDs never collide across roadmaps.
  const scope = (rawId: string) =>
    rawId.startsWith(`${roadmapId}-`) ? rawId : `${roadmapId}-${rawId}`;

  const intent = suppliedIntent || buildFallbackCurriculumIntent(goal);
  const budget = suppliedBudget || calculateCurriculumBudget({ level: meta.experienceLevel, scope: intent.scope, goal });
  const unmetCapabilities = learnerContext
    ? intent.requiredCapabilities.filter(capability => learnerContext.currentKnowledge.find(item => item.capability.toLowerCase() === capability.toLowerCase())?.state !== 'known')
    : intent.requiredCapabilities;
  const capabilities = unmetCapabilities.length ? unmetCapabilities : ['Outcome integration and verification'];
  const moduleCount = Math.min(budget.targetModules, capabilities.length);
  const moduleGroups: string[][] = Array.from({ length: moduleCount }, () => []);
  capabilities.forEach((capability, index) => moduleGroups[index % moduleCount].push(capability));
  const phaseCount = Math.min(budget.targetPhases, moduleCount);
  const selectedPlans = Array.from({ length: phaseCount }, (_, index) => ({
    name: phaseCount === 1 ? `${intent.subject}: Outcome Foundations` : index === phaseCount - 1 ? `${intent.subject}: Outcome Application` : `${intent.subject}: Required Foundations`,
    description: `Build capabilities required for the outcome: ${intent.desiredOutcome}`,
    difficulty: budget.level === 'advanced' ? 'advanced' : budget.level === 'intermediate' && index > 0 ? 'intermediate' : 'beginner',
    moduleCapabilityGroups: [] as string[][],
    projectTitle: intent.desiredOutcome,
    projectTech: [intent.subject],
    skillTags: [] as string[],
  }));
  moduleGroups.forEach((group, index) => selectedPlans[index % phaseCount].moduleCapabilityGroups.push(group));
  selectedPlans.forEach(plan => { plan.skillTags = Array.from(new Set(plan.moduleCapabilityGroups.flat().map(capability => capability.toLowerCase().replace(/[^a-z0-9]+/g, '-')))); });
  const modulesPerPhase = selectedPlans.map(plan => plan.moduleCapabilityGroups.length);
  const requiresProject = /\b(build|create|develop|implement|make|scrap|tracker|automate)\b/i.test(goal);

  const phases = selectedPlans.map((plan, pIdx) => {
    const phaseId = scope(`ph-${pIdx + 1}`);
    let lessonCounter = 0;

    const moduleCapabilities = plan.moduleCapabilityGroups.slice(0, modulesPerPhase[pIdx]);
    const moduleThemes = moduleCapabilities.map(group => group.join(' & '));
    const modules = moduleThemes.map((theme, mIdx) => {
      const moduleId = scope(`mod-${pIdx + 1}-${mIdx + 1}`);
      const capabilitiesForModule = moduleCapabilities[mIdx];
      const lessonCount = capabilitiesForModule.length;
      const lessonIds: string[] = [];
      const lessons = [];
      for (let l = 0; l < lessonCount; l++) {
        lessonCounter++;
        const lessonId = scope(`les-${pIdx + 1}-${mIdx + 1}-${l + 1}`);
        const isFirstOverall = pIdx === 0 && mIdx === 0 && l === 0;
        let prereqs: string[] = [];
        if (!isFirstOverall) {
          if (l > 0) prereqs = [lessonIds[l - 1]];
          else if (mIdx > 0) prereqs = [`mod-prev-${pIdx + 1}-${mIdx}`];
          else prereqs = [`phase-prev-${pIdx}`];
        }
        lessonIds.push(lessonId);
        const capability = capabilitiesForModule[l];
        const knowledge = learnerContext?.currentKnowledge.find(item => item.capability.toLowerCase() === capability.toLowerCase());
        const lessonName = knowledge?.state === 'partially_known' ? `Review and verify: ${capability}` : capability;
        lessons.push({
          id: lessonId, name: lessonName, description: `${knowledge?.state === 'partially_known' ? 'Review and verify' : 'Learn'} ${capability.toLowerCase()} as needed to achieve the outcome: ${intent.desiredOutcome}`,
          learningObjectives: [`Demonstrate ${capability.toLowerCase()} in a task relevant to the stated outcome`],
          prerequisites: prereqs, skillTags: capability.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((tag: string) => tag.length > 2 && !PROHIBITED_SKILL_TAGS.has(tag)).slice(0, 4),
          difficulty: plan.difficulty === 'expert' ? 'advanced' : plan.difficulty, estimatedMinutes: 20 + ((lessonCounter * 5) % 20),
          type: 'learn', status: isFirstOverall ? 'available' : 'locked', contentStatus: 'pending', xpReward: 25
        });
      }

      return {
        id: moduleId, name: theme, description: `Covers ${theme.toLowerCase()} as part of ${plan.name}.`,
        supportsCapabilities: capabilitiesForModule,
        difficulty: plan.difficulty, estimatedHours: 4 + (mIdx % 3), lessons,
        resources: getFallbackResources(goal, theme, pIdx, mIdx)
      };
    });

    for (let mIdx = 0; mIdx < modules.length; mIdx++) {
      const firstLesson = modules[mIdx].lessons[0];
      if (!firstLesson) continue;
      firstLesson.prerequisites = firstLesson.prerequisites.map((pr: string) => {
        if (pr.startsWith('mod-prev-')) { const prevMod = modules[mIdx - 1]; const last = prevMod?.lessons[prevMod.lessons.length - 1]; return last ? last.id : ''; }
        if (pr.startsWith('phase-prev-')) return '';
        return pr;
      }).filter(Boolean);
    }

    const projectTier = PROJECT_LADDER[Math.min(PROJECT_LADDER.length - 1, pIdx)];
    return {
      id: phaseId, name: plan.name, description: plan.description, estimatedHours: 12 + (pIdx * 2), difficulty: plan.difficulty,
      skillsCovered: plan.skillTags,
      levels: modules, modules,
      progress: 0, xpEarned: 0, status: 'current',
      projects: requiresProject && pIdx === selectedPlans.length - 1 ? [{ id: scope(`proj-${pIdx + 1}`), title: plan.projectTitle, difficulty: projectTier, description: `Apply the relevant capabilities to achieve ${intent.desiredOutcome}. Verify the result against the requested outcome.`, techStack: plan.projectTech, features: ['Implement the requested outcome', 'Verify expected behavior', 'Document how to use the result'], progress: 0 }] : []
    };
  });

  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of phases) {
    projects.push(...phase.projects);
    for (const module of phase.levels) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) for (const tag of les.skillTags) allSkillTags.add(tag);
      for (const r of module.resources) resources.push({ ...r, phaseId: phase.id, moduleId: module.id });
    }
  }

  return {
    id: roadmapId, title: goalTitle, goal, experienceLevel: meta.experienceLevel || 'Beginner',
    weeklyHours: Number(meta.weeklyHours) || 5, preferredStyle: meta.preferredStyle || 'Hands-on',
    college: meta.college || null, branch: meta.branch || null, year: meta.year || null,
    progressPercent: 0, totalXp: 0, lessonsCompleted: 0, hoursRemaining: phases.reduce((a, p) => a + (p.estimatedHours || 0), 0),
    status: 'current', createdAt: new Date().toISOString(),
    metadata: { totalPhases: phases.length, totalModules: phases.reduce((a, p) => a + (p.levels?.length || p.modules?.length || 0), 0), totalLessons, skillTags: Array.from(allSkillTags), schemaVersion: 2, source: 'fallback' },
    phases, resources, projects
  };
}

export function logCurriculumStats(tag: string, roadmap: any): void {
  const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
  const modules = phases.reduce((a: number, p: any) => a + (p.levels?.length || p.modules?.length || 0), 0);
  const lessons = phases.reduce((a: number, p: any) => a + (p.levels || p.modules || []).reduce((b: number, m: any) => b + (m.lessons?.length || 0), 0), 0);
  logger.info({ tag, phases: phases.length, modules, lessons, resources: roadmap?.resources?.length || 0, projects: roadmap?.projects?.length || 0 }, '[Curriculum] Stats');
}
