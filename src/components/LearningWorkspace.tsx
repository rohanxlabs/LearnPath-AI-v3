import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronRight, CheckCircle2, Play, Code2, Brain, Trophy,
  Target, BookOpen, Zap, Youtube, Library, Rocket, ExternalLink, Github,
  Clock, RefreshCw,
} from 'lucide-react';
import { Roadmap, Lesson } from '../types';

type ContentTab = 'learn' | 'resources' | 'quiz' | 'project';

// ---------------------------------------------------------------------------
// Markdown renderer — light-mode prose
// ---------------------------------------------------------------------------
const markdownComponents = {
  h1: ({ node, ...props }: any) => <h1 className="font-bold text-base text-slate-900 mt-5 mb-2" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="font-bold text-sm text-slate-800 mt-4 mb-1.5" {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="font-semibold text-sm text-slate-700 mt-3 mb-1" {...props} />,
  p:  ({ node, ...props }: any) => <p className="mt-2 text-sm text-slate-600 leading-relaxed" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mt-2 mb-2 text-sm text-slate-600 space-y-1" {...props} />,
  ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mt-2 mb-2 text-sm text-slate-600 space-y-1" {...props} />,
  li: ({ node, ...props }: any) => <li {...props} />,
  strong: ({ node, ...props }: any) => <strong className="text-slate-900 font-semibold" {...props} />,
  code: ({ node, className, children, ...props }: any) => {
    const isBlock = /language-/.test(className || '');
    if (!isBlock) {
      return <code className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 text-xs font-mono border border-violet-100" {...props}>{children}</code>;
    }
    return (
      <pre className="my-3 p-4 rounded-xl bg-slate-50 border border-slate-200 overflow-x-auto text-xs text-slate-700 leading-relaxed">
        <code {...props}>{children}</code>
      </pre>
    );
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LearningWorkspaceProps {
  roadmap: Roadmap;
  activeLesson: { phaseId: string; levelId: string; lessonId: string } | null;
  onCompleteLesson: (xpAdded: number, lessonId: string) => void;
  onNavigateToLesson: (phaseId: string, levelId: string, lessonId: string) => void;
}

// ---------------------------------------------------------------------------
// Section label helper — small-caps divider
// ---------------------------------------------------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
      <span className="flex-1 h-px bg-slate-200" />
      {children}
      <span className="flex-1 h-px bg-slate-200" />
    </p>
  );
}

// ---------------------------------------------------------------------------
// Skeleton that matches real content shape
// ---------------------------------------------------------------------------
function ContentSkeleton() {
  return (
    <div className="p-5 lg:p-7 space-y-8 animate-pulse">
      {/* title block */}
      <div className="space-y-2.5">
        <div className="h-2.5 w-20 bg-violet-200 rounded" />
        <div className="h-6 w-3/4 bg-slate-200 rounded-lg" />
        <div className="h-4 w-1/2 bg-slate-100 rounded" />
        <div className="flex gap-2 mt-1">
          <div className="h-6 w-20 bg-amber-100 rounded-full" />
        </div>
      </div>
      {/* objectives card */}
      <div className="space-y-1.5">
        <div className="h-2 w-32 bg-slate-200 rounded mb-3" />
        <div className="p-4 rounded-xl bg-violet-50 border border-violet-100 space-y-2.5">
          {[75, 60, 85].map((w, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-3.5 h-3.5 rounded-full bg-violet-200 flex-shrink-0 mt-0.5" />
              <div className="h-3 bg-slate-200 rounded" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      {/* video placeholder */}
      <div className="space-y-1.5">
        <div className="h-2 w-16 bg-slate-200 rounded mb-3" />
        <div className="w-full rounded-xl bg-slate-100 border border-slate-200" style={{ paddingBottom: '56.25%' }} />
      </div>
      {/* content lines */}
      <div className="space-y-2">
        <div className="h-2 w-24 bg-slate-200 rounded mb-3" />
        {[100, 92, 78, 96, 65, 88, 55].map((w, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
      {/* summary card */}
      <div className="p-4 rounded-xl bg-violet-50 border border-violet-100 space-y-2">
        <div className="flex gap-2 items-center mb-1">
          <div className="w-3.5 h-3.5 rounded-full bg-violet-200" />
          <div className="h-2.5 w-24 bg-violet-200 rounded" />
        </div>
        {[90, 70, 80].map((w, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
      {/* mark complete button */}
      <div className="pt-4 border-t border-slate-200">
        <div className="h-9 w-44 bg-violet-100 rounded-xl" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const LearningWorkspace: React.FC<LearningWorkspaceProps> = ({
  roadmap,
  activeLesson,
  onCompleteLesson,
  onNavigateToLesson,
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(activeLesson?.lessonId || '');
  const [topicData, setTopicData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [completedInLevel, setCompletedInLevel] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [contentTab, setContentTab] = useState<ContentTab>('learn');

  // Engagement gate: require 30s on page before Mark Complete activates
  const [secondsOnPage, setSecondsOnPage] = useState(0);
  const COMPLETE_GATE_SECONDS = 30;
  const canMarkComplete = secondsOnPage >= COMPLETE_GATE_SECONDS;

  // Content-generating poll: retry up to 3 times every 8s when content is placeholder
  const [contentPollCount, setContentPollCount] = useState(0);
  const MAX_CONTENT_POLLS = 3;

  // Phase accordion — default-expand phase containing active lesson
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => {
    if (activeLesson?.phaseId) return new Set([activeLesson.phaseId]);
    const first = roadmap.phases[0];
    return first ? new Set([first.id]) : new Set<string>();
  });

  // Derived early so useEffect closures can reference it
  const isCompletedForTimer = completedInLevel.includes(selectedTopicId) || topicData?.status === 'completed';

  // Reset tab/quiz state + timer when topic changes
  useEffect(() => {
    setContentTab('learn');
    setQuizScore(null);
    setQuizAnswers({});
    setSecondsOnPage(0);
    setContentPollCount(0);
  }, [selectedTopicId]);

  // Engagement timer: tick every second while a topic is open and not yet completed
  useEffect(() => {
    if (!selectedTopicId || isCompletedForTimer) return;
    const id = setInterval(() => setSecondsOnPage(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [selectedTopicId, isCompletedForTimer]);

  // Auto-poll for content when placeholder is detected (max 3 retries, every 8s)
  useEffect(() => {
    const isPlaceholder = topicData?.content === 'Content is being generated for this topic...' || !topicData?.content;
    if (!topicData || !isPlaceholder || contentPollCount >= MAX_CONTENT_POLLS) return;
    const pollId = setTimeout(async () => {
      setContentPollCount(c => c + 1);
      const res = await fetch(`/api/topics/${topicData.id}`).catch(() => null);
      if (res?.ok) {
        const d = await res.json();
        if (d.topic?.content && d.topic.content !== 'Content is being generated for this topic...') {
          setTopicData(d.topic);
        }
      }
    }, 8_000);
    return () => clearTimeout(pollId);
  }, [topicData, contentPollCount]);

  useEffect(() => {
    if (activeLesson?.lessonId && !selectedTopicId) {
      setSelectedTopicId(activeLesson.lessonId);
    }
  }, [activeLesson, selectedTopicId]);

  useEffect(() => {
    if (!selectedTopicId) return;
    loadTopicData();
  }, [selectedTopicId]);

  // Auto-expand the phase containing the selected topic
  useEffect(() => {
    if (!selectedTopicId) return;
    const phase = roadmap.phases.find(p =>
      p.levels.some(l => l.lessons?.some(les => les.id === selectedTopicId))
    );
    if (phase) setExpandedPhases(prev => new Set([...prev, phase.id]));
  }, [selectedTopicId]);

  const loadTopicData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/topics/${selectedTopicId}`);
      if (res.ok) {
        const data = await res.json();
        setTopicData(data.topic);
      } else {
        // Fallback: build topic from roadmap JSON
        let found: any = null;
        for (const phase of roadmap.phases) {
          for (const level of phase.levels) {
            const lesson = level.lessons?.find(l => l.id === selectedTopicId);
            if (lesson) { found = { ...lesson, phaseId: phase.id, levelId: level.id }; break; }
          }
          if (found) break;
        }
        if (found) {
          setTopicData({
            ...found,
            objectives: [`Understand ${found.name} fundamentals`, 'Apply concepts in practice'],
            summary: '',
            resources: [],
            project: null,
            quiz: null,
            video: {
              videoId: null, title: null,
              searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(found.name + ' tutorial')}`,
            },
          });
        }
      }
    } catch {
      console.warn('[LearningWorkspace] Failed to load topic data');
    } finally {
      setLoading(false);
    }
  };

  const getTopicStatus = (lesson: Lesson) => lesson.status === 'completed' ? 'completed' : 'current';

  const handleTopicClick = (lesson: any) => {
    setSelectedTopicId(lesson.id);
    let phaseId = lesson.phaseId || '';
    let levelId = lesson.levelId || '';
    if (!phaseId) {
      for (const phase of roadmap.phases) {
        for (const level of phase.levels) {
          if (level.lessons?.some(l => l.id === lesson.id)) { phaseId = phase.id; levelId = level.id; break; }
        }
        if (phaseId) break;
      }
    }
    onNavigateToLesson(phaseId, levelId, lesson.id);
  };

  const handleMarkComplete = () => {
    if (!canMarkComplete) return; // engagement gate
    if (topicData && !completedInLevel.includes(topicData.id)) {
      onCompleteLesson(topicData.xpReward || 20, topicData.id);
      setCompletedInLevel(prev => [...prev, topicData.id]);
    }
  };

  // Flat lesson list for prev/next
  const allTopics = roadmap.phases.flatMap(phase =>
    phase.levels.flatMap(level =>
      (level.lessons || []).map(lesson => ({ ...lesson, phaseId: phase.id, levelId: level.id }))
    )
  );

  const progressPercent = allTopics.length > 0
    ? Math.round((allTopics.filter(t => t.status === 'completed').length / allTopics.length) * 100)
    : 0;

  const currentIdx = allTopics.findIndex(t => t.id === selectedTopicId);
  const prevTopic = currentIdx > 0 ? allTopics[currentIdx - 1] : null;
  const nextTopic = currentIdx >= 0 && currentIdx < allTopics.length - 1 ? allTopics[currentIdx + 1] : null;

  const isCompleted = isCompletedForTimer;

  // Derive a display duration for a lesson from XP (every 10 XP ≈ 1 min, min 5 min)
  const lessonDurationLabel = (xpReward: number) => {
    const mins = Math.max(5, Math.round(xpReward / 10) * 5);
    return `${mins} min`;
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-10rem)] bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm">

      {/* ── CENTER PANEL (order-1 mobile = shown first) ── */}
      <div className="w-full lg:flex-1 flex flex-col overflow-hidden order-1 lg:order-2 min-h-0">

        {/* Sticky header: breadcrumb + tabs */}
        <div className="sticky top-0 z-10 flex-shrink-0 px-4 lg:px-5 pt-4 pb-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          {/* breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3 truncate">
            <span className="truncate max-w-[160px]">{roadmap.goal}</span>
            {topicData && (
              <>
                <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
                <span className="text-slate-700 font-medium truncate">{topicData.name}</span>
              </>
            )}
          </div>

          {/* Tab bar — pill container */}
          {(topicData || loading) && (
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5 w-fit mb-3 overflow-x-auto scrollbar-hide">
              {loading ? (
                [64, 80, 48, 60].map((w, i) => (
                  <div key={i} className="h-7 rounded-lg bg-slate-200 animate-pulse flex-shrink-0" style={{ width: w }} />
                ))
              ) : (
                ([
                  { id: 'learn', label: 'Learn', icon: BookOpen },
                  { id: 'resources', label: 'Resources', icon: Library },
                  { id: 'quiz', label: 'Quiz', icon: Zap },
                  { id: 'project', label: 'Project', icon: Rocket },
                ] as { id: ContentTab; label: string; icon: any }[]).map(t => {
                  const Icon = t.icon;
                  const active = contentTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setContentTab(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        active
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto">
              <ContentSkeleton />
            </motion.div>
          ) : topicData ? (
            <motion.div
              key={topicData.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-8"
            >
              {/* ── LEARN TAB ── */}
              {contentTab === 'learn' && (
                <>
                  {/* Lesson title */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-500 mb-1">Current Lesson</p>
                    <h1 className="text-xl font-extrabold text-slate-900 leading-snug">{topicData.name}</h1>
                    {topicData.description && (
                      <p className="text-sm text-slate-500 mt-1 leading-relaxed">{topicData.description}</p>
                    )}

                  {/* "Why this matters" goal connector — surfaces purpose to fight drift */}
                  {roadmap.goal && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-100">
                      <Target className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-violet-700">Why this matters:</span>{' '}
                        {topicData.type === 'quiz'
                          ? `Testing yourself on ${topicData.name} reinforces retention and moves you closer to mastering ${roadmap.goal}.`
                          : topicData.type === 'coding'
                          ? `Building hands-on experience with ${topicData.name} is a direct skill for ${roadmap.goal}.`
                          : topicData.type === 'boss_challenge' || topicData.type === 'challenge'
                          ? `This challenge validates your ${topicData.name} skills — a milestone on the path to ${roadmap.goal}.`
                          : `Understanding ${topicData.name} is a foundational step toward your goal: ${roadmap.goal}.`
                        }
                      </p>
                    </div>
                  )}
                    {/* XP badge inline */}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
                        <Trophy className="w-3 h-3" /> +{topicData.xpReward || 20} XP
                      </span>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Learning Objectives */}
                  {(topicData.objectives || []).length > 0 && (
                    <div>
                      <SectionLabel>Learning Objectives</SectionLabel>
                      <div className="p-4 rounded-xl bg-violet-50 border border-violet-100 space-y-2.5">
                        {(topicData.objectives || []).map((obj: string, i: number) => (
                          <motion.div
                            key={i}
                            className="flex items-start gap-2.5"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07 }}
                          >
                            <Target className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-slate-700 leading-relaxed">{obj}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Video */}
                  {topicData.video && (
                    <div>
                      <SectionLabel>Watch</SectionLabel>
                      {topicData.video.videoId ? (
                        <div className="relative w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200" style={{ paddingBottom: '56.25%', height: 0 }}>
                          <iframe
                            className="absolute inset-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${topicData.video.videoId}`}
                            title={topicData.video.title || topicData.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <a
                          href={topicData.video.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-slate-700 hover:bg-red-100 transition-colors group"
                        >
                          <div className="flex items-center gap-2.5">
                            <Youtube className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span>Find a tutorial for <strong className="text-slate-900">{topicData.name}</strong></span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-red-500 flex-shrink-0 transition-colors" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Topic Content */}
                  <div>
                    <SectionLabel>Content</SectionLabel>
                    {topicData.content && topicData.content !== 'Content is being generated for this topic...' ? (
                      <div className="prose max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {topicData.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-3">
                        {contentPollCount < MAX_CONTENT_POLLS ? (
                          <>
                            <div className="w-7 h-7 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin mx-auto" />
                            <p className="text-sm text-slate-500">Generating lesson content…</p>
                            <p className="text-xs text-slate-400">
                              {contentPollCount === 0 ? 'This usually takes a few seconds.' : `Retry ${contentPollCount}/${MAX_CONTENT_POLLS} — checking again shortly…`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-slate-500">Content couldn't be loaded automatically.</p>
                            <button
                              onClick={() => { setContentPollCount(0); }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Retry
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AI Summary — only when present */}
                  {topicData.summary && (
                    <div>
                      <SectionLabel>AI Summary</SectionLabel>
                      <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-3.5 h-3.5 text-violet-500" />
                          <span className="text-xs font-semibold text-violet-700">Key Takeaways</span>
                        </div>
                        <div className="prose max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {topicData.summary}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coding exercise */}
                  {topicData.type === 'coding' && (
                    <div>
                      <SectionLabel>Coding Exercise</SectionLabel>
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 space-y-3">
                        <div className="flex items-center gap-2">
                          <Code2 className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-slate-800">Hands-on Practice</span>
                        </div>
                        <p className="text-sm text-slate-500">Apply what you've learned in a real coding exercise.</p>
                        <button
                          onClick={handleMarkComplete}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          Mark as Complete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mark Complete CTA */}
                  <div className="pt-6 pb-4 border-t border-slate-200">
                    {isCompleted ? (
                      <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm font-semibold w-fit">
                        <CheckCircle2 className="w-4 h-4" />
                        Lesson Complete · +{topicData.xpReward || 20} XP earned
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={handleMarkComplete}
                          disabled={!canMarkComplete}
                          className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 text-white rounded-xl font-bold text-sm transition-all shadow-[0_4px_12px_rgba(124,58,237,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Mark Lesson Complete
                        </button>
                        {!canMarkComplete && (
                          <span className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Available in {COMPLETE_GATE_SECONDS - secondsOnPage}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── RESOURCES TAB ── */}
              {contentTab === 'resources' && (
                <div>
                  <SectionLabel>Curated Resources</SectionLabel>
                  {(topicData.resources || []).length > 0 ? (
                    <div className="space-y-3">
                      {(topicData.resources || []).map((r: any) => (
                        <a
                          key={r.id}
                          href={r.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-violet-200 hover:shadow-sm transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 group-hover:text-violet-700 transition-colors truncate">{r.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {r.provider ? `${r.provider} · ` : ''}{r.type}{r.duration ? ` · ${r.duration}` : ''}
                            </p>
                            {r.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{r.description}</p>}
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-violet-500 flex-shrink-0 mt-0.5 transition-colors" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 px-6 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                      <Library className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">No resources for this topic yet.</p>
                      <p className="text-xs text-slate-400 mt-1">Check the phase Resources tab for curated materials.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── QUIZ TAB ── */}
              {contentTab === 'quiz' && (
                <div>
                  <SectionLabel>Knowledge Check</SectionLabel>
                  {!topicData.quiz?.questions?.length ? (
                    <div className="text-center py-10 px-6 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                      <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">No quiz for this topic yet.</p>
                      <p className="text-xs text-slate-400 mt-1">Use the phase Quiz tab to take an AI-generated phase quiz.</p>
                    </div>
                  ) : quizScore === null ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 space-y-4">
                      <div className="space-y-3">
                        {topicData.quiz.questions.map((q: any, idx: number) => (
                          <div key={q.id} className="p-3.5 bg-white rounded-xl border border-slate-200">
                            <p className="text-sm text-slate-800 font-medium mb-2.5">{idx + 1}. {q.question}</p>
                            <div className="space-y-1.5">
                              {(q.options || []).map((opt: string, oIdx: number) => (
                                <label key={oIdx} className="flex items-center gap-2.5 text-xs cursor-pointer group">
                                  <input
                                    type="radio"
                                    name={`quiz-${q.id}`}
                                    checked={quizAnswers[q.id] === oIdx}
                                    onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: oIdx })}
                                    className="w-3.5 h-3.5 accent-violet-600"
                                  />
                                  <span className="text-slate-600 group-hover:text-slate-900 transition-colors">{opt}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          const qs = topicData.quiz.questions || [];
                          const correct = qs.filter((q: any) => quizAnswers[q.id] === q.correctIndex).length;
                          setQuizScore(correct);
                          if (correct === qs.length) handleMarkComplete();
                        }}
                        disabled={Object.keys(quizAnswers).length === 0}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
                      >
                        Submit Quiz
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <p className="text-emerald-700 font-bold text-base">
                        Score: {quizScore}/{topicData.quiz.questions.length}
                      </p>
                      {quizScore === topicData.quiz.questions.length ? (
                        <p className="text-sm text-slate-600">Perfect score! Lesson marked complete.</p>
                      ) : (
                        <button
                          onClick={() => { setQuizScore(null); setQuizAnswers({}); }}
                          className="mt-1 px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Try Again
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── PROJECT TAB ── */}
              {contentTab === 'project' && (
                <div>
                  <SectionLabel>Phase Project</SectionLabel>
                  {topicData.project ? (
                    <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-100 space-y-3">
                      <div>
                        <p className="text-base font-bold text-slate-900">{topicData.project.title}</p>
                        <p className="text-xs uppercase tracking-wider text-emerald-600 font-semibold mt-0.5">{topicData.project.difficulty}</p>
                      </div>
                      {topicData.project.description && (
                        <p className="text-sm text-slate-600 leading-relaxed">{topicData.project.description}</p>
                      )}
                      {(topicData.project.techStack || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {topicData.project.techStack.map((t: string) => (
                            <span key={t} className="px-2.5 py-0.5 rounded-full bg-white text-xs text-slate-600 border border-slate-200">{t}</span>
                          ))}
                        </div>
                      )}
                      {topicData.project.githubUrl && (
                        <a href={topicData.project.githubUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors">
                          <Github className="w-3.5 h-3.5" /> View on GitHub
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-10 px-6 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                      <Rocket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">No project for this phase yet.</p>
                      <p className="text-xs text-slate-400 mt-1">View projects in the Phase Detail page.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center justify-center py-16"
            >
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                  <BookOpen className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-500">Select a lesson to begin</p>
                <p className="text-xs text-slate-400">Choose from the sidebar on the left</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Prev / Next footer ── */}
        {selectedTopicId && (prevTopic || nextTopic) && (
          <div className="flex-shrink-0 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 bg-slate-50">
            <button
              onClick={() => prevTopic && handleTopicClick(prevTopic)}
              disabled={!prevTopic || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed transition-all min-w-0"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180 flex-shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-[160px] lg:max-w-xs">{prevTopic?.name || 'Previous'}</span>
            </button>

            <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-mono flex-shrink-0">
              {currentIdx + 1}<span className="text-slate-400">/</span>{allTopics.length}
            </span>

            <button
              onClick={() => nextTopic && handleTopicClick(nextTopic)}
              disabled={!nextTopic || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed transition-all min-w-0"
            >
              <span className="truncate max-w-[120px] sm:max-w-[160px] lg:max-w-xs">{nextTopic?.name || 'Next'}</span>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* ── LEFT SIDEBAR (order-2 mobile) ── */}
      <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col order-2 lg:order-1 max-h-64 lg:max-h-none bg-slate-50">

        {/* Sidebar header */}
        <div className="flex-shrink-0 px-4 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug" title={roadmap.goal}>
            {roadmap.goal}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-bold text-slate-500 flex-shrink-0">{progressPercent}%</span>
          </div>
        </div>

        {/* Phase accordion list */}
        <div className="flex-1 overflow-y-auto py-2">
          {roadmap.phases.map((phase, phaseIdx) => {
            const isExpanded = expandedPhases.has(phase.id);
            const phaseDone = (phase.levels || []).flatMap(l => l.lessons || []).filter(l => l.status === 'completed').length;
            const phaseTotal = (phase.levels || []).flatMap(l => l.lessons || []).length;
            const hasActive = (phase.levels || []).flatMap(l => l.lessons || []).some(l => l.id === selectedTopicId);

            return (
              <div key={phase.id} className={phaseIdx > 0 ? 'mt-1 border-t border-slate-100 pt-1' : ''}>
                {/* Phase toggle */}
                <button
                  onClick={() => setExpandedPhases(prev => {
                    const next = new Set(prev);
                    if (next.has(phase.id)) next.delete(phase.id);
                    else next.add(phase.id);
                    return next;
                  })}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors group ${hasActive ? 'text-violet-700' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-violet-500' : 'text-slate-400'}`} />
                  <span className="text-[11px] font-bold uppercase tracking-wide truncate flex-1 leading-tight">
                    {phase.name}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{phaseDone}/{phaseTotal}</span>
                </button>

                {/* Lessons list */}
                {isExpanded && (
                  <div className="ml-3 space-y-px mb-1">
                    {phase.levels.map(level => (
                      <div key={level.id}>
                        <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
                          {level.name}
                        </div>
                        {(level.lessons || []).map(lesson => {
                          const status = getTopicStatus(lesson);
                          const isActive = selectedTopicId === lesson.id;
                          return (
                            <motion.button
                              key={lesson.id}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleTopicClick({ ...lesson, phaseId: phase.id, levelId: level.id })}
                              className={`w-full flex items-center gap-2 pl-5 pr-3 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-violet-100 border border-violet-200 text-violet-800'
                                  : status === 'completed'
                                  ? 'text-emerald-600 hover:bg-emerald-50'
                                  : 'text-slate-500 hover:bg-white hover:text-slate-800'
                              }`}
                            >
                              {status === 'completed'
                                ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                                : <Play className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-violet-500' : 'text-slate-300'}`} />
                              }
                              <span className="truncate flex-1 leading-snug">{lesson.name}</span>
                              {isActive
                                ? <span className="text-violet-500 text-xs font-bold flex-shrink-0">NOW</span>
                                : status !== 'completed' && (
                                  <span className="text-slate-400 text-[10px] flex-shrink-0 tabular-nums">
                                    {lessonDurationLabel(lesson.xpReward)}
                                  </span>
                                )
                              }
                            </motion.button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT RAIL — progress stats ── */}
      <div className="hidden lg:flex w-56 flex-col border-l border-slate-200 self-start sticky top-0 h-[calc(100vh-10rem)] overflow-y-auto order-3 lg:order-3 bg-slate-50">
        <div className="p-4 space-y-5">

          {/* Overall progress */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Overall Progress</p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500">{allTopics.filter(t => t.status === 'completed').length} done</span>
                <span className="text-sm font-bold text-slate-800">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>

          {/* Current topic */}
          {topicData && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Current Lesson</p>
              <p className="text-sm font-semibold text-slate-800 leading-snug">{topicData.name}</p>
              <div className="flex items-center gap-1.5 text-xs">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-slate-600 font-medium">+{topicData.xpReward || 20} XP</span>
              </div>
              {isCompleted && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                </div>
              )}
            </div>
          )}

          {/* Lessons counter */}
          <div className="pt-4 border-t border-slate-200 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Lessons</p>
            <p className="text-2xl font-extrabold text-slate-800 tabular-nums">
              {allTopics.filter(t => t.status === 'completed').length}
              <span className="text-sm font-normal text-slate-400">/{allTopics.length}</span>
            </p>
          </div>

          {/* Phase indicator */}
          {topicData && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Phases</p>
              <div className="flex flex-wrap gap-1">
                {roadmap.phases.map((phase, i) => {
                  const isDone = (phase.levels || []).flatMap(l => l.lessons || []).every(l => l.status === 'completed');
                  const hasCurrent = (phase.levels || []).flatMap(l => l.lessons || []).some(l => l.id === selectedTopicId);
                  return (
                    <div
                      key={phase.id}
                      title={phase.name}
                      className={`w-5 h-5 rounded-md text-xs font-bold flex items-center justify-center transition-colors ${
                        isDone ? 'bg-emerald-100 text-emerald-600' :
                        hasCurrent ? 'bg-violet-100 text-violet-600 ring-1 ring-violet-300' :
                        'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
