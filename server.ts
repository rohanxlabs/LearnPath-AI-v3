import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');
import express from 'express';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { createServer as createViteServer } from 'vite';

// In-memory cache for AI recommendations (5 minute TTL)
type RecCacheEntry = {
  data: any;
  timestamp: number;
};
const recCache: Map<string, RecCacheEntry> = new Map();
const REC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-memory cache for roadmap lookups (short TTL, invalidated on write)
type RoadmapCacheEntry = {
  data: any[];
  timestamp: number;
};
const roadmapCache: Map<string, RoadmapCacheEntry> = new Map();
const ROADMAP_CACHE_TTL = 30 * 1000; // 30 seconds

// Per-user write lock: serializes read-modify-write cycles (complete-lesson,
// profile updates, streak updates) for the same user so concurrent requests
// cannot clobber each other (lost-update race on the single JSONB column).
// Re-entrancy is tracked via AsyncLocalStorage so a NESTED call (e.g. saveUserDB
// invoked from within an already-locked handler) runs inline, while a CONCURRENT
// request for the same user correctly waits its turn.
import { AsyncLocalStorage } from 'node:async_hooks';
const userLocks: Map<string, Promise<void>> = new Map();
const lockContext = new AsyncLocalStorage<string>();

async function withUserLock<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const key = email.toLowerCase();
  const heldKey = lockContext.getStore();

  // Nested acquisition within the same async execution that already holds the
  // lock for this user -> run synchronously (no deadlock, no double queue).
  if (heldKey === key) {
    return fn();
  }

  const previous = userLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  userLocks.set(key, previous.then(() => next));
  let result: T;
  try {
    result = await lockContext.run(key, async () => {
      await previous;
      return await fn();
    });
  } finally {
    release();
    if (userLocks.get(key) === previous.then(() => next)) {
      userLocks.delete(key);
    }
  }
  return result;
}
import { neon } from '@neondatabase/serverless';
import {
  ensureRoadmapTables,
  migrateRoadmapJsonToTables,
  reconstructRoadmapJson,
  findLessonContext,
  getLessonById,
  upsertLessonContent,
  deleteRoadmap,
  createRoadmapFromJson,
  getUserRoadmapsReconstructed,
  getRoadmapsByOwner,
  upsertRoadmap,
  upsertResource,
  upsertPhaseProject,
  recomputeRoadmapCounters,
  completeLessonForUser,
  incrementLessonAttempts,
  getLessonProgress,
  getCurrentStreak,
  getRoadmapProgressPercent,
  getRoadmapProgressSnapshot,
  upsertRoadmapState,
  getRoadmapState,
  getUserLessonCompletionStats
} from './src/server/db/schema';
import bcrypt from 'bcryptjs';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';

// Lightweight HTTP error used to propagate status codes out of locked closures.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Input validation helpers (email format + password strength policy).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 254;
}
function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

const sql = neon(process.env.DATABASE_URL!);

// Separate pg Pool used only for the persistent session store (connect-pg-simple
// requires a Pool, whereas the app's data layer uses the serverless `neon` client).
const PgStore = connectPgSimple(session);
let sessionStore: any;
try {
  const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  sessionStore = new PgStore({ pool: pgPool, createTableIfMissing: true });
  console.log('[Session] Using PostgreSQL-backed persistent session store');
} catch (err) {
  console.warn('[Session] Falling back to in-memory store:', (err as Error).message);
  sessionStore = undefined;
}

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

declare module 'express-session' {
  interface SessionData {
    userEmail?: string;
  }
}

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(session({
  store: sessionStore,
  name: 'learnpath.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Rate limiter factory.
//
// Uses express-rate-limit's built-in in-memory store by default, which preserves
// the original single-instance behaviour exactly. To support horizontal scaling,
// a shared store (e.g. Redis) can be injected by assigning `RATE_LIMIT_STORE`
// before this module is imported/evaluated — no other change required. When the
// store is undefined the default memory store is used, so local development needs
// no extra dependency and no Redis connection.
//   // example (future): RATE_LIMIT_STORE = new RedisStore({ ... });
let RATE_LIMIT_STORE: any | undefined;

function createLimiter(opts: {
  windowMs: number;
  max: number;
  message: { error: string };
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: opts.message,
    ...(RATE_LIMIT_STORE ? { store: RATE_LIMIT_STORE } : {})
  });
}

// Limiter options are unchanged; only the store resolution is now swappable.
const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please slow down.' }
});

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Resilient JSON cleaner and parser.
//
// Free-tier models frequently wrap JSON in prose/markdown, leave trailing commas,
// or get truncated mid-object. This attempts, in order: direct parse, trailing-comma
// removal, boundary slicing, and finally a truncation-repair pass that closes any
// dangling strings/brackets/braces so a partially-streamed object is still usable.
function cleanAndParseJSON(rawText: string | null | undefined, fallbackDefault: string = '{}'): any {
  const fallbackVal = (() => {
    try {
      return JSON.parse(fallbackDefault || '{}');
    } catch (_) {
      return {};
    }
  })();

  if (!rawText) return fallbackVal;

  let cleaned = rawText.trim();

  // Strip markdown code fences if present (```json ... ```).
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();

  // Fast path.
  const directOrRepaired = tryParseWithRepairs(cleaned);
  if (directOrRepaired !== undefined) return directOrRepaired;

  // Boundary slice: keep only the outermost { } or [ ] region.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  let sliceStr = '';
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    sliceStr = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    sliceStr = cleaned.slice(firstBracket, lastBracket + 1);
  }
  if (sliceStr) {
    const sliced = tryParseWithRepairs(sliceStr);
    if (sliced !== undefined) return sliced;
  }

  // Truncation repair: model was likely cut off. Close the structure from the
  // last complete opening brace/bracket.
  const truncated = repairTruncatedJson(firstBrace !== -1 ? cleaned.slice(firstBrace) : cleaned);
  if (truncated !== undefined) return truncated;

  console.warn('[JSON Clean] All repair strategies failed. Returning fallback.');
  return fallbackVal;
}

// Attempt to parse, first as-is and then after removing trailing commas.
// Returns `undefined` (never a value) when parsing is impossible.
function tryParseWithRepairs(text: string): any {
  try {
    return JSON.parse(text);
  } catch (_) {
    try {
      return JSON.parse(text.replace(/,\s*([}\]])/g, '$1'));
    } catch (_) {
      return undefined;
    }
  }
}

// Best-effort recovery of a truncated JSON object/array by balancing quotes and
// brackets. Handles the common "response cut off mid-array" failure mode.
function repairTruncatedJson(text: string): any {
  let s = text.trim();
  if (!s) return undefined;

  // Track structure while respecting strings/escapes.
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Close a dangling string.
  if (inString) s += '"';
  // Drop a trailing partial key/value fragment and any trailing comma.
  s = s.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Close open structures in reverse order.
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }

  return tryParseWithRepairs(s);
}

function sanitizeForPrompt(input: string | number | undefined | null, maxLength: number = 500): string {
  if (input === null || input === undefined) return '';
  let cleaned = String(input).trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  cleaned = cleaned
    .replace(/[`{}<>\\]/g, '')
    .replace(/\b(system:|human:|assistant:)\b/gi, '');
  return cleaned;
}

const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-2-27b-it:free",
  "tencent/hy3:free"
];

// Models known NOT to support the `response_format: json_object` request param.
// For JSON-mode prompts we drop that param (requesting JSON via the system
// prompt instead) so these models still work for structured generation.
const MODELS_WITHOUT_JSON_MODE = new Set(["tencent/hy3:free"]);

function isJsonModeUnsupportedError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return /response_format|json_object|response format|does not support/i.test(msg);
}

// Default per-request timeout. Curriculum generation is large, so callers can
// raise this via the `timeoutMs` option to give slower free-tier models room.
const OPENROUTER_TIMEOUT_MS = 15000;

interface OpenRouterOptions {
  temperature?: number;
  asJSON?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
}

async function callOpenRouterChatCompletion(
  prompt: string,
  options: OpenRouterOptions = {}
): Promise<string> {
  const { temperature = 0.7, asJSON = false, timeoutMs = OPENROUTER_TIMEOUT_MS, maxTokens } = options;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const systemContent = asJSON
    ? 'You are a precise data generator. Output a single valid JSON object only, with no markdown fences, comments, or prose.'
    : 'You are a helpful AI assistant. Provide responses in markdown format with clear headings and bullet points.';

  // Some free models reject the `response_format: json_object` request param.
  // When that happens we retry the SAME model as plain text (the system prompt
  // still instructs strict JSON), so structured generation stays reliable.
  const tryModel = async (model: string, useJsonFormat: boolean): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, any> = {
        model,
        temperature,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt }
        ]
      };
      if (useJsonFormat) body.response_format = { type: 'json_object' };
      if (maxTokens) body.max_tokens = maxTokens;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `OpenRouter request failed with status ${response.status}`);
      }

      const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      const content = parsed.choices?.[0]?.message?.content || '';
      if (!content.trim()) {
        throw new Error('OpenRouter returned an empty completion');
      }
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let lastError: Error | null = null;

  for (const model of OPENROUTER_MODELS) {
    const wantsJsonFormat = asJSON && !MODELS_WITHOUT_JSON_MODE.has(model);
    try {
      const content = await tryModel(model, wantsJsonFormat);
      return content;
    } catch (error: any) {
      lastError = error;
      const reason = error.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 1000)}s` : error.message;
      console.warn(`[Model Fallback] Model ${model} failed:`, reason);
      // Retry once without the json_object param if the model rejected it.
      if (asJSON && wantsJsonFormat && isJsonModeUnsupportedError(error)) {
        try {
          const content = await tryModel(model, false);
          return content;
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`[Model Fallback] Model ${model} (plain-text retry) failed:`, retryErr.message);
        }
      }
      continue;
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

// 1. API: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiActive: !!process.env.OPENROUTER_API_KEY,
    aiModel: OPENROUTER_MODELS[0]
  });
});

app.post('/api/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name || !name.trim()) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) {
    return res.status(400).json({ error: pwErr });
  }

  try {
    const db = await loadUserDB(email);
    if (db.passwordHash) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    db.passwordHash = passwordHash;
    if (!db.progress) db.progress = {};
    if (!db.progress.profile) db.progress.profile = {};
    db.progress.profile.name = name.trim();
    saveUserDB(email, db);
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session initialization failed' });
      }
      req.session.userEmail = email;
      return res.json({ success: true, email, name });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const dbUser = await loadUserDB(normalizedEmail, { createIfMissing: false });

  if (!dbUser || !dbUser.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatches = await bcrypt.compare(password, dbUser.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const storedName = dbUser.progress?.profile?.name || null;

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Session initialization failed' });
    }
    req.session.userEmail = normalizedEmail;
    return res.json({ ok: true, name: storedName });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, email: userEmail });
});

