import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Bot,
  Zap,
  BookOpen,
  Brain,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Compass,
  TrendingUp,
  Play,
  ChevronDown,
  Clock3,
  Target,
  Star,
  Users,
  Award,
  Layers,
  Github,
  Twitter,
  Linkedin,
  Mail,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}

interface FAQItem {
  question: string;
  answer: string;
}

// ─── Static data ─────────────────────────────────────────────────────────────

const featureCards = [
  {
    icon: Bot,
    title: 'AI Roadmap Generation',
    description: 'Turn any learning goal into a focused, adaptive path that evolves with your progress and pace.',
    gradient: 'from-purple-500 to-fuchsia-500',
    glow: 'rgba(168,85,247,0.25)',
    badge: 'Core',
  },
  {
    icon: Brain,
    title: 'AI Mentor',
    description: 'Get thoughtful explanations, practice prompts, and real-time guidance whenever you need it.',
    gradient: 'from-sky-500 to-cyan-400',
    glow: 'rgba(14,165,233,0.25)',
    badge: 'Popular',
  },
  {
    icon: BarChart3,
    title: 'Progress Tracking',
    description: 'Monitor streaks, XP, and momentum in a polished dashboard built for daily consistency.',
    gradient: 'from-emerald-500 to-teal-400',
    glow: 'rgba(16,185,129,0.25)',
    badge: 'Momentum',
  },
  {
    icon: Clock3,
    title: 'Daily Learning',
    description: 'Build a habit loop with structured daily sessions, clear next steps, and streak rewards.',
    gradient: 'from-amber-500 to-orange-400',
    glow: 'rgba(245,158,11,0.25)',
    badge: 'Habit',
  },
  {
    icon: Target,
    title: 'Personalized Plans',
    description: 'Receive a study plan tailored to your skill level, availability, and long-term goals.',
    gradient: 'from-indigo-500 to-violet-500',
    glow: 'rgba(99,102,241,0.25)',
    badge: 'Custom',
  },
  {
    icon: Zap,
    title: 'Smart Recommendations',
    description: 'Surface the best next lessons, projects, and resources at exactly the right moment.',
    gradient: 'from-pink-500 to-rose-500',
    glow: 'rgba(244,63,94,0.25)',
    badge: 'Smart',
  },
];

const steps = [
  {
    icon: Compass,
    title: 'Enter your goal',
    description: 'Share what you want to learn and the pace that fits your schedule. No setup friction.',
    color: 'text-purple-400',
    bg: 'from-purple-500/20 to-violet-500/20',
    border: 'border-purple-500/30',
  },
  {
    icon: BookOpen,
    title: 'AI builds your roadmap',
    description: 'LearnPath creates a tailored path of lessons, projects, and checkpoints in seconds.',
    color: 'text-cyan-400',
    bg: 'from-cyan-500/20 to-sky-500/20',
    border: 'border-cyan-500/30',
  },
  {
    icon: TrendingUp,
    title: 'Learn and track progress',
    description: 'Stay motivated with AI feedback, structured sessions, and visible real progress.',
    color: 'text-emerald-400',
    bg: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/30',
  },
];

