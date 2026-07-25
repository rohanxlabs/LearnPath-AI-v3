import { AsyncLocalStorage } from 'node:async_hooks';
import { createPublicKey } from 'node:crypto';
import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

/** Never log raw emails. Produces a stable, non-reversible-at-a-glance tag. */
function maskEmail(email?: string): string {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'invalid';
  return `${local.slice(0, 2)}***@${domain}`;
}

// ---------------------------------------------------------------------------
// Extend Express Request with Supabase user payload
// ---------------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      supabaseUser?: { id: string; email: string };
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP error used to propagate status codes out of locked closures.
// ---------------------------------------------------------------------------
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Per-user write lock — serializes read-modify-write cycles for the same user.
// ---------------------------------------------------------------------------
const userLocks: Map<string, Promise<void>> = new Map();
const lockContext = new AsyncLocalStorage<string>();

export async function withUserLock<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const key = email.toLowerCase();
  const heldKey = lockContext.getStore();

  // Nested acquisition within the same async context -> run inline.
  if (heldKey === key) return fn();

  const previous = userLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });

  // Store a reference to the exact chained promise so the identity check in
  // the finally block compares the same object (not a new allocation).
  const chained = previous.then(() => next);
  userLocks.set(key, chained);

  try {
    return await lockContext.run(key, async () => {
      await previous;
      return await fn();
    });
  } finally {
    release();
    // Only delete if no one queued behind us in the meantime.
    if (userLocks.get(key) === chained) userLocks.delete(key);
  }
}

/** Returns the number of currently held lock entries (for testing). */
export function lockCount(): number {
  return userLocks.size;
}

// ---------------------------------------------------------------------------
// Auth middleware — verify Supabase JWT locally (no API round-trip)
// ---------------------------------------------------------------------------

/**
 * In-memory JWKS cache so we fetch the public key at most once per process.
 * Key: Supabase project URL.  Value: { keys, fetchedAt }.
 */
const jwksCache: Map<string, { keys: any[]; fetchedAt: number }> = new Map();
// 10-minute TTL: short enough to pick up key rotations within a reasonable window
// without hammering the JWKS endpoint on every request.
const JWKS_TTL_MS = 10 * 60 * 1000;

// Single-flight map: deduplicates concurrent JWKS fetches so N simultaneous
// cache misses produce exactly 1 outbound HTTP request instead of N.
const jwksFetchInFlight: Map<string, Promise<any[]>> = new Map();

async function getJwksKeys(supabaseUrl: string): Promise<any[]> {
  const cached = jwksCache.get(supabaseUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  // If a fetch is already in-flight for this URL, await it instead of starting another.
  const inflight = jwksFetchInFlight.get(supabaseUrl);
  if (inflight) return inflight;

  const fetchPromise = fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
      const { keys } = await res.json() as { keys: any[] };
      jwksCache.set(supabaseUrl, { keys, fetchedAt: Date.now() });
      return keys;
    })
    .finally(() => {
      jwksFetchInFlight.delete(supabaseUrl);
    });

  jwksFetchInFlight.set(supabaseUrl, fetchPromise);
  return fetchPromise;
}

// Synchronous JWK → PEM via Node crypto (available in Node 15+).
function jwkToPemSync(jwk: any): string {
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  return key.export({ type: 'spki', format: 'pem' }) as string;
}

/**
 * Verify the Supabase JWT sent by the client as `Authorization: Bearer <token>`.
 *
 * Handles both token types issued by Supabase:
 *   • HS256  — older projects: verified with SUPABASE_JWT_SECRET (symmetric)
 *   • ES256  — newer projects: verified with the project's JWKS public key
 *
 * The algorithm is read from the token header so the right path is chosen
 * automatically — no configuration change needed.
 */