// Merged bootstrap endpoint: session + profile + roadmaps in ONE db call + ONE round trip.
// Replaces the old sequential /api/session -> /api/user-profile -> /api/roadmaps chain
// that all hit loadUserDB() independently on every page load.
app.get('/api/bootstrap', async (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress || {};
    const roadmaps = await getUserRoadmapsReconstructed(userEmail);

    return res.json({
      authenticated: true,
      email: userEmail,
      profile: progress.profile || {},
      settings: progress.settings || {},
      achievements: progress.achievements || [],
      notifications: progress.notifications || [],
      chats: progress.chats || [],
      activityLog: progress.activityLog || {},
      roadmaps
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    // Degrade gracefully: user IS authenticated (session valid), just couldn't load their data.
    // Frontend should treat this as "authenticated, empty state" rather than logged out.
    return res.json({
      authenticated: true,
      email: userEmail,
      profile: {},
      settings: {},
      achievements: [],
      notifications: [],
      chats: [],
      activityLog: {},
      roadmaps: []
    });
  }
});


// ---------------------------------------------------------------------------
// Curriculum generation helpers (the redesigned generation pipeline)
// ---------------------------------------------------------------------------

const DIFFICULTY_LADDER = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
type Difficulty = (typeof DIFFICULTY_LADDER)[number];
const LESSON_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// Names that signal low-quality / generic AI output. Used by both the validator
// and the normalizer to flag or repair weak titles.
const GENERIC_NAMES = new Set([
  'introduction', 'intro', 'overview', 'basics', 'basic', 'fundamentals', 'getting started',
  'getting started', 'misc', 'miscellaneous', 'extra', 'additional', 'other', 'more', 'next',
  'lesson 1', 'lesson 2', 'lesson 3', 'module 1', 'module 2', 'module 3', 'project',
  'assignment', 'exercise', 'topic', 'concepts', 'concept', 'things', 'stuff', 'etc',
  'conclusion', 'summary', 'wrap up', 'final', 'part', 'section', 'chapter', 'untitled'
]);

// Skill tags that carry no analytical value.
const PROHIBITED_SKILL_TAGS = new Set([
  'basics', 'basic', 'concepts', 'concept', 'fundamentals', 'intro', 'introduction',
  'overview', 'misc', 'miscellaneous', 'general', 'things', 'stuff', 'skills', 'learning', 'theory'
]);

// Difficulty ordering for progression checks.
const DIFFICULTY_RANK: Record<string, number> = {
  beginner: 0, intermediate: 1, advanced: 2, expert: 3
};

// Curriculum depth/structure targets. Centralised so the prompt, validator, and
// normalizer all agree on the same contract.
const CURRICULUM_LIMITS = {
  minPhases: 6,
  maxPhases: 10,
  minModulesPerPhase: 3,
  maxModulesPerPhase: 6,
  minLessonsPerModule: 4,
  maxLessonsPerModule: 8,
  minTotalModules: 18,
  minTotalLessons: 45,
  minLessonMinutes: 15,
  maxLessonMinutes: 40
} as const;

// The recognised project difficulty ladder, from lightest to heaviest. Used to
// verify that projects become progressively harder across phases.
const PROJECT_LADDER = ['mini-exercise', 'mini-project', 'real-application', 'portfolio-project', 'capstone'] as const;
const PROJECT_LADDER_RANK: Record<string, number> = Object.fromEntries(
  PROJECT_LADDER.map((tier, i) => [tier, i])
);

function normalizeProjectTier(value: any): string | null {
  const s = String(value || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  if (s in PROJECT_LADDER_RANK) return s;
  // Map plain difficulty words onto the ladder for models that ignore it.
  const map: Record<string, string> = {
    beginner: 'mini-project', intermediate: 'real-application',
    advanced: 'portfolio-project', expert: 'capstone'
  };
  return map[s] || null;
}

/**
 * Quality gate for AI-generated curricula. Returns a score (0-100) and a list of
 * human-readable issues. The route handler retries generation when `ok` is false.
 *
 * This never invents content; it only inspects what the model produced and reports
 * concrete, fixable weaknesses so the corrective prompt can target them. Checks:
 *  - structural depth (phases/modules/lessons counts)
 *  - logical concept ordering (phase & module difficulty rise monotonically)
 *  - duplicate lesson titles / module names
 *  - realistic estimated time
 *  - meaningful objectives & skill tags
 *  - valid prerequisite chains (references resolve, point backwards, first lesson none)
 *  - project progression (rising difficulty ladder)
 *  - resources match their module topic
 */
function validateCurriculumQuality(input: any): { ok: boolean; score: number; issues: string[] } {
  const issues: string[] = [];
  const phases = Array.isArray(input?.phases) ? input.phases : [];
  const totalPhases = phases.length;

  if (totalPhases < CURRICULUM_LIMITS.minPhases) {
    issues.push(`Too few phases (${totalPhases}); need at least ${CURRICULUM_LIMITS.minPhases}.`);
  }
  if (totalPhases > CURRICULUM_LIMITS.maxPhases) {
    issues.push(`Too many phases (${totalPhases}); keep at most ${CURRICULUM_LIMITS.maxPhases}.`);
  }

  let totalModules = 0;
  let totalLessons = 0;
  let lessonsWithEmptyTags = 0;
  let lessonsMissingPrereqs = 0;
  let genericPhaseNames = 0;
  let genericModuleNames = 0;
  let duplicateLessonTitles = 0;
  let duplicateModuleNames = 0;
  let brokenPrereqs = 0;
  let forwardPrereqs = 0;
  let genericLessonTitles = 0;
  let unrealisticTime = 0;
  let resourceMismatch = 0;
  let emptyObjectives = 0;
  let weakObjectives = 0;

  // Two-pass prerequisite validation: collect every lesson ID and its ordinal
  // position first, so we can detect both missing and forward-pointing refs.
  const lessonOrder = new Map<string, number>();
  let ordinal = 0;
  for (const phase of phases) {
    for (const mod of Array.isArray(phase?.modules) ? phase.modules : []) {
      for (const les of Array.isArray(mod?.lessons) ? mod.lessons : []) {
        const id = String(les?.id || '').trim();
        if (id && !lessonOrder.has(id)) lessonOrder.set(id, ordinal);
        ordinal++;
      }
    }
  }

  const seenLessonTitles = new Set<string>();
  const seenModuleNames = new Set<string>();
  const phaseDiffs: string[] = [];
  let position = 0;

  for (const phase of phases) {
    const mods = Array.isArray(phase?.modules) ? phase.modules : [];
    totalModules += mods.length;
    if (mods.length < CURRICULUM_LIMITS.minModulesPerPhase) {
      issues.push(`Phase "${phase?.name || '?'}" has only ${mods.length} modules; need ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase}.`);
    }
    if (typeof phase?.difficulty === 'string') phaseDiffs.push(String(phase.difficulty).toLowerCase());

    const phaseName = String(phase?.name || '').trim().toLowerCase();
    if (phaseName && GENERIC_NAMES.has(phaseName)) genericPhaseNames++;

    for (const mod of mods) {
      const modName = String(mod?.name || '').trim().toLowerCase();
      if (modName) {
        if (seenModuleNames.has(modName)) duplicateModuleNames++;
        else if (GENERIC_NAMES.has(modName)) genericModuleNames++;
        seenModuleNames.add(modName);
      }

      const lessons = Array.isArray(mod?.lessons) ? mod.lessons : [];
      totalLessons += lessons.length;
      if (lessons.length < CURRICULUM_LIMITS.minLessonsPerModule) {
        issues.push(`Module "${mod?.name || '?'}" has only ${lessons.length} lessons; need ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule}.`);
      }

      // Resources should reference the module topic or the overall goal.
      const modTopicWords = modName.split(/\s+/).filter((w) => w.length > 3);
      const goalWords = String(input?.goal || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const r of Array.isArray(mod?.resources) ? mod.resources : []) {
        const hay = `${String(r?.title || '')} ${String(r?.provider || '')} ${String(r?.description || '')}`.toLowerCase();
        const matchesTopic = modTopicWords.some((w) => hay.includes(w));
        const matchesGoal = goalWords.some((w) => hay.includes(w));
        if (modTopicWords.length && !matchesTopic && !matchesGoal) resourceMismatch++;
      }

      for (const les of lessons) {
        position++;
        const title = String(les?.name || '').trim().toLowerCase();
        if (title) {
          if (seenLessonTitles.has(title)) duplicateLessonTitles++;
          else if (GENERIC_NAMES.has(title)) genericLessonTitles++;
          seenLessonTitles.add(title);
        }

        const tags = asStringArray(les?.skillTags).filter((t) => !PROHIBITED_SKILL_TAGS.has(t.toLowerCase()));
        if (tags.length === 0) lessonsWithEmptyTags++;

        const objectives = asStringArray(les?.learningObjectives);
        if (objectives.length === 0) emptyObjectives++;
        else if (objectives.every((o) => o.split(/\s+/).length < 3)) weakObjectives++;

        const lesId = String(les?.id || '').trim();
        const lesOrd = lesId ? lessonOrder.get(lesId) : undefined;
        const isFirstOverall = lesOrd === 0;
        const prereqs = asStringArray(les?.prerequisites);
        if (!isFirstOverall && prereqs.length === 0) lessonsMissingPrereqs++;
        for (const pr of prereqs) {
          const prOrd = lessonOrder.get(pr);
          if (prOrd === undefined) brokenPrereqs++;
          else if (lesOrd !== undefined && prOrd >= lesOrd) forwardPrereqs++;
        }

        const em = Number(les?.estimatedMinutes);
        if (!Number.isFinite(em) || em < CURRICULUM_LIMITS.minLessonMinutes || em > CURRICULUM_LIMITS.maxLessonMinutes) {
          unrealisticTime++;
        }
      }
    }
  }

  // Project progression: difficulty must not decrease across phases.
  const projTiers: number[] = [];
  let phasesWithoutProject = 0;
  for (const phase of phases) {
    const projs = Array.isArray(phase?.projects) ? phase.projects : [];
    if (projs.length === 0) phasesWithoutProject++;
    for (const pr of projs) {
      const tier = normalizeProjectTier(pr?.difficulty);
      if (tier) projTiers.push(PROJECT_LADDER_RANK[tier]);
    }
  }
  if (phasesWithoutProject > 0) issues.push(`${phasesWithoutProject} phase(s) have no project.`);
  for (let i = 1; i < projTiers.length; i++) {
    if (projTiers[i] < projTiers[i - 1]) {
      issues.push('Project difficulty does not rise across phases (mini-exercise -> capstone).');
      break;
    }
  }

  // Phase difficulty must rise monotonically (fundamentals first).
  for (let i = 1; i < phaseDiffs.length; i++) {
    if ((DIFFICULTY_RANK[phaseDiffs[i]] ?? 0) < (DIFFICULTY_RANK[phaseDiffs[i - 1]] ?? 0)) {
      issues.push('Phase difficulty does not rise monotonically (beginner -> expert).');
      break;
    }
  }

  if (lessonsWithEmptyTags > 0) issues.push(`${lessonsWithEmptyTags} lesson(s) have empty or meaningless skill tags.`);
  if (lessonsMissingPrereqs > 0) issues.push(`${lessonsMissingPrereqs} non-first lesson(s) are missing prerequisites.`);
  if (genericPhaseNames > 0) issues.push(`${genericPhaseNames} phase(s) have generic names.`);
  if (genericModuleNames > 0) issues.push(`${genericModuleNames} module(s) have generic names.`);
  if (duplicateLessonTitles > 0) issues.push(`${duplicateLessonTitles} duplicate lesson title(s).`);
  if (duplicateModuleNames > 0) issues.push(`${duplicateModuleNames} duplicate module name(s).`);
  if (brokenPrereqs > 0) issues.push(`${brokenPrereqs} prerequisite reference(s) point to non-existent lessons.`);
  if (forwardPrereqs > 0) issues.push(`${forwardPrereqs} prerequisite(s) point forward instead of to earlier lessons.`);
  if (genericLessonTitles > 0) issues.push(`${genericLessonTitles} lesson(s) have generic titles.`);
  if (unrealisticTime > 0) issues.push(`${unrealisticTime} lesson(s) have unrealistic estimatedMinutes (must be ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}).`);
  if (emptyObjectives > 0) issues.push(`${emptyObjectives} lesson(s) have empty learning objectives.`);
  if (weakObjectives > 0) issues.push(`${weakObjectives} lesson(s) have vague, one-word learning objectives.`);
  if (resourceMismatch > 0) issues.push(`${resourceMismatch} resource(s) do not match their module topic or the goal.`);
  if (totalModules < CURRICULUM_LIMITS.minTotalModules) issues.push(`Too few modules overall (${totalModules}); curriculum is too shallow.`);
  if (totalLessons < CURRICULUM_LIMITS.minTotalLessons) issues.push(`Too few lessons overall (${totalLessons}); curriculum is too shallow.`);

  // Score: start at 100, deduct per reported issue (capped so a couple of minor
  // flaws still leaves a passable score for logging/telemetry).
  const score = Math.max(0, 100 - Math.min(60, issues.length * 6));
  return { ok: issues.length === 0, score, issues };
}

// Allowed resource types persisted with each module.
const RESOURCE_TYPES = ['documentation', 'video', 'practice', 'book'] as const;

// Providers that signal a high-quality, reputable source. Used to normalize the
// `provider` label and to prefer official/authoritative material.
const REPUTABLE_PROVIDERS = [
  'official docs', 'documentation', 'mdn', 'freecodecamp', 'the odin project', 'khan academy',
  'coursera', 'edx', 'youtube', 'leetcode', 'hackerrank', 'codewars', 'exercism', 'kaggle',
  'w3schools', 'geeksforgeeks', 'roadmap.sh', 'digitalocean', 'refactoring guru'
];

function inferResourceType(raw: any): (typeof RESOURCE_TYPES)[number] {
  const declared = String(raw?.type || '').toLowerCase();
  if ((RESOURCE_TYPES as readonly string[]).includes(declared)) {
    return declared as (typeof RESOURCE_TYPES)[number];
  }
  const hay = `${String(raw?.title || '')} ${String(raw?.provider || '')} ${String(raw?.url || '')}`.toLowerCase();
  if (/youtube|video|playlist|course|lecture/.test(hay)) return 'video';
  if (/leetcode|hackerrank|codewars|exercism|kaggle|practice|exercise|challenge/.test(hay)) return 'practice';
  if (/book|o'reilly|manning|press|isbn/.test(hay)) return 'book';
  return 'documentation';
}

function cleanProvider(raw: any): string {
  const provider = String(raw?.provider || '').trim();
  if (provider) return provider;
  const url = String(raw?.url || '');
  const host = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i)?.[1];
  return host || 'Official Docs';
}

/**
 * Normalize a module's resources: type them, clean providers, keep only valid
 * https URLs, prefer reputable/official sources, dedupe, and cap at 4. We do NOT
 * invent extra resources beyond what the model returned to avoid filler.
 */
function normalizeResources(
  raw: any[],
  ctx: { phase: number; module: number; moduleName: string; goal: string }
): any[] {
  const seen = new Set<string>();
  const normalized = raw
    .filter((r) => r && typeof r === 'object')
    .map((r: any, ri: number) => {
      const url = typeof r.url === 'string' && /^https?:\/\//i.test(r.url) ? r.url : '';
      const provider = cleanProvider(r);
      return {
        id: typeof r.id === 'string' ? r.id : `res-${ctx.phase}-${ctx.module}-${ri + 1}`,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : `${ctx.moduleName || 'Topic'} reference`,
        type: inferResourceType(r),
        provider,
        url: url || 'https://example.com',
        description: typeof r.description === 'string' ? r.description.trim() : '',
        reputable: REPUTABLE_PROVIDERS.some((p) => provider.toLowerCase().includes(p))
      };
    })
    .filter((r) => {
      const key = `${r.title.toLowerCase()}|${r.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Prefer reputable providers first, then keep the model's order.
    .sort((a, b) => Number(b.reputable) - Number(a.reputable))
    .slice(0, 4)
    .map(({ reputable, ...rest }) => rest);

  return normalized;
}

/**
 * Validate and NORMALIZE a curriculum-shaped roadmap produced by the AI model.
 *
 * Free-tier models emit inconsistent field types, bad time estimates, and broken
 * prerequisite references. This function repairs those fields on the REAL content
 * the model produced so the persisted roadmap is reliable. It does NOT invent
 * phases, modules, lessons, or resources (the retry loop + fallback handle depth).
 */
function validateAndNormalizeCurriculum(
  input: any,
  meta: {
    goal: string;
    experienceLevel?: string;
    weeklyHours?: string | number;
    preferredStyle?: string;
    college?: string;
    branch?: string;
    year?: string;
  }
): any {
  const goal = meta.goal || (typeof input.goal === 'string' ? input.goal : 'Learning Goal');

  // Keep only the REAL phases the model produced (capped at the max). We never
  // synthesize filler phases/modules/lessons here: the quality gate plus retry
  // loop re-request proper depth, and the offline fallback is the final net.
  let phases = Array.isArray(input.phases) ? input.phases : [];
  if (phases.length > CURRICULUM_LIMITS.maxPhases) phases = phases.slice(0, CURRICULUM_LIMITS.maxPhases);

  const numPhases = Math.max(1, phases.length);
  // Difficulty ladder spanning beginner -> expert across however many real phases exist.
  const phaseDifficulties: Difficulty[] = [];
  for (let i = 0; i < numPhases; i++) {
    const t = i / Math.max(1, numPhases - 1); // 0..1
    const idx = Math.min(DIFFICULTY_LADDER.length - 1, Math.floor(t * (DIFFICULTY_LADDER.length - 1) + 0.0001));
    phaseDifficulties.push(DIFFICULTY_LADDER[idx]);
  }

  // Collect every real lesson ID up-front so prerequisite references can be
  // validated against the whole roadmap (not just earlier-in-this-module).
  const orderedLessonIds: string[] = [];
  const lessonIndexById = new Map<string, number>();
  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p] || {};
    const modules = Array.isArray(phase.modules) ? phase.modules.slice(0, CURRICULUM_LIMITS.maxModulesPerPhase) : [];
    for (let m = 0; m < modules.length; m++) {
      const module = modules[m] || {};
      const lessons = Array.isArray(module.lessons) ? module.lessons.slice(0, CURRICULUM_LIMITS.maxLessonsPerModule) : [];
      for (let l = 0; l < lessons.length; l++) {
        const raw = lessons[l] || {};
        const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        if (!lessonIndexById.has(id)) {
          lessonIndexById.set(id, orderedLessonIds.length);
          orderedLessonIds.push(id);
        }
      }
    }
  }

  const normalizedPhases: any[] = [];
  let globalLessonCounter = 0;
  let previousLessonId: string | null = null;

  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p] || {};
    const phaseId = typeof phase.id === 'string' ? phase.id : `ph-${p + 1}`;
    const phaseDiff = phaseDifficulties[p] || 'beginner';

    // Keep only the real modules the model returned (capped at the max).
    const modules = Array.isArray(phase.modules)
      ? phase.modules.slice(0, CURRICULUM_LIMITS.maxModulesPerPhase)
      : [];
    const moduleCount = Math.max(1, modules.length);

    // Module difficulty rises within the phase (beginner -> advanced).
    const moduleDifficulties: string[] = [];
    for (let i = 0; i < moduleCount; i++) {
      const t = i / Math.max(1, moduleCount - 1);
      const idx = Math.min(LESSON_DIFFICULTIES.length - 1, Math.floor(t * (LESSON_DIFFICULTIES.length - 1) + 0.0001));
      moduleDifficulties.push(LESSON_DIFFICULTIES[idx]);
    }

    const normalizedModules: any[] = [];
    let phaseEstimatedMinutes = 0;
    const phaseSkills = new Set<string>();

    for (let m = 0; m < modules.length; m++) {
      const module = modules[m] || {};
      const moduleId = typeof module.id === 'string' ? module.id : `mod-${p + 1}-${m + 1}`;
      const moduleDiff = moduleDifficulties[m] || phaseDiff;

      const lessons = Array.isArray(module.lessons)
        ? module.lessons.slice(0, CURRICULUM_LIMITS.maxLessonsPerModule)
        : [];

      const normalizedLessons: any[] = [];

      for (let l = 0; l < lessons.length; l++) {
        const lesson = lessons[l] || {};
        globalLessonCounter++;
        const lessonId =
          typeof lesson.id === 'string' && lesson.id.trim() ? lesson.id.trim() : `les-${p + 1}-${m + 1}-${l + 1}`;
        const lessonOrd = lessonIndexById.get(lessonId) ?? -1;
        const isFirstOverall = lessonOrd === 0;

        // Lesson difficulty tracks the module, never exceeding advanced.
        const declaredDiff = String(lesson.difficulty || '').toLowerCase();
        const lessonDiff = (LESSON_DIFFICULTIES as readonly string[]).includes(declaredDiff)
          ? declaredDiff
          : moduleDiff === 'expert' ? 'advanced' : moduleDiff;

        // Prerequisites: keep only real IDs that point strictly BACKWARD. When a
        // non-first lesson has none valid, link it to the immediately preceding
        // lesson so the chain stays intact (metadata correctness, not filler).
        let prereqs = asStringArray(lesson.prerequisites).filter((id) => {
          const ord = lessonIndexById.get(id);
          return ord !== undefined && ord < lessonOrd;
        });
        if (!isFirstOverall && prereqs.length === 0 && previousLessonId) {
          prereqs = [previousLessonId];
        }

        // Skill tags: strip meaningless tags; derive from the title only as a
        // last resort so analytics always have something specific to work with.
        let skillTags = asStringArray(lesson.skillTags)
          .map((t) => t.toLowerCase())
          .filter((t) => t && !PROHIBITED_SKILL_TAGS.has(t));
        skillTags = Array.from(new Set(skillTags));
        if (skillTags.length === 0 && typeof lesson.name === 'string') {
          skillTags = lesson.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .filter((w: string) => w.length > 3 && !PROHIBITED_SKILL_TAGS.has(w))
            .slice(0, 3);
        }
        skillTags.forEach((s) => phaseSkills.add(s));

        const lessonName = typeof lesson.name === 'string' && lesson.name.trim() ? lesson.name.trim() : `Lesson ${l + 1}`;
        const objectives = asStringArray(lesson.learningObjectives);
        const estMinutes = clampInt(
          lesson.estimatedMinutes,
          CURRICULUM_LIMITS.minLessonMinutes,
          CURRICULUM_LIMITS.maxLessonMinutes,
          20 + ((globalLessonCounter * 5) % 20)
        );
        phaseEstimatedMinutes += estMinutes;

        // Rich, reliable metadata. Includes forward-looking fields consumed by
        // later phases (lesson generation, mentor, revision, analytics, etc.).
        const normalizedLesson = {
          id: lessonId,
          name: lessonName,
          description: typeof lesson.description === 'string' ? lesson.description.trim() : '',
          learningObjectives: objectives.length ? objectives : [`Understand and apply ${lessonName}`],
          prerequisites: prereqs,
          skillTags,
          difficulty: lessonDiff,
          estimatedMinutes: estMinutes,
          type: 'learn',
          status: isFirstOverall ? 'available' : 'locked',
          contentStatus: 'pending',
          xpReward: 0
        };
        previousLessonId = lessonId;
        normalizedLessons.push(normalizedLesson);
      }

      const normalizedResources = normalizeResources(
        Array.isArray(module.resources) ? module.resources : [],
        { phase: p + 1, module: m + 1, moduleName: typeof module.name === 'string' ? module.name : '', goal }
      );

      const lessonMinutesForModule = normalizedLessons.reduce((a, les) => a + (les.estimatedMinutes || 0), 0);
      const moduleEstimatedHours = clampInt(
        module.estimatedHours,
        3,
        8,
        Math.max(3, Math.min(8, Math.round(lessonMinutesForModule / 60) || 4))
      );

      normalizedModules.push({
        id: moduleId,
        name: typeof module.name === 'string' && module.name.trim() ? module.name.trim() : `Module ${m + 1}`,
        description: typeof module.description === 'string' ? module.description.trim() : '',
        difficulty: moduleDiff,
        estimatedHours: moduleEstimatedHours,
        lessons: normalizedLessons,
        resources: normalizedResources
      });
    }

    // Projects: preserve what the model returned; only default the tier so the
    // ladder rises across phases. Empty phase projects are left to the retry
    // loop / fallback rather than fabricated here.
    const rawProjects = Array.isArray(phase.projects) ? phase.projects.slice(0, 3) : [];
    const defaultTier = PROJECT_LADDER[Math.min(PROJECT_LADDER.length - 1, p)];
    const normalizedProjects = rawProjects.map((proj: any, pi: number) => ({
      id: typeof proj.id === 'string' ? proj.id : `proj-${p + 1}-${pi + 1}`,
      title: typeof proj.title === 'string' && proj.title.trim()
        ? proj.title.trim()
        : `${phase.name || `Phase ${p + 1}`} Project`,
      difficulty: normalizeProjectTier(proj.difficulty) || defaultTier,
      description:
        typeof proj.description === 'string' && proj.description.trim()
          ? proj.description.trim()
          : `Apply the skills from ${phase.name || `Phase ${p + 1}`} to build a project for: ${goal}.`,
      techStack: asStringArray(proj.techStack),
      features: asStringArray(proj.features),
      progress: 0
    }));

    const phaseEstimatedHours = clampInt(
      phase.estimatedHours,
      10,
      30,
      Math.max(10, Math.min(30, normalizedModules.reduce((a, mod) => a + (mod.estimatedHours || 0), 0)))
    );

    normalizedPhases.push({
      id: phaseId,
      name: typeof phase.name === 'string' && phase.name.trim() ? phase.name.trim() : `Phase ${p + 1}`,
      description: typeof phase.description === 'string' ? phase.description.trim() : '',
      estimatedHours: phaseEstimatedHours,
      difficulty: phaseDiff,
      skillsCovered: phaseSkills.size ? Array.from(phaseSkills) : asStringArray(phase.skillsCovered),
      modules: normalizedModules,
      projects: normalizedProjects
    });
  }

  // Flatten resources/projects into top-level arrays for client compatibility.
  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of normalizedPhases) {
    projects.push(...phase.projects);
    for (const module of phase.modules) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) {
        for (const tag of les.skillTags) allSkillTags.add(tag);
      }
      for (const r of module.resources) {
        resources.push({ ...r, phaseId: phase.id, moduleId: module.id });
      }
    }
  }

  return {
    id: `roadmap-${Date.now()}`,
    title: typeof input.title === 'string' ? input.title : goal,
    goal,
    experienceLevel: meta.experienceLevel || 'Beginner',
    weeklyHours: Number(meta.weeklyHours) || 5,
    preferredStyle: meta.preferredStyle || 'Hands-on',
    college: meta.college || null,
    branch: meta.branch || null,
    year: meta.year || null,
    progressPercent: 0,
    totalXp: 0,
    lessonsCompleted: 0,
    hoursRemaining: normalizedPhases.reduce((a, p) => a + (p.estimatedHours || 0), 0),
    status: 'current',
    createdAt: new Date().toISOString(),
    // Forward-looking summary metadata (consumed by later phases: analytics,
    // revision planner, certificates). Purely additive; not persisted as columns.
    metadata: {
      totalPhases: normalizedPhases.length,
      totalModules: normalizedPhases.reduce((a, p) => a + p.modules.length, 0),
      totalLessons,
      skillTags: Array.from(allSkillTags),
      schemaVersion: 2
    },
    phases: normalizedPhases,
    resources,
    projects
  };
}

/**
 * Offline, no-AI fallback that builds a structured, goal-agnostic but DEEP
 * curriculum-shaped roadmap. It mirrors the college-curriculum contract:
 * 6 phases, 3-5 modules each, 4-6 lessons each, with prerequisites, skill
 * tags, realistic time estimates, per-module resources, and per-phase projects
 * that rise in difficulty. The lesson titles are generic scaffolding the user
 * can rename; no lesson content is generated.
 */
function buildFallbackCurriculum(meta: {
  goal: string;
  experienceLevel?: string;
  weeklyHours?: string | number;
  preferredStyle?: string;
  college?: string;
  branch?: string;
  year?: string;
}): any {
  const goal = meta.goal || 'the learning goal';
  const goalTitle = goal.charAt(0).toUpperCase() + goal.slice(1);

  // A reusable academic phase skeleton; difficulty rises across the array.
  const phasePlan: Array<{
    name: string;
    description: string;
    difficulty: Difficulty;
    moduleThemes: string[];
    projectTitle: string;
    projectTech: string[];
  }> = [
    {
      name: `Foundations of ${goalTitle}`,
      description: `Build core mental models, tooling, and vocabulary for ${goal}. No prior experience assumed.`,
      difficulty: 'beginner',
      moduleThemes: ['Environment & Tooling', 'Core Concepts & Terminology', 'First Principles', 'Hands-on Basics'],
      projectTitle: `Starter Sandbox: ${goalTitle} Hello-World Project`,
      projectTech: ['Git', 'CLI', 'Editor/IDE']
    },
    {
      name: `Essential Skills in ${goalTitle}`,
      description: `Develop the day-to-day competencies every practitioner needs, with guided practice.`,
      difficulty: 'beginner',
      moduleThemes: ['Working with Data', 'Core Patterns', 'Debugging & Testing', 'Small Projects'],
      projectTitle: `Guided Mini-Project: First Functional Build`,
      projectTech: ['Git', 'Unit Tests']
    },
    {
      name: `Intermediate ${goalTitle}`,
      description: `Move beyond basics into structured, reusable, and maintainable approaches.`,
      difficulty: 'intermediate',
      moduleThemes: ['Structures & Abstractions', 'Design Patterns', 'Working at Scale', 'Integration'],
      projectTitle: `Component Builder: Reusable Module Suite`,
      projectTech: ['Package Manager', 'Framework']
    },
    {
      name: `Applied ${goalTitle}`,
      description: `Combine skills into real systems with external integrations and workflows.`,
      difficulty: 'intermediate',
      moduleThemes: ['APIs & Interfaces', 'Persistence & State', 'Concurrency & Flow', 'Observability'],
      projectTitle: `Integrated Service: End-to-End Feature`,
      projectTech: ['REST/HTTP', 'Database', 'CI']
    },
    {
      name: `Advanced ${goalTitle}`,
      description: `Tackle performance, architecture, and production-grade engineering.`,
      difficulty: 'advanced',
      moduleThemes: ['Performance & Optimization', 'Architecture & Scaling', 'Security & Reliability', 'Automation'],
      projectTitle: `Production-Grade System: Scalable Build`,
      projectTech: ['Cloud', 'Containers', 'Monitoring']
    },
    {
      name: `Expert & Specialization in ${goalTitle}`,
      description: `Mastery, specialization, and capstone-level engineering for ${goal}.`,
      difficulty: 'expert',
      moduleThemes: ['Advanced Specialization', 'Research & Cutting-Edge Topics', 'System Design at Scale', 'Leadership & Mentoring'],
      projectTitle: `Capstone: Expert Portfolio Masterpiece`,
      projectTech: ['Cloud-Native', 'Distributed Systems']
    }
  ];

  const phases = phasePlan.map((plan, pIdx) => {
    const phaseId = `ph-${pIdx + 1}`;
    let lessonCounter = 0;

    const modules = plan.moduleThemes.map((theme, mIdx) => {
      const moduleId = `mod-${pIdx + 1}-${mIdx + 1}`;
      const lessonCount = 4 + ((pIdx + mIdx) % 3); // 4..6 lessons
      const lessonIds: string[] = [];
      const lessons = [];
      for (let l = 0; l < lessonCount; l++) {
        lessonCounter++;
        const lessonId = `les-${pIdx + 1}-${mIdx + 1}-${l + 1}`;
        const isFirstOverall = pIdx === 0 && mIdx === 0 && l === 0;
        // Chain to the previous lesson in this module, or the previous module's
        // last lesson, or the previous phase's last module — a valid backward ref.
        let prereqs: string[] = [];
        if (!isFirstOverall) {
          if (l > 0) prereqs = [lessonIds[l - 1]];
          else if (mIdx > 0) prereqs = [`mod-prev-${pIdx + 1}-${mIdx}`]; // placeholder resolved below
          else prereqs = [`phase-prev-${pIdx}`]; // placeholder resolved below
        }
        lessonIds.push(lessonId);
        lessons.push({
          id: lessonId,
          name: `${theme}: Lesson ${l + 1}`,
          description: `Learn and apply ${theme.toLowerCase()} in the context of ${goal}.`,
          learningObjectives: [
            `Apply ${theme} concepts to ${goal}`,
            `Complete a guided exercise reinforcing ${theme.toLowerCase()}`
          ],
          prerequisites: prereqs,
          skillTags: [String(goal).toLowerCase().split(' ')[0], theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')].filter(Boolean),
          difficulty: plan.difficulty === 'expert' ? 'advanced' : plan.difficulty,
          estimatedMinutes: 20 + ((lessonCounter * 5) % 20),
          type: 'learn',
          status: isFirstOverall ? 'available' : 'locked',
          contentStatus: 'pending',
          xpReward: 0
        });
      }

      return {
        id: moduleId,
        name: theme,
        description: `Covers ${theme.toLowerCase()} as part of ${plan.name}.`,
        difficulty: plan.difficulty === 'expert' ? 'advanced' : plan.difficulty,
        estimatedHours: 4 + (mIdx % 3),
        lessons,
        resources: [
          {
            id: `res-${pIdx + 1}-${mIdx + 1}-1`,
            title: `Official ${theme} Documentation`,
            type: 'documentation',
            provider: 'Official Docs',
            url: 'https://example.com/docs',
            description: `Authoritative reference for ${theme}.`
          },
          {
            id: `res-${pIdx + 1}-${mIdx + 1}-2`,
            title: `${theme} - Video Course`,
            type: 'video',
            provider: 'YouTube',
            url: 'https://example.com/course',
            description: `Structured video walkthrough of ${theme}.`
          },
          {
            id: `res-${pIdx + 1}-${mIdx + 1}-3`,
            title: `${theme} Practice Exercises`,
            type: 'practice',
            provider: 'Practice Platform',
            url: 'https://example.com/practice',
            description: `Hands-on exercises for ${theme}.`
          }
        ]
      };
    });

    // Resolve cross-module / cross-phase prerequisite placeholders to real IDs.
    for (let mIdx = 0; mIdx < modules.length; mIdx++) {
      const firstLesson = modules[mIdx].lessons[0];
      if (!firstLesson) continue;
      firstLesson.prerequisites = firstLesson.prerequisites.map((pr: string) => {
        if (pr.startsWith('mod-prev-')) {
          const prevMod = modules[mIdx - 1];
          const last = prevMod?.lessons[prevMod.lessons.length - 1];
          return last ? last.id : '';
        }
        if (pr.startsWith('phase-prev-')) return ''; // first module of a phase links to prior phase implicitly
        return pr;
      }).filter(Boolean);
    }

    const projectTier = PROJECT_LADDER[Math.min(PROJECT_LADDER.length - 1, pIdx)];
    return {
      id: phaseId,
      name: plan.name,
      description: plan.description,
      estimatedHours: 12 + (pIdx * 2),
      difficulty: plan.difficulty,
      skillsCovered: plan.moduleThemes.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      modules,
      projects: [
        {
          id: `proj-${pIdx + 1}`,
          title: plan.projectTitle,
          difficulty: projectTier,
          description: `Apply everything from ${plan.name} to ship ${plan.projectTitle}. Build incrementally, test continuously, and document your work for ${goal}.`,
          techStack: plan.projectTech,
          features: [
            'Scaffold the project structure',
            'Implement core feature set',
            'Add tests and documentation',
            'Deploy or demo the result'
          ],
          progress: 0
        }
      ]
    };
  });

  const resources: any[] = [];
  const projects: any[] = [];
  const allSkillTags = new Set<string>();
  let totalLessons = 0;
  for (const phase of phases) {
    projects.push(...phase.projects);
    for (const module of phase.modules) {
      totalLessons += module.lessons.length;
      for (const les of module.lessons) {
        for (const tag of les.skillTags) allSkillTags.add(tag);
      }
      for (const r of module.resources) {
        resources.push({ ...r, phaseId: phase.id, moduleId: module.id });
      }
    }
  }

  return {
    id: `roadmap-${Date.now()}`,
    title: goalTitle,
    goal,
    experienceLevel: meta.experienceLevel || 'Beginner',
    weeklyHours: Number(meta.weeklyHours) || 5,
    preferredStyle: meta.preferredStyle || 'Hands-on',
    college: meta.college || null,
    branch: meta.branch || null,
    year: meta.year || null,
    progressPercent: 0,
    totalXp: 0,
    lessonsCompleted: 0,
    hoursRemaining: phases.reduce((a, p) => a + (p.estimatedHours || 0), 0),
    status: 'current',
    createdAt: new Date().toISOString(),
    metadata: {
      totalPhases: phases.length,
      totalModules: phases.reduce((a, p) => a + p.modules.length, 0),
      totalLessons,
      skillTags: Array.from(allSkillTags),
      schemaVersion: 2,
      source: 'fallback'
    },
    phases,
    resources,
    projects
  };
}

// 2. API: Generate Roadmaps
//
// Pipeline: generate -> validate quality -> corrective retry (max 2) -> offline
// fallback. We never fabricate filler content to hit depth targets; instead a
// failing curriculum is re-requested with a targeted corrective prompt, and only
// if every attempt fails do we return the structured offline fallback.
app.post('/api/generate-roadmap', aiLimiter, requireAuth, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  const meta = { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year };

  // University tailoring (optional).
  const universityContext = college && branch && year
    ? `\nLearner is a ${sanitizeForPrompt(year)} student at ${sanitizeForPrompt(college)} studying ${sanitizeForPrompt(branch)}; align topics and ordering with their university syllabus (AKTU where applicable).`
    : '';

  // India-focused, semester-style guidance (kept brief to save tokens).
  const indiaContext = `\nAudience: Indian college/engineering learners. Flow like a semester (foundations -> core -> applied -> advanced -> specialization), blend theory with heavy coding, and include placement skills (DSA, system design, projects). Prefer globally-recognized resources.`;

  // Primary curriculum prompt. Compact but strict; engineered so free-tier models
  // produce DEEP, well-named, well-sequenced curricula. Output is validated and
  // normalized server-side. Only ONE example lesson/resource/project is shown to
  // save tokens while still pinning the exact JSON shape.
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
{"goal":"${sanitizeForPrompt(goal, 120)}","phases":[{"id":"ph-1","name":"...","description":"...","estimatedHours":18,"difficulty":"beginner","skillsCovered":["..."],"modules":[{"id":"mod-1-1","name":"...","description":"...","difficulty":"beginner","estimatedHours":5,"lessons":[{"id":"les-1-1-1","name":"...","description":"...","learningObjectives":["...","..."],"prerequisites":[],"skillTags":["...","..."],"difficulty":"beginner","estimatedMinutes":25,"type":"learn","status":"available","contentStatus":"pending"}],"resources":[{"id":"res-1-1-1","title":"...","type":"documentation","provider":"...","url":"https://...","description":"..."}]}],"projects":[{"id":"proj-1","title":"...","difficulty":"mini-exercise","description":"...","techStack":["..."],"features":["..."],"progress":0}]}]}`;

  // Corrective prompt used on retry. Concise; targets the exact reported issues.
  const buildCorrectivePrompt = (issues: string[]) => `Your previous curriculum for "${sanitizeForPrompt(goal, 120)}" was REJECTED. Fix EVERY issue below and regenerate the COMPLETE curriculum:
${issues.slice(0, 12).map((i) => `- ${i}`).join('\n')}

Keep the SAME JSON shape and all prior rules: ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases (beginner->expert), ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules each, ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons each, unique specific titles, real backward prerequisite chains, specific skillTags, topic-matched reputable resources, and a rising project ladder (mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone). Return ONLY the JSON object.`;

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  try {
    // Attempt 0 = primary prompt; attempts 1..MAX_RETRIES = corrective prompts.
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const prompt =
        attempt === 0
          ? buildRoadmapPrompt()
          : buildCorrectivePrompt(bestCandidate ? validateCurriculumQuality(bestCandidate.parsed).issues : []);

      let parsed: any;
      try {
        const response = await callOpenRouterChatCompletion(prompt, {
          temperature: attempt === 0 ? 0.5 : 0.35, // lower temperature on retry for stricter compliance
          asJSON: true,
          timeoutMs: 30000,
          maxTokens: 8000
        });
        parsed = cleanAndParseJSON(response, '{}');
      } catch (genErr: any) {
        console.warn(`[Roadmap] Generation attempt ${attempt + 1} failed:`, genErr.message);
        continue;
      }

      if (!parsed?.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
        console.warn(`[Roadmap] Attempt ${attempt + 1} returned no usable phases.`);
        continue;
      }

      const quality = validateCurriculumQuality(parsed);
      console.log(`[Roadmap] Attempt ${attempt + 1} quality score ${quality.score}/100 (${quality.issues.length} issue(s)).`);

      // Track the best candidate so far in case all attempts have minor flaws.
      if (!bestCandidate || quality.score > bestCandidate.score) {
        bestCandidate = { parsed, score: quality.score };
      }

      if (quality.ok) {
        const normalized = validateAndNormalizeCurriculum(parsed, meta);
        logCurriculumStats('AI-Generated', normalized);
        return res.json(normalized);
      }

      if (attempt < MAX_RETRIES) {
        console.warn(`[Roadmap] Retrying with corrective prompt. Issues: ${quality.issues.slice(0, 5).join('; ')}`);
      }
    }

    // No attempt passed the gate. If the best candidate is at least reasonably
    // structured, normalize and use it (normalization repairs field-level flaws);
    // otherwise fall through to the offline fallback.
    if (bestCandidate && bestCandidate.score >= 60 && Array.isArray(bestCandidate.parsed.phases)) {
      console.warn(`[Roadmap] All retries had issues; using best candidate (score ${bestCandidate.score}) after normalization.`);
      const normalized = validateAndNormalizeCurriculum(bestCandidate.parsed, meta);
      logCurriculumStats('AI-Best-Candidate', normalized);
      return res.json(normalized);
    }

    throw new Error('All generation attempts failed the quality gate');
  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) readableError = parsedError.error.message;
    } catch (_) {}
    console.error('[Roadmap] Generation failed, using offline fallback:', readableError);
    console.warn(`[AI-Fallback] Roadmap fallback activated for goal: "${sanitizeForPrompt(goal, 80)}"`);

    const fallbackRoadmap = buildFallbackCurriculum(meta);
    logCurriculumStats('AI-Fallback', fallbackRoadmap);
    return res.json(fallbackRoadmap);
  }
});

