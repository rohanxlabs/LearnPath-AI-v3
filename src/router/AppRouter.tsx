// AppRouter — all route-to-component mapping.
// Extracted from App.tsx renderTabContent() + lazy imports.

import React, { lazy, useCallback } from 'react';
import { LoadingSpinner } from '../components/Skeleton';
import { useAuth } from '../auth/authHooks';
import { useRoadmaps } from '../contexts/RoadmapContext';
import { useUI } from '../contexts/UIContext';
import { renderHomeView } from '../App';
import { getPhaseUnlockStatus } from '../lib/roadmapUtils';
import { AchievementCard, NotificationCard } from '../components/Cards';
import type { SystemNotification, ChatMessage } from '../types';

// ---------------------------------------------------------------------------
// Lazy-loaded views
// ---------------------------------------------------------------------------

const LearningWorkspace = lazy(() => import('../components/LearningWorkspace').then(m => ({ default: m.LearningWorkspace })));
const RoadmapOverview = lazy(() => import('../components/RoadmapOverview').then(m => ({ default: m.RoadmapOverview })));
const RoadmapsTabContainer = lazy(() => import('../components/RoadmapsTabContainer').then(m => ({ default: m.RoadmapsTabContainer })));
const MentorChatView = lazy(() => import('../components/MentorChatView').then(m => ({ default: m.MentorChatView })));
const AnalyticsView = lazy(() => import('../components/TabsScreen').then(m => ({ default: m.AnalyticsView })));
const ProfileView = lazy(() => import('../components/TabsScreen').then(m => ({ default: m.ProfileView })));
export const AchievementCelebration = lazy(() => import('../components/AchievementCelebration').then(m => ({ default: m.AchievementCelebration })));
const ResourcesTab = lazy(() => import('../components/ResourcesTab').then(m => ({ default: m.ResourcesTab })));
const RoadmapOverviewPage = lazy(() => import('../components/RoadmapOverviewPage').then(m => ({ default: m.RoadmapOverviewPage })));
const PhaseDetailPage = lazy(() => import('../components/PhaseDetailPage').then(m => ({ default: m.PhaseDetailPage })));
const QuizTab = lazy(() => import('../components/QuizTab').then(m => ({ default: m.QuizTab })));
const ProjectsTab = lazy(() => import('../components/ProjectsTab').then(m => ({ default: m.ProjectsTab })));
const AIInsightsTab = lazy(() => import('../components/AIInsightsTab').then(m => ({ default: m.AIInsightsTab })));

