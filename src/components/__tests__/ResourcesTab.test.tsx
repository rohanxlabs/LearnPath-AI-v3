// @vitest-environment jsdom
// Tests for ResourcesTab fallback indicator.

import React from 'react';
import './setup';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_t, prop) => ({ children, layout: _l, initial: _i, animate: _a, exit: _e, transition: _tr, ...rest }: any) =>
      React.createElement(String(prop), rest, children),
  }),
  useReducedMotion: () => false,
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

  it('keeps a resource usable when its preview fails and exposes accessible actions', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith('/api/resources/preview')) return Promise.resolve({ ok: false });
      return Promise.resolve({ ok: true, json: async () => ({ completedIds: [], savedIds: [] }) });
    }) as any;
    const onAskMentor = vi.fn();
    const { ResourcesTab } = await import('../ResourcesTab');
    const roadmap = { ...ROADMAP_WITH_RESOURCES, resources: [{ ...ROADMAP_WITH_RESOURCES.resources[0], url: 'https://preview-error.example.com/resource' }] };
    render(<ResourcesTab roadmap={roadmap} onAskMentor={onAskMentor} />);

    expect(await screen.findByText('Preview unavailable. You can still open this resource.')).toBeInTheDocument();
    expect(screen.getAllByText('Video').length).toBeGreaterThan(1);
    const link = screen.getByRole('link', { name: /Open JS Resource on external site/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI Mentor about JS Resource' }));
    expect(onAskMentor).toHaveBeenCalledWith(roadmap.resources[0]);
  });

  it('renders available preview metadata and only the supplied duration', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith('/api/resources/preview')) return Promise.resolve({ ok: true, json: async () => ({ title: 'OG Article Title', description: 'Preview summary', publisher: 'Example Publisher', author: 'Ada Lovelace' }) });
      return Promise.resolve({ ok: true, json: async () => ({ completedIds: [], savedIds: [] }) });
    }) as any;
    const roadmap = { ...ROADMAP_WITH_RESOURCES, resources: [{ ...ROADMAP_WITH_RESOURCES.resources[0], url: 'https://metadata.example.com/article', duration: '12 min' }] };
    const { ResourcesTab } = await import('../ResourcesTab');
    render(<ResourcesTab roadmap={roadmap} />);

    expect(await screen.findByText('OG Article Title')).toBeInTheDocument();
    expect(screen.getByText('Preview summary')).toBeInTheDocument();
    expect(screen.getByText('Example Publisher')).toBeInTheDocument();
    expect(screen.getByText('By Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('12 min')).toBeInTheDocument();
  });

  it('shows the LearnPath icon fallback when a preview image fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).startsWith('/api/resources/preview')) return Promise.resolve({ ok: true, json: async () => ({ image: 'https://example.com/preview.jpg' }) });
      return Promise.resolve({ ok: true, json: async () => ({ completedIds: [], savedIds: [] }) });
    }) as any;
    const roadmap = { ...ROADMAP_WITH_RESOURCES, resources: [{ ...ROADMAP_WITH_RESOURCES.resources[0], url: 'https://preview-image.example.com/resource', image: 'https://example.com/image.jpg' }] };
    const { ResourcesTab } = await import('../ResourcesTab');
    render(<ResourcesTab roadmap={roadmap} />);
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/preview.jpg'));
    fireEvent.error(document.querySelector('img')!);
    await waitFor(() => expect(document.querySelector('img')).toBeNull());
    expect(screen.getAllByTestId('icon-Video').length).toBeGreaterThan(0);
  });
});