// Compact structured log of a generated curriculum's depth.
function logCurriculumStats(tag: string, roadmap: any): void {
  const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
  const modules = phases.reduce((a: number, p: any) => a + (p.modules?.length || 0), 0);
  const lessons = phases.reduce(
    (a: number, p: any) => a + (p.modules || []).reduce((b: number, m: any) => b + (m.lessons?.length || 0), 0),
    0
  );
  console.log(
    `[${tag}] Phases: ${phases.length}, Modules: ${modules}, Lessons: ${lessons}, Resources: ${roadmap?.resources?.length || 0}, Projects: ${roadmap?.projects?.length || 0}`
  );
}

// ===========================================================================
// LESSON GENERATION SYSTEM
//
// Roadmaps store lesson METADATA only. Full lesson content (premium-course-style
// Markdown) is generated lazily the first time a student opens a lesson, then
// cached in the `lesson_content` table. Subsequent opens reuse the cache; content
// is only regenerated when explicitly requested.
//
// Flow: open lesson -> check lesson_content -> exists? return cached : generate,
// save, mark content_status='ready', return.
//
// Does NOT generate quizzes or assignments (later phases).
// ===========================================================================

// Detect the pedagogical subject family so the prompt can request the right
// artifacts (code + debugging for programming; formulas + derivations for math;
// definitions + analogies for theory). Heuristic over the lesson metadata.
type SubjectKind = 'programming' | 'mathematics' | 'theory';

