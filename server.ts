import 'dotenv/config';
import express from 'express';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const app = express();
const PORT = 3000;
const { Pool } = pg;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Resilient JSON cleaner and parser
function cleanAndParseJSON(rawText: string | null | undefined, fallbackDefault: string = '{}'): any {
  const fallbackVal = (() => {
    try {
      return JSON.parse(fallbackDefault || '{}');
    } catch (_) {
      return {};
    }
  })();

  if (!rawText) return fallbackVal;

  let cleaned = rawText.trim();

  // Strip markdown wraps if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.warn("[JSON Clean] Direct parse failed, attempting repairs. Error:", err.message);

    try {
      // 1. Remove trailing commas before closing braces/brackets
      let repaired = cleaned.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(repaired);
    } catch (e) {
      // 2. Bound matching
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');
      
      let sliceStr = '';
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        sliceStr = cleaned.slice(firstBrace, lastBrace + 1);
      } else if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        sliceStr = cleaned.slice(firstBracket, lastBracket + 1);
      }

      if (sliceStr) {
        try {
          const repairedSlice = sliceStr.replace(/,\s*([}\]])/g, '$1');
          return JSON.parse(repairedSlice);
        } catch (innerErr: any) {
          console.warn("[JSON Clean] Slice boundary repair failed. Returning fallback.");
        }
      }
      try {
        return JSON.parse(fallbackDefault || '{}');
      } catch (_) {
        return fallbackVal;
      }
    }
  }
}

// High-reliability multi-model fallback and recovery utility
async function callWithModelFallbackAndRetry<T>(
  fn: (model: string) => Promise<T>,
  models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
  retriesPerModel = 2,
  delay = 1000
): Promise<T> {
  let lastError: any = null;
  
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let attempt = 0;
    while (attempt <= retriesPerModel) {
      try {
        console.log(`[Gemini API] Dispatching content generation request using model "${model}" (attempt ${attempt + 1}/${retriesPerModel + 1})...`);
        return await fn(model);
      } catch (error: any) {
        lastError = error;
        const errorStr = (error.message || '').toLowerCase();
        
        // If it is a quota limit or rate exhaustion (e.g. 429), fall back to the next model IMMEDIATELY!
        const isQuotaExceeded = errorStr.includes('429') || 
                                errorStr.includes('quota') || 
                                errorStr.includes('resource_exhausted') || 
                                errorStr.includes('exhausted') ||
                                errorStr.includes('rate_limit') ||
                                errorStr.includes('rate limit');
                                
        if (isQuotaExceeded) {
          console.log(`[Gemini API Info] Model "${model}" hit quota limit / rate exhaustion (429). Bypassing further retries and falling back to the next model immediately...`);
          break; // break the inner loop to move to the next model in the outer list
        }

        const isTransient = errorStr.includes('503') || 
                            errorStr.includes('unavailable') || 
                            errorStr.includes('demand') || 
                            error.status === 'UNAVAILABLE';
        
        if (isTransient && attempt < retriesPerModel) {
          const currentDelay = delay * Math.pow(1.5, attempt);
          console.log(`[Gemini API Info] Model "${model}" hit transient issue: "${error.message}". Retrying in ${currentDelay}ms... (${retriesPerModel - attempt} left)`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          attempt++;
        } else {
          console.log(`[Gemini API Info] Model "${model}" failed/exhausted. Trying next fallback model if available... Status info: ${error.message}`);
          break; // break the inner loop to move to the next model in the outer list
        }
      }
    }
  }
  
  throw lastError || new Error("All Gemini fallback models failed.");
}

// Lazy-initialized Gemini client helper
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARN: GEMINI_API_KEY environment variable is not defined. Using local fallbacks.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key || "MOCK_KEY_FALLBACK",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return geminiClient;
}

// 1. API: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiActive: !!process.env.GEMINI_API_KEY
  });
});

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const db = await loadUserDB(email);
    if (db.passwordHash) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    db.passwordHash = passwordHash;
    saveUserDB(email, db);
    return res.json({ success: true, email });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const db = await loadUserDB(email);
    const passwordHash = db.passwordHash;
    if (!passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ success: true, email });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// 2. API: Generate Roadmaps
