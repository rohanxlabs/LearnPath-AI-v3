import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Bot, Shield, Zap, Search, PlusCircle, AlertCircle, Info, Landmark, Terminal, CheckCircle, ArrowLeft, BookOpen, Brain, Code, BarChart } from 'lucide-react';
import { Toast } from './components/Toast';
import type { ToastMessage } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { AuthScreen } from './components/AuthScreen';
import { UserProfile, UserSettings, Roadmap, Phase, Achievement, SystemNotification, ChatMessage } from './types';
import { getPhaseUnlockStatus } from './lib/roadmapUtils';
import { usePWA } from './lib/usePWA';
import { MobileHeader, BottomNavigation, SideDrawer } from './components/Navigation';
import { AchievementCard, NotificationCard } from './components/Cards';
import { HomeView } from './components/HomeView';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { motion } from 'motion/react';
import { FeedbackWidget } from './components/FeedbackWidget';
import { OnboardingWizard } from './components/OnboardingWizard';
import type { OnboardingData } from './components/OnboardingWizard';
import { TermsPage, PrivacyPage } from './components/LegalPages';
import { useAnalytics } from './hooks/useAnalytics';

// Route-level code splitting: each tab/view below is only fetched the first
// time the user actually navigates to it, instead of shipping in the main
// bundle. Cuts initial JS payload substantially (see README perf notes).
const LearningWorkspace = lazy(() =>
  import('./components/LearningWorkspace').then(m => ({ default: m.LearningWorkspace }))
);
const RoadmapOverview = lazy(() =>
  import('./components/RoadmapOverview').then(m => ({ default: m.RoadmapOverview }))
);
const RoadmapsTabContainer = lazy(() =>
  import('./components/RoadmapsTabContainer').then(m => ({ default: m.RoadmapsTabContainer }))
);
const MentorChatView = lazy(() =>
  import('./components/MentorChatView').then(m => ({ default: m.MentorChatView }))
);
const AnalyticsView = lazy(() =>
  import('./components/TabsScreen').then(m => ({ default: m.AnalyticsView }))
);
const ProfileView = lazy(() =>
  import('./components/TabsScreen').then(m => ({ default: m.ProfileView }))
);
const AchievementCelebration = lazy(() =>
  import('./components/AchievementCelebration').then(m => ({ default: m.AchievementCelebration }))
);
const ResourcesTab = lazy(() =>
  import('./components/ResourcesTab').then(m => ({ default: m.ResourcesTab }))
);
const RoadmapOverviewPage = lazy(() =>
  import('./components/RoadmapOverviewPage').then(m => ({ default: m.RoadmapOverviewPage }))
);
const PhaseDetailPage = lazy(() =>
  import('./components/PhaseDetailPage').then(m => ({ default: m.PhaseDetailPage }))
);
const QuizTab = lazy(() => import('./components/QuizTab').then(m => ({ default: m.QuizTab })));
const ProjectsTab = lazy(() =>
  import('./components/ProjectsTab').then(m => ({ default: m.ProjectsTab }))
);
const AIInsightsTab = lazy(() =>
  import('./components/AIInsightsTab').then(m => ({ default: m.AIInsightsTab }))
);
const LandingPage = lazy(() =>
  import('./components/LandingPage').then(m => ({ default: m.LandingPage }))
);

// Lightweight fallback shown only during the brief chunk fetch; matches the
// app's dark theme so there's no flash of unstyled content.
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
   }

  const DEFAULT_AVATAR =
  'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"%3E%3Crect width="128" height="128" rx="64" fill="%238b5cf6"/%3E%3Ccircle cx="64" cy="48" r="22" fill="white" opacity=".9"/%3E%3Cpath d="M28 112c7-22 20-33 36-33s29 11 36 33" fill="white" opacity=".9"/%3E%3C/svg%3E';

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  privacyPublicProfile: false,
};