const PROGRAMMING_HINTS = [
  'python', 'javascript', 'typescript', 'java', 'c++', 'cpp', 'c#', 'go', 'rust', 'sql', 'react',
  'node', 'html', 'css', 'api', 'algorithm', 'data structure', 'datastructure', 'oop', 'function',
  'class', 'code', 'coding', 'program', 'framework', 'git', 'database', 'backend', 'frontend',
  'devops', 'docker', 'kubernetes', 'ml', 'machine learning', 'neural', 'tensorflow', 'pytorch',
  'pandas', 'numpy', 'regex', 'compiler', 'recursion', 'array', 'pointer', 'thread', 'async'
];
const MATH_HINTS = [
  'math', 'algebra', 'calculus', 'geometry', 'trigonometry', 'probability', 'statistics',
  'derivative', 'integral', 'matrix', 'matrices', 'vector', 'equation', 'theorem', 'proof',
  'linear algebra', 'discrete', 'combinatorics', 'number theory', 'differential', 'limit', 'series'
];

function detectSubjectKind(lesson: {
  title?: string;
  description?: string;
  skillTags?: string[];
  goal?: string;
}): SubjectKind {
  const hay = [
    lesson.title || '',
    lesson.description || '',
    (lesson.skillTags || []).join(' '),
    lesson.goal || ''
  ].join(' ').toLowerCase();

  const hits = (arr: string[]) => arr.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
  const progScore = hits(PROGRAMMING_HINTS);
  const mathScore = hits(MATH_HINTS);

  if (progScore >= mathScore && progScore > 0) return 'programming';
  if (mathScore > progScore) return 'mathematics';
  return 'theory';
}

// Subject-specific instruction block appended to the base prompt. Kept concise to
// stay within free-tier context/token budgets while pinning the required artifacts.
function subjectInstructions(kind: SubjectKind): string {
  switch (kind) {
    case 'programming':
      return `This is a PROGRAMMING lesson. Include: clear explanations, correct syntax, and TIERED code examples in "Worked Examples" — a SIMPLE example, an INTERMEDIATE example, and a REAL-WORLD example — each as a complete runnable fenced code block WITH its expected OUTPUT shown (as a fenced \`text\` block or comment). Add at least one Markdown/ASCII diagram (flowchart, tree, or architecture) using a fenced \`text\` block to illustrate flow or structure. In "Common Mistakes" include real common bugs and concrete debugging tips. In the practice part of "Practical Examples", add a CHALLENGE exercise (harder, open-ended).`;
    case 'mathematics':
      return `This is a MATHEMATICS lesson. Include: precise definitions; formulas inline with backticks or in fenced blocks; at least one step-by-step DERIVATION; fully worked numeric examples (simple then harder); and a diagram or comparison TABLE where it clarifies relationships. In "Summary", list the Important Formulas explicitly.`;
    default:
      return `This is a THEORY/CONCEPTUAL lesson. Include: crisp definitions; an intuitive real-world ANALOGY for each core concept; concrete real-world applications; and comparison TABLES for related concepts. Use a Markdown/ASCII diagram (e.g. a timeline or flowchart in a fenced \`text\` block) where it aids understanding.`;
  }
}

// The 11 mandatory sections every lesson must contain, in order.
const LESSON_SECTIONS = [
  'Lesson Introduction',
  'Learning Objectives',
  'Core Concepts',
  'Step-by-step Explanation',
  'Worked Examples',
  'Practical Examples',
  'Common Mistakes',
  'Best Practices',
  'Summary',
  'Key Takeaways',
  'Next Lesson Preview'
] as const;

// Build a compact, high-signal prompt optimized for free-tier OpenRouter models.
// It pins the exact section headings + ordering so parsing/validation is reliable,
// while requesting the premium-course enrichments (metadata header, inline
// knowledge checks, Markdown diagrams, tiered code examples, a full practice
// section, and an interview-ready summary).
function buildLessonPrompt(ctx: {
  title: string;
  description?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  skillTags?: string[];
  prerequisiteNames?: string[];
  goal?: string;
  moduleName?: string;
  phaseName?: string;
  nextLessonName?: string;
  subject: SubjectKind;
}): string {
  const objectives = (ctx.learningObjectives || []).filter(Boolean);
  const tags = (ctx.skillTags || []).filter(Boolean);
  const prereqs = (ctx.prerequisiteNames || []).filter(Boolean);
  const nextPreview = ctx.nextLessonName
    ? `The next lesson is "${ctx.nextLessonName}"; preview how it builds on this one.`
    : `Preview what a logical next step after this lesson would be.`;
  const interviewLine = ctx.subject === 'theory'
    ? `If this topic is commonly asked in interviews, add a short "Common Interview Questions" list.`
    : `Add a short "Common Interview Questions" list (2-4 questions) since this topic is interview-relevant.`;

  return `You are an expert instructor writing ONE complete, self-contained, PREMIUM online-course lesson.

LESSON: "${sanitizeForPrompt(ctx.title, 160)}"
${ctx.goal ? `COURSE GOAL: "${sanitizeForPrompt(ctx.goal, 160)}"` : ''}
${ctx.moduleName ? `MODULE: "${sanitizeForPrompt(ctx.moduleName, 120)}"` : ''}
${ctx.difficulty ? `LEVEL: ${sanitizeForPrompt(ctx.difficulty, 20)}` : ''}${ctx.estimatedMinutes ? ` | TARGET LENGTH: a ${ctx.estimatedMinutes}-minute read` : ''}
${ctx.description ? `WHAT THE LEARNER WILL DO: ${sanitizeForPrompt(ctx.description, 240)}` : ''}
${objectives.length ? `OBJECTIVES TO COVER:\n${objectives.map((o) => `- ${sanitizeForPrompt(o, 120)}`).join('\n')}` : ''}
${tags.length ? `SKILLS COVERED: ${tags.map((t) => sanitizeForPrompt(t, 40)).join(', ')}` : ''}
${prereqs.length ? `PREREQUISITES: ${prereqs.map((p) => sanitizeForPrompt(p, 80)).join(', ')}` : ''}

${subjectInstructions(ctx.subject)}

WRITING RULES:
- Rich, accurate, NON-repetitive educational Markdown. Explain the "why", not just the "what". No shallow filler paragraphs.
- Use ## headings, ### sub-headings, bullet lists, and TABLES where they aid clarity (e.g. comparison charts).
- Use fenced code blocks with a language tag where relevant; use fenced \`text\` blocks for ASCII diagrams (flowcharts, trees, timelines, architecture). NEVER use images.
- At 2-3 natural stopping points, insert an inline KNOWLEDGE CHECK as a blockquote to make the reader pause and think, e.g.:
  > 🧠 **Knowledge Check:** What do you think happens if ...? / Can you predict the output of ...?
  These are reflection checkpoints, NOT graded quizzes — do not provide multiple-choice options.
- Do NOT include graded quizzes or assignments.

OUTPUT FORMAT — return Markdown ONLY (no preamble, no JSON, no code fence around the whole document). Begin the document with this metadata header exactly (fill in real values), then the 11 sections:

**Estimated Study Time:** ~${ctx.estimatedMinutes || 20} min | **Difficulty:** ${ctx.difficulty || 'beginner'}
**Prerequisites:** ${prereqs.length ? prereqs.join(', ') : 'None'}
**Skills Covered:** ${tags.length ? tags.join(', ') : 'core concepts'}

Then use EXACTLY these 11 sections, in order, each as a level-2 heading:

## 1. Lesson Introduction
## 2. Learning Objectives
(Restate the objectives as a checklist using "- [ ] objective" so learners can tick them off.)
## 3. Core Concepts
## 4. Step-by-step Explanation
## 5. Worked Examples
## 6. Practical Examples
(Include four labelled sub-parts: "### Quick Practice", "### Mini Challenge", "### Thinking Question", "### Real-World Application".)
## 7. Common Mistakes
## 8. Best Practices
## 9. Summary
(Include "### Key Points", "### Important Concepts"${ctx.subject === 'mathematics' ? ', "### Important Formulas"' : ''}, and ${interviewLine})
## 10. Key Takeaways
## 11. Next Lesson Preview

For "Next Lesson Preview": ${nextPreview}
Begin now with the metadata header, then "## 1. Lesson Introduction".`;
}

// Validate that generated content is real, well-formed lesson Markdown. Returns
// the number of mandatory sections detected so callers can gauge completeness.
function scoreLessonMarkdown(markdown: string): { sectionsFound: number; ok: boolean } {
  if (!markdown || markdown.trim().length < 400) return { sectionsFound: 0, ok: false };
  const lower = markdown.toLowerCase();
  let sectionsFound = 0;
  for (const section of LESSON_SECTIONS) {
    // Match the section heading regardless of numbering ("## 3. Core Concepts"
    // or "## Core Concepts").
    const needle = section.toLowerCase();
    if (lower.includes(needle)) sectionsFound++;
  }
  // Require the bulk of sections to be present to count as a valid lesson.
  return { sectionsFound, ok: sectionsFound >= 8 };
}

// Strip any stray wrapping code fence and normalise leading/trailing whitespace.
function cleanLessonMarkdown(raw: string): string {
  let md = (raw || '').trim();
  if (md.startsWith('```')) {
    md = md.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return md;
}

// A deterministic, no-AI fallback lesson so the student is never blocked when the
// model is unavailable. It is clearly structured (premium layout) and honest about
// being a stub that will be regenerated.
function buildFallbackLessonMarkdown(ctx: {
  title: string;
  description?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  skillTags?: string[];
  prerequisiteNames?: string[];
  nextLessonName?: string;
}): string {
  const title = ctx.title || 'This Lesson';
  const objectives = (ctx.learningObjectives || []).filter(Boolean);
  const tags = (ctx.skillTags || []).filter(Boolean);
  const prereqs = (ctx.prerequisiteNames || []).filter(Boolean);
  const checklist = objectives.length
    ? objectives.map((o) => `- [ ] ${o}`).join('\n')
    : `- [ ] Understand the core ideas behind ${title}\n- [ ] Apply ${title} in a practical scenario`;

  return `**Estimated Study Time:** ~${ctx.estimatedMinutes || 20} min | **Difficulty:** ${ctx.difficulty || 'beginner'}
**Prerequisites:** ${prereqs.length ? prereqs.join(', ') : 'None'}
**Skills Covered:** ${tags.length ? tags.join(', ') : 'core concepts'}

## 1. Lesson Introduction

Welcome to **${title}**. ${ctx.description || `This lesson introduces the essential ideas of ${title} and shows how to apply them.`}

> Note: A richer, AI-authored version of this lesson will be generated automatically the next time it is opened. This is a structured starter outline.

## 2. Learning Objectives

By the end of this lesson you should be able to:

${checklist}

## 3. Core Concepts

${tags.length ? `The key topics for this lesson are: ${tags.join(', ')}.` : `This lesson covers the foundational concepts of ${title}.`}

> 🧠 **Knowledge Check:** Before continuing, how would you explain ${title} in one sentence to a friend?

## 4. Step-by-step Explanation

1. Review the objectives above.
2. Study each core concept in order.
3. Work through the examples and reproduce them yourself.

## 5. Worked Examples

A worked example will walk through applying ${title} step by step.

## 6. Practical Examples

### Quick Practice
Try a small exercise applying ${title}.

### Mini Challenge
Extend the quick practice with one additional constraint.

### Thinking Question
Why does ${title} matter, and when would you avoid it?

### Real-World Application
Describe a real scenario where ${title} is used in practice.

## 7. Common Mistakes

- Rushing past the fundamentals before practising.
- Skipping the examples instead of reproducing them.

## 8. Best Practices

- Practise actively rather than reading passively.
- Connect new ideas to what you already know.

## 9. Summary

### Key Points
- ${title} is a building block for later lessons.

### Important Concepts
- ${tags.length ? tags.join(', ') : `the fundamentals of ${title}`}

## 10. Key Takeaways

- ${title} is a building block for later lessons.
- Active practice is the fastest route to mastery.

## 11. Next Lesson Preview

${ctx.nextLessonName ? `Next up: **${ctx.nextLessonName}**, which builds directly on what you learned here.` : `The next lesson will build on these ideas.`}`;
}

// In-flight generation guard: if two requests open the same lesson simultaneously,
// the second awaits the first instead of triggering a duplicate model call.
const lessonGenerationInFlight = new Map<string, Promise<{ markdown: string; summary: string | null; modelUsed: string }>>();

// Core generation routine. Builds the prompt, calls the model with retry/fallback,
// validates the Markdown, and returns the content to persist. Never throws for
// content-quality reasons — it degrades to the fallback lesson instead.
async function generateLessonContent(ctx: {
  lessonId: string;
  title: string;
  description?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  skillTags?: string[];
  prerequisiteNames?: string[];
  goal?: string;
  moduleName?: string;
  phaseName?: string;
  nextLessonName?: string;
}): Promise<{ markdown: string; summary: string | null; modelUsed: string }> {
  const subject = detectSubjectKind(ctx);
  const prompt = buildLessonPrompt({ ...ctx, subject });

  const MAX_ATTEMPTS = 2;
  let bestMarkdown = '';
  let bestSections = -1;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await callOpenRouterChatCompletion(prompt, {
        temperature: 0.6,
        asJSON: false,
        timeoutMs: 35000,
        maxTokens: 4500
      });
      const md = cleanLessonMarkdown(response);
      const { sectionsFound, ok } = scoreLessonMarkdown(md);
      if (sectionsFound > bestSections) {
        bestSections = sectionsFound;
        bestMarkdown = md;
      }
      if (ok) {
        const summary = extractLessonSummary(md);
        console.log(`[Lesson-Gen] ${ctx.lessonId} generated (${subject}, ${sectionsFound}/11 sections, attempt ${attempt + 1}).`);
        return { markdown: md, summary, modelUsed: OPENROUTER_MODELS[0] };
      }
      console.warn(`[Lesson-Gen] ${ctx.lessonId} attempt ${attempt + 1} incomplete (${sectionsFound}/11 sections).`);
    } catch (err: any) {
      console.warn(`[Lesson-Gen] ${ctx.lessonId} attempt ${attempt + 1} failed:`, err.message);
    }
  }

  // Accept the best partial result if it is reasonably complete; otherwise fall back.
  if (bestSections >= 6 && bestMarkdown) {
    console.warn(`[Lesson-Gen] ${ctx.lessonId} using best partial content (${bestSections}/11 sections).`);
    return { markdown: bestMarkdown, summary: extractLessonSummary(bestMarkdown), modelUsed: OPENROUTER_MODELS[0] };
  }

  console.warn(`[Lesson-Gen] ${ctx.lessonId} falling back to offline lesson template.`);
  const fallback = buildFallbackLessonMarkdown(ctx);
  return { markdown: fallback, summary: extractLessonSummary(fallback), modelUsed: 'offline-fallback' };
}

