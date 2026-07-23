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
import { loadUserDB, saveUserDB } from '../lib/db';
import { getUserRoadmapsReconstructed } from '../db/queries';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

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
    // email_confirm: true marks email as confirmed so signInWithPassword works
    // immediately regardless of the project's "Confirm email" dashboard setting.
    const { data, error } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      user_metadata: { name: name.trim() },
      email_confirm: true,
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already registered') || error.code === 'email_exists') {
        return res.status(400).json({ error: 'User already exists' });
      }
      console.error('[Auth] Supabase register error:', error);
      return res.status(400).json({ error: error.message || 'Registration failed' });
    }

    // Force-confirm the email via updateUserById as a belt-and-suspenders
    // measure — some Supabase versions/plans ignore email_confirm on createUser.
    if (data.user?.id) {
      await admin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      }).catch((e: any) => {
        console.warn('[Auth] email_confirm updateUserById failed (non-fatal):', e?.message);
      });
    }

    // Seed local DB row with the profile name so other routes find it immediately.
    const db = await loadUserDB(normalizedEmail);
    if (db) {
      if (!db.progress) db.progress = {};
      if (!db.progress.profile) db.progress.profile = {};
      db.progress.profile.name = name.trim();
      await saveUserDB(normalizedEmail, db);
    }

    return res.json({ success: true, email: normalizedEmail, name: name.trim(), userId: data.user?.id });
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
    const admin = getSupabaseAdmin();

    // Use the public (anon-key) sign-in so Supabase validates the password and
    // returns a fresh session with tokens.  The admin client skips password
    // validation so we use the singleton anon client instead.
    let { data, error } = await getSupabaseAnon().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // If Supabase blocked sign-in because the email is not confirmed (can happen
    // when the project has "Confirm email" enabled but the account was created
    // via the Admin SDK before the email_confirm fix), auto-confirm and retry.
    if (error?.message?.toLowerCase().includes('email not confirmed')) {
      try {
        const { data: userData } = await (admin.auth.admin as any).getUserByEmail(normalizedEmail).catch(() => ({ data: null }));
        if (userData?.user?.id) {
          await admin.auth.admin.updateUserById(userData.user.id, { email_confirm: true });
          const retry = await getSupabaseAnon().auth.signInWithPassword({ email: normalizedEmail, password });
          data = retry.data;
          error = retry.error ?? null;
        }
      } catch (autoConfirmErr: any) {
        console.warn('[Auth] Auto-confirm on login failed:', autoConfirmErr?.message);
      }
    }

    if (error || !data.session) {
      return res.status(401).json({ error: error?.message || 'Invalid credentials' });
    }

    // Fetch display name from our DB (may differ from Supabase metadata)
    const dbUser = await loadUserDB(normalizedEmail, { createIfMissing: false });
    const storedName = dbUser?.progress?.profile?.name || data.user?.user_metadata?.name || null;

    return res.json({
      ok: true,
      name: storedName,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
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
  } catch (error) {
    console.error('Bootstrap error:', error);
    return res.json({
      authenticated: true, email: userEmail,
      profile: {}, settings: {}, achievements: [], notifications: [], chats: [], activityLog: {}, roadmaps: [],
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
