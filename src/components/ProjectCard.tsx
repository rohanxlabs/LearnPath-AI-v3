import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Code2, ExternalLink, TrendingUp, Lock, Tag } from 'lucide-react';
import { ProjectTrack } from '../types';
import RecommendedResources from './RecommendedResources';

interface ProjectCardProps {
  project: ProjectTrack;
  onUpdateProgress: (id: string, newProgress: number) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Sub-Task 6: phase context */
  phaseLabel?: string;
  isLocked?: boolean;
}

const cardVariants = {
  closed: { height: 'auto' },
  open: { height: 'auto' },
};

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onUpdateProgress, isExpanded, onToggleExpand, phaseLabel, isLocked = false }) => {
  const isCompleted = project.progress === 100;

  const difficultyColors = {
    beginner: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10',
    intermediate: 'border-sky-500/50 text-sky-400 bg-sky-500/10',
    advanced: 'border-violet-500/50 text-violet-400 bg-violet-500/10',
  };

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="closed"
      animate={isExpanded ? 'open' : 'closed'}
      className={`bg-white/5 border border-white/10 rounded-2xl shadow-lg overflow-hidden relative ${isLocked ? 'opacity-60' : ''}`}
    >
      {/* Lock overlay for future-phase projects */}
      {isLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 rounded-2xl">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/80 rounded-xl text-zinc-400 text-xs font-semibold">
            <Lock size={12} /> Complete previous phases to unlock
          </div>
        </div>
      )}
      <div className={`p-5 ${isLocked ? '' : 'cursor-pointer'}`} onClick={isLocked ? undefined : onToggleExpand}>
        <motion.div layout="position" className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {phaseLabel && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-zinc-300 border border-white/10">
                  <Tag size={9} /> {phaseLabel}
                </span>
              )}
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${difficultyColors[project.difficulty]}`}>
                {project.difficulty}
              </span>
              {isCompleted && (
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/30">
                  <CheckCircle2 size={12} />
                  <span>Completed</span>
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white">{project.title}</h3>
          </div>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-zinc-300 hover:text-white transition-colors"
              title="Explore source repository"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </motion.div>
        <motion.p layout="position" className="text-sm text-zinc-400 mt-3 leading-relaxed">
          {project.description}
        </motion.p>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-5 pb-5 space-y-4"
          >
            <div className="flex flex-wrap gap-2 pt-2">
              {project.techStack.map(tech => (
                <span key={tech} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-zinc-300">
                  {tech}
                </span>
              ))}
            </div>

            <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Code2 size={14} className="text-violet-400" />
                Key Features
              </h4>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm text-zinc-400 list-inside list-disc pl-1">
                {project.features.map((feat, fidx) => (
                  <li key={fidx}>{feat}</li>
                ))}
              </ul>
            </div>

            <RecommendedResources techStack={project.techStack} features={project.features} />

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="text-zinc-300 flex items-center gap-2">
                  <TrendingUp size={16} className="text-violet-400" />
                  Progress
                </span>
                <span className={isCompleted ? 'text-green-400' : 'text-white'}>
                  {project.progress}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={project.progress}
                onChange={(e) => onUpdateProgress(project.id, parseInt(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-full h-2 bg-black/20 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ProjectCard;