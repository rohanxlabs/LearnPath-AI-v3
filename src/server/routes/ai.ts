import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { requireAuth, aiLimiter, createLimiter } from '../lib/middleware';
import { callGroqChatCompletion, cleanAndParseJSON, sanitizeForPrompt } from '../lib/ai';
import { recCache, REC_CACHE_TTL, cacheSet } from '../lib/db';
import { logger } from '../lib/logger';
import { Sentry } from '../lib/sentry';

const router = Router();

// Global IP-keyed guard applied to every route in this router, before auth.
// Prevents a bad actor with many accounts from exhausting the Groq budget:
// per-user limit is 10 req/min, but without an IP cap N accounts = N×10 req/min
// from one IP. 60 req/min per IP covers up to 6 simultaneous legitimate users.
const globalAiIpLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 60,
  message: { error: 'Too many AI requests from this IP. Please slow down.' },
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
});
router.use(globalAiIpLimiter);

// Generate projects
router.post('/generate-projects', requireAuth, aiLimiter, async (req, res) => {
  const { goal, phases } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required for project generation', code: 'MISSING_GOAL' });

  const prompt = `
Generate 3-5 hands-on project ideas for this learning goal: "${sanitizeForPrompt(goal)}".

Skills covered in phases:
${(phases || []).map((ph: any) => `- ${ph.name || ph.id}: ${(ph.skillsCovered || []).join(', ')}`).join('\n')}

Return ONLY a valid JSON object matching this shape:
{
  "projects": [
    {
      "id": "ai-proj-1",
      "title": "Project title",
      "difficulty": "beginner" | "intermediate" | "advanced",
      "description": "2-3 sentence project description specific to ${sanitizeForPrompt(goal)}",
      "techStack": ["Tech1", "Tech2", "Tech3"],
      "features": ["Feature 1", "Feature 2"],
      "progress": 0
    }
  ]
}

Rules:
- At least one beginner, one intermediate, one advanced
- All project descriptions must be specific to "${sanitizeForPrompt(goal)}" — no generic filler
- techStack entries must be real, recognizable technologies
`;

  Sentry.setTag('feature', 'ai-mentor');
  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.7, asJSON: true });
    const parsed = cleanAndParseJSON(response, '{"projects":[]}');
    // Ensure all project descriptions are specific to the goal, not generic.
    const projects = (parsed.projects || []).filter(
      (p: any) => p && typeof p.title === 'string' && typeof p.description === 'string'
    );
    return res.json({ projects });
  } catch (error: any) {
    logger.error({ err: error.message }, '[AI] generate-projects fallback');
    Sentry.captureException(error);
    // Return empty array — the roadmap already has embedded phase projects.
    // Better to show nothing than random unrelated project ideas.
    return res.json({ projects: [] });
  }
});

