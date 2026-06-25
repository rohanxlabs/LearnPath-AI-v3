import React, { useState, useEffect, useMemo } from 'react';
import { Award, Brain, CheckCircle, XCircle, Video, Bookmark, BookOpen, ExternalLink, Trophy, Repeat, BarChart2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Roadmap, TopicQuizAttempt } from '../types';
import { supabase } from '../lib/supabase';
import { getQuizRecommendations } from '../lib/recommendations';
import { QUIZ_QUESTIONS } from '../quizData';

interface CachedPhaseQuiz {
  questions: { id: string; question: string; options: string[]; correctIndex: number; explanation: string }[];
  phaseName: string;
  loading: boolean;
  error?: string;
}

interface QuizTabProps {
  roadmap: Roadmap;
  onAddXp: (amount: number) => void;
}

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export function QuizTab({ roadmap, onAddXp }: QuizTabProps) {
  const [quizzes, setQuizzes] = useState<TopicQuizAttempt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [activeQuizSource, setActiveQuizSource] = useState<'seed' | 'ai' | null>(null);
  const [quizResult, setQuizResult] = useState<{ score: number; correct: number; total: number; xp: number } | null>(null);
  const [phaseQuizCache, setPhaseQuizCache] = useState<Record<string, CachedPhaseQuiz>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadQuizAttempts() {
      console.log('[QuizTab] Loading quiz attempts for roadmap:', roadmap.id);
      setLoading(true);
      setLoadError(null);

      let seedAttempts: TopicQuizAttempt[] = [];
      try {
        const { data, error } = await supabase.from('topic_wise_quizzes').select('*');
        if (!cancelled) {
          if (data && !error) {
            console.log('[QuizTab] Loaded quiz attempts:', data);
            seedAttempts = data as TopicQuizAttempt[];
          } else {
            console.log('[QuizTab] No quiz attempts found or error:', error);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('[QuizTab] Failed to load quiz attempts:', e);
          setLoadError(e.message || 'Failed to load quiz attempts.');
        }
      }

      if (!cancelled) {
        const phaseQuizzes: TopicQuizAttempt[] = (roadmap.phases || [])
          .filter((ph: any) => ph.status !== 'locked')
          .map((ph: any) => {
            const attempt = seedAttempts.find(q => q.quizId === ph.id);
            return {
              id: attempt?.id || `phase-quiz-${ph.id}`,
              quizId: ph.id,
              quizName: ph.name,
              score: attempt?.score || 0,
              totalQuestions: attempt?.totalQuestions || 0,
              attemptsCount: attempt?.attemptsCount || 0,
              lastAttemptedAt: attempt?.lastAttemptedAt || ''
            };
          });

        setQuizzes(phaseQuizzes);

        if (roadmap.quizzes && typeof roadmap.quizzes === 'object') {
          const restored: Record<string, CachedPhaseQuiz> = {};
          for (const [phaseId, entry] of Object.entries(roadmap.quizzes)) {
            restored[phaseId] = {
              questions: Array.isArray((entry as any).questions) ? (entry as any).questions : [],
              phaseName: (entry as any).name || phaseId,
              loading: false
            };
          }
          setPhaseQuizCache(restored);
        }
        setLoading(false);
      }
    }
    loadQuizAttempts();
    return () => { cancelled = true; };
  }, [roadmap.id, retryKey]);

  const generatePhaseQuiz = async (phaseId: string, phaseName: string, skillsCovered?: string[]) => {
    const topicName = skillsCovered && skillsCovered.length > 0
      ? `${phaseName}: ${skillsCovered.join(', ')}`
      : phaseName;

    console.log('[QuizTab] Generating quiz for phase:', { phaseId, phaseName, topicName });
    
    setPhaseQuizCache(prev => ({ ...prev, [phaseId]: { questions: [], phaseName, loading: true } }));

    try {
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicName })
      });
      if (res.ok) {
        const questions = await res.json();
        console.log('[QuizTab] Generated quiz questions:', questions.length);
        setPhaseQuizCache(prev => ({ ...prev, [phaseId]: { questions, phaseName, loading: false } }));
        try {
          await fetch('/api/update-roadmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roadmapId: roadmap.id,
              updates: {
                quizzes: {
                  ...(roadmap.quizzes || {}),
                  [phaseId]: { questions, name: phaseName }
                }
              }
            })
          });
          console.log('[QuizTab] Successfully persisted quiz to roadmap');

        } catch (e) {
          console.warn('[QuizTab] Could not persist quiz to roadmap:', e);
        }
        return questions;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.error(`[QuizTab-AI-Fallback] Could not generate quiz for phase "${phaseName}":`, e);
      setPhaseQuizCache(prev => ({
        ...prev,
        [phaseId]: { questions: [], phaseName, loading: false, error: e.message }
      }));
      return [];
    }
  };

  const handlePhaseQuizStart = async (phaseId: string, phaseName: string, skillsCovered?: string[]) => {
    console.log('[QuizTab] Starting phase quiz:', { phaseId, phaseName });
    setQuizResult(null);
    const cached = phaseQuizCache[phaseId];
    if (cached && cached.questions.length > 0) {
      console.log('[QuizTab] Using cached quiz questions');
      setActiveQuizId(phaseId);
      setActiveQuizSource('ai');
    } else if (cached && cached.loading) {
      console.log('[QuizTab] Quiz generation already in progress');
      return;
    } else {
      console.log('[QuizTab] Generating new quiz for phase');
      const questions = await generatePhaseQuiz(phaseId, phaseName, skillsCovered);
      if (questions.length > 0) {
        setActiveQuizId(phaseId);
        setActiveQuizSource('ai');
      }
    }
  };

  const handleQuizComplete = async (quizId: string, score: number, correctCount: number, totalQuestions: number) => {
    const existing = quizzes.find(q => q.quizId === quizId);
    const prevAttempts = existing?.attemptsCount || 0;
    const prevScore = existing?.score || 0;

    let xpEarned = 0;
    if (score === 100 && prevScore < 100) xpEarned = 50;
    else if (score >= 70 && prevScore < 70) xpEarned = 25;
    if (xpEarned > 0) onAddXp(xpEarned);

    const phaseName = phaseQuizCache[quizId]?.phaseName || 'Phase Quiz';
    const updatedAttempt = {
      quizName: phaseName,
      score: Math.max(prevScore, score),
      totalQuestions: totalQuestions,
      attemptsCount: prevAttempts + 1,
      lastAttemptedAt: new Date().toLocaleString()
    };

    await supabase.from('topic_wise_quizzes').upsert({ ...updatedAttempt, quizId });

    const { data } = await supabase.from('topic_wise_quizzes').select('*');
    if (data) setQuizzes(data as TopicQuizAttempt[]);

    setQuizResult({ score, correct: correctCount, total: totalQuestions, xp: xpEarned });
    setActiveQuizId(null);
    setActiveQuizSource(null);
  };

  const handleSeedQuizStart = (quizId: string) => {
    setQuizResult(null);
    const phase = (roadmap.phases || []).find((ph: any) => ph.id === quizId);
    if (phase && phase.status !== 'locked') {
      handlePhaseQuizStart(phase.id, phase.name, phase.skillsCovered);
    } else {
      setActiveQuizId(quizId);
      setActiveQuizSource('seed');
    }
  };

  const handleQuizExit = () => {
    setActiveQuizId(null);
    setActiveQuizSource(null);
  };

  const activeQuestions = useMemo(() => {
    if (!activeQuizId) return [];
    if (activeQuizSource === 'seed') return QUIZ_QUESTIONS[activeQuizId] || [];
    const cached = phaseQuizCache[activeQuizId];
    return cached ? cached.questions : [];
  }, [activeQuizId, activeQuizSource, phaseQuizCache]);

  if (loadError) {
    return (
      <div className="p-4 text-red-500">
        Failed to load quiz data. <button onClick={() => { setLoadError(null); setRetryKey(k => k + 1); }} className="ml-2 underline">Retry</button>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4">Loading quiz...</div>;
  }

  return (
    <div className="space-y-6 font-sans">
      <Header />
      {loadError && (
        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-300">{loadError}</p>
            <button onClick={() => { setLoadError(null); setRetryKey(k => k + 1); }} className="mt-2 text-sm text-red-200 hover:text-red-100 underline">
              Retry
            </button>
          </div>
        </div>
      )}
      <AnimatePresence mode="wait">
        {activeQuizId && activeQuestions.length > 0 ? (
          <motion.div key="quiz-active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ActiveQuiz
              quizId={activeQuizId}
              source={activeQuizSource}
              questions={activeQuestions}
              onComplete={handleQuizComplete}
              onExit={handleQuizExit}
            />
          </motion.div>
        ) : (
          <motion.div key="quiz-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {quizResult && <QuizResultDisplay result={quizResult} onDismiss={() => setQuizResult(null)} />}
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg text-white">Phase Quizzes</h3>
                <p className="text-sm text-zinc-400">Test your knowledge for each phase. AI-generated questions are tailored to your roadmap.</p>
                {quizzes.length > 0 ? (
                  <QuizList quizzes={quizzes} onStartQuiz={handleSeedQuizStart} />
                ) : (
                  <div className="text-center py-8">
                    <p className="text-zinc-500">No phases available</p>
                  </div>
                )}
              </div>
              
              {/* Empty State when no quizzes of any type */}
              {quizzes.length === 0 && !quizResult && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4">
                    <BookOpen className="w-10 h-10 text-zinc-500" />
                  </div>
                  <h3 className="font-bold text-lg text-white">No quizzes available</h3>
                  <p className="text-sm text-zinc-400 max-w-xl">
                    Start by selecting a roadmap phase to generate a personalized quiz, or check back later for assessments.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Header = () => (
  <div className="p-6 bg-white/5 rounded-2xl border border-white/10 shadow-lg">
    <h2 className="font-display font-bold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">Mastery Center</h2>
    <p className="text-sm text-zinc-400 mt-1">Test your knowledge, track your progress, and master new skills.</p>
  </div>
);

const QuizList = ({ quizzes, onStartQuiz }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {quizzes.map(quiz => (
      <QuizCard key={quiz.id} quiz={quiz} onStartQuiz={onStartQuiz} />
    ))}
  </div>
);

const QuizCard = ({ quiz, onStartQuiz }) => (
  <div className="p-5 rounded-2xl border border-white/10 bg-white/5 shadow-lg flex flex-col gap-4">
    <div className="flex-grow space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg text-white">{quiz.quizName}</h3>
          <span className="text-xs text-blue-400 font-bold flex items-center gap-2"><Brain size={14} /> Multiple Choice</span>
        </div>
        {quiz.score > 0 && (
          <div className={`text-sm font-bold px-3 py-1 rounded-full flex items-center gap-2 ${quiz.score >= 70 ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <Trophy size={14} /> {quiz.score}%
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 p-3 rounded-lg border border-white/10">
        <div className="flex items-center gap-2"><BarChart2 size={16} className="text-zinc-400" /><div><div className="text-xs text-zinc-400">Attempts</div><div className="font-bold text-white">{quiz.attemptsCount}</div></div></div>
        <div className="flex items-center gap-2"><Calendar size={16} className="text-zinc-400" /><div><div className="text-xs text-zinc-400">Last Run</div><div className="font-bold text-white text-xs">{quiz.lastAttemptedAt}</div></div></div>
      </div>
      <div className="space-y-2 pt-3 border-t border-white/10">
        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Recommended Prep</h4>
        <div className="space-y-2">
          {getQuizRecommendations(quiz.quizId, quiz.quizName).slice(0, 2).map(res => <PrepResource key={res.id} resource={res} />)}
        </div>
      </div>
    </div>
    <button onClick={() => onStartQuiz(quiz.quizId)} className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 font-bold text-sm rounded-xl flex items-center justify-center gap-2 text-white shadow-[0_4px_15px_rgba(128,90,213,0.2)]">
      <Award size={18} /> {quiz.attemptsCount > 0 ? 'Re-attempt Quiz' : 'Start Assessment'}
    </button>
  </div>
);

const PrepResource = ({ resource }) => {
    const iconMap = { video: <Video size={16} />, course: <Bookmark size={16} />, book: <BookOpen size={16} /> };
    return (
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <div className="text-blue-400">{iconMap[resource.type] || <BookOpen size={16} />}</div>
            <div>
                <div className="text-sm font-semibold text-white">{resource.title}</div>
                <div className="text-xs text-zinc-400">{resource.provider}</div>
            </div>
            <ExternalLink size={16} className="ml-auto text-zinc-400" />
        </a>
    );
};

const ActiveQuiz = ({ quizId, source, questions, onComplete, onExit }: {
  quizId: string;
  source: 'seed' | 'ai';
  questions: Question[];
  onComplete: (quizId: string, score: number, correctCount: number, totalQuestions: number) => void;
  onExit: () => void;
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const correctCount = useMemo(() => Object.values(answers).filter(a => a).length, [answers]);

  const handleSelectOption = (idx) => {
    if (showFeedback) return;
    setSelectedOpt(idx);
  };

  const handleSubmit = () => {
    if (selectedOpt === null) return;
    const isCorrect = selectedOpt === questions[currentIdx].correctIndex;
    setAnswers(prev => ({ ...prev, [currentIdx]: isCorrect }));
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedOpt(null);
      setShowFeedback(false);
    } else {
      const finalScore = Math.round((correctCount / questions.length) * 100);
      onComplete(quizId, finalScore, correctCount, questions.length);
    }
  };

  const currentQ = questions[currentIdx];

  return (
    <div className="p-6 rounded-2xl border border-white/10 bg-white/5 shadow-lg">
      <div className="mb-6">
        <div className="flex justify-between items-center text-sm text-zinc-400 mb-2">
          <span>Question {currentIdx + 1} of {questions.length}</span>
          <span className="font-bold text-green-400">{correctCount} Correct</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2"><div className="bg-gradient-to-r from-violet-500 to-blue-500 h-2 rounded-full" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}></div></div>
      </div>
      
      <AnimatePresence mode="wait">
        <motion.div key={currentIdx} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
          <h3 className="font-bold text-xl text-white">{currentQ.question}</h3>
          <div className="space-y-3">
            {currentQ.options.map((opt, oIdx) => {
              const isSelected = selectedOpt === oIdx;
              const isCorrect = oIdx === currentQ.correctIndex;
              let stateClass = 'border-white/10 bg-white/5 hover:bg-white/10';
              if (showFeedback) {
                if (isCorrect) stateClass = 'border-green-500/50 bg-green-500/10 text-white';
                else if (isSelected) stateClass = 'border-red-500/50 bg-red-500/10';
              } else if (isSelected) {
                stateClass = 'border-blue-500/50 bg-blue-500/10 text-white';
              }
              return (
                <button key={oIdx} onClick={() => handleSelectOption(oIdx)} disabled={showFeedback} className={`w-full text-left p-4 rounded-xl border text-base font-semibold transition-all flex items-center gap-4 ${stateClass}`}>
                  <div className={`w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center font-bold text-sm ${isSelected || (showFeedback && isCorrect) ? 'text-white' : 'text-zinc-400'}`}>
                    {String.fromCharCode(65 + oIdx)}
                  </div>
                  <span>{opt}</span>
                  {showFeedback && isCorrect && <CheckCircle className="ml-auto text-green-400" />}
                  {showFeedback && isSelected && !isCorrect && <XCircle className="ml-auto text-red-400" />}
                </button>
              );
            })}
          </div>
          {showFeedback && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-white/5 border border-white/10 rounded-lg text-zinc-300 text-sm">
              <p className="font-bold text-white mb-1">Explanation</p>
              {currentQ.explanation}
            </motion.div>
          )}
          <div className="flex justify-between items-center pt-4 border-t border-white/10">
            <button onClick={onExit} className="text-sm text-zinc-400 hover:text-white">Exit Quiz</button>
            {showFeedback ? (
              <button onClick={handleNext} className="px-6 py-2 bg-gradient-to-r from-violet-600 to-blue-600 font-bold text-white rounded-lg">{currentIdx === questions.length - 1 ? 'Finish' : 'Next Question'}</button>
            ) : (
              <button onClick={handleSubmit} disabled={selectedOpt === null} className="px-6 py-2 bg-white/10 text-white font-bold rounded-lg disabled:opacity-50">Submit</button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const QuizResultDisplay = ({ result, onDismiss }) => (
  <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="p-6 mb-6 rounded-2xl border border-violet-500/30 bg-violet-500/10 shadow-lg text-center relative">
    <button onClick={onDismiss} className="absolute top-3 right-3 text-zinc-400 hover:text-white"><XCircle size={20} /></button>
    <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4" />
    <h3 className="text-2xl font-bold text-white">Quiz Complete!</h3>
    <p className="text-zinc-300">You scored <span className="font-bold text-white">{result.score}%</span>, answering {result.correct} of {result.total} questions correctly.</p>
    {result.xp > 0 && <p className="mt-2 text-lg font-bold text-green-400">+ {result.xp} XP Earned!</p>}
  </motion.div>
);

const LoadingSpinner = () => (
  <div className="py-24 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-2xl border border-white/10">
    <div className="w-10 h-10 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
    <p className="text-zinc-400">Loading Mastery Center...</p>
  </div>
);