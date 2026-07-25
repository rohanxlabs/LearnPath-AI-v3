# Auth Security Fixes Plan

## Overview

Fix all 17 identified authentication security issues (finding #16 — MFA — is deferred as a feature,
not a bug). The fixes are grouped into logical sub-tasks so each change is self-contained and
reviewable. No new features or refactors beyond what is required to address each finding.

**Scope:** server-side auth routes, middleware, client AuthContext, and schema references.  
**Non-goals:** MFA implementation, Drizzle migration to drop `password_hash` column.

---

## Sub-Tasks

---

### Sub-Task 1 — Fix Critical: Invalidate Refresh Token on Logout

**Status:** `[ ] pending`

**Intent**  
`POST /api/logout` clears the `lp_refresh` HttpOnly cookie client-side but never revokes the
underlying Supabase server-side session tied to that refresh token. An attacker who captured
the cookie before logout can still call `POST /api/refresh` to obtain fresh access tokens.
Fix by reading the refresh token from the cookie, using it to refresh the session (obtaining
its access token), then revoking that session via the admin SDK before clearing the cookie.

**Expected Outcomes**
- After calling `POST /api/logout`, the `lp_refresh` cookie value is revoked in Supabase's
  session store — subsequent calls to `POST /api/refresh` with the same token return 401.
- Logout still completes successfully even if the refresh token is already expired or absent.

**Todo List**
1. In `src/server/routes/auth.ts`, in the `POST /api/logout` handler, before `res.clearCookie`:
   - Read `req.cookies?.lp_refresh`
   - If present, call `getSupabaseAnon().auth.refreshSession({ refresh_token })` to exchange
     it for a live access token (best-effort, wrapped in try/catch)
   - If a live session is returned, call `getSupabaseAdmin().auth.admin.signOut(access_token)`
     to revoke it server-side
2. Keep the existing best-effort fallback: if anything throws, proceed to clear the cookie
   and return `{ ok: true }` regardless.

**Relevant Context**
- `src/server/routes/auth.ts` lines 179–190 — current logout handler
- `getSupabaseAnon()` defined locally in `auth.ts` lines 31–39
- `getSupabaseAdmin()` imported from `src/server/lib/supabaseAdmin.ts`

---

### Sub-Task 2 — Fix High: Remove `reason` Field from JWKS 401 Response

**Status:** `[ ] pending`

**Intent**  
When ES256/RS256 JWT verification fails, the server currently returns `{ reason: failReason }`
alongside the 401, exposing internal error details (e.g. `"invalid signature"`, `"jwt expired"`,
`"no JWKS key matched kid=..."`) to the caller. This assists an attacker in diagnosing why
a forged token was rejected. The reason is already logged server-side; it must not reach the
response body.

**Expected Outcomes**
- 401 responses from the JWKS verification path contain only `{ error: "Invalid or expired token" }`.
- The `failReason` is still logged via `logger.warn` for server-side diagnostics.

**Todo List**
1. In `src/server/lib/middleware.ts` line 221, remove `reason: failReason` from the JSON response.

**Relevant Context**
- `src/server/lib/middleware.ts` lines 218–223 — asymmetric JWT verification failure path

---

### Sub-Task 3 — Fix High: Fix `verifyOtp` Called on the Admin Client via Unsafe `as any` Cast

**Status:** `[ ] pending`

**Intent**  
`POST /api/password-reset/confirm` calls `(admin.auth as any).verifyOtp(...)`. The `verifyOtp`
method belongs on the **anon** client (user-facing OTP flows), not the admin client. The `as any`
cast silences TypeScript, so if the method is absent on the admin client in a future SDK version
the call throws at runtime and disables password reset entirely with no compile-time warning.
Also sanitize the raw `token` from `req.body` before passing it into the OTP call.

**Expected Outcomes**
- `verifyOtp` is called on `getSupabaseAnon().auth` with no `as any` cast.
- The token input is sanitized (coerced to string, trimmed, length-capped) before use.
- TypeScript compiles cleanly with no `as any` on this call site.

