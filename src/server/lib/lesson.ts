import {
  getLessonById,
  upsertLessonContent,
  incrementLessonAttempts,
  findLessonContext,
  getQuizForLesson,
  upsertQuiz
} from '../db/queries';
import { callGroqChatCompletion, cleanAndParseJSON, sanitizeForPrompt, GROQ_MODELS } from './ai';
import { sql } from './db';

// ---------------------------------------------------------------------------
// Subject detection
// ---------------------------------------------------------------------------
export type SubjectKind = 'programming' | 'mathematics' | 'theory';

const PROGRAMMING_HINTS = [
  'python', 'javascript', 'typescript', 'java', 'c++', 'cpp', 'c#', 'go', 'rust', 'sql', 'react',
  'node', 'html', 'css', 'api', 'algorithm', 'data structure', 'datastructure', 'oop', 'function',
  'class', 'code', 'coding', 'program', 'framework', 'git', 'database', 'backend', 'frontend',
  'devops', 'docker', 'kubernetes', 'ml', 'machine learning', 'neural', 'tensorflow', 'pytorch',
  'pandas', 'numpy', 'regex', 'compiler', 'recursion', 'array', 'pointer', 'thread', 'async'
];
const MATH_HINTS = [
  'math', 'algebra', 'calculus', 'geometry', 'trigonometry', 'probability', 'statistics',
  'derivative', 'integral', 'matrix', 'matrices', 'vector', 'equation', 'theorem', 'proof',
  'linear algebra', 'discrete', 'combinatorics', 'number theory', 'differential', 'limit', 'series'
];

export function detectSubjectKind(lesson: { title?: string; description?: string; skillTags?: string[]; goal?: string }): SubjectKind {
  const hay = [lesson.title || '', lesson.description || '', (lesson.skillTags || []).join(' '), lesson.goal || ''].join(' ').toLowerCase();
  const hits = (arr: string[]) => arr.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
  const progScore = hits(PROGRAMMING_HINTS);
  const mathScore = hits(MATH_HINTS);
  if (progScore >= mathScore && progScore > 0) return 'programming';
  if (mathScore > progScore) return 'mathematics';
  return 'theory';
}

// ---------------------------------------------------------------------------
// Lesson prompt builder
// ---------------------------------------------------------------------------
export const LESSON_SECTIONS = [
  'Lesson Introduction', 'Learning Objectives', 'Core Concepts', 'Step-by-step Explanation',
  'Worked Examples', 'Practical Examples', 'Common Mistakes', 'Best Practices',
  'Summary', 'Key Takeaways', 'Next Lesson Preview'
] as const;

function subjectInstructions(kind: SubjectKind): string {
  switch (kind) {
    case 'programming':
      return `This is a PROGRAMMING lesson. Include: clear explanations, correct syntax, and TIERED code examples in "Worked Examples" — a SIMPLE example, an INTERMEDIATE example, and a REAL-WORLD example — each as a complete runnable fenced code block WITH its expected OUTPUT shown (as a fenced \`text\` block or comment). Add at least one Markdown/ASCII diagram (flowchart, tree, or architecture) using a fenced \`text\` block to illustrate flow or structure. In "Common Mistakes" include real common bugs and concrete debugging tips. In the practice part of "Practical Examples", add a CHALLENGE exercise (harder, open-ended).`;
    case 'mathematics':
      return `This is a MATHEMATICS lesson. Include: precise definitions; formulas inline with backticks or in fenced blocks; at least one step-by-step DERIVATION; fully worked numeric examples (simple then harder); and a diagram or comparison TABLE where it clarifies relationships. In "Summary", list the Important Formulas explicitly.`;
    default:
      return `This is a THEORY/CONCEPTUAL lesson. Include: crisp definitions; an intuitive real-world ANALOGY for each core concept; concrete real-world applications; and comparison TABLES for related concepts. Use a Markdown/ASCII diagram (e.g. a timeline or flowchart in a fenced \`text\` block) where it aids understanding.`;
  }
}

