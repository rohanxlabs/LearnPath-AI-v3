import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

// Seeded in-memory user so tests can log in without re-registering.
async function seedUser(email: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  // Reach into the mock store via the same sql path server.ts uses.
  await mockSql`
    INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
    VALUES (${email}, ${hash}, ${{ roadmaps: [], curated_resources: [], projects: [], topic_wise_quizzes: [] }}, ${{ profile: { name: 'Test', xp: 0 }, achievements: [], resource_states: { completedIds: [], savedIds: [] } }}, 0, NOW())
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;
}

describe('auth', () => {
  beforeEach(() => resetMockDb());

  it('rejects weak passwords at register', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'weak@test.com', password: 'short', name: 'Weak' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid emails at register', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'notanemail', password: 'Password1', name: 'Bad' });
    expect(res.status).toBe(400);
  });

  it('registers and logs in with valid credentials', async () => {
    const email = 'newuser@test.com';
    const reg = await request(app)
      .post('/api/register')
      .send({ email, password: 'Password1', name: 'New' });
    expect(reg.status).toBe(200);

    const login = await request(app)
      .post('/api/login')
      .send({ email, password: 'Password1' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const email = 'login@test.com';
    await seedUser(email, 'Password1');
    const res = await request(app)
      .post('/api/login')
      .send({ email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  it('protects authenticated routes without a session', async () => {
    const res = await request(app).get('/api/roadmaps');
    expect(res.status).toBe(401);
  });
});
