# LearnPath AI — Full UI/UX Implementation Plan

## Overview

This plan implements all P0 → P3 issues identified in the UI/UX audit, in priority order. It is structured as 18 independent sub-tasks (after the first) that can be reviewed one at a time. No business logic, routing, or feature additions are made — only UI/UX, accessibility, and design system fixes.

**Constraint:** All changes are Tailwind class swaps, targeted JSX edits, and small data-wiring fixes. No new components created unless explicitly stated.

---

## Sub-Task 1 — P0: Wire activityLog data into AnalyticsView

**Intent**
The weekly bar chart in `AnalyticsView` always renders all-zero bars because `weeklyHours` is hardcoded as `[0,0,0,0,0,0,0]`. The `activityLog` state in `App.tsx` holds `Record<string, { xp: number; lessonsCompleted: number }>` keyed by ISO date strings — this data must be derived into a 7-day array and passed down.

**Expected Outcomes**
- `AnalyticsView` accepts an `activityLog` prop typed as `Record<string, { xp: number; lessonsCompleted: number }>`
- `App.tsx` passes `activityLog` to `<AnalyticsView>` (both render locations at lines 1212 and ~1359)
- Inside `AnalyticsView`, `weeklyHours` is computed from the last 7 calendar days of `activityLog` (sum `xp / 60` per day as a proxy for "hours studied", or use `lessonsCompleted * 0.5` — keep it simple)
- Weekly bar chart renders real data instead of zeros

**Todo List**
1. In `TabsScreen.tsx`, update `AnalyticsViewProps` to add `activityLog: Record<string, { xp: number; lessonsCompleted: number }>`
2. In `AnalyticsView`, replace the hardcoded `const weeklyHours = [0,0,0,0,0,0,0]` with a `useMemo` that iterates the last 7 days (Mon–Sun) and maps each day's `activityLog` entry to an hours value (`lessonsCompleted * 0.5` is a simple, honest proxy)
3. In `App.tsx` at line 1212, add `activityLog={activityLog}` to `<AnalyticsView profile={profile} />`
4. Find the second `AnalyticsView` render (~line 1359) and add the same prop

**Relevant Context**
- `src/components/TabsScreen.tsx` line 14-16 (interface), line 44 (hardcoded array), lines 185-207 (bar chart render)
- `src/App.tsx` line 228 (activityLog state), line 1212, ~1359 (AnalyticsView render)

**Status** — `[x] done`

---

## Sub-Task 2 — P0: Fix mastery wheel hardcoded strokeDashoffset

**Intent**
The mastery wheel SVG in `AnalyticsView` has `strokeDashoffset="70"` hardcoded, making it always display ~75% regardless of the user's real `completionPercent` value. The `completionPercent` variable is already computed on line 48 from `stats?.overallMastery`.

**Expected Outcomes**
- The second SVG circle (the mastery wheel, line 221) uses a dynamic `strokeDashoffset` calculated from `completionPercent`
- The formula: `strokeDasharray` is `282` (2π × 45), so `strokeDashoffset = 282 - (completionPercent / 100) * 282`

**Todo List**
1. In `TabsScreen.tsx` at line 221, replace `strokeDashoffset="70"` with a computed value using `completionPercent`:
   `strokeDashoffset={282 - (completionPercent / 100) * 282}`

**Relevant Context**
- `src/components/TabsScreen.tsx` line 48 (`completionPercent` definition), line 221 (hardcoded offset)

**Status** — `[x] done`

---

## Sub-Task 3 — P0: Add role="dialog", aria-modal, and focus trap to auth UI

**Intent**
The `renderAuthUI` function in `App.tsx` renders a full-screen card as the login/signup/password-reset form. It has no `role="dialog"`, `aria-modal="true"`, or focus trap, meaning keyboard users can tab to elements behind it. The fix is targeted: add the semantic attributes and a simple focus trap using `onKeyDown` on the container.

**Expected Outcomes**
- The outermost `<div>` in `renderAuthUI` has `role="dialog"` and `aria-modal="true"` and `aria-label` describing the current mode
- A `useEffect` inside the render function or the component traps Tab/Shift-Tab focus within the card
- Escape key closes/dismisses the form (already partially handled by URL params; add `onKeyDown` for Escape to navigate back to landing)

