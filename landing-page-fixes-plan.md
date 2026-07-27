# Landing Page User-Ready Fixes — Plan

## Overview

The landing page (`src/components/LandingPage.tsx`) is visually complete but has trust, conversion, accessibility, and correctness gaps that must be resolved before it is user-ready. This plan addresses every identified issue in priority order.

**Key constraints confirmed via code research:**
- Stats (`roadmapsGenerated`, `skillsCovered`) come from real DB queries in `/api/public-stats` — **no fabricated fallback numbers**. When the API fails or returns zero, the stat cards must be hidden or shown with neutral copy, not inflated values.
- `onGetStarted` navigates via `window.history.pushState` + `PopStateEvent` (no router library). The loading state must stay active until the component unmounts (navigation replaces it) — no artificial delays.
- No official Twitter/X account is confirmed active — **remove social link sub-task entirely**. The `@learnpathai` handle in `index.html` meta tags is kept as-is (used only for SEO metadata).
- No real product screenshots exist in the project. Screenshot replacement is included as a low-effort advisory sub-task (capture + drop-in), not a code-heavy task.

The work is split into 8 focused sub-tasks. Each is self-contained and reviewable independently.

---

## Sub-Task 1 — Fix Broken Tailwind Class (`py-18`) & Stat Fallback Behaviour

**Status:** `[x] done`

**Intent:**
Fix two correctness bugs: (1) `py-18` in the final CTA section is not a valid Tailwind utility and renders with zero padding; (2) The stats array uses `value: 0` as the API fallback for "Roadmaps Generated" and "Skills Covered" — these are real DB values, so fabricating a floor number is not acceptable. When the API returns 0 (early launch) or fails, the two dynamic cards must be hidden rather than displaying "0".

**Expected Outcomes:**
- Final CTA section has correct vertical padding at all breakpoints.
- When `liveStats === null` (fetch failed) or when `liveStats.roadmapsGenerated === 0`, the "Roadmaps Generated" and "Skills Covered" stat cards are not rendered.
- The stats grid adapts gracefully — showing 2 or 4 cards depending on availability.
- The static stats ("180+ Topics Available", "100% Free to Start") always show.

**Todo List:**
1. In `src/components/LandingPage.tsx` line 834, change `py-18` → `py-16` in the final CTA inner div className.
2. In `src/components/LandingPage.tsx` in the stats rendering block (lines 688–709):
   - Build a filtered array of `StatCard` entries to render: always include slots 2 and 3 (static stats); include slot 0 only when `statsLoading || (liveStats && liveStats.roadmapsGenerated > 0)`; include slot 1 only when `statsLoading || (liveStats && liveStats.skillsCovered > 0)`.
   - Derive the column count from the number of visible cards: 4 cards → `lg:grid-cols-4`, 3 cards → `lg:grid-cols-3`, 2 cards → `lg:grid-cols-2`, 1 card → `grid-cols-1`. Keep `sm:grid-cols-2` as the tablet baseline for all cases so the grid never looks sparse on narrow screens.
   - Replace the current `stats.map(...)` loop with a render of the filtered array, passing `loading` only to the dynamic slots while they are still loading.
3. In `src/components/landing/landingData.ts` lines 141–142, add a comment above the two dynamic stat entries clarifying that `value: 0` is a sentinel meaning "hide this card once the live fetch settles"; do not change the value itself.

**Relevant Context:**
- `src/components/LandingPage.tsx` line 834 — final CTA inner div with `py-18`
- `src/components/LandingPage.tsx` lines 687–709 — stats grid div and rendering loop
- `src/components/landing/landingData.ts` lines 140–145 — stats array (slots 0 & 1 are dynamic; slots 2 & 3 are static)
- `src/server/routes/user.ts` lines 362–383 — `/api/public-stats` returns real DB counts; on DB error returns `{ roadmapsGenerated: 0, skillsCovered: 0 }`

---

## Sub-Task 2 — Remove Unverifiable "Verified" Badge from Testimonials

**Status:** `[x] done`

**Intent:**
The "Verified" badge on testimonial cards is rendered from a hardcoded `verified: true` field — it is not verified by any third party. Displaying it misleads first-time visitors and is a trust liability.

**Expected Outcomes:**
- No green "Verified" badge appears on any testimonial card.
- The rest of the testimonial card layout (stars, quote, name, role, date) is unchanged.

**Todo List:**
1. In `src/components/LandingPage.tsx`, remove the `{t.verified && (...)}` conditional block (lines 738–743) that renders the Verified span.
2. Optionally remove the `verified` field from each testimonial object in `src/components/landing/landingData.ts` lines 125–128 to keep data clean.