// Derive a short plain-text summary from the lesson's introduction/summary section.
function extractLessonSummary(markdown: string): string | null {
  if (!markdown) return null;
  // Prefer the Summary section; fall back to the Introduction.
  const grab = (heading: RegExp): string | null => {
    const match = markdown.match(heading);
    if (!match) return null;
    const start = match.index! + match[0].length;
    const rest = markdown.slice(start);
    const end = rest.search(/\n##\s/);
    const body = (end === -1 ? rest : rest.slice(0, end)).trim();
    const text = body.replace(/[#*`>_-]/g, '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 300) : null;
  };
  return grab(/##\s*\d*\.?\s*Summary/i) || grab(/##\s*\d*\.?\s*Lesson Introduction/i) || null;
}

// ---------------------------------------------------------------------------
// Premium lesson metadata + structure helpers
// ---------------------------------------------------------------------------

// Structured metadata describing a lesson (surfaced to the client and reused by
// future systems: quizzes/flashcards/mentor/revision). Purely additive — derived
// from existing lesson columns + generated content; no schema change.
interface LessonMetadata {
  lessonId: string;
  title: string;
  estimatedMinutes: number;
  difficulty: string;
  subject: SubjectKind;
  prerequisites: string[];        // human-readable prerequisite lesson names
  skillsCovered: string[];
  learningObjectives: string[];
  completionChecklist: string[];  // actionable "did you..." items derived from objectives
  sectionAnchors: string[];       // ordered section slugs present in the content
  hasKnowledgeChecks: boolean;
  hasCodeExamples: boolean;
  hasDiagrams: boolean;
  generatedAt: string | null;
  lastOpenedAt: string | null;
  contentStatus: string;
}

// Slugify a heading into a stable anchor id (for future deep-linking / attaching
// quizzes & flashcards to specific sections).
function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Extract the ordered level-2 section anchors present in the markdown.
function extractSectionAnchors(markdown: string): string[] {
  const anchors: string[] = [];
  const re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const slug = slugifyHeading(match[1].trim());
    if (slug) anchors.push(slug);
  }
  return anchors;
}

// Turn learning objectives into a lightweight completion checklist. Prefers any
// "- [ ] ..." items the model already emitted; otherwise derives from objectives.
function buildCompletionChecklist(markdown: string, objectives: string[]): string[] {
  const checkboxRe = /^\s*-\s*\[[ x]\]\s*(.+)$/gim;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = checkboxRe.exec(markdown)) !== null) {
    const item = m[1].trim();
    if (item) found.push(item);
  }
  if (found.length) return Array.from(new Set(found)).slice(0, 12);
  return (objectives || [])
    .filter(Boolean)
    .map((o) => o.trim())
    .slice(0, 12);
}

// Assemble the structured metadata object for a lesson from its row + content.
function buildLessonMetadata(args: {
  lessonRow: any;
  content: string;
  prerequisiteNames: string[];
  generatedAt: string | null;
  lastOpenedAt: string | null;
  contentStatus: string;
}): LessonMetadata {
  const { lessonRow, content, prerequisiteNames, generatedAt, lastOpenedAt, contentStatus } = args;
  const objectives = Array.isArray(lessonRow.learning_objectives) ? lessonRow.learning_objectives : [];
  const skillTags = Array.isArray(lessonRow.skill_tags) ? lessonRow.skill_tags : [];
  const subject = detectSubjectKind({
    title: lessonRow.title,
    description: lessonRow.description ?? undefined,
    skillTags
  });

  return {
    lessonId: lessonRow.id,
    title: lessonRow.title,
    estimatedMinutes: Number(lessonRow.estimated_minutes) || 20,
    difficulty: lessonRow.difficulty || 'beginner',
    subject,
    prerequisites: prerequisiteNames,
    skillsCovered: skillTags,
    learningObjectives: objectives,
    completionChecklist: buildCompletionChecklist(content, objectives),
    sectionAnchors: extractSectionAnchors(content),
    hasKnowledgeChecks: /knowledge check/i.test(content),
    hasCodeExamples: /```[a-z]/i.test(content),
    hasDiagrams: /```text|```mermaid|┌|└|──|->|─►/i.test(content),
    generatedAt,
    lastOpenedAt,
    contentStatus
  };
}

// ---------------------------------------------------------------------------
// Short-lived in-memory content cache (read acceleration).
//
// The durable cache is `lesson_content` in the DB; this only avoids repeated DB
// round-trips for hot lessons. It is BOUNDED (max size) with automatic LRU-style
// eviction and TTL expiry, so it cannot grow without limit. It NEVER causes
// regeneration and is invalidated on explicit regenerate. Behaviour from the
// caller's perspective is unchanged.
// ---------------------------------------------------------------------------
type LessonContentCacheEntry = {
  content: string;
  summary: string | null;
  contentStatus: string;
  generatedAt: string | null;
  timestamp: number;
  lastUsed: number;
  // Lightweight lesson metadata snapshot so the hot path can serve a cache hit
  // without a second DB lookup (getLessonById). Contains only the fields the
  // callers read from `result.lesson`.
  lessonMeta: {
    id: string;
    title: string;
    content_status: string;
    generated_at: string | null;
    learning_objectives: any;
    skill_tags: any;
    prerequisites: any;
    estimated_minutes: any;
    difficulty: any;
  };
};

// Configurable limits.
const LESSON_CONTENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LESSON_CONTENT_CACHE_MAX = 500; // hard cap on in-memory entries

const lessonContentCache = new Map<string, LessonContentCacheEntry>();

function evictLessonContentCacheIfNeeded(): void {
  if (lessonContentCache.size <= LESSON_CONTENT_CACHE_MAX) return;
  // Evict the least-recently-used entries until back under the cap.
  const entries = [...lessonContentCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const overflow = lessonContentCache.size - LESSON_CONTENT_CACHE_MAX;
  for (let i = 0; i < overflow; i++) {
    lessonContentCache.delete(entries[i][0]);
  }
}

function getCachedLessonContent(lessonId: string): LessonContentCacheEntry | null {
  const entry = lessonContentCache.get(lessonId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LESSON_CONTENT_CACHE_TTL) {
    lessonContentCache.delete(lessonId);
    return null;
  }
  // Refresh recency for LRU eviction.
  entry.lastUsed = Date.now();
  return entry;
}

function setCachedLessonContent(lessonId: string, entry: Omit<LessonContentCacheEntry, 'timestamp' | 'lastUsed'>): void {
  const now = Date.now();
  lessonContentCache.set(lessonId, { ...entry, timestamp: now, lastUsed: now });
  evictLessonContentCacheIfNeeded();
}

// Explicitly drop a single entry (e.g., after completion / regenerate).
function clearLessonContentCacheEntry(lessonId: string): void {
  lessonContentCache.delete(lessonId);
}

// Project the subset of `lessons` columns that callers read off `result.lesson`,
// so the in-memory cache can serve hits without re-querying the DB.
function snapshotLessonMeta(lesson: any): LessonContentCacheEntry['lessonMeta'] {
  return {
    id: lesson.id,
    title: lesson.title,
    content_status: lesson.content_status,
    generated_at: lesson.generated_at ?? null,
    learning_objectives: lesson.learning_objectives,
    skill_tags: lesson.skill_tags,
    prerequisites: lesson.prerequisites,
    estimated_minutes: lesson.estimated_minutes,
    difficulty: lesson.difficulty
  };
}

// ---------------------------------------------------------------------------
// Automatic progress tracking (existing columns only — no schema change).
//
// Records a lesson "open" against the user: bumps attempts (used as an open
// counter) and touches updated_at (used as "last opened"). Study minutes and
// completion are handled by the existing completion flow.
// ---------------------------------------------------------------------------
async function recordLessonOpened(
  ownerEmail: string,
  ctx: { lessonId: string; moduleId: string; phaseId: string; roadmapId: string }
): Promise<string | null> {
  try {
    // Accumulate open attempts (addition, not GREATEST) so repeated opens count.
    // Completion state is intentionally untouched here.
    await incrementLessonAttempts(ownerEmail, ctx.lessonId, ctx.moduleId, ctx.phaseId, ctx.roadmapId);
    return new Date().toISOString();
  } catch (err: any) {
    console.warn('[Lesson-Progress] failed to record open:', err?.message || err);
    return null;
  }
}

// Look up the user's last-opened timestamp for a lesson from progress (updated_at).
async function getLessonLastOpened(ownerEmail: string, lessonId: string): Promise<string | null> {
  try {
    const rows = await sql`
      SELECT updated_at FROM user_lesson_progress
      WHERE owner_email = ${ownerEmail.toLowerCase()} AND lesson_id = ${lessonId}
      LIMIT 1
    `;
    return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Retrieve a lesson's content, generating and caching it on first access.
 *
 * @returns the lesson row (metadata) plus resolved markdown content + summary,
 *          and whether it was served from cache.
 */
async function getOrGenerateLessonContent(
  lessonId: string,
  opts: { regenerate?: boolean } = {}
): Promise<{
  lesson: any;
  content: string;
  summary: string | null;
  contentStatus: string;
  generatedAt: string | null;
  cached: boolean;
} | null> {
  // Explicit regenerate always bypasses (and clears) the in-memory cache.
  if (opts.regenerate) {
    clearLessonContentCacheEntry(lessonId);
  } else {
    // Fast path: hot in-memory cache (avoids the DB round-trip for repeat reads).
    const hot = getCachedLessonContent(lessonId);
    if (hot) {
      // Serve from the in-memory snapshot — no DB round-trip required.
      return {
        lesson: hot.lessonMeta,
        content: hot.content,
        summary: hot.summary,
        contentStatus: hot.contentStatus,
        generatedAt: hot.generatedAt,
        cached: true
      };
    }
  }

  const lesson = await getLessonById(lessonId);
  if (!lesson) return null;

  const existing = lesson.markdown_content;

  // Durable cache hit: return stored content unless regeneration is requested.
  if (!opts.regenerate && existing && String(existing).trim().length > 0) {
    const generatedAt = lesson.generated_at ? new Date(lesson.generated_at).toISOString() : null;
    const contentStatus = lesson.content_status || 'ready';
    setCachedLessonContent(lessonId, {
      content: existing,
      summary: lesson.summary ?? null,
      contentStatus,
      generatedAt,
      lessonMeta: snapshotLessonMeta(lesson)
    });
    return {
      lesson,
      content: existing,
      summary: lesson.summary ?? null,
      contentStatus,
      generatedAt,
      cached: true
    };
  }

  // De-duplicate concurrent first-opens of the same lesson.
  const generatedAt = new Date().toISOString();
  let inflight = lessonGenerationInFlight.get(lessonId);
  if (!inflight) {
    inflight = (async () => {
      // Pull relational context (module/phase/roadmap + goal + neighbours).
      const ctx = await buildLessonGenerationContext(lessonId, lesson);
      // Mark as generating so the UI/other requests can reflect the state.
      try { await markLessonContentStatus(lessonId, 'generating'); } catch (_) {}
      const generated = await generateLessonContent(ctx);
      await upsertLessonContent({
        lessonId,
        markdownContent: generated.markdown,
        summary: generated.summary,
        modelUsed: generated.modelUsed,
        generatedAt
      });
      await markLessonContentStatus(lessonId, 'ready');
      return generated;
    })();
    lessonGenerationInFlight.set(lessonId, inflight);
    inflight.finally(() => lessonGenerationInFlight.delete(lessonId));
  }

  let generated: { markdown: string; summary: string | null; modelUsed: string };
  try {
    generated = await inflight;
  } catch (err) {
    lessonGenerationInFlight.delete(lessonId);
    throw err;
  }

  setCachedLessonContent(lessonId, {
    content: generated.markdown,
    summary: generated.summary,
    contentStatus: 'ready',
    generatedAt,
    lessonMeta: snapshotLessonMeta(lesson)
  });

  return {
    lesson,
    content: generated.markdown,
    summary: generated.summary,
    contentStatus: 'ready',
    generatedAt,
    cached: false
  };
}

// Assemble the full generation context for a lesson: its own metadata plus the
// owning module/phase/roadmap goal and the immediately following lesson (for the
// "Next Lesson Preview" section).
async function buildLessonGenerationContext(lessonId: string, lessonRow: any): Promise<{
  lessonId: string;
  title: string;
  description?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  skillTags?: string[];
  prerequisiteNames?: string[];
  goal?: string;
  moduleName?: string;
  phaseName?: string;
  nextLessonName?: string;
}> {
  const meta = await sql`
    SELECT
      roadmaps.goal AS goal,
      modules.name AS module_name,
      phases.name AS phase_name,
      lessons.order_index AS order_index,
      lessons.module_id AS module_id
    FROM lessons
    JOIN modules ON modules.id = lessons.module_id
    JOIN phases ON phases.id = modules.phase_id
    JOIN roadmaps ON roadmaps.id = modules.roadmap_id
    WHERE lessons.id = ${lessonId}
    LIMIT 1
  `;
  const m = meta[0] || {};

  // Next lesson (same module, next order index) for the preview section.
  let nextLessonName: string | undefined;
  if (m.module_id != null && m.order_index != null) {
    const nextRows = await sql`
      SELECT title FROM lessons
      WHERE module_id = ${m.module_id} AND order_index > ${m.order_index}
      ORDER BY order_index ASC
      LIMIT 1
    `;
    nextLessonName = nextRows[0]?.title || undefined;
  }

  // Resolve prerequisite lesson IDs to human-readable titles for the header.
  const prereqIds = Array.isArray(lessonRow.prerequisites) ? lessonRow.prerequisites.filter(Boolean) : [];
  const prerequisiteNames = await resolveLessonNames(prereqIds);

  return {
    lessonId,
    title: lessonRow.title,
    description: lessonRow.description ?? undefined,
    difficulty: lessonRow.difficulty ?? undefined,
    estimatedMinutes: lessonRow.estimated_minutes ?? undefined,
    learningObjectives: Array.isArray(lessonRow.learning_objectives) ? lessonRow.learning_objectives : [],
    skillTags: Array.isArray(lessonRow.skill_tags) ? lessonRow.skill_tags : [],
    prerequisiteNames,
    goal: m.goal ?? undefined,
    moduleName: m.module_name ?? undefined,
    phaseName: m.phase_name ?? undefined,
    nextLessonName
  };
}

// Resolve a list of lesson IDs to their titles (order-preserving, missing ids
// dropped). Used to render prerequisites as names instead of opaque ids.
async function resolveLessonNames(lessonIds: string[]): Promise<string[]> {
  const ids = (lessonIds || []).filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await sql`SELECT id, title FROM lessons WHERE id = ANY(${ids})`;
  const byId = new Map<string, string>(rows.map((r: any) => [r.id, r.title]));
  return ids.map((id) => byId.get(id)).filter((n): n is string => !!n);
}

// Update only the lesson's content_status without touching learning status.
async function markLessonContentStatus(lessonId: string, status: string): Promise<void> {
  await sql`UPDATE lessons SET content_status = ${status}, updated_at = NOW() WHERE id = ${lessonId}`;
}

// API: Lesson content generation / retrieval (lazy, cached).
//
// GET  returns cached content, generating it on first access.
// POST forces regeneration when `regenerate: true` (or ?regenerate=true).

// Assemble the full premium lesson payload: content + summary + structured
// metadata + progress timestamps, and record the "open" for progress tracking.
// Shared by the lesson endpoints and the topic endpoint so behaviour is uniform.
async function assembleLessonResponse(
  ownerEmail: string,
  result: {
    lesson: any;
    content: string;
    summary: string | null;
    contentStatus: string;
    generatedAt: string | null;
    cached: boolean;
  }
): Promise<any> {
  const lessonRow = result.lesson;

  // Resolve prerequisite names (cheap; ids already on the row).
  const prereqIds = Array.isArray(lessonRow.prerequisites) ? lessonRow.prerequisites : [];
  const prerequisiteNames = await resolveLessonNames(prereqIds);

  // Record this open + fetch last-opened, using the lesson's own relational
  // context. Non-fatal on failure so content still returns.
  let lastOpenedAt: string | null = null;
  try {
    const ctx = await findLessonContext(lessonRow.id);
    if (ctx) {
      lastOpenedAt =
        (await recordLessonOpened(ownerEmail, {
          lessonId: lessonRow.id,
          moduleId: ctx.module_id,
          phaseId: ctx.phase_id,
          roadmapId: ctx.roadmap_id
        })) || (await getLessonLastOpened(ownerEmail, lessonRow.id));
    }
  } catch (_) {
    /* tracking is best-effort */
  }

  const metadata = buildLessonMetadata({
    lessonRow,
    content: result.content,
    prerequisiteNames,
    generatedAt: result.generatedAt,
    lastOpenedAt,
    contentStatus: result.contentStatus
  });

  return {
    lessonId: lessonRow.id,
    name: lessonRow.title,
    content: result.content,
    summary: result.summary,
    contentStatus: result.contentStatus,
    cached: result.cached,
    metadata
  };
}

app.get('/api/lessons/:lessonId/content', requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.session.userEmail!;
  try {
    const result = await getOrGenerateLessonContent(lessonId);
    if (!result) return res.status(404).json({ error: 'Lesson not found' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json(payload);
  } catch (error: any) {
    console.error('[Lesson-Gen] content retrieval error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load lesson content' });
  }
});

app.post('/api/lessons/:lessonId/generate', aiLimiter, requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.session.userEmail!;
  const regenerate = req.body?.regenerate === true || req.query?.regenerate === 'true';
  try {
    const result = await getOrGenerateLessonContent(lessonId, { regenerate });
    if (!result) return res.status(404).json({ error: 'Lesson not found' });
    const payload = await assembleLessonResponse(userEmail, result);
    return res.json({ ...payload, regenerated: regenerate && !result.cached });
  } catch (error: any) {
    console.error('[Lesson-Gen] generation error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to generate lesson content' });
  }
});

// API: Read-only lesson metadata + user progress (does NOT generate content).
//
// Lightweight endpoint for lesson headers, lists, and future systems
// (quizzes/flashcards/mentor/revision) that need lesson metadata without paying
// the generation cost. Returns whether content is already generated/cached.
app.get('/api/lessons/:lessonId/meta', requireAuth, async (req, res) => {
  const { lessonId } = req.params;
  const userEmail = req.session.userEmail!;
  try {
    const lesson = await getLessonById(lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const prerequisiteNames = await resolveLessonNames(
      Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []
    );
    const generatedAt = lesson.generated_at ? new Date(lesson.generated_at).toISOString() : null;
    const hasContent = !!(lesson.markdown_content && String(lesson.markdown_content).trim().length > 0);
    const lastOpenedAt = await getLessonLastOpened(userEmail, lessonId);

    // Metadata WITHOUT triggering generation (content may be empty here).
    const metadata = buildLessonMetadata({
      lessonRow: lesson,
      content: hasContent ? lesson.markdown_content : '',
      prerequisiteNames,
      generatedAt,
      lastOpenedAt,
      contentStatus: lesson.content_status || 'pending'
    });

    // Per-user progress (completion, study minutes) from existing columns.
    let progress: { completed: boolean; studyMinutes: number; completedAt: string | null } = {
      completed: false, studyMinutes: 0, completedAt: null
    };
    try {
      const rows = await sql`
        SELECT completed, study_minutes, completed_at FROM user_lesson_progress
        WHERE owner_email = ${userEmail.toLowerCase()} AND lesson_id = ${lessonId} LIMIT 1
      `;
      if (rows[0]) {
        progress = {
          completed: !!rows[0].completed,
          studyMinutes: Number(rows[0].study_minutes) || 0,
          completedAt: rows[0].completed_at ? new Date(rows[0].completed_at).toISOString() : null
        };
      }
    } catch (_) { /* best-effort */ }

    return res.json({ lessonId, name: lesson.title, hasContent, metadata, progress });
  } catch (error: any) {
    console.error('[Lesson-Gen] meta retrieval error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load lesson metadata' });
  }
});

app.post('/api/generate-projects', aiLimiter, requireAuth, async (req, res) => {
  const { goal, phases } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required for project generation' });
  }

  const prompt = `
Generate 3-5 hands-on project ideas for this learning goal: "${sanitizeForPrompt(goal)}".

Skills covered in phases:
${(phases || []).map((ph: any) => `- ${ph.name || ph.id}: ${(ph.skillsCovered || []).join(', ')}`).join('\n')}

Return ONLY a valid JSON object matching this shape:
{
  "projects": [
    {
      "id": "ai-proj-1",
      "title": "Project title",
      "difficulty": "beginner" | "intermediate" | "advanced",
      "description": "2-3 sentence project description specific to ${sanitizeForPrompt(goal)}",
      "techStack": ["Tech1", "Tech2", "Tech3"],
      "features": ["Feature 1", "Feature 2"],
      "progress": 0
    }
  ]
}

Rules:
- At least one beginner, one intermediate, one advanced
- All project descriptions must be specific to "${sanitizeForPrompt(goal)}" — no generic filler
- techStack entries must be real, recognizable technologies
`;

try {
     const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.7, asJSON: true });
     const parsed = cleanAndParseJSON(response, '{"projects":[]}');
     const projects = parsed.projects || [];
     return res.json({ projects });

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('[AI-Fallback] /api/generate-projects fallback:', readableError);
    return res.json({ projects: [] });
  }
});

// 3. API: AI Mentor Chat (Streaming)
app.post('/api/mentor-chat', aiLimiter, requireAuth, async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message payload is required' });
  }

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        messages.push({
          role: h.sender === 'user' ? 'user' : 'assistant',
          content: sanitizeForPrompt(h.text || '', 500)
        });
      });
    }
    messages.push({ role: 'user', content: sanitizeForPrompt(message, 500) });

const systemInstruction = `
You are the LearnPath AI Mentor - a world-class university TA who excels at breaking down complex concepts.

Response Structure:
1. Start with clear heading
2. Write 1-2 sentence plain English overview
3. List 3-4 key points
4. End with quick exercise, next step, and pro tip

Use clean formatting without markdown symbols like ** or ##.
`;

    const prompt = `${systemInstruction}\n\nUser question: ${message}\n\nPrevious messages:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    const responseText = await callOpenRouterChatCompletion(prompt, { temperature: 0.5 });

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(responseText);


  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Chat Error:', readableError);
    
    // Fallback offline dynamic reply
    const lowercaseMessage = message.toLowerCase();
    let reply = "";

    if (lowercaseMessage.includes('python')) {
      reply = `### Python for AI Mastery 🐍\n\nPython is the foundation of modern AI development. These core libraries are essential:\n\n**Key Points**:\n- **NumPy Vectorization**: Replace slow Python loops with array operations\n- **Pandas DataFrames**: Handle structured learning data efficiently\n- **Object-Oriented Patterns**: Write reusable ML model components\n\n**Quick Exercise**: Write a NumPy array subtraction to compute Mean Squared Error between predicted and actual values\n**Next Step**: Explore PyTorch tensor operations for neural network foundations\n**Pro Tip**: Always vectorize computations - avoid native Python loops in numerical code`;
    } else if (lowercaseMessage.includes('roadmap') || lowercaseMessage.includes('generate')) {
      reply = `### Custom Roadmap Engineering 🗺️\n\nI craft personalized learning paths for any AI goal! Here's how:\n\n**Key Points**:\n- **Phases**: 3-5 digestible milestones breaking down complex topics\n- **Levels**: Foundations → Practice → Mastery progression\n- **Lessons**: Learn (theory) + Quiz (validation) format per level\n\n**Quick Exercise**: Define your target skill (e.g., "Build a chatbot with RAG") and I'll generate a roadmap\n**Next Step**: Click **Generate Custom Roadmap** in the Roadmaps tab\n**Pro Tip**: Start with 2-3 hours/week commitment for sustainable progress`;
    } else if (lowercaseMessage.includes('quiz') || lowercaseMessage.includes('test')) {
      reply = `### Knowledge Testing & XP Gains 🧠\n\nQuizzes reinforce learning through active recall:\n\n**Key Points**:\n- **Quiz Lessons**: 50 XP reward, multiple-choice with explanations\n- **Coding Exercises**: 75 XP reward, hands-on implementation\n- **Retention Boost**: Testing improves retention by up to 150%\n\n**Quick Exercise**: Ask for 3 questions on LLM tokenization to practice now\n**Next Step**: Complete quizzes in active roadmap phases to unlock next levels\n**Pro Tip**: Review incorrect answers - they reveal knowledge gaps to focus on`;
    } else if (lowercaseMessage.includes('neural') || lowercaseMessage.includes('network')) {
      reply = `### Neural Network Foundations 🧠\n\nNeural networks learn patterns through layered transformations:\n\n**Key Points**:\n- **Input Layer**: Receives feature vectors (e.g., pixel values)\n- **Hidden Layers**: Apply weighted transformations with activation functions\n- **Output Layer**: Produces predictions (probabilities, regressions, etc.)\n\n**Training Process**: Forward pass → Loss → Backpropagation adjusts weights\n\n**Quick Exercise**: Implement a single-layer perceptron with sigmoid activation in NumPy\n**Next Step**: Study backpropagation chain rule for multi-layer gradient flow\n**Pro Tip**: Initialize weights with Xavier/Glorot to prevent vanishing gradients`;
    } else if (lowercaseMessage.includes('attention') || lowercaseMessage.includes('transformer')) {
      reply = `### Self-Attention Mechanics 🎯\n\nSelf-attention lets models focus on relevant input parts:\n\n**Key Points**:\n- **Query-Key-Value**: Each position embedded into three vectors\n- **Similarity Scores**: Q·K^T measures relevance between positions\n- **Weighted Sum**: V weighted by softmax-normalized attention scores\n\n**Quick Exercise**: Given Q=[1,0], K=[1,1], compute attention score and explain intuition\n**Next Step**: Explore multi-head attention for parallel perspective learning\n**Pro Tip**: Scaled dot-product (÷√d_k) prevents extreme softmax values in high dimensions`;
    } else if (lowercaseMessage.includes('rag') || lowercaseMessage.includes('retrieval')) {
      reply = `### RAG Pipeline Architecture 🔄\n\nRAG grounds LLMs in external knowledge sources:\n\n**Key Points**:\n- **Retrieval**: Query vector database for relevant documents\n- **Augmentation**: Inject retrieved context into prompt\n- **Generation**: LLM produces answer from grounded context\n\n**Quick Exercise**: Design a prompt template: "Answer using only: {retrieved_chunks}"\n**Next Step**: Implement chunk overlap (20%) for better context continuity\n**Pro Tip**: Use re-ranking models to improve retrieval relevance beyond basic similarity`;
    } else if (lowercaseMessage.includes('llm') || lowercaseMessage.includes('token')) {
      reply = `### LLM Tokenization 🔤\n\nTokenization converts text to numerical IDs for model processing:\n\n**Key Points**:\n- **BPE Algorithm**: Byte-Pair Encoding merges frequent character pairs\n- **Vocabulary**: Model's known tokens (typically 32K-100K entries)\n- **Context Windows**: Limits how much text model can process at once\n\n**Quick Exercise**: Count tokens in your last question using \`len(text.split())\` approximation\n**Next Step**: Compare GPT-4 vs Llama tokenization strategies\n**Pro Tip**: Add 30% buffer for safety when estimating token usage`;
    } else if (lowercaseMessage.includes('numpy') || lowercaseMessage.includes('vector')) {
      reply = `### NumPy Vectorization ⚡\n\nVectorization enables fast array operations without Python loops:\n\n**Key Points**:\n- **Broadcasting**: Automatically expand smaller arrays to match shapes\n- **Memory Efficiency**: Operate on entire arrays at C speed\n- **SIMD**: Single instruction processes multiple data points\n\n**Quick Exercise**: \`np.array([1,2,3]) * np.array([4,5,6])\` vs native Python loop timing\n**Next Step**: Explore NumPy's advanced indexing for data selection\n**Pro Tip**: Always pre-allocate arrays with \`np.zeros()\` or \`np.empty()\` for performance`;
    } else if (lowercaseMessage.includes('help') || lowercaseMessage.includes('stuck')) {
      reply = `### Getting Unstuck 🆘\n\nHere's my debugging approach:\n\n**Strategy**:\n- **Isolate**: Create minimal reproduction of the problem\n- **Print**: Add debug statements at each step\n- **Verify**: Check inputs/outputs match expectations\n- **Simplify**: Remove complexity until it works\n\n**Quick Exercise**: Take your problem, strip to simplest case, fix, then rebuild\n**Next Step**: Share the specific error - I'll help decode it\n**Pro Tip**: Rubber duck debugging (explain aloud) solves 40% of problems`;
    } else {
      reply = `### AI Mentor Ready to Help 🤖\n\nYou asked: *"${sanitizeForPrompt(message)}"* - let me break this down!\n\n**My Approach**:\n- **Explain**: Concepts in plain English with practical analogies\n- **Show**: Code examples with line-by-line walkthroughs\n- **Practice**: Quick exercises to reinforce learning\n- **Extend**: Next steps and pro tips\n\n**Quick Exercise**: Pick any AI topic - I'll give you a 3-minute hands-on task\n**Next Step**: Share what you're learning, and I'll suggest a personalized path\n**Pro Tip**: Active recall (quizzing yourself) beats passive reading 3x for retention`;
    }

    // If headers are already sent, just end
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(reply);
  }
});

