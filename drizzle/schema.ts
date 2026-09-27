// Drizzle schema for the application's runtime PostgreSQL model.
// Migrations in drizzle/migrations are applied with drizzle-kit.

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm/sql';

// Forward declaration is valid because table callbacks resolve lazily.

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export const roadmaps = pgTable('roadmaps', {
  id: text('id').primaryKey(),
  ownerEmail: text('owner_email')
    .notNull()
    .references(() => users.email, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  goal: text('goal').notNull(),
  experienceLevel: text('experience_level'),
  weeklyHours: integer('weekly_hours'),
  preferredStyle: text('preferred_style'),
  college: text('college'),
  branch: text('branch'),
  year: text('year'),
  progressPercent: integer('progress_percent').notNull().default(0),
  totalXp: integer('total_xp').notNull().default(0),
  lessonsCompleted: integer('lessons_completed').notNull().default(0),
  hoursRemaining: integer('hours_remaining'),
  status: text('status').notNull().default('current'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

export const phases = pgTable(
  'phases',
  {
    id: text('id').primaryKey(),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    estimatedHours: integer('estimated_hours'),
    skillsCovered: jsonb('skills_covered').notNull().default([]),
    xpEarned: integer('xp_earned').notNull().default(0),
    status: text('status').notNull().default('current'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    roadmapIdx: index('idx_phases_roadmap').on(t.roadmapId, t.orderIndex),
  })
);

// ---------------------------------------------------------------------------
// Module (was `level`)
// ---------------------------------------------------------------------------

export const modules = pgTable(
  'modules',
  {
    id: text('id').primaryKey(),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type'),
    status: text('status').notNull().default('current'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    phaseIdx: index('idx_modules_phase').on(t.phaseId, t.orderIndex),
    roadmapIdx: index('idx_modules_roadmap').on(t.roadmapId),
  })
);

// ---------------------------------------------------------------------------
// Lesson (metadata only)
// ---------------------------------------------------------------------------

export const lessons = pgTable(
  'lessons',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull().default('learn'),
    xpReward: integer('xp_reward').notNull().default(0),
    status: text('status').notNull().default('locked'),
    learningObjectives: jsonb('learning_objectives').notNull().default([]),
    prerequisites: jsonb('prerequisites').notNull().default([]),
    difficulty: text('difficulty'),
    estimatedMinutes: integer('estimated_minutes'),
    skillTags: jsonb('skill_tags').notNull().default([]),
    contentStatus: text('content_status').notNull().default('pending'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    moduleIdx: index('idx_lessons_module').on(t.moduleId, t.orderIndex),
    roadmapIdx: index('idx_lessons_roadmap').on(t.roadmapId),
  })
);

// ---------------------------------------------------------------------------
// LessonContent (separately generated / cached)
// ---------------------------------------------------------------------------

export const lessonContent = pgTable('lesson_content', {
  lessonId: text('lesson_id')
    .primaryKey()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  markdownContent: text('markdown_content'),
  workedExamples: jsonb('worked_examples').notNull().default([]),
  exercises: jsonb('exercises').notNull().default([]),
  summary: text('summary'),
  generatedAt: timestamp('generated_at'),
  modelUsed: text('model_used'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export const quizzes = pgTable(
  'quizzes',
  {
    id: text('id').primaryKey(),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    questions: jsonb('questions').notNull().default([]),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    lessonIdx: index('idx_quizzes_lesson').on(t.lessonId),
    roadmapIdx: index('idx_quizzes_roadmap').on(t.roadmapId),
  })
);

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export const assignments = pgTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    instructions: text('instructions'),
    templateCode: text('template_code'),
    solutionCode: text('solution_code'),
    validationSnippet: text('validation_snippet'),
    hint: text('hint'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    lessonIdx: index('idx_assignments_lesson').on(t.lessonId),
    roadmapIdx: index('idx_assignments_roadmap').on(t.roadmapId),
  })
);

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

export const resources = pgTable(
  'resources',
  {
    id: text('id').primaryKey(),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id').references(() => phases.id, { onDelete: 'set null' }),
    moduleId: text('module_id').references(() => modules.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    type: text('type').notNull().default('article'),
    provider: text('provider'),
    url: text('url'),
    description: text('description'),
    duration: text('duration'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    roadmapIdx: index('idx_resources_roadmap').on(t.roadmapId),
    phaseIdx: index('idx_resources_phase').on(t.phaseId),
  })
);

// ---------------------------------------------------------------------------
// PhaseProject
// ---------------------------------------------------------------------------

export const phaseProjects = pgTable(
  'phase_projects',
  {
    id: text('id').primaryKey(),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id').references(() => phases.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    difficulty: text('difficulty').notNull().default('beginner'),
    description: text('description'),
    techStack: jsonb('tech_stack').notNull().default([]),
    features: jsonb('features').notNull().default([]),
    githubUrl: text('github_url'),
    progress: integer('progress').notNull().default(0),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    roadmapIdx: index('idx_phase_projects_roadmap').on(t.roadmapId),
  })
);

// ---------------------------------------------------------------------------
// UserLessonProgress
// ---------------------------------------------------------------------------

export const userLessonProgress = pgTable(
  'user_lesson_progress',
  {
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email')
      .notNull()
      .references(() => users.email, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
    isUnlocked: boolean('is_unlocked').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    quizScore: integer('quiz_score'),
    studyMinutes: integer('study_minutes').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('idx_progress_owner').on(t.ownerEmail),
    lessonIdx: index('idx_progress_lesson').on(t.lessonId),
    roadmapIdx: index('idx_progress_roadmap').on(t.roadmapId, t.ownerEmail),
    ownerLessonUniq: uniqueIndex('uniq_progress_owner_lesson').on(t.ownerEmail, t.lessonId),
  })
);

// ---------------------------------------------------------------------------
// UserRoadmapState (non-lesson progress: current lesson pointer, timestamps)
// ---------------------------------------------------------------------------

export const userRoadmapState = pgTable(
  'user_roadmap_state',
  {
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email')
      .notNull()
      .references(() => users.email, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    currentLessonId: text('current_lesson_id'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('idx_roadmap_state_owner').on(t.ownerEmail),
    ownerRoadmapUniq: uniqueIndex('uniq_roadmap_state_owner').on(t.ownerEmail, t.roadmapId),
  })
);

// Append-only history of authenticated learning actions. Current completion
// state remains in user_lesson_progress; this table records actions over time.
export const learningEvents = pgTable(
  'learning_events',
  {
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email').notNull().references(() => users.email, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    roadmapId: text('roadmap_id').references(() => roadmaps.id, { onDelete: 'set null' }),
    phaseId: text('phase_id').references(() => phases.id, { onDelete: 'set null' }),
    moduleId: text('module_id').references(() => modules.id, { onDelete: 'set null' }),
    lessonId: text('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    properties: jsonb('properties').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerOccurredIdx: index('idx_learning_events_owner_occurred').on(t.ownerEmail, t.occurredAt),
    ownerTypeOccurredIdx: index('idx_learning_events_owner_type_occurred').on(t.ownerEmail, t.eventType, t.occurredAt),
  })
);

// Current system-derived calibration per learner and normalized skill tag.
export const userSkills = pgTable(
  'user_skills',
  {
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email').notNull().references(() => users.email, { onDelete: 'cascade' }),
    skillKey: text('skill_key').notNull(),
    skillName: text('skill_name').notNull(),
    proficiencyLevel: text('proficiency_level').notNull().default('unknown'),
    confidenceLevel: text('confidence_level').notNull().default('low'),
    evidenceCount: integer('evidence_count').notNull().default(0),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerSkillUnique: uniqueIndex('uniq_user_skills_owner_skill').on(t.ownerEmail, t.skillKey),
    proficiencyCheck: check('user_skills_proficiency_check', sql`${t.proficiencyLevel} IN ('unknown', 'beginner', 'developing', 'competent', 'advanced')`),
    confidenceCheck: check('user_skills_confidence_check', sql`${t.confidenceLevel} IN ('low', 'medium', 'high')`),
    evidenceCountCheck: check('user_skills_evidence_count_check', sql`${t.evidenceCount} >= 0`),
  })
);

// Server-evaluated placement attempts. Question snapshots preserve the exact
// item set used for grading; responses contain selected indexes only.
export const placementAttempts = pgTable(
  'placement_attempts',
  {
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email').notNull().references(() => users.email, { onDelete: 'cascade' }),
    roadmapId: text('roadmap_id').notNull().references(() => roadmaps.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('started'),
    questions: jsonb('questions').notNull(),
    responses: jsonb('responses'),
    result: jsonb('result'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    ownerKeyUnique: uniqueIndex('uniq_placement_attempt_owner_key').on(t.ownerEmail, t.idempotencyKey),
    ownerStartedIdx: index('idx_placement_attempt_owner_started').on(t.ownerEmail, t.startedAt),
    statusCheck: check('placement_attempt_status_check', sql`${t.status} IN ('started', 'completed')`),
  })
);

// Users table — FK target for all child tables.
export const users = pgTable('users', {
  email: text('email').primaryKey(),
  // password_hash column intentionally omitted from the Drizzle model.
  // Authentication is fully delegated to Supabase Auth; this column exists
  // in the database for backward compatibility but is never populated.
  roadmap: jsonb('roadmap'),
  progress: jsonb('progress'),
  xp: integer('xp').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  lastActiveDate: text('last_active_date'), // DATE stored as ISO string (YYYY-MM-DD)
  emailVerified: boolean('email_verified').notNull().default(false),
  // Set once, the first time the JSONB -> user_lesson_progress backfill runs
  // for this account. NULL means the backfill has not happened yet.
  progressBackfilledAt: timestamp('progress_backfilled_at', { withTimezone: true }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
