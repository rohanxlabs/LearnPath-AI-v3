// @vitest-environment jsdom
// Tests for ResourcesTab fallback indicator.

import React from 'react';
import './setup';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Stub sub-components — paths relative to src/components/ (one level up from __tests__).
vi.mock('../Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton" />,
  LoadingSpinner: () => <div data-testid="spinner" />,
}));
vi.mock('../EmptyState', () => ({
  EmptyState: ({ title }: any) => <div data-testid="empty-state">{title}</div>,
}));

// Stub recommendations — path relative to src/lib/ (two levels up from __tests__, then lib/).
vi.mock('../lib/recommendations', () => ({
  getRecommendationsForRoadmap: () => [
    { id: 'rec-1', title: 'Fallback Resource', type: 'article', provider: 'Test', url: 'https://example.com', description: 'A fallback', duration: '5 min' },
  ],
}));

// Stub user-resource-states API fetch.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ completedIds: [], savedIds: [] }),
  }) as any;
});

// No pre-seeded resources → forces getRecommendationsForRoadmap fallback.
const ROADMAP_NO_RESOURCES: any = {
  id: 'r1',
  goal: 'Learn Python',
  resources: [],
  phases: [],
};

// Has resources → should NOT trigger fallback.
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
      expect(screen.getByText(/Showing general resource suggestions/i)).toBeInTheDocument();
    });
  });

  it('does not show fallback notice when roadmap has its own resources', async () => {
    const { ResourcesTab } = await import('../ResourcesTab');
    render(<ResourcesTab roadmap={ROADMAP_WITH_RESOURCES} />);

    await waitFor(() => {
      expect(screen.queryByText(/Showing general resource suggestions/i)).not.toBeInTheDocument();
    });
  });
});