const previewPanels = [
  {
    title: 'Dashboard',
    detail: 'Live milestones and priority next actions',
    accent: 'from-purple-500/30 to-violet-500/20',
    dot: 'bg-purple-400',
    bars: [
      { w: 'w-full', c: 'bg-white/10' },
      { w: 'w-4/5', c: 'bg-white/10' },
      { w: 'w-3/5', c: 'bg-purple-500/40' },
    ],
  },
  {
    title: 'Roadmap',
    detail: 'Milestones, lessons, and next steps',
    accent: 'from-cyan-500/30 to-sky-500/20',
    dot: 'bg-cyan-400',
    bars: [
      { w: 'w-full', c: 'bg-white/10' },
      { w: 'w-3/4', c: 'bg-cyan-500/40' },
      { w: 'w-2/3', c: 'bg-white/10' },
    ],
  },
  {
    title: 'Learning Page',
    detail: 'Focused lesson experience with AI support',
    accent: 'from-emerald-500/30 to-teal-500/20',
    dot: 'bg-emerald-400',
    bars: [
      { w: 'w-full', c: 'bg-emerald-500/40' },
      { w: 'w-4/5', c: 'bg-white/10' },
      { w: 'w-1/2', c: 'bg-white/10' },
    ],
  },
  {
    title: 'Progress',
    detail: 'XP, velocity, and achievement summaries',
    accent: 'from-amber-500/30 to-orange-500/20',
    dot: 'bg-amber-400',
    bars: [
      { w: 'w-3/4', c: 'bg-amber-500/40' },
      { w: 'w-full', c: 'bg-white/10' },
      { w: 'w-4/5', c: 'bg-white/10' },
    ],
  },
  {
    title: 'AI Mentor',
    detail: 'Real-time guidance, quizzes, and coaching',
    accent: 'from-sky-500/30 to-blue-500/20',
    dot: 'bg-sky-400',
    bars: [
      { w: 'w-full', c: 'bg-white/10' },
      { w: 'w-2/3', c: 'bg-sky-500/40' },
      { w: 'w-3/4', c: 'bg-white/10' },
    ],
  },
  {
    title: 'Profile',
    detail: 'Daily habits and personal learning snapshot',
    accent: 'from-pink-500/30 to-rose-500/20',
    dot: 'bg-pink-400',
    bars: [
      { w: 'w-2/3', c: 'bg-white/10' },
      { w: 'w-full', c: 'bg-pink-500/40' },
      { w: 'w-3/4', c: 'bg-white/10' },
    ],
  },
];

const reasons = [
  { icon: Target, text: 'Personalized learning that adapts to your pace' },
  { icon: Layers, text: 'Structured roadmaps that reduce cognitive overload' },
  { icon: TrendingUp, text: 'Progress tracking that builds real momentum' },
  { icon: Brain, text: 'AI guidance that helps you act with confidence' },
  { icon: Award, text: 'Project-based learning for practical, lasting growth' },
  { icon: Sparkles, text: 'A modern UI designed for focus and deep clarity' },
];

const testimonials = [
  {
    name: 'Maya Chen',
    role: 'Product Designer',
    company: 'Figma',
    stars: 5,
    quote:
      'The experience feels premium and genuinely motivating. I finally have a clear learning path and the guidance I needed to stay consistent.',
  },
  {
    name: 'Daniel Ortiz',
    role: 'Frontend Developer',
    company: 'Vercel',
    stars: 5,
    quote:
      'LearnPath helps me stay on track without feeling overwhelmed. Every session feels intentional and moves me closer to my goals.',
  },
  {
    name: 'Aisha Brooks',
    role: 'Career Switcher',
    company: 'Self-taught',
    stars: 5,
    quote:
      'The AI roadmaps made it so much easier to approach full-stack development step by step. I went from lost to confident in weeks.',
  },
];

const faqItems: FAQItem[] = [
  {
    question: 'Is LearnPath AI free to start?',
    answer:
      'Yes. You can begin with a free experience, explore your first AI-generated roadmap, and start learning immediately. No credit card required.',
  },
  {
    question: 'Who is LearnPath AI built for?',
    answer:
      'It is designed for learners of all levels — career switchers, students, and working professionals who want a structured, AI-guided path to reach their goals faster.',
  },
  {
    question: 'Can I use it on mobile?',
    answer:
      'Absolutely. LearnPath AI is mobile-first and fully responsive, delivering a smooth experience across phones, tablets, and desktops.',
  },
  {
    question: 'How personalized are the roadmaps?',
    answer:
      'Very. The AI considers your goal, current skill level, available time per week, and learning style to generate a roadmap unique to you.',
  },
  {
    question: 'Does it replace a teacher or course?',
    answer:
      "It complements your existing resources. Think of LearnPath AI as your personal learning strategist — it structures your path, keeps you accountable, and provides AI-powered guidance when you're stuck.",
  },
];