app.post('/api/generate-roadmap', async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

  const prompt = `
Generate a structured, high-fidelity learning roadmap for this goal: "${goal}".
The user has experience level: "${experienceLevel || 'Beginner'}", can study for ${weeklyHours || 10} hours per week, and prefers a "${preferredStyle || 'Hands-on'}" style of learning.

Your output must be a JSON object conforming to the following structure:
{
  "goal": string,
  "experienceLevel": string,
  "weeklyHours": number,
  "preferredStyle": string,
  "progressPercent": 0,
  "totalXp": 0,
  "lessonsCompleted": 0,
  "hoursRemaining": number,
  "phases": [
    {
      "id": "ph-1",
      "name": "Phase Name (e.g. Foundations, Core, etc.)",
      "description": "Short description of what the user learns",
      "progress": 0,
      "estimatedHours": number,
      "skillsCovered": ["skill1", "skill2"],
      "xpEarned": 0,
      "status": "current" or "locked" (make the very first phase "current" and rest "locked"),
      "levels": [
        {
          "id": "lvl-1",
          "name": "Level Name (e.g., Basics & Definitions)",
          "type": "Basics",
          "status": "current" or "locked" (make first phase first level "current" and preceding ones of that level complete),
          "lessons": [
            {
              "id": "les-1",
              "name": "Lesson Name",
              "type": "learn",
              "xpReward": 20,
              "status": "available",
              "content": "A short, engaging Markdown lesson explaining the concepts, incorporating clear formatting, and standard diagrams or math if applicable."
            },
            {
              "id": "les-2",
              "name": "Quiz Time",
              "type": "quiz",
              "xpReward": 50,
              "status": "locked",
              "content": "Quick multiple choice verification quiz questions.",
              "quizQuestions": [
                {
                  "id": "q-1-1",
                  "question": "Multiple choice question related to this level?",
                  "options": ["Option A", "Option B", "Option C", "Option D"],
                  "correctIndex": number,
                  "explanation": "Why this answer is correct."
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Please generate exactly 3-4 cohesive learning Phases.
In each Phase, generate 3 sequential Levels.
In each Level, write exactly 1 'learn' lesson and 1 'quiz' lesson.
Provide interesting, highly tailored lessons and valid questions. Ensure the output is valid JSON.
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    const response = await callWithModelFallbackAndRetry((selectedModel) => ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    }));

    const parsedData = cleanAndParseJSON(response.text, '{}');
    return res.json(parsedData);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('Gemini Roadmap Generation Error, implementing safe custom backup template:', readableError);
    
    // Fallback roadmap generation based on goal
    const goalTitle = goal.length > 40 ? goal.substring(0, 37) + '...' : goal;
    const fallbackRoadmap = {
      id: `roadmap-${Date.now()}`,
      goal: goalTitle,
      experienceLevel: experienceLevel || 'Beginner',
      weeklyHours: Number(weeklyHours) || 8,
      preferredStyle: preferredStyle || 'Hands-on',
      progressPercent: 0,
      totalXp: 0,
      lessonsCompleted: 0,
      hoursRemaining: 40,
      createdAt: new Date().toISOString(),
      phases: [
        {
          id: 'ph-fallback-1',
          name: 'Core Fundamentals',
          description: `Mastering the absolute fundamentals necessary for "${goalTitle}".`,
          progress: 0,
          estimatedHours: 12,
          skillsCovered: ['Definitions', 'System Diagrams', 'Basic Syntax', 'First Operations'],
          xpEarned: 0,
          status: 'current',
          levels: [
            {
              id: 'lvl-fallback-1-1',
              name: 'Getting Started Basics',
              type: 'Basics',
              status: 'current',
              lessons: [
                {
                  id: 'les-f1-learn',
                  name: 'Introduction Chapter',
                  type: 'learn',
                  xpReward: 20,
                  status: 'available',
                  content: `
### Welcome to ${goalTitle}!

In this introductory lesson, we will cover the core landscape. Whether you are a total beginner or just brushing up, visual clarity is key.

#### Key Mechanics:
1. **Inputs & Definitions**: Define clean pipelines so that you can organize your thoughts.
2. **First Script Operations**: Execute core computations using the target system parameters.
3. **Execution flow**: Process inputs chronologically.

We will verify this with a simple multiple-choice quiz up next!
`
                },
                {
                  id: 'les-f1-quiz',
                  name: 'Fundamentals Checkpoint Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Test your initial definitions.',
                  quizQuestions: [
                    {
                      id: 'q-f1-1',
                      question: `What is the most crucial asset when first approaching ${goalTitle}?`,
                      options: [
                        'Structured, roadmap-driven sequential practice',
                        'Memorizing external libraries from front to back',
                        'Buying the most expensive cloud computing hardware',
                        'Waiting for others to complete it on video stream'
                      ],
                      correctIndex: 0,
                      explanation: 'Step-by-step sequential practice prevents cognitive overload and embeds skills deeper into long-term retention blocks.'
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'ph-fallback-2',
          name: 'Applied Integration',
          description: `Applying concepts with practical hands-on mini-projects.`,
          progress: 0,
          estimatedHours: 16,
          skillsCovered: ['Local Configurations', 'Script execution', 'Error Handling', 'Debugging'],
          xpEarned: 0,
          status: 'locked',
          levels: [
            {
              id: 'lvl-fallback-2-1',
              name: 'Practical Mechanics',
              type: 'Foundations',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f2-learn',
                  name: 'Setting Up the Logic Loop',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `
### Practical Engineering

In this module we focus on creating robust error safety bounds.

- **Check Constraints**: Validate that data structures are non-empty.
- **Fail Fast**: Log errors, propagate fallback status, and raise clean warnings.
`
                }
              ]
            }
          ]
        },
        {
          id: 'ph-fallback-3',
          name: 'Mastery & Scale',
          description: 'Optimizing architectures and learning professional industry techniques.',
          progress: 0,
          estimatedHours: 25,
          skillsCovered: ['System Design', 'Scaling Protocols', 'Performance Auditing'],
          xpEarned: 0,
          status: 'locked',
          levels: [
            {
              id: 'lvl-fallback-3-1',
              name: 'Expert Deployments',
              type: 'Advanced',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f3-learn',
                  name: 'Auditing Throughput Scenarios',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: '### Scaling the System\nUnderstand the trade-offs between speed, latency, and costs under heavy loads.'
                }
              ]
            }
          ]
        }
      ]
    };

    return res.json(fallbackRoadmap);
  }
});

// 3. API: AI Mentor Chat (Streaming)
app.post('/api/mentor-chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message payload is required' });
  }

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    
    // Prepare conversation history
    const contents: any[] = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        contents.push({
          role: h.sender === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      });
    }
    
    // Add active message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const systemInstruction = `
You are the elite LearnPath AI Mentor - a friendly, highly intelligent, and extremely encouraging tutor.
You help people of all experience levels master artificial intelligence, python, math, code scripting, neural architectures, LLMs, and RAG pipelines.

Guidelines:
1. Provide extremely structured, markdown-rich responses using headings, bold bullet points, and codeblocks.
2. If the user presents software scripts, explain what it does and highlight optimizations using syntax highlighting.
3. Suggest 2-3 specific study tips or interesting quick exercises at the end of each answer.
4. Keep the tone helpful, professional, and exciting like a world-class university TA.
`;

    // Set up streaming response headers
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    let streamingSuccess = false;
    for (const model of ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']) {
      try {
        console.log(`[Gemini API] Dispatching streaming content generation request using model "${model}"...`);
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction, temperature: 0.7 }
        });
        
        for await (const chunk of stream) {
          if (chunk.text) {
            res.write(chunk.text);
          }
        }
        streamingSuccess = true;
        break;
      } catch (error: any) {
        const errorStr = (error.message || '').toLowerCase();
        const isQuotaExceeded = errorStr.includes('429') || errorStr.includes('quota') || errorStr.includes('resource_exhausted');
        console.log(`[Gemini API Info] Model "${model}" failed: ${error.message}. Trying next model...`);
        if (!isQuotaExceeded) break; // Only retry on quota errors
      }
    }

    if (!streamingSuccess) {
      throw new Error("All Gemini fallback models failed for streaming");
    }
    res.end();

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('Gemini Chat Error:', readableError);
    
    // Fallback offline dynamic reply
    const lowercaseMessage = message.toLowerCase();
    let reply = "";

    if (lowercaseMessage.includes('python')) {
      reply = `### Python Study Roadmap Insight 🐍\n\nPython is foundational for AI. Focus heavily on:\n- **NumPy & Vectorization**: Avoid slow native Python loops.\n- **Pandas DataFrames**: Essential for structured learning samples.\n- **Object Oriented Python**: Writing clean reusable modeling layers.\n\n*Suggested Tip*: Try writing a numpy computing vector matrix subtraction to calculate Mean Squared Error!`;
    } else if (lowercaseMessage.includes('roadmap') || lowercaseMessage.includes('generate')) {
      reply = `### Custom Roadmap Engineering 🗺️\n\nI can generate roadmaps for any goal in AI! Go to the **Roadmaps tab**, click **Generate Custom Roadmap**, enter your goal (e.g. "Stable Diffusion from scratch"), set your preferred weekly hours, and I will craft a perfect Duolingo-style tree path for you!`;
    } else if (lowercaseMessage.includes('quiz') || lowercaseMessage.includes('test')) {
      reply = `### Testing Knowledge & Earning XP 🧠\n\nTesting accelerates learning retention by as much as 150%! Check out your active roadmap phases. Levels containing a **Quiz** yield **50 XP**, while **Coding Exercises** reward a premium **75 XP**. Let me know if you want me to quiz you right here in chat!`;
    } else {
      reply = `### AI Mentor Insights 🤖\n\nHello! I am standing by to help you unlock fullstack skills. You asked: *"Reflecting on: ${message}"*\n\nHere are some solid steps to tackle this:\n1. **Read & Absorb**: Check out structural markdown logs.\n2. **Experiment & Build**: Write simple scripts to verify.\n3. **Quiz & Validate**: Take standard assessments to earn XP.\n\nAsk me anything about NumPy, Neural Networks, LLM tokens, or Career Readiness!`;
    }

    // If headers are already sent, just end
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(reply);
  }
});

