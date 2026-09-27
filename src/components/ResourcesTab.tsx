import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, Video, FileText, Bookmark, ExternalLink, CheckCircle, Search, ChevronDown, Clock, Layers, MessageCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Roadmap, CuratedResource, LEARNING_EVENT } from '../types';
import { getRecommendationsForRoadmap } from '../lib/recommendations';
import { calcPhaseProgress } from '../lib/roadmapUtils';
import { buttonStyles, glassCardClass } from '../styles/theme';
import { LoadingSpinner, SkeletonCard } from './Skeleton';
import { EmptyState } from './EmptyState';

interface ResourcesTabProps {
  roadmap: Roadmap;
  getAuthHeaders?: () => Promise<Record<string, string>>;
  onAskMentor?: (resource: CuratedResource) => void;
}

type FilterType = 'all' | CuratedResource['type'];
type FilterStatus = 'all' | 'completed' | 'unread' | 'saved';

export function ResourcesTab({ roadmap, getAuthHeaders, onAskMentor }: ResourcesTabProps) {
  const [resources, setResources] = useState<CuratedResource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterPhaseId, setFilterPhaseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Build phase option list + detect the active (current) phase
  const phaseOptions = useMemo(() => {
    return (roadmap.phases || []).map((p, i) => ({
      id: p.id,
      label: `Phase ${i + 1}: ${p.name}`,
      isActive: calcPhaseProgress(p) < 100 && (i === 0 || calcPhaseProgress((roadmap.phases || [])[i - 1]) === 100),
    }));
  }, [roadmap.phases]);

  useEffect(() => {
    async function loadResources() {
      setLoading(true);

      let combined: CuratedResource[] = [];

      if (roadmap.resources && roadmap.resources.length > 0) {
        combined = [...roadmap.resources];
      } else {
        const recommendations = getRecommendationsForRoadmap(roadmap);
        combined = [...recommendations];
        setIsUsingFallback(true);
      }
      
      setResources(combined);
      setLoading(false);
    }
    loadResources();
  }, [roadmap.id, roadmap]);

  useEffect(() => {
    async function loadStates() {
      try {
        const res = await fetch('/api/user-resource-states', {
          headers: getAuthHeaders ? await getAuthHeaders() : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setCompletedIds(data.completedIds || []);
          setSavedIds(data.savedIds || []);
        }
      } catch (err) {
        if (import.meta.env.DEV) { console.error('Failed to load resource states:', err); }
      }
    }
    loadStates();
  }, [getAuthHeaders]);

  const persistStates = async (newCompletedIds: string[], newSavedIds: string[]) => {
    try {
      await fetch('/api/user-resource-states', {
        method: 'POST',
        headers: getAuthHeaders ? await getAuthHeaders() : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedIds: newCompletedIds, savedIds: newSavedIds })
      });
    } catch (err) {
      if (import.meta.env.DEV) { console.error('Failed to persist resource states:', err); }
    }
  };

  const toggleCompleted = (id: string) => {
    const newCompleted = completedIds.includes(id) ? completedIds.filter(rId => rId !== id) : [...completedIds, id];
    setCompletedIds(newCompleted);
    persistStates(newCompleted, savedIds);
  };

  const toggleSaved = (id: string) => {
    const newSaved = savedIds.includes(id) ? savedIds.filter(rId => rId !== id) : [...savedIds, id];
    setSavedIds(newSaved);
    persistStates(completedIds, newSaved);
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
      // Phase filter: resources with no phaseId are shown in all views
      .filter(res => filterPhaseId === 'all' || res.phaseId === filterPhaseId || !res.phaseId)
      .filter(res => res.title.toLowerCase().includes(searchTerm.toLowerCase()) || res.description.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [resources, filterType, filterStatus, filterPhaseId, completedIds, savedIds, searchTerm]);

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
        filterPhaseId={filterPhaseId}
        setFilterPhaseId={setFilterPhaseId}
        phaseOptions={phaseOptions}
      />
      {isUsingFallback && !loading && (
        <p className="text-xs text-zinc-500 -mt-2">
          Showing general resource suggestions — personalised AI curation was unavailable.
        </p>
      )}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : <ResourceGrid resources={filteredResources} completedIds={completedIds} savedIds={savedIds} onToggleCompleted={toggleCompleted} onToggleSaved={toggleSaved} getAuthHeaders={getAuthHeaders} onAskMentor={onAskMentor} />}
    </div>
  );
}

