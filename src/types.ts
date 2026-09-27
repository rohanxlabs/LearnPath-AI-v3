export type Theme = 'light' | 'dark' | 'system';

export const LEARNER_TYPES = ['school_student', 'college_student', 'professional', 'career_switcher', 'job_seeker', 'developer', 'researcher', 'self_learner', 'hobbyist', 'other'] as const;
export type LearnerType = typeof LEARNER_TYPES[number];
export const GOAL_TYPES = ['learn_skill', 'build_project', 'prepare_interview', 'prepare_exam', 'career_transition', 'improve_job_performance', 'academic_learning', 'personal_interest', 'certification', 'other'] as const;
export type GoalType = typeof GOAL_TYPES[number];
export const LEARNING_STYLES = ['Hands-on Projects', 'Hands-on', 'Theory First', 'Theoretical', 'Mixed', 'Video Tutorials', 'Visual'] as const;
export type LearningStyle = typeof LEARNING_STYLES[number];
export const EXPERIENCE_LEVELS = ['Complete Beginner', 'Beginner', 'Some Experience', 'Intermediate', 'Advanced', 'Expert'] as const;
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number];
export const SESSION_LENGTHS = [15, 25, 30, 45, 60, 90] as const;
export type SessionLength = typeof SESSION_LENGTHS[number];

export interface LearnerProfile {
  learnerType?: LearnerType;
  /** Primary learner goal category; roadmap.goal remains roadmap-specific. */
  primaryGoal?: GoalType | null;
  /** Free-text learner outcome/intent, independent of any one roadmap. */
  goalDescription?: string | null;
  targetDate?: string | null;
  /** weeklyHours is available capacity; sessionLength is a preferred session duration. */
  preferences?: { learningStyle?: LearningStyle; weeklyHours?: number; sessionLength?: SessionLength | null };
  background?: {
    experienceLevel?: ExperienceLevel | string;
    education?: { level?: string; field?: string; institution?: string };
    occupation?: string;
    industry?: string;
  };
}

export const LEARNING_EVENT = {
  lessonOpened: 'lesson_opened', lessonCompleted: 'lesson_completed', quizAttempted: 'quiz_attempted',
  quizPassed: 'quiz_passed', quizFailed: 'quiz_failed', resourceOpened: 'resource_opened',
  resourceCompleted: 'resource_completed', sessionStarted: 'session_started', sessionEnded: 'session_ended',
  tooEasy: 'too_easy', stuck: 'stuck', assessmentStarted: 'assessment_started', assessmentCompleted: 'assessment_completed',
  placementQuestionAnswered: 'placement_question_answered',
} as const;
export const LEARNING_EVENT_TYPES = Object.values(LEARNING_EVENT);
export type LearningEventType = typeof LEARNING_EVENT[keyof typeof LEARNING_EVENT];
export interface LearningEvent {
  id: string;
  eventType: LearningEventType;
  occurredAt: string;
  roadmapId?: string | null;
  phaseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  properties: Record<string, string | number | boolean | null>;
}

export const SKILL_PROFICIENCY_LEVELS = ['unknown', 'beginner', 'developing', 'competent', 'advanced'] as const;
export type SkillProficiencyLevel = typeof SKILL_PROFICIENCY_LEVELS[number];
export const SKILL_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type SkillConfidenceLevel = typeof SKILL_CONFIDENCE_LEVELS[number];

export interface LearnerSkillState {
  id: string;
  skillKey: string;
  skillName: string;
  proficiencyLevel: SkillProficiencyLevel;
  confidenceLevel: SkillConfidenceLevel;
  evidenceCount: number;
  lastEvidenceAt: string | null;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  xp: number;
  level: number;
  streak: number;
  isPro: boolean;
  roadmapsCompleted: number;
  hoursStudied: number;
  aiSessionsCount: number;
  lessonsCompleted: number;
  completedLessonIds?: string[];
  learnerProfile?: LearnerProfile;
  topicWiseQuizzes?: Array<{ quizId: string; score: number; totalQuestions: number; [key: string]: any }>;
  createdAt: string;
}

