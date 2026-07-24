export interface AIAnalytics {
  weeklyHoursPerDay: number[];
  overallMasteryPercent: number;
}

export async function getUserAnalytics(
  _profileId: string,
  getAuthHeaders?: () => Promise<Record<string, string>>
): Promise<AIAnalytics> {
  const fallback: AIAnalytics = {
    weeklyHoursPerDay: [0, 0, 0, 0, 0, 0, 0],
    overallMasteryPercent: 0,
  };

  try {
    const headers = getAuthHeaders ? await getAuthHeaders() : {};
    const res = await fetch('/api/user-analytics', { headers });
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
