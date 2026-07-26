import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Code2, Layers } from 'lucide-react';
import { ProjectTrack, Roadmap } from '../types';
import ProjectCard from './ProjectCard';
import ProjectFilters from './ProjectFilters';
import { SkeletonCard, LoadingSpinner } from './Skeleton';
import { EmptyState } from './EmptyState';
import { getPhaseUnlockStatus } from '../lib/roadmapUtils';

interface ProjectsTabProps {
  roadmap: Roadmap;
  onAddXp: (amount: number) => void;
  onRoadmapUpdated?: () => void;
  getAuthHeaders?: () => Promise<Record<string, string>>;
}

export function ProjectsTab({ roadmap, onAddXp, onRoadmapUpdated, getAuthHeaders }: ProjectsTabProps) {
  const [projects, setProjects] = useState<ProjectTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [filterPhaseId, setFilterPhaseId] = useState<string>('all');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Build a map: projectId → { phaseId, phaseName, phaseIndex, isLocked }
  const projectPhaseMap = useMemo(() => {
    const map = new Map<string, { phaseId: string; phaseName: string; phaseIndex: number; isLocked: boolean }>();
    (roadmap.phases || []).forEach((phase, idx) => {
      const unlocked = getPhaseUnlockStatus(roadmap.phases, idx) !== 'locked';
      ((phase as any).projects || []).forEach((proj: any) => {
        if (proj?.id) map.set(proj.id, {
          phaseId: phase.id,
          phaseName: phase.name,
          phaseIndex: idx,
          isLocked: !unlocked,
        });
      });
    });
    return map;
  }, [roadmap.phases]);

  // Phase options for the filter
  const phaseOptions = useMemo(() => {
    return (roadmap.phases || []).map((p, i) => ({ id: p.id, label: `Phase ${i + 1}: ${p.name}` }));
  }, [roadmap.phases]);

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);

      if (roadmap.projects && roadmap.projects.length > 0) {
        setProjects(roadmap.projects);
        setLoading(false);
        return;
      }

      try {
        const body = {
          goal: roadmap.goal,
          phases: roadmap.phases?.map((ph: any) => ({
            id: ph.id,
            name: ph.name,
            skillsCovered: ph.skillsCovered || []
          })) || []
        };
        const res = await fetch('/api/generate-projects', {
          method: 'POST',
          headers: getAuthHeaders ? await getAuthHeaders() : { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.projects && data.projects.length > 0) {
            setProjects(data.projects as ProjectTrack[]);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) { console.warn('[ProjectsTab] /api/generate-projects failed, falling back to seed data:', e); }
      }

      setIsUsingFallback(true);
      const updatedProjects = roadmap.projects || [];
      setProjects(updatedProjects.sort((a, b) => a.title.localeCompare(b.title)));
      setLoading(false);
    }
    loadProjects();
  }, [roadmap.id, roadmap, getAuthHeaders]);

  const handleUpdateProgress = async (id: string, newProgress: number) => {
    const prevProj = projects.find(p => p.id === id);
    if (!prevProj) return;

    const prevProgress = prevProj.progress || 0;
    const updatedProjects = projects.map(p => (p.id === id ? { ...p, progress: newProgress } : p));
    setProjects(updatedProjects);
    if (newProgress === 100 && prevProgress < 100) onAddXp(50);
    try {
      await fetch('/api/update-roadmap', {
        method: 'POST',
        headers: getAuthHeaders ? await getAuthHeaders() : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roadmapId: roadmap.id,
          updates: { projects: updatedProjects }
        })
      });
      onRoadmapUpdated?.();
    } catch (e) {
      if (import.meta.env.DEV) { console.warn('[ProjectsTab] Could not persist project progress:', e); }
    }
  };

  const filteredProjects = useMemo(() => {
    return projects
      .filter(p => filterDifficulty === 'all' || p.difficulty === filterDifficulty)
      .filter(p => {
        if (filterPhaseId === 'all') return true;
        const meta = projectPhaseMap.get(p.id);
        return meta ? meta.phaseId === filterPhaseId : true;
      });
  }, [projects, filterDifficulty, filterPhaseId, projectPhaseMap]);

  const handleToggleExpand = (projectId: string) => {
    setExpandedProjectId(prevId => (prevId === projectId ? null : projectId));
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Portfolio Builder</h2>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Transform theory into tangible skills. Build real-world applications, track your progress, and assemble a professional portfolio to showcase your expertise.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <ProjectFilters activeFilter={filterDifficulty} onFilterChange={setFilterDifficulty} />
          {phaseOptions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Layers className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              <button onClick={() => setFilterPhaseId('all')} className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${filterPhaseId === 'all' ? 'bg-violet-600 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>All</button>
              {phaseOptions.map(opt => (
                <button key={opt.id} onClick={() => setFilterPhaseId(opt.id)} className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${filterPhaseId === opt.id ? 'bg-violet-600 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>{opt.label}</button>
              ))}
            </div>
          )}
        </div>
      </header>

      {isUsingFallback && !loading && (
        <p className="text-xs text-zinc-500 -mt-4">
          Showing general project suggestions — personalised AI generation was unavailable.
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} className="h-48" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Code2 className="w-10 h-10 text-zinc-500" />}
          title="No Projects Yet"
          description="Projects will appear here as you progress through your roadmap. Each completed module unlocks hands-on project opportunities."
        />
      ) : (
        <motion.div layout className="space-y-4">
          <AnimatePresence>
            {filteredProjects.map(proj => (
              <motion.div
                key={proj.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <ProjectCard
                  project={proj}
                  onUpdateProgress={handleUpdateProgress}
                  isExpanded={expandedProjectId === proj.id}
                  onToggleExpand={() => handleToggleExpand(proj.id)}
                  phaseLabel={projectPhaseMap.get(proj.id) ? `Phase ${(projectPhaseMap.get(proj.id)!.phaseIndex + 1)}: ${projectPhaseMap.get(proj.id)!.phaseName}` : undefined}
                  isLocked={projectPhaseMap.get(proj.id)?.isLocked ?? false}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
