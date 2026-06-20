import { Roadmap, Phase, Level, Lesson, UserProfile } from '../types';

export interface LessonContext {
  phase: Phase;
  level: Level;
  lesson: Lesson;
}

export interface RoadmapStats {
  completedLessons: number;
  totalLessons: number;
  quizzesCompleted: number;
  projectsCompleted: number;
  completedLevels: number;
  curriculumLevel: number;
  progressPercent: number;
}

export interface ProgressInsight {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  category: 'quiz' | 'coding' | 'mentor' | 'roadmap';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  phaseId?: string;
  levelId?: string;
  lessonId?: string;
}

export interface TodayTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action?: () => void;
  phaseId?: string;
  levelId?: string;
  lessonId?: string;
}

function walkLessons(roadmap: Roadmap, fn: (ctx: LessonContext) => void) {
  for (const phase of roadmap.phases) {
    for (const level of phase.levels) {
      for (const lesson of level.lessons) {
        fn({ phase, level, lesson });
      }
    }
  }
}

export function getAllLessonsInOrder(roadmap: Roadmap): LessonContext[] {
  const items: LessonContext[] = [];
  walkLessons(roadmap, (ctx) => items.push(ctx));
  return items;
}

export function computeRoadmapStats(roadmap: Roadmap | null): RoadmapStats {
  if (!roadmap) {
    return {
      completedLessons: 0,
      totalLessons: 0,
      quizzesCompleted: 0,
      projectsCompleted: 0,
      completedLevels: 0,
      curriculumLevel: 1,
      progressPercent: 0,
    };
  }

  let completedLessons = 0;
  let totalLessons = 0;
  let quizzesCompleted = 0;
  let projectsCompleted = 0;
  let completedLevels = 0;

  for (const phase of roadmap.phases) {
    for (const level of phase.levels) {
      if (level.status === 'completed') completedLevels += 1;

      for (const lesson of level.lessons) {
        totalLessons += 1;
        if (lesson.status === 'completed') {
          completedLessons += 1;
          if (lesson.type === 'quiz') quizzesCompleted += 1;
          if (lesson.type === 'challenge' || level.type === 'Projects') projectsCompleted += 1;
        }
      }
    }
  }

  const curriculumLevel = Math.max(1, completedLevels + 1);

  return {
    completedLessons,
    totalLessons,
    quizzesCompleted,
    projectsCompleted,
    completedLevels,
    curriculumLevel,
    progressPercent: roadmap.progressPercent,
  };
}

export function findCurrentLesson(roadmap: Roadmap): LessonContext | null {
  const ordered = getAllLessonsInOrder(roadmap);
  return ordered.find((ctx) => ctx.lesson.status === 'available') ?? null;
}

export function findNextUpLesson(roadmap: Roadmap): LessonContext | null {
  const ordered = getAllLessonsInOrder(roadmap);
  const currentIdx = ordered.findIndex((ctx) => ctx.lesson.status === 'available');
  if (currentIdx === -1) {
    return ordered.find((ctx) => ctx.lesson.status !== 'completed' && ctx.lesson.status !== 'locked') ?? null;
  }
  return (
    ordered.slice(currentIdx + 1).find((ctx) => ctx.lesson.status !== 'locked') ?? null
  );
}

export function findCurrentModule(roadmap: Roadmap): { phase: Phase; level: Level } | null {
  const current = findCurrentLesson(roadmap);
  if (current) return { phase: current.phase, level: current.level };

  const currentPhase = roadmap.phases.find((p) => p.status === 'current') ?? roadmap.phases[0];
  if (!currentPhase) return null;

  const currentLevel =
    currentPhase.levels.find((l) => l.status === 'current') ?? currentPhase.levels[0];
  if (!currentLevel) return null;

  return { phase: currentPhase, level: currentLevel };
}

export function getModuleProgress(level: Level): number {
  if (level.lessons.length === 0) return 0;
  const completed = level.lessons.filter((l) => l.status === 'completed').length;
  return Math.round((completed / level.lessons.length) * 100);
}