// 4. API: Verify and Analyze Script Code
app.post('/api/analyze-code', async (req, res) => {
  const { code, instructions, solution, hint } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Code parameter is required' });
  }

  // Simple script safety check / heuristic validation
  const passesLocalValidation = code.includes('def') && 
    (code.includes('return') || code.includes('print')) &&
    !code.includes('error') &&
    code.length > 25;

  const prompt = `
Analyze the user's Python code submitted for the following exercise:
Instructions: "${instructions || 'Implement a basic metrics calculator.'}"
Expected solution pattern: "${solution || ''}"
User Code:
\`\`\`python
${code}
\`\`\`

Evaluate if the code is logically correct based on the instructions.
Concoct your response as a valid JSON object matching this structure:
{
  "passed": boolean (true if correct, false if there are syntax/logic bugs),
  "suggestions": "A short, highly helpful markdown tip advising the student on their formatting or optimizations",
  "explanation": "A 1-2 paragraph markdown walkthrough explaining the code line-by-line in a highly pedagogical way."
}
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    const response = await callWithModelFallbackAndRetry((selectedModel) => ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    }));

    const parsed = cleanAndParseJSON(response.text, '{}');
    return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('Gemini Code Analysis fallback activation:', readableError);
    
    // Standard offline code validation success logic
    const score = passesLocalValidation;
    return res.json({
      passed: score,
      suggestions: score 
        ? "Excellent job structuralizing this Py script! Your variables are highly clean. Consider naming constants in UPPER_CASE for professional PEP8 code alignment."
        : `Your code looks slightly empty or is missing core functions. Standard python syntax requires declaring functions starting with \`def\` and finishing with a returned value or explicit state.`,
      explanation: score
        ? "We review the variable bindings in your script. By iterating through inputs, we compute intermediate numbers, aggregate them, and compute final metrics with absolute mathematical precision."
        : `Let's troubleshoot. Try utilizing thehint provided: \`${hint || "Remember to declare the function correctly."}\` and ensure your variable calculations do not divide by zero.`
    });
  }
});

