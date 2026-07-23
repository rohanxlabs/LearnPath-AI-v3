import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';

describe('debug session', () => {
  beforeEach(() => resetMockDb());

  it('login then authed call', async () => {
    const email = 'dbg@test.com';
    const password = 'Password1';
    await request(app).post('/api/register').send({ email, password, name: 'Debug User' });
    const login = await request(app).post('/api/login').send({ email, password });
    console.log('LOGIN', login.status, JSON.stringify(login.body));
    const token = login.body?.access_token;
    const me = await request(app).get('/api/roadmaps').set('Authorization', `Bearer ${token}`);
    console.log('AUTH', me.status);
    expect(me.status).toBe(200);
  });
});
