# LearnPath AI — Fixes & Refactor Plan

## Overview

This plan addresses all 7 confirmed issues from the codebase audit, in execution order. Sub-tasks 1–4 are user-facing fixes (fast, isolated, high trust impact). Sub-task 5 completes the Drizzle schema migration. Sub-task 6 decomposes App.tsx into a modular architecture. Sub-task 7 adds test coverage alongside and after the above changes.

Each sub-task is designed to be implemented independently, keeping the app runnable after every step.

---

## Sub-Task 1 — Quiz Source Label in UI

**Status:** `[ ] pending`

### Intent
The `source: 'seed' | 'ai'` prop is already tracked in `QuizTab.tsx` and passed to `ActiveQuiz`, but is never rendered. A student on a JavaScript or DevOps roadmap silently receives generic Python/Math/LLM seed questions that look identical to a personalized quiz. This adds a label so the student always knows what they are looking at.

### Expected Outcomes
- When a quiz is AI-generated, a small "Tailored to your roadmap" label appears in the quiz UI.
- When a quiz falls back to seed questions, a "General practice quiz" label appears instead.
- No existing quiz functionality changes — only a visual label is added.

### Todo List
1. In `src/components/QuizTab.tsx`, locate the `ActiveQuiz` component's JSX return (lines 427–491).
2. Add a source label near the quiz title. Use the existing badge pattern from line 334 (a small `<span>` with an icon). "Tailored to your roadmap" for `source === 'ai'`, "General practice" for `source === 'seed'`.
3. Pick icons that already exist in the file's imports (e.g. `Brain` for AI, `BookOpen` for seed).
4. No new component or file needed — inline JSX inside `ActiveQuiz`.

### Relevant Context
- `src/components/QuizTab.tsx` — `ActiveQuiz` component at lines 389–491, prop `source` received at line 391.
- Existing badge pattern at line 334: `<span className="text-xs text-blue-400 font-bold flex items-center gap-2">`.
- Score badge pattern at lines 337–340 for color-coding reference.
- `src/components/Badges.tsx` — existing `XPBadge`, `StreakBadge`, `TierBadge` — do not use these, they are not semantically appropriate here.

---

## Sub-Task 2 — Streak Grace Period

**Status:** `[ ] pending`

### Intent
The `updateStreak()` function resets to 1 the moment a user misses a single day. This is a documented dropout driver. Adding a configurable grace window (default: 1 day) means a user who misses one day does not lose their streak; missing two consecutive days resets as before.

### Expected Outcomes
- Missing 1 day preserves the streak.
- Missing 2 or more consecutive days resets the streak to 1.
- No new database column is required (the grace window is a pure logic change, not persisted state).
- The change is backwards-compatible — existing streaks are unaffected.

### Todo List
1. Open `src/server/lib/db.ts`, locate `updateStreak()` at lines 237–270.
2. Change the reset condition: instead of resetting when `lastActiveDate < yesterdayStr`, compute a `twoDaysAgoStr` and only reset when `lastActiveDate < twoDaysAgoStr`.
3. The `streak + 0` (no increment, no reset) case for the grace day is implicit — the streak is simply not updated but also not reset.
4. Update the same logic in the Drizzle equivalent once Sub-Task 5 is complete (note this dependency in the plan; implement the Drizzle version as part of Sub-Task 5).

### Relevant Context
- `src/server/lib/db.ts` — `updateStreak()` lines 237–270.
- Columns involved: `streak INTEGER`, `last_active_date DATE` (lines 49–50 in db.ts and `drizzle/schema.ts:353`).
- No `streakFreezes` column exists in either schema — no DDL change needed.

---

## Sub-Task 3 — Roadmap Generation Error State

**Status:** `[ ] pending`

### Intent
When all 7 AI model fallbacks are exhausted, `RoadmapGeneratorForm.tsx` silently resets to idle — the SSE catch block only calls `console.warn()`, clears state, and falls through. The parent `App.tsx` emits a brief toast, but the form itself shows no persistent error. A persistent inline error state is needed inside the form so the user clearly understands what happened and can retry.

### Expected Outcomes
- When SSE stream fails AND the legacy `onSubmit()` fallback also fails, the form renders an inline error message (not just a toast).
- The error state is dismissible or clears when the user starts typing a new goal.
- The form does not silently appear to have "cleared" — the user's goal input should remain populated so they can retry without re-typing.
- If the user manually cancels (AbortError), the form resets normally — no error shown.

