// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import './setup';

vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const { NoRoadmapEmptyState } = await import('../EmptyState');

describe('NoRoadmapEmptyState', () => {
  beforeEach(() => { global.fetch = vi.fn().mockRejectedValue(new Error('No stream')); });
  afterEach(() => vi.useRealTimers());

  it('renders a labeled goal input and selectable examples', () => {
    render(<NoRoadmapEmptyState onSubmit={vi.fn()} isGenerating={false} />);
    expect(screen.getByRole('heading', { name: /start your learning path/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /what do you want to learn/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /learn rust for systems programming/i }));
    expect(screen.getByRole('textbox')).toHaveValue('I want to learn Rust for systems programming');
  });

  it('submits the typed goal from the empty state and retains it after failure', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('generation failed'));
    render(<NoRoadmapEmptyState onSubmit={onSubmit} isGenerating={false} />);
    const input = screen.getByRole('textbox', { name: /what do you want to learn/i });
    fireEvent.change(input, { target: { value: 'Learn Rust for systems programming' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Learn Rust for systems programming' })));
    expect(await screen.findByText(/roadmap generation failed/i)).toBeInTheDocument();
    expect(input).toHaveValue('Learn Rust for systems programming');
  });

  it('disables generation while the parent reports a generation in progress', () => {
    render(<NoRoadmapEmptyState onSubmit={vi.fn()} isGenerating />);
    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
  });

  it('rotates examples while idle, pauses on focus, and never replaces entered text', () => {
    vi.useFakeTimers();
    render(<NoRoadmapEmptyState onSubmit={vi.fn()} isGenerating={false} />);
    const input = screen.getByRole('textbox', { name: /what do you want to learn/i });
    const firstPlaceholder = input.getAttribute('placeholder');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(input.getAttribute('placeholder')).not.toBe(firstPlaceholder);
    fireEvent.focus(input);
    const focusedPlaceholder = input.getAttribute('placeholder');
    act(() => { vi.advanceTimersByTime(9000); });
    expect(input.getAttribute('placeholder')).toBe(focusedPlaceholder);
    fireEvent.change(input, { target: { value: 'A custom goal written by me' } });
    act(() => { vi.advanceTimersByTime(6000); });
    expect(input).toHaveValue('A custom goal written by me');
  });
});
