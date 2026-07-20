import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../../server.ts';

const mockSql: any = (globalThis as any).__mockSql;

describe('debug session', () => {
  it('login then authed call', async () => {
    (globalThis as any).__resetMockDb();
    const hash = await bcrypt.hash('Password1', 10);
    await mockSql`INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at) VALUES (${'dbg@test.com'}, ${hash}, ${{ roadmaps: [] }}, ${{ profile: { name: 'T', xp: 0 }, achievements: [], resource_states: { completedIds: [], savedIds: [] } }}, 0, NOW()) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`;
    const afterSeed = await mockSql`SELECT password_hash FROM users WHERE email = ${'dbg@test.com'}`;
    console.log('AFTER SEED ROWS', afterSeed.length, afterSeed[0]?.password_hash?.slice(0, 10));
    const login = await request(app).post('/api/login').send({ email: 'dbg@test.com', password: 'Password1' });
    console.log('LOGIN', login.status, JSON.stringify(login.body));
    const cookie = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'].map((c: string) => c.split(';')[0]).join('; ') : '';
    const me = await request(app).get('/api/roadmaps').set('Cookie', cookie);
    console.log('AUTH', me.status);
    expect(me.status).toBe(200);
  });
});
