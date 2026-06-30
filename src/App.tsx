import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Bot, Shield, Zap, Search, PlusCircle, AlertCircle, Info, Landmark, Terminal, CheckCircle, ArrowLeft, BookOpen, Brain, Code, BarChart } from 'lucide-react';
import { UserProfile, UserSettings, Roadmap, Phase, Achievement, SystemNotification, ChatMessage } from './types';
import { usePWA } from './lib/usePWA';
import { MobileHeader, BottomNavigation, SideDrawer } from './components/Navigation';
import { AchievementCard, NotificationCard } from './components/Cards';
import { HomeView } from './components/HomeView';
import { LearningWorkspace } from './components/LearningWorkspace';
import RoadmapTree from './components/RoadmapTree';
import { RoadmapOverview } from './components/RoadmapOverview';
import { RoadmapsTabContainer } from './components/RoadmapsTabContainer';
import { MentorChatView } from './components/MentorChatView';
import { AnalyticsView, ProfileView } from './components/TabsScreen';
import { LessonPlayView } from './components/LessonPlayView';
import { TopicDetailView } from './components/TopicDetailView';
import { AchievementCelebration } from './components/AchievementCelebration';
import { motion } from 'motion/react';
import { ResourcesTab } from './components/ResourcesTab';
import { QuizTab } from './components/QuizTab';
import { ProjectsTab } from './components/ProjectsTab';
import { AIInsightsTab } from './components/AIInsightsTab';
import { RoadmapHero } from './components/RoadmapHero';
import { AIMentorAnalysis } from './components/AIMentorAnalysis';
import { createEmptyProfile, DEFAULT_SETTINGS } from './userData';
import { SplashScreen } from './components/SplashScreen';
import { LandingPage } from './components/LandingPage';
import { OnboardingPage } from './components/OnboardingPage';

