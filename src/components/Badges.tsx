import React from 'react';
import { Sparkles, Flame, ShieldAlert, Award } from 'lucide-react';

interface XPBadgeProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

export function XPBadge({ amount, size = 'md' }: XPBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-3 py-1 gap-1.5',
    lg: 'text-base px-4 py-2 gap-2',
  };

  return (
    <div className={`inline-flex items-center font-semibold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.15)] ${sizeClasses[size]}`}>
      <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
      <span>+{amount} XP</span>
    </div>
  );
}

interface StreakBadgeProps {
  days: number;
}

export function StreakBadge({ days }: StreakBadgeProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-sm shadow-[0_0_10px_rgba(245,158,11,0.1)]">
      <Flame className="w-4 h-4 text-amber-500 animate-bounce" fill="currentColor" />
      <span>{days} Day Streak</span>
    </div>
  );
}

interface TierBadgeProps {
  isPro: boolean;
  onClick?: () => void;
}

export function TierBadge({ isPro, onClick }: TierBadgeProps) {
  return (
    <button
      onClick={onClick}
      disabled={isPro}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-xs border transition-all duration-300 ${
        isPro
          ? 'bg-gradient-to-r from-purple-500 to-blue-600 text-white border-transparent shadow-[0_0_15px_rgba(168,85,247,0.4)]'
          : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border-white/10'
      }`}
    >
      <Award className={`w-3.5 h-3.5 ${isPro ? 'text-white animate-spin-slow' : 'text-zinc-500'}`} />
      <span>{isPro ? 'LEARNPATH PRO' : 'UPGRADE TO PRO'}</span>
    </button>
  );
}