### Todo List
1. Add an `error` state variable to `RoadmapGeneratorForm` (e.g. `const [generationError, setGenerationError] = useState<string | null>(null)`).
2. In the SSE catch block (line 131): do not clear the error state yet — let it fall through to `onSubmit`.
3. Wrap the `await onSubmit(params)` call in its own try/catch. On failure, set `generationError` to a user-facing message ("Roadmap generation failed. Check your connection and try again.") and do NOT clear the goal input.
4. Render `generationError` as an inline error block below the form's submit button, using the existing error pattern from line 355 (`bg-red-500/10 border border-red-500/20`).
5. Clear `generationError` when the user modifies the goal input (`onChange` on the goal field).
6. Keep the `onCancel` / AbortError path unchanged — it should still reset cleanly.

### Relevant Context
- `src/components/RoadmapGeneratorForm.tsx` — catch block at lines 124–143, state declarations at lines 38–46, loading JSX at lines 279–320.
- Existing error pattern at line 355: `<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">`.
- Props interface at lines 13–21: `onSubmit` is `async`, already throws on failure.
- The form is used inside `RoadmapsTabContainer` (lines 73–84), which wraps `onSubmit` with `setShowGenerator(false)` — this means the error must be caught inside the form itself before the parent closes it.

---

## Sub-Task 4 — Fallback Transparency for Projects & Resources

**Status:** `[ ] pending`

### Intent
`ProjectsTab` and `ResourcesTab` silently substitute AI-generated content with seed/static fallback data when generation fails. The student cannot distinguish personalized from generic content. A minimal inline indicator ("Showing general suggestions — AI generation unavailable") is sufficient.

### Expected Outcomes
- When `ProjectsTab` uses `roadmap.projects` (fallback), a small banner or inline note appears above the project list.
- When `ResourcesTab` uses `getRecommendationsForRoadmap()` instead of AI resources, a similar note appears.
- When AI content loads successfully, no banner is shown.
- The indicator is unobtrusive — a single line of text, not a modal or blocking state.

### Todo List
1. In `src/components/ProjectsTab.tsx`, add a boolean state `isUsingFallback` (default `false`).
2. In the catch block at line 54, set `isUsingFallback = true` alongside the existing `console.warn`.
3. In the JSX, render a one-line note above the project list when `isUsingFallback` is true. Use the existing muted text style (e.g. `text-xs text-zinc-500`).
4. In `src/components/ResourcesTab.tsx`, add the same `isUsingFallback` state.
5. In the else branch at line 36 (where `getRecommendationsForRoadmap()` is called), set `isUsingFallback = true`.
6. Render the same one-line note in the resources list header area.

### Relevant Context
- `src/components/ProjectsTab.tsx` — fallback logic at lines 54–60.
- `src/components/ResourcesTab.tsx` — fallback logic at lines 33–38.
- No shared component needed — a plain inline `<p>` or `<span>` with muted styling is sufficient.

---

## Sub-Task 5 — Complete Drizzle Schema Migration

**Status:** `[ ] pending`

### Intent
Two database schema systems coexist: `src/server/db/schema.ts` (1,691 lines of raw Neon SQL, actively used at runtime) and `drizzle/schema.ts` (358 lines, a prepared migration target not used at runtime). The goal is to make Drizzle ORM the single source of truth, remove the legacy raw SQL schema file, and route all database access through Drizzle. No data is lost; the migration is applied against the existing live database.

### Expected Outcomes
- `drizzle/schema.ts` is the only schema definition file.
- All 37 exported functions from `src/server/db/schema.ts` are re-implemented as Drizzle query functions (or equivalent Drizzle ORM equivalents).
- `src/server/lib/db.ts` is updated: `updateStreak()` and `getCurrentStreak()` use Drizzle queries (incorporating the grace period from Sub-Task 2).
- `server.ts` and `src/server/routes/auth.ts` (the only two files that import from `src/server/db/schema`) are updated to import from the new Drizzle-based module.
- A Drizzle migration is generated to cover any schema drift (e.g. `streak`, `last_active_date` columns present in the live DB but missing from `drizzle/schema.ts`).
- `src/server/db/schema.ts` is deleted after parity is verified.
- The `db:generate` and `db:migrate` scripts in `package.json` are the only migration path going forward.

