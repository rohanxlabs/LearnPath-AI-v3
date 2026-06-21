import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { BarChart, BrainCircuit, Calendar, Check, Eye, GitBranch, Lightbulb, LineChart, Radar, ShieldCheck, TrendingUp } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { generateInsightsData } from '../lib/insights';

import { LearningVelocityChart } from './charts/LearningVelocityChart';
import { WeeklyReportChart } from './charts/WeeklyReportChart';
import { SkillRadarChart } from './charts/SkillRadarChart';

// Placeholder components for charts - we will create these next
const PlaceholderChart = ({ name }: { name: string }) => (
  <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-lg bg-black/20 border border-white/10">
    <p className="text-sm text-zinc-400">{name} Visualization</p>
  </div>
);

interface AIInsightsTabProps {
  roadmap: Roadmap;
  profile: UserProfile; // We'll receive the real profile object here
}

export function AIInsightsTab({ roadmap, profile }: AIInsightsTabProps) {
  // NOTE: The data generation will eventually come from a backend API call
  const insightsData = useMemo(() => generateInsightsData(roadmap, profile), [roadmap, profile]);

  const StatCard = ({ icon, title, value, change }: { icon: React.ReactNode, title: string, value: string, change?: string }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-zinc-400">
        <p className="text-sm font-medium">{title}</p>
        {icon}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold text-white">{value}</p>
        {change && <p className="text-xs text-green-400">{change}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white">AI Insights Dashboard</h2>
        <p className="text-sm text-zinc-400 max-w-2xl">
          Your personalized learning command center. Analyze your progress, identify patterns, and get AI-driven recommendations.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard icon={<TrendingUp size={20} />} title="XP This Week" value={insightsData.weeklyReports[0].xpGained.toString()} change="+15% vs last week" />
        <StatCard icon={<Check size={20} />} title="Lessons Completed" value={insightsData.weeklyReports[0].lessonsCompleted.toString()} />
        <StatCard icon={<GitBranch size={20} />} title="Projects Completed" value={insightsData.weeklyReports[0].projectsCompleted.toString()} />
        <StatCard icon={<Calendar size={20} />} title="Est. Completion" value={insightsData.predictedCompletionDate ? insightsData.predictedCompletionDate.toLocaleDateString() : 'N/A'} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <LineChart size={20} className="text-violet-400" />
              Learning Velocity
            </h3>
            <LearningVelocityChart data={insightsData.learningVelocity} />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <BarChart size={20} className="text-violet-400" />
              Weekly Activity
            </h3>
            <WeeklyReportChart data={insightsData.weeklyReports} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Radar size={20} className="text-violet-400" />
              Skill Mastery
            </h3>
            <SkillRadarChart data={insightsData.skillMastery} />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <BrainCircuit size={20} className="text-violet-400" />
              AI Mentor Insights
            </h3>
            <div className="space-y-3">
              {insightsData.aiInsights.map(insight => (
                <div key={insight.id} className="bg-black/20 border border-white/10 rounded-lg p-3">
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    {insight.type === 'strength' && <ShieldCheck size={14} className="text-green-400" />}
                    {insight.type === 'weakness' && <Eye size={14} className="text-amber-400" />}
                    {insight.type === 'recommendation' && <Lightbulb size={14} className="text-sky-400" />}
                    {insight.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}