import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Sparkles,
  Trophy,
  Flame,
  BookOpen,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  Award,
  Bot,
  PlusCircle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Circle,
  Map,
  MessageSquare,
  LayoutDashboard,
  ClipboardList,
  Zap,
  RefreshCw,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Roadmap, Phase, Achievement } from '../types';
import { AIRecommendationCard } from './Cards';
import { StreakBadge } from './Badges';
import { Skeleton, SkeletonCard, LoadingSpinner, SkeletonHeader, SkeletonRoadmapCard, SkeletonNotificationCard, SkeletonHomeHero } from './Skeleton';
import {
  computeRoadmapStats,
  deriveProgressInsights,
  deriveTodaysTasks,
  findResumeLesson,
  findNextUpLesson,
  findCurrentModule,
  getModuleProgress,
  hasLearningActivity,
  estimateLessonDuration,
  ProgressInsight,
} from '../lib/homeData';
import { spacing, fontSize, borderRadius, buttonStyles, typography, glassCardClass } from '../styles/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  category: 'quiz' | 'coding' | 'mentor' | 'roadmap';
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface HomeViewProps {
  profile: UserProfile;
  activeRoadmap: Roadmap | null;
  activePhase: Phase | null;
  achievements: Achievement[];
  aiRecommendations: AIRecommendation[];
  isRecsLoading: boolean;
  isLoading?: boolean;
  onContinueLearning: () => void;
  onGenerateRoadmap: () => void;
  onStartLesson: (phaseId: string, levelId: string, lessonId: string) => void;
  onLaunchRecommendation: (rec: AIRecommendation) => void;
  onOpenMentor: () => void;
  onViewProgress: () => void;
  getAuthHeaders?: () => Promise<Record<string, string>>;
  resumeLessonId?: string | null;
  roadmaps?: Roadmap[];
  onSelectRoadmap?: (roadmapId: string) => void;
  progressRefreshFailed?: boolean;
  onRetryProgress?: () => void;
}

interface UserStatsWithVisit {
  streak: number;
  lessonsCompleted: number;
  daysSinceLastVisit: number | null;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// fadeUp is called as a function so each section picks up the current
// reduced-motion preference at render time.
function makeFadeUp(reduced: boolean) {
  return reduced
    ? { initial: false as const, animate: {}, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] as const },
      };
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl home-skeleton animate-pulse ${className}`} />;
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg text-purple-400 bg-purple-500/10`}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className={`font-display font-bold text-lg text-zinc-900 dark:text-white`}>{title}</h3>
      </div>
      {subtitle && <p className={`text-sm text-zinc-400 mt-1 ml-9`}>{subtitle}</p>}
    </div>
  );
}

