import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Clock, Trophy, Shield, Eye, Sparkles, User, Settings, CreditCard, HelpCircle, CheckCircle, BellRing, Lock, ToggleLeft, ToggleRight, Sun, Flame } from 'lucide-react';
import { UserProfile, UserSettings } from '../types';
import { XPBadge, StreakBadge } from './Badges';

interface UserStats {
  xp: number;
  streak: number;
  hoursStudied: number;
  lessonsCompleted: number;
  overallMastery: number;
}

type ActivityLog = Record<string, { xp: number; lessonsCompleted: number }>;

interface AnalyticsViewProps {
  profile: UserProfile;
  activityLog?: ActivityLog;
  onNavigate?: (tab: string) => void;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

export function AnalyticsView({ profile, activityLog = {}, onNavigate, getAuthHeaders }: AnalyticsViewProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      // Skip fetch if no token source is available — avoids a guaranteed 401
      // on the initial render before the Supabase session is hydrated.
      if (!getAuthHeaders) { setIsLoading(false); return; }
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) { setIsLoading(false); return; }
        const res = await fetch('/api/user-stats', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        console.error('Failed to fetch user stats:', err);
        if (!cancelled) setStats({ xp: 0, streak: 0, hoursStudied: 0, lessonsCompleted: 0, overallMastery: 0 });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchStats();
    return () => { cancelled = true; };
  // Re-fetch every time the component mounts (tab switch) and whenever
  // getAuthHeaders reference changes (new login session).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders]);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxHour = 8;

  // Derive last-7-days hours from activityLog (each lesson ≈ 0.5 hrs)
  const weeklyHours = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i)); // Mon=0 … Sun=6 relative to today
      const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const entry = activityLog[key];
      return entry ? Math.min(maxHour, +(entry.lessonsCompleted * 0.5).toFixed(1)) : 0;
    });
  }, [activityLog]);

  const completionPercent = stats?.overallMastery || 0;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionPercent / 100) * circumference;

  const statItems = [
    {
      id: 'p-stat-xp',
      label: 'Earned XP',
      value: (stats?.xp ?? 0).toLocaleString(),
      desc: 'Overall points',
      icon: Trophy,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      glass: 'glass-card-purple',
    },
    {
      id: 'p-stat-hours',
      label: 'Hours Studied',
      value: (stats?.hoursStudied ?? 0).toFixed(1),
      desc: 'Active runtime',
      icon: Clock,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      glass: 'glass-card-blue',
    },
    {
      id: 'p-stat-topics',
      label: 'Lessons Completed',
      value: stats?.lessonsCompleted ?? 0,
      desc: 'Assessed units',
      icon: BarChart3,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      glass: 'glass-card-teal',
    },
    {
      id: 'p-stat-streak',
      label: 'Daily Streak',
      value: stats?.streak ?? 0,
      desc: 'Study log streak',
      icon: Sparkles,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      glass: 'glass-card-orange',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Title skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
          <div className="h-4 w-72 rounded-lg bg-white/5 border border-white/10 animate-pulse" />
        </div>
        {/* Progress ring skeleton */}
        <div className="h-32 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        {/* Stat grid skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="h-64 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Header with title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-white">Progress & Analytics</h2>
          <p className="text-sm text-zinc-400">Track your consistency and see how your learning pace is trending.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-card text-xs text-zinc-300 font-bold">
          <span>Current Study Level: {profile.level}</span>
        </div>
      </div>

      {/* 2. Overall completion ring card */}
      <div className="p-6 rounded-2xl glass-card glass-card-purple flex flex-col sm:flex-row items-center justify-between gap-6 transition-all duration-200">
        <div className="flex-1 text-center sm:text-left">
          <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">OVERALL PROGRESS</span>
          <h3 className="font-display font-bold text-xl text-white mt-1">Your Roadmap Progress</h3>
          <p className="text-xs text-zinc-300 mt-1.5">
            You're making steady progress. Keep completing lessons to raise your overall completion.
          </p>
        </div>
        <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center bg-white/5 rounded-full border border-white/10">
          <svg role="img" aria-label={`${Math.round(completionPercent)}% overall completion`} className="w-20 h-20 transform -rotate-90">
            <circle cx="40" cy="40" r={radius} className="stroke-white/5" strokeWidth="5" fill="none" />
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-purple-500 transition-all duration-500"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          <div className="absolute text-center">
            <span className="text-base font-extrabold font-display text-white">{Math.round(completionPercent)}%</span>
            <span className="block text-xs font-bold text-zinc-400 tracking-wider">DONE</span>
          </div>
        </div>
      </div>

      {/* 3. 4-stat grid (SaaS Glass Cards matching Home) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-transparent">
        {statItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <div
              key={item.id}
              className={`p-5 rounded-2xl ${item.glass} flex flex-col justify-between transition-all duration-200`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-300 font-medium">{item.label}</span>
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${item.color}`}>
                  <IconComponent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-xl sm:text-2xl font-bold text-white font-display">
                  {item.value}
                </span>
                <span className="block text-xs text-zinc-400 mt-1 truncate">
                  {item.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Primary Analytics Grid metrics with custom gradients */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weekly hours studied bar charts custom built in SVG with gradient fills */}
        <div className="p-5 rounded-2xl glass-card glass-card-blue flex flex-col justify-between col-span-1 md:col-span-2">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h4 className="font-display font-semibold text-sm text-white">Weekly Study Consistency</h4>
              <p className="text-xs text-zinc-400">Daily hours dedicated to syllabus exercises</p>
            </div>
            <span className="text-xs font-bold text-purple-300 font-mono">Tot: {(stats?.hoursStudied ?? 0).toFixed(1)} hrs worked</span>
          </div>

          {/* SVG Visual bar drawings */}
          <div className="h-44 flex items-end justify-between gap-2.5 pt-4 px-2">
            {weeklyHours.map((hours, index) => {
              const pct = (hours / maxHour) * 100;
              return (
                <div key={weekdays[index]} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                  <div className="relative w-full flex justify-center">
                    {/* Hover tooltip label */}
                    <span className="absolute -top-7 scale-0 group-hover:scale-100 transition-transform bg-[#0A0A0A] border border-white/5 text-xs text-zinc-300 font-bold px-1.5 py-0.5 rounded shadow-md pointer-events-none whitespace-nowrap">
                      {hours} hrs
                    </span>
                    {/* Rounded status bar */}
                    <div className="w-full sm:w-6 h-32 bg-white/5 group-hover:bg-white/10 rounded-xl border border-white/10 overflow-hidden flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-purple-500 to-blue-500 rounded-sm transition-all duration-500 group-hover:brightness-110"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-200 font-semibold">{weekdays[index]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Consistency Score wheel styled with glass-card-purple */}
        <div className="p-5 rounded-2xl glass-card glass-card-purple flex flex-col justify-between">
          <div>
            <h4 className="font-display font-semibold text-sm text-white">Platform Learning Score</h4>
            <p className="text-xs text-zinc-400 mt-0.5">Calculated based on streaks & speed answers</p>
          </div>

          <div className="my-4 flex items-center justify-center relative">
            {/* Simple concentric SVG indicator */}
            <svg className="w-28 h-28 transform -rotate-90">
              <circle cx="56" cy="56" r="45" className="stroke-white/5" strokeWidth="6" fill="none" />
              <circle cx="56" cy="56" r="45" className="stroke-purple-500" strokeWidth="6" strokeDasharray="282" strokeDashoffset={282 - (completionPercent / 100) * 282} strokeLinecap="round" fill="none" />
            </svg>
            <div className="absolute text-center">
               <span className="text-xl sm:text-2xl font-extrabold text-white font-display">{Math.round(completionPercent)}%</span>
              <span className="block text-xs font-bold text-zinc-400 tracking-wider">MASTERY INDEX</span>
            </div>
          </div>

          <div className="text-center pt-2">
            <p className="text-xs text-zinc-300">
                             Your streak is <strong className="text-amber-400 font-bold">{stats?.streak ?? 0} days</strong> strong. Keep learning each day to unlock legendary achievements.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced performance analytics widgets styled with glass-card-teal */}
      <div className="p-5 rounded-2xl glass-card glass-card-teal">
        <h4 className="font-display font-semibold text-sm text-white mb-4">Completion Speed</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* This section can now be powered by analytics or other dynamic data */}
        <div className="space-y-4">
          {(() => {
            // Monthly goal: based on user's actual hours. A reasonable monthly target is
            // 20 hours (≈5 hrs/week). We show the real studied hours vs that target.
            const monthlyGoal = 20;
            const hoursStudied = stats?.hoursStudied ?? 0;
            const hoursPercent = Math.min(100, (hoursStudied / monthlyGoal) * 100);
            return (
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5 font-sans">
                  <span className="text-zinc-300 font-medium">Monthly Practice Hours</span>
                  <span className="font-mono text-white font-semibold">{hoursStudied.toFixed(1)} / {monthlyGoal} hrs</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${hoursPercent}%` }} />
                </div>
              </div>
            );
          })()}

          {(() => {
            // Assessments: show actual completed vs total roadmap lessons (derived from profile)
            const done = stats?.lessonsCompleted ?? 0;
            // Estimate total from profile roadmaps — use overallMastery to back-calculate if possible
            const mastery = stats?.overallMastery ?? 0;
            const total = mastery > 0 ? Math.round(done / (mastery / 100)) : Math.max(done + 5, 20);
            const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
            return (
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5 font-sans">
                  <span className="text-zinc-300 font-medium">Assessments Verified</span>
                  <span className="font-mono text-white font-semibold">{done} / {total} lessons</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}
        </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5 font-sans">
                <span className="text-zinc-300 font-medium">Quiz Accuracy</span>
                {(() => {
                  const quizzes = (profile?.topicWiseQuizzes || []) as any[];
                  const total = quizzes.reduce((s: number, q: any) => s + (q.totalQuestions || 0), 0);
                  const score = quizzes.reduce((s: number, q: any) => s + (q.score || 0), 0);
                  const pct = total > 0 ? Math.round((score / total) * 100) : null;
                  return (
                    <span className="font-mono text-white font-semibold">
                      {pct === null ? 'No quiz data' : `${pct}% Average score`}
                    </span>
                  );
                })()}
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                {(() => {
                  const quizzes = (profile?.topicWiseQuizzes || []) as any[];
                  const total = quizzes.reduce((s: number, q: any) => s + (q.totalQuestions || 0), 0);
                  const score = quizzes.reduce((s: number, q: any) => s + (q.score || 0), 0);
                  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
                  return <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />;
                })()}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-xs mb-1.5 font-sans">
                <span className="text-zinc-300 font-medium">Lessons Completed</span>
                <span className="font-mono text-white font-semibold">{stats?.lessonsCompleted ?? 0} lessons done</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (stats?.lessonsCompleted ?? 0) * 5)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Page Recommendations as glass cards below */}
      {stats && stats.lessonsCompleted > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h4 className="font-display font-semibold text-sm text-white">Recommended Next Actions</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(stats.lessonsCompleted < 5
              ? [{ title: 'Complete more lessons', description: 'Keep learning to unlock personalized recommendations.', difficulty: 'easy', xpReward: 50 }]
              : []
            ).map((action, index) => (
              <div key={index} className={`p-5 rounded-2xl glass-card ${action.difficulty === 'easy' ? 'glass-card-emerald' : 'glass-card-rose'} flex flex-col justify-between`}>
                <div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${action.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20'} uppercase tracking-wide`}>
                    {action.difficulty}
                  </span>
                  <h4 className="font-semibold text-sm text-white mt-2">{action.title}</h4>
                  <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{action.description}</p>
                </div>
                <button
                  onClick={() => onNavigate?.('roadmaps')}
                  className="mt-4 pt-3 border-t border-white/5 w-full flex items-center justify-between text-xs font-bold text-purple-400 hover:brightness-110 cursor-pointer"
                >
                  <span>+{action.xpReward} XP Reward</span>
                  <span>{action.difficulty === 'easy' ? 'Go to Roadmaps →' : 'Go to Roadmaps →'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-2xl glass-card text-center">
          <p className="text-xs text-zinc-400">Complete your first lesson to unlock personalized recommendations.</p>
        </div>
      )}
    </div>
  );
}

interface ProfileViewProps {
  profile: UserProfile;
  settings: UserSettings;
  onUpdateSettings: (set: Partial<UserSettings>) => void;
  onUpdateProfile: (num: any) => void;
  onTriggerCheckout: () => void;
  checkoutStatus: string | null;
  isInstallAvailable?: boolean;
  isInstalled?: boolean;
  onInstall?: () => void;
  onRequestNotificationPermission?: () => Promise<string>;
  resolvedTheme?: 'light' | 'dark';
}

export function ProfileView({
  profile,
  settings,
  onUpdateSettings,
  onUpdateProfile,
  onTriggerCheckout,
  checkoutStatus,
  isInstallAvailable = false,
  isInstalled = false,
  onInstall,
  onRequestNotificationPermission
}: ProfileViewProps) {
  const [notificationEnabled, setNotificationEnabled] = useState(settings.notificationsEnabled);

  const handleUpdate = (updates: any) => {
    onUpdateSettings(updates);
  };

  return (
    <div className="space-y-8 flex-1">
      {/* 1. Primary info card */}
      <div className="p-6 rounded-2xl glass-card glass-card-purple flex flex-col md:flex-row items-center md:items-start justify-between gap-4">
        <div className="flex items-center flex-col md:flex-row gap-4 text-center md:text-left">
          {/* Avatar with gradient ring border */}
          <div className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-purple-500 via-violet-500 to-blue-500 shadow-[0_0_15px_rgba(168,85,247,0.35)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#0A0A0A]">
              <img src={profile.avatar} alt="User Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-col md:flex-row">
              <h3 className="font-display font-bold text-lg text-white">{profile.name}</h3>
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300">
                {profile.isPro ? 'Pro Subscription' : 'Free Tier'}
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5">{profile.email}</p>
            <p className="text-xs text-zinc-400 mt-2">Account active since {new Date(profile.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Streak and level shown as small gradient pill badges */}
        <div className="flex flex-col items-center md:items-end gap-2 text-right">
          <div className="flex gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 px-3.5 py-1 rounded-full shadow-sm">
              <Flame className="w-3.5 h-3.5" fill="currentColor" />
              {profile.streak} Days
            </span>
            <div className="px-3.5 py-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-600 text-xs text-white font-bold shadow-sm">
              Level {profile.level}
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-1">Platform Score: {profile.xp} XP total</p>
        </div>
      </div>

      {/* Grid Settings detail panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Settings preference form list */}
        <div className="p-5 rounded-2xl glass-card glass-card-purple space-y-4">
          <h4 className="font-display font-semibold text-sm text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-400" />
            <span>Preferences Menu</span>
          </h4>

          {/* Theme mode selector — Light / Dark / System */}
          <div className="space-y-1.5 border-b border-white/10 pb-3">
            <span className="block text-xs font-bold text-zinc-300 uppercase tracking-widest">Theme Mode</span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['light', 'dark', 'system'] as const).map((t) => {
                const active = settings.theme === t;
                const label = t.charAt(0).toUpperCase() + t.slice(1);
                return (
                  <button
                    key={t}
                    onClick={() => onUpdateSettings({ theme: t })}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                      active
                        ? 'bg-gradient-to-r from-purple-500 to-blue-600 text-white border-transparent shadow-[0_4px_12px_rgba(168,85,247,0.3)]'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs cursor-pointer" onClick={() => {
              const nextVal = !settings.emailNotifications;
              onUpdateSettings({ emailNotifications: nextVal });
            }}>
              <div>
                <span className="block font-semibold text-zinc-200">Email Alerts</span>
                <span className="block text-xs text-zinc-400">Receive weekly personalized progress recommendation graphs</span>
              </div>
              <button aria-label={`Toggle email alerts ${settings.emailNotifications ? 'off' : 'on'}`} className="text-purple-400 cursor-pointer">
                {settings.emailNotifications ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-zinc-600" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs cursor-pointer" onClick={async () => {
              const nextVal = !settings.pushNotifications;
              if (nextVal && onRequestNotificationPermission) {
                await onRequestNotificationPermission();
              }
              onUpdateSettings({ pushNotifications: nextVal });
            }}>
              <div>
                <span className="block font-semibold text-zinc-200">Push Notifications</span>
                <span className="block text-xs text-zinc-400">Instant notification when AI Mentor replies to prompts</span>
              </div>
              <button aria-label={`Toggle push notifications ${settings.pushNotifications ? 'off' : 'on'}`} className="text-purple-400 cursor-pointer">
                {settings.pushNotifications ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-zinc-600" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs cursor-pointer" onClick={() => {
              const nextVal = !settings.privacyPublicProfile;
              onUpdateSettings({ privacyPublicProfile: nextVal });
            }}>
              <div>
                <span className="block font-semibold text-zinc-200">Share profile publicly</span>
                <span className="block text-xs text-zinc-400">Show performance logs on school leaderboards</span>
              </div>
              <button aria-label={`Toggle public profile ${settings.privacyPublicProfile ? 'off' : 'on'}`} className="text-purple-400 cursor-pointer">
                {settings.privacyPublicProfile ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-zinc-600" />}
              </button>
            </div>
          </div>
        </div>

        {/* Subscription payment screen */}
        <div className="p-5 rounded-2xl glass-card glass-card-blue flex flex-col justify-between space-y-4">
          <div>
            <h4 className="font-display font-semibold text-sm text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-400" />
              <span>Payments & Subscriptions</span>
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">Demo checkout — no payment processor is connected yet, no real charge occurs.</p>
          </div>

          <div className="p-4 rounded-xl border border-purple-500/10 bg-purple-500/5 shadow-sm space-y-2 text-xs">
            <div className="flex justify-between items-center bg-transparent">
              <span className="font-bold text-purple-300">LearnPath AI Pro Special Code</span>
              <span className="text-xs text-zinc-300 font-bold">$12.99 / Month</span>
            </div>
            <ul className="space-y-1 text-xs text-zinc-400 leading-relaxed list-none pl-0">
              <li className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-purple-400" />
                <span>Unlimited server-side AI Mentor chats</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-purple-400" />
                <span>Unlimited multi-phase roadmap trees</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-purple-400" />
                <span>Advanced personalized code execution analysis</span>
              </li>
            </ul>
          </div>

          {checkoutStatus ? (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-bold">{checkoutStatus}</p>
                <p className="text-xs text-zinc-400 font-medium">Subscription status is saved to your user profile.</p>
              </div>
            </div>
          ) : (
            <div className="pt-2">
              <button
                onClick={onTriggerCheckout}
                disabled={profile.isPro}
                className="w-full py-2.5 font-bold text-xs text-white bg-gradient-to-r from-purple-500 to-blue-600 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md rounded-xl"
                id="btn-stripe-checkout"
              >
                {profile.isPro ? 'Verified Pro Member' : 'Try Pro (Demo — No Charge)'}
              </button>
            </div>
          )}
        </div>

        {/* Elegant Install App Section inside Profile Settings */}
        {isInstallAvailable && !isInstalled && (
          <div className="p-5 rounded-2xl glass-card glass-card-purple flex flex-col sm:flex-row justify-between items-start sm:items-center md:col-span-2 gap-4 animate-pulse-glow">
            <div className="flex-1">
              <h4 className="font-display font-semibold text-sm text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Install LearnPath App</span>
              </h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Add LearnPath AI to your home screen! Enjoy fullscreen standalone interface, rapid instant load times, and clean offline learning capabilities.
              </p>
            </div>
            <button
              onClick={onInstall}
              className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:brightness-110 shadow-md rounded-xl cursor-pointer shrink-0"
            >
              Install Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}