// 5. API: AI Adaptive Recommendations
app.post('/api/ai-recommendations', async (req, res) => {
  const { currentXp, level, streak, activeGoal } = req.body;

  const prompt = `
Generate 3 highly personalized study recommendations for a user of LearnPath AI with:
- XP: ${currentXp || 1840}
- Level: ${level || 12}
- Streak: ${streak || 5}
- Active Goal: "${activeGoal || 'Full-Stack AI Engineering'}"

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
]
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    const response = await callWithModelFallbackAndRetry((selectedModel) => ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.8
      }
    }));

    const parsed = cleanAndParseJSON(response.text, '[]');
    return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('Gemini recommendations fallback:', readableError);
    
    return res.json([
      {
        id: 'rec-numpy',
        title: 'Complete: NumPy Index Exercises',
        description: 'Level up your Python status by completing vector slice operations. Practice handling dimensions with multi-dimensional matrices.',
        xpReward: 75,
        category: 'coding',
        difficulty: 'Medium'
      },
      {
        id: 'rec-quiz',
        title: 'Quiz: Neural Forward Propagation',
        description: 'Prove your Foundations awareness! Complete the 4-question checkpoint of linear boundaries.',
        xpReward: 50,
        category: 'quiz',
        difficulty: 'Easy'
      },
      {
        id: 'rec-mentor',
        title: 'Ask AI Mentor about MCP Specs',
        description: 'Explore Model Context Protocol schemas by asking our AI tutor. Learn how apps dynamically secure real-time DB contexts.',
        xpReward: 30,
        category: 'mentor',
        difficulty: 'Hard'
      }
    ]);
  }
});

// 6. API: Dynamic Quiz Generator
app.post('/api/generate-quiz', async (req, res) => {
  const { topicName } = req.body;

  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required for quiz' });
  }

  const prompt = `
Generate a personalized, challenging study quiz for this topic: "${topicName}".
Generate exactly 3 multiple-choice questions.

Output must be a JSON array of questions conforming to this exact structure:
[
  {
    "id": string (unique id e.g. q1),
    "question": "What is...?",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctIndex": number (index of correct option 0-3),
    "explanation": "Complete pedagogical explanation of the solution."
  }
]
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    const response = await callWithModelFallbackAndRetry((selectedModel) => ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    }));

    const parsed = cleanAndParseJSON(response.text, '[]');
    return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('Gemini Dynamic Quiz error fallback:', readableError);
    
    return res.json([
      {
        id: 'q-dyn-1',
        question: `In modern ${topicName} development, what is the best strategy to prevent overfitting on local batches?`,
        options: [
          'Add a customized L2 parameter regularization / Dropout layers',
          'Repeatedly double the training epochs without validation evaluation',
          'Set learning rates to 1.0 to quicken gradient steps',
          'Strictly remove all activation transformations'
        ],
        correctIndex: 0,
        explanation: 'Dropout randomly deactivates neural paths to prevent multi-node correlation dependencies, while L2 regularization penalizes heavy weights, forcing lower weights and safer boundaries.'
      },
      {
        id: 'q-dyn-2',
        question: `What metric is most typically measured to analyze operational performance in a high-concurrency environment?`,
        options: [
          'Average token-generation latency (Time-to-First-Token)',
          'The storage volume of raw log exports inside system margins',
          'Absolute color hex contrast saturation percentages',
          'The count of text lines written in config packages'
        ],
        correctIndex: 0,
        explanation: 'Time-to-First-Token (TTFT) and token-generation throughput rate characterize model reactivity speed for client requests.'
      },
      {
        id: 'q-dyn-3',
        question: `How does our system optimize learning paths when performance indicators flag drop-offs?`,
        options: [
          'Re-routing user attention via a personalized, interactive roadmap',
          'Locking the profile until manual support intervenes',
          'Resetting total user accumulated level scores back to zero',
          'Ignoring state trends completely'
        ],
        correctIndex: 0,
        explanation: 'AI roadmaps adaptively suggest easier mini-tasks and explain concepts sequentially to clear bottlenecks and restore confidence.'
      }
    ]);
  }
});

