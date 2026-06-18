import React, { useState, useEffect } from 'react';
import { Archive, Award, CheckCircle2, Code2, ExternalLink, Flame, Info, Sparkles, TrendingUp, Trophy, Video, Bookmark, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectTrack, Roadmap } from '../types';
import { supabase } from '../lib/supabase';
import { getProjectRecommendations } from '../lib/recommendations';

interface ProjectsTabProps {
  roadmap: Roadmap;
  onAddXp: (amount: number) => void;
}

export function ProjectsTab({ roadmap, onAddXp }: ProjectsTabProps) {
  const [projects, setProjects] = useState<ProjectTrack[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      const { data, error } = await supabase.from('projects').select('*');
      if (data && !error) {
        setProjects(data as ProjectTrack[]);
      }
      setLoading(false);
    }
    loadProjects();
  }, [roadmap.id]);

  const handleUpdateProgress = async (id: string, newProgress: number) => {
    const prevProj = projects.find(p => p.id === id);
    const prevProgress = prevProj?.progress || 0;

    // Save to virtual database / Supabase
    const { error } = await supabase.from('projects').eq('id', id).update({ progress: newProgress });
    if (!error) {
      setProjects(prev => prev.map(p => p.id === id ? { ...p, progress: newProgress } : p));
      
      // Award XP on project completions!
      if (newProgress === 100 && prevProgress < 100) {
        onAddXp(50);
      }
    }
  };

  const filtered = filterDifficulty === 'all' 
    ? projects 
    : projects.filter(p => p.difficulty === filterDifficulty);

  return (
    <div className="space-y-6 text-white font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-white">Project Sandbox Portfolio</h2>
          <p className="text-xs text-zinc-400">Put theory into action by building vetted core applications. Slider states update and synchronize to your user profile.</p>
        </div>

        {/* Filter Pill List */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl max-w-fit md:self-center">
          {['all', 'beginner', 'intermediate', 'advanced'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterDifficulty(lvl as any)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                filterDifficulty === lvl 
                  ? 'bg-purple-650 bg-purple-600 text-white' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <p className="text-xs text-zinc-500">Loading portfolios...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((proj) => {
            const isCompleted = proj.progress === 100;
            const isStarted = proj.progress > 0;

            const difficultyColors = {
              beginner: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5',
              intermediate: 'border-blue-500/20 text-blue-400 bg-blue-500/5',
              advanced: 'border-purple-500/20 text-purple-400 bg-purple-500/5'
            };

            return (
              <div 
                key={proj.id}
                className={`p-5 bg-zinc-900/60 hover:bg-zinc-900/80 border rounded-2xl transition-all duration-300 space-y-4 flex flex-col justify-between ${
                  isCompleted ? 'border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.05)]' : 'border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase border ${difficultyColors[proj.difficulty]}`}>
                        {proj.difficulty}
                      </span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-purple-400 bg-purple-500/5 px-2 py-0.5 rounded-lg border border-purple-500/20">
                          <CheckCircle2 className="w-3 h-3 text-purple-400" />
                          <span>COMPLETED +50 XP</span>
                        </span>
                      )}
                    </div>
                    
                    <h3 className="font-sans font-extrabold text-xs text-zinc-100">{proj.title}</h3>
                    <p className="text-[11px] text-zinc-400 leading-relaxed font-normal">{proj.description}</p>
                  </div>
                  
                  {proj.githubUrl && (
                    <a 
                      href={proj.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Explore source repository"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Tech Stack Tags map */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {proj.techStack.map(tech => (
                    <span key={tech} className="px-2 py-0.5 bg-white/5 border border-white/5 rounded-lg text-[10px] font-medium text-zinc-400">
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Requirements / Key Features */}
                <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Key Architecture Requirements</span>
                  </span>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-zinc-350 list-inside list-disc">
                    {proj.features.map((feat, fidx) => (
                      <li key={fidx} className="truncate">{feat}</li>
                    ))}
                  </ul>
                </div>

                {/* Highly Recommended Projects Resources / Video Tutorials / Courses */}
                <div className="p-3 bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/10 rounded-2xl space-y-2.5 transition-colors">
                  <span className="text-[9px] font-black uppercase text-purple-300 font-mono tracking-wider block">Bespoke Tech-Stack Reference Materials:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {getProjectRecommendations(proj.techStack, proj.features).map((res) => (
                      <div key={res.id} className="p-2 border border-white/5 bg-zinc-950/45 rounded-xl hover:bg-zinc-950 transition-all flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {res.type === 'video' ? (
                            <Video className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          ) : res.type === 'course' ? (
                            <Bookmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-[10px] text-zinc-200 truncate leading-tight">{res.title}</h4>
                            <p className="text-[8px] text-zinc-400 leading-none mt-0.5 uppercase tracking-wide">{res.provider} • {res.duration || 'Flexible'}</p>
                          </div>
                        </div>
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 px-2 border border-white/10 hover:border-purple-500/30 hover:bg-purple-600 rounded text-[9px] font-bold text-zinc-300 hover:text-white transition-all shrink-0 flex items-center gap-1"
                        >
                          <span>Explore</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress tracker slider container */}
                <div className="border-t border-white/5 pt-4 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                      <span>Track Completion Progress</span>
                    </span>
                    <span className={isCompleted ? 'text-purple-400' : 'text-zinc-200'}>
                      {proj.progress}% finished
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="10"
                      value={proj.progress}
                      onChange={(e) => handleUpdateProgress(proj.id, parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    
                    <button
                      onClick={() => handleUpdateProgress(proj.id, isCompleted ? 0 : 100)}
                      className={`text-[9px] font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider transition-all duration-300 cursor-pointer shrink-0 ${
                        isCompleted 
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20' 
                          : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {isCompleted ? 'Reset Progress' : 'Mark Completed'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
