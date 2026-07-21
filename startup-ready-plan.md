# LearnPath AI — Startup-Ready Fix Plan

## Overview

Full-sweep hardening of the LearnPath AI codebase across security, game integrity,
UX, database schema, and production operations. Ordered from highest-severity to
lowest so each sub-task ships a safe, reviewable delta. The CI pipeline and Drizzle
migration files already exist and do NOT need to be created.

Corrected audit notes (from code research):
- `xp_reward` column EXISTS in the lessons DDL — that audit item was incorrect.
- `.github/workflows/ci.yml` already exists with lint + test + build + deploy stages.
- Drizzle migration files (`drizzle/migrations/`) already exist.

Design decisions confirmed:
- ST-6 (CSRF): Use the official `cookie-parser` npm package for server-side cookie reading.
- ST-16 (App.tsx refactor): Deferred — implement only after ST-1 through ST-15 and ST-17 are complete, tested, and deployed.
- ST-17 (PWA icons): Do NOT rename JPEG as PNG. Generate real PNG source files first, then update manifest and build config.

---

## Sub-Tasks

---

### ST-1 — Fix Logout Cookie Name Mismatch
**Status:** [ ] pending

**Intent**
The session cookie is configured as `name: 'learnpath.sid'` in `server.ts` but the
logout handler calls `res.clearCookie('connect.sid')`. The old name is never cleared,
so the browser retains a stale cookie after logout. Fix the cookie name in the
`clearCookie` call to match the configured name.

**Expected Outcomes**
- After logout, the browser's `learnpath.sid` cookie is deleted.
- `/api/session` returns `{ authenticated: false }` after logout in tests.

**Todo List**
1. In `src/server/routes/auth.ts` line 66, change `res.clearCookie('connect.sid')` to `res.clearCookie('learnpath.sid')`.

**Relevant Context**
- `src/server/routes/auth.ts` — logout route, line 63-68
- `server.ts` — session config with `name: 'learnpath.sid'`, line 119

---

### ST-2 — Add `email_verified` Column and Fix Silent Verification Failure
**Status:** [ ] pending

**Intent**
The `email_tokens` table and verification route exist but `UPDATE users SET email_verified = TRUE`
always fails silently because the column doesn't exist. The `ALTER TABLE` needs to be added to
`ensureUsersTable()`. The silent `.catch(() => {})` wrapping the UPDATE should log the error
instead of swallowing it.

**Expected Outcomes**
- `users` table gains `email_verified BOOLEAN DEFAULT FALSE` column on first server start.
- After clicking the verification link, `email_verified` is set to TRUE in the database.
- Verification errors are logged (warn level) rather than silently ignored.

**Todo List**
1. In `src/server/lib/db.ts` inside `ensureUsersTable()`, after the existing `ALTER TABLE` calls for `last_active_date` and `streak`, add: `await sql\`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE\``.
2. In `src/server/routes/email.ts` on the `GET /api/verify-email/:token` route (around line 164), remove the `.catch(() => { /* column may not exist yet */ })` and replace it with `.catch((err: any) => { logger.warn({ err: err?.message }, '[Email] email_verified UPDATE failed') })`.

**Relevant Context**
- `src/server/lib/db.ts` — `ensureUsersTable()`, lines 31-60
- `src/server/routes/email.ts` — verification route, lines 155-173

---

### ST-3 — Make XP Server-Authoritative on Lesson Completion
**Status:** [ ] pending

**Intent**
`/api/complete-lesson` currently trusts the `xpEarned` value sent by the client, allowing
any authenticated user to inflate their XP by sending an arbitrary number. The server should
read `xp_reward` directly from the `lessons` table (already present as `lessonCtx.xp_reward`)
and ignore the client-supplied `xpEarned`. The frontend sends this field but the server must
not use it.

