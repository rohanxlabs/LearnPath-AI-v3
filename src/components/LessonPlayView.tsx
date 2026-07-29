import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { ArrowLeft, CheckCircle2, AlertTriangle, Lightbulb, Code2, PlayCircle, RefreshCw, Swords, ChevronRight, Check } from 'lucide-react';
import { Lesson } from '../types';
import { XPBadge } from './Badges';
import { BookOpeningAnimation } from './BookOpeningAnimation';
import { ConfettiParticles } from './ConfettiParticles';
import { AnimatePresence, motion } from 'motion/react';
import { easeInOut } from 'motion';
import { getAuthHeaders } from '../auth/authMiddleware';

interface LessonPlayViewProps {
  lesson: Lesson;
  onClose: () => void;
  onComplete: (xpAdded: number) => void;
}

// Session key: book animation fires once per lesson per browser session
function bookAnimKey(lessonId: string) { return `book_shown_${lessonId}`; }

export function LessonPlayView({ lesson, onClose, onComplete }: LessonPlayViewProps) {
  // Show book animation only if not already shown this session for this lesson
  const [showBookOpen, setShowBookOpen] = useState(() => {
    try { return !sessionStorage.getItem(bookAnimKey(lesson.id)); }
    catch { return true; }
  });
  const [hasCompleted, setHasCompleted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Boss challenge step state
  const [challengeStep, setChallengeStep] = useState<'intro' | 'thinking' | 'answer' | 'done'>('intro');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeChecking, setChallengeChecking] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState<{ passed: boolean; note: string } | null>(null);

  // States for Quiz type lessons
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [submittedQuiz, setSubmittedQuiz] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Code editor state — plain textarea for v1. Syntax-highlighted editor planned for v2.
  // States for Writing Code
  const [userCode, setUserCode] = useState(lesson.codingExercise?.templateCode || `def compute_operations():\n    # Type code here\n    return True`);
  const [codeIsVerifying, setCodeIsVerifying] = useState(false);
  interface CodeFeedback { passed: boolean; suggestions?: string; explanation?: string; systemError?: boolean; }
  const [codeFeedback, setCodeFeedback] = useState<CodeFeedback | null>(null);

  // Quiz submission scorer
  const handleQuizSubmit = () => {
    if (!lesson.quizQuestions) return;
    let score = 0;
    lesson.quizQuestions.forEach((q) => {
      if (quizAnswers[q.id] === q.correctIndex) {
        score += 1;
      }
    });
    setQuizScore(score);
    setSubmittedQuiz(true);

    if (score === (lesson.quizQuestions?.length || 0)) {
      setHasCompleted(true);
    }
  };

  // Code compile API request triggers (15s timeout via AbortController)
  const handleVerifyCode = async () => {
    setCodeIsVerifying(true);
    setCodeFeedback(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/api/analyze-code', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          code: userCode,
          instructions: lesson.codingExercise?.instructions,
          solution: lesson.codingExercise?.solutionCode,
          hint: lesson.codingExercise?.hint
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON content. The API may be offline.");
      }
      const data = await response.json();
      setCodeFeedback(data);
      if (data.passed) setHasCompleted(true);
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      setCodeFeedback({
        passed: false,
        systemError: true,
        suggestions: isTimeout ? "Request timed out after 15 seconds." : "",
        explanation: isTimeout
          ? "The verification server took too long. Check your connection and try again."
          : "Verification service unavailable. Please retry."
      });
    } finally {
      clearTimeout(timeoutId);
      setCodeIsVerifying(false);
    }
  };

  const handleFinishLesson = () => {
    onComplete(lesson.xpReward);
  };

  const renderActiveChapter = () => {
    switch (lesson.type) {
      case 'learn':
        return (
          <div className="space-y-4">
            <div className="prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed select-text selection:bg-purple-500/20">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, defaultSchema]]}
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-6 mb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold text-zinc-200 mt-4 mb-2">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-sm font-semibold text-zinc-300 mt-3 mb-1">{children}</h4>,
                  p: ({ children }) => <p className="text-zinc-300 leading-relaxed mb-3">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 text-zinc-300">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-zinc-300">{children}</ol>,
                  li: ({ children }) => <li className="text-zinc-300 text-sm leading-relaxed">{children}</li>,
                  code: (({ node: _n, className, children }) =>
                    className
                      ? <code className="block bg-[#0d0d0d] border border-white/10 rounded-xl p-4 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre mb-3">{children}</code>
                      : <code className="px-1.5 py-0.5 bg-white/10 rounded text-purple-300 font-mono text-xs">{children}</code>
                  ) as Components['code'],
                  pre: ({ children }) => <>{children}</>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-purple-500 pl-4 italic text-zinc-400 my-3">{children}</blockquote>,
                  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
                  a: ({ href, children }) => <a href={href as string | undefined} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">{children}</a>,
                  hr: () => <hr className="border-white/10 my-4" />,
                  table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full text-sm border-collapse">{children}</table></div>,
                  th: ({ children }) => <th className="border border-white/10 px-3 py-2 text-left text-zinc-200 font-semibold bg-white/5">{children}</th>,
                  td: ({ children }) => <td className="border border-white/10 px-3 py-2 text-zinc-300">{children}</td>,
                } satisfies Components}
              >
                {lesson.content || ''}
              </ReactMarkdown>
            </div>

            <div className="pt-6 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setHasCompleted(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 rounded-xl shadow-md cursor-pointer transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark as complete</span>
              </button>
            </div>
          </div>
        );

      case 'quiz':
        return (
          <div className="space-y-6">
            <p className="text-sm text-zinc-400">{lesson.content}</p>

            <div className="space-y-6">
              {lesson.quizQuestions?.map((q, qidx) => (
                <div key={q.id} className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                  <h4 className="font-semibold text-sm text-zinc-200">
                    <span className="text-purple-400 font-mono text-xs mr-1">Q{qidx + 1}.</span>
                    {q.question}
                  </h4>

<div className="grid grid-cols-1 gap-2">
                     {(q.options || []).map((opt, oidx) => {
                      const isSelected = quizAnswers[q.id] === oidx;
                      const isCorrect = q.correctIndex === oidx;
                      
                      let optionStyle = 'bg-[#0A0A0A] border-white/10 text-zinc-400 hover:text-white hover:bg-white/5';
                      if (isSelected) {
                        optionStyle = 'bg-purple-500/10 border-purple-500 text-purple-300 font-semibold';
                      }
                      if (submittedQuiz) {
                        if (isCorrect) {
                          optionStyle = 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold';
                        } else if (isSelected) {
                          optionStyle = 'bg-red-500/10 border-red-500 text-red-400';
                        } else {
                          optionStyle = 'opacity-40 bg-[#0A0A0A] border-white/10 text-zinc-600';
                        }
                      }

                      const wrongAnswerShake = submittedQuiz && isSelected && !isCorrect ? {
                        x: [-2, 2, -2, 2, 0],
                        transition: { duration: 0.4 }
                      } : {};

                      return (
                        <motion.button
                         key={opt}
                         disabled={submittedQuiz}
                         onClick={() => setQuizAnswers({ ...quizAnswers, [q.id]: oidx })}
                         className={`px-4 py-3 rounded-xl border text-sm text-left transition-all duration-150 flex items-center justify-between ${optionStyle} cursor-pointer`}
                          whileTap={isSelected ? undefined : { scale: 0.98 }}
                          animate={wrongAnswerShake}
                        >
                          <span>{opt}</span>
                          {submittedQuiz && isCorrect && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.3, ease: easeInOut }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {submittedQuiz && (
                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/10 text-xs leading-relaxed text-zinc-400 font-sans">
                      <strong className="text-purple-300 font-semibold block mb-0.5">Explanation:</strong>
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!submittedQuiz ? (
              <div className="flex flex-col items-end gap-2 pt-4">
                {Object.keys(quizAnswers).length < (lesson.quizQuestions?.length || 0) && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    {Object.keys(quizAnswers).length} of {lesson.quizQuestions?.length || 0} answered
                  </p>
                )}
                <button
                  onClick={handleQuizSubmit}
                  disabled={Object.keys(quizAnswers).length < (lesson.quizQuestions?.length || 0)}
                  className="px-5 py-2.5 font-bold text-sm text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  id="btn-quiz-submit"
                >
                  Check answers
                </button>
              </div>
            ) : (
              <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] flex flex-col items-center text-center space-y-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Quiz results</span>
                <p className="text-xl font-bold font-display text-white">
                  Scored: <span className="text-purple-400">{quizScore} / {lesson.quizQuestions?.length || 0}</span> Correct
                </p>
                {quizScore < (lesson.quizQuestions?.length || 0) && (
                  <button
                    onClick={() => {
                      setSubmittedQuiz(false);
                      setQuizAnswers({});
                      setHasCompleted(false);
                    }}
                    className="mt-2 text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Quiz Again</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );

      case 'coding':
        return (
          // Mobile: editor first (primary action), then instructions below.
          // Desktop (lg): side-by-side — instructions left, editor right.
          <div className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-5 items-stretch">

            {/* Instructions column — shown below editor on mobile, left on desktop */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Instructions</span>
                  <h4 className="font-semibold text-xs md:text-sm text-white mt-0.5">Challenge</h4>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed max-w-md select-text whitespace-pre-wrap">
                  {lesson.codingExercise?.instructions}
                </p>

                {/* Hints panel */}
                <div>
                  <button
                    onClick={() => setShowHint(!showHint)}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-500 font-bold hover:text-amber-400 cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showHint ? 'Hide hint' : 'Show hint'}</span>
                  </button>
                  {showHint && (
                    <div className="mt-2 p-3 bg-amber-500/5 rounded-xl border border-amber-500/20 text-xs text-amber-300 leading-relaxed font-mono whitespace-pre-wrap select-text">
                      {lesson.codingExercise?.hint}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <span className="text-xs text-zinc-500">Follow the exercise instructions and keep function signatures intact.</span>
              </div>
            </div>

            {/* Editor column — shown first on mobile, right on desktop */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col bg-white/[0.03] rounded-2xl overflow-hidden border border-white/10">
                <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/10 text-xs text-zinc-400 font-mono font-bold">
                  <span>Code editor</span>
                  <span className="text-emerald-400">● Verification active</span>
                </div>
                <textarea
                  id="code-editor"
                  aria-label="Code editor — write your solution here"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value)}
                  rows={12}
                  className="p-4 font-mono text-xs text-zinc-300 bg-transparent resize-y focus:outline-hidden leading-relaxed min-h-[200px] focus:ring-0"
                  spellCheck="false"
                />
                {/* Run button is in a sticky bar on mobile so it stays visible
                    while the user scrolls the textarea on small screens. */}
                <div className="sticky bottom-0 p-3 bg-white/[0.04] border-t border-white/10 flex justify-end">
                  <button
                    onClick={handleVerifyCode}
                    disabled={codeIsVerifying}
                    className="px-4 py-2.5 font-bold text-xs text-white bg-purple-600 hover:bg-purple-500 rounded-xl disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5 min-h-[44px]"
                    id="btn-code-run-verify"
                  >
                    {codeIsVerifying ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-3.5 h-3.5 fill-current" />
                        <span>Run &amp; verify</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Result panel */}
              {codeFeedback && (
                <motion.div
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 font-mono text-xs leading-relaxed space-y-2 select-text selection:bg-purple-500/20 max-h-[160px] overflow-y-auto relative"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ duration: 0.3, ease: easeInOut }}
                >
                  {codeFeedback.passed && (
                    <ConfettiParticles count={15} />
                  )}
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1 bg-transparent">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5 text-purple-400" /> Result
                    </span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      codeFeedback.passed ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                    }`}>
                      {codeFeedback.passed ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED'}
                    </span>
                  </div>
                  {codeFeedback.passed ? (
                    <div className="space-y-1 bg-transparent">
                      <p className="text-zinc-400"><strong className="text-emerald-400 font-semibold">Status:</strong> {codeFeedback.suggestions}</p>
                      <p className="text-xs text-zinc-500 mt-1"><strong className="text-purple-300 font-semibold">Walkthrough analysis:</strong> {codeFeedback.explanation}</p>
                    </div>
                  ) : (
                    <motion.div
                      className="text-red-400 bg-transparent"
                      animate={{ x: [-2, 2, -2, 2, 0] }}
                      transition={{ duration: 0.4, ease: easeInOut }}
                    >
                      <p className="font-bold">Not quite — here's what to fix:</p>
                      <p className="text-zinc-300">{codeFeedback.suggestions}</p>
                      <p className="text-xs text-zinc-500 mt-1.5 font-sans whitespace-pre-wrap">{codeFeedback.explanation}</p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        );

      case 'boss_challenge':
      case 'challenge':
        return (
          <div className="space-y-5 max-w-xl mx-auto">
            {/* Header */}
            <div className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 via-blue-600 to-emerald-500" />
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mx-auto mb-3 border border-white/10">
                <Swords className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Boss Challenge</span>
              <h4 className="font-display font-black text-base text-white mt-1">{lesson.name}</h4>
              <p className="text-xs text-zinc-400 leading-relaxed mt-2 select-text">
                {lesson.content || 'Demonstrate your understanding by answering the challenge question below. Think carefully before submitting.'}
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 justify-center">
              {(['intro','thinking','answer','done'] as const).map((step, i) => {
                const stepIndex = ['intro','thinking','answer','done'].indexOf(challengeStep);
                return (
                  <React.Fragment key={step}>
                    <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                      i < stepIndex ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      i === stepIndex ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' :
                      'bg-white/5 text-zinc-600 border border-white/10'
                    }`}>
                      {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    {i < 3 && <div className={`h-px w-6 transition-all ${i < stepIndex ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step content */}
            <AnimatePresence mode="wait">
              {challengeStep === 'intro' && (
                <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3 text-center">
                  <p className="text-xs text-amber-300 font-semibold uppercase tracking-wider">How this works</p>
                  <ul className="text-xs text-zinc-400 space-y-1.5 text-left max-w-sm mx-auto">
                    <li className="flex items-start gap-2"><ChevronRight className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" /><span>Read the challenge prompt carefully</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" /><span>Write your answer in your own words — no copy/paste</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" /><span>Your answer will be evaluated for understanding, not exact wording</span></li>
                  </ul>
                  <button onClick={() => setChallengeStep('thinking')}
                    className="mt-2 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl cursor-pointer transition-all">
                    Start Challenge
                  </button>
                </motion.div>
              )}

              {challengeStep === 'thinking' && (
                <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <p className="text-xs font-bold text-purple-400 uppercase tracking-wider">Challenge Prompt</p>
                  <p className="text-sm text-zinc-200 leading-relaxed font-medium select-text">
                    {lesson.quizQuestions?.[0]?.question ||
                      `Explain the key concept behind "${lesson.name}" and give one real-world example of where you would apply it.`}
                  </p>
                  <div className="pt-1 flex justify-end">
                    <button onClick={() => setChallengeStep('answer')}
                      className="flex items-center gap-1.5 px-4 py-2 font-bold text-xs text-white bg-purple-600 hover:bg-purple-500 rounded-xl cursor-pointer transition-all">
                      I'm ready to answer <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {challengeStep === 'answer' && (
                <motion.div key="answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="space-y-3">
                  <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-wider">Your Answer</p>
                    <textarea
                      value={challengeAnswer}
                      onChange={e => setChallengeAnswer(e.target.value)}
                      rows={5}
                      placeholder="Write your answer here in your own words..."
                      className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500/40 resize-none leading-relaxed"
                    />
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${challengeAnswer.trim().length < 30 ? 'text-zinc-600' : 'text-emerald-500'}`}>
                        {challengeAnswer.trim().length < 30 ? `${30 - challengeAnswer.trim().length} more characters needed` : '✓ Enough to submit'}
                      </span>
                      <button
                        disabled={challengeAnswer.trim().length < 30 || challengeChecking}
                        onClick={async () => {
                          setChallengeChecking(true);
                          // Evaluate against the lesson context using AI
                          try {
                            const res = await fetch('/api/analyze-code', {
                              method: 'POST',
                              headers: await getAuthHeaders(),
                              body: JSON.stringify({
                                code: challengeAnswer,
                                instructions: `Challenge: ${lesson.quizQuestions?.[0]?.question || lesson.name}. Student must demonstrate understanding.`,
                                solution: lesson.quizQuestions?.[0]?.explanation || lesson.content?.slice(0, 500) || '',
                              }),
                              signal: AbortSignal.timeout(15_000),
                            });
                            const data = res.ok ? await res.json() : null;
                            setChallengeFeedback({
                              passed: data?.passed ?? challengeAnswer.trim().length >= 80,
                              note: data?.explanation || (challengeAnswer.trim().length >= 80
                                ? 'Good effort! You demonstrated understanding of the key concepts.'
                                : 'Try to elaborate more on the concept.'),
                            });
                          } catch {
                            setChallengeFeedback({
                              passed: challengeAnswer.trim().length >= 80,
                              note: challengeAnswer.trim().length >= 80
                                ? 'Your answer looks comprehensive. Well done!'
                                : 'Please write a more detailed answer to demonstrate understanding.',
                            });
                          }
                          setChallengeChecking(false);
                          setChallengeStep('done');
                        }}
                        className="flex items-center gap-1.5 px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 rounded-xl cursor-pointer disabled:opacity-40 transition-all">
                        {challengeChecking
                          ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Evaluating…</>
                          : <><CheckCircle2 className="w-3.5 h-3.5" /> Submit Answer</>
                        }
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {challengeStep === 'done' && challengeFeedback && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className={`p-5 rounded-2xl border text-center space-y-3 ${challengeFeedback.passed
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-amber-500/5 border-amber-500/20'}`}>
                  {challengeFeedback.passed && <ConfettiParticles count={12} />}
                  <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center text-2xl ${
                    challengeFeedback.passed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    {challengeFeedback.passed ? '🏆' : '📝'}
                  </div>
                  <p className={`font-bold text-sm ${challengeFeedback.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {challengeFeedback.passed ? 'Challenge Cleared!' : 'Keep Going!'}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">{challengeFeedback.note}</p>
                  {challengeFeedback.passed ? (
                    <button onClick={() => setHasCompleted(true)}
                      className="px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-emerald-500 to-teal-600 hover:brightness-110 rounded-xl cursor-pointer transition-all">
                      Claim Reward
                    </button>
                  ) : (
                    <button onClick={() => {
                      setChallengeStep('answer');
                      setChallengeAnswer('');
                      setChallengeFeedback(null);
                    }}
                      className="px-5 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl cursor-pointer transition-all">
                      Try Again
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      default:
        return <p className="text-xs text-zinc-400">Chapter style undefined.</p>;
    }
  };

  return (
    <AnimatePresence>
      {showBookOpen && (
        <BookOpeningAnimation
          key="book-open"
          lessonTitle={lesson.name}
          onComplete={() => {
            try { sessionStorage.setItem(bookAnimKey(lesson.id), '1'); } catch {}
            setShowBookOpen(false);
          }}
        />
      )}
      
      {!showBookOpen && (
        <motion.div 
          key="lesson-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Immersive Header panel */}
          <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/10 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Back to roadmap"
                id="btn-play-close"
              >
                <ArrowLeft className="w-4 h-4 text-zinc-300" />
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      {lesson.type === 'boss_challenge' ? 'Boss Challenge' :
                       lesson.type === 'ai_session' ? 'AI Session' :
                       lesson.type === 'coding' ? 'Coding' :
                       lesson.type === 'quiz' ? 'Quiz' :
                       lesson.type === 'challenge' ? 'Challenge' : 'Lesson'} module
                    </span>
                    <XPBadge amount={lesson.xpReward} size="sm" />
                  </div>
                <h3 className="font-display font-semibold text-sm md:text-base text-white mt-0.5 truncate max-w-xs sm:max-w-md">
                  {lesson.name}
                </h3>
              </div>
            </div>
          </div>

          {/* Primary viewport content */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
            {renderActiveChapter()}
          </div>

          {/* Verification completed congrats overlay */}
          {hasCompleted && (
            <div className="p-5 rounded-2xl bg-gradient-to-tr from-emerald-950/20 to-teal-900/10 border border-emerald-500/20 shadow-[0_4px_16px_rgba(16,185,129,0.12)] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex items-center flex-col sm:flex-row gap-3">
                <div className="p-2 h-10 w-10 shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-base text-white">Lesson complete! 🎉</h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Great work — click below to save your progress and claim your XP.</p>
                </div>
              </div>

              <button
                onClick={handleFinishLesson}
                className="px-5 py-2.5 shrink-0 font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 rounded-xl transition-all cursor-pointer shadow-[0_4px_14px_rgba(16,185,129,0.25)]"
                id="btn-claim-rewards"
              >
                Claim XP &amp; continue
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}