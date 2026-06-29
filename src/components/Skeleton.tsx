import React from 'react';
import { motion } from 'motion/react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', width, height, style }: SkeletonProps) {
  return (
    <div
      className={`rounded-xl bg-white/5 animate-pulse ${className}`}
      style={{ ...style, width, height }}
    />
  );
}

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 ${className}`}
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
      className={`p-6 rounded-2xl bg-white/5 border border-white/10 ${className}`}
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
          className="bg-white/5 border border-white/10 rounded-xl p-4"
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
      {label && <p className="text-xs text-zinc-400 mt-3 font-medium">{label}</p>}
    </div>
  );
}