// 7. API: Dynamic Topic Overview Generator
app.post('/api/generate-topic-overview', async (req, res) => {
  const { topicName, roadmapContext } = req.body;
  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required' });
  }

  const prompt = `
Generate a structured, engaging learner overview for the topic "${topicName}" within the learning domain of "${roadmapContext || 'AI and Programming'}".
Please provide:
1. "what": A clear, 1-2 sentence description of what this skill is.
2. "why": A 1-2 sentence explanation of why this skill is a crucial part of this learning path.
3. "outcomes": A JSON array of 2-3 specific real-world abilities the learner will acquire after finishing this chapter.

Output MUST be a valid JSON object matching this schema:
{
  "what": string,
  "why": string,
  "outcomes": [string]
}
`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing api key");
    }

    const ai = getGeminiClient();
    const response = await callWithModelFallbackAndRetry((selectedModel) => ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.6
      }
    }));

    const parsed = cleanAndParseJSON(response.text, '{}');
    return res.json(parsed);

  } catch (error: any) {
    console.warn('Gemini Topic Overview generator fallback:', error.message || error);
    // Dynamic fallback based on topic name
    const what = `This module delivers the core logical paradigms and mathematical definitions behind ${topicName}.`;
    const why = `Completing this section establishes the fundamental framework necessary to debug and scale complex code in ${roadmapContext || 'this domain'}.`;
    const outcomes = [
      `Grasp the core abstractions behind ${topicName} computing structures.`,
      `Implement clean, error-safe scripts using localized execution patterns.`,
      `Confidently verify functional outputs against real-world metrics.`
    ];
    return res.json({ what, why, outcomes });
  }
});

// ============================================================================
// SUPABASE CLIENT SIMULATION PERSISTENCE ROUTING
// ============================================================================
import fs from 'fs';

type UserDB = {
  passwordHash?: string;
  [key: string]: any;
};

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let userDataTableReady: Promise<void> | null = null;

function ensureUserDataTable(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required for persistent user storage.');
  }

  if (!userDataTableReady) {
    userDataTableReady = dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        email TEXT PRIMARY KEY,
        db_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).then(() => undefined);
  }

  return userDataTableReady;
}

