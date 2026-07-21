import React from 'react';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';
import { buttonStyles } from '../styles/theme';

interface RoadmapProgressProps {
  progress: number;
  recommendedLessonName?: string;
  onContinue?: () => void;
}

export const RoadmapProgress: React.FC<RoadmapProgressProps> = ({ 
  progress, 
  recommendedLessonName,
  onContinue
}) => {
  return (
    <div className="p-6 bg-zinc-50 dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Progress</span>
        <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">{progress}%</span>
      </div>
      
      <div className="w-full bg-zinc-200 dark:bg-white/10 rounded-full h-4 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-purple-500 via-violet-500 to-blue-500 rounded-full relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-full" />
        </motion.div>
      </div>
      
      {recommendedLessonName && (
        <div className="flex items-center gap-2 pt-1">
          <div className="w-6 h-6 rounded-full bg-purple-500/15 dark:bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Play className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 fill-current ml-0.5" />
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-1">
            <span className="font-bold text-zinc-900 dark:text-white">Continue Learning:</span> {recommendedLessonName}
          </span>
          {onContinue && (
            <button
              onClick={onContinue}
              className={`px-3 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/15 rounded-lg transition-colors cursor-pointer ${buttonStyles.ghost}`}
            >
              Start
            </button>
          )}
        </div>
      )}
    </div>
  );
};
