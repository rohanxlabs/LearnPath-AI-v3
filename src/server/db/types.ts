// Normalized relational schema types for the LearnPath AI roadmap backend.
//
// These mirror the relational tables defined in `src/server/db/schema.ts` (raw
// neon SQL) and `drizzle/schema.ts` (Drizzle migration target). They replace the
// monolithic nested JSON roadmap with a normalized model:
//
//   Roadmap ─┬─ Phase ─┬─ Module ─┬─ Lesson
//            │          │          ├─ Quiz
//            │          │          ├─ Assignment
//            │          │          └─ Resource
//            │          └─ PhaseProject
//            └─ UserLessonProgress
//
// Lesson content is stored separately (LessonContent) and generated lazily.

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export type ContentStatus = 'pending' | 'generating' | 'generated' | 'failed';

export type ResourceType = 'article' | 'video' | 'course' | 'paper' | 'book' | 'doc';

export type LessonType = 'learn' | 'quiz' | 'coding' | 'challenge' | 'ai_session' | 'boss_challenge';

export type LessonStatus = 'locked' | 'available' | 'completed';

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export interface Roadmap {
  id: string;
  ownerEmail: string;
  title: string;
  goal: string;
  experienceLevel: string | null;
  weeklyHours: number | null;
  preferredStyle: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  progressPercent: number;
  totalXp: number;
  lessonsCompleted: number;
  hoursRemaining: number | null;
  status: 'current' | 'locked' | 'completed' | string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Phase (was `phase` inside roadmap.phases)
// ---------------------------------------------------------------------------

export interface Phase {
  id: string;
  roadmapId: string;
  name: string;
  description: string | null;
  estimatedHours: number | null;
  skillsCovered: string[];
  xpEarned: number;
  status: 'current' | 'locked' | 'completed' | string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Module (was `level` inside phase.levels). Added to decouple lessons,
// quizzes, assignments and resources from a single nested `lessons` array.
// ---------------------------------------------------------------------------

export interface Module {
  id: string;
  phaseId: string;
  roadmapId: string;
  name: string;
  type: string | null;
  status: 'current' | 'locked' | 'completed' | string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Lesson (metadata only — content lives in LessonContent)
// ---------------------------------------------------------------------------

export interface Lesson {
  id: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  description: string | null;
  type: LessonType;
  xpReward: number;
  status: LessonStatus;
  learningObjectives: string[];
  prerequisites: string[];
  difficulty: Difficulty | null;
  estimatedMinutes: number | null;
  skillTags: string[];
  contentStatus: ContentStatus;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// LessonContent (separately generated / cached markdown)
// ---------------------------------------------------------------------------

export interface LessonContent {
  lessonId: string;
  markdownContent: string | null;
  workedExamples: string[];
  exercises: string[];
  summary: string | null;
  generatedAt: string | null;
  modelUsed: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Quiz (one per lesson of type 'quiz', or attached to any lesson)
// ---------------------------------------------------------------------------

export interface Quiz {
  id: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  questions: QuizQuestion[];
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  misconceptionNotes?: string[];
}

// ---------------------------------------------------------------------------
// Assignment (hands-on coding / challenge exercise)
// ---------------------------------------------------------------------------

export interface Assignment {
  id: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  roadmapId: string;
  title: string;
  instructions: string | null;
  templateCode: string | null;
  solutionCode: string | null;
  validationSnippet: string | null;
  hint: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Resource (was roadmap.resources / curated_resources)
// ---------------------------------------------------------------------------

export interface Resource {
  id: string;
  roadmapId: string;
  phaseId: string | null;
  moduleId: string | null;
  title: string;
  type: ResourceType;
  provider: string | null;
  url: string | null;
  description: string | null;
  duration: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// PhaseProject (was roadmap.projects)
// ---------------------------------------------------------------------------

export interface PhaseProject {
  id: string;
  roadmapId: string;
  phaseId: string | null;
  title: string;
  difficulty: Difficulty;
  description: string | null;
  techStack: string[];
  features: string[];
  githubUrl: string | null;
  progress: number;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// UserLessonProgress (lesson-based progress, replaces per-lesson status mutation
// inside the JSONB roadmap + dbData.progress[roadmapId])
// ---------------------------------------------------------------------------

export interface UserLessonProgress {
  id: string;
  ownerEmail: string;
  roadmapId: string;
  lessonId: string;
  moduleId: string;
  phaseId: string;
  completed: boolean;
  completedAt: string | null;
  attempts: number;
  quizScore: number | null;
  studyMinutes: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface NormalizedRoadmap {
  roadmap: Roadmap;
  phases: Array<{
    phase: Phase;
    modules: Array<{
      module: Module;
      lessons: Lesson[];
      quizzes: Quiz[];
      assignments: Assignment[];
      resources: Resource[];
    }>;
    projects: PhaseProject[];
  }>;
  resources: Resource[];
  projects: PhaseProject[];
}
