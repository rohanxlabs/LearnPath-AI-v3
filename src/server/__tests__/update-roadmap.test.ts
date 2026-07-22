import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

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

async function seedUser() {
  const hash = await bcrypt.hash('Password1', 10);
  await mockSql`
    INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
    VALUES (${email}, ${hash}, ${{ roadmaps: [] }}, ${{ profile: { name: 'T', xp: 0 }, achievements: [], resource_states: { completedIds: [], savedIds: [] } }}, 0, NOW())
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;
}

async function loginCookie() {
  const res = await request(app).post('/api/login').send({ email, password: 'Password1' });
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.map((c: string) => c.split(';')[0]).join('; ') : '';
}

describe('update-roadmap allowlist', () => {
  beforeEach(async () => {
    resetMockDb();
    await seedUser();
  });

  it('rejects disallowed (ownership) fields without needing an existing roadmap', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Cookie', cookie)
      .send({ roadmapId: 'rm-1', updates: { ownerEmail: 'attacker@x', title: 'Hacked' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ownerEmail');
  });

  it('returns 404 for a roadmap that does not exist in normalized tables', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Cookie', cookie)
      .send({ roadmapId: 'rm-nonexistent', updates: { title: 'Updated Title' } });
    // Route queries getRoadmapsByOwner (normalized tables) which returns [] in test mock
    expect(res.status).toBe(404);
  });
});
