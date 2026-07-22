// @vitest-environment jsdom
// Tests for RoadmapGeneratorForm — verifies inline error state on full failure.
// Environment: jsdom (set via vitest.config.ts environmentMatchGlobs).

import React from 'react';
import './setup';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock the SSE-based fetch to fail immediately (simulates all 7 model fallbacks exhausted).
beforeEach(() => {
  global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
});

const { RoadmapGeneratorForm } = await import('../RoadmapGeneratorForm');

describe('RoadmapGeneratorForm error state', () => {
  it('shows inline error message when both SSE and legacy onSubmit fail', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Generation failed'));
    const onRoadmapReady = vi.fn();

    render(
      <RoadmapGeneratorForm
        onSubmit={onSubmit}
        onRoadmapReady={onRoadmapReady}
        isGenerating={false}
      />
    );

    const input = screen.getByPlaceholderText(/e\.g\.,/i);
    fireEvent.change(input, { target: { value: 'Learn React' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    // Wait for the error message to appear.
    await waitFor(() => {
      expect(screen.getByText(/Roadmap generation failed/i)).toBeInTheDocument();
    });

    // Goal input should still contain the user's text.
    expect((input as HTMLInputElement).value).toBe('Learn React');
  });

  it('clears error message when user edits the goal input', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Generation failed'));

    render(
      <RoadmapGeneratorForm
        onSubmit={onSubmit}
        isGenerating={false}
      />
    );

    const input = screen.getByPlaceholderText(/e\.g\.,/i);
    fireEvent.change(input, { target: { value: 'Learn React' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Roadmap generation failed/i)).toBeInTheDocument();
    });

    // Typing in the goal clears the error.
    fireEvent.change(input, { target: { value: 'Learn Vue' } });
    await waitFor(() => {
      expect(screen.queryByText(/Roadmap generation failed/i)).not.toBeInTheDocument();
    });
  });

  it('does not show error when user cancels (AbortError)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(abortError);

    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <RoadmapGeneratorForm
        onSubmit={onSubmit}
        isGenerating={false}
      />
    );

    const input = screen.getByPlaceholderText(/e\.g\.,/i);
    fireEvent.change(input, { target: { value: 'Learn Vue' } });
    fireEvent.submit(input.closest('form')!);

    // Wait a tick — no error should appear.
    await waitFor(() => {
      expect(screen.queryByText(/Roadmap generation failed/i)).not.toBeInTheDocument();
    });
  });
});
