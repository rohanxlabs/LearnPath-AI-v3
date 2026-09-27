// @vitest-environment jsdom
// Tests for QuizTab's ActiveQuiz — verifies source label is rendered correctly.
// Environment: jsdom (set via vitest.config.ts environmentMatchGlobs).

import React from 'react';
import './setup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock motion/react and lucide-react so they render without animation issues.
// ---------------------------------------------------------------------------
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  // Return simple spans for all icons to avoid SVG rendering complexity.
  const handler = { get: (target: any, name: string) => name === 'then' ? undefined : name in target ? () => <span data-testid={`icon-${name}`} /> : undefined };
  return new Proxy(actual, handler);
});

// ---------------------------------------------------------------------------
// Minimal question fixture.
// ---------------------------------------------------------------------------
const QUESTIONS = [
  {
    id: 'q1',
    question: 'What is 1 + 1?',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    explanation: 'Basic arithmetic.',
  },
];

// ---------------------------------------------------------------------------
// Extract ActiveQuiz by importing from the module.
// QuizTab exports QuizTab; ActiveQuiz is internal but we test via rendered output.
// We render QuizTab with a minimal roadmap and stub props so it reaches ActiveQuiz.
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/topic-wise-quizzes') return { ok: true, json: async () => [] } as Response;
    if (url === '/api/generate-quiz') return { ok: true, json: async () => QUESTIONS } as Response;
    return { ok: true, json: async () => ({}) } as Response;
  }) as any;
});

// Import after mocks are set up.
const { QuizTab } = await import('../QuizTab');

const ROADMAP_STUB: any = {
  id: 'r1',
  goal: 'Learn Python',
  phases: [
    {
      id: 'ph1',
      name: 'Python',
      levels: [
        {
          id: 'lv1',
          name: 'Basics',
          lessons: [{ id: 'les1', name: 'Intro', type: 'learn', status: 'available', xpReward: 10 }],
        },
      ],
    },
  ],
};

describe('ActiveQuiz source label', () => {
  it('shows the roadmap label for a generated phase quiz', async () => {
    const user = userEvent.setup();
    render(
      <QuizTab
        roadmap={ROADMAP_STUB}
        onAddXp={vi.fn()}
        onRoadmapUpdated={vi.fn()}
        onAchievementUnlocked={vi.fn()}
      />
    );

    // The current quiz list is built from unlocked roadmap phases.
    await screen.findByText('Python');
    await user.click(screen.getByRole('button', { name: /Start Assessment/i }));

    expect(await screen.findByText(/Tailored to your roadmap/i)).toBeInTheDocument();
  });
});