const stats = [
  { value: 12000, suffix: '+', label: 'Roadmaps Generated', icon: Compass },
  { value: 85000, suffix: '+', label: 'Learning Hours', icon: Clock3 },
  { value: 180, suffix: '+', label: 'Skills Covered', icon: BookOpen },
  { value: 98, suffix: '%', label: 'Student Satisfaction', icon: Star },
];

// ─── Reusable sub-components ──────────────────────────────────────────────────

const FadeInSection: React.FC<{
  children: React.ReactNode;
  delay?: number;
  className?: string;
}> = ({ children, delay = 0, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const SectionHeading: React.FC<{
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  center?: boolean;
}> = ({ id, eyebrow, title, description, center = false }) => (
  <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-purple-200">
      <Sparkles className="h-3 w-3" />
      {eyebrow}
    </span>
    <h2
      id={id}
      className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl"
    >
      {title}
    </h2>
    <p className="mt-3 max-w-xl text-base leading-8 text-zinc-200">{description}</p>
  </div>
);

// ─── Lightweight canvas particle field ───────────────────────────────────────

const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const dots = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.4 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a: Math.random() * 0.45 + 0.2,
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0) d.x = canvas.width;
        if (d.x > canvas.width) d.x = 0;
        if (d.y < 0) d.y = canvas.height;
        if (d.y > canvas.height) d.y = 0;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168,85,247,${d.a * 0.6})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
};

// ─── Animated stat counter (triggers once on scroll-into-view) ────────────────

const useAnimatedCount = (target: number, isVisible: boolean) => {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!isVisible || started.current) return;
    started.current = true;
    const duration = 1400;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isVisible, target]);
  return count;
};