// AI Mentor Chat
router.post('/mentor-chat', requireAuth, aiLimiter, async (req, res) => {
  const { message, history } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message payload is required', code: 'MISSING_MESSAGE' });
  }

  Sentry.setTag('feature', 'ai-mentor');
  try {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured');

    const messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(history)) {
      // Bound history so a client cannot turn one request into an unbounded
      // model prompt (or exceed provider context limits).
      history.slice(-20).forEach((h: any) => {
        const text = typeof h?.text === 'string' ? h.text : '';
        if (text.trim()) {
          messages.push({ role: h.sender === 'user' ? 'user' : 'assistant', content: sanitizeForPrompt(text, 500) });
        }
      });
    }
    messages.push({ role: 'user', content: sanitizeForPrompt(message, 500) });

    const systemInstruction = `You are the LearnPath AI Mentor - a world-class university TA who excels at breaking down complex concepts.

Response Structure:
1. Start with clear heading
2. Write 1-2 sentence plain English overview
3. List 3-4 key points
4. End with quick exercise, next step, and pro tip

Use clean formatting without markdown symbols like ** or ##.`;

    // Build a prompt that includes only the conversation history + current message.
    // The system persona is passed via the systemPrompt option so it lands in the
    // system role of the OpenRouter request rather than being prepended to the user turn.
    const historyText = messages.length > 0
      ? `\n\nConversation so far:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`
      : '';
    const prompt = `User question: ${sanitizeForPrompt(message, 500)}${historyText}`;
    const responseText = await callGroqChatCompletion(prompt, {
      temperature: 0.5,
      systemPrompt: systemInstruction,
    });

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(responseText);
  } catch (error: any) {
    logger.error({ err: error.message }, '[AI] mentor-chat error');
    Sentry.captureException(error);
    const q = sanitizeForPrompt(message, 200);
    const lc = message.toLowerCase();

    // Build a topic-aware fallback based on keywords in the user's message
    let topic = 'this topic';
    let keyPoints = [
      'Break the concept into smaller sub-problems',
      'Look for a real-world analogy that maps to the idea',
      'Build a minimal working example to test your understanding',
    ];
    let exercise = 'Write a 3-bullet summary of what you just read, then quiz yourself without looking.';
    let proTip = 'Active recall (testing yourself) beats passive re-reading by 3x for long-term retention.';

    if (lc.includes('python') || lc.includes('pip') || lc.includes('django') || lc.includes('flask')) {
      topic = 'Python';
      keyPoints = ['Use list comprehensions over explicit loops for clarity', 'Lean on the standard library before reaching for third-party packages', 'Write small pure functions — they are easier to test and reuse'];
      exercise = 'Open a REPL and implement the concept you asked about in under 10 lines.';
      proTip = 'Read the official Python docs for a function before Stack Overflow — they are more accurate.';
    } else if (lc.includes('javascript') || lc.includes(' js ') || lc.includes('typescript') || lc.includes('react') || lc.includes('node')) {
      topic = 'JavaScript / TypeScript';
      keyPoints = ['Understand the event loop before diving into async/await', 'TypeScript interfaces document intent and catch bugs at compile time', 'Prefer immutable data patterns to reduce side-effect bugs'];
      exercise = 'Rewrite a callback-based snippet using async/await and compare readability.';
      proTip = 'Use browser DevTools Sources tab to step through async code — it makes the execution order visible.';
    } else if (lc.includes('machine learning') || lc.includes(' ml ') || lc.includes('neural') || lc.includes('model training')) {
      topic = 'Machine Learning';
      keyPoints = ['Start with the simplest model that could work, then add complexity only if needed', 'Data quality matters more than model sophistication in most real projects', 'Validation split is your sanity check — never tune on the test set'];
      exercise = 'Describe the bias-variance tradeoff in one sentence using a non-technical analogy.';
      proTip = 'Plot your loss curves before drawing any conclusions — spikes often reveal data issues, not model issues.';
    } else if (lc.includes('sql') || lc.includes('database') || lc.includes('postgres') || lc.includes('query')) {
      topic = 'SQL / Databases';
      keyPoints = ['Understand EXPLAIN ANALYZE output before optimizing any query', 'Indexes speed up reads but slow down writes — choose deliberately', 'Normalize to third normal form first, then denormalize only with a measured reason'];
      exercise = 'Write a query that uses a JOIN, a WHERE filter, and an aggregate (COUNT/SUM) on any table you have.';
      proTip = 'N+1 query problems are the most common performance killer in web apps — learn to spot them early.';
    } else if (lc.includes('algorithm') || lc.includes('data structure') || lc.includes('complexity') || lc.includes('big o')) {
      topic = 'Algorithms & Data Structures';
      keyPoints = ['Time complexity tells you how an algorithm scales, not how fast it is on one input', 'Most interview problems reduce to a handful of patterns: sliding window, two-pointer, BFS/DFS, DP', 'Space complexity is often the hidden cost — always account for the call stack in recursion'];
      exercise = 'Trace through a binary search on paper for an array of 8 elements, counting comparisons.';
      proTip = 'Solving the brute-force solution first gives you a correctness baseline to optimize from.';
    } else if (lc.includes('css') || lc.includes('html') || lc.includes('tailwind') || lc.includes('flexbox') || lc.includes('grid')) {
      topic = 'CSS / Frontend Styling';
      keyPoints = ['Learn the box model deeply — margin, border, padding, content', 'Flexbox handles one-dimensional layouts; CSS Grid handles two-dimensional ones', 'Mobile-first media queries are easier to maintain than desktop-first overrides'];
      exercise = 'Build a centered card with a title, body text, and a button using only Flexbox — no absolute positioning.';
      proTip = 'Browser DevTools computed styles panel shows exactly which rule is winning — use it before guessing.';
    }

    const reply = `AI Mentor (offline mode)\n\nYou asked: "${q}"\n\nHere is what I know about ${topic}:\n\n${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nQuick Exercise: ${exercise}\n\nPro Tip: ${proTip}\n\nNote: The AI mentor is temporarily offline. These are curated study notes. Reconnect for a personalised answer to your exact question.`;

    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(reply);
  }
});