// 4. API: Verify and Analyze Script Code
app.post('/api/analyze-code', aiLimiter, requireAuth, async (req, res) => {
  const { code, instructions, solution, hint } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Code parameter is required' });
  }

  // Simple script safety check / heuristic validation
  const passesLocalValidation = code.includes('def') && 
    (code.includes('return') || code.includes('print')) &&
    !code.includes('error') &&
    code.length > 25;

  const prompt = `
Analyze the user's Python code submitted for the following exercise:
Instructions: "${sanitizeForPrompt(instructions || 'Implement a basic metrics calculator.', 500)}"
Expected solution pattern: "${sanitizeForPrompt(solution || '', 500)}"
User Code:
\`\`\`python
${sanitizeForPrompt(code, 2000)}
\`\`\`

Evaluate if the code is logically correct based on the instructions.
Concoct your response as a valid JSON object matching this structure:
{
  "passed": boolean (true if correct, false if there are syntax/logic bugs),
  "suggestions": "A short, highly helpful markdown tip advising the student on their formatting or optimizations",
  "explanation": "A 1-2 paragraph markdown walkthrough explaining the code line-by-line in a highly pedagogical way."
}
`;

try {
     const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.3, asJSON: true });
     const parsed = cleanAndParseJSON(response, '{}');
     return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Code Analysis fallback activation:', readableError);
    
    return res.json({
      passed: false,
      systemError: true,
      suggestions: "",
      explanation: "Verification service unavailable. Please retry."
    });
  }
});

// 5. API: AI Adaptive Recommendations
app.post('/api/ai-recommendations', aiLimiter, requireAuth, async (req, res) => {
  const { currentXp, level, streak, activeGoal } = req.body;
  const userEmail = req.session.userEmail;

  // Check cache first (valid for 5 minutes)
  const cacheKey = `${userEmail}:${activeGoal || ''}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REC_CACHE_TTL) {
    return res.json(cached.data);
  }

  const prompt = `
Generate 3 highly personalized study recommendations for a user of LearnPath AI with:
- XP: ${currentXp || 1840}
- Level: ${level || 12}
- Streak: ${streak || 5}
- Active Goal: "${sanitizeForPrompt(activeGoal || 'Full-Stack AI Engineering', 500)}"

Your response must be a JSON array of exactly 3 objects matching this schema:
[
  {
    "id": string (unique ID e.g., rec-1),
    "title": "Actionable title (e.g. NumPy Broadcast Challenge)",
    "description": "Short compelling reason what this is and how it helps their specific goal",
    "xpReward": number,
    "category": "quiz" or "coding" or "mentor" or "roadmap",
    "difficulty": "Easy" or "Medium" or "Hard"
  }
]
`;

try {
      const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.8, asJSON: true });
      const parsed = cleanAndParseJSON(response, '[]');
      // Cache successful response
      recCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
      return res.json(parsed);

   } catch (error: any) {
     let readableError = error.message || String(error);
     try {
       const parsedError = JSON.parse(error.message);
       if (parsedError?.error?.message) {
         readableError = parsedError.error.message;
       }
     } catch (_) {}
     console.error('OpenRouter recommendations fallback:', readableError);
     const fallback = [
       {
         id: 'rec-numpy',
         title: 'Complete: NumPy Index Exercises',
         description: 'Level up your Python status by completing vector slice operations. Practice handling dimensions with multi-dimensional matrices.',
         xpReward: 75,
         category: 'coding',
         difficulty: 'Medium'
       },
       {
         id: 'rec-quiz',
         title: 'Quiz: Neural Forward Propagation',
         description: 'Prove your Foundations awareness! Complete the 4-question checkpoint of linear boundaries.',
         xpReward: 50,
         category: 'quiz',
         difficulty: 'Easy'
       },
       {
         id: 'rec-mentor',
         title: 'Ask AI Mentor about MCP Specs',
         description: 'Explore Model Context Protocol schemas by asking our AI tutor. Learn how apps dynamically secure real-time DB contexts.',
         xpReward: 30,
         category: 'mentor',
         difficulty: 'Hard'
       }
     ];
     // Cache fallback response too
     recCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
     return res.json(fallback);
   }
   });

// 6. API: Dynamic Quiz Generator
app.post('/api/generate-quiz', aiLimiter, requireAuth, async (req, res) => {
  const { topicName } = req.body;

  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required for quiz' });
  }

const prompt = `
Generate a personalized, challenging study quiz for this topic: "${sanitizeForPrompt(topicName, 500)}".
Generate exactly 3 multiple-choice questions. Include misconceptionNotes for wrong answers.

Output must be a JSON array of questions:
[
  {
    "id": string,
    "question": "What is...?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctIndex": number (index of correct option 0-3),
    "explanation": "Pedagogical explanation of the solution.",
    "misconceptionNotes": ["Why option 1 seems plausible but is wrong"]
  }
]
`;

try {
      const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.7, asJSON: true });
      const parsed = cleanAndParseJSON(response, '[]');
      
      if (Array.isArray(parsed)) {
        for (const q of parsed) {
          if (!q.misconceptionNotes) {
            q.misconceptionNotes = ['Common misunderstanding - test again.'];
          }
        }
      }
      
      return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Dynamic Quiz error fallback:', readableError);
    
    return res.json([
      {
        id: 'q-dyn-1',
        question: `In modern ${topicName} development, what is the best strategy to prevent overfitting on local batches?`,
        options: [
          'Add a customized L2 parameter regularization / Dropout layers',
          'Repeatedly double the training epochs without validation evaluation',
          'Set learning rates to 1.0 to quicken gradient steps',
          'Strictly remove all activation transformations'
        ],
        correctIndex: 0,
        explanation: 'Dropout randomly deactivates neural paths to prevent multi-node correlation dependencies, while L2 regularization penalizes heavy weights, forcing lower weights and safer boundaries.'
      },
      {
        id: 'q-dyn-2',
        question: `What metric is most typically measured to analyze operational performance in a high-concurrency environment?`,
        options: [
          'Average token-generation latency (Time-to-First-Token)',
          'The storage volume of raw log exports inside system margins',
          'Absolute color hex contrast saturation percentages',
          'The count of text lines written in config packages'
        ],
        correctIndex: 0,
        explanation: 'Time-to-First-Token (TTFT) and token-generation throughput rate characterize model reactivity speed for client requests.'
      },
      {
        id: 'q-dyn-3',
        question: `How does our system optimize learning paths when performance indicators flag drop-offs?`,
        options: [
          'Re-routing user attention via a personalized, interactive roadmap',
          'Locking the profile until manual support intervenes',
          'Resetting total user accumulated level scores back to zero',
          'Ignoring state trends completely'
        ],
        correctIndex: 0,
        explanation: 'AI roadmaps adaptively suggest easier mini-tasks and explain concepts sequentially to clear bottlenecks and restore confidence.'
      }
    ]);
  }
});

// 7. API: Dynamic Topic Overview Generator
app.post('/api/generate-topic-overview', requireAuth, async (req, res) => {
  const { topicName, roadmapContext } = req.body;
  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required' });
  }

  const prompt = `
Generate a structured, engaging learner overview for the topic "${sanitizeForPrompt(topicName, 500)}" within the learning domain of "${sanitizeForPrompt(roadmapContext || 'AI and Programming', 500)}".
Please provide:
1. "what": A clear, 1-2 sentence description of what this skill is.
2. "why": A 1-2 sentence explanation of why this skill is a crucial part of this learning path.
3. "outcomes": A JSON array of 2-3 specific real-world abilities the learner will acquire after finishing this chapter.

Output MUST be a valid JSON object matching this schema:
{
  "what": string,
  "why": string,
  "outcomes": [string]
}
`;

try {
     const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.6, asJSON: true });
     const parsed = cleanAndParseJSON(response, '{}');
     return res.json(parsed);

  } catch (error: any) {
    console.warn('OpenRouter Topic Overview generator fallback:', error.message || error);
    // Dynamic fallback based on topic name
    const what = `This module delivers the core logical paradigms and mathematical definitions behind ${topicName}.`;
    const why = `Completing this section establishes the fundamental framework necessary to debug and scale complex code in ${roadmapContext || 'this domain'}.`;
    const outcomes = [
      `Grasp the core abstractions behind ${topicName} computing structures.`,
      `Implement clean, error-safe scripts using localized execution patterns.`,
      `Confidently verify functional outputs against real-world metrics.`
    ];
    return res.json({ what, why, outcomes });
  }
});

// 7.5 API: Progressive Hints Generator
app.post('/api/generate-hints', aiLimiter, requireAuth, async (req, res) => {
  const { lessonContent, lessonId, attemptNumber } = req.body;

  if (!lessonContent) {
    return res.status(400).json({ error: 'Lesson content is required' });
  }

  const prompt = `
Generate scaffolded hints for this learning exercise: "${sanitizeForPrompt(lessonContent, 1000)}".

Return JSON with progressive hint levels:
{
  "hints": [
    { "level": 1, "type": "conceptual", "text": "High-level direction without code details" },
    { "level": 2, "type": "syntax", "text": "Specific language features to use" },
    { "level": 3, "type": "pattern", "text": "Code pattern suggestion" },
    { "level": 4, "type": "partial", "text": "Partial solution with key pieces" }
  ],
  "hintCostXp": 10
}

Level ${attemptNumber || 1} is requested. Keep hints educational, not giving away answers.
`;

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.5, asJSON: true });
    const parsed = cleanAndParseJSON(response, '{"hints":[],"hintCostXp":10}');
    
    if (!parsed.hints || !Array.isArray(parsed.hints)) {
      parsed.hints = [
        { level: 1, type: "conceptual", text: "Focus on the core concept being taught." },
        { level: 2, type: "syntax", text: "Think about the key syntax patterns." },
        { level: 3, type: "pattern", text: "Consider the example structure shown." },
        { level: 4, type: "partial", text: "Review the solution steps." }
      ];
    }
    return res.json(parsed);

  } catch (error: any) {
    console.error('Hints generation fallback:', error.message);
    return res.json({
      hints: [
        { level: 1, type: "conceptual", text: "Focus on the core concept being taught." },
        { level: 2, type: "syntax", text: "Think about the key syntax patterns." }
      ],
      hintCostXp: 10
    });
  }
});

// 8. API: Get roadmap for workspace
app.get('/api/roadmaps/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const roadmap = await reconstructRoadmapJson(roadmapId);

    if (!roadmap) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    // Add topic/section structure for workspace (mirrors legacy derived shape).
    const workspaceRoadmap = {
      ...roadmap,
      phases: roadmap.phases.map((phase: any) => ({
        ...phase,
        levels: phase.levels.map((level: any) => ({
          ...level,
          topics: level.lessons.map((lesson: any) => ({
            id: lesson.id,
            name: lesson.name,
            type: lesson.type,
            status: lesson.status,
            xpReward: lesson.xpReward,
            estimatedTime: lesson.estimatedMinutes ?? 15
          }))
        }))
      }))
    };

    return res.json({ roadmap: workspaceRoadmap });
  } catch (error) {
    console.error('Get roadmap error:', error);
    return res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

// 8.1 API: Get topic content
app.get('/api/topics/:topicId', requireAuth, async (req, res) => {
  const { topicId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const lesson = await findLessonContext(topicId);

    if (!lesson) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Lazily generate + cache full lesson content on first open (idempotent;
    // returns cached content on subsequent opens). Degrades gracefully to empty
    // content if generation fails so the topic view still renders.
    let markdownContent = '';
    let summary: string | null = null;
    let generatedAt: string | null = null;
    let contentStatus: string = lesson.content_status || 'pending';
    try {
      const generated = await getOrGenerateLessonContent(topicId);
      if (generated) {
        markdownContent = generated.content || '';
        summary = generated.summary;
        generatedAt = generated.generatedAt;
        contentStatus = generated.contentStatus;
      }
    } catch (genErr: any) {
      console.warn('[Lesson-Gen] topic content generation failed, serving metadata only:', genErr?.message || genErr);
    }

    // Record the open for progress tracking (best-effort, existing columns only).
    let lastOpenedAt: string | null = null;
    try {
      lastOpenedAt =
        (await recordLessonOpened(userEmail, {
          lessonId: lesson.id,
          moduleId: lesson.module_id,
          phaseId: lesson.phase_id,
          roadmapId: lesson.roadmap_id
        })) || (await getLessonLastOpened(userEmail, lesson.id));
    } catch (_) {
      /* best-effort */
    }

    // Fallback summary if none was produced.
    if (!summary) {
      const name = lesson.title;
      summary = `### ${name}\n\n**Key Concepts:**\n- Core principles of ${name.toLowerCase()}\n- Practical applications and examples\n\n**Common Mistakes:**\n- Misunderstanding basic concepts\n- Forgetting syntax details`;
    }

    const objectives = Array.isArray(lesson.learning_objectives) && lesson.learning_objectives.length
      ? lesson.learning_objectives
      : [
          `Understand ${lesson.title.toLowerCase()} fundamentals`,
          `Apply concepts in practical scenarios`,
          `Complete exercises to reinforce learning`
        ];

    const prerequisiteNames = await resolveLessonNames(
      Array.isArray(lesson.prerequisites) ? lesson.prerequisites : []
    );

    const metadata = buildLessonMetadata({
      lessonRow: lesson,
      content: markdownContent,
      prerequisiteNames,
      generatedAt,
      lastOpenedAt,
      contentStatus
    });

    const topic = {
      id: lesson.id,
      name: lesson.title,
      type: lesson.type,
      phaseId: lesson.phase_id,
      levelId: lesson.module_id,
      status: lesson.status,
      xpReward: lesson.xp_reward,
      content: markdownContent,
      summary,
      objectives,
      estimatedTime: lesson.estimated_minutes ?? lesson.xp_reward ?? 15,
      // Premium metadata (additive; existing UI ignores unknown fields).
      difficulty: metadata.difficulty,
      skillsCovered: metadata.skillsCovered,
      prerequisites: metadata.prerequisites,
      completionChecklist: metadata.completionChecklist,
      contentStatus,
      generatedAt,
      lastOpenedAt,
      metadata
    };

    return res.json({ topic });
  } catch (error) {
    console.error('Get topic error:', error);
    return res.status(500).json({ error: 'Failed to load topic' });
  }
});
app.post('/api/validate-progression', requireAuth, async (req, res) => {
  const { roadmap } = req.body;

  if (!roadmap) {
    return res.status(400).json({ error: 'Roadmap data is required' });
  }

  const validation = {
    hasGaps: false,
    gaps: [],
    prerequisitesMet: true,
    missingPrerequisites: [],
    quizMatchesContent: true,
    mismatchedQuizzes: []
  };

  if (roadmap && roadmap.phases) {
    const allLessons: any[] = [];
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          allLessons.push({ ...lesson, phaseId: phase.id, levelId: level.id });
        }
      }
    }

    const completedBeforeAvailable = (lesson: any, idx: number) => 
      allLessons.slice(0, idx).some((l, i) => 
        allLessons[i].status === 'completed' && lesson.status === 'available'
      );

    const gaps: any[] = [];
    const missingPrerequisites: string[] = [];

    allLessons.forEach((lesson, idx) => {
      if (lesson.status === 'locked' && completedBeforeAvailable(lesson, idx)) {
        gaps.push({ lessonId: lesson.id, reason: 'Locked lesson after completed lessons' });
      }
      if (lesson.type === 'quiz' && lesson.status === 'available') {
        const hasLearnBefore = allLessons.slice(0, idx).some(l => l.type === 'learn' && l.status === 'completed');
        if (!hasLearnBefore) gaps.push({ lessonId: lesson.id, reason: 'Quiz unlocked without prior learning' });
      }
      if (lesson.prerequisites) {
        lesson.prerequisites.forEach((prereq: string) => {
          const prereqExists = allLessons.some(l => l.id === prereq);
          const prereqCompleted = allLessons.some(l => l.id === prereq && l.status === 'completed');
          if (!prereqExists) missingPrerequisites.push(`${lesson.id}: missing ${prereq}`);
          else if (!prereqCompleted && lesson.status === 'available') {
            missingPrerequisites.push(`${lesson.id}: ${prereq} not completed`);
          }
        });
      }
    });

    validation.hasGaps = gaps.length > 0;
    validation.gaps = gaps;
    validation.prerequisitesMet = missingPrerequisites.length === 0;
    validation.missingPrerequisites = missingPrerequisites;
  }

  return res.json(validation);
});

