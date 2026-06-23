import React from 'react';
import { motion } from 'motion/react';
import { Zap, ArrowUp } from 'lucide-react';
import { UserProfile } from '../types';

interface XPCardProps {
  xp: number;
  level: number;
  levelName: string;
}

export const XPCard: React.FC<XPCardProps> = ({ xp, level, levelName }) => {
  const nextLevelXp = level * 200;
  const progressPercent = Math.min((xp / nextLevelXp) * 100, 100);
  
  return (
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
          <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">XP Progress</span>
        </div>
        <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-full flex items-center gap-1">
          <ArrowUp className="w-3 h-3" />
          {levelName}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-slate-900">{xp}</span>
          <span className="text-sm font-medium text-slate-500">/ {nextLevelXp} XP</span>
        </div>
        
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
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
