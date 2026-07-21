# Design System Polish Plan

## Overview

A comprehensive, non-breaking design polish pass across the entire LearnPath AI frontend. Every change is a Tailwind class swap or CSS token update — no business logic, routing, or feature changes. The goal is to make every screen feel consistent, readable, and comparable to Linear/Notion/Stripe in craftsmanship.

All findings come from the two completed audits (parts 1–5 and 6–14). Changes are grouped into focused sub-tasks, each touching a bounded set of files. Each sub-task can be implemented and reviewed independently.

---

## Design Rules Established by This Plan

These rules apply globally and are referenced in each sub-task below.

### Radius
| Element | Class |
|---|---|
| Page-level cards (glass cards, main panels) | `rounded-2xl` |
| Nested elements inside cards (inner panels, list items, code blocks) | `rounded-xl` |
| Buttons | `rounded-xl` |
| Inputs / selects / textareas | `rounded-xl` |
| Chip / pill badges | `rounded-full` |
| Square/compact badges | `rounded-md` |

### Spacing
- Section gap: `space-y-8` on outer page wrappers
- Section header → content gap: `mb-3`
- Card internal padding: `p-5` (20 px) standard, `p-4` for compact cards
- All gaps/margins snap to 4 px multiples; prefer 8 px multiples for major layout decisions

### Typography
| Role | Class |
|---|---|
| Page title (h1) | `text-2xl sm:text-3xl font-bold` |
| Section heading (h2) | `text-xl font-bold` |
| Card title / section landmark (h3) | `text-base font-semibold` |
| Card sub-title (h4) | `text-sm font-semibold` |
| Body text in cards | `text-sm` |
| Metadata / timestamps / captions | `text-xs` |
| Minimum readable text anywhere | `text-xs` (12 px) — never go below |

### Borders
- Structural card border (dark): `border-white/10`
- Divider inside card (dark): `border-white/10`
- Near-invisible nested divider: `border-white/[0.06]`
- Light mode card border: `border-zinc-200`
- **Never use `border-white/5`** for structural borders (too faint)

### Shadows
| Context | Value |
|---|---|
| Resting card | Owned by `.glass-card` CSS — no extra Tailwind shadow utility |
| Interactive card hover | `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]` |
| Modal / drawer | `shadow-[0_8px_40px_rgba(0,0,0,0.18)]` |
| Floating button (primary CTA) | `shadow-[0_4px_14px_rgba(124,58,237,0.3)]` — defined once in `theme.ts` |
| Contextual glow (hero banners) | `shadow-[0_4px_20px_rgba(79,70,229,0.18)]` |
| **Never use** | `shadow-2xl`, `shadow-xl shadow-black/40`, `shadow-md` on glass cards |

### Progress Bars
- Track: `h-2 rounded-full bg-white/10` (dark) / `bg-zinc-100` (light)
- Fill: `h-full rounded-full` with gradient
- All bars: `h-2` uniform height

### Buttons — Hierarchy
| Level | Usage | Base classes |
|---|---|---|
| Primary | Single main CTA per context | Gradient from `buttonStyles.primary` in theme.ts. `rounded-xl px-5 py-2.5 text-sm font-bold` |
| Secondary | Alternative action | `bg-white/8 border border-white/10 text-zinc-200 rounded-xl px-5 py-2.5 text-sm font-semibold` |
| Ghost / tertiary | Inline text actions | `text-sm text-zinc-400 hover:text-white transition-colors` — no background, no border |
| Destructive | Delete / logout | `bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl` |

### Icons
- Default size in buttons/badges: `w-4 h-4`
- Inline with text: `w-3.5 h-3.5`  
- Section header icons: `w-4 h-4`
- Large decorative icons (empty states): `w-8 h-8` or `w-10 h-10`
- All icons: `stroke-[2px]` (default Lucide), active/selected state: `stroke-[2.5px]`
- Gap between icon and label text: `gap-2` standard, `gap-1.5` compact

### Colors — Accent Usage Rules
- Purple is the **primary brand accent** — used for active states, primary CTAs, section icons
- Blue is **secondary** — used for informational states, secondary glass cards
- Emerald/green is **success only** — completed states, positive scores
- Amber is **warning/streak only** — streak badge, caution states
- Rose/red is **error/destructive only** — wrong answers, delete actions
- Do not mix accent colours on the same element for decoration alone

