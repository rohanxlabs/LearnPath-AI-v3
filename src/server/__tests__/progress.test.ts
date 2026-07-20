import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

const email = 'progress@test.com';

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

async function loginCookie() {
  const res = await request(app).post('/api/login').send({ email, password: 'Password1' });
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw.map((c: string) => c.split(';')[0]).join('; ') : '';
}

describe('progress endpoint', () => {
  beforeEach(async () => {
    resetMockDb();
    await seedUserWithRoadmap();
  });

  it('completes a lesson and derives totalXP server-side, ignoring client spoof', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .post('/api/progress')
      .set('Cookie', cookie)
      .send({ roadmapId: 'rm-1', lessonId: 'les-1', action: 'complete', totalXP: 99999, xpEarned: 99999 });
    expect(res.status).toBe(200);
    // les-1 has xpReward 50 -> derived totalXP must be 50, never 99999.
    expect(res.body.progress.totalXP).toBe(50);
    expect(res.body.xp).toBe(50);
    expect(res.body.progress.completedLessonIds).toContain('les-1');
  });

  it('rejects unauthenticated progress updates', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({ roadmapId: 'rm-1', lessonId: 'les-1', action: 'complete' });
    expect(res.status).toBe(401);
  });
});
