import { Achievement, ChatMessage, Roadmap, SystemNotification, UserProfile, UserSettings } from './types';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  privacyPublicProfile: false,
};

const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"%3E%3Crect width="128" height="128" rx="64" fill="%238b5cf6"/%3E%3Ccircle cx="64" cy="48" r="22" fill="white" opacity=".9"/%3E%3Cpath d="M28 112c7-22 20-33 36-33s29 11 36 33" fill="white" opacity=".9"/%3E%3C/svg%3E';

function storageKey(email: string, key: string) {
  const safeEmail = email.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  return `learnpath_${safeEmail}_${key}`;
}

function readStored<T>(email: string, key: string, fallback: T): T {
  if (typeof window === 'undefined' || !email) return fallback;
  const value = localStorage.getItem(storageKey(email, key));
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

export function loadUserData(email: string, name = '') {
  const profileFallback = createEmptyProfile(email, name);

  return {
    profile: readStored<UserProfile>(email, 'profile', profileFallback),
    settings: readStored<UserSettings>(email, 'settings', DEFAULT_SETTINGS),
    roadmaps: readStored<Roadmap[]>(email, 'roadmaps', []),
    achievements: readStored<Achievement[]>(email, 'achievements', []),
    notifications: readStored<SystemNotification[]>(email, 'notifications', []),
    chats: readStored<ChatMessage[]>(email, 'chats', []),
  };
}

export function saveUserData(email: string, data: Partial<{
  profile: UserProfile;
  settings: UserSettings;
  roadmaps: Roadmap[];
  achievements: Achievement[];
  notifications: SystemNotification[];
  chats: ChatMessage[];
}>) {
  if (typeof window === 'undefined' || !email) return;
  Object.entries(data).forEach(([key, value]) => {
    localStorage.setItem(storageKey(email, key), JSON.stringify(value));
  });
}
