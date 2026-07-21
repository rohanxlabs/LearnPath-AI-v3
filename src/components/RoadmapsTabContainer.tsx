import { useState, useEffect } from 'react';
import React from 'react';
import { Sparkles, PlusCircle } from 'lucide-react';
import { Roadmap, UserProfile } from '../types';
import { RoadmapsList } from './RoadmapsList';
import { RoadmapGeneratorForm } from './RoadmapGeneratorForm';
import { buttonStyles } from '../styles/theme';

interface RoadmapsTabContainerProps {
  roadmaps: Roadmap[];
  selectedRoadmapId: string | null;
  onSelectRoadmap: (id: string) => void;
  onBackToList: () => void;
  onDeleteRoadmap: (id: string) => void;
  onGenerateRoadmap: (params: any) => Promise<void>;
  isGenerating: boolean;
  profile: UserProfile;
  isLoading?: boolean;
  onAiAction?: (actionType: string, phaseName?: string) => void;
  onLessonClick?: (phaseId: string, levelId: string, lessonId: string) => void;
}

export function RoadmapsTabContainer({
  roadmaps,
  selectedRoadmapId,
  onSelectRoadmap,
  onBackToList,
  onDeleteRoadmap,
  onGenerateRoadmap,
  isGenerating,
  profile,
  isLoading,
  onLessonClick,
  onAiAction,
}: RoadmapsTabContainerProps) {
  const [showGenerator, setShowGenerator] = useState(false);

  // Redirect to the list view when a selected roadmap no longer exists.
  useEffect(() => {
    if (selectedRoadmapId && !roadmaps.some(r => r.id === selectedRoadmapId)) {
      onBackToList();
    }
  }, [selectedRoadmapId, roadmaps, onBackToList]);

  // List View only — detail view is handled by RoadmapOverviewPage in App.tsx
  if (!selectedRoadmapId) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">My Roadmaps</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Select a roadmap to view its phases and lessons.</p>
        </div>

        <RoadmapsList
          roadmaps={roadmaps}
          onSelectRoadmap={onSelectRoadmap}
          onDeleteRoadmap={onDeleteRoadmap}
          isLoading={isLoading}
        />

        <div className="space-y-3">
          <button
            onClick={() => setShowGenerator(v => !v)}
            className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm ${buttonStyles.primary} flex items-center justify-center gap-2`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{showGenerator ? 'Close Generator' : 'Generate New Roadmap'}</span>
            <PlusCircle className="w-4 h-4" />
          </button>
          {showGenerator && (
            <RoadmapGeneratorForm
              onSubmit={async (params) => {
                await onGenerateRoadmap(params);
                setShowGenerator(false);
              }}
              isGenerating={isGenerating}
            />
          )}
        </div>
      </div>
    );
  }

  // Detail view is handled by RoadmapOverviewPage rendered directly in App.tsx.
  return null;
}