**Todo List**
1. In `App.tsx`, in the `renderAuthUI` function, wrap each return's outer `<div className="min-h-screen ...">` with `role="dialog" aria-modal="true" aria-label="Sign in to LearnPath AI"` (update label for each sub-mode: forgot password, reset password)
2. Add `tabIndex={-1}` and `ref` to the inner card `<div>` so focus can be moved to it on mount
3. Add a `useEffect` within the function scope (or extract a small hook) that on mount: moves focus to the card div, and traps Tab/Shift-Tab within all focusable elements inside the card
4. Add `onKeyDown` handler on the outer container to call `setForgotPasswordMode(false)` / navigate back on Escape key

**Relevant Context**
- `src/App.tsx` lines 1440-1576 (`renderAuthUI` function — 3 sub-modes: reset-token, forgot-password, normal login/signup)
- Focus trap can be implemented with a `useFocusTrap` pattern: query `button, input, a[href]` inside the ref, trap Tab cycling between first and last

**Status** — `[x] done`

---

## Sub-Task 4 — P1: Add display=swap to Google Fonts import

**Intent**
The Google Fonts `@import` URL in `index.css` already includes `&display=swap` at the end of the URL — confirmed by reading the file. This sub-task is to verify and if missing, add it.

**Expected Outcomes**
- Font import URL ends with `&display=swap` (already present — verify only, no change needed if correct)
- If missing: add `&display=swap` before the closing `')`

**Todo List**
1. Read line 1 of `src/index.css` — confirm `display=swap` is present
2. If present: mark complete, no change
3. If absent: append `&display=swap` to the URL

**Relevant Context**
- `src/index.css` line 1

**Status** — `[x] done`

---

## Sub-Task 5 — P1: Fix SplashScreen and LoadingScreen accessibility

**Intent**
Both loading screens have no `role="status"` or `aria-live` region, so screen readers receive no feedback during app loading. Both also duplicate the animated book icon code — consolidate to remove duplication.

**Expected Outcomes**
- `SplashScreen` outer `<div>` has `role="status"` and `aria-label="Loading LearnPath AI"`
- `LoadingScreen` outer `<div>` has `role="status"` and `aria-label={message}` (uses the existing `message` prop)
- Both `<p>` text elements have `aria-live="polite"` so screen readers announce the loading message

**Todo List**
1. In `SplashScreen.tsx`, add `role="status"` and `aria-label="Loading LearnPath AI"` to the outermost `<div>`
2. In `LoadingScreen.tsx`, add `role="status"` and `aria-label={message}` to the outermost `<div>`
3. In both files, add `aria-live="polite"` to the `<p>` / `<motion.p>` that shows the loading message

**Relevant Context**
- `src/components/SplashScreen.tsx` (45 lines total)
- `src/components/LoadingScreen.tsx` (89 lines total)

**Status** — `[x] done`

---

## Sub-Task 6 — P1: Fix sub-minimum text sizes (text-[9px] / text-[10px])

**Intent**
Several components use `text-[9px]` or `text-[10px]` which fall below the 12px minimum readable size. These must be replaced with `text-xs` (12px).

