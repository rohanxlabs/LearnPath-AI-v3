// @vitest-environment jsdom
// Tests for QuizTab's ActiveQuiz — verifies source label is rendered correctly.
// Environment: jsdom (set via vitest.config.ts environmentMatchGlobs).

import React from 'react';
import './setup';
import { render, screen } from '@testing-library/react';
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
  const handler = { get: (_: any, name: string) => () => <span data-testid={`icon-${name}`} /> };
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

// Stub fetch so QuizTab's AI call resolves immediately with empty questions,
// forcing a fallback to seed mode for the 'ai' test case.
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
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
      name: 'Foundations',
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
  it('shows "General practice quiz" label when source is seed', async () => {
    // quiz-python is a seed topic — no AI fetch should be triggered.
    render(
      <QuizTab
        roadmap={ROADMAP_STUB}
        onAddXp={vi.fn()}
        onRoadmapUpdated={vi.fn()}
        onAchievementUnlocked={vi.fn()}
      />
    );

    // Click the Python quiz card to enter ActiveQuiz.
    const pythonBtn = await screen.findByText(/Python/i);
    pythonBtn.click();

    // The source label should now be visible.
    expect(await screen.findByText(/General practice/i)).toBeInTheDocument();
  });
});