export interface UserSettings {
  theme: Theme;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  privacyPublicProfile: boolean;
}

export type LessonType = 'learn' | 'quiz' | 'coding' | 'challenge' | 'ai_session' | 'boss_challenge';

export interface QuizQuestion {
   id: string;
   question: string;
   options: string[];
   correctIndex: number;
   explanation: string;
   misconceptionNotes?: string[]; // Why wrong options are tempting/misleading
}

export interface CodingExercise {
  templateCode: string;
  solutionCode: string;
  validationSnippet: string; // JavaScript condition to run against user code
  instructions: string;
  hint: string;
}

export interface Lesson {
   id: string;
   name: string;
   type: LessonType;
   xpReward: number;
   status: 'locked' | 'available' | 'completed';
   content: string; // HTML or Markdown
   tags?: string[];
   quizQuestions?: QuizQuestion[];
   codingExercise?: CodingExercise;
   prerequisites?: string[]; // Lesson IDs that must be completed first
   misconceptionNotes?: string[]; // Common wrong understanding for this topic
   completedAt?: string; // ISO date string from user_lesson_progress.completed_at
}

export interface Level {
  id: string;
  name: string;
  type: string; // 'Basics' | 'Foundations' | 'Intermediate' | 'Advanced' | 'Projects' | 'Assessment' | 'Boss Challenge'
  status: 'locked' | 'current' | 'completed';
  lessons: Lesson[];
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  progress: number; // 0 to 100
  estimatedHours: number;
  skillsCovered: string[];
  xpEarned: number;
  status: 'locked' | 'current' | 'completed';
  levels: Level[];
}

export interface Roadmap {
  id: string;
  goal: string;
  experienceLevel: string; // 'Beginner' | 'Intermediate' | 'Advanced'
  weeklyHours: number;
  preferredStyle: string; // 'Visual' | 'Hands-on' | 'Theoretical'
  phases: Phase[];
  progressPercent: number;
  totalXp: number;
  lessonsCompleted: number;
  hoursRemaining: number;
  createdAt: string;
  resources?: CuratedResource[];
  projects?: ProjectTrack[];
  quizzes?: Record<string, { questions: any[]; name: string }>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'python' | 'prompt' | 'agent' | 'rag' | 'mcp' | 'expert' | 'general' | 'milestone';
  xpReward: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface MentorRoadmapContext {
  goal?: string;
  phase?: Pick<Phase, 'name' | 'description'>;
  module?: Pick<Level, 'name'> & { description?: string };
  lesson?: Pick<Lesson, 'name'> & { description?: string };
  topics?: string[];
  progress?: { completedLessons: number; totalLessons: number; percentage: number };
  resources?: MentorResourceContext[];
}

export interface MentorResourceContext {
  title: string;
  provider?: string;
  type?: CuratedResource['type'];
  description?: string;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  category: 'roadmap' | 'mentor' | 'achievement' | 'alert' | 'system';
  read: boolean;
  timestamp: string;
}

export interface CuratedResource {
  id: string;
  phaseId: string;
  moduleId?: string;
  title: string;
  type: 'video' | 'article' | 'book' | 'paper' | 'course';
  url: string;
  provider: string;
  duration?: string;
  description: string;
  image?: string;
  author?: string;
  source?: string;
  estimatedMinutes?: number;
}

export interface ResourceMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  source?: string;
  estimatedMinutes?: number;
}

export interface TopicQuizAttempt {
  id: string;
  quizId: string;
  quizName: string;
  score: number;
  totalQuestions: number;
  attemptsCount: number;
  lastAttemptedAt: string;
}

export interface ProjectTrack {
  id: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  techStack: string[];
  features: string[];
  progress: number;
  githubUrl?: string;
}

