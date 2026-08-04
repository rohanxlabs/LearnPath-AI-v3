import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

const email = 'auth@test.com';

/** Register a user in the in-memory auth store and return a valid Bearer token. */
function loginToken(userEmail = email): string {
  const token = `auth-token-${userEmail}`;
  (globalThis as any).__authTokenStore.set(token, { id: `uid-${userEmail}`, email: userEmail });
  return token;
}

describe('/api/session', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('returns authenticated:true for a valid token', async () => {
    const token = loginToken();
    const res = await request(app)
      .get('/api/session')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe(email);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/session')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('/api/bootstrap', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('provisions a new user row and returns profile on first login', async () => {
    const token = loginToken('newuser@test.com');
    const res = await request(app)
      .get('/api/bootstrap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.email).toBe('newuser@test.com');
    expect(res.body).toHaveProperty('profile');
    expect(res.body).toHaveProperty('achievements');
    expect(res.body).toHaveProperty('roadmaps');
    expect(Array.isArray(res.body.roadmaps)).toBe(true);
  });

  it('returns the same profile on subsequent logins (idempotent)', async () => {
    const token = loginToken('repeat@test.com');
    const first = await request(app)
      .get('/api/bootstrap')
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .get('/api/bootstrap')
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.email).toBe(first.body.email);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/bootstrap');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/bootstrap')
      .set('Authorization', 'Bearer garbage-token');
    expect(res.status).toBe(401);
  });

  it('response shape includes all required fields', async () => {
    const token = loginToken('shape@test.com');
    const res = await request(app)
      .get('/api/bootstrap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body).toHaveProperty('authenticated', true);
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('profile');
    expect(body).toHaveProperty('settings');
    expect(body).toHaveProperty('achievements');
    expect(body).toHaveProperty('notifications');
    expect(body).toHaveProperty('chats');
    expect(body).toHaveProperty('activityLog');
    expect(body).toHaveProperty('roadmaps');
  });
});
