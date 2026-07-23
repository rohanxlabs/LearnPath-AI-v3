import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';

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

// ---------------------------------------------------------------------------
// Auth middleware — verify Supabase JWT locally (no API round-trip)
// ---------------------------------------------------------------------------

/**
 * In-memory JWKS cache so we fetch the public key at most once per process.
 * Key: Supabase project URL.  Value: { keys, fetchedAt }.
 */
const jwksCache: Map<string, { keys: any[]; fetchedAt: number }> = new Map();
const JWKS_TTL_MS = 60 * 60 * 1000; // re-fetch after 1 hour

async function getJwksKeys(supabaseUrl: string): Promise<any[]> {
  const cached = jwksCache.get(supabaseUrl);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json() as { keys: any[] };
  jwksCache.set(supabaseUrl, { keys, fetchedAt: Date.now() });
  return keys;
}

// Synchronous JWK → PEM via Node crypto (available in Node 15+).
function jwkToPemSync(jwk: any): string {
  const { createPublicKey } = require('node:crypto');
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
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Decode header to determine the signing algorithm without verifying yet.
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const alg = (decoded.header?.alg as string | undefined) ?? 'HS256';

  if (alg === 'HS256') {
    // ─── Symmetric path (older Supabase projects) ──────────────────────────
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server misconfiguration: SUPABASE_JWT_SECRET is not set' });
      return;
    }
    try {
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      const email = payload.email as string | undefined;
      const sub = payload.sub as string | undefined;
      if (!email || !sub) {
        res.status(401).json({ error: 'Invalid token: missing claims' });
        return;
      }
      req.supabaseUser = { id: sub, email };
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else {
    // ─── Asymmetric path (newer Supabase projects — ES256 / RS256) ─────────
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      res.status(500).json({ error: 'Server misconfiguration: SUPABASE_URL is not set' });
      return;
    }
    getJwksKeys(supabaseUrl)
      .then((keys) => {
        // Match by kid if present, otherwise try all keys.
        const kid = decoded.header?.kid as string | undefined;
        const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;
        if (candidates.length === 0) {
          res.status(401).json({ error: 'Invalid token: no matching JWKS key' });
          return;
        }
        let lastErr: Error | null = null;
        for (const jwk of candidates) {
          try {
            const pem = jwkToPemSync(jwk);
            const payload = jwt.verify(token, pem, { algorithms: [alg as any] }) as jwt.JwtPayload;
            const email = payload.email as string | undefined;
            const sub = payload.sub as string | undefined;
            if (!email || !sub) {
              res.status(401).json({ error: 'Invalid token: missing claims' });
              return;
            }
            req.supabaseUser = { id: sub, email };
            next();
            return;
          } catch (e: any) {
            lastErr = e;
          }
        }
        // All candidate keys failed — token is invalid.
        res.status(401).json({ error: 'Invalid or expired token' });
      })
      .catch(() => {
        res.status(401).json({ error: 'Unable to verify token: JWKS unavailable' });
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
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rate-limit factory
// ---------------------------------------------------------------------------

/**
 * Create an express-rate-limit instance.
 * Pass a `store` to use a shared (e.g. Redis) store; omit for in-memory.
 */
export function createLimiter(opts: {
  windowMs: number;
  max: number;
  message: { error: string };
  store?: any;
}): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: opts.message,
    ...(opts.store ? { store: opts.store } : {})
  });
}

// AI and lesson limiters are per-process / per-IP and don't need Redis upgrade.
export const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please slow down.' }
});

// 30 lesson completions per minute per IP — prevents XP farming via rapid-fire requests.
export const lessonLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  message: { error: 'Too many lesson completions. Please slow down.' }
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

// ---------------------------------------------------------------------------
// Auth limiters — eagerly created at module load with in-memory store.
// server.ts bootstrap() calls setAuthLimiters(redisStore) before app.listen
// to upgrade them to a Redis-backed shared store when REDIS_URL is set.
// ---------------------------------------------------------------------------

// Mutable references — replaced atomically by setAuthLimiters before any
// request arrives, so the wrapper never creates a limiter mid-request.
let _authLimiterInstance: ReturnType<typeof rateLimit> = createAuthLimiter();
let _loginLimiterInstance: ReturnType<typeof rateLimit> = createLoginLimiter();

/**
 * Replace the active auth/login limiter instances with Redis-backed ones.
 * Must be called before app.listen() — i.e. during bootstrap, not per-request.
 */
export function setAuthLimiters(store: any): void {
  _authLimiterInstance = createAuthLimiter(store);
  _loginLimiterInstance = createLoginLimiter(store);
}

/**
 * Wrapper middleware that delegates to the current active instance.
 * The instance is always pre-created (never inside a request handler).
 */
export const authLimiter: express.RequestHandler = (req, res, next) =>
  _authLimiterInstance(req, res, next);

export const loginLimiter: express.RequestHandler = (req, res, next) =>
  _loginLimiterInstance(req, res, next);
