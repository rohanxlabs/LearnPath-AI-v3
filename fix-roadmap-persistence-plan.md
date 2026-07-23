# Fix: Roadmap Persistence & Listing Bugs

## Overview

Seven bugs were found during root-cause analysis that collectively cause:
- Generating a second roadmap overwrites the content of the first roadmap card
- GET /api/roadmaps, /api/progress, and /api/user-stats return 401 because no Bearer token is sent
- POST-write verification logs "Post-write read returned empty"
- Newly generated roadmaps temporarily vanish from the list

The fixes are ordered so each one is safe to apply independently, and later fixes build on earlier ones.

---

## Sub-Tasks

### Sub-Task 1 — Scope all child IDs to the roadmap ID in `validateAndNormalizeCurriculum`

**Status:** [x] done

**Intent**
The AI prompt instructs the model to produce short, deterministic IDs like `ph-1`, `mod-1-1`,
`les-1-1-1`. Every roadmap will have a phase called `ph-1`. When the second roadmap is saved,
the `upsertPhase` call fires `INSERT … ON CONFLICT DO UPDATE` on `ph-1` and silently overwrites
the first roadmap's row with the new roadmap's content. Scoping IDs to the roadmap eliminates
all collision-driven data corruption.

**Expected Outcomes**
- No two roadmaps share a phase, module, or lesson ID
- The first roadmap's content is never touched when a second roadmap is generated
- No schema changes required — IDs remain text primary keys

**Todo List**
1. In `src/server/lib/curriculum.ts`, inside `validateAndNormalizeCurriculum`, accept an optional
   `roadmapId?: string` as a third parameter (or derive it from `meta` if already present).
2. At line 342 where `phaseId` is assigned, prefix it:
   `roadmapId ? (id.startsWith(roadmapId) ? id : `${roadmapId}-${id}`) : id`
3. Apply the same prefix transformation at line 360 (moduleId) and line 368 (lessonId).
4. Update the `orderedLessonIds` / `lessonIndexById` pre-scan (lines 322–334) to use the same
   prefixing so prerequisite resolution still matches the new IDs.
5. In `src/server/routes/roadmaps.ts`, generate a stable `roadmapId` (e.g. `roadmap-${Date.now()}`)
   **before** calling the AI, and pass it as `meta.roadmapId` into `validateAndNormalizeCurriculum`.
   Apply this in both the `/generate-roadmap` route (line 93) and the `/generate-roadmap-stream`
   route (line 213).
6. Confirm that the `id` field returned by both endpoints now contains the scoped roadmap ID so
   the frontend stores the correct value.

**Relevant Context**
- `src/server/lib/curriculum.ts:304` — `validateAndNormalizeCurriculum`; phaseId at 342, moduleId at 360, lessonId at 368
- `src/server/routes/roadmaps.ts:93–95` — first call site (non-streaming)
- `src/server/routes/roadmaps.ts:213` — second call site (streaming)
- `src/server/db/queries.ts:849–903` — `migrateRoadmapJsonToTables` — child ID fallback generation also needs the same scoping as a defense-in-depth measure (lines 851, 868, 884)

---

### Sub-Task 2 — Add `roadmapId` to every `onConflictDoUpdate` set-block

**Status:** [x] done

**Intent**
Even after Sub-Task 1 makes collisions nearly impossible, the Drizzle upserts for `phases`,
`modules`, and `lessons` omit `roadmapId` from their `ON CONFLICT DO UPDATE SET` clause.
If a collision ever slips through, the row stays FK-linked to the wrong roadmap. This is a
defense-in-depth fix.

**Expected Outcomes**
- Any upsert collision will fully re-own the row under the new roadmap
- No behavior change in the normal (no-collision) path

**Todo List**
1. In `src/server/db/queries.ts`, add `roadmapId: phase.roadmapId` to the `set` object inside
   `upsertPhase.onConflictDoUpdate` (around line 170–182).
2. Add `roadmapId: module.roadmapId` to `upsertModule.onConflictDoUpdate` (around line 208–217).
3. Add `roadmapId: lesson.roadmapId` to `upsertLesson.onConflictDoUpdate` (around line 260–280),
   and also update `moduleId` and `phaseId` in that same block (they are already there — verify).