app.post('/api/update-roadmap', requireAuth, async (req, res) => {
  const { roadmapId, updates } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roadmapId || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'roadmapId and updates object are required' });
  }

  // Allowlist of client-mutable roadmap fields. Anything else (e.g. id, email,
  // createdAt, ownership fields) is rejected to prevent tampering.
  const ROADMAP_MUTABLE_FIELDS = new Set([
    'title', 'goal', 'progressPercent', 'totalXp', 'lessonsCompleted',
    'hoursRemaining', 'phases', 'resources', 'projects', 'quizzes'
  ]);
  const forbidden = Object.keys(updates).filter((k) => !ROADMAP_MUTABLE_FIELDS.has(k));
  if (forbidden.length > 0) {
    return res.status(400).json({ error: `Cannot update field(s): ${forbidden.join(', ')}` });
  }

  try {
    const existing = await getRoadmapsByOwner(userEmail);
    if (!existing.some((r: any) => r.id === roadmapId)) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    // Apply top-level mutable roadmap fields directly to the normalized row.
    const roadmapPatch: any = {};
    for (const key of Object.keys(updates)) {
      const uVal = (updates as any)[key];
      switch (key) {
        case 'title': roadmapPatch.title = uVal; break;
        case 'goal': roadmapPatch.goal = uVal; break;
        case 'progressPercent': roadmapPatch.progressPercent = uVal; break;
        case 'totalXp': roadmapPatch.totalXp = uVal; break;
        case 'lessonsCompleted': roadmapPatch.lessonsCompleted = uVal; break;
        case 'hoursRemaining': roadmapPatch.hoursRemaining = uVal; break;
        case 'status': roadmapPatch.status = uVal; break;
        case 'resources':
          for (const r of Array.isArray(uVal) ? uVal : []) {
            await upsertResource({
              id: r.id || `res-${roadmapId}-${r.title}`,
              roadmapId,
              phaseId: r.phaseId ?? null,
              moduleId: r.moduleId ?? null,
              title: r.title,
              type: r.type,
              provider: r.provider ?? null,
              url: r.url ?? null,
              description: r.description ?? null,
              duration: r.duration ?? null
            });
          }
          break;
        case 'projects':
          for (const p of Array.isArray(uVal) ? uVal : []) {
            await upsertPhaseProject({
              id: p.id || `proj-${roadmapId}-${p.title}`,
              roadmapId,
              phaseId: p.phaseId ?? null,
              title: p.title,
              difficulty: p.difficulty,
              description: p.description ?? null,
              techStack: p.techStack,
              features: p.features,
              githubUrl: p.githubUrl ?? null,
              progress: p.progress
            });
          }
          break;
        // 'phases' and 'quizzes' structural updates are not mutated via this
        // endpoint in practice; they are re-persisted through createRoadmapFromJson.
      }
    }

    if (Object.keys(roadmapPatch).length > 0) {
      const existingRoadmap = existing.find((r: any) => r.id === roadmapId);
      await upsertRoadmap({
        id: roadmapId,
        ownerEmail: userEmail.toLowerCase(),
        goal: existingRoadmap?.goal || roadmapPatch.goal || '',
        ...roadmapPatch
      });
    }

    const updated = await reconstructRoadmapJson(roadmapId);
    return res.json({ success: true, roadmap: updated });
  } catch (error) {
    console.error('Update roadmap error:', error);
    return res.status(500).json({ error: 'Failed to update roadmap' });
  }
});

// 8. API: GET all roadmaps for a user
app.get('/api/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;
  
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const roadmaps = await getUserRoadmapsReconstructed(userEmail);
    return res.json(roadmaps);
  } catch (error) {
    console.error('Get roadmaps error:', error);
    // Return empty array instead of error to allow frontend to work
    return res.json([]);
  }
});

// 9. API: DELETE a roadmap by id
app.delete('/api/roadmaps/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.session.userEmail;
  
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Enforce ownership: only delete a roadmap owned by the authenticated user.
    const owned = await getRoadmapsByOwner(userEmail);
    if (!owned.some((r: any) => r.id === id)) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    const deleted = await deleteRoadmap(id);
    if (deleted === 0) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    return res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete roadmap error:', error);
    return res.status(500).json({ error: 'Failed to delete roadmap. Database unavailable.' });
  }
});

// 10a. API: Create a new roadmap
app.post('/api/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  const roadmap = req.body;

  if (!roadmap || !roadmap.id || !roadmap.goal) {
    return res.status(400).json({ error: 'Valid roadmap object with id and goal is required' });
  }

  try {
    await createRoadmapFromJson(userEmail, roadmap);
    const saved = await reconstructRoadmapJson(roadmap.id);
    return res.json({ success: true, roadmap: saved || roadmap });
  } catch (error) {
    console.error('Create roadmap error:', error);
    return res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

// 10b. API: Topic-wise quiz attempts
app.get('/api/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const attempts = dbData?.topic_wise_quizzes || [];
    return res.json(attempts);
  } catch (error) {
    console.error('Get topic wise quizzes error:', error);
    return res.json([]);
  }
});

app.post('/api/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  const attempt = req.body;

  if (!attempt || !attempt.quizId) {
    return res.status(400).json({ error: 'quizId is required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const quizzes = dbData.topic_wise_quizzes || [];
    const idx = quizzes.findIndex((q: any) => q.quizId === attempt.quizId);

    if (idx >= 0) {
      quizzes[idx] = { ...quizzes[idx], ...attempt };
    } else {
      quizzes.push({
        ...attempt,
        id: attempt.id || `quiz-${Date.now()}`,
        quizId: attempt.quizId,
        quizName: attempt.quizName || 'Untitled Quiz',
        score: attempt.score || 0,
        totalQuestions: attempt.totalQuestions || 0,
        attemptsCount: attempt.attemptsCount || 0,
        lastAttemptedAt: attempt.lastAttemptedAt || new Date().toISOString()
      });
    }

    dbData.topic_wise_quizzes = quizzes;
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, attempt: quizzes[idx >= 0 ? idx : quizzes.length - 1] });
  } catch (error) {
    console.error('Upsert topic wise quiz error:', error);
    return res.status(500).json({ error: 'Failed to save quiz attempt' });
  }
});

// 10. API: Get user stats
app.get('/api/user-stats', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.json({
        xp: 0,
        streak: 0,
        hoursStudied: 0,
        lessonsCompleted: 0,
        overallMastery: 0
      });
    }

    const { totalLessons, completedLessons } = await getUserLessonCompletionStats(userEmail);
    const overallMastery = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    return res.json({
      xp: dbData.xp || 0,
      streak: dbData.streak ?? 0,
      hoursStudied: (dbData.profile as any)?.hoursStudied || 0,
      lessonsCompleted: completedLessons,
      overallMastery: Math.round(overallMastery)
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.json({
      xp: 0,
      streak: 0,
      hoursStudied: 0,
      lessonsCompleted: 0,
      overallMastery: 0
    });
  }
});

// 10c. API: Get user resource states (completed/saved resource IDs)
app.get('/api/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const states = dbData?.progress?.resource_states || { completedIds: [], savedIds: [] };
    return res.json(states);
  } catch (error) {
    console.error('Get resource states error:', error);
    return res.json({ completedIds: [], savedIds: [] });
  }
});

app.post('/api/user-resource-states', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;
  const { completedIds, savedIds } = req.body;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData.progress) dbData.progress = {};
    dbData.progress.resource_states = {
      completedIds: Array.isArray(completedIds) ? completedIds : [],
      savedIds: Array.isArray(savedIds) ? savedIds : []
    };
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    console.error('Save resource states error:', error);
    return res.status(500).json({ error: 'Failed to save resource states' });
  }
});

// 10d. API: Get user profile data from Neon
app.get('/api/user-profile', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress || {};
    return res.json({
      profile: progress.profile || {},
      settings: progress.settings || {},
      achievements: progress.achievements || [],
      notifications: progress.notifications || [],
      chats: progress.chats || []
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.json({
      profile: {},
      settings: {},
      achievements: [],
      notifications: [],
      chats: []
    });
  }
});

