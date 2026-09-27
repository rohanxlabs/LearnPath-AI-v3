import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { isTypingTarget } from '../../lib/accessibility/keyboard';
import { Command as CommandIcon, Download, List, Columns3, Map, MessageCircle, CheckCircle2, Play, Search } from 'lucide-react';
import type { Roadmap } from '../../types';
import { flattenRoadmapModules, saveRoadmapViewPreference, type RoadmapViewMode } from '../../lib/roadmap/roadmapView';

interface Props {
  roadmap: Roadmap | null;
  currentLessonId?: string | null;
  onOpenLesson: (roadmapId: string, phaseId: string, moduleId: string, lessonId: string) => void;
  onJumpPhase: (roadmapId: string, phaseId: string) => void;
  onOpenMentor: (moduleId?: string) => void;
  onContinue: () => void;
  onCompleteModule: (moduleId: string) => Promise<void>;
  visible: boolean;
}

export function CommandPalette({ roadmap, currentLessonId, onOpenLesson, onJumpPhase, onOpenMentor, onContinue, onCompleteModule, visible }: Props) {
  const [open, setOpen] = useState(false);
  const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const modules = useMemo(() => roadmap ? flattenRoadmapModules(roadmap, currentLessonId) : [], [roadmap, currentLessonId]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (isTypingTarget(event.target)) return;
      if (!open && document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return;
      if (event.target instanceof Element && event.target.closest('[aria-roledescription*="draggable"], [data-dnd-kit-dragging="true"]')) return;
        event.preventDefault(); setOpen(value => !value);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);
  const switchView = (mode: RoadmapViewMode) => {
    if (!roadmap) return;
    saveRoadmapViewPreference(roadmap.id, mode);
    setOpen(false);
  };
  const download = () => {
    if (!roadmap) return;
    const lines = [`# ${roadmap.goal}`, '', ...(roadmap.phases || []).flatMap((phase, index) => [`## Phase ${index + 1}: ${phase.name}`, ...(phase.levels || []).flatMap(module => [`### ${module.name}`, ...(module.lessons || []).map(lesson => `- [${lesson.status === 'completed' ? 'x' : ' '}] ${lesson.name}`)])])];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${roadmap.goal.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'learning-path'}.md`; link.click(); URL.revokeObjectURL(url);
    setOpen(false);
  };
  const activeModule = modules.find(module => module.level.lessons.some(lesson => lesson.id === currentLessonId)) || modules.find(module => module.status === 'in_progress');

  return <>
    {visible && <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom,0px))] right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-lg hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-purple-500 md:bottom-6 md:right-6 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800" aria-label="Open command palette"><CommandIcon size={16} aria-hidden="true" /> <span>Commands</span><kbd className="hidden rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 sm:inline dark:border-white/20 dark:text-zinc-300">{shortcutLabel}</kbd></button>}
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette" shouldFilter>
      <div className="fixed inset-0 z-[120] flex items-start justify-center bg-zinc-950/55 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/15 dark:bg-zinc-900">
          <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-white/10"><Search size={17} className="text-zinc-500 dark:text-zinc-300" /><Command.Input autoFocus placeholder="Search phases, modules, lessons, or actions…" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-400" /></div>
          <Command.List className="max-h-[65vh] overflow-y-auto p-2 text-sm"><Command.Empty className="px-3 py-8 text-center text-zinc-600 dark:text-zinc-300">No matching commands.</Command.Empty>
            {roadmap && <>
              <Command.Group heading="Actions" className="px-2 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-300 [&_[cmdk-group-heading]]:mb-1">
                <Item value="continue learning resume next lesson" icon={<Play size={16} />} onSelect={() => { onContinue(); setOpen(false); }}>Continue learning</Item>
                {activeModule && <Item value={`mark complete mastered ${activeModule.level.name}`} icon={<CheckCircle2 size={16} />} onSelect={() => { void onCompleteModule(activeModule.id); setOpen(false); }}>Mark {activeModule.level.name} mastered</Item>}
                <Item value="open ai mentor chat" icon={<MessageCircle size={16} />} onSelect={() => { onOpenMentor(activeModule?.id); setOpen(false); }}>Open AI Mentor</Item>
                <Item value="download export my path curriculum" icon={<Download size={16} />} onSelect={download}>Download my path</Item>
                <Item value="switch list view" icon={<List size={16} />} onSelect={() => switchView('list')}>Switch to List</Item>
                <Item value="switch kanban board view" icon={<Columns3 size={16} />} onSelect={() => switchView('kanban')}>Switch to Kanban</Item>
                <Item value="switch mind map flow view" icon={<Map size={16} />} onSelect={() => switchView('mindmap')}>Switch to Mind Map</Item>
              </Command.Group>
              <Command.Group heading="Phases" className="px-2 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-300 [&_[cmdk-group-heading]]:mb-1">
                {roadmap.phases.map((phase, index) => <Item key={phase.id} value={`phase ${index + 1} ${phase.name}`} onSelect={() => { onJumpPhase(roadmap.id, phase.id); setOpen(false); }}>Jump to Phase {index + 1}: {phase.name}</Item>)}
              </Command.Group>
              <Command.Group heading="Modules and lessons" className="px-2 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-300 [&_[cmdk-group-heading]]:mb-1">
                {modules.flatMap(module => [
                  <Item key={`module-${module.id}`} value={`module ${module.phase.name} ${module.level.name}`} onSelect={() => { const first = module.level.lessons.find(lesson => lesson.status !== 'completed') || module.level.lessons[0]; if (first) onOpenLesson(roadmap.id, module.phase.id, module.level.id, first.id); setOpen(false); }}>Open {module.level.name}</Item>,
                  ...module.level.lessons.map(lesson => <Item key={lesson.id} value={`lesson ${module.phase.name} ${module.level.name} ${lesson.name}`} onSelect={() => { onOpenLesson(roadmap.id, module.phase.id, module.level.id, lesson.id); setOpen(false); }}>Open {lesson.name} · {module.level.name}</Item>),
                ])}
              </Command.Group>
            </>}
          </Command.List>
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-[11px] text-zinc-600 dark:border-white/10 dark:text-zinc-300"><span>Navigate with ↑ ↓ and Enter</span><span>Esc to close</span></div>
        </div>
      </div>
    </Command.Dialog>
  </>;
}

function Item({ children, value, icon, onSelect }: { children: ReactNode; value: string; icon?: ReactNode; onSelect: () => void }) {
  return <Command.Item value={value} onSelect={onSelect} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-zinc-800 aria-selected:bg-purple-100 aria-selected:text-purple-950 dark:text-zinc-100 dark:aria-selected:bg-purple-500/20 dark:aria-selected:text-white">{icon && <span aria-hidden="true">{icon}</span>}<span>{children}</span></Command.Item>;
}
