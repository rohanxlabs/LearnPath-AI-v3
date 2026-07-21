export interface AIAnalytics {
  weeklyHoursPerDay: number[];
  overallMasteryPercent: number;
}

export async function getUserAnalytics(_profileId: string): Promise<AIAnalytics> {
  const fallback: AIAnalytics = {
    weeklyHoursPerDay: [0, 0, 0, 0, 0, 0, 0],
    overallMasteryPercent: 0,
  };

  try {
    const res = await fetch('/api/user-analytics');
    if (!res.ok) return fallback;
    const data = await res.json();
    return {
      weeklyHoursPerDay: Array.isArray(data.weeklyHoursPerDay) ? data.weeklyHoursPerDay : fallback.weeklyHoursPerDay,
      overallMasteryPercent: typeof data.overallMasteryPercent === 'number' ? data.overallMasteryPercent : 0,
    };
  } catch {
    return fallback;
  }
}
