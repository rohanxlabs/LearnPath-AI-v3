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
      className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm"
    >
      <h3 className="text-lg font-extrabold text-slate-900 tracking-tight mb-4">Milestones</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {milestones.map((milestone, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              milestone.achieved
                ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100'
                : 'bg-slate-50 opacity-60'
            }`}
          >
            <div className={`flex-shrink-0 ${milestone.achieved ? 'text-indigo-600' : 'text-slate-400'}`}>
              {milestone.achieved ? (
                <milestone.Icon className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
            </div>
            <span
              className={`text-sm font-semibold ${
                milestone.achieved ? 'text-slate-900' : 'text-slate-500'
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