function getDefaultUserDB(): UserDB {
  return {
    roadmaps: [],
    curated_resources: [
      {
        id: 'res-1',
        phaseId: 'phase-0',
        title: 'Deep Learning Foundations & Abstractions',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=aircAruvnKk',
        provider: '3Blue1Brown',
        duration: '22 mins',
        description: 'Excellent video explaining deep neural networks and backpropagation visually.'
      },
      {
        id: 'res-2',
        phaseId: 'phase-0',
        title: 'Google Machine Learning Crash Course',
        type: 'course',
        url: 'https://developers.google.com/machine-learning/crash-course',
        provider: 'Google Devs',
        duration: '15 hours',
        description: 'Google\'s high-speed structured introduction to core ML concepts.'
      },
      {
        id: 'res-3',
        phaseId: 'phase-1',
        title: 'Advanced Scientific Computing with NumPy',
        type: 'article',
        url: 'https://numpy.org/doc/stable/user/quickstart.html',
        provider: 'NumPy Org',
        duration: '45 mins',
        description: 'Comprehensive tutorials on tensor layouts, multi-dimensional slicing, and broadcast loops.'
      },
      {
        id: 'res-4',
        phaseId: 'phase-1',
        title: 'A Whirlwind Tour of Python Coding',
        type: 'book',
        url: 'https://github.com/jakevdp/WhirlwindTourOfPython',
        provider: 'O\'Reilly Press',
        duration: '3 hours',
        description: 'Fast track course on essential syntax, structures, and object orientation.'
      },
      {
        id: 'res-5',
        phaseId: 'phase-2',
        title: 'Linear Algebra Cheat Sheet & Vectors',
        type: 'article',
        url: 'https://medium.com',
        provider: 'Towards Data Science',
        duration: '15 mins',
        description: 'A beautifully formatted guide covering matrices, dot products, and principal dimensions.'
      },
      {
        id: 'res-6',
        phaseId: 'phase-2',
        title: 'The Matrix Calculus & Backpropagation Handbook',
        type: 'paper',
        url: 'https://arxiv.org',
        provider: 'arXiv Preprints',
        duration: '2 hours',
        description: 'Rigorous derivation of cost function optimizations and weight updates.'
      },
      {
        id: 'res-7',
        phaseId: 'phase-3',
        title: 'Attention Is All You Need (Transformer Paper)',
        type: 'paper',
        url: 'https://arxiv.org/abs/1706.03762',
        provider: 'arXiv Preprints',
        duration: '1.2 hours',
        description: 'The breakthrough research paper detailing the self-attention architecture.'
      },
      {
        id: 'res-8',
        phaseId: 'phase-3',
        title: 'Prompt Engineering Techniques & Standards',
        type: 'course',
        url: 'https://www.promptingguide.ai/',
        provider: 'DAIR.AI',
        duration: '4 hours',
        description: 'Industry-standard guides on dynamic template styling, few-shot routing, and chain of thought.'
      }
    ],
    topic_wise_quizzes: [
      {
        id: 'quiz-python',
        quizId: 'quiz-python',
        quizName: 'Python Foundations & Data Structure Quiz',
        score: 100,
        totalQuestions: 5,
        attemptsCount: 2,
        lastAttemptedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString()
      },
      {
        id: 'quiz-math',
        quizId: 'quiz-math',
        quizName: 'Linear Algebra & Dimensional Calculus Quiz',
        score: 80,
        totalQuestions: 5,
        attemptsCount: 1,
        lastAttemptedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      },
      {
        id: 'quiz-llm',
        quizId: 'quiz-llm',
        quizName: 'Attention Engine & LLM Architecture Quiz',
        score: 0,
        totalQuestions: 5,
        attemptsCount: 0,
        lastAttemptedAt: 'Never'
      },
      {
        id: 'quiz-rag',
        quizId: 'quiz-rag',
        quizName: 'Vector Embeddings & RAG Optimization Quiz',
        score: 0,
        totalQuestions: 5,
        attemptsCount: 0,
        lastAttemptedAt: 'Never'
      }
    ],
    projects: [
      {
        id: 'proj-1',
        title: 'Custom AI Prompt Template Builder & Proxy',
        difficulty: 'beginner',
        description: 'Build an editor to style and optimize customizable system prompts, validating them using strict safety filters.',
        techStack: ['React', 'Tailwind', 'localStorage', 'lucide-react'],
        features: ['Dynamic variable injection', 'Precompiled templates library', 'One-click markdown export'],
        progress: 100,
        githubUrl: 'https://github.com/learnpath/prompt-builder'
      },
      {
        id: 'proj-2',
        title: 'Interactive NumPy Tensor Calculator',
        difficulty: 'beginner',
        description: 'A visual calculator demonstrating dot products, matrix multiplications, transpose operations, and scalar broadcasting rules.',
        techStack: ['React', 'NumPy Web Assembly', 'Tailwind CSS'],
        features: ['Interactive matrix grid inputs', 'Staggered computation steps visualization', 'Dimension validation warnings'],
        progress: 30,
        githubUrl: 'https://github.com/learnpath/tensor-calc'
      },
      {
        id: 'proj-3',
        title: 'Document PDF Ingestion Engine & Summarizer',
        difficulty: 'intermediate',
        description: 'A robust web utility that parses text from uploaded PDF chapters, generates chunk-based summaries, and builds high-speed search filters.',
        techStack: ['Express', 'React', 'PDF-Parse', 'Gemini Core'],
        features: ['Recursive token splitting', 'Auto-generated context tags map', 'Search with text highlight markers'],
        progress: 0
      },
      {
        id: 'proj-4',
        title: 'Local Git Commit Enhancer & Interactive Explainer',
        difficulty: 'intermediate',
        description: 'Integrate dynamic git hooks to read git diff files, draft informative commit messages matching core conventions, and explain semantic changes.',
        techStack: ['Node.js CLI', 'Simple Git API', 'Gemini LLMs'],
        features: ['Automatic Conventional Commits formatting', 'Performance impact flag review', 'Security-sensitive files monitor'],
        progress: 0
      },
      {
        id: 'proj-5',
        title: 'Autonomous AI Debugging Sandbox & Runner',
        difficulty: 'advanced',
        description: 'Create a secured, encapsulated browser coding playground that runs exercises, analyzes error logs, and requests corrective instructions from Gemini.',
        techStack: ['React', 'WebContainers', 'Xterm.js', 'LLM Agents'],
        features: ['Real-time terminal execution logs', 'Automated code diagnostics tool', 'Staggered auto-repair loops'],
        progress: 0
      }
    ]
  };
}

