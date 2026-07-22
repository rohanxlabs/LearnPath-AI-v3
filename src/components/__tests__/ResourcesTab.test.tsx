// @vitest-environment jsdom
// Tests for ResourcesTab fallback indicator.
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

// Stub internal subcomponents not relevant to this test.
vi.mock('./Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
  LoadingSpinner: () => <div data-testid="spinner" />,
}));
vi.mock('./EmptyState', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

// Stub recommendations library so it returns a predictable result.
vi.mock('../../lib/recommendations', () => ({
  getRecommendationsForRoadmap: () => [
    { id: 'rec-1', title: 'Fallback Resource', type: 'article', provider: 'Test', url: 'https://example.com', description: 'A fallback', duration: '5 min' },
  ],
}));

// Stub user-resource-states API.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ completedIds: [], savedIds: [] }),
  });
});

// Roadmap with NO pre-seeded resources — forces getRecommendationsForRoadmap fallback.
const ROADMAP_NO_RESOURCES: any = {
  id: 'r1',
  goal: 'Learn Python',
  resources: [],
  phases: [],
};

// Roadmap WITH resources — should not trigger fallback.
const ROADMAP_WITH_RESOURCES: any = {
  id: 'r2',
  goal: 'Learn JavaScript',
  resources: [
    { id: 'res-1', title: 'JS Resource', type: 'video', provider: 'MDN', url: 'https://mdn.io', description: 'MDN docs', duration: '10 min' },
  ],
  phases: [],
};

describe('ResourcesTab fallback indicator', () => {
  it('shows fallback notice when no roadmap resources and general recommendations are used', async () => {
    const { ResourcesTab } = await import('../ResourcesTab');

    render(<ResourcesTab roadmap={ROADMAP_NO_RESOURCES} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Showing general resource suggestions/i)
      ).toBeInTheDocument();
    });
  });

  it('does not show fallback notice when roadmap has its own resources', async () => {
    const { ResourcesTab } = await import('../ResourcesTab');

    render(<ResourcesTab roadmap={ROADMAP_WITH_RESOURCES} />);

    // Wait for loading to complete — no fallback message should appear.
    await waitFor(() => {
      expect(
        screen.queryByText(/Showing general resource suggestions/i)
      ).not.toBeInTheDocument();
    });
  });
});
