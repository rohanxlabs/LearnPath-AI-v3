import { describe, expect, it } from 'vitest';
import { buildCurriculumGenerationPrompt, buildFallbackCurriculum, buildFallbackCurriculumIntent, calculateCurriculumBudget, validateCurriculumQuality } from '../lib/curriculum';
import { buildLearnerContext, formatLearnerContext, learningGaps, type LearnerSkillEvidence } from '../lib/curriculumPersonalization';
import { aggregateSkillEvidence } from '../lib/skillCalibration';
import { LEARNING_EVENT } from '../../types';

const strongSkill = (skillName: string): LearnerSkillEvidence => ({
  skillKey: skillName.toLowerCase().replace(/\s+/g, '-'), skillName,
  proficiencyLevel: 'competent', confidenceLevel: 'high', evidenceCount: 4,
});

describe('goal-specific learner context and learning gaps', () => {
  it('personalizes the same machine-learning goal to the learner evidence', () => {
    const intent = buildFallbackCurriculumIntent('Python for machine learning');
    const beginner = buildLearnerContext({ intent, experienceLevel: 'Beginner' });
    const experienced = buildLearnerContext({
      intent,
      experienceLevel: 'Intermediate',
      skills: [strongSkill('Python Programming'), strongSkill('NumPy Tabular Data'), strongSkill('Pandas DataFrames')],
    });
    expect(beginner.currentKnowledge.every(item => item.state === 'unknown')).toBe(true);
    expect(experienced.demonstratedCapabilities).toContain('Python programming for data workflows');
    expect(experienced.currentKnowledge).not.toEqual(beginner.currentKnowledge);
    expect(experienced.currentKnowledge.find(item => /model training/i.test(item.capability))?.state).toBe('unknown');
  });

  it('compresses demonstrated Python while retaining HTTP, HTML, extraction, and other scraper gaps', () => {
    const intent = buildFallbackCurriculumIntent('Python to build a web scraper');
    const context = buildLearnerContext({ intent, skills: [strongSkill('Python')] });
    expect(context.currentKnowledge.find(item => /Python scripting/i.test(item.capability))?.state).toBe('known');
    expect(learningGaps(context).map(item => item.capability).join(' ').toLowerCase()).toMatch(/http|html|extraction/);
    expect(learningGaps(context).some(item => /http/i.test(item.capability))).toBe(true);
    expect(learningGaps(context).some(item => /html/i.test(item.capability))).toBe(true);
  });

  it('keeps HTTP and HTML as unknown prerequisites when only Python is demonstrated', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, skills: [strongSkill('Python')] });
    expect(context.currentKnowledge.find(item => /HTTP requests/i.test(item.capability))?.state).toBe('unknown');
    expect(context.currentKnowledge.find(item => /HTML structure/i.test(item.capability))?.state).toBe('unknown');
  });

  it('treats partial HTTP knowledge as review and verification, not mastery', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, skills: [{
      ...strongSkill('HTTP requests'), proficiencyLevel: 'developing', confidenceLevel: 'medium', evidenceCount: 2,
    }] });
    expect(context.currentKnowledge.find(item => /HTTP requests/i.test(item.capability))?.state).toBe('partially_known');
    expect(context.currentKnowledge.find(item => /HTTP requests/i.test(item.capability))?.decision).toBe('review_and_verify');
  });

  it('does not include unrelated calibrated skills in a goal-specific context', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, skills: [strongSkill('React'), strongSkill('Docker'), strongSkill('SQL')] });
    expect(context.currentKnowledge.every(item => item.evidence.length === 0)).toBe(true);
    expect(formatLearnerContext(context)).not.toMatch(/React|Docker|SQL/);
  });

  it('uses calibrated evidence to skip previously demonstrated Python fundamentals', () => {
    const intent = buildFallbackCurriculumIntent('Python for automation');
    const context = buildLearnerContext({ intent, skills: [strongSkill('Python'), strongSkill('Functions and Reusable Scripts')] });
    expect(context.relevantHistory).toContain('Python scripting fundamentals');
    const fallback = buildFallbackCurriculum({ goal: 'Python for automation', experienceLevel: context.experienceLevel }, undefined, intent, context);
    const moduleText = fallback.phases.flatMap((phase: any) => phase.modules).map((module: any) => module.name).join(' ').toLowerCase();
    expect(moduleText).not.toContain('python scripting fundamentals');
    expect(moduleText).toMatch(/file|error|automation|testing/);
  });

  it('uses study time for pacing context without changing the curriculum budget', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const fiveHours = buildLearnerContext({ intent, weeklyHours: 5 });
    const fifteenHours = buildLearnerContext({ intent, weeklyHours: 15 });
    expect(fifteenHours.availableTime).toBe(15);
    expect(formatLearnerContext(fifteenHours)).toContain('pacing only, never to enlarge the curriculum');
    expect(fifteenHours.currentKnowledge).toEqual(fiveHours.currentKnowledge);
  });

  it('does not trust an advanced profile label as evidence of specific fundamentals', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, profile: { background: { experienceLevel: 'Advanced' } } });
    expect(context.experienceLevel).toBe('Advanced');
    expect(context.currentKnowledge.every(item => item.state === 'unknown')).toBe(true);
  });

  it('recognizes strong calibration output as sufficient evidence to compress a capability', () => {
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, skills: [strongSkill('HTML Parsing')] });
    expect(context.currentKnowledge.find(item => /HTML parsing/i.test(item.capability))?.state).toBe('known');
  });

  it('uses repeated successful placement evidence through the existing calibration policy', () => {
    const now = new Date('2026-09-28T00:00:00.000Z');
    const calibrated = aggregateSkillEvidence(Array.from({ length: 3 }, () => ({
      eventType: LEARNING_EVENT.placementQuestionAnswered,
      occurredAt: now,
      difficulty: 'advanced',
      properties: { correct: true },
    })));
    const intent = buildFallbackCurriculumIntent('Python web scraping');
    const context = buildLearnerContext({ intent, skills: [{ skillKey: 'html-parsing', skillName: 'HTML Parsing', ...calibrated }] });
    expect(context.currentKnowledge.find(item => /HTML parsing/i.test(item.capability))?.state).toBe('known');
  });

  it('passes learner evidence and gaps to generation while keeping the phase/module budget fixed', () => {
    const goal = 'Python web scraping';
    const intent = buildFallbackCurriculumIntent(goal);
    const context = buildLearnerContext({ intent, weeklyHours: 15, skills: [strongSkill('Python')] });
    const budget = calculateCurriculumBudget({ level: 'Beginner', scope: intent.scope, goal });
    const prompt = buildCurriculumGenerationPrompt({ goal, intent, learnerContext: context, budget });
    expect(prompt).toContain('Python scripting fundamentals: KNOWN');
    expect(prompt).toContain('HTTP requests and response handling: UNKNOWN');
    expect(prompt).toContain('Available study time: 15 hours/week; use for pacing only');
    expect(prompt).toContain(`Never exceed ${budget.maximumPhases} phases or ${budget.maximumModules} TOTAL modules`);
    expect(prompt).toContain('Do not inflate the curriculum to reach target counts');
  });

  it('allows a demonstrated capability to be omitted but keeps every learning gap covered', () => {
    const goal = 'Python web scraping';
    const intent = buildFallbackCurriculumIntent(goal);
    const context = buildLearnerContext({ intent, skills: [strongSkill('Python')] });
    const budget = calculateCurriculumBudget({ level: 'Beginner', scope: intent.scope, goal });
    const modules = intent.requiredCapabilities
      .filter(capability => capability !== 'Python scripting fundamentals')
      .map((capability, index) => ({ name: `Capability ${index}`, supportsCapabilities: [capability], lessons: [] }));
    const phases = [0, 1].map(phaseIndex => ({ name: `Scraping Foundations ${phaseIndex + 1}`, modules: modules.slice(phaseIndex * 4, (phaseIndex + 1) * 4) }));
    expect(validateCurriculumQuality({ goal, phases }, budget, intent, context).ok).toBe(true);
    const incomplete = { goal, phases: [{ name: 'Scraping Foundations', modules: [{ name: 'HTTP', supportsCapabilities: ['HTTP requests and response handling'], lessons: [] }] }] };
    expect(validateCurriculumQuality(incomplete, budget, intent, context).issues.join(' ')).toContain('Required outcome capabilities are not covered');
  });

  it('rejects a separate module devoted only to already demonstrated knowledge when gaps remain', () => {
    const goal = 'Python web scraping';
    const intent = buildFallbackCurriculumIntent(goal);
    const context = buildLearnerContext({ intent, skills: [strongSkill('Python')] });
    const budget = calculateCurriculumBudget({ level: 'Beginner', scope: intent.scope, goal });
    const curriculum = { goal, phases: [{ name: 'Scraper', modules: [
      { name: 'Python Basics', supportsCapabilities: ['Python scripting fundamentals'], lessons: [] },
      { name: 'HTTP', supportsCapabilities: ['HTTP requests and response handling'], lessons: [] },
    ] }] };
    expect(validateCurriculumQuality(curriculum, budget, intent, context).issues.join(' ')).toContain('focus only on demonstrated capabilities');
  });
});
