import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart, BrainCircuit, Calendar, Check, Eye, GitBranch, Lightbulb, LineChart, Radar, ShieldCheck, TrendingUp } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { generateInsightsData, ActivityLog } from '../lib/insights';

import { LearningVelocityChart } from './charts/LearningVelocityChart';
import { WeeklyReportChart } from './charts/WeeklyReportChart';
import { SkillRadarChart } from './charts/SkillRadarChart';
import { SkeletonStatGrid, LoadingSpinner, SkeletonChart } from './Skeleton';

// Shown instead of a chart when there isn't enough real activity history yet —
// honest empty state rather than a fabricated trend line.
const NoHistoryYet = ({ label }: { label: string }) => (
  <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-black/20 border border-white/10 text-center px-4">
    <p className="text-sm text-zinc-400">Not enough history yet to show {label}.</p>
    <p className="text-xs text-zinc-500">This builds up as you complete lessons — check back after a few study sessions.</p>
  </div>
);

interface AIInsightsTabProps {
  roadmap: Roadmap;
  profile: UserProfile; // We'll receive the real profile object here
  activityLog: ActivityLog;
}

export function AIInsightsTab({ roadmap, profile, activityLog }: AIInsightsTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const insightsData = useMemo(
    () => generateInsightsData(roadmap, profile, activityLog),
    [roadmap, profile, activityLog]
  );

  useEffect(() => {
    // Simulate loading delay for better UX
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [roadmap, profile, activityLog]);

  const StatCard = ({ icon, title, value, change }: { icon: React.ReactNode, title: string, value: string, change?: string }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-zinc-400">
        <p className="text-sm font-medium">{title}</p>
        {icon}
      </div>
      <div className="mt-2">
        <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
        {change && <p className="text-xs text-green-400">{change}</p>}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        <SkeletonStatGrid count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <LoadingSpinner label="Loading learning velocity..." />
            <LoadingSpinner label="Loading weekly activity..." />
          </div>
          <div className="space-y-6">
            <LoadingSpinner label="Loading skill mastery..." />
            <LoadingSpinner label="Loading AI insights..." />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl sm:text-2xl font-bold text-white">AI Insights Dashboard</h2>
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
        <StatCard icon={<TrendingUp size={20} />} title="Total XP" value={(profile.xp || 0).toString()} />
        <StatCard icon={<Check size={20} />} title="Lessons Completed" value={(profile.completedLessonIds?.length || 0).toString()} />
        <StatCard icon={<GitBranch size={20} />} title="Projects Completed" value={((roadmap.projects || []).filter((p: any) => (p.progress || 0) >= 100).length).toString()} />
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
            {insightsData.hasActivityHistory
              ? <LearningVelocityChart data={insightsData.learningVelocity} />
              : <NoHistoryYet label="daily learning velocity" />}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <BarChart size={20} className="text-violet-400" />
              Weekly Activity
            </h3>
            {insightsData.weeklyReports.length > 0
              ? <WeeklyReportChart data={insightsData.weeklyReports} />
              : <NoHistoryYet label="weekly activity" />}
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