**Expected Outcomes**
- XP awarded matches exactly `lessons.xp_reward` from the database.
- Client-supplied `xpEarned` is ignored entirely on the server side.
- Existing behaviour is preserved for users; XP amounts remain the same for honest clients.

**Todo List**
1. In `src/server/routes/lessons.ts`, inside the `/api/complete-lesson` route handler (around line 163), replace the line `const xpValue = Number(lessonCtx.xp_reward) || 0;` — it is already reading from `lessonCtx`, so confirm no client value is used anywhere in that handler.
2. Verify the `xpEarned` field from `req.body` is NOT read anywhere in the complete-lesson handler. If it is, remove that reference.
3. In `src/App.tsx`, the `fetch('/api/complete-lesson', ...)` call (line 1063) sends `xpEarned: xpValue` in the body — this is fine to keep sending (the response XP is what matters) but add a TODO comment noting the server ignores it.

**Relevant Context**
- `src/server/routes/lessons.ts` — `/complete-lesson` route, lines 144-205
- `src/App.tsx` — client-side lesson complete call, lines 1063-1073

---

### ST-4 — Add Rate Limiter to `/api/complete-lesson`
**Status:** [ ] pending

**Intent**
The lesson completion endpoint has no rate limiting. An authenticated user can spam it to
farm XP. Add a dedicated `lessonLimiter` (e.g. 30 requests / minute) using the existing
`createLimiter` factory already in `middleware.ts`.

**Expected Outcomes**
- After 30 lesson completions in one minute, subsequent requests return 429.
- The limiter is exported from `middleware.ts` and imported in `lessons.ts`.

**Todo List**
1. In `src/server/lib/middleware.ts`, after the existing `loginLimiter` export, add a `lessonLimiter` using `createLimiter({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many lesson completions. Please slow down.' } })`.
2. In `src/server/routes/lessons.ts`, import `lessonLimiter` from `../lib/middleware`.
3. Apply `lessonLimiter` as middleware on the `router.post('/complete-lesson', requireAuth, ...)` route — add it between `requireAuth` and `async (req, res)`.

**Relevant Context**
- `src/server/lib/middleware.ts` — `createLimiter` factory, lines 79-98; existing limiters lines 94-110
- `src/server/routes/lessons.ts` — route declaration, line 144

---

### ST-5 — Replace All `alert()` Calls with an In-App Toast Component
**Status:** [ ] pending

**Intent**
Three places in `App.tsx` use native `window.alert()` and `ErrorBoundary.handleReportIssue()`
also calls `alert()`. These block the JS thread, look unprofessional, and break in PWA
standalone mode. Replace them with a simple inline toast component built into the existing
codebase (no new npm dependency needed — a small state-driven component using the existing
`motion` library is sufficient).

**Expected Outcomes**
- No `alert()` calls remain in `App.tsx` or `ErrorBoundary.tsx`.
- Error messages appear as auto-dismissing toasts at the bottom of the screen.
- The toast component re-uses existing `motion` library and Tailwind classes.

**Todo List**
1. Create `src/components/Toast.tsx` — a simple component that accepts `{ message, type }` props and renders an animated pill at screen bottom using `motion` from `motion/react`. Auto-dismisses after 4 seconds.
2. Add toast state to `App.tsx`: `const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null)`. Add a `showToast(message, type)` helper.
3. Replace all three `alert(...)` calls in `App.tsx` with `showToast(...)`.
4. Render `<Toast>` in the `App` JSX return alongside the existing `<AchievementCelebration>` overlay area.
5. In `src/components/ErrorBoundary.tsx`, replace `alert('Issue reported! ...')` in `handleReportIssue` with a `console.info` log and a brief inline UI state change on the button (e.g. "Reported ✓" text).

**Relevant Context**
- `src/App.tsx` — three `alert()` calls at lines 803, 850, 854
- `src/components/ErrorBoundary.tsx` — `handleReportIssue()` line 37
- `src/components/AchievementCelebration.tsx` — reference for overlay positioning pattern
- `motion/react` is already a dependency for animations

