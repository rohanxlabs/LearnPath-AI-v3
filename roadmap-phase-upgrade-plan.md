# Roadmap Phase-Wise Upgrade Plan

## Overview

This plan upgrades the roadmap system from a flat module timeline into a structured,
phase-first learning experience. When a user selects a roadmap they land on a
**Roadmap Overview page** showing overall stats and all phases as cards. Tapping a
phase card navigates to a **Phase Detail page** that hosts that phase's modules,
lessons, resources, quiz, and project — all in one focused view. Phases are always
visible but only the current phase is unlocked; subsequent phases unlock only when
the current phase reaches 100% (all lessons + quiz + project complete).

The implementation is mobile-first, reuses all existing design tokens
(buttonStyles, glassCardClass, motionTokens from `src/styles/theme.ts`), and avoids
breaking the existing `LearningWorkspace` lesson-play flow.

---

## Navigation Architecture (new)

```
Roadmaps tab
  └─ [no selected roadmap]  → RoadmapsList  (existing, unchanged)
       └─ Generate New Roadmap form  (existing, unchanged)
  └─ [roadmap selected]     → RoadmapOverviewPage  (NEW)
       ├─ Overall stats hero  (goal, progress %, XP, estimated completion)
       ├─ "Continue Learning" CTA  (jumps to active lesson in workspace)
       └─ Phase cards grid  (all phases, locked/unlocked state)
            └─ [phase tapped]  → PhaseDetailPage  (NEW)
                 ├─ Phase header  (name, description, skills, estimated hrs)
                 ├─ Progress summary  (lessons done, quiz done, project done)
                 ├─ Modules accordion  (levels → lessons, existing ModuleCard)
                 ├─ Resources section  (phase-scoped, from module resources)
                 ├─ Quiz section  (existing QuizTab logic, phase-scoped)
                 └─ Project section  (phase project from roadmap.phases[].projects)
```

State held in `App.tsx`:
- `selectedRoadmapId`  — which roadmap is open  (already exists)
- `selectedPhaseId`    — which phase detail page is open  (NEW, add to App.tsx)

---

## Sub-Tasks

---

### Sub-Task 1 — Shared Utility: `src/lib/roadmapUtils.ts`

**Status:** [x] done

**Intent**
Extract reusable pure functions so every component can compute phase completion,
estimated time, and unlock eligibility from the same logic. Eliminates duplicate
`generateMentorAnalysis` in `RoadmapOverview.tsx` and `RoadmapsTabContainer.tsx`.

**Expected Outcomes**
- `src/lib/roadmapUtils.ts` created with exported utility functions.
- Both `RoadmapOverview.tsx` and `RoadmapsTabContainer.tsx` import from it (no
  duplicate code remains).

**Todo List**
1. Create `src/lib/roadmapUtils.ts`.
2. Add `calcPhaseProgress(phase: Phase): number` — percentage of lessons completed
   inside a phase.
3. Add `isPhaseComplete(phase: Phase): boolean` — all lessons completed AND
   `phase.progress === 100`.
4. Add `calcPhaseEstimatedMinutes(phase: Phase): number` — sum of
   `lesson.estimatedMinutes` (default 20 if missing) across all levels.
5. Add `calcEstimatedCompletionWeeks(roadmap: Roadmap): number | null` — uses
   `roadmap.weeklyHours` and remaining lesson minutes; returns null if no data.
6. Add `getPhaseUnlockStatus(phases: Phase[], phaseIndex: number): 'unlocked' | 'locked' | 'completed'`
   — Phase 0 is always unlocked. Phase N is unlocked only when Phase N-1 is
   complete (`isPhaseComplete` returns true). A phase where all lessons are
   completed is 'completed'.
7. Add `generateMentorAnalysis(roadmap, profile)` — move from both view components.
8. Remove the duplicate `generateMentorAnalysis` from `RoadmapOverview.tsx` and
   `RoadmapsTabContainer.tsx`, import from utils instead.

