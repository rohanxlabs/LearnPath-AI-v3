# Persistent Login Implementation Guide

## Overview

LearnPath now implements **fully persistent authentication** using Supabase Auth. Users only need to log in once, and their session persists across:

- ✅ Page refreshes
- ✅ Browser restarts  
- ✅ PWA close/reopen
- ✅ Multiple tabs
- ✅ Offline mode (cached credentials)

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Opens LearnPath                      │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
            ┌───────────────────────┐
            │   AuthProvider Init   │
            │  (useEffect on mount) │
            └───────────┬───────────┘
                        ↓
            ┌───────────────────────┐
            │ supabase.auth         │
            │   .getSession()       │ ← Checks localStorage
            └───────────┬───────────┘
                        ↓
                 ┌──────┴──────┐
                 │             │
            ┌────▼────┐   ┌───▼────┐
            │ Session │   │   No   │
            │  Found  │   │ Session│
            └────┬────┘   └───┬────┘
                 │            │
                 │            ↓
                 │     ┌──────────────┐
                 │     │ Show Login   │
                 │     │    Screen    │
                 │     └──────────────┘
                 ↓
      ┌──────────────────┐
      │ bootstrap(email) │ ← Fetch user data
      └────────┬─────────┘
               ↓
    ┌────────────────────┐
    │ GET /api/bootstrap │ ← Load profile, roadmaps, etc.
    └────────┬───────────┘
             ↓
  ┌──────────────────────┐
  │ setIsAuthenticated   │
  │      (true)          │
  └──────────┬───────────┘
             ↓
    ┌────────────────┐
    │  Open App UI   │
    └────────────────┘
```

### Session Storage

**Where credentials are stored:**
- **Location**: `localStorage` (browser built-in storage)
- **Key**: `sb-auth-token` (Supabase default)
- **Contents**: 
  - Access token (JWT)
  - Refresh token
  - User metadata
  - Expiration timestamp

**Security:**
- ✅ Password is NEVER stored locally
- ✅ Only access/refresh tokens are persisted
- ✅ Tokens are automatically refreshed before expiration
- ✅ Tokens are cleared on explicit logout

## Implementation Details

### 1. Supabase Client Configuration

**File**: `src/lib/supabaseClient.ts`

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,              // Enable session persistence
    storage: window.localStorage,      // Explicitly use localStorage
    autoRefreshToken: true,            // Auto-refresh before expiry
    detectSessionInUrl: true,          // Handle OAuth redirects
    storageKey: 'sb-auth-token',      // Custom storage key
  },
});
```

### 2. AuthProvider Session Restoration

**File**: `src/auth/AuthProvider.tsx`

The `AuthProvider` handles session restoration on mount:

```typescript
useEffect(() => {
  // Check for existing session (handles page refresh)
  supabase.auth.getSession().then(({ data, error }) => {
    if (data.session?.user.email) {
      bootstrap(data.session.user.email);  // Restore user state
    } else {
      setIsLoadingAuth(false);             // Show login screen
    }
  });

  // Listen for auth state changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      bootstrap(session.user.email);
    }
    if (event === 'SIGNED_OUT') {
      clear();  // Clear local state
    }
  });

  return () => subscription.unsubscribe();
}, []);
```

**Key Events:**
- `SIGNED_IN` - User just logged in
- `SIGNED_OUT` - User logged out
- `TOKEN_REFRESHED` - Token auto-refreshed (happens automatically)
- `PASSWORD_RECOVERY` - User clicked password reset link

### 3. Bootstrap Function

**Purpose**: Load user data from the database after session is confirmed.

**What it fetches** (`/api/bootstrap`):
- User profile (name, avatar, XP, level, streak)
- Settings (theme, notifications)
- Achievements
- System notifications
- AI chat history
- Activity log
- User's roadmaps (up to 50)

**Error Handling**:
- Retries 3 times on server errors (503/502/504)
- Only clears auth state on definitive failures (401/403)
- Preserves state on transient errors (network issues)

### 4. Logout Flow

**File**: `src/auth/AuthProvider.tsx` → `handleLogout()`

```typescript
const handleLogout = async () => {
  // 1. Save any pending changes
  await fullSave();
  
  // 2. Sign out from Supabase (clears localStorage)
  await authService.signOut();
  
  // 3. Clear Sentry user context
  Sentry.setUser(null);
  
  // 4. Clear local state
  clear();
  
  // 5. Notify parent (triggers navigation to login)
  onLoggedOut();
};
```

