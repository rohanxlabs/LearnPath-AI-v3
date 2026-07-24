// Auth routes — backed by Supabase Authentication.
//
// The client-side Supabase SDK handles sign-in / sign-up / password-reset
// directly against the Supabase Auth API.  These server routes exist only to:
//
//   POST /api/register        — create user via admin SDK + seed user row
//   POST /api/login           — verify credentials via admin SDK (optional helper)
//   POST /api/logout          — stateless (Supabase tokens are revoked client-side)
//   GET  /api/bootstrap       — verify JWT, load profile + roadmaps in one shot
//   POST /api/password-reset/request   — trigger Supabase magic-link / OTP email
//   POST /api/password-reset/confirm   — update password via admin SDK
//
// All protected routes (bootstrap, etc.) expect:
//   Authorization: Bearer <supabase_access_token>

import { Router } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authLimiter, loginLimiter, isValidEmail, validatePassword, requireAuth } from '../lib/middleware';
import { loadUserDB, saveUserDB, sql } from '../lib/db';
import { getUserRoadmapsReconstructed, backfillUserLessonProgress } from '../db/queries';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Lazy-singleton anon client — used for password-based sign-in and password
// reset requests.  Created once on first use; never holds session state.
// ---------------------------------------------------------------------------
let _anonClient: SupabaseClient | null = null;
function getSupabaseAnon(): SupabaseClient {
  if (_anonClient) return _anonClient;
  _anonClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _anonClient;
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/register
// Creates the Supabase Auth user + seeds the local users row.
// ---------------------------------------------------------------------------
router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name || !name.trim()) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const admin = getSupabaseAdmin();

    // Create user in Supabase Auth.
    // email_confirm: false so the user must click the verification link
    // sent to their inbox before they can sign in.
    const { data, error } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      user_metadata: { name: name.trim() },
      email_confirm: false,
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already registered') || error.code === 'email_exists') {
        return res.status(400).json({ error: 'User already exists' });
      }
      logger.error({ err: error.message }, 'auth: Supabase register error');
      return res.status(400).json({ error: error.message || 'Registration failed' });
    }

    // Seed local DB row with the profile name so other routes find it immediately.
    const db = await loadUserDB(normalizedEmail);
    if (db) {
      if (!db.progress) db.progress = {};
      if (!db.progress.profile) db.progress.profile = {};
      db.progress.profile.name = name.trim();
      await saveUserDB(normalizedEmail, db);
    }

    // Trigger the Supabase confirmation email. Requires "Confirm email" to be
    // enabled in the Supabase dashboard under Authentication → Providers → Email,
    // and FRONTEND_URL to be set so the link redirects to the correct origin.
    const { error: linkErr } = await getSupabaseAnon().auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo: `${process.env.FRONTEND_URL || ''}/auth/confirmed` },
    });
    if (linkErr) logger.warn({ err: linkErr.message }, 'auth: confirmation email failed to send');

    return res.json({
      success: true,
      email: normalizedEmail,
      name: name.trim(),
      userId: data.user?.id,
      requiresVerification: true,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/login
// Validates credentials via Supabase Auth and returns the access_token so the
// client can persist it and pass it as Bearer on all subsequent calls.
// ---------------------------------------------------------------------------
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.trim()) return res.status(400).json({ error: 'Email is required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password is required' });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Use the public (anon-key) sign-in so Supabase validates the password and
    // returns a fresh session with tokens.  The admin client skips password
    // validation so we use the singleton anon client instead.
    const { data, error } = await getSupabaseAnon().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // Email not yet confirmed — return an actionable error so the UI can
    // prompt the user to check their inbox.
    if (error?.message?.toLowerCase().includes('email not confirmed')) {
      return res.status(403).json({
        error: 'Please confirm your email address. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_CONFIRMED',
      });
    }

    if (error || !data.session) {
      return res.status(401).json({ error: error?.message || 'Invalid credentials' });
    }

    // Fetch display name from our DB (may differ from Supabase metadata)
    const dbUser = await loadUserDB(normalizedEmail, { createIfMissing: false });
    const storedName = dbUser?.progress?.profile?.name || data.user?.user_metadata?.name || null;

    // Refresh token is managed by the Supabase SDK in the browser.
    // Never return it in the JSON body — that would expose a long-lived
    // credential to any JavaScript that can read the response.
    return res.json({
      ok: true,
      name: storedName,
      access_token: data.session.access_token,
      expires_in: data.session.expires_in,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/logout
// Supabase sessions are JWT-based; the client calls supabase.auth.signOut()
// which invalidates the refresh token.  This server endpoint is a no-op kept
// for backward compat (the client still calls it).
// ---------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  // Optionally revoke the server-side session via admin if a token is present.
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const admin = getSupabaseAdmin();
      await admin.auth.admin.signOut(token);
    } catch { /* best-effort */ }
  }
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/session — lightweight auth check
// ---------------------------------------------------------------------------
router.get('/session', requireAuth, (req, res) => {
  return res.json({ authenticated: true, email: req.supabaseUser!.email });
});

// ---------------------------------------------------------------------------
// GET /api/bootstrap — session + profile + roadmaps in one call
// ---------------------------------------------------------------------------
router.get('/bootstrap', requireAuth, async (req, res) => {
  const userEmail = req.supabaseUser!.email;

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress || {};

    // Backfill any completed lessons from the global lessons.status column into
    // user_lesson_progress so reconstructRoadmapJson can use per-user rows.
    // Guarded by progress_backfilled_at so this expensive migration runs at
    // most once per user lifetime, not on every bootstrap call.
    if (!dbData?.progress_backfilled_at) {
      await backfillUserLessonProgress(userEmail);
      await sql`
        UPDATE users SET progress_backfilled_at = NOW()
        WHERE email = ${userEmail.toLowerCase()}
      `.catch((e: any) => logger.warn({ err: e?.message }, 'bootstrap: failed to stamp backfill marker'));
    }

    const roadmaps = await getUserRoadmapsReconstructed(userEmail);

    // Merge authoritative xp (users.xp column) and streak (users.streak column) into
    // the profile object so AuthContext always restores real values on login.
    // progress.profile.xp may be stale or missing; the column values are always correct.
    const profileOut = {
      ...(progress.profile || {}),
      xp: dbData?.xp ?? (progress.profile as any)?.xp ?? 0,
      streak: dbData?.streak ?? (progress.profile as any)?.streak ?? 0,
    };

    return res.json({
      authenticated: true, email: userEmail,
      profile: profileOut, settings: progress.settings || {},
      achievements: progress.achievements || [], notifications: progress.notifications || [],
      chats: progress.chats || [], activityLog: progress.activityLog || {}, roadmaps,
    });
  } catch (error: any) {
    logger.error({ err: error?.message }, 'bootstrap failed');
    if (process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureException(error);
    }
    // Do NOT pretend the account is empty — that looks like data loss to the user.
    return res.status(503).json({
      error: 'Could not load your data right now. Please retry in a moment.',
      code: 'BOOTSTRAP_FAILED',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/password-reset/request
// Triggers Supabase's built-in reset-password email.
// ---------------------------------------------------------------------------
router.post('/password-reset/request', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required' });

  try {
    const redirectTo = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/reset-password`
      : undefined;

    // Always returns 200 so we don't leak whether the email is registered.
    await getSupabaseAnon().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    return res.json({ ok: true });
  } catch (error) {
    console.error('[Auth] Password reset request error:', error);
    return res.json({ ok: true }); // never reveal errors externally
  }
});

// ---------------------------------------------------------------------------
// POST /api/password-reset/confirm
// Updates the password.  Client must supply the OTP token_hash from the reset
// magic-link redirect (Supabase puts it in the URL hash as #access_token=...
// with type=recovery).  We use verifyOtp so only password-recovery tokens are
// accepted — plain session Bearer tokens are explicitly rejected.
// ---------------------------------------------------------------------------
router.post('/password-reset/confirm', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const admin = getSupabaseAdmin();

    // Only accept tokens that originated from a password-recovery flow.
    const { data: otpData, error: otpError } = await (admin.auth as any).verifyOtp({
      token_hash: token,
      type: 'recovery',
    });
    if (otpError || !otpData?.user) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    // Update the password via admin SDK
    const { error: updateError } = await admin.auth.admin.updateUserById(otpData.user.id, { password });
    if (updateError) {
      return res.status(400).json({ error: updateError.message || 'Password update failed' });
    }

    return res.json({ ok: true });
  } catch (error: any) {
    console.error('[Auth] Password reset confirm error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
