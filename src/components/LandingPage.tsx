import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Play,
  ChevronDown,
  Star,
  Users,
  Github,
  Twitter,
  Linkedin,
  Mail,
  Flame,
  Trophy,
  MessageSquare,
  Zap,
} from 'lucide-react';

import ParticleCanvas from './landing/ParticleCanvas';
import { FadeInSection, SectionHeading, StatCard } from './landing/LandingHelpers';
import {
  featureCards,
  steps,
  previewPanels,
  reasons,
  testimonials,
  faqItems,
  stats,
} from './landing/landingData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export const LandingPage: React.FC<LandingPageProps> = ({
  onGetStarted,
  onSignIn,
  onTerms,
  onPrivacy,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const previewRef = useRef<HTMLElement | null>(null);
  const featuresRef = useRef<HTMLElement | null>(null);

  // Live stat overrides fetched from the public (no-auth) endpoint.
  // Falls back gracefully — the stats section still renders with fallback values.
  const [liveStats, setLiveStats] = useState<{ roadmapsGenerated: number; skillsCovered: number } | null>(null);
  useEffect(() => {
    fetch('/api/public-stats')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.roadmapsGenerated === 'number') {
          setLiveStats({ roadmapsGenerated: data.roadmapsGenerated, skillsCovered: data.skillsCovered });
        }
      })
      .catch(() => { /* silently fall back to static values */ });
  }, []);

  const scrollToPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToFeatures = useCallback(() => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  }, []);

  return (
    // lp-light — light purple + warm cream landing page
    <div className="lp-light relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#f5f0ff] via-[#fdf8f0] to-[#f9f4fe] text-[#1a0a2e]">

      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-[44rem] w-[44rem] rounded-full bg-purple-300/30 blur-[140px]" />
        <div className="absolute -right-24 top-20 h-[34rem] w-[34rem] rounded-full bg-amber-200/25 blur-[110px]" />
        <div className="absolute bottom-0 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-violet-200/20 blur-[110px]" />
        <div className="absolute left-1/3 top-1/2 h-[20rem] w-[20rem] rounded-full bg-rose-100/20 blur-[90px]" />
        <div className="landing-grid-overlay-light" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ══════════════════════════ NAV ══════════════════════════ */}
        <header className="flex items-center justify-between py-5 sm:py-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-cyan-400 shadow-[0_0_32px_rgba(168,85,247,0.5)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-display text-[1.05rem] font-bold leading-none tracking-tight text-[#1a0a2e]">
                LearnPath{' '}
                <span className="bg-gradient-to-r from-purple-600 to-violet-500 bg-clip-text text-transparent">
                  AI
                </span>
              </p>
              <p className="mt-0.5 text-[10px] leading-none text-purple-500/70">AI-powered learning studio</p>
            </div>
          </div>

          {/* Desktop nav pill */}
          <nav
            className="hidden items-center gap-1 rounded-full border border-purple-200/60 bg-white/70 px-2 py-1.5 backdrop-blur-sm md:flex"
            aria-label="Main navigation"
          >
            {[
              { label: 'Preview', action: scrollToPreview },
              { label: 'Features', action: scrollToFeatures },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="rounded-full px-4 py-1.5 text-sm text-purple-700 transition-colors hover:bg-purple-50 hover:text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
              >
                {item.label}
              </button>
            ))}
            <div className="mx-1 h-4 w-px bg-purple-200" aria-hidden="true" />
            <button
              type="button"
              onClick={onSignIn}
              className="rounded-full px-4 py-1.5 text-sm text-purple-700 transition-colors hover:bg-purple-50 hover:text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onGetStarted}
              className="ml-1 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all hover:shadow-[0_6px_24px_rgba(124,58,237,0.5)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              Get Started
            </button>
          </nav>

          {/* Mobile CTA */}
          <button
            type="button"
            onClick={onGetStarted}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(168,85,247,0.35)] transition hover:shadow-[0_6px_28px_rgba(168,85,247,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 md:hidden"
          >
            Start Free <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* ══════════════════════════ HERO ══════════════════════════ */}
        <section className="relative pb-8 pt-10 sm:pt-14 lg:pt-20" aria-labelledby="hero-heading">
          <ParticleCanvas />

          <div className="relative grid items-center gap-12 lg:grid-cols-2 lg:gap-16">

            {/* ── Left: copy ── */}
            <motion.div
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 mx-auto max-w-xl lg:mx-0"
            >
              {/* Eyebrow badge */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-purple-300 bg-purple-100 px-3.5 py-1.5 text-sm font-medium text-purple-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
                GPT-4 powered mentor — free to start
              </div>

              {/* Headline */}
              <h1
                id="hero-heading"
                className="font-display text-[2.6rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-[#1a0a2e] sm:text-5xl lg:text-[3.4rem]"
              >
                Turn any skill goal into a{' '}
                <span className="bg-gradient-to-r from-purple-600 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                  clear AI roadmap
                </span>
              </h1>

              {/* Sub-copy */}
              <p className="mt-5 text-lg leading-8 text-purple-900/70 sm:text-xl">
                LearnPath AI builds a personalised study plan in seconds, guides you with an AI mentor, and tracks your progress every step of the way.
              </p>

              {/* Trust badges */}
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { label: 'AI Personalized', color: 'border-purple-300 bg-purple-100 text-purple-700' },
                  { label: 'Project Based', color: 'border-cyan-300 bg-cyan-50 text-cyan-700' },
                  { label: 'Progress Tracking', color: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
                  { label: 'Free to Start', color: 'border-amber-300 bg-amber-50 text-amber-700' },
                ].map((b) => (
                  <span
                    key={b.label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${b.color}`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {b.label}
                  </span>
                ))}
              </div>

              {/* CTAs */}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onGetStarted}
                  aria-label="Start learning for free"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_32px_rgba(124,58,237,0.35)] transition-shadow hover:shadow-[0_12px_40px_rgba(124,58,237,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto"
                >
                  Start Learning Free
                  <ArrowRight className="h-4 w-4" />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={scrollToPreview}
                  aria-label="See product preview"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-300 bg-white/80 px-7 py-3.5 text-base font-semibold text-purple-700 backdrop-blur-sm transition hover:border-purple-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto"
                >
                  <Play className="h-4 w-4 text-purple-500" />
                  See Preview
                </motion.button>
              </div>

              <p className="mt-3.5 text-xs text-purple-400/80">No credit card required · Free to explore</p>
            </motion.div>

            {/* ── Right: dashboard mockup ── */}
            <motion.div
              initial={{ opacity: 0, x: 32, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="motion-safe:animate-float-soft relative mx-auto w-full max-w-[520px] lg:mx-0"
            >
              {/* Outer glow halo */}
              <div className="pointer-events-none absolute -inset-4 rounded-[44px] bg-gradient-to-br from-purple-300/30 via-violet-200/20 to-fuchsia-200/20 blur-3xl" aria-hidden="true" />

              {/* Card shell */}
              <div className="relative overflow-hidden rounded-[28px] border border-purple-200 bg-white shadow-[0_24px_64px_rgba(124,58,237,0.12),0_0_0_1px_rgba(168,85,247,0.08)] backdrop-blur-xl">

                {/* Top bar */}
                <div className="flex items-center justify-between border-b border-purple-100 bg-purple-50/50 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-0.5 text-[10px] font-medium text-purple-500">
                    app.learnpath.ai
                  </span>
                  <div className="h-2 w-12 rounded-full bg-purple-100" />
                </div>

                <div className="grid gap-2.5 p-4 sm:grid-cols-2">

                  {/* AI Roadmap card — animated phase preview */}
                  <div className="col-span-2 rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-white p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-600">Your AI Roadmap</p>
                        <p className="mt-1 text-sm font-bold text-[#1a0a2e]">Python for Machine Learning</p>
                      </div>
                      <span className="flex items-center gap-1.5 rounded-xl bg-purple-100 px-2.5 py-1 text-[10px] font-bold text-purple-600">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
                        Live Demo
                      </span>
                    </div>
                    {/* Phase rows */}
                    <div className="space-y-2">
                      {[
                        { name: 'Python Foundations', progress: 100, lessons: 8, status: 'completed' },
                        { name: 'Data Structures & NumPy', progress: 100, lessons: 6, status: 'completed' },
                        { name: 'ML Model Training', progress: 55, lessons: 9, status: 'active' },
                        { name: 'Deep Learning & Neural Nets', progress: 0, lessons: 10, status: 'locked' },
                      ].map((phase, i) => (
                        <div key={phase.name} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 ${phase.status === 'active' ? 'bg-purple-100 border border-purple-200' : 'bg-purple-50/60'}`}>
                          <div className={`h-5 w-5 shrink-0 flex items-center justify-center rounded-full text-[9px] font-bold ${phase.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : phase.status === 'active' ? 'bg-purple-200 text-purple-700' : 'bg-slate-100 text-slate-400'}`}>
                            {phase.status === 'completed' ? '✓' : phase.status === 'active' ? i + 1 : '🔒'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-semibold truncate ${phase.status === 'locked' ? 'text-slate-400' : phase.status === 'active' ? 'text-[#1a0a2e]' : 'text-slate-600'}`}>{phase.name}</p>
                            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-purple-100">
                              <div
                                className={`h-full rounded-full transition-all ${phase.status === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-500 to-violet-500'}`}
                                style={{ width: `${phase.progress}%` }}
                              />
                            </div>
                          </div>
                          <span className={`shrink-0 text-[10px] ${phase.status === 'locked' ? 'text-slate-300' : 'text-slate-500'}`}>{phase.lessons} lessons</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                      <span>Phase 3 of 4 active</span>
                      <span className="text-purple-600 font-semibold">63% complete</span>
                    </div>
                  </div>

                  {/* Continue Learning */}
                  <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-400">Continue</p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-[0_6px_18px_rgba(124,58,237,0.3)]">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#1a0a2e]">Pick up where you left off</p>
                        <p className="text-[10px] text-slate-500">AI-selected next lesson</p>
                      </div>
                    </div>
                    <div className="mt-2.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-600">
                      → Resume lesson
                    </div>
                  </div>

                  {/* Progress Ring */}
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-purple-100 bg-violet-50/50 p-3.5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-purple-400">Weekly XP</p>
                    <div className="relative flex h-16 w-16 items-center justify-center">
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                        <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth="6" />
                        <circle cx="32" cy="32" r="26" fill="none" stroke="url(#xp-grad-light)" strokeWidth="6"
                          strokeDasharray="163" strokeDashoffset="52" strokeLinecap="round" />
                        <defs>
                          <linearGradient id="xp-grad-light" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#9333ea" />
                            <stop offset="100%" stopColor="#7c3aed" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="relative text-center">
                        <p className="text-lg font-extrabold leading-none text-purple-700">XP</p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600">
                      <Flame className="h-3 w-3" />
                      <span className="font-bold">Daily streak active</span>
                    </div>
                  </div>

                  {/* XP / achievements row */}
                  <div className="flex items-center justify-between rounded-2xl border border-purple-100 bg-amber-50/60 px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-semibold text-[#1a0a2e]">XP earned</span>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">+ today</span>
                  </div>

                  {/* AI Mentor chat preview */}
                  <div className="rounded-2xl border border-purple-100 bg-sky-50/50 p-3.5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MessageSquare className="h-3.5 w-3.5 text-sky-500" />
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600">AI Mentor</p>
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-700 shadow-sm">
                        Try building a mini project to apply what you've learned so far.
                      </div>
                      <div className="rounded-xl bg-purple-100 px-3 py-2 text-[11px] leading-5 text-purple-700">
                        You: "What should I build next?"
                      </div>
                    </div>
                  </div>

                  {/* Smart recommendation */}
                  <div className="col-span-2 flex items-center justify-between rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50 to-violet-50 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Zap className="h-4 w-4 shrink-0 text-violet-600" />
                      <span className="text-xs text-slate-600"><span className="font-semibold text-[#1a0a2e]">Next up:</span> AI picks your next best lesson</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                  </div>

                </div>
              </div>
            </motion.div>
          </div>

          {/* Scroll chevron */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
            className="mt-14 flex justify-center"
            aria-hidden="true"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            >
              <ChevronDown className="h-5 w-5 text-purple-400" />
            </motion.div>
          </motion.div>
        </section>

        {/* ══════════════════════════ FEATURES ══════════════════════════ */}
        <section ref={featuresRef} className="py-20 sm:py-24" aria-labelledby="features-heading" id="features">
          <FadeInSection>
            <SectionHeading
              id="features-heading"
              eyebrow="Trusted features"
              title="Everything you need to learn with clarity"
              description="A premium experience built to keep your study flow structured, motivating, and deeply personal."
            />
          </FadeInSection>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature, index) => (
              <FadeInSection key={feature.title} delay={0.06 * index}>
                <motion.div
                  whileHover={{ y: -6, scale: 1.015 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="group h-full"
                >
                  {/* Gradient border wrapper */}
                  <div className={`h-full rounded-[26px] bg-gradient-to-br ${feature.gradient} p-[1px] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`}>
                    <div className="relative flex h-full flex-col rounded-[25px] bg-white p-5">
                      {/* Hover glow */}
                      <div
                        className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: feature.glow }}
                        aria-hidden="true"
                      />
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr ${feature.gradient} shadow-[0_8px_20px_rgba(0,0,0,0.25)]`}>
                          <feature.icon className="h-5 w-5 text-white" />
                        </div>
                        <span className={`rounded-full bg-gradient-to-r ${feature.gradient} px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white opacity-90`}>
                          {feature.badge}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="relative mt-4 flex-1">
                        <h3 className="text-[1.05rem] font-bold leading-snug text-[#1a0a2e]">{feature.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
                      </div>
                      {/* Footer accent bar */}
                      <div className={`mt-5 h-1 w-full rounded-full bg-gradient-to-r ${feature.gradient} opacity-40`} aria-hidden="true" />
                    </div>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════════════════════ HOW IT WORKS ══════════════════════════ */}
        <section className="py-20 sm:py-24" aria-labelledby="how-heading">
          <div className="rounded-[32px] border border-purple-100 bg-gradient-to-br from-purple-50/80 to-violet-50/50 px-6 py-12 backdrop-blur-sm sm:px-10 sm:py-16">
            <FadeInSection>
              <SectionHeading
                id="how-heading"
                eyebrow="How it works"
                title="Three steps to real, lasting progress"
                description="A friction-free path that makes every session feel purposeful from day one."
                center
              />
            </FadeInSection>

            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              <div
                className="pointer-events-none absolute inset-x-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-purple-400/40 to-transparent md:block"
                aria-hidden="true"
              />
              {steps.map((step, index) => (
                <FadeInSection key={step.title} delay={0.1 + index * 0.12}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="relative flex flex-col items-center text-center"
                  >
                    <div className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border ${step.border} bg-gradient-to-br ${step.bg} shadow-[0_8px_32px_rgba(124,58,237,0.15)]`}>
                      <step.icon className={`h-8 w-8 ${step.color}`} />
                      <span className="absolute -right-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-purple-200 bg-white text-[10px] font-extrabold text-purple-700 shadow-lg">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-base font-bold text-[#1a0a2e]">{step.title}</h3>
                    <p className="mt-2 max-w-[200px] text-sm leading-6 text-slate-500">{step.description}</p>
                  </motion.div>
                </FadeInSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════ PRODUCT PREVIEW ══════════════════════════ */}
        <section ref={previewRef} className="py-20 sm:py-24" aria-labelledby="preview-heading">
          <FadeInSection>
            <SectionHeading
              id="preview-heading"
              eyebrow="Product preview"
              title="A refined experience built for daily momentum"
              description="Every surface is designed to feel calm and focused — so learning stays enjoyable, every session."
            />
          </FadeInSection>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {previewPanels.map((panel, index) => (
              <FadeInSection key={panel.title} delay={0.06 * index}>
                <motion.div
                  whileHover={{ y: -5, scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                  className="group overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
                >
                  <div className="overflow-hidden rounded-t-xl border-b border-purple-100 bg-purple-50/80">
                    <div className="flex items-center gap-1.5 px-3 py-2.5">
                      <span className={`h-2 w-2 rounded-full ${panel.dot}`} />
                      <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                      <span className="ml-2 truncate text-[10px] text-purple-400">
                        {panel.title.toLowerCase().replace(' ', '-')}.view
                      </span>
                    </div>
                    <div className={`bg-gradient-to-br ${panel.accent} px-4 pb-4 pt-3`}>
                      <div className="space-y-2">
                        {panel.bars.map((bar, i) => (
                          <div key={i} className={`h-2 ${bar.w} rounded-full ${bar.c}`} />
                        ))}
                        <div className={`mt-3 h-12 rounded-xl border border-white/[0.08] bg-gradient-to-r ${panel.accent}`} />
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="h-7 rounded-lg bg-white/[0.04]" />
                          <div className="h-7 rounded-lg bg-white/[0.04]" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3.5">
                    <p className="text-sm font-bold text-[#1a0a2e]">{panel.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{panel.detail}</p>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════════════════════ WHY LEARNPATH ══════════════════════════ */}
        <section className="py-20 sm:py-24" aria-labelledby="why-heading">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <FadeInSection>
              <SectionHeading
                id="why-heading"
                eyebrow="Why LearnPath AI"
                title="Built for real progress, not just content"
                description="Every feature exists to make your sessions feel structured, meaningful, and worth coming back to."
              />
              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={onGetStarted}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 px-6 py-3 font-semibold text-white shadow-[0_12px_36px_rgba(124,58,237,0.3)] hover:shadow-[0_16px_48px_rgba(124,58,237,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                Get started free <ArrowRight className="h-4 w-4" />
              </motion.button>
            </FadeInSection>

            <div className="grid gap-3 sm:grid-cols-2">
              {reasons.map((reason, index) => (
                <FadeInSection key={reason.text} delay={0.05 * index}>
                  <motion.div
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.2 }}
                    className="group rounded-2xl border border-purple-100 bg-white p-4 shadow-sm transition-all hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-md"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 ring-1 ring-purple-200">
                      <reason.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{reason.text}</p>
                  </motion.div>
                </FadeInSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════ STATISTICS ══════════════════════════ */}
        <section className="py-20 sm:py-24" aria-labelledby="stats-heading">
          <div className="overflow-hidden rounded-[36px] border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-violet-50 px-6 py-14 sm:px-10 sm:py-16">
            <FadeInSection>
              <SectionHeading
                id="stats-heading"
                eyebrow="At a glance"
                title="Trusted by learners who want real results"
                description="These numbers reflect the kind of momentum LearnPath AI is built to create."
                center
              />
            </FadeInSection>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, index) => {
                  // Slot 0 → roadmapsGenerated, slot 1 → skillsCovered from live endpoint.
                  const liveValue =
                    liveStats && index === 0 ? liveStats.roadmapsGenerated
                    : liveStats && index === 1 ? liveStats.skillsCovered
                    : undefined;
                  const liveSuffix = liveValue !== undefined && liveValue > 0 ? '+' : stat.suffix;
                  const displayStat = liveValue !== undefined
                    ? { ...stat, value: liveValue, suffix: liveSuffix }
                    : stat;
                  return <StatCard key={stat.label} stat={displayStat} index={index} />;
                })}
              </div>
          </div>
        </section>

        {/* ══════════════════════════ TESTIMONIALS ══════════════════════════ */}
        <section className="py-20 sm:py-24" aria-labelledby="testimonials-heading">
          <FadeInSection>
            <SectionHeading
              id="testimonials-heading"
              eyebrow="Testimonials"
              title="Learners love the guided experience"
              description="Real stories from people who turned their goals into structured progress with LearnPath AI."
            />
          </FadeInSection>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {testimonials.map((t, index) => (
              <FadeInSection key={t.name} delay={0.08 * index}>
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="flex h-full flex-col gap-4 rounded-2xl border border-purple-100 bg-white p-6 shadow-sm transition-all hover:border-purple-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-0.5" aria-label={`${t.stars} out of 5 stars`}>
                      {Array.from({ length: t.stars }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    {t.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-sm leading-7 text-slate-600">"{t.quote}"</p>
                  <div className="flex items-center gap-3 border-t border-purple-100 pt-4">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 text-sm font-bold text-white shadow-[0_4px_12px_rgba(124,58,237,0.3)]"
                      aria-hidden="true"
                    >
                      {t.name.split(' ').map((p) => p[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1a0a2e]">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role} · {t.company}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{t.date}</p>
                    </div>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════════════════════ FAQ ══════════════════════════ */}
        <section className="py-20 sm:py-24" aria-labelledby="faq-heading">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <FadeInSection>
              <SectionHeading
                id="faq-heading"
                eyebrow="FAQ"
                title="Clear answers for curious learners"
                description="Everything you need to know before getting started with LearnPath AI."
              />
            </FadeInSection>

            <FadeInSection delay={0.1}>
              <ul className="space-y-2">
                {faqItems.map((item, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <li
                      key={item.question}
                      className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                        isOpen
                          ? 'border-purple-300 bg-purple-50 shadow-[0_0_0_1px_rgba(168,85,247,0.12)]'
                          : 'border-purple-100 bg-white hover:border-purple-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(index)}
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${index}`}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 focus-visible:ring-inset"
                      >
                        <span className="text-sm font-semibold text-[#1a0a2e] sm:text-[0.95rem]">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-purple-300 transition-transform duration-300 ${isOpen ? 'rotate-180 text-purple-600' : ''}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={`faq-answer-${index}`}
                            key="answer"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.26, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <p className="px-5 pb-4 text-sm leading-7 text-slate-600">
                              {item.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            </FadeInSection>
          </div>
        </section>

        {/* ══════════════════════════ FINAL CTA ══════════════════════════ */}
        <section className="pb-24 pt-4" aria-labelledby="cta-heading">
          <FadeInSection>
            <div className="relative overflow-hidden rounded-[36px] border border-purple-200 bg-gradient-to-br from-purple-100 via-white to-violet-100 px-8 py-18 text-center sm:px-12 sm:py-20">
              {/* Glows */}
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-purple-300/30 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300 bg-purple-100 px-3.5 py-1.5 text-sm font-medium text-purple-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Ready to begin?
                </span>
                <h2
                  id="cta-heading"
                  className="mx-auto mt-5 max-w-2xl font-display text-3xl font-extrabold leading-tight text-[#1a0a2e] sm:text-4xl lg:text-[2.8rem]"
                >
                  Build your best learning habit, starting today
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-lg text-slate-600">
                  Start free — get an AI roadmap, mentor guidance, and real progress in your first session.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onGetStarted}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 px-8 py-4 text-base font-bold text-white shadow-[0_8px_32px_rgba(124,58,237,0.35)] transition-shadow hover:shadow-[0_12px_48px_rgba(124,58,237,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 sm:w-auto"
                  >
                    Start Learning Free <ArrowRight className="h-4 w-4" />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onSignIn}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-300 bg-white/80 px-8 py-4 text-base font-semibold text-purple-700 backdrop-blur-sm transition-all hover:border-purple-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 sm:w-auto"
                  >
                    Sign In
                  </motion.button>
                </div>
                <p className="mt-4 text-xs text-purple-400">No credit card required · Cancel anytime</p>
              </div>
            </div>
          </FadeInSection>
        </section>

        {/* ══════════════════════════ FOOTER ══════════════════════════ */}
        <footer
          className="border-t border-purple-100 py-12 sm:py-14"
          aria-labelledby="footer-heading"
        >
          <h2 id="footer-heading" className="sr-only">Footer</h2>
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">

            {/* Brand */}
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-violet-500 to-fuchsia-400 shadow-[0_0_20px_rgba(168,85,247,0.25)]">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <p className="font-display text-base font-bold text-[#1a0a2e]">
                  LearnPath <span className="bg-gradient-to-r from-purple-600 to-violet-500 bg-clip-text text-transparent">AI</span>
                </p>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-500">
                A modern AI learning platform for turning goals into structured, lasting progress.
              </p>
              <div className="mt-5 flex gap-2">
                {[
                  { icon: Twitter, label: 'LearnPath AI on Twitter', href: 'https://x.com' },
                  { icon: Github, label: 'LearnPath AI on GitHub', href: 'https://github.com' },
                  { icon: Linkedin, label: 'LearnPath AI on LinkedIn', href: 'https://linkedin.com' },
                ].map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-purple-200 text-purple-400 transition-all hover:border-purple-400 hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
                  >
                    <social.icon className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            </div>

            {/* Navigate */}
            <nav aria-label="Footer navigation">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400">Navigate</p>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Get Started', action: onGetStarted },
                  { label: 'See Preview', action: scrollToPreview },
                  { label: 'Sign In', action: onSignIn },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={item.action}
                      className="text-sm text-slate-500 transition-colors hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Legal */}
            <nav aria-label="Legal navigation">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400">Legal</p>
              <ul className="mt-3 space-y-2">
                {[
                  { label: 'Terms of Service', action: onTerms },
                  { label: 'Privacy Policy', action: onPrivacy },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={item.action}
                      className="text-sm text-slate-500 transition-colors hover:text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Contact */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-purple-400">Contact</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="mailto:hello@learnpath.ai"
                    className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-purple-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    hello@learnpath.ai
                  </a>
                </li>
                <li>
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Users className="h-3.5 w-3.5" />
                    {liveStats && liveStats.roadmapsGenerated > 0
                      ? `${liveStats.roadmapsGenerated.toLocaleString()}+ roadmaps created`
                      : 'Growing community of learners'}
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-purple-100 pt-8 sm:flex-row">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} LearnPath AI. All rights reserved.
            </p>
            <p className="text-xs text-slate-400">Built for learners who take growth seriously.</p>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default LandingPage;
