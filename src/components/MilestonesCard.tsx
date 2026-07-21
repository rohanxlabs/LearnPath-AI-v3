import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Target, Award } from 'lucide-react';

interface Milestone {
  label: string;
  achieved: boolean;
  Icon: React.FC<{ className?: string }>;
}

interface MilestonesCardProps {
  lessonsCompleted: number;
  progressPercent: number;
}

export const MilestonesCard: React.FC<MilestonesCardProps> = ({
  lessonsCompleted,
  progressPercent,
}) => {
  const milestones: Milestone[] = [
    {
      label: 'First Lesson Completed',
      achieved: lessonsCompleted > 0,
      Icon: CheckCircle2,
    },
    {
      label: '10 Lessons Completed',
      achieved: lessonsCompleted >= 10,
      Icon: Target,
    },
    {
      label: 'Halfway Done',
      achieved: progressPercent >= 50,
      Icon: Award,
    },
    {
      label: 'Roadmap Master',
      achieved: progressPercent === 100,
      Icon: Award,
    },
  ];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="p-6 bg-zinc-50 dark:bg-white/[0.03] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-sm"
    >
      <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mb-4">Milestones</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {milestones.map((milestone, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              milestone.achieved
                ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-500/15 dark:to-blue-500/15 border border-purple-200 dark:border-purple-500/20'
                : 'bg-zinc-100 dark:bg-white/[0.02] border border-transparent opacity-60'
            }`}
          >
            <div className={`flex-shrink-0 ${milestone.achieved ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-400 dark:text-zinc-600'}`}>
              {milestone.achieved ? (
                <milestone.Icon className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
            </div>
            <span
              className={`text-sm font-semibold ${
                milestone.achieved ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-500'
              }`}
            >
              {milestone.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