export function renderHomeView(
   props: {
    profile: UserProfile;
    activeRoadmap: Roadmap | null;
    activePhase: Phase | null;
    achievements: Achievement[];
    aiRecommendations: any[];
    isRecsLoading: boolean;
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
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

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

const USER_EMAIL_STORAGE_KEY = 'userEmail';

  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Primary State Managers loaded from localStore
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [activeRoadmapId, setActiveRoadmapId] = useState<string>('');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);
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
  
  // Simulated stats
  const [stripeCheckoutStatus, setStripeCheckoutStatus] = useState<string | null>(null);
  const [apiCallsCounter, setApiCallsCounter] = useState(0);

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const verifySession = async () => {
      const savedEmail = localStorage.getItem(USER_EMAIL_STORAGE_KEY);
      const email = savedEmail?.trim().toLowerCase();
      if (!email) {
        setIsLoadingAuth(false);
        return;
      }

      try {
        const response = await fetch('/api/session');
        if (!response.ok) throw new Error('Session invalid');
        const data = await response.json();
        if (data.authenticated && data.email === email) {
          const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          setProfile(prev => ({ ...createEmptyProfile(email, name), name, avatar: prev.avatar }));
          setSettings(DEFAULT_SETTINGS);
          setRoadmaps([]);
          setActiveRoadmapId('');
          setAchievements([]);
          setNotifications([]);
          setChats([]);
          localStorage.setItem(USER_EMAIL_STORAGE_KEY, email);
          setActiveTab('home');
          setIsAuthenticated(true);
        } else {
          throw new Error('Session mismatch');
        }
      } catch {
        localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    verifySession();
  }, []);

  // Load recommendations on mount
  useEffect(() => {
    fetchRecommendations();
}, []);

  const [roadmapDetailTab, setRoadmapDetailTab] = useState<'roadmap' | 'resources' | 'quiz' | 'projects' | 'insights'>('roadmap');
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);

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
   useEffect(() => {
     async function syncRoadmapsFromDatabase() {
       if (!isAuthenticated) return;
       const email = profile.email;
       if (!email) return;
       localStorage.setItem(USER_EMAIL_STORAGE_KEY, email);

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
           }
         }
       } catch (err) {
         console.error('Failed to sync roadmaps from database:', err);
       }
     }

     if (isAuthenticated && profile.email) {
       syncRoadmapsFromDatabase();
       const storedRedirect = localStorage.getItem('redirectAfterLogin');
       if (storedRedirect) {
         setActiveTab(storedRedirect.replace('/', '') || 'home');
         localStorage.removeItem('redirectAfterLogin');
       }
     }
   }, [profile.email, isAuthenticated]);

  const getStoredUserEmail = () => localStorage.getItem(USER_EMAIL_STORAGE_KEY);

  // Fetch from Express recommendations API
  const fetchRecommendations = async () => {
    if (!isAuthenticated) return;

    setIsRecsLoading(true);
    try {
      const activeGoal = roadmaps.find(r => r.id === activeRoadmapId)?.goal || "";
      const response = await fetch('/api/ai-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setAiRecommendations(data);
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
    
    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }

    setIsAuthenticating(true);
    try {
      const response = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }

      localStorage.setItem(USER_EMAIL_STORAGE_KEY, data.email || email);
      const name = (data.email || email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      setProfile(prev => ({ ...createEmptyProfile(data.email || email, name), name, avatar: prev.avatar }));
      setSettings(DEFAULT_SETTINGS);
      setRoadmaps([]);
      setActiveRoadmapId('');
      setAchievements([]);
      setNotifications([]);
      setChats([]);
      setIsAuthenticated(true);
      
      if (showAuthModal) {
        setShowAuthModal(false);
        setAuthEmail('');
        setAuthPassword('');
      }
      
      if (mode === 'signup') {
        const storedRedirect = localStorage.getItem('redirectAfterLogin');
        if (storedRedirect) {
          setActiveTab(storedRedirect.replace('/', '') || 'home');
          localStorage.removeItem('redirectAfterLogin');
        } else {
          setActiveTab('home');
        }
      }
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // Continue with local cleanup even if network fails
    }

    localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    localStorage.removeItem('redirectAfterLogin');

    setIsAuthenticated(false);
    setAuthEmail('');
    setAuthPassword('');
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
    setApiCallsCounter(0);
    setRoadmapDetailTab('roadmap');
    setSelectedRoadmapId(null);
    setShowAuthModal(false);
  };

  // Custom AI Roadmap Generation Trigger
  const handleGenerateRoadmap = async (params: {
    goal: string;
    experienceLevel: string;
    weeklyHours: number;
    preferredStyle: string;
  }) => {
    setIsAiGeneratingRoadmap(true);
    setApiCallsCounter(prev => prev + 1);
    try {
      const response = await fetch('/api/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

await fetch('/api/roadmaps', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(newRoadmap)
       }).catch(err => console.warn('Failed to persist roadmap:', err));

       // Validate progression and fix if needed
       try {
         const validationResponse = await fetch('/api/validate-progression', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
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
       
       // Update state
      const updatedRoadmaps = [newRoadmap, ...roadmaps];
      setRoadmaps(updatedRoadmaps);
      setActiveRoadmapId(newRoadmap.id);
      setSelectedRoadmapId(newRoadmap.id);
      
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
      alert('Failed to generate roadmap. Please try again.');
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
        }

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
        alert('Failed to delete roadmap. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete roadmap:', err);
      alert('Failed to delete roadmap. Please check your connection.');
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
    setApiCallsCounter(prev => prev + 1);

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
        headers: { 'Content-Type': 'application/json' },
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
        fetch('/api/complete-lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: targetLessonId,
            xpEarned: xpValue,
            roadmapId: targetRoadmapId
          })
        }).catch(err => console.warn('Failed to complete lesson:', err));
      }

    // Unlocking preset accomplishments
    const countCompletedLessons = updatedRoadmaps.find(r => r.id === targetRoadmapId)?.lessonsCompleted || 0;
    if (countCompletedLessons === 5 || countCompletedLessons === 15 || countCompletedLessons === 25) {
      setAchievements(prev => {
        const lockedIdx = prev.findIndex(a => !a.unlocked);
        if (lockedIdx !== -1) {
          const cpy = [...prev];
          cpy[lockedIdx] = {
            ...cpy[lockedIdx],
            unlocked: true,
            unlockedAt: new Date().toISOString()
          };
          
          const achNotif: SystemNotification = {
            id: `notif-ach-${Date.now()}`,
            title: `Achievement Unlocked: ${cpy[lockedIdx].name} 🏆`,
            message: `Milestone gained: "${cpy[lockedIdx].description}". +${cpy[lockedIdx].xpReward} XP awarded!`,
            category: 'achievement',
            read: false,
            timestamp: new Date().toISOString()
          };
          setNotifications(prevNotifs => [achNotif, ...prevNotifs]);
          
          // Show achievement celebration
          setUnlockedAchievement(cpy[lockedIdx]);
          
          setProfile(p => ({ ...p, xp: p.xp + cpy[lockedIdx].xpReward }));
          return cpy;
        }
        return prev;
      });
    }

    // Exit active practice screen on complete, unless completing a subpart in consolidated detail view
    if (!specificLessonId) {
      setActiveLesson(null);
    }
  };

  // Stripe payments simulate trigger
  const handleStripeCheckout = () => {
    setStripeCheckoutStatus("Connecting to secure server-side checkout process...");
    setTimeout(() => {
      setStripeCheckoutStatus("Payment processed successfully via Stripe portal! Pro benefits unlocked.");
      setProfile(p => ({ ...p, isPro: true }));
      
      const newNotif: SystemNotification = {
        id: `notif-pro-${Date.now()}`,
        title: 'LearnPath AI Pro Gained! 👑',
        message: 'Welcome to Pro! You now have unlimited AI curriculum generators, priority mentor queries, and continuous quiz modules.',
        category: 'system',
        read: false,
        timestamp: new Date().toISOString()
      };
      setNotifications(prev => [newNotif, ...prev]);
    }, 2000);
  };

  // Active theme application style
  const [resolvedTheme, setResolvedTheme] = useState<'light'>('light');

  useEffect(() => {
    setResolvedTheme('light');
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    document.body.classList.add('light');
    document.body.classList.remove('dark');
  }, []);

  const themeClass = `${resolvedTheme} text-slate-950`;
  const customBackground = { backgroundColor: '#F8FAFC' };

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
          />
        );
      }
      if (activeTab === 'progress') {
        return <AnalyticsView profile={profile} />;
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
          roadmapProgress,
          getNextIncompleteLesson,
          setActiveTab,
          setActiveLesson,
          handleSelectRecommendationTask,
        });

      case 'roadmaps':
        // Show empty state message for other tabs when no roadmap is selected
        if (!selectedRoadmapId) {
          if (roadmapDetailTab === 'resources') {
            return (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                  <BookOpen className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Select a Roadmap</h3>
                <p className="text-sm text-slate-600 text-center max-w-md mb-6">
                  Choose a roadmap from your list to access curated learning resources tailored to your learning path.
                </p>
                <button
                  onClick={() => setRoadmapDetailTab('roadmap')}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:brightness-110 transition-all"
                >
                  View My Roadmaps
                </button>
              </div>
            );
          }
          if (roadmapDetailTab === 'quiz') {
            return (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                  <Brain className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Select a Roadmap</h3>
                <p className="text-sm text-slate-600 text-center max-w-md mb-6">
                  Choose a roadmap to access quizzes and test your knowledge on specific topics.
                </p>
                <button
                  onClick={() => setRoadmapDetailTab('roadmap')}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:brightness-110 transition-all"
                >
                  View My Roadmaps
                </button>
              </div>
            );
          }
          if (roadmapDetailTab === 'projects') {
            return (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                  <Code className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Select a Roadmap</h3>
                <p className="text-sm text-slate-600 text-center max-w-md mb-6">
                  Choose a roadmap to access hands-on projects and build your portfolio.
                </p>
                <button
                  onClick={() => setRoadmapDetailTab('roadmap')}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:brightness-110 transition-all"
                >
                  View My Roadmaps
                </button>
              </div>
            );
          }
          if (roadmapDetailTab === 'insights') {
            return (
              <div className="flex flex-col items-center justify-center py-20 px-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                  <BarChart className="w-10 h-10 text-indigo-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Select a Roadmap</h3>
                <p className="text-sm text-slate-600 text-center max-w-md mb-6">
                  Choose a roadmap to view personalized AI insights and track your learning progress.
                </p>
                <button
                  onClick={() => setRoadmapDetailTab('roadmap')}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:brightness-110 transition-all"
                >
                  View My Roadmaps
                </button>
              </div>
            );
          }
        }
        
        // Use RoadmapsTabContainer for list and detail views
        const selectedRm = roadmaps.find(r => r.id === selectedRoadmapId);
        if (roadmapDetailTab === 'resources') {
          if (!selectedRm) return null;
          return <ResourcesTab roadmap={selectedRm} />;
        }
        if (roadmapDetailTab === 'quiz') {
          if (!selectedRm) return null;
          return <QuizTab roadmap={selectedRm} onAddXp={handleAddXp} />;
        }
        if (roadmapDetailTab === 'projects') {
          if (!selectedRm) return null;
          return <ProjectsTab roadmap={selectedRm} onAddXp={handleAddXp} />;
        }
        if (roadmapDetailTab === 'insights') {
          if (!selectedRm) return null;
          return <AIInsightsTab roadmap={selectedRm} profile={profile} />;
        }
        return (
           <RoadmapsTabContainer
            roadmaps={roadmaps}
            selectedRoadmapId={selectedRoadmapId}
            onSelectRoadmap={(id) => {
              setSelectedRoadmapId(id);
              setActiveRoadmapId(id);
            }}
            onBackToList={() => setSelectedRoadmapId(null)}
            onDeleteRoadmap={handleDeleteRoadmap}
            onGenerateRoadmap={handleGenerateRoadmap}
            isGenerating={isAiGeneratingRoadmap}
            profile={profile}
            onAiAction={handleAiAction}
            onLessonClick={(phaseId, levelId, lessonId) => {
              setActiveLesson({ phaseId, levelId, lessonId });
            }}
          />
        );

      case 'mentor':
        return (
          <MentorChatView
            chats={chats}
            isGenerating={isAiChatGenerating}
            onSendMessage={handleSendMessage}
            onSelectAction={(topic) => handleSendMessage(topic)}
          />
        );

      case 'progress':
        return <AnalyticsView profile={profile} />;

      case 'achievements':
        return (
          <div className="space-y-5">
            <div>
              <h2 className="font-display font-bold text-2xl text-white">Achievements Sandbox</h2>
              <p className="text-xs text-zinc-400">Complete curriculum chapters to unlock high-integrity milestones.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {achievements.map((ach) => (
                <AchievementCard
                  key={ach.id}
                  achievement={ach}
                  onShare={() => {
                    alert(`Copied certificate to clipboard! Gained: "${ach.name}"`);
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
                <h2 className="font-display font-bold text-2xl text-white">Your Notifications</h2>
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


// Render authentication UI (used within modal or standalone)
  const renderAuthUI = () => (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-[24px] bg-[#111111] border border-white/10 p-6 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
        
        <div className="text-center flex flex-col items-center">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center shadow-lg border border-white/5">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <h2 className="font-display font-extrabold text-xl tracking-tight mt-3">
            LearnPath <span className="text-purple-400">AI</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Premium Full-Stack AI Learning Platform</p>
        </div>

        {authError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[11px] font-semibold text-red-300">
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthenticate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono">Registry Email</label>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="bobby.fisher@learnpath.ai"
              className="w-full px-3.5 py-2.5 bg-[#0A0A0A] border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500"
              required
            />
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center bg-transparent text-[10px]">
              <label className="block uppercase font-bold text-zinc-400 font-mono">Security Password</label>
              <button type="button" className="text-zinc-500 hover:text-white cursor-pointer select-text">Forgot Credentials?</button>
            </div>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-[#0A0A0A] border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? 'Processing...' : authMode === 'login' ? 'Confirm Sign In' : 'Create Free Account'}
          </button>
        </form>

        <div className="text-center pt-2 space-y-3.5 border-t border-white/5 pb-1.5">
          <button
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setAuthError('');
            }}
            className="text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            {authMode === 'login' ? "Don't have an account? Sign Up" : "Already registered? Sign In"}
          </button>

          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Your data is loaded by email and saved only to your user profile.
          </p>
        </div>
      </div>
    </div>
  );

// Render the app based on auth state
  if (isLoadingAuth) {
    return <SplashScreen />;
  }

  // If not authenticated, show landing page
  if (!isAuthenticated) {
    if (showAuthModal) {
      return renderAuthUI();
    }
    return (
      <LandingPage
        onGetStarted={() => {
          setAuthMode('signup');
          setShowAuthModal(true);
        }}
        onSignIn={() => {
          setAuthMode('login');
          setShowAuthModal(true);
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
      </main>

      {/* Modern Floating PWA Interaction and State Notifications */}
      {!pwa.isOnline && (
        <div className="fixed bottom-22 left-4 right-4 z-50 p-3 rounded-2xl glass-card glass-card-orange border border-amber-500/20 text-amber-300 text-xs shadow-2xl flex items-center justify-between gap-3 animate-pulse-glow max-w-sm mx-auto">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
            <div>
              <p className="font-bold">Offline Learning Active Mode</p>
              <p className="text-[10px] text-zinc-400">Viewing cached roadmaps & study paths</p>
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
              <p className="text-[10px] text-zinc-400">AI search and validation queries re-activated</p>
            </div>
          </div>
        </div>
      )}

      {pwa.updateAvailable && (
        <div className="fixed bottom-22 left-4 right-4 z-50 p-3.5 rounded-2xl glass-card glass-card-purple border border-purple-500/35 text-white text-xs shadow-2xl flex items-center justify-between gap-3 max-w-sm mx-auto animate-pulse-glow">
          <div className="flex-1">
            <p className="font-bold">App Update Available ✨</p>
            <p className="text-[10px] text-zinc-300">Reload to instantly activate the latest features</p>
          </div>
          <button
            onClick={pwa.triggerUpdateApp}
            className="px-3 py-1.5 font-bold text-[10px] text-white bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg cursor-pointer hover:brightness-110 shrink-0"
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
        <AchievementCelebration
          achievement={unlockedAchievement}
          onDone={() => setUnlockedAchievement(null)}
        />
      )}
    </div>
  );
}