import { Router } from 'express';
import { requireAuth } from '../lib/middleware';
import { getUserSkill, getUserSkills } from '../db/queries';
import { backfillUserSkillStatesBestEffort, normalizeSkillTag } from '../lib/skillCalibration';
import { logger } from '../lib/logger';

const router = Router();

router.get('/skills', requireAuth, async (req, res) => {
  try {
    const ownerEmail = req.supabaseUser!.email;
    let skills = await getUserSkills(ownerEmail);
    if (skills.length === 0) {
      await backfillUserSkillStatesBestEffort(ownerEmail);
      skills = await getUserSkills(ownerEmail);
    }
    return res.json({ skills });
  } catch (error) {
    logger.error({ err: error }, 'Could not load learner skills');
    return res.status(503).json({ error: 'Skills temporarily unavailable', code: 'SKILLS_UNAVAILABLE' });
  }
});

router.get('/skills/:skillKey', requireAuth, async (req, res) => {
  const normalized = normalizeSkillTag(req.params.skillKey);
  if (!normalized || normalized.skillKey !== req.params.skillKey) {
    return res.status(400).json({ error: 'Invalid skill key', code: 'INVALID_SKILL_KEY' });
  }
  try {
    const skill = await getUserSkill(req.supabaseUser!.email, normalized.skillKey);
    return skill ? res.json({ skill }) : res.status(404).json({ error: 'Skill not found', code: 'SKILL_NOT_FOUND' });
  } catch (error) {
    logger.error({ err: error }, 'Could not load learner skill');
    return res.status(503).json({ error: 'Skills temporarily unavailable', code: 'SKILLS_UNAVAILABLE' });
  }
});

export default router;