### Touch Targets
- Minimum interactive element: `min-h-[44px] min-w-[44px]` on mobile
- Icon-only buttons: `p-2.5` minimum padding

### Focus States
- Already correct globally in `index.css` — `outline: 2px solid rgba(168,85,247,0.7)` — do not change

---

## Sub-Tasks

---

### Sub-Task 1 — Foundation: `theme.ts` + `index.css`

**Intent**  
Establish the single source of truth for design tokens. Add shadow tokens. Fix `.glass-card` to own its default border-radius. Upgrade border values from `/5` to `/10`. This is the foundation all other sub-tasks depend on.

**Expected Outcomes**
- `theme.ts` exports a `shadows` object with 5 named shadow values
- `.glass-card` CSS has `border-radius: 1rem` as a default (16 px = `rounded-2xl`)
- All glass card variants use `border-radius: inherit` — no override needed per-component
- `border-white/5` is eliminated from global CSS and replaced with `/10` or `/[0.06]`
- `buttonStyles.primary` in `theme.ts` references the single canonical shadow token

**Todo List**
1. In `theme.ts`, add a `shadows` export:
   ```
   export const shadows = {
     card: '0 4px 16px rgba(0,0,0,0.08)',
     cardHover: '0 8px 24px rgba(0,0,0,0.10)',
     modal: '0 8px 40px rgba(0,0,0,0.18)',
     floating: '0 4px_14px rgba(124,58,237,0.3)',
     glow: '0 4px 20px rgba(79,70,229,0.18)',
   } as const
   ```
2. In `theme.ts`, update `buttonStyles.primary` shadow to use the `shadows.floating` value string
3. In `index.css`, update `.glass-card` to add `border-radius: 1rem` and change `box-shadow` to use the `card` value
4. In `index.css`, update all coloured `glass-card-*` variants: add `border-radius: 1rem`, change `border: 1px solid` opacity from `0.08` → `0.12` (dark), keep light overrides
5. In `index.css`, in the light-mode glass card override block, change `border-color: rgba(100,116,139,0.4)` → `rgba(100,116,139,0.3)` (softer in light)
6. In `index.css`, search every `border-white/5` used as a structural card/panel border and replace with `border-white/10`; replace internal divider uses with `border-white/[0.06]`
7. In `index.css`, update `.state-completed`, `.state-current`, `.state-upcoming` box-shadows to use the `card` value pattern (remove the `0 8px 32px` values — too heavy)

**Relevant Context**
- [`theme.ts`](src/styles/theme.ts) — `buttonStyles`, `glassCardStyles`
- [`index.css`](src/index.css) — `.glass-card`, `.glass-card-*`, `.state-*` classes
- No component files touched in this sub-task

**Status** — `[ ] pending`

---

### Sub-Task 2 — Navigation: `Navigation.tsx`

**Intent**  
Fix spacing consistency in the drawer, upgrade the drawer shadow, standardise the bottom nav active indicator radius, and clean up redundant border+shadow on the bottom nav.

**Expected Outcomes**
- Side drawer uses soft modern `shadow-[0_8px_40px_rgba(0,0,0,0.18)]` instead of `shadow-2xl`
- Drawer header, profile preview, and footer all use consistent `p-5` padding
- Bottom nav active indicator uses `rounded-xl` (single value, not responsive switch)
- Bottom nav in dark mode drops the `border-t` (relies on shadow only); light mode keeps it
- All drawer nav item icon sizes are `w-4 h-4` consistently
- Upgrade card banner inside drawer: `rounded-xl` on the upgrade card, `rounded-lg` on the button inside it

**Todo List**
1. Change drawer panel `shadow-2xl` → `shadow-[0_8px_40px_rgba(0,0,0,0.18)]`
2. Change drawer footer `p-4` → `p-5`; change `border-t border-zinc-200 dark:border-zinc-700` → `border-t border-zinc-200 dark:border-white/10`
3. Change bottom nav `border-t border-zinc-200 dark:border-white/5` → `border-t border-zinc-200 dark:border-transparent`
4. Change active indicator `rounded-xl sm:rounded-2xl` → `rounded-xl`
5. Change upgrade card inside drawer `rounded-xl` → stays `rounded-xl` ✓; change button inside `rounded-lg` → `rounded-xl`
6. Footer `space-y-1` buttons: change `py-2.5` → `py-3` for consistent 44 px minimum touch target
7. Change footer `bg-zinc-100/40 dark:bg-zinc-950/15` → `bg-zinc-50/60 dark:bg-white/[0.02]` (subtler)

