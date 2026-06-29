/**
 * LearnPath AI Design System - Phase 3.1
 * Consistent spacing, typography, and design tokens
 */

// Spacing Scale (in rem)
export const spacing = {
  xs: '0.25rem',    // 4px
  sm: '0.5rem',     // 8px
  md: '0.75rem',    // 12px
  lg: '1rem',       // 16px
  xl: '1.25rem',    // 20px
  xl2: '1.5rem',    // 24px
  xl3: '2rem',      // 32px
  xl4: '2.5rem',    // 40px
  xl5: '3rem',      // 48px
  xl6: '4rem',      // 64px
} as const;

// Typography Scale
export const fontSize = {
  xs: '0.75rem',    // 12px - captions, labels
  sm: '0.875rem',   // 14px - body secondary, small text
  base: '1rem',     // 16px - body default
  lg: '1.125rem',  // 18px - small headings
  xl: '1.25rem',   // 20px - section headings
  xl2: '1.5rem',   // 24px - card titles
  xl3: '1.875rem', // 30px - main headings
  xl4: '2.25rem',  // 36px - page titles
  xl5: '3rem',     // 48px - hero titles
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const lineHeight = {
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

// Border Radius
export const borderRadius = {
  sm: '0.375rem',   // 6px - small elements
  md: '0.5rem',     // 8px - inputs, small cards
  lg: '0.75rem',    // 12px - buttons, cards
  xl: '1rem',       // 16px - larger cards
  xl2: '1.25rem',   // 20px - main containers
  xl3: '1.5rem',    // 24px - hero sections
  full: '9999px',   // pills, badges
} as const;

// Colors
export const colors = {
  primary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
  },
  secondary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
} as const;

// Glass card variants
export const glassCardStyles = {
  base: 'bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-white/10',
  purple: 'glass-card glass-card-purple',
  blue: 'glass-card glass-card-blue',
  orange: 'glass-card glass-card-orange',
  teal: 'glass-card glass-card-teal',
  emerald: 'glass-card glass-card-emerald',
  rose: 'glass-card glass-card-rose',
} as const;

// Button variants
export const buttonStyles = {
  primary: 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold transition-all duration-200',
  secondary: 'bg-white/10 hover:bg-white/20 text-zinc-200 dark:text-zinc-300 border border-white/10 transition-all duration-200',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all duration-200',
  warning: 'bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all duration-200',
  ghost: 'hover:bg-white/5 text-zinc-400 hover:text-white transition-all duration-200',
} as const;

// Common layout classes
export const layout = {
  container: 'max-w-4xl mx-auto px-4 sm:px-6',
  section: 'space-y-6',
  card: 'p-5 sm:p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-sm',
  header: 'flex flex-col sm:flex-row sm:items-center justify-between gap-4',
} as const;

// Typography classes
export const typography = {
  h1: 'text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white',
  h2: 'text-xl font-semibold text-gray-800 dark:text-zinc-100',
  h3: 'text-lg font-semibold text-gray-800 dark:text-zinc-100',
  h4: 'text-base font-semibold text-gray-700 dark:text-zinc-200',
  body: 'text-sm text-gray-600 dark:text-zinc-400',
  caption: 'text-xs text-gray-500 dark:text-zinc-500',
  label: 'text-xs font-medium text-gray-700 dark:text-zinc-300 uppercase tracking-wider',
} as const;

// Helper to combine classes conditionally
export const cx = (...classes: (string | undefined | false)[]) => 
  classes.filter(Boolean).join(' ');

// Theme class builder for glass cards
export const glassCardClass = (variant: keyof typeof glassCardStyles = 'base') => 
  glassCardStyles[variant] || glassCardStyles.base;