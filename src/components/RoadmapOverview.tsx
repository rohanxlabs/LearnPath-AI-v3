import { useState } from 'react';
import React from 'react';
import { Sparkles, PlusCircle, GraduationCap } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { RoadmapHero } from './RoadmapHero';
import RoadmapTree, { transformRoadmapToSkillTree } from './RoadmapTree';
import { AIMentorAnalysis } from './AIMentorAnalysis';
import { buttonStyles } from '../styles/theme';
import { generateMentorAnalysis } from '../lib/roadmapUtils';

// Helper function to transform roadmap data into a skill tree
// (imported from RoadmapTree so lesson IDs are preserved for selection)

interface RoadmapOverviewProps {
  roadmaps: Roadmap[];
  activeId: string;
  onSetActive: (id: string) => void;
  onGenerateRoadmap: (params: {
    goal: string;
    experienceLevel: string;
    weeklyHours: number;
    preferredStyle: string;
  }) => Promise<void>;
  isGenerating: boolean;
  onContinueActive: () => void;
  profile: UserProfile;
  onLessonSelect?: (phaseId: string, levelId: string, lessonId: string) => void;
  onAiAction?: (actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => void;
}

export function RoadmapOverview({
  roadmaps,
  activeId,
  onSetActive,
  onGenerateRoadmap,
  isGenerating,
  onContinueActive,
  profile,
  onLessonSelect,
  onAiAction
}: RoadmapOverviewProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [preferredStyle, setPreferredStyle] = useState('Hands-on');

  const activeRoadmap = roadmaps.find(r => r.id === activeId) || roadmaps[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    await onGenerateRoadmap({ goal, experienceLevel, weeklyHours: Number(weeklyHours), preferredStyle });
    setShowGenerator(false);
    setGoal('');
  };

  const loadingQuotes = [
    "Mapping out your learning phases...",
    "Building your quizzes...",
    "Setting up your coding exercises...",
    "Generating your personalized lessons...",
    "Putting together your milestones..."
  ];

  const [quoteIdx, setQuoteIdx] = useState(0);
  React.useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setQuoteIdx((prev) => (prev + 1) % loadingQuotes.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  // Generate data for components
  const mentorAnalysisData = activeRoadmap ? generateMentorAnalysis(activeRoadmap, profile) : null;
  const skillTreeData = activeRoadmap ? transformRoadmapToSkillTree(activeRoadmap) : null;

  return (
    <div className="space-y-6">
      {activeRoadmap && (
        <>
          <RoadmapHero roadmap={activeRoadmap} />
          {mentorAnalysisData && (
            <AIMentorAnalysis 
              strengths={mentorAnalysisData.strengths}
              weaknesses={mentorAnalysisData.weaknesses}
              recommendation={mentorAnalysisData.recommendation}
            />
          )}
          {skillTreeData && <RoadmapTree data={skillTreeData} onLessonSelect={onLessonSelect} onAiAction={onAiAction} />}
        </>
      )}

<div className="w-full">
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className={`w-full py-4 px-6 rounded-xl font-bold text-sm ${buttonStyles.primary} flex items-center justify-center gap-2`}
        >
          <Sparkles className="w-5 h-5" />
          <span>{showGenerator ? 'Close Generator' : 'Generate New Roadmap'}</span>
          <PlusCircle className="w-5 h-5" />
        </button>
      </div>

      {showGenerator && (
        <form onSubmit={handleCreate} className="glass-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/10 pb-3">
            <GraduationCap className="w-6 h-6 text-purple-500 dark:text-purple-400" />
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-white">AI Roadmap Architect</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Customize your learning journey.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Goal / Project Intent</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., Build a full-stack application with React and Node.js"
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-zinc-200"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Weekly Commitment</label>
              <select
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-zinc-200"
              >
                <option value={5}>5 hours</option>
                <option value={10}>10 hours</option>
                <option value={15}>15 hours</option>
                <option value={20}>20+ hours</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Learning Style</label>
              <select
                value={preferredStyle}
                onChange={(e) => setPreferredStyle(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-zinc-200"
              >
                <option>Hands-on</option>
                <option>Visual</option>
                <option>Theoretical</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isGenerating || !goal.trim()}
              className={`w-full py-3 rounded-lg text-sm font-bold ${buttonStyles.primary} flex items-center justify-center gap-2 disabled:opacity-50 transition-all`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : 'Create My Roadmap'}</span>
            </button>
          </div>
        </form>
      )}

      {isGenerating && (
        <div className="glass-card p-8 rounded-2xl text-center space-y-4 flex flex-col items-center">
          {/* SVG spinner ring + pulsing icon — avoids rotating a square */}
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="absolute inset-0 w-14 h-14 animate-spin-slow" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="24" className="stroke-white/10" strokeWidth="4" />
              <circle
                cx="28" cy="28" r="24"
                stroke="url(#gen-ring)"
                strokeWidth="4"
                strokeDasharray="150.796"
                strokeDashoffset="100"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gen-ring" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-zinc-900 dark:text-white">Personalizing Your Roadmap</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-300">Our AI is tailoring your learning path.</p>
          </div>
          <div className="px-3 py-1 rounded-md bg-white/10 text-xs text-purple-400 dark:text-purple-300 font-mono animate-pulse">
            {loadingQuotes[quoteIdx]}
          </div>
        </div>
      )}
    </div>
  );
}
