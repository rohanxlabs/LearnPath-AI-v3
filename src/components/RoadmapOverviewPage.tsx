import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Sparkles, Play, Lock, CheckCircle2,
  Clock, Zap, BookOpen, ChevronRight, PlusCircle,
} from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import {
  calcPhaseProgress,
  calcPhaseEstimatedMinutes,
  calcEstimatedCompletionWeeks,
  getPhaseUnlockStatus,
  difficultyColor,
  PhaseUnlockStatus,
} from '../lib/roadmapUtils';
import { RoadmapGeneratorForm } from './RoadmapGeneratorForm';

interface RoadmapOverviewPageProps {
  roadmap: Roadmap;
  profile: UserProfile;
  onSelectPhase: (phaseId: string) => void;
  onBack: () => void;
  onContinueLearning: () => void;
  onGenerateRoadmap: (params: {
    goal: string;
    experienceLevel: string;
    weeklyHours: number;
    preferredStyle: string;
  }) => Promise<void>;
  isGenerating: boolean;
}

const LOADING_QUOTES = [
  'Mapping out your learning phases...',
  'Building your quizzes...',
  'Setting up your coding exercises...',
  'Generating your personalized lessons...',
  'Putting together your milestones...',
];

export function RoadmapOverviewPage({
  roadmap,
  profile,
  onSelectPhase,
  onBack,
  onContinueLearning,
  onGenerateRoadmap,
  isGenerating,
}: RoadmapOverviewPageProps) {
  const [lockedToast, setLockedToast] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const handlePhaseClick = (phaseId: string, status: PhaseUnlockStatus, phaseIndex: number) => {
    if (status === 'locked') {
      const msg = phaseIndex > 0
        ? `Complete Phase ${phaseIndex} first to unlock this phase.`
        : 'This phase is locked.';
      setLockedToast(msg);
      setTimeout(() => setLockedToast(null), 3000);
      return;
    }
    onSelectPhase(phaseId);
  };

  const completionWeeks = calcEstimatedCompletionWeeks(roadmap);
  const activeLesson = (roadmap.phases || [])
    .flatMap(p => (p.levels || []).flatMap(l => l.lessons || []))
    .find(l => l.status === 'available');

  const totalLessons = (roadmap.phases || [])
    .flatMap(p => (p.levels || []).flatMap(l => l.lessons || [])).length;
  const completedLessons = (roadmap.phases || [])
    .flatMap(p => (p.levels || []).flatMap(l => l.lessons || []))
    .filter(l => l.status === 'completed').length;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Hero banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 p-6 md:p-8 shadow-[0_4px_20px_rgba(79,70,229,0.18)]"
      >
        {/* decorative blobs */}
        <div className="pointer-events-none absolute top-0 right-0 w-56 h-56 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-44 h-44 bg-purple-300/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 space-y-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Roadmaps
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                {roadmap.goal}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold text-white border border-white/20">
                  {roadmap.experienceLevel}
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold text-white border border-white/20">
                  {roadmap.preferredStyle}
                </span>
              </div>
            </div>

            {/* circular progress */}
            <div className="flex-shrink-0 self-start sm:self-center">
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,0.2)" strokeWidth="7" fill="none" />
                  <circle
                    cx="40" cy="40" r="34"
                    stroke="white" strokeWidth="7" fill="none"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - roadmap.progressPercent / 100)}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold text-white leading-none">{roadmap.progressPercent}%</span>
                  <span className="text-xs text-white/70 font-medium uppercase tracking-wide">done</span>
                </div>
              </div>
            </div>
          </div>

          {/* stats row */}
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              <span className="text-sm font-bold text-white">{roadmap.totalXp} XP</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-white/70" />
              <span className="text-sm text-white/80">{completedLessons} / {totalLessons} lessons</span>
            </div>
            {completionWeeks !== null && completionWeeks > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/70" />
                <span className="text-sm text-white/80">~{completionWeeks} week{completionWeeks !== 1 ? 's' : ''} left</span>
              </div>
            )}
            {completionWeeks === 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span className="text-sm font-bold text-emerald-200">Completed!</span>
              </div>
            )}
          </div>

          {/* CTA */}
          {activeLesson && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onContinueLearning}
              className={`mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-purple-700 hover:bg-white/90 transition-all shadow-lg`}
            >
              <Play className="w-4 h-4 fill-current" />
              Continue Learning
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Locked toast ── */}
      {lockedToast && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium shadow-sm"
        >
          <Lock className="w-4 h-4 flex-shrink-0" />
          {lockedToast}
        </motion.div>
      )}

      {/* ── Phase cards ── */}
      <div className="space-y-3">
        <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Learning Phases
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(roadmap.phases || []).map((phase, idx) => {
            const status = getPhaseUnlockStatus(roadmap.phases, idx);
            const progress = calcPhaseProgress(phase);
            const estMins = calcPhaseEstimatedMinutes(phase);
            const estHrs = estMins > 0 ? (estMins / 60).toFixed(1) : phase.estimatedHours?.toFixed(1) ?? '—';
            const totalLs = (phase.levels || []).flatMap(l => l.lessons || []).length;
            const doneLs = (phase.levels || []).flatMap(l => l.lessons || []).filter(l => l.status === 'completed').length;

            return (
              <motion.div
                key={phase.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.06 }}
                onClick={() => handlePhaseClick(phase.id, status, idx)}
                className={`relative rounded-2xl border p-5 transition-all duration-200 overflow-hidden
                  ${status === 'locked'
                    ? 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] cursor-not-allowed'
                    : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:border-purple-300 dark:hover:border-purple-500/40'
                  }
                  ${status === 'unlocked' ? 'ring-2 ring-purple-400/40 dark:ring-purple-500/30' : ''}
                `}
              >
                {/* locked blur overlay */}
                {status === 'locked' && (
                  <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center gap-2 bg-zinc-100/70 dark:bg-zinc-900/60 backdrop-blur-[2px]">
                    <Lock className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 text-center px-4">
                      Complete Phase {idx} to unlock
                    </span>
                  </div>
                )}

                {/* card body (shown behind overlay for locked) */}
                <div className={status === 'locked' ? 'opacity-40 select-none' : ''}>
                  {/* header row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs font-extrabold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-base text-zinc-900 dark:text-white leading-snug truncate">
                        {phase.name}
                      </h3>
                    </div>

                    {/* status badge */}
                    {status === 'completed' && (
                      <span className="flex-shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    )}
                    {status === 'unlocked' && (
                      <span className="flex-shrink-0 flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                        <Play className="w-2.5 h-2.5 fill-current" /> Active
                      </span>
                    )}
                  </div>

                  {/* description */}
                  {phase.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 mb-3">
                      {phase.description}
                    </p>
                  )}

                  {/* meta row */}
                  <div className="flex flex-wrap items-center gap-3 mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {estHrs} hrs
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {doneLs}/{totalLs} lessons
                    </span>
                    {(phase as any).difficulty && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${difficultyColor((phase as any).difficulty)}`}>
                        {(phase as any).difficulty}
                      </span>
                    )}
                  </div>

                  {/* skill tags */}
                  {(phase.skillsCovered || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(phase.skillsCovered || []).slice(0, 4).map(skill => (
                        <span key={skill} className="px-2 py-0.5 bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 text-[10px] font-medium rounded-full border border-zinc-200 dark:border-white/10">
                          {skill}
                        </span>
                      ))}
                      {(phase.skillsCovered || []).length > 4 && (
                        <span className="px-2 py-0.5 bg-zinc-100 dark:bg-white/5 text-zinc-500 text-[10px] rounded-full border border-zinc-200 dark:border-white/10">
                          +{(phase.skillsCovered || []).length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Progress</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === 'completed'
                            ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                            : 'bg-gradient-to-r from-purple-500 to-blue-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* arrow hint for clickable cards */}
                  {status !== 'locked' && (
                    <div className="flex items-center justify-end mt-3">
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-0.5">
                        {status === 'completed' ? 'Review' : 'Open Phase'}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Generate New Roadmap ── */}
      <div className="pt-2 space-y-3">
        <button
          onClick={() => setShowGenerator(v => !v)}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:brightness-110 text-white shadow-[0_4px_14px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>{showGenerator ? 'Close Generator' : 'Generate New Roadmap'}</span>
          <PlusCircle className="w-4 h-4" />
        </button>
        {showGenerator && (
          <RoadmapGeneratorForm
            onSubmit={async (params) => {
              await onGenerateRoadmap(params);
              setShowGenerator(false);
            }}
            isGenerating={isGenerating}
          />
        )}
      </div>
    </div>
  );
}