### Todo List
1. **Audit schema drift:** Compare every table and column in `src/server/db/schema.ts` against `drizzle/schema.ts`. Identify any columns present in the raw SQL but missing from Drizzle (confirmed gap: `streak` and `last_active_date` on the `users` table — check if migration `0002` already covers these).
2. **Update `drizzle/schema.ts`:** Add any missing columns to the Drizzle schema definition.
3. **Generate a migration:** Run `npm run db:generate` to produce a new migration file for schema drift. Review the generated SQL before applying.
4. **Create `src/server/db/drizzle.ts`:** A new file that initializes the Drizzle client (using `drizzle-orm/neon-http` or `neon-serverless` — match the existing Neon driver in `src/server/lib/db.ts`) and exports the `db` instance.
5. **Port all 37 functions:** Create `src/server/db/queries.ts` (or equivalent groupings). Port each function from `src/server/db/schema.ts` to use Drizzle's query builder. Maintain the exact same function signatures so callers do not change. Key functions to port: all `upsert*`, `get*`, `create*`, `delete*`, `migrate*`, `reconstruct*`, `complete*`, `unlock*`, `recompute*` functions.
6. **Port `updateStreak()` and `getCurrentStreak()`:** Implement in Drizzle queries, incorporating the 1-day grace period from Sub-Task 2.
7. **Update `server.ts`:** Replace the import of `ensureRoadmapTables` from `src/server/db/schema` with the Drizzle equivalent (Drizzle handles table creation via migrations — `ensureRoadmapTables()` becomes a no-op or is removed).
8. **Update `src/server/routes/auth.ts`:** Replace the import of `getUserRoadmapsReconstructed` with the Drizzle-based version.
9. **Smoke test:** Run the existing test suite (`npm test`) to confirm no regressions. Manually verify roadmap creation, lesson completion, and streak update flows.
10. **Delete `src/server/db/schema.ts`:** Only after step 9 passes.

### Relevant Context
- `src/server/db/schema.ts` — 37 exported functions, lines 286–1,691.
- `drizzle/schema.ts` — 12 tables defined, lines 28–357.
- `drizzle/migrations/0002_add_email_verified.sql` — adds `streak` integer; verify if `last_active_date` is also covered.
- `drizzle.config.ts` — already configured, pointing to `./drizzle/schema.ts` and outputting to `./drizzle/migrations`.
- `src/server/lib/db.ts` — contains `updateStreak()` and `getCurrentStreak()` in raw SQL.
- Only two import sites: `server.ts:21` and `src/server/routes/auth.ts:5`.
- The Drizzle ORM package and `drizzle-kit` are already installed (confirmed by `package.json` `db:generate` and `db:migrate` scripts).

---

## Sub-Task 6 — App.tsx Full Decomposition

**Status:** `[ ] pending`

### Intent
`App.tsx` is 1,818 lines handling 11+ distinct concerns in a single component. This creates a high regression risk for every change. The goal is a full decomposition into separate context providers, a router, and a thin `App.tsx` shell. The app must remain runnable after every individual extraction step.

### Expected Outcomes
- `App.tsx` is reduced to a thin shell (~100–150 lines) that composes providers and a router.
- Each concern lives in its own file under `src/contexts/` or `src/hooks/`.
- No functionality changes — this is purely structural.
- All existing lazy-loaded routes continue to work.
- The existing test suite passes after each step.

### Todo List
Each step below must leave the app in a runnable state before proceeding to the next.

**Step 1 — Auth Context**
- Create `src/contexts/AuthContext.tsx`.
- Move all auth state from App.tsx: `isAuthenticated`, `isLoadingAuth`, `profile`, `settings`, `authEmail`, `authPassword`, `authName`, `authMode`, `authError`, `isAuthenticating`, `forgotPasswordMode`, `forgotEmail`, `forgotStatus`, `resetToken`, `resetPassword`, `resetStatus`, `showAuthModal`, `redirectAfterLogin`.
- Move all auth-related `useEffect` hooks and handler functions (login, logout, signup, password reset).
- Export `AuthProvider` and `useAuth` hook.
- Wrap the app in `<AuthProvider>` in App.tsx and replace all direct state references with `useAuth()`.

**Step 2 — Roadmap Context**
- Create `src/contexts/RoadmapContext.tsx`.
- Move: `roadmaps`, `activeRoadmapId`, `roadmapProgress`, `isAiGeneratingRoadmap`, and all roadmap mutation handlers (`generateRoadmap`, `deleteRoadmap`, `updateRoadmap`, etc.).
- Export `RoadmapProvider` and `useRoadmaps` hook.
- Wrap the app in `<RoadmapProvider>` and update all consumer components.

**Step 3 — UI State Context**
- Create `src/contexts/UIContext.tsx`.
- Move: `activeTab`, `isSidebarOpen`, `activeLesson`, `activeToast`, `confirmDeleteId`, `unlockedAchievement`, `showAiOfflineBanner`, `aiActive`, and their handler functions.
- Move toast helper `showToast()`.
- Export `UIProvider` and `useUI` hook.

**Step 4 — PWA & Notifications Context**
- Create `src/contexts/PWAContext.tsx` (or extend `src/lib/usePWA.ts` if it already returns enough).
- Move: `showOnlineToast`, `wasOffline`, `verifiedStatus`, `notifications`, `showOnboarding`, PWA-related `useEffect` hooks, and the AI health check `useEffect`.
- Export `PWAProvider` and `usePWAContext` hook.

**Step 5 — Router**
- Create `src/router/AppRouter.tsx`.
- Move the `renderTabContent()` function and all lazy import declarations from App.tsx into this file.
- `AppRouter` accepts props from contexts via hooks (not prop drilling).
- App.tsx renders `<AppRouter />` directly.

