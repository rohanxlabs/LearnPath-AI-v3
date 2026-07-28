import React from 'react';
import { motion } from 'motion/react';
import { Zap, ArrowUp } from 'lucide-react';

interface XPCardProps {
  xp: number;
  level: number;
  levelName: string;
}

export const XPCard: React.FC<XPCardProps> = ({ xp, level, levelName }) => {
  const nextLevelXp = level * 200;
  const progressPercent = Math.min((xp / nextLevelXp) * 100, 100);
  
  return (
    <div className="p-6 bg-zinc-50 dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
          <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">XP Progress</span>
        </div>
        <span className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-500 dark:text-amber-500 text-xs font-bold rounded-full flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          {levelName}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">{xp}</span>
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">/ {nextLevelXp} XP</span>
        </div>
        
        <div className="w-full bg-zinc-200 dark:bg-white/10 rounded-full h-3 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent rounded-full" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
