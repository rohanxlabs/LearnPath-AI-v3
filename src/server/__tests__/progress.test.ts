import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../../server.ts';
import { resetMockDb } from './mockDb';
import { extractResourceMetadata } from '../routes/roadmaps';

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

  it('rejects localhost resource preview targets before making a network request', async () => {
    const token = loginToken();
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const res = await request(app).get('/api/resources/preview?url=http%3A%2F%2Flocalhost%2F').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(422);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('returns normalized metadata for a valid public URL and falls back safely when preview is unavailable', async () => {
    const metadata = extractResourceMetadata('<html><head><meta property="og:title" content="Metadata title"><meta property="og:description" content="Short summary"></head></html>', new URL('https://example.com/course'));
    expect(metadata).toMatchObject({ title: 'Metadata title', description: 'Short summary', publisher: 'example.com' });
    const token = loginToken();
    const fallback = await request(app).get(`/api/resources/preview?url=${encodeURIComponent(`http://127.0.0.1/resource-${Date.now()}`)}`).set('Authorization', `Bearer ${token}`);
    expect(fallback.status).toBe(422);
    expect(fallback.body).toHaveProperty('error');
  });
});
