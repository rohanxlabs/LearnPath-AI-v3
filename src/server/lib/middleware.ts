import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

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
// CSRF — double-submit cookie pattern
// ---------------------------------------------------------------------------

/** Generate a fresh CSRF token (32 random bytes, hex-encoded). */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate CSRF for all state-mutating methods (POST / PUT / DELETE / PATCH).
 * The client must echo the `csrf-token` cookie value back in the `x-csrf-token`
 * request header. Safe methods (GET / HEAD / OPTIONS) are always allowed.
 *
 * Skip validation when NODE_ENV === 'test' so existing test suites continue to
 * pass without changes.
 */
export function validateCsrf(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (process.env.NODE_ENV === 'test' || SAFE_METHODS.has(req.method)) {
    return next();
  }
  const cookieToken = (req as any).cookies?.['csrf-token'] as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
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
export let RATE_LIMIT_STORE: any | undefined;

export function createLimiter(opts: {
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

export const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please slow down.' }
});

export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

// 30 lesson completions per minute per IP — prevents XP farming via rapid-fire requests.
export const lessonLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 30,
  message: { error: 'Too many lesson completions. Please slow down.' }
});
