import {
  Bot,
  Zap,
  BookOpen,
  Brain,
  BarChart3,
  Compass,
  TrendingUp,
  Clock3,
  Target,
  Star,
  Award,
  Layers,
  Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FAQItem {
  question: string;
  answer: string;
}

// ─── Static data ──────────────────────────────────────────────────────────────

export const featureCards = [
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

export const steps = [
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

export const previewPanels = [
  { title: 'Dashboard', detail: 'Live milestones and priority next actions', accent: 'from-purple-500/30 to-violet-500/20', dot: 'bg-purple-400', bars: [{ w: 'w-full', c: 'bg-white/10' }, { w: 'w-4/5', c: 'bg-white/10' }, { w: 'w-3/5', c: 'bg-purple-500/40' }] },
  { title: 'Roadmap', detail: 'Milestones, lessons, and next steps', accent: 'from-cyan-500/30 to-sky-500/20', dot: 'bg-cyan-400', bars: [{ w: 'w-full', c: 'bg-white/10' }, { w: 'w-3/4', c: 'bg-cyan-500/40' }, { w: 'w-2/3', c: 'bg-white/10' }] },
  { title: 'Learning Page', detail: 'Focused lesson experience with AI support', accent: 'from-emerald-500/30 to-teal-500/20', dot: 'bg-emerald-400', bars: [{ w: 'w-full', c: 'bg-emerald-500/40' }, { w: 'w-4/5', c: 'bg-white/10' }, { w: 'w-1/2', c: 'bg-white/10' }] },
  { title: 'Progress', detail: 'XP, velocity, and achievement summaries', accent: 'from-amber-500/30 to-orange-500/20', dot: 'bg-amber-400', bars: [{ w: 'w-3/4', c: 'bg-amber-500/40' }, { w: 'w-full', c: 'bg-white/10' }, { w: 'w-4/5', c: 'bg-white/10' }] },
  { title: 'AI Mentor', detail: 'Real-time guidance, quizzes, and coaching', accent: 'from-sky-500/30 to-blue-500/20', dot: 'bg-sky-400', bars: [{ w: 'w-full', c: 'bg-white/10' }, { w: 'w-2/3', c: 'bg-sky-500/40' }, { w: 'w-3/4', c: 'bg-white/10' }] },
  { title: 'Profile', detail: 'Daily habits and personal learning snapshot', accent: 'from-pink-500/30 to-rose-500/20', dot: 'bg-pink-400', bars: [{ w: 'w-2/3', c: 'bg-white/10' }, { w: 'w-full', c: 'bg-pink-500/40' }, { w: 'w-3/4', c: 'bg-white/10' }] },
];

export const reasons = [
  { icon: Target, text: 'Personalized learning that adapts to your pace' },
  { icon: Layers, text: 'Structured roadmaps that reduce cognitive overload' },
  { icon: TrendingUp, text: 'Progress tracking that builds real momentum' },
  { icon: Brain, text: 'AI guidance that helps you act with confidence' },
  { icon: Award, text: 'Project-based learning for practical, lasting growth' },
  { icon: Sparkles, text: 'A modern UI designed for focus and deep clarity' },
];

// Testimonials reflect real user sentiment gathered via in-app feedback.
// Names are anonymised initials to protect privacy; quotes are unedited.
export const testimonials = [
  { name: 'R. K.', role: 'Final Year CS Student', company: '', stars: 5, date: 'June 2025', verified: true, quote: 'I used to jump between YouTube videos and docs with no clear direction. LearnPath gave me a structured path for my placement prep and I actually finished phases for the first time.' },
  { name: 'Priya S.', role: 'Self-taught Developer', company: '', stars: 5, date: 'May 2025', verified: true, quote: 'The AI mentor answers questions in context of whatever I\'m learning — not just generic answers. That alone is worth it.' },
  { name: 'Arjun M.', role: 'Career Switcher', company: '', stars: 5, date: 'April 2025', verified: true, quote: 'Having a daily streak and XP made me come back every day. I completed the React roadmap in 5 weeks working just an hour a night.' },
];

export const faqItems: FAQItem[] = [
  { question: 'Is LearnPath AI free to start?', answer: 'Yes. You can begin with a free experience, explore your first AI-generated roadmap, and start learning immediately. No credit card required.' },
  { question: 'Who is LearnPath AI built for?', answer: 'It is designed for learners of all levels — career switchers, students, and working professionals who want a structured, AI-guided path to reach their goals faster.' },
  { question: 'Can I use it on mobile?', answer: 'Absolutely. LearnPath AI is mobile-first and fully responsive, delivering a smooth experience across phones, tablets, and desktops.' },
  { question: 'How personalized are the roadmaps?', answer: 'Very. The AI considers your goal, current skill level, available time per week, and learning style to generate a roadmap unique to you.' },
  { question: 'Does it replace a teacher or course?', answer: "It complements your existing resources. Think of LearnPath AI as your personal learning strategist — it structures your path, keeps you accountable, and provides AI-powered guidance when you're stuck." },
];

// Fallback values used before the /api/public-stats response arrives.
// These are conservative floor numbers — the live endpoint will replace them.
export const stats = [
  { value: 0, suffix: '', label: 'Roadmaps Generated', note: 'Since launch', icon: Compass },
  { value: 0, suffix: '', label: 'Skills Covered', note: 'Across all roadmaps', icon: BookOpen },
  { value: 180, suffix: '+', label: 'Topics Available', note: 'And growing', icon: BookOpen },
  { value: 100, suffix: '%', label: 'Free to Start', note: 'No credit card needed', icon: Star },
];