**Relevant Context**
- [`Navigation.tsx`](src/components/Navigation.tsx:94) — `BottomNavigation`, `SideDrawer`

**Status** — `[ ] pending`

---

### Sub-Task 3 — Badges & Chips: `Badges.tsx`

**Intent**  
Standardise badge padding to the `rounded-full px-3 py-1` pattern. Fix XPBadge glow shadow visibility. Ensure all three badges (`XPBadge`, `StreakBadge`, `TierBadge`) use identical sizing conventions.

**Expected Outcomes**
- All three badges use `text-xs` for `sm` size and consistent `px-3 py-1` for `md` 
- XPBadge glow shadow increased to `rgba(168,85,247,0.22)` — visible in both modes
- TierBadge padding unified with StreakBadge (`py-1` not `py-1.5`)
- Icon sizes all `w-3.5 h-3.5` with `gap-1.5`

**Todo List**
1. `XPBadge`: change shadow from `0_0_12px_rgba(168,85,247,0.15)` → `0_0_12px_rgba(168,85,247,0.22)`
2. `XPBadge` md size: `px-3 py-1` (was `px-3 py-1` — verify); lg size: `px-4 py-1.5`
3. `TierBadge`: change `py-1.5` → `py-1` to match StreakBadge height
4. Ensure all icon sizes inside badges are `w-3.5 h-3.5`

