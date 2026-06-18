import React, { useState } from 'react';
import { Home, Compass, MessageSquare, BarChart3, User, Menu, X, Bell, Flame, Crown, LogOut, Settings, Award, ShieldAlert, Sparkles, BookOpen } from 'lucide-react';
import { UserProfile, SystemNotification } from '../types';
import { StreakBadge, TierBadge } from './Badges';

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
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange('home')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-slate-900 dark:text-white">
            LearnPath <span className="text-purple-600 dark:text-purple-400 font-extrabold">AI</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden sm:inline-flex">
          <StreakBadge days={profile.streak} />
        </div>

        <button
          onClick={onNotificationsClick}
          className="relative p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-all duration-200 cursor-pointer"
          aria-label="View notifications"
          id="btn-nav-notif"
        >
          <Bell className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => onTabChange('profile')}
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
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'roadmaps', label: 'Roadmaps', icon: Compass },
    { id: 'mentor', label: 'AI Mentor', icon: MessageSquare },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/85 dark:bg-zinc-950/85 border-t border-zinc-200 dark:border-white/5 pb-safe shadow-[0_-10px_35px_rgba(0,0,0,0.05)] dark:shadow-[0_-15px_35px_rgba(0,0,0,0.6)] backdrop-blur-lg transition-all duration-300">
      <div className="flex justify-around items-center h-16 max-w-xl mx-auto px-4">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-3.5 rounded-2xl transition-all duration-300 cursor-pointer ${
                isActive
                  ? 'text-zinc-900 dark:text-white font-bold scale-102'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
              id={`nav-tab-${tab.id}`}
            >
              {/* Active gradient pill background highlight */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/15 to-blue-500/15 border border-purple-500/25 rounded-2xl -z-10 animate-[pulse_3s_infinite]" />
              )}
              <IconComponent className={`w-4.5 h-4.5 mb-1 ${isActive ? 'stroke-[2.5px] text-purple-600 dark:text-purple-400 dark:drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'stroke-[2px]'}`} />
              <span className="text-[10px] tracking-wide font-medium">{tab.label}</span>
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
  const sections = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'roadmaps', label: 'Roadmaps', icon: Compass },
    { id: 'mentor', label: 'AI Mentor', icon: MessageSquare },
    { id: 'progress', label: 'Progress & Analytics', icon: BarChart3 },
    { id: 'achievements', label: 'Achievements', icon: Award },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 left-0 max-w-xs w-full bg-[#f8fafc] dark:bg-[#111111] text-zinc-900 dark:text-white shadow-2xl flex flex-col transition-transform duration-300 border-r border-zinc-250 dark:border-white/10">
        {/* Drawer Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-zinc-900 dark:text-white">
              LearnPath <span className="text-purple-600 dark:text-purple-400">AI</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-650 dark:hover:text-white rounded-lg hover:bg-zinc-200/50 dark:hover:bg-white/5"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          </button>
        </div>

        {/* Profile preview summary */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-zinc-250 dark:border-white/10">
              <img src={profile.avatar} alt="Profile photo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-zinc-900 dark:text-white truncate">{profile.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{profile.email}</p>
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between">
            <div className="text-xs text-zinc-650 dark:text-zinc-400">
              Level <span className="font-bold text-zinc-900 dark:text-white text-xs bg-zinc-205 dark:bg-white/5 border border-zinc-300 dark:border-white/10 px-1.5 py-0.5 rounded ml-1">{profile.level}</span>
            </div>
            <TierBadge isPro={profile.isPro} onClick={onUpgradeClick} />
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-left font-semibold transition-all duration-200 cursor-pointer ${
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
            <p className="text-[10px] text-zinc-700 dark:text-zinc-350 leading-relaxed mb-3">
              Unlock unlimited AI dynamic roadmaps, instant code analysis, and continuous mock assessments.
            </p>
            <button
              onClick={() => {
                onUpgradeClick();
                onClose();
              }}
              className="w-full py-1.5 font-bold text-xs rounded-lg text-center bg-purple-600 dark:bg-white text-white dark:text-black hover:bg-purple-705 dark:hover:bg-zinc-100 transition-all cursor-pointer"
            >
              Get Unlimited Access
            </button>
          </div>
        )}

        {/* Drawer footer buttons */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-805 space-y-1 bg-zinc-100/40 dark:bg-zinc-950/15">
          <button
            onClick={() => {
              onTabChange('profile');
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-zinc-700 dark:text-zinc-350 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-100 rounded-lg text-left"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-500" />
            <span>Settings Preferences</span>
          </button>
          <button
            onClick={() => {
              onLogoutClick();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-450 hover:text-rose-900 dark:hover:text-white hover:bg-rose-500/10 rounded-lg text-left"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-rose-600 dark:text-red-400">Bypass Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
