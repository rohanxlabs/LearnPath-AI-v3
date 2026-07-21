# LearnPath AI — Startup Fixes Implementation Plan

## Top-Level Overview

Apply the highest-impact, non-AI-model fixes identified in the audit to make the app
startup-ready. Skipping Google OAuth and paid LLM model changes as requested.

Six independent sub-tasks, each self-contained and safe to implement one at a time.

---

## Sub-Task 1 — Fix fallback curriculum: xpReward 0 + placeholder URLs

**Status:** [x] done

### Intent
When AI generation fails the offline `buildFallbackCurriculum()` is used. Every lesson it
generates has `xpReward: 0`, which causes `POST /api/complete-lesson` to immediately throw
`HttpError(400, 'Lesson has no valid XP reward')` — blocking all progress in offline mode.
Additionally, every resource URL is a dead `https://example.com/...` link shown to real users.

### Expected Outcomes
- Every fallback lesson has a non-zero `xpReward` (25 XP).
- Fallback resources link to real, reputable URLs keyed by a small lookup table that maps
  common goal keywords (web, python, data, ai, machine, java, react, node, sql, design) to
  actual docs/YouTube/practice sites. For goals not in the table a sensible generic URL is
  used (MDN Web Docs, freeCodeCamp, The Odin Project).
- `POST /api/complete-lesson` no longer 400s for fallback curriculum users.

### Todo List
1. In `src/server/lib/curriculum.ts`, inside `buildFallbackCurriculum()`, change
   `xpReward: 0` → `xpReward: 25` on the lesson object (line ~513).
2. In the same function, replace the three hard-coded `resources` entries per module with a
   helper `getFallbackResources(goal, theme, pIdx, mIdx)` that picks real URLs from a small
   inline lookup table keyed by goal keyword. Define the lookup table above the function.

### Relevant Context
- `src/server/lib/curriculum.ts` → `buildFallbackCurriculum()` lines ~488–568
- The lesson object is built at line ~508–514 with `xpReward: 0`.
- Resources are hard-coded at lines ~520–524.
- The XP guard that throws is in `src/server/routes/lessons.ts` line 164.

---

## Sub-Task 2 — Wire achievement unlocks

**Status:** [x] done

### Intent
Three achievements ("First Steps", "Roadmap Builder", "Quiz Master") are seeded as `unlocked:
false` in `getDefaultUserDB()` and are never automatically unlocked by real events.
Gamification is therefore completely broken. Wiring the three unlock triggers makes badges
actually work without adding any new UI.

### Expected Outcomes
- Completing the first lesson unlocks **"First Steps"** (`ach-1`).
- Saving a new roadmap for the first time unlocks **"Roadmap Builder"** (`ach-3`).
- Scoring 100% on any quiz unlocks **"Quiz Master"** (`ach-2`).
- All three unlock events add the achievement's `xpReward` to the user's XP total.
- The unlock is persisted via the existing `saveUserDB()` flow.

### Todo List
1. Add a server-side helper function `unlockAchievement(userEmail, achievementId)` in
   `src/server/lib/db.ts`. It should: load the user DB, find the achievement by id, mark it
   `unlocked: true` + `unlockedAt: ISO string`, add `xpReward` to `dbData.xp` and
   `dbData.profile.xp`, then call `saveUserDB`. Make it idempotent (no-op if already
   unlocked). Return `{ unlocked: boolean, achievement }`.
2. In `src/server/routes/lessons.ts`, after a successful `completeLessonForUser()` call,
   check if this is the user's first-ever lesson completed (`completedLessons === 1`). If so
   call `unlockAchievement(userEmail, 'ach-1')` and include `{ newAchievement }` in the
   response JSON.
3. In `src/server/routes/roadmaps.ts`, inside `POST /roadmaps` (create roadmap), after
   `createRoadmapFromJson()` succeeds, count the user's existing roadmaps. If this is their
   first (`owned.length === 0` before insert), call `unlockAchievement(userEmail, 'ach-3')`
   and include `{ newAchievement }` in the response JSON.
4. In `src/server/routes/user.ts`, inside `POST /topic-wise-quizzes`, after saving the quiz
   attempt, if `attempt.score === attempt.totalQuestions && attempt.totalQuestions > 0` call
   `unlockAchievement(userEmail, 'ach-2')` and include `{ newAchievement }` in the response.
5. In `src/App.tsx`, in the `handleCompleteLesson` / roadmap save / quiz save handlers,
   check if the response contains `newAchievement` and — if so — call
   `setUnlockedAchievement(newAchievement)` to trigger the existing
   `AchievementCelebration` component.

