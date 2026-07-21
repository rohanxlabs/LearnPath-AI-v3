import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, GraduationCap, X } from 'lucide-react';
import { buttonStyles } from '../styles/theme';

export interface RoadmapGeneratorParams {
  goal: string;
  experienceLevel: string;
  weeklyHours: number;
  preferredStyle: string;
}

interface RoadmapGeneratorFormProps {
  onSubmit: (params: RoadmapGeneratorParams) => Promise<void>;
  isGenerating: boolean;
  onCancel?: () => void;
}

const GOAL_CHIPS = [
  'Learn React',
  'Python for ML',
  'Full-Stack Node.js',
  'DevOps with Docker',
  'Data Structures & Algorithms',
  'iOS App Development',
];

const LOADING_QUOTES = [
  'Mapping out your learning phases...',
  'Building your quizzes...',
  'Setting up your coding exercises...',
  'Generating your personalized lessons...',
  'Putting together your milestones...',
];

export function RoadmapGeneratorForm({ onSubmit, isGenerating, onCancel }: RoadmapGeneratorFormProps) {
  const [goal, setGoal] = useState('');
  const [goalError, setGoalError] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [preferredStyle, setPreferredStyle] = useState('Hands-on');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const goalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        setQuoteIdx(prev => (prev + 1) % LOADING_QUOTES.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim().length < 3) {
      setGoalError('Please enter at least 3 characters for your goal.');
      return;
    }
    setGoalError('');
    await onSubmit({ goal: goal.trim(), experienceLevel, weeklyHours: Number(weeklyHours), preferredStyle });
    setGoal('');
  };

  const handleChipClick = (chip: string) => {
    setGoal(chip);
    setGoalError('');
    goalInputRef.current?.focus();
  };

  return (
    <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 space-y-5">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/10 pb-4">
          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-purple-700 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm">AI Roadmap Architect</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Describe your goal and we'll build your personalized path.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* goal input + chips */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
              Your Learning Goal
            </label>
            {/* suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {GOAL_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors
                    ${goal === chip
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20'
                    }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              ref={goalInputRef}
              type="text"
              value={goal}
              onChange={e => { setGoal(e.target.value); if (goalError) setGoalError(''); }}
              placeholder="e.g., Build a full-stack application with React and Node.js"
              className={`w-full px-4 py-2.5 bg-white dark:bg-white/5 border rounded-xl text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 ${goalError ? 'border-red-400 dark:border-red-500' : 'border-zinc-200 dark:border-white/10'}`}
            />
            {goalError && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{goalError}</p>
            )}
          </div>

          {/* options row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                Experience
              </label>
              <select
                value={experienceLevel}
                onChange={e => setExperienceLevel(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                Weekly Hours — <span className="text-purple-600 dark:text-purple-400 font-bold normal-case">{weeklyHours}h</span>
              </label>
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs text-zinc-400">1</span>
                <input
                  type="range" min={1} max={40} step={1} value={weeklyHours}
                  onChange={e => setWeeklyHours(Number(e.target.value))}
                  aria-label="Weekly study hours"
                  aria-valuetext={`${weeklyHours} hours per week`}
                  className="flex-1 accent-purple-600 cursor-pointer"
                />
                <span className="text-xs text-zinc-400">40</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                Style
              </label>
              <select
                value={preferredStyle}
                onChange={e => setPreferredStyle(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option>Hands-on</option>
                <option>Visual</option>
                <option>Theoretical</option>
              </select>
            </div>
          </div>

          {/* submit */}
          <div className="flex gap-3">
            <button
              type="submit"
                disabled={isGenerating || goal.trim().length < 3}
              className={`flex-1 py-3 rounded-xl text-sm font-bold ${buttonStyles.primary} flex items-center justify-center gap-2 disabled:opacity-50 transition-all`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : 'Create My Roadmap'}</span>
            </button>
            {isGenerating && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-3 rounded-xl text-sm font-semibold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 transition-colors flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* loading indicator */}
      {isGenerating && (
        <div className="px-6 pb-6 pt-2 border-t border-zinc-100 dark:border-white/10">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center animate-spin flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">Personalizing Your Roadmap</p>
              <p className="text-xs text-purple-600 dark:text-purple-300 font-mono mt-0.5">
                {LOADING_QUOTES[quoteIdx]}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