export function buildLessonPrompt(ctx: {
  title: string; description?: string; difficulty?: string; estimatedMinutes?: number;
  learningObjectives?: string[]; skillTags?: string[]; prerequisiteNames?: string[];
  goal?: string; moduleName?: string; phaseName?: string; nextLessonName?: string; subject: SubjectKind;
}): string {
  const objectives = (ctx.learningObjectives || []).filter(Boolean);
  const tags = (ctx.skillTags || []).filter(Boolean);
  const prereqs = (ctx.prerequisiteNames || []).filter(Boolean);
  const nextPreview = ctx.nextLessonName ? `The next lesson is "${ctx.nextLessonName}"; preview how it builds on this one.` : `Preview what a logical next step after this lesson would be.`;
  const interviewLine = ctx.subject === 'theory'
    ? `If this topic is commonly asked in interviews, add a short "Common Interview Questions" list.`
    : `Add a short "Common Interview Questions" list (2-4 questions) since this topic is interview-relevant.`;

  return `You are an expert instructor writing ONE complete, self-contained, PREMIUM online-course lesson.

LESSON: "${sanitizeForPrompt(ctx.title, 160)}"
${ctx.goal ? `COURSE GOAL: "${sanitizeForPrompt(ctx.goal, 160)}"` : ''}
${ctx.moduleName ? `MODULE: "${sanitizeForPrompt(ctx.moduleName, 120)}"` : ''}
${ctx.difficulty ? `LEVEL: ${sanitizeForPrompt(ctx.difficulty, 20)}` : ''}${ctx.estimatedMinutes ? ` | TARGET LENGTH: a ${ctx.estimatedMinutes}-minute read` : ''}
${ctx.description ? `WHAT THE LEARNER WILL DO: ${sanitizeForPrompt(ctx.description, 240)}` : ''}
${objectives.length ? `OBJECTIVES TO COVER:\n${objectives.map((o) => `- ${sanitizeForPrompt(o, 120)}`).join('\n')}` : ''}
${tags.length ? `SKILLS COVERED: ${tags.map((t) => sanitizeForPrompt(t, 40)).join(', ')}` : ''}
${prereqs.length ? `PREREQUISITES: ${prereqs.map((p) => sanitizeForPrompt(p, 80)).join(', ')}` : ''}

${subjectInstructions(ctx.subject)}

WRITING RULES:
- Rich, accurate, NON-repetitive educational Markdown. Explain the "why", not just the "what". No shallow filler paragraphs.
- Use ## headings, ### sub-headings, bullet lists, and TABLES where they aid clarity (e.g. comparison charts).
- Use fenced code blocks with a language tag where relevant; use fenced \`text\` blocks for ASCII diagrams (flowcharts, trees, timelines, architecture). NEVER use images.
- At 2-3 natural stopping points, insert an inline KNOWLEDGE CHECK as a blockquote to make the reader pause and think, e.g.:
  > 🧠 **Knowledge Check:** What do you think happens if ...? / Can you predict the output of ...?
  These are reflection checkpoints, NOT graded quizzes — do not provide multiple-choice options.
- Do NOT include graded quizzes or assignments.

OUTPUT FORMAT — return Markdown ONLY (no preamble, no JSON, no code fence around the whole document). Begin the document with this metadata header exactly (fill in real values), then the 11 sections:

**Estimated Study Time:** ~${ctx.estimatedMinutes || 20} min | **Difficulty:** ${ctx.difficulty || 'beginner'}
**Prerequisites:** ${prereqs.length ? prereqs.join(', ') : 'None'}
**Skills Covered:** ${tags.length ? tags.join(', ') : 'core concepts'}

Then use EXACTLY these 11 sections, in order, each as a level-2 heading:

## 1. Lesson Introduction
## 2. Learning Objectives
(Restate the objectives as a checklist using "- [ ] objective" so learners can tick them off.)
## 3. Core Concepts
## 4. Step-by-step Explanation
## 5. Worked Examples
## 6. Practical Examples
(Include four labelled sub-parts: "### Quick Practice", "### Mini Challenge", "### Thinking Question", "### Real-World Application".)
## 7. Common Mistakes
## 8. Best Practices
## 9. Summary
(Include "### Key Points", "### Important Concepts"${ctx.subject === 'mathematics' ? ', "### Important Formulas"' : ''}, and ${interviewLine})
## 10. Key Takeaways
## 11. Next Lesson Preview

For "Next Lesson Preview": ${nextPreview}
Begin now with the metadata header, then "## 1. Lesson Introduction".`;
}