### Relevant Context
- `src/server/lib/db.ts` → `getDefaultUserDB()` lines 88–92, `loadUserDB()`, `saveUserDB()`
- `src/server/routes/lessons.ts` → `POST /complete-lesson` lines 143–198
- `src/server/routes/roadmaps.ts` → `POST /roadmaps` lines 174–186
- `src/server/routes/user.ts` → `POST /topic-wise-quizzes` lines 116–138
- `src/App.tsx` → `unlockedAchievement` state (line 214), `AchievementCelebration` (line 38)
- Achievement IDs: `ach-1` First Steps, `ach-2` Quiz Master, `ach-3` Roadmap Builder

---

## Sub-Task 3 — Fix password reset UI (wire to real API)

**Status:** [x] done

### Intent
The "Forgot Credentials?" button in the auth modal currently shows a hard-coded message:
*"Self-serve password reset isn't available yet. Contact support."*  
The actual backend — `POST /api/password-reset/request` and `POST /api/password-reset/confirm`
— is already fully implemented in `src/server/routes/email.ts`. The UI just needs to be
wired up. The app also needs to handle the `?reset_token=<token>` query param that the email
link redirects to, so users can enter a new password.

### Expected Outcomes
- Clicking "Forgot Credentials?" shows an inline email input and a "Send Reset Link" button
  (replaces the current static notice text).
- Submitting the email calls `POST /api/password-reset/request`; shows a confirmation
  message regardless of whether the email exists (anti-enumeration).
- On app load, if `?reset_token=<token>` is present in the URL, the auth modal opens in a
  new "reset" mode showing a new-password form.
- Submitting the new password calls `POST /api/password-reset/confirm`; on success, clears
  the token from the URL and returns to normal login mode.
- No new routes, no new packages — purely frontend state + existing API.

### Todo List
1. In `src/App.tsx` add state:
   - `forgotPasswordMode: boolean` (replaces `showForgotCredentialsNotice`)
   - `forgotEmail: string`
   - `forgotStatus: 'idle' | 'sending' | 'sent' | 'error'`
   - `resetToken: string | null` (read from `new URL(location.href).searchParams.get('reset_token')` on mount)
   - `resetPassword: string`, `resetStatus: 'idle' | 'submitting' | 'success' | 'error'`
2. On app mount (alongside the existing `verifySession` useEffect), read the
   `?reset_token` query param. If present, set `resetToken` and open the auth modal in
   `authMode = 'login'` with the reset form visible.
3. Replace the `showForgotCredentialsNotice` static notice in `renderAuthUI()` with:
   - A toggled inline form: email input + "Send Reset Link" button when
     `forgotPasswordMode` is true.
   - Show "Check your inbox!" when `forgotStatus === 'sent'`.
   - If `resetToken` is set instead, show a "New Password" input + "Set Password" button.
4. Implement `handleForgotPassword()` — calls `POST /api/password-reset/request`, sets
   `forgotStatus` accordingly.
5. Implement `handleResetPassword()` — calls `POST /api/password-reset/confirm` with
   `{ token: resetToken, password: resetPassword }`. On success: clear token from URL
   (`history.replaceState`), clear `resetToken` state, show a success message, let user log
   in normally.
6. Remove the old `showForgotCredentialsNotice` state variable and its setter.

### Relevant Context
- `src/App.tsx` → `renderAuthUI()` lines 1377–1479, `showForgotCredentialsNotice` state line 200
- `src/server/routes/email.ts` → `POST /api/password-reset/request` lines 155–181,
  `POST /api/password-reset/confirm` lines 186–204
- The email link format is `${APP_URL}/?reset_token=<token>` (email.ts line 167)

---

## Sub-Task 4 — Wire email verification after registration

**Status:** [x] done

### Intent
After a user registers, no verification email is sent even though the full sending
infrastructure (`POST /api/verify-email/send`) is already built. Wiring the auto-send
closes the loop and lets users know their account is active.

The backend already handles the `GET /api/verify-email/:token` link and redirects to
`/?verified=success` or `/?verified=invalid`. The frontend currently ignores this param.

### Expected Outcomes
- After a successful `POST /api/register`, the server automatically calls
  `POST /api/verify-email/send` (fire-and-forget — never blocks or fails registration).
- On app load, if `?verified=success` is in the URL, a brief toast/banner is shown:
  "✅ Email verified! Welcome to LearnPath AI."
- If `?verified=invalid`, show: "⚠️ Verification link is invalid or expired."
- The URL param is stripped from the address bar after reading.

