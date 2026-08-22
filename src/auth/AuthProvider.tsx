import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import type { Achievement, ChatMessage, SystemNotification, UserProfile, UserSettings } from '../types';
import { supabase } from '../lib/supabaseClient';
import { getAuthHeaders } from './authMiddleware';
import { authService } from './authService';
import { authDebug } from '../lib/authDebug';

const avatar = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect width="128" height="128" rx="64" fill="%238b5cf6"/%3E%3Ccircle cx="64" cy="48" r="22" fill="white"/%3E%3Cpath d="M28 112c7-22 20-33 36-33s29 11 36 33" fill="white"/%3E%3C/svg%3E';
export const DEFAULT_SETTINGS: UserSettings = { theme: 'system', notificationsEnabled: true, emailNotifications: true, pushNotifications: false, privacyPublicProfile: false };
export function createEmptyProfile(email = '', name = ''): UserProfile {
  const normalized = email.trim().toLowerCase();
  return { id: normalized || 'user-pending', name: name || normalized.split('@')[0] || 'Learner', email: normalized, avatar, xp: 0, level: 1, streak: 0, isPro: false, roadmapsCompleted: 0, hoursStudied: 0, aiSessionsCount: 0, lessonsCompleted: 0, createdAt: new Date().toISOString() };
}

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
export type AuthContextValue = {
  isAuthenticated: boolean; isLoadingAuth: boolean; profile: UserProfile; setProfile: Setter<UserProfile>;
  settings: UserSettings; setSettings: Setter<UserSettings>; achievements: Achievement[]; setAchievements: Setter<Achievement[]>;
  notifications: SystemNotification[]; setNotifications: Setter<SystemNotification[]>; chats: ChatMessage[]; setChats: Setter<ChatMessage[]>;
  activityLog: Record<string, { xp: number; lessonsCompleted: number }>; setActivityLog: Setter<Record<string, { xp: number; lessonsCompleted: number }>>;
  handleLogout: () => Promise<void>; mutatingHeaders: () => Promise<Record<string, string>>; getStoredUserEmail: () => string;
};
export const AuthContext = createContext<AuthContextValue | null>(null);