export function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const route = `${req.method} ${req.path}`;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    logger.warn({ route }, 'auth: 401 no bearer token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Decode header to determine the signing algorithm without verifying yet.
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    logger.warn({ route }, 'auth: 401 token not decodable');
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const alg = (decoded.header?.alg as string | undefined) ?? 'HS256';
  // Log expiry from the unverified payload so we can spot expired tokens immediately.
  const rawPayload = decoded.payload as jwt.JwtPayload;
  const tokenExp = rawPayload?.exp ? new Date(rawPayload.exp * 1000).toISOString() : 'unknown';
  const tokenEmail = (rawPayload?.email as string | undefined) ?? 'unknown';
  logger.debug({ route, alg, email: maskEmail(tokenEmail) }, 'auth: verifying token');

  if (alg === 'HS256') {
    // ─── Symmetric path (older Supabase projects) ──────────────────────────
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      logger.error({ route }, 'auth: 500 SUPABASE_JWT_SECRET not set');
      res.status(500).json({ error: 'Server misconfiguration: SUPABASE_JWT_SECRET is not set' });
      return;
    }
    try {
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      const email = payload.email as string | undefined;
      const sub = payload.sub as string | undefined;
      if (!email || !sub) {
        logger.warn({ route }, 'auth: 401 HS256 token missing email/sub claims');
        res.status(401).json({ error: 'Invalid token: missing claims' });
        return;
      }
      req.supabaseUser = { id: sub, email };
      next();
    } catch (e: any) {
      logger.warn({ route, err: e?.message, tokenExp }, 'auth: 401 HS256 verify failed');
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else {
    // ─── Asymmetric path (newer Supabase projects — ES256 / RS256) ─────────
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      logger.error({ route }, 'auth: 500 SUPABASE_URL not set');
      res.status(500).json({ error: 'Server misconfiguration: SUPABASE_URL is not set' });
      return;
    }
    const tokenKid = decoded.header?.kid as string | undefined;
    // Two-pass: first try with cached keys, then force-refresh JWKS once on failure.
    // This handles key rotation — a stale cached key no longer matching the current
    // signing key would otherwise permanently block logins until the process restarts.
    const tryVerify = (keys: any[]): { ok: true; email: string; sub: string } | { ok: false; reason: string; noKey?: boolean } => {
      const candidates = tokenKid ? keys.filter((k) => k.kid === tokenKid) : keys;
      logger.debug({ route, tokenKid: tokenKid ?? 'none', candidates: candidates.length }, 'auth: JWKS key match');
      if (candidates.length === 0) return { ok: false, reason: `no JWKS key matched kid=${tokenKid}`, noKey: true };
      let lastReason = 'unknown';
      for (const jwk of candidates) {
        try {
          const pem = jwkToPemSync(jwk);
          const payload = jwt.verify(token, pem, { algorithms: [alg as any] }) as jwt.JwtPayload;
          const email = payload.email as string | undefined;
          const sub = payload.sub as string | undefined;
          if (!email || !sub) return { ok: false, reason: 'missing email/sub claims' };
          return { ok: true, email, sub };
        } catch (e: any) {
          lastReason = e?.message ?? 'unknown';
        }
      }
      return { ok: false, reason: lastReason };
    };

    getJwksKeys(supabaseUrl)
      .then(async (keys) => {
        let result = tryVerify(keys);

        // If verification failed and we used cached keys, bust the cache and retry once.
        // This recovers from key rotation without a process restart.
        if (!result.ok) {
          const failReason = (result as any).reason ?? 'unknown';
          logger.warn({ route, reason: failReason }, 'auth: first JWKS pass failed, busting cache and retrying');
          jwksCache.delete(supabaseUrl);
          try {
            const freshKeys = await getJwksKeys(supabaseUrl);
            result = tryVerify(freshKeys);
          } catch (e: any) {
            logger.error({ route, err: e?.message }, 'auth: 503 JWKS re-fetch failed');
            res.status(503).json({ error: 'Unable to verify token: JWKS unavailable' });
            return;
          }
        }

        if (!result.ok) {
          const failReason = (result as any).reason ?? 'unknown';
          logger.warn({ route, alg, tokenExp, reason: failReason }, 'auth: 401 token verification failed');
          // Do NOT forward the internal failure reason to the client — log it only.
          res.status(401).json({ error: 'Invalid or expired token' });
          return;
        }

        req.supabaseUser = { id: result.sub, email: result.email };
        next();
      })
      .catch((e: any) => {
        // JWKS fetch failed — this is a server-side infrastructure problem
        // (cold-start, network blip), NOT a bad token.  Return 503 so the
        // client's retry loop treats it as a transient error and retries,
        // rather than treating it as an auth failure and logging the user out.
        logger.error({ route, err: e?.message }, 'auth: 503 JWKS fetch failed');
        res.status(503).json({ error: 'Unable to verify token: JWKS unavailable' });
      });
  }
}

