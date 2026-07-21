# Learning Workspace Layout Audit — Fix Plan

## Overview

5 targeted fixes to `src/components/LearningWorkspace.tsx` identified from a full 819-line code audit of the panel rendered when a user clicks "Continue Learning". All changes are Tailwind class edits within that single file. No new components, files, or dependencies.

Ordered from highest to lowest impact.

---

## Sub-Task 1 — Make Center Panel Header Sticky

**Intent**
The breadcrumb + tab bar header at line 260 has `backdrop-blur-sm` and `flex-shrink-0` but is not `sticky`. On mobile, where the page itself scrolls rather than the inner flex panel, the header scrolls off screen and users lose breadcrumb context and tab access.

**Expected Outcomes**
- The header pins to the top of its scroll container on all viewport sizes.
- Lesson title breadcrumb and tab pills remain visible while reading long lesson content.
- No visual regression on desktop (header was already visible there due to `overflow-hidden` on the panel).

**Todo List**
1. Read line 260 to confirm exact current class string.
2. Prepend `sticky top-0 z-10` to the existing class list on that div.

**Relevant Context**
- [`LearningWorkspace.tsx` line 260](src/components/LearningWorkspace.tsx:260) — Center panel header div

**Status** — [x] done

---

## Sub-Task 2 — Show Skeleton Tab Pills During Load

**Intent**
The tab bar is guarded by `{topicData && (...)}` at line 273. While the skeleton is showing (loading=true, topicData=null), the entire tab area is absent — causing a layout height jump and visual inconsistency when content loads in.

**Expected Outcomes**
- A skeleton version of the 4 tab pills is shown during the loading state, using the same pill container shape and `animate-pulse`.
- When content loads, the real tabs fade in with no layout shift.
- The tab bar is never absent when a lesson is selected (loading or loaded).

**Todo List**
1. Read lines 273–298 to confirm the exact tab bar block.
2. Change the condition from `{topicData && (` to `{(topicData || loading) && (`.
3. Inside the map, add a branch: when `loading`, render 4 `<div>` skeleton pill shapes (`h-7 w-16 bg-white/8 rounded-lg animate-pulse`) instead of the real tab buttons.
4. Wrap the skeleton pills inside the same `bg-white/[0.04] rounded-xl p-1 gap-0.5 w-fit mb-3` container so the outer shape matches.

**Relevant Context**
- [`LearningWorkspace.tsx` line 273](src/components/LearningWorkspace.tsx:273) — Tab bar condition and pill container

**Status** — [x] done

---

## Sub-Task 3 — Fix Level Label Colour in Sidebar

**Intent**
Inside the sidebar's phase accordion, the level label dividers use `text-zinc-600`. On the `#0D0D0F` background this is near-invisible (≈ #4D4D4D text on #0D0D0F bg — extremely low contrast). The label should function as a visible sub-header separating level groups within a phase.

**Expected Outcomes**
- Level label text (e.g. "Beginner", "Fundamentals") is legible as a muted but readable divider.
- Three-level hierarchy (Phase → Level → Lesson) is visually distinct.

**Todo List**
1. Read line 701 to confirm `text-zinc-600` is present.
2. Change `text-zinc-600` → `text-zinc-500` on the level label div.

**Relevant Context**
- [`LearningWorkspace.tsx` line 701](src/components/LearningWorkspace.tsx:701) — Level label div inside sidebar accordion

**Status** — [x] done

---

## Sub-Task 4 — Fix Right Rail Sticky Positioning

**Intent**
The right rail at line 740 has `sticky top-0` but its nearest scroll-container ancestor is the outer flex wrapper which has `overflow-hidden` — `sticky` has no scrollable parent to lock against, so it silently does nothing. Adding `self-start` prevents the rail from stretching to fill the full flex row height and allows `sticky` to work correctly within a flex layout.

**Expected Outcomes**
- Right rail stays pinned at the top as the center content panel scrolls.
- Rail does not over-stretch vertically when center content is very long.

**Todo List**
1. Read line 740 to confirm current class string.
2. Add `self-start` to the rail's class list (keep `sticky top-0` and `h-[calc(100vh-10rem)]`).

**Relevant Context**
- [`LearningWorkspace.tsx` line 740](src/components/LearningWorkspace.tsx:740) — Right rail outer div

**Status** — [x] done

---

## Sub-Task 5 — Increase SectionLabel Divider Line Opacity

**Intent**
The `SectionLabel` component renders decorative horizontal lines on each side of the label text using `bg-white/5`. At 5% white opacity on `#0D0D0F` background the lines are invisible. Bumping to `bg-white/10` makes them subtly perceptible, reinforcing section separation without being heavy.

**Expected Outcomes**
- The flanking lines of every section divider (Learning Objectives, Watch, Content, AI Summary, etc.) are faintly visible as structural guides.
- Lines remain tastefully subtle — not competing with content.

**Todo List**
1. Read lines 54–56 in `SectionLabel` to confirm `bg-white/5` is present on both `<span>` elements.
2. Change both instances of `bg-white/5` → `bg-white/10`.

**Relevant Context**
- [`LearningWorkspace.tsx` lines 54–56](src/components/LearningWorkspace.tsx:54) — `SectionLabel` component

**Status** — [x] done

---

## Notes for Implementation

- Every sub-task reads the exact target lines before editing.
- All 5 changes are in `src/components/LearningWorkspace.tsx` only.
- No new components, no new files, no new imports, no new dependencies.
- Sub-tasks are ordered: do 1 → 2 → 3 → 4 → 5. Each is independently reviewable.