const Header = ({ total, goal }: { total: number, goal: string }) => (
  <div className="p-4 sm:p-6 bg-white/5 rounded-2xl border border-white/10 shadow-lg">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-display font-bold text-lg sm:text-xl md:text-2xl bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400 max-w-full overflow-wrap-anywhere">Curated AI Resource Hub</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1 overflow-wrap-anywhere">Deepen your knowledge of {goal} with these vetted materials.</p>
      </div>
      <div className="text-xs sm:text-sm font-bold text-zinc-300 bg-white/5 border border-white/10 rounded-xl px-3 sm:px-4 py-2 flex items-center gap-2 self-start flex-shrink-0">
        <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
        <span className="whitespace-nowrap">{total} Total Resources</span>
      </div>
    </div>
  </div>
);

const FilterControls = ({ searchTerm, setSearchTerm, filterType, setFilterType, filterStatus, setFilterStatus, filterPhaseId, setFilterPhaseId, phaseOptions }: any) => (
  <div className={`p-3 sm:p-4 ${glassCardClass()} space-y-3 sm:space-y-4`}>
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-400" />
      <input
        type="text"
        placeholder="Search resources..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm text-white placeholder-zinc-400 focus:ring-2 focus:ring-blue-400 focus:outline-none"
      />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-400">TYPE</label>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {(['all', 'article', 'video', 'book', 'course', 'paper'] as const).map(type => (
            <button key={type} onClick={() => setFilterType(type)} className={`px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${filterType === type ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-400">STATUS</label>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {(['all', 'unread', 'completed', 'saved'] as const).map(status => (
            <button key={status} onClick={() => setFilterStatus(status)} className={`px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${filterStatus === status ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
    {phaseOptions && phaseOptions.length > 0 && (
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> PHASE
        </label>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button
            onClick={() => setFilterPhaseId('all')}
            className={`px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${filterPhaseId === 'all' ? 'bg-blue-500 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
          >
            All Phases
          </button>
          {phaseOptions.map((opt: any) => (
            <button
              key={opt.id}
              onClick={() => setFilterPhaseId(opt.id)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 text-xs sm:text-sm rounded-lg transition-colors ${filterPhaseId === opt.id ? 'bg-violet-600 text-white font-bold' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
            >
              <span className="truncate max-w-[140px] sm:max-w-none">{opt.label}</span>
              {opt.isActive && <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">Active</span>}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ResourceGrid = ({ resources, completedIds, savedIds, onToggleCompleted, onToggleSaved, getAuthHeaders, onAskMentor }: { resources: any[]; completedIds: any[]; savedIds: any[]; onToggleCompleted: any; onToggleSaved: any; getAuthHeaders?: () => Promise<Record<string, string>>; onAskMentor?: ResourcesTabProps['onAskMentor'] }) => {
  if (resources.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="w-10 h-10 text-zinc-500" />}
        title="No Resources Match Your Filters"
        description="Try adjusting your search or filter criteria to find relevant learning materials."
      />
    );
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {resources.map(res => (
        <ResourceCard key={res.id} resource={res} isCompleted={completedIds.includes(res.id)} isSaved={savedIds.includes(res.id)} onToggleCompleted={onToggleCompleted} onToggleSaved={onToggleSaved} getAuthHeaders={getAuthHeaders} onAskMentor={onAskMentor} />
      ))}
    </div>
  );
};

const resourcePreviewCache = new Map<string, any>();
const resourcePreviewFailureCache = new Set<string>();
function getSafeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}
function formatResourceDuration(resource: any, preview?: any): string | undefined {
  if (resource.duration) return resource.duration;
  const minutes = resource.estimatedMinutes || preview?.estimatedMinutes || resourcePreviewCache.get(resource.url)?.estimatedMinutes;
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`;
  return `${minutes} mins`;
}

const ResourceCard = ({ resource, isCompleted, isSaved, onToggleCompleted, onToggleSaved, getAuthHeaders, onAskMentor }: { resource: any; isCompleted: any; isSaved: any; onToggleCompleted: any; onToggleSaved: any; getAuthHeaders?: () => Promise<Record<string, string>>; onAskMentor?: ResourcesTabProps['onAskMentor'] }) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [preview, setPreview] = React.useState<any>(() => resourcePreviewCache.get(resource.url) || null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewFailed, setPreviewFailed] = React.useState(() => resourcePreviewFailureCache.has(resource.url));
  const [imageFailed, setImageFailed] = React.useState(false);
  const duration = formatResourceDuration(resource, preview);
  React.useEffect(() => {
    if (!resource.url || preview || previewFailed || resourcePreviewFailureCache.has(resource.url)) return;
    let requested = false;
    let cancelled = false;
    const loadPreview = () => {
      if (requested) return;
      requested = true;
      try {
        const url = new URL(resource.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) { resourcePreviewFailureCache.add(resource.url); setPreviewFailed(true); return; }
      } catch { resourcePreviewFailureCache.add(resource.url); setPreviewFailed(true); return; }
      setPreviewLoading(true);
      void (async () => {
        try {
          const headers = getAuthHeaders ? await getAuthHeaders() : {};
          const response = await fetch(`/api/resources/preview?url=${encodeURIComponent(resource.url)}`, { headers });
          if (!response.ok) throw new Error('Preview unavailable');
          const metadata = await response.json();
          resourcePreviewCache.set(resource.url, metadata);
          if (!cancelled) setPreview(metadata);
        } catch {
          resourcePreviewFailureCache.add(resource.url);
          if (!cancelled) setPreviewFailed(true);
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
      })();
    };
    if (typeof IntersectionObserver === 'undefined') {
      loadPreview();
      return () => { cancelled = true; };
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadPreview();
    }, { rootMargin: '200px' });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [resource.url, preview, previewFailed, getAuthHeaders]);
  React.useEffect(() => { setImageFailed(false); }, [preview?.image, resource.image]);
  const resourceTypeLabel = ({ video: 'Video', article: 'Article', book: 'Book', paper: 'Paper', course: 'Course' } as Record<string, string>)[resource.type] || 'Resource';
  const imageUrl = imageFailed ? undefined : getSafeHttpUrl(preview?.image) || getSafeHttpUrl(resource.image);
  const safeResourceUrl = getSafeHttpUrl(resource.url);
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
      ref={cardRef}
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.3 }}
      className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between gap-3 sm:gap-4 bg-white/5 shadow-lg ${isCompleted ? 'border-violet-500/50' : 'border-white/10'}`}
    >
      <div className="space-y-2 sm:space-y-3 min-w-0">
        <div className="h-28 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-100 dark:bg-zinc-800">
          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setImageFailed(true)} /> : <div className="flex h-full items-center justify-center">{getResourceIcon(resource.type)}</div>}
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-300">{getResourceIcon(resource.type)}{resourceTypeLabel}</span>
        <h3 className={`font-bold text-sm sm:text-base leading-tight overflow-wrap-anywhere ${isCompleted ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {preview?.title || resource.title}
        </h3>
        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed overflow-wrap-anywhere">
          {preview?.description || resource.description}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-400 truncate min-w-0">
            {preview?.publisher || resource.source || resource.provider}
          </span>
          {duration && (
            <span className="text-xs text-zinc-400 bg-white/5 px-2 py-1 rounded-full flex-shrink-0 whitespace-nowrap">
              {duration}
            </span>
          )}
        </div>
        {(preview?.author || resource.author) && <p className="text-xs text-zinc-500 dark:text-zinc-300">By {preview?.author || resource.author}</p>}
        {previewLoading && <p className="text-xs text-zinc-500" role="status">Loading resource preview…</p>}
        {previewFailed && <p className="text-xs text-zinc-500" role="status">Preview unavailable. You can still open this resource.</p>}
      </div>
      <div className="flex items-center justify-between border-t border-white/10 pt-3 sm:pt-4 mt-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onToggleCompleted(resource.id)} 
            className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${isCompleted ? 'bg-violet-500/20 text-violet-400' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}
            aria-label={isCompleted ? "Mark as unread" : "Mark as completed"}
            aria-pressed={isCompleted}
          >
            <CheckCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onToggleSaved(resource.id)} 
            className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${isSaved ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}
            aria-label={isSaved ? "Remove from saved" : "Save for later"}
            aria-pressed={isSaved}
          >
            <Bookmark className="w-5 h-5" />
          </button>
        </div>
        {onAskMentor && <button type="button" onClick={() => onAskMentor(resource)} aria-label={`Ask AI Mentor about ${resource.title}`} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"><MessageCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />Ask Mentor</button>}
        {safeResourceUrl ? <a
          href={safeResourceUrl}
          target="_blank" 
          rel="noopener noreferrer" 
          onClick={() => {
            if (!getAuthHeaders) return;
            void getAuthHeaders().then(headers => fetch('/api/learning-events', {
              method: 'POST', headers,
              body: JSON.stringify({ eventType: LEARNING_EVENT.resourceOpened, properties: { resourceId: resource.id } }),
            })).catch(() => undefined);
          }}
          aria-label={`Open ${resource.title} on external site (opens in a new tab)`}
          className="text-xs sm:text-sm font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-all hover:gap-2 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
        >
          <span>↗ Open</span>
          <ExternalLink className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        </a> : <span className="self-center text-xs text-zinc-500">Resource link unavailable</span>}
      </div>
    </motion.div>
  );
};