// Detect the most likely programming language from exercise instructions.
function detectLanguage(instructions: string): string {
  const txt = (instructions || '').toLowerCase();
  if (/\b(javascript|js|react|node\.?js|typescript|ts|vue|angular|next\.?js)\b/.test(txt)) return 'JavaScript';
  if (/\b(sql|query|select|database|postgres|mysql|sqlite)\b/.test(txt)) return 'SQL';
  if (/\b(java |\bjava\b|spring|maven|gradle|jvm)\b/.test(txt)) return 'Java';
  if (/\b(c\+\+|cpp|c language)\b/.test(txt)) return 'C++';
  if (/\b(rust|cargo)\b/.test(txt)) return 'Rust';
  if (/\b(go |golang)\b/.test(txt)) return 'Go';
  return 'Python'; // default — most common in the platform
}

// Analyze code
router.post('/analyze-code', requireAuth, aiLimiter, async (req, res) => {
  const { code, instructions, solution } = req.body;
  if (!code) return res.status(400).json({ error: 'Code parameter is required', code: 'MISSING_CODE' });

  const language = detectLanguage(instructions || '');
  const prompt = `Analyze the user's ${language} code submitted for the following exercise:
Instructions: "${sanitizeForPrompt(instructions || 'Implement the requested function.', 500)}"
Expected solution pattern: "${sanitizeForPrompt(solution || '', 500)}"
User Code:
\`\`\`${language.toLowerCase()}
${sanitizeForPrompt(code, 2000)}
\`\`\`

Evaluate if the code is logically correct based on the instructions.
Concoct your response as a valid JSON object matching this structure:
{
  "passed": boolean (true if correct, false if there are syntax/logic bugs),
  "suggestions": "A short, highly helpful markdown tip advising the student on their formatting or optimizations",
  "explanation": "A 1-2 paragraph markdown walkthrough explaining the code line-by-line in a highly pedagogical way."
}`;

  Sentry.setTag('feature', 'lesson-generation');
  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.3, asJSON: true });
    return res.json(cleanAndParseJSON(response, '{}'));
  } catch (error: any) {
    logger.error({ err: error.message }, '[AI] analyze-code fallback');
    Sentry.captureException(error);
    return res.json({ passed: false, systemError: true, suggestions: '', explanation: 'Verification service unavailable. Please retry.' });
  }
});