// ---------------------------------------------------------------------------
// Lesson markdown scoring / cleaning / fallback
// ---------------------------------------------------------------------------

export function scoreLessonMarkdown(markdown: string): { sectionsFound: number; ok: boolean } {
  if (!markdown || markdown.trim().length < 400) return { sectionsFound: 0, ok: false };
  const lower = markdown.toLowerCase();
  let sectionsFound = 0;
  for (const section of LESSON_SECTIONS) {
    if (lower.includes(section.toLowerCase())) sectionsFound++;
  }
  return { sectionsFound, ok: sectionsFound >= 8 };
}

export function cleanLessonMarkdown(raw: string): string {
  let md = (raw || '').trim();
  if (md.startsWith('```')) md = md.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim();
  return md;
}

export function buildFallbackLessonMarkdown(ctx: { title: string; description?: string; difficulty?: string; estimatedMinutes?: number; learningObjectives?: string[]; skillTags?: string[]; prerequisiteNames?: string[]; nextLessonName?: string }): string {
  const title = ctx.title || 'This Lesson';
  const objectives = (ctx.learningObjectives || []).filter(Boolean);
  const tags = (ctx.skillTags || []).filter(Boolean);
  const prereqs = (ctx.prerequisiteNames || []).filter(Boolean);
  const checklist = objectives.length ? objectives.map((o) => `- [ ] ${o}`).join('\n') : `- [ ] Understand the core ideas behind ${title}\n- [ ] Apply ${title} in a practical scenario`;

  return `**Estimated Study Time:** ~${ctx.estimatedMinutes || 20} min | **Difficulty:** ${ctx.difficulty || 'beginner'}
**Prerequisites:** ${prereqs.length ? prereqs.join(', ') : 'None'}
**Skills Covered:** ${tags.length ? tags.join(', ') : 'core concepts'}

## 1. Lesson Introduction

Welcome to **${title}**. ${ctx.description || `This lesson introduces the essential ideas of ${title} and shows how to apply them.`}

> Note: A richer, AI-authored version of this lesson will be generated automatically the next time it is opened. This is a structured starter outline.

## 2. Learning Objectives

By the end of this lesson you should be able to:

${checklist}

## 3. Core Concepts

${tags.length ? `The key topics for this lesson are: ${tags.join(', ')}.` : `This lesson covers the foundational concepts of ${title}.`}

> 🧠 **Knowledge Check:** Before continuing, how would you explain ${title} in one sentence to a friend?

## 4. Step-by-step Explanation

1. Review the objectives above.
2. Study each core concept in order.
3. Work through the examples and reproduce them yourself.

## 5. Worked Examples

A worked example will walk through applying ${title} step by step.

## 6. Practical Examples

### Quick Practice
Try a small exercise applying ${title}.

### Mini Challenge
Extend the quick practice with one additional constraint.

### Thinking Question
Why does ${title} matter, and when would you avoid it?

### Real-World Application
Describe a real scenario where ${title} is used in practice.

## 7. Common Mistakes

- Rushing past the fundamentals before practising.
- Skipping the examples instead of reproducing them.

## 8. Best Practices

- Practise actively rather than reading passively.
- Connect new ideas to what you already know.

## 9. Summary

### Key Points
- ${title} is a building block for later lessons.

### Important Concepts
- ${tags.length ? tags.join(', ') : `the fundamentals of ${title}`}

## 10. Key Takeaways

- ${title} is a building block for later lessons.
- Active practice is the fastest route to mastery.

## 11. Next Lesson Preview

${ctx.nextLessonName ? `Next up: **${ctx.nextLessonName}**, which builds directly on what you learned here.` : `The next lesson will build on these ideas.`}`;
}

