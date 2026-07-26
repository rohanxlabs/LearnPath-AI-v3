import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { stats } from './landingData';

// ─── FadeInSection ─────────────────────────────────────────────────────────────

export const FadeInSection: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// ─── SectionHeading ────────────────────────────────────────────────────────────

export const SectionHeading: React.FC<{
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  center?: boolean;
}> = ({ id, eyebrow, title, description, center = false }) => (
  <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-purple-700">
      <Sparkles className="h-3 w-3" />
      {eyebrow}
    </span>
    <h2
      id={id}
      className="mt-4 font-display text-[1.85rem] font-extrabold leading-tight tracking-[-0.02em] text-[#1a0a2e] sm:text-[2.1rem]"
    >
      {title}
    </h2>
    <p className="mt-3 text-base leading-7 text-slate-500">{description}</p>
  </div>
);

// ─── useAnimatedCount ──────────────────────────────────────────────────────────

export const useAnimatedCount = (target: number, isVisible: boolean) => {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  const lastTarget = useRef(target);

  useEffect(() => {
    // Re-run the animation whenever the target value changes (e.g. live data arrives)
    // OR when the section first scrolls into view.
    const targetChanged = lastTarget.current !== target;
    if (!isVisible && !targetChanged) return;
    if (targetChanged) lastTarget.current = target;
    // Allow re-run when target changes even if animation already ran once.
    if (isVisible || targetChanged) {
      if (!targetChanged) {
        if (started.current) return;
        started.current = true;
      }
    }
    const duration = 1400;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isVisible, target]);
  return count;
};

// ─── StatCard ──────────────────────────────────────────────────────────────────

export const StatCard: React.FC<{ stat: (typeof stats)[0]; index: number; loading?: boolean }> = ({ stat, index, loading = false }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const count = useAnimatedCount(stat.value, isInView);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-2xl border border-purple-100 bg-white p-6 shadow-sm backdrop-blur-sm transition-all hover:border-purple-300 hover:shadow-md"
    >
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-purple-200/40 blur-2xl transition-all group-hover:bg-purple-300/50" />
      <stat.icon className="mb-4 h-5 w-5 text-purple-600" />
      {loading ? (
        <>
          <div className="h-9 w-24 animate-pulse rounded-lg bg-purple-100" aria-hidden="true" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-purple-50" aria-hidden="true" />
          <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-purple-50" aria-hidden="true" />
          <span className="sr-only">Loading stat…</span>
        </>
      ) : (
        <>
          <p className="text-3xl font-extrabold tracking-tight text-[#1a0a2e]">
            {count.toLocaleString()}
            {stat.suffix}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">{stat.label}</p>
          <p className="mt-0.5 text-xs text-slate-400">{stat.note}</p>
        </>
      )}
    </motion.div>
  );
};