**Expected Outcomes**
- Zero uses of `text-[9px]` or `text-[10px]` anywhere in component files
- All affected labels remain visually smaller than surrounding text (they're already the smallest element — `text-xs` is correct)

**Todo List**
1. In `src/components/RoadmapOverviewPage.tsx`: find progress ring "done" label using `text-[9px]` → change to `text-xs`
2. In `src/components/MentorChatView.tsx`: find code block header `text-[10px]` and "walkthrough" badge `text-[9px]` → change both to `text-xs`
3. In `src/components/LandingPage.tsx`: find hero mockup labels using `text-[9px]`/`text-[10px]` → change to `text-xs`
4. Run grep for `text-\[9px\]` and `text-\[10px\]` across all component files to catch any missed instances

**Relevant Context**
- `src/components/RoadmapOverviewPage.tsx`
- `src/components/MentorChatView.tsx` lines 42-45 (code block header)
- `src/components/LandingPage.tsx` (hero dashboard mockup)

**Status** — `[x] done`

---

## Sub-Task 7 — P1: Fix lesson prose text size (always text-sm on mobile)

**Intent**
`LessonPlayView` uses `text-xs md:text-sm` for lesson prose content, making it render at 12px on mobile — too small for extended reading. Lesson content should always be `text-sm` (14px minimum).

**Expected Outcomes**
- The `prose prose-invert` div in the `'learn'` case uses `text-sm` not `text-xs md:text-sm`
- Quiz question text `text-xs md:text-sm` → `text-sm`
- Coding exercise instruction text `text-xs` → `text-sm`

**Todo List**
1. In `LessonPlayView.tsx`, in the `'learn'` case (line 98): change `text-xs md:text-sm` class to `text-sm`
2. In the `'quiz'` case (line 122): change quiz question `text-xs md:text-sm` → `text-sm`
3. In the `'coding'` case (line 230): change instructions `text-xs` → `text-sm`

**Relevant Context**
- `src/components/LessonPlayView.tsx` lines 98, 122, 230

**Status** — `[x] done`

---

## Sub-Task 8 — P1: Make Mentor suggested prompts context-aware

**Intent**
The 4 suggested prompts and 4 helper actions in `MentorChatView` are hardcoded to Deep Learning / AI topics (NumPy, Self-Attention, RAG, LLM tokenization). These are irrelevant when the user's roadmap is about React, DevOps, or iOS. Add an optional `roadmapGoal` prop and derive context-aware defaults from it.

**Expected Outcomes**
- `MentorChatViewProps` gains an optional `roadmapGoal?: string` prop
- When `roadmapGoal` is provided, the first suggested prompt and first helper action reference the roadmap goal in their text (e.g., "Explain core concepts of {roadmapGoal}" instead of "Explain the absolute foundations of Deep Learning")
- Remaining 3 prompts stay as generic mentor prompts (quiz, project ideas, progress review) — only the first one becomes goal-aware
- `App.tsx` passes `roadmapGoal={activeRoadmap?.goal}` to `<MentorChatView>`

**Todo List**
1. In `MentorChatView.tsx`, add `roadmapGoal?: string` to `MentorChatViewProps` interface
2. Replace the `suggestedPrompts[0]` text with a conditional: if `roadmapGoal`, use `"Explain core ${roadmapGoal} concepts for a beginner"`, else keep the existing Deep Learning prompt
3. Replace `helperActions[0].topic` with a conditional: if `roadmapGoal`, use `"Explain the absolute foundations of ${roadmapGoal} in plain English."`, else keep existing
4. In `App.tsx` at line 1202, add `roadmapGoal={activeRoadmap?.goal}` to `<MentorChatView>`

**Relevant Context**
- `src/components/MentorChatView.tsx` lines 92-98 (props interface), lines 195-207 (hardcoded prompts/actions)
- `src/App.tsx` line 1202-1208 (MentorChatView render)

**Status** — `[x] done`

---

## Sub-Task 9 — P1: Full design system polish — Foundation (theme.ts + index.css)

**Intent**
Establish the CSS/token foundation that all subsequent sub-tasks depend on. Fix border strengths, glass card border-radius ownership, and eliminate `border-white/5` structural borders.

**Expected Outcomes**
- `theme.ts` exports a `shadows` object (already present — verify values match design plan)
- `.glass-card` CSS in `index.css` has `border-radius: 1rem` as a default
- All `glass-card-*` variants include `border-radius: 1rem`
- `border-white/5` structural card borders replaced with `border-white/10` or `border-white/[0.06]` for internal dividers
- `.state-completed`, `.state-current`, `.state-upcoming` box-shadows use lighter values

**Todo List**
1. Verify `theme.ts` `shadows` export — values already present; no change needed
2. In `index.css` `.glass-card`: confirm `border-radius: 1rem` is present (already added per prior work)
3. In `index.css` all `glass-card-*` variants: confirm `border-radius: 1rem` present
4. Search for `border-white/5` in `index.css` structural contexts → replace with `border-white/10`
5. In `.state-*` classes: reduce box-shadow spread values to max 16px

**Relevant Context**
- `src/styles/theme.ts`
- `src/index.css` (glass card, state classes)

**Status** — `[x] done`

---

## Sub-Task 10 — P1: Design system polish — Navigation.tsx

**Intent**
Fix drawer shadow, drawer padding consistency, bottom nav border strength, active indicator radius, and upgrade card button radius.

**Expected Outcomes**
- Side drawer panel: `shadow-2xl` → `shadow-[0_8px_40px_rgba(0,0,0,0.18)]`
- Drawer footer: `p-4` → `p-5`; border `dark:border-zinc-700` → `dark:border-white/10`
- Bottom nav dark-mode `border-t border-white/5` → `border-t border-transparent`
- Active indicator: `rounded-xl sm:rounded-2xl` → `rounded-xl`
- Upgrade card button inside drawer: `rounded-lg` → `rounded-xl`
- Footer space-y-1 buttons: `py-2.5` → `py-3` for 44px touch target

**Todo List**
1. `SideDrawer` panel div: change shadow
2. Drawer footer `p-4` → `p-5` and `dark:border-zinc-700` → `dark:border-white/10`
3. `BottomNavigation` nav: change `dark:border-white/5` → `dark:border-transparent`
4. Active indicator `inset-x-1 sm:inset-0 ... rounded-xl sm:rounded-2xl` → `inset-0 rounded-xl`
5. Upgrade card button: `rounded-lg` → `rounded-xl`
6. Footer buttons: `py-2.5` → `py-3`

**Relevant Context**
- `src/components/Navigation.tsx` lines 94 (BottomNavigation), 166 (SideDrawer), 174 (drawer panel), 261 (drawer footer)

**Status** — `[x] done`

---

## Sub-Task 11 — P1: Design system polish — Cards, HomeView, TabsScreen radius/shadow/typography

**Intent**
The bulk of the `rounded-3xl` → `rounded-2xl` migration, `shadow-md` removal from glass cards, body text `text-xs` → `text-sm`, progress bar `h-2` unification, and section spacing `space-y-8`.

**Expected Outcomes**
- All `rounded-3xl` occurrences in `Cards.tsx`, `HomeView.tsx`, `TabsScreen.tsx` changed to `rounded-2xl`
- `shadow-md` removed from stat cards in `Cards.tsx` and `TabsScreen.tsx`
- Card description body copy `text-xs` → `text-sm` where it's multi-sentence content
- Footer dividers `border-white/5` → `border-white/10` in `Cards.tsx`
- `HomeView` outer wrapper `space-y-6` → `space-y-8`
- `HomeView` `SectionHeader` h3 `text-sm` → `text-base`
- `HomeView` activity bar `h-2.5` → `h-2`
- `HomeView` hero CTA buttons `text-base` → `text-sm`
- `TabsScreen` `AnalyticsView` `space-y-6` → `space-y-8`
- `TabsScreen` progress bars `h-1.5` → `h-2`; track `bg-white/5` → `bg-white/10`
- `TabsScreen` `ProfileView` already `space-y-8` ✓

**Todo List**
1. `Cards.tsx`: `rounded-3xl` → `rounded-2xl` on ProgressCard, StatsCard, AchievementCard, NotificationCard, AIRecommendationCard, LearningScoreCard
2. `Cards.tsx`: remove `shadow-md` from stat card items; `border-white/5` footer dividers → `border-white/10`
3. `Cards.tsx`: description text `text-xs` → `text-sm` for multi-sentence body copy
4. `HomeView.tsx`: outer div `space-y-6` → `space-y-8`
5. `HomeView.tsx` `SectionHeader` h3: `text-sm` → `text-base`
6. `HomeView.tsx` `GlassCard`: verify `rounded-2xl` (not `rounded-3xl`) — fix if needed
7. `HomeView.tsx` hero CTA buttons: `text-base` → `text-sm`
8. `HomeView.tsx` activity bar: `h-2.5` → `h-2`
9. `TabsScreen.tsx` `AnalyticsView` root: `space-y-6` → `space-y-8` (if present)
10. `TabsScreen.tsx` Completion Speed progress bars: `h-1.5` → `h-2`; track `bg-white/5` → `bg-white/10`

**Relevant Context**
- `src/components/Cards.tsx`
- `src/components/HomeView.tsx` lines 82-106 (SectionHeader, GlassCard), 366 (root div), hero section
- `src/components/TabsScreen.tsx` lines 100-337

**Status** — `[x] done`

---

## Sub-Task 12 — P1: Design system polish — LessonPlayView borders, radius, shadows

**Intent**
Fix the invisible `border-white/5` structural borders, `rounded-3xl` content panels, oversized completion banner shadow, quiz option radius, and submit button text size.

**Expected Outcomes**
- All structural `border-white/5` → `border-white/10` in LessonPlayView
- Content panels `p-6 rounded-3xl` → `p-5 rounded-2xl`
- Quiz options `rounded-lg` → `rounded-xl`
- Quiz submit button `text-xs` → `text-sm`
- Completion banner `shadow-[0_4px_30px_...]` → `shadow-[0_4px_16px_rgba(16,185,129,0.12)]`
- Completion claim button `rounded-lg` → `rounded-xl`
- Code editor inner panels use `rounded-xl` for nested divs

**Todo List**
1. Header bar `border-white/5` → `border-white/10`
2. Content panel in `renderActiveChapter`: `rounded-3xl` → `rounded-2xl`, `p-6` → `p-5`
3. Quiz question containers: `border-white/5` → `border-white/10`
4. Quiz option buttons: `rounded-lg` → `rounded-xl`
5. Quiz results background: `bg-[#0A0A0A]` → `bg-white/[0.03]`; `border-white/5` → `border-white/10`
6. Explanation panel: same swap as above
7. Submit button: `text-xs` → `text-sm`
8. Completion banner: fix shadow spread
9. Code editor outer border: `border-white/5` → `border-white/10`

**Relevant Context**
- `src/components/LessonPlayView.tsx`

**Status** — `[x] done`

---

## Sub-Task 13 — P1: Design system polish — MentorChatView borders and padding

**Intent**
Unify the three bottom-zone padding values, fix `text-[10px]`/`text-[9px]` code block labels, fix structural `border-white/5` borders, standardise input field border strength.

**Expected Outcomes**
- Helper chip strip: `p-3` → `px-4 py-2`
- Input form: `p-3` → `px-4 py-3`
- Code block header labels: `text-[10px]`/`text-[9px]` → `text-xs`
- Suggested prompts panel border: `border-white/5` → `border-white/10`
- Prompt buttons borders: `border-white/[0.05]` → `border-white/[0.08]`
- Chat input field: `border-white/5` → `border-white/10`
- Top info bar: `border-white/5` → `border-white/10`
- Typing indicator bubble: `border-white/5` → `border-white/10`

**Todo List**
1. Top info bar `border-b border-white/5` → `border-b border-white/10`
2. Suggested prompts panel `border-t border-white/5` → `border-t border-white/10`
3. Helper action strip: `border-t border-white/5` → `border-t border-white/10`; `p-3` → `px-4 py-2`
4. Input form `px-4 py-3` (check current — update from `p-3` if needed)
5. Chat input `border-white/5` → `border-white/10`
6. Code block pre header `text-[10px]` → `text-xs`; badge `text-[9px]` → `text-xs`
7. Typing indicator `border border-white/5` → `border border-white/10`

**Relevant Context**
- `src/components/MentorChatView.tsx` lines 209-350

**Status** — `[x] done`

---

## Sub-Task 14 — P1: Design system polish — OnboardingWizard, RoadmapGeneratorForm, RoadmapOverviewPage

**Intent**
Fix the onboarding wizard background, card border, step heading size, and hour button radius. Fix the roadmap generator form loading panel border. Fix the RoadmapOverviewPage hero shadow and phase badge text size.

**Expected Outcomes**
- OnboardingWizard: `bg-[#0A0A0A]` → `bg-zinc-950`; card `bg-[#111]` → `dark:bg-zinc-900`; `border-white/8` → `border-white/10`; step headings `text-lg` → `text-xl`; weekly hour buttons `rounded-lg` → `rounded-xl`
- RoadmapGeneratorForm: loading panel `border-white/5` → `border-white/10`
- RoadmapOverviewPage: hero banner `shadow-xl` → `shadow-[0_4px_20px_rgba(79,70,229,0.18)]`; phase status badges `text-[10px]` → `text-xs`; phase card hover `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`

**Todo List**
1. `OnboardingWizard.tsx` page wrapper: `bg-[#0A0A0A]` → `bg-zinc-950`
2. Wizard card: `bg-[#111]` → `dark:bg-zinc-900`; `border-white/8` → `border-white/10`
3. Step headings `text-lg` → `text-xl`
4. Weekly hour buttons `rounded-lg` → `rounded-xl`
5. `RoadmapGeneratorForm.tsx` loading panel divider: `border-white/5` → `border-white/10`
6. `RoadmapOverviewPage.tsx` hero: fix shadow class
7. Phase status badge text: `text-[10px]` → `text-xs`
8. Phase card hover shadow: `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`

**Relevant Context**
- `src/components/OnboardingWizard.tsx`
- `src/components/RoadmapGeneratorForm.tsx` line 185
- `src/components/RoadmapOverviewPage.tsx` lines 83, phase cards

**Status** — `[x] done`

---

## Sub-Task 15 — P2: Add aria-label to range slider; fix EmptyState dark-mode icon

**Intent**
Two small accessibility and visual fixes that don't fit neatly into other sub-tasks.

**Expected Outcomes**
- Range slider in `RoadmapGeneratorForm` has `aria-label="Weekly study hours"` and `aria-valuetext={`${weeklyHours} hours per week`}`
- `EmptyState` icon container background changed from `bg-gradient-to-br from-purple-100 to-blue-100` (light mode only) to a dark-mode adaptive version: `bg-purple-500/15 dark:bg-purple-500/10` (or use the `glass-card-purple` pattern as a small circle)

**Todo List**
1. `RoadmapGeneratorForm.tsx` range input: add `aria-label="Weekly study hours"` and `aria-valuetext={`${weeklyHours} hours per week`}`
2. `EmptyState.tsx` icon container: change `bg-gradient-to-br from-purple-100 to-blue-100` → `bg-purple-500/15` and add `dark:bg-purple-500/10`; keep `rounded-full` and size

**Relevant Context**
- `src/components/RoadmapGeneratorForm.tsx` lines 133-141
- `src/components/EmptyState.tsx` lines 31-33

**Status** — `[x] done`

---

## Sub-Task 16 — P2: Analytics loading skeleton + QuizTab green → emerald color fix

**Intent**
`AnalyticsView` loading state is a plain text "Loading analytics..." paragraph — it should use a skeleton layout. `QuizTab` uses `text-green-400` for the XP earned display, inconsistent with `text-emerald-400` used everywhere else in the app.

**Expected Outcomes**
- `AnalyticsView` loading state renders a skeleton: a progress ring placeholder, 4 stat card skeletons in a grid, and a chart bar skeleton
- `QuizTab` XP result `text-green-400` → `text-emerald-400`

**Todo List**
1. In `TabsScreen.tsx` `AnalyticsView`, replace the plain `<p>Loading analytics...</p>` loading state (lines 92-98) with a skeleton layout using the existing `Skeleton` component classes (`rounded-2xl bg-white/5 border border-white/10 animate-pulse`)
2. In `QuizTab.tsx`, search for `text-green-400` → replace with `text-emerald-400`

**Relevant Context**
- `src/components/TabsScreen.tsx` lines 92-98 (AnalyticsView loading state)
- `src/components/QuizTab.tsx` (`text-green-400` in QuizResultDisplay)
- `src/components/Skeleton.tsx` (existing skeleton components to reuse)

**Status** — `[x] done`

---

## Sub-Task 17 — P2/P3: Migrate ProfileMenu from Anime.js to Framer Motion

**Intent**
`ProfileMenu.tsx` is the only file using `animejs` — creating an unnecessary 30KB+ dependency. The same open/close animation (opacity, scale, translateY, stagger children) is trivially achievable with Framer Motion which is already installed everywhere.

**Expected Outcomes**
- `animate` and `stagger` imports from `animejs` are removed from `ProfileMenu.tsx`
- The panel open animation uses Framer Motion `<motion.div>` with `initial/animate/exit` variants
- The menu items use `variants` with `staggerChildren`
- The `opacity-0` class workaround on the panel and `data-menu-item` items is removed (Framer handles this)
- All existing visual behaviour is preserved (scale from 0.95, translateY -6, stagger children by 40ms)

**Todo List**
1. Remove `import { animate, stagger } from 'animejs'` from `ProfileMenu.tsx`
2. Remove the `useEffect` that calls `animate(panelRef.current, ...)` and `animate('[data-menu-item]', ...)`
3. Remove `panelRef` and `useRef` if no longer needed
4. Wrap the panel `<div>` in `<AnimatePresence>` with a Framer Motion `<motion.div>` using `initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -6 }}` transition `duration: 0.22, ease: 'easeOut'`
5. For menu items, add `variants` with stagger via the parent `motion.div transition.staggerChildren: 0.04`
6. Remove `opacity-0` classes from panel div and all `data-menu-item` buttons
7. Import `AnimatePresence, motion` from `motion/react` (already used across the app)

**Relevant Context**
- `src/components/ProfileMenu.tsx` lines 1-4 (imports), 51-68 (anime.js useEffect), lines 93-145 (panel JSX)
- Pattern reference: `SideDrawer` in `Navigation.tsx` uses similar open/close pattern with CSS transitions

**Status** — `[x] done`

---

## Sub-Task 18 — P3: Extract auth UI into AuthScreen component

**Intent**
`App.tsx` is ~1850 lines with the entire auth UI (login, signup, forgot password, reset password — 4 sub-modes) embedded inline as `renderAuthUI()` spanning lines 1440–1576. Extracting this to `AuthScreen.tsx` reduces App.tsx size, makes it testable, and separates concerns cleanly. This is a pure refactor — no visual changes.

**Expected Outcomes**
- New file `src/components/AuthScreen.tsx` contains the full auth form logic
- `AuthScreen` accepts props: `authMode`, `setAuthMode`, `authError`, `setAuthError`, `isAuthenticating`, auth field values and setters, forgot password state, reset password state, and submit handlers
- `App.tsx` imports and renders `<AuthScreen />` instead of calling `renderAuthUI()`
- The `renderAuthUI` function is deleted from `App.tsx`
- All existing visual behaviour and state is preserved — this is a mechanical extraction

**Todo List**
1. Create `src/components/AuthScreen.tsx`
2. Move the `renderAuthUI` function body (lines 1440–1576) into `AuthScreen.tsx` as the component body, defining a `AuthScreenProps` interface for all required state/handlers
3. In `App.tsx`, remove `renderAuthUI` and replace its call sites with `<AuthScreen ...props />`
4. Verify TypeScript types are satisfied — no implicit `any`

**Relevant Context**
- `src/App.tsx` lines 203-217 (auth state declarations), lines 1440-1576 (renderAuthUI)
- This task has no dependencies — can be done independently

**Status** — `[x] done`

---

## Implementation Order

```
1  → Wire activityLog to AnalyticsView (P0 data bug)
2  → Fix mastery wheel strokeDashoffset (P0 data bug)
3  → Auth dialog accessibility / focus trap (P0 a11y)
4  → Google Fonts display=swap verify (P1 trivial)
5  → SplashScreen/LoadingScreen role=status (P1 a11y)
6  → Fix text-[9px]/text-[10px] sub-minimum sizes (P1)
7  → Lesson prose text-sm on mobile (P1)
8  → Mentor context-aware prompts (P1 UX)
9  → Design system foundation: index.css + theme.ts (P1)
10 → Navigation polish (P1 design)
11 → Cards + HomeView + TabsScreen radius/shadow/type (P1 design — largest)
12 → LessonPlayView borders/radius/shadows (P1 design)
13 → MentorChatView borders/padding (P1 design)
14 → OnboardingWizard + RoadmapGeneratorForm + RoadmapOverviewPage (P1 design)
15 → Range slider aria + EmptyState dark-mode icon (P2 a11y)
16 → Analytics skeleton + QuizTab color fix (P2)
17 → ProfileMenu Anime.js → Framer Motion (P3)
18 → Extract AuthScreen component (P3 refactor)
```

Sub-tasks 9–14 are the design system polish pass. Sub-task 9 (foundation) should always precede 10–14 so the CSS tokens are in place before component classes reference them.

---

## Constraints

- No new features added
- No routing changes
- No new npm dependencies (Framer Motion replaces Anime.js in sub-task 17)
- All changes must be visually backward-compatible
- Light mode overrides in `index.css` not touched unless directly related to a border/shadow fix
- Each sub-task is independently reviewable before the next begins
