// Normalized roadmap relational schema + repository layer (raw neon SQL).
//
// This module introduces a normalized relational model alongside the legacy
// monolithic JSONB `roadmap` column in the `users` table. Existing APIs that
// read the JSONB blob keep working; the functions here let callers WRITE and
// READ the normalized tables, and `migrateRoadmapJsonToTables()` safely
// backfills existing roadmap JSON into the new tables without data loss.
//
// Style note: this intentionally mirrors the existing `neon` tagged-template
// usage and `ensureUsersTable()` pattern from server.ts rather than pulling in
// a separate ORM. A parallel `drizzle/schema.ts` file documents the same model
// as the forward-looking migration target.

import { neon } from '@neondatabase/serverless';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = any;

const sql: NeonSql = neon(process.env.DATABASE_URL!);

// ---------------------------------------------------------------------------
// Table creation
// ---------------------------------------------------------------------------

let roadmapTablesReady: Promise<void> | null = null;

export async function ensureRoadmapTables(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[Database Warning] DATABASE_URL not set; roadmap tables not created.');
    return;
  }

  if (!roadmapTablesReady) {
    roadmapTablesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS roadmaps (
          id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
          title TEXT NOT NULL,
          goal TEXT NOT NULL,
          experience_level TEXT,
          weekly_hours INTEGER,
          preferred_style TEXT,
          college TEXT,
          branch TEXT,
          year TEXT,
          progress_percent INTEGER NOT NULL DEFAULT 0,
          total_xp INTEGER NOT NULL DEFAULT 0,
          lessons_completed INTEGER NOT NULL DEFAULT 0,
          hours_remaining INTEGER,
          status TEXT NOT NULL DEFAULT 'current',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS phases (
          id TEXT PRIMARY KEY,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          estimated_hours INTEGER,
          skills_covered JSONB NOT NULL DEFAULT '[]',
          xp_earned INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'current',
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_phases_roadmap ON phases(roadmap_id, order_index)`;

      await sql`
        CREATE TABLE IF NOT EXISTS modules (
          id TEXT PRIMARY KEY,
          phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT,
          status TEXT NOT NULL DEFAULT 'current',
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_modules_phase ON modules(phase_id, order_index)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_modules_roadmap ON modules(roadmap_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS lessons (
          id TEXT PRIMARY KEY,
          module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL DEFAULT 'learn',
          xp_reward INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'locked',
          learning_objectives JSONB NOT NULL DEFAULT '[]',
          prerequisites JSONB NOT NULL DEFAULT '[]',
          difficulty TEXT,
          estimated_minutes INTEGER,
          skill_tags JSONB NOT NULL DEFAULT '[]',
          content_status TEXT NOT NULL DEFAULT 'pending',
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id, order_index)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_lessons_roadmap ON lessons(roadmap_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS lesson_content (
          lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
          markdown_content TEXT,
          worked_examples JSONB NOT NULL DEFAULT '[]',
          exercises JSONB NOT NULL DEFAULT '[]',
          summary TEXT,
          generated_at TIMESTAMP,
          model_used TEXT,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS quizzes (
          id TEXT PRIMARY KEY,
          lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          questions JSONB NOT NULL DEFAULT '[]',
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_quizzes_roadmap ON quizzes(roadmap_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS assignments (
          id TEXT PRIMARY KEY,
          lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          instructions TEXT,
          template_code TEXT,
          solution_code TEXT,
          validation_snippet TEXT,
          hint TEXT,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_assignments_lesson ON assignments(lesson_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_assignments_roadmap ON assignments(roadmap_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS resources (
          id TEXT PRIMARY KEY,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,
          module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'article',
          provider TEXT,
          url TEXT,
          description TEXT,
          duration TEXT,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_resources_roadmap ON resources(roadmap_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_resources_phase ON resources(phase_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS phase_projects (
          id TEXT PRIMARY KEY,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          difficulty TEXT NOT NULL DEFAULT 'beginner',
          description TEXT,
          tech_stack JSONB NOT NULL DEFAULT '[]',
          features JSONB NOT NULL DEFAULT '[]',
          github_url TEXT,
          progress INTEGER NOT NULL DEFAULT 0,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_phase_projects_roadmap ON phase_projects(roadmap_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS user_lesson_progress (
          id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
          phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
          completed BOOLEAN NOT NULL DEFAULT FALSE,
          completed_at TIMESTAMP,
          attempts INTEGER NOT NULL DEFAULT 0,
          quiz_score INTEGER,
          study_minutes INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (owner_email, lesson_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_progress_owner ON user_lesson_progress(owner_email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_progress_lesson ON user_lesson_progress(lesson_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_progress_roadmap ON user_lesson_progress(roadmap_id, owner_email)`;

      await sql`
        CREATE TABLE IF NOT EXISTS user_roadmap_state (
          id TEXT PRIMARY KEY,
          owner_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
          roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
          current_lesson_id TEXT,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (owner_email, roadmap_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_roadmap_state_owner ON user_roadmap_state(owner_email)`;

      console.log('[Database] Normalized roadmap tables ready.');
    })().catch((err: any) => {
      console.error('[Database Error] Failed to initialize roadmap tables:', err);
      roadmapTablesReady = null; // allow retry on next call
      throw err;
    });
  }

  return roadmapTablesReady;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function asTextArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') return [value];
  return [];
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

// Serialize a value for a JSONB column. neon interprets a bare JS Array as a
// Postgres array literal ({x,y}) which is INVALID JSON and fails to insert into
// a JSONB column. Passing a JSON string instead makes neon treat it as JSON
// text, which is what JSONB expects. Always safe (also handles objects/scalars).
function jsonb(value: any): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'string') {
    // Already a JSON string? validate; if not, wrap as a JSON string.
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  }
  return JSON.stringify(value);
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
  await ensureRoadmapTables();
  await sql`
    INSERT INTO roadmaps (
      id, owner_email, title, goal, experience_level, weekly_hours,
      preferred_style, college, branch, year, progress_percent, total_xp,
      lessons_completed, hours_remaining, status, updated_at
    )
    VALUES (
      ${roadmap.id}, ${roadmap.ownerEmail.toLowerCase()}, ${roadmap.title}, ${roadmap.goal},
      ${roadmap.experienceLevel ?? null}, ${roadmap.weeklyHours ?? null}, ${roadmap.preferredStyle ?? null},
      ${roadmap.college ?? null}, ${roadmap.branch ?? null}, ${roadmap.year ?? null},
      ${roadmap.progressPercent ?? 0}, ${roadmap.totalXp ?? 0}, ${roadmap.lessonsCompleted ?? 0},
      ${roadmap.hoursRemaining ?? null}, ${roadmap.status ?? 'current'}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      goal = EXCLUDED.goal,
      experience_level = EXCLUDED.experience_level,
      weekly_hours = EXCLUDED.weekly_hours,
      preferred_style = EXCLUDED.preferred_style,
      college = EXCLUDED.college,
      branch = EXCLUDED.branch,
      year = EXCLUDED.year,
      progress_percent = EXCLUDED.progress_percent,
      total_xp = EXCLUDED.total_xp,
      lessons_completed = EXCLUDED.lessons_completed,
      hours_remaining = EXCLUDED.hours_remaining,
      status = EXCLUDED.status,
      updated_at = NOW()
  `;
}

export async function getRoadmapById(roadmapId: string): Promise<any | null> {
  await ensureRoadmapTables();
  const rows = await sql`SELECT * FROM roadmaps WHERE id = ${roadmapId}`;
  return rows[0] || null;
}

export async function getRoadmapsByOwner(ownerEmail: string): Promise<any[]> {
  await ensureRoadmapTables();
  return sql`
    SELECT * FROM roadmaps
    WHERE owner_email = ${ownerEmail.toLowerCase()}
    ORDER BY created_at DESC
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO phases (id, roadmap_id, name, description, estimated_hours, skills_covered, xp_earned, status, order_index, updated_at)
    VALUES (
      ${phase.id}, ${phase.roadmapId}, ${phase.name}, ${phase.description ?? null},
      ${phase.estimatedHours ?? null}, ${jsonb(phase.skillsCovered ?? [])}, ${phase.xpEarned ?? 0},
      ${phase.status ?? 'current'}, ${phase.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      estimated_hours = EXCLUDED.estimated_hours,
      skills_covered = EXCLUDED.skills_covered,
      xp_earned = EXCLUDED.xp_earned,
      status = EXCLUDED.status,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO modules (id, phase_id, roadmap_id, name, type, status, order_index, updated_at)
    VALUES (
      ${module.id}, ${module.phaseId}, ${module.roadmapId}, ${module.name},
      ${module.type ?? null}, ${module.status ?? 'current'}, ${module.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO lessons (
      id, module_id, phase_id, roadmap_id, title, description, type, xp_reward,
      status, learning_objectives, prerequisites, difficulty, estimated_minutes,
      skill_tags, content_status, order_index, updated_at
    )
    VALUES (
      ${lesson.id}, ${lesson.moduleId}, ${lesson.phaseId}, ${lesson.roadmapId}, ${lesson.title},
      ${lesson.description ?? null}, ${lesson.type ?? 'learn'}, ${lesson.xpReward ?? 0},
      ${lesson.status ?? 'locked'}, ${jsonb(lesson.learningObjectives ?? [])}, ${jsonb(lesson.prerequisites ?? [])},
      ${lesson.difficulty ?? null}, ${lesson.estimatedMinutes ?? null}, ${jsonb(lesson.skillTags ?? [])},
      ${lesson.contentStatus ?? 'pending'}, ${lesson.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      module_id = EXCLUDED.module_id,
      phase_id = EXCLUDED.phase_id,
      roadmap_id = EXCLUDED.roadmap_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      type = EXCLUDED.type,
      xp_reward = EXCLUDED.xp_reward,
      status = EXCLUDED.status,
      learning_objectives = EXCLUDED.learning_objectives,
      prerequisites = EXCLUDED.prerequisites,
      difficulty = EXCLUDED.difficulty,
      estimated_minutes = EXCLUDED.estimated_minutes,
      skill_tags = EXCLUDED.skill_tags,
      content_status = EXCLUDED.content_status,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
}

export async function getLessonById(lessonId: string): Promise<any | null> {
  await ensureRoadmapTables();
  const rows = await sql`
    SELECT lessons.*, lesson_content.*
    FROM lessons
    LEFT JOIN lesson_content ON lesson_content.lesson_id = lessons.id
    WHERE lessons.id = ${lessonId}
  `;
  return rows[0] || null;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO lesson_content (
      lesson_id, markdown_content, worked_examples, exercises, summary, model_used, generated_at, updated_at
    )
    VALUES (
      ${content.lessonId}, ${content.markdownContent ?? null}, ${jsonb(content.workedExamples ?? [])},
      ${jsonb(content.exercises ?? [])}, ${content.summary ?? null}, ${content.modelUsed ?? null},
      ${content.generatedAt ?? nowIso()}, NOW()
    )
    ON CONFLICT (lesson_id) DO UPDATE SET
      markdown_content = COALESCE(EXCLUDED.markdown_content, lesson_content.markdown_content),
      worked_examples = COALESCE(EXCLUDED.worked_examples, lesson_content.worked_examples),
      exercises = COALESCE(EXCLUDED.exercises, lesson_content.exercises),
      summary = COALESCE(EXCLUDED.summary, lesson_content.summary),
      model_used = COALESCE(EXCLUDED.model_used, lesson_content.model_used),
      generated_at = COALESCE(EXCLUDED.generated_at, lesson_content.generated_at),
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO quizzes (id, lesson_id, module_id, phase_id, roadmap_id, title, questions, order_index, updated_at)
    VALUES (
      ${quiz.id}, ${quiz.lessonId}, ${quiz.moduleId}, ${quiz.phaseId}, ${quiz.roadmapId},
      ${quiz.title}, ${jsonb(quiz.questions ?? [])}, ${quiz.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      lesson_id = EXCLUDED.lesson_id,
      module_id = EXCLUDED.module_id,
      phase_id = EXCLUDED.phase_id,
      roadmap_id = EXCLUDED.roadmap_id,
      title = EXCLUDED.title,
      questions = EXCLUDED.questions,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO assignments (
      id, lesson_id, module_id, phase_id, roadmap_id, title, instructions,
      template_code, solution_code, validation_snippet, hint, order_index, updated_at
    )
    VALUES (
      ${assignment.id}, ${assignment.lessonId}, ${assignment.moduleId}, ${assignment.phaseId}, ${assignment.roadmapId},
      ${assignment.title}, ${assignment.instructions ?? null}, ${assignment.templateCode ?? null},
      ${assignment.solutionCode ?? null}, ${assignment.validationSnippet ?? null}, ${assignment.hint ?? null},
      ${assignment.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      lesson_id = EXCLUDED.lesson_id,
      module_id = EXCLUDED.module_id,
      phase_id = EXCLUDED.phase_id,
      roadmap_id = EXCLUDED.roadmap_id,
      title = EXCLUDED.title,
      instructions = EXCLUDED.instructions,
      template_code = EXCLUDED.template_code,
      solution_code = EXCLUDED.solution_code,
      validation_snippet = EXCLUDED.validation_snippet,
      hint = EXCLUDED.hint,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO resources (id, roadmap_id, phase_id, module_id, title, type, provider, url, description, duration, order_index, updated_at)
    VALUES (
      ${resource.id}, ${resource.roadmapId}, ${resource.phaseId ?? null}, ${resource.moduleId ?? null},
      ${resource.title}, ${resource.type ?? 'article'}, ${resource.provider ?? null},
      ${resource.url ?? null}, ${resource.description ?? null}, ${resource.duration ?? null},
      ${resource.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      phase_id = EXCLUDED.phase_id,
      module_id = EXCLUDED.module_id,
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      provider = EXCLUDED.provider,
      url = EXCLUDED.url,
      description = EXCLUDED.description,
      duration = EXCLUDED.duration,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
}): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    INSERT INTO phase_projects (id, roadmap_id, phase_id, title, difficulty, description, tech_stack, features, github_url, progress, order_index, updated_at)
    VALUES (
      ${project.id}, ${project.roadmapId}, ${project.phaseId ?? null}, ${project.title},
      ${project.difficulty ?? 'beginner'}, ${project.description ?? null}, ${jsonb(project.techStack ?? [])},
      ${jsonb(project.features ?? [])}, ${project.githubUrl ?? null}, ${project.progress ?? 0},
      ${project.orderIndex ?? 0}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      phase_id = EXCLUDED.phase_id,
      title = EXCLUDED.title,
      difficulty = EXCLUDED.difficulty,
      description = EXCLUDED.description,
      tech_stack = EXCLUDED.tech_stack,
      features = EXCLUDED.features,
      github_url = EXCLUDED.github_url,
      progress = EXCLUDED.progress,
      order_index = EXCLUDED.order_index,
      updated_at = NOW()
  `;
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
  attempts?: number;
  quizScore?: number | null;
  studyMinutes?: number;
}): Promise<void> {
  await ensureRoadmapTables();
  const id = `${progress.ownerEmail.toLowerCase()}::${progress.lessonId}`;
  await sql`
    INSERT INTO user_lesson_progress (
      id, owner_email, roadmap_id, lesson_id, module_id, phase_id,
      completed, completed_at, attempts, quiz_score, study_minutes, updated_at
    )
    VALUES (
      ${id}, ${progress.ownerEmail.toLowerCase()}, ${progress.roadmapId}, ${progress.lessonId},
      ${progress.moduleId}, ${progress.phaseId}, ${progress.completed ?? false},
      ${progress.completedAt ?? null}, ${progress.attempts ?? 0}, ${progress.quizScore ?? null},
      ${progress.studyMinutes ?? 0}, NOW()
    )
    ON CONFLICT (owner_email, lesson_id) DO UPDATE SET
      roadmap_id = EXCLUDED.roadmap_id,
      module_id = EXCLUDED.module_id,
      phase_id = EXCLUDED.phase_id,
      completed = COALESCE(EXCLUDED.completed, user_lesson_progress.completed),
      completed_at = COALESCE(EXCLUDED.completed_at, user_lesson_progress.completed_at),
      attempts = GREATEST(user_lesson_progress.attempts, EXCLUDED.attempts),
      quiz_score = COALESCE(EXCLUDED.quiz_score, user_lesson_progress.quiz_score),
      study_minutes = GREATEST(user_lesson_progress.study_minutes, EXCLUDED.study_minutes),
      updated_at = NOW()
  `;
}

// Increment the open-attempt counter for a lesson without touching completion
// state. Uses addition (not GREATEST) so repeated opens accumulate correctly.
// Idempotent across repeated migrations (a missing row starts at 0 then +1).
export async function incrementLessonAttempts(
  ownerEmail: string,
  lessonId: string,
  moduleId: string,
  phaseId: string,
  roadmapId: string
): Promise<void> {
  await ensureRoadmapTables();
  const id = `${ownerEmail.toLowerCase()}::${lessonId}`;
  await sql`
    INSERT INTO user_lesson_progress (
      id, owner_email, roadmap_id, lesson_id, module_id, phase_id,
      completed, attempts, updated_at
    )
    VALUES (
      ${id}, ${ownerEmail.toLowerCase()}, ${roadmapId}, ${lessonId},
      ${moduleId}, ${phaseId}, false, 1, NOW()
    )
    ON CONFLICT (owner_email, lesson_id) DO UPDATE SET
      attempts = user_lesson_progress.attempts + 1,
      updated_at = NOW()
  `;
}

export async function getUserLessonProgress(
  ownerEmail: string,
  roadmapId: string
): Promise<any[]> {
  await ensureRoadmapTables();
  return sql`
    SELECT * FROM user_lesson_progress
    WHERE owner_email = ${ownerEmail.toLowerCase()} AND roadmap_id = ${roadmapId}
    ORDER BY updated_at DESC
  `;
}

// Fetch a single user's progress row for one lesson (used by the idempotent
// completion check). Returns null when no row exists yet.
export async function getLessonProgress(
  ownerEmail: string,
  lessonId: string
): Promise<any | null> {
  await ensureRoadmapTables();
  const rows = await sql`
    SELECT * FROM user_lesson_progress
    WHERE owner_email = ${ownerEmail.toLowerCase()} AND lesson_id = ${lessonId}
    LIMIT 1
  `;
  return rows[0] || null;
}

// Read the user's current streak WITHOUT mutating last_active_date. Used to
// report streak in idempotent (already-completed) completion responses.
export async function getCurrentStreak(ownerEmail: string): Promise<number> {
  await ensureRoadmapTables();
  const result = await sql`
    SELECT streak FROM users WHERE email = ${ownerEmail.toLowerCase()} LIMIT 1
  `;
  return result[0]?.streak ?? 0;
}

// Recompute and return a roadmap's completion percentage from lesson statuses.
// Read-only; used by the idempotent completion response.
export async function getRoadmapProgressPercent(roadmapId: string): Promise<number> {
  await ensureRoadmapTables();
  const lessonRows = await sql`SELECT status FROM lessons WHERE roadmap_id = ${roadmapId}`;
  const totalLessons = lessonRows.length;
  const completedLessons = lessonRows.filter((l: any) => l.status === 'completed').length;
  return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Read a fully normalized roadmap (joins all levels)
// ---------------------------------------------------------------------------

export async function getNormalizedRoadmap(roadmapId: string): Promise<any | null> {
  await ensureRoadmapTables();

  const roadmap = await getRoadmapById(roadmapId);
  if (!roadmap) return null;

  const phases = await sql`SELECT * FROM phases WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const modules = await sql`SELECT * FROM modules WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const lessons = await sql`SELECT * FROM lessons WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const quizzes = await sql`SELECT * FROM quizzes WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const assignments = await sql`SELECT * FROM assignments WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const resources = await sql`SELECT * FROM resources WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;
  const projects = await sql`SELECT * FROM phase_projects WHERE roadmap_id = ${roadmapId} ORDER BY order_index`;

  const modulesByPhase = new Map<string, any[]>();
  for (const m of modules) {
    const list = modulesByPhase.get(m.phase_id) || [];
    list.push(m);
    modulesByPhase.set(m.phase_id, list);
  }

  const lessonsByModule = new Map<string, any[]>();
  for (const l of lessons) {
    const list = lessonsByModule.get(l.module_id) || [];
    list.push(l);
    lessonsByModule.set(l.module_id, list);
  }

  const quizzesByLesson = new Map<string, any[]>();
  for (const q of quizzes) {
    const list = quizzesByLesson.get(q.lesson_id) || [];
    list.push(q);
    quizzesByLesson.set(q.lesson_id, list);
  }

  const assignmentsByLesson = new Map<string, any[]>();
  for (const a of assignments) {
    const list = assignmentsByLesson.get(a.lesson_id) || [];
    list.push(a);
    assignmentsByLesson.set(a.lesson_id, list);
  }

  const resourcesByModule = new Map<string, any[]>();
  for (const r of resources) {
    if (!r.module_id) continue;
    const list = resourcesByModule.get(r.module_id) || [];
    list.push(r);
    resourcesByModule.set(r.module_id, list);
  }

  const projectsByPhase = new Map<string, any[]>();
  for (const p of projects) {
    const key = p.phase_id || '__orphan__';
    const list = projectsByPhase.get(key) || [];
    list.push(p);
    projectsByPhase.set(key, list);
  }

  const normalizedPhases = phases.map((phase: any) => ({
    phase,
    projects: projectsByPhase.get(phase.id) || projectsByPhase.get('__orphan__') || [],
    modules: (modulesByPhase.get(phase.id) || []).map((module: any) => ({
      module,
      lessons: (lessonsByModule.get(module.id) || []).map((lesson: any) => ({
        ...lesson,
        quizzes: quizzesByLesson.get(lesson.id) || [],
        assignments: assignmentsByLesson.get(lesson.id) || [],
        resources: resourcesByModule.get(module.id) || []
      })),
      quizzes: quizzes.filter((q: any) => q.module_id === module.id),
      assignments: assignments.filter((a: any) => a.module_id === module.id),
      resources: resources.filter((r: any) => r.module_id === module.id)
    }))
  }));

  return {
    roadmap,
    phases: normalizedPhases,
    resources,
    projects
  };
}

// ---------------------------------------------------------------------------
// Safe migration: backfill normalized tables from existing JSONB roadmap data.
// Idempotent — re-running will not duplicate rows (all upserts are keyed).
// Existing JSONB data is preserved untouched; nothing is deleted.
// ---------------------------------------------------------------------------

export async function migrateRoadmapJsonToTables(
  ownerEmail: string,
  jsonRoadmap: any
): Promise<void> {
  if (!jsonRoadmap || !jsonRoadmap.id) return;

  await ensureRoadmapTables();

  const roadmapId = jsonRoadmap.id;
  const meta = (jsonRoadmap.resources || []).length; // touch to avoid unused warnings

  await upsertRoadmap({
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
    status: jsonRoadmap.status ?? 'current'
  });

  const phases = asArray(jsonRoadmap.phases);
  for (let pIdx = 0; pIdx < phases.length; pIdx++) {
    const phase = phases[pIdx];
    const phaseId = phase.id || `ph-${roadmapId}-${pIdx}`;
    await upsertPhase({
      id: phaseId,
      roadmapId,
      name: phase.name || `Phase ${pIdx + 1}`,
      description: phase.description ?? null,
      estimatedHours: typeof phase.estimatedHours === 'number' ? phase.estimatedHours : null,
      skillsCovered: asTextArray(phase.skillsCovered),
      xpEarned: phase.xpEarned ?? 0,
      status: phase.status ?? 'current',
      orderIndex: pIdx
    });

    const levels = asArray(phase.modules && phase.modules.length ? phase.modules : phase.levels);
    for (let lIdx = 0; lIdx < levels.length; lIdx++) {
      const level = levels[lIdx];
      const moduleId = level.id || `mod-${phaseId}-${lIdx}`;
      await upsertModule({
        id: moduleId,
        phaseId,
        roadmapId,
        name: level.name || `Module ${lIdx + 1}`,
        type: level.difficulty ?? level.type ?? null,
        description: level.description ?? null,
        status: level.status ?? 'current',
        orderIndex: lIdx
      });

      const lessons = asArray(level.lessons);
      for (let lesIdx = 0; lesIdx < lessons.length; lesIdx++) {
        const lesson = lessons[lesIdx];
        const lessonId = lesson.id || `les-${moduleId}-${lesIdx}`;
        await upsertLesson({
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
          orderIndex: lesIdx
        });

        // Legacy inline content/quiz/assignment support (retained for back-compat).
        if (lesson.content) {
          await upsertLessonContent({
            lessonId,
            markdownContent: typeof lesson.content === 'string' ? lesson.content : null,
            summary: lesson.summary ?? null,
            modelUsed: 'migration-legacy-json',
            generatedAt: nowIso()
          });
        }
        if (lesson.type === 'quiz' && asArray(lesson.quizQuestions).length > 0) {
          await upsertQuiz({
            id: `quiz-${lessonId}`,
            lessonId,
            moduleId,
            phaseId,
            roadmapId,
            title: lesson.name || lesson.title || 'Quiz',
            questions: lesson.quizQuestions,
            orderIndex: 0
          });
        }
        if (lesson.codingExercise) {
          const ce = lesson.codingExercise;
          await upsertAssignment({
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
            orderIndex: 0
          });
        }
      }

      // Resources that belong to this module (new curriculum shape). Deterministic
      // IDs (res-{moduleId}-{index}) so re-migration never duplicates rows.
      const modResources = asArray(level.resources);
      for (let resIdx = 0; resIdx < modResources.length; resIdx++) {
        const resource = modResources[resIdx];
        await upsertResource({
          id: resource.id || `res-${moduleId}-${resIdx + 1}`,
          roadmapId,
          phaseId,
          moduleId,
          title: resource.title || 'Resource',
          type: resource.type ?? 'article',
          provider: resource.provider ?? null,
          url: resource.url ?? null,
          description: resource.description ?? null,
          duration: resource.duration ?? null
        });
      }
    }

    // Projects attached to this phase (new curriculum shape prefers phase.projects).
    // Deterministic IDs (proj-{phaseId}-{index}) so re-migration never duplicates.
    const phaseProjects = asArray(phase.projects);
    for (let projIdx = 0; projIdx < phaseProjects.length; projIdx++) {
      const project = phaseProjects[projIdx];
      await upsertPhaseProject({
        id: project.id || `proj-${phaseId}-${projIdx + 1}`,
        roadmapId,
        phaseId,
        title: project.title || 'Project',
        difficulty: project.difficulty ?? 'beginner',
        description: project.description ?? null,
        techStack: asTextArray(project.techStack),
        features: asTextArray(project.features),
        githubUrl: project.githubUrl ?? null,
        progress: typeof project.progress === 'number' ? project.progress : 0
      });
    }
  }

  // Roadmap-level resources/projects fallback (legacy shape) — only if not already
  // provided per-phase above.
  const existingResourceIds = new Set<string>();
  for (const phase of phases) {
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
      resource.phaseId && phases.some((p: any) => p.id === resource.phaseId)
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
      duration: resource.duration ?? null
    });
  }

  if (!phases.some((p: any) => (p.projects || []).length > 0)) {
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
        progress: typeof project.progress === 'number' ? project.progress : 0
      });
    }
  }

  // Migrate existing completed lesson progress from the JSONB roadmap statuses.
  for (const phase of phases) {
    for (const level of asArray(phase.levels)) {
      for (const lesson of asArray(level.lessons)) {
        if (lesson.status === 'completed') {
          const moduleId = level.id || `mod-${phase.id}-0`;
          const lessonId = lesson.id || `les-${moduleId}-0`;
          await upsertUserLessonProgress({
            ownerEmail,
            roadmapId,
            lessonId,
            moduleId,
            phaseId: phase.id,
            completed: true,
            completedAt: nowIso(),
            attempts: 1
          });
        }
      }
    }
  }

  void meta;
}

// ---------------------------------------------------------------------------
// Write a roadmap from the (legacy-shaped) nested JSON the AI generator returns.
// Persists to the normalized tables. This is the inverse of
// `reconstructRoadmapJson()` and is idempotent (all upserts are keyed).
// ---------------------------------------------------------------------------

export async function createRoadmapFromJson(
  ownerEmail: string,
  jsonRoadmap: any
): Promise<void> {
  if (!jsonRoadmap || !jsonRoadmap.id) return;
  await ensureRoadmapTables();
  await migrateRoadmapJsonToTables(ownerEmail, jsonRoadmap);
}

// ---------------------------------------------------------------------------
// Update a lesson's status / contentStatus / xpReward in the normalized table.
// ---------------------------------------------------------------------------

export async function updateLessonStatus(
  lessonId: string,
  status: string
): Promise<void> {
  await ensureRoadmapTables();
  await sql`
    UPDATE lessons SET status = ${status}, updated_at = NOW() WHERE id = ${lessonId}
  `;
}

// ---------------------------------------------------------------------------
// Delete a roadmap (cascades to phases/modules/lessons/quizzes/assignments/
// resources/projects/progress via FK ON DELETE CASCADE).
// ---------------------------------------------------------------------------

export async function deleteRoadmap(roadmapId: string): Promise<number> {
  await ensureRoadmapTables();
  const result = await sql`
    DELETE FROM roadmaps WHERE id = ${roadmapId} RETURNING id
  `;
  return result.length;
}

// ---------------------------------------------------------------------------
// Reconstruct the nested frontend shape from normalized tables.
//
// The frontend expects:
//   roadmap { phases: [ { id, name, levels: [ { id, name, lessons: [ {
//     id, name, type, status, xpReward, content, quizQuestions, prerequisites,
//     codingExercise, summary, ... } ] } ] }, resources, projects,
//     lessonsCompleted, progressPercent, totalXp } ] }
//
// We map `modules` -> `levels` and fold `quizzes`/`assignments`/lesson content
// back into each lesson so the UI keeps working without changes.
// ---------------------------------------------------------------------------

export async function reconstructRoadmapJson(roadmapId: string): Promise<any | null> {
  const normalized = await getNormalizedRoadmap(roadmapId);
  if (!normalized) return null;

  const { roadmap, phases, resources, projects } = normalized;

  const reconstructedPhases = phases.map((p: any) => ({
    id: p.phase.id,
    name: p.phase.name,
    description: p.phase.description,
    estimatedHours: p.phase.estimated_hours,
    skillsCovered: asTextArray(p.phase.skills_covered),
    xpEarned: p.phase.xp_earned,
    progress: p.phase.progress ?? p.phase.xp_earned,
    status: p.phase.status,
    levels: p.modules.map((m: any) => ({
      id: m.module.id,
      name: m.module.name,
      type: m.module.type,
      status: m.module.status,
      lessons: m.lessons.map((l: any) => reconstructLesson(l))
    }))
  }));

  return {
    id: roadmap.id,
    ownerEmail: roadmap.owner_email,
    title: roadmap.title,
    goal: roadmap.goal,
    experienceLevel: roadmap.experience_level,
    weeklyHours: roadmap.weekly_hours,
    preferredStyle: roadmap.preferred_style,
    college: roadmap.college,
    branch: roadmap.branch,
    year: roadmap.year,
    progressPercent: roadmap.progress_percent,
    totalXp: roadmap.total_xp,
    lessonsCompleted: roadmap.lessons_completed,
    hoursRemaining: roadmap.hours_remaining,
    status: roadmap.status,
    createdAt: roadmap.created_at,
    phases: reconstructedPhases,
    resources: resources.map(reconstructResource),
    projects: projects.map(reconstructProject)
  };
}

function reconstructLesson(lesson: any): any {
  const content = lesson.markdown_content != null ? lesson.markdown_content : lesson.content;
  const base: any = {
    id: lesson.id,
    name: lesson.title,
    title: lesson.title,
    type: lesson.type,
    status: lesson.status,
    xpReward: lesson.xp_reward,
    content: content ?? '',
    summary: lesson.summary ?? null,
    description: lesson.description ?? null,
    learningObjectives: asTextArray(lesson.learning_objectives),
    prerequisites: asTextArray(lesson.prerequisites),
    difficulty: lesson.difficulty ?? null,
    estimatedMinutes: lesson.estimated_minutes ?? null,
    skillTags: asTextArray(lesson.skill_tags),
    contentStatus: lesson.content_status,
    workedExamples: asArray(lesson.worked_examples),
    exercises: asArray(lesson.exercises),
    orderIndex: lesson.order_index
  };

  const quizzes = asArray(lesson.quizzes);
  if (quizzes.length > 0) {
    base.quizQuestions = asArray(quizzes[0].questions);
  }
  const assignments = asArray(lesson.assignments);
  if (assignments.length > 0) {
    const a = assignments[0];
    base.codingExercise = {
      templateCode: a.template_code ?? '',
      solutionCode: a.solution_code ?? '',
      validationSnippet: a.validation_snippet ?? '',
      instructions: a.instructions ?? '',
      hint: a.hint ?? ''
    };
  }
  return base;
}

function reconstructResource(resource: any): any {
  return {
    id: resource.id,
    phaseId: resource.phase_id,
    moduleId: resource.module_id,
    title: resource.title,
    type: resource.type,
    provider: resource.provider,
    url: resource.url,
    description: resource.description,
    duration: resource.duration,
    orderIndex: resource.order_index
  };
}

function reconstructProject(project: any): any {
  return {
    id: project.id,
    phaseId: project.phase_id,
    title: project.title,
    difficulty: project.difficulty,
    description: project.description,
    techStack: asTextArray(project.tech_stack),
    features: asTextArray(project.features),
    githubUrl: project.github_url,
    progress: project.progress,
    orderIndex: project.order_index
  };
}

// ---------------------------------------------------------------------------
// List all roadmaps for a user, reconstructed into the nested frontend shape.
// ---------------------------------------------------------------------------

export async function getUserRoadmapsReconstructed(ownerEmail: string): Promise<any[]> {
  const roadmaps = await getRoadmapsByOwner(ownerEmail);
  const result: any[] = [];
  for (const r of roadmaps) {
    const reconstructed = await reconstructRoadmapJson(r.id);
    if (reconstructed) result.push(reconstructed);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Find a lesson (with its module/phase/roadmap context) by id.
// ---------------------------------------------------------------------------

export async function findLessonContext(lessonId: string): Promise<any | null> {
  await ensureRoadmapTables();
  const rows = await sql`
    SELECT lessons.*, modules.id AS module_id, modules.phase_id, modules.roadmap_id
    FROM lessons
    JOIN modules ON modules.id = lessons.module_id
    WHERE lessons.id = ${lessonId}
    LIMIT 1
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Lesson completion: record progress + recompute roadmap counters + unlock
// logic. Returns the recomputed { completedLessons, totalLessons, progressPercent }.
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
  await ensureRoadmapTables();

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
    studyMinutes: studyMinutes ?? 0
  });

  await updateLessonStatus(lessonId, 'completed');

  // Unlock the next locked lesson in the same module + promote module/phase
  // status, preserving the progression behavior the frontend relies on.
  await unlockNextLesson(lessonId, moduleId);

  const lessonRows = await sql`
    SELECT id, status FROM lessons WHERE roadmap_id = ${roadmapId}
  `;
  const totalLessons = lessonRows.length;
  const completedLessons = lessonRows.filter((l: any) => l.status === 'completed').length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  await sql`
    UPDATE roadmaps
    SET lessons_completed = ${completedLessons},
        progress_percent = ${progressPercent},
        updated_at = NOW()
    WHERE id = ${roadmapId}
  `;

  return { completedLessons, totalLessons, progressPercent };
}

// ---------------------------------------------------------------------------
// Unlock logic: after a lesson completes, walk the full progression chain so
// the next available item is always reachable. Idempotent (only flips
// 'locked' -> 'available'; never double-awards and never re-locks).
//
//   lesson (within module) -> first lesson of next module
//                          -> first module of next phase
//                          -> roadmap marked completed when all lessons done
//
// Module/phase status is promoted to 'current' so the reconstructed nested
// shape stays internally consistent. Deterministic, no N+1.
// ---------------------------------------------------------------------------

export async function unlockNextLesson(
  lessonId: string,
  moduleId: string
): Promise<void> {
  await ensureRoadmapTables();

  // Context for the just-completed lesson.
  const ctxRows = await sql`
    SELECT l.order_index, m.phase_id, m.roadmap_id
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    WHERE l.id = ${lessonId}
    LIMIT 1
  `;
  if (!ctxRows[0]) return;
  const { order_index: lessonOrder, phase_id: phaseId, roadmap_id: roadmapId } = ctxRows[0];

  // 1) Next locked lesson within the SAME module.
  const nextInModule = await sql`
    SELECT id FROM lessons
    WHERE module_id = ${moduleId}
      AND status = 'locked'
      AND order_index > ${lessonOrder ?? 0}
    ORDER BY order_index ASC
    LIMIT 1
  `;
  if (nextInModule[0]) {
    await updateLessonStatus(nextInModule[0].id, 'available');
    // Same-module unlock is sufficient; nothing further to open.
    await promoteContainerStatuses(moduleId, phaseId, roadmapId);
    return;
  }

  // 2) This was the last lesson of the module. Unlock the first lesson of the
  //    next module (by order) in the same phase.
  const moduleRows = await sql`
    SELECT id, phase_id, roadmap_id, order_index
    FROM modules WHERE id = ${moduleId} LIMIT 1
  `;
  if (moduleRows[0]) {
    const mod = moduleRows[0];
    const nextModule = await sql`
      SELECT id FROM modules
      WHERE phase_id = ${mod.phase_id}
        AND order_index > ${mod.order_index ?? 0}
      ORDER BY order_index ASC
      LIMIT 1
    `;
    if (nextModule[0]) {
      const firstLesson = await sql`
        SELECT id FROM lessons
        WHERE module_id = ${nextModule[0].id} AND status = 'locked'
        ORDER BY order_index ASC
        LIMIT 1
      `;
      if (firstLesson[0]) {
        await updateLessonStatus(firstLesson[0].id, 'available');
      }
      await promoteContainerStatuses(nextModule[0].id, mod.phase_id, mod.roadmap_id);
      return;
    }

    // 3) This was the last module of the phase. Unlock the first module of the
    //    next phase (by order), and its first lesson.
    const nextPhase = await sql`
      SELECT id, roadmap_id, order_index
      FROM phases
      WHERE roadmap_id = ${mod.roadmap_id}
        AND order_index > ${mod.order_index ?? 0}
      ORDER BY order_index ASC
      LIMIT 1
    `;
    if (nextPhase[0]) {
      const firstModule = await sql`
        SELECT id FROM modules
        WHERE phase_id = ${nextPhase[0].id}
        ORDER BY order_index ASC
        LIMIT 1
      `;
      if (firstModule[0]) {
        const firstLesson = await sql`
          SELECT id FROM lessons
          WHERE module_id = ${firstModule[0].id} AND status = 'locked'
          ORDER BY order_index ASC
          LIMIT 1
        `;
        if (firstLesson[0]) {
          await updateLessonStatus(firstLesson[0].id, 'available');
        }
        await promoteContainerStatuses(firstModule[0].id, nextPhase[0].id, nextPhase[0].roadmap_id);
      }
      return;
    }

    // 4) Last module of last phase -> roadmap complete (if all lessons done).
    const lessonRows = await sql`SELECT status FROM lessons WHERE roadmap_id = ${mod.roadmap_id}`;
    const allDone = lessonRows.length > 0 && lessonRows.every((l: any) => l.status === 'completed');
    if (allDone) {
      await sql`
        UPDATE roadmaps SET status = 'completed', updated_at = NOW()
        WHERE id = ${mod.roadmap_id}
      `;
    }
    await promoteContainerStatuses(mod.id, mod.phase_id, mod.roadmap_id);
  }
}

// Promote module/phase containers from 'locked' to 'current' (idempotent).
async function promoteContainerStatuses(
  moduleId: string,
  phaseId: string,
  roadmapId: string
): Promise<void> {
  await sql`UPDATE modules SET status = 'current', updated_at = NOW() WHERE id = ${moduleId} AND status = 'locked'`;
  await sql`UPDATE phases SET status = 'current', updated_at = NOW() WHERE id = ${phaseId} AND status = 'locked'`;
  void roadmapId;
}

// ---------------------------------------------------------------------------
// Recompute roadmap counters from lesson statuses (used after bulk updates).
// ---------------------------------------------------------------------------

export async function recomputeRoadmapCounters(roadmapId: string): Promise<void> {
  await ensureRoadmapTables();
  const lessonRows = await sql`SELECT status FROM lessons WHERE roadmap_id = ${roadmapId}`;
  const totalLessons = lessonRows.length;
  const completedLessons = lessonRows.filter((l: any) => l.status === 'completed').length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  await sql`
    UPDATE roadmaps
    SET lessons_completed = ${completedLessons},
        progress_percent = ${progressPercent},
        updated_at = NOW()
    WHERE id = ${roadmapId}
  `;
}

// ---------------------------------------------------------------------------
// Per-roadmap, non-lesson progress state (current lesson pointer, started/completed
// timestamps). Stored relationally instead of inside the legacy JSONB progress blob.
// ---------------------------------------------------------------------------

export async function upsertRoadmapState(state: {
  ownerEmail: string;
  roadmapId: string;
  currentLessonId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<void> {
  await ensureRoadmapTables();
  const id = `${state.ownerEmail.toLowerCase()}::${state.roadmapId}`;
  await sql`
    INSERT INTO user_roadmap_state (id, owner_email, roadmap_id, current_lesson_id, started_at, completed_at, updated_at)
    VALUES (
      ${id}, ${state.ownerEmail.toLowerCase()}, ${state.roadmapId}, ${state.currentLessonId ?? null},
      ${state.startedAt ?? nowIso()}, ${state.completedAt ?? null}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      current_lesson_id = COALESCE(EXCLUDED.current_lesson_id, user_roadmap_state.current_lesson_id),
      started_at = COALESCE(user_roadmap_state.started_at, EXCLUDED.started_at),
      completed_at = COALESCE(EXCLUDED.completed_at, user_roadmap_state.completed_at),
      updated_at = NOW()
  `;
}

export async function getRoadmapState(
  ownerEmail: string,
  roadmapId: string
): Promise<any | null> {
  await ensureRoadmapTables();
  const rows = await sql`
    SELECT * FROM user_roadmap_state
    WHERE owner_email = ${ownerEmail.toLowerCase()} AND roadmap_id = ${roadmapId}
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Reconstruct the legacy `progress[roadmapId]` object from normalized tables so
// the /api/progress responses stay byte-compatible with the frontend.
// ---------------------------------------------------------------------------

export async function getRoadmapProgressSnapshot(
  ownerEmail: string,
  roadmapId: string
): Promise<any> {
  await ensureRoadmapTables();

  const progressRows = await sql`
    SELECT ulp.*, l.xp_reward
    FROM user_lesson_progress ulp
    JOIN lessons l ON l.id = ulp.lesson_id
    WHERE ulp.owner_email = ${ownerEmail.toLowerCase()} AND ulp.roadmap_id = ${roadmapId}
  `;
  const completedLessonIds = progressRows
    .filter((p: any) => p.completed)
    .map((p: any) => p.lesson_id);

  const totalXP = progressRows
    .filter((p: any) => p.completed)
    .reduce((sum: number, p: any) => sum + (Number(p.xp_reward) || 0), 0);

  const lessonRows = await sql`SELECT id FROM lessons WHERE roadmap_id = ${roadmapId}`;
  const totalLessons = lessonRows.length;
  const progressPercentage = totalLessons > 0 ? Math.round((completedLessonIds.length / totalLessons) * 100) : 0;

  const state = await getRoadmapState(ownerEmail, roadmapId);

  return {
    userId: ownerEmail,
    roadmapId,
    currentLessonId: state?.current_lesson_id ?? null,
    completedLessonIds,
    totalXP,
    progressPercentage,
    startedAt: state?.started_at ?? null,
    completedAt: state?.completed_at ?? null,
    updatedAt: state?.updated_at ?? null
  };
}

// ---------------------------------------------------------------------------
// Aggregate lesson completion stats across ALL of a user's roadmaps; used by
// the /api/user-stats endpoint. Single query, no N+1.
// ---------------------------------------------------------------------------

export async function getUserLessonCompletionStats(
  ownerEmail: string
): Promise<{ totalLessons: number; completedLessons: number }> {
  await ensureRoadmapTables();
  const rows = await sql`
    SELECT l.status
    FROM lessons l
    JOIN roadmaps r ON r.id = l.roadmap_id
    WHERE r.owner_email = ${ownerEmail.toLowerCase()}
  `;
  const totalLessons = rows.length;
  const completedLessons = rows.filter((l: any) => l.status === 'completed').length;
  return { totalLessons, completedLessons };
}
