# Roadmap System — Complete Upgrade Plan

## Top-Level Overview

This plan upgrades the core roadmap generation → phase → lesson → resources / quiz / projects
flow from its current state (functional but with rough UX gaps) to a polished, production-quality
system. All 14 improvements identified in the deep-audit are covered across 10 focused sub-tasks.

Sub-tasks are ordered by dependency and impact:
- Sub-tasks 1–4 fix data correctness and critical UX gaps (must-do first)
- Sub-tasks 5–7 upgrade the tab system (resources, projects, quiz)
- Sub-tasks 8–10 add meaningful new features (streaming reveal, insights, celebrations)

Each sub-task is scoped to a bounded set of files and can be reviewed independently.

---

## Sub-Task 1 — Live progress percent + fix stale DB value on roadmap overview

**Status:** `[x] done`

**Intent:**
`RoadmapOverviewPage` renders a circular progress ring using `roadmap.progressPercent`
(the last-saved DB snapshot). This value can be stale immediately after a lesson
is completed in the same session. The component already computes `completedLessons`
and `totalLessons` from live lesson statuses five lines below — that computed value
should drive the progress ring instead of the DB field.

The sidebar progress bar in `LearningWorkspace` already uses the live-computed
`progressPercent` (line 762). This sub-task makes `RoadmapOverviewPage` consistent.

**Expected Outcomes:**
- The circular progress ring in `RoadmapOverviewPage` reflects the current
  session's lesson completions immediately, without waiting for a DB sync.
- The `X% done` label inside the ring matches what the sidebar in `LearningWorkspace` shows.
- No new props, no API calls — pure local computation.

**Todo List:**
1. In `RoadmapOverviewPage.tsx`, locate the `completedLessons` and `totalLessons`
   computations (lines 77–80). Add a derived `liveProgressPercent` computed as
   `totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : roadmap.progressPercent`.
2. Replace `roadmap.progressPercent` in the SVG `strokeDashoffset` calc (line 127)
   and the `{roadmap.progressPercent}%` label (line 134) with `liveProgressPercent`.
3. The "Completed!" state (line 157) already checks `completionWeeks === 0` — leave it.
4. Verify the progress bar in the stats row also uses `liveProgressPercent`.

**Relevant Context:**
- `src/components/RoadmapOverviewPage.tsx` lines 77–80 (lesson counts), 122–135 (SVG ring)
- `src/components/LearningWorkspace.tsx` lines 281–283 (live progressPercent example to follow)

---

## Sub-Task 2 — Fix phase Resources tab data path + add roadmap-level fallback

**Status:** `[x] done`

**Intent:**
`PhaseDetailPage` collects phase resources from `(level as any).resources` (line 107)
but this field is not always populated on level objects reconstructed from the DB.
The roadmap object itself carries `roadmap.resources` (a `CuratedResource[]` array where
each entry has a `phaseId` field) — this is the authoritative source and is always present
if the AI generated resources during roadmap creation.

This sub-task makes the Resources tab source from both locations, so it reliably shows content.

**Expected Outcomes:**
- The Phase Detail "Resources" tab shows resources from module-level data OR from
  `roadmap.resources` filtered by `phaseId`, whichever is populated.
- The tab never shows "No resources for this phase yet" for a freshly generated roadmap
  that has resources embedded at the roadmap level.
- Duplicate resources (same `id`) are de-duplicated.

**Todo List:**
1. In `PhaseDetailPage.tsx`, update the `phaseResources` `useMemo` (lines 106–108).
   After collecting `(level as any).resources`, also collect from
   `(roadmap.resources || []).filter(r => r.phaseId === phase.id)`.
   Merge both arrays and de-duplicate by `id` using a `Map`.
2. Also collect resources where `phaseId` is null/undefined but `moduleId` matches
   one of the phase's level IDs, as a secondary fallback.
3. Verify `ResourcesSection` renders the combined list correctly — it already
   handles any array of resource objects.
