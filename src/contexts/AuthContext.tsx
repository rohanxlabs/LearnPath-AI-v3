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

  // Auth form fields
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
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

  /** Get the current Supabase access token (refreshes automatically if needed). */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
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
    // Decode the token locally so we can log the expiry time without a round-trip.
    const tokenPayload = (() => { try { return JSON.parse(atob(accessToken.split('.')[1])); } catch { return null; } })();
    const tokenExp = tokenPayload?.exp ? new Date(tokenPayload.exp * 1000).toISOString() : 'unknown';
    console.log(`[Auth] bootstrapUser called  email=${email}  token_exp=${tokenExp}  token_prefix=${accessToken.slice(0, 20)}…`);
    // Retry transient failures (cold-start / network blip) instead of treating
    // them as "not logged in" — only a 401/403 from our server means the
    // session itself is invalid and should log the user out.
    const MAX_ATTEMPTS = 3;
    let response: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[Auth] /api/bootstrap fetch attempt ${attempt}/${MAX_ATTEMPTS}`);
      try {
        response = await fetch('/api/bootstrap', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log(`[Auth] /api/bootstrap response status=${response.status}`);
        if (response.ok) break;
        if (response.status === 401 || response.status === 403) {
          // Read the body to get the server's reason (e.g. "invalid signature", "jwt expired")
          const body = await response.clone().json().catch(() => ({}));
          console.warn(`[Auth] /api/bootstrap returned ${response.status} — stopping retries (auth failure)  server_reason=${body?.reason ?? body?.error ?? 'none'}`);
          break; // real auth failure, don't retry
        }
        lastErr = new Error(`Bootstrap failed: ${response.status}`);
        console.warn(`[Auth] /api/bootstrap non-auth failure status=${response.status}, will retry`);
      } catch (err) {
        lastErr = err;
        response = null;
        console.warn(`[Auth] /api/bootstrap network error on attempt ${attempt}:`, err);
      }
      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 800;
        console.log(`[Auth] waiting ${delay}ms before retry…`);
        await new Promise((r) => setTimeout(r, delay)); // 800ms, 1600ms backoff
      }
    }

    try {
      if (!response) {
        console.error('[Auth] all bootstrap attempts failed with network errors, lastErr:', lastErr);
        throw lastErr ?? new Error('Bootstrap failed: no response');
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.error(`[Auth] bootstrap unauthorized (${response.status}) — token may be expired. token_exp=${tokenExp}`);
          throw new Error('Bootstrap failed: unauthorized');
        }
        // Non-auth failure after retries — keep the user's session alive and
        // surface a retryable error instead of silently logging them out.
        console.error(`[Auth] bootstrap non-auth failure after all retries, status=${response.status}`);
        setAuthError('Could not load your account. Please try again.');
        setIsAuthenticated(false);
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
      // Show onboarding for brand-new accounts (no prior profile data).
      if (isNewUser) {
        setShowOnboarding(true);
        onShowOnboarding();
      }
      console.log(`[Auth] bootstrap success  email=${email}  isNewUser=${!data.profile || Object.keys(data.profile).length === 0}`);
    } catch (err) {
      // 401/403 → genuine session expiry: show auth screen with a clear message.
      // Any other unexpected throw (e.g. JSON parse error) gets the same treatment
      // so the user always knows why they were signed out.
      const isAuthErr = err instanceof Error && err.message.includes('unauthorized');
      console.error(`[Auth] bootstrapUser catch  isAuthErr=${isAuthErr}  email=${email}  token_exp=${tokenExp}  err=`, err);
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
    console.log('[Auth] useEffect: calling refreshSession()…');
    supabase.auth.refreshSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('[Auth] refreshSession error:', error.message);
      }
      if (session?.user?.email && session.access_token) {
        const exp = (() => { try { const p = JSON.parse(atob(session.access_token.split('.')[1])); return new Date(p.exp * 1000).toISOString(); } catch { return 'unknown'; } })();
        console.log(`[Auth] refreshSession returned valid session  email=${session.user.email}  token_exp=${exp}`);
        bootstrapUser(session.access_token, session.user.email).finally(() =>
          setIsLoadingAuth(false)
        );
      } else {
        console.log('[Auth] refreshSession returned no session — user is logged out');
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      }
    });

    // Subscribe to future auth state changes (login / signup / token refresh).
    // isLoadingAuth is set to true immediately so the app shows a loading screen
    // instead of flashing the landing page while bootstrapUser fetches the profile.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth] onAuthStateChange  event=${event}  email=${session?.user?.email ?? 'none'}`);
      if (event === 'PASSWORD_RECOVERY') {
        setResetToken('recovery');
        setShowAuthModal(true);
        return;
      }
      // INITIAL_SESSION / TOKEN_REFRESHED fired as a direct result of the
      // refreshSession() call above — skip it here to avoid a second concurrent
      // bootstrapUser call racing the one already started above.
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        console.log(`[Auth] onAuthStateChange skipping ${event} (handled by refreshSession path)`);
        return;
      }
      if (session?.user?.email && session.access_token) {
        // Show loading immediately so the unauthenticated branch never renders
        // during the async bootstrapUser fetch.
        setIsLoadingAuth(true);
        console.log(`[Auth] onAuthStateChange triggering bootstrapUser  event=${event}  email=${session.user.email}`);
        bootstrapUser(session.access_token, session.user.email).finally(() =>
          setIsLoadingAuth(false)
        );
      } else if (!session) {
        console.log('[Auth] onAuthStateChange no session — setting isAuthenticated=false');
        setIsAuthenticated(false);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist profile/settings/achievements/notifications (debounced, 1 s).
  // Chats are excluded — they are returned from /api/bootstrap and persisted
  // via a separate effect below with a longer debounce to avoid flushing the
  // full conversation history on every notification change.
  useEffect(() => {
    if (!isAuthenticated || !profile.email) return;
    const timer = setTimeout(async () => {
      try {
        const headers = await mutatingHeaders();
        await fetch('/api/user-profile', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ profile, settings, achievements, notifications }),
        });
      } catch (err) {
        console.warn('Failed to save user profile:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [profile, settings, achievements, notifications, isAuthenticated]);

  // Persist chat history separately (debounced, 5 s) so that frequent AI
  // mentor messages don't trigger a full profile flush.
  useEffect(() => {
    if (!isAuthenticated || !profile.email) return;
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

        // Sign in via our server route (not direct Supabase SDK) so the
        // auto-confirm logic runs server-side before sign-in is attempted.
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
          setAuthError(error?.message || 'Invalid credentials.');
          return;
        }
        // onAuthStateChange will fire and call bootstrapUser automatically
        identify(email, {});
        track('user_logged_in');
      }

      // Modal close + form clear is handled in bootstrapUser once the profile
      // is loaded — avoids the landing-page flash during the async fetch gap.
      // Only handle the post-login redirect here.
      if (redirectAfterLogin) {
        onRedirectAfterLogin(redirectAfterLogin.replace('/', '') || 'home');
        setRedirectAfterLogin(null);
      }
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

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
    try { await supabase.auth.signOut(); } catch { /* continue */ }
    setIsAuthenticated(false);
    setAuthEmail(''); setAuthPassword(''); setAuthName('');
    setAuthMode('login'); setAuthError(''); setIsAuthenticating(false);
    setProfile(createEmptyProfile()); setSettings(DEFAULT_SETTINGS);
    setAchievements([]); setNotifications([]); setChats([]);
    setShowAuthModal(false);
    onLoggedOut();
  };

  const value: AuthContextValue = {
    isAuthenticated, isLoadingAuth, profile, setProfile, settings, setSettings,
    achievements, setAchievements, notifications, setNotifications,
    chats, setChats, activityLog, setActivityLog,
    authEmail, setAuthEmail, authPassword, setAuthPassword,
    authName, setAuthName, authMode, setAuthMode,
    authError, setAuthError, isAuthenticating,
    showAuthModal, setShowAuthModal,
    redirectAfterLogin, setRedirectAfterLogin,
    showOnboarding, setShowOnboarding,
    forgotPasswordMode, setForgotPasswordMode,
    forgotEmail, setForgotEmail, forgotStatus, setForgotStatus,
    resetToken, setResetToken, resetPassword, setResetPassword,
    resetStatus, setResetStatus,
    handleAuthenticate, handleForgotPassword, handleResetPassword, handleLogout,
    mutatingHeaders, getStoredUserEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
