// AuthContext — authentication state, session bootstrap, login/logout/password-reset.
// Now backed by Supabase Authentication (JWT-based, no server-side sessions).

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, UserSettings, Achievement, SystemNotification, ChatMessage } from '../types';
import { supabase } from '../lib/supabaseClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"%3E%3Crect width="128" height="128" rx="64" fill="%238b5cf6"/%3E%3Ccircle cx="64" cy="48" r="22" fill="white" opacity=".9"/%3E%3Cpath d="M28 112c7-22 20-33 36-33s29 11 36 33" fill="white" opacity=".9"/%3E%3C/svg%3E';

const ALLOWED_REDIRECT_TABS = new Set([
  'home', 'roadmaps', 'mentor', 'progress',
  'achievements', 'notifications', 'profile',
]);

function passwordValidationError(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  privacyPublicProfile: false,
};

export function createEmptyProfile(email = '', name = ''): UserProfile {
  const normalizedEmail = email.trim().toLowerCase();
  const displayName =
    name.trim() ||
    normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) ||
    'Learner';
  return {
    id: normalizedEmail ? `user-${normalizedEmail}` : 'user-pending',
    name: displayName,
    email: normalizedEmail,
    avatar: DEFAULT_AVATAR,
    xp: 0,
    level: 1,
    streak: 0,
    isPro: false,
    roadmapsCompleted: 0,
    hoursStudied: 0,
    aiSessionsCount: 0,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
  achievements: Achievement[];
  setAchievements: React.Dispatch<React.SetStateAction<Achievement[]>>;
  notifications: SystemNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<SystemNotification[]>>;
  chats: ChatMessage[];
  setChats: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activityLog: Record<string, { xp: number; lessonsCompleted: number }>;
  setActivityLog: React.Dispatch<React.SetStateAction<Record<string, { xp: number; lessonsCompleted: number }>>>;

  // Auth modal fields
  authEmail: string;
  setAuthEmail: React.Dispatch<React.SetStateAction<string>>;
  authPassword: string;
  setAuthPassword: React.Dispatch<React.SetStateAction<string>>;
  authName: string;
  setAuthName: React.Dispatch<React.SetStateAction<string>>;
  authMode: 'login' | 'signup';
  setAuthMode: React.Dispatch<React.SetStateAction<'login' | 'signup'>>;
  authStep: 'credentials' | 'otp-pending';
  pendingSignupEmail: string;
  authError: string;
  setAuthError: React.Dispatch<React.SetStateAction<string>>;
  isAuthenticating: boolean;
  showAuthModal: boolean;
  setShowAuthModal: React.Dispatch<React.SetStateAction<boolean>>;
  redirectAfterLogin: string | null;
  setRedirectAfterLogin: React.Dispatch<React.SetStateAction<string | null>>;
  showOnboarding: boolean;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;

  // Password reset fields
  forgotPasswordMode: boolean;
  setForgotPasswordMode: React.Dispatch<React.SetStateAction<boolean>>;
  forgotEmail: string;
  setForgotEmail: React.Dispatch<React.SetStateAction<string>>;
  forgotStatus: 'idle' | 'sending' | 'sent' | 'error';
  setForgotStatus: React.Dispatch<React.SetStateAction<'idle' | 'sending' | 'sent' | 'error'>>;
  resetToken: string | null;
  setResetToken: React.Dispatch<React.SetStateAction<string | null>>;
  resetPassword: string;
  setResetPassword: React.Dispatch<React.SetStateAction<string>>;
  resetStatus: 'idle' | 'submitting' | 'success' | 'error';
  setResetStatus: React.Dispatch<React.SetStateAction<'idle' | 'submitting' | 'success' | 'error'>>;

  // Handlers
  handleAuthenticate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  handleForgotPassword: (e: React.FormEvent) => Promise<void>;
  handleResetPassword: (e: React.FormEvent) => Promise<void>;
  handleLogout: () => Promise<void>;
  /** Returns headers with Bearer token for all mutating API calls. */
  mutatingHeaders: () => Promise<Record<string, string>>;
  getStoredUserEmail: () => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: React.ReactNode;
  onAuthenticated: (data: {
    email: string;
    profile: any;
    settings: any;
    achievements: any[];
    notifications: any[];
    chats: any[];
    activityLog: any;
    roadmaps: any[];
  }) => void;
  onLoggedOut: () => void;
  onShowOnboarding: () => void;
  onRedirectAfterLogin: (tab: string) => void;
  track: (event: string, props?: Record<string, any>) => void;
  identify: (email: string, props?: Record<string, any>) => void;
}

