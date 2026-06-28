import React from 'react';
import { Lock, CheckCircle2, Zap, BookOpen, Brain } from 'lucide-react';
import { Roadmap } from '../types';

interface SkillNode {
  name: string;
  status: 'completed' | 'current' | 'locked' | 'available';
  children?: SkillNode[];
}

interface RoadmapTreeProps {
  data?: SkillNode;
  roadmap?: Roadmap;
  onLessonSelect?: (phaseId: string, levelId: string, lessonId: string) => void;
  onAiAction?: (actionType: 'quiz' | 'projects' | 'explain' | 'study_plan', phaseName: string) => Promise<void>;
}

const transformRoadmapToSkillTree = (roadmap?: Roadmap): SkillNode | null => {
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
      children: (phase.levels || []).map(level => ({
        name: level.name,
        status: (level.lessons || []).every(lesson => lesson.status === 'completed') ? 'completed' : 'current',
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
        return 'bg-green-50 border-green-200';
      case 'current':
      case 'available':
        return 'bg-white border-indigo-300 border-l-4 shadow-md';
      case 'locked':
        return 'bg-slate-50 border-slate-200';
      default:
        return 'bg-white border-slate-200';
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'current':
      case 'available':
        return <Zap className="w-5 h-5 text-indigo-600" />;
      case 'locked':
        return <Lock className="w-5 h-5 text-slate-400" />;
      default:
        return <BookOpen className="w-5 h-5 text-slate-400" />;
    }
  };

  const renderModuleCard = (node: SkillNode, index: number) => {
    const itemCount = node.children?.length || 0;
    const completedCount = node.children?.filter(c => c.status === 'completed').length || 0;
    const completionPercent = itemCount > 0 ? Math.round((completedCount / itemCount) * 100) : 0;

    return (
      <div key={index} className="relative">
        {/* Module Card */}
        <div className={`rounded-xl border-2 p-5 transition-all ${getCardStyles(node.status)}`}>
          {/* Module Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-3 flex-1">
              <div className="flex-shrink-0 mt-1">{getIcon(node.status)}</div>
              <div className="flex-1">
                <h4 className={`font-bold text-base ${node.status === 'locked' ? 'text-slate-500' : 'text-slate-900'}`}>
                  {node.name}
                </h4>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`text-xs ${node.status === 'locked' ? 'text-slate-400' : 'text-slate-600'}`}>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span className={`text-xs font-semibold ${node.status === 'locked' ? 'text-slate-400' : 'text-indigo-600'}`}>
                    {completionPercent}% complete
                  </span>
                </div>
              </div>
            </div>
            {onAiAction && node.children && (
              <button
                onClick={() => onAiAction('explain', node.name)}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
              >
                Ask AI
              </button>
            )}
          </div>

          {/* Sub-items (Lessons) */}
          {node.children && node.children.length > 0 && (
            <div className="space-y-2 mt-4 border-t border-slate-200 pt-3">
              {node.children.map((child, childIndex) => (
                <div
                  key={childIndex}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    child.status === 'completed'
                      ? 'bg-green-100/50'
                      : child.status === 'current' || child.status === 'available'
                      ? 'bg-indigo-50/50'
                      : 'bg-slate-100/50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {child.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : child.status === 'current' || child.status === 'available' ? (
                      <Brain className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <span
                    className={`text-sm flex-1 ${
                      child.status === 'locked' ? 'text-slate-400' : 'text-slate-700 font-medium'
                    }`}
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

    return (
      <div className="relative">
        {/* Vertical Connector Line */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-200 via-purple-200 to-indigo-200 rounded-full" />
        
        {/* Cards Container with Left Spacing */}
        <div className="pl-6 space-y-4">
          {node.children.map((child, index) => renderModuleCard(child, index))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900 mb-6">Learning Path</h3>
      {treeData ? renderTree(treeData) : (
        <p className="text-sm text-slate-500">Generate or select a roadmap to view the learning path.</p>
      )}
    </div>
  );
};

export default RoadmapTree;