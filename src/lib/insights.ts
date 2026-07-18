import { Roadmap, UserProfile, Phase, Level, Lesson } from '../types';

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

export type ActivityLog = Record<string, { xp: number; lessonsCompleted: number }>;

// Returns the Monday of the ISO week containing the given date, as YYYY-MM-DD.
function startOfIsoWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // shift Sunday to end of week
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// Derives insights from REAL user/roadmap/activity data. No random/fake metrics,
// and no fabricated history — days or weeks with no logged activity show as
// genuinely empty rather than an interpolated average.
export const generateInsightsData = (roadmap: Roadmap, profile: UserProfile, activityLog: ActivityLog = {}) => {
  const allLessons: Lesson[] = (roadmap.phases || [])
    .flatMap(p => (p.levels || [])
      .flatMap(l => (l.lessons || [])));
  const completedLessonIds = new Set(profile.completedLessonIds || []);
  const completedLessons = allLessons.filter(l => completedLessonIds.has(l.id));
  const completedCount = completedLessons.length;
  const totalLessons = allLessons.length;

  const hasActivityHistory = Object.keys(activityLog).length > 0;

  // 1. Learning Velocity — real per-day XP from the activity log for the last
  // 14 days. Days with no logged activity are genuinely 0, not backfilled
  // with an average. If there's no history at all yet, this comes back empty
  // and the UI shows an honest "not enough history yet" state instead of a
  // chart implying daily activity that never happened.
  const learningVelocity: LearningVelocity[] = hasActivityHistory
    ? Array.from({ length: 14 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (13 - i));
        const key = date.toISOString().split('T')[0];
        return { date: key, xp: activityLog[key]?.xp || 0 };
      })
    : [];

  // 2. Weekly Report — real per-ISO-week buckets built from the activity log
  // (last 6 weeks that actually have data), instead of one fabricated
  // "All Time" row.
  const weekBuckets = new Map<string, WeeklyReport>();
  Object.entries(activityLog).forEach(([dateKey, entry]) => {
    const weekKey = startOfIsoWeek(new Date(dateKey));
    const bucket = weekBuckets.get(weekKey) || {
      week: weekKey,
      xpGained: 0,
      lessonsCompleted: 0,
      projectsCompleted: 0,
      quizzesTaken: 0,
    };
    bucket.xpGained += entry.xp;
    bucket.lessonsCompleted += entry.lessonsCompleted;
    weekBuckets.set(weekKey, bucket);
  });
  const weeklyReports: WeeklyReport[] = Array.from(weekBuckets.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-6);

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

  // 4. Predicted Completion — derived from real recent pace (last 14 days of
  // logged activity) rather than a lifetime average, so it reacts to actual
  // recent behavior. Falls back to lifetime average only if there's no
  // day-level history yet (e.g. right after this feature shipped).
  const completionPercentage = totalLessons > 0 ? (completedCount / totalLessons) : 0;
  const daysSinceStart = Math.max(
    1,
    Math.round((Date.now() - new Date(profile.createdAt || Date.now()).getTime()) / (1000 * 3600 * 24))
  );
  const recentLessonsPerDay = hasActivityHistory
    ? learningVelocity.reduce((sum, d) => sum + (activityLog[d.date]?.lessonsCompleted || 0), 0) / 14
    : (daysSinceStart > 0 ? completedCount / daysSinceStart : 0);
  const remainingLessons = totalLessons - completedCount;
  const remainingDays = recentLessonsPerDay > 0 ? Math.ceil(remainingLessons / recentLessonsPerDay) : Infinity;

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
  if (remainingLessons > 0 && isFinite(remainingDays)) {
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
    hasActivityHistory,
  };
};