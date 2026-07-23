import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

const email = 'progress@test.com';
const password = 'Password1';

async function setupUser() {
  await request(app).post('/api/register').send({ email, password, name: 'Progress User' });
}

async function loginToken(): Promise<string> {
  const res = await request(app).post('/api/login').send({ email, password });
  return res.body?.access_token ?? '';
}

describe('progress endpoint', () => {
  beforeEach(async () => {
    resetMockDb();
    await setupUser();
  });

  it('GET /api/user-stats — returns xp and streak for authenticated user', async () => {
    const token = await loginToken();
    const res = await request(app)
      .get('/api/user-stats')
      .set('Authorization', `Bearer ${token}`);
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
