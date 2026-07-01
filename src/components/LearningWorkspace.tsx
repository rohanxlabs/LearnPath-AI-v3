import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, CheckCircle2, Play, Code2, Brain, Trophy, Target, BookOpen, Zap } from 'lucide-react';
import { Roadmap, Level, Lesson } from '../types';
import { stripMarkdown } from '../lib/homeData';

interface LearningWorkspaceProps {
  roadmap: Roadmap;
  activeLesson: { phaseId: string; levelId: string; lessonId: string } | null;
  onCompleteLesson: (xpAdded: number, lessonId: string) => void;
  onNavigateToLesson: (phaseId: string, levelId: string, lessonId: string) => void;
}

export const LearningWorkspace: React.FC<LearningWorkspaceProps> = ({
  roadmap,
  activeLesson,
  onCompleteLesson,
  onNavigateToLesson
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(activeLesson?.lessonId || '');
  const [topicData, setTopicData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [completedInLevel, setCompletedInLevel] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    if (activeLesson?.lessonId && !selectedTopicId) {
      setSelectedTopicId(activeLesson.lessonId);
    }
  }, [activeLesson, selectedTopicId]);

  useEffect(() => {
    if (!selectedTopicId) return;
    loadTopicData();
  }, [selectedTopicId]);

  const loadTopicData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/topics/${selectedTopicId}`);
      if (res.ok) {
        const data = await res.json();
        setTopicData(data.topic);
      } else {
        let foundLesson: any = null;
        for (const phase of roadmap.phases) {
          for (const level of phase.levels) {
            const lesson = level.lessons?.find(l => l.id === selectedTopicId);
            if (lesson) {
              foundLesson = { ...lesson, phaseId: phase.id, levelId: level.id };
              break;
            }
          }
          if (foundLesson) break;
        }
        if (foundLesson) {
          setTopicData({
            ...foundLesson,
            objectives: [`Understand ${foundLesson.name} fundamentals`, `Apply concepts in practice`],
            summary: `${foundLesson.name} - Learn key concepts and apply them.`
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load topic data');
    } finally {
      setLoading(false);
    }
  };

  const getTopicStatus = (lesson: Lesson) => {
    if (lesson.status === 'completed') return 'completed';
    return 'current';
  };

  const handleTopicClick = (lesson: Lesson) => {
    setSelectedTopicId(lesson.id);
    
    let foundPhaseId = '';
    let foundLevelId = '';
    
    for (const phase of roadmap.phases) {
      for (const level of phase.levels) {
        if (level.lessons?.some(les => les.id === lesson.id)) {
          foundPhaseId = phase.id;
          foundLevelId = level.id;
          break;
        }
      }
      if (foundPhaseId) break;
    }
    
    onNavigateToLesson(foundPhaseId, foundLevelId, lesson.id);
  };

  const handleMarkComplete = () => {
    if (topicData && !completedInLevel.includes(topicData.id)) {
      const xp = topicData.xpReward || 20;
      onCompleteLesson(xp, topicData.id);
      setCompletedInLevel([...completedInLevel, topicData.id]);
    }
  };

  const allTopics = roadmap.phases.flatMap(phase => 
    phase.levels.flatMap(level => 
      (level.lessons || []).map(lesson => ({ 
        ...lesson, 
        phaseId: phase.id, 
        levelId: level.id
      }))
    )
  );

  const progressPercent = allTopics.length > 0 
    ? Math.round((allTopics.filter(t => t.status === 'completed').length / allTopics.length) * 100)
    : 0;

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-10rem)] bg-[#0A0A0A] rounded-3xl overflow-hidden border border-white/5 pb-20 lg:pb-0">
      {/* Left sidebar: Course info + lesson navigation - order 3 on mobile */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col order-3 lg:order-1">
        <motion.div 
          className="p-4 lg:p-5 border-b border-white/5"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="font-display font-bold text-lg text-white break-words">{roadmap.goal}</h3>
          <div className="flex items-center gap-2 mt-2">
            <Trophy className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-zinc-400">{progressPercent}% Complete</span>
          </div>
        </motion.div>
        
        <div className="flex-1 overflow-y-auto p-3 lg:p-3 space-y-2">
          {roadmap.phases.map((phase, phaseIdx) => (
            <motion.div 
              key={phase.id} 
              className="space-y-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: phaseIdx * 0.08 }}
            >
              <motion.div 
                className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2 cursor-pointer hover:text-purple-200 transition-colors"
                whileHover={{ x: 2 }}
              >
                <motion.span
                  className="text-purple-400"
                  animate={{ rotate: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  ▶
                </motion.span>
                {phase.name}
              </motion.div>
              {phase.levels.map((level, levelIdx) => (
                <motion.div key={level.id} className="ml-2 space-y-1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                  <motion.div 
                    className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                  >
                    {level.name}
                  </motion.div>
                  {(level.lessons || []).map((lesson, lessonIdx) => {
                    const status = getTopicStatus(lesson);
                    return (
                      <motion.button
                        key={lesson.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.25, delay: lessonIdx * 0.05 }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleTopicClick(lesson);
                        }}
                        whileHover={{ scale: 1.02, x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                          status === 'completed'
                            ? 'text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'text-white bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20'
                        }`}
                      >
                        {status === 'completed' ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300 }}
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          </motion.div>
                        ) : (
                          <Play className="w-4 h-4 shrink-0" />
                        )}
                        <span className="truncate flex-1">{lesson.name}</span>
                        {selectedTopicId === lesson.id && (
                          <motion.span 
                            className="text-purple-400 font-mono text-xs"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400 }}
                          >
                            ACTIVE
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              ))}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Center: Learning content - order 4 on mobile */}
      <div className="w-full lg:flex-1 flex flex-col overflow-hidden order-4 lg:order-2">
        <div className="p-4 lg:p-5 border-b border-white/5">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="truncate">{roadmap.goal}</span>
            <ChevronRight className="w-3 h-3 shrink-0" />
            {topicData && <span className="text-white truncate">{topicData.name}</span>}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-6 bg-white/5 rounded-xl shimmer"
                  style={{ width: i === 0 ? '100%' : i === 1 ? '75%' : '90%' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.1 }}
                />
              ))}
            </motion.div>
          ) : topicData ? (
            <motion.div 
              key={topicData.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6"
            >
              <section>
                <h2 className="font-display font-bold text-xl text-white mb-4">Learning Objectives</h2>
                <ul className="space-y-2">
                  {(topicData.objectives || []).map((obj: string, i: number) => (
                    <motion.li 
                      key={i} 
                      className="flex items-start gap-2 text-sm text-zinc-300"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <Target className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      {obj}
                    </motion.li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="font-display font-bold text-xl text-white mb-4">Topic Content</h2>
                <div className="prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {stripMarkdown(topicData.content || '')}
                </div>
              </section>

              <section>
                <h2 className="font-display font-bold text-xl text-white mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  AI Summary
                </h2>
                <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <div className="text-sm text-zinc-300 whitespace-pre-wrap">
                    {stripMarkdown(topicData.summary || '')}
                  </div>
                </div>
              </section>

              {topicData.type === 'coding' && (
                <section>
                  <h2 className="font-display font-bold text-xl text-white mb-4 flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-blue-400" />
                    Coding Exercise
                  </h2>
                  <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                    <p className="text-zinc-300 mb-3">Practical coding exercise for this topic.</p>
                    <button 
                      onClick={() => handleMarkComplete()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-500"
                    >
                      Mark Complete
                    </button>
                  </div>
                </section>
              )}

              {topicData.type === 'quiz' && !quizScore && (
                <section>
                  <h2 className="font-display font-bold text-xl text-white mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    Quiz
                  </h2>
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <p className="text-zinc-300 mb-3">Test your knowledge with this quiz.</p>
                    
                    <div className="space-y-3 mb-4">
                      {topicData.quizQuestions ? (
                        topicData.quizQuestions.map((q: any, idx: number) => (
                          <div key={q.id} className="p-3 bg-white/5 rounded-lg">
                            <p className="text-sm text-zinc-200 mb-2">{idx + 1}. {q.question}</p>
<div className="space-y-1">
                               {(q.options || []).map((opt: string, optIdx: number) => (
                                <label key={optIdx} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`quiz-${q.id}`}
                                    checked={quizAnswers[q.id] === optIdx}
                                    onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: optIdx })}
                                    className="w-3 h-3"
                                  />
                                  <span className="text-zinc-300">{opt}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-white/5 rounded-lg">
                          <p className="text-sm text-zinc-200 mb-2">Sample Question: What did you learn?</p>
                          <div className="space-y-1">
                            {['Option A', 'Option B', 'Option C', 'Option D'].map((opt, idx) => (
                              <label key={idx} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="radio"
                                  name="quiz-sample"
                                  checked={quizAnswers['sample'] === idx}
                                  onChange={() => setQuizAnswers({ ...quizAnswers, ['sample']: idx })}
                                  className="w-3 h-3"
                                />
                                <span className="text-zinc-300">{opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={() => {
                        const totalQuestions = topicData.quizQuestions?.length || 1;
                        const correct = Object.keys(quizAnswers).length;
                        const score = correct >= totalQuestions / 2 ? totalQuestions : correct;
                        setQuizScore(score);
                        if (score === totalQuestions) {
                          handleMarkComplete();
                        }
                      }}
                      disabled={Object.keys(quizAnswers).length === 0}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Submit Quiz
                    </button>
                  </div>
                </section>
              )}

              {quizScore !== null && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-emerald-400 font-semibold">Quiz Score: {quizScore}/{topicData.quizQuestions?.length || 1}</p>
                  {quizScore === (topicData.quizQuestions?.length || 1) && (
                    <p className="text-xs text-zinc-300 mt-1">Perfect! Lesson completed.</p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-white/5">
                {completedInLevel.includes(topicData.id) || topicData.status === 'completed' ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed! +{topicData.xpReward} XP</span>
                  </div>
                ) : (
                  <button
                    onClick={handleMarkComplete}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-xs hover:brightness-110 transition-all"
                  >
                    Mark Complete
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-12 flex-1 flex items-center justify-center">
              <div>
                <BookOpen className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
                <p className="text-zinc-400">Select a topic from the sidebar to begin</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Right sidebar: Progress - order 2 on mobile */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-l border-white/5 p-4 lg:p-5 space-y-4 order-2 lg:order-3">
        <div>
          <span className="text-[10px] font-bold uppercase text-zinc-400">Progress</span>
          <div className="mt-2 space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-300">Overall</span>
                <span className="text-white font-mono">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
            </div>
          </div>
        </div>

        {topicData && (
          <>
            <div className="pt-3 border-t border-white/5 space-y-3">
              <div>
                <span className="text-[10px] text-zinc-400">Current Topic</span>
                <p className="text-sm font-semibold text-white">{topicData.name}</p>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-300">+{topicData.xpReward} XP</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/5 space-y-3">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Completed Topics</span>
              <p className="text-xs text-white font-mono">{allTopics.filter(t => t.status === 'completed').length}/{allTopics.length}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};