import { useState } from 'react';
import React from 'react';
import { Sparkles, PlusCircle, GraduationCap } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { RoadmapsList } from './RoadmapsList';
import { RoadmapHeader } from './RoadmapHeader';
import { RoadmapProgress } from './RoadmapProgress';
import { RoadmapTimeline } from './RoadmapTimeline';
import { XPCard } from './XPCard';
import { MilestonesCard } from './MilestonesCard';

interface RoadmapsTabContainerProps {
  roadmaps: Roadmap[];
  selectedRoadmapId: string | null;
  onSelectRoadmap: (id: string) => void;
  onBackToList: () => void;
  onDeleteRoadmap: (id: string) => void;
  onGenerateRoadmap: (params: any) => Promise<void>;
  isGenerating: boolean;
  profile: UserProfile;
  onLessonClick?: (phaseId: string, levelId: string, lessonId: string) => void;
  onAiAction?: (actionType: string, phaseName: string) => void;
}

const generateMentorAnalysis = (roadmap: Roadmap, profile: UserProfile) => {
  const completedLessons = roadmap.phases
    .flatMap(p => p.levels)
    .flatMap(l => l.lessons)
    .filter(lesson => lesson.status === 'completed').length;

  const totalLessons = roadmap.phases
    .flatMap(p => p.levels)
    .flatMap(l => l.lessons).length;

  const completionPercentage = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  let strengths: string[] = [];
  let weaknesses: string[] = [];

  if (completionPercentage > 75) {
    strengths.push("High completion rate");
  } else if (completionPercentage < 25) {
    weaknesses.push("Low initial progress");
  }

  if (roadmap.preferredStyle) {
    strengths.push("Aligned learning style");
  }

  return {
    strengths,
    weaknesses,
    recommendation: completionPercentage < 50 
      ? "Focus on completing the current module's lessons to build momentum."
      : "You're making great progress! Consider exploring advanced topics in the resources tab."
  };
};

export function RoadmapsTabContainer({
  roadmaps,
  selectedRoadmapId,
  onSelectRoadmap,
  onBackToList,
  onDeleteRoadmap,
  onGenerateRoadmap,
  isGenerating,
  profile,
  onLessonClick,
  onAiAction,
}: RoadmapsTabContainerProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [preferredStyle, setPreferredStyle] = useState('Hands-on');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    await onGenerateRoadmap({ goal, experienceLevel, weeklyHours: Number(weeklyHours), preferredStyle });
    setShowGenerator(false);
    setGoal('');
  };

  const loadingQuotes = [
    "Orchestrating adaptive phases...",
    "Calibrating multiple-choice quizzes...",
    "Synthesizing coding environment parameters...",
    "Structuring foundational neural definitions with OpenRouter...",
    "Completing Duolingo-style RPG node linkages..."
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

  // List View
  if (!selectedRoadmapId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">My Roadmaps</h2>
            <p className="text-sm text-slate-600 mt-1">
              Manage your learning paths
            </p>
          </div>
        </div>

        <RoadmapsList
          roadmaps={roadmaps}
          onSelectRoadmap={onSelectRoadmap}
          onDeleteRoadmap={onDeleteRoadmap}
        />

        {/* Generate New Button */}
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="w-full py-4 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          <span>{showGenerator ? 'Close Generator' : 'Generate New Roadmap'}</span>
          <PlusCircle className="w-5 h-5" />
        </button>

        {showGenerator && (
          <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <GraduationCap className="w-6 h-6 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900">AI Roadmap Architect</h3>
                <p className="text-xs text-slate-600">Customize your learning journey.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">Goal / Project Intent</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g., Build a full-stack application with React and Node.js"
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">Experience Level</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">Weekly Commitment</label>
                <select
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
                >
                  <option value={5}>5 hours</option>
                  <option value={10}>10 hours</option>
                  <option value={15}>15 hours</option>
                  <option value={20}>20+ hours</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">Learning Style</label>
                <select
                  value={preferredStyle}
                  onChange={(e) => setPreferredStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
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
                className="w-full py-3 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'Generating...' : 'Create My Roadmap'}</span>
              </button>
            </div>
          </form>
        )}

        {isGenerating && (
          <div className="p-8 rounded-2xl bg-indigo-50 border border-indigo-200 text-center space-y-4 shadow-sm flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center animate-spin">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900">Personalizing Your Roadmap</h3>
              <p className="text-sm text-slate-600">Our AI is tailoring your learning path.</p>
            </div>
            <div className="px-3 py-1 rounded-md bg-indigo-100 text-xs text-indigo-700 font-mono animate-pulse">
              {loadingQuotes[quoteIdx]}
            </div>
          </div>
        )}
      </div>
    );
  }

  const selectedRoadmap = roadmaps.find(r => r.id === selectedRoadmapId);
  if (!selectedRoadmap) {
    onBackToList();
    return null;
  }

  return (
    <div className="space-y-6">
      <RoadmapHeader
        roadmap={selectedRoadmap}
        onBack={onBackToList}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RoadmapProgress
          progress={selectedRoadmap.progressPercent}
          recommendedLessonName={
            selectedRoadmap.phases
              .flatMap(p => p.levels)
              .flatMap(l => l.lessons)
              .find(l => l.status === 'available')?.name
          }
        />
        <XPCard
          xp={selectedRoadmap.totalXp}
          level={profile.level}
          levelName={selectedRoadmap.experienceLevel}
        />
      </div>

      <RoadmapTimeline
        roadmap={selectedRoadmap}
        onLessonClick={(phaseId, levelId, lessonId) => {
          if (onLessonClick) onLessonClick(phaseId, levelId, lessonId);
        }}
        onRegenerate={() => {
          if (onGenerateRoadmap) {
            onGenerateRoadmap({ goal: selectedRoadmap.goal, experienceLevel: selectedRoadmap.experienceLevel, weeklyHours: 10, preferredStyle: 'Hands-on' });
          }
        }}
      />

      <MilestonesCard
        lessonsCompleted={selectedRoadmap.lessonsCompleted}
        progressPercent={selectedRoadmap.progressPercent}
      />
    </div>
  );
}