**Relevant Context**
- [`Badges.tsx`](src/components/Badges.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 4 — Cards: `Cards.tsx`

**Intent**  
Apply the unified card radius rule (`rounded-2xl` for all cards), remove double-border on stat icon chips, standardise body text to `text-sm`, remove ad-hoc `shadow-md` from stat cards, unify internal divider border strength, and align progress bar height.

**Expected Outcomes**
- All cards: `rounded-3xl` → `rounded-2xl`
- Stat icon chips: `border` class removed from the icon wrapper; background tint only
- Card body description text: `text-xs` → `text-sm` where it's multi-sentence body copy
- Stat cards: `shadow-md` removed (glass CSS owns shadow)
- Internal footer dividers: `border-white/5` → `border-white/10`
- Skill mastery progress bars: `h-2 rounded-full` uniform

**Todo List**
1. `ProgressCard`: `rounded-3xl` → `rounded-2xl`; button inside `rounded-xl` ✓
2. `StatsCard` item cards: `rounded-3xl` → `rounded-2xl`; remove `shadow-md`; remove `border` from icon div (keep bg + text colour)
3. `AchievementCard`: `rounded-3xl` → `rounded-2xl`; description `text-xs` → `text-sm`; footer divider `border-white/5` → `border-white/10`
4. `NotificationCard`: `rounded-3xl` → `rounded-2xl`; description `text-xs text-zinc-300` → `text-sm text-zinc-300`
5. `AIRecommendationCard`: `rounded-3xl` → `rounded-2xl`; footer divider `border-white/5` → `border-white/10`; description `text-xs` → `text-sm`
6. `LearningScoreCard`: `rounded-3xl` → `rounded-2xl`; progress bar track `h-2 bg-white/5 rounded-full`; remove `border border-white/5` on track

**Relevant Context**
- [`Cards.tsx`](src/components/Cards.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 5 — Home View: `HomeView.tsx`

**Intent**  
Fix section vertical rhythm (`space-y-8`), upgrade SectionHeader title to `text-base`, fix off-grid spacing (`p-3.5` → `p-3` / `p-4`), fix button text size consistency, remove `rounded-3xl` from `GlassCard`, unify progress bar height to `h-2`.

**Expected Outcomes**
- Outer wrapper: `space-y-6` → `space-y-8`
- `SectionHeader` h3: `text-sm` → `text-base`
- `GlassCard` component: `rounded-3xl` → `rounded-2xl`
- Today's Tasks list items: `p-3.5` → `p-4`
- Hero CTA buttons: both `text-base` → `text-sm` (consistent with rest of app)
- Inline "Continue Learning" button inside Section 3 card: already `text-xs` — change to `text-sm`
- Section 3 module progress bar: `h-2 rounded-full` (check — make uniform)
- Section 6 activity progress bar: `h-2.5` → `h-2`
- Section 8 Quick Actions: snap icon wrapper `rounded-xl` ✓; cards `rounded-3xl` — change to `rounded-2xl` via `GlassCard` fix

**Todo List**
1. Change outer `space-y-6` → `space-y-8` on the root div
2. In `SectionHeader`: change h3 `text-sm` → `text-base`
3. In `GlassCard`: change `rounded-3xl` → `rounded-2xl`
4. Hero section buttons: `text-base` → `text-sm`
5. Today's Tasks `<li>`: `p-3.5` → `p-4`
6. Section 3 Continue Learning button: `text-xs` → `text-sm`
7. Section 6 activity bar: `h-2.5` → `h-2`; `rounded-full` check ✓
8. Loading skeleton cards: `rounded-2xl` ✓; `bg-white/5` border → `border-white/10` ✓
9. Section 2 snapshot card GlassCard wrappers: padding `p-4` — keep as compact variant ✓

**Relevant Context**
- [`HomeView.tsx`](src/components/HomeView.tsx:82) — `GlassCard`, `SectionHeader`, `HomeView`
- Depends on Sub-Task 1 (glass card CSS now owns radius)

**Status** — `[ ] pending`

---

### Sub-Task 6 — Module Card & Lesson Item: `ModuleCard.tsx`, `LessonItem.tsx`

**Intent**  
Fix the horizontal divider border strength inside `ModuleCard`. Ensure `LessonItem` touch targets meet 44 px minimum. Confirm radius values are consistent with the established system.

**Expected Outcomes**
- `ModuleCard` divider: `dark:bg-white/5` → `dark:bg-white/10`
- `ModuleCard` outer card: already `rounded-2xl` ✓; hover shadow: `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`
- `LessonItem` row: `py-3` gives ~44 px with `text-sm` — verify and add `min-h-[44px]` if needed
- `LessonItem` "Continue Learning" badge: `rounded-full` ✓; `text-xs` ✓

**Todo List**
1. `ModuleCard`: divider `dark:bg-white/5` → `dark:bg-white/10`
2. `ModuleCard`: hover shadow `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`
3. `LessonItem`: add `min-h-[44px]` to the motion.div row for touch target compliance
4. `LessonItem`: confirm `stroke-[2px]` on icons (default Lucide) — no change needed

**Relevant Context**
- [`ModuleCard.tsx`](src/components/ModuleCard.tsx:133)
- [`LessonItem.tsx`](src/components/LessonItem.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 7 — Lesson Play View: `LessonPlayView.tsx`

**Intent**  
Fix the invisible `border-white/5` structural borders throughout the lesson view. Standardise content panel padding. Upgrade body text size. Fix the completion banner shadow. Fix quiz option radius and button hierarchy.

**Expected Outcomes**
- All `border-white/5` structural borders → `border-white/10`
- Content panel `p-6` → `p-5`; `rounded-3xl` → `rounded-2xl`
- Lesson prose: `text-xs md:text-sm` → `text-sm` (always readable)
- Quiz options: `rounded-lg` → `rounded-xl`; `p-3.5` → `p-3`
- Quiz submit button: padding `px-5 py-2.5 text-xs` → `px-5 py-2.5 text-sm`
- Completion banner shadow `0_4px_30px` → `0_4px_16px` (max 16 px spread)
- Completion claim button: `rounded-lg` → `rounded-xl`
- Code editor outer container: `border-white/5` → `border-white/10`

**Todo List**
1. Header bar `border-white/5` → `border-white/10`
2. Content panel: `p-6 rounded-3xl` → `p-5 rounded-2xl`
3. Lesson prose: `text-xs md:text-sm` → `text-sm`
4. Quiz question containers: `border-white/5` → `border-white/10`
5. Quiz options: `rounded-lg` → `rounded-xl`; `text-xs` on submit button → `text-sm`
6. Quiz results panel `bg-[#0A0A0A] border-white/5` → `bg-white/[0.03] border-white/10`
7. Explanation panel `bg-[#0A0A0A] border-white/5` → `bg-white/[0.03] border-white/10`
8. Completion banner `shadow-[0_4px_30px_...]` → `shadow-[0_4px_16px_rgba(16,185,129,0.12)]`
9. Completion claim button `rounded-lg` → `rounded-xl`
10. Code editor divs: `border-white/5` → `border-white/10`; all `bg-[#0A0A0A]`/`bg-[#111111]` inner panels use `rounded-xl` not `rounded-2xl`

**Relevant Context**
- [`LessonPlayView.tsx`](src/components/LessonPlayView.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 8 — Mentor Chat View: `MentorChatView.tsx`

**Intent**  
Unify the three bottom-zone padding values. Fix `text-[9px]` / `text-[10px]` code block labels to `text-xs`. Fix structural `border-white/5` borders. Standardise input field border strength and radius. Fix chat message bubble radius.

**Expected Outcomes**
- Helper chip strip: `p-3` → `px-4 py-2` (matches input form horizontal padding)
- Input form: `p-3` → `px-4 py-3`
- Code block header labels: `text-[10px]` / `text-[9px]` → `text-xs`
- Message bubbles: already `rounded-2xl` ✓
- Suggested prompts panel: `border-white/5` → `border-white/10`; button borders `border-white/5` → `border-white/10`
- Chat input field: `border-white/5` → `border-white/10`; `rounded-xl` ✓
- Top info bar: `border-white/5` → `border-white/10`

**Todo List**
1. Top info bar `border-b border-white/5` → `border-b border-white/10`
2. Suggested prompts panel `border-t border-white/5` → `border-t border-white/10`; prompt buttons `border-white/5` → `border-white/[0.08]`
3. Helper action strip: change wrapper `border-t border-white/5` → `border-t border-white/10`; change `p-3` → `px-4 py-2`
4. Input form: change `p-3` → `px-4 py-3`; chat input `border-white/5` → `border-white/10`
5. Code block pre header `text-[10px]` → `text-xs`; "Code Walkthrough" badge `text-[9px]` → `text-xs`
6. Attachment / error banners: `rounded` → `rounded-xl`; keep `border-purple-500/30`
7. Typing indicator bubble `border border-white/5` → `border border-white/10`

**Relevant Context**
- [`MentorChatView.tsx`](src/components/MentorChatView.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 9 — Analytics & Profile Views: `TabsScreen.tsx`

**Intent**  
Fix progress bar height inconsistency (`h-1.5` → `h-2`). Fix section vertical rhythm (`space-y-6` → `space-y-8`). Fix stat card radius (`rounded-3xl` → `rounded-2xl`) and remove `shadow-md`. Fix profile card radius. Fix subtitle typography (`text-xs` → `text-sm`). Standardise checkout button to use `buttonStyles.primary` sizing pattern.

**Expected Outcomes**
- Analytics section outer wrapper: `space-y-6` → `space-y-8`
- Progress bars in "Completion Speed" section: `h-1.5` → `h-2`
- Stat grid cards: `rounded-3xl` → `rounded-2xl`; `shadow-md` removed
- Analytics page subtitle: `text-xs` → `text-sm`
- Profile info card: `rounded-3xl` → `rounded-2xl`
- Settings panels: `rounded-3xl` → `rounded-2xl`
- Subscription panel button padding: already `py-2.5` ✓
- Profile badge `rounded-xl` → `rounded-lg` (compact badge, not a button — use `rounded-md`)

**Todo List**
1. `AnalyticsView` root div: `space-y-6` → `space-y-8`
2. Analytics subtitle `text-xs text-zinc-300` → `text-sm text-zinc-400`
3. Overall progress ring card: `rounded-3xl` → `rounded-2xl`
4. Stat grid items: `rounded-3xl` → `rounded-2xl`; remove `shadow-md`
5. Progress bars in Completion Speed: `h-1.5` → `h-2`; track `bg-white/5 rounded-full` → `bg-white/10 rounded-full`
6. Mastery wheel SVG card: `rounded-3xl` → `rounded-2xl`
7. Completion Speed card: `rounded-3xl` → `rounded-2xl`
8. `ProfileView` root `space-y-6` → `space-y-8`
9. Profile info card: `rounded-3xl` → `rounded-2xl`
10. Profile plan badge `rounded-xl` → `rounded-md`
11. Settings panel card: `rounded-3xl` → `rounded-2xl`
12. Subscription panel card: `rounded-3xl` → `rounded-2xl`
13. Install app card: `rounded-3xl` → `rounded-2xl`
14. Theme mode display box: `rounded-xl` ✓ — keep

**Relevant Context**
- [`TabsScreen.tsx`](src/components/TabsScreen.tsx) — `AnalyticsView`, `ProfileView`

**Status** — `[ ] pending`

---

### Sub-Task 10 — Roadmap Generator Form: `RoadmapGeneratorForm.tsx`

**Intent**  
Ensure input/select fields match the `rounded-xl` standard. Confirm button hierarchy (primary/cancel). Fix loading state panel radius.

**Expected Outcomes**
- Goal input: already `rounded-xl` ✓
- Experience/Style selects: already `rounded-xl` ✓
- Goal chip buttons: `rounded-full` ✓ — keep
- Submit button: uses `buttonStyles.primary` ✓ with `rounded-xl` ✓
- Cancel button: `rounded-xl` ✓, styling consistent with secondary button system
- Loading panel inner `rounded-xl` ✓; outer container `rounded-2xl` ✓

**Todo List**
1. Outer form container: `rounded-2xl` ✓ — verify; `border-zinc-200 dark:border-white/10` ✓
2. Header border-b: `border-zinc-200 dark:border-white/10` ✓
3. Loading panel: `border-t border-zinc-100 dark:border-white/5` → `border-t border-zinc-100 dark:border-white/10`
4. Cancel button `bg-zinc-100 dark:bg-white/5` — this is the secondary pattern ✓; ensure `rounded-xl` ✓
5. No other changes needed — this file is largely consistent

**Relevant Context**
- [`RoadmapGeneratorForm.tsx`](src/components/RoadmapGeneratorForm.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 11 — Onboarding Wizard: `OnboardingWizard.tsx`

**Intent**  
Fix the main wizard card border (`border-white/8` → `border-white/10`). Upgrade step question headings to `text-xl` (matching h2 token). Fix option button radius to `rounded-xl`. Fix background from hardcoded `#0A0A0A` to use `dark:bg-zinc-950` Tailwind token. Fix next button to use standard `buttonStyles.primary` pattern.

**Expected Outcomes**
- Wizard card: `border-white/8` → `border-white/10`; `bg-[#111]` → `dark:bg-zinc-900`; `rounded-2xl` ✓
- Step headings: `text-lg` → `text-xl`
- Experience level / style option buttons: `rounded-xl` ✓ — confirm
- Weekly hour buttons: `rounded-lg` → `rounded-xl`
- Next button: padding `px-6 py-2.5 rounded-xl` ✓; text `text-sm` ✓
- Page background: `bg-[#0A0A0A]` → `bg-zinc-950` (semantic token)

**Todo List**
1. Page wrapper `bg-[#0A0A0A]` → `bg-zinc-950`
2. Wizard card `bg-[#111] border border-white/8 rounded-2xl` → `dark:bg-zinc-900 border border-white/10 rounded-2xl`
3. Step headings: `text-lg font-semibold` → `text-xl font-semibold`
4. Weekly hour buttons: `rounded-lg` → `rounded-xl`
5. Step dot progress: already correct `rounded-full` ✓
6. Back button touch target: add `px-2 py-1` wrapper for easier tap

**Relevant Context**
- [`OnboardingWizard.tsx`](src/components/OnboardingWizard.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 12 — Phase Detail Page: `PhaseDetailPage.tsx`

**Intent**  
Fix tab button radius (`rounded-lg` → `rounded-xl`). Fix GateStat inner border strength. Fix `border-white/5` on ProjectSection features panel. Fix InlineQuiz option padding (`p-3.5` → `p-4`). Fix `h-1.5` progress bar → `h-2`. Fix InlineQuiz submit button to use proper ghost pattern.

**Expected Outcomes**
- Tab buttons: `rounded-lg` → `rounded-xl`
- GateStat cells: `rounded-xl` ✓ — keep
- Features panel `border-white/5` → `border-white/[0.06]` (intentionally nested faint)
- GitHub input: `rounded-lg` → `rounded-xl`
- InlineQuiz progress bar: `h-1.5` → `h-2`; track `bg-zinc-100 dark:bg-white/10`
- InlineQuiz option buttons: `p-3.5` → `p-4`
- InlineQuiz "Submit" button (dark bg): replace with proper secondary style `bg-white/8 border border-white/10 text-sm font-bold rounded-xl px-5 py-2`
- InlineQuiz "Exit Quiz" ghost button: add `py-1` for touch target

**Todo List**
1. Tab bar buttons: `rounded-lg` → `rounded-xl`
2. `InlineQuiz` progress bar: `h-1.5` → `h-2`; track class `bg-zinc-100 dark:bg-white/10`
3. `InlineQuiz` option buttons: `p-3.5` → `p-4`
4. `InlineQuiz` Submit button: `bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl` — this inverted style is acceptable as a distinct submit state; ensure `px-5 py-2` ✓
5. GitHub input: `rounded-lg` → `rounded-xl`
6. Features list panel `border-white/5` → `border-white/[0.06]`
7. `ProjectSection` slider `h-2` `accent-purple-600` ✓ — keep

**Relevant Context**
- [`PhaseDetailPage.tsx`](src/components/PhaseDetailPage.tsx:257)

**Status** — `[ ] pending`

---

### Sub-Task 13 — Quiz Tab: `QuizTab.tsx`

**Intent**  
Fix the `QuizCard` shadow (`shadow-lg` is too heavy for a peer card). Fix the `ActiveQuiz` option button text size (`text-base` → `text-sm`). Fix `PrepResource` item radius. Fix `Header` component shadow. Fix `QuizResultDisplay` Trophy icon oversizing. Standardise `Next Question` button radius.

**Expected Outcomes**
- `QuizCard`: `shadow-lg` → no extra shadow (glass CSS owns it); `rounded-2xl` ✓
- `QuizCard` CTA button: gradient `from-violet-600 to-blue-600` — acceptable; `rounded-xl` ✓
- `ActiveQuiz` outer container: `shadow-lg` → removed; `rounded-2xl` ✓
- `ActiveQuiz` option text: `text-base font-semibold` → `text-sm font-medium`
- `ActiveQuiz` Next/Finish button: `rounded-lg` → `rounded-xl`
- `ActiveQuiz` Submit button: `rounded-lg` → `rounded-xl`
- `PrepResource` link: `rounded-lg` ✓ — acceptable for nested item
- `Header` section: `shadow-lg` → removed; `border-white/10` ✓
- `QuizResultDisplay`: Trophy `w-16 h-16` → `w-12 h-12` (oversized for inline card)
- `QuizResultDisplay` XP text: `text-lg font-bold text-green-400` — `text-green-400` inconsistent with `text-emerald-400` used elsewhere → `text-emerald-400`

**Todo List**
1. `Header`: remove `shadow-lg`
2. `QuizCard`: remove `shadow-lg`
3. `QuizCard` stats inner panel: `rounded-lg` → `rounded-xl`
4. `ActiveQuiz` container: remove `shadow-lg`
5. `ActiveQuiz` option buttons: `text-base font-semibold` → `text-sm font-medium`; `p-4` ✓
6. `ActiveQuiz` "Next Question" / "Finish" button: `rounded-lg` → `rounded-xl`
7. `ActiveQuiz` "Submit" button: `rounded-lg` → `rounded-xl`
8. `QuizResultDisplay` Trophy: `w-16 h-16` → `w-12 h-12`
9. `QuizResultDisplay` XP earned: `text-green-400` → `text-emerald-400`

**Relevant Context**
- [`QuizTab.tsx`](src/components/QuizTab.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 14 — Roadmap Overview & Lists: `RoadmapOverviewPage.tsx`, `RoadmapsList.tsx`

**Intent**  
Fix the hero banner shadow (`shadow-xl` → soft shadow). Fix progress ring label `text-[9px]` → `text-xs`. Fix phase card hover shadow. Fix `RoadmapsList` progress bar height (`h-1.5` → `h-2`). Fix the empty-state icon container radius in `RoadmapsList`.

**Expected Outcomes**
- Hero banner: `shadow-xl` → `shadow-[0_4px_20px_rgba(79,70,229,0.18)]`
- Progress ring inner label: `text-[9px]` → `text-xs`
- Phase cards: hover `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`
- Phase status badges `text-[10px]` → `text-xs`
- `RoadmapsList` progress bars: `h-1.5` → `h-2`; track `bg-white/5` → `bg-white/10`
- `RoadmapsList` hover: add `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`

**Todo List**
1. Hero banner: `shadow-xl` → `shadow-[0_4px_20px_rgba(79,70,229,0.18)]`
2. Progress ring "done" label: `text-[9px]` → `text-xs`
3. Phase card hover: `hover:shadow-md` → `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`
4. Phase status badges `text-[10px]` → `text-xs`
5. `RoadmapsList` card hover: add `hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)]`
6. `RoadmapsList` progress bar track: `h-1.5 bg-white/5` → `h-2 bg-white/10`
7. `RoadmapsList` progress bar fill: `h-1.5` → `h-2`

**Relevant Context**
- [`RoadmapOverviewPage.tsx`](src/components/RoadmapOverviewPage.tsx)
- [`RoadmapsList.tsx`](src/components/RoadmapsList.tsx)

**Status** — `[ ] pending`

---

### Sub-Task 15 — AI Insights Tab & Profile Menu: `AIInsightsTab.tsx`, `ProfileMenu.tsx`

**Intent**  
Fix `AIInsightsTab` stat card radius (`rounded-xl` → `rounded-2xl` for top-level cards). Fix `NoHistoryYet` background `bg-black/20`. Fix `ProfileMenu` panel shadow. Fix profile menu gradient divider. Fix AI insight item radius.

**Expected Outcomes**
- `AIInsightsTab` stat cards: `rounded-xl` → `rounded-2xl`; keep `bg-white/5` as the base (these are non-glass flat cards)
- Chart section cards: `rounded-2xl` ✓
- `NoHistoryYet`: `bg-black/20` → `bg-white/[0.03]`; `rounded-lg` → `rounded-xl`
- AI insight items: `rounded-lg` → `rounded-xl`
- `ProfileMenu` panel: `shadow-xl shadow-black/40` → `shadow-[0_8px_24px_rgba(0,0,0,0.14)]`
- `ProfileMenu` gradient divider: replace `bg-gradient-to-r from-transparent via-white/10 to-transparent` → `bg-white/10` plain `h-px`
- `ProfileMenu` `rounded-2xl` panel ✓ — keep

**Todo List**
1. `AIInsightsTab` StatCard inner div: `rounded-xl` → `rounded-2xl`
2. `NoHistoryYet`: `bg-black/20` → `bg-white/[0.03]`; `rounded-lg` → `rounded-xl`
3. AI Mentor Insights items: `rounded-lg` → `rounded-xl`; `bg-black/20` → `bg-white/[0.03]`
4. `ProfileMenu` panel: `shadow-xl shadow-black/40` → `shadow-[0_8px_24px_rgba(0,0,0,0.14)]`
5. `ProfileMenu` divider: replace gradient div → `<div className="my-2 h-px bg-white/10" />`

**Relevant Context**
- [`AIInsightsTab.tsx`](src/components/AIInsightsTab.tsx)
- [`ProfileMenu.tsx`](src/components/ProfileMenu.tsx)

**Status** — `[ ] pending`

---

## Implementation Order

Sub-tasks are ordered by dependency. Sub-Task 1 must go first (establishes CSS foundations). Sub-Tasks 2–15 are independent of each other after that.

```
1 → Foundation (CSS + theme tokens)
2 → Navigation
3 → Badges
4 → Cards
5 → HomeView        (depends on Sub-Task 4's GlassCard radius pattern)
6 → ModuleCard + LessonItem
7 → LessonPlayView
8 → MentorChatView
9 → TabsScreen
10 → RoadmapGeneratorForm
11 → OnboardingWizard
12 → PhaseDetailPage
13 → QuizTab
14 → RoadmapOverview + RoadmapsList
15 → AIInsightsTab + ProfileMenu
```

---

## Constraints

- No new components created
- No business logic changes
- No routing changes
- No new feature additions
- Only Tailwind class swaps, minor CSS edits in `index.css`, and token additions to `theme.ts`
- All changes must be visually backward-compatible (no layout shifts, no colour meaning changes)
- Light mode overrides in `index.css` are not touched unless they directly relate to a border/shadow fix