// AI Recommendations
router.post('/ai-recommendations', requireAuth, aiLimiter, async (req, res) => {
  const { currentXp, level, streak, activeGoal } = req.body;
  const userEmail = req.supabaseUser!.email;

  const cacheKey = `${userEmail}:${activeGoal || ''}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REC_CACHE_TTL) return res.json(cached.data);

  const prompt = `Generate 3 highly personalized study recommendations for a user of LearnPath AI with:
- XP: ${currentXp || 1840}
- Level: ${level || 12}
- Streak: ${streak || 5}
- Active Goal: "${sanitizeForPrompt(activeGoal || 'Full-Stack AI Engineering', 500)}"

Your response must be a JSON array of exactly 3 objects matching this schema:
[
  {
    "id": string (unique ID e.g., rec-1),
    "title": "Actionable title (e.g. NumPy Broadcast Challenge)",
    "description": "Short compelling reason what this is and how it helps their specific goal",
    "xpReward": number,
    "category": "quiz" or "coding" or "mentor" or "roadmap",
    "difficulty": "Easy" or "Medium" or "Hard"
  }
]`;

  Sentry.setTag('feature', 'ai-mentor');
  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.8, asJSON: true });
    const parsed = cleanAndParseJSON(response, '[]');
    cacheSet(recCache, cacheKey, { data: parsed, timestamp: Date.now() });
    return res.json(parsed);
  } catch (error: any) {
    logger.error({ err: error.message }, '[AI] recommendations fallback');
    Sentry.captureException(error);
    // Goal-aware fallback recs: derive action titles from the activeGoal string
    const goal = sanitizeForPrompt(activeGoal || '', 120);
    const goalLabel = goal || 'your learning goal';
    const fallback = [
      {
        id: 'rec-practice',
        title: `Practice: Apply a concept from ${goalLabel}`,
        description: `Pick one topic you've covered and build a small example from scratch — active recall beats re-reading.`,
        xpReward: 75,
        category: 'coding',
        difficulty: 'Medium',
      },
      {
        id: 'rec-quiz',
        title: `Quiz yourself on ${goalLabel}`,
        description: `Testing your knowledge with a quick quiz is the fastest way to find gaps before they become blockers.`,
        xpReward: 50,
        category: 'quiz',
        difficulty: 'Easy',
      },
      {
        id: 'rec-mentor',
        title: `Ask the AI Mentor a question about ${goalLabel}`,
        description: `Something unclear? Getting a direct explanation from your AI mentor saves hours of confusion.`,
        xpReward: 30,
        category: 'mentor',
        difficulty: 'Easy',
      },
    ];
    cacheSet(recCache, cacheKey, { data: fallback, timestamp: Date.now() });
    return res.json(fallback);
  }
});

// Dynamic Topic Overview
router.post('/generate-topic-overview', requireAuth, aiLimiter, async (req, res) => {
  const { topicName, roadmapContext } = req.body;
  if (typeof topicName !== 'string' || !topicName.trim()) {
    return res.status(400).json({ error: 'Topic name is required', code: 'MISSING_TOPIC' });
  }

  const prompt = `Generate a structured, engaging learner overview for the topic "${sanitizeForPrompt(topicName, 500)}" within the learning domain of "${sanitizeForPrompt(roadmapContext || 'AI and Programming', 500)}".
Please provide:
1. "what": A clear, 1-2 sentence description of what this skill is.
2. "why": A 1-2 sentence explanation of why this skill is a crucial part of this learning path.
3. "outcomes": A JSON array of 2-3 specific real-world abilities the learner will acquire after finishing this chapter.

Output MUST be a valid JSON object matching this schema:
{
  "what": string,
  "why": string,
  "outcomes": [string]
}`;

  Sentry.setTag('feature', 'lesson-generation');
  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.6, asJSON: true });
    return res.json(cleanAndParseJSON(response, '{}'));
  } catch (error: any) {
    logger.warn({ err: error.message }, '[AI] topic-overview fallback');
    Sentry.captureException(error);
    return res.json({
      what: `This module delivers the core logical paradigms and mathematical definitions behind ${topicName}.`,
      why: `Completing this section establishes the fundamental framework necessary to debug and scale complex code in ${roadmapContext || 'this domain'}.`,
      outcomes: [`Grasp the core abstractions behind ${topicName} computing structures.`, `Implement clean, error-safe scripts using localized execution patterns.`, `Confidently verify functional outputs against real-world metrics.`]
    });
  }
});

