/**
 * roadmapUtils.ts
 * Pure utility functions for the roadmap phase-wise system.
 * All components should import from here instead of duplicating logic.
 */

import { Phase, Roadmap, UserProfile } from '../types';

// ---------------------------------------------------------------------------
// Phase progress
// ---------------------------------------------------------------------------

/** Returns 0–100 percentage of lessons completed inside a phase. */
export function calcPhaseProgress(phase: Phase): number {
  const allLessons = (phase.levels || []).flatMap(l => l.lessons || []);
  if (allLessons.length === 0) return 0;
  const completed = allLessons.filter(l => l.status === 'completed').length;
  return Math.round((completed / allLessons.length) * 100);
}

/** Returns true when every lesson in the phase is completed. */
export function isPhaseComplete(phase: Phase): boolean {
  const allLessons = (phase.levels || []).flatMap(l => l.lessons || []);
  if (allLessons.length === 0) return false;
  return allLessons.every(l => l.status === 'completed');
}

/** Returns the total and completed lesson counts for a phase. */
export function phaseLessonCounts(phase: Phase): { total: number; completed: number } {
  const allLessons = (phase.levels || []).flatMap(l => l.lessons || []);
  return {
    total: allLessons.length,
    completed: allLessons.filter(l => l.status === 'completed').length,
  };
}

// ---------------------------------------------------------------------------
// Time estimation
// ---------------------------------------------------------------------------

/**
 * Sums estimatedMinutes across all lessons in a phase.
 * Falls back to 20 minutes per lesson when the field is absent.
 */
export function calcPhaseEstimatedMinutes(phase: Phase): number {
  return (phase.levels || [])
    .flatMap(l => l.lessons || [])
    .reduce((acc, lesson) => acc + ((lesson as any).estimatedMinutes || 20), 0);
}

/**
 * Calculates estimated weeks to finish the roadmap based on weekly hours and
 * remaining lesson minutes. Returns null when data is insufficient.
 */
export function calcEstimatedCompletionWeeks(roadmap: Roadmap): number | null {
  if (!roadmap.weeklyHours || roadmap.weeklyHours <= 0) return null;

  const remainingMinutes = (roadmap.phases || [])
    .flatMap(p => (p.levels || []).flatMap(l => l.lessons || []))
    .filter(l => l.status !== 'completed')
    .reduce((acc, lesson) => acc + ((lesson as any).estimatedMinutes || 20), 0);

  if (remainingMinutes <= 0) return 0;

  const weeklyMinutes = roadmap.weeklyHours * 60;
  return Math.ceil(remainingMinutes / weeklyMinutes);
}

// ---------------------------------------------------------------------------
// Phase unlock status
// ---------------------------------------------------------------------------

export type PhaseUnlockStatus = 'completed' | 'unlocked' | 'locked';

/**
 * Returns the unlock status for a single phase by index:
 * - Phase 0 is always at least 'unlocked'.
 * - Phase N (N > 0) is 'unlocked' only when Phase N-1 is 'completed'.
 * - A phase where all lessons are done is 'completed'.
 */
export function getPhaseUnlockStatus(
  phases: Phase[],
  phaseIndex: number,
): PhaseUnlockStatus {
  const phase = phases[phaseIndex];
  if (!phase) return 'locked';

  if (isPhaseComplete(phase)) return 'completed';
  if (phaseIndex === 0) return 'unlocked';

  const prevPhase = phases[phaseIndex - 1];
  if (isPhaseComplete(prevPhase)) return 'unlocked';

  return 'locked';
}

// ---------------------------------------------------------------------------
// AI Mentor Analysis (previously duplicated in RoadmapOverview + RoadmapsTabContainer)
// ---------------------------------------------------------------------------

export interface MentorAnalysis {
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
}

export function generateMentorAnalysis(
  roadmap: Roadmap,
  _profile: UserProfile,
): MentorAnalysis {
  const allLessons = (roadmap.phases || [])
    .flatMap(p => p.levels || [])
    .flatMap(l => l.lessons || []);

  const completedLessons = allLessons.filter(l => l.status === 'completed').length;
  const totalLessons = allLessons.length;
  const completionPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (completionPercentage > 75) {
    strengths.push('High completion rate');
  } else if (completionPercentage < 25) {
    weaknesses.push('Low initial progress');
  }

  if (roadmap.preferredStyle) {
    strengths.push('Aligned learning style');
  }

  return {
    strengths,
    weaknesses,
    recommendation:
      completionPercentage < 50
        ? "Focus on completing the current module's lessons to build momentum."
        : "You're making great progress! Consider exploring advanced topics in the resources tab.",
  };
}

// ---------------------------------------------------------------------------
// Difficulty colour helper (shared across PhaseCard, PhaseDetailPage)
// ---------------------------------------------------------------------------

export function difficultyColor(difficulty?: string): string {
  switch ((difficulty || '').toLowerCase()) {
    case 'beginner':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
    case 'intermediate':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
    case 'advanced':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
    case 'expert':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
    default:
      return 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10';
  }
}
