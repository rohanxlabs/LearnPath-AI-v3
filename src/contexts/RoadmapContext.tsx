// RoadmapContext — roadmap list, active roadmap, generation, deletion, progress.
// Extracted from App.tsx.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Roadmap, Achievement, SystemNotification } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoadmapContextValue {
  roadmaps: Roadmap[];
  setRoadmaps: React.Dispatch<React.SetStateAction<Roadmap[]>>;
  activeRoadmapId: string;
  setActiveRoadmapId: React.Dispatch<React.SetStateAction<string>>;
  selectedRoadmapId: string | null;
  setSelectedRoadmapId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedPhaseId: string | null;
  setSelectedPhaseId: React.Dispatch<React.SetStateAction<string | null>>;
  roadmapDetailTab: 'roadmap' | 'resources' | 'quiz' | 'projects' | 'insights';
  setRoadmapDetailTab: React.Dispatch<React.SetStateAction<'roadmap' | 'resources' | 'quiz' | 'projects' | 'insights'>>;
  roadmapProgress: Record<string, any>;
  isAiGeneratingRoadmap: boolean;
  setIsAiGeneratingRoadmap: React.Dispatch<React.SetStateAction<boolean>>;
  syncRoadmapsFromDatabase: () => Promise<void>;
  handleGenerateRoadmap: (params: { goal: string; experienceLevel: string; weeklyHours: number; preferredStyle: string }) => Promise<void>;
  handleRoadmapReadyFromStream: (data: any) => Promise<void>;
  handleDeleteRoadmap: (id: string) => Promise<void>;
  getNextIncompleteLesson: (roadmap: Roadmap) => { phaseId: string; levelId: string; lessonId: string } | null;
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null);

export function useRoadmaps(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmaps must be used inside RoadmapProvider');
  return ctx;
}

interface RoadmapProviderProps {
  children: React.ReactNode;
  isAuthenticated: boolean;
  bootRoadmaps?: Roadmap[];
  mutatingHeaders: () => Promise<Record<string, string>>;
  onAchievementUnlocked: (ach: { id: string; name: string; icon: string; xpReward: number }) => void;
  onNotification: (notif: SystemNotification) => void;
  onShowToast: (message: string, type?: 'error' | 'success' | 'info') => void;
  onTabChange: (tab: string) => void;
}

