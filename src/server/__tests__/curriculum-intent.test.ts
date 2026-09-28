import { describe, expect, it } from 'vitest';
import {
  buildCurriculumGenerationPrompt,
  buildCurriculumIntentPrompt,
  buildFallbackCurriculum,
  buildFallbackCurriculumIntent,
  calculateCurriculumBudget,
  normalizeCurriculumIntent,
  validateCurriculumQuality,
} from '../lib/curriculum';

describe('curriculum goal intent', () => {
  it('interprets a subject-only request as a bounded general learning outcome', () => {
    const intent = buildFallbackCurriculumIntent('Python');
    expect(intent.subject).toBe('Python');
    expect(intent.desiredOutcome).toContain('core capabilities');
    expect(intent.scope).toBe('medium');
  });

  it('keeps automation goals focused on automation capabilities', () => {
    const intent = buildFallbackCurriculumIntent('Python for automation');
    expect(intent.subject).toBe('Python');
    expect(intent.desiredOutcome).toContain('automate');
    expect(intent.requiredCapabilities.join(' ').toLowerCase()).toMatch(/files|automation libraries|safely rerunning/);
    expect(intent.requiredCapabilities.join(' ')).not.toMatch(/React|Machine Learning|System Design/i);
  });

  it('plans web scraping capabilities without unrelated adjacent technologies', () => {
    const intent = buildFallbackCurriculumIntent('Python to build a web scraper');
    const capabilities = intent.requiredCapabilities.join(' ').toLowerCase();
    expect(intent.subject).toBe('Python');
    expect(intent.desiredOutcome).toContain('web scrapers');
    expect(capabilities).toMatch(/http/);
    expect(capabilities).toMatch(/html parsing/);
    expect(capabilities).toMatch(/data extraction/);
    expect(capabilities).toMatch(/pagination/);
    expect(capabilities).toMatch(/error handling/);
    expect(capabilities).toMatch(/export/);
    expect(capabilities).not.toMatch(/react|kubernetes|machine learning|system design/);
    expect(intent.scope).toBe('medium');
  });

  it('keeps a machine-learning goal within the Python and data workflow', () => {
    const intent = buildFallbackCurriculumIntent('Python for machine learning');
    expect(intent.subject).toBe('Machine Learning with Python');
    expect(intent.desiredOutcome).toContain('machine-learning workflows');
    expect(intent.requiredCapabilities.join(' ').toLowerCase()).toMatch(/numpy|model training|data cleaning/);
    expect(intent.requiredCapabilities.join(' ')).not.toMatch(/React|Django|web development/i);
    expect(intent.scope).toBe('large');
  });

  it('treats advanced backend engineering as a large backend outcome', () => {
    const intent = buildFallbackCurriculumIntent('Advanced Python backend engineering');
    expect(intent.subject).toBe('Python');
    expect(intent.desiredOutcome).toContain('backend services');
    expect(intent.requiredCapabilities.join(' ').toLowerCase()).toMatch(/apis|database|security|deployment/);
    expect(intent.scope).toBe('large');
  });

  it('keeps basic Python goals small and finance tracker projects outcome-specific', () => {
    const basics = buildFallbackCurriculumIntent('Learn Python basics');
    expect(basics.scope).toBe('small');
    const goal = 'Build a personal finance tracker using Python';
    const intent = buildFallbackCurriculumIntent(goal);
    expect(intent.desiredOutcome).toContain('finance tracker');
    expect(intent.requiredCapabilities.join(' ').toLowerCase()).toMatch(/transactions|storage|balance calculations/);
    const budget = calculateCurriculumBudget({ level: 'Beginner', scope: intent.scope, goal });
    const fallback = buildFallbackCurriculum({ goal, experienceLevel: 'Beginner' }, budget, intent);
    expect(fallback.projects).toHaveLength(1);
    expect(fallback.projects[0].title).toContain('finance tracker');
    expect(fallback.phases.flatMap((phase: any) => phase.modules).length).toBeLessThanOrEqual(budget.maximumModules);
  });

  it('normalizes structured model output with safe bounds and fallback values', () => {
    const intent = normalizeCurriculumIntent({
      subject: 'Python', desiredOutcome: 'Build practical scrapers', scope: 'medium',
      requiredCapabilities: ['HTTP requests', 'HTML parsing', 'HTTP requests', 42],
    }, 'Python web scraping');
    expect(intent).toEqual({ subject: 'Python', desiredOutcome: 'Build practical scrapers', scope: 'medium', requiredCapabilities: ['HTTP requests', 'HTML parsing'] });
    expect(normalizeCurriculumIntent({}, 'Learn Python basics').scope).toBe('small');
  });

  it('builds a separate interpretation prompt without delegating budget sizing', () => {
    const prompt = buildCurriculumIntentPrompt('Python to build a web scraper');
    expect(prompt).toContain('subject');
    expect(prompt).toContain('desiredOutcome');
    expect(prompt).toContain('requiredCapabilities');
    expect(prompt).toContain('scope');
    expect(prompt).not.toContain('targetPhases');
    expect(prompt).not.toContain('maximumModules');
  });

  it('passes intent and capability mapping into generation and rejects unmapped modules', () => {
    const goal = 'Python to build a web scraper';
    const intent = buildFallbackCurriculumIntent(goal);
    const budget = calculateCurriculumBudget({ level: 'Beginner', scope: intent.scope, goal });
    const prompt = buildCurriculumGenerationPrompt({ goal, budget, intent });
    expect(prompt).toContain('DESIRED OUTCOME:');
    expect(prompt).toContain('REQUIRED CAPABILITIES');
    expect(prompt).toContain('Do not add unrelated subject areas');
    const invalid = { phases: [{ name: 'Python Basics', modules: [{ name: 'Advanced Metaclasses', supportsCapabilities: [], lessons: [] }] }] };
    expect(validateCurriculumQuality(invalid, budget, intent).issues.join(' ')).toContain('do not map to a required outcome capability');
  });
});