**Step 6 — Thin App.tsx shell**
- After steps 1–5, App.tsx should only: import and compose all providers in order, render `<AppRouter />`, render the global overlay layer (Toast, ConfirmDialog, AchievementCelebration, FeedbackWidget, LegalPages).
- Target: ~100–150 lines.

### Relevant Context
- `src/App.tsx` — 1,818 lines; state declarations at lines 183–285; `renderTabContent()` function contains all route-to-component mapping; return JSX at lines 1708–1815.
- `src/hooks/useAnalytics.ts` and `src/hooks/useReducedMotion.ts` — only existing hooks; follow the same pattern for new hooks.
- No existing Context files — this is a greenfield extraction.
- `src/components/Navigation.tsx` exports `MobileHeader`, `BottomNavigation`, `SideDrawer` — these will consume the new `useUI` hook.
- All lazy-loaded component imports at App.tsx lines 25–64 move to `AppRouter.tsx`.

---

## Sub-Task 7 — Test Coverage

**Status:** `[ ] pending`

### Intent
The test suite has 351 lines across 4 server-only test files. Zero component tests exist. The streak logic, AI fallback chain, quiz source behavior, and all UI error paths are unguarded. New tests should be added alongside and after the fixes above, targeting the specific behaviors changed.

### Expected Outcomes
- `updateStreak()` grace period logic is covered by unit tests.
- The quiz source label rendering is covered by a component test.
- Roadmap generation error state (inline error after full failure) is covered.
- Project and resource fallback state rendering is covered.
- The Drizzle query functions ported in Sub-Task 5 have unit tests for their core operations.
- `vitest.config.ts` is updated to include component test files.

### Todo List
1. **Install `@testing-library/react` and `jsdom`:** Add to `devDependencies`. Update `vitest.config.ts` to add a second test environment entry for component tests (`environment: 'jsdom'`).
2. **Test `updateStreak()` grace period:** Add to `src/server/__tests__/` a new file `streak.test.ts`. Test cases: same-day call (no change), yesterday call (increment), one-day gap (grace — no reset), two-day gap (reset to 1).
3. **Test quiz source label:** Create `src/components/__tests__/QuizTab.test.tsx`. Mount `ActiveQuiz` with `source="seed"` and assert the "General practice" label is visible. Mount with `source="ai"` and assert "Tailored to your roadmap" label is visible.
4. **Test roadmap generation error state:** Create `src/components/__tests__/RoadmapGeneratorForm.test.tsx`. Mock `onSubmit` to throw. Submit the form. Assert the inline error message is rendered and the goal input retains its value.
5. **Test fallback indicators:** Create `src/components/__tests__/ProjectsTab.test.tsx` and `ResourcesTab.test.tsx`. Mock the fetch to fail. Assert the fallback indicator text appears.
6. **Test Drizzle query functions (Sub-Task 5 dependency):** After Sub-Task 5, add `src/server/__tests__/queries.test.ts` covering the core functions: `upsertRoadmap`, `getRoadmapsByOwner`, `completeLessonForUser`, `updateStreak`.
7. Update `vitest.config.ts` `include` pattern to cover both `src/server/__tests__/**/*.test.ts` and `src/components/__tests__/**/*.test.tsx`.

### Relevant Context
- `vitest.config.ts` — current config at lines 1–17; `environment: 'node'` only, no jsdom.
- `src/server/__tests__/setup.ts` — existing global setup for server tests; do not modify, add a separate setup for component tests.
- `src/server/__tests__/mockDb.ts` — mock database utilities; can be reused for Drizzle query tests with appropriate adaptation.
- Testing framework is Vitest — not Jest. Use `vi.fn()`, `vi.mock()`, and `vi.spyOn()`.
- `@testing-library/react` is not yet installed — must be added before component tests can run.

---

## Execution Order & Dependencies

```
Sub-Task 1 (quiz label)          — no dependencies
Sub-Task 2 (streak grace)        — no dependencies
Sub-Task 3 (roadmap error state) — no dependencies
Sub-Task 4 (fallback banners)    — no dependencies
         ↓
Sub-Task 5 (Drizzle migration)   — incorporates Sub-Task 2 Drizzle port
         ↓
Sub-Task 6 (App.tsx decomp)      — safe to run after Sub-Task 5 (stable schema)
         ↓
Sub-Task 7 (tests)               — runs alongside all above, finalized after Sub-Task 6
```

Sub-Tasks 1–4 are fully independent and can be implemented in any order. Sub-Task 5 must complete before Sub-Task 6 (to avoid migrating App.tsx while db layer is in flux). Sub-Task 7 is ongoing but its Drizzle query tests depend on Sub-Task 5 being complete.
