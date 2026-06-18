import React, { useState, useEffect } from 'react';
import { Award, Brain, CheckCircle, Flame, HelpCircle, RefreshCw, Trophy, XCircle, Video, Bookmark, BookOpen, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Roadmap, TopicQuizAttempt } from '../types';
import { supabase } from '../lib/supabase';
import { getQuizRecommendations } from '../lib/recommendations';

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

const QUIZ_QUESTIONS: Record<string, Question[]> = {
  'quiz-python': [
    {
      question: 'Which of the following creates a Python generator expression rather than a list comprehension?',
      options: [
        '[x**2 for x in range(10)]',
        '(x**2 for x in range(10))',
        '{x**2 for x in range(10)}',
        'generator(x**2 for x in range(10))'
      ],
      correctIndex: 1,
      explanation: 'Parentheses ( ) in place of square brackets [ ] create a memory-efficient yield-based generator object in Python.'
    },
    {
      question: 'What is the runtime complexity of looking up a key in a standard Python dictionary in the average case?',
      options: [
        'O(1)',
        'O(log N)',
        'O(N)',
        'O(N log N)'
      ],
      correctIndex: 0,
      explanation: 'Python dictionaries use hash tables, offering an average O(1) constant time lookup complexity.'
    },
    {
      question: 'How do you execute a vector broadcast in NumPy to add a 1D array of shape (3,) to a 2D array of shape (4,3)?',
      options: [
        'You must convert the 1D array with np.reshape(3, 4)',
        'Numerical array shapes must be identical; broadcasting is not possible here',
        'Directly add them: array2d + array1D; NumPy aligns trailing dimensions automatically',
        'Use np.dot(array2d, array1D)'
      ],
      correctIndex: 2,
      explanation: 'When operating on two arrays, NumPy compares their shapes element-wise starting with trailing dimensions. Since (4,3) and (3,) trailing dimensions match (3), broadcasting handles it automatically.'
    }
  ],
  'quiz-math': [
    {
      question: 'What is the dot product of vectors u = [1, 2, 3] and v = [4, -1, 2]?',
      options: [
        '6',
        '8',
        '10',
        '14'
      ],
      correctIndex: 1,
      explanation: 'The dot product is calculate as (1*4) + (2*-1) + (3*2) = 4 - 2 + 6 = 8.'
    },
    {
      question: 'In Deep Learning optimization, why does gradient descent compute the partial derivative of the loss function?',
      options: [
        'To find the global maximum of target activations.',
        'To determine the direction of steepest ascent of error rates.',
        'To point in the direction of steepest descent, guiding parameter updates to reduce total loss.',
        'To establish bounds on memory usage values.'
      ],
      correctIndex: 2,
      explanation: 'The gradient of the loss function represents the direction of steepest increase. Computing negative gradients guides parameters downwards to reduce prediction errors.'
    }
  ],
  'quiz-llm': [
    {
      question: 'What is the core purpose of the Self-Attention mechanism in Transformer architectures?',
      options: [
        'To compile models faster on CUDA hardware blocks.',
        'To dynamically compute context dependencies between all tokens in a sequence regardless of distance.',
        'To isolate single tokens from surrounding context indices.',
        'To restrict vocabulary lookup vectors.'
      ],
      correctIndex: 1,
      explanation: 'Self-Attention computes compatibility coefficients between query, key, and value vectors of all inputs, letting the network correlate distant terms in parallel.'
    }
  ],
  'quiz-rag': [
    {
      question: 'What is the purpose of RAG (Retrieval-Augmented Generation) in LLM business systems?',
      options: [
        'To compile source code into machine instruction binaries.',
        'To inject external custom documents context into the prompt before generation, reducing hallucinations.',
        'To compress weights on Edge CPU devices.',
        'To increase general pretraining parameters weights.'
      ],
      correctIndex: 1,
      explanation: 'RAG fetches high-similarity information chunks from document vector spaces and presents them as contextual background inside the prompt context.'
    }
  ]
};