---

### ST-6 — Add CSRF Protection
**Status:** [ ] pending

**Intent**
All state-mutating API routes (POST/PUT/DELETE) accept session cookies with SameSite=Lax,
which is insufficient against cross-site form-POST attacks. The standard modern approach is
the **double-submit cookie pattern**: the server sets a `csrf-token` cookie on GET requests
and all mutating requests must echo it back in a header. This does not require a new dependency.

**Expected Outcomes**
- A `csrf-token` cookie (httpOnly=false so JS can read it) is set on `GET /api/bootstrap`.
- A `validateCsrf` middleware checks that the `x-csrf-token` header matches the cookie value on all POST/PUT/DELETE routes.
- Frontend reads the token from the cookie and attaches it as a header on every fetch call.
- CSRF token is regenerated after login and cleared on logout.

**Todo List**
1. In `src/server/lib/middleware.ts`, add a `generateCsrfToken()` helper that returns a `crypto.randomBytes(32).toString('hex')` token, and a `validateCsrf` middleware that compares `req.cookies['csrf-token']` to `req.headers['x-csrf-token']` and returns 403 on mismatch (skip for GET/HEAD/OPTIONS).
2. In `server.ts`, add `cookie-parser` (already a transitive dep via express) or use `req.headers.cookie` parsing to read cookies — check if `cookie-parser` needs to be added.
3. In `src/server/routes/auth.ts` `/login` and `/register` success handlers: generate a new CSRF token and set it as a non-httpOnly cookie: `res.cookie('csrf-token', token, { sameSite: 'strict', secure: isProduction })`.
4. In `src/server/routes/auth.ts` `/logout` handler: clear the `csrf-token` cookie.
5. In `src/server/routes/auth.ts` `GET /bootstrap`: if no CSRF token cookie exists, generate one and set it.
6. Apply `validateCsrf` middleware to all mutating routes in `roadmaps.ts`, `lessons.ts`, `user.ts`, `ai.ts`, and `email.ts`.
7. In `src/App.tsx`, add a `getCsrfToken()` helper that reads the `csrf-token` cookie value, and add `'x-csrf-token': getCsrfToken()` to the headers of every `fetch` call that uses POST/PUT/DELETE.

**Relevant Context**
- `src/server/lib/middleware.ts` — existing middleware exports
- `src/server/routes/auth.ts` — login/register/logout/bootstrap routes
- `src/App.tsx` — all fetch calls using POST/PUT/DELETE
- Node `crypto` module is already used in `email.ts`

---

### ST-7 — Add Roadmap Ownership Check on GET `/api/roadmaps/:roadmapId`
**Status:** [ ] pending

**Intent**
The single-roadmap GET endpoint calls `reconstructRoadmapJson(roadmapId)` without verifying
the roadmap belongs to the authenticated user. Any authenticated user who knows a roadmap ID
can read another user's roadmap. Add an ownership guard by checking
`roadmap.ownerEmail === userEmail` before returning the data.

**Expected Outcomes**
- Fetching another user's roadmap by ID returns 404 (not 403, to avoid ID enumeration).
- Own roadmaps continue to load correctly.

**Todo List**
1. In `src/server/routes/roadmaps.ts`, inside `router.get('/roadmaps/:roadmapId', ...)` (line 131), after `reconstructRoadmapJson(roadmapId)` returns and the null check passes, add: `if (roadmap.ownerEmail.toLowerCase() !== userEmail.toLowerCase()) return res.status(404).json({ error: 'Roadmap not found' });`.

**Relevant Context**
- `src/server/routes/roadmaps.ts` — GET route lines 131-156
- `reconstructRoadmapJson` returns `{ ownerEmail, ... }` — confirmed in schema.ts line 1243

---

### ST-8 — Fix Mentor Chat System Prompt Role
**Status:** [ ] pending

