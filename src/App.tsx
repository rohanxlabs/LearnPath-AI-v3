// App.tsx — thin shell that composes all providers and the router.
// All business logic has been extracted into:
//   src/contexts/AuthContext.tsx    — auth, session, profile, settings
//   src/contexts/RoadmapContext.tsx — roadmap list, generation, deletion
//   src/contexts/UIContext.tsx      — tab, sidebar, toast, AI status, theme
//   src/contexts/PWAContext.tsx     — online/offline, update, email verified
//   src/router/AppRouter.tsx        — route-to-component mapping

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { CheckCircle } from 'lucide-react';
import { Toast } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { AuthScreen } from './components/AuthScreen';
import { UserProfile, UserSettings, Roadmap, Phase, Achievement, SystemNotification } from './types';
import { getPhaseUnlockStatus, calcPhaseProgress, isPhaseComplete } from './lib/roadmapUtils';
import { MobileHeader, BottomNavigation, SideDrawer } from './components/Navigation';
import { HomeView } from './components/HomeView';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { motion } from 'motion/react';
import { FeedbackWidget } from './components/FeedbackWidget';
import { OnboardingWizard } from './components/OnboardingWizard';
import type { OnboardingData } from './components/OnboardingWizard';
import { TermsPage, PrivacyPage } from './components/LegalPages';
import { useAnalytics } from './hooks/useAnalytics';
import { PhaseCompletionModal } from './components/PhaseCompletionModal';

import { AuthProvider, useAuth, createEmptyProfile, DEFAULT_SETTINGS } from './contexts/AuthContext';
import { RoadmapProvider, useRoadmaps } from './contexts/RoadmapContext';
import { UIProvider, useUI } from './contexts/UIContext';
import { PWAProvider, usePWAContext } from './contexts/PWAContext';
import { AppRouter, TabFallback, AchievementCelebration } from './router/AppRouter';

// ---------------------------------------------------------------------------
// renderHomeView — exported so AppRouter can use it without circular dependency
// ---------------------------------------------------------------------------

