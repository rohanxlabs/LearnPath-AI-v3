import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { requireAuth, aiLimiter, aiDailyQuota, roadmapGenLimiter, createLimiter } from '../lib/middleware';
import { loadUserDB, unlockAchievement } from '../lib/db';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';
import {
  reconstructRoadmapJson,
  getRoadmapsByOwner,
  getUserSkills,
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
  createCurriculumPlan,
  buildFallbackCurriculumIntent,
  calculateCurriculumBudget,
  buildCurriculumGenerationPrompt,
  buildCurriculumRetryPrompt,
  type CurriculumBudget,
} from '../lib/curriculum';
import { callGroqChatCompletion, cleanAndParseJSON } from '../lib/ai';
import { backfillUserSkillStatesBestEffort } from '../lib/skillCalibration';
import { buildLearnerContext, type LearnerContext } from '../lib/curriculumPersonalization';

const router = Router();
const resourcePreviewLimiter = createLimiter({ windowMs: 60_000, max: 20, message: { error: 'Too many resource previews. Please try again shortly.' } });
const resourcePreviewCache = new Map<string, { expires: number; data: Record<string, string | null> }>();

async function createPersonalizedGenerationPlan(ownerEmail: string, goal: string, requested: {
  experienceLevel?: string; weeklyHours?: number | string; preferredStyle?: string;
}) {
  let profile: any = null;
  let skills: any[] = [];
  const [userDataResult, skillsResult] = await Promise.allSettled([
    loadUserDB(ownerEmail, { createIfMissing: false }),
    getUserSkills(ownerEmail),
  ]);
  if (userDataResult.status === 'fulfilled') profile = userDataResult.value?.progress?.profile?.learnerProfile || null;
  else logger.warn({ err: userDataResult.reason }, '[Roadmap] Could not load learner profile; using request context only');
  if (skillsResult.status === 'fulfilled') skills = skillsResult.value;
  else logger.warn({ err: skillsResult.reason }, '[Roadmap] Could not load calibrated skills; using conservative knowledge assumptions');

  // Existing users may have event history that has not yet been replayed into
  // the existing calibration table. Reuse that system's best-effort backfill.
  if (skills.length === 0 && skillsResult.status === 'fulfilled') {
    await backfillUserSkillStatesBestEffort(ownerEmail);
    try { skills = await getUserSkills(ownerEmail); } catch { /* personalization remains conservative */ }
  }

  const experienceLevel = requested.experienceLevel || profile?.background?.experienceLevel || 'Beginner';
  const weeklyHours = requested.weeklyHours ?? profile?.preferences?.weeklyHours;
  const preferredStyle = requested.preferredStyle || profile?.preferences?.learningStyle;
  const { intent, budget } = await createCurriculumPlan(goal, experienceLevel);
  const learnerContext = buildLearnerContext({ intent, skills, profile, experienceLevel, weeklyHours, preferredStyle });
  return { intent, budget, learnerContext, experienceLevel, weeklyHours, preferredStyle };
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  return true;
}

async function validatePreviewUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && Number(url.port) !== (url.protocol === 'https:' ? 443 : 80))) throw new Error('Unsupported URL');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal' || host === 'metadata.azure.internal' || host === 'instance-data') throw new Error('Private host is not allowed');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('Private host is not allowed');
  return url;
}

function readMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const match = tag.match(new RegExp(`(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i')) || tag.match(new RegExp(`content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'));
    if (match?.[1]) return match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 600);
  }
  return null;
}

export function extractResourceMetadata(html: string, target: URL) {
  return {
    title: readMeta(html, 'og:title') || readMeta(html, 'twitter:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').slice(0, 300) || null,
    description: readMeta(html, 'og:description') || readMeta(html, 'twitter:description') || readMeta(html, 'description'),
    image: readMeta(html, 'og:image') || readMeta(html, 'twitter:image'),
    publisher: readMeta(html, 'og:site_name') || target.hostname,
    author: readMeta(html, 'author'),
  };
}

async function requestPublicHtml(target: URL): Promise<{ status: number; contentType: string; location: string | undefined; html: string }> {
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  const publicAddress = addresses.find(address => !isPrivateAddress(address.address));
  if (!publicAddress || addresses.some(address => isPrivateAddress(address.address))) throw new Error('Private host is not allowed');
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(target, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'LearnPathResourcePreview/1.0' },
      servername: isIP(host) ? undefined : host,
      lookup: (_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, publicAddress.address, publicAddress.family),
    } as any, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 1_000_000) { req.destroy(new Error('Preview too large')); return; }
        chunks.push(buffer);
      });
      response.on('end', () => resolve({ status: response.statusCode || 0, contentType: String(response.headers['content-type'] || ''), location: response.headers.location, html: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Preview request timed out')));
    req.on('error', reject);
    req.end();
  });
}