export function AuthProvider({
  children,
  onAuthenticated,
  onLoggedOut,
  onShowOnboarding,
  onRedirectAfterLogin,
  track,
  identify,
}: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [activityLog, setActivityLog] = useState<Record<string, { xp: number; lessonsCompleted: number }>>({});

  // Ref that tracks the pending profile-save debounce timer so we can cancel
  // it on logout and flush the current state before clearing React state.
  const profileSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth form fields
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authStep, setAuthStep] = useState<'credentials' | 'otp-pending'>('credentials');
  const [pendingSignupEmail, setPendingSignupEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Password reset
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  // ---------------------------------------------------------------------------
  // Token helpers
  // ---------------------------------------------------------------------------

  /** Get the current Supabase access token, refreshing it if expired.
   *
   * getSession() reads from localStorage and can return a stale/expired token
   * on a cold reload (user was away > 1 hour). refreshSession() validates the
   * refresh token with Supabase and returns a fresh access_token — it only
   * hits the network when the cached token is actually expired, so it is not
   * a performance concern for normal requests.
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return null;

    const expiresAt = (session.expires_at ?? 0) * 1000; // seconds -> ms
    const isExpiringSoon = expiresAt - Date.now() < 60_000; // refresh if <60s left

    if (!isExpiringSoon) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? session.access_token; // fall back rather than null
  }, []);

  /** Returns headers with Bearer token for all mutating API calls. */
  const mutatingHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getAccessToken]);

  const getStoredUserEmail = useCallback(() => profile.email, [profile.email]);

  // ---------------------------------------------------------------------------
  // Bootstrap — load profile from server once a session is confirmed
  // ---------------------------------------------------------------------------
  const bootstrapUser = useCallback(async (accessToken: string, email: string) => {
    // Clear any stale error from a previous attempt before we start.
    setAuthError('');
    // Retry transient failures (cold-start / network blip) instead of treating
    // them as "not logged in" — only a 401/403 from our server means the
    // session itself is invalid and should log the user out.
    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await fetch('/api/bootstrap', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.ok) break;
        if (response.status === 401 || response.status === 403) {
          const body = await response.clone().json().catch(() => ({}));
          throw new Error(body?.reason ?? body?.error ?? 'Bootstrap failed: unauthorized');
        }
        if (response.status === 503 && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 2 ** (attempt - 1) * 1000));
          continue;
        }
        lastErr = new Error(`Bootstrap failed: ${response.status}`);
      } catch (err) {
        lastErr = err;
        response = null;
      }
      if (attempt < MAX_ATTEMPTS) {
        const delay = 2 ** (attempt - 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    try {
      if (!response) {
        throw lastErr ?? new Error('Bootstrap failed: no response');
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Bootstrap failed: unauthorized');
        }
        // Non-auth failure after retries — keep the user's session alive and
        // surface a retryable error instead of silently logging them out.
        setAuthError('We could not load your learning data. Please retry in a moment.');
        return;
      }
      const data = await response.json();
      const name =
        data.profile?.name ||
        email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const resolvedProfile = { ...createEmptyProfile(email, name), name, avatar: DEFAULT_AVATAR };
      const isNewUser = !data.profile || Object.keys(data.profile).length === 0;
      const merged = isNewUser ? resolvedProfile : { ...resolvedProfile, ...data.profile };
      setProfile(merged);
      setSettings(
        data.settings && Object.keys(data.settings).length > 0
          ? { ...DEFAULT_SETTINGS, ...data.settings }
          : DEFAULT_SETTINGS
      );
      setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setChats(Array.isArray(data.chats) ? data.chats : []);
      setActivityLog(data.activityLog && typeof data.activityLog === 'object' ? data.activityLog : {});
      identify(email, { name: merged.name });
      setIsAuthenticated(true);
      // Close auth modal and clear form fields now that the profile is ready.
      // Doing this here (not in handleAuthenticate) ensures the app never shows
      // the landing page during the async fetch gap.
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
      setAuthStep('credentials');
      setPendingSignupEmail('');
      onAuthenticated({
        email,
        profile: merged,
        settings: data.settings,
        achievements: data.achievements || [],
        notifications: data.notifications || [],
        chats: data.chats || [],
        activityLog: data.activityLog || {},
        roadmaps: data.roadmaps || [],
      });
    } catch (err) {
      // 401/403 → genuine session expiry: show auth screen with a clear message.
      // Any other unexpected throw (e.g. JSON parse error) gets the same treatment
      // so the user always knows why they were signed out.
      const isAuthErr = err instanceof Error && err.message.includes('unauthorized');
      if (isAuthErr) {
        // Remove the rejected local session. Otherwise every reload retries the
        // same invalid token and leaves the user stuck in an auth-error loop.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
      setIsAuthenticated(false);
      setShowAuthModal(true);
      setAuthError(
        isAuthErr
          ? 'Your session has expired. Please sign in again.'
          : 'Could not load your account. Please try again.'
      );
    }
  }, [identify, onAuthenticated, onShowOnboarding, setShowAuthModal, setAuthEmail, setAuthPassword, setAuthName]);

  // ---------------------------------------------------------------------------
  // Listen to Supabase auth state changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // refreshSession() re-validates the stored refresh token with Supabase and
    // returns a fresh access_token.  getSession() reads from localStorage and
    // will hand us a stale, expired access_token if the user was away > 1 hour,
    // causing the server to return 401 and the client to show "session expired"
    // even though the user's refresh token is still valid.
    supabase.auth.refreshSession().then(({ data: { session }, error }) => {
      if (error) {
        // Ignore refresh-session errors and fall back to an unauthenticated state.
      }
      if (session?.user?.email && session.access_token) {
        bootstrapUser(session.access_token, session.user.email).finally(() =>
          setIsLoadingAuth(false)
        );
      } else {
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      }
    });

    // Subscribe to future auth state changes (login / signup / token refresh).
    // isLoadingAuth is set to true immediately so the app shows a loading screen
    // instead of flashing the landing page while bootstrapUser fetches the profile.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (import.meta.env.DEV) {
        const raw = session?.user?.email ?? 'none';
        const masked = raw === 'none' ? raw : raw.replace(/^(.{2}).*(@.*)$/, '$1***$2');
        console.log(`[Auth] onAuthStateChange  event=${event}  email=${masked}`);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setResetToken('recovery');
        setShowAuthModal(true);
        return;
      }
      // INITIAL_SESSION / TOKEN_REFRESHED fired as a direct result of the
      // refreshSession() call above — skip it here to avoid a second concurrent
      // bootstrapUser call racing the one already started above.
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        return;
      }
      if (session?.user?.email && session.access_token) {
        // Show loading immediately so the unauthenticated branch never renders
        // during the async bootstrapUser fetch.
        setIsLoadingAuth(true);
        bootstrapUser(session.access_token, session.user.email).finally(() =>
          setIsLoadingAuth(false)
        );
      } else if (!session) {
        setIsAuthenticated(false);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate only after bootstrap has completed successfully. Redirecting in
  // the submit handler races the protected app state and can briefly render a
  // requested tab before the session/profile is available.
  useEffect(() => {
    if (!isAuthenticated || !redirectAfterLogin) return;
    const rawTab = redirectAfterLogin.replace('/', '') || 'home';
    onRedirectAfterLogin(ALLOWED_REDIRECT_TABS.has(rawTab) ? rawTab : 'home');
    setRedirectAfterLogin(null);
  }, [isAuthenticated, onRedirectAfterLogin, redirectAfterLogin]);

  // ---------------------------------------------------------------------------
  // Shared profile-flush helper — called by both the debounce effect and logout.
  // Captures the *current* closure values so the caller can invoke it at any time.
  // ---------------------------------------------------------------------------
  const flushProfileSave = useCallback(async (
    currentProfile: UserProfile,
    currentSettings: UserSettings,
    currentAchievements: Achievement[],
    currentNotifications: SystemNotification[],
    currentActivityLog: Record<string, { xp: number; lessonsCompleted: number }>
  ): Promise<void> => {
    const headers = await mutatingHeaders();
    await fetch('/api/user-profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        profile: currentProfile,
        settings: currentSettings,
        achievements: currentAchievements,
        notifications: currentNotifications,
        activityLog: currentActivityLog,
      }),
    });
  }, [mutatingHeaders]);

  // Persist profile/settings/achievements/notifications (debounced, 1 s).
  // Chats are excluded — they are returned from /api/bootstrap and persisted
  // via a separate effect below with a longer debounce to avoid flushing the
  // full conversation history on every notification change.
  useEffect(() => {
    if (!isAuthenticated || !profile.email) return;
    if (profileSaveTimerRef.current) clearTimeout(profileSaveTimerRef.current);
    profileSaveTimerRef.current = setTimeout(() => {
      flushProfileSave(profile, settings, achievements, notifications, activityLog).catch((err) => {
        console.warn('Failed to save user profile:', err);
      });
    }, 1000);
    return () => {
      if (profileSaveTimerRef.current) clearTimeout(profileSaveTimerRef.current);
    };
  }, [profile, settings, achievements, notifications, activityLog, isAuthenticated]);

  // Persist chat history separately (debounced, 5 s) so that frequent AI
  // mentor messages don't trigger a full profile flush.
  // Guard: skip when chats is empty — an empty array on first mount would
  // otherwise overwrite real chat history stored in the DB (seen as the
  // "request aborted" 12-byte PUT in logs).
  useEffect(() => {
    if (!isAuthenticated || !profile.email || chats.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const headers = await mutatingHeaders();
        await fetch('/api/user-profile', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ chats }),
        });
      } catch (err) {
        console.warn('Failed to save chat history:', err);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [chats, isAuthenticated]);

  // ---------------------------------------------------------------------------
  // Auth handlers
  // ---------------------------------------------------------------------------

  const handleAuthenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const mode = authMode;
    if (!email || !password || (mode === 'signup' && !authName.trim())) {
      setAuthError(mode === 'signup' ? 'Name, email, and password are required.' : 'Email and password are required.');
      return;
    }
    if (mode === 'signup') {
      const passwordError = passwordValidationError(password);
      if (passwordError) {
        setAuthError(passwordError);
        return;
      }
    }
    setIsAuthenticating(true);
    try {
      if (mode === 'signup') {
        // Register via our server endpoint (creates Supabase user + seeds DB row)
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: authName.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { setAuthError(data.error || 'Registration failed.'); return; }

        // The server no longer force-confirms email addresses. Supabase has sent a
        // verification link; any sign-in attempt will 403 until it is clicked, so
        // stop here and tell the user what to do instead of failing a login.
        if (data.requiresVerification) {
          identify(email, { name: authName.trim() });
          track('user_signed_up');
          setAuthPassword('');
          setPendingSignupEmail(email);
          setAuthStep('otp-pending');
          return;
        }

        // Legacy path: projects with email confirmation disabled still return no
        // requiresVerification flag and can sign in immediately.
        const loginRes = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!loginRes.ok) {
          const loginData = await loginRes.json().catch(() => ({}));
          setAuthError(loginData.error || 'Account created — please sign in.');
          setAuthMode('login');
          return;
        }
        // The server validated credentials and returned a session token.
        // Now sign in on the client side using Supabase SDK so onAuthStateChange fires.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setAuthError(signInError.message || 'Account created — please sign in.');
          setAuthMode('login');
          return;
        }

        // Analytics only — state is set by bootstrapUser via onAuthStateChange.
        identify(email, { name: authName.trim() });
        track('user_signed_up');
      } else {
        // Login — call Supabase directly from the client for best UX
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          const message = error?.message?.toLowerCase() || '';
          setAuthError(
            message.includes('email not confirmed')
              ? 'Please confirm your email address. Check your inbox for the verification link.'
              : 'Invalid email or password.'
          );
          return;
        }
        // onAuthStateChange will fire and call bootstrapUser automatically
        identify(email, {});
        track('user_logged_in');
      }

      // Modal close + form clear is handled in bootstrapUser once the profile
      // is loaded — avoids the landing-page flash during the async fetch gap.
      // The effect above normally performs the redirect after bootstrap. This
      // branch only covers an already-authenticated re-entry.
      if (isAuthenticated && redirectAfterLogin) {
        // Validate against the known tab names to prevent open-redirect if this
        // value is ever sourced from a URL parameter in the future.
        const rawTab = redirectAfterLogin.replace('/', '') || 'home';
        const safeTab = ALLOWED_REDIRECT_TABS.has(rawTab) ? rawTab : 'home';
        onRedirectAfterLogin(safeTab);
        setRedirectAfterLogin(null);
      }
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const verifySignupOtp = useCallback(async (email: string, token: string) => {
    const response = await fetch('/api/register/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.access_token) {
      throw new Error(data?.error || 'Invalid or expired code.');
    }
    // Establish the browser-side session so the existing auth-state listener
    // bootstraps the user and transitions into the app.
    const { error: setSessionErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: '',
    });
    if (setSessionErr) throw setSessionErr;
  }, []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotStatus('sending');
    try {
      // Use Supabase client directly — sends the magic-link email
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      setForgotStatus(error ? 'error' : 'sent');
    } catch { setForgotStatus('error'); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword) return;
    const passwordError = passwordValidationError(resetPassword);
    if (passwordError) {
      setAuthError(passwordError);
      setResetStatus('error');
      return;
    }
    setAuthError('');
    setResetStatus('submitting');
    try {
      // Update password using the active Supabase session from the reset link
      const { error } = await supabase.auth.updateUser({ password: resetPassword });
      if (error) { setAuthError(error.message || 'Reset failed.'); setResetStatus('error'); return; }
      setResetStatus('success');
      setResetToken(null);
      setResetPassword('');
    } catch { setResetStatus('error'); setAuthError('Reset failed. Please try again.'); }
  };

  const handleLogout = async () => {
    // Cancel any pending debounce timer so it cannot fire after state is cleared.
    if (profileSaveTimerRef.current) {
      clearTimeout(profileSaveTimerRef.current);
      profileSaveTimerRef.current = null;
    }
    // Flush the current profile state before clearing React state.
    // Race against a 2-second timeout so a slow/failed network never blocks logout.
    try {
      await Promise.race([
        flushProfileSave(profile, settings, achievements, notifications, activityLog),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch { /* best-effort — proceed regardless */ }
    // Revoke the server-side session before the SDK removes the local bearer
    // token. This also clears the HttpOnly refresh cookie for legacy clients.
    try {
      const token = await getAccessToken();
      await fetch('/api/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'same-origin',
      });
    } catch { /* best-effort — local sign-out below still clears this device */ }
    // Sign out of Supabase (invalidates the refresh token server-side).
    try { await supabase.auth.signOut(); } catch { /* continue */ }
    // Clear all React state.
    setIsAuthenticated(false);
    setAuthEmail(''); setAuthPassword(''); setAuthName('');
    setAuthMode('login'); setAuthStep('credentials'); setPendingSignupEmail(''); setAuthError(''); setIsAuthenticating(false);
    setProfile(createEmptyProfile()); setSettings(DEFAULT_SETTINGS);
    setAchievements([]); setNotifications([]); setChats([]); setActivityLog({});
    setShowAuthModal(false);
    onLoggedOut();
  };

  const value: AuthContextValue = {
    isAuthenticated, isLoadingAuth, profile, setProfile, settings, setSettings,
    achievements, setAchievements, notifications, setNotifications,
    chats, setChats, activityLog, setActivityLog,
    authEmail, setAuthEmail, authPassword, setAuthPassword,
    authName, setAuthName, authMode, setAuthMode,
    authStep, pendingSignupEmail,
    authError, setAuthError, isAuthenticating,
    showAuthModal, setShowAuthModal,
    redirectAfterLogin, setRedirectAfterLogin,
    showOnboarding, setShowOnboarding,
    forgotPasswordMode, setForgotPasswordMode,
    forgotEmail, setForgotEmail, forgotStatus, setForgotStatus,
    resetToken, setResetToken, resetPassword, setResetPassword,
    resetStatus, setResetStatus,
    handleAuthenticate, verifySignupOtp, handleForgotPassword, handleResetPassword, handleLogout,
    mutatingHeaders, getStoredUserEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
