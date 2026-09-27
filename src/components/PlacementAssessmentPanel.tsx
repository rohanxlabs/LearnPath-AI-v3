import React, { useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';

type PublicQuestion = { id: string; prompt: string; skillTags: string[]; difficulty: string; options: string[] };
type AssessmentAttempt = { id: string; status: string; questions: PublicQuestion[]; result?: any; completedAt?: string | null };
const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `placement-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PlacementAssessmentPanel({ roadmapId, getAuthHeaders }: { roadmapId: string; getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef(newIdempotencyKey());

  async function start() {
    setLoading(true); setError(''); setOpen(true);
    try {
      const response = await fetch('/api/placement-assessments/start', {
        method: 'POST', headers: await getAuthHeaders(),
        body: JSON.stringify({ roadmapId, idempotencyKey: idempotencyKey.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start assessment');
      setAttempt(data.attempt);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start assessment'); }
    finally { setLoading(false); }
  }

  async function submit() {
    if (!attempt) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/placement-assessments/attempts/${encodeURIComponent(attempt.id)}/complete`, {
        method: 'POST', headers: await getAuthHeaders(),
        body: JSON.stringify({ answers: attempt.questions.map(question => ({ questionId: question.id, selectedIndex: answers[question.id] })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit assessment');
      setAttempt({ ...attempt, ...data.attempt });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit assessment'); }
    finally { setLoading(false); }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 dark:border-indigo-400/20 bg-indigo-50/70 dark:bg-indigo-500/5 p-5">
      {!open ? <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold text-zinc-900 dark:text-white">Check your starting point</h2><p className="text-sm text-zinc-600 dark:text-zinc-400">Take a short knowledge check based on this roadmap’s existing tagged quizzes.</p></div>
        <button onClick={start} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><ClipboardCheck className="h-4 w-4"/>Start assessment</button>
      </div> : <div className="space-y-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-zinc-900 dark:text-white">Initial skill estimate</h2><p className="text-xs text-zinc-500">An estimate from these questions, not a formal or scientific assessment.</p></div><button type="button" onClick={() => setOpen(false)} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Close</button></div>
        {loading && <p className="inline-flex items-center gap-2 text-sm text-indigo-600"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {attempt?.status === 'completed' && attempt.result && <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{attempt.result.correct} of {attempt.result.total} correct. Your current skill estimates are:</p>
          <ul className="divide-y divide-zinc-200 dark:divide-white/10">{attempt.result.skills.map((skill: any) => <li key={skill.skillKey} className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-zinc-800 dark:text-zinc-200">{skill.skillName}</span><span className="text-right"><span className="block text-sm font-semibold capitalize text-indigo-700 dark:text-indigo-300">{skill.proficiencyLevel}</span><span className="block text-xs text-zinc-500">{skill.confidenceLevel} confidence</span></span></li>)}</ul>
          <p className="text-xs text-zinc-500">This is an initial estimate based on the questions answered. More learning evidence may change it.</p>
          <button onClick={() => { idempotencyKey.current = newIdempotencyKey(); setAttempt(null); setAnswers({}); void start(); }} disabled={loading} className="rounded-xl border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-300/20 dark:text-indigo-300 dark:hover:bg-indigo-500/10">Retake assessment</button>
        </div>}
        {attempt?.status === 'started' && attempt.questions.map((question, index) => <fieldset key={question.id} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-4" disabled={loading}>
          <legend className="font-semibold text-zinc-900 dark:text-white">{index + 1}. {question.prompt}</legend>
          <p className="my-2 text-xs text-zinc-500">{question.skillTags.join(' · ')} · {question.difficulty}</p>
          <div className="space-y-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => setAnswers(value => ({ ...value, [question.id]: optionIndex }))}/>{option}</label>)}</div>
        </fieldset>)}
        {attempt?.status === 'started' && <button onClick={submit} disabled={loading || attempt.questions.some(question => answers[question.id] === undefined)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Submit answers</button>}
        {attempt?.status === 'completed' && <p className="inline-flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/>Your skill estimates were updated.</p>}
      </div>}
    </section>
  );
}