router.get('/resources/preview', requireAuth, resourcePreviewLimiter, async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw || raw.length > 2048) return res.status(400).json({ error: 'A valid URL is required.' });
  const cached = resourcePreviewCache.get(raw);
  if (cached && cached.expires > Date.now()) return res.json(cached.data);
  try {
    let target = await validatePreviewUrl(raw);
    let response: { status: number; contentType: string; location: string | undefined; html: string } | null = null;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await requestPublicHtml(target);
      if (response.status < 300 || response.status >= 400) break;
      const location = response.location;
      if (!location || redirects === 3) throw new Error('Too many redirects');
      target = await validatePreviewUrl(new URL(location, target).toString());
    }
    if (!response || response.status < 200 || response.status >= 300 || !/text\/html|application\/xhtml\+xml/i.test(response.contentType)) throw new Error('Preview unavailable');
    const parsed = extractResourceMetadata(response.html, target);
    let image: string | null = null;
    if (parsed.image) { try { const candidate = await validatePreviewUrl(new URL(parsed.image, target).toString()); image = candidate.toString(); } catch { /* omit malformed or private image URLs */ } }
    const metadata = { title: parsed.title, description: parsed.description, image, publisher: parsed.publisher, author: parsed.author };
    resourcePreviewCache.set(raw, { expires: Date.now() + 60 * 60 * 1000, data: metadata });
    if (resourcePreviewCache.size > 500) resourcePreviewCache.delete(resourcePreviewCache.keys().next().value!);
    return res.json(metadata);
  } catch {
    return res.status(422).json({ error: 'Could not load resource preview.' });
  }
});

