import React, { useState, useEffect } from 'react';
import { Sparkles, Bot, Shield, Zap, Search, PlusCircle, AlertCircle, Info, Landmark, Terminal, CheckCircle } from 'lucide-react';
import { UserProfile, UserSettings, Roadmap, Achievement, SystemNotification, ChatMessage } from './types';
import { usePWA } from './lib/usePWA';
import { MobileHeader, BottomNavigation, SideDrawer } from './components/Navigation';
import { ProgressCard, StatsCard, AchievementCard, NotificationCard, AIRecommendationCard, LearningScoreCard } from './components/Cards';
import { RoadmapTree } from './components/RoadmapTree';
import { RoadmapOverview } from './components/RoadmapOverview';
import { MentorChatView } from './components/MentorChatView';
import { AnalyticsView, ProfileView } from './components/TabsScreen';
import { LessonPlayView } from './components/LessonPlayView';
import { TopicDetailView } from './components/TopicDetailView';
import { motion } from 'motion/react';
import { ResourcesTab } from './components/ResourcesTab';
import { QuizTab } from './components/QuizTab';
import { ProjectsTab } from './components/ProjectsTab';
import { supabase } from './lib/supabase';
import { createEmptyProfile, DEFAULT_SETTINGS, loadUserData, saveUserData } from './userData';