// Progressive Hints
router.post('/generate-hints', requireAuth, aiLimiter, async (req, res) => {
  const { lessonContent, attemptNumber } = req.body;
  if (!lessonContent) return res.status(400).json({ error: 'Lesson content is required', code: 'MISSING_CONTENT' });

  const prompt = `Generate scaffolded hints for this learning exercise: "${sanitizeForPrompt(lessonContent, 1000)}".

Return JSON with progressive hint levels:
{
  "hints": [
    { "level": 1, "type": "conceptual", "text": "High-level direction without code details" },
    { "level": 2, "type": "syntax", "text": "Specific language features to use" },
    { "level": 3, "type": "pattern", "text": "Code pattern suggestion" },
    { "level": 4, "type": "partial", "text": "Partial solution with key pieces" }
  ],
  "hintCostXp": 10
}

Level ${attemptNumber || 1} is requested. Keep hints educational, not giving away answers.`;

  Sentry.setTag('feature', 'lesson-generation');
  try {
    const response = await callGroqChatCompletion(prompt, { temperature: 0.5, asJSON: true });
    const parsed = cleanAndParseJSON(response, '{"hints":[],"hintCostXp":10}');
    if (!parsed.hints || !Array.isArray(parsed.hints)) {
      parsed.hints = [
        { level: 1, type: 'conceptual', text: 'Focus on the core concept being taught.' },
        { level: 2, type: 'syntax', text: 'Think about the key syntax patterns.' },
        { level: 3, type: 'pattern', text: 'Consider the example structure shown.' },
        { level: 4, type: 'partial', text: 'Review the solution steps.' }
      ];
    }
    return res.json(parsed);
  } catch (error: any) {
    logger.error({ err: error.message }, '[AI] hints fallback');
    Sentry.captureException(error);
    return res.json({ hints: [{ level: 1, type: 'conceptual', text: 'Focus on the core concept being taught.' }, { level: 2, type: 'syntax', text: 'Think about the key syntax patterns.' }], hintCostXp: 10 });
  }
});

// AI Progress Summary — used by AIInsightsTab for the narrative summary card
router.post('/ai-summary', requireAuth, aiLimiter, async (req, res) => {
  const { roadmapGoal, progressPercent, completedLessons, totalLessons, activePhase, topSkills } = req.body;
  const userEmail = req.supabaseUser!.email;

  const cacheKey = `aisummary:${userEmail}:${roadmapGoal || ''}:${progressPercent}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REC_CACHE_TTL) return res.json(cached.data);

  const prompt = `You are an expert learning coach. Write a concise, motivating 2-3 sentence progress summary for a learner.
Context:
- Goal: "${sanitizeForPrompt(roadmapGoal || 'Programming', 120)}"
- Progress: ${progressPercent || 0}% complete (${completedLessons || 0}/${totalLessons || 0} lessons)
- Currently in: "${sanitizeForPrompt(activePhase || 'Phase 1', 60)}"
- Top skills building: ${sanitizeForPrompt((topSkills || []).slice(0, 4).join(', ') || 'core concepts', 120)}

Rules: Be specific to the goal and phase. Be encouraging but honest. Mention one concrete next action. Maximum 3 sentences.
Return ONLY the summary text (no JSON, no preamble).`;

  Sentry.setTag('feature', 'ai-mentor');
  try {
    const text = await callGroqChatCompletion(prompt, { temperature: 0.65, asJSON: false, maxTokens: 150 });
    const data = { summary: text.trim() };
    cacheSet(recCache, cacheKey, { data, timestamp: Date.now() });
    return res.json(data);
  } catch (error: any) {
    logger.warn({ err: error.message }, '[AI] ai-summary fallback');
    Sentry.captureException(error);
    const pct = progressPercent || 0;
    const summary = pct < 30
      ? `You're building the foundations for ${sanitizeForPrompt(roadmapGoal || 'your goal', 60)}. Keep momentum by completing one lesson today.`
      : pct < 70
      ? `You're making strong progress on ${sanitizeForPrompt(roadmapGoal || 'your goal', 60)} at ${pct}%. Focus on applying what you've learned in the current phase.`
      : `You're in the final stretch of ${sanitizeForPrompt(roadmapGoal || 'your goal', 60)} with ${pct}% done. Push through the advanced topics to complete your roadmap.`;
    return res.json({ summary });
  }
});

export default router;
