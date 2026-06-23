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
}

export const LessonItem: React.FC<LessonItemProps> = ({
  lesson,
  displayStatus,
  onClick,
  isRecommended,
}) => {
  const getIcon = () => {
    switch (displayStatus) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
      case 'current':
        return (
          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-indigo-200">
            <Play className="w-3 h-3 text-white fill-white ml-0.5" />
          </div>
        );
      default:
        return <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />;
    }
  };
  
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all group ${
        displayStatus === 'current'
          ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/60 hover:border-indigo-300 shadow-sm'
          : 'hover:bg-slate-50 border border-transparent'
      }`}
    >
      {getIcon()}
      
      <span
        className={`flex-1 text-sm font-medium truncate ${
          displayStatus === 'completed'
            ? 'text-slate-400 line-through decoration-slate-300'
            : displayStatus === 'current'
            ? 'text-slate-900'
            : 'text-slate-600 group-hover:text-slate-900'
        }`}
      >
        {lesson.name}
      </span>
      
      {isRecommended && (
        <span className="flex-shrink-0 px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full uppercase tracking-wide">
          Continue Learning
        </span>
      )}
    </motion.button>
  );
};
