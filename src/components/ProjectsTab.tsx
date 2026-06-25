import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectTrack, Roadmap } from '../types';
import ProjectCard from './ProjectCard';
import ProjectFilters from './ProjectFilters';

interface ProjectsTabProps {
  roadmap: Roadmap;
  onAddXp: (amount: number) => void;
}

export function ProjectsTab({ roadmap, onAddXp }: ProjectsTabProps) {
  const [projects, setProjects] = useState<ProjectTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

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
          headers: { 'Content-Type': 'application/json' },
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
        console.warn('[ProjectsTab] /api/generate-projects failed, falling back to seed data:', e);
      }

      const updatedProjects = roadmap.projects || [];
      setProjects(updatedProjects.sort((a, b) => a.title.localeCompare(b.title)));
      setLoading(false);
    }
    loadProjects();
  }, [roadmap.id, roadmap]);

  const handleUpdateProgress = async (id: string, newProgress: number) => {
    const prevProj = projects.find(p => p.id === id);
    if (!prevProj) return;

    const prevProgress = prevProj.progress || 0;
    const isRoadmapProject = (roadmap.projects || []).some((p: any) => p.id === id);

    if (isRoadmapProject) {
      const updatedProjects = projects.map(p => (p.id === id ? { ...p, progress: newProgress } : p));
      setProjects(updatedProjects);
      if (newProgress === 100 && prevProgress < 100) onAddXp(50);
      try {
        await fetch('/api/update-roadmap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roadmapId: roadmap.id,
            updates: { projects: updatedProjects }
          })
        });
      } catch (e) {
        console.warn('[ProjectsTab] Could not persist project progress:', e);
      }
      return;
    }

    const updatedProjects = projects.map(p => (p.id === id ? { ...p, progress: newProgress } : p));
    setProjects(updatedProjects);
    if (newProgress === 100 && prevProgress < 100) onAddXp(50);
    try {
      await fetch('/api/update-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roadmapId: roadmap.id,
          updates: { projects: updatedProjects }
        })
      });
    } catch (e) {
      console.warn('[ProjectsTab] Could not persist project progress:', e);
    }
  };

  const filteredProjects = useMemo(() => {
    if (filterDifficulty === 'all') return projects;
    return projects.filter(p => p.difficulty === filterDifficulty);
  }, [projects, filterDifficulty]);

  const handleToggleExpand = (projectId: string) => {
    setExpandedProjectId(prevId => (prevId === projectId ? null : projectId));
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Portfolio Builder</h2>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Transform theory into tangible skills. Build real-world applications, track your progress, and assemble a professional portfolio to showcase your expertise.
          </p>
        </div>
        <ProjectFilters activeFilter={filterDifficulty} onFilterChange={setFilterDifficulty} />
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
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
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}