export function renderHomeView(props: {
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
}) {
  const { profile, activeRoadmap, activePhase, achievements, aiRecommendations, isRecsLoading, isLoading, roadmapProgress, getNextIncompleteLesson, setActiveTab, setActiveLesson, handleSelectRecommendationTask } = props;
  return (
    <HomeView
      profile={profile} activeRoadmap={activeRoadmap} activePhase={activePhase}
      achievements={achievements} aiRecommendations={aiRecommendations}
      isRecsLoading={isRecsLoading} isLoading={isLoading} roadmapProgress={roadmapProgress}
      onContinueLearning={() => {
        const nextLesson = getNextIncompleteLesson(activeRoadmap!);
        if (nextLesson) setActiveLesson(nextLesson);
        else setActiveTab('roadmaps');
      }}
      onGenerateRoadmap={() => { setActiveTab('roadmaps'); setActiveLesson(null); }}
      onStartLesson={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
      onLaunchRecommendation={handleSelectRecommendationTask}
      onOpenMentor={() => { setActiveTab('mentor'); setActiveLesson(null); }}
      onViewProgress={() => { setActiveTab('progress'); setActiveLesson(null); }}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner shell — rendered after providers are mounted, so hooks are available.
// ---------------------------------------------------------------------------

function AppShell() {
  const { track, identify } = useAnalytics();
  // Sub-Task 9: phase completion modal state + session dedup ref
  const [phaseCompletionData, setPhaseCompletionData] = useState<{ phase: Phase; nextPhase: Phase | null; xpEarned: number } | null>(null);
  const celebratedPhasesRef = useRef<Set<string>>(new Set());
  const {
    isAuthenticated, isLoadingAuth, profile, setProfile, settings, setSettings,
    achievements, setAchievements, notifications, setNotifications,
    chats, setChats, activityLog, setActivityLog,
    authEmail, setAuthEmail, authPassword, setAuthPassword, authName, setAuthName,
    authMode, setAuthMode, authError, setAuthError, isAuthenticating,
    showAuthModal, setShowAuthModal, showOnboarding, setShowOnboarding,
    forgotPasswordMode, setForgotPasswordMode, forgotEmail, setForgotEmail,
    forgotStatus, setForgotStatus, resetToken, setResetToken,
    resetPassword, setResetPassword, resetStatus, setResetStatus,
    handleAuthenticate, handleForgotPassword, handleResetPassword, handleLogout,
    mutatingHeaders, getStoredUserEmail,
  } = useAuth();

  const {
    roadmaps, setRoadmaps, activeRoadmapId, setActiveRoadmapId,
    selectedRoadmapId, setSelectedRoadmapId, selectedPhaseId, setSelectedPhaseId,
    roadmapDetailTab, setRoadmapDetailTab, roadmapProgress,
    isAiGeneratingRoadmap, handleGenerateRoadmap, handleDeleteRoadmap,
    syncRoadmapsFromDatabase, getNextIncompleteLesson,
  } = useRoadmaps();

  const {
    activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen,
    activeLesson, setActiveLesson, activeToast, setActiveToast, showToast,
    confirmDeleteId, setConfirmDeleteId, unlockedAchievement, setUnlockedAchievement,
    aiActive, showAiOfflineBanner, setShowAiOfflineBanner,
    stripeCheckoutStatus, setStripeCheckoutStatus,
    isAiChatGenerating, setIsAiChatGenerating,
    aiRecommendations, setAiRecommendations, isRecsLoading, setIsRecsLoading,
    resolvedTheme,
  } = useUI();

  const { pwa, showOnlineToast, verifiedStatus, setVerifiedStatus, legalPage, setLegalPage } = usePWAContext();

  const themeClass = `${resolvedTheme} ${resolvedTheme === 'dark' ? 'text-zinc-100' : 'text-slate-950'}`;
  const customBackground = resolvedTheme === 'dark' ? { backgroundColor: '#0A0A0A' } : { backgroundColor: '#F8FAFC' };

  // Recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsRecsLoading(true);
    try {
      const activeGoal = roadmaps.find(r => r.id === activeRoadmapId)?.goal || '';
      const response = await fetch('/api/ai-recommendations', {
        method: 'POST', headers: await mutatingHeaders(),
        body: JSON.stringify({ currentXp: profile.xp, level: profile.level, streak: profile.streak, activeGoal, userEmail: getStoredUserEmail() }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Non-JSON response');
      const data = await response.json();
      setAiRecommendations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Recommendation request failed:', err);
    } finally { setIsRecsLoading(false); }
  }, [isAuthenticated, roadmaps, activeRoadmapId, profile, mutatingHeaders, getStoredUserEmail]);

  useEffect(() => { if (isAuthenticated) fetchRecommendations(); }, [isAuthenticated]);

  // Achievement unlock handler
  const handleAchievementUnlocked = useCallback((ach: { id: string; name: string; icon: string; xpReward: number }) => {
    setAchievements(prev => {
      const exists = prev.find(a => a.id === ach.id);
      if (exists) return prev.map(a => a.id === ach.id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a);
      return prev;
    });
    setUnlockedAchievement({ ...ach, unlocked: true, unlockedAt: new Date().toISOString() } as any);
    setNotifications(prev => [{ id: `notif-ach-${Date.now()}`, title: `Achievement Unlocked: ${ach.name} 🏆`, message: `You earned "${ach.name}". +${ach.xpReward} XP awarded!`, category: 'achievement', read: false, timestamp: new Date().toISOString() }, ...prev]);
  }, []);

  // Lesson completion
  const handleLessonComplete = useCallback((xpAdded: number, specificLessonId?: string) => {
    if (!activeLesson) return;
    const targetLessonId = specificLessonId || activeLesson.lessonId;
    const targetRoadmapId = selectedRoadmapId || activeRoadmapId;

    // Optimistically update lesson/level/phase status in local state only —
    // XP totals are NOT touched here; they are applied once from the server
    // response to avoid double-counting (C-01).
    const updatedRoadmaps = roadmaps.map((r) => {
      if (r.id !== targetRoadmapId) return r;
      const updatedPhases = r.phases.map((ph) => {
        if (ph.id !== activeLesson.phaseId) return ph;
        let levelDoneCount = 0;
        const updatedLevels = ph.levels.map((lvl) => {
          if (lvl.id !== activeLesson.levelId) { if (lvl.status === 'completed') levelDoneCount++; return lvl; }
          const updatedLessons = lvl.lessons.map(les => les.id === targetLessonId ? { ...les, status: 'completed' as const } : les);
          const allDone = updatedLessons.every(l => l.status === 'completed');
          let newLvlStatus = lvl.status;
          if (allDone) { newLvlStatus = 'completed' as const; levelDoneCount++; }
          const isQuizLocked = lvl.lessons.some(l => l.type === 'quiz' && l.status === 'locked');
          if (isQuizLocked) updatedLessons.forEach(l => { if (l.type === 'quiz' || l.type === 'coding') l.status = 'available'; });
          return { ...lvl, lessons: updatedLessons, status: newLvlStatus };
        });
        const totalLevels = updatedLevels.length;
        const completedLevels = updatedLevels.filter(l => l.status === 'completed').length;
        const phaseProgress = Math.round((completedLevels / totalLevels) * 100);
        let phStatus = ph.status;
        if (phaseProgress === 100) phStatus = 'completed' as const;
        const currentLvlIdx = updatedLevels.findIndex(l => l.id === activeLesson.levelId);
        if (updatedLevels[currentLvlIdx]?.status === 'completed' && currentLvlIdx + 1 < totalLevels) {
          const nextLvl = updatedLevels[currentLvlIdx + 1];
          if (nextLvl.status === 'locked') { nextLvl.status = 'current'; nextLvl.lessons.forEach(l => { if (l.type === 'learn') l.status = 'available'; }); }
        }
        // xpEarned on the phase is NOT updated here — applied from server response
        return { ...ph, levels: updatedLevels, progress: phaseProgress, status: phStatus };
      });
      const donePhsPercent = updatedPhases.length > 0 ? updatedPhases.reduce((acc, p) => acc + (p.progress || 0), 0) / updatedPhases.length : 0;
      // totalXp and lessonsCompleted are NOT updated here — applied from server response
      return { ...r, phases: updatedPhases, progressPercent: Math.round(donePhsPercent), hoursRemaining: Math.max(2, r.hoursRemaining - 1.5) };
    });
    setRoadmaps(updatedRoadmaps);

    // Sub-Task 9: check if the completed lesson finished its phase — trigger celebration
    {
      const targetRm = updatedRoadmaps.find(r => r.id === targetRoadmapId);
      if (targetRm && activeLesson) {
        const completedPhase = targetRm.phases.find(p => p.id === activeLesson.phaseId);
        if (completedPhase && isPhaseComplete(completedPhase) && !celebratedPhasesRef.current.has(completedPhase.id)) {
          const phaseIndex = targetRm.phases.findIndex(p => p.id === completedPhase.id);
          const nextPhase = phaseIndex >= 0 && phaseIndex < targetRm.phases.length - 1 ? targetRm.phases[phaseIndex + 1] : null;
          const phaseXp = (completedPhase.levels || []).flatMap(l => l.lessons || []).reduce((sum, l) => sum + (l.xpReward || 0), 0);
          celebratedPhasesRef.current.add(completedPhase.id);
          setPhaseCompletionData({ phase: completedPhase, nextPhase, xpEarned: phaseXp });
        }
      }
    }

    if (targetRoadmapId) {
      mutatingHeaders().then(h => fetch('/api/complete-lesson', { method: 'POST', headers: h, body: JSON.stringify({ lessonId: targetLessonId, roadmapId: targetRoadmapId }) }))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          // Apply XP from the server's authoritative value (C-01 fix)
          if (typeof data.xp === 'number') {
            setProfile(prev => {
              const newXp = data.xp;
              const isNextLevel = newXp >= (prev.level * 200);
              return { ...prev, xp: newXp, level: isNextLevel ? prev.level + 1 : prev.level };
            });
          }
          // Write activity log entry from server XP delta (C-01 fix)
          const xpEarned = typeof data.xp === 'number' ? (xpAdded || 0) : 0;
          const todayKey = new Date().toISOString().split('T')[0];
          setActivityLog(prev => {
            const ex = prev[todayKey] || { xp: 0, lessonsCompleted: 0 };
            return { ...prev, [todayKey]: { xp: ex.xp + xpEarned, lessonsCompleted: ex.lessonsCompleted + 1 } };
          });
          // Update roadmap XP/completion totals from server (C-01 fix)
          if (typeof data.xp === 'number') {
            setRoadmaps(prev => prev.map(r => r.id === targetRoadmapId
              ? { ...r, totalXp: (r.totalXp || 0) + xpEarned, lessonsCompleted: r.lessonsCompleted + 1 }
              : r
            ));
          }
          if (data.newAchievement) handleAchievementUnlocked(data.newAchievement);
          // Re-sync from DB so phase unlock statuses are authoritative (C-02 fix)
          syncRoadmapsFromDatabase();
        })
        .catch(err => console.warn('Failed to complete lesson:', err));
    }
    if (!specificLessonId) setActiveLesson(null);
  }, [activeLesson, selectedRoadmapId, activeRoadmapId, roadmaps, mutatingHeaders, syncRoadmapsFromDatabase]);

  // XP handler
  const handleAddXp = useCallback((amount: number) => {
    const isNextLevel = profile.xp + amount >= (profile.level * 200);
    setProfile(prev => ({ ...prev, xp: prev.xp + amount, level: isNextLevel ? prev.level + 1 : prev.level }));
    setNotifications(prev => [{ id: `notif-xp-${Date.now()}`, title: 'XP Badge Claimed 🎖️', message: `You earned +${amount} XP!`, category: 'achievement', read: false, timestamp: new Date().toISOString() }, ...prev]);
  }, [profile.xp, profile.level]);

  // Mentor chat
  const handleSendMessage = useCallback(async (text: string) => {
    const userMsg = { id: `chat-usr-${Date.now()}`, sender: 'user' as const, text, timestamp: new Date().toISOString() };
    setChats(prev => [...prev, userMsg]);
    setIsAiChatGenerating(true);
    const aiMsgId = `chat-ai-${Date.now()}`;
    let aiMsg = { id: aiMsgId, sender: 'assistant' as const, text: '', timestamp: new Date().toISOString() };
    setChats(prev => [...prev, aiMsg]);
    try {
      const response = await fetch('/api/mentor-chat', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify({ message: text, history: chats.slice(-6), userEmail: getStoredUserEmail() }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiMsg = { ...aiMsg, text: aiMsg.text + decoder.decode(value) };
        setChats(prev => prev.map(c => c.id === aiMsgId ? aiMsg : c));
      }
    } catch (err) { console.error(err); } finally { setIsAiChatGenerating(false); }
  }, [chats, mutatingHeaders, getStoredUserEmail]);

  const handleSelectRecommendationTask = useCallback((rec: any) => {
    if (rec.category === 'mentor') { setActiveTab('mentor'); handleSendMessage(`Can you explain details about ${rec.title}?`); }
    else { setActiveTab('roadmaps'); }
  }, [handleSendMessage]);

  const handleAiAction = useCallback((actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => {
    let query = '';
    if (actionType === 'explain') query = `Can you break down the main mechanical components of the "${phaseName}" phase?`;
    else if (actionType === 'quiz') query = `Generate a customized 3-question multiple choice quiz about "${phaseName}".`;
    else if (actionType === 'study_plan') query = `Design a weekly calendar breakdown for studying "${phaseName}".`;
    else query = `Give me 3 project ideas to show competence in "${phaseName}".`;
    handleSendMessage(query);
  }, [handleSendMessage]);

  const handleStripeCheckout = useCallback(async () => {
    setStripeCheckoutStatus('Processing…');
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: await mutatingHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setProfile(p => ({ ...p, isPro: true }));
        setStripeCheckoutStatus(data.message || 'Pro unlocked!');
        setNotifications(prev => [{ id: `notif-pro-${Date.now()}`, title: 'LearnPath AI Pro Gained! 👑', message: data.message || 'Pro subscription activated.', category: 'system', read: false, timestamp: new Date().toISOString() }, ...prev]);
      } else { setStripeCheckoutStatus(data.error || 'Checkout unavailable.'); }
    } catch { setStripeCheckoutStatus('Network error — please retry.'); }
  }, [mutatingHeaders]);

  // --- Loading state ---
  if (isLoadingAuth) {
    return (
      <div className={`min-h-screen pb-20 ${themeClass} transition-colors duration-300`} style={customBackground}>
        <MobileHeader profile={profile} notifications={[]} onTabChange={() => {}} onNotificationsClick={() => {}} onUpgradeClick={() => {}} onOpenDrawer={() => {}} />
        <main className="max-w-4xl mx-auto px-4 py-6 md:py-8 min-h-[calc(100vh-10rem)]">
          {renderHomeView({ profile, activeRoadmap: null, activePhase: null, achievements: [], aiRecommendations: [], isRecsLoading: false, isLoading: true, roadmapProgress: {}, getNextIncompleteLesson: () => ({ phaseId: '', levelId: '', lessonId: '' }), setActiveTab: () => {}, setActiveLesson: () => {}, handleSelectRecommendationTask: () => {} })}
        </main>
      </div>
    );
  }

  // --- Unauthenticated ---
  if (!isAuthenticated) {
    if (legalPage === 'terms') return <TermsPage onBack={() => setLegalPage(null)} />;
    if (legalPage === 'privacy') return <PrivacyPage onBack={() => setLegalPage(null)} />;
    if (showAuthModal) {
      return (
        <AuthScreen
          authMode={authMode} setAuthMode={setAuthMode}
          authEmail={authEmail} setAuthEmail={setAuthEmail}
          authPassword={authPassword} setAuthPassword={setAuthPassword}
          authName={authName} setAuthName={setAuthName}
          authError={authError} setAuthError={setAuthError}
          isAuthenticating={isAuthenticating}
          forgotPasswordMode={forgotPasswordMode} setForgotPasswordMode={setForgotPasswordMode}
          forgotEmail={forgotEmail} setForgotEmail={setForgotEmail}
          forgotStatus={forgotStatus} setForgotStatus={setForgotStatus}
          resetToken={resetToken} resetPassword={resetPassword}
          setResetPassword={setResetPassword} resetStatus={resetStatus} setResetStatus={setResetStatus}
          handleAuthenticate={handleAuthenticate} handleForgotPassword={handleForgotPassword} handleResetPassword={handleResetPassword}
        />
      );
    }
    const LandingPage = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })));
    return (
      <Suspense fallback={<SplashScreen />}>
        <LandingPage
          onGetStarted={() => { setAuthMode('signup'); setShowAuthModal(true); }}
          onSignIn={() => { setAuthMode('login'); setShowAuthModal(true); }}
          onTerms={() => setLegalPage('terms')}
          onPrivacy={() => setLegalPage('privacy')}
        />
      </Suspense>
    );
  }

  // --- Onboarding ---
  if (showOnboarding) {
    return (
      <OnboardingWizard
        userName={profile.name || 'there'}
        onComplete={(data: OnboardingData) => { setShowOnboarding(false); track('onboarding_completed', { goal: data.goal, experience: data.experienceLevel }); handleGenerateRoadmap(data); }}
      />
    );
  }

  const activeRoadmap = roadmaps.find(r => r.id === activeRoadmapId) || roadmaps[0] || null;
  const selectedLevelObj = activeLesson && activeRoadmap
    ? activeRoadmap.phases.find(p => p.id === activeLesson.phaseId)?.levels.find(l => l.id === activeLesson.levelId) ?? null
    : null;

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pb-20 ${themeClass} transition-colors duration-300 relative select-none`} style={customBackground}>

        <MobileHeader
          profile={profile} notifications={notifications}
          onTabChange={(tab) => { setActiveTab(tab); setActiveLesson(null); }}
          onNotificationsClick={() => { setActiveTab('notifications'); setActiveLesson(null); }}
          onUpgradeClick={() => { setActiveTab('profile'); setActiveLesson(null); }}
          onOpenDrawer={() => setIsSidebarOpen(true)}
        />

        <SideDrawer
          isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
          activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setActiveLesson(null); }}
          profile={profile} onUpgradeClick={() => setActiveTab('profile')} onLogoutClick={handleLogout}
        />

        {aiActive === false && showAiOfflineBanner && (
          <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-300 leading-snug">
              <strong className="font-bold">AI features are offline.</strong> Mentor replies, roadmaps, quizzes, recommendations, and insights are showing generic fallback content.
            </p>
            <button onClick={() => setShowAiOfflineBanner(false)} className="text-amber-300/70 hover:text-amber-200 text-xs font-bold shrink-0 cursor-pointer">Dismiss</button>
          </div>
        )}

        {activeTab === 'roadmaps' && !selectedLevelObj && (
          <div className="sticky top-16 z-30 bg-zinc-950/85 backdrop-blur-md border-b border-white/5">
            <div className="max-w-4xl mx-auto px-4">
              <div className="flex gap-6 overflow-x-auto scrollbar-none py-3.5 -mb-[1px]">
                {[{ id: 'roadmap', label: 'Roadmap' }, { id: 'resources', label: 'Resources' }, { id: 'quiz', label: 'Quiz' }, { id: 'projects', label: 'Projects' }, { id: 'insights', label: 'AI Insights' }].map((t) => {
                  const isActive = roadmapDetailTab === t.id;
                  return (
                    <button key={t.id} onClick={() => setRoadmapDetailTab(t.id as any)}
                      className={`relative pb-1 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-300 cursor-pointer flex-shrink-0 ${isActive ? 'text-purple-400 font-extrabold scale-102' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {t.label}
                      {isActive && <motion.div layoutId="activeRoadmapTabBar" className="absolute bottom-[-14px] left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <main
          className={`${activeTab === 'mentor' ? 'max-w-none mx-0 px-0 py-0 h-[calc(100vh-8rem)]' : activeLesson ? 'max-w-7xl mx-auto px-0 py-0 h-[calc(100vh-8rem)]' : 'max-w-4xl mx-auto px-4 py-6 md:py-8 min-h-[calc(100vh-10rem)]'}`}
          style={{ contain: 'layout style' }}
        >
          <ErrorBoundary key={activeLesson ? `lesson-${activeLesson.lessonId}` : activeTab}>
            <Suspense fallback={<TabFallback />}>
              <AppRouter
                chats={chats} isAiChatGenerating={isAiChatGenerating}
                onSendMessage={handleSendMessage} onAiAction={handleAiAction}
                onLessonComplete={handleLessonComplete} onHandleAddXp={handleAddXp}
                onAchievementUnlocked={handleAchievementUnlocked}
                onShowToast={(msg, type) => showToast(msg, type)}
                handleStripeCheckout={handleStripeCheckout}
                stripeCheckoutStatus={stripeCheckoutStatus}
                pwa={{ isInstallAvailable: pwa.isInstallAvailable, isInstalled: pwa.isInstalled, installApp: pwa.installApp, requestNotificationPermission: pwa.requestNotificationPermission }}
                handleSelectRecommendationTask={handleSelectRecommendationTask}
                notifications={notifications}
                onNotificationsMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                onDeleteNotification={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
                onToggleReadNotification={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !n.read } : n))}
                onSetSettings={(s) => setSettings(prev => ({ ...prev, ...s }))}
                onSetProfile={(p) => setProfile(prev => ({ ...prev, name: p.name }))}
              />
            </Suspense>
          </ErrorBoundary>
        </main>

        {!pwa.isOnline && (
          <div className="fixed bottom-22 left-4 right-4 z-50 p-3 rounded-2xl glass-card glass-card-orange border border-amber-500/20 text-amber-300 text-xs shadow-2xl flex items-center gap-3 max-w-sm mx-auto animate-pulse-glow">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
            <div><p className="font-bold">Offline Learning Active Mode</p><p className="text-xs text-zinc-400">Viewing cached roadmaps & study paths</p></div>
          </div>
        )}

        {showOnlineToast && (
          <div className="fixed bottom-22 left-4 right-4 z-50 p-3 rounded-2xl glass-card glass-card-emerald border border-emerald-500/20 text-emerald-400 text-xs shadow-2xl flex items-center gap-3 max-w-sm mx-auto">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <div><p className="font-bold">Connection Restored</p><p className="text-xs text-zinc-400">AI features re-activated</p></div>
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
            <div className="flex-1"><p className="font-bold">App Update Available ✨</p><p className="text-xs text-zinc-300">Reload to activate latest features</p></div>
            <button onClick={pwa.triggerUpdateApp} className="px-3 py-1.5 font-bold text-xs text-white bg-gradient-to-r from-purple-500 to-blue-600 rounded-lg cursor-pointer hover:brightness-110 shrink-0">Reload Now</button>
          </div>
        )}

        <BottomNavigation activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setActiveLesson(null); }} />

        {unlockedAchievement && (
          <Suspense fallback={null}>
            <AchievementCelebration achievement={unlockedAchievement} onDone={() => setUnlockedAchievement(null)} />
          </Suspense>
        )}

        {/* Sub-Task 9: phase completion celebration modal */}
        {phaseCompletionData && (
          <PhaseCompletionModal
            phase={phaseCompletionData.phase}
            nextPhase={phaseCompletionData.nextPhase}
            xpEarned={phaseCompletionData.xpEarned}
            onContinue={() => {
              setPhaseCompletionData(null);
              if (phaseCompletionData.nextPhase) {
                setActiveLesson(null);
                setActiveTab('roadmaps');
              } else {
                setActiveTab('progress');
                setActiveLesson(null);
              }
            }}
            onDismiss={() => setPhaseCompletionData(null)}
          />
        )}

        <FeedbackWidget context={activeTab} />

        {legalPage === 'terms' && <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#0A0A0A]"><TermsPage onBack={() => setLegalPage(null)} /></div>}
        {legalPage === 'privacy' && <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#0A0A0A]"><PrivacyPage onBack={() => setLegalPage(null)} /></div>}

        <Toast toast={activeToast} onDismiss={() => setActiveToast(null)} />

        <ConfirmDialog
          open={confirmDeleteId !== null} title="Delete Roadmap"
          message="This will permanently delete the roadmap and all its lessons, progress, and quizzes. This cannot be undone."
          confirmLabel="Delete Roadmap"
          onConfirm={() => { if (confirmDeleteId) handleDeleteRoadmap(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Root — composes all providers around AppShell
// ---------------------------------------------------------------------------

export default function App() {
  const { track, identify } = useAnalytics();
  const [bootRoadmaps, setBootRoadmaps] = useState<Roadmap[]>([]);

  const handleAuthenticated = useCallback((data: { roadmaps: any[] }) => {
    setBootRoadmaps(data.roadmaps || []);
  }, []);

  return (
    <PWAProvider>
      <AuthProvider
        onAuthenticated={(data) => {
          handleAuthenticated(data);
          identify(data.email, { name: data.profile?.name || '' });
        }}
        onLoggedOut={() => setBootRoadmaps([])}
        onShowOnboarding={() => {}}
        onRedirectAfterLogin={() => {}}
        track={track}
        identify={identify}
      >
        <UIProviderWrapper>
          <RoadmapProviderWrapper bootRoadmaps={bootRoadmaps}>
            <AppShell />
          </RoadmapProviderWrapper>
        </UIProviderWrapper>
      </AuthProvider>
    </PWAProvider>
  );
}

// Wrappers that read from AuthContext to supply props to child providers
function UIProviderWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useAuth();
  return <UIProvider settingsTheme={settings.theme}>{children}</UIProvider>;
}

function RoadmapProviderWrapper({ children, bootRoadmaps }: { children: React.ReactNode; bootRoadmaps: Roadmap[] }) {
  const { isAuthenticated, mutatingHeaders, setNotifications, setAchievements } = useAuth();
  const { showToast, setActiveTab } = useUI();

  const handleAchievementUnlocked = useCallback((ach: { id: string; name: string; icon: string; xpReward: number }) => {
    setAchievements(prev => {
      const exists = prev.find((a: Achievement) => a.id === ach.id);
      if (exists) return prev.map((a: Achievement) => a.id === ach.id ? { ...a, unlocked: true, unlockedAt: new Date().toISOString() } : a);
      return prev;
    });
    setNotifications((prev: SystemNotification[]) => [{ id: `notif-ach-${Date.now()}`, title: `Achievement Unlocked: ${ach.name} 🏆`, message: `+${ach.xpReward} XP awarded!`, category: 'achievement', read: false, timestamp: new Date().toISOString() }, ...prev]);
  }, []);

  return (
    <RoadmapProvider
      isAuthenticated={isAuthenticated}
      mutatingHeaders={mutatingHeaders}
      onAchievementUnlocked={handleAchievementUnlocked}
      onNotification={(n) => setNotifications((prev: SystemNotification[]) => [n, ...prev])}
      onShowToast={showToast}
      onTabChange={setActiveTab}
    >
      {children}
    </RoadmapProvider>
  );
}