type Props = { children: React.ReactNode; onAuthenticated: (data: any) => void; onLoggedOut: () => void; identify: (email: string, props?: Record<string, any>) => void };
export function AuthProvider({ children, onAuthenticated, onLoggedOut, identify }: Props) {
  const [isAuthenticated, setIsAuthenticated] = useState(false); const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [profile, setProfile] = useState(createEmptyProfile()); const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [achievements, setAchievements] = useState<Achievement[]>([]); const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]); const [activityLog, setActivityLog] = useState<Record<string, { xp: number; lessonsCompleted: number }>>({});
  const booting = useRef(false);

  const clear = useCallback(() => { setIsAuthenticated(false); setProfile(createEmptyProfile()); setSettings(DEFAULT_SETTINGS); setAchievements([]); setNotifications([]); setChats([]); setActivityLog({}); }, []);
  const bootstrap = useCallback(async (email: string) => {
    if (booting.current) {
      console.log('[Auth] Bootstrap already in progress, skipping');
      return;
    }
    booting.current = true;
    console.log('[Auth] Starting bootstrap for:', email);

    // Retry /api/bootstrap up to 3 times on transient server errors (503/502/504).
    // Only call clear() on a definitive auth failure (401/403) — a transient DB
    // hiccup must not log the user out and destroy in-memory state.
    const MAX_ATTEMPTS = 3;
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Auth] Bootstrap attempt ${attempt}/${MAX_ATTEMPTS}`);
        const response = await fetch('/api/bootstrap', { headers: await getAuthHeaders() });
        lastStatus = response.status;
        console.log('[Auth] Bootstrap response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[Auth] Bootstrap successful, received data');
          const user = (await supabase.auth.getUser()).data.user;
          const resolved = { ...createEmptyProfile(email, user?.user_metadata?.full_name || user?.user_metadata?.name || ''), ...(data.profile || {}) };
          // Bootstrap creates the database row idempotently. Persist the resolved
          // profile now so the registered name is available immediately.
          void fetch('/api/user-profile', {
            method: 'PUT', headers: await getAuthHeaders(),
            body: JSON.stringify({ profile: resolved, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } }),
          }).catch(() => undefined);
          setProfile(resolved); setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }); setAchievements(data.achievements || []);
          setNotifications(data.notifications || []); setChats(data.chats || []); setActivityLog(data.activityLog || {}); setIsAuthenticated(true);
          // Populate Sentry user context so events are linked to the session.
          Sentry.setUser({ id: resolved.id || email, email });
          identify(email, { name: resolved.name }); onAuthenticated({ ...data, email, profile: resolved });
          booting.current = false; setIsLoadingAuth(false);
          console.log('[Auth] Bootstrap complete, user authenticated');
          return;
        }

        // 401/403 = definitively not authenticated — stop retrying.
        if (response.status === 401 || response.status === 403) {
          console.warn('[Auth] Authentication failed with status:', response.status);
          break;
        }

        // 5xx = transient — wait then retry (except on last attempt).
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[Auth] Server error ${response.status}, retrying in ${attempt}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      } catch (error) {
        console.error('[Auth] Bootstrap request failed:', error);
        // Network error — retry unless last attempt.
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[Auth] Network error, retrying in ${attempt}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    // All attempts exhausted or auth error — only clear if definitively unauthorised.
    if (lastStatus === 401 || lastStatus === 403) {
      console.warn('[Auth] Clearing auth state due to failed authentication');
      clear();
    }
    // Otherwise leave any existing state intact so a refresh can recover.
    booting.current = false; setIsLoadingAuth(false);
    console.log('[Auth] Bootstrap finished with status:', lastStatus);
  }, [clear, identify, onAuthenticated]);

  useEffect(() => {
    // Enable storage monitoring in development
    if (import.meta.env.DEV) {
      authDebug.watchStorage();
      authDebug.logAuthState('AuthProvider mounted');
    }

    // Check for existing session on mount (handles page refresh)
    supabase.auth.getSession().then(({ data, error }) => {
      if (import.meta.env.DEV) {
        authDebug.logAuthState('getSession() result');
      }
      
      if (error) {
        console.error('[Auth] Failed to get session:', error);
        setIsLoadingAuth(false);
        return;
      }
      if (data.session?.user.email) {
        console.log('[Auth] Session found, bootstrapping user:', data.session.user.email);
        bootstrap(data.session.user.email);
      } else {
        console.log('[Auth] No session found');
        setIsLoadingAuth(false);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] State change:', event, session?.user?.email || 'no user');
      
      if (import.meta.env.DEV) {
        authDebug.logAuthState(`onAuthStateChange: ${event}`);
      }
      
      if (event === 'PASSWORD_RECOVERY') { 
        setIsLoadingAuth(false); 
        return; 
      }
      
      if (event === 'SIGNED_OUT') { 
        console.log('[Auth] User signed out, clearing state');
        clear(); 
        setIsLoadingAuth(false); 
      }
      
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user.email) {
        console.log('[Auth] User signed in/token refreshed, bootstrapping');
        setIsLoadingAuth(true); 
        void bootstrap(session.user.email);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [bootstrap, clear]);

  // Auto-save profile, settings, activityLog, and notifications on a generous
  // debounce.  Chats are intentionally excluded here — they are persisted on
  // logout via handleLogout → fullSave() so the full payload is preserved,
  // but they should not trigger a PUT on every AI mentor message.
  //
  // IMPORTANT: use refs to capture the *latest* state values rather than
  // closing over them in the useCallback deps.  This prevents a new `save`
  // identity (and therefore a new 8s timer) from being created on every state
  // change, which was causing a PUT storm (one PUT per state update × 8s lag).
  const latestSavePayload = useRef({ profile, settings, achievements, notifications, activityLog });
  useEffect(() => { latestSavePayload.current = { profile, settings, achievements, notifications, activityLog }; }, [profile, settings, achievements, notifications, activityLog]);

  const save = useCallback(async () => {
    if (!isAuthenticated) return;
    const { profile: p, settings: s, achievements: a, notifications: n, activityLog: al } = latestSavePayload.current;
    await fetch('/api/user-profile', { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ profile: p, settings: s, achievements: a, notifications: n, activityLog: al }) });
  }, [isAuthenticated]);
  useEffect(() => { const timer = setTimeout(() => void save().catch(() => undefined), 8000); return () => clearTimeout(timer); }, [save]);

  // Full save (including chats) used on explicit logout only.
  const fullSave = useCallback(async () => {
    if (!isAuthenticated) return;
    await fetch('/api/user-profile', { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ profile, settings, achievements, notifications, activityLog, chats }) });
  }, [isAuthenticated, profile, settings, achievements, notifications, activityLog, chats]);

  const handleLogout = useCallback(async () => {
    console.log('[Auth] Starting logout process');
    if (import.meta.env.DEV) {
      authDebug.logAuthState('Before logout');
    }
    
    // Save any pending changes before logout
    await fullSave().catch(() => undefined);
    
    // Sign out from Supabase (this will clear localStorage)
    await authService.signOut();
    console.log('[Auth] Supabase signOut complete');
    
    if (import.meta.env.DEV) {
      authDebug.logAuthState('After signOut');
    }
    
    // Clear Sentry user context so subsequent errors are not attributed to the
    // logged-out session.
    Sentry.setUser(null);
    
    // Clear local state
    clear();
    console.log('[Auth] Local state cleared');
    
    // Notify parent component
    onLoggedOut();
    console.log('[Auth] Logout complete');
  }, [clear, onLoggedOut, fullSave]);
  return <AuthContext.Provider value={{ isAuthenticated, isLoadingAuth, profile, setProfile, settings, setSettings, achievements, setAchievements, notifications, setNotifications, chats, setChats, activityLog, setActivityLog, handleLogout, mutatingHeaders: getAuthHeaders, getStoredUserEmail: () => profile.email }}>{children}</AuthContext.Provider>;
}
