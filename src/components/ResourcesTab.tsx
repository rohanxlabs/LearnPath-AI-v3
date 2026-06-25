import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Video, FileText, Bookmark, ExternalLink, CheckCircle, Search, ChevronDown, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { Roadmap, CuratedResource } from '../types';
import { supabase } from '../lib/supabase';
import { getRecommendationsForRoadmap } from '../lib/recommendations';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface ResourcesTabProps {
  roadmap: Roadmap;
}

type FilterType = 'all' | CuratedResource['type'];
type FilterStatus = 'all' | 'completed' | 'unread' | 'saved';

export function ResourcesTab({ roadmap }: ResourcesTabProps) {
  const [resources, setResources] = useState<CuratedResource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [completedIds, setCompletedIds] = useLocalStorage<string[]>('completedResources', []);
  const [savedIds, setSavedIds] = useLocalStorage<string[]>('savedResources', []);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadResources() {
      setLoading(true);
      const { data, error } = await supabase.from('curated_resources').select('*');

      let combined: CuratedResource[] = [];

      if (roadmap.resources && roadmap.resources.length > 0) {
        combined = [...roadmap.resources];
      } else {
        const recommendations = getRecommendationsForRoadmap(roadmap);
        combined = [...recommendations];
        if (data && !error) {
          const seenIds = new Set(combined.map(r => r.id));
          data.forEach((r: any) => {
            if (!seenIds.has(r.id)) {
              combined.push(r);
            }
          });
        }
      }
      
      setResources(combined);
      setLoading(false);
    }
    loadResources();
  }, [roadmap.id, roadmap]);

  const toggleCompleted = (id: string) => {
    setCompletedIds(prev => 
      prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]
    );
  };

  const toggleSaved = (id: string) => {
    setSavedIds(prev => 
      prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]
    );
  };

  const filteredResources = useMemo(() => {
    return resources
      .filter(res => filterType === 'all' || res.type === filterType)
      .filter(res => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'completed') return completedIds.includes(res.id);
        if (filterStatus === 'unread') return !completedIds.includes(res.id);
        if (filterStatus === 'saved') return savedIds.includes(res.id);
        return true;
      })
      .filter(res => res.title.toLowerCase().includes(searchTerm.toLowerCase()) || res.description.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [resources, filterType, filterStatus, completedIds, savedIds, searchTerm]);

  return (
    <div className="space-y-6 font-sans">
      <Header total={resources.length} goal={roadmap.goal} />
      <FilterControls 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterType={filterType}
        setFilterType={setFilterType}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
      />
      {loading ? <LoadingSpinner /> : <ResourceGrid resources={filteredResources} completedIds={completedIds} savedIds={savedIds} onToggleCompleted={toggleCompleted} onToggleSaved={toggleSaved} />}
    </div>
  );
}

const Header = ({ total, goal }: { total: number, goal: string }) => (
  <div className="p-6 bg-white/5 rounded-2xl border border-white/10 shadow-lg">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 className="font-display font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">Curated AI Resource Hub</h2>
        <p className="text-sm text-zinc-400 mt-1">Deepen your knowledge of {goal} with these vetted materials.</p>
      </div>
      <div className="text-sm font-bold text-zinc-300 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-2 self-start">
        <Clock className="w-5 h-5 text-blue-400" />
        <span>{total} Total Resources</span>
      </div>
    </div>
  </div>
);

const FilterControls = ({ searchTerm, setSearchTerm, filterType, setFilterType, filterStatus, setFilterStatus }) => (
  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 shadow-lg space-y-4">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
      <input 
        type="text"
        placeholder="Search resources by keyword..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-400 focus:ring-2 focus:ring-blue-400 focus:outline-none"
      />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-400">TYPE</label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'article', 'video', 'book', 'course', 'paper'] as const).map(type => (
            <button key={type} onClick={() => setFilterType(type)} className={`px-3 py-1 text-sm rounded-lg transition-colors ${filterType === type ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-400">STATUS</label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'unread', 'completed', 'saved'] as const).map(status => (
            <button key={status} onClick={() => setFilterStatus(status)} className={`px-3 py-1 text-sm rounded-lg transition-colors ${filterStatus === status ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ResourceGrid = ({ resources, completedIds, savedIds, onToggleCompleted, onToggleSaved }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {resources.map(res => (
      <ResourceCard key={res.id} resource={res} isCompleted={completedIds.includes(res.id)} isSaved={savedIds.includes(res.id)} onToggleCompleted={onToggleCompleted} onToggleSaved={onToggleSaved} />
    ))}
    {resources.length === 0 && (
      <div className="md:col-span-2 lg:col-span-3 text-center py-12 bg-white/5 rounded-2xl border border-white/10">
        <p className="text-zinc-400">No resources match your current filters.</p>
      </div>
    )}
  </div>
);

const ResourceCard = ({ resource, isCompleted, isSaved, onToggleCompleted, onToggleSaved }) => {
  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4 text-rose-400" />;
      case 'paper': return <FileText className="w-4 h-4 text-blue-400" />;
      case 'course': return <Bookmark className="w-4 h-4 text-amber-400" />;
      default: return <BookOpen className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-4 bg-white/5 shadow-lg ${isCompleted ? 'border-violet-500/50' : 'border-white/10'}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider">
            {getResourceIcon(resource.type)}
            <span>{resource.provider}</span>
          </span>
          {resource.duration && (
            <span className="text-xs text-zinc-400 bg-white/5 px-2 py-1 rounded-full">
              {resource.duration}
            </span>
          )}
        </div>
        <h3 className={`font-bold text-base leading-tight transition-colors text-white ${isCompleted ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {resource.title}
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed">
          {resource.description}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-2">
        <div className="flex items-center gap-2">
          <button onClick={() => onToggleCompleted(resource.id)} className={`p-2 rounded-lg transition-colors ${isCompleted ? 'bg-violet-500/20 text-violet-400' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}>
            <CheckCircle className="w-5 h-5" />
          </button>
          <button onClick={() => onToggleSaved(resource.id)} className={`p-2 rounded-lg transition-colors ${isSaved ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}>
            <Bookmark className="w-5 h-5" />
          </button>
        </div>
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-all hover:gap-2">
          <span>Explore</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  );
};

const LoadingSpinner = () => (
  <div className="py-24 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border border-white/10">
    <div className="w-10 h-10 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
    <p className="text-zinc-400">Loading Learning Assets...</p>
  </div>
);