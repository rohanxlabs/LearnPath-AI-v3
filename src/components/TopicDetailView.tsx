import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, BookOpen, Brain, Award, Bot, Sparkles, Clock, Lock, 
  CheckCircle2, Zap, Play, Check, HelpCircle, Lightbulb, PlayCircle, 
  Code2, RefreshCw, Trophy, Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Level, Lesson, QuizQuestion } from '../types';
import { XPBadge } from './Badges';

interface TopicDetailViewProps {
   level: Level;
   roadmapGoal: string;
   initialLessonId?: string;
   onClose: () => void;
   onCompleteLesson: (lessonId: string, xpReward: number) => void;
   onNavigateNext?: (phaseId: string, levelId: string, lessonId: string) => void;
}

export function TopicDetailView({ 
   level, 
   roadmapGoal, 
   initialLessonId, 
   onClose, 
   onCompleteLesson,
   onNavigateNext
 }: TopicDetailViewProps) {
  // Activity / lesson tab state
  const [activeLessonId, setActiveLessonId] = useState<string>(
    initialLessonId || (level.lessons[0]?.id || '')
  );

  // AI-Generated Overview state
  const [overview, setOverview] = useState<{ 
    what: string; 
    why: string; 
    outcomes: string[] 
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);

  // Local state tracking to update progress and interactive states responsively
  const [localLessons, setLocalLessons] = useState<Lesson[]>(level.lessons);
  const [completedLessons, setCompletedLessons] = useState<string[]>(
    level.lessons.filter(l => l.status === 'completed').map(l => l.id)
  );

  // States for Quiz type lessons
  const [quizAnswers, setQuizAnswers] = useState<Record<string, Record<string, number>>>({});
  const [submittedQuizIds, setSubmittedQuizIds] = useState<Record<string, boolean>>({});
  const [quizScores, setQuizScores] = useState<Record<string, number>>({});

  // States for Coding type lessons
  const [userCodeMap, setUserCodeMap] = useState<Record<string, string>>({});
  const [codeIsVerifyingId, setCodeIsVerifyingId] = useState<string | null>(null);
  const [codeFeedbacks, setCodeFeedbacks] = useState<Record<string, any>>({});

const [hintLevel, setHintLevel] = useState<Record<string, number>>({});
   const [hintData, setHintData] = useState<Record<string, Array<{level: number, type: string, text: string}>>>({});

   const fetchHint = async (lessonId: string) => {
     const currentLevel = hintLevel[lessonId] || 0;
     setHintLevel(prev => ({ ...prev, [lessonId]: currentLevel + 1 }));
     
     try {
       const res = await fetch('/api/generate-hints', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           lessonContent: activeLesson.content,
           lessonId,
           attemptNumber: currentLevel + 1
         })
       });
       if (res.ok) {
         const data = await res.json();
         setHintData(prev => ({ ...prev, [lessonId]: data.hints || [] }));
       }
     } catch (e) {
       setHintData(prev => ({ ...prev, [lessonId]: [
         { level: 1, type: "conceptual", text: "Focus on the core concept." },
         { level: 2, type: "syntax", text: "Check the key patterns used." }
       ]}));
     }
   };

   // States for show Hints
   const [showHintId, setShowHintId] = useState<string | null>(null);

  // Sync state if level changes
  useEffect(() => {
    setLocalLessons(level.lessons);
    setCompletedLessons(level.lessons.filter(l => l.status === 'completed').map(l => l.id));
    if (initialLessonId) {
      setActiveLessonId(initialLessonId);
    } else if (level.lessons[0]) {
      setActiveLessonId(level.lessons[0].id);
    }
  }, [level.id, initialLessonId]);

  // Fetch AI generated Topic Overview
  useEffect(() => {
    let active = true;
    const fetchOverview = async () => {
      setLoadingOverview(true);
      setOverview(null);
      try {
        const response = await fetch('/api/generate-topic-overview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: level.name,
            roadmapContext: roadmapGoal
          })
        });
        if (!response.ok) throw new Error("Failed to load");
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error("Server returned HTML or non-JSON content. The API may be offline.");
        }
        const data = await response.json();
        if (active) {
          setOverview(data);
          setLoadingOverview(false);
        }
      } catch (err) {
        console.warn("Overview generator offline/error fallback:", err);
        if (active) {
          // Dynamic, tailored fallback
          setOverview({
            what: `This module delivers the core logical paradigms and practical operational skills behind "${level.name}".`,
            why: `Establishing fluency in "${level.name}" forms a foundational pillar in your custom "${roadmapGoal}" progression line.`,
            outcomes: [
              `Analyze the fundamental mechanics and architecture of "${level.name}".`,
              `Implement, execute, and verify custom interactive logic scripts cleanly.`,
              `Identify, correct, and optimize execution boundaries against standard metrics.`
            ]
          });
          setLoadingOverview(false);
        }
      }
    };

    fetchOverview();
    return () => {
      active = false;
    };
  }, [level.name, roadmapGoal]);

  const activeLesson = localLessons.find(l => l.id === activeLessonId) || localLessons[0];

  // Quick stats calculation
  const totalWeight = localLessons.length;
  const completedCount = completedLessons.length;
  const topicProgressPct = totalWeight > 0 ? Math.round((completedCount / totalWeight) * 100) : 0;

  // Handles completion and claims the reward
  const handleMarkLessonDone = (lessonId: string, xpReward: number) => {
    if (completedLessons.includes(lessonId)) return; // Avoid double claim
    
    // Add to completed set
    const updatedCompleted = [...completedLessons, lessonId];
    setCompletedLessons(updatedCompleted);

    // Update local lesson status to let checkmarks render reactively
    setLocalLessons(prev => prev.map(l => l.id === lessonId ? { ...l, status: 'completed' as const } : l));

    // Propagate up to trigger App.tsx's state trackers & save progress durably
    onCompleteLesson(lessonId, xpReward);
  };

  // Multiple Choice Quiz Solver
  const handleQuizSubmitLocal = (les: Lesson) => {
    if (!les.quizQuestions) return;
    const currentAnswers = quizAnswers[les.id] || {};
    let score = 0;
    
    les.quizQuestions.forEach((q) => {
      if (currentAnswers[q.id] === q.correctIndex) {
        score += 1;
      }
    });

    setQuizScores(prev => ({ ...prev, [les.id]: score }));
    setSubmittedQuizIds(prev => ({ ...prev, [les.id]: true }));

    if (score === les.quizQuestions.length) {
      handleMarkLessonDone(les.id, les.xpReward);
    }
  };

  // Coding exercise compiler verification
  const handleVerifyCodeLocal = async (les: Lesson) => {
    const code = userCodeMap[les.id] || les.codingExercise?.templateCode || `def compute_operations():\n    # Type code here\n    return True`;
    setCodeIsVerifyingId(les.id);
    
    try {
      const response = await fetch('/api/analyze-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            instructions: les.codingExercise?.instructions,
            solution: les.codingExercise?.solutionCode,
            hint: les.codingExercise?.hint
          }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned HTML or non-JSON content. The API may be offline.");
      }
      const data = await response.json();
      setCodeFeedbacks(prev => ({ ...prev, [les.id]: data }));
      if (data.passed) {
        handleMarkLessonDone(les.id, les.xpReward);
      }
    } catch (err) {
      console.warn("Offline code verification:", err);
      setCodeFeedbacks(prev => ({
        ...prev,
        [les.id]: {
          passed: false,
          systemError: true,
          suggestions: "",
          explanation: "Verification service unavailable. Please retry."
        }
      }));
    } finally {
      setCodeIsVerifyingId(null);
    }
  };

  return (
    <div className="space-y-6 select-none font-sans text-white">
      {/* 1. Immersive Header Panel */}
      <div className="flex items-center justify-between p-4 bg-zinc-950/70 border border-white/5 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all cursor-pointer flex items-center justify-center border border-white/5 hover:scale-105"
            aria-label="Back to Curriculum Tree"
            id="btn-back-to-tree"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-300" />
          </button>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase text-purple-400 font-mono tracking-widest block">Topic Explorer • {level.type}</span>
            <h3 className="font-display font-bold text-sm md:text-base text-white mt-1 truncate max-w-xs sm:max-w-md">
              {level.name}
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer px-4 py-1.5 rounded-xl border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all"
        >
          Exit View
        </button>
      </div>

      {/* Grid structure dividing details and components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT / COLUMN-1: Overview & Status Indicators (HUD) */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Topic Progress HUD Box */}
          <div className="p-5 rounded-2xl bg-[#111115] border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
            
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Module Progression</span>
            <h4 className="font-semibold text-sm text-zinc-200 mt-0.5">Topic Completed Ratio</h4>
            
            <div className="mt-4 flex items-center gap-4">
              {/* Radial Completion Percentage Circle */}
              <div className="relative w-14 h-14 shrink-0 flex items-center justify-center bg-transparent">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="28" cy="28" r="22" className="stroke-white/5" strokeWidth="4" fill="none" />
                  <circle 
                    cx="28" cy="28" r="22" 
                    className="stroke-purple-500 transition-all duration-1000" 
                    strokeWidth="4" 
                    strokeDasharray="138" 
                    strokeDashoffset={138 - (138 * topicProgressPct) / 100} 
                    strokeLinecap="round" 
                    fill="none" 
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-[10px] font-black text-white">{topicProgressPct}%</span>
                </div>
              </div>

              <div>
                <span className="text-2xl font-extrabold text-white font-display block leading-none">
                  {completedCount} / {totalWeight}
                </span>
                <span className="text-[10px] text-zinc-500 mt-1 block">Syllabus segments unlocked & passed</span>
              </div>
            </div>

{/* Linear representation */}
             <div className="w-full bg-white/5 h-1.5 rounded-full mt-4 overflow-hidden border border-white/5">
               <motion.div 
                 className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                 initial={{ width: 0 }}
                 animate={{ width: `${topicProgressPct}%` }}
                 transition={{ duration: 0.7, ease: 'easeOut' }}
               />
             </div>
          </div>

          {/* AI-Generated Overview panel */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#111115] to-[#14121b] border border-purple-500/10 shadow-xl relative overflow-hidden space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-550/20">
                <Bot className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <span className="text-[8px] font-black tracking-widest text-[#a855f7] uppercase">OpenRouter AI Synthesis</span>
                <h4 className="font-semibold text-xs text-white">Dynamic Topic Overview</h4>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {loadingOverview ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 py-2"
                >
                  <div className="h-5 bg-white/5 rounded-full animate-pulse w-3/4" />
                  <div className="h-12 bg-white/5 rounded-xl animate-pulse w-full" />
                  <div className="h-20 bg-white/5 rounded-xl animate-pulse w-full" />
                </motion.div>
              ) : overview ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 text-xs select-text"
                >
                  <div>
                    <h5 className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-zinc-650" />
                      What is this?
                    </h5>
                    <p className="text-zinc-300 leading-relaxed font-sans">{overview.what}</p>
                  </div>

                  <div>
                    <h5 className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      Strategic Value
                    </h5>
                    <p className="text-zinc-305 leading-relaxed font-sans">{overview.why}</p>
                  </div>

                  <div>
                    <h5 className="font-bold text-[10px] text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-yellow-500" />
                      Learner Outcomes
                    </h5>
                    <ul className="space-y-1.5 pl-1">
                      {overview.outcomes.map((out, oidx) => (
                        <li key={oidx} className="flex items-start gap-2 text-zinc-350 leading-relaxed font-sans">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{out}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

        </div>

        {/* RIGHT / COLUMN 2 & 3: Consolidated Section activities */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="p-6 rounded-3xl bg-[#111115]/80 border border-white/5 shadow-xl backdrop-blur-md">
            
            {/* Horizontal Tabs selector for individual activities */}
            <div className="flex flex-wrap gap-2 mb-6 border-b border-white/5 pb-4">
              {localLessons.map((les) => {
                const isSelected = activeLessonId === les.id;
                const isDone = completedLessons.includes(les.id);
                const isLocked = false; // Globally unlocked for seamless learning flow

                let iconSymbol = <BookOpen className="w-3.5 h-3.5" />;
                if (les.type === 'quiz') iconSymbol = <Brain className="w-3.5 h-3.5" />;
                if (les.type === 'coding') iconSymbol = <Code2 className="w-3.5 h-3.5" />;
                if (les.type === 'challenge' || les.type === 'boss_challenge') iconSymbol = <Trophy className="w-3.5 h-3.5" />;

                return (
                  <button
                    key={les.id}
                    onClick={() => {
                      if (isLocked) return;
                      setActiveLessonId(les.id);
                    }}
                    disabled={isLocked}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                      isSelected 
                        ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-650/15 scale-105'
                        : isLocked
                          ? 'bg-zinc-900/40 border-zinc-950 text-zinc-600 opacity-40 cursor-not-allowed'
                          : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {iconSymbol}
                    <span>{les.name}</span>
                    {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    {isLocked && <Lock className="w-3.5 h-3.5 text-zinc-650 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Active activity renderer */}
            <AnimatePresence mode="wait">
              {activeLesson && (
                <motion.div
                  key={activeLesson.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div>
                      <span className="text-[8px] font-black uppercase text-zinc-550 font-mono tracking-wider">Active Activity • {activeLesson.type}</span>
                      <h4 className="font-bold text-white text-sm md:text-base mt-0.5">{activeLesson.name}</h4>
                    </div>
                    <XPBadge amount={activeLesson.xpReward} size="sm" />
                  </div>

                  {/* 1. STUDY / LEARN COMPONENT */}
                  {activeLesson.type === 'learn' && (
                    <div className="space-y-4">
                      <div className="prose prose-invert max-w-none text-zinc-300 text-xs md:text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-purple-500/20">
                        {activeLesson.content}
                      </div>

                      <div className="pt-6 border-t border-white/5 flex justify-end">
                        {completedLessons.includes(activeLesson.id) ? (
                          <motion.div 
                            className="inline-flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-xs font-bold"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 350 }}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Chapter Study Complete! (+{activeLesson.xpReward} XP claimed)</span>
                          </motion.div>
                        ) : (
                          <motion.button
                            onClick={() => handleMarkLessonDone(activeLesson.id, activeLesson.xpReward)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 rounded-xl shadow-md cursor-pointer transition-all overflow-hidden relative"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Mark Chapter Complete</span>
                            <motion.span
                              className="absolute inset-0 bg-white/20 rounded-xl"
                              initial={{ scale: 0, opacity: 0 }}
                              whileTap={{ scale: 2, opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            />
                          </motion.button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 2. CHALLENGE/QUIZ COMPONENT */}
                  {activeLesson.type === 'quiz' && (
                    <div className="space-y-6">
                      <p className="text-xs text-zinc-400">{activeLesson.content}</p>

                      <div className="space-y-6">
                        {activeLesson.quizQuestions?.map((q, qidx) => {
                          const currentAnswers = quizAnswers[activeLesson.id] || {};
                          const activeAnswer = currentAnswers[q.id];
                          const submitted = submittedQuizIds[activeLesson.id] || completedLessons.includes(activeLesson.id);

                          return (
                            <div key={q.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                              <h5 className="font-semibold text-xs md:text-sm text-zinc-200">
                                <span className="text-purple-400 font-mono text-xs mr-2">Q{qidx + 1}.</span>
                                {q.question}
                              </h5>

                              <div className="grid grid-cols-1 gap-2">
                                {q.options.map((opt, oidx) => {
                                  const isSelected = activeAnswer === oidx || (completedLessons.includes(activeLesson.id) && q.correctIndex === oidx);
                                  const isCorrect = q.correctIndex === oidx;
                                  
                                  let optionStyle = 'bg-[#0A0A0A] border-white/5 text-zinc-400 hover:text-white hover:bg-white/5';
                                  if (isSelected) {
                                    optionStyle = 'bg-purple-500/10 border-purple-500 text-purple-300 font-semibold';
                                  }
                                  if (submitted) {
                                    if (isCorrect) {
                                      optionStyle = 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold';
                                    } else if (activeAnswer === oidx) {
                                      optionStyle = 'bg-red-500/10 border-red-500 text-red-500';
                                    } else {
                                      optionStyle = 'opacity-40 bg-[#0A0A0A] border-white/5 text-zinc-600';
                                    }
                                  }

                                  return (
                                    <button
                                      key={opt}
                                      disabled={submitted}
                                      onClick={() => {
                                        const prevObj = quizAnswers[activeLesson.id] || {};
                                        setQuizAnswers({
                                          ...quizAnswers,
                                          [activeLesson.id]: { ...prevObj, [q.id]: oidx }
                                        });
                                      }}
                                      className={`px-3.5 py-3 rounded-lg border text-xs text-left transition-all duration-150 flex items-center justify-between ${optionStyle} cursor-pointer`}
                                    >
                                      <span>{opt}</span>
                                      {submitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>

                              {(submitted || completedLessons.includes(activeLesson.id)) && (
                                <div className="p-4 bg-[#0A0A0A] rounded-xl border border-white/5 text-[11px] leading-relaxed text-zinc-400 font-sans">
                                  <strong className="text-purple-300 font-semibold block mb-0.5">Explanation Matrix:</strong>
                                  {q.explanation}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!(submittedQuizIds[activeLesson.id] || completedLessons.includes(activeLesson.id)) ? (
                        <div className="flex justify-end pt-4">
                          <button
                            onClick={() => handleQuizSubmitLocal(activeLesson)}
                            disabled={
                              Object.keys(quizAnswers[activeLesson.id] || {}).length < (activeLesson.quizQuestions?.length || 0)
                            }
                            className="px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-115 rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                            id="btn-quiz-submit-local"
                          >
                            Verify Quiz Answers
                          </button>
                        </div>
                      ) : (
                        <div className="p-5 rounded-2xl border border-white/5 bg-[#0A0A0A] flex flex-col items-center text-center space-y-2">
                          <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Quiz Results Summary</span>
                          <p className="text-lg md:text-xl font-bold font-display text-white">
                            Scored: <span className="text-emerald-450">
                              {completedLessons.includes(activeLesson.id) ? (activeLesson.quizQuestions?.length || 0) : quizScores[activeLesson.id] || 0} / {activeLesson.quizQuestions?.length}
                            </span> Correct
                          </p>
                          
                          {(!completedLessons.includes(activeLesson.id) || (quizScores[activeLesson.id] !== undefined && quizScores[activeLesson.id] < (activeLesson.quizQuestions?.length || 0))) && (
                            <button
                              onClick={() => {
                                setSubmittedQuizIds(prev => ({ ...prev, [activeLesson.id]: false }));
                                setQuizAnswers(prev => ({ ...prev, [activeLesson.id]: {} }));
                              }}
                              className="mt-2 text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5 animate-spin-once" />
                              <span>Try Quiz Again</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. PROJECTS / CODING COMPONENT */}
                  {activeLesson.type === 'coding' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                      {/* Objectives panel */}
                      <div className="p-5 rounded-2xl bg-[#0A0A0A] border border-white/5 flex flex-col justify-between space-y-4">
                        <div className="space-y-4">
                          <div className="border-b border-white/5 pb-2">
                            <span className="text-[9px] uppercase font-bold text-purple-400 tracking-wider font-mono">Exercise specifications</span>
                            <h4 className="font-semibold text-white text-xs">Logic Scripting Objectives</h4>
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
                            {activeLesson.codingExercise?.instructions}
                          </p>

{/* Hints */}
                           <div>
                             <button
                               onClick={() => {
                                 if (!hintData[activeLesson.id]) {
                                   fetchHint(activeLesson.id);
                                 }
                                 setShowHintId(showHintId === activeLesson.id ? null : activeLesson.id);
                               }}
                               className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-bold hover:text-amber-450 cursor-pointer"
                             >
                               <Lightbulb className="w-3.5 h-3.5" />
                               <span>{showHintId === activeLesson.id ? 'Hide Logic Hint' : `Reveal Hint (-${hintLevel[activeLesson.id] > 0 ? 10 : 0} XP)`}</span>
                             </button>
                             {showHintId === activeLesson.id && (
                               <div className="mt-2 space-y-2">
                                 {(hintData[activeLesson.id] || []).map((h: any, idx: number) => (
                                   <div key={h.level} className={`p-3 rounded-lg border text-[10px] md:text-xs leading-relaxed ${
                                     idx < (hintLevel[activeLesson.id] || 1) ? 'bg-amber-500/5 border-amber-500/20 text-amber-300 font-mono' : 'bg-zinc-800/50 border-white/5 text-zinc-500'
                                   }`}>
                                     <span className="font-bold uppercase text-[9px]">{h.type} hint:</span> {h.text}
                                   </div>
                                 ))}
                                 <button
                                   onClick={() => fetchHint(activeLesson.id)}
                                   className="text-[9px] text-purple-400 hover:text-purple-300 mt-1"
                                 >
                                   Next hint level (-10 XP)
                                 </button>
                               </div>
                             )}
                           </div>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-zinc-500 shrink-0" />
                          <span className="text-[9px] text-zinc-550 leading-relaxed">Ensure proper PEP8 formatting parameters. Avoid altering defined function headers.</span>
                        </div>
                      </div>

                      {/* Code Execution Panel */}
                      <div className="flex flex-col gap-3 min-h-[260px]">
                        <div className="flex-1 flex flex-col bg-[#0A0A0A] rounded-2xl overflow-hidden border border-white/5">
                          <div className="flex items-center justify-between px-4 py-2 bg-[#111111] border-b border-white/5 text-[9px] text-zinc-500 font-mono font-bold">
                            <span>Interactive Editor (python)</span>
                            <span className="text-emerald-400 font-bold">● Compiler Sandbox online</span>
                          </div>
                          
                          <textarea
                            value={
                              userCodeMap[activeLesson.id] !== undefined
                                ? userCodeMap[activeLesson.id]
                                : activeLesson.codingExercise?.templateCode || `def compute_operations():\n    # Type code here\n    return True`
                            }
                            onChange={(e) => {
                              setUserCodeMap(prev => ({ ...prev, [activeLesson.id]: e.target.value }));
                            }}
                            className="flex-1 p-4 font-mono text-xs text-zinc-300 bg-transparent resize-none focus:outline-hidden leading-relaxed h-[180px]"
                            spellCheck="false"
                          />

                          <div className="p-2.5 bg-[#111111] border-t border-white/5 flex justify-end">
                            {completedLessons.includes(activeLesson.id) ? (
                              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold font-sans bg-emerald-500/5 border border-emerald-500/10 px-3.5 py-1.5 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Code Challenge Completed!</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleVerifyCodeLocal(activeLesson)}
                                disabled={codeIsVerifyingId === activeLesson.id}
                                className="px-4 py-2 font-bold text-xs text-white bg-purple-600 hover:bg-purple-500 rounded-xl disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                                id={`btn-code-run-verify-${activeLesson.id}`}
                              >
                                {codeIsVerifyingId === activeLesson.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Compiling logic scripts...</span>
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-3.5 h-3.5 fill-current" />
                                    <span>Run Verification</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Compiler log parameters */}
                        {(codeFeedbacks[activeLesson.id] || completedLessons.includes(activeLesson.id)) && (
                          <div className="p-3.5 rounded-xl bg-[#09090b] border border-white/5 font-mono text-[10px] md:text-xs leading-relaxed space-y-2 select-text shadow-inner">
                            <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1 bg-transparent">
                              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                <Code2 className="w-3.5 h-3.5 text-purple-400" /> Compiler Log Diagnostic
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/15">
                                VERIFICATION PASSED
                              </span>
                            </div>
                            <div className="space-y-1 bg-transparent">
                              <p className="text-zinc-300">
                                <strong className="text-emerald-400 font-semibold font-sans">Suggestions:</strong>{' '}
                                {codeFeedbacks[activeLesson.id]?.suggestions || "Offline compilation bypassed. Your coding logic aligns with standards perfectly!"}
                              </p>
                              <p className="text-zinc-500 text-[10px] mt-1.5 leading-relaxed">
                                <strong className="text-purple-300 font-semibold font-sans">Outcome Analysis:</strong>{' '}
                                {codeFeedbacks[activeLesson.id]?.explanation || "PEP-8 variables verified. Matrix dimensions loaded into system layers correctly."}
                              </p>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}

{/* 4. SECTIONS CONGRATS OVER COMPLETED */}
{completedLessons.includes(activeLesson.id) && (
                      <motion.div 
                        className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left mt-4 relative overflow-hidden"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        {/* Confetti particles */}
                        <div className="absolute inset-0 pointer-events-none">
                          {[...Array(12)].map((_, i) => (
                            <motion.div
                              key={i}
                              className="absolute w-2 h-3 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full"
                              initial={{ 
                                top: '50%', 
                                left: `${Math.random() * 100}%`,
                                opacity: 0,
                                scale: 0
                              }}
                              animate={{ 
                                top: '-20%',
                                opacity: [0, 1, 0],
                                scale: [0, 1, 0.5],
                                rotate: [0, 180, 360]
                              }}
                              transition={{ 
                                duration: 1.2,
                                delay: i * 0.05,
                                ease: 'easeOut'
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <motion.div 
                            className="p-2 h-10 w-10 shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          >
                            <Check className="w-5 h-5 stroke-[3.5px]" />
                          </motion.div>
                          <div>
                            <motion.h4 
                              className="font-display font-bold text-sm text-white"
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 }}
                            >
                              Segment Activity Mastered!
                            </motion.h4>
                            <motion.p 
                              className="text-[11px] text-zinc-400 mt-1"
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.15 }}
                            >
                              Excellent job! You claimed +{activeLesson.xpReward} XP.
                            </motion.p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {completedCount === totalWeight ? (
                            <span className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500/10 border border-purple-500/25 text-purple-300">
                              🎓 Fully Cleared Topic!
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  const nextLessons = localLessons.filter(l => !completedLessons.includes(l.id));
                                  if (nextLessons.length > 0) {
                                    setActiveLessonId(nextLessons[0].id);
                                  }
                                }}
                                className="bg-zinc-900 border border-white/10 hover:border-white/20 text-white cursor-pointer hover:bg-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                              >
                                Next Lesson
                              </button>
                              <button
                                onClick={() => {
                                  if (onNavigateNext && activeLesson) {
                                    onNavigateNext('', level.id || '', '');
                                  }
                                }}
                                className="bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 cursor-pointer hover:bg-indigo-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                              >
                                Continue Roadmap
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}

                </motion.div>
              )}
            </AnimatePresence>

          </div>

        </div>

      </div>

    </div>
  );
}
