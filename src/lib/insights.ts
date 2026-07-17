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

// Derives insights from REAL user/roadmap data. No random/fake metrics.
export const generateInsightsData = (roadmap: Roadmap, profile: UserProfile) => {
  const allLessons: Lesson[] = (roadmap.phases || [])
    .flatMap(p => (p.levels || [])
      .flatMap(l => (l.lessons || [])));
  const completedLessonIds = new Set(profile.completedLessonIds || []);
  const completedLessons = allLessons.filter(l => completedLessonIds.has(l.id));
  const completedCount = completedLessons.length;
  const totalLessons = allLessons.length;

  // 1. Weekly Report Data — derived from real totals only (no fabricated history).
  const weeklyReports: WeeklyReport[] = [
    {
      week: 'All Time',
      xpGained: profile.xp || 0,
      lessonsCompleted: completedCount,
      projectsCompleted: (roadmap.projects || []).filter((p: any) => (p.progress || 0) >= 100).length,
      quizzesTaken: (profile.topicWiseQuizzes || []).length,
    },
  ];

  // 2. Learning Velocity Data — flat, honest spread of actual total XP across
  // the days the account has been active (0 if account is brand new).
  const daysSinceStart = Math.max(
    1,
    Math.round((Date.now() - new Date(profile.createdAt || Date.now()).getTime()) / (1000 * 3600 * 24))
  );
  const xpPerDay = Math.round((profile.xp || 0) / daysSinceStart);
  const learningVelocity: LearningVelocity[] = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    return {
      date: date.toISOString().split('T')[0],
      xp: completedCount > 0 ? xpPerDay : 0,
    };
  });

  // 3. Skill Mastery Data — deterministic level from actual completion, not random.
  const techMap = new Map<string, { total: number; done: number }>();
  allLessons.forEach(l => {
    (l.tags || []).forEach(t => {
      const entry = techMap.get(t) || { total: 0, done: 0 };
      entry.total += 1;
      if (completedLessonIds.has(l.id)) entry.done += 1;
      techMap.set(t, entry);
    });
  });
  const skillMastery: SkillMastery[] = Array.from(techMap.entries()).slice(0, 8).map(([skill, v]) => ({
    skill,
    level: v.total > 0 ? Math.min(5, Math.max(1, Math.round((v.done / v.total) * 5))) : 1,
  }));

  // 4. Predicted Completion — only when there is a real velocity.
  const completionPercentage = totalLessons > 0 ? (completedCount / totalLessons) : 0;
  const lessonsPerDay = daysSinceStart > 0 ? completedCount / daysSinceStart : 0;
  const remainingLessons = totalLessons - completedCount;
  const remainingDays = lessonsPerDay > 0 ? Math.ceil(remainingLessons / lessonsPerDay) : Infinity;

  let predictedCompletionDate: Date | null = null;
  if (isFinite(remainingDays) && remainingDays > 0) {
    predictedCompletionDate = new Date();
    predictedCompletionDate.setDate(predictedCompletionDate.getDate() + remainingDays);
  }

  // 5. AI Insights — conditional on real activity (no fabricated claims).
  const aiInsights: AIInsight[] = [];
  if (completedCount > 0) {
    aiInsights.push({
      id: '1', type: 'strength',
      title: 'Lessons in Progress',
      description: `You have completed ${completedCount} of ${totalLessons} lessons (${Math.round(completionPercentage * 100)}%). Keep the momentum going!`,
    });
  }
  if (skillMastery.length > 0) {
    aiInsights.push({
      id: '2', type: 'recommendation',
      title: 'Reinforce Weak Skills',
      description: `Focus next on skills with lower mastery: ${skillMastery.filter(s => s.level <= 2).map(s => s.skill).slice(0, 3).join(', ') || 'none yet'}.`,
    });
  }
  if (remainingLessons > 0 && completedCount > 0) {
    aiInsights.push({
      id: '3', type: 'recommendation',
      title: 'Stay Consistent',
      description: `At your current pace you could finish the remaining ${remainingLessons} lessons in about ${remainingDays} days.`,
    });
  }

  return {
    weeklyReports,
    learningVelocity,
    skillMastery,
    predictedCompletionDate,
    completionPercentage,
    aiInsights,
  };
};