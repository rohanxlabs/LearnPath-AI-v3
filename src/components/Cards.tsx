import React from 'react';
import { Play, Sparkles, Trophy, Award, Clock, BookOpen, Flame, Bell, Trash2, Calendar, CheckCircle2, ChevronRight, BrainCircuit, BarChart } from 'lucide-react';
import { UserProfile, SystemNotification, Achievement, Phase } from '../types';
import { XPBadge, StreakBadge } from './Badges';

interface ProgressCardProps {
  progressPercent: number;
  currentPhaseName: string;
  totalXp: number;
  onContinue: () => void;
}

export function ProgressCard({ progressPercent, currentPhaseName, totalXp, onContinue }: ProgressCardProps) {
  // SVG Circle calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl glass-card glass-card-purple p-8 transition-all duration-300">
      <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600 rounded-full blur-[120px] opacity-15 pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <span className="text-xs font-semibold text-purple-300 uppercase tracking-widest font-mono">ACTIVE SYLLABUS</span>
          <h3 className="font-display font-bold text-xl md:text-2xl text-white mt-1 truncate">
            {currentPhaseName}
          </h3>
          <p className="text-xs text-zinc-300 mt-1.5 flex items-center justify-center sm:justify-start gap-1.5 font-mono">
            <span>Overall Score: {totalXp} XP</span>
          </p>
          <div className="mt-5">
            <button
              onClick={onContinue}
              className="inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_15px_rgba(168,85,247,0.4)]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Continue Learning</span>
            </button>
          </div>
        </div>

        <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center bg-white/5 rounded-full border border-white/10">
          <svg className="w-20 h-20 transform -rotate-90">
            {/* Background ring */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-white/5"
              strokeWidth="5"
              fill="transparent"
            />
            {/* Accent progress ring */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-purple-500 transition-all duration-500 ease-out"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute text-center">
            <span className="text-base font-extrabold font-display text-white">{progressPercent}%</span>
            <span className="block text-[8px] tracking-wide font-semibold text-zinc-400 uppercase">DONE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatsCardProps {
  stats: {
    hoursStudied: number;
    completedTopics: number;
    totalXp: number;
    streak: number;
  };
}

export function StatsCard({ stats }: StatsCardProps) {
  const statItems = [
    {
      id: 'stat-xp',
      label: 'Earned XP',
      value: stats.totalXp.toLocaleString(),
      desc: 'Overall points',
      icon: Trophy,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      glass: 'glass-card-purple',
    },
    {
      id: 'stat-hours',
      label: 'Hours Studied',
      value: stats.hoursStudied.toFixed(1),
      desc: 'Active course runtime',
      icon: Clock,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      glass: 'glass-card-blue',
    },
    {
      id: 'stat-topics',
      label: 'Syllabus Steps',
      value: stats.completedTopics,
      desc: 'Assessed lessons',
      icon: BookOpen,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      glass: 'glass-card-teal',
    },
    {
      id: 'stat-streak',
      label: 'Daily Streak',
      value: stats.streak,
      desc: 'Consecutive study logs',
      icon: Flame,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      glass: 'glass-card-orange',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-transparent">
      {statItems.map((item) => {
        const IconComponent = item.icon;
        return (
          <div
            key={item.id}
            className={`p-5 rounded-3xl ${item.glass} shadow-md flex flex-col justify-between transition-all duration-250`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-300 font-medium">{item.label}</span>
              <div className={`p-1.5 rounded-lg border flex-shrink-0 ${item.color}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-bold text-white font-display">
                {item.value}
              </span>
              <span className="block text-[10px] text-zinc-400 mt-1 truncate">
                {item.desc}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface AchievementCardProps {
  key?: React.Key;
  achievement: Achievement;
  onShare?: () => void;
}

export function AchievementCard({ achievement, onShare }: AchievementCardProps) {
  const isUnlocked = achievement.unlocked;

  // Render proper icon based on string key
  const renderIcon = () => {
    switch (achievement.icon) {
      case 'Sparkles':
        return <Trophy className="w-5 h-5 text-purple-400" />;
      case 'Code2':
        return <Award className="w-5 h-5 text-indigo-400" />;
      case 'MessageSquareText':
        return <Award className="w-5 h-5 text-blue-400" />;
      case 'Database':
        return <Award className="w-5 h-5 text-emerald-400" />;
      case 'Bot':
        return <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />;
      default:
        return <Award className="w-5 h-5 text-zinc-400" />;
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-5 border transition-all duration-300 ${
        isUnlocked
          ? 'glass-card glass-card-purple shadow-[0_4px_12px_rgba(168,85,247,0.08)]'
          : 'glass-card opacity-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border flex-shrink-0 ${
            isUnlocked ? 'bg-purple-500/10 border-purple-500/25' : 'bg-white/5 border-white/5'
          }`}>
            {renderIcon()}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm text-white truncate">
              {achievement.name}
            </h4>
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {achievement.description}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          {isUnlocked ? (
            <div className="flex flex-col items-end gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>UNLOCKED</span>
              </span>
              <span className="text-[9px] text-zinc-400 font-mono">
                {achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : 'Just now'}
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-300 font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
              LOCKED
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest font-mono">
          +{achievement.xpReward} XP REWARD
        </span>
        {isUnlocked && onShare && (
          <button
            onClick={onShare}
            className="text-[10px] font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            Share Milestone
          </button>
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  key?: React.Key;
  notification: SystemNotification;
  onReadToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NotificationCard({ notification, onReadToggle, onDelete }: NotificationCardProps) {
  const getBadgeStyle = () => {
    switch (notification.category) {
      case 'achievement':
        return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
      case 'mentor':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'roadmap':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-white/5 text-zinc-400 border border-white/5';
    }
  };

  return (
    <div
      className={`p-5 rounded-3xl transition-all duration-200 ${
        notification.read
          ? 'glass-card opacity-60'
          : 'glass-card glass-card-blue text-white shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider ${getBadgeStyle()}`}>
              {notification.category}
            </span>
            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <h4 className={`text-sm font-semibold mt-2 ${notification.read ? 'text-zinc-300' : 'text-white'}`}>
            {notification.title}
          </h4>
          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
            {notification.message}
          </p>
        </div>

        <div className="flex h-full items-center gap-2">
          <button
            onClick={() => onReadToggle(notification.id)}
            className="text-[10px] font-bold text-purple-400 hover:text-purple-300 cursor-pointer p-1"
          >
            {notification.read ? 'Unread' : 'Mark Read'}
          </button>
          <button
            onClick={() => onDelete(notification.id)}
            className="p-1.5 text-zinc-500 hover:text-rose-450 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Delete notification"
          >
            <Trash2 className="w-4 h-4 text-zinc-400 hover:text-rose-450" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface AIRecommendationCardProps {
  key?: React.Key;
  recommendation: {
    id: string;
    title: string;
    description: string;
    xpReward: number;
    category: 'quiz' | 'coding' | 'mentor' | 'roadmap';
    difficulty: 'Easy' | 'Medium' | 'Hard';
  };
  onLaunch: (rec: any) => void;
}

export function AIRecommendationCard({ recommendation, onLaunch }: AIRecommendationCardProps) {
  const getBadgeStyle = () => {
    switch (recommendation.difficulty) {
      case 'Easy':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Medium':
        return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'Hard':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    }
  };

  const getGlassStyle = () => {
    switch (recommendation.difficulty) {
      case 'Easy':
        return 'glass-card-emerald';
      case 'Medium':
        return 'glass-card-orange';
      case 'Hard':
        return 'glass-card-rose';
    }
  };

  return (
    <div className={`p-5 rounded-3xl ${getGlassStyle()} transition-all duration-300 shadow-sm flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between gap-2.5">
          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border tracking-wide ${getBadgeStyle()}`}>
            {recommendation.difficulty}
          </span>
          <span className="inline-flex items-center text-xs font-bold text-purple-400">
            +{recommendation.xpReward} XP
          </span>
        </div>
        <h4 className="font-semibold text-sm text-white mt-2.5">
          {recommendation.title}
        </h4>
        <p className="text-xs text-zinc-300 mt-1 lines-clamp-2 leading-relaxed">
          {recommendation.description}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-zinc-400 font-mono capitalize">
          Category: {recommendation.category}
        </span>
        <button
          onClick={() => onLaunch(recommendation)}
          className="inline-flex items-center gap-1 hover:gap-1.5 text-xs text-purple-400 font-bold hover:text-purple-300 transition-all cursor-pointer"
        >
          <span>Instigate Tasks</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface LearningScoreCardProps {
  profile?: {
    xp: number;
    level: number;
  };
}

export function LearningScoreCard({ profile }: LearningScoreCardProps) {
  // Use user's current XP to calculate skills, making them go up as XP increases!
  const currentXp = profile?.xp || 1840;
  
  const skills = [
    { name: 'Python Engineering', score: Math.min(100, Math.floor(45 + currentXp / 50)), color: '#a855f7' },
    { name: 'Neural Mechanics', score: Math.min(100, Math.floor(35 + currentXp / 65)), color: '#3b82f6' },
    { name: 'Logic Prompting', score: Math.min(100, Math.floor(55 + currentXp / 55)), color: '#10b981' },
    { name: 'Systems RAG', score: Math.min(100, Math.floor(20 + currentXp / 80)), color: '#f59e0b' },
  ];

  return (
    <div className="p-5 rounded-3xl glass-card glass-card-purple shadow-sm">
      <div className="flex items-center justify-between gap-2.5 mb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-purple-400" />
          <h4 className="font-display font-semibold text-sm text-white font-sans">Syllabus Skill Mastery</h4>
        </div>
        <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1">
          <BarChart className="w-3.5 h-3.5" /> Calculated AI Metrics
        </span>
      </div>

      <div className="space-y-4">
        {skills.map((skill) => (
          <div key={skill.name}>
            <div className="flex justify-between items-center text-xs mb-1.5 font-sans">
              <span className="font-medium text-zinc-300">{skill.name}</span>
              <span className="font-bold font-mono text-white" style={{ color: skill.color }}>
                {skill.score}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
              <div
                className="h-full rounded-full transition-all duration-[800ms] ease-out"
                style={{
                  width: `${skill.score}%`,
                  backgroundColor: skill.color,
                  boxShadow: `0 0 10px ${skill.color}50`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
