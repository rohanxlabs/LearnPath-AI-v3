// @vitest-environment jsdom
// Tests for ProjectsTab fallback indicator.

import React from 'react';
import './setup';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_t, prop) => ({ children, layout: _l, initial: _i, animate: _a, exit: _e, transition: _tr, ...rest }: any) =>
      React.createElement(String(prop), rest, children),
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return new Proxy(actual as any, {
    get: (target, name: string) => name in target
      ? () => <span data-testid={`icon-${name}`} />
      : target[name as keyof typeof target],
  });
});

// Stub child components — paths relative to src/components/ (one level up from __tests__).
vi.mock('../ProjectCard', () => ({
  default: ({ project }: any) => <div data-testid="project-card">{project.title}</div>,
}));
vi.mock('../ProjectFilters', () => ({
  default: () => <div data-testid="project-filters" />,
}));
vi.mock('../Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
  LoadingSpinner: () => <div data-testid="spinner" />,
}));
vi.mock('../EmptyState', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

// No pre-seeded projects — forces the component to call /api/generate-projects.
const ROADMAP_STUB: any = {
  id: 'r1',
  goal: 'Learn Python',
  phases: [{ id: 'ph1', name: 'Phase 1', skillsCovered: [] }],
  projects: [],
};

describe('ProjectsTab fallback indicator', () => {
  it('shows fallback notice when AI generation fails and seed data is used', async () => {
    // fetch rejects → component sets isUsingFallback = true.
    global.fetch = vi.fn().mockRejectedValue(new Error('API unavailable')) as any;
    const { ProjectsTab } = await import('../ProjectsTab');

    render(<ProjectsTab roadmap={ROADMAP_STUB} onAddXp={vi.fn()} onRoadmapUpdated={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Showing general project suggestions/i)).toBeInTheDocument();
    });
  });

  it('does not show fallback notice when AI generation succeeds', async () => {
    // fetch succeeds with AI projects → isUsingFallback stays false.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: 'ai-proj-1', title: 'AI Project', difficulty: 'intermediate', description: 'AI-generated', progress: 0 },
        ],
      }),
    }) as any;
    const { ProjectsTab } = await import('../ProjectsTab');

    render(<ProjectsTab roadmap={ROADMAP_STUB} onAddXp={vi.fn()} onRoadmapUpdated={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Showing general project suggestions/i)).not.toBeInTheDocument();
    });
  });
});
