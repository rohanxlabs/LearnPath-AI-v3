import React from 'react';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

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
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Progress</span>
        <span className="text-3xl font-extrabold text-slate-900">{progress}%</span>
      </div>
      
      <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 rounded-full relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-full" />
        </motion.div>
      </div>
      
      {recommendedLessonName && (
        <div className="flex items-center gap-2 pt-1">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Play className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600 ml-0.5" />
          </div>
          <span className="text-xs text-slate-600 flex-1">
            <span className="font-bold text-slate-900">Continue Learning:</span> {recommendedLessonName}
          </span>
          {onContinue && (
            <button
              onClick={onContinue}
              className="px-3 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              Start
            </button>
          )}
        </div>
      )}
    </div>
  );
};
