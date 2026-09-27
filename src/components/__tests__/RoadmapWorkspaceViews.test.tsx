// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Roadmap } from '../../types';
import { RoadmapWorkspaceViews } from '../roadmap/RoadmapWorkspaceViews';

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, onNodeClick, children }: {
    nodes: Array<{ id: string; data: { label: string } }>;
    onNodeClick?: (event: unknown, node: { id: string; data: { label: string } }) => void;
    children?: ReactNode;
  }) => <div data-testid="react-flow">{nodes.map(node => <button key={node.id} type="button" onClick={event => onNodeClick?.(event, node)}>{node.data.label}</button>)}{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}));

vi.mock('@dnd-kit/core', () => ({
  closestCorners: vi.fn(),
  DndContext: ({ children, onDragStart, onDragEnd }: { children: ReactNode; onDragStart: (event: { active: { id: string } }) => void; onDragEnd: (event: { active: { id: string }; over: { id: string } }) => void }) => <div>
    <button type="button" data-testid="simulate-kanban-drop" onClick={() => { onDragStart({ active: { id: 'todo' } }); onDragEnd({ active: { id: 'todo' }, over: { id: 'active' } }); }}>Simulate Kanban drop</button>
    {children}
  </div>,
  DragOverlay: ({ children }: { children?: ReactNode }) => <>{children}</>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(),
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => undefined, transform: null, transition: undefined, isDragging: false }),
  verticalListSortingStrategy: vi.fn(),
}));

const roadmap: Roadmap = {
  id: 'workspace-roadmap', goal: 'Learn TypeScript', experienceLevel: 'Beginner', weeklyHours: 5,
  preferredStyle: 'Hands-on', progressPercent: 0, totalXp: 0, lessonsCompleted: 0,
  hoursRemaining: 3, createdAt: new Date(0).toISOString(),
  phases: [{ id: 'phase-1', name: 'Foundations', description: '', progress: 0, estimatedHours: 2, skillsCovered: [], xpEarned: 0, status: 'current', levels: [
    { id: 'todo', name: 'Types', type: 'Basics', status: 'current', lessons: [
      { id: 'todo-1', name: 'Strings', type: 'learn', xpReward: 1, status: 'available', content: '' },
    ] },
    { id: 'active', name: 'Functions', type: 'Basics', status: 'current', lessons: [
      { id: 'active-1', name: 'Parameters', type: 'learn', xpReward: 1, status: 'completed', content: '' },
      { id: 'active-2', name: 'Returns', type: 'learn', xpReward: 1, status: 'available', content: '' },
    ] },
    { id: 'done', name: 'Objects', type: 'Basics', status: 'completed', lessons: [
      { id: 'done-1', name: 'Records', type: 'learn', xpReward: 1, status: 'completed', content: '' },
    ] },
  ] }],
};

const renderWorkspace = (onOpenLesson = vi.fn(), onModuleStatusChange = vi.fn().mockResolvedValue(true)) => render(<RoadmapWorkspaceViews
  roadmap={roadmap}
  currentLessonId="active-2"
  onOpenLesson={onOpenLesson}
  onModuleStatusChange={onModuleStatusChange}
/>);

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  storage.clear();
});

