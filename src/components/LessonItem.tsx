import React from 'react';
import { motion } from 'motion/react';
import { Lesson } from '../types';
import { CheckCircle2, Play, Circle } from 'lucide-react';

type LessonDisplayStatus = 'completed' | 'current' | 'not-started';

interface LessonItemProps {
   lesson: Lesson;
   displayStatus: LessonDisplayStatus;
   onClick: () => void;
   isRecommended?: boolean;
   onRecommendedClick?: () => void;
}

export const LessonItem: React.FC<LessonItemProps> = ({
   lesson,
   displayStatus,
   onClick,
   isRecommended,
   onRecommendedClick,
 }) => {
  const getIcon = () => {
    switch (displayStatus) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
      case 'current':
        return (
          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-purple-200 dark:shadow-purple-900/40">
            <Play className="w-3 h-3 text-white fill-white ml-0.5" />
          </div>
        );
      default:
        return <Circle className="w-5 h-5 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />;
    }
  };
  
   return (
    <motion.div className="flex w-full items-center gap-2">
    <motion.button
     type="button"
     whileTap={{ scale: 0.98 }}
     onClick={onClick}
     className={`min-w-0 flex-1 flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-left transition-all duration-200 group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
        displayStatus === 'current'
          ? 'bg-gradient-to-r from-purple-500/10 to-violet-500/10 dark:from-purple-500/15 dark:to-violet-500/10 border border-purple-200/60 dark:border-purple-500/20 hover:border-purple-300 dark:hover:border-purple-500/40 shadow-sm'
          : 'hover:bg-zinc-100 dark:hover:bg-white/5 border border-transparent'
      }`}
    >
      <span aria-hidden="true">{getIcon()}</span>
      
      <span
        className={`flex-1 text-sm font-medium truncate ${
          displayStatus === 'completed'
            ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-600'
            : displayStatus === 'current'
            ? 'text-zinc-900 dark:text-white'
            : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
        }`}
      >
        {lesson.name}
      </span>
      <span className="sr-only">{displayStatus === 'completed' ? 'Completed' : displayStatus === 'current' ? 'Current lesson' : 'Not started'}</span>
    </motion.button>
    {isRecommended && (
        <button
          type="button"
          onClick={onRecommendedClick || onClick}
          className="min-h-10 flex-shrink-0 px-2.5 py-1 bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full uppercase tracking-wide hover:bg-purple-500/20 dark:hover:bg-purple-500/25 border border-purple-200 dark:border-purple-500/20 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          Continue Learning
        </button>
      )}
    </motion.div>
   );
};
