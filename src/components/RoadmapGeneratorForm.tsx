import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, GraduationCap, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { buttonStyles } from '../styles/theme';

export interface RoadmapGeneratorParams {
  goal: string;
  experienceLevel: string;
  weeklyHours: number;
  preferredStyle: string;
}

interface RoadmapGeneratorFormProps {
  /** Called with the fully-generated roadmap JSON once the stream completes. */
  onRoadmapReady?: (roadmap: any) => void;
  /** Legacy callback kept for backward compatibility — called with form params
   *  when the streaming endpoint is unavailable. */
  onSubmit: (params: RoadmapGeneratorParams) => Promise<void>;
  isGenerating: boolean;
  onCancel?: () => void;
  /** Returns auth headers (including Bearer token) for the SSE streaming fetch. */
  getHeaders?: () => Promise<Record<string, string>>;
}

const GOAL_CHIPS = [
  'Learn React',
  'Python for ML',
  'Full-Stack Node.js',
  'DevOps with Docker',
  'Data Structures & Algorithms',
  'iOS App Development',
];

export function RoadmapGeneratorForm({
  onRoadmapReady,
  onSubmit,
  isGenerating,
  onCancel,
  getHeaders,
}: RoadmapGeneratorFormProps) {
  const [goal, setGoal] = useState('');
  const [goalError, setGoalError] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Beginner');
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [preferredStyle, setPreferredStyle] = useState('Hands-on');

  // ── Streaming state ──────────────────────────────────────────────────────────
  const [streamPhases, setStreamPhases] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up stream on unmount.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setStreamPhases([]);
    onCancel?.();
  }, [onCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (goal.trim().length < 10) {
      setGoalError('Please describe your goal in at least 10 characters (e.g. "Learn React for web apps").');
      return;
    }
    setGoalError('');

    const params: RoadmapGeneratorParams = {
      goal: goal.trim(),
      experienceLevel,
      weeklyHours: Number(weeklyHours),
      preferredStyle,
    };

    // Try the SSE streaming endpoint first.
    if (onRoadmapReady) {
      setIsStreaming(true);
      setStreamPhases([]);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const authHeaders = getHeaders
          ? await getHeaders()
          : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/generate-roadmap-stream', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by \n\n
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            try {
              const event = JSON.parse(line.slice(5).trim());
              if (event.type === 'phase' && event.name) {
                setStreamPhases(prev => [...prev, String(event.name)]);
              } else if (event.type === 'done' && event.roadmap) {
                setIsStreaming(false);
                setStreamPhases([]);
                setGoal('');
                onRoadmapReady(event.roadmap);
                return;
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
        // Stream ended without a done event — fall through to legacy path.
        throw new Error('Stream ended without a roadmap');
      } catch (err: any) {
        if (err.name === 'AbortError') return; // user cancelled — do nothing
        console.warn('[RoadmapGeneratorForm] SSE stream failed, falling back:', err.message);
        setIsStreaming(false);
        setStreamPhases([]);
        // Fall through to legacy onSubmit.
      }
    }

    // Legacy path (no SSE or SSE failed).
    try {
      await onSubmit(params);
      setGoal('');
    } catch (err: any) {
      setGenerationError('Roadmap generation failed. Check your connection and try again.');
      // Do not clear the goal — let the user retry without re-typing.
    }
  };

  const handleChipClick = (chip: string) => {
    setGoal(chip);
    setGoalError('');
  };

  const busy = isGenerating || isStreaming;

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
                  disabled={busy}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors disabled:opacity-50
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
              type="text"
              value={goal}
              onChange={e => { setGoal(e.target.value); if (goalError) setGoalError(''); if (generationError) setGenerationError(null); }}
              placeholder="e.g., Build a full-stack application with React and Node.js"
              disabled={busy}
              className={`w-full px-4 py-2.5 bg-white dark:bg-white/5 border rounded-xl text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 ${goalError ? 'border-red-400 dark:border-red-500' : 'border-zinc-200 dark:border-white/10'}`}
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
                disabled={busy}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
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
                  disabled={busy}
                  aria-label="Weekly study hours"
                  aria-valuetext={`${weeklyHours} hours per week`}
                  className="flex-1 accent-purple-600 cursor-pointer disabled:opacity-60"
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
                disabled={busy}
                className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
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
              disabled={busy || goal.trim().length < 10}
              className={`flex-1 py-3 rounded-xl text-sm font-bold ${buttonStyles.primary} flex items-center justify-center gap-2 disabled:opacity-50 transition-all`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{busy ? 'Generating...' : 'Create My Roadmap'}</span>
            </button>
            {busy && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-3 rounded-xl text-sm font-semibold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 transition-colors flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Generation error panel ── */}
      {generationError && (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{generationError}</span>
          </div>
        </div>
      )}

      {/* ── Streaming progress panel ── */}
      <AnimatePresence>
        {busy && (
          <motion.div
            key="stream-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-zinc-100 dark:border-white/10"
          >
            <div className="px-6 pb-6 pt-4 space-y-3">
              {/* spinner row */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center animate-spin flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">Building your personalised roadmap…</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {streamPhases.length > 0
                      ? `${streamPhases.length} phase${streamPhases.length !== 1 ? 's' : ''} planned`
                      : 'Waiting for AI response…'}
                  </p>
                </div>
              </div>

              {/* Phase progress track */}
              {streamPhases.length > 0 && (
                <div className="space-y-1.5 pl-11">
                  {streamPhases.map((name, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 font-medium truncate">{name}</span>
                    </motion.div>
                  ))}
                  {/* animated "building" indicator for the next phase */}
                  <motion.div
                    className="flex items-center gap-2"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.4 }}
                  >
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin flex-shrink-0" />
                    <span className="text-xs text-purple-500 font-medium">Constructing next phase…</span>
                  </motion.div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