export function TabFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <LoadingSpinner size="md" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppRouterProps {
  chats: ChatMessage[];
  isAiChatGenerating: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onAiAction: (actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => void;
  onLessonComplete: (xpAdded: number, lessonId?: string) => void;
  onHandleAddXp: (amount: number) => void;
  onAchievementUnlocked: (ach: { id: string; name: string; icon: string; xpReward: number }) => void;
  onShowToast: (message: string, type?: 'error' | 'success' | 'info') => void;
  handleStripeCheckout: () => Promise<void>;
  stripeCheckoutStatus: string | null;
  pwa: { isInstallAvailable: boolean; isInstalled: boolean; installApp: () => void; requestNotificationPermission: () => Promise<string> };
  handleSelectRecommendationTask: (rec: any) => void;
  notifications: SystemNotification[];
  onNotificationsMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
  onToggleReadNotification: (id: string) => void;
  onSetSettings: (s: any) => void;
  onSetProfile: (p: any) => void;
}

export function AppRouter({
  chats,
  isAiChatGenerating,
  onSendMessage,
  onAiAction,
  onLessonComplete,
  onHandleAddXp,
  onAchievementUnlocked,
  onShowToast,
  handleStripeCheckout,
  stripeCheckoutStatus,
  pwa,
  handleSelectRecommendationTask,
  notifications,
  onNotificationsMarkAllRead,
  onDeleteNotification,
  onToggleReadNotification,
  onSetSettings,
  onSetProfile,
}: AppRouterProps) {
  const { profile, settings, achievements, isLoadingAuth, activityLog, mutatingHeaders } = useAuth();
  const {
    roadmaps,
    activeRoadmapId,
    setActiveRoadmapId,
    selectedRoadmapId, setSelectedRoadmapId,
    selectedPhaseId, setSelectedPhaseId,
    roadmapDetailTab, setRoadmapDetailTab,
    isAiGeneratingRoadmap,
    handleGenerateRoadmap,
    handleRoadmapReadyFromStream,
    getNextIncompleteLesson,
    syncRoadmapsFromDatabase,
  } = useRoadmaps();
  const { activeTab, setActiveTab, activeLesson, setActiveLesson, aiActive, setConfirmDeleteId } = useUI();

  const activeRoadmap = roadmaps.find(r => r.id === activeRoadmapId) || roadmaps[0] || null;
  const activePhase = activeRoadmap?.phases.find(p => p.status === 'current') || activeRoadmap?.phases[0] || null;

  const handleAiActionInternal = useCallback((actionType: 'explain' | 'quiz' | 'study_plan' | 'projects', phaseName: string) => {
    setActiveTab('mentor');
    onAiAction(actionType, phaseName);
  }, [setActiveTab, onAiAction]);

  // Active lesson workspace takes priority
  if (activeLesson && activeRoadmap) {
    return (
      <LearningWorkspace
        roadmap={activeRoadmap} activeLesson={activeLesson}
        onCompleteLesson={(xpAdded, lessonId) => onLessonComplete(xpAdded, lessonId)}
        onNavigateToLesson={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
        getHeaders={mutatingHeaders}
      />
    );
  }

  // No roadmap yet — limited navigation
  if (!activeRoadmap) {
    if (activeTab === 'home') {
      return renderHomeView({
        profile, activeRoadmap: null, activePhase: null, achievements,
        aiRecommendations: [], isRecsLoading: false, isLoading: isLoadingAuth,
        getNextIncompleteLesson,
        setActiveTab, setActiveLesson, handleSelectRecommendationTask,
        getAuthHeaders: mutatingHeaders,
      });
    }
    if (activeTab === 'mentor') {
      return (
        <MentorChatView chats={chats} isGenerating={isAiChatGenerating} onSendMessage={onSendMessage}
          onSelectAction={(topic) => onSendMessage(topic)} aiActive={aiActive}
          roadmapGoal={roadmaps.find(r => r.id === activeRoadmapId)?.goal}
        />
      );
    }
    if (activeTab === 'progress') {
      return <AnalyticsView profile={profile} activityLog={activityLog} onNavigate={(tab) => { setActiveTab(tab); setActiveLesson(null); }} getAuthHeaders={mutatingHeaders} />;
    }
    if (activeTab === 'profile') {
      return (
        <ProfileView profile={profile} settings={settings}
          onUpdateSettings={onSetSettings} onUpdateProfile={onSetProfile}
          onTriggerCheckout={handleStripeCheckout} checkoutStatus={stripeCheckoutStatus}
          isInstallAvailable={pwa.isInstallAvailable} isInstalled={pwa.isInstalled}
          onInstall={() => { pwa.installApp(); }} onRequestNotificationPermission={pwa.requestNotificationPermission}
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
          roadmaps={roadmaps} activeId={activeRoadmapId}
          onSetActive={(id) => { setActiveRoadmapId(id); setActiveLesson(null); }}
          onGenerateRoadmap={handleGenerateRoadmap} isGenerating={isAiGeneratingRoadmap}
          onContinueActive={() => setActiveLesson(null)} profile={profile}
          onLessonSelect={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
          onAiAction={handleAiActionInternal}
        />
      </div>
    );
  }

  // Full routing
  switch (activeTab) {
    case 'home':
      return renderHomeView({
        profile, activeRoadmap, activePhase, achievements,
        aiRecommendations: [], isRecsLoading: false, isLoading: isLoadingAuth,
        getNextIncompleteLesson,
        setActiveTab, setActiveLesson, handleSelectRecommendationTask,
        getAuthHeaders: mutatingHeaders,
      });

    case 'roadmaps': {
      const selectedRm = roadmaps.find(r => r.id === selectedRoadmapId) ?? null;
      if (selectedRm && roadmapDetailTab === 'resources') return <ResourcesTab roadmap={selectedRm} getAuthHeaders={mutatingHeaders} />;
      if (selectedRm && roadmapDetailTab === 'quiz') return <QuizTab roadmap={selectedRm} onAddXp={onHandleAddXp} onRoadmapUpdated={syncRoadmapsFromDatabase} onAchievementUnlocked={onAchievementUnlocked} getAuthHeaders={mutatingHeaders} />;
      if (selectedRm && roadmapDetailTab === 'projects') return <ProjectsTab roadmap={selectedRm} onAddXp={onHandleAddXp} onRoadmapUpdated={syncRoadmapsFromDatabase} getAuthHeaders={mutatingHeaders} />;
      if (selectedRm && roadmapDetailTab === 'insights') return <AIInsightsTab roadmap={selectedRm} profile={profile} activityLog={activityLog} getAuthHeaders={mutatingHeaders} />;
      if (selectedRm && selectedPhaseId) {
        const phaseIndex = selectedRm.phases.findIndex(p => p.id === selectedPhaseId);
        const phase = selectedRm.phases[phaseIndex];
        if (phase) {
          const unlockStatus = getPhaseUnlockStatus(selectedRm.phases, phaseIndex);
          return (
            <PhaseDetailPage roadmap={selectedRm} phase={phase} phaseIndex={phaseIndex} unlockStatus={unlockStatus}
              onBack={() => setSelectedPhaseId(null)}
              onLessonClick={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
              onAddXp={onHandleAddXp} onRoadmapUpdated={syncRoadmapsFromDatabase} getAuthHeaders={mutatingHeaders}
            />
          );
        }
      }
      if (selectedRm) {
        // Sub-Task 4: compute resume info from next incomplete lesson IDs → names
        const nextLesson = getNextIncompleteLesson(selectedRm);
        const resumeInfo = (() => {
          if (!nextLesson) return null;
          for (const ph of selectedRm.phases || []) {
            if (ph.id !== nextLesson.phaseId) continue;
            for (const lv of ph.levels || []) {
              if (lv.id !== nextLesson.levelId) continue;
              const les = (lv.lessons || []).find((l: any) => l.id === nextLesson.lessonId);
              if (les) return { lessonName: les.name, phaseName: ph.name };
            }
          }
          return null;
        })();
        return (
          <RoadmapOverviewPage roadmap={selectedRm} profile={profile}
            onSelectPhase={(phaseId) => setSelectedPhaseId(phaseId)}
            onBack={() => { setSelectedRoadmapId(null); setSelectedPhaseId(null); }}
            onContinueLearning={() => { const next = getNextIncompleteLesson(selectedRm); if (next) setActiveLesson(next); }}
            onGenerateRoadmap={handleGenerateRoadmap} onRoadmapReady={handleRoadmapReadyFromStream}
            isGenerating={isAiGeneratingRoadmap}
            resumeInfo={resumeInfo}
            onViewInsights={() => setRoadmapDetailTab('insights')}
          />
        );
      }
      return (
        <RoadmapsTabContainer
          roadmaps={roadmaps} selectedRoadmapId={selectedRoadmapId}
          onSelectRoadmap={(id) => { setSelectedRoadmapId(id); setActiveRoadmapId(id); setSelectedPhaseId(null); }}
          onBackToList={() => { setSelectedRoadmapId(null); setSelectedPhaseId(null); }}
          onDeleteRoadmap={(id) => setConfirmDeleteId(id)}
          onGenerateRoadmap={handleGenerateRoadmap} onRoadmapReady={handleRoadmapReadyFromStream}
          isGenerating={isAiGeneratingRoadmap} profile={profile} isLoading={isLoadingAuth}
          onAiAction={handleAiActionInternal}
          onLessonClick={(phaseId, levelId, lessonId) => setActiveLesson({ phaseId, levelId, lessonId })}
          getHeaders={mutatingHeaders}
        />
      );
    }

    case 'mentor':
      return (
        <MentorChatView chats={chats} isGenerating={isAiChatGenerating} onSendMessage={onSendMessage}
          onSelectAction={(topic) => onSendMessage(topic)} aiActive={aiActive}
          roadmapGoal={roadmaps.find(r => r.id === activeRoadmapId)?.goal}
        />
      );

    case 'progress':
      return <AnalyticsView profile={profile} activityLog={activityLog} onNavigate={(tab) => { setActiveTab(tab); setActiveLesson(null); }} getAuthHeaders={mutatingHeaders} />;

    case 'achievements':
      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-white">Your Achievements</h2>
            <p className="text-xs text-zinc-400">Unlock milestones as you progress through your learning journey.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((ach) => (
              <AchievementCard key={ach.id} achievement={ach} onShare={() => onShowToast(`Achievement "${ach.name}" shared!`, 'success')} />
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
            <button onClick={onNotificationsMarkAllRead} className="text-xs text-purple-400 hover:text-purple-300 font-bold cursor-pointer">
              Mark all read
            </button>
          </div>
          {notifications.length === 0 ? (
            <div className="p-8 text-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-2xl text-xs text-zinc-500 dark:text-zinc-500">
              Inbox clear! No active notifications.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <NotificationCard key={n.id} notification={n} onReadToggle={onToggleReadNotification} onDelete={onDeleteNotification} />
              ))}
            </div>
          )}
        </div>
      );

    case 'profile':
      return (
        <ProfileView profile={profile} settings={settings}
          onUpdateSettings={onSetSettings} onUpdateProfile={onSetProfile}
          onTriggerCheckout={handleStripeCheckout} checkoutStatus={stripeCheckoutStatus}
          isInstallAvailable={pwa.isInstallAvailable} isInstalled={pwa.isInstalled}
          onInstall={() => { pwa.installApp(); }} onRequestNotificationPermission={pwa.requestNotificationPermission}
        />
      );

    default:
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-4">
          <p className="text-base font-semibold text-zinc-300">Page not found</p>
          <p className="text-sm text-zinc-500">Something went wrong. Return to Home to continue.</p>
          <button
            onClick={() => setActiveTab('home')}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            Go to Home
          </button>
        </div>
      );
  }
}
