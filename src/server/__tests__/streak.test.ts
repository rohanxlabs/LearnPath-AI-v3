// Tests for updateStreak() grace period logic (Sub-Task 2).
// These run in the node environment against the function directly,
// using a mocked neon SQL client to avoid real DB calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the neon client before any imports that use it.
// ---------------------------------------------------------------------------

let mockStreak = 0;
let mockLastActiveDate: string | null = null;

const mockSqlFn = vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
  const query = strings.join('?').trim().toLowerCase();
  if (query.includes('select') && query.includes('streak')) {
    return [{ streak: mockStreak, last_active_date: mockLastActiveDate }];
  }
  if (query.includes('update') && query.includes('streak')) {
    // Extract the streak value from the update call.
    // The tagged template call order is: UPDATE users SET streak = ${currentStreak}, last_active_date = ${today}
    mockStreak = values[0];
    mockLastActiveDate = values[1];
    return [];
  }
  return [];
});

vi.mock('@neondatabase/serverless', () => ({
  neon: () => mockSqlFn,
}));

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
    mockSqlFn.mockClear();
  });

  it('same day call — returns current streak unchanged, does not re-persist', async () => {
    mockLastActiveDate = today;
    mockStreak = 5;
    const result = await updateStreak('test@example.com');
    expect(result).toBe(5);
    // Should have returned early — UPDATE should NOT be called.
    const updateCalled = mockSqlFn.mock.calls.some(call =>
      call[0].join('').toLowerCase().includes('update')
    );
    expect(updateCalled).toBe(false);
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
