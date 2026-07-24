# Auth & Authorization Fixes Plan

## Top-Level Overview

Fix the 6 highest-impact security and data-correctness issues identified in the authentication audit. No new features are added — every change is the minimal fix for the named issue.

Issues addressed (in priority order):
- **C-3 + M-7** — Global `lessons.status` written on user completion, polluting all users
- **C-1** — IDOR: roadmap ownership enforced after DB load, not inside the query
- **C-2** — `userDataService.ts` calls `/api/user-analytics` without an auth header (analytics always show zeros)
- **M-2** — Lesson content/topic endpoints require auth but do not verify the user owns the roadmap
- **M-3** — `POST /api/feedback` has no rate limit and no auth guard

---

## Sub-Tasks

---

### Sub-Task 1: Remove global `lessons.status` writes from completion and unlock (C-3 + M-7)

**Status:** [x] done

**Intent**

`completeLessonForUser()` calls `updateLessonStatus(lessonId, 'completed')` and then `unlockNextLesson()`, both of which write to the shared `lessons.status` column. Because this column is global (not per-user), User A completing Lesson X marks it `completed` for every other user who has that lesson. The fix is to remove these global writes entirely. Per-user completion is already tracked correctly in `user_lesson_progress`; `reconstructLesson()` already reads `_completedByUser` from that table and uses it as the authoritative completion override.

The lock/unlock logic in `unlockNextLesson()` is also global: it queries `WHERE lessons.status = 'locked'` to find the next lesson to unlock, then writes `'available'` to it. This must be made per-user: the unlock should be written to `user_lesson_progress` instead of to `lessons.status`. The dynamic reconstruction in `reconstructLesson()` must then derive `available`/`locked` status per-user from the progress table.

**Expected Outcomes**
- `completeLessonForUser()` no longer calls `updateLessonStatus()` or `unlockNextLesson()`.
- User A completing a lesson does not change `lessons.status` for any other user.
- The next-lesson unlock is tracked per-user in `user_lesson_progress` (a new boolean column `is_unlocked` or by using the existing `completed` flag as a proxy).
- `reconstructLesson()` computes `available`/`locked` status correctly per-user from the progress table rather than from the global `lessons.status`.
- All existing tests for lesson completion continue to pass.

**Backfill decision:** Run a one-time SQL backfill in the migration: for every completed lesson in `user_lesson_progress`, find the next ordered lesson (in the same module or first lesson of the next module) and insert/update an `is_unlocked = true` row for that next lesson. This ensures existing users see their progress correctly from the moment the migration runs.

**Todo List**
1. Add an `is_unlocked` boolean column to `user_lesson_progress` (default `false`) to track per-user unlock state. Add a Drizzle migration for this column.
2. In the same migration, run a one-time backfill: for each `(owner_email, lesson_id)` row where `completed = true`, resolve the next lesson by `order_index` within the same module (or first lesson of the next module by `order_index`) and upsert an `is_unlocked = true` row for that next lesson ID. Use the same `owner_email`, `roadmap_id`, `module_id`, `phase_id` from the completed row.
3. Rewrite `unlockNextLesson()` to accept `ownerEmail` as a parameter. Instead of writing to `lessons.status`, upsert a row into `user_lesson_progress` with `is_unlocked = true` for the resolved next lesson ID.
4. In `completeLessonForUser()`:
   - Remove the call to `updateLessonStatus(lessonId, 'completed')`.
   - Update the `unlockNextLesson()` call to pass `ownerEmail`.
5. In `getNormalizedRoadmap()`, extend the per-user progress query to also select `is_unlocked` from `user_lesson_progress`. Annotate each lesson with `_unlockedByUser: unlockedLessonIds.has(lesson.id)`.
6. In `reconstructLesson()`, update the status derivation logic:
   - `'completed'` if `_completedByUser`
   - `'available'` if `_unlockedByUser` (and not completed)
   - otherwise fall back to the global `lessons.status` (which still holds `'locked'` or `'available'` as the initial seed state for the very first lesson of each roadmap)
7. Remove the "all lessons completed → roadmap status = completed" check from `unlockNextLesson()` since it relies on `WHERE lessons.status = 'completed'`. Move this check into `completeLessonForUser()` using the per-user `user_lesson_progress` count instead.
8. Delete the internal calls to `updateLessonStatus()` from all paths inside `unlockNextLesson()`. The `updateLessonStatus` export can remain for other potential uses (e.g. content status updates) but must not be called from the completion/unlock flow.
9. Run existing tests and fix any failures.

**Relevant Context**
- `src/server/db/queries.ts` — `completeLessonForUser()` lines 1355–1408, `unlockNextLesson()` lines 1414–1557, `updateLessonStatus()` lines 1152–1160, `reconstructLesson()` lines 1228–1273, `getNormalizedRoadmap()` lines 731–839 (specifically the progress query at ~750 and the lesson annotation at ~825).
- `src/server/db/drizzle.ts` — Drizzle schema file for adding the migration column.
- `drizzle/` — migration output directory.
- The global `lessons.status` column should not be removed — it still serves as the "initial state" seed value (first lesson of each roadmap is seeded as `'available'`; the rest as `'locked'`). Only the mutation-on-completion path is being removed.

