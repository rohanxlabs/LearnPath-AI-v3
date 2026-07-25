import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth, aiLimiter, roadmapGenLimiter } from '../lib/middleware';
import { unlockAchievement } from '../lib/db';
import { logger } from '../lib/logger';
import {
  reconstructRoadmapJson,
  getRoadmapsByOwner,
  deleteRoadmap,
  createRoadmapFromJson,
  getUserRoadmapsReconstructed,
  upsertRoadmap,
  upsertResource,
  upsertPhaseProject
} from '../db/queries';
import {
  validateCurriculumQuality,
  validateAndNormalizeCurriculum,
  buildFallbackCurriculum,
  logCurriculumStats,
  CURRICULUM_LIMITS
} from '../lib/curriculum';
import { callGroqChatCompletion, cleanAndParseJSON, sanitizeForPrompt } from '../lib/ai';

const router = Router();

// Generate roadmap
router.post('/generate-roadmap', requireAuth, roadmapGenLimiter, aiLimiter, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required', code: 'MISSING_GOAL' });

  // Generate a stable roadmapId before calling the AI so validateAndNormalizeCurriculum
  // can prefix all child IDs (ph-1, mod-1-1, les-1-1-1) with it, making them globally
  // unique across every roadmap the user creates.
  const roadmapId = `roadmap-${randomUUID()}`;
  const meta = { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year, roadmapId };
  const universityContext = college && branch && year
    ? `\nLearner is a ${sanitizeForPrompt(year)} student at ${sanitizeForPrompt(college)} studying ${sanitizeForPrompt(branch)}; align topics and ordering with their university syllabus (AKTU where applicable).`
    : '';
  const indiaContext = `\nAudience: Indian college/engineering learners. Flow like a semester (foundations -> core -> applied -> advanced -> specialization), blend theory with heavy coding, and include placement skills (DSA, system design, projects). Prefer globally-recognized resources.`;

  const buildRoadmapPrompt = () => `You are a senior curriculum architect. Design a DEEP, degree-level learning curriculum for: "${sanitizeForPrompt(goal)}".
Learner level: "${sanitizeForPrompt(experienceLevel || 'Beginner')}". Pace: ${sanitizeForPrompt(weeklyHours || 5)} hrs/week. Style: "${sanitizeForPrompt(preferredStyle || 'Hands-on')}".${universityContext}${indiaContext}

STRUCTURE (mandatory, never under-deliver):
- ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases; difficulty rises monotonically beginner -> intermediate -> advanced -> expert.
- ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules per phase (difficulty rises within the phase).
- ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons per module (metadata only, NO lesson content/markdown/quizzes).

NAMING & QUALITY:
- Titles must be specific and domain-accurate (e.g. "Implementing Binary Search Trees"), never generic ("Introduction","Basics","Overview","Module 1","Project").
- No duplicate lesson titles or module names anywhere. Descriptions: one concise, concrete sentence.
- Order concepts logically (fundamentals first). Only reference real technologies; do not hallucinate.

LESSON FIELDS: id "les-{phase}-{module}-{n}" (unique); name; description; learningObjectives (2-4 measurable outcomes, each a full phrase); prerequisites (1-3 EARLIER lesson ids forming a real chain, first lesson []); skillTags (2-5 specific lowercase tags like python,numpy,react,sql — never "basics"/"concepts"); difficulty beginner|intermediate|advanced; estimatedMinutes ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}; type "learn"; status "available" for the FIRST lesson only else "locked"; contentStatus "pending".

MODULE FIELDS: id "mod-{phase}-{n}"; name; description; difficulty; estimatedHours 3-8; resources 2-4. Each resource: id, type documentation|video|practice|book, title, provider, url (real https), description. PREFER official documentation, official learning resources, high-quality YouTube playlists, interactive practice platforms, and well-known books; AVOID random blogs. Resources MUST match the module topic.

PHASE FIELDS: id "ph-{n}"; name; description; estimatedHours 10-30; difficulty; skillsCovered (3-6 tags); projects (>=1). Projects reinforce that phase's concepts and get harder across phases using this ladder: mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone. Each project: id, title, difficulty (one ladder value), description (2-3 sentences), techStack (real tools), features (3-6 concrete), progress 0.

Return ONLY a JSON object of this exact shape (one example element shown per array; produce the full required counts):
{"goal":${JSON.stringify(sanitizeForPrompt(goal, 120))},"phases":[{"id":"ph-1","name":"...","description":"...","estimatedHours":18,"difficulty":"beginner","skillsCovered":["..."],"modules":[{"id":"mod-1-1","name":"...","description":"...","difficulty":"beginner","estimatedHours":5,"lessons":[{"id":"les-1-1-1","name":"...","description":"...","learningObjectives":["...","..."],"prerequisites":[],"skillTags":["...","..."],"difficulty":"beginner","estimatedMinutes":25,"type":"learn","status":"available","contentStatus":"pending"}],"resources":[{"id":"res-1-1-1","title":"...","type":"documentation","provider":"...","url":"https://...","description":"..."}]}],"projects":[{"id":"proj-1","title":"...","difficulty":"mini-exercise","description":"...","techStack":["..."],"features":["..."],"progress":0}]}]}`;

  const buildCorrectivePrompt = (issues: string[]) => `Your previous curriculum for "${sanitizeForPrompt(goal, 120)}" was REJECTED. Fix EVERY issue below and regenerate the COMPLETE curriculum:
${issues.slice(0, 12).map((i) => `- ${i}`).join('\n')}

Keep the SAME JSON shape and all prior rules: ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases (beginner->expert), ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules each, ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons each, unique specific titles, real backward prerequisite chains, specific skillTags, topic-matched reputable resources, and a rising project ladder (mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone). Return ONLY the JSON object.`;

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const prompt = attempt === 0 ? buildRoadmapPrompt() : buildCorrectivePrompt(bestCandidate ? validateCurriculumQuality(bestCandidate.parsed).issues : []);
      let parsed: any;
      try {
        const response = await callGroqChatCompletion(prompt, { temperature: attempt === 0 ? 0.5 : 0.35, asJSON: true, timeoutMs: 30000, maxTokens: 8000 });
        parsed = cleanAndParseJSON(response, '{}');
      } catch (genErr: any) {
        logger.warn({ attempt: attempt + 1, err: genErr.message }, '[Roadmap] Generation attempt failed');
        continue;
      }

      if (!parsed?.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
        logger.warn({ attempt: attempt + 1 }, '[Roadmap] Attempt returned no usable phases');
        continue;
      }

      const quality = validateCurriculumQuality(parsed);
      logger.debug({ attempt: attempt + 1, score: quality.score, issues: quality.issues.length }, '[Roadmap] Quality score');
      if (!bestCandidate || quality.score > bestCandidate.score) bestCandidate = { parsed, score: quality.score };

      if (quality.ok) {
        const normalized = validateAndNormalizeCurriculum(parsed, meta);
        logCurriculumStats('AI-Generated', normalized);
        return res.json(normalized);
      }
      if (attempt < MAX_RETRIES) logger.warn({ issues: quality.issues.slice(0, 5) }, '[Roadmap] Retrying with corrective prompt');
    }

    if (bestCandidate && bestCandidate.score >= 60 && Array.isArray(bestCandidate.parsed.phases)) {
      logger.warn({ score: bestCandidate.score }, '[Roadmap] All retries had issues; using best candidate after normalization');
      const normalized = validateAndNormalizeCurriculum(bestCandidate.parsed, meta);
      logCurriculumStats('AI-Best-Candidate', normalized);
      return res.json(normalized);
    }

    throw new Error('All generation attempts failed the quality gate');
  } catch (error: any) {
    let readableError = error.message || String(error);
    try { const pe = JSON.parse(error.message); if (pe?.error?.message) readableError = pe.error.message; } catch (_) {}
    logger.error({ err: readableError }, '[Roadmap] Generation failed, using offline fallback');
    // Pass meta (which includes roadmapId) so fallback IDs are also scoped.
    const fallbackRoadmap = buildFallbackCurriculum(meta);
    logCurriculumStats('AI-Fallback', fallbackRoadmap);
    return res.json(fallbackRoadmap);
  }
});

