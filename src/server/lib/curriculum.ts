import { cleanAndParseJSON, callOpenRouterChatCompletion, sanitizeForPrompt, OPENROUTER_MODELS } from './ai';

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

export function validateCurriculumQuality(input: any): { ok: boolean; score: number; issues: string[] } {
  const issues: string[] = [];
  const phases = Array.isArray(input?.phases) ? input.phases : [];
  const totalPhases = phases.length;

  if (totalPhases < CURRICULUM_LIMITS.minPhases) issues.push(`Too few phases (${totalPhases}); need at least ${CURRICULUM_LIMITS.minPhases}.`);
  if (totalPhases > CURRICULUM_LIMITS.maxPhases) issues.push(`Too many phases (${totalPhases}); keep at most ${CURRICULUM_LIMITS.maxPhases}.`);

  let totalModules = 0, totalLessons = 0, lessonsWithEmptyTags = 0, lessonsMissingPrereqs = 0;
  let genericPhaseNames = 0, genericModuleNames = 0, duplicateLessonTitles = 0, duplicateModuleNames = 0;
  let brokenPrereqs = 0, forwardPrereqs = 0, genericLessonTitles = 0, unrealisticTime = 0;
  let resourceMismatch = 0, emptyObjectives = 0, weakObjectives = 0;

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
    if (mods.length < CURRICULUM_LIMITS.minModulesPerPhase) {
      issues.push(`Phase "${phase?.name || '?'}" has only ${mods.length} modules; need ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase}.`);
    }
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

      const lessons = Array.isArray(mod?.lessons) ? mod.lessons : [];
      totalLessons += lessons.length;
      if (lessons.length < CURRICULUM_LIMITS.minLessonsPerModule) {
        issues.push(`Module "${mod?.name || '?'}" has only ${lessons.length} lessons; need ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule}.`);
      }

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
  let phasesWithoutProject = 0;
  for (const phase of phases) {
    const projs = Array.isArray(phase?.projects) ? phase.projects : [];
    if (projs.length === 0) phasesWithoutProject++;
    for (const pr of projs) {
      const tier = normalizeProjectTier(pr?.difficulty);
      if (tier) projTiers.push(PROJECT_LADDER_RANK[tier]);
    }
  }
  if (phasesWithoutProject > 0) issues.push(`${phasesWithoutProject} phase(s) have no project.`);
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
  if (genericLessonTitles > 0) issues.push(`${genericLessonTitles} lesson(s) have generic titles.`);
  if (unrealisticTime > 0) issues.push(`${unrealisticTime} lesson(s) have unrealistic estimatedMinutes (must be ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}).`);
  if (emptyObjectives > 0) issues.push(`${emptyObjectives} lesson(s) have empty learning objectives.`);
  if (weakObjectives > 0) issues.push(`${weakObjectives} lesson(s) have vague, one-word learning objectives.`);
  if (resourceMismatch > 0) issues.push(`${resourceMismatch} resource(s) do not match their module topic or the goal.`);
  if (totalModules < CURRICULUM_LIMITS.minTotalModules) issues.push(`Too few modules overall (${totalModules}); curriculum is too shallow.`);
  if (totalLessons < CURRICULUM_LIMITS.minTotalLessons) issues.push(`Too few lessons overall (${totalLessons}); curriculum is too shallow.`);

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

export function normalizeResources(
  raw: any[],
  ctx: { phase: number; module: number; moduleName: string; goal: string }
): any[] {
  const seen = new Set<string>();
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r: any, ri: number) => {
      const url = typeof r.url === 'string' && /^https?:\/\//i.test(r.url) ? r.url : '';
      const provider = cleanProvider(r);
      return {
        id: typeof r.id === 'string' ? r.id : `res-${ctx.phase}-${ctx.module}-${ri + 1}`,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : `${ctx.moduleName || 'Topic'} reference`,
        type: inferResourceType(r),
        provider,
        url: url || 'https://example.com',
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
  meta: { goal: string; experienceLevel?: string; weeklyHours?: string | number; preferredStyle?: string; college?: string; branch?: string; year?: string }
): any {
  const goal = meta.goal || (typeof input.goal === 'string' ? input.goal : 'Learning Goal');
  let phases = Array.isArray(input.phases) ? input.phases : [];
  if (phases.length > CURRICULUM_LIMITS.maxPhases) phases = phases.slice(0, CURRICULUM_LIMITS.maxPhases);

  const numPhases = Math.max(1, phases.length);
  const phaseDifficulties: Difficulty[] = [];
  for (let i = 0; i < numPhases; i++) {
    const t = i / Math.max(1, numPhases - 1);
    const idx = Math.min(DIFFICULTY_LADDER.length - 1, Math.floor(t * (DIFFICULTY_LADDER.length - 1) + 0.0001));
    phaseDifficulties.push(DIFFICULTY_LADDER[idx]);
  }

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
        const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        if (!lessonIndexById.has(id)) { lessonIndexById.set(id, orderedLessonIds.length); orderedLessonIds.push(id); }
      }
    }
  }

  const normalizedPhases: any[] = [];
  let globalLessonCounter = 0;
  let previousLessonId: string | null = null;

  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p] || {};
    const phaseId = typeof phase.id === 'string' ? phase.id : `ph-${p + 1}`;
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
      const moduleId = typeof module.id === 'string' ? module.id : `mod-${p + 1}-${m + 1}`;
      const moduleDiff = moduleDifficulties[m] || phaseDiff;
      const lessons = Array.isArray(module.lessons) ? module.lessons.slice(0, CURRICULUM_LIMITS.maxLessonsPerModule) : [];
      const normalizedLessons: any[] = [];

      for (let l = 0; l < lessons.length; l++) {
        const lesson = lessons[l] || {};
        globalLessonCounter++;
        const lessonId = typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        const lessonOrd = lessonIndexById.get(lessonId) ?? -1;
        const isFirstOverall = lessonOrd === 0;

        const declaredDiff = String(lesson.difficulty || '').toLowerCase();
        const lessonDiff = (LESSON_DIFFICULTIES as readonly string[]).includes(declaredDiff)
          ? declaredDiff
          : moduleDiff === 'expert' ? 'advanced' : moduleDiff;

        let prereqs = asStringArray(lesson.prerequisites).filter((id) => {
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
          xpReward: 0
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
        resources: normalizedResources
      });
    }

    const rawProjects = Array.isArray(phase.projects) ? phase.projects.slice(0, 3) : [];
    const defaultTier = PROJECT_LADDER[Math.min(PROJECT_LADDER.length - 1, p)];
    const normalizedProjects = rawProjects.map((proj: any, pi: number) => ({
      id: typeof proj.id === 'string' ? proj.id : `proj-${p + 1}-${pi + 1}`,
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
      modules: normalizedModules,
      projects: normalizedProjects
    });
  }

  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of normalizedPhases) {
    projects.push(...phase.projects);
    for (const module of phase.modules) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) for (const tag of les.skillTags) allSkillTags.add(tag);
      for (const r of module.resources) resources.push({ ...r, phaseId: phase.id, moduleId: module.id });
    }
  }

  return {
    id: `roadmap-${Date.now()}`,
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

export function buildFallbackCurriculum(meta: { goal: string; experienceLevel?: string; weeklyHours?: string | number; preferredStyle?: string; college?: string; branch?: string; year?: string }): any {
  const goal = meta.goal || 'the learning goal';
  const goalTitle = goal.charAt(0).toUpperCase() + goal.slice(1);

  const phasePlan: Array<{ name: string; description: string; difficulty: Difficulty; moduleThemes: string[]; projectTitle: string; projectTech: string[] }> = [
    { name: `Foundations of ${goalTitle}`, description: `Build core mental models, tooling, and vocabulary for ${goal}. No prior experience assumed.`, difficulty: 'beginner', moduleThemes: ['Environment & Tooling', 'Core Concepts & Terminology', 'First Principles', 'Hands-on Basics'], projectTitle: `Starter Sandbox: ${goalTitle} Hello-World Project`, projectTech: ['Git', 'CLI', 'Editor/IDE'] },
    { name: `Essential Skills in ${goalTitle}`, description: `Develop the day-to-day competencies every practitioner needs, with guided practice.`, difficulty: 'beginner', moduleThemes: ['Working with Data', 'Core Patterns', 'Debugging & Testing', 'Small Projects'], projectTitle: `Guided Mini-Project: First Functional Build`, projectTech: ['Git', 'Unit Tests'] },
    { name: `Intermediate ${goalTitle}`, description: `Move beyond basics into structured, reusable, and maintainable approaches.`, difficulty: 'intermediate', moduleThemes: ['Structures & Abstractions', 'Design Patterns', 'Working at Scale', 'Integration'], projectTitle: `Component Builder: Reusable Module Suite`, projectTech: ['Package Manager', 'Framework'] },
    { name: `Applied ${goalTitle}`, description: `Combine skills into real systems with external integrations and workflows.`, difficulty: 'intermediate', moduleThemes: ['APIs & Interfaces', 'Persistence & State', 'Concurrency & Flow', 'Observability'], projectTitle: `Integrated Service: End-to-End Feature`, projectTech: ['REST/HTTP', 'Database', 'CI'] },
    { name: `Advanced ${goalTitle}`, description: `Tackle performance, architecture, and production-grade engineering.`, difficulty: 'advanced', moduleThemes: ['Performance & Optimization', 'Architecture & Scaling', 'Security & Reliability', 'Automation'], projectTitle: `Production-Grade System: Scalable Build`, projectTech: ['Cloud', 'Containers', 'Monitoring'] },
    { name: `Expert & Specialization in ${goalTitle}`, description: `Mastery, specialization, and capstone-level engineering for ${goal}.`, difficulty: 'expert', moduleThemes: ['Advanced Specialization', 'Research & Cutting-Edge Topics', 'System Design at Scale', 'Leadership & Mentoring'], projectTitle: `Capstone: Expert Portfolio Masterpiece`, projectTech: ['Cloud-Native', 'Distributed Systems'] }
  ];

  const phases = phasePlan.map((plan, pIdx) => {
    const phaseId = `ph-${pIdx + 1}`;
    let lessonCounter = 0;

    const modules = plan.moduleThemes.map((theme, mIdx) => {
      const moduleId = `mod-${pIdx + 1}-${mIdx + 1}`;
      const lessonCount = 4 + ((pIdx + mIdx) % 3);
      const lessonIds: string[] = [];
      const lessons = [];
      for (let l = 0; l < lessonCount; l++) {
        lessonCounter++;
        const lessonId = `les-${pIdx + 1}-${mIdx + 1}-${l + 1}`;
        const isFirstOverall = pIdx === 0 && mIdx === 0 && l === 0;
        let prereqs: string[] = [];
        if (!isFirstOverall) {
          if (l > 0) prereqs = [lessonIds[l - 1]];
          else if (mIdx > 0) prereqs = [`mod-prev-${pIdx + 1}-${mIdx}`];
          else prereqs = [`phase-prev-${pIdx}`];
        }
        lessonIds.push(lessonId);
        lessons.push({
          id: lessonId, name: `${theme}: Lesson ${l + 1}`, description: `Learn and apply ${theme.toLowerCase()} in the context of ${goal}.`,
          learningObjectives: [`Apply ${theme} concepts to ${goal}`, `Complete a guided exercise reinforcing ${theme.toLowerCase()}`],
          prerequisites: prereqs, skillTags: [String(goal).toLowerCase().split(' ')[0], theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')].filter(Boolean),
          difficulty: plan.difficulty === 'expert' ? 'advanced' : plan.difficulty, estimatedMinutes: 20 + ((lessonCounter * 5) % 20),
          type: 'learn', status: isFirstOverall ? 'available' : 'locked', contentStatus: 'pending', xpReward: 0
        });
      }

      return {
        id: moduleId, name: theme, description: `Covers ${theme.toLowerCase()} as part of ${plan.name}.`,
        difficulty: plan.difficulty === 'expert' ? 'advanced' : plan.difficulty, estimatedHours: 4 + (mIdx % 3), lessons,
        resources: [
          { id: `res-${pIdx + 1}-${mIdx + 1}-1`, title: `Official ${theme} Documentation`, type: 'documentation', provider: 'Official Docs', url: 'https://example.com/docs', description: `Authoritative reference for ${theme}.` },
          { id: `res-${pIdx + 1}-${mIdx + 1}-2`, title: `${theme} - Video Course`, type: 'video', provider: 'YouTube', url: 'https://example.com/course', description: `Structured video walkthrough of ${theme}.` },
          { id: `res-${pIdx + 1}-${mIdx + 1}-3`, title: `${theme} Practice Exercises`, type: 'practice', provider: 'Practice Platform', url: 'https://example.com/practice', description: `Hands-on exercises for ${theme}.` }
        ]
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
      skillsCovered: plan.moduleThemes.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-')), modules,
      projects: [{ id: `proj-${pIdx + 1}`, title: plan.projectTitle, difficulty: projectTier, description: `Apply everything from ${plan.name} to ship ${plan.projectTitle}. Build incrementally, test continuously, and document your work for ${goal}.`, techStack: plan.projectTech, features: ['Scaffold the project structure', 'Implement core feature set', 'Add tests and documentation', 'Deploy or demo the result'], progress: 0 }]
    };
  });

  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of phases) {
    projects.push(...phase.projects);
    for (const module of phase.modules) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) for (const tag of les.skillTags) allSkillTags.add(tag);
      for (const r of module.resources) resources.push({ ...r, phaseId: phase.id, moduleId: module.id });
    }
  }

  return {
    id: `roadmap-${Date.now()}`, title: goalTitle, goal, experienceLevel: meta.experienceLevel || 'Beginner',
    weeklyHours: Number(meta.weeklyHours) || 5, preferredStyle: meta.preferredStyle || 'Hands-on',
    college: meta.college || null, branch: meta.branch || null, year: meta.year || null,
    progressPercent: 0, totalXp: 0, lessonsCompleted: 0, hoursRemaining: phases.reduce((a, p) => a + (p.estimatedHours || 0), 0),
    status: 'current', createdAt: new Date().toISOString(),
    metadata: { totalPhases: phases.length, totalModules: phases.reduce((a, p) => a + p.modules.length, 0), totalLessons, skillTags: Array.from(allSkillTags), schemaVersion: 2, source: 'fallback' },
    phases, resources, projects
  };
}

export function logCurriculumStats(tag: string, roadmap: any): void {
  const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
  const modules = phases.reduce((a: number, p: any) => a + (p.modules?.length || 0), 0);
  const lessons = phases.reduce((a: number, p: any) => a + (p.modules || []).reduce((b: number, m: any) => b + (m.lessons?.length || 0), 0), 0);
  console.log(`[${tag}] Phases: ${phases.length}, Modules: ${modules}, Lessons: ${lessons}, Resources: ${roadmap?.resources?.length || 0}, Projects: ${roadmap?.projects?.length || 0}`);
}