**Todo List**
1. In `src/server/routes/auth.ts` around line 331:
   - Replace `(admin.auth as any).verifyOtp(...)` with `getSupabaseAnon().auth.verifyOtp(...)`
   - Sanitize the token input: `const tokenHash = String(token).trim().slice(0, 512)`
   - Pass `tokenHash` instead of raw `token` into the `verifyOtp` call

**Relevant Context**
- `src/server/routes/auth.ts` lines 320–350 — password-reset/confirm handler
- `getSupabaseAnon()` already defined in scope in the same file

---

### Sub-Task 4 — Fix High: Add Production Warning When Redis Rate-Limit Store is Unavailable

**Status:** `[ ] pending`

**Intent**  
When `REDIS_URL` is absent or the Redis connection fails, auth rate limiters silently fall back
to an in-memory per-process store. On multi-instance deployments, each instance has independent
counters — an attacker can bypass the 5-attempt login limit by hitting different instances.
Add an explicit `logger.warn` (or `logger.fatal` that doesn't exit) in production so operators
are immediately aware that brute-force protection is degraded.

**Expected Outcomes**
- In `NODE_ENV=production` with no `REDIS_URL` set, a `warn`-level log line is emitted at
  startup: `"[RateLimit] REDIS_URL not set in production — auth rate-limits are per-process only"`
- If Redis connection fails at runtime, a `warn` is emitted (the existing catch already logs,
  but the message should be promoted to warn in production).
- Behaviour is unchanged (still falls back gracefully); this is a visibility fix only.

**Todo List**
1. In `server.ts`, at the start of `buildAuthLimiters()`, after checking `!redisUrl`:
   - If `!redisUrl && isProduction`, emit `logger.warn('[RateLimit] REDIS_URL not set ...')`
2. In the catch block of `buildAuthLimiters()`, ensure the log level is `warn` (it already is).

**Relevant Context**
- `server.ts` lines 147–161 — `buildAuthLimiters` function
- `server.ts` line 34 — `isProduction` flag

---

### Sub-Task 5 — Fix High: Add `resetSupabaseAdminClient` Export for Key-Rotation Recovery

**Status:** `[ ] pending`

**Intent**  
The admin client singleton is cached for the process lifetime. If the `SUPABASE_SERVICE_ROLE_KEY`
is rotated while the process is running, the stale key produces cryptic 401 errors from Supabase
until the process restarts. Export a `resetSupabaseAdminClient()` function that clears the
singleton so it is recreated on the next call, and add a comment documenting that key rotation
requires either a restart or calling this function.

**Expected Outcomes**
- `src/server/lib/supabaseAdmin.ts` exports a `resetSupabaseAdminClient()` function.
- A JSDoc comment on `getSupabaseAdmin()` notes that rotating `SUPABASE_SERVICE_ROLE_KEY`
  requires restarting the process or calling `resetSupabaseAdminClient()`.

**Todo List**
1. In `src/server/lib/supabaseAdmin.ts`, add and export:
   ```ts
   export function resetSupabaseAdminClient(): void {
     _adminClient = null;
   }
   ```
2. Add a JSDoc comment to `getSupabaseAdmin` noting the key-rotation behaviour.

**Relevant Context**
- `src/server/lib/supabaseAdmin.ts` lines 7–27

---

### Sub-Task 6 — Fix Medium: Strengthen Password Policy

**Status:** `[ ] pending`

**Intent**  
The current `validatePassword` only requires ≥8 characters with one letter and one digit, allowing
trivially guessable passwords like `password1`. Raise the minimum to 10 characters and reject a
short blocklist of the most commonly used passwords to add defence-in-depth on top of Supabase's
own policy.

**Expected Outcomes**
- `validatePassword` rejects passwords shorter than 10 characters.
- `validatePassword` rejects a small set of known-common passwords (e.g. `password1`, `Password1`,
  `12345678a`, `qwerty123`).
- The `AuthScreen.tsx` placeholder text and `minLength` attribute are updated to reflect the new
  10-character minimum.
- Existing tests for the password validator are updated; no other behaviour changes.

**Todo List**
1. In `src/server/lib/middleware.ts`, update `validatePassword`:
   - Raise minimum length check from 8 to 10 characters
   - Add a small `COMMON_PASSWORDS` Set and return an error if the password is in the set
2. In `src/components/AuthScreen.tsx`:
   - Update placeholder text from "At least 8 characters with a number" to "At least 10 characters with a number"
   - Update `minLength={8}` to `minLength={10}` on the new-password inputs (login/reset forms)
3. Update the relevant test in `src/server/__tests__/auth.test.ts` that checks "short password (< 8 chars)"
   to reflect the new 10-character minimum.

**Relevant Context**
- `src/server/lib/middleware.ts` lines 246–253 — `validatePassword`
- `src/components/AuthScreen.tsx` lines 159, 309 — password input `minLength` and placeholder
- `src/server/__tests__/auth.test.ts` line 61 — "rejects short password" test

---

### Sub-Task 7 — Fix Medium: Guard CORS Against Missing `FRONTEND_URL` in Production

**Status:** `[ ] pending`

**Intent**  
When `FRONTEND_URL` is not set and `NODE_ENV=production`, `allowedOrigins` becomes an empty
array. The CORS callback then rejects all browser requests while silently allowing non-browser
tools — a silent misconfiguration that could cause a production outage. Add a startup guard that
emits a fatal log and exits if `FRONTEND_URL` is missing in production, so the problem is caught
at deploy time rather than at user-visible runtime.

**Expected Outcomes**
- If `NODE_ENV=production` and `FRONTEND_URL` is not set, the server logs a fatal error and
  exits with a non-zero code at startup.
- In development and test, the existing fallback to localhost origins is unchanged.

**Todo List**
1. In `server.ts`, add `FRONTEND_URL` to the `requiredEnvVars` array (already checked at line 24)
   — but gate it so it is only required when `NODE_ENV === 'production'`.  
   The cleanest approach is to add a separate post-`requiredEnvVars` check:
   ```ts
   if (isProduction && !process.env.FRONTEND_URL) {
     logger.fatal('FRONTEND_URL must be set in production (required for CORS)');
     process.exit(1);
   }
   ```

**Relevant Context**
- `server.ts` lines 22–29 — startup env-var validation block
- `server.ts` lines 79–96 — CORS configuration

---

### Sub-Task 8 — Fix Medium: Harden the `lp_refresh` Cookie (`sameSite: 'strict'`)

**Status:** `[ ] pending`

**Intent**  
The `lp_refresh` cookie is set with `sameSite: 'lax'`. Because the cookie path is scoped to
`/api/refresh`, upgrading to `'strict'` has no UX cost and prevents the cookie from being sent
on any cross-site top-level navigation, reducing the CSRF attack surface for the refresh endpoint.

**Expected Outcomes**
- Both places that set `lp_refresh` (POST /api/login and POST /api/refresh) use `sameSite: 'strict'`.

**Todo List**
1. In `src/server/routes/auth.ts` line 156, change `sameSite: 'lax'` → `sameSite: 'strict'`
2. In `src/server/routes/auth.ts` line 205, change `sameSite: 'lax'` → `sameSite: 'strict'`

**Relevant Context**
- `src/server/routes/auth.ts` lines 153–159 (login) and 202–208 (refresh)

---

### Sub-Task 9 — Fix Medium: Remove `userId` from Registration Response + Sanitize Supabase Error Messages

**Status:** `[ ] pending`

**Intent**  
Two related information-disclosure issues in `POST /api/register`:
1. The response body returns `userId: data.user?.id` — the raw Supabase Auth UUID. This is
   unnecessary and increases the attack surface for future IDOR vulnerabilities.
2. When a non-duplicate-email Supabase error occurs, `error.message` is forwarded verbatim
   to the client, potentially exposing internal Supabase error details.

Fix both in the same route handler.

**Expected Outcomes**
- `POST /api/register` no longer returns `userId` in the response body.
- Non-duplicate Supabase errors return a generic `"Registration failed. Please try again."` message
  to the client; the raw message is still logged server-side.

**Todo List**
1. In `src/server/routes/auth.ts` lines 98–104, remove the `userId` field from the response object.
2. In `src/server/routes/auth.ts` line 76, replace `error.message || 'Registration failed'`
   with the generic string `'Registration failed. Please try again.'`

**Relevant Context**
- `src/server/routes/auth.ts` lines 71–76 (error path) and 98–104 (success response)

---

### Sub-Task 10 — Fix Medium: Block Client-Supplied `achievements` and `activityLog` in `PUT /api/user-profile`

**Status:** `[ ] pending`

**Intent**  
`PUT /api/user-profile` currently accepts `achievements` and `activityLog` from the request body
and writes them directly to the database. This allows a user to self-unlock achievements (by
sending `unlocked: true`) and fabricate activity log entries. Achievements should only be
modified server-side via `unlockAchievement()`; activity log entries should only be written
by server-side lesson completion handlers. Remove both from the client-writable surface.

**Expected Outcomes**
- `PUT /api/user-profile` ignores any `achievements` or `activityLog` fields in the request body.
- The existing `unlockAchievement()` server-side path continues to work unchanged.
- The existing test that verifies `xp`/`level` are blocked still passes; a new test or
  updated assertion verifies `achievements` cannot be overwritten from the client.

**Todo List**
1. In `src/server/routes/user.ts` line 114, remove `achievements` and `activityLog` from the
   destructured request body fields.
2. Remove the corresponding write blocks for `achievements` (line 138) and `activityLog`
   (lines 141–144) from the handler body.
3. Update the test in `src/server/__tests__/auth.test.ts` that covers `PUT /api/user-profile`
   to also assert that a client-supplied `achievements` array is ignored.

**Relevant Context**
- `src/server/routes/user.ts` lines 112–151 — `PUT /api/user-profile` handler
- `src/server/lib/db.ts` `unlockAchievement()` — the correct server-side path for achievements

---

### Sub-Task 11 — Fix Low: Mask Email in `onAuthStateChange` Console Log

**Status:** `[ ] pending`

**Intent**  
`console.log(... email=${session?.user?.email})` in the Supabase auth state change listener logs
the user's unmasked email to the browser console, which is accessible to browser extensions and
XSS payloads. Replace with a masked version in all environments, or suppress entirely in
production.

**Expected Outcomes**
- The `console.log` in `onAuthStateChange` no longer prints the full email address.
- In development (`import.meta.env.DEV`), a masked version (e.g. `jo***@example.com`) is logged.
- In production the log line is omitted entirely.

**Todo List**
1. In `src/contexts/AuthContext.tsx` line 345, replace the `console.log` with a dev-only masked log:
   - Define a one-line inline mask: `(e: string) => e.replace(/^(.{2}).*(@.*)$/, '$1***$2')`
   - Wrap the log with `if (import.meta.env.DEV)`

**Relevant Context**
- `src/contexts/AuthContext.tsx` line 345 — inside `onAuthStateChange` listener

---

### Sub-Task 12 — Fix Low: Create a Dedicated Rate Limiter for `POST /api/refresh`

**Status:** `[ ] pending`

**Intent**  
`POST /api/refresh` shares `loginLimiter` (5 attempts / 15 min per IP) with `POST /api/login`.
Frequent but legitimate token refreshes (e.g. multiple browser tabs) can exhaust the shared
counter and lock a user out of the login form. Give the refresh endpoint its own higher-ceiling
limiter with a separate key namespace so refresh calls don't consume login attempts.

**Expected Outcomes**
- A dedicated `refreshLimiter` (e.g. 30 requests / 15 min) is created in `middleware.ts`.
- `POST /api/refresh` uses `refreshLimiter` instead of `loginLimiter`.
- The `setAuthLimiters` function and `buildAuthLimiters` in `server.ts` are updated to also
  upgrade the refresh limiter to the Redis store when `REDIS_URL` is set.

**Todo List**
1. In `src/server/lib/middleware.ts`:
   - Add `createRefreshLimiter(store?)` factory alongside the existing login/auth factories
   - Add `_refreshLimiterInstance` mutable reference and `refreshLimiter` wrapper export
   - Update `setAuthLimiters(store)` to also replace `_refreshLimiterInstance`
2. In `src/server/routes/auth.ts` line 192, replace `loginLimiter` with `refreshLimiter`
   (and add it to the import from `../lib/middleware`).
3. In `server.ts` `buildAuthLimiters()`, ensure `setAuthLimiters` (already called) is
   sufficient — since `setAuthLimiters` is being updated in step 1, no separate change needed here.

**Relevant Context**
- `src/server/lib/middleware.ts` lines 306–348 — rate limiter factories and wrappers
- `src/server/routes/auth.ts` line 18 (imports) and line 192 (refresh route)
- `server.ts` lines 154–156 — `setAuthLimiters` call

---

### Sub-Task 13 — Fix Low: Add `requireAuth` to `POST /api/feedback` + Sanitize Inputs

**Status:** `[ ] pending`

**Intent**  
The feedback endpoint accepts unauthenticated requests and inserts the caller's email as
`'anonymous'` when no session is present. This allows anonymous spam to the feedback table.
Decide: since the product's current state shows the feedback widget only on authenticated pages,
require auth. Also sanitize `message` and `context` to remove control characters before DB insert.

**Expected Outcomes**
- `POST /api/feedback` requires a valid Bearer token (`requireAuth` middleware applied).
- The `|| 'anonymous'` fallback is removed since `req.supabaseUser` is now always populated.
- `message` and `context` strings are stripped of null bytes / control characters before insertion.

**Todo List**
1. In `src/server/routes/user.ts` line 229, add `requireAuth` before `feedbackLimiter`:
   `router.post('/feedback', requireAuth, feedbackLimiter, async (req, res) => {`
2. On line 235, simplify to `const userEmail = req.supabaseUser!.email;`
3. Add a simple sanitize helper (strip characters `\x00–\x1F` except `\t`, `\n`, `\r`) applied
   to `message` and `context` before the length-slice.

**Relevant Context**
- `src/server/routes/user.ts` lines 229–244 — feedback handler
- `requireAuth` is already imported in `user.ts` line 2

---

### Sub-Task 14 — Fix Low: Reduce JWKS Cache TTL and Add Single-Flight Deduplication

**Status:** `[ ] pending`

**Intent**  
The JWKS cache TTL is 1 hour. A key rotation event forces every concurrent in-flight request
to independently re-fetch the JWKS endpoint simultaneously (thundering herd). Reduce the TTL
to 10 minutes and add a per-URL in-flight promise so that N concurrent cache misses produce
exactly 1 outbound JWKS request.

**Expected Outcomes**
- `JWKS_TTL_MS` is reduced from 60 minutes to 10 minutes.
- A `jwksFetchInFlight` map deduplicates concurrent fetches: the second+ caller awaits the
  same promise as the first caller instead of issuing a new request.

**Todo List**
1. In `src/server/lib/middleware.ts`:
   - Change `JWKS_TTL_MS` from `60 * 60 * 1000` to `10 * 60 * 1000`
   - Add a `Map<string, Promise<any[]>>` for in-flight fetches
   - In `getJwksKeys`, before issuing a new fetch: check if an in-flight promise exists for
     the URL; if yes, `await` it instead of making a new request; when the fetch resolves,
     delete the in-flight entry

**Relevant Context**
- `src/server/lib/middleware.ts` lines 85–96 — `JWKS_TTL_MS` and `getJwksKeys`

---

### Sub-Task 15 — Fix Informational: Deprecate `passwordHash` References in TypeScript Code

**Status:** `[ ] pending`

**Intent**  
The `password_hash` column in the `users` table is vestigial — authentication is fully delegated
to Supabase Auth and no code ever writes a bcrypt hash. The column is selected and passed around
in `db.ts` but is always `null`. Remove the field from the `UserDB` TypeScript type, remove it
from `SELECT` and `INSERT/UPDATE` queries in `db.ts`, remove the Drizzle schema column definition,
and add deprecation comments where the DB column itself still exists.

**Expected Outcomes**
- `UserDB` type in `db.ts` no longer has a `passwordHash` field.
- `loadUserDB` does not select `password_hash` from the users table.
- `saveUserDB` does not write `password_hash` in the INSERT/UPDATE statement.
- `drizzle/schema.ts` `users` table definition no longer includes `passwordHash`.
- A SQL comment or a code comment notes that the column still exists in the database
  and is retained for backward compatibility, but is never populated by application code.
- The test setup mock (`src/server/__tests__/setup.ts`) removes `password_hash` from the
  mock row type and related mock data.

**Todo List**
1. In `src/server/lib/db.ts`:
   - Remove `passwordHash?: string` from the `UserDB` type
   - Remove `password_hash` from the `SELECT` query in `loadUserDB`
   - Remove `passwordHash: row.password_hash || undefined` assignment
   - Remove `passwordHash` from the destructuring in `saveUserDB`
   - Remove `password_hash` from the `INSERT INTO users` columns and values
   - Remove `password_hash = COALESCE(...)` from the `ON CONFLICT DO UPDATE SET` clause
2. In `drizzle/schema.ts`, remove the `passwordHash` column from the `users` table definition
   and add a comment:
   ```ts
   // password_hash column intentionally omitted — auth delegated to Supabase.
   // Column still exists in DB for backward compatibility; never populated.
   ```
3. In `src/server/__tests__/setup.ts`, remove `password_hash` from the `UserRow` type and from
   mock row construction.

**Relevant Context**
- `src/server/lib/db.ts` lines 47–48, 119, 135, 202, 224, 228
- `drizzle/schema.ts` line 350
- `src/server/__tests__/setup.ts` lines 12, 34, 73–78

---

### Sub-Task 16 — Fix Informational: Validate `redirectAfterLogin` Against an Allowlist

**Status:** `[ ] pending`

**Intent**  
`redirectAfterLogin` is passed to `onRedirectAfterLogin` after stripping a leading slash. In
the current implementation the value is only ever set by the React app itself (not from a URL
parameter), so there is no active open-redirect. However, the pattern should be hardened now
so that any future change that sources this value from a URL parameter cannot introduce an
open redirect. Validate against an explicit set of known route tab names.

**Expected Outcomes**
- `onRedirectAfterLogin` is only called with values that are in a known `ALLOWED_TABS` set.
- Values not in the set fall back to `'home'`.
- Behaviour for existing callers is unchanged (they already pass valid tab names).

**Todo List**
1. In `src/contexts/AuthContext.tsx`, define a constant:
   ```ts
   const ALLOWED_REDIRECT_TABS = new Set(['home', 'roadmaps', 'settings', 'profile', 'learn']);
   ```
2. At the redirect usage (line 516), validate before calling `onRedirectAfterLogin`:
   ```ts
   const rawTab = redirectAfterLogin.replace('/', '') || 'home';
   const safeTab = ALLOWED_REDIRECT_TABS.has(rawTab) ? rawTab : 'home';
   onRedirectAfterLogin(safeTab);
   ```

**Relevant Context**
- `src/contexts/AuthContext.tsx` lines 515–517 — redirect-after-login logic
- `src/router/AppRouter.tsx` — check which tab names are actually valid routes

---

## Implementation Order

Sub-tasks are ordered from most critical / highest risk to lowest. Each sub-task is independent
and can be implemented and reviewed in isolation. Suggested order:

1. Sub-Task 1 (Critical — logout invalidation)
2. Sub-Task 2 (High — JWKS reason leak)
3. Sub-Task 3 (High — verifyOtp cast)
4. Sub-Task 4 (High — Redis fallback warning)
5. Sub-Task 5 (High — admin client reset)
6. Sub-Task 6 (Medium — password policy)
7. Sub-Task 7 (Medium — CORS guard)
8. Sub-Task 8 (Medium — cookie sameSite)
9. Sub-Task 9 (Medium — userId + error leak)
10. Sub-Task 10 (Medium — profile RBAC)
11. Sub-Task 11 (Low — email masking)
12. Sub-Task 12 (Low — refresh limiter)
13. Sub-Task 13 (Low — feedback auth)
14. Sub-Task 14 (Low — JWKS TTL)
15. Sub-Task 15 (Informational — passwordHash cleanup)
16. Sub-Task 16 (Informational — redirect allowlist)
