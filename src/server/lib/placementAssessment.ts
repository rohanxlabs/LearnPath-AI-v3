import { mapCurriculumSkillTags } from './skillCalibration';

export const PLACEMENT_DIFFICULTIES = ['beginner', 'developing', 'competent', 'advanced'] as const;
export type PlacementDifficulty = typeof PLACEMENT_DIFFICULTIES[number];

export interface PlacementQuestion {
  id: string;
  prompt: string;
  skillTags: string[];
  difficulty: PlacementDifficulty;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface PublicPlacementQuestion extends Omit<PlacementQuestion, 'correctIndex' | 'explanation'> {}
export interface PlacementAnswer { questionId: string; selectedIndex: number }
export interface GradedPlacementAnswer extends PlacementAnswer {
  correct: boolean;
  skillTags: string[];
  difficulty: PlacementDifficulty;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function validatePlacementQuestions(input: unknown): PlacementQuestion[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new Error('Assessment must contain between 1 and 100 questions');
  }
  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`Invalid question at index ${index}`);
    const { id, prompt, skillTags, difficulty, options, correctIndex, explanation } = raw;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || seen.has(id)) throw new Error(`Invalid or duplicate question id at index ${index}`);
    seen.add(id);
    if (typeof prompt !== 'string' || prompt.trim().length < 5 || prompt.length > 2000) throw new Error(`Invalid question prompt at index ${index}`);
    if (!Array.isArray(skillTags) || skillTags.length < 1 || skillTags.length > 8) throw new Error(`Invalid skill tags at index ${index}`);
    const normalizedTags = mapCurriculumSkillTags(skillTags);
    if (normalizedTags.length !== new Set(skillTags).size || normalizedTags.length === 0) throw new Error(`Invalid skill tags at index ${index}`);
    if (typeof difficulty !== 'string' || !(PLACEMENT_DIFFICULTIES as readonly string[]).includes(difficulty)) throw new Error(`Invalid difficulty at index ${index}`);
    if (!Array.isArray(options) || options.length < 2 || options.length > 6 || options.some((option) => typeof option !== 'string' || option.trim().length === 0 || option.length > 500)) throw new Error(`Invalid options at index ${index}`);
    if (!Number.isInteger(correctIndex) || Number(correctIndex) < 0 || Number(correctIndex) >= options.length) throw new Error(`Invalid correct answer at index ${index}`);
    if (explanation !== undefined && (typeof explanation !== 'string' || explanation.length > 2000)) throw new Error(`Invalid explanation at index ${index}`);
    return {
      id, prompt: prompt.trim(), skillTags: normalizedTags.map((tag) => tag.skillName),
      difficulty: difficulty as PlacementDifficulty, options: options.map((option) => (option as string).trim()),
      correctIndex: Number(correctIndex), ...(typeof explanation === 'string' ? { explanation: explanation.trim() } : {}),
    };
  });
}

export function toPublicPlacementQuestion(question: PlacementQuestion): PublicPlacementQuestion {
  const { correctIndex: _correctIndex, explanation: _explanation, ...safeQuestion } = question;
  return safeQuestion;
}

export function gradePlacementAnswers(questions: PlacementQuestion[], answers: unknown): GradedPlacementAnswer[] {
  if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('Answer every question exactly once');
  const answerMap = new Map<string, number>();
  for (const raw of answers) {
    if (!isRecord(raw) || typeof raw.questionId !== 'string' || !Number.isInteger(raw.selectedIndex)) throw new Error('Invalid answer');
    if (answerMap.has(raw.questionId)) throw new Error('Duplicate answer');
    answerMap.set(raw.questionId, Number(raw.selectedIndex));
  }
  if (answerMap.size !== questions.length || questions.some((question) => !answerMap.has(question.id))) throw new Error('Answers do not match assessment questions');
  return questions.map((question) => {
    const selectedIndex = answerMap.get(question.id)!;
    if (selectedIndex < 0 || selectedIndex >= question.options.length) throw new Error('Invalid selected answer');
    return {
      questionId: question.id, selectedIndex, correct: selectedIndex === question.correctIndex,
      skillTags: question.skillTags, difficulty: question.difficulty,
    };
  });
}