**What gets cleared:**
- ✅ Access token (localStorage)
- ✅ Refresh token (localStorage)
- ✅ User profile state
- ✅ Settings state
- ✅ Achievements
- ✅ Notifications
- ✅ Activity log
- ✅ Sentry context

## User Experience

### First-Time Login

```
User enters email + password
        ↓
Supabase validates credentials
        ↓
Access token saved to localStorage
        ↓
Bootstrap loads user data
        ↓
App opens
```

**Time to app**: ~2-3 seconds (includes database queries)

### Returning User (Page Refresh)

```
User refreshes page
        ↓
AuthProvider checks localStorage
        ↓
Session found → bootstrap()
        ↓
App opens
```

**Time to app**: ~1-2 seconds (faster, credentials already validated)

### Token Refresh (Automatic)

Supabase automatically refreshes tokens **1 hour before expiry**.

```
Token expires in 59 minutes
        ↓
Supabase auto-refreshes
        ↓
New token saved to localStorage
        ↓
onAuthStateChange('TOKEN_REFRESHED') fires
        ↓
bootstrap() re-runs (optional, for fresh data)
        ↓
User continues working (no interruption)
```

**User sees**: Nothing. Completely transparent.

## Debugging Tools

### Development Console Logs

When running in development mode, you'll see detailed auth logs:

```
[Auth] AuthProvider mounted
[Auth] Session found, bootstrapping user: user@example.com
[Auth] Starting bootstrap for: user@example.com
[Auth] Bootstrap attempt 1/3
[Auth] Bootstrap response status: 200
[Auth] Bootstrap successful, received data
[Auth] Bootstrap complete, user authenticated
```

### Storage Inspector

**Access**: Open DevTools → Application → Local Storage → `http://localhost:3000`

**Look for**: `sb-auth-token`

**Contents** (example):
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "v1.MRj...",
  "expires_at": 1735689600,
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "user_metadata": {
      "full_name": "John Doe"
    }
  }
}
```

### Test Page

**URL**: `http://localhost:3000/test-storage.html`

**Features**:
- ✅ Verify localStorage is working
- ✅ Check for Supabase session
- ✅ View token expiration
- ✅ Clear all storage (debugging)

**Usage**:
1. Open the test page
2. Click "Run Tests"
3. Click "Check Supabase Session"
4. Verify session is present after login

### Auth Debug Utility

**File**: `src/lib/authDebug.ts`

**Features**:
- Monitors all localStorage changes
- Logs when auth tokens are set/removed
- Displays current auth state at any point

**Usage** (in browser console):
```javascript
// Manually check auth state
authDebug.logAuthState('Manual check');
```

## Security Best Practices

### What's Safe ✅

- **Access tokens in localStorage**: Standard practice for SPAs
- **Refresh tokens in localStorage**: Supabase handles security
- **Token auto-refresh**: Reduces stale token issues
- **HTTPS in production**: Encrypts all token transmission

### What's NOT Done ❌

- **Password storage**: NEVER stored locally
- **Password in requests**: Only sent during initial login
- **Session cookies**: Not used (Supabase uses tokens)
- **Server-side sessions**: Not needed (JWT-based auth)

### Token Security

**Access Token**:
- Lifespan: 1 hour
- Auto-refreshed: Yes (59 minutes)
- Sent to API: Yes (Authorization: Bearer header)
- Can be revoked: Yes (via Supabase admin)

**Refresh Token**:
- Lifespan: 30 days (configurable in Supabase)
- Used for: Obtaining new access tokens
- Sent to API: No (only to Supabase auth endpoint)
- Can be revoked: Yes (logout invalidates it)

## Configuration

### Environment Variables

**Required** (frontend):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Required** (backend):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_JWT_SECRET=your-jwt-secret  # Only for older projects (HS256)
```

### Supabase Project Settings

**Auth Settings** → **General**:
- ✅ Enable email confirmations (optional)
- ✅ Enable email verification (recommended)
- ✅ Set JWT expiry: 3600 seconds (1 hour)
- ✅ Set refresh token rotation: Enabled

**Auth Settings** → **URL Configuration**:
- Site URL: `https://yourdomain.com` (production)
- Redirect URLs: Add your domains

## Troubleshooting

### Issue: User must re-login after refresh

**Possible Causes**:
1. localStorage is disabled/blocked
2. Browser in incognito mode
3. Supabase env vars missing/incorrect
4. Token expired and refresh failed