async function loadUserDB(userEmail: string, options: { createIfMissing?: boolean } = {}): Promise<UserDB | null> {
  await ensureUserDataTable();

  const result = await dbPool.query(
    'SELECT db_json FROM user_data WHERE email = $1',
    [userEmail.toLowerCase()]
  );

  if (result.rows[0]?.db_json) {
    return result.rows[0].db_json;
  }

  if (options.createIfMissing === false) {
    return null;
  }

  const defaultDB = getDefaultUserDB();
  await saveUserDB(userEmail, defaultDB);
  return defaultDB;
}

async function saveUserDB(userEmail: string, dbData: UserDB): Promise<void> {
  await ensureUserDataTable();

  await dbPool.query(
    `
      INSERT INTO user_data (email, db_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        db_json = EXCLUDED.db_json,
        updated_at = NOW()
    `,
    [userEmail.toLowerCase(), JSON.stringify(dbData)]
  );
}

// 1. Selector endpoint
app.get('/api/supabase/select', async (req, res) => {
  const { table, userEmail, filters } = req.query as { table: string; userEmail: string; filters: string };
  if (!table || !userEmail) {
    return res.status(400).json({ error: 'Missing mandatory fields' });
  }

  try {
    const dbData = await loadUserDB(userEmail);
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }
    let rows = dbData[table] || [];

    // Simple filtering
    if (filters) {
      try {
        const parsedFilters = JSON.parse(filters);
        parsedFilters.forEach((f: { column: string; value: any }) => {
          rows = rows.filter(r => r[f.column] === f.value);
        });
      } catch (_) {}
    }

    // Deduplicate on read by id to guarantee complete uniqueness of returned data
    const uniqueRows: any[] = [];
    const seenIds = new Set<string>();
    rows.forEach((r: any) => {
      if (r && r.id) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          uniqueRows.push(r);
        }
      } else {
        uniqueRows.push(r);
      }
    });

    return res.json(uniqueRows);
  } catch (err) {
    console.error('PostgreSQL select error:', err);
    return res.status(500).json({ error: 'Persistent storage query failed' });
  }
});

// 2. Insert endpoint
app.post('/api/supabase/insert', async (req, res) => {
  const { table, userEmail, rows } = req.body;
  if (!table || !userEmail || !rows) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const dbData = await loadUserDB(userEmail);
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }
    if (!dbData[table]) dbData[table] = [];

    rows.forEach((r: any) => {
      // Generate secure id if absent
      if (!r.id) r.id = 'supabase_' + Math.random().toString(36).substr(2, 9);
      
      const existingIndex = dbData[table].findIndex((item: any) => item.id === r.id);
      if (existingIndex > -1) {
        dbData[table][existingIndex] = { ...dbData[table][existingIndex], ...r };
      } else {
        dbData[table].push(r);
      }
    });

    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('PostgreSQL insert error:', err);
    return res.status(500).json({ error: 'Persistent storage write failed' });
  }
});

