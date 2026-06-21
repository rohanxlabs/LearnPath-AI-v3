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
                <div className="p-5 bg-green-50 rounded-xl border border-green-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <h4 className="text-sm font-bold text-green-900 uppercase tracking-wide">Strengths</h4>
                    </div>
                    <ul className="space-y-2.5">
                        {strengths.length > 0 ? (
                            strengths.map((strength, index) => (
                                <li key={index} className="text-sm text-green-800 flex items-start">
                                    <span className="text-green-600 mr-2 mt-0.5">•</span>
                                    <span className="flex-1">{strength}</span>
                                </li>
                            ))
                        ) : (
                            <li className="text-sm text-green-700 italic">Keep learning to build your strengths!</li>
                        )}
                    </ul>
                </div>

                {/* Weak Areas Card */}
                <div className="p-5 bg-orange-50 rounded-xl border border-orange-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-orange-600" />
                        <h4 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Weak Areas</h4>
                    </div>
                    <ul className="space-y-2.5">
                        {weaknesses.length > 0 ? (
                            weaknesses.map((weakness, index) => (
                                <li key={index} className="text-sm text-orange-800 flex items-start">
                                    <span className="text-orange-600 mr-2 mt-0.5">•</span>
                                    <span className="flex-1">{weakness}</span>
                                </li>
                            ))
                        ) : (
                            <li className="text-sm text-orange-700 italic">No weak areas detected yet!</li>
                        )}
                    </ul>
                </div>
            </div>

            {/* AI Recommendation Callout Box */}
            <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                        <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">
                            AI Recommendation
                        </div>
                        <p className="text-sm text-indigo-900 leading-relaxed">
                            {recommendation}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};