// ---------------------------------------------------------------------------
// SSE streaming endpoint — emits phase names as the AI builds the roadmap,
// then sends the complete roadmap as the final event.
// Client receives: data: {"type":"phase","name":"..."}\n\n  ...repeated...
//                  data: {"type":"done","roadmap":{...}}\n\n
//                  data: {"type":"error","message":"..."}\n\n  (on hard fail)
// ---------------------------------------------------------------------------
router.post('/generate-roadmap-stream', requireAuth, roadmapGenLimiter, aiLimiter, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;
  if (!goal) { res.status(400).json({ error: 'Goal is required', code: 'MISSING_GOAL' }); return; }

  // Set up SSE headers.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering
  });

  const send = (payload: object) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Hard 90-second timeout — 3 Groq calls × 30s each at most.
  // Without this, a stalled Groq connection can hold the SSE open indefinitely,
  // exhausting Express workers and the DB connection pool.
  const streamTimeout = setTimeout(() => {
    logger.warn({ goal }, '[Roadmap-Stream] Hard timeout reached — sending fallback and closing');
    const fallback = buildFallbackCurriculum({ goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year, roadmapId: `roadmap-${randomUUID()}` });
    send({ type: 'done', roadmap: fallback, fallback: true, timedOut: true });
    if (!res.writableEnded) res.end();
  }, 90_000);

  // Pre-generate the roadmapId so validateAndNormalizeCurriculum scopes all child IDs to it.
  const roadmapId = `roadmap-${randomUUID()}`;
  const meta = { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year, roadmapId };

  // Emit the detected domain / phase plan upfront so the UI can show names
  // immediately, before the AI even responds.
  const { buildFallbackCurriculum: _bfc, ...curriculumExports } = await import('../lib/curriculum');
  const { detectGoalDomain: _dgd, getDomainPhasePlan: _gdpp } = curriculumExports as any;

  // We re-use the same generation logic as the non-streaming endpoint but emit
  // phase names as they are extracted from the parsed JSON.
  const sanitized = sanitizeForPrompt;
  const universityContext = college && branch && year
    ? `\nLearner is a ${sanitized(year)} student at ${sanitized(college)} studying ${sanitized(branch)}; align topics and ordering with their university syllabus (AKTU where applicable).`
    : '';
  const indiaContext = `\nAudience: Indian college/engineering learners. Flow like a semester (foundations -> core -> applied -> advanced -> specialization), blend theory with heavy coding, and include placement skills (DSA, system design, projects). Prefer globally-recognized resources.`;

  const buildRoadmapPrompt = () => `You are a senior curriculum architect. Design a DEEP, degree-level learning curriculum for: "${sanitized(goal)}".
Learner level: "${sanitized(experienceLevel || 'Beginner')}". Pace: ${sanitized(weeklyHours || 5)} hrs/week. Style: "${sanitized(preferredStyle || 'Hands-on')}".${universityContext}${indiaContext}

STRUCTURE (mandatory, never under-deliver):
- ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases; difficulty rises monotonically beginner -> intermediate -> advanced -> expert.
- ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules per phase (difficulty rises within the phase).
- ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons per module (metadata only, NO lesson content/markdown/quizzes).

NAMING & QUALITY:
- Titles must be specific and domain-accurate (e.g. "Implementing Binary Search Trees"), never generic ("Introduction","Basics","Overview","Module 1","Project").
- No duplicate lesson titles or module names anywhere. Descriptions: one concise, concrete sentence.
- Order concepts logically (fundamentals first). Only reference real technologies; do not hallucinate.

LESSON FIELDS: id "les-{phase}-{module}-{n}" (unique); name; description; learningObjectives (2-4 measurable outcomes, each a full phrase); prerequisites (1-3 EARLIER lesson ids forming a real chain, first lesson []); skillTags (2-5 specific lowercase tags like python,numpy,react,sql — never "basics"/"concepts"); difficulty beginner|intermediate|advanced; estimatedMinutes ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}; type "learn"; status "available" for the FIRST lesson only else "locked"; contentStatus "pending".

MODULE FIELDS: id "mod-{phase}-{n}"; name; description; difficulty; estimatedHours 3-8; resources 2-4. Each resource: id, type documentation|video|practice|book, title, provider, url (real https), description. PREFER official documentation, official learning resources, high-quality YouTube playlists, interactive practice platforms, and well-known books; AVOID random blogs. Resources MUST match the module topic.

PHASE FIELDS: id "ph-{n}"; name; description; estimatedHours 10-30; difficulty; skillsCovered (3-6 tags); projects (>=1). Projects reinforce that phase's concepts and get harder across phases using this ladder: mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone. Each project: id, title, difficulty (one ladder value), description (2-3 sentences), techStack (real tools), features (3-6 concrete), progress 0.

Return ONLY a JSON object of this exact shape (one example element shown per array; produce the full required counts):
{"goal":${JSON.stringify(sanitized(goal, 120))},"phases":[{"id":"ph-1","name":"...","description":"...","estimatedHours":18,"difficulty":"beginner","skillsCovered":["..."],"modules":[{"id":"mod-1-1","name":"...","description":"...","difficulty":"beginner","estimatedHours":5,"lessons":[{"id":"les-1-1-1","name":"...","description":"...","learningObjectives":["...","..."],"prerequisites":[],"skillTags":["...","..."],"difficulty":"beginner","estimatedMinutes":25,"type":"learn","status":"available","contentStatus":"pending"}],"resources":[{"id":"res-1-1-1","title":"...","type":"documentation","provider":"...","url":"https://...","description":"..."}]}],"projects":[{"id":"proj-1","title":"...","difficulty":"mini-exercise","description":"...","techStack":["..."],"features":["..."],"progress":0}]}]}`;

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const prompt = attempt === 0
        ? buildRoadmapPrompt()
        : `Your previous curriculum for "${sanitized(goal, 120)}" was REJECTED. Fix EVERY issue below and regenerate the COMPLETE curriculum:\n${(validateCurriculumQuality(bestCandidate!.parsed).issues.slice(0, 12).map((i: string) => `- ${i}`).join('\n'))}\n\nKeep the SAME JSON shape and all prior rules. Return ONLY the JSON object.`;

      let parsed: any;
      try {
        const response = await callGroqChatCompletion(prompt, { temperature: attempt === 0 ? 0.5 : 0.35, asJSON: true, timeoutMs: 30000, maxTokens: 8000 });
        parsed = cleanAndParseJSON(response, '{}');
      } catch (genErr: any) {
        logger.warn({ attempt: attempt + 1, err: genErr.message }, '[Roadmap-Stream] Generation attempt failed');
        continue;
      }

      if (!parsed?.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) continue;

      // Emit phase names as soon as we have them.
      for (const phase of parsed.phases) {
        if (phase?.name) send({ type: 'phase', name: String(phase.name) });
      }

      const quality = validateCurriculumQuality(parsed);
      if (!bestCandidate || quality.score > bestCandidate.score) bestCandidate = { parsed, score: quality.score };
      if (quality.ok) break;
    }

    const finalParsed = (bestCandidate && bestCandidate.score >= 60 && Array.isArray(bestCandidate.parsed.phases))
      ? bestCandidate.parsed
      : null;

    if (finalParsed) {
      const normalized = validateAndNormalizeCurriculum(finalParsed, meta);
      logCurriculumStats('AI-Stream', normalized);
      send({ type: 'done', roadmap: normalized });
    } else {
      throw new Error('All generation attempts failed the quality gate');
    }
  } catch (error: any) {
    logger.error({ err: error.message }, '[Roadmap-Stream] Falling back to local curriculum');
    const fallbackRoadmap = buildFallbackCurriculum(meta);
    // Emit fallback phase names so the UI still animates.
    for (const phase of fallbackRoadmap.phases || []) {
      if (phase?.name) send({ type: 'phase', name: String(phase.name) });
    }
    logCurriculumStats('AI-Stream-Fallback', fallbackRoadmap);
    send({ type: 'done', roadmap: fallbackRoadmap, fallback: true });
  } finally {
    clearTimeout(streamTimeout);
    if (!res.writableEnded) res.end();
  }
});

