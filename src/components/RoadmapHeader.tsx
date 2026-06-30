import React from 'react';
import { motion } from 'motion/react';
import { Roadmap } from '../types';
import { ArrowLeft } from 'lucide-react';

interface RoadmapHeaderProps {
  roadmap: Roadmap;
  onBack?: () => void;
}

export const RoadmapHeader: React.FC<RoadmapHeaderProps> = ({ roadmap, onBack }) => {
  const { goal, experienceLevel, totalXp, lessonsCompleted, phases } = roadmap;
  
  const totalLessons = (phases || []).reduce(
    (acc, p) => acc + (p.levels || []).reduce((a, l) => a + (l.lessons?.length || 0), 0),
    0
  );
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 p-6 md:p-8 shadow-2xl"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-300/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
      
      <div className="relative z-10 space-y-5">
        {onBack && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={onBack}
            className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Roadmaps
          </motion.button>
        )}
        
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
          {goal}
        </h1>
        
        <div className="flex items-center gap-3">
          <span className="px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-white border border-white/20 shadow-lg">
            {experienceLevel}
          </span>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-white/70 text-xs font-medium uppercase tracking-wide">XP Earned</span>
            <span className="text-2xl font-extrabold text-white">{totalXp}</span>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="flex items-center gap-2">
            <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Lessons</span>
            <span className="text-2xl font-extrabold text-white">
              {lessonsCompleted}
              <span className="text-base font-semibold text-white/70"> / {totalLessons}</span>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};