4. No server changes needed — `roadmap.resources` is already loaded.

**Relevant Context:**
- `src/components/PhaseDetailPage.tsx` lines 106–108 (`phaseResources` useMemo)
- `src/components/PhaseDetailPage.tsx` lines 386–438 (`ResourcesSection` render)
- `src/types.ts` lines 126–135 (`CuratedResource` — has `phaseId` and `id` fields)
- `src/server/routes/roadmaps.ts` lines 257–270 (roadmap reconstruction — `resources` is included)

---

## Sub-Task 3 — Show all phase projects, not just the first

**Status:** `[x] done`

**Intent:**
`PhaseDetailPage` sources the project for the Project tab as `(phase as any).projects?.[0]`
(line 111) — only the first element. The AI prompt generates multiple projects per phase
using the difficulty ladder (`mini-exercise → capstone`). All projects should be visible
and trackable, with the same progress-update mechanics as the current single-project view.

**Expected Outcomes:**
- The Project tab in `PhaseDetailPage` shows all projects in `phase.projects`.
- Each project card shows title, difficulty badge, description, tech stack, features list,
  a progress slider, and a GitHub URL input — exactly what the current `ProjectSection` shows.
- Progress and GitHub URL save per-project independently.
- Empty state (no projects) is shown when `phase.projects` is empty or undefined.

**Todo List:**
1. In `PhaseDetailPage.tsx`, change `phaseProject` (line 111) to
   `phaseProjects = (phase as any).projects ?? []`.
2. Pass `phaseProjects` as an array to `ProjectSection` instead of a single project.
3. In `ProjectSection`, replace the single-project render with a mapped list of
   `ProjectItem` sub-components — each holding its own `progress` and `githubUrl` state.
4. Extract the current project-detail JSX (progress slider, GitHub input, save button)
   into a new internal `ProjectItem` component accepting `(project, roadmap, phase, onRoadmapUpdated)`.
5. When saving, send the full updated `phase.projects` array in the `updates.projects`
   payload to `/api/update-roadmap` so all projects are persisted.
6. Show an empty-state card (matching the current empty state design) when `phaseProjects.length === 0`.
7. The `GateStat` for "Project" (line 244–249) should check if ANY project in
   `phaseProjects` has `progress === 100`, not just project[0].

**Relevant Context:**
- `src/components/PhaseDetailPage.tsx` line 111 (`phaseProject` source), lines 716–740 (`ProjectSection`)
- `src/components/PhaseDetailPage.tsx` lines 244–249 (`GateStat` project check)
- `src/types.ts` lines 147–156 (`ProjectTrack` type)
- `src/server/routes/roadmaps.ts` lines 347–351 (project upsert — handles array)

---

## Sub-Task 4 — Continue Learning resume banner on RoadmapOverviewPage

**Status:** `[x] done`

**Intent:**
When a user returns to a roadmap's overview page, the "Continue Learning" button exists
but gives no preview of where they will land. Users don't know which lesson or phase
they are resuming. A contextual resume banner — "Resume: Lesson Name in Phase Name" —
above the phase cards would reduce confusion and increase motivation.

`getNextIncompleteLesson` currently returns `{ phaseId, levelId, lessonId }` — only IDs.
The lesson name and phase name must be derived from the roadmap object inline.

**Expected Outcomes:**
- When a roadmap has progress (at least one completed lesson), a compact banner appears
  at the top of the phase cards section showing the next lesson name and its parent
  phase name.
- The banner has a "Continue" button that triggers the same `onContinueLearning` callback.
- When the roadmap is brand-new (no progress), the banner is not shown — only the
  hero "Continue Learning" button.
- No new API calls — the resume info is derived from the in-memory roadmap.

**Todo List:**
1. In `RoadmapOverviewPage.tsx`, after `const hasNextLesson = ...` (line 74), derive
   a `resumeInfo` object: use the phases + levels + lessons arrays to find the lesson
   object matching the IDs returned by `getNextIncompleteLesson`, and extract
   `{ lessonName, phaseName }`.