**Relevant Context**
- Duplicate function: `src/components/RoadmapOverview.tsx` lines 11–44
- Duplicate function: `src/components/RoadmapsTabContainer.tsx` lines 26–58
- Phase type: `src/types.ts` lines 69–79
- Roadmap type: `src/types.ts` lines 81–96

---

### Sub-Task 2 — `RoadmapOverviewPage` component

**Status:** [x] done

**Intent**
New full-page component shown when a user selects a roadmap from the list. Replaces
the current `RoadmapsTabContainer` detail view (Header + Progress + XPCard +
RoadmapTimeline + MilestonesCard). Shows a rich hero with overall stats and a grid
of phase cards. Tapping a phase card calls `onSelectPhase(phaseId)`.

**Expected Outcomes**
- `src/components/RoadmapOverviewPage.tsx` exists and renders:
  - Hero banner: roadmap goal, experience level badge, overall progress bar,
    XP earned, estimated completion weeks, "Continue Learning" primary CTA.
  - Phase cards grid (1-col mobile, 2-col tablet+):
    - Each card: phase number badge, phase name, description (1 line truncated),
      difficulty badge, estimated hours, skill tag pills (up to 4, +N more),
      progress bar (% lessons complete), unlock state overlay for locked phases.
    - Locked phase card: shows a padlock icon overlay and "Complete Phase N first"
      label; skills and estimated hours remain visible to show what's coming.
    - Completed phase card: shows a green checkmark badge.
    - Active (current) phase card: purple highlight border, "In Progress" badge.
  - "Generate New Roadmap" button at the bottom.
- Component is fully responsive (mobile-first).
- All Framer Motion animations use existing `animationVariants` / `springPresets`
  from `src/styles/theme.ts`.

**Todo List**
1. Create `src/components/RoadmapOverviewPage.tsx`.
2. Accept props: `roadmap: Roadmap`, `profile: UserProfile`,
   `onSelectPhase: (phaseId: string) => void`,
   `onContinueLearning: () => void`,
   `onGenerateRoadmap: (params) => Promise<void>`,
   `isGenerating: boolean`.
3. Build the hero section using `RoadmapHeader` styles (gradient from indigo to
   purple, white text). Show: goal, experienceLevel badge, progress ring or bar,
   totalXp, `calcEstimatedCompletionWeeks` output, "Continue Learning" button.
4. Build phase cards using `getPhaseUnlockStatus` from roadmapUtils.
5. Each phase card shows: number, name, description, difficulty badge, estimated
   hours from `calcPhaseEstimatedMinutes`, skill tags, `calcPhaseProgress`
   progress bar, status overlay.
