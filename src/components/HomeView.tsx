import React, { useMemo } from 'react';
import {
  Play,
  Sparkles,
  Trophy,
  Flame,
  BookOpen,
  ChevronRight,
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
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, Roadmap, Phase, Achievement } from '../types';
import { AIRecommendationCard } from './Cards';
import { StreakBadge } from './Badges';
import {
  computeRoadmapStats,
  deriveProgressInsights,
  deriveTodaysTasks,
  findCurrentLesson,
  findNextUpLesson,
  findCurrentModule,
  getModuleProgress,
  hasLearningActivity,
  estimateLessonDuration,
  ProgressInsight,
} from '../lib/homeData';

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
  onContinueLearning: () => void;
  onGenerateRoadmap: () => void;
  onStartLesson: (phaseId: string, levelId: string, lessonId: string) => void;
  onLaunchRecommendation: (rec: AIRecommendation) => void;
  onOpenMentor: () => void;
  onViewProgress: () => void;
  roadmapProgress?: Record<string, any>;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

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
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/20">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-display font-semibold text-sm text-white">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-zinc-400 mt-1 ml-9">{subtitle}</p>}
    </div>
  );
}

function GlassCard({
  children,
  className = '',
  tint = 'glass-card',
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  tint?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`${tint} home-glass rounded-3xl relative overflow-hidden ${interactive ? 'home-glass-interactive' : ''} ${className}`}
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
  onContinueLearning,
  onGenerateRoadmap,
  onStartLesson,
  onLaunchRecommendation,
  onOpenMentor,
  onViewProgress,
}: HomeViewProps) {
  const firstName = profile.name.split(' ')[0] || profile.name;

  const stats = useMemo(() => computeRoadmapStats(activeRoadmap), [activeRoadmap]);
  const currentLesson = useMemo(
    () => (activeRoadmap ? findCurrentLesson(activeRoadmap) : null),
    [activeRoadmap],
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
    () => achievements.filter((a) => a.unlocked),
    [achievements],
  );

  const displayInsights =
    progressInsights.length > 0
      ? progressInsights
      : aiRecommendations.slice(0, 2).map((rec) => ({
          id: rec.id,
          title: rec.title,
          description: rec.description,
          xpReward: rec.xpReward,
          category: rec.category,
          difficulty: rec.difficulty,
        }));

  const showActivity = hasLearningActivity(profile, stats);
  const roadmapTitle = activeRoadmap?.goal ?? null;
  const learningGoal = activeRoadmap?.goal ?? 'Start your first learning roadmap';

  const handleInsightLaunch = (insight: ProgressInsight) => {
    if (insight.phaseId && insight.levelId && insight.lessonId) {
      onStartLesson(insight.phaseId, insight.levelId, insight.lessonId);
    } else if (insight.category === 'mentor') {
      onOpenMentor();
    } else {
      onLaunchRecommendation(insightToRecommendation(insight));
    }
  };

  const snapshotCards = [
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
  ];

  const quickActions = [
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
    {
      id: 'continue',
      label: 'Continue Lesson',
      icon: Play,
      tint: 'glass-card-emerald',
      onClick: () => {
        if (currentLesson) {
          onStartLesson(currentLesson.phase.id, currentLesson.level.id, currentLesson.lesson.id);
        } else {
          onContinueLearning();
        }
      },
      disabled: !activeRoadmap,
    },
  ];

  return (
    <div className="home-view space-y-4 pb-2 max-w-full overflow-x-hidden">
      {/* SECTION 1 — Personalized Hero */}
      <motion.section {...fadeUp}>
        <GlassCard tint="glass-card-purple" className="p-5 sm:p-6">
          <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600 rounded-full blur-[120px] opacity-15 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-600 rounded-full blur-[100px] opacity-10 pointer-events-none" />

          <div className="relative z-10">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest font-mono">
              {getTimeGreeting()}, {firstName}
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1 leading-tight">
              Continue your learning journey
            </h1>

            {activeRoadmap ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mt-3.5">
                  <span className="home-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-300">
                    <Map className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate max-w-[220px]">{roadmapTitle}</span>
                  </span>
                  <span className="home-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-300">
                    <Target className="w-3.5 h-3.5 text-purple-400" />
                    Level {stats.curriculumLevel}
                  </span>
                  <span className="home-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-300">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    {stats.progressPercent}% complete
                  </span>
                  {profile.streak > 0 ? (
                    <StreakBadge days={profile.streak} />
                  ) : (
                    <span className="home-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400">
                      <Flame className="w-3.5 h-3.5 text-zinc-500" />
                      {profile.streak} day streak
                    </span>
                  )}
                </div>

                {activePhase && (
                  <p className="text-xs text-zinc-350 mt-3 truncate">
                    Goal: <span className="font-medium text-white">{learningGoal}</span>
                    {' · '}
                    Phase: <span className="font-medium text-white">{activePhase.name}</span>
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
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
                    className="home-btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 text-white font-bold text-xs rounded-xl active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Continue Learning
                  </button>
                  <button
                    onClick={onOpenMentor}
                    className="home-btn-secondary inline-flex items-center justify-center gap-2 px-5 py-2.5 text-purple-400 font-bold text-xs rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Bot className="w-4 h-4" />
                    Open AI Mentor
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-350 mt-3 max-w-lg leading-relaxed">
                  Let&apos;s create your first learning roadmap. Tell us your goal and we&apos;ll
                  build a structured path with lessons, quizzes, and projects.
                </p>
                <button
                  onClick={onGenerateRoadmap}
                  className="home-btn-primary mt-4 inline-flex items-center gap-2 px-6 py-3 text-white font-bold text-xs rounded-xl active:scale-[0.98] transition-all cursor-pointer"
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {snapshotCards.map((card) => {
            const Icon = card.icon;
            return (
              <GlassCard key={card.id} tint={card.glass} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300 font-medium">{card.label}</span>
                  <div className={`p-1.5 rounded-lg border flex-shrink-0 ${card.iconColor}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-white mt-3">{card.value}</p>
                <p className="text-[10px] text-zinc-400 mt-1 truncate">{card.sub}</p>
              </GlassCard>
            );
          })}
        </div>
      </motion.section>

      {/* SECTION 3 — Continue Learning */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
        <SectionHeader icon={Play} title="Continue Learning" subtitle="Your current position in the roadmap" />
        {activeRoadmap && currentModule ? (
          <GlassCard tint="glass-card-purple" className="p-5 sm:p-6">
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300 font-mono">
                    {activeRoadmap.goal}
                  </span>
                  <h4 className="font-display font-bold text-lg text-white mt-1">
                    {currentModule.level.name}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">{currentModule.phase.name}</p>
                </div>
                <span className="shrink-0 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                  {getModuleProgress(currentModule.level)}%
                </span>
              </div>

              <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${getModuleProgress(currentModule.level)}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentLesson && (
                  <div className="state-current rounded-2xl p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                      Current Lesson
                    </p>
                    <p className="font-semibold text-sm text-white mt-1 truncate">
                      {currentLesson.lesson.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {estimateLessonDuration(currentLesson.lesson)} · +{currentLesson.lesson.xpReward} XP
                    </p>
                  </div>
                )}
                {nextLesson && nextLesson.lesson.id !== currentLesson?.lesson.id && (
                  <div className="state-upcoming rounded-2xl p-3.5 opacity-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                      Up Next
                    </p>
                    <p className="font-semibold text-sm text-white mt-1 truncate">
                      {nextLesson.lesson.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {nextLesson.lesson.type.replace('_', ' ')} · +{nextLesson.lesson.xpReward} XP
                    </p>
                  </div>
                )}
              </div>

              {currentLesson && (
                <button
                  onClick={() =>
                    onStartLesson(
                      currentLesson.phase.id,
                      currentLesson.level.id,
                      currentLesson.lesson.id,
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_15px_rgba(168,85,247,0.4)] w-full sm:w-auto self-start"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Continue Learning
                </button>
              )}
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="p-5 text-center">
            <BookOpen className="w-8 h-8 text-zinc-500 mx-auto mb-2.5" />
            <h4 className="font-display font-semibold text-sm text-white">
              {activeRoadmap ? 'All lessons completed!' : 'No active roadmap yet'}
            </h4>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-sm mx-auto">
              {activeRoadmap
                ? 'You have finished every lesson in this roadmap. Generate a new one to keep learning.'
                : 'Create a roadmap to see your current module, lesson, and progress here.'}
            </p>
            <button
              onClick={onGenerateRoadmap}
              className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/15 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {activeRoadmap ? 'Generate New Roadmap' : 'Generate Roadmap'}
            </button>
          </GlassCard>
        )}
      </motion.section>

      {/* SECTION 4 — AI Insights */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.12 }}>
        <SectionHeader
          icon={Sparkles}
          title="AI Insights"
          subtitle="Recommendations based on your actual progress"
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
                <p className="text-xs text-zinc-350 mt-1 leading-relaxed">
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

      {/* SECTION 5 — Today's Tasks */}
      <motion.section {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.16 }}>
        <SectionHeader icon={ClipboardList} title="Today's Tasks" subtitle="Generated from your roadmap status" />
        <GlassCard className="p-4 sm:p-5">
          <ul className="space-y-2">
            {todaysTasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-start gap-3 p-3.5 rounded-2xl transition-all duration-200 ${
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
                  <p className="text-xs text-zinc-400 mt-0.5">{task.description}</p>
                </div>
                {!task.completed && task.lessonId && task.levelId && task.phaseId && (
                  <button
                    onClick={() => onStartLesson(task.phaseId!, task.levelId!, task.lessonId!)}
                    className="shrink-0 text-[10px] font-bold text-purple-400 hover:text-purple-300 cursor-pointer px-2 py-1"
                  >
                    Start
                  </button>
                )}
                {!task.completed && !task.lessonId && task.id === 'task-create-roadmap' && (
                  <button
                    onClick={onGenerateRoadmap}
                    className="shrink-0 text-[10px] font-bold text-purple-400 hover:text-purple-300 cursor-pointer px-2 py-1"
                  >
                    Start
                  </button>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
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
                    <p className="text-[10px] text-zinc-400 mt-0.5">{item.label}</p>
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
                <div className="h-2.5 rounded-full bg-white/5 border border-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.progressPercent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-2 font-mono">
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
        {unlockedAchievements.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unlockedAchievements.slice(0, 6).map((achievement) => (
              <GlassCard key={achievement.id} tint="glass-card-orange" className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl border text-amber-500 bg-amber-500/10 border-amber-500/20 shrink-0">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm text-white truncate">{achievement.name}</h4>
                    <p className="text-xs text-zinc-350 mt-0.5 line-clamp-2">{achievement.description}</p>
                    <span className="inline-block mt-2 text-[10px] font-bold text-amber-500 font-mono">
                      +{achievement.xpReward} XP REWARD
                    </span>
                    {achievement.unlockedAt && (
                      <p className="text-[9px] text-zinc-500 mt-1 font-mono">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`${action.tint} home-glass home-glass-interactive rounded-3xl p-4 text-left transition-all duration-300 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
              >
                <div className="p-2 rounded-xl border text-purple-400 bg-purple-500/10 border-purple-500/20 w-fit mb-2.5">
                  <Icon className="w-4 h-4" />
                </div>
                <p className="font-display font-semibold text-sm text-white">{action.label}</p>
              </button>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
