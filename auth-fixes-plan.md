# Auth Fixes Plan

## Overview

Fix all 8 findings from the authentication system audit.
The architecture stays as-is (Supabase JWT + Bearer token on every route).
No new dependencies. Changes are purely corrective — minimal code delta per sub-task.

Severity → Sub-task mapping:
- CRITICAL  → Sub-task 1 (CSRF posture)
- HIGH      → Sub-task 2 (rate-limit store), Sub-task 3 (password-reset token type)
- MEDIUM    → Sub-task 4 (signup double-setState), Sub-task 5 (remove express-session), Sub-task 6 (profile persistence scope)
- LOW       → Sub-task 7 (deep-link reset token), Sub-task 8 (anon client singleton + dual email verification)

## Confirmed Design Decisions

1. **Dependencies**: `connect-pg-simple` will be removed from `package.json` and `pnpm install` run as part of Sub-task 5.
2. **Rate-limit store (Sub-task 2)**: Use a lazy Redis factory pattern — limiters are created after Redis is provisioned at startup, with a transparent in-memory fallback when `REDIS_URL` is absent.
3. **Old verify-email links (Sub-task 8B)**: Keep `GET /api/verify-email/:token` temporarily as a no-op redirect to `/?verified=expired` instead of a hard 404, so in-flight links from existing users don't break.

---

## Sub-task 1 — Document and enforce CSRF posture

**Status:** [x] done

### Intent
`validateCsrf` and `generateCsrfToken` are exported but never used.
The `getCsrfToken` helper in `AuthContext` was already deprecated (returns `""`).
Because every mutation requires `Authorization: Bearer <token>` (which a cross-site
form cannot set), CSRF protection at the cookie level is technically unnecessary.
This sub-task clears the confusion: remove the dead CSRF code from both the server
and the client so no future developer accidentally depends on it.

### Expected Outcomes
- `validateCsrf` and `generateCsrfToken` are removed from `middleware.ts`.
- `getCsrfToken` and `mutatingHeaders` CSRF-comment are removed from `AuthContext.tsx` and its interface.
- `x-csrf-token` is removed from the CORS `allowedHeaders` list in `server.ts`.
- A short ADR comment in `server.ts` near the CORS config explains why CSRF is not needed.
- All existing tests continue to pass.

### Todo List
1. Remove `generateCsrfToken` and `validateCsrf` exports from `src/server/lib/middleware.ts`.
2. Remove `getCsrfToken` from the `AuthContextValue` interface and the `AuthProvider` value object in `src/contexts/AuthContext.tsx`.
3. Remove the `@deprecated` comment and `getCsrfToken` callback from `AuthContext.tsx`.
4. Remove `x-csrf-token` from `allowedHeaders` in `server.ts` CORS config.
5. Add a one-line comment above the CORS block explaining the Bearer-only CSRF posture.
6. Search the codebase for any remaining `getCsrfToken` / `x-csrf-token` / `validateCsrf` call sites and remove them.

### Relevant Context
- `src/server/lib/middleware.ts` — lines 62–90: `generateCsrfToken`, `validateCsrf`
- `src/contexts/AuthContext.tsx` — line 105: `getCsrfToken: () => string` in interface; line 197: implementation; line 430: value object
- `server.ts` — line 116: `allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']`

---

## Sub-task 2 — Fix rate-limit store not actually upgrading to Redis

**Status:** [x] done

### Intent
`upgradeRateLimitStore()` in `server.ts` mutates the exported `RATE_LIMIT_STORE`
variable after `express-rate-limit` instances have already been created.
`express-rate-limit` captures the store option at instantiation time so the mutation
has no effect. Brute-force counters remain per-process and reset on every deploy.

The fix: delay limiter creation until after the Redis store is provisioned.
Implement a lazy-initialisation pattern so limiters are created with the correct
store on first request, or create them after the async upgrade completes at startup.

### Expected Outcomes
- When `REDIS_URL` is set, `authLimiter` and `loginLimiter` share state across restarts and instances via Redis.
- When `REDIS_URL` is absent, in-memory store is used (current behaviour preserved).
- The server still starts with the same boot sequence; no route is affected.

### Todo List
1. Change `createLimiter` in `middleware.ts` to accept an optional `store` parameter passed at call-time rather than reading a module-level variable.
2. Export a `createAuthLimiter(store?)` and `createLoginLimiter(store?)` factory instead of pre-built singleton instances for the auth/login limiters. `aiLimiter` and `lessonLimiter` do not need the upgrade (they are per-IP, less critical).
3. In `server.ts`, refactor `upgradeRateLimitStore()` to be `async` and `await`-ed before any route is attached, creating the Redis store first and passing it into the factory.
4. Assign the created limiter instances to module-level variables that are then used by the route registrations.
5. Update `src/server/routes/auth.ts` imports to use the new factory-produced instances.

