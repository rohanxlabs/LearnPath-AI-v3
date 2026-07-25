// Drizzle ORM query layer — replaces src/server/db/schema.ts (raw neon SQL).
//
// All exported function signatures are intentionally identical to the legacy
// schema.ts so callers require no changes beyond updating the import path.
//
// The `ensureRoadmapTables()` function is kept as a no-op for backward
// compatibility — Drizzle migrations handle table creation.

import { eq, and, gt, asc, sql as drizzleSql } from 'drizzle-orm';
import { db } from './drizzle';
import { logger } from '../lib/logger';

// Drizzle transaction type — used to pass a transaction client through the
// upsert helpers so migrateRoadmapJsonToTables can run atomically.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
import {
  roadmaps,
  phases,
  modules,
  lessons,
  lessonContent,
  quizzes,
  assignments,
  resources,
  phaseProjects,
  userLessonProgress,
  userRoadmapState,
  users,
} from '../../../drizzle/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [];
}

function asTextArray(v: any): string[] {
  return asArray(v).map(String);
}

/**
 * Run an array of async tasks with a bounded concurrency limit.
 * Keeps at most `concurrency` promises in-flight at once, preventing
 * pg pool exhaustion on large roadmap inserts (pool max = 10).
 */
async function runConcurrent<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Table bootstrap (no-op — migrations handle this now)
// ---------------------------------------------------------------------------

export async function ensureRoadmapTables(): Promise<void> {
  // Tables are created via `npm run db:migrate`.
  // This function is retained for call-site compatibility only.
}

// ---------------------------------------------------------------------------
// Roadmaps
// ---------------------------------------------------------------------------

