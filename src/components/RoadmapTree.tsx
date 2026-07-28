import React from 'react';
import { Lock, CheckCircle2, Zap, BookOpen, Brain } from 'lucide-react';
import { Roadmap } from '../types';

interface SkillNode {
  name: string;
  status: 'completed' | 'current' | 'locked' | 'available';
  id?: string;
  phaseId?: string;
  levelId?: string;
  lessonId?: string;
  isLesson?: boolean;
  children?: SkillNode[];
}

interface RoadmapTreeProps {
  data?: SkillNode;
  roadmap?: Roadmap;
  onLessonSelect?: (phaseId: string, levelId: string, lessonId: string) => void;
  onAiAction?: (actionType: string, phaseName?: string) => void;
}

export const transformRoadmapToSkillTree = (roadmap?: Roadmap): SkillNode | null => {
  if (!roadmap || !roadmap.phases?.length) return null;

  const firstIncomplete = (roadmap.phases || [])
    .flatMap(phase => (phase.levels || []).map(level => ({ phase, level })))
    .flatMap(({ phase, level }) => (level.lessons || []).map(lesson => ({ phase, level, lesson })))
    .find(({ lesson }) => lesson.status !== 'completed');

  return {
    name: roadmap.goal,
    status: 'current',
    children: (roadmap.phases || []).map(phase => ({
      name: phase.name,
      status: (phase.levels || []).every(level => (level.lessons || []).every(lesson => lesson.status === 'completed')) ? 'completed' : 'current',
      phaseId: phase.id,
      children: (phase.levels || []).map(level => ({
        name: level.name,
        status: (level.lessons || []).every(lesson => lesson.status === 'completed') ? 'completed' : 'current',
        phaseId: phase.id,
        levelId: level.id,
        children: (level.lessons || []).map(lesson => {
          const status: SkillNode['status'] =
            lesson.status === 'completed'
              ? 'completed'
              : firstIncomplete?.phase.id === phase.id && firstIncomplete.level.id === level.id && firstIncomplete.lesson.id === lesson.id
                ? 'current'
                : 'locked';

          return {
            name: lesson.name,
            status,
            id: lesson.id,
            phaseId: phase.id,
            levelId: level.id,
            lessonId: lesson.id,
            isLesson: true,
          };
        }),
      })),
    })),
  };
};

const RoadmapTree: React.FC<RoadmapTreeProps> = ({ data, roadmap, onLessonSelect, onAiAction }) => {
  const treeData = data || transformRoadmapToSkillTree(roadmap);

  const getCardStyles = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
      case 'current':
      case 'available':
        return 'bg-zinc-50 dark:bg-white/[0.04] border-purple-300 dark:border-purple-500/40 border-l-4 shadow-md';
      case 'locked':
        return 'bg-zinc-50 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10 opacity-70';
      default:
        return 'bg-zinc-50 dark:bg-white/[0.02] border-zinc-200 dark:border-white/10';
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
      case 'current':
      case 'available':
        return <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
      case 'locked':
        return <Lock className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />;
      default:
        return <BookOpen className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />;
    }
  };

  const renderModuleCard = (node: SkillNode, index: number) => {
    const itemCount = node.children?.length || 0;
    const completedCount = node.children?.filter(c => c.status === 'completed').length || 0;
    const completionPercent = itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0;

    return (
      <div key={index} className="relative">
        <div className={`rounded-xl border p-5 transition-all duration-200 ${getCardStyles(node.status)}`}>
          {/* Module Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="flex-shrink-0 mt-1">{getIcon(node.status)}</div>
              <div className="flex-1">
                <h4 className={`font-bold text-base ${node.status === 'locked' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                  {node.name}
                </h4>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`text-xs ${node.status === 'locked' ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span className={`text-xs font-semibold ${node.status === 'locked' ? 'text-zinc-400 dark:text-zinc-600' : 'text-purple-600 dark:text-purple-400'}`}>
                    {completionPercent}% complete
                  </span>
                </div>
              </div>
            </div>
            {onAiAction && (
              <button
                type="button"
                aria-label={`Ask AI about ${node.name}`}
                onClick={() => onAiAction('explain', node.name)}
                className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold px-2 py-1 rounded-lg hover:bg-purple-500/10 dark:hover:bg-purple-500/15 transition-colors"
              >
                Ask AI
              </button>
            )}
          </div>

          {/* Sub-items (Lessons) */}
          {node.children && node.children.length > 0 && (
            <div className="space-y-2 mt-4 border-t border-zinc-200 dark:border-white/5 pt-3">
              {node.children.map((child, childIndex) => (
                <div
                  key={childIndex}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                    child.status === 'completed'
                      ? 'bg-emerald-500/8 dark:bg-emerald-500/10'
                      : child.status === 'current' || child.status === 'available'
                      ? 'bg-purple-500/8 dark:bg-purple-500/10'
                      : 'bg-zinc-100/60 dark:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {child.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    ) : child.status === 'current' || child.status === 'available' ? (
                      <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    )}
                  </div>
                  <span
                    role={child.isLesson && onLessonSelect ? 'button' : undefined}
                    tabIndex={child.isLesson && onLessonSelect ? 0 : undefined}
                    onClick={child.isLesson && onLessonSelect && child.lessonId ? () => onLessonSelect(child.phaseId!, child.levelId!, child.lessonId!) : undefined}
                    onKeyDown={child.isLesson && onLessonSelect && child.lessonId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLessonSelect!(child.phaseId!, child.levelId!, child.lessonId!); } } : undefined}
                    className={`text-sm flex-1 ${
                      child.status === 'locked' ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300 font-medium'
                    } ${child.isLesson && onLessonSelect ? 'cursor-pointer hover:underline' : ''}`}
                  >
                    {child.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTree = (node: SkillNode) => {
    if (!node.children || node.children.length === 0) return null;

    // Each phase segment of the connector is coloured by that phase's status.
    // Completed → emerald, current/available → purple, locked → muted zinc.
    const segmentColour = (status: string) => {
      switch (status) {
        case 'completed': return 'bg-emerald-400/60 dark:bg-emerald-500/50';
        case 'current':
        case 'available': return 'bg-purple-400/70 dark:bg-purple-500/50';
        default:          return 'bg-zinc-300/40 dark:bg-zinc-600/30';
      }
    };

    return (
      <div className="relative">
        {/* Segmented vertical connector — one coloured strip per phase card */}
        <div className="absolute left-0 top-0 bottom-0 w-1 flex flex-col rounded-full overflow-hidden">
          {node.children.map((child, i) => (
            <div
              key={i}
              className={`flex-1 ${segmentColour(child.status)} transition-colors duration-300`}
            />
          ))}
        </div>

        {/* Cards with left spacing */}
        <div className="pl-6 space-y-4">
          {node.children.map((child, index) => renderModuleCard(child, index))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-zinc-50 dark:bg-white/[0.02] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm">
      <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">Learning Path</h3>
      {treeData ? renderTree(treeData) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Generate or select a roadmap to view the learning path.</p>
      )}
    </div>
  );
};

export default RoadmapTree;