const StatCard: React.FC<{ stat: (typeof stats)[0]; index: number }> = ({ stat, index }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const count = useAnimatedCount(stat.value, isInView);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.08, duration: 0.5, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-sm transition-all hover:border-purple-500/30 hover:bg-white/[0.08]"
    >
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-purple-500/10 blur-2xl transition-all group-hover:bg-purple-500/20" />
      <stat.icon className="mb-3 h-6 w-6 text-purple-400" />
      <p className="text-3xl font-bold text-white">
        {count.toLocaleString()}
        {stat.suffix}
      </p>
      <p className="mt-1 text-sm text-zinc-100">{stat.label}</p>
    </motion.div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const LandingPage: React.FC<LandingPageProps> = ({
  onGetStarted,
  onSignIn,
  onTerms,
  onPrivacy,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const previewRef = useRef<HTMLElement | null>(null);

  const scrollToPreview = useCallback(() => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#050816] via-[#050816] to-[#090d1f] text-white">
      {/* ── Ambient background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-[36rem] w-[36rem] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -right-20 top-24 h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[24rem] w-[40rem] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[100px]" />
        <div className="landing-grid-overlay" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ══════════ NAV ══════════ */}
        <header className="flex items-center justify-between py-5 sm:py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-cyan-400 shadow-[0_0_28px_rgba(168,85,247,0.4)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-display text-[1.05rem] font-bold leading-none tracking-tight">
                LearnPath{' '}
                <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  AI
                </span>
              </p>
              <p className="mt-0.5 text-[10px] leading-none text-zinc-100">Premium learning studio</p>
            </div>
          </div>

          {/* Desktop nav pill */}
          <nav
            className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 md:flex"
            aria-label="Main navigation"
          >
            <button
              type="button"
              onClick={scrollToPreview}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-100 transition-colors hover:text-white"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onGetStarted}
              className="rounded-full px-4 py-1.5 text-sm text-zinc-100 transition-colors hover:text-white"
            >
              Features
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="ml-1 rounded-full bg-white/8 px-5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/12"
            >
              Sign In
            </button>
          </nav>

          {/* Mobile CTA */}
          <button
            type="button"
            onClick={onGetStarted}
            className="flex w-full max-w-[220px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(168,85,247,0.35)] transition duration-300 hover:shadow-[0_8px_30px_rgba(168,85,247,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:hidden"
          >
            Start Free
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* ══════════ HERO ══════════ */}
        <section className="relative pb-4 pt-8 sm:pt-12 lg:pt-16" aria-labelledby="hero-heading">
          <ParticleCanvas />

          <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Copy */}
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 mx-auto max-w-2xl lg:mx-0"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3.5 py-1.5 text-sm font-medium text-white/85">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400" />
                Now with GPT-powered mentoring
              </div>

              <h1
                id="hero-heading"
                className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]"
              >
                Learn faster with a clear
                <span className="ml-2 bg-gradient-to-r from-purple-400 to-cyan-300 bg-clip-text text-transparent">
                  AI learning runway
                </span>
                .
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85 sm:text-xl">
                Plan, practice, and progress with AI-powered roadmaps built to keep every session focused, motivating, and measurable.
              </p>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {['AI Personalized', 'Project Based', 'Progress Tracking', 'Free to Start'].map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/90"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400" />
                    {badge}
                  </span>
                ))}
              </div>

              <ul className="mt-6 space-y-3" aria-label="Key benefits">

                {[
                  'AI-generated roadmap in seconds',
                  'Personalized to your pace & goals',
                  'Real-time mentor and progress tracking',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-zinc-100">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onGetStarted}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-cyan-500 px-6 py-3.5 text-base font-semibold text-white shadow-[0_18px_70px_rgba(124,58,237,0.24)] transition duration-300 hover:shadow-[0_22px_90px_rgba(124,58,237,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
                  aria-label="Start learning for free"
                >
                  Start Learning Free
                  <ArrowRight className="h-4 w-4" />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={scrollToPreview}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-6 py-3.5 text-base font-semibold text-white/90 backdrop-blur-sm transition duration-300 hover:border-white/25 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
                  aria-label="See product preview"
                >
                  <Play className="h-4 w-4 text-purple-400" />
                  See Preview
                </motion.button>
              </div>

              <p className="mt-4 text-xs text-zinc-100">No credit card required · Free to explore</p>
            </motion.div>

            {/* Dashboard mockup */}
            <motion.div
              initial={{ opacity: 0, x: 28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
              className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_40px_120px_rgba(6,11,38,0.55)] backdrop-blur-2xl sm:p-5 animate-float-soft"
            >
              <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-br from-purple-500/20 via-cyan-500/10 to-transparent blur-3xl" />
              <div className="relative grid gap-4">
                <div className="rounded-[26px] border border-white/[0.08] bg-[#0d1425] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-400">AI Roadmap</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Your next study sprint</h3>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      Live
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
                    <div className="flex flex-col gap-4 rounded-[22px] bg-[#0b1324] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-white">Continue learning</span>
                        <span className="text-xs uppercase tracking-[0.25em] text-emerald-300">Today</span>
                      </div>
                      <p className="text-sm leading-6 text-zinc-400">
                        Pick up where you left off and finish the guided project roadmap.
                      </p>
                      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-white/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-400 p-3 text-white shadow-[0_10px_30px_rgba(124,58,237,0.16)]">
                            <BookOpen className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">Project planning</p>
                            <p className="text-xs text-zinc-400">3 steps left</p>
                          </div>
                        </div>
                        <div className="rounded-full bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300">
                          In progress
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-[22px] border border-white/[0.08] bg-[#0c152b] p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.28em] text-zinc-400">Progress Ring</span>
                          <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/80">86%</span>
                        </div>
                        <div className="mt-4 flex justify-center">
                          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.05]">
                            <div className="absolute inset-0 rounded-full border-[6px] border-white/[0.06]" />
                            <div className="absolute inset-0 rounded-full border-[6px] border-amber-400 border-t-transparent border-r-transparent border-b-transparent border-l-transparent animate-spin-slow" />
                            <div className="relative text-center">
                              <p className="text-2xl font-semibold text-white">86%</p>
                              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-400">weekly</p>
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-zinc-400">XP progress and streak momentum for the week.</p>
                      </div>
                      <div className="rounded-[22px] border border-white/[0.08] bg-[#0c152b] p-4">
                        <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-400">AI Mentor</p>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl bg-white/[0.03] p-3 text-sm leading-6 text-white/90">
                            “I recommend the next practice session be a hands-on project review with guided feedback.”
                          </div>
                          <div className="rounded-2xl bg-white/[0.04] p-3 text-sm leading-6 text-zinc-300">
                            You: “Show me the best next task for my goal.”
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Scroll chevron */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="mt-12 flex justify-center"
            aria-hidden="true"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            >
              <ChevronDown className="h-5 w-5 text-zinc-100" />
            </motion.div>
          </motion.div>
        </section>

        {/* ══════════ FEATURES ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="features-heading">
          <FadeInSection>
            <SectionHeading
              id="features-heading"
              eyebrow="Trusted features"
              title="Everything you need to learn with clarity and momentum"
              description="A premium experience designed to keep your study flow structured, motivating, and deeply personalized."
            />
          </FadeInSection>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature, index) => (
              <FadeInSection key={feature.title} delay={0.06 * index}>
                <motion.div
                  whileHover={{ y: -5, scale: 1.01 }}
                  transition={{ duration: 0.22 }}
                  className="group overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 p-[1px] transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex h-full flex-col rounded-[26px] bg-[#0d1425] p-6 shadow-[0_12px_35px_rgba(0,0,0,0.18)]">
                    <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100" style={{ background: feature.glow }} aria-hidden="true" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-tr ${feature.gradient} shadow-[0_16px_30px_rgba(0,0,0,0.18)]`}
                      >
                        <feature.icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80">
                        {feature.badge}
                      </span>
                    </div>
                    <div className="relative mt-5 flex-1">
                      <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-zinc-200">{feature.description}</p>
                    </div>
                    <div className="mt-6 flex items-center justify-between gap-3">
                      <span className="h-2 w-16 rounded-full bg-gradient-to-r from-purple-400 to-cyan-400 opacity-90" aria-hidden="true" />
                      <span className="text-xs uppercase tracking-[0.24em] text-zinc-400">More details</span>
                    </div>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════ HOW IT WORKS ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="how-heading">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] px-6 py-10 backdrop-blur-sm sm:px-10 sm:py-14">
            <FadeInSection>
              <SectionHeading
                id="how-heading"
                eyebrow="How it works"
                title="Three simple steps to turn goals into real progress"
                description="A focused path that removes friction and keeps momentum visible from day one."
                center
              />
            </FadeInSection>

            <div className="relative mt-12 grid gap-6 md:grid-cols-3">
              <div
                className="pointer-events-none absolute inset-x-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent md:block"
                aria-hidden="true"
              />
              {steps.map((step, index) => (
                <FadeInSection key={step.title} delay={0.1 + index * 0.1}>
                  <div className="relative flex flex-col items-center text-center">
                    <div
                      className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-[24px] border ${step.border} bg-gradient-to-br ${step.bg} backdrop-blur-sm`}
                    >
                      <step.icon className={`h-8 w-8 ${step.color}`} />
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#0d1425] text-[10px] font-bold text-zinc-100">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-100">{step.description}</p>
                  </div>
                </FadeInSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ PRODUCT PREVIEW ══════════ */}
        <section ref={previewRef} className="py-16 sm:py-20" aria-labelledby="preview-heading">
          <FadeInSection>
            <SectionHeading
              id="preview-heading"
              eyebrow="Product preview"
              title="A refined experience from first lesson to lasting habit"
              description="Every surface is designed to feel calm, visual, and focused — so learning stays enjoyable."
            />
          </FadeInSection>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {previewPanels.map((panel, index) => (
              <FadeInSection key={panel.title} delay={0.06 * index}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="group overflow-hidden rounded-3xl border border-white/10 bg-[#0d1425] p-4 transition-colors hover:border-white/20"
                >
                  <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#080e1e]">
                    <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2.5">
                      <span className={`h-2 w-2 rounded-full ${panel.dot}`} />
                      <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                      <span className="ml-2 truncate text-[10px] text-zinc-100">
                        {panel.title.toLowerCase().replace(' ', '-')}.view
                      </span>
                    </div>
                    <div className={`bg-gradient-to-br ${panel.accent} p-4`}>
                      <div className="space-y-2">
                        {panel.bars.map((bar, i) => (
                          <div key={i} className={`h-2.5 ${bar.w} rounded-full ${bar.c}`} />
                        ))}
                        <div
                          className={`mt-3 h-14 rounded-[14px] border border-white/10 bg-gradient-to-r ${panel.accent}`}
                        />
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div className="h-8 rounded-[10px] bg-white/5" />
                          <div className="h-8 rounded-[10px] bg-white/5" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <h3 className="mt-4 font-bold text-white">{panel.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-100">{panel.detail}</p>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════ WHY LEARNPATH ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="why-heading">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <FadeInSection>
              <SectionHeading
                id="why-heading"
                eyebrow="Why LearnPath AI"
                title="A thoughtful learning experience built for real progress"
                description="Designed to make each session feel clear, structured, and motivating from the very start."
              />
              <motion.button
                type="button"
                whileHover={{ scale: 1.025, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={onGetStarted}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-cyan-500 px-6 py-3 font-semibold text-white shadow-[0_12px_36px_rgba(106,61,255,0.35)]"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            </FadeInSection>

            <div className="grid gap-3 sm:grid-cols-2">
              {reasons.map((reason, index) => (
                <FadeInSection key={reason.text} delay={0.05 * index}>
                  <div className="group rounded-2xl border border-white/10 bg-[#0d1425] p-4 transition-all hover:border-purple-500/30 hover:bg-[#0f1630]">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/25 to-cyan-500/15 text-purple-300 ring-1 ring-purple-500/20">
                      <reason.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-6 text-zinc-100">{reason.text}</p>
                  </div>
                </FadeInSection>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ STATISTICS ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="stats-heading">
          <div className="overflow-hidden rounded-[36px] border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-[#050816] to-cyan-500/10 px-6 py-12 sm:px-10 sm:py-16">
            <FadeInSection>
              <SectionHeading
                id="stats-heading"
                eyebrow="Performance at a glance"
                title="Trusted by learners who want clarity and consistency"
                description="These numbers reflect the kind of momentum LearnPath AI is designed to create every day."
                center
              />
            </FadeInSection>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat, index) => (
                <StatCard key={stat.label} stat={stat} index={index} />
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ TESTIMONIALS ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="testimonials-heading">
          <FadeInSection>
            <SectionHeading
              id="testimonials-heading"
              eyebrow="Testimonials"
              title="Learners love the calm, guided experience"
              description="These stories reflect the emotional and practical value of a well-designed learning plan."
            />
          </FadeInSection>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {testimonials.map((t, index) => (
              <FadeInSection key={t.name} delay={0.08 * index}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0d1425] p-6 transition-colors hover:border-purple-500/25"
                >
                  <div className="flex gap-1" aria-label={`${t.stars} out of 5 stars`}>
                    {Array.from({ length: t.stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="flex-1 text-sm leading-7 text-zinc-100">"{t.quote}"</p>
                  <div className="flex items-center gap-3 border-t border-white/[0.07] pt-4">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 text-sm font-bold text-white"
                      aria-hidden="true"
                    >
                      {t.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-zinc-100">
                        {t.role} · {t.company}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </section>

        {/* ══════════ FAQ ══════════ */}
        <section className="py-16 sm:py-20" aria-labelledby="faq-heading">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <FadeInSection>
              <SectionHeading
                id="faq-heading"
                eyebrow="FAQ"
                title="Clear answers for the curious learner"
                description="Everything you need to know before getting started with LearnPath AI."
              />
            </FadeInSection>

            <FadeInSection delay={0.1}>
              <div className="space-y-2.5" role="list">
                {faqItems.map((item, index) => {
                  const isOpen = openFaq === index;
                  return (
                    <div
                      key={item.question}
                      role="listitem"
                      className={`overflow-hidden rounded-2xl border transition-colors ${
                        isOpen
                          ? 'border-purple-500/35 bg-[#0f1630]'
                          : 'border-white/10 bg-[#0d1425] hover:border-white/20'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(index)}
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${index}`}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                      >
                        <span className="text-sm font-semibold text-white sm:text-base">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-zinc-100 transition-transform duration-300 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
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
                            transition={{ duration: 0.28, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <p className="px-5 pb-4 text-sm leading-7 text-zinc-100">
                              {item.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </FadeInSection>
          </div>
        </section>

        {/* ══════════ FINAL CTA ══════════ */}
        <section className="pb-20 pt-6" aria-labelledby="cta-heading">
          <FadeInSection>
            <div className="relative overflow-hidden rounded-[36px] border border-purple-500/25 bg-gradient-to-br from-purple-900/40 via-[#080e20] to-cyan-900/20 px-8 py-16 text-center sm:px-12 sm:py-20">
              <div
                className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-purple-500/20 blur-3xl"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-cyan-500/15 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/25 bg-purple-500/15 px-3.5 py-1.5 text-sm font-medium text-purple-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Ready to begin?
                </span>
                <h2
                  id="cta-heading"
                  className="mx-auto mt-5 max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl"
                >
                  Build your best learning routine starting today
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-100">
                  Start with a free AI roadmap, get mentor-guided lessons, and turn your next skill into real, lasting momentum.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.025, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onGetStarted}
                    className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 via-violet-500 to-cyan-500 px-8 py-4 text-base font-semibold text-white shadow-[0_16px_48px_rgba(106,61,255,0.45)] transition-shadow hover:shadow-[0_20px_60px_rgba(106,61,255,0.55)] sm:w-auto"
                  >
                    Start Learning Free
                    <ArrowRight className="h-4 w-4" />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.025, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onSignIn}
                    className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.07] px-8 py-4 text-base font-semibold text-zinc-100 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/[0.12] sm:w-auto"
                  >
                    Sign In
                  </motion.button>
                </div>
                <p className="mt-4 text-xs text-zinc-100">No credit card required · Cancel anytime</p>
              </div>
            </div>
          </FadeInSection>
        </section>

        {/* ══════════ FOOTER ══════════ */}
        <footer
          className="border-t border-white/[0.07] py-12 sm:py-14"
          aria-labelledby="footer-heading"
        >
          <h2 id="footer-heading" className="sr-only">
            Footer
          </h2>
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-violet-500 to-cyan-400">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <p className="font-display text-base font-bold text-white">
                  LearnPath{' '}
                  <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    AI
                  </span>
                </p>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-100">
                A modern platform for turning goals into structured progress with the guidance of AI.
              </p>
              <div className="mt-5 flex gap-2.5">
                {[
                  { icon: Twitter, label: 'Twitter', href: 'https://x.com' },
                  { icon: Github, label: 'GitHub', href: 'https://github.com' },
                  { icon: Linkedin, label: 'LinkedIn', href: 'https://linkedin.com' },
                ].map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-100 transition-all hover:border-white/25 hover:text-white"
                  >
                    <social.icon className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            </div>

            {/* Navigate */}
            <nav aria-label="Footer navigation">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-100">
                Navigate
              </p>
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
                      className="text-sm text-zinc-100 transition-colors hover:text-white"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Legal */}
            <nav aria-label="Legal navigation">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-100">Legal</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={onTerms}
                    className="text-sm text-zinc-100 transition-colors hover:text-white"
                  >
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onPrivacy}
                    className="text-sm text-zinc-100 transition-colors hover:text-white"
                  >
                    Privacy Policy
                  </button>
                </li>
              </ul>
            </nav>

            {/* Contact */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-100">Contact</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="mailto:hello@learnpath.ai"
                    className="flex items-center gap-1.5 text-sm text-zinc-100 transition-colors hover:text-white"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    hello@learnpath.ai
                  </a>
                </li>
                <li>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-zinc-100">
                    <Users className="h-3.5 w-3.5" />
                    12,000+ active learners
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
            <p className="text-xs text-zinc-100">
              © {new Date().getFullYear()} LearnPath AI. All rights reserved.
            </p>
            <p className="text-xs text-zinc-400">Built for learners who take growth seriously.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
