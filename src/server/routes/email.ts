/**
 * Email routes — verification + password reset via Resend.
 *
 * Flow:
 *   Register  → POST /api/verify-email/send   (auto-called after register)
 *   User link → GET  /api/verify-email/:token
 *   Forgot    → POST /api/password-reset/request
 *   Reset     → POST /api/password-reset/confirm
 *
 * All tokens are 32-byte hex strings with a 1-hour TTL, stored in the
 * `email_tokens` table (created on first use if missing).
 *
 * RESEND_API_KEY must be set to enable email sending. Without it, tokens
 * are logged to the console so dev/test flows still work end-to-end.
 */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { authLimiter, isValidEmail, validatePassword } from '../lib/middleware';
import { sql } from '../lib/db';
import { logger } from '../lib/logger';

const router = Router();

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@learnpath.ai';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Ensure tokens table exists (idempotent)
// ---------------------------------------------------------------------------
let tokensTableReady: Promise<void> | null = null;
async function ensureTokensTable(): Promise<void> {
  if (!tokensTableReady) {
    tokensTableReady = sql`
      CREATE TABLE IF NOT EXISTS email_tokens (
        token        TEXT PRIMARY KEY,
        email        TEXT NOT NULL,
        type         TEXT NOT NULL,  -- 'verify' | 'reset'
        expires_at   TIMESTAMPTZ NOT NULL,
        used         BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `.then(() =>
      sql`CREATE INDEX IF NOT EXISTS idx_email_tokens_email ON email_tokens (email)`
    ).then(() => undefined as void).catch((err: any) => {
      logger.warn({ err: err?.message }, '[EmailTokens] Table setup failed');
    });
  }
  return tokensTableReady;
}

// ---------------------------------------------------------------------------
// Send email via Resend (or log to console when key not set)
// ---------------------------------------------------------------------------
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info({ to, subject }, '[Email] RESEND_API_KEY not set — logging email instead of sending');
    logger.info({ html }, '[Email] Body');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
export async function createToken(email: string, type: 'verify' | 'reset'): Promise<string> {
  await ensureTokensTable();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await sql`
    INSERT INTO email_tokens (token, email, type, expires_at)
    VALUES (${token}, ${email.toLowerCase()}, ${type}, ${expiresAt})
  `;
  return token;
}

async function consumeToken(token: string, type: 'verify' | 'reset'): Promise<string | null> {
  await ensureTokensTable();
  const rows = await sql`
    SELECT email FROM email_tokens
    WHERE token = ${token}
      AND type = ${type}
      AND used = FALSE
      AND expires_at > NOW()
    LIMIT 1
  `;
  if (!rows[0]) return null;
  await sql`UPDATE email_tokens SET used = TRUE WHERE token = ${token}`;
  return rows[0].email as string;
}

// ---------------------------------------------------------------------------
// Shared helper — send a verification email. Used by auth.ts after register.
// Fire-and-forget safe: never throws, only logs on failure.
// ---------------------------------------------------------------------------
export async function sendVerificationEmail(email: string): Promise<void> {
  try {
    await ensureTokensTable();
    const token = await createToken(email, 'verify');
    const link = `${APP_URL}/api/verify-email/${token}`;
    await sendEmail(
      email,
      'Verify your LearnPath AI email',
      `<p>Hi there,</p>
       <p>Click the button below to verify your email address. This link expires in 1 hour.</p>
       <p><a href="${link}" style="background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email</a></p>
       <p>Or copy this link: <code>${link}</code></p>
       <p>If you did not create a LearnPath AI account, ignore this email.</p>`
    );
  } catch (err: any) {
    logger.warn({ err: err?.message }, '[Email] sendVerificationEmail failed (non-fatal)');
  }
}

// ---------------------------------------------------------------------------
// POST /api/verify-email/send
// ---------------------------------------------------------------------------
router.post('/verify-email/send', authLimiter, async (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const token = await createToken(userEmail, 'verify');
    const link = `${APP_URL}/api/verify-email/${token}`;
    await sendEmail(
      userEmail,
      'Verify your LearnPath AI email',
      `<p>Hi there,</p>
       <p>Click the button below to verify your email address. This link expires in 1 hour.</p>
       <p><a href="${link}" style="background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Verify Email</a></p>
       <p>Or copy this link: <code>${link}</code></p>
       <p>If you did not create a LearnPath AI account, ignore this email.</p>`
    );
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[Email] Failed to send verification email');
    return res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/verify-email/:token  (link in the email)
// ---------------------------------------------------------------------------
router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  const email = await consumeToken(token, 'verify').catch(() => null);

  if (!email) {
    return res.redirect(`${APP_URL}/?verified=invalid`);
  }

  try {
    await sql`
      UPDATE users SET email_verified = TRUE, updated_at = NOW()
      WHERE email = ${email}
    `.catch((err: any) => {
      logger.warn({ err: err?.message }, '[Email] email_verified UPDATE failed');
    });
    return res.redirect(`${APP_URL}/?verified=success`);
  } catch (err: any) {
    logger.error({ err: err?.message }, '[Email] Verification update failed');
    return res.redirect(`${APP_URL}/?verified=error`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/password-reset/request
// ---------------------------------------------------------------------------
router.post('/password-reset/request', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Always respond OK to prevent user enumeration
  try {
    const rows = await sql`SELECT email FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
    if (rows[0]) {
      const token = await createToken(email.toLowerCase(), 'reset');
      const link = `${APP_URL}/?reset_token=${token}`;
      await sendEmail(
        email.toLowerCase(),
        'Reset your LearnPath AI password',
        `<p>Hi there,</p>
         <p>You requested a password reset. Click the button below — this link expires in 1 hour.</p>
         <p><a href="${link}" style="background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a></p>
         <p>Or copy this link: <code>${link}</code></p>
         <p>If you did not request this, ignore this email — your password has not changed.</p>`
      );
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, '[Email] Password reset request failed');
  }
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/password-reset/confirm
// ---------------------------------------------------------------------------
router.post('/password-reset/confirm', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token is required' });

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const email = await consumeToken(token, 'reset').catch(() => null);
  if (!email) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

  try {
    const hash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE email = ${email}`;
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[Email] Password reset confirm failed');
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
