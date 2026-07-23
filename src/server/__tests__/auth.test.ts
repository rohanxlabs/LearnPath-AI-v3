/**
 * Auth tests — Supabase-backed authentication
 *
 * Strategy:
 *   - @supabase/supabase-js is mocked in setup.ts; all auth happens in-memory
 *   - @neondatabase/serverless is mocked; user-data DB is also in-memory
 *   - Authentication uses Bearer tokens (no cookies)
 *   - Helper `registerUser` calls POST /api/register (creates Supabase user + seeds DB)
 *   - Helper `loginUser` calls POST /api/login and returns the access_token
 *   - `authHeader(token)` builds the Authorization: Bearer header object
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_PASSWORD = 'Password1';

async function registerUser(email: string, password = TEST_PASSWORD, name = 'Test User') {
  return request(app).post('/api/register').send({ email, password, name });
}

async function loginUser(email: string, password = TEST_PASSWORD): Promise<{ status: number; token: string | null; body: any }> {
  const res = await request(app).post('/api/login').send({ email, password });
  return {
    status: res.status,
    token: res.body?.access_token ?? null,
    body: res.body,
  };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Register + login in one step, returns the Bearer token
async function setupUser(email: string, name = 'Test User'): Promise<string> {
  await registerUser(email, TEST_PASSWORD, name);
  const { token } = await loginUser(email);
  if (!token) throw new Error(`loginUser returned no token for ${email}`);
  return token;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
describe('POST /api/register', () => {
  beforeEach(() => resetMockDb());

  it('rejects missing name', async () => {
    const res = await request(app).post('/api/register').send({ email: 'a@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('rejects short password (< 8 chars)', async () => {
    const res = await request(app).post('/api/register').send({ email: 'a@test.com', password: 'short', name: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('rejects password without digit', async () => {
    const res = await request(app).post('/api/register').send({ email: 'b@test.com', password: 'NoDigitHere', name: 'B' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format', async () => {
    const res = await request(app).post('/api/register').send({ email: 'notanemail', password: TEST_PASSWORD, name: 'C' });
    expect(res.status).toBe(400);
  });

  it('succeeds with valid payload', async () => {
    const res = await registerUser('new@test.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe('new@test.com');
  });

  it('normalises email to lowercase', async () => {
    const res = await registerUser('UPPER@Test.COM');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('upper@test.com');
  });

  it('rejects duplicate email', async () => {
    await registerUser('dup@test.com');
    const res = await registerUser('dup@test.com');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
describe('POST /api/login', () => {
  beforeEach(() => resetMockDb());

  it('returns access_token on success', async () => {
    await registerUser('login@test.com');
    const { status, token } = await loginUser('login@test.com');
    expect(status).toBe(200);
    expect(typeof token).toBe('string');
    expect(token!.length).toBeGreaterThan(0);
  });

  it('returns refresh_token and expires_in', async () => {
    await registerUser('login2@test.com');
    const { body } = await loginUser('login2@test.com');
    expect(body).toHaveProperty('refresh_token');
    expect(typeof body.expires_in).toBe('number');
  });

  it('rejects unregistered email with 401', async () => {
    const { status } = await loginUser('ghost@test.com');
    expect(status).toBe(401);
  });

  it('rejects missing email with 400', async () => {
    const res = await request(app).post('/api/login').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('rejects missing password with 400', async () => {
    const res = await request(app).post('/api/login').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format with 400', async () => {
    const res = await request(app).post('/api/login').send({ email: 'notanemail', password: TEST_PASSWORD });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Session / Bootstrap
// ---------------------------------------------------------------------------
describe('GET /api/session', () => {
  beforeEach(() => resetMockDb());

  it('returns 401 without Bearer token', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a made-up token', async () => {
    const res = await request(app).get('/api/session').set('Authorization', 'Bearer fake-token-xyz');
    expect(res.status).toBe(401);
  });

  it('returns authenticated: true with a valid token', async () => {
    const token = await setupUser('sess@test.com');
    const res = await request(app).get('/api/session').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe('sess@test.com');
  });
});

describe('GET /api/bootstrap', () => {
  beforeEach(() => resetMockDb());

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(401);
  });

  it('returns profile shape when authenticated', async () => {
    const token = await setupUser('boot@test.com', 'Bootstrap User');
    const res = await request(app).get('/api/bootstrap').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe('boot@test.com');
    expect(res.body).toHaveProperty('profile');
    expect(res.body).toHaveProperty('settings');
    expect(res.body).toHaveProperty('achievements');
    expect(res.body).toHaveProperty('roadmaps');
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
describe('POST /api/logout', () => {
  beforeEach(() => resetMockDb());

  it('returns ok:true (stateless — best-effort revocation)', async () => {
    const token = await setupUser('logout@test.com');
    const res = await request(app).post('/api/logout').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns ok:true even without a token (backward compat)', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auth guard on protected routes
// ---------------------------------------------------------------------------
describe('auth guard — 401 without Bearer token', () => {
  beforeEach(() => resetMockDb());

  const protectedRoutes = [
    { method: 'GET',  path: '/api/roadmaps' },
    { method: 'GET',  path: '/api/user-stats' },
    { method: 'GET',  path: '/api/user-profile' },
    { method: 'GET',  path: '/api/bootstrap' },
    { method: 'POST', path: '/api/complete-lesson' },
    { method: 'POST', path: '/api/generate-roadmap' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} → 401`, async () => {
      const res = method === 'GET'
        ? await request(app).get(path)
        : await request(app).post(path).send({});
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// User profile CRUD
// ---------------------------------------------------------------------------
describe('user profile', () => {
  beforeEach(() => resetMockDb());

  it('GET /api/user-profile returns profile/settings/achievements', async () => {
    const token = await setupUser('profile@test.com', 'Profile User');
    const res = await request(app).get('/api/user-profile').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('profile');
    expect(res.body).toHaveProperty('settings');
    expect(res.body).toHaveProperty('achievements');
  });

  it('PUT /api/user-profile persists allowed fields', async () => {
    const token = await setupUser('update@test.com', 'Update User');
    const put = await request(app)
      .put('/api/user-profile')
      .set(authHeader(token))
      .send({ profile: { name: 'Updated Name' } });
    expect(put.status).toBe(200);

    const get = await request(app).get('/api/user-profile').set(authHeader(token));
    expect(get.body.profile?.name).toBe('Updated Name');
  });

  it('PUT /api/user-profile blocks server-owned fields (xp, level)', async () => {
    const token = await setupUser('block@test.com', 'Block User');
    await request(app)
      .put('/api/user-profile')
      .set(authHeader(token))
      .send({ profile: { xp: 99999, level: 999, name: 'Legit Name' } });

    const get = await request(app).get('/api/user-profile').set(authHeader(token));
    expect(get.body.profile?.xp).toBeUndefined();
    expect(get.body.profile?.level).toBeUndefined();
    expect(get.body.profile?.name).toBe('Legit Name');
  });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
describe('password reset', () => {
  beforeEach(() => resetMockDb());

  it('POST /api/password-reset/request always returns ok (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/password-reset/request')
      .send({ email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/password-reset/request returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/password-reset/request')
      .send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });

  it('POST /api/password-reset/confirm returns 400 for invalid/expired token', async () => {
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token: 'bogus-token', password: 'NewPass1' });
    expect(res.status).toBe(400);
  });

  it('POST /api/password-reset/confirm returns 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token: 'some-token', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('POST /api/password-reset/confirm rejects a plain Bearer session token (not a recovery token)', async () => {
    // A regular login token must NOT be accepted as a reset token.
    const token = await setupUser('reset-session@test.com', 'Reset User');
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token, password: 'NewPass99' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  it('POST /api/password-reset/confirm succeeds with a recovery-tagged token', async () => {
    // Register user, get a session token, then tag it as a recovery token.
    const token = await setupUser('reset-recovery@test.com', 'Reset User');
    // Tag the token as a recovery token in the mock store.
    const recoveryStore: Set<string> = (globalThis as any).__recoveryTokenStore;
    recoveryStore.add(token);
    const res = await request(app)
      .post('/api/password-reset/confirm')
      .send({ token, password: 'NewPass99' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AI routes input validation
// ---------------------------------------------------------------------------
describe('ai route validation', () => {
  beforeEach(() => resetMockDb());

  it('POST /api/generate-roadmap → 401 without auth', async () => {
    const res = await request(app).post('/api/generate-roadmap').send({ goal: 'Learn Python' });
    expect(res.status).toBe(401);
  });

  it('POST /api/generate-quiz → 401 without auth', async () => {
    const res = await request(app).post('/api/generate-quiz').send({ topicName: 'Python' });
    expect(res.status).toBe(401);
  });

  it('POST /api/mentor-chat → 400 without message (authenticated)', async () => {
    const token = await setupUser('chat@test.com');
    const res = await request(app)
      .post('/api/mentor-chat')
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/analyze-code → 400 without code (authenticated)', async () => {
    const token = await setupUser('code@test.com');
    const res = await request(app)
      .post('/api/analyze-code')
      .set(authHeader(token))
      .send({ instructions: 'test' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Health check (public)
// ---------------------------------------------------------------------------
describe('health check', () => {
  it('GET /api/health → ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('aiActive');
  });
});
