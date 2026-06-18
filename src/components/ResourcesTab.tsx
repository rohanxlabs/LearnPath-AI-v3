import React, { useEffect, useState } from 'react';
import { BookOpen, Video, FileText, Bookmark, ExternalLink, Calendar, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Roadmap, CuratedResource } from '../types';
import { supabase } from '../lib/supabase';
import { getRecommendationsForRoadmap } from '../lib/recommendations';

interface ResourcesTabProps {
  roadmap: Roadmap;
}

export function ResourcesTab({ roadmap }: ResourcesTabProps) {
  const [resources, setResources] = useState<CuratedResource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [readResourceIds, setReadResourceIds] = useState<string[]>([]);

  useEffect(() => {
    async function loadResources() {
      setLoading(true);
      const { data, error } = await supabase.from('curated_resources').select('*');
      
      // Load bespoke recommendations matched to our active custom/predefined roadmap
      const recommendations = getRecommendationsForRoadmap(roadmap);
      let combined = [...recommendations];
      
      if (data && !error && data.length > 0) {
        const seenIds = new Set(combined.map(r => r.id));
        data.forEach((r: any) => {
          if (!seenIds.has(r.id)) {
            combined.push(r);
          }
        });
      }
      
      setResources(combined);
      setLoading(false);
    }
    loadResources();
  }, [roadmap.id, roadmap]);

  const toggleRead = (id: string) => {
    setReadResourceIds(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="w-4 h-4 text-rose-450 text-red-500" />;
      case 'paper':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'course':
        return <Bookmark className="w-4 h-4 text-amber-500" />;
      default:
        return <BookOpen className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6 text-white font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-white">Curated Resources</h2>
          <p className="text-xs text-zinc-400">Deepen your knowledge of {roadmap.goal} with vetted reference materials mapped to your master path.</p>
        </div>
        <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-1.5 self-start">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>{resources.length} materials loaded</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <p className="text-xs text-zinc-500">Loading learning assets...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roadmap.phases.map((phase, phaseIdx) => {
            // Filter resources for this index or name
            const phaseResources = resources.filter(
              r => r.phaseId === `phase-${phaseIdx}` || r.phaseId === phase.id
            );

            return (
              <div key={phase.id} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-display text-xs font-black text-purple-400">
                    {phaseIdx + 1}
                  </div>
                  <h3 className="font-display font-bold text-sm text-zinc-100">{phase.name}</h3>
                </div>

                {phaseResources.length === 0 ? (
                  <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-xl text-xs text-zinc-500 italic">
                    AI recommendation models are generating bespoke assets for this master phase...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {phaseResources.map((res) => {
                      const isCompleted = readResourceIds.includes(res.id);
                      return (
                        <div 
                          key={res.id}
                          className={`group p-4 bg-zinc-900/60 hover:bg-zinc-900/90 border rounded-2xl transition-all duration-300 flex flex-col justify-between gap-4 ${
                            isCompleted ? 'border-purple-500/30' : 'border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                                {getResourceIcon(res.type)}
                                <span>{res.provider}</span>
                              </span>
                              {res.duration && (
                                <span className="text-[10px] text-zinc-550 text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full">
                                  {res.duration}
                                </span>
                              )}
                            </div>

                            <h4 className={`font-sans font-semibold text-xs leading-relaxed transition-colors ${
                              isCompleted ? 'text-purple-400 line-through' : 'text-zinc-100 group-hover:text-white'
                            }`}>
                              {res.title}
                            </h4>
                            
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                              {res.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                            <button
                              onClick={() => toggleRead(res.id)}
                              className={`text-[10px] font-bold px-3 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                                isCompleted 
                                  ? 'bg-purple-500/10 text-purple-400' 
                                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
                              }`}
                            >
                              <CheckCircle className={`w-3.5 h-3.5 ${isCompleted ? 'fill-purple-400 text-black' : ''}`} />
                              <span>{isCompleted ? 'Completed' : 'Mark Lesson Done'}</span>
                            </button>

                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Explore</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