---

### Sub-Task 2: Enforce roadmap ownership inside the DB query (C-1)

**Status:** [x] done

**Intent**

`GET /api/roadmaps/:roadmapId` calls `reconstructRoadmapJson(roadmapId, userEmail)` which calls `getNormalizedRoadmap()` which calls `getRoadmapById(roadmapId)` — a query with no ownership filter. All phases, modules, lessons, quizzes, resources, and projects for the roadmap are loaded before the ownership check in the route handler fires at line 260. The fix is to add `ownerEmail` as a filter inside the DB query so the row simply doesn't return if the user doesn't own it.

**Expected Outcomes**
- `getRoadmapById(roadmapId, ownerEmail?)` accepts an optional second parameter; when supplied, adds `AND owner_email = ownerEmail` to the WHERE clause.
- `getNormalizedRoadmap(roadmapId, ownerEmail?)` passes `ownerEmail` through to `getRoadmapById`.
- If the roadmap does not belong to `userEmail`, `getRoadmapById` returns `null`, `getNormalizedRoadmap` returns `null`, `reconstructRoadmapJson` returns `null`, and the route handler returns 404 — the same user-visible result as before, but now enforced at the query level.
- The post-fetch ownership check in the route handler (`roadmap.ownerEmail?.toLowerCase() !== userEmail.toLowerCase()`) can remain as a belt-and-suspenders guard or be removed (keeping it is fine).
- No other call sites that pass only `roadmapId` (no email) are affected because the parameter is optional.

**Todo List**
1. Update `getRoadmapById(roadmapId, ownerEmail?)` in `src/server/db/queries.ts` to add `and(eq(roadmaps.id, roadmapId), eq(roadmaps.ownerEmail, ownerEmail.toLowerCase()))` when `ownerEmail` is supplied.
2. Update `getNormalizedRoadmap(roadmapId, ownerEmail?)` to pass `ownerEmail` to `getRoadmapById`.
3. Verify call sites of `getRoadmapById` and `getNormalizedRoadmap` that do NOT pass `ownerEmail` still work correctly (they should, since the param is optional).
4. The `POST /api/update-roadmap` handler uses `getRoadmapsByOwner(userEmail)` + checks ownership before calling `reconstructRoadmapJson` — this pattern is already correct, no change needed there.

**Relevant Context**
- `src/server/db/queries.ts` — `getRoadmapById()` lines 161–164, `getNormalizedRoadmap()` line 732.
- `src/server/routes/roadmaps.ts` — `GET /roadmaps/:roadmapId` lines 253–282 (ownership check at line 260).
- `reconstructRoadmapJson` at line 1178 calls `getNormalizedRoadmap(roadmapId, ownerEmail)` — already passes `ownerEmail` so no change needed there.

---

### Sub-Task 3: Fix `userDataService.ts` to pass the auth header (C-2)

**Status:** [x] done

**Intent**

`getUserAnalytics()` in `src/services/userDataService.ts` calls `fetch('/api/user-analytics')` with no `Authorization` header. The server endpoint applies `requireAuth`, so every call from a logged-in user returns 401 and falls back to zero data. The analytics chart always shows zeros as a result.

Additional finding from code search: `getUserAnalytics` is currently **never called** in the codebase. The fix has two parts: (a) update the function signature to accept and forward the auth header, and (b) find where analytics data is fetched in the UI and ensure it uses the updated function with the header.

**Expected Outcomes**
- `getUserAnalytics(getAuthHeaders)` accepts a header-getter function (the same `mutatingHeaders` pattern used everywhere else in the frontend).
- The `fetch` call includes `Authorization: Bearer <token>`.
- The analytics tab (wherever it renders weekly hours / overall mastery) calls `getUserAnalytics` with the auth header getter and receives real data.
- If `getUserAnalytics` is not called anywhere meaningful, the call site should be wired up to the analytics view.

**Todo List**
1. Update `getUserAnalytics(getAuthHeaders: () => Promise<Record<string, string>>)` in `src/services/userDataService.ts` to call `await getAuthHeaders()` and pass the result as `headers` to `fetch`.
2. Search the codebase for where the analytics view fetches `weeklyHoursPerDay` and `overallMasteryPercent` — confirm whether it calls `getUserAnalytics` or fetches the endpoint directly. Wire up the auth header in whichever path is actually used.
3. Grep for usages of `/api/user-analytics` on the frontend to catch any direct `fetch` calls that also lack the header.

**Relevant Context**
- `src/services/userDataService.ts` — full file, 24 lines.
- `src/components/TabsScreen.tsx` — renders the analytics/progress view; likely the consumer.
- `mutatingHeaders` pattern: exported from `AuthContext` as `() => Promise<Record<string, string>>`, already used in `App.tsx`, `AppRouter.tsx`, and many components as `getAuthHeaders`.
- Server endpoint: `GET /api/user-analytics` in `src/server/routes/user.ts` lines 278–320.

---

### Sub-Task 4: Add roadmap ownership check to lesson content endpoints (M-2)

**Status:** [x] done

**Intent**