**Solutions**:
1. Open `test-storage.html` and verify localStorage works
2. Check browser console for auth errors
3. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
4. Check if Supabase project is active

**Debug Commands** (browser console):
```javascript
// Check if session exists
localStorage.getItem('sb-auth-token');

// Enable detailed logging
localStorage.setItem('supabase.debug', 'true');

// Manually trigger session check
supabase.auth.getSession().then(console.log);
```

### Issue: Bootstrap fails with 401

**Cause**: Access token is invalid/expired

**Solution**:
1. Clear localStorage: `localStorage.clear()`
2. Refresh page
3. Log in again
4. If persists, check backend JWT verification

### Issue: Session exists but bootstrap hangs

**Cause**: Database connection issue or `/api/bootstrap` endpoint failing

**Solution**:
1. Check network tab for bootstrap request
2. Verify `DATABASE_URL` is set correctly
3. Check server logs for database errors
4. Verify user exists in `users` table

### Issue: Logout doesn't clear session

**Cause**: `supabase.auth.signOut()` not being called

**Solution**:
1. Check `handleLogout` is being called
2. Verify no errors in console
3. Manually clear: `localStorage.removeItem('sb-auth-token')`

## Testing Checklist

Before deploying, verify:

- [ ] New user can register
- [ ] User can log in with email/password
- [ ] App loads after successful login
- [ ] **Refresh page → still logged in**
- [ ] **Close tab, reopen → still logged in**
- [ ] **Close browser, reopen → still logged in**
- [ ] Logout clears session
- [ ] After logout, must login again
- [ ] Invalid token shows login screen
- [ ] Expired token auto-refreshes
- [ ] Multiple tabs stay synced
- [ ] PWA offline mode works

## Production Deployment

### Pre-Deployment

1. ✅ Set `NODE_ENV=production`
2. ✅ Configure `FRONTEND_URL` for CORS
3. ✅ Enable HTTPS (required for secure cookies)
4. ✅ Configure Supabase redirect URLs
5. ✅ Remove or disable debug logging

### Post-Deployment

1. Test login flow in production
2. Test page refresh in production
3. Test logout in production
4. Monitor Sentry for auth errors
5. Check Supabase dashboard for active sessions

## API Endpoints

### `/api/bootstrap`

**Method**: GET  
**Auth**: Required (Bearer token)  
**Purpose**: Load user data after session restoration

**Response** (200 OK):
```json
{
  "authenticated": true,
  "email": "user@example.com",
  "profile": { ... },
  "settings": { ... },
  "achievements": [ ... ],
  "notifications": [ ... ],
  "chats": [ ... ],
  "activityLog": { ... },
  "roadmaps": [ ... ]
}
```

**Errors**:
- `401` - Invalid/expired token → clear session
- `403` - Access denied → clear session
- `503` - Server error → retry (don't clear session)

### `/api/session`

**Method**: GET  
**Auth**: Required (Bearer token)  
**Purpose**: Verify session is valid

**Response** (200 OK):
```json
{
  "authenticated": true,
  "email": "user@example.com"
}
```

## FAQ

### Q: Is localStorage secure for auth tokens?

**A**: Yes, for SPAs (Single Page Applications). This is the standard approach for client-side apps. The tokens are JWTs signed by Supabase and can be verified on the backend. The password itself is never stored.

### Q: What if someone steals the access token?

**A**: Access tokens expire after 1 hour. An attacker would need to steal both the access token AND the refresh token to maintain access. Supabase also supports token revocation.

### Q: Can users be logged out remotely?

**A**: Yes. Supabase allows you to revoke user sessions via the admin API or dashboard.

### Q: Does this work with OAuth (Google, GitHub, etc.)?

**A**: Yes. Supabase handles OAuth and stores the session the same way. The session persistence works identically.

### Q: What happens if localStorage is full?

**A**: The token is ~2KB. If storage is full, Supabase will throw an error and the user will need to log in each time. Consider showing a warning.

### Q: Can I use sessionStorage instead?

**A**: Yes, but the session will be cleared when the browser tab closes. Users would need to login again each time they open the app.

## Summary

✅ **Users only login once**  
✅ **Session persists across page refreshes**  
✅ **Session persists across browser restarts**  
✅ **Session persists in PWA**  
✅ **Tokens auto-refresh**  
✅ **Passwords never stored**  
✅ **Secure production deployment**  
✅ **Comprehensive debugging tools**  
✅ **Works offline (cached credentials)**

The implementation follows Supabase best practices and modern SPA authentication patterns.
