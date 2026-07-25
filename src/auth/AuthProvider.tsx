import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { Achievement, ChatMessage, SystemNotification, UserProfile, UserSettings } from '../types';
import { supabase } from '../lib/supabaseClient';
import { getAuthHeaders } from './authMiddleware';
import { authService } from './authService';

const avatar = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect width="128" height="128" rx="64" fill="%238b5cf6"/%3E%3Ccircle cx="64" cy="48" r="22" fill="white"/%3E%3Cpath d="M28 112c7-22 20-33 36-33s29 11 36 33" fill="white"/%3E%3C/svg%3E';
export const DEFAULT_SETTINGS: UserSettings = { theme: 'system', notificationsEnabled: true, emailNotifications: true, pushNotifications: false, privacyPublicProfile: false };
export function createEmptyProfile(email = '', name = ''): UserProfile {
  const normalized = email.trim().toLowerCase();
  return { id: normalized || 'user-pending', name: name || normalized.split('@')[0] || 'Learner', email: normalized, avatar, xp: 0, level: 1, streak: 0, isPro: false, roadmapsCompleted: 0, hoursStudied: 0, aiSessionsCount: 0, createdAt: new Date().toISOString() };
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
    if (booting.current) return; booting.current = true;
    try {
      const response = await fetch('/api/bootstrap', { headers: await getAuthHeaders() });
      if (!response.ok) throw new Error('bootstrap failed');
      const data = await response.json(); const user = (await supabase.auth.getUser()).data.user;
      const resolved = { ...createEmptyProfile(email, user?.user_metadata?.full_name || user?.user_metadata?.name || ''), ...(data.profile || {}) };
      // Bootstrap creates the database row idempotently. Persist the resolved
      // profile now so the registered name is available immediately.
      void fetch('/api/user-profile', {
        method: 'PUT', headers: await getAuthHeaders(),
        body: JSON.stringify({ profile: resolved, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } }),
      }).catch(() => undefined);
      setProfile(resolved); setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }); setAchievements(data.achievements || []);
      setNotifications(data.notifications || []); setChats(data.chats || []); setActivityLog(data.activityLog || {}); setIsAuthenticated(true);
      identify(email, { name: resolved.name }); onAuthenticated({ ...data, email, profile: resolved });
    } catch { clear(); } finally { booting.current = false; setIsLoadingAuth(false); }
  }, [clear, identify, onAuthenticated]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session?.user.email ? bootstrap(data.session.user.email) : setIsLoadingAuth(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setIsLoadingAuth(false); return; }
      if (event === 'SIGNED_OUT') { clear(); setIsLoadingAuth(false); }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user.email) {
        setIsLoadingAuth(true); void bootstrap(session.user.email);
      }
    });
    return () => subscription.unsubscribe();
  }, [bootstrap, clear]);

  const save = useCallback(async () => {
    if (!isAuthenticated) return;
    await fetch('/api/user-profile', { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ profile, settings, achievements, notifications, activityLog, chats }) });
  }, [isAuthenticated, profile, settings, achievements, notifications, activityLog, chats]);
  useEffect(() => { const timer = setTimeout(() => void save().catch(() => undefined), 1000); return () => clearTimeout(timer); }, [save]);

  const handleLogout = useCallback(async () => { await save().catch(() => undefined); await authService.signOut(); clear(); onLoggedOut(); }, [clear, onLoggedOut, save]);
  return <AuthContext.Provider value={{ isAuthenticated, isLoadingAuth, profile, setProfile, settings, setSettings, achievements, setAchievements, notifications, setNotifications, chats, setChats, activityLog, setActivityLog, handleLogout, mutatingHeaders: getAuthHeaders, getStoredUserEmail: () => profile.email }}>{children}</AuthContext.Provider>;
}
