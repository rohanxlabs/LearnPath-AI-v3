import { describe, expect, it } from 'vitest';
import type { Roadmap } from '../../types';
import { flattenRoadmapModules, getCurrentOrNextLesson, getKanbanOrderAfterDrop, getRoadmapViewPreference } from '../../lib/roadmap/roadmapView';

const makeRoadmap = (): Roadmap => ({
  id: 'view-test', goal: 'Learn TypeScript', experienceLevel: 'Beginner', weeklyHours: 5,
  preferredStyle: 'Hands-on', progressPercent: 0, totalXp: 0, lessonsCompleted: 0,
  hoursRemaining: 3, createdAt: new Date(0).toISOString(),
  phases: [{ id: 'phase-1', name: 'Foundations', description: '', progress: 0, estimatedHours: 2, skillsCovered: [], xpEarned: 0, status: 'current', levels: [
    { id: 'todo', name: 'Types', type: 'Basics', status: 'current', lessons: [
      { id: 'todo-1', name: 'Strings', type: 'learn', xpReward: 1, status: 'available', content: '' },
    ] },
    { id: 'active', name: 'Functions', type: 'Basics', status: 'current', lessons: [
      { id: 'active-1', name: 'Parameters', type: 'learn', xpReward: 1, status: 'completed', content: '' },
      { id: 'active-2', name: 'Returns', type: 'learn', xpReward: 1, status: 'available', content: '' },
    ] },
    { id: 'done', name: 'Objects', type: 'Basics', status: 'completed', lessons: [
      { id: 'done-1', name: 'Records', type: 'learn', xpReward: 1, status: 'completed', content: '' },
    ] },
  ] }],
});

describe('roadmap view model', () => {
  it('derives todo, in-progress, and completed from lesson progress and current focus', () => {
    const modules = flattenRoadmapModules(makeRoadmap(), 'todo-1');
    expect(modules.map(module => module.status)).toEqual(['in_progress', 'in_progress', 'completed']);
    expect(flattenRoadmapModules(makeRoadmap()).map(module => module.status)).toEqual(['todo', 'in_progress', 'completed']);
  });

  it('defaults the view preference to list when browser storage is unavailable', () => {
    expect(getRoadmapViewPreference('view-test')).toBe('list');
  });

  it('prefers the saved current lesson when choosing the module continue action', () => {
    const module = flattenRoadmapModules(makeRoadmap(), 'active-2').find(item => item.id === 'active')!;
    expect(getCurrentOrNextLesson(module, 'active-2')?.id).toBe('active-2');
    expect(getCurrentOrNextLesson(module, 'missing')?.id).toBe('active-2');
  });

  it('keeps a moved card adjacent to its drop target and appends it when dropped on a column', () => {
    const modules = flattenRoadmapModules(makeRoadmap());
    const beforeTarget = getKanbanOrderAfterDrop(modules, 'todo', 'in_progress', 'active');
    expect(beforeTarget.indexOf('todo')).toBeLessThan(beforeTarget.indexOf('active'));
    const atEnd = getKanbanOrderAfterDrop(modules, 'todo', 'in_progress');
    expect(atEnd.indexOf('todo')).toBeGreaterThan(atEnd.indexOf('active'));
  });
});