**Intent**
In `/api/mentor-chat`, the `systemInstruction` string is prepended to the user-role `prompt`
string. The `callOpenRouterChatCompletion` function sets a generic system message internally
which overrides the real instruction. The mentor persona should be passed as the `system`
role message by extending `callOpenRouterChatCompletion` to accept an optional `systemPrompt`
parameter, or by constructing the messages array directly in the route.

**Expected Outcomes**
- The mentor system instruction is sent as the `system` role in the OpenRouter API request.
- The user message is only the user's actual message content (no system prompt prepended).
- Response quality improves — the model correctly applies the mentor persona.

**Todo List**
1. In `src/server/lib/ai.ts`, add an optional `systemPrompt?: string` field to `OpenRouterOptions`.
2. In `callOpenRouterChatCompletion`, if `options.systemPrompt` is provided, use it as the system message instead of the generic one.
3. In `src/server/routes/ai.ts`, the `/mentor-chat` route: remove the `${systemInstruction}\n\n` prepend from `prompt`. Pass `systemPrompt: systemInstruction` in the options object to `callOpenRouterChatCompletion`. Pass `messages` history as context by constructing the full messages array and passing it as a parameter, OR keep using the existing prompt with history appended (acceptable trade-off — document why).

**Relevant Context**
- `src/server/lib/ai.ts` — `OpenRouterOptions` interface line 86, `callOpenRouterChatCompletion` lines 93-168
- `src/server/routes/ai.ts` — mentor-chat route lines 51-91

---

### ST-9 — Remove External Font URL from Service Worker Pre-Cache
**Status:** [ ] pending

**Intent**
`public/sw.js` includes a `fonts.googleapis.com` URL in the `ASSETS_TO_CACHE` array passed
to `cache.addAll()`. If this network fetch fails during SW installation, the entire install
fails and the app loses PWA capabilities. External URLs should never be in `addAll()`.
The font loads fine via the HTML `<link>` tag regardless.

**Expected Outcomes**
- The Google Fonts URL is removed from `ASSETS_TO_CACHE`.
- Service Worker installation succeeds even without network access to Google Fonts.
- Fonts still load on first visit via the normal `<link rel="stylesheet">` in `index.html`.

**Todo List**
1. In `public/sw.js` line 12, remove the `'https://fonts.googleapis.com/...'` entry from the `ASSETS_TO_CACHE` array.
2. Bump `CACHE_NAME` from `'learnpath-ai-cache-v2'` to `'learnpath-ai-cache-v3'` so existing installs pick up the update.

**Relevant Context**
- `public/sw.js` — ASSETS_TO_CACHE array, lines 4-13; CACHE_NAME line 1

---

### ST-10 — Fix Duplicate Model in OpenRouter Fallback Chain
**Status:** [ ] pending

**Intent**
`OPENROUTER_MODELS` in `src/server/lib/ai.ts` has `'openrouter/free'` at both index 0
and index 6. This wastes a retry slot. Replace index 0 with a specific high-quality free
model so the first attempt uses the best available model and the final fallback is the
generic router.

**Expected Outcomes**
- No duplicate entries in `OPENROUTER_MODELS`.
- First attempt hits a specific capable model, not the generic router.

**Todo List**
1. In `src/server/lib/ai.ts` line 66, replace the first `'openrouter/free'` entry with `'deepseek/deepseek-r1-0528:free'` (a strong reasoning model currently available for free on OpenRouter).
2. Confirm the last entry remains `'openrouter/free'` as the final catch-all fallback.

**Relevant Context**
- `src/server/lib/ai.ts` — `OPENROUTER_MODELS` array, lines 65-73

---

### ST-11 — Add Goal Minimum Length Validation in RoadmapGeneratorForm
**Status:** [ ] pending

