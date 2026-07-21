import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb, mockSql } from './mockDb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function registerUser(email: string, password = 'Password1', name = 'Test User') {
  return request(app).post('/api/register').send({ email, password, name });
}

async function loginAndGetCookie(email: string, password = 'Password1') {
  const res = await request(app).post('/api/login').send({ email, password });
  const raw = res.headers['set-cookie'];
  return { status: res.status, cookie: Array.isArray(raw) ? raw.map((c: string) => c.split(';')[0]).join('; ') : '' };
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
describe('auth routes', () => {
  beforeEach(() => resetMockDb());

  it('POST /api/register — rejects short password', async () => {
    const res = await request(app).post('/api/register').send({ email: 'a@test.com', password: 'short', name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('POST /api/register — rejects password without digit', async () => {
    const res = await request(app).post('/api/register').send({ email: 'b@test.com', password: 'NoDigitHere', name: 'B' });
    expect(res.status).toBe(400);
  });

  it('POST /api/register — rejects invalid email format', async () => {
    const res = await request(app).post('/api/register').send({ email: 'notanemail', password: 'Password1', name: 'C' });
    expect(res.status).toBe(400);
  });

  it('POST /api/register — rejects missing name', async () => {
    const res = await request(app).post('/api/register').send({ email: 'c@test.com', password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/register — succeeds with valid payload', async () => {
    const res = await registerUser('new@test.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('new@test.com');
  });

  it('POST /api/register — rejects duplicate email', async () => {
    await registerUser('dup@test.com');
    const res = await registerUser('dup@test.com');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('POST /api/login — rejects wrong password', async () => {
    await registerUser('login@test.com');
    const res = await request(app).post('/api/login').send({ email: 'login@test.com', password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  it('POST /api/login — sets session cookie on success', async () => {
    await registerUser('sess@test.com');
    const { status, cookie } = await loginAndGetCookie('sess@test.com');
    expect(status).toBe(200);
    expect(cookie).toBeTruthy();
  });

  it('GET /api/session — 401 without cookie', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(401);
  });

  it('POST /api/logout — destroys session', async () => {
    await registerUser('logout@test.com');
    const { cookie } = await loginAndGetCookie('logout@test.com');
    const logout = await request(app).post('/api/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);
    // session gone — subsequent /api/session should 401
    const session = await request(app).get('/api/session').set('Cookie', cookie);
    expect(session.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Protected routes — auth guard
// ---------------------------------------------------------------------------
describe('auth guard on protected routes', () => {
  beforeEach(() => resetMockDb());

  const protectedRoutes = [
    { method: 'GET', path: '/api/roadmaps' },
    { method: 'GET', path: '/api/user-stats' },
    { method: 'GET', path: '/api/user-profile' },
    { method: 'GET', path: '/api/bootstrap' },
    { method: 'POST', path: '/api/complete-lesson' },
    { method: 'POST', path: '/api/generate-roadmap' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} returns 401 without session`, async () => {
      const res = method === 'GET'
        ? await request(app).get(path)
        : await request(app).post(path).send({});
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Input validation on AI routes
// ---------------------------------------------------------------------------
describe('ai route validation', () => {
  beforeEach(() => resetMockDb());

  it('POST /api/generate-roadmap — 401 without auth', async () => {
    const res = await request(app).post('/api/generate-roadmap').send({ goal: 'Learn Python' });
    expect(res.status).toBe(401);
  });

  it('POST /api/generate-quiz — 401 without auth', async () => {
    const res = await request(app).post('/api/generate-quiz').send({ topicName: 'Python' });
    expect(res.status).toBe(401);
  });

  it('POST /api/mentor-chat — 400 without message when authenticated', async () => {
    await registerUser('chat@test.com');
    const { cookie } = await loginAndGetCookie('chat@test.com');
    const res = await request(app)
      .post('/api/mentor-chat')
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/analyze-code — 400 without code when authenticated', async () => {
    await registerUser('code@test.com');
    const { cookie } = await loginAndGetCookie('code@test.com');
    const res = await request(app)
      .post('/api/analyze-code')
      .set('Cookie', cookie)
      .send({ instructions: 'test' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// User profile routes
// ---------------------------------------------------------------------------
describe('user profile', () => {
  beforeEach(() => resetMockDb());

  it('GET /api/user-profile — returns profile shape when authenticated', async () => {
    await registerUser('profile@test.com', 'Password1', 'Profile User');
    const { cookie } = await loginAndGetCookie('profile@test.com');
    const res = await request(app).get('/api/user-profile').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('profile');
    expect(res.body).toHaveProperty('settings');
    expect(res.body).toHaveProperty('achievements');
  });

  it('PUT /api/user-profile — blocks server-owned fields', async () => {
    await registerUser('block@test.com', 'Password1', 'Block User');
    const { cookie } = await loginAndGetCookie('block@test.com');
    const res = await request(app)
      .put('/api/user-profile')
      .set('Cookie', cookie)
      .send({ profile: { xp: 99999, level: 999, name: 'Legit Name' } });
    expect(res.status).toBe(200);
    // xp and level must NOT be stored (blocklist)
    const profile = await request(app).get('/api/user-profile').set('Cookie', cookie);
    expect(profile.body.profile?.xp).toBeUndefined();
    expect(profile.body.profile?.level).toBeUndefined();
    expect(profile.body.profile?.name).toBe('Legit Name');
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('health check', () => {
  it('GET /api/health — returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('aiActive');
  });
});

// ---------------------------------------------------------------------------
// Password reset flow
// ---------------------------------------------------------------------------
describe('password reset', () => {
  beforeEach(() => resetMockDb());

  it('POST /api/password-reset/request — always returns ok (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/password-reset/request')
      .send({ email: 'nonexistent@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/password-reset/request — 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/password-reset/request')
      .send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });

  it('POST /api/password-reset/confirm — 400 for invalid token', async () => {
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token: 'invalid-token', password: 'NewPass1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/password-reset/confirm — 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token: 'some-token', password: 'weak' });
    expect(res.status).toBe(400);
  });
});
