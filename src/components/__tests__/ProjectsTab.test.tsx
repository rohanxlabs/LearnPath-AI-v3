// @vitest-environment jsdom
// Tests for ProjectsTab fallback indicator.
// Environment: jsdom (set via vitest.config.ts environmentMatchGlobs).

import React from 'react';
import './setup';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  const handler = { get: (_: any, name: string) => () => <span data-testid={`icon-${name}`} /> };
  return new Proxy(actual, handler);
});

// Stub child components that aren't relevant to this test.
vi.mock('../ProjectCard', () => ({
  default: ({ project }: any) => <div data-testid="project-card">{project.title}</div>,
}));
vi.mock('../ProjectFilters', () => ({
  default: () => <div data-testid="project-filters" />,
}));
vi.mock('./Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
  LoadingSpinner: () => <div data-testid="spinner" />,
}));
vi.mock('./EmptyState', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

const ROADMAP_STUB: any = {
  id: 'r1',
  goal: 'Learn Python',
  phases: [{ id: 'ph1', name: 'Phase 1', skillsCovered: [] }],
  projects: [
    { id: 'proj-1', title: 'Seed Project A', difficulty: 'beginner', description: 'A seed project', progress: 0 },
  ],
};

describe('ProjectsTab fallback indicator', () => {
  beforeEach(() => {
    // Make /api/generate-projects fail — triggering the seed fallback path.
    global.fetch = vi.fn().mockRejectedValue(new Error('API unavailable'));
  });

  it('shows fallback notice when AI generation fails and seed data is used', async () => {
    const { ProjectsTab } = await import('../ProjectsTab');

    render(
      <ProjectsTab roadmap={ROADMAP_STUB} onAddXp={vi.fn()} onRoadmapUpdated={vi.fn()} />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Showing general project suggestions/i)
      ).toBeInTheDocument();
    });
  });

  it('does not show fallback notice when AI generation succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: 'ai-proj-1', title: 'AI Project', difficulty: 'intermediate', description: 'AI-generated', progress: 0 },
        ],
      }),
    });

    const { ProjectsTab } = await import('../ProjectsTab');

    render(
      <ProjectsTab roadmap={ROADMAP_STUB} onAddXp={vi.fn()} onRoadmapUpdated={vi.fn()} />
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/Showing general project suggestions/i)
      ).not.toBeInTheDocument();
    });
  });
});
