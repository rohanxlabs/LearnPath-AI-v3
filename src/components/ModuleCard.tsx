import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Level, Lesson } from '../types';
import { ChevronDown, BookOpen, CheckCircle2, Circle, Play } from 'lucide-react';
import { LessonItem } from './LessonItem';

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
          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'in-progress':
        return (
          <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 fill-indigo-700" />
            In Progress
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full flex items-center gap-1.5">
            <Circle className="w-3.5 h-3.5" />
            Not Started
          </span>
        );
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
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md"
    >
      <motion.button
        whileTap={{ scale: 0.995 }}
        onClick={onToggle}
        className="w-full p-5 flex items-start gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">{level.name}</h3>
          </div>
          
          {phaseName && (
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-2">
              {phaseName}
            </p>
          )}
          
          <div className="flex items-center gap-4 flex-wrap text-xs text-slate-600">
            <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              {completedLessons}/{totalLessons} Lessons
            </span>
            <span className="font-extrabold text-indigo-600">
              {progressPercent}% Complete
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-shrink-0">
          {getStatusBadge()}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="text-slate-400"
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
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
<div className="px-5 pb-5 pt-1">
               <div className="h-px bg-slate-100 mb-3" />
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