6. Clicking an unlocked or completed phase card → `onSelectPhase(phase.id)`.
7. Clicking a locked phase card → show a brief toast-style message inline ("Finish
   Phase N to unlock") — no navigation.
8. Include the existing `Generate New Roadmap` button and form (import
   `RoadmapGeneratorForm` created in sub-task 5, or inline the existing form
   for now — mark with TODO if sub-task 5 is not done yet).
9. Export as named export.

**Relevant Context**
- Existing RoadmapHeader design: `src/components/RoadmapHeader.tsx` (gradient hero)
- Existing RoadmapProgress: `src/components/RoadmapProgress.tsx` (progress bar)
- Existing XPCard: `src/components/XPCard.tsx`
- Phase type fields: `src/types.ts` lines 69–79
- `glassCardClass`, `buttonStyles`, `animationVariants`: `src/styles/theme.ts`

---

### Sub-Task 3 — `PhaseDetailPage` component

**Status:** [x] done

**Intent**
New full-page component for a single phase. Hosts: phase header, progress summary
ring, module accordion, phase resources, phase quiz, and phase project. This is the
main learning interface replacing the flat `RoadmapTimeline`.

**Expected Outcomes**
- `src/components/PhaseDetailPage.tsx` exists and renders a complete phase view.
- Back button returns to `RoadmapOverviewPage`.
- Modules accordion uses the existing `ModuleCard` component — no changes to
  `ModuleCard.tsx`.
- Resources section shows `level.resources` from every module in the phase
  (these are already generated by AI and stored in the roadmap JSON).
- Quiz section: a single "Take Phase Quiz" button that triggers the existing
  `generatePhaseQuiz` / `handlePhaseQuizStart` logic already in `QuizTab.tsx`;
  for now embed a minimal inline quiz trigger that calls the same API.
- Project section: renders `phase.projects[0]` (the primary phase project) using
  the existing `ProjectCard` component.
- Locked phase: shows a full-page locked overlay with phase name, skills preview,
  and "Complete Phase N to unlock" message — the rest of the content is blurred
  behind it.

**Todo List**
1. Create `src/components/PhaseDetailPage.tsx`.
2. Accept props: `roadmap: Roadmap`, `phase: Phase`, `phaseIndex: number`,
   `unlockStatus: 'unlocked' | 'locked' | 'completed'`,
   `onBack: () => void`,
   `onLessonClick: (phaseId, levelId, lessonId) => void`,
   `onAddXp: (amount: number) => void`,
   `onRoadmapUpdated?: () => void`.
3. Build phase header: back button, phase name, description, difficulty badge,
   estimated hours, skill tag pills.
4. Build a 3-stat row below header: "X/Y Lessons", "Quiz" (done/not), "Project"
   (% progress). These are the three completion gates.
5. Build modules accordion section using existing `ModuleCard` — map over
   `phase.levels`, auto-expand the first non-completed module.
6. Build resources section: collect `level.resources` from all levels in the
   phase. Render as a simple list of resource link cards (icon, title, provider,
   URL, type badge). Reuse the same card style as `ResourcesTab` resource cards.
7. Build quiz section: display a `QuizCard`-style card for this phase. If
   `roadmap.quizzes[phase.id]` exists, show score and "Re-take" button. Otherwise
   show "Generate Quiz" button that calls `POST /api/generate-quiz` with
   `{ topicName: phase.name + ': ' + phase.skillsCovered.join(', ') }`.
8. Build project section: if `phase.projects && phase.projects.length > 0`, render
   the first project using `ProjectCard`. Pass `onUpdateProgress` that calls
   `POST /api/update-roadmap`.
9. If `unlockStatus === 'locked'`, render the locked overlay on top of a blurred
   version of the content (use `filter: blur(4px)` + overlay div). Show lock icon,
   phase name, skills list, and "Complete the previous phase to unlock this one."
10. Export as named export.

**Relevant Context**
- Existing `ModuleCard`: `src/components/ModuleCard.tsx`
- Existing `ProjectCard`: `src/components/ProjectCard.tsx`
- Phase resources: `roadmap.phases[].levels[].resources` (generated by AI at
  curriculum build time, type: `{ id, title, type, provider, url, description }[]`)
- Quiz API: `POST /api/generate-quiz` with `{ topicName: string }` returns
  `Question[]`
- Roadmap update API: `POST /api/update-roadmap` with `{ roadmapId, updates }`
- QuizTab logic reference: `src/components/QuizTab.tsx` lines 101–152

---

### Sub-Task 4 — Wire new pages into `RoadmapsTabContainer` and `App.tsx`

**Status:** [x] done

**Intent**
Replace the current detail view inside `RoadmapsTabContainer` (which renders
`RoadmapHeader + RoadmapProgress + XPCard + RoadmapTimeline + MilestonesCard`)
with `RoadmapOverviewPage`. Add `selectedPhaseId` state to `App.tsx` and thread
the `onSelectPhase` / `onBack` callbacks through the component tree.

**Expected Outcomes**
- Selecting a roadmap → `RoadmapOverviewPage` (new component) renders.
- Tapping a phase card → `PhaseDetailPage` renders for that phase.
- Back button on `PhaseDetailPage` → returns to `RoadmapOverviewPage`.
- Back button on `RoadmapOverviewPage` → returns to `RoadmapsList`.
- Lesson clicks inside `PhaseDetailPage` → still navigate to `LearningWorkspace`
  exactly as before (the `onLessonClick` prop chain is unchanged).
- The `roadmapDetailTab` switching (resources/quiz/projects/insights tabs in
  `App.tsx` lines 1265–1359) is unchanged — those tabs still work on the selected
  roadmap.

**Todo List**
1. In `App.tsx`, add `const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)`.
2. Reset `selectedPhaseId` to `null` whenever `selectedRoadmapId` changes
   (inside the `onSelectRoadmap` handler and `handleDeleteRoadmap`).
3. Update the `case 'roadmaps'` render block in `App.tsx` `renderTabContent()`:
   - If `selectedRoadmapId && selectedPhaseId`: render `PhaseDetailPage`.
   - If `selectedRoadmapId && !selectedPhaseId`: render `RoadmapOverviewPage`.
   - If `!selectedRoadmapId`: render existing `RoadmapsTabContainer` list view.
4. Pass `onSelectPhase={(id) => setSelectedPhaseId(id)}` down to
   `RoadmapOverviewPage`.
5. Pass `onBack={() => setSelectedPhaseId(null)}` to `PhaseDetailPage`.
6. Pass `onBack={() => setSelectedRoadmapId(null)}` to `RoadmapOverviewPage`.
7. Lazy-import both new components in `App.tsx` using the existing `lazy()` pattern.
8. In `RoadmapsTabContainer.tsx`, the component now ONLY handles the list view
   (`selectedRoadmapId === null` branch). Remove the detail view branch (lines
   244–298) — it is replaced by `RoadmapOverviewPage` rendered directly in
   `App.tsx`. Keep the generator form and `RoadmapsList` in this component.
9. After roadmap generation, set `selectedRoadmapId` to the new roadmap ID AND
   `selectedPhaseId` to null (so user lands on the new `RoadmapOverviewPage`).
   This already happens at `App.tsx` line 779 — verify it still works.

**Relevant Context**
- App state: `App.tsx` lines 380–381 (`roadmapDetailTab`, `selectedRoadmapId`)
- Roadmaps case render block: `App.tsx` lines 1262–1380
- `RoadmapsTabContainer` detail view to remove: lines 244–298
- Lazy imports pattern: `App.tsx` lines 20–53
- `handleLessonComplete` and `setActiveLesson` are unchanged — lesson play still
  goes through `LearningWorkspace`

---

### Sub-Task 5 — Generator Form Consolidation: `RoadmapGeneratorForm`

**Status:** [x] done

**Intent**
Extract the duplicate roadmap generator form (present in both `RoadmapOverview.tsx`
and `RoadmapsTabContainer.tsx`) into a single shared component. Add goal suggestion
chips and a cancel button. This sub-task is self-contained and can be done any time
after sub-tasks 1–4 are complete.

**Expected Outcomes**
- `src/components/RoadmapGeneratorForm.tsx` created.
- Both `RoadmapOverview.tsx` and `RoadmapsTabContainer.tsx` use it — zero duplicate
  form code remains.
- Goal suggestion chips are visible above the text input (e.g. "Learn React",
  "Python for ML", "Full-Stack Node.js", "DevOps with Docker", "Data Structures").
  Clicking a chip fills the goal input.
- Cancel button (✕) visible when `isGenerating === true`, clicking it calls
  `onCancel()` prop (which the parent can wire to `AbortController.abort()`).

**Todo List**
1. Create `src/components/RoadmapGeneratorForm.tsx`.
2. Props: `onSubmit: (params) => Promise<void>`, `isGenerating: boolean`,
   `onCancel?: () => void`.
3. Internal state: `goal`, `experienceLevel`, `weeklyHours`, `preferredStyle`
   (same as existing form state in both parent components).
4. Add 5–6 goal chip buttons above the goal input. Clicking a chip sets `goal`
   state and focuses the input.
5. Replace weekly hours `<select>` with an `<input type="range" min="1" max="40">`
   slider that shows the live value as a label.
6. The loading animation block (spinner + rotating quotes) stays inside this
   component.
7. Export as named export.
8. Replace form code in `RoadmapsTabContainer.tsx` with `<RoadmapGeneratorForm>`.
9. Replace form code in `RoadmapOverview.tsx` with `<RoadmapGeneratorForm>`.

**Relevant Context**
- Existing form in `RoadmapsTabContainer.tsx`: lines 73–234
- Existing form in `RoadmapOverview.tsx`: lines 77–232
- Loading quotes array (same in both): lines 95–101 of each
- The `handleCreate` / `onGenerateRoadmap` wiring stays in the parent — the
  component just calls `onSubmit(params)`.

---

### Sub-Task 6 — LearningWorkspace: Next/Previous navigation and phase sidebar accordion

**Status:** [ ] pending

**Intent**
Two focused improvements to the workspace that directly serve the phase-first flow:
(a) Next/Previous lesson buttons in the content footer so users never have to scroll
the sidebar after completing a lesson. (b) Collapsible phase accordion in the left
sidebar so long roadmaps don't produce an overwhelming list.

**Expected Outcomes**
- A sticky footer bar inside the workspace content panel shows "← Previous Lesson"
  and "Next Lesson →" buttons. Clicking either selects the adjacent lesson.
- The left sidebar phases are collapsible. By default only the phase that contains
  the active lesson is expanded; all others are collapsed.
- No regressions to the existing learn/resources/quiz/project tab logic.

**Todo List**
1. In `LearningWorkspace.tsx`, compute `prevLesson` and `nextLesson` from
   `allTopics` (already computed at line 142) by finding the index of
   `selectedTopicId` and returning index-1 and index+1.
2. Add a footer bar at the bottom of the center content panel (inside the
   `motion.div` wrapping the tab content) with Prev/Next buttons. Buttons are
   disabled when at the start/end of the lesson list.
3. Clicking Prev/Next calls `handleTopicClick(lesson)` (line 114) with the
   adjacent lesson — this already handles navigation and state update.
4. In the left sidebar phase/level/lesson tree (lines 173–255), add
   `expandedPhases` state (`Set<string>`).
5. Default: the phase containing `selectedTopicId` is expanded; all others
   collapsed.
6. Clicking a phase header row toggles its expanded state.
7. Show a `ChevronDown` / `ChevronUp` icon on each phase header row.
8. Levels and lessons only render when their parent phase is in `expandedPhases`.

**Relevant Context**
- LearningWorkspace sidebar: `src/components/LearningWorkspace.tsx` lines 159–255
- `allTopics` array: lines 142–150 (already flat list of all lessons)
- `handleTopicClick`: lines 114–132
- `selectedTopicId` state: line 45

---

## Files Created / Modified Summary

| File | Action | Sub-Task |
|------|--------|----------|
| `src/lib/roadmapUtils.ts` | CREATE | 1 |
| `src/components/RoadmapOverview.tsx` | MODIFY (remove duplicate, import utils) | 1 |
| `src/components/RoadmapsTabContainer.tsx` | MODIFY (remove detail view, import utils) | 1, 4 |
| `src/components/RoadmapOverviewPage.tsx` | CREATE | 2 |
| `src/components/PhaseDetailPage.tsx` | CREATE | 3 |
| `src/App.tsx` | MODIFY (add selectedPhaseId, route to new pages) | 4 |
| `src/components/RoadmapGeneratorForm.tsx` | CREATE | 5 |
| `src/components/LearningWorkspace.tsx` | MODIFY (prev/next, sidebar accordion) | 6 |

## Design Constraints

- Use only existing Tailwind utility classes — do not add new CSS files.
- Match light-mode styles: `bg-zinc-50`, `dark:bg-white/[0.03]`, `border-zinc-200`,
  `dark:border-white/10` for cards. Gradient hero uses indigo→purple→blue.
- Locked phase visual: `opacity-60` on card content + `blur-sm` not full blur;
  overlay uses semi-transparent `bg-zinc-900/60` with a lock icon.
- All motion: use `motion/react` (not `framer-motion`), use existing
  `animationVariants.slideInUp` for page transitions, `springPresets.gentle` for
  accordion open/close.
- Mobile-first: all grids start at `grid-cols-1` and step up at `sm:` or `md:`.
- Do not modify `src/types.ts` — all necessary fields already exist.
- Do not modify any server routes — all required APIs already exist.