// ---------------------------------------------------------------------------
// Input validators
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 254;
}
// A small blocklist of the most commonly used passwords that pass character-class
// rules but should be rejected for obvious guessability.
const COMMON_PASSWORDS = new Set([
  'password1', 'Password1', 'password12', 'Password12',
  'qwerty123', 'Qwerty123', '12345678a', '123456789a',
  'abc12345', 'Abc12345', 'letmein1', 'welcome1',
  'monkey123', 'dragon12', 'master12', 'passw0rd',
  'Passw0rd!', 'P@ssword1', 'P@ssw0rd', 'Welcome1!',
  'Admin123!', 'admin123!', 'Football1', 'Baseball1',
]);

/**
 * Measures how many distinct character classes a password uses.
 * Returns a number 0–4: lowercase, uppercase, digit, special.
 */
function passwordCharsetScore(password: string): number {
  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 10) return 'Password must be at least 10 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  // Require at least one special character so purely alphanumeric passwords
  // with a predictable structure (e.g. "Password1") cannot pass.
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must contain at least one special character (e.g. !, @, #, $)';
  }
  // Reject passwords that are mostly repeated characters (e.g. "aaaaaaaaaa!1").
  const uniqueChars = new Set(password).size;
  if (uniqueChars < 5) {
    return 'Password is too repetitive — use a greater variety of characters';
  }
  // Charset diversity: lowercase + uppercase + digit + special = 4 classes.
  // Require at least 3 distinct classes for adequate entropy.
  if (passwordCharsetScore(password) < 3) {
    return 'Password must use at least 3 character types (lowercase, uppercase, digit, or special)';
  }
  if (COMMON_PASSWORDS.has(password)) {
    return 'Password is too common — please choose a less predictable one';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate-limit factory
// ---------------------------------------------------------------------------

/**
 * Create an express-rate-limit instance.
 * Pass a `store` to use a shared (e.g. Redis) store; omit for in-memory.
 * Pass a `keyGenerator` to override the default IP-based key — use this to
 * key by authenticated user ID so each user has their own independent bucket.
 */
export function createLimiter(opts: {
  windowMs: number;
  max: number;
  message: { error: string };
  store?: any;
  keyGenerator?: (req: express.Request) => string;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: opts.message,
    ...(opts.store ? { store: opts.store } : {}),
    ...(opts.keyGenerator ? { keyGenerator: opts.keyGenerator } : {}),
  });
}

// AI limiter — keyed by authenticated user ID so each user has their own
// independent 10-req/min bucket.  Falls back to IP for unauthenticated requests
// (shouldn't reach here since requireAuth runs first on all AI routes).
export const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please slow down.' },
  // Key by authenticated user ID — each user has their own independent bucket.
  // Falls back to ipKeyGenerator(req.ip) which normalises IPv6 addresses
  // correctly (required by express-rate-limit v8 when using a custom keyGenerator).
  keyGenerator: (req: express.Request) =>
    req.supabaseUser?.id ?? ipKeyGenerator(req.ip ?? ''),
});