function DashboardTemplate({
  profile,
  onCreateRoadmap,
  onOpenMentor,
}: {
  profile: UserProfile;
  onCreateRoadmap: () => void;
  onOpenMentor: () => void;
}) {
  const levelCards = [
    { id: 'level-foundations', title: 'Level 1', label: 'Foundations', status: 'Ready when roadmap connects', tint: 'glass-card-purple' },
    { id: 'level-practice', title: 'Level 2', label: 'Guided Practice', status: 'Locked until lessons arrive', tint: 'glass-card-blue' },
    { id: 'level-project', title: 'Level 3', label: 'Project Sprint', status: 'Waiting for project data', tint: 'glass-card-teal' },
  ];

  const lessonSlots = [
    { id: 'lesson-slot-1', title: 'Intro lesson slot', meta: 'Video, reading, or mentor task' },
    { id: 'lesson-slot-2', title: 'Practice checkpoint', meta: 'Quiz or coding exercise' },
    { id: 'lesson-slot-3', title: 'Applied project step', meta: 'Hands-on deliverable' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-6">
        <div className="glass-card glass-card-purple p-6 md:p-7 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-300 font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                Dashboard Template
              </span>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white mt-3">
                Welcome back, {profile.name}
              </h2>
              <p className="text-xs text-zinc-350 mt-2 max-w-xl leading-relaxed">
                Your active course progress, next lesson, and skill milestones will fill this space once a roadmap is connected.
              </p>
            </div>
            <button
              onClick={onCreateRoadmap}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Roadmap</span>
            </button>
          </div>

          <div className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Course Progress', value: '0%', detail: 'No active roadmap' },
              { label: 'Current Level', value: 'L1', detail: 'Template state' },
              { label: 'Lessons Ready', value: '0', detail: 'Awaiting sync' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 font-mono">{item.label}</p>
                <p className="font-display text-2xl font-bold text-white mt-2">{item.value}</p>
                <p className="text-[10px] text-zinc-400 mt-1">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-zinc-300">Overall roadmap progress</span>
              <span className="font-mono font-bold text-zinc-400">0 / 100%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
              <div className="h-full w-[8%] rounded-full bg-gradient-to-r from-purple-500/50 to-blue-500/50" />
            </div>
          </div>
        </div>

        <div className="glass-card glass-card-blue p-5 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display font-semibold text-sm text-white">Next Lesson</h3>
              <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                Empty State
              </span>
            </div>
            <div className="mt-5 space-y-3">
              <div className="h-3 w-3/4 rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 w-full rounded-full bg-white/10 animate-pulse" />
              <div className="h-3 w-2/3 rounded-full bg-white/10 animate-pulse" />
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <p className="text-xs font-semibold text-white">Lesson data will appear here</p>
            <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
              Title, duration, XP reward, and continue action can bind to the active lesson record.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {levelCards.map((level) => (
          <div key={level.id} className={`${level.tint} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 font-mono">{level.title}</p>
                <h3 className="font-display font-bold text-lg text-white mt-1">{level.label}</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-300" />
              </div>
            </div>
            <p className="text-xs text-zinc-350 mt-4">{level.status}</p>
            <div className="mt-4 flex gap-1.5">
              {[0, 1, 2, 3].map((slot) => (
                <span key={slot} className="h-1.5 flex-1 rounded-full bg-white/10" />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-6">
        <div className="glass-card glass-card-teal p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display font-semibold text-sm text-white">Lesson Queue</h3>
            <span className="text-[10px] text-zinc-400 font-mono">Template slots</span>
          </div>
          <div className="space-y-3">
            {lessonSlots.map((lesson, index) => (
              <div key={lesson.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-300">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{lesson.title}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{lesson.meta}</p>
                </div>
                <CheckCircle className="w-4 h-4 text-zinc-500 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card glass-card-orange p-5">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-400" />
            <h3 className="font-display font-semibold text-sm text-white">Mentor & Recommendations</h3>
          </div>
          <p className="text-xs text-zinc-350 mt-3 leading-relaxed">
            Recommendation cards, mentor prompts, and personalized study nudges can render here after progress data is available.
          </p>
          <div className="mt-5 space-y-3">
            <div className="h-16 rounded-2xl border border-white/5 bg-white/5 animate-pulse" />
            <div className="h-16 rounded-2xl border border-white/5 bg-white/5 animate-pulse" />
          </div>
          <button
            onClick={onOpenMentor}
            className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
          >
            <Terminal className="w-4 h-4" />
            <span>Open Mentor</span>
          </button>
        </div>
      </section>
    </div>
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

  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');

  // Primary State Managers loaded from localStore
  const [profile, setProfile] = useState<UserProfile>(() => createEmptyProfile());
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [activeRoadmapId, setActiveRoadmapId] = useState<string>('');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [chats, setChats] = useState<ChatMessage[]>([]);

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
  
  // Simulated stats
  const [stripeCheckoutStatus, setStripeCheckoutStatus] = useState<string | null>(null);
  const [apiCallsCounter, setApiCallsCounter] = useState(0);

  // Load recommendations on mount
  useEffect(() => {
    fetchRecommendations();
  }, []);

  const [roadmapDetailTab, setRoadmapDetailTab] = useState<'roadmap' | 'resources' | 'quiz' | 'projects'>('roadmap');

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

  // Sync roadmaps with Supabase simulation per user
  useEffect(() => {
    async function syncRoadmapsWithSupabase() {
      const email = profile.email;
      if (!email) return;
      localStorage.setItem('learnpath_authenticated_email', email);

      try {
        const { data, error } = await supabase.from('roadmaps').select('*');
        if (data && data.length > 0) {
          // Found on Supabase server! Load them and sanitize any duplicates
          const uniqueList: Roadmap[] = [];
          const seen = new Set<string>();
          (data as Roadmap[]).forEach((r) => {
            if (r && r.id && !seen.has(r.id)) {
              seen.add(r.id);
              uniqueList.push(r);
            }
          });

          setRoadmaps(uniqueList);
          const hasRoadmap = uniqueList.some(r => r.id === activeRoadmapId);
          if (!hasRoadmap && uniqueList[0]) {
            setActiveRoadmapId(uniqueList[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to sync user roadmaps:', err);
      }
    }

    if (isAuthenticated) {
      syncRoadmapsWithSupabase();
    }
  }, [profile.email, isAuthenticated]);

  // Hydrate local localStorage changes on change
  useEffect(() => {
    if (!isAuthenticated || !profile.email) return;
    saveUserData(profile.email, {
      profile,
      settings,
      roadmaps,
      achievements,
      notifications,
      chats
    });
  }, [profile, settings, roadmaps, achievements, notifications, chats, isAuthenticated]);

  // Fetch from Express recommendations API
  const fetchRecommendations = async () => {
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
          activeGoal
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

  const handleAuthenticate = () => {
    const email = authEmail.trim().toLowerCase();
    if (!email) return;

    const loaded = loadUserData(email, authName);
    setProfile(loaded.profile);
    setSettings(loaded.settings);
    setRoadmaps(loaded.roadmaps);
    setActiveRoadmapId(loaded.roadmaps[0]?.id || '');
    setAchievements(loaded.achievements);
    setNotifications(loaded.notifications);
    setChats(loaded.chats);
    localStorage.setItem('learnpath_authenticated_email', email);
    setIsAuthenticated(true);
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
        body: JSON.stringify(params)
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
        id: `roadmap-${Date.now()}`,
        goal: data.goal || params.goal,
        experienceLevel: data.experienceLevel || params.experienceLevel,
        weeklyHours: data.weeklyHours || params.weeklyHours,
        preferredStyle: data.preferredStyle || params.preferredStyle,
        progressPercent: data.progressPercent || 0,
        totalXp: data.totalXp || 0,
        lessonsCompleted: data.lessonsCompleted || 0,
        hoursRemaining: data.hoursRemaining || 40,
        createdAt: new Date().toISOString(),
        phases: data.phases || []
      };

      setRoadmaps(prev => [newRoadmap, ...prev]);
      setActiveRoadmapId(newRoadmap.id);
      await supabase.from('roadmaps').insert(newRoadmap);
      
      // Dispatch alert notify
      const newNotif: SystemNotification = {
        id: `notif-${Date.now()}`,
        title: 'New AI Syllabus Generated',
        message: `Your custom roadmap for "${newRoadmap.goal}" is now active in your list. Click on are levels to begin practicing.`,
        category: 'roadmap',
        read: false,
        timestamp: new Date().toISOString()
      };
      setNotifications(prev => [newNotif, ...prev]);
      
      setActiveTab('roadmaps');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiGeneratingRoadmap(false);
    }
  };

  // AI Mentor Chat Message Send controller
  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `chat-usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString()
    };

    setChats(prev => [...prev, userMsg]);
    setIsAiChatGenerating(true);
    setApiCallsCounter(prev => prev + 1);

    try {
      const response = await fetch('/api/mentor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chats.slice(-6) // Send recent message slots to keep context
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

      const aiMsg: ChatMessage = {
        id: `chat-ai-${Date.now()}`,
        sender: 'assistant',
        text: data.text,
        timestamp: new Date().toISOString()
      };
      setChats(prev => [...prev, aiMsg]);
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

    // 1. Update Lesson Status inside Roadmaps
    const updatedRoadmaps = roadmaps.map((r) => {
      if (r.id !== activeRoadmapId) return r;

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
      const totalPhs = updatedPhases.length;
      const donePhsPercent = updatedPhases.reduce((acc, p) => acc + p.progress, 0) / totalPhs;
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
    supabase.from('roadmaps').upsert(updatedRoadmaps);

    // 2. Add XP to global UserProfile
    const isNextLevelThreshold = profile.xp + xpAdded >= (profile.level * 200);
    setProfile(prev => ({
      ...prev,
      xp: prev.xp + xpAdded,
      level: isNextLevelThreshold ? prev.level + 1 : prev.level,
      streak: prev.streak + 1,
      hoursStudied: prev.hoursStudied + 0.5,
    }));

    // Trigger alert modal if level up occurs
    if (isNextLevelThreshold) {
      const levelNotif: SystemNotification = {
        id: `notif-lvl-${Date.now()}`,
        title: `Congratulations! Leveled Up! 🎉`,
        message: `You successfully advanced to LearnPath Level ${profile.level + 1}! Keep conquering dynamic syllabus trees.`,
        category: 'achievement',
        read: false,
        timestamp: new Date().toISOString()
      };
      setNotifications(prev => [levelNotif, ...prev]);
    }

    // Unlocking preset accomplishments
    const countCompletedLessons = updatedRoadmaps.find(r => r.id === activeRoadmapId)?.lessonsCompleted || 0;
    if (countCompletedLessons === 5 || countCompletedLessons === 15 || countCompletedLessons === 25) {
      // Find locks and unlock them
      setAchievements(prev => {
        const lockedIdx = prev.findIndex(a => !a.unlocked);
        if (lockedIdx !== -1) {
          const cpy = [...prev];
          cpy[lockedIdx] = {
            ...cpy[lockedIdx],
            unlocked: true,
            unlockedAt: new Date().toISOString()
          };
          
          // Dispatch unlock alert
          const achNotif: SystemNotification = {
            id: `notif-ach-${Date.now()}`,
            title: `Achievement Unlocked: ${cpy[lockedIdx].name} 🏆`,
            message: `Milestone gained: "${cpy[lockedIdx].description}". +${cpy[lockedIdx].xpReward} XP awarded!`,
            category: 'achievement',
            read: false,
            timestamp: new Date().toISOString()
          };
          setNotifications(prevNotifs => [achNotif, ...prevNotifs]);
          
          // Grant achievement XP
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
    if (profile.email) {
      saveUserData(profile.email, {
        profile: createEmptyProfile(profile.email, profile.name),
        settings,
        roadmaps: [],
        achievements: [],
        notifications: [],
        chats: [],
      });
    }
    window.location.reload();
  };

  const activeRoadmap = roadmaps.find(r => r.id === activeRoadmapId) || roadmaps[0] || null;
  const activePhase = activeRoadmap?.phases.find(p => p.status === 'current') || activeRoadmap?.phases[0] || null;

  // Visual tab navigation router
  const renderTabContent = () => {
    if (!activeRoadmap) {
      if (activeTab === 'home') {
        return (
          <DashboardTemplate
            profile={profile}
            onCreateRoadmap={() => {
              setActiveTab('roadmaps');
              setActiveLesson(null);
            }}
            onOpenMentor={() => {
              setActiveTab('mentor');
              setActiveLesson(null);
            }}
          />
        );
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
          />
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-6">
            {/* 1. Progress banner card */}
            <ProgressCard
              progressPercent={activeRoadmap.progressPercent}
              currentPhaseName={activePhase?.name || activeRoadmap.goal}
              totalXp={profile.xp}
              onContinue={() => {
                setActiveTab('roadmaps');
              }}
            />

            {/* 2. Bento Statistics block */}
            <StatsCard
              stats={{
                hoursStudied: profile.hoursStudied,
                completedTopics: activeRoadmap.lessonsCompleted,
                totalXp: profile.xp,
                streak: profile.streak,
              }}
            />

            {/* Double grid panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left span: AI dynamic recommendations list */}
              <div className="col-span-1 lg:col-span-2 space-y-3.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-purple-400 animate-pulse" />
                  <h4 className="font-display font-semibold text-sm text-white">Custom Recommendations</h4>
                </div>

                {isRecsLoading ? (
                  <div className="p-8 text-center bg-[#111111] rounded-2xl border border-white/5 text-xs text-zinc-500">
                    Formulating continuous study suggestions with Gemini...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {aiRecommendations.map((rec) => (
                      <AIRecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        onLaunch={handleSelectRecommendationTask}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right span: learning concentric skills card */}
              <div className="col-span-1">
                <LearningScoreCard profile={profile} />
              </div>
            </div>
          </div>
        );

      case 'roadmaps':
        if (roadmapDetailTab === 'resources') {
          return <ResourcesTab roadmap={activeRoadmap} />;
        }
        if (roadmapDetailTab === 'quiz') {
          return <QuizTab roadmap={activeRoadmap} onAddXp={handleAddXp} />;
        }
        if (roadmapDetailTab === 'projects') {
          return <ProjectsTab roadmap={activeRoadmap} onAddXp={handleAddXp} />;
        }
        return (
          <div className="space-y-6 animate-fade-in">
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
            />

            <div className="border-t border-white/5 pt-6">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 px-1">Active Curriculum Tree</label>
              <RoadmapTree
                roadmap={activeRoadmap}
                onLessonSelect={(phaseId, levelId, lessonId) => {
                  setActiveLesson({ phaseId, levelId, lessonId });
                }}
                onAiAction={handleAiAction}
              />
            </div>
          </div>
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


  // Clean authentication screens visualizer
  if (!isAuthenticated) {
    return (
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

          <form onSubmit={(e) => {
            e.preventDefault();
            handleAuthenticate();
          }} className="space-y-4">
            {authMode === 'signup' && (
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono">Full Name</label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Bobby Fisher"
                  className="w-full px-3.5 py-2.5 bg-[#0A0A0A] border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500"
                  required
                />
              </div>
            )}

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
              className="w-full py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)] cursor-pointer"
            >
              {authMode === 'login' ? 'Confirm Sign In' : 'Create Free Account'}
            </button>
          </form>

          <div className="text-center pt-2 space-y-3.5 border-t border-white/5 pb-1.5">
            <button
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
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
        onLogoutClick={() => {
          setIsAuthenticated(false);
          setActiveLesson(null);
        }}
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
                { id: 'projects', label: 'Projects' }
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
      <main className="max-w-4xl mx-auto px-4 py-6 md:py-8 min-h-[calc(100vh-10rem)]">
        {selectedLevelObj ? (
          <TopicDetailView
            level={selectedLevelObj}
            roadmapGoal={activeRoadmap?.goal || 'General AI'}
            initialLessonId={selectedLessonObj?.id}
            onClose={() => setActiveLesson(null)}
            onCompleteLesson={(lessonId, xpReward) => handleLessonComplete(xpReward, lessonId)}
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
    </div>
  );
}