describe('RoadmapWorkspaceViews', () => {
  it('keeps the same current lesson and progress available in List, Kanban, and Mind Map', () => {
    const onOpenLesson = vi.fn();
    renderWorkspace(onOpenLesson);

    expect(screen.getByRole('progressbar', { name: 'Foundations progress' })).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: /Expand Functions/ }));
    expect(screen.getAllByRole('button', { name: /Returns/ }).find(button => button.getAttribute('aria-current') === 'step')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
    expect(screen.getByRole('button', { name: /Continue current lesson/ })).toBeInTheDocument();
    expect(screen.getAllByText('Current lesson: Returns').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mind Map' }));
    const functionNodes = screen.getAllByRole('button', { name: /Functions[\s\S]*Current: Returns/ });
    fireEvent.click(functionNodes[0]);
    expect(onOpenLesson).toHaveBeenCalledWith('phase-1', 'active', 'active-2');
  });

  it('persists the selected view by roadmap across workspace remounts', () => {
    const first = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
    expect(localStorage.getItem('learnpath:roadmap-view:workspace-roadmap')).toBe('kanban');
    first.unmount();

    renderWorkspace();
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'true');

    const otherRoadmap = { ...roadmap, id: 'different-workspace-roadmap' };
    render(<RoadmapWorkspaceViews roadmap={otherRoadmap} currentLessonId="active-2" onOpenLesson={vi.fn()} onModuleStatusChange={vi.fn().mockResolvedValue(true)} />);
    expect(screen.getAllByRole('button', { name: 'List' }).at(-1)).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps all three Kanban columns visible and explains empty columns', () => {
    const singleModuleRoadmap = { ...roadmap, phases: [{ ...roadmap.phases[0], levels: [roadmap.phases[0].levels[1]] }] };
    render(<RoadmapWorkspaceViews roadmap={singleModuleRoadmap} currentLessonId="active-2" onOpenLesson={vi.fn()} onModuleStatusChange={vi.fn().mockResolvedValue(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));

    expect(screen.getByRole('region', { name: 'To learn, 0 modules' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Learning now, 1 modules' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mastered, 0 modules' })).toBeInTheDocument();
    expect(screen.getAllByText('No modules here yet')).toHaveLength(2);
  });

  it('sends a cross-column drop through the existing module status callback and persists its local order', async () => {
    const onModuleStatusChange = vi.fn().mockResolvedValue(true);
    renderWorkspace(vi.fn(), onModuleStatusChange);
    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
    fireEvent.click(screen.getByTestId('simulate-kanban-drop'));

    await waitFor(() => expect(onModuleStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'todo' }), 'in_progress'));
    expect(localStorage.getItem('learnpath:roadmap-order:workspace-roadmap')).toContain('todo');
  });

  it('provides a keyboard-accessible lesson list beside the graph', () => {
    const onOpenLesson = vi.fn();
    renderWorkspace(onOpenLesson);
    fireEvent.click(screen.getByRole('button', { name: 'Mind Map' }));
    fireEvent.click(screen.getAllByText('Browse curriculum as a list')[0]);

    const currentLessonLinks = screen.getAllByRole('button', { name: /Returns.*Current lesson/ });
    expect(currentLessonLinks.length).toBeGreaterThan(0);
    fireEvent.click(currentLessonLinks[0]);
    expect(onOpenLesson).toHaveBeenCalledWith('phase-1', 'active', 'active-2');
  });

  it('closes the mobile map with Escape and returns focus to its trigger', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Mind Map' }));
    expect(screen.getByRole('dialog', { name: 'Curriculum map' })).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Curriculum map' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open full-screen Mind Map' })).toHaveFocus());
  });

  it('keeps module arrow navigation, Enter expansion, and Space mastery available', async () => {
    const onModuleStatusChange = vi.fn().mockResolvedValue(true);
    renderWorkspace(vi.fn(), onModuleStatusChange);
    const typesButton = screen.getByRole('button', { name: /Expand Types/ });
    typesButton.focus();
    fireEvent.keyDown(typesButton, { key: 'ArrowDown' });
    const functionsButton = screen.getByRole('button', { name: /Expand Functions/ });
    expect(functionsButton).toHaveFocus();

    fireEvent.keyDown(functionsButton, { key: 'Enter' });
    expect(functionsButton).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(functionsButton, { key: ' ' });
    await waitFor(() => expect(onModuleStatusChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'active' }), 'completed'));
  });

  it('renders a larger curriculum as phase and module nodes without creating lesson nodes', () => {
    const largeRoadmap: Roadmap = {
      ...roadmap,
      id: 'large-roadmap',
      phases: [{ ...roadmap.phases[0], levels: Array.from({ length: 120 }, (_, moduleIndex) => ({
        id: `large-module-${moduleIndex}`,
        name: `Large Module ${moduleIndex + 1}`,
        type: 'Topic',
        status: 'current',
        lessons: Array.from({ length: 6 }, (_, lessonIndex) => ({
          id: `large-lesson-${moduleIndex}-${lessonIndex}`,
          name: `Large lesson ${moduleIndex + 1}-${lessonIndex + 1}`,
          type: 'learn',
          xpReward: 1,
          status: lessonIndex === 0 ? 'completed' as const : 'available' as const,
          content: '',
        })),
      })) }],
    };
    localStorage.setItem('learnpath:roadmap-view:large-roadmap', 'mindmap');
    render(<RoadmapWorkspaceViews roadmap={largeRoadmap} currentLessonId={null} onOpenLesson={vi.fn()} onModuleStatusChange={vi.fn().mockResolvedValue(true)} />);

    const flows = screen.getAllByTestId('react-flow');
    expect(flows).toHaveLength(2);
    expect(within(flows[0]).getAllByRole('button')).toHaveLength(121);
    expect(screen.queryByText('Large lesson 120-6')).not.toBeInTheDocument();
  });
});
