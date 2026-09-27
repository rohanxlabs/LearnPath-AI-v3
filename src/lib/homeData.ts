import { Roadmap, Phase, Level, Lesson, UserProfile, type CuratedResource, type MentorRoadmapContext } from '../types';

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
  for (const phase of roadmap.phases || []) {
    for (const level of phase.levels || []) {
      for (const lesson of level.lessons || []) {
        fn({ phase, level, lesson });
      }
    }
  }
}

export function getAllLessonsInOrder(roadmap: Roadmap | null): LessonContext[] {
  if (!roadmap) return [];
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

  for (const phase of roadmap.phases || []) {
    for (const level of phase.levels || []) {
      if (level.status === 'completed') completedLevels += 1;

      for (const lesson of level.lessons || []) {
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

export function findCurrentLesson(roadmap: Roadmap | null): LessonContext | null {
  const ordered = getAllLessonsInOrder(roadmap);
  return ordered.find((ctx) => ctx.lesson.status === 'available') ?? null;
}

/**
 * Resolve the lesson a learner should resume. A saved current lesson wins while
 * it is still incomplete; otherwise we use the next available lesson. The
 * locked fallback keeps a newly-created roadmap actionable while its server
 * unlock state is still being hydrated.
 */
export function findResumeLesson(
  roadmap: Roadmap | null,
  currentLessonId?: string | null,
): LessonContext | null {
  const ordered = getAllLessonsInOrder(roadmap);
  const saved = currentLessonId
    ? ordered.find((ctx) => ctx.lesson.id === currentLessonId && ctx.lesson.status !== 'completed')
    : null;
  return saved
    ?? ordered.find((ctx) => ctx.lesson.status === 'available')
    ?? ordered.find((ctx) => ctx.lesson.status === 'locked')
    ?? null;
}

export function findNextUpLesson(roadmap: Roadmap | null): LessonContext | null {
  const ordered = getAllLessonsInOrder(roadmap);
  const currentIdx = ordered.findIndex((ctx) => ctx.lesson.status === 'available');
  if (currentIdx === -1) {
    return ordered.find((ctx) => ctx.lesson.status !== 'completed' && ctx.lesson.status !== 'locked') ?? null;
  }
  return (
    ordered.slice(currentIdx + 1).find((ctx) => ctx.lesson.status !== 'locked') ?? null
  );
}

export function findCurrentModule(roadmap: Roadmap | null): { phase: Phase; level: Level } | null {
  if (!roadmap) return null;
  const current = findCurrentLesson(roadmap);
  if (current) return { phase: current.phase, level: current.level };

  const currentPhase = roadmap.phases?.find((p) => p.status === 'current') ?? roadmap.phases?.[0];
  if (!currentPhase) return null;

  const currentLevel =
    currentPhase.levels?.find((l) => l.status === 'current') ?? currentPhase.levels?.[0];
  if (!currentLevel) return null;

  return { phase: currentPhase, level: currentLevel };
}

export function getModuleProgress(level: Level): number {
  if (!level.lessons || level.lessons.length === 0) return 0;
  const completed = level.lessons.filter((l) => l.status === 'completed').length;
  return Math.round((completed / level.lessons.length) * 100);
}

// Ebbinghaus forgetting-curve: a completed lesson is due for review after 7 days.
// Falls back to the hash heuristic only when completedAt is unavailable (old data).
function isDueForReview(lesson: Lesson): boolean {
  if (lesson.status !== 'completed') return false;
  if (lesson.completedAt) {
    const daysSince = (Date.now() - new Date(lesson.completedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 7;
  }
  // Legacy fallback for lessons without a timestamp: deterministic hash spread.
  let h = 0;
  for (let i = 0; i < lesson.id.length; i++) h = (h * 31 + lesson.id.charCodeAt(i)) >>> 0;
  return (h % 14) < 4;
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

  // Spaced repetition: surface a completed lesson due for review (Ebbinghaus curve proxy)
  if (insights.length < 3) {
    const completedLearn = getAllLessonsInOrder(roadmap).filter(
      (ctx) => ctx.lesson.type === 'learn' && ctx.lesson.status === 'completed',
    );
    const dueForReview = completedLearn.find((ctx) => isDueForReview(ctx.lesson));
    const revise = dueForReview ?? (completedLearn.length > 0 ? completedLearn[completedLearn.length - 1] : null);
    if (revise) {
      insights.push({
        id: `insight-revise-${revise.lesson.id}`,
        title: dueForReview ? `Review: ${revise.lesson.name}` : `Revise ${revise.lesson.name}`,
        description: dueForReview
          ? 'Spaced repetition: revisiting this now locks it into long-term memory.'
          : 'Revisit this topic to strengthen your understanding.',
        xpReward: Math.max(20, Math.round(revise.lesson.xpReward * 0.5)),
        category: 'mentor',
        difficulty: 'Easy',
        phaseId: revise.phase.id,
        levelId: revise.level.id,
        lessonId: revise.lesson.id,
      });
    }
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
      description: `Complete this ${current.lesson.type?.replace('_', ' ') || 'lesson'} in ${current.level.name}.`,
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

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
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

export interface ProgressionValidation {
  hasGaps: boolean;
  gaps: Array<{ lessonId: string; reason: string }>;
  prerequisitesMet: boolean;
  missingPrerequisites: string[];
  quizMatchesContent: boolean;
  mismatchedQuizzes: string[];
}

export function validateRoadmapProgression(roadmap: Roadmap | null): ProgressionValidation {
  if (!roadmap) {
    return {
      hasGaps: false,
      gaps: [],
      prerequisitesMet: true,
      missingPrerequisites: [],
      quizMatchesContent: true,
      mismatchedQuizzes: [],
    };
  }

  const gaps: Array<{ lessonId: string; reason: string }> = [];
  const missingPrerequisites: string[] = [];
  const mismatchedQuizzes: string[] = [];

  const allLessons = getAllLessonsInOrder(roadmap);
  const completedLessons = allLessons.filter(ctx => ctx.lesson.status === 'completed');

  for (let i = 0; i < allLessons.length; i++) {
    const ctx = allLessons[i];
    const lesson = ctx.lesson;

    if (lesson.status === 'locked' || lesson.status === 'available') {
      const lockedBeforeCompleted = allLessons
        .slice(0, i)
        .some(ctx => ctx.lesson.status === 'completed');

      if (lesson.status === 'locked' && lockedBeforeCompleted) {
        gaps.push({
          lessonId: lesson.id,
          reason: 'Locked lesson appears after completed lessons - progression gap detected',
        });
      }
    }

    if (lesson.type === 'quiz') {
      const hasLearnBefore = allLessons
        .slice(0, i)
        .some(ctx => ctx.lesson.type === 'learn' && ctx.lesson.status === 'completed');

      if (!hasLearnBefore && lesson.status === 'available') {
        gaps.push({
          lessonId: lesson.id,
          reason: 'Quiz unlocked without prior learning lesson completed',
        });
      }

      if (!lesson.quizQuestions || lesson.quizQuestions.length === 0) {
        mismatchedQuizzes.push(lesson.id);
      }
    }
  }

  for (const ctx of allLessons) {
    const lesson = ctx.lesson;
    if (lesson.prerequisites) {
      for (const prereqId of lesson.prerequisites) {
        const prereqExists = allLessons.some(l => l.lesson.id === prereqId);
        const prereqCompleted = allLessons.some(l => l.lesson.id === prereqId && l.lesson.status === 'completed');
        if (!prereqExists) {
          missingPrerequisites.push(`${lesson.id}: missing prerequisite ${prereqId}`);
        } else if (!prereqCompleted && lesson.status === 'available') {
          missingPrerequisites.push(`${lesson.id}: prerequisite ${prereqId} not completed`);
        }
      }
    }
  }

  return {
    hasGaps: gaps.length > 0,
    gaps,
    prerequisitesMet: missingPrerequisites.length === 0,
    missingPrerequisites,
    quizMatchesContent: mismatchedQuizzes.length === 0,
    mismatchedQuizzes,
  };
}

export function unlockNextAvailableLesson(roadmap: Roadmap | null): { updatedRoadmap: Roadmap; unlocked: boolean } {
  if (!roadmap) {
    return { updatedRoadmap: {} as Roadmap, unlocked: false };
  }

  const updatedRoadmap = { ...roadmap };
  let unlocked = false;

  for (const phase of updatedRoadmap.phases || []) {
    for (const level of phase.levels || []) {
      const allCompleted = (level.lessons || []).every(l => l.status === 'completed');
      const hasAvailable = (level.lessons || []).some(l => l.status === 'available');

      if (allCompleted && !hasAvailable) {
        const nextLevel = updatedRoadmap.phases
          ?.flatMap(p => p.levels || [])
          .find(l => (l.lessons || []).some(ll => ll.status === 'locked'));

        if (nextLevel) {
          for (const lesson of nextLevel.lessons || []) {
            if (lesson.status === 'locked') {
              lesson.status = 'available';
              unlocked = true;
              break;
            }
          }
          break;
        }
      }
    }
  }

  return { updatedRoadmap, unlocked };
}

export function computeAdaptiveDifficulty(
  lessonHistory: Array<{ lessonId: string; correct: boolean; attempts: number }>,
  currentLesson: Lesson
): 'Easy' | 'Medium' | 'Hard' {
  const lessonAttempts = lessonHistory.filter(h => h.lessonId === currentLesson.id);
  const correctRatio = lessonAttempts.filter(h => h.correct).length / Math.max(1, lessonAttempts.length);

  if (correctRatio >= 0.8 && lessonAttempts.length >= 3) return 'Easy';
  if (correctRatio < 0.5) return 'Hard';
  return 'Medium';
}

export function buildMentorRoadmapContext(roadmap: Roadmap, phase: Phase, level: Level, lesson?: Lesson, selectedResource?: CuratedResource): MentorRoadmapContext {
  const totalLessons = level.lessons?.length || 0;
  const completedLessons = level.lessons?.filter(item => item.status === 'completed').length || 0;
  const levelResources = Array.isArray((level as Level & { resources?: CuratedResource[] }).resources)
    ? (level as Level & { resources?: CuratedResource[] }).resources || []
    : [];
  const moduleResources = [...levelResources, ...(roadmap.resources || []).filter(resource => (resource as CuratedResource & { moduleId?: string }).moduleId === level.id)];
  const phaseResources = moduleResources.length ? moduleResources : (roadmap.resources || []).filter(resource => resource.phaseId === phase.id && !(resource as CuratedResource & { moduleId?: string }).moduleId);
  const relevantResources = selectedResource ? [selectedResource] : phaseResources;
  return {
    goal: roadmap.goal,
    phase: { name: phase.name, description: phase.description },
    module: { name: level.name },
    lesson: lesson ? { name: lesson.name } : undefined,
    topics: [...new Set([...(phase.skillsCovered || []), ...(level.lessons || []).flatMap(item => item.tags || [])])].slice(0, 12),
    progress: { completedLessons, totalLessons, percentage: getModuleProgress(level) },
    resources: relevantResources.slice(0, 5).map(resource => ({
      title: resource.title,
      provider: resource.provider || resource.source,
      type: resource.type,
      description: resource.description,
    })),
  };
}

export function buildRoadmapMentorContext(roadmap: Roadmap, currentLessonId?: string | null): MentorRoadmapContext {
  let current: { phase: Phase; level: Level; lesson?: Lesson } | undefined;
  const entries = (roadmap.phases || []).flatMap(phase => (phase.levels || []).map(level => ({ phase, level })));
  for (const entry of entries) {
    const lesson = entry.level.lessons?.find(item => item.id === currentLessonId && item.status !== 'completed');
    if (lesson) { current = { ...entry, lesson }; break; }
  }
  if (!current) {
    for (const entry of entries) {
      const lesson = entry.level.lessons?.find(item => item.status !== 'completed');
      if (lesson) { current = { ...entry, lesson }; break; }
    }
  }
  if (!current) {
    const phase = roadmap.phases?.find(item => item.status === 'current') || roadmap.phases?.[0];
    const level = phase?.levels?.find(item => item.status === 'current') || phase?.levels?.[0];
    if (phase && level) current = { phase, level };
  }
  if (current) {
    const context = buildMentorRoadmapContext(roadmap, current.phase, current.level, current.lesson);
    const lessons = entries.flatMap(entry => entry.level.lessons || []);
    const completedLessons = lessons.filter(lesson => lesson.status === 'completed').length;
    return {
      ...context,
      progress: {
        completedLessons: roadmap.lessonsCompleted ?? completedLessons,
        totalLessons: lessons.length,
        percentage: roadmap.progressPercent ?? (lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0),
      },
    };
  }

  return {
    goal: roadmap.goal,
    progress: {
      completedLessons: roadmap.lessonsCompleted || 0,
      totalLessons: (roadmap.phases || []).reduce((sum, phase) => sum + (phase.levels || []).reduce((levelSum, level) => levelSum + (level.lessons?.length || 0), 0), 0),
      percentage: roadmap.progressPercent || 0,
    },
    resources: (roadmap.resources || []).slice(0, 5).map(resource => ({ title: resource.title, provider: resource.provider || resource.source, type: resource.type, description: resource.description })),
  };
}
