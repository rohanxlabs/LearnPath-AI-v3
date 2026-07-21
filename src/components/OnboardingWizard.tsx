import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Target, Clock, BookOpen, ChevronRight, Check } from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void;
  userName: string;
}

export interface OnboardingData {
  goal: string;
  experienceLevel: string;
  weeklyHours: number;
  preferredStyle: string;
}

const STEP_COUNT = 3;

const EXPERIENCE_LEVELS = ['Complete Beginner', 'Some Experience', 'Intermediate', 'Advanced'];
const PREFERRED_STYLES = ['Hands-on Projects', 'Theory First', 'Mixed', 'Video Tutorials'];
const WEEKLY_HOURS_OPTIONS = [2, 5, 10, 15, 20];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current ? 'w-6 h-2 bg-purple-500' : i === current ? 'w-6 h-2 bg-purple-400' : 'w-2 h-2 bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard({ onComplete, userName }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [weeklyHours, setWeeklyHours] = useState(5);
  const [preferredStyle, setPreferredStyle] = useState('');

  const canProceed = [
    goal.trim().length >= 3,
    !!experienceLevel,
    !!preferredStyle,
  ][step];

  function handleNext() {
    if (step < STEP_COUNT - 1) {
      setStep(s => s + 1);
    } else {
      onComplete({ goal: goal.trim(), experienceLevel, weeklyHours, preferredStyle });
    }
  }

  const variants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome, {userName.split(' ')[0]}!
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Let's personalise your learning experience in 3 quick steps.</p>
        </div>

        <StepDots current={step} />

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 min-h-[340px] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Step 0 — Goal */}
            {step === 0 && (
              <motion.div key="step0" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
                <div className="flex items-center gap-2 mb-6">
                  <Target className="w-5 h-5 text-purple-400" />
                  <h2 className="text-xl font-semibold text-white">What do you want to learn?</h2>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  Be specific — e.g. "Build a full-stack app with React & Node", "Master Python for Data Science", "Learn System Design for interviews".
                </p>
                <textarea
                  autoFocus
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="Describe your learning goal…"
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-purple-500 transition-colors"
                />
                <p className="text-xs text-zinc-600 mt-1 text-right">{goal.trim().length}/500</p>
              </motion.div>
            )}

            {/* Step 1 — Experience */}
            {step === 1 && (
              <motion.div key="step1" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
                <div className="flex items-center gap-2 mb-6">
                  <BookOpen className="w-5 h-5 text-purple-400" />
                  <h2 className="text-xl font-semibold text-white">Your experience level?</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {EXPERIENCE_LEVELS.map(level => (
                    <button
                      key={level}
                      onClick={() => setExperienceLevel(level)}
                      className={`relative p-4 rounded-xl border text-sm font-medium transition-all text-left ${
                        experienceLevel === level
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/10 bg-white/3 text-zinc-400 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {experienceLevel === level && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                      {level}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2 — Pace + Style */}
            {step === 2 && (
              <motion.div key="step2" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
                <div className="flex items-center gap-2 mb-5">
                  <Clock className="w-5 h-5 text-purple-400" />
                  <h2 className="text-xl font-semibold text-white">Your learning pace & style</h2>
                </div>

                <p className="text-xs text-zinc-500 mb-2">Hours per week</p>
                <div className="flex items-center gap-3 mb-6">
                  {WEEKLY_HOURS_OPTIONS.map(h => (
                    <button
                      key={h}
                      onClick={() => setWeeklyHours(h)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${
                        weeklyHours === h
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>

                <p className="text-xs text-zinc-500 mb-2">Preferred learning style</p>
                <div className="grid grid-cols-2 gap-3">
                  {PREFERRED_STYLES.map(style => (
                    <button
                      key={style}
                      onClick={() => setPreferredStyle(style)}
                      className={`relative p-3 rounded-xl border text-xs font-medium transition-all text-left ${
                        preferredStyle === style
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {preferredStyle === style && (
                        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="w-2 h-2 text-white" />
                        </span>
                      )}
                      {style}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            className={`text-sm text-zinc-500 hover:text-white transition-colors ${step === 0 ? 'invisible' : ''}`}
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-br from-purple-500 to-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
          >
            {step === STEP_COUNT - 1 ? 'Generate My Roadmap' : 'Continue'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
