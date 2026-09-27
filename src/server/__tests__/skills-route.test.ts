import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/queries', () => ({ getUserSkill: vi.fn(), getUserSkills: vi.fn() }));
vi.mock('../lib/skillCalibration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/skillCalibration')>()),
  backfillUserSkillStatesBestEffort: vi.fn(),
}));

import { getUserSkill, getUserSkills } from '../db/queries';
import skillsRouter from '../routes/skills';

const app = express();
app.use('/api', skillsRouter);

function tokenFor(email: string) {
  const token = `skill-token-${email}`;
  (globalThis as any).__authTokenStore.set(token, { id: token, email });
  return token;
}

describe('learner skills API ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    const response = await request(app).get('/api/skills');
    expect(response.status).toBe(401);
  });

  it('scopes skill reads to the authenticated email, ignoring client ownership values', async () => {
    vi.mocked(getUserSkills).mockResolvedValue([]);
    vi.mocked(getUserSkill).mockImplementation(async (ownerEmail, key) => ownerEmail === 'alice@example.test' && key === 'python'
      ? { skillKey: key, ownerEmail }
      : null);
    const token = tokenFor('bob@example.test');

    const list = await request(app).get('/api/skills?ownerEmail=alice@example.test').set('Authorization', `Bearer ${token}`);
    const detail = await request(app).get('/api/skills/python').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(vi.mocked(getUserSkills)).toHaveBeenCalledWith('bob@example.test');
    expect(detail.status).toBe(404);
    expect(vi.mocked(getUserSkill)).toHaveBeenCalledWith('bob@example.test', 'python');
  });
});
