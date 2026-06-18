export type Theme = 'light' | 'dark' | 'system';

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
  quizQuestions?: QuizQuestion[];
  codingExercise?: CodingExercise;
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
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  category: 'python' | 'prompt' | 'agent' | 'rag' | 'mcp' | 'expert';
  xpReward: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
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
  title: string;
  type: 'video' | 'article' | 'book' | 'paper' | 'course';
  url: string;
  provider: string;
  duration?: string;
  description: string;
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

