import React from 'react';
import { motion } from 'motion/react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}

// sk-base: visible in both dark (white/8) and light (zinc-200) modes
const SK_BASE = 'rounded-xl bg-zinc-200 dark:bg-white/8 animate-pulse';
// sk-card: container background for card-level skeletons
const SK_CARD = 'bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10';

export function Skeleton({ className = '', width, height, style }: SkeletonProps) {
  return (
    <div
      className={`${SK_BASE} ${className}`}
      style={{ ...style, width, height }}
    />
  );
}

interface SkeletonCardProps {
  key?: React.Key;
  className?: string;
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`p-5 rounded-2xl ${SK_CARD} space-y-3 ${className}`}
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-8 w-24 mt-2" />
    </motion.div>
  );
}

interface SkeletonChartProps {
  className?: string;
}

export function SkeletonChart({ className = '' }: SkeletonChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`p-6 rounded-2xl ${SK_CARD} ${className}`}
    >
      <Skeleton className="h-5 w-48 mb-4" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 flex-1" style={{ width: `${60 + i * 10}%` }} />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

interface SkeletonStatGridProps {
  count?: number;
}

export function SkeletonStatGrid({ count = 4 }: SkeletonStatGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(count)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`${SK_CARD} rounded-xl p-4`}
        >
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-20" />
        </motion.div>
      ))}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <motion.div
        className={`${sizeClasses[size]} rounded-full border-4 border-purple-400 border-t-transparent`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      {label && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3 font-medium">{label}</p>}
    </div>
  );
}

interface SkeletonHeaderProps {
  className?: string;
}

export function SkeletonHeader({ className = '' }: SkeletonHeaderProps) {
  return (
    <div className={`p-5 sm:p-6 rounded-3xl ${SK_CARD} relative overflow-hidden ${className}`}>
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-64 sm:w-96" />
        <div className="flex flex-wrap items-center gap-2 mt-3.5">
          <Skeleton className="h-7 w-40 rounded-xl" />
          <Skeleton className="h-7 w-28 rounded-xl" />
          <Skeleton className="h-7 w-24 rounded-xl" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
          <Skeleton className="h-10 w-40 sm:w-auto rounded-xl" />
          <Skeleton className="h-10 w-36 sm:w-auto rounded-xl" />
        </div>
      </div>
    </div>
  );
}

interface SkeletonRoadmapCardProps {
  className?: string;
}

export function SkeletonRoadmapCard({ className = '' }: SkeletonRoadmapCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`p-4 rounded-2xl ${SK_CARD} space-y-3 ${className}`}
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </motion.div>
  );
}

interface SkeletonNotificationCardProps {
  className?: string;
}

export function SkeletonNotificationCard({ className = '' }: SkeletonNotificationCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`p-4 rounded-2xl ${SK_CARD} flex items-start gap-3 ${className}`}
    >
      <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </motion.div>
  );
}

// Matches the exact layout of HomeView's hero GlassCard to eliminate CLS
export function SkeletonHomeHero() {
  return (
    <div className={`p-5 sm:p-6 rounded-2xl ${SK_CARD} relative overflow-hidden`}>
      {/* label + heading */}
      <Skeleton className="h-3 w-28 mb-2" />
      <Skeleton className="h-7 w-64 sm:w-80 mb-4" />
      {/* chips row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Skeleton className="h-7 w-36 rounded-xl" />
        <Skeleton className="h-7 w-24 rounded-xl" />
        <Skeleton className="h-7 w-20 rounded-xl" />
        <Skeleton className="h-7 w-16 rounded-xl" />
      </div>
      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
    </div>
  );
}

interface SkeletonChatPreviewProps {
  className?: string;
}

export function SkeletonChatPreview({ className = '' }: SkeletonChatPreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`p-4 rounded-2xl ${SK_CARD} flex items-start gap-3 ${className}`}
    >
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </motion.div>
  );
}
