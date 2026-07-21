import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

const email = 'progress@test.com';

async function seedUser() {
  const hash = await bcrypt.hash('Password1', 10);
  await mockSql`
    INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
    VALUES (${email}, ${hash}, ${{ roadmaps: [] }}, ${{ profile: { name: 'T', xp: 100 }, achievements: [], resource_states: { completedIds: [], savedIds: [] } }}, 100, NOW())
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
    await seedUser();
  });

  it('GET /api/user-stats — returns xp and streak for authenticated user', async () => {
    const cookie = await loginCookie();
    const res = await request(app)
      .get('/api/user-stats')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('xp');
    expect(res.body).toHaveProperty('streak');
  });

  it('rejects unauthenticated progress updates', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({ roadmapId: 'rm-1', lessonId: 'les-1', action: 'complete' });
    expect(res.status).toBe(401);
  });
});
