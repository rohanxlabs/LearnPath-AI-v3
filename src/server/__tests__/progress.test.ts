import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

const email = 'progress@test.com';
function loginToken(): string {
  const token = 'progress-supabase-session';
  (globalThis as any).__authTokenStore.set(token, { id: 'progress-user', email });
  return token;
}

describe('progress endpoint', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('GET /api/user-stats — returns xp and streak for authenticated user', async () => {
    const token = loginToken();
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
