import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Roadmap, Level, Phase } from '../types';
import { ModuleCard } from './ModuleCard';

type ModuleDisplayStatus = 'completed' | 'in-progress' | 'not-started';

export const RoadmapTimeline: React.FC<{
  roadmap: Roadmap;
  onLessonClick: (phaseId: string, levelId: string, lessonId: string) => void;
  onRegenerate?: () => void;
}> = ({ roadmap, onLessonClick, onRegenerate }) => {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  
  const recommendedLesson = useMemo(() => {
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          if (lesson.status === 'available') {
            return {
              phaseId: phase.id,
              levelId: level.id,
              lessonId: lesson.id,
              lessonName: lesson.name,
            };
          }
        }
      }
    }
    return null;
  }, [roadmap]);
  
  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };
  
  const getModuleStatus = (level: Level): ModuleDisplayStatus => {
    const total = level.lessons?.length || 0;
    const completed = (level.lessons || []).filter((l) => l.status === 'completed').length;
    if (total === 0) return 'not-started';
    if (completed === 0) return 'not-started';
    if (completed === total) return 'completed';
    return 'in-progress';
  };
  
  const modules: { level: Level; phaseId: string; phaseName: string }[] = [];
  (roadmap.phases || []).forEach((phase: Phase) => {
    (phase.levels || []).forEach((level: Level) => {
      modules.push({ level, phaseId: phase.id, phaseName: phase.name });
    });
  });
  
  if (modules.length === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <p className="text-slate-500 font-medium">No learning path generated yet.</p>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:brightness-110 transition-all"
          >
            Regenerate Roadmap
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="relative">
      <div className="absolute left-[18px] md:left-[22px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-indigo-300 via-purple-300 to-indigo-300" />
      
      <div className="space-y-6">
        {modules.map((mod) => {
          const isRecommended = recommendedLesson?.levelId === mod.level.id;
          
          return (
            <div key={mod.level.id} className="relative pl-10 md:pl-12">
              <div
                className={`absolute left-[13px] md:left-[17px] top-7 w-3 h-3 rounded-full border-2 border-white shadow-md ${
                  getModuleStatus(mod.level) === 'completed'
                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-500'
                    : getModuleStatus(mod.level) === 'in-progress'
                    ? 'bg-gradient-to-br from-indigo-400 to-purple-500'
                    : 'bg-gradient-to-br from-slate-300 to-slate-400'
                }`}
              />
              
              <ModuleCard
                level={mod.level}
                phaseName={mod.phaseName}
                expanded={expandedModules.has(mod.level.id)}
                onToggle={() => toggleModule(mod.level.id)}
                onLessonClick={(levelId, lessonId) => onLessonClick(mod.phaseId, levelId, lessonId)}
                recommendedLessonId={isRecommended ? recommendedLesson.lessonId : undefined}
                moduleStatus={getModuleStatus(mod.level)}
                phaseId={mod.phaseId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
