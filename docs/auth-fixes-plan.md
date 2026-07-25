# Auth Fixes Plan

## Overview

Three small, targeted fixes to close the gaps identified during the authentication audit:

1. **Register password policy** — wire the server-side `validatePassword()` rules (letter+digit, common-password blocklist) into `Register.tsx` so the same rules are enforced client-side before calling Supabase.
2. **AppShell loading state** — show the `SplashScreen` while `isLoadingAuth` is true so the `AuthGateway` (sign-in page) never flashes briefly during the session check on page load.
3. **Remove dead `ProtectedRoute`** — the component is defined but has no usages. Delete it to keep the codebase clean.

No architectural changes. No new dependencies.

---

## Sub-Tasks

---

### Sub-Task 1 — Wire password validation rules into Register

**Status:** `[ ] pending`

**Intent**

`validatePassword()` in `src/server/lib/middleware.ts` enforces a letter+digit rule and a common-password blocklist, but it is never called on the registration path. The client only checks `password.length < 10`. This sub-task mirrors the same rules on the client so Supabase is never called with a weak or common password.

Since `validatePassword()` is a pure function with no server dependencies, it can be duplicated inline (or as a tiny shared util), but the simplest minimal change is to replicate the same two rules directly inside `Register.tsx`'s submit handler.

**Expected Outcomes**

- Submitting a password that passes the length check but contains only digits (e.g. `1234567890`) shows a specific error: _"Password must contain at least one letter and one number."_
- Submitting a known-common password (e.g. `password12`) shows: _"Password is too common — please choose a less predictable one."_
- The existing error for name/email/length/mismatch is unchanged.
- Supabase `signUp` is never called if `validatePassword()` returns a non-null error.

**Todo List**

1. Open `src/pages/Register.tsx`.
2. In the `submit` handler, after the existing inline guard, call the same two rules that `validatePassword()` uses:
   - Letter+digit check: `/[A-Za-z]/.test(password) && /[0-9]/.test(password)`
   - Common-password blocklist (copy the same 16 values from `middleware.ts`)
3. If either rule fails, call `setError(message)` and `return` — do not call `authService.register()`.
4. Update the existing inline hint text on the password field to mention "at least one letter and one number" so the requirement is visible upfront.

**Relevant Context**

- `src/pages/Register.tsx` — submit handler (line 6–7)
- `src/server/lib/middleware.ts` — `validatePassword()` (line 275), `COMMON_PASSWORDS` set (line 268)
- Do NOT import from `src/server/lib/middleware.ts` in client code — the rules must be replicated inline.

---

### Sub-Task 2 — Show SplashScreen while auth is loading in AppShell

**Status:** `[x] done`

**Intent**

`AppShell` in `src/App.tsx` has an `isLoadingAuth` check (line 333) that currently renders a full app shell skeleton (header + loading home view). This means the `AuthGateway` sign-in page cannot flash because loading always shows the skeleton — but the skeleton itself is a heavier-than-needed render for the brief period before the session is resolved. More importantly, when the user is _not_ authenticated the transition from skeleton → auth gateway is jarring.

The fix: when `isLoadingAuth` is true and the user is not yet authenticated (i.e. cold page load), show `SplashScreen` instead of the skeleton. Once the session resolves, either bootstrap continues into the app or the auth gateway renders.

**Expected Outcomes**

- Hard page refresh shows the `SplashScreen` briefly, then transitions to either the app (authenticated) or the `AuthGateway` (unauthenticated). No skeleton flash.
- Authenticated refresh still resolves cleanly — `SplashScreen` → app.
- The existing `isLoadingAuth` skeleton path for an already-loaded app (tab changes, token refresh) is not affected.

**Todo List**

1. Open `src/App.tsx` and find the `isLoadingAuth` block in `AppShell` (line 333).
2. Replace the condition so that `isLoadingAuth && !isAuthenticated` (i.e. the initial cold-load check before any session has been established) renders `<SplashScreen />` instead of the full skeleton.
3. Keep the existing skeleton render for `isLoadingAuth && isAuthenticated` — this covers token refresh while already in the app.
4. Confirm `SplashScreen` is already imported in `App.tsx` (it is, line 18) — no new import needed.

**Relevant Context**

- `src/App.tsx` — `AppShell` function (line 77), `isLoadingAuth` check (line 333)
- `src/components/SplashScreen.tsx` — no props, already imported
- `src/auth/AuthProvider.tsx` — `isLoadingAuth` starts `true`, set to `false` after `bootstrap()` or a missing session

---

### Sub-Task 3 — Delete unused ProtectedRoute

**Status:** `[x] done`

**Intent**

`src/auth/ProtectedRoute.tsx` exports a `ProtectedRoute` component that is never imported or used anywhere in the codebase. Keeping it creates the false impression that route protection passes through it. Deleting it removes the confusion.

**Expected Outcomes**

- `src/auth/ProtectedRoute.tsx` no longer exists.
- No TypeScript errors or broken imports.
- No runtime behaviour changes.

**Todo List**

1. Confirm there are zero imports of `ProtectedRoute` across the codebase (grep result confirmed: only the definition file references it).
2. Delete `src/auth/ProtectedRoute.tsx`.

**Relevant Context**

- `src/auth/ProtectedRoute.tsx` — the only file, no external references.
