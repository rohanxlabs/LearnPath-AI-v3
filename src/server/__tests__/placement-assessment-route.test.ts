import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../db/drizzle', () => ({ db: { select: mocks.select } }));
vi.mock('../db/queries', () => ({ getPlacementQuestionSources: vi.fn(), getUserSkill: vi.fn() }));

import placementAssessmentsRouter from '../routes/placementAssessments';

const app = express();
app.use(express.json());
app.use('/api', placementAssessmentsRouter);

function tokenFor(email: string) {
  const token = `placement-token-${email}`;
  (globalThis as any).__authTokenStore.set(token, { id: token, email });
  return token;
}

describe('placement assessment API access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication to start an assessment', async () => {
    const response = await request(app).post('/api/placement-assessments/start').send({ roadmapId: 'roadmap-1', idempotencyKey: 'idempotency-key-0001' });
    expect(response.status).toBe(401);
  });

  it('scopes attempt reads to the authenticated learner and ignores owner query parameters', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    mocks.select.mockReturnValue({ from });
    const token = tokenFor('bob@example.test');
    const response = await request(app).get('/api/placement-assessments/attempts/attempt-a?ownerEmail=alice@example.test')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