// Get all roadmaps for a user
// Supports optional pagination: ?limit=20&offset=0
// Default limit is 20; max enforced at 100 to prevent large reconstructions.
router.get('/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  try {
    const { roadmaps, total } = await getUserRoadmapsReconstructed(userEmail, { limit, offset });
    return res.json({ roadmaps, total, limit, offset });
  } catch (error) {
    logger.error({ err: error }, 'Get roadmaps error');
    return res.status(503).json({ error: 'Could not load roadmaps. Please retry.', code: 'ROADMAPS_FAILED' });
  }
});

// Get single roadmap
router.get('/roadmaps/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const roadmap = await reconstructRoadmapJson(roadmapId, userEmail);
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });
    // Ownership check — return 404 (not 403) to avoid roadmap ID enumeration.
    if (roadmap.ownerEmail?.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });
    }

    const workspaceRoadmap = {
      ...roadmap,
      phases: roadmap.phases.map((phase: any) => ({
        ...phase,
        levels: phase.levels?.map((level: any) => ({
          ...level,
          topics: level.lessons?.map((lesson: any) => ({
            id: lesson.id, name: lesson.name, type: lesson.type,
            status: lesson.status, xpReward: lesson.xpReward, estimatedTime: lesson.estimatedMinutes ?? 15
          }))
        }))
      }))
    };
    return res.json({ roadmap: workspaceRoadmap });
  } catch (error) {
    logger.error({ err: error }, 'Get roadmap error');
    return res.status(500).json({ error: 'Failed to load roadmap', code: 'ROADMAP_LOAD_FAILED' });
  }
});