### Relevant Context
- `src/server/lib/middleware.ts` — lines 159–200: `RATE_LIMIT_STORE`, `createLimiter`, `authLimiter`, `loginLimiter`
- `server.ts` — lines 163–178: `upgradeRateLimitStore` and its `RATE_LIMIT_STORE` mutation
- `src/server/lib/redisStore.ts` — RedisStore.create(url) returns the store
- `src/server/routes/auth.ts` — line 17: imports `authLimiter`, `loginLimiter`

---

## Sub-task 3 — Fix password-reset confirm accepting any Bearer token

**Status:** [ ] pending

### Intent
`POST /api/password-reset/confirm` calls `admin.auth.getUser(token)` which accepts
any valid live session token, not only a Supabase password-recovery token.
An attacker who obtains another user's access token could reset their password.

The Supabase Admin SDK provides `admin.auth.verifyOtp({ token_hash, type: 'recovery' })`
for exactly this purpose. Switching to that call ensures only recovery-flow tokens
are accepted.

### Expected Outcomes
- `POST /api/password-reset/confirm` returns HTTP 400 when passed a plain Bearer/session token.
- It returns HTTP 200 only when passed a valid Supabase OTP recovery token.
- The existing test that passes a Bearer token as the reset token is updated to expect 400.
- A new passing test is added that documents the correct (OTP recovery token) path.

### Todo List
1. In `src/server/routes/auth.ts`, replace the `admin.auth.getUser(token)` call in `/password-reset/confirm` with `admin.auth.verifyOtp({ token_hash: token, type: 'recovery' })`.
2. Adjust error handling to map the verifyOtp error responses to the existing HTTP 400 message.
3. In `src/server/__tests__/auth.test.ts`, update the test "confirm succeeds with valid token from registered user" to expect HTTP 400 (a session token is not a recovery token).
4. Update the mock in `src/server/__tests__/setup.ts` to expose a `verifyOtp` method that returns an error for non-recovery tokens and success for tokens tagged as recovery type.
5. Add a test that asserts the endpoint returns 400 when a non-recovery token is presented.

### Relevant Context
- `src/server/routes/auth.ts` — lines 210–237: `POST /api/password-reset/confirm`
- `src/server/__tests__/setup.ts` — lines 101–131: `supabaseAdminMock` — add `verifyOtp` here
- `src/server/__tests__/auth.test.ts` — lines 306–315: test to update

---

## Sub-task 4 — Fix signup double-setState race condition

**Status:** [ ] pending

### Intent
In the signup branch of `handleAuthenticate`, after `signInWithPassword` succeeds
the code manually sets `isAuthenticated(true)` and calls `onAuthenticated(...)`.
`onAuthStateChange` then fires independently and calls `bootstrapUser`, which calls
`setProfile` a second time, potentially overwriting the locally constructed profile
with a stale or empty server response.

The fix: remove the manual state-setting from the signup path and let the
`onAuthStateChange → bootstrapUser` pipeline be the single source of truth for all
flows (signup and login alike). The display name is already stored as `user_metadata`
on the Supabase user during `POST /api/register`, so `bootstrapUser` will have it.

### Expected Outcomes
- `setIsAuthenticated(true)` is not called directly in the signup handler.
- `onAuthenticated` is not called directly in the signup handler.
- The onboarding trigger (`setShowOnboarding(true)`, `onShowOnboarding()`) is moved
  into `bootstrapUser` (gated on a flag that identifies first-time users, e.g. empty profile).
- The existing auth tests continue to pass.

### Todo List
1. In `src/contexts/AuthContext.tsx`, remove the manual `setProfile`, `setSettings`, `setAchievements`, `setNotifications`, `setChats`, `setIsAuthenticated(true)`, and `onAuthenticated(...)` calls from the `if (mode === 'signup')` block after a successful sign-in.
2. Keep `identify(email, { name })` and `track('user_signed_up')` calls in the signup path (analytics should fire immediately).
3. Move the `setShowOnboarding(true)` + `onShowOnboarding()` trigger into `bootstrapUser`: detect a new user by checking that the returned profile has no prior data (e.g. `Object.keys(data.profile).length === 0`).
4. Verify the modal-close / redirect logic at the end of `handleAuthenticate` still executes correctly after the removal.

