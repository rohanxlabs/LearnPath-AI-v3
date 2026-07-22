import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Zap, ChevronRight, X } from 'lucide-react';
import { Phase } from '../types';
import { ConfettiParticles } from './ConfettiParticles';

interface PhaseCompletionModalProps {
  phase: Phase;
  nextPhase: Phase | null;
  xpEarned: number;
  onContinue: () => void;
  onDismiss: () => void;
}

export function PhaseCompletionModal({ phase, nextPhase, xpEarned, onContinue, onDismiss }: PhaseCompletionModalProps) {
  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
        onClick={onDismiss}
      >
        {/* Confetti over entire screen */}
        <div className="pointer-events-none fixed inset-0 z-50">
          <ConfettiParticles count={50} />
        </div>

        {/* Modal card */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-8 text-center shadow-2xl border border-zinc-200 dark:border-white/10"
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Trophy icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 280, damping: 18 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-[0_8px_24px_rgba(251,146,60,0.4)]"
          >
            <Trophy className="w-10 h-10 text-white" />
          </motion.div>

          {/* Heading */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-1">Phase Complete!</p>
            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight">
              {phase.name}
            </h2>
          </motion.div>

          {/* XP badge */}
          {xpEarned > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm font-bold"
            >
              <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />
              +{xpEarned} XP earned in this phase
            </motion.div>
          )}

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-4 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed"
          >
            {nextPhase
              ? `You've mastered all lessons in this phase. Ready to level up to "${nextPhase.name}"?`
              : "You've completed this entire roadmap! Check your progress and celebrate your achievement."}
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-col gap-2"
          >
            <button
              onClick={onContinue}
              className="w-full py-3 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:brightness-110 text-white shadow-[0_4px_14px_rgba(124,58,237,0.3)] flex items-center justify-center gap-2 transition-all"
            >
              {nextPhase ? (
                <>Continue to {nextPhase.name} <ChevronRight className="w-4 h-4" /></>
              ) : (
                <>View Your Progress</>
              )}
            </button>
            <button onClick={onDismiss} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 py-1 transition-colors">
              Dismiss
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