// Delete roadmap
router.delete('/roadmaps/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.supabaseUser!.email;
  try {
    const owned = await getRoadmapsByOwner(userEmail);
    if (!owned.some((r: any) => r.id === id)) return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });
    const deleted = await deleteRoadmap(id);
    if (deleted === 0) return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });
    return res.json({ success: true, deletedId: id });
  } catch (error) {
    logger.error({ err: error }, 'Delete roadmap error');
    return res.status(500).json({ error: 'Failed to delete roadmap. Database unavailable.', code: 'ROADMAP_DELETE_FAILED' });
  }
});

// Create roadmap
router.post('/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;
  const roadmap = req.body;
  if (!roadmap || !roadmap.id || !roadmap.goal) return res.status(400).json({ error: 'Valid roadmap object with id and goal is required', code: 'INVALID_ROADMAP' });
  try {
    // Check BEFORE inserting so we know if this is the user's first roadmap.
    const existingBefore = await getRoadmapsByOwner(userEmail);

    const phaseCount = Array.isArray(roadmap.phases) ? roadmap.phases.length : 0;
    logger.info({ roadmapId: roadmap.id, phaseCount }, '[Roadmap] Saving roadmap');
    await createRoadmapFromJson(userEmail, roadmap);

    // Return the incoming roadmap data directly — no post-write re-read needed.
    // A PgBouncer transaction-mode pool may route the immediate SELECT to a
    // different backend before the INSERTs are visible, producing a false empty.
    // The client will get the authoritative list on the next GET /api/roadmaps.
    const saved = { ...roadmap, ownerEmail: userEmail };

    // Unlock "Roadmap Builder" on first roadmap creation.
    let newAchievement: { id: string; name: string; icon: string; xpReward: number } | null = null;
    if (existingBefore.length === 0) {
      newAchievement = await unlockAchievement(userEmail, 'ach-3');
    }

    return res.json({ success: true, roadmap: saved, newAchievement });
  } catch (error) {
    logger.error({ err: error }, 'Create roadmap error');
    return res.status(500).json({ error: 'Failed to create roadmap', code: 'ROADMAP_CREATE_FAILED' });
  }
});