### Relevant Context
- `src/contexts/AuthContext.tsx` — lines 319–350: signup block
- `src/contexts/AuthContext.tsx` — lines 203–242: `bootstrapUser` — add onboarding trigger here
- `src/contexts/AuthContext.tsx` — lines 261–270: `onAuthStateChange` subscription

---

## Sub-task 5 — Remove express-session completely

**Status:** [ ] pending

### Intent
`express-session` with a PostgreSQL-backed store is configured in `server.ts` but no
route reads or writes `req.session`. It creates an unused DB connection pool, sends
a cookie to every browser client, and crashes the server without `SESSION_SECRET`.
The auth model is fully Bearer-token / Supabase JWT and will not need server sessions.

### Expected Outcomes
- `express-session`, `connect-pg-simple`, and the `pg.Pool` session pool are removed from `server.ts`.
- The `SessionData` module augmentation is removed.
- `SESSION_SECRET` is removed from the required env-var check at startup.
- `SESSION_SECRET` is moved to the optional section in `.env.example` with a note that it is no longer used.
- `connect-pg-simple` is removed from `package.json` dependencies.
- The server starts and all tests pass without `SESSION_SECRET` set.

### Todo List
1. Remove the `connectPgSimple`, `session`, and `pg` (session-related) imports from `server.ts`.
2. Remove the `PgStore` / `sessionStore` setup block (lines 53–66).
3. Remove the `declare module 'express-session'` augmentation (lines 68–72).
4. Remove the `app.use(session(...))` call (lines 126–138).
5. Remove `SESSION_SECRET` from the `requiredEnvVars` array (line 26).
6. Move `SESSION_SECRET` entry in `.env.example` to the optional section with a deprecation note.
7. Remove `connect-pg-simple` from `package.json` dependencies and run install.
8. Verify that `pg` is still needed elsewhere (it is — `src/server/lib/db.ts` uses `pg.Pool` directly); do not remove `pg` itself.

### Relevant Context
- `server.ts` — lines 5, 16–17: session-related imports
- `server.ts` — lines 26: `requiredEnvVars`
- `server.ts` — lines 53–138: session setup, module augmentation, middleware registration
- `.env.example` — `SESSION_SECRET` entry
- `package.json` — `connect-pg-simple` dependency

---

## Sub-task 6 — Narrow profile persistence effect scope

**Status:** [ ] pending

### Intent
The debounced `PUT /api/user-profile` effect in `AuthContext` has `chats` in its
dependency array alongside `profile`, `settings`, `achievements`, and `notifications`.
This means every new AI mentor chat message schedules a full payload flush including
the entire conversation history, causing unnecessary bandwidth and inadvertently
treating chat history as profile data.

The fix: split into two effects — one for profile/settings/achievements/notifications
(the actual profile data), and a separate one for chats (or remove chats from the
persist call entirely if they are persisted elsewhere).

### Expected Outcomes
- `chats` is removed from the `PUT /api/user-profile` payload and its dependency array.
- Profile/settings/achievements/notifications persist on their own debounced timer.
- Chats are either persisted via a dedicated call or not persisted client-side at all (they are returned from `/api/bootstrap` so the server is the source of truth).
- No regression in profile save behaviour.

### Todo List
1. In `src/contexts/AuthContext.tsx`, split the single persistence effect into two:
   - Effect A: depends on `profile, settings, achievements, notifications` — calls `PUT /api/user-profile` with those four fields only.
   - Effect B (or remove): decide whether `chats` need client-side persistence; if yes, create a separate debounced effect with a longer debounce (e.g. 5 s); if no, remove chat persistence from the client entirely.
2. Remove `chats` from the body of the `PUT /api/user-profile` fetch in Effect A.
3. Verify `src/server/routes/user.ts` `PUT /user-profile` still accepts and saves `chats` when they arrive (for Effect B if kept).

### Relevant Context
- `src/contexts/AuthContext.tsx` — lines 287–302: the combined persistence effect
- `src/server/routes/user.ts` — lines 115–150: `PUT /api/user-profile` handler

---

## Sub-task 7 — Fix password-reset deep-link token reading

**Status:** [ ] pending

### Intent
`AuthContext` reads `?reset_token=` from the URL query string to detect a
password-reset deep-link. Supabase delivers recovery tokens in the **URL fragment**
as `#access_token=...&type=recovery`, not as a query parameter. The current code
never captures a real Supabase reset link, making the deep-link reset flow silently
broken for all users.

The correct approach: listen for Supabase's `PASSWORD_RECOVERY` auth event from
`onAuthStateChange` and show the reset form when that event fires, rather than
parsing URL parameters manually.