export function RoadmapProvider({
  children,
  isAuthenticated,
  bootRoadmaps = [],
  mutatingHeaders,
  onAchievementUnlocked,
  onNotification,
  onShowToast,
  onTabChange,
}: RoadmapProviderProps) {
  // Seed from bootstrap data so roadmaps appear immediately on login
  // without waiting for a separate /api/roadmaps round-trip.
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>(bootRoadmaps);
  const [activeRoadmapId, setActiveRoadmapId] = useState<string>(bootRoadmaps[0]?.id || '');
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [roadmapDetailTab, setRoadmapDetailTab] = useState<'roadmap' | 'resources' | 'quiz' | 'projects' | 'insights'>('roadmap');
  const [roadmapProgress, setRoadmapProgress] = useState<Record<string, any>>({});
  const [isAiGeneratingRoadmap, setIsAiGeneratingRoadmap] = useState(false);

  // Load progress for all roadmaps in parallel.
  // Depend on a stable sorted-ID string rather than the `roadmaps` array
  // reference so this only fires when the set of roadmaps actually changes,
  // not on every object mutation (M-02 fix).
  const roadmapIdKey = roadmaps.map(r => r.id).sort().join(',');
  useEffect(() => {
    if (roadmaps.length === 0) return;
    const loadProgress = async () => {
      const results = await Promise.all(
        roadmaps.map(async (roadmap) => {
          try {
            const res = await fetch(`/api/progress/${roadmap.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.progress) return { id: roadmap.id, progress: data.progress };
            }
          } catch { /* ignore per-roadmap failures */ }
          return null;
        })
      );
      const updates: Record<string, any> = {};
      results.forEach(r => { if (r) updates[r.id] = r.progress; });
      setRoadmapProgress(prev => ({ ...prev, ...updates }));
    };
    loadProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapIdKey]);

  // When bootRoadmaps prop changes (new login or logout), sync state.
  // - New login:  bootRoadmaps has data → seed roadmaps immediately so the
  //               list appears without waiting for a /api/roadmaps round-trip.
  // - Logout:     bootRoadmaps is reset to [] → clear roadmap state so the
  //               next user's session starts clean.
  const prevBootRef = React.useRef<Roadmap[]>(bootRoadmaps);
  React.useEffect(() => {
    if (bootRoadmaps === prevBootRef.current) return; // same reference, skip
    prevBootRef.current = bootRoadmaps;
    if (bootRoadmaps.length > 0) {
      setRoadmaps(bootRoadmaps);
      setActiveRoadmapId(prev => {
        const still = bootRoadmaps.some(r => r.id === prev);
        return still ? prev : (bootRoadmaps[0]?.id || '');
      });
    } else {
      // Logout — wipe roadmap state so next login starts fresh.
      setRoadmaps([]);
      setActiveRoadmapId('');
      setSelectedRoadmapId(null);
      setSelectedPhaseId(null);
    }
  }, [bootRoadmaps]);

  const syncRoadmapsFromDatabase = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await fetch('/api/roadmaps');
      if (response.ok) {
        const data = await response.json();
        const uniqueList: Roadmap[] = [];
        const seen = new Set<string>();
        data.forEach((r: Roadmap) => {
          if (r && r.id && !seen.has(r.id)) { seen.add(r.id); uniqueList.push(r); }
        });
        setRoadmaps(uniqueList);
        setActiveRoadmapId(prev => {
          const still = uniqueList.some(r => r.id === prev);
          if (!still && uniqueList[0]) return uniqueList[0].id;
          if (uniqueList.length === 0) return '';
          return prev;
        });
        if (uniqueList.length === 0) { setSelectedRoadmapId(null); setSelectedPhaseId(null); }
      }
    } catch (err) { console.error('Failed to sync roadmaps:', err); }
  }, [isAuthenticated]);

  const getNextIncompleteLesson = useCallback((roadmap: Roadmap) => {
    const progress = roadmapProgress[roadmap.id];
    if (progress?.completedLessonIds) {
      for (const phase of roadmap.phases || []) {
        for (const level of phase.levels || []) {
          for (const lesson of level.lessons || []) {
            if (!progress.completedLessonIds.includes(lesson.id) && (lesson.status === 'available' || lesson.status === 'locked')) {
              return { phaseId: phase.id, levelId: level.id, lessonId: lesson.id };
            }
          }
        }
      }
    }
    // Fallback: use lesson status from in-memory roadmap.
    // Accept 'available' first; if none found (e.g. brand-new roadmap where
    // only lesson-1 should be available but was normalised as 'locked'), also
    // accept the very first 'locked' lesson so the CTA always appears (C-04).
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          if (lesson.status === 'available') return { phaseId: phase.id, levelId: level.id, lessonId: lesson.id };
        }
      }
    }
    // Second pass — first locked lesson as last resort (C-04)
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          if (lesson.status === 'locked') return { phaseId: phase.id, levelId: level.id, lessonId: lesson.id };
        }
      }
    }
    return null;
  }, [roadmapProgress]);

  // Sub-Task 8: called by RoadmapGeneratorForm after the SSE stream delivers the final roadmap.
  // The form already shows isStreaming=true; we keep isAiGeneratingRoadmap=true here only for
  // the DB-persist phase — do NOT call setIsAiGeneratingRoadmap(true) again as the form already did.
  const handleRoadmapReadyFromStream = useCallback(async (data: any) => {
    // Ensure the context loading state is active (form may have already set it)
    setIsAiGeneratingRoadmap(true);
    try {
      const newRoadmap: Roadmap = {
        id: data.id || `roadmap-${Date.now()}`,
        goal: data.goal || '',
        experienceLevel: data.experienceLevel || 'Beginner',
        weeklyHours: data.weeklyHours || 5,
        preferredStyle: data.preferredStyle || 'Hands-on',
        progressPercent: data.progressPercent || 0,
        totalXp: data.totalXp || 0,
        lessonsCompleted: data.lessonsCompleted || 0,
        hoursRemaining: data.hoursRemaining || 40,
        createdAt: data.createdAt || new Date().toISOString(),
        phases: data.phases || [],
        resources: data.resources || [],
        projects: data.projects || [],
      };
      const persistResponse = await fetch('/api/roadmaps', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify(newRoadmap) });
      const persistData = await persistResponse.json().catch(() => ({}));
      if (!persistResponse.ok) throw new Error(persistData.error || `Failed to persist roadmap (HTTP ${persistResponse.status})`);
      if (persistData.newAchievement) onAchievementUnlocked(persistData.newAchievement);
      // Validate progression (same as handleGenerateRoadmap — Sub-Task 8 fix)
      try {
        const valRes = await fetch('/api/validate-progression', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify({ roadmap: newRoadmap }) });
        if (valRes.ok) {
          const val = await valRes.json();
          if (val.hasGaps || !val.prerequisitesMet) console.warn('Roadmap progression issues:', val.gaps, val.missingPrerequisites);
        }
      } catch (e) { console.warn('Could not validate progression:', e); }
      setRoadmaps(prev => [newRoadmap, ...prev]);
      setActiveRoadmapId(newRoadmap.id);
      setSelectedRoadmapId(newRoadmap.id);
      syncRoadmapsFromDatabase();
      onNotification({ id: `notif-${Date.now()}`, title: 'New AI Syllabus Generated', message: `Your custom roadmap for "${newRoadmap.goal}" is ready. Start learning!`, category: 'roadmap', read: false, timestamp: new Date().toISOString() });
      onTabChange('roadmaps');
    } catch (err) {
      console.error('Failed to persist streamed roadmap:', err);
      onShowToast('Roadmap was generated but could not be saved. Please try again.');
    } finally { setIsAiGeneratingRoadmap(false); }
  }, [mutatingHeaders, onAchievementUnlocked, onNotification, onShowToast, onTabChange, syncRoadmapsFromDatabase]);

  const handleGenerateRoadmap = useCallback(async (params: { goal: string; experienceLevel: string; weeklyHours: number; preferredStyle: string }) => {
    setIsAiGeneratingRoadmap(true);
    try {
      const response = await fetch('/api/generate-roadmap', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify(params) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Server returned non-JSON content.');
      const data = await response.json();
      const newRoadmap: Roadmap = {
        id: data.id || `roadmap-${Date.now()}`,
        goal: data.goal || params.goal,
        experienceLevel: data.experienceLevel || params.experienceLevel,
        weeklyHours: data.weeklyHours || params.weeklyHours,
        preferredStyle: data.preferredStyle || params.preferredStyle,
        progressPercent: data.progressPercent || 0,
        totalXp: data.totalXp || 0,
        lessonsCompleted: data.lessonsCompleted || 0,
        hoursRemaining: data.hoursRemaining || 40,
        createdAt: data.createdAt || new Date().toISOString(),
        phases: data.phases || [],
        resources: data.resources || [],
        projects: data.projects || [],
      };
      const persistResponse = await fetch('/api/roadmaps', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify(newRoadmap) });
      const persistData = await persistResponse.json().catch(() => ({}));
      if (!persistResponse.ok) throw new Error(persistData.error || `Failed to persist roadmap (HTTP ${persistResponse.status})`);
      if (persistData.newAchievement) onAchievementUnlocked(persistData.newAchievement);
      try {
        const valRes = await fetch('/api/validate-progression', { method: 'POST', headers: await mutatingHeaders(), body: JSON.stringify({ roadmap: newRoadmap }) });
        if (valRes.ok) {
          const val = await valRes.json();
          if (val.hasGaps || !val.prerequisitesMet) console.warn('Roadmap progression issues:', val.gaps, val.missingPrerequisites);
        }
      } catch (e) { console.warn('Could not validate progression:', e); }
      setRoadmaps(prev => [newRoadmap, ...prev]);
      setActiveRoadmapId(newRoadmap.id);
      setSelectedRoadmapId(newRoadmap.id);
      syncRoadmapsFromDatabase();
      onNotification({ id: `notif-${Date.now()}`, title: 'New AI Syllabus Generated', message: `Your custom roadmap for "${newRoadmap.goal}" is now active.`, category: 'roadmap', read: false, timestamp: new Date().toISOString() });
      onTabChange('roadmaps');
    } catch (err) {
      console.error('Failed to generate roadmap:', err);
      onShowToast('Failed to generate roadmap. Please try again.');
    } finally { setIsAiGeneratingRoadmap(false); }
  }, [mutatingHeaders, onAchievementUnlocked, onNotification, onShowToast, onTabChange, syncRoadmapsFromDatabase]);

  const handleDeleteRoadmap = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/roadmaps/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setRoadmaps(prev => {
          const updated = prev.filter(r => r.id !== id);
          setActiveRoadmapId(cur => cur === id ? (updated[0]?.id || '') : cur);
          return updated;
        });
        setSelectedRoadmapId(cur => { if (cur === id) { setSelectedPhaseId(null); return null; } return cur; });
        syncRoadmapsFromDatabase();
        onNotification({ id: `notif-del-${Date.now()}`, title: 'Roadmap Deleted', message: 'Your roadmap has been successfully removed.', category: 'system', read: false, timestamp: new Date().toISOString() });
      } else {
        onShowToast('Failed to delete roadmap. Please try again.');
      }
    } catch (err) {
      console.error('Failed to delete roadmap:', err);
      onShowToast('Failed to delete roadmap. Please check your connection.');
    }
  }, [syncRoadmapsFromDatabase, onNotification, onShowToast]);

  const value: RoadmapContextValue = {
    roadmaps, setRoadmaps, activeRoadmapId, setActiveRoadmapId,
    selectedRoadmapId, setSelectedRoadmapId, selectedPhaseId, setSelectedPhaseId,
    roadmapDetailTab, setRoadmapDetailTab, roadmapProgress,
    isAiGeneratingRoadmap, setIsAiGeneratingRoadmap,
    syncRoadmapsFromDatabase, handleGenerateRoadmap, handleRoadmapReadyFromStream,
    handleDeleteRoadmap, getNextIncompleteLesson,
  };

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}
