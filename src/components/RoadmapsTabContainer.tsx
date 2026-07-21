import { useState, useEffect } from 'react';
import React from 'react';
import { Sparkles, PlusCircle, GraduationCap } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { RoadmapsList } from './RoadmapsList';
import { RoadmapHeader } from './RoadmapHeader';
import { RoadmapProgress } from './RoadmapProgress';
import { RoadmapTimeline } from './RoadmapTimeline';
import { XPCard } from './XPCard';
import { MilestonesCard } from './MilestonesCard';
import { buttonStyles, glassCardClass } from '../styles/theme';

interface RoadmapsTabContainerProps {
  roadmaps: Roadmap[];
  selectedRoadmapId: string | null;
  onSelectRoadmap: (id: string) => void;
  onBackToList: () => void;
  onDeleteRoadmap: (id: string) => void;
  onGenerateRoadmap: (params: any) => Promise<void>;
  isGenerating: boolean;
  profile: UserProfile;
  isLoading?: boolean;
  onAiAction?: (actionType: string, phaseName?: string) => void;
  onLessonClick?: (phaseId: string, levelId: string, lessonId: string) => void;
}
const generateMentorAnalysis = (roadmap: Roadmap, profile: UserProfile) => {
  const completedLessons = (roadmap.phases || [])
    .flatMap(p => p.levels || [])
    .flatMap(l => l.lessons || [])
    .filter(lesson => lesson.status === 'completed').length;

  const totalLessons = (roadmap.phases || [])
    .flatMap(p => p.levels || [])
    .flatMap(l => l.lessons || []).length;

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
  isLoading,
  onLessonClick,
  onAiAction,
}: RoadmapsTabContainerProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [preferredStyle, setPreferredStyle] = useState('Hands-on');

  // Redirect to the list view when a selected roadmap no longer exists.
  // Done in an effect (not during render) to avoid side effects in the render path.
  useEffect(() => {
    if (selectedRoadmapId && !roadmaps.some(r => r.id === selectedRoadmapId)) {
      onBackToList();
    }
  }, [selectedRoadmapId, roadmaps, onBackToList]);

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

  // List View
  if (!selectedRoadmapId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">My Roadmaps</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Manage your learning paths
              </p>
            </div>
        </div>

        <RoadmapsList
          roadmaps={roadmaps}
          onSelectRoadmap={onSelectRoadmap}
          onDeleteRoadmap={onDeleteRoadmap}
          isLoading={isLoading}
        />

        {/* Generate New Button */}
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className={`w-full py-4 px-6 rounded-xl font-bold text-sm ${buttonStyles.primary} flex items-center justify-center gap-2`}
        >
          <Sparkles className="w-5 h-5" />
          <span>{showGenerator ? 'Close Generator' : 'Generate New Roadmap'}</span>
          <PlusCircle className="w-5 h-5" />
        </button>

        {showGenerator && (
          <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/10 pb-3">
              <GraduationCap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white">AI Roadmap Architect</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Customize your learning journey.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Goal / Project Intent</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g., Build a full-stack application with React and Node.js"
                className="w-full px-4 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Experience Level</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-white"
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Weekly Commitment</label>
                <select
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-white"
                >
                  <option value={5}>5 hours</option>
                  <option value={10}>10 hours</option>
                  <option value={15}>15 hours</option>
                  <option value={20}>20+ hours</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Learning Style</label>
                <select
                  value={preferredStyle}
                  onChange={(e) => setPreferredStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-lg text-sm text-zinc-900 dark:text-white"
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
          <div className="p-8 rounded-2xl bg-purple-500/5 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30 text-center space-y-4 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center animate-spin">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-zinc-900 dark:text-white">Personalizing Your Roadmap</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Our AI is tailoring your learning path.</p>
            </div>
            <div className="px-3 py-1 rounded-md bg-purple-100 dark:bg-purple-500/10 text-xs text-purple-700 dark:text-purple-300 font-mono">
              {loadingQuotes[quoteIdx]}
            </div>
          </div>
        )}
      </div>
    );
  }

  const selectedRoadmap = roadmaps.find(r => r.id === selectedRoadmapId);
  if (!selectedRoadmap) {
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
              .flatMap(p => p.levels || [])
              .flatMap(l => l.lessons || [])
              .find(l => l.status === 'available')?.name
          }
          onContinue={() => {
            const availableLesson = selectedRoadmap.phases
              .flatMap(p => p.levels || [])
              .flatMap(l => l.lessons || [])
              .find(l => l.status === 'available');
            if (availableLesson && onLessonClick) {
              const phase = selectedRoadmap.phases.find(p => (p.levels || []).some(l => (l.lessons || []).some(les => les.id === availableLesson.id)));
              const level = phase?.levels.find(l => (l.lessons || []).some(les => les.id === availableLesson.id));
              if (phase && level) {
                onLessonClick(phase.id, level.id, availableLesson.id);
              }
            }
          }}
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