// ---------------------------------------------------------------------------
// Lesson generation
// ---------------------------------------------------------------------------

const lessonGenerationInFlight = new Map<string, Promise<{ markdown: string; summary: string | null; modelUsed: string }>>();

export async function generateLessonContent(ctx: {
  lessonId: string; title: string; description?: string; difficulty?: string; estimatedMinutes?: number;
  learningObjectives?: string[]; skillTags?: string[]; prerequisiteNames?: string[];
  goal?: string; moduleName?: string; phaseName?: string; nextLessonName?: string;
}): Promise<{ markdown: string; summary: string | null; modelUsed: string }> {
  const subject = detectSubjectKind(ctx);
  const prompt = buildLessonPrompt({ ...ctx, subject });

  const MAX_ATTEMPTS = 2;
  let bestMarkdown = '';
  let bestSections = -1;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await callGroqChatCompletion(prompt, { temperature: 0.6, asJSON: false, timeoutMs: 35000, maxTokens: 4500 });
      const md = cleanLessonMarkdown(response);
      const { sectionsFound, ok } = scoreLessonMarkdown(md);
      if (sectionsFound > bestSections) { bestSections = sectionsFound; bestMarkdown = md; }
      if (ok) {
        const summary = extractLessonSummary(md);
        console.log(`[Lesson-Gen] ${ctx.lessonId} generated (${subject}, ${sectionsFound}/11 sections, attempt ${attempt + 1}).`);
        return { markdown: md, summary, modelUsed: GROQ_MODELS[0] };
      }
      console.warn(`[Lesson-Gen] ${ctx.lessonId} attempt ${attempt + 1} incomplete (${sectionsFound}/11 sections).`);
    } catch (err: any) {
      console.warn(`[Lesson-Gen] ${ctx.lessonId} attempt ${attempt + 1} failed:`, err.message);
    }
  }

  if (bestSections >= 6 && bestMarkdown) {
    console.warn(`[Lesson-Gen] ${ctx.lessonId} using best partial content (${bestSections}/11 sections).`);
    return { markdown: bestMarkdown, summary: extractLessonSummary(bestMarkdown), modelUsed: GROQ_MODELS[0] };
  }

  console.warn(`[Lesson-Gen] ${ctx.lessonId} falling back to offline lesson template.`);
  const fallback = buildFallbackLessonMarkdown(ctx);
  return { markdown: fallback, summary: extractLessonSummary(fallback), modelUsed: 'offline-fallback' };
}

