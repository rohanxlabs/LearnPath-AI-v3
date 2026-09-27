import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BookOpen, Check, Circle, Columns3, List, Map as MapIcon, MessageCircle, Play } from 'lucide-react';
import type { Roadmap } from '../../types';
import {
  flattenRoadmapModules, getCurrentOrNextLesson, getKanbanOrderAfterDrop,
  getRoadmapViewPreference, saveRoadmapViewPreference,
  type RoadmapModule, type RoadmapModuleStatus, type RoadmapViewMode,
} from '../../lib/roadmap/roadmapView';
import { calcPhaseProgress, phaseLessonCounts } from '../../lib/roadmapUtils';

interface Props {
  roadmap: Roadmap;
  currentLessonId?: string | null;
  onOpenLesson: (phaseId: string, moduleId: string, lessonId: string) => void;
  onModuleStatusChange: (module: RoadmapModule, status: RoadmapModuleStatus) => Promise<boolean>;
  onOpenMentor?: (module: RoadmapModule) => void;
}

const columns: { id: RoadmapModuleStatus; label: string }[] = [
  { id: 'todo', label: 'To learn' }, { id: 'in_progress', label: 'Learning now' }, { id: 'completed', label: 'Mastered' },
];
type StatusAction = (module: RoadmapModule, status: RoadmapModuleStatus) => Promise<boolean>;