### Todo List
1. In `src/server/routes/auth.ts`, inside `POST /api/register`, after the session is set,
   fire-and-forget `fetch('/api/verify-email/send', ...)` using the same `req.session`
   context — or better: import `createToken` + `sendEmail` from the email route helpers
   directly and call them with `await` inside a try/catch that only logs errors (never
   re-throws). This avoids a self-loop HTTP call.
2. Extract the token creation + email sending logic from `src/server/routes/email.ts` into
   a shared helper `sendVerificationEmail(email: string): Promise<void>` exported from
   that module, so both the route handler and `auth.ts` can call it without duplication.
3. In `src/App.tsx`, in the bootstrap `useEffect`, read
   `new URL(location.href).searchParams.get('verified')`. If `'success'` or `'invalid'`,
   set a new `verifiedStatus` state, then call `history.replaceState` to strip the param.
4. Render a dismissible toast banner (reuse the existing online/offline toast pattern at
   lines ~181–191) that shows for 5 seconds when `verifiedStatus` is set.

### Relevant Context
- `src/server/routes/auth.ts` → `POST /api/register` lines 9–37
- `src/server/routes/email.ts` → `sendEmail()` lines 56–72, `createToken()` lines 77–86,
  `POST /api/verify-email/send` route lines 106–127
- `src/App.tsx` → online/offline toast pattern lines 180–191, `showOnlineToast` state

---

## Sub-Task 5 — Replace synthetic analytics with real DB data

**Status:** [ ] pending

### Intent
`getUserAnalytics()` in `src/services/userDataService.ts` returns seeded random numbers
instead of real user data. Every analytics chart shown to users is fabricated. This is a
trust issue. Replacing it with real queries over `user_lesson_progress` and `users.xp`
makes the dashboard honest and genuinely useful.

### Expected Outcomes
- `weeklyHoursPerDay` is derived from `SUM(study_minutes) / 60` grouped by day for the
  last 7 days from `user_lesson_progress`.
- `overallMasteryPercent` is computed as `completedLessons / totalLessons * 100` from
  `user_lesson_progress` vs `lessons`.
- A new `GET /api/user-analytics` endpoint returns this data (requires auth).
- `getUserAnalytics()` in `userDataService.ts` calls this endpoint instead of generating
  fake numbers. Falls back gracefully to zeros on network error.
- The `recommendedNextActions` array is removed from this service (it is already served by
  `/api/ai-recommendations` and duplicated here unnecessarily).

### Todo List
1. Add `GET /api/user-analytics` to `src/server/routes/user.ts`:
   - Query `user_lesson_progress` for the authenticated user, grouped by date over the
     last 7 days → compute hours per day (study_minutes / 60, rounded to 1 decimal).
   - Query `getUserLessonCompletionStats(userEmail)` (already exported from schema.ts)
     for `completedLessons` / `totalLessons` → `overallMasteryPercent`.
   - Return `{ weeklyHoursPerDay: number[], overallMasteryPercent: number }`.
2. In `src/services/userDataService.ts`:
   - Remove the seed/random generation logic.
   - Remove the `recommendedNextActions` field from the `AIAnalytics` interface and return.
   - `getUserAnalytics(userEmail)` should call `GET /api/user-analytics`, parse the
     response, and return the real values. On error return zeros array + 0 mastery.

### Relevant Context
- `src/services/userDataService.ts` — full file (39 lines), currently all synthetic
- `src/server/routes/user.ts` → `GET /api/user-stats` (lines 12–24) uses
  `getUserLessonCompletionStats` — reuse this import
- `src/server/db/schema.ts` → `getUserLessonCompletionStats` (line 1657),
  `getRoadmapProgressSnapshot` (line 1613)
- `user_lesson_progress` table has `study_minutes` and `completed_at` columns (schema lines ~717–760)

---

## Sub-Task 6 — Fix package name + README placeholders

**Status:** [ ] pending

### Intent
`package.json` name is `"react-example"` — visible in logs, npm audit, and deploy dashboards.
The README has dead placeholder banner and GIF URLs. Both are trivial but matter for credibility
with investors, contributors, and tooling.

### Expected Outcomes
- `package.json` `"name"` field is `"learnpath-ai"`.
- README banner image and three demo GIF `src` values are replaced with a text-only
  description section (no broken image tags; real images can be added later).

### Todo List
1. In `package.json`, change `"name": "react-example"` → `"name": "learnpath-ai"`.
2. In `README.md`, remove the broken `<img>` banner tag and replace the three placeholder
   GIF `![...]()` lines with a short **Screenshots** section note: *"Demo screenshots coming
   soon — run the app locally to explore the features."*

### Relevant Context
- `package.json` line 3
- `README.md` lines 2 and 22–30