// Roadmap generation limiter — keyed by user ID, max 3 generations per hour.
// Roadmap creation is the most expensive AI call: up to 3 LLM retries, each
// producing a large JSON payload, followed by hundreds of DB inserts.
// 3/hour per user keeps costs predictable while not blocking normal usage.
export const roadmapGenLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 1000 : 3,
  message: { error: 'Roadmap generation limit reached. You can generate up to 3 roadmaps per hour.' },
  keyGenerator: (req: express.Request) =>
    req.supabaseUser?.id ?? ipKeyGenerator(req.ip ?? ''),
});

// 30 lesson completions per minute per user — prevents XP farming via rapid-fire requests.
// Keyed by authenticated user ID (same as aiLimiter) so the bucket is per-user,
// not per-IP — shared IPs (NAT, VPN) cannot be used to bypass the limit.
export const lessonLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  message: { error: 'Too many lesson completions. Please slow down.' },
  keyGenerator: (req: express.Request) =>
    req.supabaseUser?.id ?? ipKeyGenerator(req.ip ?? ''),
});

/**
 * Factory for the auth limiter (register / password-reset).
 * Pass a Redis store to share counters across instances; omit for in-memory.
 */
export function createAuthLimiter(store?: any): ReturnType<typeof rateLimit> {
  return createLimiter({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    message: { error: 'Too many authentication attempts. Please try again later.' },
    store,
  });
}

/**
 * Factory for the login limiter (stricter — 5 attempts per 15 min).
 * Pass a Redis store to share counters across instances; omit for in-memory.
 */
export function createLoginLimiter(store?: any): ReturnType<typeof rateLimit> {
  return createLimiter({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 5,
    message: { error: 'Too many authentication attempts. Please try again later.' },
    store,
  });
}

/**
 * Factory for the token-refresh limiter — higher ceiling than login since
 * legitimate clients (multiple browser tabs) refresh frequently.
 * Pass a Redis store to share counters across instances; omit for in-memory.
 */
export function createRefreshLimiter(store?: any): ReturnType<typeof rateLimit> {
  return createLimiter({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 30,
    message: { error: 'Too many token refresh attempts. Please try again later.' },
    store,
  });
}

// ---------------------------------------------------------------------------
// Auth limiters — eagerly created at module load with in-memory store.
// server.ts bootstrap() calls setAuthLimiters(redisStore) before app.listen
// to upgrade them to a Redis-backed shared store when REDIS_URL is set.
// ---------------------------------------------------------------------------

// Mutable references — replaced atomically by setAuthLimiters before any
// request arrives, so the wrapper never creates a limiter mid-request.
let _authLimiterInstance: ReturnType<typeof rateLimit> = createAuthLimiter();
let _loginLimiterInstance: ReturnType<typeof rateLimit> = createLoginLimiter();
let _refreshLimiterInstance: ReturnType<typeof rateLimit> = createRefreshLimiter();

/**
 * Replace the active auth/login/refresh limiter instances with Redis-backed ones.
 * Must be called before app.listen() — i.e. during bootstrap, not per-request.
 *
 * Each limiter MUST receive its own store instance — express-rate-limit v8
 * throws ERR_ERL_STORE_REUSE if the same object is shared across limiters.
 * Use RedisStore.withPrefix() to create three isolated stores from one connection.
 */
export function setAuthLimiters(stores: { auth: any; login: any; refresh: any }): void {
  _authLimiterInstance = createAuthLimiter(stores.auth);
  _loginLimiterInstance = createLoginLimiter(stores.login);
  _refreshLimiterInstance = createRefreshLimiter(stores.refresh);
}

/**
 * Wrapper middleware that delegates to the current active instance.
 * The instance is always pre-created (never inside a request handler).
 */
export const authLimiter: express.RequestHandler = (req, res, next) =>
  _authLimiterInstance(req, res, next);

export const loginLimiter: express.RequestHandler = (req, res, next) =>
  _loginLimiterInstance(req, res, next);

export const refreshLimiter: express.RequestHandler = (req, res, next) =>
  _refreshLimiterInstance(req, res, next);