**Relevant Context**
- `src/server/db/queries.ts:148–183` — `upsertPhase`
- `src/server/db/queries.ts:189–218` — `upsertModule`
- `src/server/db/queries.ts:224–281` — `upsertLesson`

---

### Sub-Task 3 — Remove the racy post-write `reconstructRoadmapJson` call

**Status:** [x] done

**Intent**
After saving all child rows, `POST /api/roadmaps` immediately calls `reconstructRoadmapJson`
to verify the write. Under Supabase's PgBouncer in transaction mode, this read can arrive on a
different backend connection before the write has been fully flushed — returning zero phases and
triggering the "Post-write read returned empty" warning. The fallback is already correct (it
returns the incoming roadmap object), so the verification read is wasted work that only adds
noise. Removing it eliminates the race condition entirely.

**Expected Outcomes**
- "Post-write read returned empty" log line never appears
- `POST /api/roadmaps` always returns the full roadmap object to the client
- No functional change to what the client receives

**Todo List**
1. In `src/server/routes/roadmaps.ts`, inside the `POST /api/roadmaps` handler (around line 309),
   delete the `reconstructRoadmapJson` call and the `if (!saved …)` fallback block.
2. Replace with a single line:
   `const saved = { ...roadmap, ownerEmail: userEmail };`
3. The response `res.json({ success: true, roadmap: saved, newAchievement })` stays unchanged.

**Relevant Context**
- `src/server/routes/roadmaps.ts:294–327` — full `POST /api/roadmaps` handler
- `src/server/db/queries.ts:1122` — `reconstructRoadmapJson` (not deleted, still used by `GET /api/roadmaps/:id`)

---

### Sub-Task 4 — Stop filtering zero-phase roadmaps from `getUserRoadmapsReconstructed`

**Status:** [x] done

**Intent**
`getUserRoadmapsReconstructed` silently drops roadmaps whose phase list reconstructs as empty.
This was intended to hide partial-save debris, but it also hides any roadmap that suffers from
the BUG-5 race (now fixed in Sub-Task 3). After Sub-Task 3 the race is gone, so the filter is
no longer needed and makes newly saved roadmaps temporarily invisible in `GET /api/roadmaps`.

**Expected Outcomes**
- `GET /api/roadmaps` returns every roadmap the user has created, regardless of whether its
  phases have been committed yet (should always be the case after Sub-Task 3)
- The roadmap list count matches the number of POST /api/roadmaps calls

**Todo List**
1. In `src/server/db/queries.ts`, inside `getUserRoadmapsReconstructed` (around line 1256),
   remove the `reconstructed.phases.length > 0` guard.
2. Keep the `if (reconstructed)` null-check so truly missing roadmap rows are still excluded.

**Relevant Context**
- `src/server/db/queries.ts:1248–1261` — `getUserRoadmapsReconstructed`

---

### Sub-Task 5 — Fix `getAccessToken` to use `refreshSession` so GET fetches always carry a Bearer token

**Status:** [x] done

**Intent**
`getAccessToken` calls `supabase.auth.getSession()` which reads the token from localStorage
without network validation. On a cold reload, the stored access token may be expired; the
function returns `null` and all outgoing `fetch` calls omit the `Authorization` header, causing
the server to log "401 no token" for `GET /api/roadmaps`, `GET /api/progress/:id`, and
`GET /api/user-stats`. Switching to `refreshSession()` guarantees a live token is always
returned (Supabase only hits the network when the cached token is actually expired).

**Expected Outcomes**
- All GET endpoints that require auth return 200 immediately on page load
- No "401 no token" server log entries for `/api/roadmaps`, `/api/progress`, or `/api/user-stats`
- Progress bars and stats load correctly on first render after a cold reload

**Todo List**
1. In `src/contexts/AuthContext.tsx`, find `getAccessToken` (around line 181).
2. Replace `supabase.auth.getSession()` with `supabase.auth.refreshSession()`.
   The return shape is identical: both expose `data.session?.access_token`.
3. No other changes needed — `mutatingHeaders` and `getHeaders` both call `getAccessToken`,
   so all fetch sites inherit the fix automatically.