// Generate roadmap
router.post('/generate-roadmap', requireAuth, aiDailyQuota, roadmapGenLimiter, aiLimiter, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required', code: 'MISSING_GOAL' });

  // Generate a stable roadmapId before calling the AI so validateAndNormalizeCurriculum
  // can prefix all child IDs (ph-1, mod-1-1, les-1-1-1) with it, making them globally
  // unique across every roadmap the user creates.
  const roadmapId = `roadmap-${randomUUID()}`;
  const plan = await createPersonalizedGenerationPlan(req.supabaseUser!.email, goal, { experienceLevel, weeklyHours, preferredStyle });
  const { intent, budget, learnerContext } = plan;
  const meta = { goal, experienceLevel: plan.experienceLevel, weeklyHours: plan.weeklyHours, preferredStyle: plan.preferredStyle, college, branch, year, roadmapId };

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  Sentry.setTag('feature', 'roadmap-generation');
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const issues = bestCandidate ? validateCurriculumQuality(bestCandidate.parsed, budget, intent, learnerContext).issues : [];
      const prompt = attempt === 0
        ? buildCurriculumGenerationPrompt({ goal, experienceLevel: plan.experienceLevel, weeklyHours: plan.weeklyHours, preferredStyle: plan.preferredStyle, college, branch, year, budget, intent, learnerContext })
        : buildCurriculumRetryPrompt(goal, budget, issues, intent, learnerContext);
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

      const quality = validateCurriculumQuality(parsed, budget, intent, learnerContext);
      logger.debug({ attempt: attempt + 1, score: quality.score, issues: quality.issues.length }, '[Roadmap] Quality score');
      if (!bestCandidate || quality.score > bestCandidate.score) bestCandidate = { parsed, score: quality.score };

      if (quality.ok) {
        const normalized = validateAndNormalizeCurriculum(parsed, meta, budget);
        logCurriculumStats('AI-Generated', normalized);
        return res.json(normalized);
      }
      if (attempt < MAX_RETRIES) logger.warn({ issues: quality.issues.slice(0, 5) }, '[Roadmap] Retrying with corrective prompt');
    }

    throw new Error('All generation attempts failed the quality gate');
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    let readableError = errMsg;
    try { const pe = JSON.parse(errMsg); if (pe?.error?.message) readableError = pe.error.message; } catch (_) {}
    logger.error({ err: readableError }, '[Roadmap] Generation failed, using offline fallback');
    Sentry.captureException(error);
    // Pass meta (which includes roadmapId) so fallback IDs are also scoped.
    const fallbackRoadmap = buildFallbackCurriculum(meta, budget, intent, learnerContext);
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
router.post('/generate-roadmap-stream', requireAuth, aiDailyQuota, roadmapGenLimiter, aiLimiter, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;
  if (!goal) { res.status(400).json({ error: 'Goal is required', code: 'MISSING_GOAL' }); return; }
  let intent = buildFallbackCurriculumIntent(goal);
  let budget = calculateCurriculumBudget({ level: experienceLevel, scope: intent.scope, goal });
  let learnerContext: LearnerContext | undefined;
  const roadmapId = `roadmap-${randomUUID()}`;
  let meta = { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year, roadmapId };

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

  // Heartbeat — keeps the Nginx/Render proxy from closing an idle SSE connection
  // while Groq is generating.  Proxies typically close idle connections after
  // 30–60 s with no bytes written.  An SSE comment (":" prefix) is valid per
  // the spec and ignored by clients — it purely prevents the proxy idle timeout.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15_000);

  // Hard 90-second timeout — 3 Groq calls × 30s each at most.
  // Without this, a stalled Groq connection can hold the SSE open indefinitely,
  // exhausting Express workers and the DB connection pool.
  const streamTimeout = setTimeout(() => {
    logger.warn({ goal }, '[Roadmap-Stream] Hard timeout reached — sending fallback and closing');
    const fallback = buildFallbackCurriculum(meta, budget, intent, learnerContext);
    send({ type: 'done', roadmap: fallback, fallback: true, timedOut: true });
    if (!res.writableEnded) res.end();
  }, 90_000);

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  Sentry.setTag('feature', 'roadmap-generation');
  try {
    const plan = await createPersonalizedGenerationPlan(req.supabaseUser!.email, goal, { experienceLevel, weeklyHours, preferredStyle });
    intent = plan.intent;
    budget = plan.budget;
    learnerContext = plan.learnerContext;
    meta = { goal, experienceLevel: plan.experienceLevel, weeklyHours: plan.weeklyHours, preferredStyle: plan.preferredStyle, college, branch, year, roadmapId };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const issues = bestCandidate ? validateCurriculumQuality(bestCandidate.parsed, budget, intent, learnerContext).issues : [];
      const prompt = attempt === 0
        ? buildCurriculumGenerationPrompt({ goal, experienceLevel: plan.experienceLevel, weeklyHours: plan.weeklyHours, preferredStyle: plan.preferredStyle, college, branch, year, budget, intent, learnerContext })
        : buildCurriculumRetryPrompt(goal, budget, issues, intent, learnerContext);

      let parsed: any;
      try {
        const response = await callGroqChatCompletion(prompt, { temperature: attempt === 0 ? 0.5 : 0.35, asJSON: true, timeoutMs: 30000, maxTokens: 8000 });
        parsed = cleanAndParseJSON(response, '{}');
      } catch (genErr: any) {
        logger.warn({ attempt: attempt + 1, err: genErr.message }, '[Roadmap-Stream] Generation attempt failed');
        continue;
      }

      if (!parsed?.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) continue;

      const quality = validateCurriculumQuality(parsed, budget, intent, learnerContext);
      if (!bestCandidate || quality.score > bestCandidate.score) bestCandidate = { parsed, score: quality.score };
      if (quality.ok) {
        for (const phase of parsed.phases) if (phase?.name) send({ type: 'phase', name: String(phase.name) });
        break;
      }
    }

    const finalParsed = bestCandidate && validateCurriculumQuality(bestCandidate.parsed, budget, intent, learnerContext).ok
      ? bestCandidate.parsed : null;

    if (finalParsed) {
      const normalized = validateAndNormalizeCurriculum(finalParsed, meta, budget);
      logCurriculumStats('AI-Stream', normalized);
      send({ type: 'done', roadmap: normalized });
    } else {
      throw new Error('All generation attempts failed the quality gate');
    }
  } catch (error: unknown) {
    logger.error({ err: (error instanceof Error ? error.message : String(error)) }, '[Roadmap-Stream] Falling back to local curriculum');
    Sentry.captureException(error);
    const fallbackRoadmap = buildFallbackCurriculum(meta, budget, intent, learnerContext);
    // Emit fallback phase names so the UI still animates.
    for (const phase of fallbackRoadmap.phases || []) {
      if (phase?.name) send({ type: 'phase', name: String(phase.name) });
    }
    logCurriculumStats('AI-Stream-Fallback', fallbackRoadmap);
    send({ type: 'done', roadmap: fallbackRoadmap, fallback: true });
  } finally {
    clearInterval(heartbeat);
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
  Sentry.setTag('feature', 'roadmap-generation');
  try {
    const { roadmaps, total } = await getUserRoadmapsReconstructed(userEmail, { limit, offset });
    return res.json({ roadmaps, total, limit, offset });
  } catch (error) {
    logger.error({ err: error }, 'Get roadmaps error');
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