2. Pass `getNextIncompleteLesson` as a prop to `RoadmapOverviewPage` (or call it
   via the existing `onContinueLearning` pattern — the returned data needs to be
   enriched). The cleanest approach: add a `resumeInfo?: { lessonName: string; phaseName: string }`
   prop to `RoadmapOverviewPageProps` and compute it in `AppRouter` before rendering.
3. In `AppRouter.tsx` (line 200–209), before rendering `RoadmapOverviewPage`, compute
   `resumeInfo` by calling `getNextIncompleteLesson(selectedRm)` and mapping the IDs
   back to names from `selectedRm.phases`.
4. **Design (confirmed): slim strip between hero card and phase cards grid.**
   In `RoadmapOverviewPage`, render the banner between the hero `<motion.div>` and
   the "Learning Phases" heading when `resumeInfo` is truthy and `completedLessons > 0`.
   Style as a slim left-border strip (purple/violet gradient accent) with a play icon,
   lesson name truncated to 1 line, parent phase name dimmed, and a "Resume →" button
   that calls `onContinueLearning`.
5. On mobile, keep the banner compact (single line with truncation via `truncate` class).

**Relevant Context:**
- `src/components/RoadmapOverviewPage.tsx` lines 68–74 (hasNextLesson + stats)
- `src/router/AppRouter.tsx` lines 200–209 (RoadmapOverviewPage render)
- `src/contexts/RoadmapContext.tsx` lines 114–147 (`getNextIncompleteLesson`)

---

## Sub-Task 5 — Phase-grouped Resources Tab (roadmap-level ResourcesTab)

**Status:** `[x] done`

**Intent:**
The roadmap-level `ResourcesTab` shows all resources in a flat grid. A roadmap may
have 30–50 resources across 4–6 phases. Users in Phase 2 cannot find what's relevant
to them. Adding a "Phase" filter column alongside the existing type/status filters,
and optionally grouping resources under phase headings, makes the tab genuinely useful.

**Expected Outcomes:**
- A "Phase" filter row appears in `ResourcesTab`'s `FilterControls` section.
  Options: "All Phases" + one option per phase name (e.g. "Phase 1: Foundations").
- When a phase filter is active, only resources with a matching `phaseId` are shown.
  Resources with no `phaseId` are always shown under "All Phases."