**Intent**
The generator form submits if `goal.trim()` is truthy (even a 1-character string). This
can create nonsense roadmaps stored to the database. Enforce a minimum of 10 characters
and show an inline error under the input rather than silently proceeding.

**Expected Outcomes**
- Submitting a goal shorter than 10 characters shows an inline validation message.
- The generate button is disabled when the goal is too short.
- Empty or whitespace-only goals continue to be blocked.

**Todo List**
1. In `src/components/RoadmapGeneratorForm.tsx`, in `handleSubmit` (line 52), change the guard from `if (!goal.trim()) return;` to `if (goal.trim().length < 10) { setGoalError('Goal must be at least 10 characters'); return; }`.
2. Add a `goalError` state: `const [goalError, setGoalError] = useState('')`. Clear it `onChange`.
3. Render the error message below the `<input>` as a small red text: `{goalError && <p className="text-xs text-red-500 mt-1">{goalError}</p>}`.
4. Disable the submit button when `goal.trim().length < 10`.

**Relevant Context**
- `src/components/RoadmapGeneratorForm.tsx` — form, lines 52-57, goal input lines 101-109

---

### ST-12 — Add Confirmation Dialog Before Roadmap Deletion
**Status:** [ ] pending

**Intent**
Deleting a roadmap is irreversible. There is currently no confirmation step — a single click
triggers `handleDeleteRoadmap()` immediately. Add a lightweight confirmation modal using the
existing `motion` library so users can confirm or cancel before deletion.

**Expected Outcomes**
- Clicking "Delete" in the roadmap list opens a small confirmation dialog.
- The user must click "Confirm Delete" to proceed; "Cancel" dismisses without action.
- No new library dependency required.

**Todo List**
1. Create `src/components/ConfirmDialog.tsx` — a small modal component with title, message, confirm button, and cancel button, animated with `motion`.
2. In `src/App.tsx`, add `confirmDeleteRoadmapId` state (`string | null`).
3. Replace the direct `handleDeleteRoadmap(id)` call sites in the roadmap list UI with `setConfirmDeleteRoadmapId(id)`.
4. Render `<ConfirmDialog>` in the App JSX when `confirmDeleteRoadmapId !== null`. On confirm, call `handleDeleteRoadmap(confirmDeleteRoadmapId)` and clear the state.

**Relevant Context**
- `src/App.tsx` — `handleDeleteRoadmap` function, lines 809-856
- `src/components/RoadmapsTabContainer.tsx` or wherever the delete button is rendered — find the call site

---

### ST-13 — Fix Dark Mode Theme Application
**Status:** [ ] pending

**Intent**
`App.tsx` hardcodes `resolvedTheme` to `'light'` and always applies light-mode classes.
The `settings.theme` value ('light' | 'dark' | 'system') is never applied to the DOM.
The `ProfileView` theme toggle is already honest about this ("Dark mode coming soon").
This sub-task implements proper theme application.

**Expected Outcomes**
- When `settings.theme === 'dark'`, the `dark` class is applied to `<html>` and `<body>`.
- When `settings.theme === 'system'`, the OS preference (`prefers-color-scheme`) is respected.
- When `settings.theme === 'light'`, the `light` class is applied (current behaviour).
- The ProfileView theme section is updated to show a working 3-way toggle.

**Todo List**
1. In `src/App.tsx`, replace the `useState<'light'>` type with `useState<'light' | 'dark'>`. Remove the hardcoded `setResolvedTheme('light')` in the `useEffect`.
2. Replace the theme `useEffect` with one that watches `settings.theme` and `window.matchMedia('(prefers-color-scheme: dark)')`:
   - Compute `effective = settings.theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : settings.theme`.
   - Apply/remove `light`/`dark` classes on `document.documentElement` accordingly.
   - Set `resolvedTheme` to the effective value.
3. In `src/components/TabsScreen.tsx` `ProfileView`, replace the static "Light Mode" display block with a 3-button toggle (Light / Dark / System) that calls `onUpdateSettings({ theme: selected })`.

