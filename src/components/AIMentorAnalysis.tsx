import React from 'react';
import { TrendingUp, AlertCircle, Sparkles } from 'lucide-react';

interface AIMentorAnalysisProps {
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
}

export const AIMentorAnalysis: React.FC<AIMentorAnalysisProps> = ({
    strengths,
    weaknesses,
    recommendation,
}) => {
    return (
        <div className="space-y-5">
            {/* Two-Column Grid for Strengths and Weak Areas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Strengths Card */}
                <div className="p-5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">Strengths</h4>
                    </div>
                    <ul className="space-y-2.5">
                        {strengths.length > 0 ? (
                            strengths.map((strength, index) => (
                                <li key={index} className="text-sm text-emerald-700 dark:text-emerald-300 flex items-start">
                                    <span className="text-emerald-500 dark:text-emerald-400 mr-2 mt-0.5">•</span>
                                    <span className="flex-1">{strength}</span>
                                </li>
                            ))
                        ) : (
                            <li className="text-sm text-emerald-600 dark:text-emerald-400 italic">Keep learning to build your strengths!</li>
                        )}
                    </ul>
                </div>

                {/* Weak Areas Card */}
                <div className="p-5 bg-orange-500/5 dark:bg-orange-500/10 rounded-xl border border-orange-200 dark:border-orange-500/20 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        <h4 className="text-sm font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wide">Weak Areas</h4>
                    </div>
                    <ul className="space-y-2.5">
                        {weaknesses.length > 0 ? (
                            weaknesses.map((weakness, index) => (
                                <li key={index} className="text-sm text-orange-700 dark:text-orange-300 flex items-start">
                                    <span className="text-orange-600 dark:text-orange-400 mr-2 mt-0.5">•</span>
                                    <span className="flex-1">{weakness}</span>
                                </li>
                            ))
                        ) : (
                            <li className="text-sm text-orange-600 dark:text-orange-400 italic">No weak areas detected yet!</li>
                        )}
                    </ul>
                </div>
            </div>

            {/* AI Recommendation Callout Box */}
            <div className="p-5 bg-gradient-to-br from-purple-500/8 to-blue-500/8 dark:from-purple-500/15 dark:to-blue-500/10 rounded-xl border border-purple-200 dark:border-purple-500/25 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <div className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-2">
                            AI Recommendation
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                            {recommendation}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
