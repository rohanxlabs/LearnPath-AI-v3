export interface AIAnalytics {
  weeklyHoursPerDay: number[];
  overallMasteryPercent: number;
  recommendedNextActions: Array<{
    title: string;
    description: string;
    difficulty: 'easy' | 'hard';
    xpReward: number;
  }>;
}

export async function getUserAnalytics(profileId: string): Promise<AIAnalytics> {
  const seed = Array.from(profileId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const variation = seed % 5;
  const weeklyHoursPerDay = [1.5, 2, 1, 2.5, 3, 1.5, 2].map((hours, index) =>
    Math.round((hours + ((index + variation) % 3) * 0.5) * 10) / 10,
  );
  const overallMasteryPercent = Math.min(98, Math.max(18, 24 + (seed % 52)));

  return {
    weeklyHoursPerDay,
    overallMasteryPercent,
    recommendedNextActions: [
      {
        title: 'Complete today’s AI prompt drill',
        description: 'Reinforce prompt structure patterns with a focused 15-minute practice sprint.',
        difficulty: 'easy',
        xpReward: 80,
      },
      {
        title: 'Run a small coding challenge',
        description: 'Apply syntax and control-flow fundamentals in a short implementation task.',
        difficulty: 'hard',
        xpReward: 140,
      },
    ],
  };
}