// Update roadmap
router.post('/update-roadmap', requireAuth, async (req, res) => {
  const { roadmapId, updates } = req.body;
  const userEmail = req.supabaseUser!.email;
  if (!roadmapId || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'roadmapId and updates object are required', code: 'INVALID_UPDATE' });

  // progressPercent, totalXp, and lessonsCompleted are computed server-side only —
  // removing them from the mutable set prevents clients from spoofing progress.
  const ROADMAP_MUTABLE_FIELDS = new Set(['title', 'goal', 'hoursRemaining', 'phases', 'resources', 'projects', 'quizzes']);
  const forbidden = Object.keys(updates).filter((k) => !ROADMAP_MUTABLE_FIELDS.has(k));
  if (forbidden.length > 0) return res.status(400).json({ error: `Cannot update field(s): ${forbidden.join(', ')}`, code: 'FORBIDDEN_FIELDS' });

  try {
    const existing = await getRoadmapsByOwner(userEmail);
    if (!existing.some((r: any) => r.id === roadmapId)) return res.status(404).json({ error: 'Roadmap not found', code: 'ROADMAP_NOT_FOUND' });

    const roadmapPatch: any = {};
    for (const key of Object.keys(updates)) {
      const uVal = (updates as any)[key];
      switch (key) {
        case 'title': roadmapPatch.title = uVal; break;
        case 'goal': roadmapPatch.goal = uVal; break;
        case 'hoursRemaining': roadmapPatch.hoursRemaining = uVal; break;
        case 'status': roadmapPatch.status = uVal; break;
        case 'resources':
          for (const r of Array.isArray(uVal) ? uVal : []) {
            await upsertResource({ id: r.id || `res-${roadmapId}-${r.title}`, roadmapId, phaseId: r.phaseId ?? null, moduleId: r.moduleId ?? null, title: r.title, type: r.type, provider: r.provider ?? null, url: r.url ?? null, description: r.description ?? null, duration: r.duration ?? null });
          }
          break;
        case 'projects':
          for (const p of Array.isArray(uVal) ? uVal : []) {
            await upsertPhaseProject({ id: p.id || `proj-${roadmapId}-${p.title}`, roadmapId, phaseId: p.phaseId ?? null, title: p.title, difficulty: p.difficulty, description: p.description ?? null, techStack: p.techStack, features: p.features, githubUrl: p.githubUrl ?? null, progress: p.progress });
          }
          break;
      }
    }

    if (Object.keys(roadmapPatch).length > 0) {
      const existingRoadmap = existing.find((r: any) => r.id === roadmapId);
      await upsertRoadmap({ id: roadmapId, ownerEmail: userEmail.toLowerCase(), goal: existingRoadmap?.goal || roadmapPatch.goal || '', ...roadmapPatch });
    }

    const updated = await reconstructRoadmapJson(roadmapId, userEmail);
    return res.json({ success: true, roadmap: updated });
  } catch (error) {
    logger.error({ err: error }, 'Update roadmap error');
    return res.status(500).json({ error: 'Failed to update roadmap', code: 'ROADMAP_UPDATE_FAILED' });
  }
});

