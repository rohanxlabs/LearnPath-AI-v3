import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Level, Lesson } from '../types';
import { ChevronDown, BookOpen, CheckCircle2, Circle, Play, Lock } from 'lucide-react';
import { LessonItem } from './LessonItem';
import { easeInOut } from 'motion';

type ModuleDisplayStatus = 'completed' | 'in-progress' | 'not-started';

interface ModuleCardProps {
  level: Level;
  phaseName?: string;
  expanded: boolean;
  onToggle: () => void;
  onLessonClick: (phaseId: string, levelId: string, lessonId: string) => void;
  recommendedLessonId?: string;
  moduleStatus: ModuleDisplayStatus;
  phaseId: string;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  level,
  phaseName,
  expanded,
  onToggle,
  onLessonClick,
  recommendedLessonId,
  moduleStatus,
  phaseId,
}) => {
  const lessons = level.lessons || [];
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.status === 'completed').length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  
  const getStatusBadge = () => {
    switch (moduleStatus) {
      case 'completed':
        return (
          <span className="px-3 py-1 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-xs font-bold rounded-full flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'in-progress':
        return (
          <span className="px-3 py-1 bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20 text-xs font-bold rounded-full flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 fill-current" />
            In Progress
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-white/10 text-xs font-bold rounded-full flex items-center gap-1.5">
            <Circle className="w-3.5 h-3.5" />
            Not Started
          </span>
        );
    }
  };

  const getBookSpineStyle = () => {
    switch (moduleStatus) {
      case 'completed':
        return 'from-emerald-600 to-teal-700';
      case 'in-progress':
        return 'from-purple-600 to-violet-700';
      default:
        return 'from-zinc-600 to-zinc-700';
    }
  };
  
  const getLessonDisplayStatus = (lesson: Lesson): 'completed' | 'current' | 'not-started' => {
    if (lesson.status === 'completed') return 'completed';
    if (lesson.id === recommendedLessonId) return 'current';
    return 'not-started';
  };
  
  return (
    <motion.div
      layout
      className="bg-zinc-50 dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm overflow-hidden transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]"
    >
      <motion.button
        whileTap={{ scale: 0.995 }}
        onClick={onToggle}
        className="w-full p-5 flex items-start gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight">{level.name}</h3>
          </div>
          
          {phaseName && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider mb-2">
              {phaseName}
            </p>
          )}
          
          <div className="flex items-center gap-4 flex-wrap text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5 bg-zinc-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              {completedLessons}/{totalLessons} Lessons
            </span>
            <span className="font-extrabold text-purple-600 dark:text-purple-400">
              {progressPercent}% Complete
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          {getStatusBadge()}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-zinc-400 dark:text-zinc-500"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </div>
      </motion.button>
      
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1">
              <div className="h-px bg-zinc-200 dark:bg-white/10 mb-3" />
              <div className="space-y-2">
                {lessons.map((lesson) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    displayStatus={getLessonDisplayStatus(lesson)}
                    onClick={() => onLessonClick(phaseId, level.id, lesson.id)}
                    isRecommended={lesson.id === recommendedLessonId}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
