import type { Level, Phase, Roadmap } from '../../types';

export type RoadmapViewMode = 'list' | 'kanban' | 'mindmap';
export type RoadmapModuleStatus = 'todo' | 'in_progress' | 'completed';

export interface RoadmapModule {
  id: string;
  phase: Phase;
  phaseIndex: number;
  level: Level;
  moduleIndex: number;
  status: RoadmapModuleStatus;
  completedLessons: number;
}

export function flattenRoadmapModules(roadmap: Roadmap, currentLessonId?: string | null): RoadmapModule[] {
  return (roadmap.phases || []).flatMap((phase, phaseIndex) =>
    (phase.levels || []).map((level, moduleIndex) => {
      const lessons = level.lessons || [];
      const completedLessons = lessons.filter(lesson => lesson.status === 'completed').length;
      const status: RoadmapModuleStatus = lessons.length > 0 && completedLessons === lessons.length
        ? 'completed'
        : completedLessons > 0 || lessons.some(lesson => lesson.id === currentLessonId)
          ? 'in_progress'
          : 'todo';
      return { id: level.id, phase, phaseIndex, level, moduleIndex, status, completedLessons };
    }),
  );
}

/** Prefer a learner's saved current lesson, then the next unfinished lesson. */
export function getCurrentOrNextLesson(module: RoadmapModule, currentLessonId?: string | null) {
  const lessons = module.level.lessons || [];
  return lessons.find(lesson => lesson.id === currentLessonId && lesson.status !== 'completed')
    || lessons.find(lesson => lesson.status !== 'completed');
}

/** Return a stable board order after dropping a module on a card or column. */
export function getKanbanOrderAfterDrop(
  modules: RoadmapModule[],
  sourceId: string,
  targetStatus: RoadmapModuleStatus,
  targetId?: string,
): string[] {
  const source = modules.find(module => module.id === sourceId);
  if (!source) return modules.map(module => module.id);
  const remaining = modules.filter(module => module.id !== sourceId);

  if (source.status === targetStatus) {
    const originalSiblings = modules.filter(module => module.status === source.status).map(module => module.id);
    const fromIndex = originalSiblings.indexOf(sourceId);
    const targetIndex = originalSiblings.indexOf(targetId || '');
    if (targetIndex < 0 || fromIndex < 0) return modules.map(module => module.id);
    const siblings = [...originalSiblings];
    siblings.splice(fromIndex, 1);
    siblings.splice(targetIndex, 0, sourceId);
    return [...remaining.filter(module => module.status !== source.status).map(module => module.id), ...siblings];
  }

  const targetModules = remaining.filter(module => module.status === targetStatus).map(module => module.id);
  const targetIndex = targetModules.indexOf(targetId || '');
  targetModules.splice(targetIndex < 0 ? targetModules.length : targetIndex, 0, sourceId);
  return [...remaining.filter(module => module.status !== targetStatus).map(module => module.id), ...targetModules];
}

export function getRoadmapViewPreference(roadmapId: string): RoadmapViewMode {
  try {
    const value = localStorage.getItem(`learnpath:roadmap-view:${roadmapId}`);
    return value === 'kanban' || value === 'mindmap' ? value : 'list';
  } catch {
    return 'list';
  }
}

export function saveRoadmapViewPreference(roadmapId: string, mode: RoadmapViewMode): void {
  try {
    localStorage.setItem(`learnpath:roadmap-view:${roadmapId}`, mode);
    window.dispatchEvent(new CustomEvent('learnpath:roadmap-view-change', { detail: { roadmapId, mode } }));
  } catch { /* local preference is best effort */ }
}