The four lesson endpoints (`GET /lessons/:id/content`, `POST /lessons/:id/generate`, `GET /lessons/:id/meta`, `GET /topics/:id`) require authentication but do not verify that the lesson belongs to a roadmap owned by the requesting user. `findLessonContext(lessonId)` already returns `roadmap_id` — it just isn't used to check ownership. The fix adds a single ownership guard after `findLessonContext` / `getLessonById` resolves.

The pattern: call `findLessonContext(lessonId)`, get `roadmap_id`, then call `getRoadmapsByOwner(userEmail)` and verify the roadmap is in the result. Return 404 if not (same as the roadmap endpoint — avoid 403 to prevent ID enumeration).

**Expected Outcomes**
- A user who does not own the roadmap containing a lesson receives 404 from all four endpoints.
- A user who owns the roadmap receives the same response as before.
- No change to the response shape or timing for legitimate requests (ownership check adds one small DB query).

**Todo List**
1. Create a small helper function `assertLessonOwnership(userEmail, lessonId)` — or inline the check — that:
   a. Calls `findLessonContext(lessonId)` to get `roadmap_id` (or uses the already-fetched context).
   b. Calls `getRoadmapsByOwner(userEmail)` and checks that the returned list contains a roadmap with that `id`.
   c. Returns `null` (lesson not found) or throws a 404 HttpError if the check fails.
2. Add this check to `GET /lessons/:lessonId/content` before calling `getOrGenerateLessonContent`.
3. Add this check to `POST /lessons/:lessonId/generate` before calling `getOrGenerateLessonContent`.
4. Add this check to `GET /lessons/:lessonId/meta`: use `findLessonContext` (already available) instead of `getLessonById` to get the `roadmap_id` in one query, then verify ownership.
5. Add this check to `GET /topics/:topicId`: `findLessonContext` is already called at the top of this handler — extend it to verify ownership after it resolves.
6. Import `getRoadmapsByOwner` into `src/server/routes/lessons.ts`.

**Relevant Context**
- `src/server/routes/lessons.ts` — all four handlers, lines 30–167.
- `src/server/db/queries.ts` — `findLessonContext()` lines 1330–1349 (returns `roadmap_id`), `getRoadmapsByOwner()` lines 166–172.
- The `GET /api/roadmaps/:id` handler in `roadmaps.ts` uses 404 (not 403) to avoid ID enumeration — use the same convention here.
- `getLessonById` is currently used by `GET /lessons/:id/meta` but does not return `roadmap_id`. Switch to `findLessonContext` so both the lesson data and `roadmap_id` come from one query.

---

### Sub-Task 5: Add rate limit to `POST /api/feedback` (M-3)

**Status:** [x] done

**Intent**

`POST /api/feedback` has no rate limiter and no authentication requirement, making it trivial to flood the `feedback` table. The fix is to apply a per-IP rate limit using the existing `createLimiter` factory. Authentication remains optional (anonymous feedback is a product feature), but the rate limit prevents storage abuse.

**Expected Outcomes**
- A single IP address can submit at most 5 feedback entries per minute.
- Requests beyond this limit receive a 429 with `{ error: 'Too many feedback submissions. Please slow down.' }`.
- Authenticated users are still rate-limited by IP (consistent with all other limiters).
- The change is a single new limiter constant + one middleware addition.

**Todo List**
1. In `src/server/routes/user.ts`, import `createLimiter` from `'../lib/middleware'`.
2. Create a module-level limiter: `const feedbackLimiter = createLimiter({ windowMs: 60 * 1000, max: process.env.NODE_ENV === 'test' ? 1000 : 5, message: { error: 'Too many feedback submissions. Please slow down.' } })`.
3. Add `feedbackLimiter` as the first middleware argument to the `router.post('/feedback', ...)` handler.

**Relevant Context**
- `src/server/routes/user.ts` — `POST /feedback` handler lines 247–263.
- `src/server/lib/middleware.ts` — `createLimiter` factory lines 249–263, `lessonLimiter` as a pattern example lines 273–277.
- Existing import line in `user.ts`: `import { requireAuth } from '../lib/middleware'` — extend to also import `createLimiter`.

---

## Implementation Order

Sub-Tasks must be done in this order because Sub-Task 1 changes the data model that Sub-Task 4 reads:

1. **Sub-Task 1** (C-3/M-7) — foundational data model change; touches `queries.ts` heavily
2. **Sub-Task 2** (C-1) — isolated query change; no dependencies
3. **Sub-Task 3** (C-2) — frontend-only; no dependencies
4. **Sub-Task 4** (M-2) — depends on Sub-Task 1 having stabilized `findLessonContext` usage
5. **Sub-Task 5** (M-3) — fully isolated; can be done at any point

## Files Changed Summary

| File | Sub-Tasks |
|------|-----------|
| `src/server/db/queries.ts` | 1, 2 |
| `drizzle/` (new migration) | 1 |
| `src/server/routes/lessons.ts` | 4 |
| `src/server/routes/user.ts` | 5 |
| `src/services/userDataService.ts` | 3 |
| `src/components/TabsScreen.tsx` (likely) | 3 |
