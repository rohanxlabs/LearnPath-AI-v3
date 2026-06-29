import { useState } from 'react';
import React from 'react';
import { Sparkles, PlusCircle, GraduationCap } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { RoadmapHero } from './RoadmapHero';
import RoadmapTree from './RoadmapTree';
import { AIMentorAnalysis } from './AIMentorAnalysis';
import { buttonStyles } from '../styles/theme';

interface SkillNode {
  name: string;
  status: 'completed' | 'current' | 'locked' | 'available';
  children?: SkillNode[];
}

// Helper function to generate AI Mentor Analysis
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

  // This is a simplified example. A real implementation would be more complex.
  return {
    strengths,
    weaknesses,
    recommendation: completionPercentage < 50 
      ? "Focus on completing the current module's lessons to build momentum."
      : "You're making great progress! Consider exploring advanced topics in the resources tab."
  };
};

// Helper function to transform roadmap data into a skill tree
const transformRoadmapToSkillTree = (roadmap: Roadmap): SkillNode | null => {
  if (!roadmap || !roadmap.phases) return null;

  const findCurrentNode = (phases: any[]) => {
    for (const phase of phases) {
      for (const level of phase.levels) {
        for (const lesson of level.lessons) {
          if (lesson.status === 'current') {
            return { phase: phase.name, level: level.name, lesson: lesson.name };
          }
        }
      }
    }
    return null;
  };

  const currentNode = findCurrentNode(roadmap.phases);

  return {
    name: roadmap.goal,
    status: 'current', // The root is always considered current/in-progress
    children: roadmap.phases.map(phase => ({
      name: phase.name,
      status: phase.levels.every(l => l.lessons.every(le => le.status === 'completed')) ? 'completed' : 'current',
      children: phase.levels.map(level => ({
        name: level.name,
        status: level.lessons.every(le => le.status === 'completed') ? 'completed' : 'current',
        children: level.lessons.map(lesson => {
          let status: SkillNode['status'] = lesson.status === 'completed' ? 'completed' : 'locked';
          
          if (status !== 'completed') {
             // Logic to determine if a lesson is 'available'
             if (currentNode) {
               const isCurrentPhase = phase.name === currentNode.phase;
               const isCurrentLevel = level.name === currentNode.level;
               if (isCurrentPhase && isCurrentLevel) {
                 status = 'available';
               } else {
                 status = 'locked';
               }
             } else {
                // If no current lesson, the first non-completed is available
                const firstLesson = roadmap.phases[0]?.levels[0]?.lessons[0];
                if(lesson.name === firstLesson?.name) {
                    status = 'available';
                } else {
                    status = 'locked';
                }
             }
          }

          return {
            name: lesson.name,
            status: status,
          };
        }),
      })),
    })),
  };
};

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
}

export function RoadmapOverview({
  roadmaps,
  activeId,
  onSetActive,
  onGenerateRoadmap,
  isGenerating,
  onContinueActive,
  profile
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
          {skillTreeData && <RoadmapTree data={skillTreeData} />}
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
        <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-white/5 border border-white/10 shadow-lg space-y-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-3">
            <GraduationCap className="w-6 h-6 text-purple-400" />
            <div>
              <h3 className="font-bold text-white">AI Roadmap Architect</h3>
              <p className="text-xs text-gray-400">Customize your learning journey.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-300">Goal / Project Intent</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., Build a full-stack application with React and Node.js"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">Weekly Commitment</label>
              <select
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200"
              >
                <option value={5}>5 hours</option>
                <option value={10}>10 hours</option>
                <option value={15}>15 hours</option>
                <option value={20}>20+ hours</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">Learning Style</label>
              <select
                value={preferredStyle}
                onChange={(e) => setPreferredStyle(e.target.value)}
                className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200"
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
        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 text-center space-y-4 shadow-xl flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center animate-spin">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-white">Personalizing Your Roadmap</h3>
            <p className="text-sm text-gray-300">Our AI is tailoring your learning path.</p>
          </div>
          <div className="px-3 py-1 rounded-md bg-white/10 text-xs text-purple-300 font-mono animate-pulse">
            {loadingQuotes[quoteIdx]}
          </div>
        </div>
      )}
    </div>
  );
}