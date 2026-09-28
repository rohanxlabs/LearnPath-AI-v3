import { describe, expect, it } from 'vitest';
import {
  calculateCurriculumBudget,
  calculateRoadmapGenerationBudget,
  buildCurriculumGenerationPrompt,
  buildCurriculumRetryPrompt,
  buildFallbackCurriculum,
  classifyGoalScope,
  CURRICULUM_BUDGET_POLICY,
  validateCurriculumQuality,
} from '../lib/curriculum';

describe('calculateCurriculumBudget', () => {
  const targets = {
    Standard: { small: [2, 3], medium: [3, 5], large: [4, 7] },
    Intermediate: { small: [4, 6], medium: [5, 8], large: [6, 10] },
    Advanced: { small: [7, 9], medium: [8, 11], large: [9, 13] },
  } as const;

  it.each(Object.entries(targets).flatMap(([level, scopes]) =>
    Object.entries(scopes).map(([scope, expected]) => [level, scope, expected] as const),
  ))('%s / %s produces the configured target', (level, scope, expected) => {
    const budget = calculateCurriculumBudget({ level, scope, goal: 'Example outcome' });
    expect([budget.targetPhases, budget.targetModules]).toEqual(expected);
    expect(budget.goal).toBe('Example outcome');
  });

  it('keeps module counts as roadmap totals and respects hard caps', () => {
    for (const level of ['Standard', 'Intermediate', 'Advanced']) {
      for (const scope of ['small', 'medium', 'large']) {
        const budget = calculateCurriculumBudget({ level, scope });
        expect(budget.targetPhases).toBeLessThanOrEqual(budget.maximumPhases);
        expect(budget.targetModules).toBeLessThanOrEqual(budget.maximumModules);
      }
    }
    expect(calculateCurriculumBudget({ level: 'Standard', scope: 'medium' }).targetModules).toBe(5);
  });

  it('normalizes existing Beginner values to Standard without changing API values', () => {
    expect(calculateCurriculumBudget({ level: 'Beginner', scope: 'medium' })).toMatchObject({
      level: 'standard', targetPhases: 3, targetModules: 5,
    });
  });

  it('uses safe deterministic defaults for unknown level and scope', () => {
    const first = calculateCurriculumBudget({ level: 'master', scope: 'planet', goal: '  Python basics  ' });
    const second = calculateCurriculumBudget({ level: 'master', scope: 'planet', goal: '  Python basics  ' });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ level: 'standard', scope: 'medium', goal: 'Python basics', targetPhases: 3, targetModules: 5 });
  });

  it('does not impose the former production minimum curriculum size', () => {
    const smallGoal = calculateCurriculumBudget({ level: 'Beginner', scope: 'small', goal: 'Learn basic Python syntax' });
    expect(smallGoal.targetPhases).toBeLessThan(3);
    expect(smallGoal.targetModules).toBeLessThan(5);
    expect(smallGoal.targetPhases).toBeLessThan(6);
    expect(smallGoal.targetModules).toBeLessThan(18);
  });

  it('keeps policy values centralized in one configuration object', () => {
    expect(CURRICULUM_BUDGET_POLICY.levelTargets.standard).toEqual({ phases: 3, modules: 5 });
    expect(CURRICULUM_BUDGET_POLICY.hardCaps).toEqual({ phases: 9, modules: 13 });
  });

  it('classifies goal scope conservatively and keeps identical budget policy for route callers', () => {
    expect(classifyGoalScope('Learn Python basics')).toBe('small');
    expect(classifyGoalScope('Python for automation')).toBe('medium');
    expect(classifyGoalScope('Become an advanced Python backend engineer')).toBe('large');
    expect(calculateRoadmapGenerationBudget('Beginner', 'Learn Python basics')).toMatchObject({ level: 'standard', scope: 'small', targetPhases: 2, targetModules: 3 });
  });

  it('places targets and total-module hard boundaries in the shared generation prompt', () => {
    const budget = calculateRoadmapGenerationBudget('Intermediate', 'Python for automation');
    const prompt = buildCurriculumGenerationPrompt({ goal: 'Python for automation', experienceLevel: 'Intermediate', budget });
    expect(prompt).toContain('Target approximately 5 phases and 8 TOTAL modules');
    expect(prompt).toContain('Never exceed 9 phases or 13 TOTAL modules');
    expect(prompt).toContain('Stop when the learner has sufficient knowledge');
    expect(prompt).not.toContain('deep, degree-level');
    expect(prompt).not.toContain('DSA, system design, projects');
    expect(prompt).toContain('Projects are optional');
    const retry = buildCurriculumRetryPrompt('Python for automation', budget, ['Too many total modules']);
    expect(retry).toContain('13 total modules');
    expect(retry).not.toContain('at least 6 phases');
  });

  it('accepts a coherent small curriculum without old minimum-count failures', () => {
    const budget = calculateRoadmapGenerationBudget('Beginner', 'Learn Python basics');
    const smallCurriculum = {
      goal: 'Learn Python basics',
      phases: [{ name: 'Python Foundations', difficulty: 'beginner', modules: [{
        name: 'Python Syntax', resources: [], lessons: [{ id: 'lesson-1', name: 'Variables and Values',
          skillTags: ['python'], learningObjectives: ['Use variables to store and update values'],
          prerequisites: [], estimatedMinutes: 20 }],
      }] }],
    };
    expect(validateCurriculumQuality(smallCurriculum, budget)).toMatchObject({ ok: true, issues: [] });
  });

  it('rejects curricula that exceed phase or global module caps', () => {
    const budget = calculateRoadmapGenerationBudget('Beginner', 'Learn Python basics');
    const phases = Array.from({ length: budget.maximumPhases + 1 }, (_, i) => ({ name: `Phase ${i}`, modules: [] }));
    expect(validateCurriculumQuality({ goal: 'Learn Python basics', phases }, budget).issues.join(' ')).toContain('budget maximum');
    const modules = Array.from({ length: budget.maximumModules + 1 }, (_, i) => ({ name: `Module ${i}`, lessons: [] }));
    expect(validateCurriculumQuality({ goal: 'Learn Python basics', phases: [{ name: 'Python Foundations', modules }] }, budget).issues.join(' ')).toContain('Too many total modules');
  });

  it('keeps fallback phases and total modules within the supplied budget', () => {
    const budget = calculateRoadmapGenerationBudget('Beginner', 'Learn Python basics');
    const fallback = buildFallbackCurriculum({ goal: 'Learn Python basics', experienceLevel: 'Beginner' }, budget);
    const moduleCount = fallback.phases.reduce((total: number, phase: any) => total + phase.modules.length, 0);
    expect(fallback.phases.length).toBeLessThanOrEqual(budget.maximumPhases);
    expect(moduleCount).toBeLessThanOrEqual(budget.maximumModules);
    expect(moduleCount).toBe(budget.targetModules);
    expect(fallback.projects).toHaveLength(0);
  });

  it('keeps project-scraper fallback topics bounded to the requested outcome', () => {
    const goal = 'Learn Python to build a web scraper';
    const budget = calculateRoadmapGenerationBudget('Beginner', goal);
    const fallback = buildFallbackCurriculum({ goal, experienceLevel: 'Beginner' }, budget);
    const names = fallback.phases.flatMap((phase: any) => phase.modules.map((module: any) => module.name)).join(' ').toLowerCase();
    expect(names).toContain('http requests');
    expect(names).toContain('html parsing');
    expect(names).not.toMatch(/react|distributed systems|machine learning|system design/);
  });
});
