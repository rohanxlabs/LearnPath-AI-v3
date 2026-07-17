import { useCallback, useState } from 'react';

export interface QuizScoring {
  answers: Record<string, number>;
  score: number;
  submitted: boolean;
  setAnswer: (questionId: string, optionIndex: number) => void;
  submit: (questions: { id: string; correctIndex: number }[] | undefined) => number;
  reset: () => void;
  isPerfect: (total: number) => boolean;
}

// Single source of truth for quiz scoring across all lesson views.
// A quiz is only "passed" when every question is correct (100% threshold),
// consistent with the rest of the app's progression rules.
export function useQuizScoring(): QuizScoring {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [score, setScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const setAnswer = useCallback((questionId: string, optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }, []);

  const submit = useCallback(
    (questions: { id: string; correctIndex: number }[] | undefined) => {
      let s = 0;
      (questions || []).forEach((q) => {
        if (answers[q.id] === q.correctIndex) s += 1;
      });
      setScore(s);
      setSubmitted(true);
      return s;
    },
    [answers]
  );

  const reset = useCallback(() => {
    setAnswers({});
    setScore(0);
    setSubmitted(false);
  }, []);

  const isPerfect = useCallback(
    (total: number) => submitted && total > 0 && score === total,
    [submitted, score]
  );

  return { answers, score, submitted, setAnswer, submit, reset, isPerfect };
}