**Relevant Context**
- `src/contexts/AuthContext.tsx:181–184` — `getAccessToken`
- `src/contexts/AuthContext.tsx:187–193` — `mutatingHeaders` (the consumer)
- `src/contexts/RoadmapContext.tsx:71–99` — `loadProgress` effect (uses `getHeaders = mutatingHeaders`)
- `src/contexts/RoadmapContext.tsx:126–130` — `syncRoadmapsFromDatabase` (same)

---

### Sub-Task 6 — Add auth headers to bare `fetch('/api/user-stats')` calls in components

**Status:** [x] done

**Intent**
Two components call `fetch('/api/user-stats')` with no headers at all — this bypasses
`mutatingHeaders` entirely and will always return 401 regardless of Sub-Task 5.

**Expected Outcomes**
- `AnalyticsView` stats load correctly
- `HomeView` welcome-back banner loads correctly
- No 401 for `/api/user-stats` from the client side

**Todo List**
1. In `src/components/HomeView.tsx` (around line 169), the `useEffect` fetches
   `/api/user-stats` with no headers. This component doesn't have access to `mutatingHeaders`
   directly. Pass `getHeaders: () => Promise<Record<string,string>>` as a new prop from
   `AppShell` (which has `mutatingHeaders` in scope), and use it in the fetch call.
2. In `src/components/TabsScreen.tsx` (`AnalyticsView`, around line 29), apply the same
   pattern — add a `getHeaders` prop and use it in `fetchStats`.
3. Update call sites in `src/router/AppRouter.tsx` (or wherever `AnalyticsView` and `HomeView`
   are rendered) to pass the `getHeaders` prop down from `AppShell`.
4. Alternatively — simpler — move the `/api/user-stats` fetch call up into `AppShell` and pass
   the result as a plain prop (`liveStats`) into `HomeView` and `AnalyticsView`, which avoids
   threading a `getHeaders` callback into every consumer component.

**Relevant Context**
- `src/components/HomeView.tsx:169` — bare fetch
- `src/components/TabsScreen.tsx:29` — bare fetch
- `src/App.tsx` (AppShell) — owns `mutatingHeaders`; good place to hoist the fetch if preferred

---

### Sub-Task 7 — Guard `POST /api/roadmaps` with INSERT … ON CONFLICT DO NOTHING

**Status:** [x] done

**Intent**
`createRoadmapFromJson` → `migrateRoadmapJsonToTables` → `upsertRoadmap` uses an UPSERT
(`INSERT … ON CONFLICT DO UPDATE`), which means a second POST with the same roadmap ID silently
overwrites the existing roadmap record. For a create-only endpoint, `ON CONFLICT DO NOTHING`
is the correct behavior — if the ID already exists the insert is a no-op and the existing data
is preserved.

**Expected Outcomes**
- Retried POST /api/roadmaps calls (e.g. network retry on client) do not overwrite existing data
- The endpoint returns success on a no-op retry (idempotent behavior)
- The achievement-unlock logic still fires only on truly new roadmaps

**Todo List**
1. In `src/server/db/queries.ts`, add a new exported function `insertRoadmapIfNew` that
   uses `.onConflictDoNothing({ target: roadmaps.id })` and returns `boolean`
   (true = inserted, false = already existed).
2. In `migrateRoadmapJsonToTables` (around line 806), replace the `upsertRoadmap(…)` call
   with `await insertRoadmapIfNew(…)`. If the result is `false` (already exists), return early
   from the function rather than re-upserting all child rows.
3. In `src/server/routes/roadmaps.ts` inside `POST /api/roadmaps`, if `createRoadmapFromJson`
   returns (after the early-return), still respond with `{ success: true, roadmap: saved }` so
   the client treats a duplicate submission as a success (idempotent).
4. Keep `upsertRoadmap` unchanged — it is still used by `POST /update-roadmap`.

**Relevant Context**
- `src/server/db/queries.ts:76–129` — `upsertRoadmap`
- `src/server/db/queries.ts:1084–1090` — `createRoadmapFromJson`
- `src/server/db/queries.ts:806` — `upsertRoadmap` call inside `migrateRoadmapJsonToTables`
- `src/server/routes/roadmaps.ts:294–327` — `POST /api/roadmaps` handler