// Validate progression
router.post('/validate-progression', requireAuth, async (req, res) => {
  const { roadmap } = req.body;
  if (!roadmap) return res.status(400).json({ error: 'Roadmap data is required', code: 'MISSING_ROADMAP' });

  // Guard against crafted payloads with thousands of lessons causing O(N²) CPU spikes.
  const phaseCount = Array.isArray(roadmap.phases) ? roadmap.phases.length : 0;
  let totalLessonCount = 0;
  for (const ph of roadmap.phases || []) {
    for (const lv of ph.levels || []) {
      totalLessonCount += Array.isArray(lv.lessons) ? lv.lessons.length : 0;
    }
  }
  if (phaseCount > 20 || totalLessonCount > 2000) {
    return res.status(400).json({ error: 'Roadmap exceeds maximum size for validation', code: 'ROADMAP_TOO_LARGE' });
  }

  const validation = { hasGaps: false, gaps: [], prerequisitesMet: true, missingPrerequisites: [], quizMatchesContent: true, mismatchedQuizzes: [] };

  if (roadmap?.phases) {
    const allLessons: any[] = [];
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          allLessons.push({ ...lesson, phaseId: phase.id, levelId: level.id });
        }
      }
    }

    const completedBeforeAvailable = (lesson: any, idx: number) =>
      allLessons.slice(0, idx).some((l, i) => allLessons[i].status === 'completed' && lesson.status === 'available');

    const gaps: any[] = [];
    const missingPrerequisites: string[] = [];

    allLessons.forEach((lesson, idx) => {
      if (lesson.status === 'locked' && completedBeforeAvailable(lesson, idx)) gaps.push({ lessonId: lesson.id, reason: 'Locked lesson after completed lessons' });
      if (lesson.type === 'quiz' && lesson.status === 'available') {
        const hasLearnBefore = allLessons.slice(0, idx).some(l => l.type === 'learn' && l.status === 'completed');
        if (!hasLearnBefore) gaps.push({ lessonId: lesson.id, reason: 'Quiz unlocked without prior learning' });
      }
      if (lesson.prerequisites) {
        lesson.prerequisites.forEach((prereq: string) => {
          const prereqExists = allLessons.some(l => l.id === prereq);
          const prereqCompleted = allLessons.some(l => l.id === prereq && l.status === 'completed');
          if (!prereqExists) missingPrerequisites.push(`${lesson.id}: missing ${prereq}`);
          else if (!prereqCompleted && lesson.status === 'available') missingPrerequisites.push(`${lesson.id}: ${prereq} not completed`);
        });
      }
    });

    (validation as any).hasGaps = gaps.length > 0;
    (validation as any).gaps = gaps;
    (validation as any).prerequisitesMet = missingPrerequisites.length === 0;
    (validation as any).missingPrerequisites = missingPrerequisites;
  }

  return res.json(validation);
});

export default router;