export function RoadmapWorkspaceViews({ roadmap, currentLessonId, onOpenLesson, onModuleStatusChange, onOpenMentor }: Props) {
  const [mode, setMode] = useState<RoadmapViewMode>(() => getRoadmapViewPreference(roadmap.id));
  const [mobileGraphOpen, setMobileGraphOpen] = useState(() => getRoadmapViewPreference(roadmap.id) === 'mindmap');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const mindMapTriggerRef = useRef<HTMLButtonElement>(null);
  const moduleButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const modules = useMemo(() => flattenRoadmapModules(roadmap, currentLessonId), [roadmap, currentLessonId]);
  const modulesByPhase = useMemo(() => {
    const grouped = new Map<string, RoadmapModule[]>();
    modules.forEach(module => {
      const group = grouped.get(module.phase.id) || [];
      group.push(module);
      grouped.set(module.phase.id, group);
    });
    return grouped;
  }, [modules]);

  useEffect(() => {
    setMode(getRoadmapViewPreference(roadmap.id));
    const onPreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ roadmapId: string; mode: RoadmapViewMode }>).detail;
      if (detail?.roadmapId === roadmap.id) { setMode(detail.mode); setMobileGraphOpen(detail.mode === 'mindmap'); }
    };
    window.addEventListener('learnpath:roadmap-view-change', onPreferenceChange);
    return () => window.removeEventListener('learnpath:roadmap-view-change', onPreferenceChange);
  }, [roadmap.id]);
  const selectMode = (next: RoadmapViewMode) => { setMode(next); setMobileGraphOpen(next === 'mindmap'); saveRoadmapViewPreference(roadmap.id, next); };
  useEffect(() => {
    if (mode !== 'mindmap' || mobileGraphOpen) return;
    const frame = requestAnimationFrame(() => mindMapTriggerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode, mobileGraphOpen]);

  const changeStatus = useCallback(async (module: RoadmapModule, status: RoadmapModuleStatus) => {
    if (module.status === status || pending) return false;
    setPending(module.id);
    setNotice('');
    try {
      const saved = await onModuleStatusChange(module, status);
      if (!saved) setNotice(`Could not update ${module.level.name}. Its saved progress has been refreshed.`);
      return saved;
    } catch {
      setNotice(`Could not update ${module.level.name}. Its saved progress has been refreshed.`);
      return false;
    } finally {
      setPending(null);
    }
  }, [onModuleStatusChange, pending]);

  const setFocus = (index: number) => setFocusedIndex(index);
  const labels: Record<RoadmapModuleStatus, string> = { todo: 'To learn', in_progress: 'Learning now', completed: 'Mastered' };
  const icons = { list: List, kanban: Columns3, mindmap: MapIcon };
  const modeNames: Record<RoadmapViewMode, string> = { list: 'List', kanban: 'Kanban', mindmap: 'Mind Map' };

  return <section className="space-y-4" aria-labelledby="roadmap-curriculum-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="roadmap-curriculum-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Curriculum</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Use arrow keys to move through modules, Enter to open, and Space to mark a module mastered.</p>
      </div>
      <div className="inline-flex rounded-xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-zinc-900 p-1" role="group" aria-label="Roadmap view">
        {(['list', 'kanban', 'mindmap'] as RoadmapViewMode[]).map(item => {
          const Icon = icons[item];
          return <button key={item} type="button" aria-pressed={mode === item} title={`${modeNames[item]} view`}
            onClick={() => selectMode(item)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-purple-500 ${mode === item ? 'bg-purple-100 text-purple-900 dark:bg-purple-500/20 dark:text-purple-100' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10'}`}>
            <Icon size={16} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{modeNames[item]}</span>
          </button>;
        })}
      </div>
    </div>
    {notice && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">{notice}</p>}
    <div className="hidden md:block">
    {mode === 'list' && <div className="space-y-5">
      {roadmap.phases.map((phase, phaseIndex) => <section key={phase.id} aria-labelledby={`phase-${phase.id}`}>
        <h3 id={`phase-${phase.id}`} className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100"><span className="grid size-6 place-items-center rounded-full bg-purple-100 text-xs text-purple-900 dark:bg-purple-500/20 dark:text-purple-100">{phaseIndex + 1}</span>{phase.name}</h3>
        {(() => { const counts = phaseLessonCounts(phase); const percentage = calcPhaseProgress(phase); return <div className="mb-3 flex items-center gap-3">
          <div role="progressbar" aria-label={`${phase.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"><div className="h-full rounded-full bg-purple-600" style={{ width: `${percentage}%` }} /></div>
          <span className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-300">{counts.completed}/{counts.total} lessons · {percentage}%</span>
        </div>; })()}
        <div className="space-y-2">{(modulesByPhase.get(phase.id) || []).map(module => <ModuleRow key={module.id} module={module} currentLessonId={currentLessonId} expanded={expanded.has(module.id)} onToggle={() => setExpanded(prev => { const next = new Set(prev); next.has(module.id) ? next.delete(module.id) : next.add(module.id); return next; })} onOpenLesson={onOpenLesson} onMentor={onOpenMentor} onStatus={changeStatus} focused={modules[focusedIndex]?.id === module.id} onFocus={() => setFocus(modules.findIndex(item => item.id === module.id))} onNavigate={direction => { const index = modules.findIndex(item => item.id === module.id); const next = Math.max(0, Math.min(modules.length - 1, index + direction)); moduleButtonRefs.current.get(modules[next]?.id)?.focus(); }} buttonRef={button => { if (button) moduleButtonRefs.current.set(module.id, button); else moduleButtonRefs.current.delete(module.id); }} pending={pending === module.id} />)}</div>
      </section>)}
    </div>}
    {mode === 'kanban' && <Kanban key={roadmap.id} roadmapId={roadmap.id} modules={modules} currentLessonId={currentLessonId} pending={pending} onStatus={changeStatus} onOpenLesson={onOpenLesson} onMentor={onOpenMentor} />}
    {mode === 'mindmap' && <MindMap modules={modules} currentLessonId={currentLessonId} onOpenLesson={onOpenLesson} />}
    </div>
    <div className="md:hidden">
      {mode === 'mindmap' && mobileGraphOpen ? <MobileMindMapOverlay modules={modules} currentLessonId={currentLessonId} onOpenLesson={onOpenLesson} onClose={() => setMobileGraphOpen(false)} /> : <>
        {mode === 'mindmap' && <button ref={mindMapTriggerRef} type="button" onClick={() => setMobileGraphOpen(true)} className="mb-3 min-h-11 w-full rounded-lg border border-purple-300 bg-purple-50 text-sm font-semibold text-purple-900 focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-100">Open full-screen Mind Map</button>}
        <MobileCards modules={modules} currentLessonId={currentLessonId} pending={pending} onStatus={changeStatus} onOpenLesson={onOpenLesson} />
      </>}
    </div>
  </section>;
}

function MobileMindMapOverlay({ modules, currentLessonId, onOpenLesson, onClose }: { modules: RoadmapModule[]; currentLessonId?: string | null; onOpenLesson: Props['onOpenLesson']; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mobile-curriculum-map-title" className="fixed inset-0 z-[100] flex flex-col bg-white pt-safe dark:bg-zinc-950">
    <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-white/10"><h2 id="mobile-curriculum-map-title" className="font-bold text-zinc-900 dark:text-zinc-100">Curriculum map</h2><button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-purple-800 focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-purple-200">Back to cards</button></div>
    <div className="min-h-0 flex-1"><MindMap modules={modules} currentLessonId={currentLessonId} onOpenLesson={onOpenLesson} fullscreen /></div>
  </div>;
}

function MobileCards({ modules, currentLessonId, pending, onStatus, onOpenLesson }: { modules: RoadmapModule[]; currentLessonId?: string | null; pending: string | null; onStatus: StatusAction; onOpenLesson: Props['onOpenLesson'] }) {
  const reducedMotion = useReducedMotion() ?? false;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const focusRefs = useRef(new Map<string, HTMLElement>());
  const focus = modules[focusIndex];
  useEffect(() => {
    const elements = Array.from(focusRefs.current.values());
    if (!elements.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const id = visible?.target.getAttribute('data-module-id');
      const index = modules.findIndex(module => module.id === id);
      if (index >= 0) setFocusIndex(index);
    }, { rootMargin: '-12% 0px -64% 0px', threshold: [0, 0.2, 0.5, 0.8] });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [modules]);
  const complete = async (module: RoadmapModule) => {
    const saved = await onStatus(module, 'completed');
    setAnnouncement(saved ? `${module.level.name} marked mastered` : `Could not mark ${module.level.name} mastered`);
    const next = modules.findIndex(item => item.id === module.id) + 1;
    if (next < modules.length) setFocusIndex(next);
  };
  const swipeEnd = (module: RoadmapModule, offset: number) => {
    if (reducedMotion) return;
    if (offset > 120) void complete(module);
    else if (offset < -120) {
      const next = modules.findIndex(item => item.id === module.id) + 1;
      if (next < modules.length) { setFocusIndex(next); focusRefs.current.get(modules[next].id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  };
  return <div className="space-y-3">
    {focus && <div className="sticky top-14 z-20 -mx-1 rounded-lg border border-purple-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-purple-500/30 dark:bg-zinc-950/95" aria-live="polite"><p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">{focus.phase.name} <span className="text-zinc-500 dark:text-zinc-300">· Currently viewing:</span> {focus.level.name}</p><p className="text-[11px] text-zinc-600 dark:text-zinc-300">{focus.completedLessons}/{focus.level.lessons.length} lessons complete</p></div>}
    <p className="text-xs text-zinc-600 dark:text-zinc-300">Swipe right to complete, left to skip ahead, or use the buttons. Swipes must pass a clear distance threshold.</p>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    {modules.map((module, index) => <MobileSwipeCard key={module.id} module={module} reducedMotion={reducedMotion} onSwipeEnd={offset => swipeEnd(module, offset)} onObserve={element => { if (element) focusRefs.current.set(module.id, element); else focusRefs.current.delete(module.id); }}>
      <div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Module {index + 1} · {module.phase.name}</span><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-800 dark:bg-white/10 dark:text-zinc-100">{labels[module.status]}</span></div>
      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{module.level.name}</h3>
      <p className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><BookOpen size={15} /> {module.completedLessons}/{module.level.lessons.length} lessons <span>·</span> {module.level.type}</p>
      {module.level.lessons.some(lesson => lesson.id === currentLessonId) && <p className="mt-2 text-xs font-semibold text-purple-800 dark:text-purple-200">Current lesson: {module.level.lessons.find(lesson => lesson.id === currentLessonId)?.name}</p>}
      <div id={`mobile-lessons-${module.id}`} hidden={expanded !== module.id} className="mt-3 space-y-1 border-t border-zinc-200 pt-2 dark:border-white/10">{module.level.lessons.map(lesson => { const isCurrent = lesson.id === currentLessonId; return <button key={lesson.id} type="button" aria-current={isCurrent ? 'step' : undefined} onClick={() => onOpenLesson(module.phase.id, module.level.id, lesson.id)} className={`flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-purple-500 ${isCurrent ? 'bg-purple-50 text-purple-950 dark:bg-purple-500/10 dark:text-purple-100' : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/5'}`}>{lesson.name}<span className="ml-auto text-xs text-zinc-600 dark:text-zinc-300">{isCurrent ? 'Current lesson' : lesson.status === 'completed' ? 'Completed' : lesson.status === 'available' ? 'Available' : 'Not started'}</span></button>; })}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setExpanded(expanded === module.id ? null : module.id)} aria-expanded={expanded === module.id} aria-controls={`mobile-lessons-${module.id}`} className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-white/20 dark:text-zinc-100">{expanded === module.id ? 'Hide lessons' : 'View lessons'}</button>
        {module.status !== 'completed' && <button type="button" disabled={pending === module.id} onClick={() => void complete(module)} className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white disabled:opacity-60">{pending === module.id ? 'Saving…' : 'Complete'}</button>}
        {module.status !== 'completed' && getCurrentOrNextLesson(module, currentLessonId) && <button type="button" onClick={() => { const lesson = getCurrentOrNextLesson(module, currentLessonId); if (lesson) onOpenLesson(module.phase.id, module.level.id, lesson.id); }} className="col-span-2 min-h-11 rounded-lg bg-purple-700 px-3 text-sm font-bold text-white">Continue learning</button>}
      </div>
    </MobileSwipeCard>)}
  </div>;
}

function MobileSwipeCard({ module, reducedMotion, onSwipeEnd, onObserve, children }: { module: RoadmapModule; reducedMotion: boolean; onSwipeEnd: (offset: number) => void; onObserve: (element: HTMLElement | null) => void; children: ReactNode }) {
  const x = useMotionValue(0);
  const completeOpacity = useTransform(x, [0, 45, 125], [0, 0.2, 0.9]);
  const skipOpacity = useTransform(x, [0, -45, -125], [0, 0.2, 0.9]);
  return <div ref={onObserve} data-module-id={module.id} className="relative overflow-hidden rounded-2xl bg-purple-100 dark:bg-zinc-800">
    {!reducedMotion && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-xs font-bold text-zinc-700 dark:text-zinc-100"><motion.span style={{ opacity: skipOpacity }}>← Skip</motion.span></div>}
    {!reducedMotion && <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-xs font-bold text-emerald-800 dark:text-emerald-200"><motion.span style={{ opacity: completeOpacity }}>Complete →</motion.span></div>}
    <motion.article style={{ x }} drag={reducedMotion ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.14} onPointerDownCapture={event => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="button"]')) event.stopPropagation();
    }} onDragEnd={(_, info) => onSwipeEnd(info.offset.x)} whileDrag={reducedMotion ? undefined : { rotate: 1, opacity: 0.92 }} className="relative rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">{children}</motion.article>
  </div>;
}

function ModuleRow({ module, currentLessonId, expanded, onToggle, onOpenLesson, onMentor, onStatus, focused, onFocus, buttonRef, pending, onNavigate }: {
  module: RoadmapModule; expanded: boolean; onToggle: () => void;
  currentLessonId?: string | null;
  onOpenLesson: Props['onOpenLesson']; onMentor?: Props['onOpenMentor'];
  onStatus: StatusAction; focused: boolean; onFocus: () => void; buttonRef: (button: HTMLButtonElement | null) => void; pending: boolean;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const lessonsId = `roadmap-lessons-${module.id}`;
  const lessons = module.level.lessons || [];
  const currentLesson = lessons.find(lesson => lesson.id === currentLessonId);
  const Icon = module.status === 'completed' ? Check : module.status === 'in_progress' ? Play : Circle;
  return <article className={`rounded-xl border bg-white dark:bg-zinc-900/70 ${focused ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-zinc-200 dark:border-white/10'}`}>
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <button type="button" ref={buttonRef} data-roadmap-module-toggle="true" onFocus={onFocus} onClick={onToggle} onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); onNavigate(event.key === 'ArrowDown' ? 1 : -1); }
        if (event.key === 'Enter') { event.preventDefault(); if (!expanded) onToggle(); else { const nextLesson = lessons.find(item => item.status !== 'completed'); if (nextLesson) onOpenLesson(module.phase.id, module.level.id, nextLesson.id); else onToggle(); } }
        if (event.key === ' ' && module.status !== 'completed') { event.preventDefault(); void onStatus(module, 'completed'); }
      }} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${module.level.name}; ${labels[module.status]}; ${module.completedLessons} of ${lessons.length} lessons complete${currentLesson ? `; current lesson ${currentLesson.name}` : ''}`} aria-expanded={expanded} aria-controls={lessonsId} className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-lg focus-visible:ring-2 focus-visible:ring-purple-500">
        <Icon size={18} aria-hidden="true" className={module.status === 'completed' ? 'text-emerald-700 dark:text-emerald-300' : module.status === 'in_progress' ? 'text-purple-700 dark:text-purple-300' : 'text-zinc-500 dark:text-zinc-300'} />
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-zinc-900 dark:text-zinc-100">{module.level.name}</span><span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">{labels[module.status]} · {module.completedLessons}/{lessons.length} lessons · {module.level.type}{currentLesson && <span className="font-semibold text-purple-800 dark:text-purple-200"> · Current lesson: {currentLesson.name}</span>}</span></span>
      </button>
      {onMentor && <button type="button" onClick={() => onMentor(module)} aria-label={`Ask AI Mentor about ${module.level.name}`} className="grid size-10 shrink-0 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-zinc-200 dark:hover:bg-white/10"><MessageCircle size={17} aria-hidden="true" /></button>}
      {module.status !== 'completed' && <button type="button" disabled={pending} onClick={() => void onStatus(module, 'completed')} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-60">{pending ? 'Saving…' : 'Mark mastered'}</button>}
    </div>
    <div id={lessonsId} hidden={!expanded} className="space-y-1 border-t border-zinc-200 p-2 dark:border-white/10">{lessons.map((lesson, i) => { const isCurrent = lesson.id === currentLessonId; return <button key={lesson.id} type="button" aria-current={isCurrent ? 'step' : undefined} onClick={() => onOpenLesson(module.phase.id, module.level.id, lesson.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-purple-500 ${isCurrent ? 'border-purple-300 bg-purple-50 dark:border-purple-500/40 dark:bg-purple-500/10' : lesson.status === 'completed' ? 'border-transparent text-zinc-600 dark:text-zinc-300' : 'border-transparent hover:bg-zinc-50 dark:hover:bg-white/5'}`}><span className="w-7 text-xs text-zinc-500 dark:text-zinc-300">{i + 1}</span><span className="flex-1 text-zinc-800 dark:text-zinc-100">{lesson.name}</span>{isCurrent && <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-800 dark:text-purple-200"><Play size={13} aria-hidden="true" />Current lesson</span>}<span className="text-xs text-zinc-600 dark:text-zinc-300">{lesson.status === 'completed' ? 'Completed' : lesson.status === 'available' ? 'Available' : 'Not started'}</span></button>; })}</div>
  </article>;
}
const labels: Record<RoadmapModuleStatus, string> = { todo: 'To learn', in_progress: 'Learning now', completed: 'Mastered' };

function Kanban({ roadmapId, modules, currentLessonId, pending, onStatus, onOpenLesson, onMentor }: {
  roadmapId: string;
  currentLessonId?: string | null;
  modules: RoadmapModule[]; pending: string | null; onStatus: StatusAction; onOpenLesson: Props['onOpenLesson']; onMentor?: Props['onOpenMentor'];
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(`learnpath:roadmap-order:${roadmapId}`) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string'))] : [];
    } catch { return []; }
  });
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, RoadmapModuleStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const displayedModules = useMemo(() => modules.map(module => optimisticStatuses[module.id] ? { ...module, status: optimisticStatuses[module.id] } : module), [modules, optimisticStatuses]);
  const orderedModules = useMemo(() => {
    const orderIndex = new Map(order.map((id, index) => [id, index]));
    return [...displayedModules].sort((a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [displayedModules, order]);
  const persistOrder = (next: string[]) => {
    setOrder(next);
    try { localStorage.setItem(`learnpath:roadmap-order:${roadmapId}`, JSON.stringify(next)); } catch { /* ordering is a local view preference */ }
  };
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const source = orderedModules.find(item => item.id === event.active.id);
    const targetId = String(event.over?.id || '');
    const targetModule = orderedModules.find(item => item.id === targetId);
    const targetStatus = columns.find(column => column.id === targetId)?.id || targetModule?.status;
    if (source && targetModule && source.status === targetModule.status && source.id !== targetModule.id) {
      persistOrder(getKanbanOrderAfterDrop(orderedModules, source.id, source.status, targetModule.id));
      return;
    }
    if (source && targetStatus && source.status !== targetStatus) {
      const previousOrder = order;
      persistOrder(getKanbanOrderAfterDrop(orderedModules, source.id, targetStatus, targetModule?.id));
      setOptimisticStatuses(prev => ({ ...prev, [source.id]: targetStatus }));
      void onStatus(source, targetStatus).then(saved => {
        setOptimisticStatuses(prev => { const next = { ...prev }; delete next[source.id]; return next; });
        if (!saved) persistOrder(previousOrder);
      });
    }
  };
  const activeModule = orderedModules.find(module => module.id === activeId);
  return <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={event => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
    <div className="overflow-x-auto pb-2"><div className="grid min-w-[660px] grid-cols-3 gap-3">{columns.map(column => <KanbanColumn key={column.id} id={column.id} label={column.label} modules={orderedModules.filter(item => item.status === column.id)} pending={pending} onStatus={onStatus} onOpenLesson={onOpenLesson} onMentor={onMentor} currentLessonId={currentLessonId} />)}</div></div>
    <DragOverlay dropAnimation={null}>{activeModule && <article aria-hidden="true" className="max-w-xs rounded-lg border-2 border-purple-500 bg-white p-4 shadow-xl dark:bg-zinc-900"><p className="text-xs text-zinc-600 dark:text-zinc-300">{activeModule.phase.name} · {labels[activeModule.status]}</p><p className="mt-1 font-bold text-zinc-900 dark:text-zinc-100">{activeModule.level.name}</p><p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Release to place this module in another column or reorder it.</p></article>}</DragOverlay>
  </DndContext>;
}

function KanbanColumn({ id, label, modules, pending, onStatus, onOpenLesson, onMentor, currentLessonId }: {
  id: RoadmapModuleStatus; label: string; modules: RoadmapModule[]; pending: string | null;
  currentLessonId?: string | null;
  onStatus: StatusAction; onOpenLesson: Props['onOpenLesson']; onMentor?: Props['onOpenMentor'];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <section ref={setNodeRef} aria-label={`${label}, ${modules.length} modules`} className={`min-h-48 rounded-xl border p-3 transition-colors ${isOver ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300 dark:bg-purple-950/30 dark:ring-purple-700' : 'border-zinc-200 bg-zinc-50/70 dark:border-white/10 dark:bg-white/[0.03]'}`}>
    <h3 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200"><span>{label}</span><span className="rounded-full bg-white px-2 py-0.5 dark:bg-zinc-800">{modules.length}</span></h3>
    <SortableContext items={modules.map(module => module.id)} strategy={verticalListSortingStrategy}>
      <div className="min-h-28 space-y-2">{modules.length ? modules.map(module => <DraggableModule key={module.id} module={module} currentLessonId={currentLessonId} disabled={pending !== null} onOpenLesson={onOpenLesson} onMentor={onMentor} onStatus={onStatus} />) : <p className={`rounded-lg border border-dashed px-3 py-6 text-center text-sm ${isOver ? 'border-purple-400 text-purple-900 dark:text-purple-100' : 'border-zinc-300 text-zinc-600 dark:border-white/15 dark:text-zinc-300'}`}>{isOver ? `Drop here to move to ${label}` : 'No modules here yet'}</p>}</div>
    </SortableContext>
  </section>;
}

function DraggableModule({ module, currentLessonId, disabled, onOpenLesson, onMentor, onStatus }: {
  module: RoadmapModule; disabled: boolean; onOpenLesson: Props['onOpenLesson']; onMentor?: Props['onOpenMentor']; onStatus: StatusAction;
  currentLessonId?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id, disabled });
  const nextLesson = getCurrentOrNextLesson(module, currentLessonId);
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-zinc-900 ${isDragging ? 'opacity-40' : ''}`}>
    <button type="button" data-no-global-shortcuts="true" {...attributes} {...listeners} aria-label={`Drag ${module.level.name}; current status ${labels[module.status]}`} className="w-full cursor-grab touch-none text-left active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-purple-500"><span className="text-xs text-zinc-600 dark:text-zinc-300">Phase {module.phaseIndex + 1} · {module.phase.name}</span><span className="mt-1 block font-semibold text-zinc-900 dark:text-zinc-100">{module.level.name}</span><span className="mt-1 flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300"><BookOpen size={13} aria-hidden="true" /> {module.completedLessons}/{module.level.lessons.length} lessons</span></button>
    <div className="mt-3 flex flex-wrap gap-2">{currentLessonId && module.level.lessons.some(lesson => lesson.id === currentLessonId) && <p className="w-full text-xs font-semibold text-purple-800 dark:text-purple-200">Current lesson: {module.level.lessons.find(lesson => lesson.id === currentLessonId)?.name}</p>}{nextLesson && <button type="button" onClick={() => onOpenLesson(module.phase.id, module.level.id, nextLesson.id)} className="min-h-10 rounded-md bg-purple-700 px-3 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-purple-500">Continue {currentLessonId === nextLesson.id ? 'current lesson' : 'learning'}</button>}{module.status !== 'completed' && <button type="button" disabled={disabled} onClick={() => void onStatus(module, 'completed')} className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 focus-visible:ring-2 focus-visible:ring-purple-500 dark:border-white/20 dark:text-zinc-100">Master</button>}{onMentor && <button type="button" onClick={() => onMentor(module)} aria-label={`Ask AI Mentor about ${module.level.name}`} className="grid size-10 place-items-center rounded-md text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-zinc-200 dark:hover:bg-white/10"><MessageCircle size={16} aria-hidden="true" /></button>}</div>
  </article>;
}

function MindMap({ modules, currentLessonId, onOpenLesson, fullscreen = false }: { modules: RoadmapModule[]; currentLessonId?: string | null; onOpenLesson: Props['onOpenLesson']; fullscreen?: boolean }) {
  const [showAccessibleList, setShowAccessibleList] = useState(false);
  const modulesById = useMemo(() => new Map(modules.map(module => [module.id, module])), [modules]);
  const phaseGroups = useMemo(() => {
    const groups = new Map<string, RoadmapModule[]>();
    modules.forEach(module => {
      const group = groups.get(module.phase.id) || [];
      group.push(module);
      groups.set(module.phase.id, group);
    });
    return [...groups.entries()];
  }, [modules]);
  const nodes = useMemo<Node[]>(() => {
    const columnsPerRow = Math.min(3, Math.max(1, phaseGroups.length));
    const result: Node[] = [];
    let rowTop = 0;
    for (let rowStart = 0; rowStart < phaseGroups.length; rowStart += columnsPerRow) {
      const rowGroups = phaseGroups.slice(rowStart, rowStart + columnsPerRow);
      const rowHeight = Math.max(1, ...rowGroups.map(([, items]) => Math.ceil(items.length / 2))) * 170 + 120;
      rowGroups.forEach(([phaseId, items], columnIndex) => {
        const x = columnIndex * 660;
        const phase = items[0].phase;
        result.push({ id: `phase:${phaseId}`, position: { x, y: rowTop }, data: { label: `Phase ${items[0].phaseIndex + 1}\n${phase.name}` }, style: { whiteSpace: 'pre-line', width: 560, borderRadius: 12, padding: 12, border: '2px solid #7c3aed', background: '#f5f3ff', color: '#18181b', fontWeight: 700 } });
        items.forEach((module, moduleIndex) => {
          const currentLesson = module.level.lessons.find(lesson => lesson.id === currentLessonId);
          result.push({
            id: module.id,
            position: { x: x + (moduleIndex % 2) * 300, y: rowTop + 90 + Math.floor(moduleIndex / 2) * 170 },
            data: { label: `${module.level.name}\n${labels[module.status]} · ${module.completedLessons}/${module.level.lessons.length}${currentLesson ? `\nCurrent: ${currentLesson.name}` : ''}` },
            style: { whiteSpace: 'pre-line', width: 250, borderRadius: 12, padding: 14, border: `${currentLesson ? '3px' : '1px'} solid ${module.status === 'completed' ? '#16a34a' : module.status === 'in_progress' ? '#7c3aed' : '#a1a1aa'}`, background: module.status === 'completed' ? '#f0fdf4' : module.status === 'in_progress' ? '#faf5ff' : '#fff', color: '#18181b', fontWeight: 600 },
          });
        });
      });
      rowTop += rowHeight;
    }
    return result;
  }, [phaseGroups, currentLessonId]);
  const edges = useMemo<Edge[]>(() => {
    const lessonToModule = new Map<string, string>();
    modules.forEach(module => module.level.lessons.forEach(lesson => lessonToModule.set(lesson.id, module.id)));
    const edgesByKey = new Map<string, Edge>();
    phaseGroups.forEach(([phaseId, items]) => {
      items.forEach((module, index) => {
        edgesByKey.set(`phase-${phaseId}-${module.id}`, { id: `phase-${phaseId}-${module.id}`, source: `phase:${phaseId}`, target: module.id, type: 'smoothstep' });
        if (index > 0) {
          const previous = items[index - 1];
          edgesByKey.set(`sequence-${previous.id}-${module.id}`, { id: `sequence-${previous.id}-${module.id}`, source: previous.id, target: module.id, type: 'smoothstep' });
        }
        module.level.lessons.forEach(lesson => (lesson.prerequisites || []).forEach(prerequisite => {
          const source = lessonToModule.get(prerequisite);
          if (source && source !== module.id) {
            const id = `prerequisite-${source}-${module.id}`;
            edgesByKey.set(id, { id, source, target: module.id, label: 'Prerequisite', type: 'smoothstep' });
          }
        }));
      });
    });
    return [...edgesByKey.values()];
  }, [modules, phaseGroups]);
  const onNodeClick = useCallback((_: unknown, node: Node) => {
    const module = modulesById.get(node.id);
    const lesson = module && (getCurrentOrNextLesson(module, currentLessonId) || module.level.lessons[0]);
    if (module && lesson) onOpenLesson(module.phase.id, module.level.id, lesson.id);
  }, [modulesById, currentLessonId, onOpenLesson]);
  return <>
    <details onToggle={event => setShowAccessibleList(event.currentTarget.open)} className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900">
      <summary onClick={() => setShowAccessibleList(open => !open)} className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-purple-500">Browse curriculum as a list</summary>
      {showAccessibleList && <ol className="mt-2 space-y-3 pl-5">
        {modules.map((module, index) => <li key={module.id}>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{index + 1}. {module.phase.name} · {module.level.name} <span className="font-normal text-zinc-600 dark:text-zinc-300">({labels[module.status]}, {module.completedLessons}/{module.level.lessons.length} lessons)</span></p>
          <ul className="mt-1 space-y-1">{module.level.lessons.map(lesson => <li key={lesson.id}><button type="button" aria-current={lesson.id === currentLessonId ? 'step' : undefined} onClick={() => onOpenLesson(module.phase.id, module.level.id, lesson.id)} className="min-h-10 rounded px-2 text-left text-purple-800 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-purple-200">{lesson.name} <span className="text-xs text-zinc-600 dark:text-zinc-300">· {lesson.id === currentLessonId ? 'Current lesson' : lesson.status === 'completed' ? 'Completed' : lesson.status === 'available' ? 'Available' : 'Not started'}</span></button></li>)}</ul>
        </li>)}
      </ol>}
    </details>
    {modules.length ? <div className={`${fullscreen ? 'h-[calc(100%-3rem)]' : 'h-[min(65vh,680px)] min-h-[420px] rounded-xl border border-zinc-200 dark:border-white/10'} overflow-hidden bg-white dark:bg-zinc-950`} role="region" aria-label="Curriculum flow map. Use the controls to zoom and fit the graph."><ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.05} maxZoom={1.5} nodesConnectable={false} nodesDraggable={false}><Background gap={24} size={1} /><Controls /><MiniMap pannable zoomable /></ReactFlow></div> : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300" role="status">This roadmap has no modules yet.</div>}
  </>;
}
