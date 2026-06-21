import { Roadmap, UserProfile, Phase, Level, Lesson } from '../types';

// MOCK DATA GENERATION (as placeholders for real backend logic)

export interface WeeklyReport {
  week: string;
  xpGained: number;
  lessonsCompleted: number;
  projectsCompleted: number;
  quizzesTaken: number;
}

export interface LearningVelocity {
  date: string;
  xp: number;
}

export interface SkillMastery {
  skill: string;
  level: number; // e.g., 1-5
}

export interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: 'strength' | 'weakness' | 'recommendation';
}

// This function would live on the backend and be called via an API.
// For now, we simulate it here.
export const generateInsightsData = (roadmap: Roadmap, profile: UserProfile) => {
  const allLessons: Lesson[] = roadmap.phases.flatMap(p => p.levels.flatMap(l => l.lessons));
  const completedLessonIds = new Set(profile.completedLessonIds || []);
  const completedLessons = allLessons.filter(l => completedLessonIds.has(l.id));

  // 1. Weekly Report Data
  const weeklyReports: WeeklyReport[] = [
    { week: 'This Week', xpGained: 125, lessonsCompleted: 5, projectsCompleted: 1, quizzesTaken: 3 },
    { week: 'Last Week', xpGained: 90, lessonsCompleted: 3, projectsCompleted: 0, quizzesTaken: 2 },
    { week: '2 Weeks Ago', xpGained: 150, lessonsCompleted: 7, projectsCompleted: 1, quizzesTaken: 4 },
    { week: '3 Weeks Ago', xpGained: 70, lessonsCompleted: 2, projectsCompleted: 0, quizzesTaken: 1 },
  ];

  // 2. Learning Velocity Data
  const learningVelocity: LearningVelocity[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      date: date.toISOString().split('T')[0],
      xp: Math.floor(Math.random() * (i < 7 ? 50 : 30)), // More XP in recent days
    };
  }).reverse();

  // 3. Skill Mastery Data
  const techSet = new Set<string>();
  completedLessons.forEach(l => (l.tags || []).forEach(t => techSet.add(t)));
  const skillMastery: SkillMastery[] = Array.from(techSet).slice(0, 8).map(skill => ({
    skill,
    level: Math.floor(1 + Math.random() * 4), // Random level from 1-5
  }));

  // 4. Predicted Completion
  const totalLessons = allLessons.length;
  const completedCount = completedLessons.length;
  const completionPercentage = totalLessons > 0 ? (completedCount / totalLessons) : 0;
  const daysSinceStart = (new Date().getTime() - new Date(profile.createdAt).getTime()) / (1000 * 3600 * 24);
  const lessonsPerDay = daysSinceStart > 0 ? completedCount / daysSinceStart : 0;
  const remainingLessons = totalLessons - completedCount;
  const remainingDays = lessonsPerDay > 0 ? Math.ceil(remainingLessons / lessonsPerDay) : Infinity;
  
  const predictedCompletionDate = isFinite(remainingDays) ? new Date() : null;
  if (predictedCompletionDate && isFinite(remainingDays)) {
    predictedCompletionDate.setDate(predictedCompletionDate.getDate() + remainingDays);
  }

  // 5. AI-Generated Insights
  const aiInsights: AIInsight[] = [
    { id: '1', type: 'strength', title: 'Consistent Week-over-Week Progress', description: 'You have consistently completed lessons for the past 4 weeks. Keep up the momentum!' },
    { id: '2', type: 'weakness', title: 'Lower Quiz Accuracy in "State Management"', description: 'Your quiz scores in State Management topics are slightly lower. Consider reviewing the related resources.' },
    { id: '3', type: 'recommendation', title: 'Start a Project on "Authentication"', description: 'You have completed all the lessons on Authentication. Now is a great time to start a project to solidify your knowledge.' },
  ];

  return {
    weeklyReports,
    learningVelocity,
    skillMastery,
    predictedCompletionDate,
    completionPercentage,
    aiInsights,
  };
};