function GlassCard({
  children,
  className = '',
  tint = 'glass-card',
  interactive = true,
}: {
  key?: React.Key;
  children: React.ReactNode;
  className?: string;
  tint?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`${tint} ${glassCardClass()} rounded-2xl relative overflow-hidden ${interactive ? 'home-glass-interactive' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function insightToRecommendation(insight: ProgressInsight): AIRecommendation {
  return {
    id: insight.id,
    title: insight.title,
    description: insight.description,
    xpReward: insight.xpReward,
    category: insight.category,
    difficulty: insight.difficulty,
  };
}

export function HomeView({
  profile,
  activeRoadmap,
  activePhase,
  achievements,
  aiRecommendations,
  isRecsLoading,
  isLoading,
  onContinueLearning,
  onGenerateRoadmap,
  onStartLesson,
  onLaunchRecommendation,
  onOpenMentor,
  onViewProgress,
  getAuthHeaders,
  resumeLessonId,
  roadmaps = [],
  onSelectRoadmap,
  progressRefreshFailed = false,
  onRetryProgress,
}: HomeViewProps) {
  const reduced = useReducedMotion();
  const fadeUp = makeFadeUp(reduced);
  const firstName = profile.name.split(' ')[0] || profile.name;

  // Fetch live stats for welcome-back banner (daysSinceLastVisit)
  const [liveStats, setLiveStats] = useState<UserStatsWithVisit | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Secondary sections are expanded by default if the user has any completed lessons
  // (returning learner). New users see them collapsed to keep the first-run view clean.
  // Once manually toggled, that preference is remembered via localStorage forever.
  const [showSecondary, setShowSecondary] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('lp_home_secondary_expanded');
      if (stored !== null) return stored === 'true';
      // Default: expand for users who have already completed at least one lesson.
      return (profile.lessonsCompleted ?? 0) > 0;
    } catch {
      return false;
    }
  });

  const toggleSecondary = useCallback(() => {
    setShowSecondary(prev => {
      const next = !prev;
      try { localStorage.setItem('lp_home_secondary_expanded', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  useEffect(() => {
    (async () => {
      // Skip fetch if no token source is available — avoids a guaranteed 401
      // on the initial render before the Supabase session is hydrated.
      if (!getAuthHeaders) return;
      try {
        const headers = await getAuthHeaders();
        const r = await fetch('/api/user-stats', { headers });
        if (!r.ok) return;
        const d = await r.json();
        setLiveStats({ streak: d.streak ?? 0, lessonsCompleted: d.lessonsCompleted ?? 0, daysSinceLastVisit: d.daysSinceLastVisit ?? null });
      } catch { /* best-effort — banner simply stays hidden */ }
    })();
  }, []);

  // Welcome-back: show when streak is 0 AND user has prior activity AND was away 2+ days
  const showWelcomeBack = !bannerDismissed &&
    liveStats !== null &&
    liveStats.daysSinceLastVisit !== null &&
    liveStats.daysSinceLastVisit >= 2 &&
    liveStats.lessonsCompleted > 0;

  const stats = useMemo(() => computeRoadmapStats(activeRoadmap), [activeRoadmap]);
  const currentLesson = useMemo(
    () => findResumeLesson(activeRoadmap, resumeLessonId),
    [activeRoadmap, resumeLessonId],
  );
  const nextLesson = useMemo(
    () => (activeRoadmap ? findNextUpLesson(activeRoadmap) : null),
    [activeRoadmap],
  );
  const currentModule = useMemo(
    () => (activeRoadmap ? findCurrentModule(activeRoadmap) : null),
    [activeRoadmap],
  );
  const progressInsights = useMemo(
    () => deriveProgressInsights(activeRoadmap),
    [activeRoadmap],
  );
  const todaysTasks = useMemo(() => deriveTodaysTasks(activeRoadmap), [activeRoadmap]);
  const unlockedAchievements = useMemo(
    () => Array.isArray(achievements) ? achievements.filter((a) => a.unlocked) : [],
    [achievements],
  );

  const usingLocalInsights = progressInsights.length > 0;
  const displayInsights =
    usingLocalInsights
      ? progressInsights
      : Array.isArray(aiRecommendations) ? aiRecommendations.slice(0, 2).map((rec) => ({
          id: rec.id,
          title: rec.title,
          description: rec.description,
          xpReward: rec.xpReward,
          category: rec.category,
          difficulty: rec.difficulty,
        })) : [];

  const showActivity = hasLearningActivity(profile, stats);
  const roadmapTitle = activeRoadmap?.goal ?? null;
  const learningGoal = activeRoadmap?.goal ?? 'Start your first learning roadmap';
  const isRoadmapComplete = Boolean(
    activeRoadmap && stats.totalLessons > 0 && stats.completedLessons >= stats.totalLessons,
  );
  const courseProgressPercent = stats.totalLessons > 0
    ? Math.round((stats.completedLessons / stats.totalLessons) * 100)
    : stats.progressPercent;

  if (isLoading) {
    return (
      <div className="home-view space-y-6 pb-2 max-w-full overflow-x-hidden">
        {/* SkeletonHomeHero matches the real hero's rounded-2xl dimensions exactly — prevents CLS */}
        <SkeletonHomeHero />
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleInsightLaunch = (insight: ProgressInsight) => {
    if (insight.phaseId && insight.levelId && insight.lessonId) {
      onStartLesson(insight.phaseId, insight.levelId, insight.lessonId);
    } else if (insight.category === 'mentor') {
      onOpenMentor();
    } else {
      onLaunchRecommendation(insightToRecommendation(insight));
    }
  };

  // Memoized to prevent recreation on every render caused by unrelated App state changes
  const snapshotCards = useMemo(() => [
    {
      id: 'level',
      label: 'Current Level',
      value: String(stats.curriculumLevel),
      sub: stats.completedLevels > 0 ? `${stats.completedLevels} modules done` : 'Getting started',
      icon: Target,
      glass: 'glass-card-purple',
      iconColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    },
    {
      id: 'streak',
      label: 'Learning Streak',
      value: String(profile.streak),
      sub: profile.streak === 1 ? 'day' : 'days',
      icon: Flame,
      glass: 'glass-card-orange',
      iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    },
    {
      id: 'lessons',
      label: 'Completed Lessons',
      value: String(stats.completedLessons),
      sub: stats.totalLessons > 0 ? `of ${stats.totalLessons} total` : 'none yet',
      icon: BookOpen,
      glass: 'glass-card-teal',
      iconColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      id: 'progress',
      label: 'Roadmap Progress',
      value: activeRoadmap ? `${stats.progressPercent}%` : '—',
      sub: activeRoadmap ? 'completion' : 'no roadmap',
      icon: TrendingUp,
      glass: 'glass-card-blue',
      iconColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    },
  ], [stats, profile.streak, activeRoadmap]);

  const quickActions = useMemo(() => [
    {
      id: 'generate',
      label: 'Generate New Roadmap',
      icon: PlusCircle,
      tint: 'glass-card-purple',
      onClick: onGenerateRoadmap,
    },
    {
      id: 'mentor',
      label: 'Open AI Mentor',
      icon: MessageSquare,
      tint: 'glass-card-blue',
      onClick: onOpenMentor,
    },
    {
      id: 'progress',
      label: 'View Progress',
      icon: LayoutDashboard,
      tint: 'glass-card-teal',
      onClick: onViewProgress,
    },
  ], [onGenerateRoadmap, onOpenMentor, onViewProgress]);

  return (
    <>
      {/* Welcome-back sticky re-engagement banner — sits just below the 64px nav bar */}
      <AnimatePresence>
        {showWelcomeBack && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="sticky top-16 z-30 mx-auto max-w-full px-4 sm:px-6 pb-2 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 shadow-md text-sm backdrop-blur-sm">
              <RefreshCw className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-500">
                  Welcome back, {firstName}!{' '}
                  {liveStats!.daysSinceLastVisit === 1
                    ? "You were away yesterday."
                    : `You've been away for ${liveStats!.daysSinceLastVisit} days.`}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {liveStats!.lessonsCompleted > 0
                    ? `You've completed ${liveStats!.lessonsCompleted} lesson${liveStats!.lessonsCompleted === 1 ? '' : 's'} — that work doesn't disappear. Pick up where you left off.`
                    : "Your roadmap is waiting. Every day you come back counts."}
                </p>
                {activeRoadmap && (
                  <button
                    onClick={onContinueLearning}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:text-amber-600 transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" /> Resume learning
                  </button>
                )}
              </div>
              <button
                onClick={() => setBannerDismissed(true)}
                className="flex-shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-0.5 rounded"
                aria-label="Dismiss welcome back banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    <div className="home-view space-y-10 pb-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] max-w-full overflow-x-hidden">

      {/* SECTION 1 — Personalized Hero */}
      <motion.section {...fadeUp}>
        <GlassCard tint="glass-card-purple" className="p-4 sm:p-5 md:p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600 rounded-full blur-[120px] opacity-15 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-600 rounded-full blur-[100px] opacity-10 pointer-events-none" />

          <div className="relative z-10">
            <span className="text-xs sm:text-sm font-bold text-purple-400 uppercase tracking-wider">
              {getTimeGreeting()}, {firstName}
            </span>
            <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-white mt-1 leading-tight max-w-full overflow-wrap-anywhere">
              {activeRoadmap ? 'Continue your learning journey' : 'Start your learning journey'}
            </h2>

            {activeRoadmap ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3 sm:mt-3.5">
                  <span className="home-chip inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold text-zinc-300 max-w-full">
                    <Map className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate max-w-[180px] sm:max-w-[220px]">{roadmapTitle}</span>
                  </span>
                  <span className="home-chip inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold text-zinc-300 flex-shrink-0">
                    <Target className="w-3.5 h-3.5 text-purple-400" />
                    Level {stats.curriculumLevel}
                  </span>
                  <span className="home-chip inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold text-zinc-300 flex-shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    {stats.progressPercent}% complete
                  </span>
                  {profile.streak > 0 ? (
                    <StreakBadge days={profile.streak} />
                  ) : (
                    <span className="home-chip inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-medium text-zinc-400 flex-shrink-0">
                      <Flame className="w-3.5 h-3.5 text-zinc-500" />
                      {profile.streak} day streak
                    </span>
                  )}
                </div>

                {activePhase && (
                  <p className="text-xs text-zinc-300 mt-3 overflow-wrap-anywhere">
                    Goal: <span className="font-medium text-white">{learningGoal}</span>
                    {' · '}
                    Phase: <span className="font-medium text-white">{activePhase.name}</span>
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 mt-4 w-full">
                  <button
                    onClick={
                      currentLesson
                        ? () =>
                            onStartLesson(
                              currentLesson.phase.id,
                              currentLesson.level.id,
                              currentLesson.lesson.id,
                            )
                        : onContinueLearning
                    }
                    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-white font-bold text-sm rounded-xl active:scale-[0.98] transition-all cursor-pointer w-full sm:w-auto ${buttonStyles.primary}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Continue Learning
                  </button>
                  <button
                    onClick={onOpenMentor}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-purple-400 font-bold text-sm rounded-xl transition-all cursor-pointer w-full sm:w-auto ${buttonStyles.secondary}`}
                  >
                    <Bot className="w-4 h-4" />
                    <span className="hidden xs:inline">Open </span>AI Mentor
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-300 mt-3 max-w-lg leading-relaxed">
                  Let&apos;s create your first learning roadmap. Tell us your goal and we&apos;ll
                  build a structured path with lessons, quizzes, and projects.
                </p>
                <button
                  onClick={onGenerateRoadmap}
                  className={`inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 text-white font-bold text-sm rounded-xl active:scale-[0.98] transition-all cursor-pointer w-full sm:w-auto mt-4 ${buttonStyles.primary}`}
                >
                  <PlusCircle className="w-4 h-4" />
                  Generate Roadmap
                </button>
              </>
            )}
          </div>
        </GlassCard>
      </motion.section>

      {/* SECTION 2 — Learning Snapshot */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.04 }}>
        <SectionHeader icon={BarChart3} title="Learning Snapshot" subtitle="Your real-time progress" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {snapshotCards.map((card) => {
            const Icon = card.icon;
            return (
              <GlassCard key={card.id} tint={card.glass} className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300 font-medium truncate flex-1">{card.label}</span>
                  <div className={`p-1.5 rounded-lg border flex-shrink-0 ${card.iconColor}`}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                </div>
                <p className="font-display text-xl sm:text-2xl font-bold text-white mt-2 sm:mt-3 overflow-wrap-anywhere">{card.value}</p>
                <p className="text-xs text-zinc-500 mt-1 truncate">{card.sub}</p>
              </GlassCard>
            );
          })}
        </div>
        {/* Zero-state onboarding nudge — shown only when no activity at all */}
        {!activeRoadmap && stats.completedLessons === 0 && profile.streak === 0 && (
          <div className="col-span-full flex flex-col xs:flex-row items-start xs:items-center gap-2 xs:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-purple-500/8 border border-purple-500/20 mt-2 sm:mt-1">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <p className="text-xs text-zinc-400 flex-1 leading-relaxed">
              Complete your first lesson to unlock live tracking — streak, XP, progress, and more.
            </p>
            <button
              onClick={onGenerateRoadmap}
              className="flex-shrink-0 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer whitespace-nowrap self-end xs:self-auto"
            >
              Get started →
            </button>
          </div>
        )}
      </motion.section>

      {/* SECTION 3 — Continue Learning */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionHeader icon={Play} title="Continue Learning" />
          {roadmaps.length > 1 && activeRoadmap && onSelectRoadmap && (
            <label className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
              <span className="hidden sm:inline">Course</span>
              <select
                value={activeRoadmap.id}
                onChange={(event) => onSelectRoadmap(event.target.value)}
                className="max-w-36 sm:max-w-52 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white cursor-pointer"
                aria-label="Choose course to continue"
              >
                {roadmaps.map((roadmap) => <option key={roadmap.id} value={roadmap.id}>{roadmap.goal}</option>)}
              </select>
            </label>
          )}
        </div>
        {progressRefreshFailed && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span>Progress could not be refreshed. Showing your last saved roadmap.</span>
            {onRetryProgress && <button onClick={onRetryProgress} className="shrink-0 font-bold underline underline-offset-2 cursor-pointer">Retry</button>}
          </div>
        )}
        {activeRoadmap && currentModule && !isRoadmapComplete ? (
          <GlassCard tint="glass-card-purple" className="p-4 sm:p-5 md:p-6">
            <div className="flex flex-col gap-3 sm:gap-3.5">
              <p className="text-xs font-semibold text-purple-300 truncate min-w-0" title={activeRoadmap.goal}>{activeRoadmap.goal}</p>

              {/* Current Lesson - prominently displayed (P0-1) */}
              {currentLesson && (
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-lg sm:text-xl md:text-2xl text-white leading-tight line-clamp-2 overflow-wrap-anywhere" title={currentLesson.lesson.name}>
                    {currentLesson.lesson.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
                    {estimateLessonDuration(currentLesson.lesson)}
                    {currentLesson.lesson.xpReward > 0 && (
                      <span className="text-xs text-zinc-500 ml-2">+{currentLesson.lesson.xpReward} XP</span>
                    )}
                  </p>
                </div>
              )}

              {/* Progress bar with completion count (P0-2: removed badge, P1-3: faster animation, P1-6: ARIA, P2-6: lesson counter) */}
              <div className="space-y-2">
                <p className="text-xs text-zinc-400 flex-wrap">
                  Course progress <span className="font-semibold text-white">{courseProgressPercent}%</span>
                  <span className="text-zinc-500"> · {stats.completedLessons} of {stats.totalLessons} lessons complete</span>
                </p>
                <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-2 text-xs">
                  <span className="font-medium text-zinc-400 min-w-0 truncate">Module: {currentModule.level.name}</span>
                  <span className="font-mono font-bold text-purple-400 shrink-0">
                    {(() => {
                      const completed = currentModule.level.lessons.filter(l => l.status === 'completed').length;
                      const total = currentModule.level.lessons.length;
                      const currentIndex = currentModule.level.lessons.findIndex(l => l.id === currentLesson?.lesson.id);
                      return currentIndex >= 0 ? `Lesson ${currentIndex + 1} of ${total}` : `${completed} of ${total} lessons`;
                    })()}
                  </span>
                </div>
                <div
                  className="h-2 rounded-xl bg-white/5 border border-white/5 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={getModuleProgress(currentModule.level)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Module progress: ${getModuleProgress(currentModule.level)}% complete`}
                >
                  <motion.div
                    className="h-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${getModuleProgress(currentModule.level)}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                {/* P2-5: Motivational messaging */}
                {getModuleProgress(currentModule.level) >= 80 && getModuleProgress(currentModule.level) < 100 && (
                  <p className="text-xs text-emerald-400 font-medium">
                    🎯 Almost there! Just a few more lessons to complete this module.
                  </p>
                )}
                {getModuleProgress(currentModule.level) >= 50 && getModuleProgress(currentModule.level) < 80 && (
                  <p className="text-xs text-blue-400 font-medium">
                    💪 You're halfway through! Keep up the great work.
                  </p>
                )}
              </div>

              {currentLesson && (
                <button
                  onClick={() => onStartLesson(currentLesson.phase.id, currentLesson.level.id, currentLesson.lesson.id)}
                  aria-label={`Continue learning: ${currentLesson.lesson.name}`}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 font-bold text-sm text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-700 hover:to-indigo-700 active:scale-[0.98] transition-all cursor-pointer shadow-lg focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 w-full sm:w-auto"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Continue Learning
                </button>
              )}

              {/* Up next is supplementary; the current lesson is already the card title. */}
              <div className="hidden sm:block">
                {nextLesson && nextLesson.lesson.id !== currentLesson?.lesson.id && (
                  <div className="state-upcoming rounded-xl p-3.5 border border-transparent max-w-md">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Up Next
                    </p>
                    <p className="font-semibold text-sm text-white mt-1 line-clamp-2 overflow-wrap-anywhere" title={nextLesson.lesson.name}>
                      {nextLesson.lesson.name}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {nextLesson.lesson.type?.replace('_', ' ') || 'Lesson'}
                      {nextLesson.lesson.xpReward > 0 && (
                        <span className="text-xs text-zinc-500 ml-2">+{nextLesson.lesson.xpReward} XP</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Mobile: Show "Up Next" as inline text (P0-3) */}
              {nextLesson && nextLesson.lesson.id !== currentLesson?.lesson.id && (
                <p className="block sm:hidden text-xs text-zinc-400 overflow-wrap-anywhere">
                  Up next: <span className="text-white font-medium overflow-wrap-anywhere">{nextLesson.lesson.name}</span>
                </p>
              )}
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-4 sm:p-5 text-center">
            <BookOpen className="w-8 h-8 text-zinc-500 mx-auto mb-2.5" />
            <h4 className="font-display font-semibold text-sm text-white">
              {isRoadmapComplete ? 'Roadmap completed!' : 'No active roadmap yet'}
            </h4>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-sm mx-auto">
              {isRoadmapComplete
                ? 'You have finished every lesson in this roadmap. Review your completed path or create a new goal.'
                : 'Create a roadmap to see your current module, lesson, and progress here.'}
            </p>
            <div className="flex flex-col xs:flex-row gap-2 justify-center mt-3.5">
              {isRoadmapComplete && (
                <button
                  onClick={onContinueLearning}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors cursor-pointer"
                >
                  <Map className="w-3.5 h-3.5" />
                  View Completed Roadmap
                </button>
              )}
              <button
                onClick={onGenerateRoadmap}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                {isRoadmapComplete ? 'Create New Roadmap' : 'Generate Roadmap'}
              </button>
            </div>
          </GlassCard>
        )}
      </motion.section>

      {/* SECTION 4 — Today's Tasks (always visible — highest daily retention value) */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }}>
        <SectionHeader icon={ClipboardList} title="Today's Tasks" subtitle="Generated from your roadmap status" />
        <GlassCard className="p-4 sm:p-5">
          <ul className="space-y-2">
            {todaysTasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-start gap-3 p-4 rounded-xl transition-all duration-200 ${
                  task.completed ? 'state-completed' : 'home-nested-glass hover:border-purple-500/20'
                }`}
              >
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      task.completed ? 'text-emerald-400 line-through' : 'text-white'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{task.description}</p>
                </div>
              {!task.completed && task.lessonId && task.levelId && task.phaseId && (
                  <button
                    onClick={() => onStartLesson(task.phaseId!, task.levelId!, task.lessonId!)}
                    className="shrink-0 text-sm font-bold text-purple-400 hover:text-purple-300 cursor-pointer px-3 py-2 min-h-[36px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-purple-500/10 transition-colors"
                  >
                    Start
                  </button>
                )}
                {!task.completed && !task.lessonId && task.id === 'task-create-roadmap' && (
                  <button
                    onClick={onGenerateRoadmap}
                    className="shrink-0 text-sm font-bold text-purple-400 hover:text-purple-300 cursor-pointer px-3 py-2 min-h-[36px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-purple-500/10 transition-colors"
                  >
                    Start
                  </button>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      </motion.section>

      {/* ── Show more / Show less toggle ── */}
      <div className="flex justify-center pt-1 pb-1">
        <button
          type="button"
          onClick={toggleSecondary}
          aria-expanded={showSecondary}
          aria-controls="home-secondary-content"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 rounded-xl transition-colors cursor-pointer select-none"
        >
          {showSecondary ? (
            <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>More insights & achievements <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      </div>

      {/* ── Secondary sections (collapsible) ── */}
      <AnimatePresence initial={false}>
        {showSecondary && (
          <motion.div
            id="home-secondary-content"
            key="secondary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden space-y-8"
          >

      {/* SECTION 5 — AI Insights */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }}>
        <SectionHeader
          icon={Sparkles}
          title="AI Insights"
          subtitle={usingLocalInsights ? "Suggested from your roadmap progress" : "Personalised AI recommendations"}
        />
        {isRecsLoading && displayInsights.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <GlassCard key={i} interactive={false} className="p-5 space-y-3">
                <SkeletonBlock className="h-4 w-16" />
                <SkeletonBlock className="h-5 w-3/4" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-8 w-24 mt-2" />
              </GlassCard>
            ))}
          </div>
        ) : displayInsights.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayInsights.map((insight) => (
              <AIRecommendationCard
                key={insight.id}
                recommendation={insightToRecommendation(insight)}
                onLaunch={() => handleInsightLaunch(insight)}
              />
            ))}
          </div>
        ) : (
          <GlassCard tint="glass-card-purple" className="p-5">
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl border text-purple-400 bg-purple-500/10 border-purple-500/25 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-semibold text-sm text-white">
                  Start learning to unlock insights
                </h4>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  Complete your first lesson and we&apos;ll suggest what to study next, quizzes to
                  take, and topics to revise — all based on your roadmap progress.
                </p>
                <button
                  onClick={activeRoadmap ? onContinueLearning : onGenerateRoadmap}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  <span>{activeRoadmap ? 'Go to roadmap' : 'Create your roadmap'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </motion.section>

      {/* SECTION 6 — Learning Activity */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }}>
        <SectionHeader icon={TrendingUp} title="Learning Activity" subtitle="Real stats from your account" />
        {showActivity ? (
          <GlassCard tint="glass-card-blue" className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Study Time', value: `${profile.hoursStudied.toFixed(1)}h`, icon: Zap },
                { label: 'Lessons', value: String(stats.completedLessons), icon: BookOpen },
                { label: 'Quizzes', value: String(stats.quizzesCompleted), icon: ClipboardList },
                { label: 'Projects', value: String(stats.projectsCompleted), icon: Trophy },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="home-nested-glass text-center p-3.5 rounded-2xl">
                    <Icon className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
                    <p className="font-display text-xl font-bold text-white">{item.value}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{item.label}</p>
                  </div>
                );
              })}
            </div>

            {stats.totalLessons > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-300">Roadmap completion</p>
                  <span className="text-xs font-bold text-blue-400 font-mono">{stats.progressPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.progressPercent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  {stats.completedLessons} of {stats.totalLessons} lessons completed
                  {profile.streak > 0 && ` · ${profile.streak}-day streak`}
                </p>
              </div>
            )}
          </GlassCard>
        ) : (
          <GlassCard className="p-5 text-center">
            <CalendarCheck className="w-8 h-8 text-zinc-500 mx-auto mb-2.5" />
            <h4 className="font-display font-semibold text-sm text-white">No learning activity yet</h4>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
              Complete your first lesson to start tracking study time, quizzes, and project progress.
            </p>
            {currentLesson ? (
              <button
                onClick={() =>
                  onStartLesson(
                    currentLesson.phase.id,
                    currentLesson.level.id,
                    currentLesson.lesson.id,
                  )
                }
                className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Start first lesson
              </button>
            ) : (
              <button
                onClick={onGenerateRoadmap}
                className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Get started
              </button>
            )}
          </GlassCard>
        )}
      </motion.section>

      {/* SECTION 7 — Achievements */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.24 }}>
        <SectionHeader icon={Award} title="Achievements" subtitle="Earned from your learning activity" />
        {Array.isArray(unlockedAchievements) && unlockedAchievements.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unlockedAchievements.slice(0, 6).map((achievement) => (
              <GlassCard key={achievement.id} tint="glass-card-orange" className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl border text-amber-500 bg-amber-500/10 border-amber-500/20 shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm text-white truncate">{achievement.name}</h4>
                    <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2">{achievement.description}</p>
                    <span className="inline-block mt-2 text-xs font-bold text-amber-500">
                      +{achievement.xpReward} XP REWARD
                    </span>
                    {achievement.unlockedAt && (
                      <p className="text-xs text-zinc-500 mt-1">
                        {new Date(achievement.unlockedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-5 text-center">
            <Award className="w-8 h-8 text-zinc-500 mx-auto mb-2.5" />
            <h4 className="font-display font-semibold text-sm text-white">No achievements yet</h4>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-sm mx-auto">
              Complete lessons, pass quizzes, and generate roadmaps to unlock milestones.
            </p>
          </GlassCard>
        )}
      </motion.section>

      {/* SECTION 8 — Quick Actions */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.28 }}>
        <SectionHeader icon={Zap} title="Quick Actions" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                className={`${action.tint} ${glassCardClass()} ${buttonStyles.ghost} rounded-2xl p-4 text-left transition-all duration-200 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0 min-h-[88px]`}
              >
                <div className="p-2 rounded-xl border text-purple-400 bg-purple-500/10 border-purple-500/20 w-fit mb-2.5">
                  <Icon className="w-4 h-4" />
                </div>
                {/* Allow wrapping so long labels never truncate on narrow phones */}
                <p className="font-display font-semibold text-sm text-white leading-snug">{action.label}</p>
              </button>
            );
          })}
        </div>
      </motion.section>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