**Relevant Context:**
- `src/components/LandingPage.tsx` lines 738–743 — Verified badge conditional block
- `src/components/landing/landingData.ts` lines 124–128 — testimonials array

---

## Sub-Task 3 — Add Skip-to-Main-Content Accessibility Link

**Status:** `[x] done`

**Intent:**
Keyboard-only and screen-reader users must tab through the full navigation before reaching the hero. A visually-hidden skip link at the very top of the page that jumps to `#hero-heading` resolves this WCAG 2.1 SC 2.4.1 requirement.

**Expected Outcomes:**
- The first focusable element on the page is an `<a href="#hero-heading">Skip to main content</a>` link.
- It is visually hidden until focused, then appears as a clearly styled overlay button.
- Activating it moves keyboard focus directly to the hero `<h1>`.

**Todo List:**
1. In `src/components/LandingPage.tsx`, just inside the outermost `<div>` wrapper (after line 83 — the `lp-light` root div), add an `<a>` anchor with `href="#hero-heading"`.
2. Style it with Tailwind: `sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:rounded-xl focus:bg-purple-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white`.
3. No changes needed to the target — `id="hero-heading"` is already on the `<h1>` at line 189.

**Relevant Context:**
- `src/components/LandingPage.tsx` line 83 — outermost wrapper `<div>`
- `src/components/LandingPage.tsx` line 189 — `id="hero-heading"` on `<h1>` already set
- `sr-only` is already used in the project (LandingHelpers.tsx line 106, LandingPage.tsx line 883)

---

## Sub-Task 4 — Add Mobile Navigation Drawer

**Status:** `[x] done`

**Intent:**
On screens below the `md` breakpoint, the desktop nav pill is hidden and only Sign In + Start Free buttons exist. There is no way to navigate to the Features or Preview sections on mobile. A hamburger toggle + slide-down panel exposes the full navigation on all screen sizes.

**Expected Outcomes:**
- A hamburger icon button appears on the right of the mobile header (alongside the existing Sign In and Start Free buttons, or replacing the current two-button layout with a cleaner three-item row).
- Tapping it opens an animated dropdown panel with links: Preview, Features, Sign In, Get Started.
- Each link closes the menu and triggers the correct action.
- The menu is keyboard-accessible: pressing Escape closes it.
- No layout shift occurs on desktop (hamburger is `md:hidden`).

**Todo List:**
1. Add `mobileMenuOpen` boolean state (`useState(false)`) to `LandingPage` alongside the existing state declarations (around line 48).
2. Add a `useEffect` that listens for `keydown` with `key === 'Escape'` and sets `mobileMenuOpen(false)`. Clean up the listener on unmount.
3. Add `Menu` and `X` icons to the lucide-react import at the top of `LandingPage.tsx`.
4. In the mobile CTAs section (line 150 — `<div className="flex items-center gap-2 md:hidden">`), add a third button using `Menu`/`X` icon that toggles `mobileMenuOpen`. Keep the existing Sign In and Start Free buttons.
5. Below the closing `</header>` tag (after line 166), add an `AnimatePresence`-wrapped `<motion.nav>` panel visible only when `mobileMenuOpen` is true and on `md:hidden`. The panel should:
   - Animate in with `initial={{ opacity: 0, y: -8 }}` / `animate={{ opacity: 1, y: 0 }}`.
   - Contain four items: Preview (calls `scrollToPreview` + close), Features (calls `scrollToFeatures` + close), Sign In (calls `onSignIn` + close), Get Started (calls `onGetStarted` + close).
   - Be styled consistently with the landing page light theme (white background, purple borders/text).
6. Wrap each menu item's action in a helper that also calls `setMobileMenuOpen(false)`.

**Relevant Context:**
- `src/components/LandingPage.tsx` lines 149–165 — existing mobile CTAs section
- `src/components/LandingPage.tsx` line 48 — where new `useState` should be inserted
- `src/components/LandingPage.tsx` line 166 — closing `</header>` tag
- `AnimatePresence` and `motion` already imported from `motion/react`
- `lucide-react` already imported — add `Menu` and `X` to the import list

---

## Sub-Task 5 — Add `id="preview"` and Hash-Scroll-on-Mount Effect

**Status:** `[x] done`

**Intent:**
The Preview section (`ref={previewRef}`) has no `id` attribute, so URLs like `/app#preview` do not scroll on load. The Features section has `id="features"` but there is also no hash handler. This prevents deep-linking to either section from external sources.