app.put('/api/user-profile', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;
  const { profile, settings, achievements, notifications, chats } = req.body;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fields owned/derived by the server. Clients must never set these via profile
  // updates, otherwise they could spoof XP, level, Pro status, or identity.
  const PROFILE_BLOCKLIST = [
    'xp', 'level', 'streak', 'isPro', 'email', 'createdAt', 'id', 'tier'
  ];

  function sanitizeProfile(input: any): Record<string, any> | null {
    if (input === undefined || input === null) return null;
    if (typeof input !== 'object' || Array.isArray(input)) return {};
    const clean: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      if (PROFILE_BLOCKLIST.includes(key)) continue;
      clean[key] = input[key];
    }
    return clean;
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    if (!dbData.progress) dbData.progress = {};
    
    const safeProfile = sanitizeProfile(profile);
    if (safeProfile) {
      const merged = { ...(dbData.progress.profile || {}), ...safeProfile };
      dbData.progress.profile = merged;
      dbData.profile = merged; // keep alias in sync so saveUserDB persists it
    }
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) dbData.progress.settings = settings;
    if (achievements) dbData.progress.achievements = Array.isArray(achievements) ? achievements : [];
    if (notifications) dbData.progress.notifications = Array.isArray(notifications) ? notifications : [];
    if (chats) dbData.progress.chats = Array.isArray(chats) ? chats : [];
    
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true });
  } catch (error) {
    console.error('Update user profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// 11. API: Complete a lesson
app.post('/api/complete-lesson', requireAuth, async (req, res) => {
  const { lessonId, xpEarned, xpReward, roadmapId } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!lessonId) {
    return res.status(400).json({ error: 'lessonId is required' });
  }

  try {
    // Wrap the ENTIRE read-modify-write (load -> mutate -> save -> streak) inside
    // the per-user lock so concurrent requests cannot interleave reads and clobber
    // each other (lost-update race on the single JSONB column).
    const result = await withUserLock(userEmail, async () => {
    // Resolve the lesson + its roadmap context from the normalized tables.
    const lessonCtx = await findLessonContext(lessonId);
    if (!lessonCtx) {
      throw new HttpError(404, 'Lesson not found');
    }

    const targetRoadmapId = roadmapId || lessonCtx.roadmap_id;
    if (targetRoadmapId && targetRoadmapId !== lessonCtx.roadmap_id) {
      throw new HttpError(400, 'Lesson does not belong to the provided roadmap');
    }

    // Idempotency guard: if the lesson is already marked completed, do NOT award
    // XP, streak, achievements, or stats again. Return success so the client stays
    // consistent on refresh / duplicate clicks. Rewards are granted exactly once.
    if (lessonCtx.status === 'completed') {
      const dbData = await loadUserDB(userEmail, { createIfMissing: false });
      return {
        xp: dbData?.xp || 0,
        streak: await getCurrentStreak(userEmail),
        completionPercent: await getRoadmapProgressPercent(lessonCtx.roadmap_id),
        alreadyCompleted: true,
        message: 'Lesson already completed.'
      };
    }

    // Server-authoritative XP: derive the reward from the lesson's own stored
    // xp_reward to prevent inflation (ignore any client-supplied xpEarned/xpReward).
    const xpValue = Number(lessonCtx.xp_reward) || 0;
    if (xpValue <= 0) {
      throw new HttpError(400, 'Lesson has no valid XP reward');
    }

    // Record completion in the normalized progress table + recompute roadmap counters.
    // Study time: prefer a client-supplied value, otherwise auto-attribute the
    // lesson's estimated minutes so time-on-task is tracked without frontend changes.
    const clientStudyMinutes = Number((req.body as any)?.studyMinutes);
    const autoStudyMinutes = Number(lessonCtx.estimated_minutes) || 0;
    const studyMinutes = Number.isFinite(clientStudyMinutes) && clientStudyMinutes > 0
      ? Math.min(clientStudyMinutes, 600)
      : autoStudyMinutes;

    const counters = await completeLessonForUser(
      userEmail,
      lessonId,
      lessonCtx.module_id,
      lessonCtx.phase_id,
      lessonCtx.roadmap_id,
      null,
      studyMinutes
    );
    const completionPercent = counters.progressPercent;

    // Invalidate the hot content cache entry (status changed to completed).
    clearLessonContentCacheEntry(lessonId);

    // User-level XP + activity log still live on the `users` row (out of scope for
    // the roadmap normalization). Update them under the same lock.
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      throw new HttpError(404, 'User data not found');
    }

    const newXP = (dbData.xp || 0) + xpValue;
    dbData.xp = newXP;
    if (!dbData.profile) dbData.profile = {};
    dbData.profile.xp = newXP;

    if (!dbData.activityLog) dbData.activityLog = {};
    const activityDateKey = new Date().toISOString().split('T')[0];
    const dayEntry = dbData.activityLog[activityDateKey] || { xp: 0, lessonsCompleted: 0 };
    dayEntry.xp += xpValue;
    dayEntry.lessonsCompleted += 1;
    dbData.activityLog[activityDateKey] = dayEntry;

    await saveUserDB(userEmail, dbData);

    const newStreak = await updateStreak(userEmail);

    return {
      xp: newXP,
      streak: newStreak,
      completionPercent,
      message: 'Lesson complete!'
    };
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Complete lesson error:', error);
    return res.status(500).json({ error: 'Failed to complete lesson. Database unavailable.' });
  }
});


// ============================================================================
// SUPABASE CLIENT SIMULATION PERSISTENCE ROUTING
// ============================================================================
import fs from 'fs';

type UserDB = {
  passwordHash?: string;
  [key: string]: any;
};

let usersTableReady: Promise<void> | null = null;

async function ensureUsersTable(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[Database Warning] DATABASE_URL not set.');
    return Promise.resolve();
  }

  if (!usersTableReady) {
    usersTableReady = sql`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password_hash TEXT,
        roadmap JSONB,
        progress JSONB,
        xp INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
      .then(async () => {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_date DATE`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0`;
        console.log('[Database] Connected to Neon PostgreSQL successfully');
        return undefined;
      })
      .catch((err: any) => {
        console.error('[Database Error] Failed to initialize users table:', err);
        return undefined;
      });
  }

  return usersTableReady;
}

function getDefaultUserDB(): UserDB {
  return {
    roadmaps: [],
    curated_resources: [
      {
        id: 'res-1',
        phaseId: 'phase-0',
        title: 'Deep Learning Foundations & Abstractions',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=aircAruvnKk',
        provider: '3Blue1Brown',
        duration: '22 mins',
        description: 'Excellent video explaining deep neural networks and backpropagation visually.'
      },
      {
        id: 'res-2',
        phaseId: 'phase-0',
        title: 'Google Machine Learning Crash Course',
        type: 'course',
        url: 'https://developers.google.com/machine-learning/crash-course',
        provider: 'Google Devs',
        duration: '15 hours',
        description: 'Google\'s high-speed structured introduction to core ML concepts.'
      },
      {
        id: 'res-3',
        phaseId: 'phase-1',
        title: 'Advanced Scientific Computing with NumPy',
        type: 'article',
        url: 'https://numpy.org/doc/stable/user/quickstart.html',
        provider: 'NumPy Org',
        duration: '45 mins',
        description: 'Comprehensive tutorials on tensor layouts, multi-dimensional slicing, and broadcast loops.'
      },
      {
        id: 'res-4',
        phaseId: 'phase-1',
        title: 'A Whirlwind Tour of Python Coding',
        type: 'book',
        url: 'https://github.com/jakevdp/WhirlwindTourOfPython',
        provider: 'O\'Reilly Press',
        duration: '3 hours',
        description: 'Fast track course on essential syntax, structures, and object orientation.'
      },
      {
        id: 'res-5',
        phaseId: 'phase-2',
        title: 'Linear Algebra Cheat Sheet & Vectors',
        type: 'article',
        url: 'https://medium.com',
        provider: 'Towards Data Science',
        duration: '15 mins',
        description: 'A beautifully formatted guide covering matrices, dot products, and principal dimensions.'
      },
      {
        id: 'res-6',
        phaseId: 'phase-2',
        title: 'The Matrix Calculus & Backpropagation Handbook',
        type: 'paper',
        url: 'https://arxiv.org',
        provider: 'arXiv Preprints',
        duration: '2 hours',
        description: 'Rigorous derivation of cost function optimizations and weight updates.'
      },
      {
        id: 'res-7',
        phaseId: 'phase-3',
        title: 'Attention Is All You Need (Transformer Paper)',
        type: 'paper',
        url: 'https://arxiv.org/abs/1706.03762',
        provider: 'arXiv Preprints',
        duration: '1.2 hours',
        description: 'The breakthrough research paper detailing the self-attention architecture.'
      },
      {
        id: 'res-8',
        phaseId: 'phase-3',
        title: 'Prompt Engineering Techniques & Standards',
        type: 'course',
        url: 'https://www.promptingguide.ai/',
        provider: 'DAIR.AI',
        duration: '4 hours',
        description: 'Industry-standard guides on dynamic template styling, few-shot routing, and chain of thought.'
      }
    ],
    topic_wise_quizzes: [
      {
        id: 'quiz-python',
        quizId: 'quiz-python',
        quizName: 'Python Foundations & Data Structure Quiz',
        score: 100,
        totalQuestions: 5,
        attemptsCount: 2,
        lastAttemptedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString()
      },
      {
        id: 'quiz-math',
        quizId: 'quiz-math',
        quizName: 'Linear Algebra & Dimensional Calculus Quiz',
        score: 80,
        totalQuestions: 5,
        attemptsCount: 1,
        lastAttemptedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      },
      {
        id: 'quiz-llm',
        quizId: 'quiz-llm',
        quizName: 'Attention Engine & LLM Architecture Quiz',
        score: 0,
        totalQuestions: 5,
        attemptsCount: 0,
        lastAttemptedAt: 'Never'
      },
      {
        id: 'quiz-rag',
        quizId: 'quiz-rag',
        quizName: 'Vector Embeddings & RAG Optimization Quiz',
        score: 0,
        totalQuestions: 5,
        attemptsCount: 0,
        lastAttemptedAt: 'Never'
      }
    ],
projects: [
       {
         id: 'proj-1',
         title: 'Custom AI Prompt Template Builder & Proxy',
         difficulty: 'beginner',
         description: 'Build an editor to style and optimize customizable system prompts, validating them using strict safety filters.',
         techStack: ['React', 'Tailwind', 'localStorage', 'lucide-react'],
         features: ['Dynamic variable injection', 'Precompiled templates library', 'One-click markdown export'],
         progress: 100,
         githubUrl: 'https://github.com/learnpath/prompt-builder'
       },
       {
         id: 'proj-2',
         title: 'Interactive NumPy Tensor Calculator',
         difficulty: 'beginner',
         description: 'A visual calculator demonstrating dot products, matrix multiplications, transpose operations, and scalar broadcasting rules.',
         techStack: ['React', 'NumPy Web Assembly', 'Tailwind CSS'],
         features: ['Interactive matrix grid inputs', 'Staggered computation steps visualization', 'Dimension validation warnings'],
         progress: 30,
         githubUrl: 'https://github.com/learnpath/tensor-calc'
       },
       {
         id: 'proj-3',
         title: 'Document PDF Ingestion Engine & Summarizer',
         difficulty: 'intermediate',
         description: 'A robust web utility that parses text from uploaded PDF chapters, generates chunk-based summaries, and builds high-speed search filters.',
         techStack: ['Express', 'React', 'PDF-Parse', 'Gemini Core'],
         features: ['Recursive token splitting', 'Auto-generated context tags map', 'Search with text highlight markers'],
         progress: 0
       },
       {
         id: 'proj-4',
         title: 'Local Git Commit Enhancer & Interactive Explainer',
         difficulty: 'intermediate',
         description: 'Integrate dynamic git hooks to read git diff files, draft informative commit messages matching core conventions, and explain semantic changes.',
         techStack: ['Node.js CLI', 'Simple Git API', 'Gemini LLMs'],
         features: ['Automatic Conventional Commits formatting', 'Performance impact flag review', 'Security-sensitive files monitor'],
         progress: 0
       },
       {
         id: 'proj-5',
         title: 'Autonomous AI Debugging Sandbox & Runner',
         difficulty: 'advanced',
         description: 'Create a secured, encapsulated browser coding playground that runs exercises, analyzes error logs, and requests corrective instructions from Gemini.',
         techStack: ['React', 'WebContainers', 'Xterm.js', 'LLM Agents'],
         features: ['Real-time terminal execution logs', 'Automated code diagnostics tool', 'Staggered auto-repair loops'],
         progress: 0
       }
     ],
     achievements: [
       {
         id: 'ach-1',
         name: 'First Steps',
         description: 'Complete your first lesson to begin your learning journey.',
         icon: '🎯',
         unlocked: false,
         category: 'python',
         xpReward: 50
       },
       {
         id: 'ach-2',
         name: 'Quiz Master',
         description: 'Score 100% on any quiz to demonstrate mastery.',
         icon: '🧠',
         unlocked: false,
         category: 'prompt',
         xpReward: 75
       },
       {
         id: 'ach-3',
         name: 'Roadmap Builder',
         description: 'Generate your first AI-powered learning roadmap.',
         icon: '🗺️',
         unlocked: false,
         category: 'agent',
         xpReward: 100
       }
     ]
   };
 }

async function loadUserDB(userEmail: string, options: { createIfMissing?: boolean } = {}): Promise<UserDB | null> {
  await ensureUsersTable();

  try {
    const result = await sql`
      SELECT password_hash, roadmap, progress, xp, last_active_date, streak
      FROM users
      WHERE email = ${userEmail.toLowerCase()}
    `;

    if (result[0]) {
      const row = result[0];
      const roadmap = row.roadmap || {};
      const progress = row.progress || {};
      
      const dbData: UserDB = {
        ...roadmap,
        ...progress,
        progress,
        xp: row.xp ?? 0,
        passwordHash: row.password_hash || undefined,
        last_active_date: row.last_active_date,
        streak: row.streak ?? 0
      };
      
      // BACKWARD COMPATIBILITY: Migrate old single roadmap to roadmaps array
      if (dbData.roadmap && !Array.isArray(dbData.roadmaps)) {
        console.log('[Migration] Converting single roadmap to roadmaps array for user:', userEmail);
        dbData.roadmaps = [{
          ...dbData.roadmap,
          id: dbData.roadmap.id || `roadmap-${Date.now()}`,
          createdAt: dbData.roadmap.createdAt || new Date().toISOString()
        }];
        delete dbData.roadmap;
        // Save migrated data
        await saveUserDB(userEmail, dbData);
      }

      // MIGRATION: Backfill profile.name for accounts created before the name
      // field existed at signup
      if (!dbData.profile) dbData.profile = {};
      if (!dbData.profile.name || !dbData.profile.name.trim()) {
        const derivedName = userEmail
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        console.log('[Migration] Backfilling profile.name for user:', userEmail);
        dbData.profile.name = derivedName;
        await saveUserDB(userEmail, dbData);
      }

      // Ensure roadmaps is always an array
      if (!dbData.roadmaps) {
        dbData.roadmaps = [];
      }

      // BACKWARD COMPATIBILITY (Phase 2): one-time backfill of the normalized
      // relational roadmap tables from the legacy monolithic JSONB roadmap blob.
      // Guarded so it runs only when the normalized tables are still empty for
      // this user (idempotent anyway). Fire-and-forget so it never blocks.
      if (dbData.roadmaps.length > 0) {
        const alreadyMigrated = (await getRoadmapsByOwner(userEmail)).length > 0;
        if (!alreadyMigrated) {
          migrateRoadmapJsonToTables(userEmail, dbData.roadmaps).catch((err: any) => {
            console.error('[Migration] Normalized table backfill failed for', userEmail, err?.message || err);
          });
        }
      }

      return dbData;
    }

    if (options.createIfMissing === false) {
      return null;
    }

    const defaultDB = getDefaultUserDB();
    await saveUserDB(userEmail, defaultDB);
    return defaultDB;
  } catch (error) {
    console.error('[Database Error] Failed to load user data:', error);
    // Return default data if database fails
    if (options.createIfMissing !== false) {
      return getDefaultUserDB();
    }
    return null;
  }
}

async function getUserRoadmaps(userEmail: string): Promise<any[]> {
  const key = userEmail.toLowerCase();
  const cached = roadmapCache.get(key);
  if (cached && Date.now() - cached.timestamp < ROADMAP_CACHE_TTL) {
    return cached.data;
  }

  const dbData = await loadUserDB(userEmail, { createIfMissing: false });
  const roadmaps = dbData?.roadmaps || [];
  roadmapCache.set(key, { data: roadmaps, timestamp: Date.now() });
  return roadmaps;
}

function invalidateUserRoadmaps(userEmail: string): void {
  roadmapCache.delete(userEmail.toLowerCase());
}

async function saveUserDB(userEmail: string, dbData: UserDB): Promise<void> {
  // Serialize all writes per user so concurrent read-modify-write cycles on the
  // single JSONB column cannot overwrite each other (lost-update race).
  return withUserLock(userEmail, async () => {
  await ensureUsersTable();

  try {
    const result = await sql`
      SELECT roadmap, progress FROM users WHERE email = ${userEmail.toLowerCase()}
    `;

    const currentRoadmap = result[0]?.roadmap || {};
    const currentProgress = result[0]?.progress || {};

    const { passwordHash, roadmaps, curated_resources, projects, topic_wise_quizzes, profile, settings, achievements, notifications, chats, resource_states, activityLog } = dbData;

    const newRoadmapData = {
      roadmaps: roadmaps || currentRoadmap.roadmaps || [],
      curated_resources: curated_resources || currentRoadmap.curated_resources || [],
      projects: projects || currentRoadmap.projects || [],
      topic_wise_quizzes: topic_wise_quizzes || currentRoadmap.topic_wise_quizzes || []
    };

    const newProgressData = {
      profile: profile || currentProgress.profile || {},
      settings: settings || currentProgress.settings || {},
      achievements: achievements || currentProgress.achievements || [],
      notifications: notifications || currentProgress.notifications || [],
      chats: chats || currentProgress.chats || [],
      resource_states: resource_states || currentProgress.resource_states || { completedIds: [], savedIds: [] },
      activityLog: activityLog || currentProgress.activityLog || {}
    };

    const xp = (profile as any)?.xp ?? (currentProgress.profile as any)?.xp ?? 0;

    await sql`
      INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
      VALUES (${userEmail.toLowerCase()}, ${passwordHash || null}, ${newRoadmapData}, ${newProgressData}, ${xp}, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        roadmap = EXCLUDED.roadmap,
        progress = EXCLUDED.progress,
        xp = COALESCE(EXCLUDED.xp, users.xp),
        updated_at = NOW()
    `;
  } catch (error) {
    console.error('[Database Error] Failed to save user data:', error);
    throw error;
  }
  });
}

async function updateStreak(userEmail: string): Promise<number> {
  await ensureUsersTable();

  const today = new Date().toISOString().split('T')[0];

  try {
      const result = await sql`
        SELECT streak, last_active_date
        FROM users
        WHERE email = ${userEmail.toLowerCase()}
      `;

      let currentStreak = 0;
      let lastActiveDate: string | null = null;

      if (result[0]) {
        currentStreak = result[0].streak ?? 0;
        lastActiveDate = result[0].last_active_date;
      }

      if (lastActiveDate === today) {
        return currentStreak;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastActiveDate === yesterdayStr) {
        currentStreak += 1;
      } else if (!lastActiveDate || lastActiveDate < yesterdayStr) {
        currentStreak = 1;
      }

      await sql`
        UPDATE users
        SET streak = ${currentStreak}, last_active_date = ${today}
        WHERE email = ${userEmail.toLowerCase()}
      `;

      return currentStreak;
    } catch (error) {
      console.error('[Database Error] Failed to update streak:', error);
      return 0;
    }
}

// Helper to prepare PWA assets on start
function preparePWAAssets() {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const srcIcon = path.join(process.cwd(), 'src', 'assets', 'images', 'icon_512_1781771940744.jpg');
    const destIcon512 = path.join(publicDir, 'icon-512.jpg');
    const destIcon192 = path.join(publicDir, 'icon-192.jpg');

    const imagesDir = path.join(process.cwd(), 'src', 'assets', 'images');
    let foundIcon = srcIcon;
    if (!fs.existsSync(srcIcon) && fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      const matching = files.find(f => f.startsWith('icon_512_'));
      if (matching) {
        foundIcon = path.join(imagesDir, matching);
      }
    }

    if (fs.existsSync(foundIcon)) {
      fs.copyFileSync(foundIcon, destIcon512);
      fs.copyFileSync(foundIcon, destIcon192);
      console.log('[PWA] Successfully cloned generated launcher JPEG icons to public/');
    } else {
      console.warn('[PWA] Source launcher icon not found, generating fallback placeholder icons...');
      // If we don't have a source icon yet, write a tiny dummy 1px purple PNG or let the browser use SVG
      // Note: SVG icon in manifest.json is already fully configured as the modern vector standard.
      const dummyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPsOfWvHgAHbQJuXpB91gAAAABJRU5ErkJggg==';
      const dummyBuffer = Buffer.from(dummyPngBase64, 'base64');
      fs.writeFileSync(destIcon512, dummyBuffer);
      fs.writeFileSync(destIcon192, dummyBuffer);
    }
  } catch (err) {
    console.error('[PWA] Error cloning launcher icons in preparePWAAssets:', err);
  }
}

// 8. API: Track Lesson Progress
app.post('/api/progress', aiLimiter, requireAuth, async (req, res) => {
  const { roadmapId, lessonId, action } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roadmapId || !lessonId) {
    return res.status(400).json({ error: 'roadmapId and lessonId are required' });
  }

  try {
    // Ensure the roadmap + lesson exist in the normalized tables.
    const lessonCtx = await findLessonContext(lessonId);
    if (!lessonCtx || lessonCtx.roadmap_id !== roadmapId) {
      return res.status(404).json({ error: 'Lesson or roadmap not found' });
    }

    if (action === 'complete') {
      // Record the completion relationally and recompute roadmap counters.
      await completeLessonForUser(
        userEmail,
        lessonId,
        lessonCtx.module_id,
        lessonCtx.phase_id,
        roadmapId,
        null,
        0
      );

      // Mark the roadmap state completed if all lessons are done.
      const lessonRows = await sql`SELECT status FROM lessons WHERE roadmap_id = ${roadmapId}`;
      const totalLessons = lessonRows.length;
      const completedLessons = lessonRows.filter((l: any) => l.status === 'completed').length;
      if (totalLessons > 0 && completedLessons >= totalLessons) {
        const state = await getRoadmapState(userEmail, roadmapId);
        await upsertRoadmapState({
          ownerEmail: userEmail,
          roadmapId,
          completedAt: state?.completed_at ?? new Date().toISOString()
        });
      }
    } else if (action === 'set-current') {
      await upsertRoadmapState({ ownerEmail: userEmail, roadmapId, currentLessonId: lessonId });
    }

    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ success: true, progress });
  } catch (error: any) {
    console.error('Progress tracking error:', error);
    return res.status(500).json({ error: 'Failed to update progress' });
  }
});

// 9. API: Get Progress
app.get('/api/progress/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const progress = await getRoadmapProgressSnapshot(userEmail, roadmapId);
    return res.json({ progress });
  } catch (error: any) {
    console.error('Get progress error:', error);
    return res.json({ progress: null });
  }
});

// Ensure sw.js is served with Cache-Control headers so that clients detect service worker updates instantly
app.get('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  next();
});

// Configure Vite integration as per our React Full-Stack Guidelines inside async bootstrap
async function bootstrap() {
  preparePWAAssets();
  // Provision normalized roadmap tables (idempotent; safe on every boot).
  ensureRoadmapTables().catch((err: any) =>
    console.error('[Database] Failed to ensure normalized roadmap tables:', err?.message || err)
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Binds strictly to 0.0.0.0 and PORT 3000 as required
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server starting running on http://0.0.0.0:${PORT}`);
    console.log(`Open in browser at http://localhost:${PORT}`);
    if (platform() === 'win32') {
      exec(`start "" "http://localhost:${PORT}"`);
    } else if (platform() === 'darwin') {
      exec(`open "http://localhost:${PORT}"`);
    } else {
      exec(`xdg-open "http://localhost:${PORT}"`);
    }
  });
  return server;
}

bootstrap().catch(console.error);