- The currently-active phase (derived from the roadmap's phase progress) gets an
  "Active" badge in the phase filter options — draws attention to the most relevant set.
- Existing type + status + search filters still work in combination with the phase filter.

**Todo List:**
1. In `ResourcesTab.tsx`, add a `filterPhaseId` state (`string`, default `'all'`).
2. Build the phase option list from `roadmap.phases.map(p => ({ id: p.id, name: p.name }))`.
   Determine the "active" phase as the first phase where `calcPhaseProgress(phase) < 100`.
3. In `FilterControls`, add a new "PHASE" filter row (same style as TYPE/STATUS rows)
   below the existing rows. Render one button per phase plus "All Phases". Mark the
   active phase button with a small "Active" pill.
4. Update the `filteredResources` `useMemo` to also filter by `filterPhaseId`:
   `if (filterPhaseId !== 'all') return res.phaseId === filterPhaseId || !res.phaseId`.
5. In `FilterControls` props interface, add `filterPhaseId`, `setFilterPhaseId`,
   and `phases` params. Pass them from `ResourcesTab`.
6. Import `calcPhaseProgress` from `roadmapUtils` for the active-phase detection.

**Relevant Context:**
- `src/components/ResourcesTab.tsx` lines 17–126 (ResourcesTab component)
- `src/components/ResourcesTab.tsx` lines 143–178 (FilterControls component)
- `src/lib/roadmapUtils.ts` `calcPhaseProgress` function
- `src/types.ts` `CuratedResource` (has `phaseId` field)

---

## Sub-Task 6 — Phase-aware Projects Tab (roadmap-level ProjectsTab)

**Status:** `[x] done`

**Intent:**
`ProjectsTab` shows all roadmap projects in a flat list. Projects are not visually
linked to their parent phase. A user in Phase 2 does not know which project belongs
to which phase. Projects from future locked phases should be visually dimmed.
Adding phase labels and a phase filter mirrors the Resources Tab improvement.

**Expected Outcomes:**
- Each `ProjectCard` shows a "Phase N: Name" badge in its header area.
- A "Phase" filter (same as Resources Tab) appears above the difficulty filter.
- Projects from phases not yet unlocked are shown with a lock icon and reduced opacity.
- Filtering by phase shows only that phase's projects.
- Existing difficulty filter continues to work in combination with the phase filter.

**Todo List:**
1. In `ProjectsTab.tsx`, add `filterPhaseId` state (default `'all'`).
2. Build a `projectPhaseMap: Map<string, { phaseId: string; phaseName: string; phaseIndex: number; unlocked: boolean }>` by iterating `roadmap.phases` and matching `phase.projects[*].id` to the map.
3. Add a phase filter row above the existing difficulty filter, using the same
   button-chip style as the Resources Tab phase filter.
4. Update `filteredProjects` to filter by `filterPhaseId` in addition to `filterDifficulty`.
5. Pass `phaseLabel` (e.g. `"Phase 2: Core Concepts"`) and `isLocked: boolean` to `ProjectCard`.
6. In `ProjectCard.tsx`, render a small phase badge in the card header row using the
   passed `phaseLabel`. When `isLocked=true`, add `opacity-60` and a lock icon overlay
   on the card (matching the PhaseDetailPage locked-phase style).
7. Import `getPhaseUnlockStatus` from `roadmapUtils` to determine lock state.

**Relevant Context:**
- `src/components/ProjectsTab.tsx` (full file)
- `src/components/ProjectCard.tsx` (full file — add `phaseLabel` and `isLocked` props)
- `src/lib/roadmapUtils.ts` `getPhaseUnlockStatus`
- `src/types.ts` `ProjectTrack` (has `id` field; `phaseId` is stored on phase object)

---

## Sub-Task 7 — Quiz Tab: use embedded roadmap.quizzes first, cache generation

**Status:** `[x] done`

**Intent:**
Two quiz sub-systems exist in parallel:
1. `PhaseDetailPage → QuizSection` generates quizzes per-phase and stores them in
   `roadmap.quizzes[phaseId]`. This cache is checked on next render via `savedQuiz`.
2. `QuizTab` (roadmap-level) generates quizzes independently via `/api/generate-quiz`
   and caches them in `phaseQuizCache` (React state, lost on unmount).

The `QuizTab` never checks `roadmap.quizzes[phase.id]` first. If the user already
generated a quiz via `PhaseDetailPage`, `QuizTab` ignores it and hits the API again.
The fix: `QuizTab` should seed its `phaseQuizCache` from `roadmap.quizzes` on mount,
then only call the API for phases that have no cached quiz.

**Expected Outcomes:**
- When a user opens `QuizTab` for a roadmap that has `roadmap.quizzes` populated
  (from a prior PhaseDetailPage quiz generation), the quizzes appear immediately
  without an API call.
- `QuizTab` still generates new quizzes on-demand for phases with no saved quiz.
- Score history and attempt counts are preserved correctly.
- No duplicate API calls for already-generated quizzes.

**Todo List:**
1. In `QuizTab.tsx`, on component mount (`useEffect` with `[roadmap.id]` dependency),
   seed the `phaseQuizCache` state from `roadmap.quizzes` for any phase whose quiz
   is already stored: `setPhaseQuizCache(prev => { const seed = {}; Object.entries(roadmap.quizzes || {}).forEach(([phaseId, data]) => { seed[phaseId] = { questions: data.questions, phaseName: data.name, loading: false }; }); return { ...seed, ...prev }; })`.
2. In `QuizTab`'s quiz-generation logic (the `fetchOrCacheQuiz` or equivalent function),
   add an early-return check: if `phaseQuizCache[phaseId]?.questions?.length > 0`, skip
   the API call and use the cached data.
3. After a quiz is generated via the API in `QuizTab`, persist it back to `roadmap.quizzes`
   via `/api/update-roadmap` (matching what `PhaseDetailPage → QuizSection` does) so
   future loads are instant.
4. Verify `QuizTab`'s quiz list renders correctly with pre-seeded data on first render
   (no loading spinner for already-available quizzes).

**Relevant Context:**
- `src/components/QuizTab.tsx` lines 30–243 (main component + phase quiz cache logic)
- `src/components/PhaseDetailPage.tsx` lines 454–491 (`QuizSection → generateQuiz` — reference for persist pattern)
- `src/types.ts` line 96 (`Roadmap.quizzes: Record<string, { questions: any[]; name: string }>`)
- `src/server/routes/roadmaps.ts` lines 318–365 (update-roadmap endpoint)

---

## Sub-Task 8 — Wire SSE streaming + generation loading states

**Status:** `[x] done`

**Intent:**
`RoadmapGeneratorForm` already has full SSE streaming support built in — it reads
`/generate-roadmap-stream` events and animates phase names as they arrive. However,
`RoadmapContext.handleGenerateRoadmap` (the `onSubmit` fallback) still uses the plain
JSON endpoint. The form correctly uses `onRoadmapReady` (the stream path) when it is
provided, and falls back to `onSubmit` only when streaming fails.

The real gap is: `RoadmapContext.handleRoadmapReadyFromStream` receives the finished
roadmap JSON from the stream, but the form calls it directly — bypassing the
double-persist pattern that `handleGenerateRoadmap` uses (persist to DB + achievement
check + notification). `handleRoadmapReadyFromStream` does run the persist, but it
also calls `setIsAiGeneratingRoadmap(true)` which conflicts with `isStreaming` state
in the form (the spinner is already shown by the form).

This sub-task ensures the loading states are synchronized and the streaming path
generates the same notifications, achievements, and DB state as the non-streaming path.

**Expected Outcomes:**
- When generation starts (stream or non-stream), the generator form shows the
  animated phase-reveal panel (already implemented in `RoadmapGeneratorForm`).
- `isAiGeneratingRoadmap` in `RoadmapContext` is `true` during the stream AND
  during the DB persist phase (after `onRoadmapReady` fires).
- Achievement unlock and system notification fire identically on both paths.
- After the stream completes, the generator form is hidden and the roadmap
  overview is shown immediately.
- On streaming failure, the form gracefully falls back to the JSON endpoint
  with an error message shown to the user.

**Todo List:**
1. In `RoadmapContext.handleRoadmapReadyFromStream`, fix the `setIsAiGeneratingRoadmap(true)`
   at the top (line 150) — it should remain `true` (it was already set by the form's
   streaming start); don't set it again. Instead rely on the existing `true` state and
   only call `setIsAiGeneratingRoadmap(false)` in the `finally` block.
2. Ensure `handleRoadmapReadyFromStream` includes the `/api/validate-progression` call
   that `handleGenerateRoadmap` makes (currently missing from the stream path — add it
   after the DB persist, matching lines 210–216 in `handleGenerateRoadmap`).
3. In `RoadmapContext.handleGenerateRoadmap`, add an `else` branch: if the
   `RoadmapGeneratorForm` is using the stream path, `handleGenerateRoadmap` should
   not be called at all (the form handles the full flow). This is already the case
   by design — document it clearly with a comment.
4. In `RoadmapOverviewPage` and `RoadmapsTabContainer`, wherever `onRoadmapReady`
   is wired, confirm it calls `handleRoadmapReadyFromStream` (already correct in
   `AppRouter.tsx` line 206).
5. Add a `generationError` state display in the form's non-streaming fallback path
   that shows a user-readable message when both stream and JSON endpoints fail.

**Relevant Context:**
- `src/contexts/RoadmapContext.tsx` lines 149–181 (`handleRoadmapReadyFromStream`)
- `src/contexts/RoadmapContext.tsx` lines 183–227 (`handleGenerateRoadmap`)
- `src/components/RoadmapGeneratorForm.tsx` lines 63–148 (SSE stream + fallback logic)
- `src/router/AppRouter.tsx` lines 200–209 (RoadmapOverviewPage onRoadmapReady wiring)

---

## Sub-Task 9 — Phase completion celebration + next-phase unlock modal

**Status:** `[x] done`

**Intent:**
When the last lesson in a phase is marked complete, nothing happens — the user just
sees a progress bar update. The app already has `ConfettiParticles.tsx` and
`AchievementCelebration.tsx` components for exactly this purpose. A phase completion
event should trigger a celebration modal showing XP earned in that phase, the phase
name, and a "Unlock Phase N+1" CTA — making milestone moments feel earned.

This hook should live in `App.tsx → handleLessonComplete` where the server response
is available (`completionPercent`), or in `LearningWorkspace.tsx` where `onCompleteLesson`
is called. The phase-completion check is: after marking a lesson complete, check if
`calcPhaseProgress(phase)` is now 100.

**Design (confirmed): full-screen confetti overlay.**

**Expected Outcomes:**
- After the last lesson in a phase is completed, a full-screen overlay appears with:
  - `ConfettiParticles` animation covering the full viewport
  - Centered card: phase name + "Phase Complete!" heading, total XP earned in the phase
    (sum of all lesson `xpReward` values), and a trophy/star icon
  - Primary "Continue to Phase N+1 →" button (or "View Your Progress" if last phase)
  - Subtle "Dismiss" text link below the button
- Dismissible via Dismiss link, Continue button, or pressing ESC key.
- No double-trigger: if the phase was already 100% before this session, no modal fires.
- The celebration fires at most once per `phaseId` per browser session.

**Todo List:**
1. In `App.tsx` (or wherever `handleLessonComplete` lives), after a successful
   `/api/complete-lesson` response, check if the completed lesson's phase is now 100%
   complete by calling `calcPhaseProgress` on the updated in-memory phase object.
2. If `calcPhaseProgress(updatedPhase) === 100` and the phaseId is NOT in a
   `celebratedPhasesRef` (a `useRef<Set<string>>`), fire the celebration.
3. Pass a `onPhaseComplete: (phase: Phase, nextPhase: Phase | null) => void` callback
   down to `LearningWorkspace` via `onCompleteLesson`, or handle it in `App.tsx`
   directly after the lesson complete callback.
4. Create a new `PhaseCompletionModal` component (new file
   `src/components/PhaseCompletionModal.tsx`) that accepts `phase`, `nextPhase`,
   `xpEarned`, `onContinue`, `onDismiss`. Inside, render `ConfettiParticles` and
   an animated card with phase stats.
5. Render `PhaseCompletionModal` in `App.tsx` or `AppRouter.tsx` at the top level,
   controlled by a `completionModalData` state (null = hidden).
6. Add `phaseId` to `celebratedPhasesRef` after the modal is shown to prevent re-trigger.

**Relevant Context:**
- `src/components/ConfettiParticles.tsx` (existing celebration component)
- `src/components/AchievementCelebration.tsx` (reference for modal overlay pattern)
- `src/lib/roadmapUtils.ts` `calcPhaseProgress`, `isPhaseComplete`
- `src/App.tsx` `handleLessonComplete` section
- `src/types.ts` `Phase` type

---

## Sub-Task 10 — AI Insights Tab: wire live data + AI narrative summary

**Status:** `[x] done`

**Intent:**
`AIInsightsTab.tsx` is already a well-built component with charts (velocity, weekly
activity, skill radar) and a static `generateInsightsData()` function in `lib/insights.ts`.
It is already correctly rendered in `AppRouter.tsx` at line 185 when `roadmapDetailTab === 'insights'`.

The main gap is that `generateInsightsData` is entirely local/static — it computes
predictions and skill mastery from `activityLog` and `roadmap` data that may be sparse
for new users (shows "Not enough history yet"). The AI Insights tab also needs to be
reachable from the roadmap overview — currently the tab is only accessible if
`roadmapDetailTab` is set to `'insights'`, but there is no visible tab button on
`RoadmapOverviewPage` that does this.

This sub-task wires a navigation path to the Insights tab and adds an AI-generated
narrative paragraph (fetched once per roadmap per session, cached) to the existing
`AIInsightsTab`.

**Expected Outcomes:**
- The `RoadmapOverviewPage` header area has a small "AI Insights" button (icon + label)
  that switches `roadmapDetailTab` to `'insights'` and navigates to the tab.
- `AIInsightsTab` shows a new "AI Mentor Summary" card at the top with 2–3 sentences
  generated by Groq about the user's progress (e.g. "You're 40% through Phase 2.
  Your strongest area is React fundamentals. Focus on state management next.").
- The summary is fetched from a new server endpoint `POST /api/ai-summary` (reuses
  existing `/generate-topic-overview` pattern) and cached in component state for the
  session (no re-fetch on tab switch).
- If the API call fails, the summary card is not shown (graceful degradation).
- The existing charts and stat cards continue to work as before.

**Todo List:**
1. Add a new server route `POST /api/ai-summary` in `src/server/routes/ai.ts` that
   accepts `{ roadmapGoal, progressPercent, completedLessons, totalLessons, activePhase,
   topSkills }` and returns a `{ summary: string }`. Build a short focused prompt
   (100-word target response). Cache with the existing `recCache` pattern.
2. In `AIInsightsTab.tsx`, add a `summary` state (string | null) and `summaryLoading`
   state. On mount (or when `roadmap.id` changes), POST to `/api/ai-summary` with
   the roadmap stats. Show a 1-line skeleton while loading; render the summary text
   in a styled card with a `BrainCircuit` icon when ready.
3. In `RoadmapOverviewPage.tsx`, add an `onViewInsights?: () => void` prop. Render
   a small "View AI Insights →" link button at the bottom-right of the hero banner
   (near the stats row). On click, call `onViewInsights()`.
4. In `AppRouter.tsx`, when rendering `RoadmapOverviewPage`, pass
   `onViewInsights={() => setRoadmapDetailTab('insights')}`.
5. Import and call `setRoadmapDetailTab` from `useRoadmaps()` in `AppRouter.tsx`
   (it is already destructured from context at line 91 — just not passed down yet).

**Relevant Context:**
- `src/components/AIInsightsTab.tsx` (full component — add summary card at top)
- `src/components/RoadmapOverviewPage.tsx` (add onViewInsights prop + button)
- `src/router/AppRouter.tsx` lines 200–209 (RoadmapOverviewPage render)
- `src/server/routes/ai.ts` lines 193–259 (ai-recommendations — reference pattern)
- `src/lib/insights.ts` (`generateInsightsData` — for available data shape)
- `src/contexts/RoadmapContext.tsx` line 17 (`roadmapDetailTab` + `setRoadmapDetailTab`)

---

## Implementation Notes

- Sub-tasks 1–4 address correctness; complete them first before the feature sub-tasks.
- Sub-tasks 5–7 are independent of each other and can be done in any order after 1–4.
- Sub-task 8 (streaming) has no dependencies and can be done in parallel with 5–7.
- Sub-tasks 9–10 are the most additive and should be done last.
- After completing all sub-tasks, run `pnpm typecheck` and `pnpm test` to validate
  no regressions. Pay particular attention to the Resources tab data path (sub-task 2)
  and the Projects tab phase-linking (sub-task 6) which involve prop interface changes.
- Do NOT modify `audit-fixes-plan.md` — all items there are already `done`.