**Expected Outcomes:**
- `<section ref={previewRef}>` has `id="preview"`.
- On component mount, if `window.location.hash` is `#preview` or `#features`, the page scrolls to the correct section after a short tick (to allow DOM layout to settle).
- No changes to existing scroll ref behaviour (smooth-scroll buttons still work).

**Todo List:**
1. In `src/components/LandingPage.tsx` line 585, add `id="preview"` to the preview `<section>` element attribute list.
2. Add a `useEffect` with empty dependency array (runs once on mount) that checks `window.location.hash`:
   - If `#preview`, call `previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
   - If `#features`, call `featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
   - Wrap the scroll in a `setTimeout(..., 100)` to allow the component to fully mount before scrolling.

**Relevant Context:**
- `src/components/LandingPage.tsx` line 585 — `<section ref={previewRef}>`
- `src/components/LandingPage.tsx` line 423 — `<section ref={featuresRef} ... id="features">`
- `previewRef` and `featuresRef` are `useRef<HTMLElement | null>(null)` already defined at lines 49–50

---

## Sub-Task 6 — Add CTA Button Loading / Disabled State

**Status:** `[x] done`

**Intent:**
Clicking any "Get Started" / "Start Learning Free" button calls `onGetStarted()`, which immediately pushes to `/register` via the History API. The component should be replaced by the register view shortly after, but there is no visual feedback during that window — the button appears unresponsive and can be double-clicked.

The loading state should be active from the moment the button is clicked until the component unmounts (navigation takes over). No artificial delay. The spinner stays until the page transitions.

**Expected Outcomes:**
- Clicking a primary CTA button instantly disables it and shows a small inline spinner alongside "Starting…" text.
- All three primary CTA button instances behave consistently: hero, "Why LearnPath" section, and final CTA.
- If navigation fails for any reason (edge case), the button does not re-enable — it stays disabled (acceptable for this simple case, since navigation failure is not expected).
- Button visual: `opacity-80 cursor-not-allowed` when disabled; spinner is a small `animate-spin` circle.

**Todo List:**
1. Add `ctaLoading` boolean state (`useState(false)`) to `LandingPage` alongside existing state declarations.
2. Create a `handleGetStarted` `useCallback` that sets `ctaLoading(true)` then calls `onGetStarted()`. No reset — state persists until component unmounts on navigation.
3. In `src/components/LandingPage.tsx` line 223 (hero CTA), replace `onClick={onGetStarted}` with `onClick={handleGetStarted}`, add `disabled={ctaLoading}`, update button label and add spinner.
4. In `src/components/LandingPage.tsx` line 645 ("Why LearnPath" section CTA), apply same change.
5. In `src/components/LandingPage.tsx` line 853 (final CTA), apply same change.
6. Spinner implementation: a `<span>` with `inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent` displayed only when `ctaLoading` is true; replace `<ArrowRight>` icon with the spinner when loading.

**Relevant Context:**
- `src/components/LandingPage.tsx` line 223 — hero primary CTA button
- `src/components/LandingPage.tsx` line 645 — "Why LearnPath" section CTA button
- `src/components/LandingPage.tsx` line 853 — final CTA section button
- `src/App.tsx` lines 363–366 — `onGetStarted` implementation: `window.history.pushState({}, '', '/register'); window.dispatchEvent(new PopStateEvent('popstate'))` — synchronous, component unmounts shortly after

---

## Sub-Task 7 — Add Privacy/Data FAQ Items & ParticleCanvas Performance Fix

**Status:** `[x] done`

**Intent:**
The FAQ is missing answers to the two most common pre-signup concerns — data privacy and roadmap editability. Both are conversion blockers. Also apply a one-line `will-change: transform` performance hint to the ParticleCanvas to assist GPU compositing on Android.

**Expected Outcomes:**
- FAQ section contains 7 questions total, including "Is my data private?" and "Can I edit or change my roadmap?".
- `ParticleCanvas` canvas element has `willChange: 'transform'` style hint.

**Todo List:**
1. In `src/components/landing/landingData.ts`, append two new entries to `faqItems` (after line 136):
   - `{ question: 'Is my data private?', answer: 'Yes. Your learning data, roadmaps, and progress are stored securely and are never shared or sold to third parties. You can delete your account and all associated data at any time from your profile settings.' }`
   - `{ question: 'Can I edit or change my roadmap after it is generated?', answer: 'Yes. You can regenerate your roadmap at any time or adjust individual phases to match changes in your goals, schedule, or skill level.' }`
2. In `src/components/landing/ParticleCanvas.tsx` lines 79–83, add `style={{ willChange: 'transform' }}` prop to the `<canvas>` JSX element.