export function QuizTab({ roadmap, onAddXp }: QuizTabProps) {
  const [quizzes, setQuizzes] = useState<TopicQuizAttempt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Game state
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);

  useEffect(() => {
    async function loadQuizAttempts() {
      setLoading(true);
      const { data, error } = await supabase.from('topic_wise_quizzes').select('*');
      if (data && !error) {
        setQuizzes(data as TopicQuizAttempt[]);
      }
      setLoading(false);
    }
    loadQuizAttempts();
  }, [roadmap.id]);

  const startQuiz = (quizId: string) => {
    const questions = QUIZ_QUESTIONS[quizId];
    if (!questions) return;
    setActiveQuizId(quizId);
    setActiveQuestions(questions);
    setCurrentIdx(0);
    setAnswers({});
    setSelectedOpt(null);
    setShowFeedback(false);
    setCorrectCount(0);
    setQuizFinished(false);
  };

  const handleSelectOption = (idx: number) => {
    if (showFeedback) return;
    setSelectedOpt(idx);
  };

  const handleNextSubmit = () => {
    const currentQ = activeQuestions[currentIdx];
    
    if (!showFeedback) {
      if (selectedOpt === null) return;
      
      const isCorrect = selectedOpt === currentQ.correctIndex;
      if (isCorrect) {
        setCorrectCount(prev => prev + 1);
      }
      
      setAnswers(prev => ({ ...prev, [currentIdx]: selectedOpt }));
      setShowFeedback(true);
    } else {
      if (currentIdx < activeQuestions.length - 1) {
        setCurrentIdx(prev => prev + 1);
        setSelectedOpt(null);
        setShowFeedback(false);
      } else {
        // Finished! Save to database
        finishQuiz();
      }
    }
  };

  const finishQuiz = async () => {
    if (!activeQuizId) return;
    
    const questionsCount = activeQuestions.length;
    const finalPct = Math.round((correctCount / questionsCount) * 100);
    
    const existing = quizzes.find(q => q.quizId === activeQuizId);
    const prevAttempts = existing?.attemptsCount || 0;
    const prevScore = existing?.score || 0;
    
    const updatedAttempt = {
      id: activeQuizId,
      quizId: activeQuizId,
      quizName: existing?.quizName || 'Standard AI Quiz',
      score: Math.max(prevScore, finalPct),
      totalQuestions: questionsCount,
      attemptsCount: prevAttempts + 1,
      lastAttemptedAt: new Date().toLocaleString()
    };

    // Save to server-side user database
    await supabase.from('topic_wise_quizzes').update(updatedAttempt);
    
    // Reward XP on first time passes or high scores!
    if (finalPct === 100 && prevScore < 100) {
      onAddXp(30);
    } else if (finalPct >= 70 && prevScore < 70) {
      onAddXp(15);
    }

    // Refresh state list
    const { data } = await supabase.from('topic_wise_quizzes').select('*');
    if (data) {
      setQuizzes(data as TopicQuizAttempt[]);
    }

    setQuizFinished(true);
  };

  return (
    <div className="space-y-6 text-white font-sans">
      <div>
        <h2 className="font-display font-bold text-xl text-white">Topic Assessment Quizzes</h2>
        <p className="text-xs text-zinc-400">Challenge yourself with dynamic, curriculum-mapped quizzes. Scoring and attempts persist durably for your user profile.</p>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <p className="text-xs text-zinc-500">Loading module status...</p>
        </div>
      ) : !activeQuizId ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((quiz) => {
            const hasPassed = quiz.score >= 70;
            const hasAttempted = quiz.attemptsCount > 0;

            return (
              <div 
                key={quiz.id}
                className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl flex flex-col justify-between gap-5 hover:border-purple-500/20 hover:bg-zinc-900/80 transition-all duration-300"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-[10px] tracking-wider uppercase font-bold text-zinc-400">
                    <span className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span>Multiple Choice</span>
                    </span>
                    {hasAttempted && (
                      <span className={`px-2 py-0.5 rounded-full ${hasPassed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {quiz.score}% Score
                      </span>
                    )}
                  </div>
                  
                  <h4 className="font-sans font-bold text-xs text-zinc-100">{quiz.quizName}</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-[10px] text-zinc-400 bg-white/5 p-3 rounded-xl border border-white/5">
                    <div>
                      <p className="text-zinc-400 font-medium">Attempts</p>
                      <p className="text-zinc-200 font-bold mt-0.5">{quiz.attemptsCount} times</p>
                    </div>
                    <div>
                      <p className="text-zinc-400 font-medium font-medium">Last Run</p>
                      <p className="text-zinc-200 font-bold truncate mt-0.5">{quiz.lastAttemptedAt}</p>
                    </div>
                  </div>
                  
                  {/* Custom Prep Recommendations */}
                  <div className="space-y-2 border-t border-white/5 pt-3 mt-1 flex-1">
                    <span className="text-[9px] font-black uppercase text-purple-400 font-mono tracking-widest block">Highly Recommended Prep:</span>
                    <div className="grid grid-cols-1 gap-2">
                      {getQuizRecommendations(quiz.quizId, quiz.quizName).map((resource) => (
                        <div key={resource.id} className="p-2 border border-white/5 bg-white/5 rounded-xl hover:bg-white/10 hover:border-purple-500/20 transition-all flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {resource.type === 'video' ? (
                              <Video className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            ) : resource.type === 'course' ? (
                              <Bookmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-emerald-450 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <h5 className="font-semibold text-[10px] text-zinc-100 truncate leading-tight">{resource.title}</h5>
                              <p className="text-[8px] text-zinc-400 font-medium leading-none mt-0.5">{resource.provider}</p>
                            </div>
                          </div>
                          <a 
                            href={resource.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="px-2 py-1 bg-white/5 hover:bg-purple-600 rounded text-[9px] font-bold text-purple-300 hover:text-white transition-all shrink-0 flex items-center gap-1.5"
                          >
                            <span>Learn</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => startQuiz(quiz.quizId)}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(168,85,247,0.15)] cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  <span>{hasAttempted ? 'Re-attempt Quiz' : 'Launch Assessment'}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/5">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
              style={{ width: `${((currentIdx) / activeQuestions.length) * 100}%` }}
            />
          </div>

          <AnimatePresence mode="wait">
            {!quizFinished ? (
              <motion.div 
                key={currentIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  <span>Question {currentIdx + 1} of {activeQuestions.length}</span>
                  <span className="bg-white/5 px-2.5 py-1 rounded-center select-none">{correctCount} Correct</span>
                </div>

                <h3 className="font-sans font-extrabold text-sm text-white leading-relaxed">
                  {activeQuestions[currentIdx].question}
                </h3>

                <div className="space-y-3">
                  {activeQuestions[currentIdx].options.map((opt, oIdx) => {
                    const isSelected = selectedOpt === oIdx;
                    const isAnswered = showFeedback;
                    const isCorrectOption = oIdx === activeQuestions[currentIdx].correctIndex;
                    
                    let bgClass = 'bg-white/5 hover:bg-white/10 border-white/5';
                    if (isSelected) {
                      bgClass = 'bg-purple-500/10 border-purple-500/40 text-purple-200';
                    }
                    if (isAnswered) {
                      if (isCorrectOption) {
                        bgClass = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200';
                      } else if (isSelected) {
                        bgClass = 'bg-rose-500/15 border-rose-500/40 text-rose-200';
                      }
                    }

                    return (
                      <button
                        key={oIdx}
                        disabled={isAnswered}
                        onClick={() => handleSelectOption(oIdx)}
                        className={`w-full text-left p-4 rounded-xl border text-xs font-semibold leading-relaxed transition-all flex items-start gap-3 cursor-pointer ${bgClass}`}
                      >
                        <div className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center text-[10px] font-bold font-mono transition-colors ${
                          isSelected ? 'bg-purple-500 text-white border-transparent' : 'border-white/20 text-zinc-400'
                        }`}>
                          {indexToAlpha(oIdx)}
                        </div>
                        <span className="flex-1 mt-0.5">{opt}</span>
                        {isAnswered && isCorrectOption && <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />}
                        {isAnswered && isSelected && !isCorrectOption && <XCircle className="w-4 h-4 text-rose-505 text-red-500 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>

                {showFeedback && (
                  <div className="p-4 bg-purple-500/5 border border-purple-500/15 rounded-xl space-y-1.5 animate-fade-in text-[11px] leading-relaxed">
                    <p className="font-bold text-purple-300">Explanation</p>
                    <p className="text-zinc-300">{activeQuestions[currentIdx].explanation}</p>
                  </div>
                )}

                {/* Embedded Reference Material hints during active question */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-purple-400 tracking-wider font-mono">
                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                    <span>Quick reference materials & learning platforms:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {getQuizRecommendations(activeQuizId, activeQuestions[currentIdx]?.question || '').map((res) => (
                      <a
                        key={res.id}
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] bg-zinc-950/40 p-2 border border-white/5 hover:border-purple-500/20 rounded-lg flex items-center justify-between gap-2 hover:bg-zinc-950 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {res.type === 'video' ? (
                            <Video className="w-3 h-3 text-rose-500 shrink-0" />
                          ) : res.type === 'course' ? (
                            <Bookmark className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : (
                            <BookOpen className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          <span className="text-zinc-300 font-medium truncate leading-tight">{res.title}</span>
                        </div>
                        <ExternalLink className="w-2.5 h-2.5 text-zinc-550" />
                      </a>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setActiveQuizId(null)}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all text-zinc-300 cursor-pointer"
                  >
                    Exit Quiz
                  </button>
                  <button
                    onClick={handleNextSubmit}
                    disabled={selectedOpt === null}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-xs font-bold transition-all shadow-[0_4px_15px_rgba(168,85,247,0.15)] disabled:opacity-50 cursor-pointer"
                  >
                    {!showFeedback ? 'Submit Answer' : (currentIdx < activeQuestions.length - 1 ? 'Next Question' : 'Finish Quiz')}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 text-center space-y-6"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-bounce">
                  <Trophy className="w-8 h-8 text-white" />
                </div>

                <div className="space-y-2">
                  <h3 className="font-display font-extrabold text-lg text-white">Quiz Completed!</h3>
                  <p className="text-xs text-zinc-400">Great work testing your knowledge foundations.</p>
                </div>

                <div className="inline-grid grid-cols-2 gap-8 bg-white/5 p-4 rounded-2xl border border-white/5 text-center px-10">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Score</p>
                    <p className="font-display font-black text-xl text-purple-400 mt-1">
                      {Math.round((correctCount / activeQuestions.length) * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Accuracy</p>
                    <p className="font-display font-black text-xl text-blue-400 mt-1">
                      {correctCount} / {activeQuestions.length}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 max-w-xs mx-auto">
                  <button
                    onClick={() => startQuiz(activeQuizId)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Try Again</span>
                  </button>
                  <button
                    onClick={() => setActiveQuizId(null)}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-xs transition-colors text-white cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function indexToAlpha(idx: number): string {
  return String.fromCharCode(65 + idx);
}