export function deriveProgressInsights(roadmap: Roadmap | null): ProgressInsight[] {
  if (!roadmap) return [];

  const insights: ProgressInsight[] = [];
  const current = findCurrentLesson(roadmap);
  const next = findNextUpLesson(roadmap);

  if (current) {
    insights.push({
      id: `insight-current-${current.lesson.id}`,
      title: `Continue ${current.lesson.name}`,
      description: `Pick up where you left off in ${current.level.name}.`,
      xpReward: current.lesson.xpReward,
      category: current.lesson.type === 'quiz' ? 'quiz' : 'roadmap',
      difficulty: current.lesson.type === 'boss_challenge' ? 'Hard' : 'Medium',
      phaseId: current.phase.id,
      levelId: current.level.id,
      lessonId: current.lesson.id,
    });
  }

  const pendingQuiz = getAllLessonsInOrder(roadmap).find(
    (ctx) => ctx.lesson.type === 'quiz' && ctx.lesson.status === 'available',
  );
  if (pendingQuiz && pendingQuiz.lesson.id !== current?.lesson.id) {
    insights.push({
      id: `insight-quiz-${pendingQuiz.lesson.id}`,
      title: `Complete ${pendingQuiz.lesson.name}`,
      description: `Test your knowledge in ${pendingQuiz.level.name}.`,
      xpReward: pendingQuiz.lesson.xpReward,
      category: 'quiz',
      difficulty: 'Medium',
      phaseId: pendingQuiz.phase.id,
      levelId: pendingQuiz.level.id,
      lessonId: pendingQuiz.lesson.id,
    });
  }

  const completedLearn = getAllLessonsInOrder(roadmap).filter(
    (ctx) => ctx.lesson.type === 'learn' && ctx.lesson.status === 'completed',
  );
  if (completedLearn.length > 0 && insights.length < 3) {
    const revise = completedLearn[completedLearn.length - 1];
    insights.push({
      id: `insight-revise-${revise.lesson.id}`,
      title: `Revise ${revise.lesson.name}`,
      description: 'Revisit this topic to strengthen your understanding.',
      xpReward: Math.max(20, Math.round(revise.lesson.xpReward * 0.5)),
      category: 'mentor',
      difficulty: 'Easy',
      phaseId: revise.phase.id,
      levelId: revise.level.id,
      lessonId: revise.lesson.id,
    });
  }

  if (next && next.lesson.id !== current?.lesson.id && insights.length < 3) {
    insights.push({
      id: `insight-next-${next.lesson.id}`,
      title: `Up next: ${next.lesson.name}`,
      description: `Prepare for your next step in ${next.phase.name}.`,
      xpReward: next.lesson.xpReward,
      category: 'roadmap',
      difficulty: 'Easy',
      phaseId: next.phase.id,
      levelId: next.level.id,
      lessonId: next.lesson.id,
    });
  }

  return insights.slice(0, 3);
}

export function deriveTodaysTasks(roadmap: Roadmap | null): Omit<TodayTask, 'action'>[] {
  if (!roadmap) {
    return [
      {
        id: 'task-create-roadmap',
        title: 'Create your first roadmap',
        description: 'Generate a personalized learning path to get started.',
        completed: false,
      },
    ];
  }

  const tasks: Omit<TodayTask, 'action'>[] = [];
  const current = findCurrentLesson(roadmap);
  const stats = computeRoadmapStats(roadmap);

  if (current) {
    tasks.push({
      id: `task-lesson-${current.lesson.id}`,
      title: `Finish ${current.lesson.name}`,
      description: `Complete this ${current.lesson.type.replace('_', ' ')} in ${current.level.name}.`,
      completed: false,
      phaseId: current.phase.id,
      levelId: current.level.id,
      lessonId: current.lesson.id,
    });
  }

  const availableQuiz = getAllLessonsInOrder(roadmap).find(
    (ctx) => ctx.lesson.type === 'quiz' && ctx.lesson.status === 'available',
  );
  if (availableQuiz) {
    tasks.push({
      id: `task-quiz-${availableQuiz.lesson.id}`,
      title: `Complete ${availableQuiz.lesson.name}`,
      description: 'Pass the quiz to unlock the next module.',
      completed: false,
      phaseId: availableQuiz.phase.id,
      levelId: availableQuiz.level.id,
      lessonId: availableQuiz.lesson.id,
    });
  }

  const lastCompleted = [...getAllLessonsInOrder(roadmap)]
    .reverse()
    .find((ctx) => ctx.lesson.status === 'completed' && ctx.lesson.type === 'learn');

  if (lastCompleted && stats.completedLessons > 0) {
    tasks.push({
      id: `task-review-${lastCompleted.lesson.id}`,
      title: `Review ${lastCompleted.lesson.name}`,
      description: 'Reinforce recently covered material.',
      completed: false,
      phaseId: lastCompleted.phase.id,
      levelId: lastCompleted.level.id,
      lessonId: lastCompleted.lesson.id,
    });
  }

  if (tasks.length === 0 && stats.completedLessons === stats.totalLessons && stats.totalLessons > 0) {
    tasks.push({
      id: 'task-roadmap-complete',
      title: 'Roadmap completed',
      description: 'Great work! Generate a new roadmap or explore projects.',
      completed: true,
    });
  }

  return tasks.slice(0, 4);
}

export function hasLearningActivity(profile: UserProfile, stats: RoadmapStats): boolean {
  return (
    profile.hoursStudied > 0 ||
    profile.streak > 0 ||
    stats.completedLessons > 0 ||
    stats.quizzesCompleted > 0 ||
    stats.projectsCompleted > 0
  );
}

export function estimateLessonDuration(lesson: Lesson): string {
  const minutes: Record<string, number> = {
    learn: 15,
    quiz: 10,
    coding: 25,
    challenge: 20,
    ai_session: 12,
    boss_challenge: 30,
  };
  return `${minutes[lesson.type] ?? 15} min`;
}
