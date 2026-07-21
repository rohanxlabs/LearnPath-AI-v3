import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Lock, CheckCircle2, Clock, BookOpen, Zap, Rocket,
  ExternalLink, Brain, Play, Award, Trophy, XCircle, BarChart2, Calendar,
  FileText, Video, Bookmark,
} from 'lucide-react';
import { Roadmap, Phase } from '../types';
import { ModuleCard } from './ModuleCard';
import {
  calcPhaseProgress,
  phaseLessonCounts,
  calcPhaseEstimatedMinutes,
  difficultyColor,
  PhaseUnlockStatus,
} from '../lib/roadmapUtils';
import { buttonStyles } from '../styles/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhaseDetailPageProps {
  roadmap: Roadmap;
  phase: Phase;
  phaseIndex: number;
  unlockStatus: PhaseUnlockStatus;
  onBack: () => void;
  onLessonClick: (phaseId: string, levelId: string, lessonId: string) => void;
  onAddXp: (amount: number) => void;
  onRoadmapUpdated?: () => void;
}

type DetailTab = 'modules' | 'resources' | 'quiz' | 'project';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  misconceptionNotes?: string[];
}

// ---------------------------------------------------------------------------
// PhaseDetailPage
// ---------------------------------------------------------------------------

export function PhaseDetailPage({
  roadmap,
  phase,
  phaseIndex,
  unlockStatus,
  onBack,
  onLessonClick,
  onAddXp,
  onRoadmapUpdated,
}: PhaseDetailPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('modules');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => {
    // Auto-expand first non-completed module
    const firstActive = (phase.levels || []).find(
      l => l.lessons?.some(les => les.status !== 'completed'),
    );
    return new Set(firstActive ? [firstActive.id] : []);
  });

  const progress = calcPhaseProgress(phase);
  const { total: totalLessons, completed: completedLessons } = phaseLessonCounts(phase);
  const estMins = calcPhaseEstimatedMinutes(phase);
  const estHrs = estMins > 0 ? (estMins / 60).toFixed(1) : (phase.estimatedHours?.toFixed(1) ?? '—');

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Recommended lesson (first available)
  const recommendedLesson = useMemo(() => {
    for (const level of phase.levels || []) {
      for (const lesson of level.lessons || []) {
        if (lesson.status === 'available') {
          return { levelId: level.id, lessonId: lesson.id };
        }
      }
    }
    return null;
  }, [phase]);

  const getModuleStatus = (level: any) => {
    const total = level.lessons?.length || 0;
    const completed = (level.lessons || []).filter((l: any) => l.status === 'completed').length;
    if (total === 0) return 'not-started' as const;
    if (completed === 0) return 'not-started' as const;
    if (completed === total) return 'completed' as const;
    return 'in-progress' as const;
  };

  // Phase resources: collect from all module-level resources
  const phaseResources = useMemo(() => {
    return (phase.levels || []).flatMap(level => (level as any).resources || []);
  }, [phase]);

  // Phase project (first project)
  const phaseProject = (phase as any).projects?.[0] ?? null;

  // Quiz state
  const savedQuiz = roadmap.quizzes?.[phase.id];

  const TABS: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'modules', label: 'Modules', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'resources', label: 'Resources', icon: <ExternalLink className="w-3.5 h-3.5" /> },
    { id: 'quiz', label: 'Quiz', icon: <Brain className="w-3.5 h-3.5" /> },
    { id: 'project', label: 'Project', icon: <Rocket className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5 pb-10 relative">
      {/* ── Locked overlay ── */}
      {unlockStatus === 'locked' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl px-6 text-center py-20 min-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
            <Lock className="w-8 h-8 text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">Phase Locked</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
              Complete Phase {phaseIndex} to unlock <strong>{phase.name}</strong>.
            </p>
          </div>
          {(phase.skillsCovered || []).length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {(phase.skillsCovered || []).map(skill => (
                <span key={skill} className="px-2.5 py-1 text-xs font-medium rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10">
                  {skill}
                </span>
              ))}
            </div>
          )}
          <button onClick={onBack} className={`mt-2 px-5 py-2.5 rounded-xl text-sm font-bold ${buttonStyles.primary}`}>
            Back to Roadmap
          </button>
        </div>
      )}

      {/* ── Phase header ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/10 border border-purple-100 dark:border-purple-500/20 p-5 sm:p-6 space-y-4"
      >
        <button onClick={onBack} className="flex items-center gap-2 text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-200 text-sm font-semibold transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Roadmap Overview
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-purple-600 text-white text-sm font-extrabold flex items-center justify-center flex-shrink-0">
                {phaseIndex + 1}
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                {phase.name}
              </h1>
            </div>

            {phase.description && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pl-10">
                {phase.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pl-10">
              {(phase as any).difficulty && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${difficultyColor((phase as any).difficulty)}`}>
                  {(phase as any).difficulty}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <Clock className="w-3.5 h-3.5" /> {estHrs} hrs
              </span>
            </div>

            {/* skill tags */}
            {(phase.skillsCovered || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-10">
                {(phase.skillsCovered || []).map(skill => (
                  <span key={skill} className="px-2.5 py-0.5 bg-white dark:bg-white/5 text-zinc-600 dark:text-zinc-400 text-xs font-medium rounded-full border border-zinc-200 dark:border-white/10">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* phase progress ring */}
          <div className="flex-shrink-0 self-start sm:self-center">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" stroke="#e5e7eb" strokeWidth="6" fill="none" className="dark:stroke-white/10" />
                <circle
                  cx="32" cy="32" r="26"
                  stroke="url(#phaseGrad)" strokeWidth="6" fill="none"
                  strokeDasharray={`${2 * Math.PI * 26}`}
                  strokeDashoffset={`${2 * Math.PI * 26 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="phaseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-extrabold text-zinc-900 dark:text-white">{progress}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3-gate progress bar */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <GateStat
            label="Lessons"
            value={`${completedLessons}/${totalLessons}`}
            done={completedLessons === totalLessons && totalLessons > 0}
            icon={<BookOpen className="w-3.5 h-3.5" />}
          />
          <GateStat
            label="Quiz"
            value={savedQuiz ? `${(roadmap as any)._quizScore ?? '—'}%` : 'Not taken'}
            done={!!savedQuiz}
            icon={<Brain className="w-3.5 h-3.5" />}
          />
          <GateStat
            label="Project"
            value={phaseProject ? `${phaseProject.progress ?? 0}%` : 'None'}
            done={phaseProject?.progress === 100}
            icon={<Rocket className="w-3.5 h-3.5" />}
          />
        </div>
      </motion.div>

      {/* ── Content tab bar ── */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0
              ${activeTab === tab.id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'modules' && (
            <ModulesSection
              phase={phase}
              expandedModules={expandedModules}
              onToggleModule={toggleModule}
              onLessonClick={onLessonClick}
              recommendedLesson={recommendedLesson}
              getModuleStatus={getModuleStatus}
            />
          )}
          {activeTab === 'resources' && (
            <ResourcesSection resources={phaseResources} />
          )}
          {activeTab === 'quiz' && (
            <QuizSection
              phase={phase}
              roadmap={roadmap}
              savedQuiz={savedQuiz}
              onAddXp={onAddXp}
              onRoadmapUpdated={onRoadmapUpdated}
            />
          )}
          {activeTab === 'project' && (
            <ProjectSection
              project={phaseProject}
              roadmap={roadmap}
              phase={phase}
              onRoadmapUpdated={onRoadmapUpdated}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GateStat
// ---------------------------------------------------------------------------

function GateStat({ label, value, done, icon }: { label: string; value: string; done: boolean; icon: React.ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border transition-colors
      ${done
        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
        : 'bg-white dark:bg-white/[0.02] border-zinc-200 dark:border-white/10'
      }`}>
      <div className={`${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : icon}
      </div>
      <span className={`text-xs font-bold ${done ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
        {value}
      </span>
      <span className="text-xs text-zinc-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModulesSection
// ---------------------------------------------------------------------------

function ModulesSection({ phase, expandedModules, onToggleModule, onLessonClick, recommendedLesson, getModuleStatus }: any) {
  if (!phase.levels || phase.levels.length === 0) {
    return <p className="text-sm text-zinc-400 text-center py-10">No modules in this phase.</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-[18px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-purple-300 via-violet-300 to-purple-300 dark:from-purple-500/40 dark:via-violet-500/30 dark:to-purple-500/40 rounded-full" />
      <div className="space-y-4">
        {phase.levels.map((level: any) => {
          const moduleStatus = getModuleStatus(level);
          const isRecommended = recommendedLesson?.levelId === level.id;
          return (
            <div key={level.id} className="relative pl-10">
              <div className={`absolute left-[13px] top-7 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 shadow-md ${
                moduleStatus === 'completed'
                  ? 'bg-gradient-to-br from-emerald-400 to-emerald-500'
                  : moduleStatus === 'in-progress'
                  ? 'bg-gradient-to-br from-purple-400 to-violet-500'
                  : 'bg-gradient-to-br from-zinc-300 to-zinc-400'
              }`} />
              <ModuleCard
                level={level}
                phaseName={phase.name}
                expanded={expandedModules.has(level.id)}
                onToggle={() => onToggleModule(level.id)}
                onLessonClick={(levelId: string, lessonId: string) => onLessonClick(phase.id, levelId, lessonId)}
                recommendedLessonId={isRecommended ? recommendedLesson.lessonId : undefined}
                moduleStatus={moduleStatus}
                phaseId={phase.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResourcesSection
// ---------------------------------------------------------------------------

function ResourcesSection({ resources }: { resources: any[] }) {
  if (resources.length === 0) {
    return (
      <div className="text-center py-12 px-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10">
        <BookOpen className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No resources for this phase yet.</p>
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4 text-rose-400" />;
      case 'paper': case 'book': return <FileText className="w-4 h-4 text-blue-400" />;
      case 'course': return <Bookmark className="w-4 h-4 text-amber-400" />;
      default: return <BookOpen className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-3">
      {resources.map((res: any, i: number) => (
        <motion.a
          key={res.id || i}
          href={res.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/40 hover:shadow-sm transition-all group"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
              {getIcon(res.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300 truncate transition-colors">
                {res.title}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {res.provider ? `${res.provider} · ` : ''}{res.type}
              </p>
              {res.description && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{res.description}</p>
              )}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-zinc-400 group-hover:text-purple-500 flex-shrink-0 mt-0.5 transition-colors" />
        </motion.a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuizSection
// ---------------------------------------------------------------------------

function QuizSection({ phase, roadmap, savedQuiz, onAddXp, onRoadmapUpdated }: any) {
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(
    savedQuiz?.questions || [],
  );
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<{ score: number; correct: number; total: number } | null>(null);

  const generateQuiz = async () => {
    setLoadingQuiz(true);
    setQuizError(null);
    try {
      const topicName = phase.skillsCovered?.length > 0
        ? `${phase.name}: ${phase.skillsCovered.join(', ')}`
        : phase.name;
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const questions: QuizQuestion[] = await res.json();
      setQuizQuestions(questions);

      // Persist quiz to roadmap
      try {
        await fetch('/api/update-roadmap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roadmapId: roadmap.id,
            updates: {
              quizzes: {
                ...(roadmap.quizzes || {}),
                [phase.id]: { questions, name: phase.name },
              },
            },
          }),
        });
        onRoadmapUpdated?.();
      } catch (_) {}
    } catch (e: any) {
      setQuizError(e.message || 'Failed to generate quiz.');
    } finally {
      setLoadingQuiz(false);
    }
  };

  if (activeQuiz && quizQuestions.length > 0) {
    return (
      <InlineQuiz
        questions={quizQuestions}
        onComplete={(score, correct) => {
          const xp = score === 100 ? 50 : score >= 70 ? 25 : 0;
          if (xp > 0) onAddXp(xp);
          setQuizResult({ score, correct, total: quizQuestions.length });
          setActiveQuiz(false);
        }}
        onExit={() => setActiveQuiz(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {quizResult && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 text-center space-y-2"
        >
          <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
          <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Quiz Complete!</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Score: <span className="font-bold text-purple-700 dark:text-purple-300">{quizResult.score}%</span>
            {' '}({quizResult.correct}/{quizResult.total} correct)
          </p>
          <button onClick={() => setQuizResult(null)} className="text-xs text-zinc-400 hover:text-zinc-600 underline mt-1">Dismiss</button>
        </motion.div>
      )}

      <div className="p-5 rounded-2xl bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white">{phase.name}</h3>
            <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1 mt-0.5">
              <Brain className="w-3.5 h-3.5" /> Multiple Choice · AI Generated
            </span>
          </div>
          {quizResult && (
            <div className={`text-sm font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${quizResult.score >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              <Trophy className="w-3.5 h-3.5" /> {quizResult.score}%
            </div>
          )}
        </div>

        {quizError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" /> {quizError}
          </div>
        )}

        {quizQuestions.length === 0 ? (
          <div className="text-center py-4">
            <Brain className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              No quiz yet. Generate one tailored to <strong>{phase.name}</strong>.
            </p>
            <button
              onClick={generateQuiz}
              disabled={loadingQuiz}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold ${buttonStyles.primary} flex items-center gap-2 mx-auto disabled:opacity-50`}
            >
              {loadingQuiz ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Generate Phase Quiz
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setActiveQuiz(true)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold ${buttonStyles.primary} flex items-center justify-center gap-2`}
            >
              <Award className="w-4 h-4" />
              {quizResult ? 'Retake Quiz' : 'Start Quiz'} ({quizQuestions.length} questions)
            </button>
            <button
              onClick={generateQuiz}
              disabled={loadingQuiz}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" /> {loadingQuiz ? 'Generating...' : 'Regenerate Quiz'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineQuiz
// ---------------------------------------------------------------------------

function InlineQuiz({ questions, onComplete, onExit }: {
  questions: QuizQuestion[];
  onComplete: (score: number, correct: number) => void;
  onExit: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const correctCount = Object.values(answers).filter(Boolean).length;

  const handleSubmit = () => {
    if (selectedOpt === null) return;
    const isCorrect = selectedOpt === questions[currentIdx].correctIndex;
    setAnswers(prev => ({ ...prev, [currentIdx]: isCorrect }));
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedOpt(null);
      setShowFeedback(false);
    } else {
      const finalScore = Math.round((correctCount / questions.length) * 100);
      onComplete(finalScore, correctCount);
    }
  };

  const currentQ = questions[currentIdx];

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white dark:bg-white/[0.03] border-zinc-200 dark:border-white/10 space-y-5">
      <div>
        <div className="flex justify-between items-center text-xs text-zinc-400 mb-2">
          <span>Question {currentIdx + 1} of {questions.length}</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{correctCount} Correct</span>
        </div>
        <div className="w-full bg-zinc-100 dark:bg-white/10 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={currentIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
          <h3 className="font-bold text-base text-zinc-900 dark:text-white">{currentQ.question}</h3>
          <div className="space-y-2">
            {(currentQ.options || []).map((opt, oIdx) => {
              const isSelected = selectedOpt === oIdx;
              const isCorrect = oIdx === currentQ.correctIndex;
              let cls = 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10';
              if (showFeedback) {
                if (isCorrect) cls = 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
                else if (isSelected) cls = 'border-red-400 bg-red-50 dark:bg-red-500/10';
              } else if (isSelected) {
                cls = 'border-purple-400 bg-purple-50 dark:bg-purple-500/10';
              }
              return (
                <button key={oIdx} onClick={() => { if (!showFeedback) setSelectedOpt(oIdx); }} disabled={showFeedback}
                  className={`w-full text-left p-4 rounded-xl border text-sm font-medium transition-all flex items-center gap-3 ${cls}`}>
                  <span className="w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center font-bold text-xs bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400">
                    {String.fromCharCode(65 + oIdx)}
                  </span>
                  <span className="flex-1">{opt}</span>
                  {showFeedback && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                  {showFeedback && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          {showFeedback && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-4 bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 rounded-xl text-sm space-y-2">
              <p className="font-bold text-zinc-900 dark:text-white">Explanation</p>
              <p className="text-zinc-600 dark:text-zinc-400">{currentQ.explanation}</p>
            </motion.div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button onClick={onExit} className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              Exit Quiz
            </button>
            {showFeedback ? (
              <button onClick={handleNext} className={`px-5 py-2 rounded-xl text-sm font-bold ${buttonStyles.primary}`}>
                {currentIdx === questions.length - 1 ? 'Finish' : 'Next →'}
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={selectedOpt === null}
                className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
                Submit
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectSection
// ---------------------------------------------------------------------------

function ProjectSection({ project, roadmap, phase, onRoadmapUpdated }: any) {
  const [progress, setProgress] = useState(project?.progress ?? 0);
  const [githubUrl, setGithubUrl] = useState(project?.githubUrl ?? '');
  const [saving, setSaving] = useState(false);

  if (!project) {
    return (
      <div className="text-center py-12 px-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/10">
        <Rocket className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No project assigned to this phase yet.</p>
      </div>
    );
  }

  const diffColors: Record<string, string> = {
    'mini-exercise': 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20',
    'mini-project': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    'real-application': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    'portfolio-project': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20',
    'capstone': 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  };

  const saveProgress = async (newProgress: number) => {
    setSaving(true);
    try {
      const updatedProjects = (roadmap.projects || []).map((p: any) =>
        p.id === project.id ? { ...p, progress: newProgress, githubUrl } : p,
      );
      await fetch('/api/update-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roadmapId: roadmap.id, updates: { projects: updatedProjects } }),
      });
      onRoadmapUpdated?.();
    } catch (_) {} finally {
      setSaving(false);
    }
  };

  const isCompleted = progress === 100;

  return (
    <div className="rounded-2xl bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 overflow-hidden">
      <div className="p-5 sm:p-6 space-y-4">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${diffColors[project.difficulty] || 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                {project.difficulty}
              </span>
              {isCompleted && (
                <span className="flex items-center gap-1 text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Completed
                </span>
              )}
            </div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-white">{project.title}</h3>
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{project.description}</p>
        )}

        {/* tech stack */}
        {(project.techStack || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.techStack.map((tech: string) => (
              <span key={tech} className="px-2.5 py-0.5 bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-full text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {tech}
              </span>
            ))}
          </div>
        )}

        {/* features */}
        {(project.features || []).length > 0 && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.06] space-y-2">
            <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Key Features</h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-zinc-600 dark:text-zinc-400 list-disc list-inside">
              {project.features.map((feat: string, i: number) => <li key={i}>{feat}</li>)}
            </ul>
          </div>
        )}

        {/* github url input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">GitHub Repository URL (optional)</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/you/project"
              className="flex-1 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {githubUrl && (
              <a href={githubUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" /> View
              </a>
            )}
          </div>
        </div>

        {/* progress slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-zinc-600 dark:text-zinc-300">Progress</span>
            <span className={isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}>{progress}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={10} value={progress}
            onChange={e => setProgress(Number(e.target.value))}
            className="w-full h-2 accent-purple-600 cursor-pointer"
          />
          <button
            onClick={() => saveProgress(progress)}
            disabled={saving}
            className={`w-full py-2.5 rounded-xl text-sm font-bold ${buttonStyles.primary} disabled:opacity-50 transition-all`}
          >
            {saving ? 'Saving...' : 'Save Progress'}
          </button>
        </div>
      </div>
    </div>
  );
}
