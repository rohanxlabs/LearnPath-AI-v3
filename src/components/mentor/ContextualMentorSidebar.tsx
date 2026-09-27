import { lazy, Suspense, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { ChatMessage, MentorRoadmapContext } from '../../types';
const MentorChatView = lazy(() => import('../MentorChatView').then(m => ({ default: m.MentorChatView })));

interface Props {
  open: boolean;
  context: MentorRoadmapContext | null;
  chats: ChatMessage[];
  isGenerating: boolean;
  aiActive: boolean;
  roadmapGoal?: string;
  onSendMessage: (text: string) => Promise<void>;
  onClose: () => void;
}

export function ContextualMentorSidebar({ open, context, chats, isGenerating, aiActive, roadmapGoal, onSendMessage, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, open);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex justify-end bg-zinc-950/40" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="context-mentor-title" className="flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl dark:bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <h2 id="context-mentor-title" className="font-bold text-zinc-900 dark:text-zinc-100">AI Mentor</h2>
          {context?.module ? <div className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
            {context.phase && <p className="truncate"><span className="font-semibold">Phase</span> · {context.phase.name}</p>}
            <p className="truncate"><span className="font-semibold">Module</span> · {context.module.name}</p>
            {context.lesson && <p className="truncate"><span className="font-semibold">Lesson</span> · {context.lesson.name}</p>}
            {context.progress && <p><span className="font-semibold">Progress</span> · {context.progress.completedLessons} / {context.progress.totalLessons} lessons ({context.progress.percentage}%)</p>}
            {context.resources?.[0] && <p className="truncate"><span className="font-semibold">Resource</span> · {context.resources[0].title}</p>}
          </div> : <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">{context?.goal || 'Ask about your learning path'}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close AI Mentor" className="grid size-11 shrink-0 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-zinc-200 dark:hover:bg-white/10"><X size={19} /></button>
      </header>
      <div className="min-h-0 flex-1"><Suspense fallback={<div className="p-6 text-sm text-zinc-600 dark:text-zinc-300">Loading AI Mentor…</div>}><MentorChatView chats={chats} isGenerating={isGenerating} onSendMessage={onSendMessage} onSelectAction={onSendMessage} aiActive={aiActive} roadmapGoal={context?.goal || roadmapGoal} roadmapContext={context || undefined} /></Suspense></div>
    </aside>
  </div>;
}