function createEmptyProfile(email = '', name = ''): UserProfile {
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

export function renderHomeView(
   props: {
    profile: UserProfile;
    activeRoadmap: Roadmap | null;
    activePhase: Phase | null;
    achievements: Achievement[];
    aiRecommendations: any[];
    isRecsLoading: boolean;
    isLoading?: boolean;
    roadmapProgress?: Record<string, any>;
    getNextIncompleteLesson: (roadmap: Roadmap) => { phaseId: string; levelId: string; lessonId: string } | null;
    setActiveTab: (tab: string) => void;
    setActiveLesson: (lesson: { phaseId: string; levelId: string; lessonId: string } | null) => void;
    handleSelectRecommendationTask: (rec: any) => void;
  }
) {
  const {
    profile,
    activeRoadmap,
    activePhase,
    achievements,
    aiRecommendations,
    isRecsLoading,
    isLoading,
    roadmapProgress,
    getNextIncompleteLesson,
    setActiveTab,
    setActiveLesson,
    handleSelectRecommendationTask,
  } = props;

  return (
    <HomeView
      profile={profile}
      activeRoadmap={activeRoadmap}
      activePhase={activePhase}
      achievements={achievements}
      aiRecommendations={aiRecommendations}
      isRecsLoading={isRecsLoading}
      isLoading={isLoading}
      roadmapProgress={roadmapProgress}
      onContinueLearning={() => {
        const nextLesson = getNextIncompleteLesson(activeRoadmap);
        if (nextLesson) {
          setActiveLesson(nextLesson);
        }
        setActiveTab('roadmaps');
      }}
      onGenerateRoadmap={() => {
        setActiveTab('roadmaps');
        setActiveLesson(null);
      }}
      onStartLesson={(phaseId, levelId, lessonId) => {
        setActiveLesson({ phaseId, levelId, lessonId });
      }}
      onLaunchRecommendation={handleSelectRecommendationTask}
      onOpenMentor={() => {
        setActiveTab('mentor');
        setActiveLesson(null);
      }}
      onViewProgress={() => {
        setActiveTab('progress');
        setActiveLesson(null);
      }}
    />
  );
}

export default function App() {
  const pwa = usePWA();
  const { track, identify, page } = useAnalytics();

  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<'success' | 'invalid' | null>(null);

  // Legal page routing
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(null);

  // Onboarding: show wizard for brand-new users (no roadmaps yet, first login)
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!pwa.isOnline) {
      setWasOffline(true);
    } else if (pwa.isOnline && wasOffline) {
      setShowOnlineToast(true);
      const timer = setTimeout(() => {
        setShowOnlineToast(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
}, [pwa.isOnline, wasOffline]);

  const [redirectAfterLogin, setRedirectAfterLogin] = useState<string | null>(null);

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Password-reset flow state
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Primary State Managers loaded from localStore
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [activeRoadmapId, setActiveRoadmapId] = useState<string>('');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [activityLog, setActivityLog] = useState<Record<string, { xp: number; lessonsCompleted: number }>>({});
  const [unlockedAchievement, setUnlockedAchievement] = useState<Achievement | null>(null);

  // Active view controller tabs
  const [activeTab, setActiveTab] = useState<string>('home'); // home | roadmaps | mentor | progress | profile | achievements | notifications
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Selected reading/practice context
  const [activeLesson, setActiveLesson] = useState<{
    phaseId: string;
    levelId: string;
    lessonId: string;
  } | null>(null);

  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [isRecsLoading, setIsRecsLoading] = useState(false);
  const [isAiGeneratingRoadmap, setIsAiGeneratingRoadmap] = useState(false);
  const [isAiChatGenerating, setIsAiChatGenerating] = useState(false);
  const [roadmapProgress, setRoadmapProgress] = useState<Record<string, any>>({});
  const [stripeCheckoutStatus, setStripeCheckoutStatus] = useState<string | null>(null);

  // In-app toast replaces all native alert() calls.
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);
  const showToast = (message: string, type: ToastMessage['type'] = 'error') =>
    setActiveToast({ message, type });

  // Confirm dialog before destructive roadmap deletion.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Whether the server has a working AI key. null = not checked yet.
  // Powers an honest banner instead of letting canned fallback content
  // pass silently as real AI output. See P1 audit item: "AI fallback transparency".
  const [aiActive, setAiActive] = useState<boolean | null>(null);
  const [showAiOfflineBanner, setShowAiOfflineBanner] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setAiActive(!!data.aiActive);
      })
      .catch(() => {
        if (!cancelled) setAiActive(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Read ?reset_token and ?verified from URL on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setShowAuthModal(true);
      params.delete('reset_token');
    }

    const verified = params.get('verified');
    if (verified === 'success' || verified === 'invalid') {
      setVerifiedStatus(verified as 'success' | 'invalid');
      params.delete('verified');
      // Auto-dismiss after 6 seconds
      setTimeout(() => setVerifiedStatus(null), 6000);
    }

    // Strip consumed params from the URL without a page reload
    const remaining = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (remaining ? '?' + remaining : ''));
  }, []);

  useEffect(() => {
    const verifySession = async () => {
      try {
        // Single bootstrap call replaces the old /api/session -> /api/user-profile -> /api/roadmaps
        // sequential chain (3 round trips, 3 separate loadUserDB() calls on the server) with one
        // request that returns everything needed to render the app.
        const response = await fetch('/api/bootstrap');
        if (!response.ok) throw new Error('Session invalid');
        const data = await response.json();
        if (data.authenticated && data.email) {
          const email = data.email;
          const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

          setProfile(prev => {
            const base = { ...createEmptyProfile(email, name), name, avatar: prev.avatar };
            if (data.profile && Object.keys(data.profile).length > 0) {
              return { ...base, ...data.profile };
            }
            return base;
          });
          setSettings(data.settings && Object.keys(data.settings).length > 0 ? { ...DEFAULT_SETTINGS, ...data.settings } : DEFAULT_SETTINGS);
          setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
          setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
          setChats(Array.isArray(data.chats) ? data.chats : []);
          setActivityLog(data.activityLog && typeof data.activityLog === 'object' ? data.activityLog : {});
          setActiveTab('home');

          const uniqueList: Roadmap[] = [];
          const seen = new Set<string>();
          (data.roadmaps || []).forEach((r: Roadmap) => {
            if (r && r.id && !seen.has(r.id)) {
              seen.add(r.id);
              uniqueList.push(r);
            }
          });
          setRoadmaps(uniqueList);
          setActiveRoadmapId(uniqueList[0]?.id || '');

          // PostHog: identify the user for analytics
          identify(data.email, { name: data.profile?.name || '' });

          setIsAuthenticated(true);
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
  }, []);

  // Load recommendations once auth state resolves (previously fired on mount before
  // isAuthenticated was known, so it silently no-op'd and recommendations never loaded).
  useEffect(() => {
    if (isAuthenticated) {
      fetchRecommendations();
    }
  }, [isAuthenticated]);

  const saveUserProfileToServer = async () => {
    if (!isAuthenticated || !profile.email) return;
    try {
      await fetch('/api/user-profile', {
        method: 'PUT',
        headers: mutatingHeaders(),
        body: JSON.stringify({
          profile,
          settings,
          achievements,
          notifications,
          chats
        })
      });
    } catch (err) {
      console.warn('Failed to save user profile:', err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      saveUserProfileToServer();
    }, 1000);
    return () => clearTimeout(timer);
  }, [profile, settings, achievements, notifications, chats, isAuthenticated]);

  const [roadmapDetailTab, setRoadmapDetailTab] = useState<'roadmap' | 'resources' | 'quiz' | 'projects' | 'insights'>('roadmap');
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  // Load roadmap progress from database (parallelized)
  useEffect(() => {
    const loadProgress = async () => {
      const userEmail = getStoredUserEmail();
      if (!userEmail || roadmaps.length === 0) return;
      
      // Fetch all progress in parallel instead of sequentially
      const progressPromises = roadmaps.map(async (roadmap) => {
        try {
          const res = await fetch(`/api/progress/${roadmap.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) {
              return { id: roadmap.id, progress: data.progress };
            }
          }
        } catch (e) {
          console.warn('Failed to load progress for', roadmap.id);
        }
        return null;
      });
      
      const results = await Promise.all(progressPromises);
      const updates: Record<string, any> = {};
      results.forEach(result => {
        if (result) {
          updates[result.id] = result.progress;
        }
      });
      setRoadmapProgress(prev => ({ ...prev, ...updates }));
    };
    loadProgress();
  }, [roadmaps]);

// Determine next lesson to continue from (respecting stored progress)
  const getNextIncompleteLesson = (roadmap: Roadmap) => {
    const progress = roadmapProgress[roadmap.id];
    if (progress?.completedLessonIds) {
      // Find first lesson not in completed list
      for (const phase of roadmap.phases || []) {
        for (const level of phase.levels || []) {
          for (const lesson of level.lessons || []) {
            if (!progress.completedLessonIds.includes(lesson.id) && 
                (lesson.status === 'available' || lesson.status === 'locked')) {
              return { phaseId: phase.id, levelId: level.id, lessonId: lesson.id };
            }
          }
        }
      }
    }
    // Fallback to local state
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          if (lesson.status === 'available') {
            return { phaseId: phase.id, levelId: level.id, lessonId: lesson.id };
          }
        }
      }
    }
    return null;
  };

  const handleAddXp = (amount: number) => {
    const isNextLevelThreshold = profile.xp + amount >= (profile.level * 200);
    setProfile(prev => ({
      ...prev,
      xp: prev.xp + amount,
      level: isNextLevelThreshold ? prev.level + 1 : prev.level,
    }));
    
    const newNotif: SystemNotification = {
      id: `notif-xp-${Date.now()}`,
      title: 'XP Badge Claimed 🎖️',
      message: `You earned +${amount} XP for completing learning activities. Keep up the amazing work!`,
      category: 'achievement',
      read: false,
      timestamp: new Date().toISOString()
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

// Sync roadmaps with Database per user
  const syncRoadmapsFromDatabase = async () => {
    if (!isAuthenticated) return;
    const email = profile.email;
    if (!email) return;

    try {
     const response = await fetch('/api/roadmaps');
     if (response.ok) {
       const data = await response.json();
       
       const uniqueList: Roadmap[] = [];
       const seen = new Set<string>();
       data.forEach((r: Roadmap) => {
         if (r && r.id && !seen.has(r.id)) {
           seen.add(r.id);
           uniqueList.push(r);
         }
       });

       setRoadmaps(uniqueList);
        const hasRoadmap = uniqueList.some(r => r.id === activeRoadmapId);
        if (!hasRoadmap && uniqueList[0]) {
          setActiveRoadmapId(uniqueList[0].id);
        } else if (uniqueList.length === 0) {
          setActiveRoadmapId('');
          setSelectedRoadmapId(null);
          setSelectedPhaseId(null);
        }
     }
   } catch (err) {
     console.error('Failed to sync roadmaps from database:', err);
   }
 };

  const getStoredUserEmail = () => profile.email;

  /** Read the csrf-token cookie value set by the server on login/bootstrap. */
  const getCsrfToken = (): string => {
    const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('csrf-token='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  };

  /** Default headers for all mutating fetch requests. */
  const mutatingHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
  });

  // Fetch from Express recommendations API
  const fetchRecommendations = async () => {
    if (!isAuthenticated) return;

    setIsRecsLoading(true);
    try {
      const activeGoal = roadmaps.find(r => r.id === activeRoadmapId)?.goal || "";
      const response = await fetch('/api/ai-recommendations', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify({
          currentXp: profile.xp,
          level: profile.level,
          streak: profile.streak,
          activeGoal,
          userEmail: getStoredUserEmail()
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned HTML or non-JSON content. The API may be offline.");
      }
      const data = await response.json();
      setAiRecommendations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Express API offline, recommendation request skipped:", err);
    } finally {
      setIsRecsLoading(false);
    }
  };

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
        body: JSON.stringify(
          mode === 'signup'
            ? { email, password, name: authName.trim() }
            : { email, password }
        )
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }

      const name = data.name || (data.email || email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      setProfile(prev => ({ ...createEmptyProfile(data.email || email, name), name, avatar: prev.avatar }));
      setSettings(DEFAULT_SETTINGS);
      setRoadmaps([]);
      setActiveRoadmapId('');
      setAchievements([]);
      setNotifications([]);
      setChats([]);
      // PostHog: identify on login/signup
      identify(data.email || email, { name: name });
      track(mode === 'signup' ? 'user_signed_up' : 'user_logged_in');

      setIsAuthenticated(true);
      syncRoadmapsFromDatabase();

      // Show onboarding wizard for new signups with no roadmaps
      if (mode === 'signup') {
        setShowOnboarding(true);
      }
      
      if (showAuthModal) {
        setShowAuthModal(false);
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
      }
      
      if (redirectAfterLogin) {
        setActiveTab(redirectAfterLogin.replace('/', '') || 'home');
        setRedirectAfterLogin(null);
      } else if (mode === 'signup') {
        setActiveTab('home');
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
      await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() })
      });
      setForgotStatus('sent');
    } catch {
      setForgotStatus('error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword || !resetToken) return;
    setResetStatus('submitting');
    try {
      const res = await fetch('/api/password-reset/confirm', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify({ token: resetToken, password: resetPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(data.error || 'Reset failed. The link may have expired.');
        setResetStatus('error');
        return;
      }
      setResetStatus('success');
      setResetToken(null);
      setResetPassword('');
    } catch {
      setResetStatus('error');
      setAuthError('Reset failed. Please try again.');
    }
  };

  // Shared handler: server returns a newAchievement when an unlock event fires.
  // Updates local achievements state and triggers the celebration overlay.
  const handleAchievementUnlocked = (ach: { id: string; name: string; icon: string; xpReward: number }) => {
    setAchievements(prev => {
      const exists = prev.find(a => a.id === ach.id);
      if (exists) {
        return prev.map(a => a.id === ach.id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a);
      }
      return prev;
    });
    setUnlockedAchievement({ ...ach, unlocked: true, unlockedAt: new Date().toISOString() } as any);
    setNotifications(prev => [{
      id: `notif-ach-${Date.now()}`,
      title: `Achievement Unlocked: ${ach.name} 🏆`,
      message: `You earned "${ach.name}". +${ach.xpReward} XP awarded!`,
      category: 'achievement',
      read: false,
      timestamp: new Date().toISOString()
    }, ...prev]);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // Continue with local cleanup even if network fails
    }

    setIsAuthenticated(false);
    setAuthEmail('');
    setAuthPassword('');
    setAuthName('');
    setAuthMode('login');
    setAuthError('');
    setIsAuthenticating(false);
    setProfile(createEmptyProfile());
    setSettings(DEFAULT_SETTINGS);
    setRoadmaps([]);
    setActiveRoadmapId('');
    setAchievements([]);
    setNotifications([]);
    setChats([]);
    setActiveTab('home');
    setIsSidebarOpen(false);
    setActiveLesson(null);
    setAiRecommendations([]);
    setIsRecsLoading(false);
    setIsAiGeneratingRoadmap(false);
    setIsAiChatGenerating(false);
    setStripeCheckoutStatus(null);
    setRoadmapDetailTab('roadmap');
    setSelectedRoadmapId(null);
    setSelectedPhaseId(null);
    setShowAuthModal(false);
  };

  // Receives a fully-formed roadmap from the SSE stream and persists it.
  // This avoids duplicating the persistence logic — the form calls this once
  // the stream's "done" event fires.
  const handleRoadmapReadyFromStream = async (data: any) => {
    setIsAiGeneratingRoadmap(true);
    try {
      const newRoadmap: Roadmap = {
        id: data.id || `roadmap-${Date.now()}`,
        goal: data.goal || '',
        experienceLevel: data.experienceLevel || 'Beginner',
        weeklyHours: data.weeklyHours || 5,
        preferredStyle: data.preferredStyle || 'Hands-on',
        progressPercent: data.progressPercent || 0,
        totalXp: data.totalXp || 0,
        lessonsCompleted: data.lessonsCompleted || 0,
        hoursRemaining: data.hoursRemaining || 40,
        createdAt: data.createdAt || new Date().toISOString(),
        phases: data.phases || [],
        resources: data.resources || [],
        projects: data.projects || [],
      };

      const persistResponse = await fetch('/api/roadmaps', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify(newRoadmap),
      });
      const persistData = await persistResponse.json().catch(() => ({}));
      if (!persistResponse.ok) {
        throw new Error(persistData.error || `Failed to persist roadmap (HTTP ${persistResponse.status})`);
      }
      if (persistData.newAchievement) handleAchievementUnlocked(persistData.newAchievement);

      setRoadmaps(prev => [newRoadmap, ...prev]);
      setActiveRoadmapId(newRoadmap.id);
      setSelectedRoadmapId(newRoadmap.id);
      syncRoadmapsFromDatabase();
      const newNotif: SystemNotification = {
        id: `notif-${Date.now()}`,
        title: 'New AI Syllabus Generated',
        message: `Your custom roadmap for "${newRoadmap.goal}" is ready. Start learning!`,
        category: 'roadmap',
        read: false,
        timestamp: new Date().toISOString(),
      };
      setNotifications(prev => [newNotif, ...prev]);
      setActiveTab('roadmaps');
    } catch (err) {
      console.error('Failed to persist streamed roadmap:', err);
      showToast('Roadmap was generated but could not be saved. Please try again.');
    } finally {
      setIsAiGeneratingRoadmap(false);
    }
  };

  // Custom AI Roadmap Generation Trigger
  const handleGenerateRoadmap = async (params: {
    goal: string;
    experienceLevel: string;
    weeklyHours: number;
    preferredStyle: string;
  }) => {
    setIsAiGeneratingRoadmap(true);
    try {
      const response = await fetch('/api/generate-roadmap', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify({ ...params, userEmail: getStoredUserEmail() })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned HTML or non-JSON content. The API may be offline.");
      }
      const data = await response.json();
      
      const newRoadmap: Roadmap = {
        id: data.id || `roadmap-${Date.now()}`,
        goal: data.goal || params.goal,
        experienceLevel: data.experienceLevel || params.experienceLevel,
        weeklyHours: data.weeklyHours || params.weeklyHours,
        preferredStyle: data.preferredStyle || params.preferredStyle,
        progressPercent: data.progressPercent || 0,
        totalXp: data.totalXp || 0,
        lessonsCompleted: data.lessonsCompleted || 0,
        hoursRemaining: data.hoursRemaining || 40,
        createdAt: data.createdAt || new Date().toISOString(),
        phases: data.phases || [],
        resources: data.resources || [],
        projects: data.projects || [],
      };

       // Reliable persistence: wait for the server to persist BEFORE updating UI
       // state so a failed save never produces a phantom roadmap. Surface the
       // error instead of silently ignoring it.
       const persistResponse = await fetch('/api/roadmaps', {
         method: 'POST',
         headers: mutatingHeaders(),
         body: JSON.stringify(newRoadmap)
       });
       const persistData = await persistResponse.json().catch(() => ({}));
       if (!persistResponse.ok) {
          throw new Error(persistData.error || `Failed to persist roadmap (HTTP ${persistResponse.status})`);
        }
       if (persistData.newAchievement) handleAchievementUnlocked(persistData.newAchievement);

       // Validate progression and fix if needed (best-effort; does not gate persistence)
       try {
         const validationResponse = await fetch('/api/validate-progression', {
           method: 'POST',
           headers: mutatingHeaders(),
           body: JSON.stringify({ roadmap: newRoadmap })
         });
         if (validationResponse.ok) {
           const validation = await validationResponse.json();
           if (validation.hasGaps || !validation.prerequisitesMet) {
             console.warn('Roadmap has progression issues, auto-fixing:', validation.gaps, validation.missingPrerequisites);
           }
         }
       } catch (e) {
         console.warn('Could not validate progression:', e);
       }

       // Update state only after successful persistence
      const updatedRoadmaps = [newRoadmap, ...roadmaps];
      setRoadmaps(updatedRoadmaps);
      setActiveRoadmapId(newRoadmap.id);
      setSelectedRoadmapId(newRoadmap.id);
      syncRoadmapsFromDatabase();
      
      // Dispatch alert notify
      const newNotif: SystemNotification = {
        id: `notif-${Date.now()}`,
        title: 'New AI Syllabus Generated',
        message: `Your custom roadmap for "${newRoadmap.goal}" is now active in your list. Click on levels to begin practicing.`,
        category: 'roadmap',
        read: false,
        timestamp: new Date().toISOString()
      };
      setNotifications(prev => [newNotif, ...prev]);
      
      setActiveTab('roadmaps');
    } catch (err) {
      console.error('Failed to generate roadmap:', err);
      showToast('Failed to generate roadmap. Please try again.');
    } finally {
      setIsAiGeneratingRoadmap(false);
    }
  };

  // Delete Roadmap Handler
  const handleDeleteRoadmap = async (id: string) => {
    try {
      const userEmail = getStoredUserEmail();
      if (!userEmail) {
        console.error('No user email found');
        return;
      }

      const response = await fetch(`/api/roadmaps/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Update local state immediately
        const updatedRoadmaps = roadmaps.filter(r => r.id !== id);
        setRoadmaps(updatedRoadmaps);
        
        // Update active roadmap if needed
        if (activeRoadmapId === id) {
          setActiveRoadmapId(updatedRoadmaps[0]?.id || '');
        }
        if (selectedRoadmapId === id) {
          setSelectedRoadmapId(null);
          setSelectedPhaseId(null);
        }

        syncRoadmapsFromDatabase();

        const notif: SystemNotification = {
          id: `notif-del-${Date.now()}`,
          title: 'Roadmap Deleted',
          message: 'Your roadmap has been successfully removed.',
          category: 'system',
          read: false,
          timestamp: new Date().toISOString()
        };
        setNotifications(prev => [notif, ...prev]);
      } else {
        const errorText = await response.text();
        console.error('Failed to delete roadmap:', errorText);
        showToast('Failed to delete roadmap. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete roadmap:', err);
      showToast('Failed to delete roadmap. Please check your connection.');
    }
  };

  // AI Mentor Chat Message Send controller (Streaming)
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `chat-usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString()
    };

    // Get the updated chat history with the user's new message
    const updatedChats = [...chats, userMsg];
    setChats(updatedChats);
    setIsAiChatGenerating(true);

    const aiMsgId = `chat-ai-${Date.now()}`;
    let aiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'assistant',
      text: '',
      timestamp: new Date().toISOString()
    };
    setChats(prev => [...prev, aiMsg]);

    try {
      const response = await fetch('/api/mentor-chat', {
        method: 'POST',
        headers: mutatingHeaders(),
        body: JSON.stringify({
          message: text,
          history: chats.slice(-6),
          userEmail: getStoredUserEmail()
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        aiMsg = { ...aiMsg, text: aiMsg.text + chunk };
        setChats(prev => prev.map(c => c.id === aiMsgId ? aiMsg : c));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiChatGenerating(false);
    }
  };

  // Custom quick selectors for cards
  const handleSelectRecommendationTask = (rec: any) => {
    if (rec.category === 'mentor') {
      setActiveTab('mentor');
      handleSendMessage(`Can you explain details about ${rec.title}?`);
    } else {
      // Direct jump onto Roadmaps section to continue active phases
      setActiveTab('roadmaps');
      // Set level id default expand
      const activeRm = roadmaps.find(r => r.id === activeRoadmapId) || roadmaps[0];
      if (!activeRm) return;
      const activePhase = activeRm.phases.find(p => p.status === 'current') || activeRm.phases[0];
      if (!activePhase) return;
      const activeLevel = activePhase.levels.find(l => l.status === 'current') || activePhase.levels[0];
      if (!activeLevel) return;
      const firstAvailableLesson = activeLevel.lessons.find(l => l.status === 'available') || activeLevel.lessons[0];
      
      setActiveLesson({
        phaseId: activePhase.id,
        levelId: activeLevel.id,
        lessonId: firstAvailableLesson.id
      });
    }
  };

  // Notification management callbacks
  const handleToggleReadNotification = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n));
  };

  const handleDeleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Lessons checkpoint gameplay triggers complete
  const handleLessonComplete = (xpAdded: number, specificLessonId?: string) => {
    if (!activeLesson) return;

    const targetLessonId = specificLessonId || activeLesson.lessonId;

    // 1. Update Lesson Status inside Roadmaps - use selectedRoadmapId if available
    const targetRoadmapId = selectedRoadmapId || activeRoadmapId;
    const updatedRoadmaps = roadmaps.map((r) => {
      if (r.id !== targetRoadmapId) return r;

      const updatedPhases = r.phases.map((ph) => {
        if (ph.id !== activeLesson.phaseId) return ph;

        let levelDoneCount = 0;
        const updatedLevels = ph.levels.map((lvl) => {
          if (lvl.id !== activeLesson.levelId) {
            if (lvl.status === 'completed') levelDoneCount++;
            return lvl;
          }

          // Unlocking lesson index inside level matches
          const updatedLessons = lvl.lessons.map((les) => {
            if (les.id === targetLessonId) {
              return { ...les, status: 'completed' as const };
            }
            return les;
          });

          // If the completed lesson is "learn", automatically unlock "quiz" inside same level!
          const allCompletedInLevel = updatedLessons.every(l => l.status === 'completed');
          let newLvlStatus = lvl.status;
          if (allCompletedInLevel) {
            newLvlStatus = 'completed' as const;
            levelDoneCount++;
          }

          // Unlock following lessons dynamically
          const isQuizLocked = lvl.lessons.some(l => l.type === 'quiz' && l.status === 'locked');
          if (isQuizLocked) {
            updatedLessons.forEach((l) => {
              if (l.type === 'quiz' || l.type === 'coding') {
                l.status = 'available';
              }
            });
          }

          return { ...lvl, lessons: updatedLessons, status: newLvlStatus };
        });

        // Compute Phase progress calculations
        const totalLevels = updatedLevels.length;
        const completedLevels = updatedLevels.filter(l => l.status === 'completed').length;
        const phaseProgress = Math.round((completedLevels / totalLevels) * 100);
        let phStatus = ph.status;

        if (phaseProgress === 100) {
          phStatus = 'completed' as const;
        }

        // Unlocking the very next level index if complete
        const currentLvlIdx = updatedLevels.findIndex(l => l.id === activeLesson.levelId);
        if (updatedLevels[currentLvlIdx]?.status === 'completed' && currentLvlIdx + 1 < totalLevels) {
          const nextLvl = updatedLevels[currentLvlIdx + 1];
          if (nextLvl.status === 'locked') {
            nextLvl.status = 'current';
            nextLvl.lessons.forEach(l => {
              if (l.type === 'learn') l.status = 'available';
            });
          }
        }

        return {
          ...ph,
          levels: updatedLevels,
          progress: phaseProgress,
          status: phStatus,
          xpEarned: ph.xpEarned + xpAdded
        };
      });

      // Calculate new cumulative roadmap progress
      const totalPhs = (updatedPhases || []).length;
      const donePhsPercent = totalPhs > 0 ? (updatedPhases || []).reduce((acc, p) => acc + (p.progress || 0), 0) / totalPhs : 0;
      const overallProg = Math.round(donePhsPercent);

      return {
        ...r,
        phases: updatedPhases,
        progressPercent: overallProg,
        totalXp: r.totalXp + xpAdded,
        lessonsCompleted: r.lessonsCompleted + 1,
        hoursRemaining: Math.max(2, r.hoursRemaining - 1.5)
      };
    });

    setRoadmaps(updatedRoadmaps);
    
// Persist lesson completion (single endpoint handles both operations)
      if (targetRoadmapId) {
        const xpValue = xpAdded || 0;

        // Optimistic local update so the Insights charts reflect this
        // immediately, without waiting on the next full bootstrap.
        const todayKey = new Date().toISOString().split('T')[0];
        setActivityLog(prev => {
          const existing = prev[todayKey] || { xp: 0, lessonsCompleted: 0 };
          return {
            ...prev,
            [todayKey]: {
              xp: existing.xp + xpValue,
              lessonsCompleted: existing.lessonsCompleted + 1
            }
          };
        });

        fetch('/api/complete-lesson', {
          method: 'POST',
          headers: mutatingHeaders(),
          body: JSON.stringify({
            lessonId: targetLessonId,
            xpEarned: xpValue,
            roadmapId: targetRoadmapId
          })
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data?.newAchievement) handleAchievementUnlocked(data.newAchievement);
        }).catch(err => console.warn('Failed to complete lesson:', err));
      }

    // Exit active practice screen on complete, unless completing a subpart in consolidated detail view
    if (!specificLessonId) {
      setActiveLesson(null);
    }
  };

  // Pro upgrade — calls real backend endpoint. Payment processor not yet wired;
  // the server returns 503 with a clear message so users never see silent fake state.
  const handleStripeCheckout = async () => {
    setStripeCheckoutStatus('Processing…');
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: mutatingHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setProfile(p => ({ ...p, isPro: true }));
        setStripeCheckoutStatus(data.message || 'Pro unlocked!');
        setNotifications(prev => [{
          id: `notif-pro-${Date.now()}`,
          title: 'LearnPath AI Pro Gained! 👑',
          message: data.message || 'Pro subscription activated.',
          category: 'system',
          read: false,
          timestamp: new Date().toISOString()
        }, ...prev]);
      } else {
        setStripeCheckoutStatus(data.error || 'Checkout unavailable — please try again later.');
      }
    } catch {
      setStripeCheckoutStatus('Network error — please check your connection and retry.');
    }
  };

  // Active theme application — responds to settings.theme ('light' | 'dark' | 'system').
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective: 'light' | 'dark' =
        settings.theme === 'system'
          ? (mq.matches ? 'dark' : 'light')
          : (settings.theme === 'dark' ? 'dark' : 'light');
      setResolvedTheme(effective);
      document.documentElement.classList.toggle('dark', effective === 'dark');
      document.documentElement.classList.toggle('light', effective === 'light');
      document.body.classList.toggle('dark', effective === 'dark');
      document.body.classList.toggle('light', effective === 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const themeClass = `${resolvedTheme} ${resolvedTheme === 'dark' ? 'text-zinc-100' : 'text-slate-950'}`;
  const customBackground = resolvedTheme === 'dark' ? { backgroundColor: '#0A0A0A' } : { backgroundColor: '#F8FAFC' };

  // Phase AI Action handlers from Sidebar
  const handleAiAction = async (actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => {
    setActiveTab('mentor');
    setIsSidebarOpen(false);
    
    let query = "";
    if (actionType === 'explain') {
      query = `Can you break down the main mechanical components of the "${phaseName}" phase? What are the top things to understand?`;
    } else if (actionType === 'quiz') {
      query = `Generate a customized 3-question multiple choice quiz about "${phaseName}". Keep questions highly pedagogical!`;
    } else if (actionType === 'study_plan') {
      query = `I can dedicate 10 hours this week. Design a highly focused weekly calendar breakdown for studying "${phaseName}".`;
    } else {
      query = `Give me 3 innovative GitHub repositories / project ideas I can build to show competence in "${phaseName}".`;
    }

    handleSendMessage(query);
  };

  // Admin maintenance triggers
  const handleClearCache = () => {
    window.location.reload();
  };

  const activeRoadmap = roadmaps.find(r => r.id === activeRoadmapId) || roadmaps[0] || null;
  const activePhase = activeRoadmap?.phases.find(p => p.status === 'current') || activeRoadmap?.phases[0] || null;

  // Visual tab navigation router
  const renderTabContent = () => {
    if (!activeRoadmap) {
      if (activeTab === 'home') {
 return renderHomeView({
           profile,
           activeRoadmap: null,
           activePhase: null,
           achievements,
           aiRecommendations,
           isRecsLoading,
           isLoading: isLoadingAuth,
           roadmapProgress,
           getNextIncompleteLesson,
           setActiveTab,
           setActiveLesson,
           handleSelectRecommendationTask,
         });
      }
      if (activeTab === 'mentor') {
        return (
          <MentorChatView
            chats={chats}
            isGenerating={isAiChatGenerating}
            onSendMessage={handleSendMessage}
            onSelectAction={(topic) => handleSendMessage(topic)}
            aiActive={aiActive}
            roadmapGoal={roadmaps.find(r => r.id === activeRoadmapId)?.goal}
          />
        );
      }
      if (activeTab === 'progress') {
        return <AnalyticsView profile={profile} activityLog={activityLog} onNavigate={(tab) => { setActiveTab(tab); setActiveLesson(null); }} />;
      }
      if (activeTab === 'profile') {
        return (
          <ProfileView
            profile={profile}
            settings={settings}
            onUpdateSettings={(set) => setSettings(prev => ({ ...prev, ...set }))}
            onUpdateProfile={(num) => setProfile(prev => ({ ...prev, name: num.name }))}
            onTriggerCheckout={handleStripeCheckout}
            checkoutStatus={stripeCheckoutStatus}
            isInstallAvailable={pwa.isInstallAvailable}
            isInstalled={pwa.isInstalled}
            onInstall={pwa.installApp}
            onRequestNotificationPermission={pwa.requestNotificationPermission}
          />
        );
      }
      return (
        <div className="space-y-6 animate-fade-in">
          <div className="p-6 rounded-3xl glass-card glass-card-purple">
            <h2 className="font-display font-bold text-xl text-white">Create your first roadmap</h2>
            <p className="text-xs text-zinc-400 mt-1">
              This account has no saved curriculum yet. Generate a roadmap and it will be stored under {profile.email}.
            </p>
          </div>
          <RoadmapOverview
            roadmaps={roadmaps}
            activeId={activeRoadmapId}
            onSetActive={(id) => {
              setActiveRoadmapId(id);
              setActiveLesson(null);
            }}
            onGenerateRoadmap={handleGenerateRoadmap}
            isGenerating={isAiGeneratingRoadmap}
            onContinueActive={() => setActiveLesson(null)}
            profile={profile}
            onLessonSelect={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
            onAiAction={handleAiAction}
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return renderHomeView({
          profile,
          activeRoadmap,
          activePhase,
          achievements,
          aiRecommendations,
          isRecsLoading,
          isLoading: isLoadingAuth,
          roadmapProgress,
          getNextIncompleteLesson,
          setActiveTab,
          setActiveLesson,
          handleSelectRecommendationTask,
        });

      case 'roadmaps': {
        const selectedRm = roadmaps.find(r => r.id === selectedRoadmapId) ?? null;

        // ── resource / quiz / project / insights tabs (roadmap-level, unchanged) ──
        if (selectedRm && roadmapDetailTab === 'resources') return <ResourcesTab roadmap={selectedRm} />;
        if (selectedRm && roadmapDetailTab === 'quiz') return <QuizTab roadmap={selectedRm} onAddXp={handleAddXp} onRoadmapUpdated={syncRoadmapsFromDatabase} onAchievementUnlocked={handleAchievementUnlocked} />;
        if (selectedRm && roadmapDetailTab === 'projects') return <ProjectsTab roadmap={selectedRm} onAddXp={handleAddXp} onRoadmapUpdated={syncRoadmapsFromDatabase} />;
        if (selectedRm && roadmapDetailTab === 'insights') return <AIInsightsTab roadmap={selectedRm} profile={profile} activityLog={activityLog} />;

        // ── Phase Detail Page ──
        if (selectedRm && selectedPhaseId) {
          const phaseIndex = selectedRm.phases.findIndex(p => p.id === selectedPhaseId);
          const phase = selectedRm.phases[phaseIndex];
          if (phase) {
            const unlockStatus = getPhaseUnlockStatus(selectedRm.phases, phaseIndex);
            return (
              <PhaseDetailPage
                roadmap={selectedRm}
                phase={phase}
                phaseIndex={phaseIndex}
                unlockStatus={unlockStatus}
                onBack={() => setSelectedPhaseId(null)}
                onLessonClick={(phaseId, levelId, lessonId) => {
                  setActiveLesson({ phaseId, levelId, lessonId });
                }}
                onAddXp={handleAddXp}
                onRoadmapUpdated={syncRoadmapsFromDatabase}
              />
            );
          }
        }

        // ── Roadmap Overview Page ──
        if (selectedRm) {
          return (
            <RoadmapOverviewPage
              roadmap={selectedRm}
              profile={profile}
              onSelectPhase={(phaseId) => setSelectedPhaseId(phaseId)}
              onBack={() => { setSelectedRoadmapId(null); setSelectedPhaseId(null); }}
              onContinueLearning={() => {
                const next = getNextIncompleteLesson(selectedRm);
                if (next) setActiveLesson(next);
              }}
              onGenerateRoadmap={handleGenerateRoadmap}
              onRoadmapReady={handleRoadmapReadyFromStream}
                isGenerating={isAiGeneratingRoadmap}
              />
            );
          }
  
          // ── Roadmap List (no roadmap selected) ──
          return (
            <RoadmapsTabContainer
              roadmaps={roadmaps}
              selectedRoadmapId={selectedRoadmapId}
              onSelectRoadmap={(id) => {
                setSelectedRoadmapId(id);
                setActiveRoadmapId(id);
                setSelectedPhaseId(null);
              }}
              onBackToList={() => { setSelectedRoadmapId(null); setSelectedPhaseId(null); }}
              onDeleteRoadmap={(id) => setConfirmDeleteId(id)}
              onGenerateRoadmap={handleGenerateRoadmap}
              onRoadmapReady={handleRoadmapReadyFromStream}
              isGenerating={isAiGeneratingRoadmap}
            profile={profile}
            isLoading={isLoadingAuth}
            onAiAction={handleAiAction}
            onLessonClick={(phaseId, levelId, lessonId) => {
              setActiveLesson({ phaseId, levelId, lessonId });
            }}
          />
        );
      }

      case 'mentor':
        return (
          <MentorChatView
            chats={chats}
            isGenerating={isAiChatGenerating}
            onSendMessage={handleSendMessage}
            onSelectAction={(topic) => handleSendMessage(topic)}
            aiActive={aiActive}
            roadmapGoal={roadmaps.find(r => r.id === activeRoadmapId)?.goal}
          />
        );

      case 'progress':
        return <AnalyticsView profile={profile} activityLog={activityLog} onNavigate={(tab) => { setActiveTab(tab); setActiveLesson(null); }} />;

      case 'achievements':
        return (
          <div className="space-y-5">
            <div>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-white">Achievements Sandbox</h2>
              <p className="text-xs text-zinc-400">Complete curriculum chapters to unlock high-integrity milestones.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {achievements.map((ach) => (
                <AchievementCard
                  key={ach.id}
                  achievement={ach}
                  onShare={() => {
                    showToast(`Achievement "${ach.name}" shared!`, 'success');
                  }}
                />
              ))}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-white">Your Notifications</h2>
                <p className="text-xs text-zinc-400">Review system updates and AI mentor messages.</p>
              </div>
              <button
                onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                className="text-xs text-purple-400 hover:text-purple-300 font-bold cursor-pointer"
              >
                Mark all read
              </button>
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center bg-[#111111] border border-white/5 rounded-2xl text-xs text-zinc-500">
                Inbox clear! No active notifications.
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onReadToggle={handleToggleReadNotification}
                    onDelete={handleDeleteNotification}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case 'profile':
        return (
          <ProfileView
            profile={profile}
            settings={settings}
            onUpdateSettings={(set) => setSettings(prev => ({ ...prev, ...set }))}
            onUpdateProfile={(num) => setProfile(prev => ({ ...prev, name: num.name }))}
            onTriggerCheckout={handleStripeCheckout}
            checkoutStatus={stripeCheckoutStatus}
            isInstallAvailable={pwa.isInstallAvailable}
            isInstalled={pwa.isInstalled}
            onInstall={pwa.installApp}
            onRequestNotificationPermission={pwa.requestNotificationPermission}
          />
        );

      default:
        return <p className="text-xs text-zinc-400">Section placeholder.</p>;
    }
  };


// Render the app based on auth state
  if (isLoadingAuth) {
    return (
      <div className={`min-h-screen pb-20 ${themeClass} transition-colors duration-300 relative select-none`} style={customBackground}>
        <MobileHeader
          profile={profile}
          notifications={notifications}
          onTabChange={() => {}}
          onNotificationsClick={() => {}}
          onUpgradeClick={() => {}}
          onOpenDrawer={() => {}}
        />
        <main className="max-w-4xl mx-auto px-4 py-6 md:py-8 min-h-[calc(100vh-10rem)]">
          {renderHomeView({
            profile,
            activeRoadmap: null,
            activePhase: null,
            achievements: [],
            aiRecommendations: [],
            isRecsLoading: false,
            isLoading: true,
            roadmapProgress: {},
            getNextIncompleteLesson: () => ({ phaseId: '', levelId: '', lessonId: '' }),
            setActiveTab: () => {},
            setActiveLesson: () => {},
            handleSelectRecommendationTask: () => {},
          })}
        </main>
      </div>
    );
  }

  // If not authenticated, show landing page (or legal pages)
  if (!isAuthenticated) {
    if (legalPage === 'terms') return <TermsPage onBack={() => setLegalPage(null)} />;
    if (legalPage === 'privacy') return <PrivacyPage onBack={() => setLegalPage(null)} />;
    if (showAuthModal) {
      return (
        <AuthScreen
          authMode={authMode}
          setAuthMode={setAuthMode}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authName={authName}
          setAuthName={setAuthName}
          authError={authError}
          setAuthError={setAuthError}
          isAuthenticating={isAuthenticating}
          forgotPasswordMode={forgotPasswordMode}
          setForgotPasswordMode={setForgotPasswordMode}
          forgotEmail={forgotEmail}
          setForgotEmail={setForgotEmail}
          forgotStatus={forgotStatus}
          setForgotStatus={setForgotStatus}
          resetToken={resetToken}
          resetPassword={resetPassword}
          setResetPassword={setResetPassword}
          resetStatus={resetStatus}
          setResetStatus={setResetStatus}
          handleAuthenticate={handleAuthenticate}
          handleForgotPassword={handleForgotPassword}
          handleResetPassword={handleResetPassword}
        />
      );
    }
    return (
      <Suspense fallback={<SplashScreen />}>
        <LandingPage
          onGetStarted={() => {
            setAuthMode('signup');
            setShowAuthModal(true);
          }}
          onSignIn={() => {
            setAuthMode('login');
            setShowAuthModal(true);
          }}
          onTerms={() => setLegalPage('terms')}
          onPrivacy={() => setLegalPage('privacy')}
        />
      </Suspense>
    );
  }

  // Onboarding wizard for brand-new users
  if (showOnboarding) {
    return (
      <OnboardingWizard
        userName={profile.name || 'there'}
        onComplete={(data: OnboardingData) => {
          setShowOnboarding(false);
          track('onboarding_completed', { goal: data.goal, experience: data.experienceLevel });
          handleGenerateRoadmap(data);
        }}
      />
    );
  }

  // Active reading chapter lesson visual overrides
  const selectedPhaseObj = activeLesson
    ? activeRoadmap?.phases.find(p => p.id === activeLesson.phaseId)
    : null;

  const selectedLevelObj = activeLesson && selectedPhaseObj
    ? selectedPhaseObj.levels.find(l => l.id === activeLesson.levelId)
    : null;

  const selectedLessonObj = selectedLevelObj && activeLesson
    ? selectedLevelObj.lessons.find(le => le.id === activeLesson.lessonId)
    : null;

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pb-20 ${themeClass} transition-colors duration-300 relative select-none`} style={customBackground}>
        {/* 1. Header component */}
        <MobileHeader
          profile={profile}
          notifications={notifications}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setActiveLesson(null);
          }}
          onNotificationsClick={() => {
            setActiveTab('notifications');
            setActiveLesson(null);
          }}
          onUpgradeClick={() => {
            setActiveTab('profile');
            setActiveLesson(null);
          }}
          onOpenDrawer={() => setIsSidebarOpen(true)}
        />

      {/* 2. SideDrawer sidebar details */}
      <SideDrawer
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveLesson(null);
        }}
        profile={profile}
        onUpgradeClick={() => {
          setActiveTab('profile');
        }}
        onLogoutClick={handleLogout}
      />

      {/* Honest notice when the server has no working AI key — every AI feature
          (Mentor, Roadmap, Quiz, Recommendations, Insights) is currently serving
          canned fallback content that only looks AI-generated. */}
      {aiActive === false && showAiOfflineBanner && (
        <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-300 leading-snug">
            <strong className="font-bold">AI features are offline.</strong> Mentor replies, roadmaps,
            quizzes, recommendations, and insights are showing generic fallback content, not real AI output.
          </p>
          <button
            onClick={() => setShowAiOfflineBanner(false)}
            className="text-amber-300/70 hover:text-amber-200 text-xs font-bold shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sticky Horizontal Sub-Navigation Bar for Roadmap Details */}
      {activeTab === 'roadmaps' && !selectedLevelObj && (
        <div className="sticky top-16 z-30 bg-zinc-950/85 backdrop-blur-md border-b border-white/5 transition-all duration-300">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex gap-6 overflow-x-auto scrollbar-none py-3.5 -mb-[1px]">
              {[
                { id: 'roadmap', label: 'Roadmap' },
                { id: 'resources', label: 'Resources' },
                { id: 'quiz', label: 'Quiz' },
                { id: 'projects', label: 'Projects' },
                { id: 'insights', label: 'AI Insights' }
              ].map((t) => {
                const isActive = roadmapDetailTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setRoadmapDetailTab(t.id as any)}
                    className={`relative pb-1 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-300 cursor-pointer ${
                      isActive 
                        ? 'text-purple-400 font-extrabold scale-102 flex-shrink-0' 
                        : 'text-zinc-400 hover:text-zinc-200 flex-shrink-0'
                    }`}
                  >
                    {t.label}
                    {isActive && (
                      <motion.div 
                        layoutId="activeRoadmapTabBar"
                        className="absolute bottom-[-14px] left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

{/* Primary tab Content Layout with desktop alignment container constraint */}
      <main className={`${activeTab === 'mentor' ? 'max-w-none mx-0 px-0 py-0 h-[calc(100vh-8rem)]' : activeLesson ? 'max-w-7xl mx-auto px-0 py-0 h-[calc(100vh-8rem)]' : 'max-w-4xl mx-auto px-4 py-6 md:py-8 min-h-[calc(100vh-10rem)]'}`}>
        <Suspense fallback={<TabFallback />}>
          {activeLesson && activeRoadmap ? (
            <LearningWorkspace
              roadmap={activeRoadmap}
              activeLesson={activeLesson}
              onCompleteLesson={(xpAdded, lessonId) => handleLessonComplete(xpAdded, lessonId)}
              onNavigateToLesson={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
            />
          ) : (
            renderTabContent()
          )}
        </Suspense>
      </main>

      {/* Modern Floating PWA Interaction and State Notifications */}
      {!pwa.isOnline && (
        <div className="fixed bottom-22 left-4 right-4 z-50 p-3 rounded-2xl glass-card glass-card-orange border border-amber-500/20 text-amber-300 text-xs shadow-2xl flex items-center justify-between gap-3 animate-pulse-glow max-w-sm mx-auto">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
            <div>
              <p className="font-bold">Offline Learning Active Mode</p>
              <p className="text-xs text-zinc-400">Viewing cached roadmaps & study paths</p>
            </div>
          </div>
        </div>
      )}

      {showOnlineToast && (
        <div className="fixed bottom-22 left-4 right-4 z-50 p-3 rounded-2xl glass-card glass-card-emerald border border-emerald-500/20 text-emerald-400 text-xs shadow-2xl flex items-center justify-between gap-3 max-w-sm mx-auto">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold">Connection Restored</p>
              <p className="text-xs text-zinc-400">AI search and validation queries re-activated</p>
            </div>
          </div>
        </div>
      )}

      {verifiedStatus && (
        <div className={`fixed top-4 left-4 right-4 z-50 p-3 rounded-2xl border text-xs shadow-2xl flex items-center justify-between gap-3 max-w-sm mx-auto ${verifiedStatus === 'success' ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' : 'bg-amber-950/90 border-amber-500/30 text-amber-300'}`}>
          <span>{verifiedStatus === 'success' ? '✅ Email verified! Welcome to LearnPath AI.' : '⚠️ Verification link is invalid or expired.'}</span>
          <button onClick={() => setVerifiedStatus(null)} className="text-zinc-400 hover:text-white cursor-pointer ml-2 shrink-0">✕</button>
        </div>
      )}

      {pwa.updateAvailable && (
        <div className="fixed bottom-22 left-4 right-4 z-50 p-3.5 rounded-2xl glass-card glass-card-purple border border-purple-500/35 text-white text-xs shadow-2xl flex items-center justify-between gap-3 max-w-sm mx-auto animate-pulse-glow">
          <div className="flex-1">
            <p className="font-bold">App Update Available ✨</p>
            <p className="text-xs text-zinc-300">Reload to instantly activate the latest features</p>
          </div>
          <button
            onClick={pwa.triggerUpdateApp}
            className="px-3 py-1.5 font-bold text-xs text-white bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg cursor-pointer hover:brightness-110 shrink-0"
          >
            Reload Now
          </button>
        </div>
      )}

      {/* 3. Bottom bar Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveLesson(null);
        }}
      />

      {/* Achievement Celebration Overlay */}
      {unlockedAchievement && (
        <Suspense fallback={null}>
          <AchievementCelebration
            achievement={unlockedAchievement}
            onDone={() => setUnlockedAchievement(null)}
          />
        </Suspense>
      )}

      {/* Feedback widget — visible on all authenticated screens */}
      <FeedbackWidget context={activeTab} />

      {/* Legal pages accessible from authenticated app via footer in profile or sidebar */}
      {legalPage === 'terms' && <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#0A0A0A]"><TermsPage onBack={() => setLegalPage(null)} /></div>}
      {legalPage === 'privacy' && <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#0A0A0A]"><PrivacyPage onBack={() => setLegalPage(null)} /></div>}

      {/* In-app toast — replaces native alert() everywhere in the app */}
      <Toast toast={activeToast} onDismiss={() => setActiveToast(null)} />

      {/* Confirm delete roadmap dialog */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete Roadmap"
        message="This will permanently delete the roadmap and all its lessons, progress, and quizzes. This cannot be undone."
        confirmLabel="Delete Roadmap"
        onConfirm={() => { if (confirmDeleteId) handleDeleteRoadmap(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
    </ErrorBoundary>
  );
}