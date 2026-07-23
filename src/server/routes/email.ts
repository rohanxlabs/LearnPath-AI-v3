/**
 * Email utilities — Resend integration.
 *
 * Verification flow: Supabase's built-in email confirmation is used exclusively.
 * The old custom token-based verify routes have been removed to avoid duplicate
 * confirmation emails.  The GET /api/verify-email/:token route is kept as a
 * no-op redirect so old links in users' inboxes don't 404.
 *
 * sendEmail is exported as a general utility for future transactional emails.
 */
import { Router } from 'express';
import { logger } from '../lib/logger';

const router = Router();

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@learnpath.ai';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
// GET /api/verify-email/:token — legacy no-op redirect
// Old verification links sent before the custom token system was removed will
// hit this route.  Redirect gracefully instead of returning 404.
// ---------------------------------------------------------------------------
router.get('/verify-email/:token', (_req, res) => {
  return res.redirect(`${APP_URL}/?verified=expired`);
});

// NOTE: /api/password-reset/request and /api/password-reset/confirm are
// handled by Supabase Auth in src/server/routes/auth.ts.

export default router;
