// AuthContext — authentication state, session bootstrap, login/logout/password-reset.
// Extracted from App.tsx to isolate all auth concerns in one place.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, UserSettings, Achievement, SystemNotification, ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Helpers (previously inlined in App.tsx)
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
  mutatingHeaders: () => Record<string, string>;
  getCsrfToken: () => string;
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

  const getCsrfToken = useCallback((): string => {
    const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrf-token='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  }, []);

  const mutatingHeaders = useCallback((): Record<string, string> => ({
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
  }), [getCsrfToken]);

  const getStoredUserEmail = useCallback(() => profile.email, [profile.email]);

  // Bootstrap session on mount
  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetch('/api/bootstrap');
        if (!response.ok) throw new Error('Session invalid');
        const data = await response.json();
        if (data.authenticated && data.email) {
          const email = data.email;
          const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const resolvedProfile = { ...createEmptyProfile(email, name), name, avatar: DEFAULT_AVATAR };
          const merged = data.profile && Object.keys(data.profile).length > 0 ? { ...resolvedProfile, ...data.profile } : resolvedProfile;
          setProfile(merged);
          setSettings(data.settings && Object.keys(data.settings).length > 0 ? { ...DEFAULT_SETTINGS, ...data.settings } : DEFAULT_SETTINGS);
          setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
          setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
          setChats(Array.isArray(data.chats) ? data.chats : []);
          setActivityLog(data.activityLog && typeof data.activityLog === 'object' ? data.activityLog : {});
          identify(data.email, { name: data.profile?.name || '' });
          setIsAuthenticated(true);
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
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };
    verifySession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist profile changes (debounced)
  useEffect(() => {
    if (!isAuthenticated || !profile.email) return;
    const timer = setTimeout(async () => {
      try {
        await fetch('/api/user-profile', {
          method: 'PUT',
          headers: mutatingHeaders(),
          body: JSON.stringify({ profile, settings, achievements, notifications, chats }),
        });
      } catch (err) {
        console.warn('Failed to save user profile:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [profile, settings, achievements, notifications, chats, isAuthenticated]);

  // URL param handlers (reset_token, verified)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setShowAuthModal(true);
      params.delete('reset_token');
    }
    const remaining = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (remaining ? '?' + remaining : ''));
  }, []);

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
      const response = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify(mode === 'signup' ? { email, password, name: authName.trim() } : { email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setAuthError(data.error || 'Authentication failed.'); return; }
      const name = data.name || (data.email || email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const newProfile = { ...createEmptyProfile(data.email || email, name), name, avatar: DEFAULT_AVATAR };
      setProfile(newProfile);
      setSettings(DEFAULT_SETTINGS);
      setAchievements([]);
      setNotifications([]);
      setChats([]);
      identify(data.email || email, { name });
      track(mode === 'signup' ? 'user_signed_up' : 'user_logged_in');
      setIsAuthenticated(true);
      onAuthenticated({ email, profile: newProfile, settings: DEFAULT_SETTINGS, achievements: [], notifications: [], chats: [], activityLog: {}, roadmaps: [] });
      if (mode === 'signup') {
        setShowOnboarding(true);
        onShowOnboarding();
      }
      if (showAuthModal) { setShowAuthModal(false); setAuthEmail(''); setAuthPassword(''); setAuthName(''); }
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
      await fetch('/api/password-reset/request', { method: 'POST', headers: mutatingHeaders(), body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }) });
      setForgotStatus('sent');
    } catch { setForgotStatus('error'); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword || !resetToken) return;
    setResetStatus('submitting');
    try {
      const res = await fetch('/api/password-reset/confirm', { method: 'POST', headers: mutatingHeaders(), body: JSON.stringify({ token: resetToken, password: resetPassword }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAuthError(data.error || 'Reset failed. The link may have expired.'); setResetStatus('error'); return; }
      setResetStatus('success');
      setResetToken(null);
      setResetPassword('');
    } catch { setResetStatus('error'); setAuthError('Reset failed. Please try again.'); }
  };

  const handleLogout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch { /* continue */ }
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
    mutatingHeaders, getCsrfToken, getStoredUserEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
