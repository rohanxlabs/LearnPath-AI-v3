import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

const email = 'roadmap@test.com';

async function seedUserWithRoadmap() {
  const hash = await bcrypt.hash('Password1', 10);
  const roadmap = {
    id: 'rm-1',
    goal: 'Learn Testing',
    phases: [
      {
        id: 'p1',
        name: 'Phase 1',
        levels: [
          {
            id: 'l1',
            name: 'Level 1',
            lessons: [
              { id: 'les-1', name: 'Lesson 1', status: 'available', xpReward: 50 },
              { id: 'les-2', name: 'Lesson 2', status: 'locked', xpReward: 30 },
            ],
          },
        ],
      },
    ],
  };
  await mockSql`
    INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
    VALUES (${email}, ${hash}, ${{ roadmaps: [roadmap] }}, ${{ profile: { name: 'T', xp: 0 }, achievements: [], resource_states: { completedIds: [], savedIds: [] } }}, 0, NOW())
    ON CONFLICT (email) DO UPDATE SET roadmap = EXCLUDED.roadmap
  `;
}

// Authenticate via the real login endpoint, returning the session cookie.
async function loginCookie() {
  const res = await request(app).post('/api/login').send({ email, password: 'Password1' });
  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw.map((c: string) => c.split(';')[0]).join('; ') : '';
  return cookie;
}

describe('update-roadmap allowlist', () => {
  beforeEach(async () => {
    resetMockDb();
    await seedUserWithRoadmap();
  });

  it('rejects disallowed (ownership) fields', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Cookie', cookie)
      .send({ roadmapId: 'rm-1', updates: { ownerEmail: 'attacker@x', title: 'Hacked' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ownerEmail');
  });

  it('persists allowed fields', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .post('/api/update-roadmap')
      .set('Cookie', cookie)
      .send({ roadmapId: 'rm-1', updates: { title: 'Updated Title' } });
    expect(res.status).toBe(200);
    expect(res.body.roadmap.title).toBe('Updated Title');
  });
});
