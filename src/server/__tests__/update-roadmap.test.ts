import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

// getRoadmapsByOwner uses Drizzle ORM which bypasses the raw neon SQL mock.
// Stub it to return an empty array so the route hits the 404 branch as intended.
vi.mock('../db/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/queries')>();
  return {
    ...actual,
    getRoadmapsByOwner: vi.fn().mockResolvedValue([]),
  };
});

const email = 'roadmap@test.com';
function loginToken(): string {
  const token = 'roadmap-supabase-session';
  (globalThis as any).__authTokenStore.set(token, { id: 'roadmap-user', email });
  return token;
}

describe('update-roadmap allowlist', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('rejects disallowed (ownership) fields without needing an existing roadmap', async () => {
    const token = loginToken();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Authorization', `Bearer ${token}`)
      .send({ roadmapId: 'rm-1', updates: { ownerEmail: 'attacker@x', title: 'Hacked' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ownerEmail');
  });

  it('returns 404 for a roadmap that does not exist in normalized tables', async () => {
    const token = await loginToken();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Authorization', `Bearer ${token}`)
      .send({ roadmapId: 'rm-nonexistent', updates: { title: 'Updated Title' } });
    // Route queries getRoadmapsByOwner (normalized tables) which returns [] in test mock
    expect(res.status).toBe(404);
  });
});
