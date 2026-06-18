import React, { useState } from 'react';
import { Compass, Sparkles, AlertTriangle, Play, Flame, BarChart3, Clock, CheckSquare, Plus, PlusCircle, Laptop, GraduationCap, ChevronRight, Check } from 'lucide-react';
import { Roadmap, Phase } from '../types';
import { XPBadge, StreakBadge } from './Badges';

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
}

export function RoadmapOverview({
  roadmaps,
  activeId,
  onSetActive,
  onGenerateRoadmap,
  isGenerating,
  onContinueActive
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

  // Loading quotes for dynamic feel
  const loadingQuotes = [
    "Orchestrating adaptive phases...",
    "Calibrating multiple-choice quizzes...",
    "Synthesizing coding environment parameters...",
    "Structuring foundational neural definitions with Gemini...",
    "Completing Duolingo-styleRPG node linkages..."
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

  return (
    <div className="space-y-6">
      {/* 1. Full-width gradient generate button at top */}
      <div className="w-full">
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="w-full py-4.5 px-6 rounded-3xl font-bold font-display text-sm text-white bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-600 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer shadow-[0_4px_20px_rgba(168,85,247,0.35)] flex items-center justify-center gap-2 "
          id="btn-trigger-roadmap-gen"
        >
          <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
          <span>{showGenerator ? 'Close Custom Generator Form' : 'Generate New Roadmap with AI'}</span>
          <PlusCircle className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Generator Form panel widget styled as a frosted glass card */}
      {showGenerator && (
        <form onSubmit={handleCreate} className="p-6 rounded-3xl glass-card glass-card-purple shadow-xl space-y-4 relative transition-all duration-300 animate-fade-in">
          <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
            <GraduationCap className="w-5.5 h-5.5 text-purple-400" />
            <div>
              <h3 className="font-display font-semibold text-sm text-white">AI Roadmap Architect</h3>
              <p className="text-[10px] text-zinc-400">Provide study params and let GenAI synthesize your tree.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] uppercase font-mono font-bold text-zinc-300 tracking-wider">Goal / Project Intent</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Master LangChain, build Stable Diffusion models..."
              className="w-full px-4 py-3 bg-black/30 border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500 transition-colors placeholder:text-zinc-600"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-bold text-zinc-350 tracking-wider">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-3.5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs text-zinc-200"
              >
                <option value="Beginner">Beginner (Slow walkthroughs)</option>
                <option value="Intermediate">Intermediate (Normal speed)</option>
                <option value="Advanced">Advanced (High-density terms)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-bold text-zinc-350 tracking-wider">Study Hours Per Week</label>
              <select
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value))}
                className="w-full px-3.5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs text-zinc-200"
              >
                <option value={5}>5 Hours (Casual study)</option>
                <option value={10}>10 Hours (Steady builder)</option>
                <option value={15}>15 Hours (Career transition)</option>
                <option value={20}>20 Hours (Ultimate sandbox)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-bold text-zinc-350 tracking-wider">Learning Style Preference</label>
              <select
                value={preferredStyle}
                onChange={(e) => setPreferredStyle(e.target.value)}
                className="w-full px-3.5 py-3 bg-black/40 border border-white/5 rounded-xl text-xs text-zinc-200"
              >
                <option value="Hands-on">Hands-on (Code exercise puzzles)</option>
                <option value="Visual">Visual (Mind maps / diagrams)</option>
                <option value="Theoretical">Theoretical (Calculus derivations)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isGenerating || !goal.trim()}
              className="w-full py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-blue-600 hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2 font-display"
              id="btn-submit-roadmap-gen"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Synthesizing Roadmap Tree...' : 'Generate Customized Curriculum'}</span>
            </button>
          </div>
        </form>
      )}

      {/* AI Loader overlay panel inside component context */}
      {isGenerating && (
        <div className="p-8 rounded-3xl glass-card glass-card-purple text-center space-y-4 shadow-2xl relative overflow-hidden flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center animate-spin text-white">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-semibold text-white">Personalizing Syllabus</h3>
            <p className="text-xs text-zinc-300 max-w-lg">Our server-side Gemini intelligence is tailoring chapters, practice metrics, and assessments.</p>
          </div>
          <div className="px-4 py-1.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-purple-300 font-mono animate-pulse">
            Active Hook: {loadingQuotes[quoteIdx]}
          </div>
        </div>
      )}

      {/* 3. Roadmaps list display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        {roadmaps.map((r, index) => {
          const isActive = r.id === activeId;
          const totalPhases = r.phases.length;
          
          // Calculate the exact lesson count in this roadmap
          const totalLessons = r.phases.reduce(
            (acc, phase) => acc + phase.levels.reduce((lAcc, lvl) => lAcc + (lvl.lessons?.length || 0), 0),
            0
          );

          // Unique glass class colors to visually differentiate syllabus templates
          const tints = ['glass-card-purple', 'glass-card-blue', 'glass-card-teal', 'glass-card-orange'];
          const glassClass = tints[index % tints.length];

          // Progress Circle values
          const circRadius = 22;
          const circCircumference = 2 * Math.PI * circRadius;
          const circOffset = circCircumference - (r.progressPercent / 100) * circCircumference;

          return (
            <div
              key={r.id}
              onClick={() => onSetActive(r.id)}
              className={`p-6 rounded-3xl cursor-pointer relative overflow-hidden transition-all duration-300 flex flex-col justify-between h-56 ${glassClass} ${
                isActive
                  ? 'ring-2 ring-purple-500/30 shadow-[0_8px_30px_rgba(168,85,247,0.2)] scale-102 z-10'
                  : 'opacity-85 hover:opacity-100 hover:scale-[1.01]'
              }`}
            >
              {/* Top corner status badges */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                {isActive && (
                  <span className="inline-flex items-center gap-1 px-2.5  py-1 rounded-full text-[9px] font-extrabold uppercase font-mono tracking-wider bg-gradient-to-r from-purple-500 to-indigo-650 text-white shadow-sm border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    <span>Current</span>
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2.5 text-[10px] font-mono mb-2.5 text-zinc-400">
                  <span className="font-semibold">{new Date(r.createdAt).toLocaleDateString()}</span>
                  <span className="text-zinc-550">•</span>
                  <span className="text-amber-450 font-extrabold uppercase bg-amber-500/10 border border-amber-500/15 py-0.5 px-2 rounded-lg">{r.experienceLevel}</span>
                </div>
                
                <h3 className="font-display font-bold text-base text-white leading-snug line-clamp-2 md:max-w-[75%]">
                  {r.goal}
                </h3>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center justify-between gap-4">
                  {/* Left stats overview */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-extrabold font-mono text-purple-300 uppercase px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/15">
                        +{r.totalXp} XP Reward
                      </span>
                      <span className="text-[10px] font-medium text-zinc-400">
                        {totalLessons} Modules ({totalPhases} Chapters)
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-medium">
                      Style: {r.preferredStyle} ({r.weeklyHours}h/wk)
                    </p>
                  </div>

                  {/* Circular progress ring overlay representation */}
                  <div className="relative flex-shrink-0 w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
                    <svg className="w-12 h-12 transform -rotate-90">
                      <circle cx="24" cy="24" r={circRadius} className="stroke-white/5" strokeWidth="4" fill="none" />
                      <circle
                        cx="24"
                        cy="24"
                        r={circRadius}
                        className="stroke-purple-500 transition-all duration-500"
                        strokeWidth="4"
                        strokeDasharray={circCircumference}
                        strokeDashoffset={circOffset}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <span className="absolute text-[10px] font-extrabold text-white">
                      {r.progressPercent}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
