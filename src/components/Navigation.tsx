// Navigation architecture:
//   BottomNavigation — primary nav (5 core tabs always visible).
//   SideDrawer       — secondary nav (Achievements, Notifications) + profile/settings/logout.
//   The two surfaces are intentionally complementary, not duplicates:
//   the bottom bar covers the 5 main destinations; the drawer exposes the remaining
//   secondary sections that do not need a persistent tab.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Home, Compass, MessageSquare, BarChart3, User, Menu, X, Bell, Flame, Crown, LogOut, Settings, Award, Sparkles } from 'lucide-react';
import { UserProfile, SystemNotification } from '../types';
import { StreakBadge, TierBadge } from './Badges';
import { buttonStyles } from '../styles/theme';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface MobileHeaderProps {
  profile: UserProfile;
  notifications: SystemNotification[];
  onTabChange: (tab: string) => void;
  onNotificationsClick: () => void;
  onUpgradeClick: () => void;
  onOpenDrawer: () => void;
}

export function MobileHeader({
  profile,
  notifications,
  onTabChange,
  onNotificationsClick,
  onUpgradeClick,
  onOpenDrawer
}: MobileHeaderProps) {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 md:px-6 bg-white/80 dark:bg-[#111111]/80 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 transition-colors duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDrawer}
          className="p-2 -ml-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Open sidebar"
          id="btn-nav-sidebar"
        >
          <Menu className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
        </button>
        <button
          type="button"
          onClick={() => onTabChange('home')}
          aria-label="Go to home"
          className="flex items-center gap-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors px-1 py-0.5 -mx-1"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            LearnPath <span className="text-purple-600 dark:text-purple-400 font-extrabold">AI</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Streak badge visible on all screen widths */}
        <StreakBadge days={profile.streak} />

        <button
          onClick={onNotificationsClick}
          className="relative p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-all duration-200 cursor-pointer"
          aria-label="View notifications"
          id="btn-nav-notif"
        >
          <Bell className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" aria-label={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`} />
          )}
        </button>

        <button
          onClick={() => onTabChange('profile')}
          aria-label="Go to profile"
          className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200 dark:border-white/10 hover:border-purple-600 dark:hover:border-purple-500 transition-all duration-200 flex-shrink-0 cursor-pointer"
        >
          <img
            src={profile.avatar}
            alt={profile.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </button>
      </div>
    </header>
  );
}

interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  // Display labels are kept short for consistent grid sizing across all screen widths.
  // aria-label always carries the full accessible name.
  const tabs = [
    { id: 'home',     label: 'Home',     ariaLabel: 'Home',          icon: Home },
    { id: 'roadmaps', label: 'Paths',    ariaLabel: 'Roadmaps',      icon: Compass },
    { id: 'mentor',   label: 'Mentor',   ariaLabel: 'AI Mentor',     icon: MessageSquare },
    { id: 'progress', label: 'Progress', ariaLabel: 'Progress',      icon: BarChart3 },
    { id: 'profile',  label: 'Profile',  ariaLabel: 'Profile',       icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 dark:bg-zinc-950/85 border-t border-zinc-200 dark:border-transparent pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-12px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-all duration-300">
      <div className="grid grid-cols-5 items-center h-16 max-w-xl mx-auto px-2">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center flex-1 min-w-0 py-1 px-1 sm:px-3.5 rounded-xl transition-all duration-300 cursor-pointer ${
                isActive
                  ? 'text-zinc-900 dark:text-white font-bold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
              id={`nav-tab-${tab.id}`}
            >
              {/* Active background pill */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/15 to-blue-500/15 border border-purple-500/25 rounded-xl -z-10" />
              )}
              <IconComponent className={`w-5 h-5 ${isActive ? 'stroke-[2.5px] text-purple-600 dark:text-purple-400 dark:drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'stroke-[2px]'}`} />
              {/* Active indicator dot below icon */}
              {isActive ? (
                <span className="mt-0.5 w-1 h-1 rounded-full bg-purple-500 dark:bg-purple-400" />
              ) : (
                <span className="mt-0.5 w-1 h-1" />
              )}
              <span className="text-xs tracking-wide font-medium whitespace-nowrap truncate w-full text-center">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  profile: UserProfile;
  onUpgradeClick: () => void;
  onLogoutClick: () => void;
}

export function SideDrawer({
   isOpen,
   onClose,
   activeTab,
   onTabChange,
   profile,
   onUpgradeClick,
   onLogoutClick
}: SideDrawerProps) {
  // Secondary sections only — the 5 primary tabs live in BottomNavigation.
  const sections = [
    { id: 'achievements', label: 'Achievements', icon: Award },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus trap — keeps keyboard/AT users inside the drawer while it's open.
  useFocusTrap(drawerRef, isOpen);

  // Close on Escape key.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Force a paint before starting the slide-in
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
      document.removeEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      {/* Backdrop */}
      <div
        role="button"
        aria-label="Close sidebar"
        tabIndex={-1}
        className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        className={`absolute inset-y-0 left-0 max-w-xs w-full bg-white dark:bg-[#111111] text-zinc-900 dark:text-white shadow-[0_8px_40px_rgba(0,0,0,0.18)] flex flex-col border-r border-zinc-200 dark:border-white/10 transition-transform duration-300 ease-out ${mounted ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
              LearnPath <span className="text-purple-600 dark:text-purple-400">AI</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white rounded-lg hover:bg-zinc-200/50 dark:hover:bg-white/5"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>

        {/* Profile preview summary */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/10 bg-zinc-100/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-300 dark:border-white/10">
              <img src={profile.avatar} alt="Profile photo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-zinc-900 dark:text-white truncate">{profile.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{profile.email}</p>
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between">
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              Level <span className="font-bold text-zinc-900 dark:text-white text-xs bg-zinc-100 dark:bg-white/5 border border-zinc-300 dark:border-white/10 px-1.5 py-0.5 rounded-full ml-1">{profile.level}</span>
            </div>
            <TierBadge isPro={profile.isPro} onClick={onUpgradeClick} />
          </div>
        </div>

        {/* Secondary navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-4 pb-2 text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            More
          </p>
          {sections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeTab === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => {
                  onTabChange(sec.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left font-semibold transition-all duration-200 cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'bg-purple-100/70 dark:bg-white/5 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-white/10'
                    : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-purple-700 dark:text-purple-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Upgrade Card Banner */}
        {!profile.isPro && (
          <div className="p-4 mx-4 mb-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 dark:from-purple-900/40 dark:to-blue-900/40 border border-purple-300 dark:border-purple-500/30">
            <div className="flex items-center gap-2 mb-1.5">
              <Crown className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h5 className="text-xs font-black text-purple-700 dark:text-purple-300">UPGRADE TO PRO</h5>
            </div>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mb-3">
              Unlock unlimited AI dynamic roadmaps, instant code analysis, and continuous practice assessments.
            </p>
            <button
              onClick={() => {
                onUpgradeClick();
                onClose();
              }}
              className={`w-full py-2.5 font-bold text-xs rounded-xl text-center text-white transition-all cursor-pointer ${buttonStyles.primary}`}
            >
              Get Unlimited Access
            </button>
          </div>
        )}

        {/* Drawer footer buttons */}
        <div className="p-5 border-t border-zinc-200 dark:border-white/10 space-y-1 bg-zinc-50/60 dark:bg-white/[0.02]">
          <button
            onClick={() => {
              onTabChange('profile');
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-white/5 rounded-xl text-left min-h-[44px]"
          >
            <Settings className="w-4 h-4 text-zinc-500" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => {
              onLogoutClick();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-900 dark:hover:text-white hover:bg-rose-500/10 rounded-xl text-left min-h-[44px]"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            <span className="text-rose-600 dark:text-red-400">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}