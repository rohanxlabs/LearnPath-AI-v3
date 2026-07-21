import { Router } from 'express';
import { requireAuth, aiLimiter } from '../lib/middleware';
import { callOpenRouterChatCompletion, cleanAndParseJSON, sanitizeForPrompt } from '../lib/ai';
import { recCache, REC_CACHE_TTL } from '../lib/db';

const router = Router();

// Generate projects
router.post('/generate-projects', aiLimiter, requireAuth, async (req, res) => {
  const { goal, phases } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required for project generation' });

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

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.7, asJSON: true });
    const parsed = cleanAndParseJSON(response, '{"projects":[]}');
    return res.json({ projects: parsed.projects || [] });
  } catch (error: any) {
    console.error('[AI-Fallback] /api/generate-projects fallback:', error.message);
    return res.json({ projects: [] });
  }
});

// AI Mentor Chat
router.post('/mentor-chat', aiLimiter, requireAuth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message payload is required' });

  try {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured');

    const messages: Array<{ role: string; content: string }> = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        messages.push({ role: h.sender === 'user' ? 'user' : 'assistant', content: sanitizeForPrompt(h.text || '', 500) });
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
    const responseText = await callOpenRouterChatCompletion(prompt, {
      temperature: 0.5,
      systemPrompt: systemInstruction,
    });

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(responseText);
  } catch (error: any) {
    console.error('OpenRouter Chat Error:', error.message);
    const lowercaseMessage = message.toLowerCase();
    let reply = `### AI Mentor Ready to Help 🤖\n\nYou asked: *"${sanitizeForPrompt(message)}"* - let me break this down!\n\n**My Approach**:\n- **Explain**: Concepts in plain English with practical analogies\n- **Show**: Code examples with line-by-line walkthroughs\n- **Practice**: Quick exercises to reinforce learning\n- **Extend**: Next steps and pro tips\n\n**Quick Exercise**: Pick any AI topic - I'll give you a 3-minute hands-on task\n**Next Step**: Share what you're learning, and I'll suggest a personalized path\n**Pro Tip**: Active recall (quizzing yourself) beats passive reading 3x for retention`;

    if (lowercaseMessage.includes('python')) reply = `### Python for AI Mastery 🐍\n\nPython is the foundation of modern AI development.\n\n**Key Points**:\n- NumPy Vectorization: Replace slow loops with array operations\n- Pandas DataFrames: Handle structured data efficiently\n- Object-Oriented Patterns: Write reusable ML components\n\n**Quick Exercise**: Write NumPy array subtraction to compute MSE\n**Next Step**: Explore PyTorch tensor operations\n**Pro Tip**: Always vectorize — avoid native Python loops in numerical code`;

    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(reply);
  }
});

// Analyze code
router.post('/analyze-code', aiLimiter, requireAuth, async (req, res) => {
  const { code, instructions, solution } = req.body;
  if (!code) return res.status(400).json({ error: 'Code parameter is required' });

  const prompt = `Analyze the user's Python code submitted for the following exercise:
Instructions: "${sanitizeForPrompt(instructions || 'Implement a basic metrics calculator.', 500)}"
Expected solution pattern: "${sanitizeForPrompt(solution || '', 500)}"
User Code:
\`\`\`python
${sanitizeForPrompt(code, 2000)}
\`\`\`

Evaluate if the code is logically correct based on the instructions.
Concoct your response as a valid JSON object matching this structure:
{
  "passed": boolean (true if correct, false if there are syntax/logic bugs),
  "suggestions": "A short, highly helpful markdown tip advising the student on their formatting or optimizations",
  "explanation": "A 1-2 paragraph markdown walkthrough explaining the code line-by-line in a highly pedagogical way."
}`;

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.3, asJSON: true });
    return res.json(cleanAndParseJSON(response, '{}'));
  } catch (error: any) {
    console.error('OpenRouter Code Analysis fallback activation:', error.message);
    return res.json({ passed: false, systemError: true, suggestions: '', explanation: 'Verification service unavailable. Please retry.' });
  }
});

// AI Recommendations
router.post('/ai-recommendations', aiLimiter, requireAuth, async (req, res) => {
  const { currentXp, level, streak, activeGoal } = req.body;
  const userEmail = req.session.userEmail!;

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

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.8, asJSON: true });
    const parsed = cleanAndParseJSON(response, '[]');
    recCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    return res.json(parsed);
  } catch (error: any) {
    console.error('OpenRouter recommendations fallback:', error.message);
    const fallback = [
      { id: 'rec-numpy', title: 'Complete: NumPy Index Exercises', description: 'Level up your Python status by completing vector slice operations.', xpReward: 75, category: 'coding', difficulty: 'Medium' },
      { id: 'rec-quiz', title: 'Quiz: Neural Forward Propagation', description: 'Prove your Foundations awareness! Complete the 4-question checkpoint.', xpReward: 50, category: 'quiz', difficulty: 'Easy' },
      { id: 'rec-mentor', title: 'Ask AI Mentor about MCP Specs', description: 'Explore Model Context Protocol schemas by asking our AI tutor.', xpReward: 30, category: 'mentor', difficulty: 'Hard' }
    ];
    recCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return res.json(fallback);
  }
});

// Dynamic Topic Overview
router.post('/generate-topic-overview', requireAuth, async (req, res) => {
  const { topicName, roadmapContext } = req.body;
  if (!topicName) return res.status(400).json({ error: 'Topic name is required' });

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

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.6, asJSON: true });
    return res.json(cleanAndParseJSON(response, '{}'));
  } catch (error: any) {
    console.warn('OpenRouter Topic Overview generator fallback:', error.message);
    return res.json({
      what: `This module delivers the core logical paradigms and mathematical definitions behind ${topicName}.`,
      why: `Completing this section establishes the fundamental framework necessary to debug and scale complex code in ${roadmapContext || 'this domain'}.`,
      outcomes: [`Grasp the core abstractions behind ${topicName} computing structures.`, `Implement clean, error-safe scripts using localized execution patterns.`, `Confidently verify functional outputs against real-world metrics.`]
    });
  }
});

// Progressive Hints
router.post('/generate-hints', aiLimiter, requireAuth, async (req, res) => {
  const { lessonContent, attemptNumber } = req.body;
  if (!lessonContent) return res.status(400).json({ error: 'Lesson content is required' });

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

  try {
    const response = await callOpenRouterChatCompletion(prompt, { temperature: 0.5, asJSON: true });
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
    console.error('Hints generation fallback:', error.message);
    return res.json({ hints: [{ level: 1, type: 'conceptual', text: 'Focus on the core concept being taught.' }, { level: 2, type: 'syntax', text: 'Think about the key syntax patterns.' }], hintCostXp: 10 });
  }
});

export default router;