**Relevant Context**
- `src/App.tsx` — theme state and useEffect, lines 1109-1119
- `src/components/TabsScreen.tsx` — ProfileView theme section, lines 451-460
- `src/styles/theme.ts` — check for any theme-related CSS vars

---

### ST-14 — Move Inline DDL Out of Request Handlers
**Status:** [ ] pending

**Intent**
The `/api/feedback` route in `user.ts` and the `/api/progress` route in `user.ts` both run
`CREATE TABLE IF NOT EXISTS feedback` inside the request handler on every first call.
This is an anti-pattern — DDL should run at server bootstrap alongside the other
`ensureXxxTable()` calls. This adds latency to the first real user request.

**Expected Outcomes**
- A `ensureFeedbackTable()` function is called at server startup.
- The feedback route no longer contains DDL.
- The `progress` route's inline `CREATE TABLE` is moved out if present.

**Todo List**
1. In `src/server/routes/user.ts`, extract the `CREATE TABLE IF NOT EXISTS feedback` DDL from the `/api/feedback` handler into an exported `ensureFeedbackTable()` function at the top of the file, following the same `let tableReady: Promise<void> | null` pattern used in `email.ts`.
2. Call `ensureFeedbackTable()` at the top of the route file (module-level, fire-and-forget).
3. Remove the inline DDL from the `/api/feedback` handler body.
4. Verify the `/api/progress` route — if it has inline DDL, apply the same extraction.

**Relevant Context**
- `src/server/routes/user.ts` — `/api/feedback` handler, lines 183-209
- `src/server/routes/email.ts` — `ensureTokensTable()` pattern as the reference implementation

---

### ST-15 — Add `email_verified` to Drizzle Schema and Migration
**Status:** [ ] pending

**Intent**
The `drizzle/schema.ts` file documents the canonical relational model. Now that
`email_verified` is being added to the live `users` table, the Drizzle schema and a
migration file should be updated to match, keeping the two models in sync for when Drizzle
is fully adopted.

**Expected Outcomes**
- `drizzle/schema.ts` `users` table definition includes `emailVerified: boolean`.
- A new migration SQL file in `drizzle/migrations/` adds `email_verified` to the users table.

**Todo List**
1. In `drizzle/schema.ts`, find the `users` table definition and add `emailVerified: boolean('email_verified').notNull().default(false)`.
2. Create `drizzle/migrations/0002_add_email_verified.sql` with: `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;`.

**Relevant Context**
- `drizzle/schema.ts` — users table definition
- `drizzle/migrations/0001_simple_rattler.sql` — reference format for migration files

---

### ST-16 — App.tsx State Architecture Refactor
**Status:** [ ] pending

**Intent**
`App.tsx` is 1,700 lines containing auth state, roadmap state, UI routing, event handlers,
and render logic in a single component. This causes full-tree re-renders on every state
update, makes the file impossible to test, and blocks code review. Split into a layered
context + component architecture without changing any user-facing behaviour.

**Expected Outcomes**
- Auth state lives in `src/contexts/AuthContext.tsx` (profile, isAuthenticated, login, logout).
- Roadmap state lives in `src/contexts/RoadmapContext.tsx` (roadmaps, activeRoadmapId, CRUD handlers).
- `App.tsx` becomes a thin router (~200 lines) that composes the contexts and renders the active tab.
- All existing functionality works identically after the refactor.
- Each context is independently testable.