### Expected Outcomes
- When a user clicks a Supabase password-reset link, the app detects the recovery session and shows the reset-password form.
- The `reset_token` URL query-param parsing code is removed (it was never populated by Supabase).
- `resetToken` state still works as the flag to show the reset form (can be set to a non-null sentinel value on `PASSWORD_RECOVERY`).

### Todo List
1. In `src/contexts/AuthContext.tsx`, remove the `useEffect` that reads `reset_token` from `window.location.search` (lines 274–284).
2. In the `onAuthStateChange` subscription, add a handler for the `PASSWORD_RECOVERY` event: when fired, call `setResetToken('recovery')` (or any non-null sentinel) and `setShowAuthModal(true)` to surface the reset form.
3. In `handleResetPassword`, the existing `supabase.auth.updateUser({ password })` call is correct and requires no change — Supabase's active recovery session provides the context.
4. After a successful reset (`setResetStatus('success')`), call `setResetToken(null)` to hide the reset form (already done — verify it is still present).
5. Update `AuthScreen.tsx` comments to reflect that `resetToken` is a sentinel flag, not an actual token value.

### Relevant Context
- `src/contexts/AuthContext.tsx` — lines 261–271: `onAuthStateChange` subscription
- `src/contexts/AuthContext.tsx` — lines 274–284: URL param effect to remove
- `src/contexts/AuthContext.tsx` — lines 390–402: `handleResetPassword` — no change needed
- `src/components/AuthScreen.tsx` — line 116: `if (resetToken)` gating the reset form

---

## Sub-task 8 — Singleton anon client + remove duplicate email verification

**Status:** [x] done

### Intent
Two small independent fixes bundled because they are each very low effort:

**A — Singleton anon client in auth.ts**
`POST /api/login` creates a new Supabase anon client on every request via a dynamic
import. This should be a module-level singleton (matching the admin client pattern
in `supabaseAdmin.ts`).

**B — Remove custom Resend email-verification flow**
The codebase has both Supabase's built-in confirmation (triggered by `createUser`
with `email_confirm: false`) and a parallel custom Resend token system in `email.ts`.
Users currently receive two verification emails on registration.
Decision: keep Supabase's built-in flow, remove the custom one.

### Expected Outcomes
**A:**
- `POST /api/login` no longer runs a dynamic `import('@supabase/supabase-js')` per call.
- A module-level `getSupabaseAnon()` singleton is used (pattern matches `supabaseAdmin.ts`).

**B:**
- `POST /api/verify-email/send` route is removed from `email.ts`.
- `GET /api/verify-email/:token` route is removed from `email.ts`.
- `createToken`, `consumeToken`, `sendVerificationEmail`, `ensureTokensTable` helpers are removed from `email.ts`.
- `sendVerificationEmail` import/call is removed from any route that calls it.
- `email.ts` retains only the `sendEmail` utility function (used by password-reset if ever needed) and the router export — or is removed entirely if nothing remains.
- `.env.example` retains `RESEND_API_KEY` and `EMAIL_FROM` as optional (they may still be useful for other transactional emails in the future).
- The `email_tokens` table creation SQL is removed (the table can remain in the DB harmlessly or be manually dropped).

### Todo List
1. In `src/server/routes/auth.ts`, extract the anon client creation into a lazily-initialised module-level singleton function `getSupabaseAnon()` (mirrors `getSupabaseAdmin` pattern).
2. Replace the inline `createClient(...)` block in `POST /api/login` and `POST /api/password-reset/request` with calls to `getSupabaseAnon()`.
3. In `src/server/routes/email.ts`, remove `ensureTokensTable`, `createToken`, `consumeToken`, `sendVerificationEmail`, and the two route handlers (`POST /verify-email/send`, `GET /verify-email/:token`).
4. Retain `sendEmail` in `email.ts` as a general utility export (it has no Supabase dependency and may be reused).
5. Check all files for imports of `sendVerificationEmail` and remove them.
6. Verify `email.ts` still exports `default router` (even if the router has no routes, the mount in `server.ts` is harmless — or remove the mount too for cleanliness).
7. Update `vitest.config.ts` / test setup if any test references `verify-email` routes.

### Relevant Context
- `src/server/routes/auth.ts` — lines 88–103: inline anon client in `/api/login`; lines 185–197: same in `/api/password-reset/request`
- `src/server/lib/supabaseAdmin.ts` — singleton pattern to replicate
- `src/server/routes/email.ts` — full file: routes and helpers to remove
- `server.ts` — line 155: `app.use('/api', emailRouter)` — keep or remove mount
