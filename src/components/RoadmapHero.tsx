import React from 'react';
import { Roadmap } from '../types';
import { CheckCircle, Zap } from 'lucide-react';

interface RoadmapHeroProps {
    roadmap: Roadmap;
}

export const RoadmapHero: React.FC<RoadmapHeroProps> = ({ roadmap }) => {
    const {
        goal,
        experienceLevel,
        progressPercent,
        totalXp,
    } = roadmap;

    // Circular progress ring calculations
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

    return (
        <div className="glass-card glass-card-purple p-6 rounded-2xl">
            {/* Header with Title and Status Badge */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{goal}</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{experienceLevel}</p>
                </div>
                <div className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 flex-shrink-0">
                    <CheckCircle className="w-3.5 h-3.5" />
                    In Progress
                </div>
            </div>

            {/* Progress Section with Circular Ring and XP Bar */}
            <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Circular Progress Ring */}
                <div className="flex-shrink-0 relative">
                    <svg
                        width="120"
                        height="120"
                        className="transform -rotate-90"
                        role="img"
                        aria-label={`${progressPercent}% complete`}
                    >
                        {/* Background circle */}
                        <circle
                            cx="60"
                            cy="60"
                            r={radius}
                            className="stroke-zinc-200 dark:stroke-white/10"
                            strokeWidth="8"
                            fill="none"
                        />
                        {/* Progress circle */}
                        <circle
                            cx="60"
                            cy="60"
                            r={radius}
                            stroke="url(#rh-gradient)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                        />
                        <defs>
                            <linearGradient id="rh-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    {/* Centered percentage text */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-zinc-900 dark:text-white">{progressPercent}%</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Complete</div>
                        </div>
                    </div>
                </div>

                {/* XP Progress Bar */}
                <div className="flex-1 w-full space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-500" />
                            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">XP Earned</span>
                        </div>
                        <span className="text-lg font-bold text-zinc-900 dark:text-white">{totalXp} XP</span>
                    </div>

                    {/* Horizontal XP Bar — standardised h-2 */}
                    <div className="w-full bg-zinc-100 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((totalXp / 1000) * 100, 100)}%` }}
                        />
                    </div>

                    {/* Level Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Level:</span>
                        <div className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                            {experienceLevel}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