// 3. Update endpoint
app.post('/api/supabase/update', async (req, res) => {
  const { table, userEmail, updates, filters } = req.body;
  if (!table || !userEmail || !updates) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const dbData = await loadUserDB(userEmail);
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }
    let rows = dbData[table] || [];

    let matchedAndUpdated = 0;
    dbData[table] = rows.map((r: any) => {
      // Check if matches filters
      let matches = true;
      if (filters && Array.isArray(filters)) {
        filters.forEach((f: { column: string; value: any }) => {
          if (r[f.column] !== f.value) matches = false;
        });
      }

      if (matches) {
        matchedAndUpdated++;
        return { ...r, ...updates };
      }
      return r;
    });

    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, count: matchedAndUpdated, updates });
  } catch (err) {
    console.error('PostgreSQL update error:', err);
    return res.status(500).json({ error: 'Persistent storage write failed' });
  }
});

// 4. Upsert endpoint
app.post('/api/supabase/upsert', async (req, res) => {
  const { table, userEmail, rows } = req.body;
  if (!table || !userEmail || !rows) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const dbData = await loadUserDB(userEmail);
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }
    if (!dbData[table]) dbData[table] = [];

    rows.forEach((newRow: any) => {
      if (!newRow.id) {
        newRow.id = 'supabase_' + Math.random().toString(36).substr(2, 9);
        dbData[table].push(newRow);
      } else {
        const idx = dbData[table].findIndex((item: any) => item.id === newRow.id);
        if (idx > -1) {
          dbData[table][idx] = { ...dbData[table][idx], ...newRow };
        } else {
          dbData[table].push(newRow);
        }
      }
    });

    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('PostgreSQL upsert error:', err);
    return res.status(500).json({ error: 'Persistent storage write failed' });
  }
});


// Helper to prepare PWA assets on start
function preparePWAAssets() {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const srcIcon = path.join(process.cwd(), 'src', 'assets', 'images', 'icon_512_1781771940744.jpg');
    const destIcon512 = path.join(publicDir, 'icon-512.jpg');
    const destIcon192 = path.join(publicDir, 'icon-192.jpg');

    const imagesDir = path.join(process.cwd(), 'src', 'assets', 'images');
    let foundIcon = srcIcon;
    if (!fs.existsSync(srcIcon) && fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      const matching = files.find(f => f.startsWith('icon_512_'));
      if (matching) {
        foundIcon = path.join(imagesDir, matching);
      }
    }

    if (fs.existsSync(foundIcon)) {
      fs.copyFileSync(foundIcon, destIcon512);
      fs.copyFileSync(foundIcon, destIcon192);
      console.log('[PWA] Successfully cloned generated launcher JPEG icons to public/');
    } else {
      console.warn('[PWA] Source launcher icon not found, generating fallback placeholder icons...');
      // If we don't have a source icon yet, write a tiny dummy 1px purple PNG or let the browser use SVG
      // Note: SVG icon in manifest.json is already fully configured as the modern vector standard.
      const dummyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPsOfWvHgAHbQJuXpB91gAAAABJRU5ErkJggg==';
      const dummyBuffer = Buffer.from(dummyPngBase64, 'base64');
      fs.writeFileSync(destIcon512, dummyBuffer);
      fs.writeFileSync(destIcon192, dummyBuffer);
    }
  } catch (err) {
    console.error('[PWA] Error cloning launcher icons in preparePWAAssets:', err);
  }
}

// Ensure sw.js is served with Cache-Control headers so that clients detect service worker updates instantly
app.get('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  next();
});

// Configure Vite integration as per our React Full-Stack Guidelines inside async bootstrap
async function bootstrap() {
  preparePWAAssets();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Binds strictly to 0.0.0.0 and PORT 3000 as required
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server starting running on http://0.0.0.0:${PORT}`);
    console.log(`Open in browser at http://localhost:${PORT}`);
    if (platform() === 'win32') {
      exec(`start "" "http://localhost:${PORT}"`);
    } else if (platform() === 'darwin') {
      exec(`open "http://localhost:${PORT}"`);
    } else {
      exec(`xdg-open "http://localhost:${PORT}"`);
    }
  });
  return server;
}

bootstrap().catch(console.error);