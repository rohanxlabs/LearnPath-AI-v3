// UIContext — activeTab, sidebar, lesson, toast, confirmDelete, achievement overlay,
// AI status banner, stripe checkout status.
// Extracted from App.tsx.

import React, { createContext, useContext, useState } from 'react';
import type { ToastMessage } from '../components/Toast';
import type { Achievement } from '../types';

interface UIContextValue {
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeLesson: { phaseId: string; levelId: string; lessonId: string } | null;
  setActiveLesson: React.Dispatch<React.SetStateAction<{ phaseId: string; levelId: string; lessonId: string } | null>>;
  activeToast: ToastMessage | null;
  setActiveToast: React.Dispatch<React.SetStateAction<ToastMessage | null>>;
  showToast: (message: string, type?: ToastMessage['type']) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: React.Dispatch<React.SetStateAction<string | null>>;
  unlockedAchievement: Achievement | null;
  setUnlockedAchievement: React.Dispatch<React.SetStateAction<Achievement | null>>;
  aiActive: boolean | null;
  showAiOfflineBanner: boolean;
  setShowAiOfflineBanner: React.Dispatch<React.SetStateAction<boolean>>;
  stripeCheckoutStatus: string | null;
  setStripeCheckoutStatus: React.Dispatch<React.SetStateAction<string | null>>;
  isAiChatGenerating: boolean;
  setIsAiChatGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  aiRecommendations: any[];
  setAiRecommendations: React.Dispatch<React.SetStateAction<any[]>>;
  isRecsLoading: boolean;
  setIsRecsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  resolvedTheme: 'light' | 'dark';
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}

interface UIProviderProps {
  children: React.ReactNode;
  settingsTheme: 'light' | 'dark' | 'system';
}

export function UIProvider({ children, settingsTheme }: UIProviderProps) {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeLesson, setActiveLesson] = useState<{ phaseId: string; levelId: string; lessonId: string } | null>(null);
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [unlockedAchievement, setUnlockedAchievement] = useState<Achievement | null>(null);
  const [aiActive, setAiActive] = useState<boolean | null>(null);
  const [showAiOfflineBanner, setShowAiOfflineBanner] = useState(true);
  const [stripeCheckoutStatus, setStripeCheckoutStatus] = useState<string | null>(null);
  const [isAiChatGenerating, setIsAiChatGenerating] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [isRecsLoading, setIsRecsLoading] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // AI health check
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(res => res.json())
      .then(data => { if (!cancelled) setAiActive(!!data.aiActive); })
      .catch(() => { if (!cancelled) setAiActive(false); });
    return () => { cancelled = true; };
  }, []);

  // Theme resolution
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective: 'light' | 'dark' =
        settingsTheme === 'system' ? (mq.matches ? 'dark' : 'light') : (settingsTheme === 'dark' ? 'dark' : 'light');
      setResolvedTheme(effective);
      document.documentElement.classList.toggle('dark', effective === 'dark');
      document.documentElement.classList.toggle('light', effective === 'light');
      document.body.classList.toggle('dark', effective === 'dark');
      document.body.classList.toggle('light', effective === 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settingsTheme]);

  const showToast = (message: string, type: ToastMessage['type'] = 'error') =>
    setActiveToast({ message, type });

  const value: UIContextValue = {
    activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen,
    activeLesson, setActiveLesson, activeToast, setActiveToast, showToast,
    confirmDeleteId, setConfirmDeleteId, unlockedAchievement, setUnlockedAchievement,
    aiActive, showAiOfflineBanner, setShowAiOfflineBanner,
    stripeCheckoutStatus, setStripeCheckoutStatus,
    isAiChatGenerating, setIsAiChatGenerating,
    aiRecommendations, setAiRecommendations, isRecsLoading, setIsRecsLoading,
    resolvedTheme,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