**Relevant Context:**
- `src/components/landing/landingData.ts` lines 130–136 — `faqItems` array (5 items currently)
- `src/components/landing/ParticleCanvas.tsx` lines 79–83 — canvas element JSX

---

## Sub-Task 8 — Replace Hero Mockup with Screenshot-Ready Image Component

**Status:** `[x] done`

**Intent:**
The hero right-hand panel is a large hand-coded CSS wireframe (`aria-hidden` decorative `<div>`, lines 264–401). Replace it with a real `<img>` element wired to a well-defined placeholder asset path, with lazy loading and a fixed aspect ratio container — so a real screenshot can be dropped into `public/` later with zero code changes. Also update the OG/Twitter image meta tags in `index.html` to point to the future OG asset path.

**Current state:**
- No real screenshots exist in the project yet (`public/` contains only app icons).
- The hero mockup is a `<div aria-hidden="true">` with extensive inline card content (lines 264–401).
- `og:image` and `twitter:image` both point to `/icon-512.png` (a square icon, not a social card).

**Expected Outcomes:**
- The hero right-hand panel renders an `<img>` with:
  - `src="/screenshot-dashboard.webp"` — drop `public/screenshot-dashboard.webp` later to make it live
  - `alt` matching the existing `aria-label` on the outer `<motion.div>` wrapper
  - `loading="lazy"` and `decoding="async"` for performance
  - `width={1040}` and `height={650}` (16:10 ratio) so the browser reserves layout space before the image loads, preventing Cumulative Layout Shift
  - `className="w-full h-auto rounded-[28px] object-cover"` to fill the card shell gracefully at all sizes
- The outer `<motion.div>` wrapper (glow halo, `role="img"`, `aria-label`, entrance animation) is preserved exactly — only the inner decorative block is replaced.
- When `screenshot-dashboard.webp` does not yet exist, the browser renders an empty styled card shell — no worse than the current wireframe for end users.
- A developer-facing comment is added above the `<img>`: `{/* Drop public/screenshot-dashboard.webp to activate */}`.
- `index.html` `og:image` and `twitter:image` updated from `/icon-512.png` → `/og-image.png` (1200×630 asset to be added separately).

**Todo List:**
1. In `src/components/LandingPage.tsx`, delete the entire inner `<div aria-hidden="true">` block (lines 264–401) — the hand-coded browser chrome, phase rows, XP ring, AI mentor chat preview, smart recommendation row.
2. In its place, inside the outer `<motion.div>` wrapper, insert:
   - The existing glow halo `<div>` (keep line 261 unchanged).
   - Then:
     ```jsx
     {/* Drop public/screenshot-dashboard.webp to activate */}
     <div
       aria-hidden="true"
       className="relative overflow-hidden rounded-[28px] border border-purple-200 bg-purple-50 shadow-[0_24px_64px_rgba(124,58,237,0.12),0_0_0_1px_rgba(168,85,247,0.08)]"
     >
       <img
         src="/screenshot-dashboard.webp"
         alt="LearnPath AI dashboard showing AI roadmap, progress tracking, and AI mentor chat"
         width={1040}
         height={650}
         loading="lazy"
         decoding="async"
         className="w-full h-auto rounded-[28px] object-cover"
       />
     </div>
     ```
3. Keep the outer `<motion.div>` (lines 252–262), its `role="img"`, `aria-label`, className, and animation props entirely unchanged.
4. In `index.html` line 22, change `og:image` content from `/icon-512.png` → `/og-image.png`.
5. In `index.html` line 30, change `twitter:image` content from `/icon-512.png` → `/og-image.png`.

**Note:** `public/screenshot-dashboard.webp` and `public/og-image.png` do not need to exist yet. When they are added, the hero image and social share card go live automatically with no further code changes.

**Relevant Context:**
- `src/components/LandingPage.tsx` lines 252–262 — outer `<motion.div>` wrapper + glow halo (preserve)
- `src/components/LandingPage.tsx` lines 264–401 — entire inner decorative block to delete and replace
- `index.html` line 22 — `og:image` meta (`/icon-512.png`)
- `index.html` line 30 — `twitter:image` meta (`/icon-512.png`)
- `public/` — target directory for both assets when ready

---

## File Change Summary

| File | Sub-Tasks |
|------|-----------|
| `src/components/LandingPage.tsx` | 1, 2, 3, 4, 5, 6, 8 |
| `src/components/landing/landingData.ts` | 1, 2, 7 |
| `src/components/landing/ParticleCanvas.tsx` | 7 |
| `index.html` | 8 |

No backend changes are required. No new files are created by the code changes — `public/screenshot-dashboard.webp` and `public/og-image.png` are assets to be added separately when screenshots are available.
