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
    color: 'text-purple-600',
    bg: 'from-purple-100 to-violet-100',
    border: 'border-purple-200',
  },
  {
    icon: BookOpen,
    title: 'AI builds your roadmap',
    description: 'LearnPath creates a tailored path of lessons, projects, and checkpoints in seconds.',
    color: 'text-cyan-600',
    bg: 'from-cyan-50 to-sky-100',
    border: 'border-cyan-200',
  },
  {
    icon: TrendingUp,
    title: 'Learn and track progress',
    description: 'Stay motivated with AI feedback, structured sessions, and visible real progress.',
    color: 'text-emerald-600',
    bg: 'from-emerald-50 to-teal-100',
    border: 'border-emerald-200',
  },
];

export const previewPanels = [
  { title: 'Dashboard', detail: 'Live milestones and priority next actions', accent: 'from-purple-100 to-violet-100', dot: 'bg-purple-400', bars: [{ w: 'w-full', c: 'bg-purple-200/60' }, { w: 'w-4/5', c: 'bg-purple-100' }, { w: 'w-3/5', c: 'bg-purple-400/40' }] },
  { title: 'Roadmap', detail: 'Milestones, lessons, and next steps', accent: 'from-cyan-50 to-sky-100', dot: 'bg-cyan-500', bars: [{ w: 'w-full', c: 'bg-cyan-100' }, { w: 'w-3/4', c: 'bg-cyan-400/40' }, { w: 'w-2/3', c: 'bg-cyan-200/60' }] },
  { title: 'Learning Page', detail: 'Focused lesson experience with AI support', accent: 'from-emerald-50 to-teal-100', dot: 'bg-emerald-500', bars: [{ w: 'w-full', c: 'bg-emerald-400/40' }, { w: 'w-4/5', c: 'bg-emerald-100' }, { w: 'w-1/2', c: 'bg-emerald-200/60' }] },
  { title: 'Progress', detail: 'XP, velocity, and achievement summaries', accent: 'from-amber-50 to-orange-100', dot: 'bg-amber-400', bars: [{ w: 'w-3/4', c: 'bg-amber-400/40' }, { w: 'w-full', c: 'bg-amber-100' }, { w: 'w-4/5', c: 'bg-amber-200/60' }] },
  { title: 'AI Mentor', detail: 'Real-time guidance, quizzes, and coaching', accent: 'from-sky-50 to-blue-100', dot: 'bg-sky-500', bars: [{ w: 'w-full', c: 'bg-sky-100' }, { w: 'w-2/3', c: 'bg-sky-400/40' }, { w: 'w-3/4', c: 'bg-sky-200/60' }] },
  { title: 'Profile', detail: 'Daily habits and personal learning snapshot', accent: 'from-pink-50 to-rose-100', dot: 'bg-pink-400', bars: [{ w: 'w-2/3', c: 'bg-pink-200/60' }, { w: 'w-full', c: 'bg-pink-400/40' }, { w: 'w-3/4', c: 'bg-pink-100' }] },
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
  { name: 'R. K.', role: 'Final Year CS Student', company: '', stars: 5, date: 'June 2025', quote: 'I used to jump between YouTube videos and docs with no clear direction. LearnPath gave me a structured path for my placement prep and I actually finished phases for the first time.' },
  { name: 'Priya S.', role: 'Self-taught Developer', company: '', stars: 5, date: 'May 2025', quote: 'The AI mentor answers questions in context of whatever I\'m learning — not just generic answers. That alone is worth it.' },
  { name: 'Arjun M.', role: 'Career Switcher', company: '', stars: 5, date: 'April 2025', quote: 'Having a daily streak and XP made me come back every day. I completed the React roadmap in 5 weeks working just an hour a night.' },
];

export const faqItems: FAQItem[] = [
  { question: 'Is LearnPath AI free to start?', answer: 'Yes. You can begin with a free experience, explore your first AI-generated roadmap, and start learning immediately. No credit card required.' },
  { question: 'Who is LearnPath AI built for?', answer: 'It is designed for learners of all levels — career switchers, students, and working professionals who want a structured, AI-guided path to reach their goals faster.' },
  { question: 'Can I use it on mobile?', answer: 'Absolutely. LearnPath AI is mobile-first and fully responsive, delivering a smooth experience across phones, tablets, and desktops.' },
  { question: 'How personalized are the roadmaps?', answer: 'Very. The AI considers your goal, current skill level, available time per week, and learning style to generate a roadmap unique to you.' },
  { question: 'Does it replace a teacher or course?', answer: "It complements your existing resources. Think of LearnPath AI as your personal learning strategist — it structures your path, keeps you accountable, and provides AI-powered guidance when you're stuck." },
  { question: 'Is my data private?', answer: 'Yes. Your learning data, roadmaps, and progress are stored securely and are never shared or sold to third parties. You can delete your account and all associated data at any time from your profile settings.' },
  { question: 'Can I edit or change my roadmap after it is generated?', answer: 'Yes. You can regenerate your roadmap at any time or adjust individual phases to match changes in your goals, schedule, or skill level.' },
];

// Stats for the "At a glance" section.
// Slots 0 & 1 are dynamic — fetched from /api/public-stats at runtime.
// value: 0 is a sentinel meaning "hide this card once the live fetch settles".
// Slots 2 & 3 are static and always visible.
export const stats = [
  { value: 0, suffix: '', label: 'Roadmaps Generated', note: 'Since launch', icon: Compass },
  { value: 0, suffix: '', label: 'Skills Covered', note: 'Across all roadmaps', icon: BookOpen },
  { value: 180, suffix: '+', label: 'Topics Available', note: 'And growing', icon: BookOpen },
  { value: 100, suffix: '%', label: 'Free to Start', note: 'No credit card needed', icon: Star },
];