export async function upsertRoadmap(roadmap: {
  id: string;
  ownerEmail: string;
  title: string;
  goal: string;
  experienceLevel?: string | null;
  weeklyHours?: number | null;
  preferredStyle?: string | null;
  college?: string | null;
  branch?: string | null;
  year?: string | null;
  progressPercent?: number;
  totalXp?: number;
  lessonsCompleted?: number;
  hoursRemaining?: number | null;
  status?: string;
}): Promise<void> {
  await db.insert(roadmaps).values({
    id: roadmap.id,
    ownerEmail: roadmap.ownerEmail.toLowerCase(),
    title: roadmap.title,
    goal: roadmap.goal,
    experienceLevel: roadmap.experienceLevel ?? null,
    weeklyHours: roadmap.weeklyHours ?? null,
    preferredStyle: roadmap.preferredStyle ?? null,
    college: roadmap.college ?? null,
    branch: roadmap.branch ?? null,
    year: roadmap.year ?? null,
    progressPercent: roadmap.progressPercent ?? 0,
    totalXp: roadmap.totalXp ?? 0,
    lessonsCompleted: roadmap.lessonsCompleted ?? 0,
    hoursRemaining: roadmap.hoursRemaining ?? null,
    status: roadmap.status ?? 'current',
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: roadmaps.id,
    set: {
      title: roadmap.title,
      goal: roadmap.goal,
      experienceLevel: roadmap.experienceLevel ?? null,
      weeklyHours: roadmap.weeklyHours ?? null,
      preferredStyle: roadmap.preferredStyle ?? null,
      college: roadmap.college ?? null,
      branch: roadmap.branch ?? null,
      year: roadmap.year ?? null,
      progressPercent: roadmap.progressPercent ?? 0,
      totalXp: roadmap.totalXp ?? 0,
      lessonsCompleted: roadmap.lessonsCompleted ?? 0,
      hoursRemaining: roadmap.hoursRemaining ?? null,
      status: roadmap.status ?? 'current',
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Insert a new roadmap row — no-op if the ID already exists.
// Use this for the POST /api/roadmaps (create) path so a network retry never
// overwrites an existing roadmap.  upsertRoadmap() is still used by the
// POST /update-roadmap (edit) path.
// Returns true if a new row was inserted, false if the ID was already present.
// ---------------------------------------------------------------------------

export async function insertRoadmapIfNew(roadmap: Parameters<typeof upsertRoadmap>[0], tx: DbOrTx = db): Promise<boolean> {
  const result = await tx.insert(roadmaps).values({
    id: roadmap.id,
    ownerEmail: roadmap.ownerEmail.toLowerCase(),
    title: roadmap.title,
    goal: roadmap.goal,
    experienceLevel: roadmap.experienceLevel ?? null,
    weeklyHours: roadmap.weeklyHours ?? null,
    preferredStyle: roadmap.preferredStyle ?? null,
    college: roadmap.college ?? null,
    branch: roadmap.branch ?? null,
    year: roadmap.year ?? null,
    progressPercent: roadmap.progressPercent ?? 0,
    totalXp: roadmap.totalXp ?? 0,
    lessonsCompleted: roadmap.lessonsCompleted ?? 0,
    hoursRemaining: roadmap.hoursRemaining ?? null,
    status: roadmap.status ?? 'current',
    updatedAt: new Date(),
  }).onConflictDoNothing({ target: roadmaps.id }).returning({ id: roadmaps.id });
  return result.length > 0;
}

export async function getRoadmapById(roadmapId: string, ownerEmail?: string): Promise<any | null> {
  const condition = ownerEmail
    ? and(eq(roadmaps.id, roadmapId), eq(roadmaps.ownerEmail, ownerEmail.toLowerCase()))
    : eq(roadmaps.id, roadmapId);
  const rows = await db.select().from(roadmaps).where(condition);
  return rows[0] || null;
}

export async function getRoadmapsByOwner(ownerEmail: string): Promise<any[]> {
  return db
    .select()
    .from(roadmaps)
    .where(eq(roadmaps.ownerEmail, ownerEmail.toLowerCase()))
    .orderBy(drizzleSql`${roadmaps.createdAt} DESC`);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function upsertPhase(phase: {
  id: string;
  roadmapId: string;
  name: string;
  description?: string | null;
  estimatedHours?: number | null;
  skillsCovered?: string[];
  xpEarned?: number;
  status?: string;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(phases).values({
    id: phase.id,
    roadmapId: phase.roadmapId,
    name: phase.name,
    description: phase.description ?? null,
    estimatedHours: phase.estimatedHours ?? null,
    skillsCovered: phase.skillsCovered ?? [],
    xpEarned: phase.xpEarned ?? 0,
    status: phase.status ?? 'current',
    orderIndex: phase.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: phases.id,
    set: {
      roadmapId: phase.roadmapId,
      name: phase.name,
      description: phase.description ?? null,
      estimatedHours: phase.estimatedHours ?? null,
      skillsCovered: phase.skillsCovered ?? [],
      xpEarned: phase.xpEarned ?? 0,
      status: phase.status ?? 'current',
      orderIndex: phase.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export async function upsertModule(module: {
  id: string;
  phaseId: string;
  roadmapId: string;
  name: string;
  type?: string | null;
  description?: string | null;
  status?: string;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(modules).values({
    id: module.id,
    phaseId: module.phaseId,
    roadmapId: module.roadmapId,
    name: module.name,
    type: module.type ?? null,
    status: module.status ?? 'current',
    orderIndex: module.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: modules.id,
    set: {
      roadmapId: module.roadmapId,
      phaseId: module.phaseId,
      name: module.name,
      type: module.type ?? null,
      status: module.status ?? 'current',
      orderIndex: module.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function upsertLesson(lesson: {
  id: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  description?: string | null;
  type?: string;
  xpReward?: number;
  status?: string;
  learningObjectives?: string[];
  prerequisites?: string[];
  difficulty?: string | null;
  estimatedMinutes?: number | null;
  skillTags?: string[];
  contentStatus?: string;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(lessons).values({
    id: lesson.id,
    moduleId: lesson.moduleId,
    phaseId: lesson.phaseId,
    roadmapId: lesson.roadmapId,
    title: lesson.title,
    description: lesson.description ?? null,
    type: lesson.type ?? 'learn',
    xpReward: lesson.xpReward ?? 0,
    status: lesson.status ?? 'locked',
    learningObjectives: lesson.learningObjectives ?? [],
    prerequisites: lesson.prerequisites ?? [],
    difficulty: lesson.difficulty ?? null,
    estimatedMinutes: lesson.estimatedMinutes ?? null,
    skillTags: lesson.skillTags ?? [],
    contentStatus: lesson.contentStatus ?? 'pending',
    orderIndex: lesson.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: lessons.id,
    set: {
      roadmapId: lesson.roadmapId,
      moduleId: lesson.moduleId,
      phaseId: lesson.phaseId,
      title: lesson.title,
      description: lesson.description ?? null,
      type: lesson.type ?? 'learn',
      xpReward: lesson.xpReward ?? 0,
      status: lesson.status ?? 'locked',
      learningObjectives: lesson.learningObjectives ?? [],
      prerequisites: lesson.prerequisites ?? [],
      difficulty: lesson.difficulty ?? null,
      estimatedMinutes: lesson.estimatedMinutes ?? null,
      skillTags: lesson.skillTags ?? [],
      contentStatus: lesson.contentStatus ?? 'pending',
      orderIndex: lesson.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

export async function getLessonById(lessonId: string): Promise<any | null> {
  const rows = await db
    .select()
    .from(lessons)
    .leftJoin(lessonContent, eq(lessonContent.lessonId, lessons.id))
    .where(eq(lessons.id, lessonId));
  if (!rows[0]) return null;
  return { ...rows[0].lessons, ...rows[0].lesson_content };
}

// ---------------------------------------------------------------------------
// LessonContent
// ---------------------------------------------------------------------------

export async function upsertLessonContent(content: {
  lessonId: string;
  markdownContent?: string | null;
  workedExamples?: string[];
  exercises?: string[];
  summary?: string | null;
  modelUsed?: string | null;
  generatedAt?: string | null;
}, tx: DbOrTx = db): Promise<void> {
  const generatedAt = content.generatedAt ? new Date(content.generatedAt) : new Date();
  await tx.insert(lessonContent).values({
    lessonId: content.lessonId,
    markdownContent: content.markdownContent ?? null,
    workedExamples: content.workedExamples ?? [],
    exercises: content.exercises ?? [],
    summary: content.summary ?? null,
    modelUsed: content.modelUsed ?? null,
    generatedAt,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: lessonContent.lessonId,
    set: {
      markdownContent: drizzleSql`COALESCE(EXCLUDED.markdown_content, lesson_content.markdown_content)`,
      workedExamples: drizzleSql`COALESCE(EXCLUDED.worked_examples, lesson_content.worked_examples)`,
      exercises: drizzleSql`COALESCE(EXCLUDED.exercises, lesson_content.exercises)`,
      summary: drizzleSql`COALESCE(EXCLUDED.summary, lesson_content.summary)`,
      modelUsed: drizzleSql`COALESCE(EXCLUDED.model_used, lesson_content.model_used)`,
      generatedAt: drizzleSql`COALESCE(EXCLUDED.generated_at, lesson_content.generated_at)`,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export async function upsertQuiz(quiz: {
  id: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  questions: any[];
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(quizzes).values({
    id: quiz.id,
    lessonId: quiz.lessonId,
    moduleId: quiz.moduleId,
    phaseId: quiz.phaseId,
    roadmapId: quiz.roadmapId,
    title: quiz.title,
    questions: quiz.questions ?? [],
    orderIndex: quiz.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: quizzes.id,
    set: {
      lessonId: quiz.lessonId,
      moduleId: quiz.moduleId,
      phaseId: quiz.phaseId,
      roadmapId: quiz.roadmapId,
      title: quiz.title,
      questions: quiz.questions ?? [],
      orderIndex: quiz.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function upsertAssignment(assignment: {
  id: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  instructions?: string | null;
  templateCode?: string | null;
  solutionCode?: string | null;
  validationSnippet?: string | null;
  hint?: string | null;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(assignments).values({
    id: assignment.id,
    lessonId: assignment.lessonId,
    moduleId: assignment.moduleId,
    phaseId: assignment.phaseId,
    roadmapId: assignment.roadmapId,
    title: assignment.title,
    instructions: assignment.instructions ?? null,
    templateCode: assignment.templateCode ?? null,
    solutionCode: assignment.solutionCode ?? null,
    validationSnippet: assignment.validationSnippet ?? null,
    hint: assignment.hint ?? null,
    orderIndex: assignment.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: assignments.id,
    set: {
      lessonId: assignment.lessonId,
      moduleId: assignment.moduleId,
      phaseId: assignment.phaseId,
      roadmapId: assignment.roadmapId,
      title: assignment.title,
      instructions: assignment.instructions ?? null,
      templateCode: assignment.templateCode ?? null,
      solutionCode: assignment.solutionCode ?? null,
      validationSnippet: assignment.validationSnippet ?? null,
      hint: assignment.hint ?? null,
      orderIndex: assignment.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export async function upsertResource(resource: {
  id: string;
  roadmapId: string;
  phaseId?: string | null;
  moduleId?: string | null;
  title: string;
  type?: string;
  provider?: string | null;
  url?: string | null;
  description?: string | null;
  duration?: string | null;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(resources).values({
    id: resource.id,
    roadmapId: resource.roadmapId,
    phaseId: resource.phaseId ?? null,
    moduleId: resource.moduleId ?? null,
    title: resource.title,
    type: resource.type ?? 'article',
    provider: resource.provider ?? null,
    url: resource.url ?? null,
    description: resource.description ?? null,
    duration: resource.duration ?? null,
    orderIndex: resource.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: resources.id,
    set: {
      phaseId: resource.phaseId ?? null,
      moduleId: resource.moduleId ?? null,
      title: resource.title,
      type: resource.type ?? 'article',
      provider: resource.provider ?? null,
      url: resource.url ?? null,
      description: resource.description ?? null,
      duration: resource.duration ?? null,
      orderIndex: resource.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// PhaseProjects
// ---------------------------------------------------------------------------

export async function upsertPhaseProject(project: {
  id: string;
  roadmapId: string;
  phaseId?: string | null;
  title: string;
  difficulty?: string;
  description?: string | null;
  techStack?: string[];
  features?: string[];
  githubUrl?: string | null;
  progress?: number;
  orderIndex?: number;
}, tx: DbOrTx = db): Promise<void> {
  await tx.insert(phaseProjects).values({
    id: project.id,
    roadmapId: project.roadmapId,
    phaseId: project.phaseId ?? null,
    title: project.title,
    difficulty: project.difficulty ?? 'beginner',
    description: project.description ?? null,
    techStack: project.techStack ?? [],
    features: project.features ?? [],
    githubUrl: project.githubUrl ?? null,
    progress: project.progress ?? 0,
    orderIndex: project.orderIndex ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: phaseProjects.id,
    set: {
      phaseId: project.phaseId ?? null,
      title: project.title,
      difficulty: project.difficulty ?? 'beginner',
      description: project.description ?? null,
      techStack: project.techStack ?? [],
      features: project.features ?? [],
      githubUrl: project.githubUrl ?? null,
      progress: project.progress ?? 0,
      orderIndex: project.orderIndex ?? 0,
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Topic-scoped reads: resources / project / quiz for a single lesson context.
// ---------------------------------------------------------------------------

export async function getResourcesForLessonContext(
  moduleId: string,
  phaseId: string
): Promise<any[]> {
  return db
    .select()
    .from(resources)
    .where(
      drizzleSql`${resources.moduleId} = ${moduleId} OR ${resources.phaseId} = ${phaseId}`
    )
    .orderBy(asc(resources.orderIndex))
    .limit(8);
}

export async function getProjectForPhase(phaseId: string): Promise<any | null> {
  const rows = await db
    .select()
    .from(phaseProjects)
    .where(eq(phaseProjects.phaseId, phaseId))
    .orderBy(asc(phaseProjects.orderIndex))
    .limit(1);
  return rows[0] || null;
}

export async function getQuizForLesson(lessonId: string): Promise<any | null> {
  const rows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .limit(1);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// UserLessonProgress
// ---------------------------------------------------------------------------

export async function upsertUserLessonProgress(progress: {
  ownerEmail: string;
  roadmapId: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  completed?: boolean;
  completedAt?: string | null;
  isUnlocked?: boolean;
  attempts?: number;
  quizScore?: number | null;
  studyMinutes?: number;
}): Promise<void> {
  const id = `${progress.ownerEmail.toLowerCase()}::${progress.lessonId}`;
  const completedAt = progress.completedAt ? new Date(progress.completedAt) : null;
  await db.insert(userLessonProgress).values({
    id,
    ownerEmail: progress.ownerEmail.toLowerCase(),
    roadmapId: progress.roadmapId,
    lessonId: progress.lessonId,
    moduleId: progress.moduleId,
    phaseId: progress.phaseId,
    completed: progress.completed ?? false,
    completedAt,
    isUnlocked: progress.isUnlocked ?? false,
    attempts: progress.attempts ?? 0,
    quizScore: progress.quizScore ?? null,
    studyMinutes: progress.studyMinutes ?? 0,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userLessonProgress.ownerEmail, userLessonProgress.lessonId],
    set: {
      roadmapId: progress.roadmapId,
      moduleId: progress.moduleId,
      phaseId: progress.phaseId,
      completed: drizzleSql`COALESCE(EXCLUDED.completed, user_lesson_progress.completed)`,
      completedAt: drizzleSql`COALESCE(EXCLUDED.completed_at, user_lesson_progress.completed_at)`,
      isUnlocked: drizzleSql`(EXCLUDED.is_unlocked OR user_lesson_progress.is_unlocked)`,
      attempts: drizzleSql`GREATEST(user_lesson_progress.attempts, EXCLUDED.attempts)`,
      quizScore: drizzleSql`COALESCE(EXCLUDED.quiz_score, user_lesson_progress.quiz_score)`,
      studyMinutes: drizzleSql`GREATEST(user_lesson_progress.study_minutes, EXCLUDED.study_minutes)`,
      updatedAt: new Date(),
    },
  });
}

export async function incrementLessonAttempts(
  ownerEmail: string,
  lessonId: string,
  moduleId: string,
  phaseId: string,
  roadmapId: string
): Promise<void> {
  const id = `${ownerEmail.toLowerCase()}::${lessonId}`;
  await db.insert(userLessonProgress).values({
    id,
    ownerEmail: ownerEmail.toLowerCase(),
    roadmapId,
    lessonId,
    moduleId,
    phaseId,
    completed: false,
    attempts: 1,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userLessonProgress.ownerEmail, userLessonProgress.lessonId],
    set: {
      attempts: drizzleSql`user_lesson_progress.attempts + 1`,
      updatedAt: new Date(),
    },
  });
}

export async function getUserLessonProgress(
  ownerEmail: string,
  roadmapId: string
): Promise<any[]> {
  return db
    .select()
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
        eq(userLessonProgress.roadmapId, roadmapId)
      )
    )
    .orderBy(drizzleSql`${userLessonProgress.updatedAt} DESC`);
}

export async function getLessonProgress(
  ownerEmail: string,
  lessonId: string
): Promise<any | null> {
  const rows = await db
    .select()
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
        eq(userLessonProgress.lessonId, lessonId)
      )
    )
    .limit(1);
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Streak helpers
// ---------------------------------------------------------------------------

export async function getCurrentStreak(ownerEmail: string): Promise<number> {
  const rows = await db
    .select({ streak: users.streak })
    .from(users)
    .where(eq(users.email, ownerEmail.toLowerCase()))
    .limit(1);
  return rows[0]?.streak ?? 0;
}

// ---------------------------------------------------------------------------
// Roadmap progress helpers
// ---------------------------------------------------------------------------

export async function getRoadmapProgressPercent(roadmapId: string, ownerEmail: string): Promise<number> {
  const [lessonRows, completedRows] = await Promise.all([
    db.select({ id: lessons.id }).from(lessons).where(eq(lessons.roadmapId, roadmapId)),
    db
      .select({ lessonId: userLessonProgress.lessonId })
      .from(userLessonProgress)
      .where(
        and(
          eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
          eq(userLessonProgress.roadmapId, roadmapId),
          eq(userLessonProgress.completed, true)
        )
      ),
  ]);
  const totalLessons = lessonRows.length;
  const completedLessons = completedRows.length;
  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Normalized roadmap read (full join)
// ---------------------------------------------------------------------------

export async function getNormalizedRoadmap(roadmapId: string, ownerEmail?: string): Promise<any | null> {
  const roadmap = await getRoadmapById(roadmapId, ownerEmail);
  if (!roadmap) return null;

  const [phaseRows, moduleRows, lessonRows, quizRows, assignmentRows, resourceRows, projectRows] =
    await Promise.all([
      db.select().from(phases).where(eq(phases.roadmapId, roadmapId)).orderBy(asc(phases.orderIndex)),
      db.select().from(modules).where(eq(modules.roadmapId, roadmapId)).orderBy(asc(modules.orderIndex)),
      db.select().from(lessons).where(eq(lessons.roadmapId, roadmapId)).orderBy(asc(lessons.orderIndex)),
      db.select().from(quizzes).where(eq(quizzes.roadmapId, roadmapId)).orderBy(asc(quizzes.orderIndex)),
      db.select().from(assignments).where(eq(assignments.roadmapId, roadmapId)).orderBy(asc(assignments.orderIndex)),
      db.select().from(resources).where(eq(resources.roadmapId, roadmapId)).orderBy(asc(resources.orderIndex)),
      db.select().from(phaseProjects).where(eq(phaseProjects.roadmapId, roadmapId)).orderBy(asc(phaseProjects.orderIndex)),
    ]);

  // Build per-user progress maps from user_lesson_progress:
  //   completedAtMap    — lessonId → ISO completion timestamp
  //   completedLessonIds — Set of lesson IDs the user has completed
  //   unlockedLessonIds  — Set of lesson IDs the user has had unlocked
  const completedAtMap = new Map<string, string>();
  const completedLessonIds = new Set<string>();
  const unlockedLessonIds = new Set<string>();
  if (ownerEmail) {
    const progressRows = await db
      .select({
        lessonId: userLessonProgress.lessonId,
        completedAt: userLessonProgress.completedAt,
        isUnlocked: userLessonProgress.isUnlocked,
      })
      .from(userLessonProgress)
      .where(
        and(
          eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
          eq(userLessonProgress.roadmapId, roadmapId)
        )
      );
    for (const row of progressRows) {
      if (row.isUnlocked) unlockedLessonIds.add(row.lessonId);
      // Only count/track the completedAt for actually-completed rows.
      if (row.completedAt) {
        completedLessonIds.add(row.lessonId);
        completedAtMap.set(row.lessonId, row.completedAt instanceof Date ? row.completedAt.toISOString() : String(row.completedAt));
      }
    }
  }

  const modulesByPhase = new Map<string, any[]>();
  for (const m of moduleRows) {
    const list = modulesByPhase.get(m.phaseId) || [];
    list.push(m);
    modulesByPhase.set(m.phaseId, list);
  }

  const lessonsByModule = new Map<string, any[]>();
  for (const l of lessonRows) {
    const list = lessonsByModule.get(l.moduleId) || [];
    list.push(l);
    lessonsByModule.set(l.moduleId, list);
  }

  const quizzesByLesson = new Map<string, any[]>();
  for (const q of quizRows) {
    const list = quizzesByLesson.get(q.lessonId) || [];
    list.push(q);
    quizzesByLesson.set(q.lessonId, list);
  }

  const assignmentsByLesson = new Map<string, any[]>();
  for (const a of assignmentRows) {
    const list = assignmentsByLesson.get(a.lessonId) || [];
    list.push(a);
    assignmentsByLesson.set(a.lessonId, list);
  }

  const resourcesByModule = new Map<string, any[]>();
  for (const r of resourceRows) {
    if (!r.moduleId) continue;
    const list = resourcesByModule.get(r.moduleId) || [];
    list.push(r);
    resourcesByModule.set(r.moduleId, list);
  }

  const projectsByPhase = new Map<string, any[]>();
  for (const p of projectRows) {
    const key = p.phaseId || '__orphan__';
    const list = projectsByPhase.get(key) || [];
    list.push(p);
    projectsByPhase.set(key, list);
  }

  const normalizedPhases = phaseRows.map((phase: any) => ({
    phase,
    projects: projectsByPhase.get(phase.id) || projectsByPhase.get('__orphan__') || [],
    modules: (modulesByPhase.get(phase.id) || []).map((module: any) => ({
      module,
      lessons: (lessonsByModule.get(module.id) || []).map((lesson: any) => ({
        ...lesson,
        quizzes: quizzesByLesson.get(lesson.id) || [],
        assignments: assignmentsByLesson.get(lesson.id) || [],
        resources: resourcesByModule.get(module.id) || [],
        _completedAt: completedAtMap.get(lesson.id) ?? null,
        // Carry per-user flags so reconstructLesson derives status correctly.
        _completedByUser: completedLessonIds.has(lesson.id),
        _unlockedByUser: unlockedLessonIds.has(lesson.id),
      })),
      quizzes: quizRows.filter((q: any) => q.moduleId === module.id),
      assignments: assignmentRows.filter((a: any) => a.moduleId === module.id),
      resources: resourceRows.filter((r: any) => r.moduleId === module.id),
    })),
  }));

  return {
    roadmap,
    phases: normalizedPhases,
    resources: resourceRows,
    projects: projectRows,
  };
}

// ---------------------------------------------------------------------------
// JSON migration: backfill normalized tables from JSONB roadmap data.
// ---------------------------------------------------------------------------

export async function migrateRoadmapJsonToTables(
  ownerEmail: string,
  jsonRoadmap: any
): Promise<void> {
  if (!jsonRoadmap || !jsonRoadmap.id) return;

  const roadmapId = jsonRoadmap.id;

  // Build flat arrays of everything we need to insert so we can fire them in
  // parallel batches instead of one sequential await per row.
  // FK order: roadmap → phases → modules → lessons/resources/projects.

  const phasesArr = asArray(jsonRoadmap.phases);

  // Collect lesson progress backfill data (written outside the transaction —
  // user_lesson_progress has no FK constraint that requires the transaction).
  const completedLessonBackfills: Array<{ lessonId: string; moduleId: string; phaseId: string }> = [];
  for (const phase of phasesArr) {
    for (const level of asArray(phase.levels)) {
      for (const lesson of asArray(level.lessons)) {
        if (lesson.status === 'completed') {
          const moduleId = level.id || `mod-${phase.id}-0`;
          const lessonId = lesson.id || `les-${moduleId}-0`;
          completedLessonBackfills.push({ lessonId, moduleId, phaseId: phase.id });
        }
      }
    }
  }

  // --- collect structured data ---
  type PhaseRec  = Parameters<typeof upsertPhase>[0];
  type ModRec    = Parameters<typeof upsertModule>[0];
  type LesRec    = Parameters<typeof upsertLesson>[0];
  type ResRec    = Parameters<typeof upsertResource>[0];
  type ProjRec   = Parameters<typeof upsertPhaseProject>[0];
  type LesContent = { lessonId: string; markdownContent: string | null; summary: string | null };
  type QuizRec   = Parameters<typeof upsertQuiz>[0];
  type AsgRec    = Parameters<typeof upsertAssignment>[0];

  const phaseRecs:   PhaseRec[]   = [];
  const modRecs:     ModRec[]     = [];
  const lesRecs:     LesRec[]     = [];
  const resRecs:     ResRec[]     = [];
  const projRecs:    ProjRec[]    = [];
  const lesContents: LesContent[] = [];
  const quizRecs:    QuizRec[]    = [];
  const asgRecs:     AsgRec[]     = [];

  for (let pIdx = 0; pIdx < phasesArr.length; pIdx++) {
    const phase = phasesArr[pIdx];
    const phaseId = phase.id || `ph-${roadmapId}-${pIdx}`;

    phaseRecs.push({
      id: phaseId,
      roadmapId,
      name: phase.name || `Phase ${pIdx + 1}`,
      description: phase.description ?? null,
      estimatedHours: typeof phase.estimatedHours === 'number' ? phase.estimatedHours : null,
      skillsCovered: asTextArray(phase.skillsCovered),
      xpEarned: phase.xpEarned ?? 0,
      status: phase.status ?? 'current',
      orderIndex: pIdx,
    });

    const levelsArr = asArray(phase.modules && phase.modules.length ? phase.modules : phase.levels);
    for (let lIdx = 0; lIdx < levelsArr.length; lIdx++) {
      const level = levelsArr[lIdx];
      const moduleId = level.id || `mod-${phaseId}-${lIdx}`;

      modRecs.push({
        id: moduleId,
        phaseId,
        roadmapId,
        name: level.name || `Module ${lIdx + 1}`,
        type: level.difficulty ?? level.type ?? null,
        description: level.description ?? null,
        status: level.status ?? 'current',
        orderIndex: lIdx,
      });

      const lessonsArr = asArray(level.lessons);
      for (let lesIdx = 0; lesIdx < lessonsArr.length; lesIdx++) {
        const lesson = lessonsArr[lesIdx];
        const lessonId = lesson.id || `les-${moduleId}-${lesIdx}`;

        lesRecs.push({
          id: lessonId,
          moduleId,
          phaseId,
          roadmapId,
          title: lesson.name || lesson.title || `Lesson ${lesIdx + 1}`,
          description: lesson.description ?? null,
          type: lesson.type ?? 'learn',
          xpReward: lesson.xpReward ?? 0,
          status: lesson.status ?? 'locked',
          learningObjectives: asTextArray(lesson.learningObjectives),
          prerequisites: asTextArray(lesson.prerequisites),
          difficulty: lesson.difficulty ?? null,
          estimatedMinutes: typeof lesson.estimatedMinutes === 'number' ? lesson.estimatedMinutes : null,
          skillTags: asTextArray(lesson.skillTags),
          contentStatus: 'pending',
          orderIndex: lesIdx,
        });

        if (lesson.content) {
          lesContents.push({
            lessonId,
            markdownContent: typeof lesson.content === 'string' ? lesson.content : null,
            summary: lesson.summary ?? null,
          });
        }
        if (lesson.type === 'quiz' && asArray(lesson.quizQuestions).length > 0) {
          quizRecs.push({
            id: `quiz-${lessonId}`,
            lessonId,
            moduleId,
            phaseId,
            roadmapId,
            title: lesson.name || lesson.title || 'Quiz',
            questions: lesson.quizQuestions,
            orderIndex: 0,
          });
        }
        if (lesson.codingExercise) {
          const ce = lesson.codingExercise;
          asgRecs.push({
            id: `asg-${lessonId}`,
            lessonId,
            moduleId,
            phaseId,
            roadmapId,
            title: lesson.name || lesson.title || 'Assignment',
            instructions: ce.instructions ?? null,
            templateCode: ce.templateCode ?? null,
            solutionCode: ce.solutionCode ?? null,
            validationSnippet: ce.validationSnippet ?? null,
            hint: ce.hint ?? null,
            orderIndex: 0,
          });
        }
      }

      const modResources = asArray(level.resources);
      for (let resIdx = 0; resIdx < modResources.length; resIdx++) {
        const resource = modResources[resIdx];
        resRecs.push({
          id: resource.id || `res-${moduleId}-${resIdx + 1}`,
          roadmapId,
          phaseId,
          moduleId,
          title: resource.title || 'Resource',
          type: resource.type ?? 'article',
          provider: resource.provider ?? null,
          url: resource.url ?? null,
          description: resource.description ?? null,
          duration: resource.duration ?? null,
        });
      }
    }

    const phaseProjectsArr = asArray(phase.projects);
    for (let projIdx = 0; projIdx < phaseProjectsArr.length; projIdx++) {
      const project = phaseProjectsArr[projIdx];
      projRecs.push({
        id: project.id || `proj-${phaseId}-${projIdx + 1}`,
        roadmapId,
        phaseId,
        title: project.title || 'Project',
        difficulty: project.difficulty ?? 'beginner',
        description: project.description ?? null,
        techStack: asTextArray(project.techStack),
        features: asTextArray(project.features),
        githubUrl: project.githubUrl ?? null,
        progress: typeof project.progress === 'number' ? project.progress : 0,
      });
    }
  }

  // Wrap all roadmap-structure inserts in a single transaction so a partial
  // failure (network blip, pool timeout) does not leave orphaned rows.
  // The concurrency limit is reduced inside the transaction because all
  // queries share a single connection from the pool.
  const TX_CONCURRENCY = 4;

  await db.transaction(async (tx) => {
    // 1. Insert the roadmap row first (everything else FKs to it).
    // Use insertRoadmapIfNew so a network retry never overwrites an existing roadmap.
    const isNew = await insertRoadmapIfNew({
      id: roadmapId,
      ownerEmail,
      title: jsonRoadmap.title || jsonRoadmap.goal || 'Untitled Roadmap',
      goal: jsonRoadmap.goal || jsonRoadmap.title || 'Untitled Goal',
      experienceLevel: jsonRoadmap.experienceLevel ?? null,
      weeklyHours: typeof jsonRoadmap.weeklyHours === 'number' ? jsonRoadmap.weeklyHours : null,
      preferredStyle: jsonRoadmap.preferredStyle ?? null,
      college: jsonRoadmap.college ?? null,
      branch: jsonRoadmap.branch ?? null,
      year: jsonRoadmap.year ?? null,
      progressPercent: jsonRoadmap.progressPercent ?? 0,
      totalXp: jsonRoadmap.totalXp ?? 0,
      lessonsCompleted: jsonRoadmap.lessonsCompleted ?? 0,
      hoursRemaining: typeof jsonRoadmap.hoursRemaining === 'number' ? jsonRoadmap.hoursRemaining : null,
      status: jsonRoadmap.status ?? 'current',
    }, tx);

    // If the roadmap already exists (duplicate submission / retry), abort the
    // transaction — child rows are already correct.
    if (!isNew) {
      logger.info({ roadmapId }, '[Roadmap] Skipping child-row inserts — already exists (idempotent)');
      return;
    }

    // 2. Write phases first (modules FK → phases).
    logger.debug({ roadmapId, count: phaseRecs.length }, '[Roadmap] Writing phases');
    await runConcurrent(phaseRecs.map(r => () => upsertPhase(r, tx)), TX_CONCURRENCY);

    // 3. Write modules in parallel (lessons FK → modules).
    logger.debug({ roadmapId, count: modRecs.length }, '[Roadmap] Writing modules');
    await runConcurrent(modRecs.map(r => () => upsertModule(r, tx)), TX_CONCURRENCY);

    // 4. Write lessons (lesson_content/quizzes/assignments FK → lessons).
    logger.debug({ roadmapId, count: lesRecs.length }, '[Roadmap] Writing lessons');
    await runConcurrent(lesRecs.map(r => () => upsertLesson(r, tx)), TX_CONCURRENCY);

    // 5. Write everything that depends on lessons, plus resources/projects.
    const step5Tasks: (() => Promise<void>)[] = [
      ...lesContents.map(c => () => upsertLessonContent({ lessonId: c.lessonId, markdownContent: c.markdownContent, summary: c.summary, modelUsed: 'migration-legacy-json', generatedAt: nowIso() }, tx)),
      ...quizRecs.map(r => () => upsertQuiz(r, tx)),
      ...asgRecs.map(r => () => upsertAssignment(r, tx)),
      ...resRecs.map(r => () => upsertResource(r, tx)),
      ...projRecs.map(r => () => upsertPhaseProject(r, tx)),
    ];
    logger.debug({ roadmapId, count: step5Tasks.length }, '[Roadmap] Writing dependent records');
    await runConcurrent(step5Tasks, TX_CONCURRENCY);

    // Roadmap-level resources fallback (legacy shape).
    const existingResourceIds = new Set<string>();
    for (const phase of phasesArr) {
      for (const lvl of asArray(phase.modules && phase.modules.length ? phase.modules : phase.levels)) {
        for (const r of asArray((lvl as any).resources)) {
          if (r.id) existingResourceIds.add(r.id);
        }
      }
    }
    const topResources = asArray(jsonRoadmap.resources);
    for (let rIdx = 0; rIdx < topResources.length; rIdx++) {
      const resource = topResources[rIdx];
      if (resource.id && existingResourceIds.has(resource.id)) continue;
      const resPhaseId =
        resource.phaseId && phasesArr.some((p: any) => p.id === resource.phaseId)
          ? resource.phaseId
          : null;
      await upsertResource({
        id: resource.id || `res-${roadmapId}-top-${rIdx + 1}`,
        roadmapId,
        phaseId: resPhaseId,
        moduleId: null,
        title: resource.title || 'Resource',
        type: resource.type ?? 'article',
        provider: resource.provider ?? null,
        url: resource.url ?? null,
        description: resource.description ?? null,
        duration: resource.duration ?? null,
      }, tx);
    }

    if (!phasesArr.some((p: any) => (p.projects || []).length > 0)) {
      const topProjects = asArray(jsonRoadmap.projects);
      for (let pIdx = 0; pIdx < topProjects.length; pIdx++) {
        const project = topProjects[pIdx];
        await upsertPhaseProject({
          id: project.id || `proj-${roadmapId}-top-${pIdx + 1}`,
          roadmapId,
          phaseId: null,
          title: project.title || 'Project',
          difficulty: project.difficulty ?? 'beginner',
          description: project.description ?? null,
          techStack: asTextArray(project.techStack),
          features: asTextArray(project.features),
          githubUrl: project.githubUrl ?? null,
          progress: typeof project.progress === 'number' ? project.progress : 0,
        }, tx);
      }
    }
  });

  // Backfill user_lesson_progress for lessons already marked completed in the
  // source JSON. Runs outside the transaction — user_lesson_progress uses its
  // own composite unique key and does not need to be atomic with the roadmap rows.
  for (const { lessonId, moduleId, phaseId } of completedLessonBackfills) {
    await upsertUserLessonProgress({
      ownerEmail,
      roadmapId,
      lessonId,
      moduleId,
      phaseId,
      completed: true,
      completedAt: nowIso(),
      attempts: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Create roadmap from AI-generated JSON
// ---------------------------------------------------------------------------

export async function createRoadmapFromJson(
  ownerEmail: string,
  jsonRoadmap: any
): Promise<void> {
  if (!jsonRoadmap || !jsonRoadmap.id) return;
  await migrateRoadmapJsonToTables(ownerEmail, jsonRoadmap);
}

// ---------------------------------------------------------------------------
// Lesson status update
// ---------------------------------------------------------------------------

export async function updateLessonStatus(
  lessonId: string,
  status: string
): Promise<void> {
  await db
    .update(lessons)
    .set({ status, updatedAt: new Date() })
    .where(eq(lessons.id, lessonId));
}

// ---------------------------------------------------------------------------
// Delete roadmap (cascades via FK)
// ---------------------------------------------------------------------------

export async function deleteRoadmap(roadmapId: string): Promise<number> {
  const result = await db
    .delete(roadmaps)
    .where(eq(roadmaps.id, roadmapId))
    .returning({ id: roadmaps.id });
  return result.length;
}

// ---------------------------------------------------------------------------
// Reconstruct nested frontend shape from normalized tables.
// ---------------------------------------------------------------------------

export async function reconstructRoadmapJson(roadmapId: string, ownerEmail?: string): Promise<any | null> {
  const normalized = await getNormalizedRoadmap(roadmapId, ownerEmail);
  if (!normalized) return null;

  const { roadmap, phases: normalizedPhases, resources: resourceRows, projects: projectRows } = normalized;

  const reconstructedPhases = normalizedPhases.map((p: any) => ({
    id: p.phase.id,
    name: p.phase.name,
    description: p.phase.description,
    estimatedHours: p.phase.estimatedHours ?? p.phase.estimated_hours,
    skillsCovered: asTextArray(p.phase.skillsCovered ?? p.phase.skills_covered),
    xpEarned: p.phase.xpEarned ?? p.phase.xp_earned,
    progress: p.phase.xpEarned ?? p.phase.xp_earned,
    status: p.phase.status,
    levels: p.modules.map((m: any) => ({
      id: m.module.id,
      name: m.module.name,
      type: m.module.type,
      status: m.module.status,
      lessons: m.lessons.map((l: any) => reconstructLesson(l)),
      // Include module-level resources on the level object so PhaseDetailPage
      // can display them in the Resources tab (H-02 fix).
      resources: (m.resources || []).map(reconstructResource),
    })),
  }));

  return {
    id: roadmap.id,
    ownerEmail: roadmap.ownerEmail ?? roadmap.owner_email,
    title: roadmap.title,
    goal: roadmap.goal,
    experienceLevel: roadmap.experienceLevel ?? roadmap.experience_level,
    weeklyHours: roadmap.weeklyHours ?? roadmap.weekly_hours,
    preferredStyle: roadmap.preferredStyle ?? roadmap.preferred_style,
    college: roadmap.college,
    branch: roadmap.branch,
    year: roadmap.year,
    progressPercent: roadmap.progressPercent ?? roadmap.progress_percent,
    totalXp: roadmap.totalXp ?? roadmap.total_xp,
    lessonsCompleted: roadmap.lessonsCompleted ?? roadmap.lessons_completed,
    hoursRemaining: roadmap.hoursRemaining ?? roadmap.hours_remaining,
    status: roadmap.status,
    createdAt: roadmap.createdAt ?? roadmap.created_at,
    phases: reconstructedPhases,
    resources: resourceRows.map(reconstructResource),
    projects: projectRows.map(reconstructProject),
  };
}

function reconstructLesson(lesson: any): any {
  const content = lesson.markdownContent ?? lesson.markdown_content ?? lesson.content;
  // Use per-user completion from user_lesson_progress (_completedByUser) as the
  // authoritative source for 'completed' status.  Fall back to the global
  // lessons.status for 'available' / 'locked' ordering so unlock sequencing
  // is preserved even when ownerEmail was not supplied.
  const status = lesson._completedByUser
    ? 'completed'
    : lesson._unlockedByUser
      ? 'available'
      : lesson.status;
  const base: any = {
    id: lesson.id,
    name: lesson.title,
    title: lesson.title,
    type: lesson.type,
    status,
    xpReward: lesson.xpReward ?? lesson.xp_reward,
    content: content ?? '',
    summary: lesson.summary ?? null,
    description: lesson.description ?? null,
    learningObjectives: asTextArray(lesson.learningObjectives ?? lesson.learning_objectives),
    prerequisites: asTextArray(lesson.prerequisites),
    difficulty: lesson.difficulty ?? null,
    estimatedMinutes: lesson.estimatedMinutes ?? lesson.estimated_minutes ?? null,
    skillTags: asTextArray(lesson.skillTags ?? lesson.skill_tags),
    contentStatus: lesson.contentStatus ?? lesson.content_status,
    workedExamples: asArray(lesson.workedExamples ?? lesson.worked_examples),
    exercises: asArray(lesson.exercises),
    orderIndex: lesson.orderIndex ?? lesson.order_index,
    completedAt: lesson._completedAt ?? null,
  };

  const lessonQuizzes = asArray(lesson.quizzes);
  if (lessonQuizzes.length > 0) {
    base.quizQuestions = asArray(lessonQuizzes[0].questions);
  }
  const lessonAssignments = asArray(lesson.assignments);
  if (lessonAssignments.length > 0) {
    const a = lessonAssignments[0];
    base.codingExercise = {
      templateCode: a.templateCode ?? a.template_code ?? '',
      solutionCode: a.solutionCode ?? a.solution_code ?? '',
      validationSnippet: a.validationSnippet ?? a.validation_snippet ?? '',
      instructions: a.instructions ?? '',
      hint: a.hint ?? '',
    };
  }
  return base;
}

function reconstructResource(resource: any): any {
  return {
    id: resource.id,
    phaseId: resource.phaseId ?? resource.phase_id,
    moduleId: resource.moduleId ?? resource.module_id,
    title: resource.title,
    type: resource.type,
    provider: resource.provider,
    url: resource.url,
    description: resource.description,
    duration: resource.duration,
    orderIndex: resource.orderIndex ?? resource.order_index,
  };
}

function reconstructProject(project: any): any {
  return {
    id: project.id,
    phaseId: project.phaseId ?? project.phase_id,
    title: project.title,
    difficulty: project.difficulty,
    description: project.description,
    techStack: asTextArray(project.techStack ?? project.tech_stack),
    features: asTextArray(project.features),
    githubUrl: project.githubUrl ?? project.github_url,
    progress: project.progress,
    orderIndex: project.orderIndex ?? project.order_index,
  };
}

// ---------------------------------------------------------------------------
// List all roadmaps for a user, reconstructed into the nested frontend shape.
// ---------------------------------------------------------------------------

export async function getUserRoadmapsReconstructed(
  ownerEmail: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ roadmaps: any[]; total: number }> {
  const normalizedEmail = ownerEmail.toLowerCase();
  const allRows = await getRoadmapsByOwner(normalizedEmail);
  const total = allRows.length;
  const { limit = 20, offset = 0 } = opts;
  const page = allRows.slice(offset, offset + limit);
  const result: any[] = [];
  for (const r of page) {
    const reconstructed = await reconstructRoadmapJson(r.id, normalizedEmail);
    if (reconstructed) result.push(reconstructed);
  }
  return { roadmaps: result, total };
}

// ---------------------------------------------------------------------------
// Find a lesson with its module/phase/roadmap context.
// ---------------------------------------------------------------------------

export async function findLessonContext(lessonId: string): Promise<any | null> {
  // Use db.execute() (raw SQL, no rowMode:'array') so the mock returns a plain
  // camelCase/snake_case object that callers can read without positional mapping.
  // The lessons table stores moduleId/phaseId/roadmapId directly — no join needed.
  const result = await db.execute(drizzleSql`
    SELECT id, module_id, phase_id, roadmap_id, title, description, type,
           xp_reward, status, learning_objectives, prerequisites, difficulty,
           estimated_minutes, skill_tags, content_status, order_index,
           created_at, updated_at
    FROM lessons
    WHERE id = ${lessonId}
    LIMIT 1
  `) as { rows: any[] };
  const row = result.rows?.[0];
  if (!row) return null;
  // Normalise: camelCase keys (from mock) or snake_case keys (from real pg).
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    xpReward: row.xpReward ?? row.xp_reward,
    estimatedMinutes: row.estimatedMinutes ?? row.estimated_minutes,
    contentStatus: row.contentStatus ?? row.content_status,
    orderIndex: row.orderIndex ?? row.order_index,
    learningObjectives: row.learningObjectives ?? row.learning_objectives,
    prerequisites: row.prerequisites,
    difficulty: row.difficulty,
    skillTags: row.skillTags ?? row.skill_tags,
    module_id: row.moduleId ?? row.module_id,
    phase_id: row.phaseId ?? row.phase_id,
    roadmap_id: row.roadmapId ?? row.roadmap_id,
  };
}

// ---------------------------------------------------------------------------
// Lesson completion
// ---------------------------------------------------------------------------

export async function completeLessonForUser(
  ownerEmail: string,
  lessonId: string,
  moduleId: string,
  phaseId: string,
  roadmapId: string,
  quizScore?: number | null,
  studyMinutes?: number
): Promise<{ completedLessons: number; totalLessons: number; progressPercent: number }> {
  await upsertUserLessonProgress({
    ownerEmail,
    roadmapId,
    lessonId,
    moduleId,
    phaseId,
    completed: true,
    completedAt: nowIso(),
    attempts: 1,
    quizScore: quizScore ?? null,
    studyMinutes: studyMinutes ?? 0,
  });

  await unlockNextLesson(lessonId, moduleId, ownerEmail);

  // Count totals from the authoritative per-user table, not the global
  // lessons.status column. This means a DB re-seed or migration that resets
  // lessons.status can never corrupt the progress counters written back to
  // the roadmaps table.
  const [totalLessonRows, completedRows] = await Promise.all([
    db.select({ id: lessons.id }).from(lessons).where(eq(lessons.roadmapId, roadmapId)),
    db
      .select({ lessonId: userLessonProgress.lessonId })
      .from(userLessonProgress)
      .where(
        and(
          eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
          eq(userLessonProgress.roadmapId, roadmapId),
          eq(userLessonProgress.completed, true)
        )
      ),
  ]);

  const totalLessons = totalLessonRows.length;
  const completedLessons = completedRows.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  await db
    .update(roadmaps)
    .set({ lessonsCompleted: completedLessons, progressPercent, updatedAt: new Date() })
    .where(eq(roadmaps.id, roadmapId));

  // If every lesson in the roadmap has a completed progress row for this user,
  // mark the roadmap itself as completed.  This replaces the old global
  // allLessonRows.every(l => l.status === 'completed') check that was in
  // unlockNextLesson and was based on the shared lessons.status column.
  if (totalLessons > 0 && completedLessons >= totalLessons) {
    await db
      .update(roadmaps)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(roadmaps.id, roadmapId));
  }

  return { completedLessons, totalLessons, progressPercent };
}

// ---------------------------------------------------------------------------
// Unlock next lesson after completion
// ---------------------------------------------------------------------------

export async function unlockNextLesson(
  lessonId: string,
  moduleId: string,
  ownerEmail: string
): Promise<void> {
  // Fetch current lesson's context (order, phase, roadmap).
  const ctxRows = await db
    .select({
      orderIndex: lessons.orderIndex,
      phaseId: modules.phaseId,
      roadmapId: modules.roadmapId,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!ctxRows[0]) return;

  const { orderIndex: lessonOrder, phaseId, roadmapId } = ctxRows[0];

  // Helper: write an is_unlocked row for a resolved next lesson.
  const writeUnlock = async (nextLessonId: string, nextModuleId: string, nextPhaseId: string) => {
    await upsertUserLessonProgress({
      ownerEmail,
      roadmapId,
      lessonId: nextLessonId,
      moduleId: nextModuleId,
      phaseId: nextPhaseId,
      isUnlocked: true,
    });
  };

  // 1) Next lesson in the same module (by order_index, no status filter).
  const nextInModule = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.moduleId, moduleId),
        gt(lessons.orderIndex, lessonOrder ?? 0)
      )
    )
    .orderBy(asc(lessons.orderIndex))
    .limit(1);

  if (nextInModule[0]) {
    await writeUnlock(nextInModule[0].id, moduleId, phaseId);
    await promoteContainerStatuses(moduleId, phaseId, roadmapId);
    return;
  }

  // 2) First lesson of the next module in the same phase.
  const moduleRows = await db
    .select({ id: modules.id, phaseId: modules.phaseId, roadmapId: modules.roadmapId, orderIndex: modules.orderIndex })
    .from(modules)
    .where(eq(modules.id, moduleId))
    .limit(1);

  if (moduleRows[0]) {
    const mod = moduleRows[0];
    const nextModule = await db
      .select({ id: modules.id })
      .from(modules)
      .where(
        and(
          eq(modules.phaseId, mod.phaseId),
          gt(modules.orderIndex, mod.orderIndex ?? 0)
        )
      )
      .orderBy(asc(modules.orderIndex))
      .limit(1);

    if (nextModule[0]) {
      const firstLesson = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.moduleId, nextModule[0].id))
        .orderBy(asc(lessons.orderIndex))
        .limit(1);
      if (firstLesson[0]) await writeUnlock(firstLesson[0].id, nextModule[0].id, mod.phaseId);
      await promoteContainerStatuses(nextModule[0].id, mod.phaseId, mod.roadmapId);
      return;
    }

    // 3) First module of the next phase.
    const currentPhaseRows = await db
      .select({ orderIndex: phases.orderIndex })
      .from(phases)
      .where(eq(phases.id, mod.phaseId))
      .limit(1);
    const currentPhaseOrder = currentPhaseRows[0]?.orderIndex ?? 0;

    const nextPhaseRows = await db
      .select({ id: phases.id, roadmapId: phases.roadmapId })
      .from(phases)
      .where(
        and(
          eq(phases.roadmapId, mod.roadmapId),
          gt(phases.orderIndex, currentPhaseOrder)
        )
      )
      .orderBy(asc(phases.orderIndex))
      .limit(1);

    if (nextPhaseRows[0]) {
      const firstModule = await db
        .select({ id: modules.id, phaseId: modules.phaseId })
        .from(modules)
        .where(eq(modules.phaseId, nextPhaseRows[0].id))
        .orderBy(asc(modules.orderIndex))
        .limit(1);

      if (firstModule[0]) {
        const firstLesson = await db
          .select({ id: lessons.id })
          .from(lessons)
          .where(eq(lessons.moduleId, firstModule[0].id))
          .orderBy(asc(lessons.orderIndex))
          .limit(1);
        if (firstLesson[0]) {
          await writeUnlock(firstLesson[0].id, firstModule[0].id, nextPhaseRows[0].id);
        }
        await promoteContainerStatuses(firstModule[0].id, nextPhaseRows[0].id, nextPhaseRows[0].roadmapId);
      }
      return;
    }

    // 4) No next phase — roadmap completion is checked in completeLessonForUser.
    await promoteContainerStatuses(mod.id, mod.phaseId, mod.roadmapId);
  }
}

async function promoteContainerStatuses(
  moduleId: string,
  phaseId: string,
  roadmapId: string
): Promise<void> {
  await db
    .update(modules)
    .set({ status: 'current', updatedAt: new Date() })
    .where(and(eq(modules.id, moduleId), eq(modules.status, 'locked')));
  await db
    .update(phases)
    .set({ status: 'current', updatedAt: new Date() })
    .where(and(eq(phases.id, phaseId), eq(phases.status, 'locked')));
  void roadmapId;
}

// ---------------------------------------------------------------------------
// Recompute roadmap counters
// ---------------------------------------------------------------------------

export async function recomputeRoadmapCounters(roadmapId: string, ownerEmail?: string): Promise<void> {
  const [totalLessonRows, completedRows] = await Promise.all([
    db.select({ id: lessons.id }).from(lessons).where(eq(lessons.roadmapId, roadmapId)),
    // When ownerEmail is supplied, use the per-user table (authoritative).
    // Without it (e.g. admin tooling), fall back to the global lessons.status.
    ownerEmail
      ? db
          .select({ lessonId: userLessonProgress.lessonId })
          .from(userLessonProgress)
          .where(
            and(
              eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
              eq(userLessonProgress.roadmapId, roadmapId),
              eq(userLessonProgress.completed, true)
            )
          )
      : db.select({ lessonId: lessons.id }).from(lessons).where(and(eq(lessons.roadmapId, roadmapId), eq(lessons.status, 'completed'))),
  ]);
  const totalLessons = totalLessonRows.length;
  const completedLessons = completedRows.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  await db
    .update(roadmaps)
    .set({ lessonsCompleted: completedLessons, progressPercent, updatedAt: new Date() })
    .where(eq(roadmaps.id, roadmapId));
}

// ---------------------------------------------------------------------------
// UserRoadmapState
// ---------------------------------------------------------------------------

export async function upsertRoadmapState(state: {
  ownerEmail: string;
  roadmapId: string;
  currentLessonId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<void> {
  const id = `${state.ownerEmail.toLowerCase()}::${state.roadmapId}`;
  const startedAt = state.startedAt ? new Date(state.startedAt) : new Date();
  const completedAt = state.completedAt ? new Date(state.completedAt) : null;
  await db.insert(userRoadmapState).values({
    id,
    ownerEmail: state.ownerEmail.toLowerCase(),
    roadmapId: state.roadmapId,
    currentLessonId: state.currentLessonId ?? null,
    startedAt,
    completedAt,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userRoadmapState.ownerEmail, userRoadmapState.roadmapId],
    set: {
      currentLessonId: drizzleSql`COALESCE(EXCLUDED.current_lesson_id, user_roadmap_state.current_lesson_id)`,
      startedAt: drizzleSql`COALESCE(user_roadmap_state.started_at, EXCLUDED.started_at)`,
      completedAt: drizzleSql`COALESCE(EXCLUDED.completed_at, user_roadmap_state.completed_at)`,
      updatedAt: new Date(),
    },
  });
}

export async function getRoadmapState(
  ownerEmail: string,
  roadmapId: string
): Promise<any | null> {
  const rows = await db
    .select()
    .from(userRoadmapState)
    .where(
      and(
        eq(userRoadmapState.ownerEmail, ownerEmail.toLowerCase()),
        eq(userRoadmapState.roadmapId, roadmapId)
      )
    );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Roadmap progress snapshot
// ---------------------------------------------------------------------------

export async function getRoadmapProgressSnapshot(
  ownerEmail: string,
  roadmapId: string
): Promise<any> {
  const progressRows = await db
    .select({
      lessonId: userLessonProgress.lessonId,
      completed: userLessonProgress.completed,
      xpReward: lessons.xpReward,
    })
    .from(userLessonProgress)
    .innerJoin(lessons, eq(lessons.id, userLessonProgress.lessonId))
    .where(
      and(
        eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
        eq(userLessonProgress.roadmapId, roadmapId)
      )
    );

  const completedLessonIds = progressRows.filter((p: any) => p.completed).map((p: any) => p.lessonId);
  const totalXP = progressRows
    .filter((p: any) => p.completed)
    .reduce((sum: number, p: any) => sum + (Number(p.xpReward) || 0), 0);

  const lessonRows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.roadmapId, roadmapId));
  const totalLessons = lessonRows.length;
  const progressPercentage = totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0;

  const state = await getRoadmapState(ownerEmail, roadmapId);

  return {
    userId: ownerEmail,
    roadmapId,
    currentLessonId: state?.currentLessonId ?? state?.current_lesson_id ?? null,
    completedLessonIds,
    totalXP,
    progressPercentage,
    startedAt: state?.startedAt ?? state?.started_at ?? null,
    completedAt: state?.completedAt ?? state?.completed_at ?? null,
    updatedAt: state?.updatedAt ?? state?.updated_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Aggregate completion stats across all roadmaps
// ---------------------------------------------------------------------------

export async function getUserLessonCompletionStats(
  ownerEmail: string
): Promise<{ totalLessons: number; completedLessons: number }> {
  // Count total lessons across all roadmaps owned by this user.
  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(roadmaps, eq(roadmaps.id, lessons.roadmapId))
    .where(eq(roadmaps.ownerEmail, ownerEmail.toLowerCase()));
  const totalLessons = allLessons.length;

  // Count completions from the per-user progress table — the authoritative source.
  const completedRows = await db
    .select({ lessonId: userLessonProgress.lessonId })
    .from(userLessonProgress)
    .where(
      and(
        eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()),
        eq(userLessonProgress.completed, true)
      )
    );
  return { totalLessons, completedLessons: completedRows.length };
}

// ---------------------------------------------------------------------------
// Backfill user_lesson_progress for lessons that are marked completed in the
// global lessons table but have no per-user row yet.
// Called at bootstrap so every completed lesson is visible via _completedByUser.
// ---------------------------------------------------------------------------

export async function backfillUserLessonProgress(ownerEmail: string): Promise<void> {
  // Find all lessons owned by this user that are globally 'completed' but
  // have no user_lesson_progress row for this user.
  const completedLessonRows = await db
    .select({
      lessonId: lessons.id,
      moduleId: lessons.moduleId,
      phaseId: lessons.phaseId,
      roadmapId: lessons.roadmapId,
      estimatedMinutes: lessons.estimatedMinutes,
    })
    .from(lessons)
    .innerJoin(roadmaps, eq(roadmaps.id, lessons.roadmapId))
    .where(
      and(
        eq(roadmaps.ownerEmail, ownerEmail.toLowerCase()),
        eq(lessons.status, 'completed')
      )
    );

  if (completedLessonRows.length === 0) return;

  // Find which ones already have a per-user row.
  const existingRows = await db
    .select({ lessonId: userLessonProgress.lessonId })
    .from(userLessonProgress)
    .where(eq(userLessonProgress.ownerEmail, ownerEmail.toLowerCase()));

  const existingSet = new Set(existingRows.map((r: any) => r.lessonId));

  const toBackfill = completedLessonRows.filter((r: any) => !existingSet.has(r.lessonId));
  if (toBackfill.length === 0) return;

  // Insert missing rows in chunks to avoid a single massive INSERT.
  const CHUNK = 50;
  for (let i = 0; i < toBackfill.length; i += CHUNK) {
    const chunk = toBackfill.slice(i, i + CHUNK);
    await db.insert(userLessonProgress).values(
      chunk.map((r: any) => ({
        id: `${ownerEmail.toLowerCase()}::${r.lessonId}`,
        ownerEmail: ownerEmail.toLowerCase(),
        roadmapId: r.roadmapId,
        lessonId: r.lessonId,
        moduleId: r.moduleId,
        phaseId: r.phaseId,
        completed: true,
        completedAt: new Date(),
        attempts: 1,
        studyMinutes: Number(r.estimatedMinutes) || 0,
        updatedAt: new Date(),
      }))
    ).onConflictDoNothing();
  }
}
