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
        <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200/50 shadow-lg">
            {/* Header with Title and Status Badge */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">{goal}</h1>
                    <p className="text-sm text-slate-600 mt-1">{experienceLevel}</p>
                </div>
                <div className="bg-green-500/20 text-green-700 border border-green-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    In Progress
                </div>
            </div>

            {/* Progress Section with Circular Ring and XP Bar */}
            <div className="flex flex-col md:flex-row items-center gap-6">
                {/* Circular Progress Ring */}
                <div className="flex-shrink-0 relative">
                    <svg width="120" height="120" className="transform -rotate-90">
                        {/* Background circle */}
                        <circle
                            cx="60"
                            cy="60"
                            r={radius}
                            stroke="#e5e7eb"
                            strokeWidth="8"
                            fill="none"
                        />
                        {/* Progress circle */}
                        <circle
                            cx="60"
                            cy="60"
                            r={radius}
                            stroke="url(#gradient)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                        />
                        <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    {/* Centered percentage text */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-slate-900">{progressPercent}%</div>
                            <div className="text-xs text-slate-600">Complete</div>
                        </div>
                    </div>
                </div>

                {/* XP Progress Bar */}
                <div className="flex-1 w-full space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-500" />
                            <span className="text-sm font-semibold text-slate-700">XP Earned</span>
                        </div>
                        <span className="text-lg font-bold text-slate-900">{totalXp} XP</span>
                    </div>
                    
                    {/* Horizontal XP Bar */}
                    <div className="relative">
                        <div className="w-full bg-slate-200 rounded-full h-3">
                            <div
                                className="bg-gradient-to-r from-amber-400 to-amber-500 h-3 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min((totalXp / 1000) * 100, 100)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Level Badge */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Level:</span>
                        <div className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                            {experienceLevel}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};