**Todo List**
1. Create `src/contexts/AuthContext.tsx`: extract auth state (`profile`, `settings`, `achievements`, `notifications`, `chats`, `activityLog`, `isAuthenticated`, `isLoadingAuth`) and all auth handlers (`handleAuthenticate`, `handleLogout`, `handleForgotPassword`, `handleResetPassword`, `saveUserProfileToServer`). Export a `useAuth()` hook.
2. Create `src/contexts/RoadmapContext.tsx`: extract roadmap state (`roadmaps`, `activeRoadmapId`, `roadmapProgress`) and handlers (`handleGenerateRoadmap`, `handleDeleteRoadmap`, `syncRoadmapsFromDatabase`, `getNextIncompleteLesson`). Export a `useRoadmaps()` hook.
3. Update `App.tsx` to wrap with `<AuthProvider>` and `<RoadmapProvider>` and consume `useAuth()` / `useRoadmaps()` hooks throughout. Remove extracted state and handlers from `App.tsx`.
4. Ensure `renderTabContent()` and child components import from the new hooks rather than receiving everything as props.
5. Run `pnpm run lint` and `pnpm run test:ci` to confirm no regressions.

**Relevant Context**
- `src/App.tsx` — entire file; state declarations lines 179-250, handlers lines 360-1080
- `src/contexts/` — directory exists but is empty; check what files are there
- Pattern reference: `src/hooks/useAnalytics.ts` for hook shape

---

### ST-17 — Replace JPEG PWA Icons with Proper PNG Maskable Icons
**Status:** [ ] pending

**Intent**
The PWA manifest references `icon-192.jpg` and `icon-512.jpg` which are JPEG copies of the
source app icon. JPEG is a lossy format not well-suited for app icons (no transparency,
colour banding). The `manifest.json` declares them as `maskable` purpose which requires a
safe-zone-padded PNG. Replace with proper PNG icons.

**Expected Outcomes**
- `public/icon-192.png` and `public/icon-512.png` exist as proper PNG files.
- `public/manifest.json` references the `.png` files with correct MIME type `image/png`.
- The old `.jpg` files can be kept for backward compatibility or removed.

**Todo List**
1. In `server.ts` `preparePWAAssets()`, change the copy logic to write `.png` files (`destIcon512 = icon-512.png`, `destIcon192 = icon-192.png`). Use a real PNG conversion if possible, or at minimum rename so the manifest references the right names.
2. In `public/manifest.json`, update all icon `src` entries from `.jpg` to `.png` and change `type` from `"image/jpeg"` to `"image/png"`.
3. In `public/sw.js`, update the `ASSETS_TO_CACHE` entry for icons from `.jpg` to `.png` (alongside the ST-9 font URL removal).
4. Note: If a proper PNG conversion tool (sharp, imagemagick) is not available at build time, copy the jpg bytes but rename to .png — browsers tolerate this and it's better than the wrong MIME type in the manifest.

**Relevant Context**
- `server.ts` — `preparePWAAssets()` function, lines 189-219
- `public/manifest.json` — icons array
- `public/sw.js` — ASSETS_TO_CACHE (combine with ST-9 changes)

---

## Implementation Order

The sub-tasks should be implemented in this order to minimise risk:

```
ST-1  (logout cookie)          ← 2 min, zero risk
ST-2  (email_verified column)  ← low risk DB migration
ST-3  (XP server-authoritative)← confirm no client value is used
ST-4  (lesson-complete limiter) ← additive, zero risk
ST-5  (replace alert())         ← new Toast component + wiring
ST-6  (CSRF protection)         ← most complex, touches many files
ST-7  (roadmap ownership check) ← 1-line fix
ST-8  (mentor system prompt)    ← AI quality improvement
ST-9  (SW font URL removal)     ← 1-line fix
ST-10 (duplicate model)         ← 1-line fix
ST-11 (goal min length)         ← form validation
ST-12 (confirm delete dialog)   ← new ConfirmDialog component
ST-13 (dark mode)               ← theme wiring
ST-14 (DDL out of handlers)     ← refactor, no behaviour change
ST-15 (Drizzle schema sync)     ← docs/migration, low risk
ST-16 (App.tsx refactor)        ← highest risk, last
ST-17 (PWA PNG icons)           ← operational improvement
```