export function extractLessonSummary(markdown: string): string | null {
  if (!markdown) return null;
  const grab = (heading: RegExp): string | null => {
    const match = markdown.match(heading);
    if (!match) return null;
    const start = match.index! + match[0].length;
    const rest = markdown.slice(start);
    const end = rest.search(/\n##\s/);
    const body = (end === -1 ? rest : rest.slice(0, end)).trim();
    const text = body.replace(/[#*`>_-]/g, '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 300) : null;
  };
  return grab(/##\s*\d*\.?\s*Summary/i) || grab(/##\s*\d*\.?\s*Lesson Introduction/i) || null;
}

// ---------------------------------------------------------------------------
// Lesson metadata
// ---------------------------------------------------------------------------

export interface LessonMetadata {
  lessonId: string; title: string; estimatedMinutes: number; difficulty: string; subject: SubjectKind;
  prerequisites: string[]; skillsCovered: string[]; learningObjectives: string[];
  completionChecklist: string[]; sectionAnchors: string[];
  hasKnowledgeChecks: boolean; hasCodeExamples: boolean; hasDiagrams: boolean;
  generatedAt: string | null; lastOpenedAt: string | null; contentStatus: string;
}

function slugifyHeading(heading: string): string {
  return heading.toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function extractSectionAnchors(markdown: string): string[] {
  const anchors: string[] = [];
  const re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const slug = slugifyHeading(match[1].trim());
    if (slug) anchors.push(slug);
  }
  return anchors;
}

export function buildCompletionChecklist(markdown: string, objectives: string[]): string[] {
  const checkboxRe = /^\s*-\s*\[[ x]\]\s*(.+)$/gim;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = checkboxRe.exec(markdown)) !== null) {
    const item = m[1].trim();
    if (item) found.push(item);
  }
  if (found.length) return Array.from(new Set(found)).slice(0, 12);
  return (objectives || []).filter(Boolean).map((o) => o.trim()).slice(0, 12);
}

export function buildLessonMetadata(args: {
  lessonRow: any; content: string; prerequisiteNames: string[];
  generatedAt: string | null; lastOpenedAt: string | null; contentStatus: string;
}): LessonMetadata {
  const { lessonRow, content, prerequisiteNames, generatedAt, lastOpenedAt, contentStatus } = args;
  const objectives = Array.isArray(lessonRow.learningObjectives) ? lessonRow.learningObjectives : [];
  const skillTags = Array.isArray(lessonRow.skillTags) ? lessonRow.skillTags : [];
  const subject = detectSubjectKind({ title: lessonRow.title, description: lessonRow.description ?? undefined, skillTags });
  return {
    lessonId: lessonRow.id, title: lessonRow.title,
    estimatedMinutes: Number(lessonRow.estimatedMinutes) || 20,
    difficulty: lessonRow.difficulty || 'beginner', subject,
    prerequisites: prerequisiteNames, skillsCovered: skillTags, learningObjectives: objectives,
    completionChecklist: buildCompletionChecklist(content, objectives),
    sectionAnchors: extractSectionAnchors(content),
    hasKnowledgeChecks: /knowledge check/i.test(content),
    hasCodeExamples: /```[a-z]/i.test(content),
    hasDiagrams: /```text|```mermaid|┌|└|──|->|─►/i.test(content),
    generatedAt, lastOpenedAt, contentStatus
  };
}

// ---------------------------------------------------------------------------
// In-memory content cache
// ---------------------------------------------------------------------------

type LessonContentCacheEntry = {
  content: string; summary: string | null; contentStatus: string; generatedAt: string | null;
  timestamp: number; lastUsed: number;
  lessonMeta: { id: string; title: string; content_status: string; generated_at: string | null; learning_objectives: any; skill_tags: any; prerequisites: any; estimated_minutes: any; difficulty: any };
};

const LESSON_CONTENT_CACHE_TTL = 30 * 60 * 1000; // 30 min — survives short redeploys and browser tab switches
const LESSON_CONTENT_CACHE_MAX = 500;
const lessonContentCache = new Map<string, LessonContentCacheEntry>();

function evictLessonContentCacheIfNeeded(): void {
  if (lessonContentCache.size <= LESSON_CONTENT_CACHE_MAX) return;
  const entries = [...lessonContentCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const overflow = lessonContentCache.size - LESSON_CONTENT_CACHE_MAX;
  for (let i = 0; i < overflow; i++) lessonContentCache.delete(entries[i][0]);
}

function getCachedLessonContent(lessonId: string): LessonContentCacheEntry | null {
  const entry = lessonContentCache.get(lessonId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > LESSON_CONTENT_CACHE_TTL) { lessonContentCache.delete(lessonId); return null; }
  entry.lastUsed = Date.now();
  return entry;
}

function setCachedLessonContent(lessonId: string, entry: Omit<LessonContentCacheEntry, 'timestamp' | 'lastUsed'>): void {
  const now = Date.now();
  lessonContentCache.set(lessonId, { ...entry, timestamp: now, lastUsed: now });
  evictLessonContentCacheIfNeeded();
}

export function clearLessonContentCacheEntry(lessonId: string): void {
  lessonContentCache.delete(lessonId);
}

function snapshotLessonMeta(lesson: any): LessonContentCacheEntry['lessonMeta'] {
  return { id: lesson.id, title: lesson.title, content_status: lesson.contentStatus, generated_at: lesson.generatedAt ?? null, learning_objectives: lesson.learningObjectives, skill_tags: lesson.skillTags, prerequisites: lesson.prerequisites, estimated_minutes: lesson.estimatedMinutes, difficulty: lesson.difficulty };
}

// ---------------------------------------------------------------------------
// Lesson progress tracking
// ---------------------------------------------------------------------------

export async function recordLessonOpened(ownerEmail: string, ctx: { lessonId: string; moduleId: string; phaseId: string; roadmapId: string }): Promise<string | null> {
  try {
    await incrementLessonAttempts(ownerEmail, ctx.lessonId, ctx.moduleId, ctx.phaseId, ctx.roadmapId);
    return new Date().toISOString();
  } catch (err: any) {
    console.warn('[Lesson-Progress] failed to record open:', err?.message || err);
    return null;
  }
}

export async function getLessonLastOpened(ownerEmail: string, lessonId: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT updated_at FROM user_lesson_progress WHERE owner_email = ${ownerEmail.toLowerCase()} AND lesson_id = ${lessonId} LIMIT 1`;
    return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// getOrGenerateLessonContent
// ---------------------------------------------------------------------------

export async function getOrGenerateLessonContent(
  lessonId: string,
  opts: { regenerate?: boolean; peekOnly?: boolean } = {}
): Promise<{ lesson: any; content: string; summary: string | null; contentStatus: string; generatedAt: string | null; cached: boolean } | null> {
  if (opts.regenerate) {
    clearLessonContentCacheEntry(lessonId);
  } else {
    const hot = getCachedLessonContent(lessonId);
    if (hot) return { lesson: hot.lessonMeta, content: hot.content, summary: hot.summary, contentStatus: hot.contentStatus, generatedAt: hot.generatedAt, cached: true };
  }

  const lesson = await getLessonById(lessonId);
  if (!lesson) return null;

  const existing = lesson.markdownContent;
  if (!opts.regenerate && existing && String(existing).trim().length > 0) {
    const generatedAt = lesson.generatedAt ? new Date(lesson.generatedAt).toISOString() : null;
    const contentStatus = lesson.contentStatus || 'ready';
    setCachedLessonContent(lessonId, { content: existing, summary: lesson.summary ?? null, contentStatus, generatedAt, lessonMeta: snapshotLessonMeta(lesson) });
    return { lesson, content: existing, summary: lesson.summary ?? null, contentStatus, generatedAt, cached: true };
  }

  // peekOnly: return null without triggering generation — caller will fire-and-forget separately.
  if (opts.peekOnly) return null;

  const generatedAt = new Date().toISOString();
  let inflight = lessonGenerationInFlight.get(lessonId);
  if (!inflight) {
    inflight = (async () => {
      const ctx = await buildLessonGenerationContext(lessonId, lesson);
      try { await markLessonContentStatus(lessonId, 'generating'); } catch (_) {}
      const generated = await generateLessonContent(ctx);
      await upsertLessonContent({ lessonId, markdownContent: generated.markdown, summary: generated.summary, modelUsed: generated.modelUsed, generatedAt });
      await markLessonContentStatus(lessonId, 'ready');
      return generated;
    })();
    lessonGenerationInFlight.set(lessonId, inflight);
    inflight.finally(() => lessonGenerationInFlight.delete(lessonId));
  }

  let generated: { markdown: string; summary: string | null; modelUsed: string };
  try {
    generated = await inflight;
  } catch (err) {
    lessonGenerationInFlight.delete(lessonId);
    throw err;
  }

  setCachedLessonContent(lessonId, { content: generated.markdown, summary: generated.summary, contentStatus: 'ready', generatedAt, lessonMeta: snapshotLessonMeta(lesson) });
  return { lesson, content: generated.markdown, summary: generated.summary, contentStatus: 'ready', generatedAt, cached: false };
}

export async function buildLessonGenerationContext(lessonId: string, lessonRow: any): Promise<{ lessonId: string; title: string; description?: string; difficulty?: string; estimatedMinutes?: number; learningObjectives?: string[]; skillTags?: string[]; prerequisiteNames?: string[]; goal?: string; moduleName?: string; phaseName?: string; nextLessonName?: string }> {
  const meta = await sql`
    SELECT roadmaps.goal AS goal, modules.name AS module_name, phases.name AS phase_name, lessons.order_index AS order_index, lessons.module_id AS module_id
    FROM lessons
    JOIN modules ON modules.id = lessons.module_id
    JOIN phases ON phases.id = modules.phase_id
    JOIN roadmaps ON roadmaps.id = modules.roadmap_id
    WHERE lessons.id = ${lessonId}
    LIMIT 1
  `;
  const m = meta[0] || {};

  let nextLessonName: string | undefined;
  if (m.module_id != null && m.order_index != null) {
    const nextRows = await sql`SELECT title FROM lessons WHERE module_id = ${m.module_id} AND order_index > ${m.order_index} ORDER BY order_index ASC LIMIT 1`;
    nextLessonName = nextRows[0]?.title || undefined;
  }

  const prereqIds = Array.isArray(lessonRow.prerequisites) ? lessonRow.prerequisites.filter(Boolean) : [];
  const prerequisiteNames = await resolveLessonNames(prereqIds);

  return {
    lessonId, title: lessonRow.title, description: lessonRow.description ?? undefined,
    difficulty: lessonRow.difficulty ?? undefined, estimatedMinutes: lessonRow.estimatedMinutes ?? undefined,
    learningObjectives: Array.isArray(lessonRow.learningObjectives) ? lessonRow.learningObjectives : [],
    skillTags: Array.isArray(lessonRow.skillTags) ? lessonRow.skillTags : [],
    prerequisiteNames, goal: m.goal ?? undefined, moduleName: m.module_name ?? undefined,
    phaseName: m.phase_name ?? undefined, nextLessonName
  };
}

export async function resolveLessonNames(lessonIds: string[]): Promise<string[]> {
  const ids = (lessonIds || []).filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await sql`SELECT id, title FROM lessons WHERE id = ANY(${ids})`;
  const byId = new Map<string, string>(rows.map((r: any) => [r.id, r.title]));
  return ids.map((id) => byId.get(id)).filter((n): n is string => !!n);
}

export async function markLessonContentStatus(lessonId: string, status: string): Promise<void> {
  await sql`UPDATE lessons SET content_status = ${status}, updated_at = NOW() WHERE id = ${lessonId}`;
}

export async function assembleLessonResponse(
  ownerEmail: string,
  result: { lesson: any; content: string; summary: string | null; contentStatus: string; generatedAt: string | null; cached: boolean }
): Promise<any> {
  const lessonRow = result.lesson;
  const prereqIds = Array.isArray(lessonRow.prerequisites) ? lessonRow.prerequisites : [];
  const prerequisiteNames = await resolveLessonNames(prereqIds);

  let lastOpenedAt: string | null = null;
  try {
    const ctx = await findLessonContext(lessonRow.id);
    if (ctx) {
      lastOpenedAt = (await recordLessonOpened(ownerEmail, { lessonId: lessonRow.id, moduleId: ctx.module_id, phaseId: ctx.phase_id, roadmapId: ctx.roadmap_id })) || (await getLessonLastOpened(ownerEmail, lessonRow.id));
    }
  } catch (_) { /* best-effort */ }

  const metadata = buildLessonMetadata({ lessonRow, content: result.content, prerequisiteNames, generatedAt: result.generatedAt, lastOpenedAt, contentStatus: result.contentStatus });
  return { lessonId: lessonRow.id, name: lessonRow.title, content: result.content, summary: result.summary, contentStatus: result.contentStatus, cached: result.cached, metadata };
}

// ---------------------------------------------------------------------------
// Quiz generation
// ---------------------------------------------------------------------------

export async function generateQuizQuestions(topicName: string): Promise<any[]> {
  const prompt = `Generate a personalized, challenging study quiz for this topic: "${sanitizeForPrompt(topicName, 500)}".
Generate exactly 3 multiple-choice questions. Include misconceptionNotes for wrong answers.

Output must be a JSON array of questions:
[
  {
    "id": string,
    "question": "What is...?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctIndex": number (index of correct option 0-3),
    "explanation": "Pedagogical explanation of the solution.",
    "misconceptionNotes": ["Why option 1 seems plausible but is wrong"]
  }
]`;

  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.7, asJSON: true });
    const parsed = cleanAndParseJSON(response, '[]');
    if (Array.isArray(parsed)) {
      for (const q of parsed) if (!q.misconceptionNotes) q.misconceptionNotes = ['Common misunderstanding - test again.'];
      return parsed;
    }
    return [];
  } catch (error: any) {
    console.error('OpenRouter Dynamic Quiz error fallback:', error.message);
    return [
      { id: 'q-dyn-1', question: `In modern ${topicName} development, what is the best strategy to prevent overfitting on local batches?`, options: ['Add a customized L2 parameter regularization / Dropout layers', 'Repeatedly double the training epochs without validation evaluation', 'Set learning rates to 1.0 to quicken gradient steps', 'Strictly remove all activation transformations'], correctIndex: 0, explanation: 'Dropout randomly deactivates neural paths to prevent multi-node correlation dependencies, while L2 regularization penalizes heavy weights, forcing lower weights and safer boundaries.' },
      { id: 'q-dyn-2', question: `What metric is most typically measured to analyze operational performance in a high-concurrency environment?`, options: ['Average token-generation latency (Time-to-First-Token)', 'The storage volume of raw log exports inside system margins', 'Absolute color hex contrast saturation percentages', 'The count of text lines written in config packages'], correctIndex: 0, explanation: 'Time-to-First-Token (TTFT) and token-generation throughput rate characterize model reactivity speed for client requests.' },
      { id: 'q-dyn-3', question: `How does our system optimize learning paths when performance indicators flag drop-offs?`, options: ['Re-routing user attention via a personalized, interactive roadmap', 'Locking the profile until manual support intervenes', 'Resetting total user accumulated level scores back to zero', 'Ignoring state trends completely'], correctIndex: 0, explanation: 'AI roadmaps adaptively suggest easier mini-tasks and explain concepts sequentially to clear bottlenecks and restore confidence.' }
    ];
  }
}

export async function getOrGenerateQuizForLesson(lesson: any): Promise<{ id: string; title: string; questions: any[] } | null> {
  try {
    const existing = await getQuizForLesson(lesson.id);
    if (existing && Array.isArray(existing.questions) && existing.questions.length > 0) return { id: existing.id, title: existing.title, questions: existing.questions };
    const questions = await generateQuizQuestions(lesson.title);
    const quizId = existing?.id || `quiz-${lesson.id}`;
    await upsertQuiz({ id: quizId, lessonId: lesson.id, moduleId: lesson.module_id, phaseId: lesson.phase_id, roadmapId: lesson.roadmap_id, title: `${lesson.title} Quiz`, questions });
    return { id: quizId, title: `${lesson.title} Quiz`, questions };
  } catch (err: any) {
    console.warn('[Quiz-Gen] failed to get/generate quiz for lesson:', err?.message || err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// YouTube video lookup
// ---------------------------------------------------------------------------

const youtubeVideoCache = new Map<string, { videoId: string | null; title: string | null; fetchedAt: number }>();

export async function findYouTubeVideoForTopic(topicName: string): Promise<{ videoId: string | null; title: string | null; searchUrl: string }> {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topicName + ' tutorial')}`;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { videoId: null, title: null, searchUrl };

  const cacheKey = topicName.toLowerCase().trim();
  const cached = youtubeVideoCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) return { videoId: cached.videoId, title: cached.title, searchUrl };

  try {
    const params = new URLSearchParams({ key: apiKey, q: `${topicName} tutorial`, part: 'snippet', type: 'video', maxResults: '1', videoEmbeddable: 'true', relevanceLanguage: 'en', safeSearch: 'strict' });
    const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!resp.ok) throw new Error(`YouTube API status ${resp.status}`);
    const data: any = await resp.json();
    const item = data?.items?.[0];
    const videoId = item?.id?.videoId || null;
    const title = item?.snippet?.title || null;
    youtubeVideoCache.set(cacheKey, { videoId, title, fetchedAt: Date.now() });
    return { videoId, title, searchUrl };
  } catch (err: any) {
    console.warn('[YouTube] lookup failed, falling back to search link:', err?.message || err);
    return { videoId: null, title: null, searchUrl };
  }
}
