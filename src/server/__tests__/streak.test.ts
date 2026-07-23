// Tests for updateStreak() grace period logic (Sub-Task 2).
// These run in the node environment against the function directly,
// using a mocked pg Pool to avoid real DB calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock pg.Pool before any imports that use it.
// ---------------------------------------------------------------------------

let mockStreak = 0;
let mockLastActiveDate: string | null = null;

vi.mock('pg', () => {
  // Vitest 4 requires constructors to use 'function' or 'class' syntax.
  const Pool = vi.fn(function (this: any) {
    this.query = async (text: string, values: any[]) => {
      const q = text.trim().toLowerCase();
      if (q.includes('select') && q.includes('streak')) {
        return { rows: [{ streak: mockStreak, last_active_date: mockLastActiveDate }] };
      }
      if (q.includes('update') && q.includes('streak')) {
        mockStreak = values[0];
        mockLastActiveDate = values[1];
        return { rows: [] };
      }
      return { rows: [] };
    };
    this.end = () => Promise.resolve();
  });
  return { Pool, default: { Pool } };
});

// Also mock ensureUsersTable so it's a no-op.
vi.mock('../../../src/server/lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/server/lib/db')>();
  return {
    ...original,
    ensureUsersTable: vi.fn().mockResolvedValue(undefined),
  };
});

import { updateStreak } from '../../server/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const today = dateOffset(0);
const yesterday = dateOffset(-1);
const twoDaysAgo = dateOffset(-2);
const threeDaysAgo = dateOffset(-3);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateStreak() grace period logic', () => {
  beforeEach(() => {
    mockStreak = 5; // start with a non-zero streak so resets are visible
    mockLastActiveDate = null;
  });

  it('same day call — returns current streak unchanged', async () => {
    mockLastActiveDate = today;
    mockStreak = 5;
    const result = await updateStreak('test@example.com');
    expect(result).toBe(5);
    // Early return means the streak should not have been mutated by the mock
    expect(mockStreak).toBe(5);
  });

  it('consecutive day — increments streak by 1', async () => {
    mockLastActiveDate = yesterday;
    mockStreak = 5;
    const result = await updateStreak('test@example.com');
    expect(result).toBe(6);
  });

  it('one-day gap (grace window) — preserves streak, does not reset to 1', async () => {
    mockLastActiveDate = twoDaysAgo;
    mockStreak = 5;
    const result = await updateStreak('test@example.com');
    // Should preserve streak (neither increment nor reset).
    expect(result).toBe(5);
  });

  it('two-day gap (beyond grace) — resets streak to 1', async () => {
    mockLastActiveDate = threeDaysAgo;
    mockStreak = 5;
    const result = await updateStreak('test@example.com');
    expect(result).toBe(1);
  });

  it('null lastActiveDate — resets streak to 1 (new user)', async () => {
    mockLastActiveDate = null;
    mockStreak = 0;
    const result = await updateStreak('newuser@example.com');
    expect(result).toBe(1);
  });
});
