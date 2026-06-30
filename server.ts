import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');
import express from 'express';
import session from 'express-session';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { createServer as createViteServer } from 'vite';

// In-memory cache for AI recommendations (5 minute TTL)
type RecCacheEntry = {
  data: any;
  timestamp: number;
};
const recCache: Map<string, RecCacheEntry> = new Map();
const REC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

const sql = neon(process.env.DATABASE_URL!);

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

declare module 'express-session' {
  interface SessionData {
    userEmail?: string;
  }
}

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

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

function sanitizeForPrompt(input: string | number | undefined | null, maxLength: number = 500): string {
  if (input === null || input === undefined) return '';
  let cleaned = String(input).trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  cleaned = cleaned
    .replace(/[`{}<>\\]/g, '')
    .replace(/\b(system:|human:|assistant:)\b/gi, '');
  return cleaned;
}

const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "openrouter/free"
];

async function callOpenRouterChatCompletion(prompt: string, temperature = 0.7, asJSON = false): Promise<string> {
   const key = process.env.OPENROUTER_API_KEY;
   if (!key) {
     throw new Error('OPENROUTER_API_KEY is not configured');
   }

   let lastError: Error | null = null;

   for (const model of OPENROUTER_MODELS) {
     try {
       const controller = new AbortController();
       const timeoutId = setTimeout(() => controller.abort(), 15000);
       
       const body: any = {
         model,
         temperature,
         messages: [
           {
             role: 'system',
             content: asJSON 
               ? 'You are a helpful AI assistant. Return valid JSON only.'
               : 'You are a helpful AI assistant. Provide responses in markdown format with clear headings and bullet points.'
           },
           {
             role: 'user',
             content: prompt
           }
         ]
       };
       
       if (asJSON) {
         body.response_format = { type: 'json_object' };
       }
       
       const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173'
        },
body: JSON.stringify(body),
         signal: controller.signal
       });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `OpenRouter request failed with status ${response.status}`);
      }

      const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      return parsed.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      lastError = error;
      const reason = error.name === 'AbortError' ? 'timed out after 15s' : error.message;
      console.warn(`[Model Fallback] Model ${model} failed:`, reason);
      continue;
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

// 1. API: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiActive: !!process.env.OPENROUTER_API_KEY,
    aiModel: OPENROUTER_MODELS[0]
  });
});

app.post('/api/register', authLimiter, async (req, res) => {
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

app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const dbUser = await loadUserDB(normalizedEmail, { createIfMissing: false });

  if (!dbUser || !dbUser.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatches = await bcrypt.compare(password, dbUser.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: 'Session initialization failed' });
    }
    req.session.userEmail = normalizedEmail;
    return res.json({ ok: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, email: userEmail });
});


// 2. API: Generate Roadmaps
app.post('/api/generate-roadmap', aiLimiter, requireAuth, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required' });
  }

const roadmapSystemPrompt = `
Generate a learning roadmap for: "${sanitizeForPrompt(goal)}".
Experience: "${sanitizeForPrompt(experienceLevel || 'Beginner')}", ${sanitizeForPrompt(weeklyHours || 5)} hrs/week, "${sanitizeForPrompt(preferredStyle || 'Hands-on')}" style.

Return JSON with prerequisites in lessons:
{ "goal": "...", "phases": [{ "id": "ph-1", "name": "Foundations", "skillsCovered": ["skill"], "levels": [{ "id": "lvl-1", "name": "Basics", "lessons": [{ "id": "les-1", "name": "Intro", "type": "learn", "xpReward": 20, "status": "available", "prerequisites": [], "content": "Brief markdown lesson" }, { "id": "les-2", "name": "Quiz", "type": "quiz", "xpReward": 50, "status": "locked", "prerequisites": ["les-1"], "content": "Quiz", "quizQuestions": [{ "id": "q-1", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "misconceptionNotes": ["Why wrong"] }] }] }] }] }

2-3 phases, 2 levels per phase, 1 learn + 1 quiz per level.
`;

    const resourcesProjectsPrompt = `
Generate resources and projects for roadmap goal: "${sanitizeForPrompt(goal, 100)}".

Return JSON: { "resources": [{ "id": "r1", "phaseId": "...", "title": "...", "type": "article|video|course|paper", "provider": "...", "url": "https://...", "description": "..." }], "projects": [{ "id": "p1", "title": "...", "difficulty": "beginner|intermediate|advanced", "description": "...", "techStack": ["..."], "features": ["..."], "progress": 0 }] }

Generate exactly 3 resources and 2 projects. Keep descriptions under 25 words.
`;

try {
       // Parallelize API calls for better performance - run both requests simultaneously
       const roadmapPromise = callOpenRouterChatCompletion(roadmapSystemPrompt, 0.7, true);
       const rpPromise = callOpenRouterChatCompletion(resourcesProjectsPrompt, 0.7, true);
       
       let roadmapResponse: string;
       let rpResponse: string | undefined;
       let roadmapError: Error | null = null;
       
       try {
         roadmapResponse = await roadmapPromise;
       } catch (e) {
         roadmapError = e as Error;
       }
       
       try {
         rpResponse = await rpPromise;
       } catch (rpErr) {
         console.warn('[AI-Fallback] Could not generate resources/projects, using defaults');
       }

       if (roadmapError) {
         throw roadmapError; // Fall through to outer catch for fallback roadmap
       }

       const parsedData = cleanAndParseJSON(roadmapResponse, '{}');
       
       if (rpResponse) {
         const rpData = cleanAndParseJSON(rpResponse, '{}');
         parsedData.resources = rpData.resources || [];
         parsedData.projects = rpData.projects || [];
       } else {
         parsedData.resources = [];
         parsedData.projects = [];
       }
       console.log(`[AI-Generated] Resources: ${parsedData.resources.length}, Projects: ${parsedData.projects.length}`);

       return res.json(parsedData);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Roadmap Generation Error, implementing safe custom backup template:', readableError);
    console.warn(`[AI-Fallback] Roadmap fallback (template) activated for goal: "${sanitizeForPrompt(goal, 80)}"`);
    
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
      resources: [],
      projects: [],
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
            },
            {
              id: 'lvl-fallback-1-2',
              name: 'Core Concepts',
              type: 'Basics',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f1-2-learn',
                  name: 'Essential Patterns',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Essential Patterns

Learn the foundational patterns that power ${goalTitle}. Understand how to structure your code for clarity and maintainability.

- **Pattern recognition**: Identify common structures in problems.
- **Code organization**: Structure code with clear boundaries.
- **Documentation basics**: Write comments that explain why, not what.`
                },
                {
                  id: 'les-f1-2-quiz',
                  name: 'Core Concepts Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Verify your understanding of core patterns.',
                  quizQuestions: [
                    {
                      id: 'q-f1-2',
                      question: `Which principle helps organize code for better maintainability?`,
                      options: [
                        'Copy-paste everywhere',
                        'Structure with clear boundaries',
                        'Write as much code as possible',
                        'Ignore documentation'
                      ],
                      correctIndex: 1,
                      explanation: 'Clear structure and boundaries make code easier to understand and modify.'
                    }
                  ]
                }
              ]
            },
            {
              id: 'lvl-fallback-1-3',
              name: 'Foundational Skills',
              type: 'Basics',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f1-3-learn',
                  name: 'Building Blocks',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Building Blocks

Practice the core skills needed throughout your ${goalTitle} journey. These fundamentals will be applied in every subsequent module.

- **Repetition**: Reinforce learning through practice.
- **Variation**: Apply concepts in different contexts.
- **Validation**: Check your work against expected outcomes.`
                },
                {
                  id: 'les-f1-3-quiz',
                  name: 'Foundational Skills Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Test your foundational skills.',
                  quizQuestions: [
                    {
                      id: 'q-f1-3',
                      question: `What is the best way to reinforce learning?`,
                      options: [
                        'Memorize once',
                        'Apply concepts in different contexts',
                        'Skip practice',
                        'Only watch videos'
                      ],
                      correctIndex: 1,
                      explanation: 'Applying concepts in different contexts deepens understanding and retention.'
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
          description: 'Applying concepts with practical hands-on mini-projects.',
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
                },
                {
                  id: 'les-f2-quiz',
                  name: 'Practical Mechanics Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Test your practical knowledge.',
                  quizQuestions: [
                    {
                      id: 'q-f2-1',
                      question: `Why should you validate data structures?`,
                      options: [
                        'To make code slower',
                        'To prevent runtime errors',
                        'To ignore problems',
                        'To reduce code quality'
                      ],
                      correctIndex: 1,
                      explanation: 'Validating data ensures your code handles edge cases gracefully.'
                    }
                  ]
                }
              ]
            },
            {
              id: 'lvl-fallback-2-2',
              name: 'Integration Patterns',
              type: 'Foundations',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f2-2-learn',
                  name: 'Connecting Components',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Connecting Components

Learn how to integrate different parts of your project. Understand data flow and interface design.

- **API connections**: Link different services.
- **Data pipelines**: Move data between components.
- **Error boundaries**: Handle failures gracefully.`
                },
                {
                  id: 'les-f2-2-quiz',
                  name: 'Integration Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Verify integration knowledge.',
                  quizQuestions: [
                    {
                      id: 'q-f2-2',
                      question: `What is the purpose of error boundaries in integration?`,
                      options: [
                        'To crash the whole system',
                        'To handle failures gracefully',
                        'To ignore errors',
                        'To hide problems'
                      ],
                      correctIndex: 1,
                      explanation: 'Error boundaries ensure failures in one component don\'t break the entire system.'
                    }
                  ]
                }
              ]
            },
            {
              id: 'lvl-fallback-2-3',
              name: 'Testing Strategies',
              type: 'Foundations',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f2-3-learn',
                  name: 'Verification Methods',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Verification Methods

Learn different ways to verify your code works correctly. Testing is crucial for reliable applications.

- **Unit tests**: Test individual functions.
- **Integration tests**: Test component interaction.
- **Edge cases**: Handle unusual inputs.`
                },
                {
                  id: 'les-f2-3-quiz',
                  name: 'Testing Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Assess your testing knowledge.',
                  quizQuestions: [
                    {
                      id: 'q-f2-3',
                      question: `What is the primary purpose of unit tests?`,
                      options: [
                        'To test everything at once',
                        'To test individual functions',
                        'To avoid testing',
                        'To break code'
                      ],
                      correctIndex: 1,
                      explanation: 'Unit tests verify individual functions work correctly in isolation.'
                    }
                  ]
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
                },
                {
                  id: 'les-f3-quiz',
                  name: 'Mastery Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Final assessment of mastery.',
                  quizQuestions: [
                    {
                      id: 'q-f3-1',
                      question: `What is the main trade-off when scaling systems?`,
                      options: [
                        'Speed vs. Quality',
                        'Speed, latency, and costs',
                        'Features vs. Design',
                        'Colors vs. Fonts'
                      ],
                      correctIndex: 1,
                      explanation: 'Scaling involves balancing throughput speed, response latency, and operational costs.'
                    }
                  ]
                }
              ]
            },
            {
              id: 'lvl-fallback-3-2',
              name: 'Performance Optimization',
              type: 'Advanced',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f3-2-learn',
                  name: 'Optimization Techniques',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Optimization Techniques

Learn to make your code faster and more efficient. Performance matters in production systems.

- **Profiling**: Find bottlenecks in code.
- **Caching**: Store computed results.
- **Lazy loading**: Load only when needed.`
                },
                {
                  id: 'les-f3-2-quiz',
                  name: 'Optimization Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Test optimization knowledge.',
                  quizQuestions: [
                    {
                      id: 'q-f3-2',
                      question: `What is caching used for?`,
                      options: [
                        'To store computed results',
                        'To delete data',
                        'To slow down systems',
                        'To ignore performance'
                      ],
                      correctIndex: 0,
                      explanation: 'Caching stores results of expensive operations for faster subsequent access.'
                    }
                  ]
                }
              ]
            },
            {
              id: 'lvl-fallback-3-3',
              name: 'Production Readiness',
              type: 'Advanced',
              status: 'locked',
              lessons: [
                {
                  id: 'les-f3-3-learn',
                  name: 'Deployment Best Practices',
                  type: 'learn',
                  xpReward: 20,
                  status: 'locked',
                  content: `### Deployment Best Practices

Prepare your application for production deployment. Learn the essentials of running systems reliably.

- **Environment variables**: Configure without code changes.
- **Health checks**: Monitor system status.
- **Logging**: Track operations and errors.`
                },
                {
                  id: 'les-f3-3-quiz',
                  name: 'Deployment Quiz',
                  type: 'quiz',
                  xpReward: 50,
                  status: 'locked',
                  content: 'Final deployment readiness check.',
                  quizQuestions: [
                    {
                      id: 'q-f3-3',
                      question: `Why use environment variables in production?`,
                      options: [
                        'To hardcode configuration',
                        'To configure without code changes',
                        'To make code less secure',
                        'To complicate deployments'
                      ],
                      correctIndex: 1,
                      explanation: 'Environment variables allow configuration changes without modifying code.'
                    }
                  ]
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

app.post('/api/generate-projects', aiLimiter, requireAuth, async (req, res) => {
  const { goal, phases } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'Goal is required for project generation' });
  }

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
     const response = await callOpenRouterChatCompletion(prompt, 0.7, true);
     const parsed = cleanAndParseJSON(response, '{"projects":[]}');
     const projects = parsed.projects || [];
     return res.json({ projects });

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('[AI-Fallback] /api/generate-projects fallback:', readableError);
    return res.json({ projects: [] });
  }
});

// 3. API: AI Mentor Chat (Streaming)
app.post('/api/mentor-chat', aiLimiter, requireAuth, async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message payload is required' });
  }

  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        messages.push({
          role: h.sender === 'user' ? 'user' : 'assistant',
          content: sanitizeForPrompt(h.text || '', 500)
        });
      });
    }
    messages.push({ role: 'user', content: sanitizeForPrompt(message, 500) });

const systemInstruction = `
You are the LearnPath AI Mentor - a world-class university TA who excels at breaking down complex concepts.

Response Structure:
1. Start with clear heading
2. Write 1-2 sentence plain English overview
3. List 3-4 key points
4. End with quick exercise, next step, and pro tip

Use clean formatting without markdown symbols like ** or ##.
`;

    const prompt = `${systemInstruction}\n\nUser question: ${message}\n\nPrevious messages:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`;
    const responseText = await callOpenRouterChatCompletion(prompt, 0.5);

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(responseText);


  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Chat Error:', readableError);
    
    // Fallback offline dynamic reply
    const lowercaseMessage = message.toLowerCase();
    let reply = "";

    if (lowercaseMessage.includes('python')) {
      reply = `### Python for AI Mastery 🐍\n\nPython is the foundation of modern AI development. These core libraries are essential:\n\n**Key Points**:\n- **NumPy Vectorization**: Replace slow Python loops with array operations\n- **Pandas DataFrames**: Handle structured learning data efficiently\n- **Object-Oriented Patterns**: Write reusable ML model components\n\n**Quick Exercise**: Write a NumPy array subtraction to compute Mean Squared Error between predicted and actual values\n**Next Step**: Explore PyTorch tensor operations for neural network foundations\n**Pro Tip**: Always vectorize computations - avoid native Python loops in numerical code`;
    } else if (lowercaseMessage.includes('roadmap') || lowercaseMessage.includes('generate')) {
      reply = `### Custom Roadmap Engineering 🗺️\n\nI craft personalized learning paths for any AI goal! Here's how:\n\n**Key Points**:\n- **Phases**: 3-5 digestible milestones breaking down complex topics\n- **Levels**: Foundations → Practice → Mastery progression\n- **Lessons**: Learn (theory) + Quiz (validation) format per level\n\n**Quick Exercise**: Define your target skill (e.g., "Build a chatbot with RAG") and I'll generate a roadmap\n**Next Step**: Click **Generate Custom Roadmap** in the Roadmaps tab\n**Pro Tip**: Start with 2-3 hours/week commitment for sustainable progress`;
    } else if (lowercaseMessage.includes('quiz') || lowercaseMessage.includes('test')) {
      reply = `### Knowledge Testing & XP Gains 🧠\n\nQuizzes reinforce learning through active recall:\n\n**Key Points**:\n- **Quiz Lessons**: 50 XP reward, multiple-choice with explanations\n- **Coding Exercises**: 75 XP reward, hands-on implementation\n- **Retention Boost**: Testing improves retention by up to 150%\n\n**Quick Exercise**: Ask for 3 questions on LLM tokenization to practice now\n**Next Step**: Complete quizzes in active roadmap phases to unlock next levels\n**Pro Tip**: Review incorrect answers - they reveal knowledge gaps to focus on`;
    } else if (lowercaseMessage.includes('neural') || lowercaseMessage.includes('network')) {
      reply = `### Neural Network Foundations 🧠\n\nNeural networks learn patterns through layered transformations:\n\n**Key Points**:\n- **Input Layer**: Receives feature vectors (e.g., pixel values)\n- **Hidden Layers**: Apply weighted transformations with activation functions\n- **Output Layer**: Produces predictions (probabilities, regressions, etc.)\n\n**Training Process**: Forward pass → Loss → Backpropagation adjusts weights\n\n**Quick Exercise**: Implement a single-layer perceptron with sigmoid activation in NumPy\n**Next Step**: Study backpropagation chain rule for multi-layer gradient flow\n**Pro Tip**: Initialize weights with Xavier/Glorot to prevent vanishing gradients`;
    } else if (lowercaseMessage.includes('attention') || lowercaseMessage.includes('transformer')) {
      reply = `### Self-Attention Mechanics 🎯\n\nSelf-attention lets models focus on relevant input parts:\n\n**Key Points**:\n- **Query-Key-Value**: Each position embedded into three vectors\n- **Similarity Scores**: Q·K^T measures relevance between positions\n- **Weighted Sum**: V weighted by softmax-normalized attention scores\n\n**Quick Exercise**: Given Q=[1,0], K=[1,1], compute attention score and explain intuition\n**Next Step**: Explore multi-head attention for parallel perspective learning\n**Pro Tip**: Scaled dot-product (÷√d_k) prevents extreme softmax values in high dimensions`;
    } else if (lowercaseMessage.includes('rag') || lowercaseMessage.includes('retrieval')) {
      reply = `### RAG Pipeline Architecture 🔄\n\nRAG grounds LLMs in external knowledge sources:\n\n**Key Points**:\n- **Retrieval**: Query vector database for relevant documents\n- **Augmentation**: Inject retrieved context into prompt\n- **Generation**: LLM produces answer from grounded context\n\n**Quick Exercise**: Design a prompt template: "Answer using only: {retrieved_chunks}"\n**Next Step**: Implement chunk overlap (20%) for better context continuity\n**Pro Tip**: Use re-ranking models to improve retrieval relevance beyond basic similarity`;
    } else if (lowercaseMessage.includes('llm') || lowercaseMessage.includes('token')) {
      reply = `### LLM Tokenization 🔤\n\nTokenization converts text to numerical IDs for model processing:\n\n**Key Points**:\n- **BPE Algorithm**: Byte-Pair Encoding merges frequent character pairs\n- **Vocabulary**: Model's known tokens (typically 32K-100K entries)\n- **Context Windows**: Limits how much text model can process at once\n\n**Quick Exercise**: Count tokens in your last question using \`len(text.split())\` approximation\n**Next Step**: Compare GPT-4 vs Llama tokenization strategies\n**Pro Tip**: Add 30% buffer for safety when estimating token usage`;
    } else if (lowercaseMessage.includes('numpy') || lowercaseMessage.includes('vector')) {
      reply = `### NumPy Vectorization ⚡\n\nVectorization enables fast array operations without Python loops:\n\n**Key Points**:\n- **Broadcasting**: Automatically expand smaller arrays to match shapes\n- **Memory Efficiency**: Operate on entire arrays at C speed\n- **SIMD**: Single instruction processes multiple data points\n\n**Quick Exercise**: \`np.array([1,2,3]) * np.array([4,5,6])\` vs native Python loop timing\n**Next Step**: Explore NumPy's advanced indexing for data selection\n**Pro Tip**: Always pre-allocate arrays with \`np.zeros()\` or \`np.empty()\` for performance`;
    } else if (lowercaseMessage.includes('help') || lowercaseMessage.includes('stuck')) {
      reply = `### Getting Unstuck 🆘\n\nHere's my debugging approach:\n\n**Strategy**:\n- **Isolate**: Create minimal reproduction of the problem\n- **Print**: Add debug statements at each step\n- **Verify**: Check inputs/outputs match expectations\n- **Simplify**: Remove complexity until it works\n\n**Quick Exercise**: Take your problem, strip to simplest case, fix, then rebuild\n**Next Step**: Share the specific error - I'll help decode it\n**Pro Tip**: Rubber duck debugging (explain aloud) solves 40% of problems`;
    } else {
      reply = `### AI Mentor Ready to Help 🤖\n\nYou asked: *"${sanitizeForPrompt(message)}"* - let me break this down!\n\n**My Approach**:\n- **Explain**: Concepts in plain English with practical analogies\n- **Show**: Code examples with line-by-line walkthroughs\n- **Practice**: Quick exercises to reinforce learning\n- **Extend**: Next steps and pro tips\n\n**Quick Exercise**: Pick any AI topic - I'll give you a 3-minute hands-on task\n**Next Step**: Share what you're learning, and I'll suggest a personalized path\n**Pro Tip**: Active recall (quizzing yourself) beats passive reading 3x for retention`;
    }

    // If headers are already sent, just end
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(reply);
  }
});

// 4. API: Verify and Analyze Script Code
app.post('/api/analyze-code', aiLimiter, requireAuth, async (req, res) => {
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
}
`;

try {
     const response = await callOpenRouterChatCompletion(prompt, 0.3, true);
     const parsed = cleanAndParseJSON(response, '{}');
     return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Code Analysis fallback activation:', readableError);
    
    return res.json({
      passed: false,
      systemError: true,
      suggestions: "",
      explanation: "Verification service unavailable. Please retry."
    });
  }
});

// 5. API: AI Adaptive Recommendations
app.post('/api/ai-recommendations', aiLimiter, requireAuth, async (req, res) => {
  const { currentXp, level, streak, activeGoal } = req.body;
  const userEmail = req.session.userEmail;

  // Check cache first (valid for 5 minutes)
  const cacheKey = `${userEmail}:${activeGoal || ''}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REC_CACHE_TTL) {
    return res.json(cached.data);
  }

  const prompt = `
Generate 3 highly personalized study recommendations for a user of LearnPath AI with:
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
]
`;

try {
      const response = await callOpenRouterChatCompletion(prompt, 0.8, true);
      const parsed = cleanAndParseJSON(response, '[]');
      // Cache successful response
      recCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
      return res.json(parsed);

   } catch (error: any) {
     let readableError = error.message || String(error);
     try {
       const parsedError = JSON.parse(error.message);
       if (parsedError?.error?.message) {
         readableError = parsedError.error.message;
       }
     } catch (_) {}
     console.error('OpenRouter recommendations fallback:', readableError);
     const fallback = [
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
     ];
     // Cache fallback response too
     recCache.set(cacheKey, { data: fallback, timestamp: Date.now() });
     return res.json(fallback);
   }
   });

// 6. API: Dynamic Quiz Generator
app.post('/api/generate-quiz', aiLimiter, requireAuth, async (req, res) => {
  const { topicName } = req.body;

  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required for quiz' });
  }

const prompt = `
Generate a personalized, challenging study quiz for this topic: "${sanitizeForPrompt(topicName, 500)}".
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
]
`;

try {
      const response = await callOpenRouterChatCompletion(prompt, 0.7, true);
      const parsed = cleanAndParseJSON(response, '[]');
      
      if (Array.isArray(parsed)) {
        for (const q of parsed) {
          if (!q.misconceptionNotes) {
            q.misconceptionNotes = ['Common misunderstanding - test again.'];
          }
        }
      }
      
      return res.json(parsed);

  } catch (error: any) {
    let readableError = error.message || String(error);
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError?.error?.message) {
        readableError = parsedError.error.message;
      }
    } catch (_) {}
    console.error('OpenRouter Dynamic Quiz error fallback:', readableError);
    
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
app.post('/api/generate-topic-overview', requireAuth, async (req, res) => {
  const { topicName, roadmapContext } = req.body;
  if (!topicName) {
    return res.status(400).json({ error: 'Topic name is required' });
  }

  const prompt = `
Generate a structured, engaging learner overview for the topic "${sanitizeForPrompt(topicName, 500)}" within the learning domain of "${sanitizeForPrompt(roadmapContext || 'AI and Programming', 500)}".
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
     const response = await callOpenRouterChatCompletion(prompt, 0.6, true);
     const parsed = cleanAndParseJSON(response, '{}');
     return res.json(parsed);

  } catch (error: any) {
    console.warn('OpenRouter Topic Overview generator fallback:', error.message || error);
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

// 7.5 API: Progressive Hints Generator
app.post('/api/generate-hints', aiLimiter, requireAuth, async (req, res) => {
  const { lessonContent, lessonId, attemptNumber } = req.body;

  if (!lessonContent) {
    return res.status(400).json({ error: 'Lesson content is required' });
  }

  const prompt = `
Generate scaffolded hints for this learning exercise: "${sanitizeForPrompt(lessonContent, 1000)}".

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

Level ${attemptNumber || 1} is requested. Keep hints educational, not giving away answers.
`;

  try {
    const response = await callOpenRouterChatCompletion(prompt, 0.5, true);
    const parsed = cleanAndParseJSON(response, '{"hints":[],"hintCostXp":10}');
    
    if (!parsed.hints || !Array.isArray(parsed.hints)) {
      parsed.hints = [
        { level: 1, type: "conceptual", text: "Focus on the core concept being taught." },
        { level: 2, type: "syntax", text: "Think about the key syntax patterns." },
        { level: 3, type: "pattern", text: "Consider the example structure shown." },
        { level: 4, type: "partial", text: "Review the solution steps." }
      ];
    }
    return res.json(parsed);

  } catch (error: any) {
    console.error('Hints generation fallback:', error.message);
    return res.json({
      hints: [
        { level: 1, type: "conceptual", text: "Focus on the core concept being taught." },
        { level: 2, type: "syntax", text: "Think about the key syntax patterns." }
      ],
      hintCostXp: 10
    });
  }
});

// 8. API: Get roadmap for workspace
app.get('/api/roadmaps/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const roadmap = dbData?.roadmaps?.find((r: any) => r.id === roadmapId);
    
    if (!roadmap) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    // Add topic/section structure for workspace
    const workspaceRoadmap = {
      ...roadmap,
      phases: roadmap.phases.map((phase: any) => ({
        ...phase,
        levels: phase.levels.map((level: any) => ({
          ...level,
          topics: level.lessons.map((lesson: any) => ({
            id: lesson.id,
            name: lesson.name,
            type: lesson.type,
            status: lesson.status,
            xpReward: lesson.xpReward,
            estimatedTime: 15
          }))
        }))
      }))
    };

    return res.json({ roadmap: workspaceRoadmap });
  } catch (error) {
    console.error('Get roadmap error:', error);
    return res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

// 8.1 API: Get topic content
app.get('/api/topics/:topicId', requireAuth, async (req, res) => {
  const { topicId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    
    // Find lesson in any roadmap
    let lesson: any = null;
    let phase: any = null;
    let level: any = null;

    for (const roadmap of dbData?.roadmaps || []) {
      for (const p of roadmap.phases || []) {
        for (const l of p.levels || []) {
          const found = l.lessons?.find((les: any) => les.id === topicId);
          if (found) {
            lesson = found;
            phase = p;
            level = l;
            break;
          }
        }
        if (lesson) break;
      }
      if (lesson) break;
    }

    if (!lesson) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Generate AI summary if not cached
    let summary = lesson.summary;
    if (!summary) {
      summary = `### ${lesson.name}\n\n**Key Concepts:**\n- Core principles of ${lesson.name.toLowerCase()}\n- Practical applications and examples\n\n**Common Mistakes:**\n- Misunderstanding basic concepts\n- Forgetting syntax details`;
    }

    const topic = {
      id: lesson.id,
      name: lesson.name,
      type: lesson.type,
      phaseId: phase?.id,
      levelId: level?.id,
      status: lesson.status,
      xpReward: lesson.xpReward,
      content: lesson.content || '',
      summary,
      objectives: [
        `Understand ${lesson.name.toLowerCase()} fundamentals`,
        `Apply concepts in practical scenarios`,
        `Complete exercises to reinforce learning`
      ],
      estimatedTime: lesson.xpReward || 15
    };

    return res.json({ topic });
  } catch (error) {
    console.error('Get topic error:', error);
    return res.status(500).json({ error: 'Failed to load topic' });
  }
});
app.post('/api/validate-progression', requireAuth, async (req, res) => {
  const { roadmap } = req.body;

  if (!roadmap) {
    return res.status(400).json({ error: 'Roadmap data is required' });
  }

  const validation = {
    hasGaps: false,
    gaps: [],
    prerequisitesMet: true,
    missingPrerequisites: [],
    quizMatchesContent: true,
    mismatchedQuizzes: []
  };

  if (roadmap && roadmap.phases) {
    const allLessons: any[] = [];
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          allLessons.push({ ...lesson, phaseId: phase.id, levelId: level.id });
        }
      }
    }

    const completedBeforeAvailable = (lesson: any, idx: number) => 
      allLessons.slice(0, idx).some((l, i) => 
        allLessons[i].status === 'completed' && lesson.status === 'available'
      );

    const gaps: any[] = [];
    const missingPrerequisites: string[] = [];

    allLessons.forEach((lesson, idx) => {
      if (lesson.status === 'locked' && completedBeforeAvailable(lesson, idx)) {
        gaps.push({ lessonId: lesson.id, reason: 'Locked lesson after completed lessons' });
      }
      if (lesson.type === 'quiz' && lesson.status === 'available') {
        const hasLearnBefore = allLessons.slice(0, idx).some(l => l.type === 'learn' && l.status === 'completed');
        if (!hasLearnBefore) gaps.push({ lessonId: lesson.id, reason: 'Quiz unlocked without prior learning' });
      }
      if (lesson.prerequisites) {
        lesson.prerequisites.forEach((prereq: string) => {
          const prereqExists = allLessons.some(l => l.id === prereq);
          const prereqCompleted = allLessons.some(l => l.id === prereq && l.status === 'completed');
          if (!prereqExists) missingPrerequisites.push(`${lesson.id}: missing ${prereq}`);
          else if (!prereqCompleted && lesson.status === 'available') {
            missingPrerequisites.push(`${lesson.id}: ${prereq} not completed`);
          }
        });
      }
    });

    validation.hasGaps = gaps.length > 0;
    validation.gaps = gaps;
    validation.prerequisitesMet = missingPrerequisites.length === 0;
    validation.missingPrerequisites = missingPrerequisites;
  }

  return res.json(validation);
});

app.post('/api/update-roadmap', requireAuth, async (req, res) => {
  const { roadmapId, updates } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roadmapId || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'roadmapId and updates object are required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData || !dbData.roadmaps) {
      return res.status(404).json({ error: 'User or roadmaps not found' });
    }

    const idx = dbData.roadmaps.findIndex((r: any) => r.id === roadmapId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    const existing = dbData.roadmaps[idx];
    const merged = { ...existing };

    for (const key of Object.keys(updates)) {
      const uVal = (updates as any)[key];
      const eVal = existing[key];

      if (key === 'quizzes' && uVal && typeof uVal === 'object' && !Array.isArray(uVal)) {
        merged.quizzes = { ...(eVal || {}), ...uVal };
      } else if (key === 'resources' && Array.isArray(uVal)) {
        const existingRes = (eVal || []) as any[];
        const byId = new Map(existingRes.map(r => [r.id, r]));
        uVal.forEach((r: any) => { byId.set(r.id, r); });
        merged.resources = Array.from(byId.values());
      } else if (key === 'projects' && Array.isArray(uVal)) {
        const existingProj = (eVal || []) as any[];
        const byId = new Map(existingProj.map(p => [p.id, p]));
        uVal.forEach((p: any) => { byId.set(p.id, p); });
        merged.projects = Array.from(byId.values());
      } else {
        merged[key] = uVal;
      }
    }

    dbData.roadmaps[idx] = merged;
    await saveUserDB(userEmail, dbData);

    return res.json({ success: true, roadmap: dbData.roadmaps[idx] });
  } catch (error) {
    console.error('Update roadmap error:', error);
    return res.status(500).json({ error: 'Failed to update roadmap' });
  }
});

// 8. API: GET all roadmaps for a user
app.get('/api/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;
  
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.json([]);
    }
    
    const roadmaps = dbData.roadmaps || [];
    return res.json(roadmaps);
  } catch (error) {
    console.error('Get roadmaps error:', error);
    // Return empty array instead of error to allow frontend to work
    return res.json([]);
  }
});

// 9. API: DELETE a roadmap by id
app.delete('/api/roadmaps/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.session.userEmail;
  
  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }
    
    const originalLength = dbData.roadmaps?.length || 0;
    dbData.roadmaps = (dbData.roadmaps || []).filter((r: any) => r.id !== id);
    const newLength = dbData.roadmaps.length;
    
    if (originalLength === newLength) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }
    
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete roadmap error:', error);
    return res.status(500).json({ error: 'Failed to delete roadmap. Database unavailable.' });
  }
});

// 10a. API: Create a new roadmap
app.post('/api/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  const roadmap = req.body;

  if (!roadmap || !roadmap.id || !roadmap.goal) {
    return res.status(400).json({ error: 'Valid roadmap object with id and goal is required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const roadmaps = dbData.roadmaps || [];
    const existingIndex = roadmaps.findIndex((r: any) => r.id === roadmap.id);

    if (existingIndex >= 0) {
      roadmaps[existingIndex] = { ...roadmaps[existingIndex], ...roadmap };
    } else {
      roadmaps.push({
        ...roadmap,
        createdAt: roadmap.createdAt || new Date().toISOString()
      });
    }

    dbData.roadmaps = roadmaps;
    await saveUserDB(userEmail, dbData);

    return res.json({ success: true, roadmap: roadmaps[existingIndex >= 0 ? existingIndex : roadmaps.length - 1] });
  } catch (error) {
    console.error('Create roadmap error:', error);
    return res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

// 10b. API: Topic-wise quiz attempts
app.get('/api/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const attempts = dbData?.topic_wise_quizzes || [];
    return res.json(attempts);
  } catch (error) {
    console.error('Get topic wise quizzes error:', error);
    return res.json([]);
  }
});

app.post('/api/topic-wise-quizzes', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  const attempt = req.body;

  if (!attempt || !attempt.quizId) {
    return res.status(400).json({ error: 'quizId is required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const quizzes = dbData.topic_wise_quizzes || [];
    const idx = quizzes.findIndex((q: any) => q.quizId === attempt.quizId);

    if (idx >= 0) {
      quizzes[idx] = { ...quizzes[idx], ...attempt };
    } else {
      quizzes.push({
        ...attempt,
        id: attempt.id || `quiz-${Date.now()}`,
        quizId: attempt.quizId,
        quizName: attempt.quizName || 'Untitled Quiz',
        score: attempt.score || 0,
        totalQuestions: attempt.totalQuestions || 0,
        attemptsCount: attempt.attemptsCount || 0,
        lastAttemptedAt: attempt.lastAttemptedAt || new Date().toISOString()
      });
    }

    dbData.topic_wise_quizzes = quizzes;
    await saveUserDB(userEmail, dbData);
    return res.json({ success: true, attempt: quizzes[idx >= 0 ? idx : quizzes.length - 1] });
  } catch (error) {
    console.error('Upsert topic wise quiz error:', error);
    return res.status(500).json({ error: 'Failed to save quiz attempt' });
  }
});

// 10. API: Get user stats
app.get('/api/user-stats', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.json({
        xp: 0,
        streak: 0,
        hoursStudied: 0,
        lessonsCompleted: 0,
        overallMastery: 0
      });
    }

    const roadmaps = dbData.roadmaps || [];
    let totalLessons = 0;
    let completedLessons = 0;

    for (const roadmap of roadmaps) {
      for (const phase of roadmap.phases || []) {
        for (const level of phase.levels || []) {
          for (const lesson of level.lessons || []) {
            totalLessons++;
            if (lesson.status === 'completed') {
              completedLessons++;
            }
          }
        }
      }
    }

    const overallMastery = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    return res.json({
      xp: dbData.xp || 0,
      streak: dbData.streak ?? 0,
      hoursStudied: (dbData.profile as any)?.hoursStudied || 0,
      lessonsCompleted: completedLessons,
      overallMastery: Math.round(overallMastery)
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.json({
      xp: 0,
      streak: 0,
      hoursStudied: 0,
      lessonsCompleted: 0,
      overallMastery: 0
    });
  }
});

// 11. API: Complete a lesson
app.post('/api/complete-lesson', requireAuth, async (req, res) => {
  const { lessonId, xpEarned, xpReward, roadmapId } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!lessonId) {
    return res.status(400).json({ error: 'lessonId is required' });
  }

  const xpValue = Number(xpEarned ?? xpReward);
  if (!xpValue || xpValue <= 0) {
    return res.status(400).json({ error: 'xpEarned is required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) {
      return res.status(404).json({ error: 'User data not found' });
    }

    const roadmaps = dbData.roadmaps || [];
    let lessonFound = false;
    let totalLessons = 0;
    let completedLessons = 0;

    const targetRoadmaps = roadmapId ? roadmaps.filter((r: any) => r.id === roadmapId) : roadmaps;
    const allRoadmaps = roadmapId ? roadmaps : targetRoadmaps;

    for (const roadmap of allRoadmaps) {
      for (const phase of roadmap.phases || []) {
        for (const level of phase.levels || []) {
          for (const lesson of level.lessons || []) {
            totalLessons++;
            if (lesson.id === lessonId) {
              if (lesson.status !== 'completed') {
                lesson.status = 'completed';
                lessonFound = true;
              }
            }
            if (lesson.status === 'completed') {
              completedLessons++;
            }
          }
        }
      }
    }

    if (!lessonFound) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const newXP = (dbData.xp || 0) + xpValue;
    dbData.xp = newXP;
    if (!dbData.profile) dbData.profile = {};
    dbData.profile.xp = newXP;

    const completionPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    // Update roadmap progress tracking
    if (roadmapId) {
      const targetRoadmap = dbData.roadmaps?.find((r: any) => r.id === roadmapId);
      if (targetRoadmap) {
        targetRoadmap.lessonsCompleted = completedLessons;
        targetRoadmap.progressPercent = completionPercent;
        targetRoadmap.totalXp = dbData.xp || 0;
        
        // Track progress in dedicated progress object
        if (!dbData.progress) dbData.progress = {};
        if (!dbData.progress[roadmapId]) {
          dbData.progress[roadmapId] = {
            roadmapId,
            startedAt: new Date().toISOString()
          };
        }
        dbData.progress[roadmapId].completedLessonIds = dbData.progress[roadmapId].completedLessonIds || [];
        if (!dbData.progress[roadmapId].completedLessonIds.includes(lessonId)) {
          dbData.progress[roadmapId].completedLessonIds.push(lessonId);
        }
        dbData.progress[roadmapId].updatedAt = new Date().toISOString();
        dbData.progress[roadmapId].totalXP = targetRoadmap.totalXp;
        dbData.progress[roadmapId].progressPercentage = completionPercent;
        
        if (completionPercent >= 100) {
          dbData.progress[roadmapId].completedAt = new Date().toISOString();
        }
      }
    }

    await saveUserDB(userEmail, dbData);

    const newStreak = await updateStreak(userEmail);

    return res.json({
      xp: newXP,
      streak: newStreak,
      completionPercent,
      message: 'Lesson complete!'
    });
  } catch (error) {
    console.error('Complete lesson error:', error);
    return res.status(500).json({ error: 'Failed to complete lesson. Database unavailable.' });
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

let usersTableReady: Promise<void> | null = null;

async function ensureUsersTable(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[Database Warning] DATABASE_URL not set.');
    return Promise.resolve();
  }

  if (!usersTableReady) {
    usersTableReady = sql`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password_hash TEXT,
        roadmap JSONB,
        progress JSONB,
        xp INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
      .then(async () => {
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_date DATE`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0`;
        console.log('[Database] Connected to Neon PostgreSQL successfully');
        return undefined;
      })
      .catch((err: any) => {
        console.error('[Database Error] Failed to initialize users table:', err);
        return undefined;
      });
  }

  return usersTableReady;
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
     ],
     achievements: [
       {
         id: 'ach-1',
         name: 'First Steps',
         description: 'Complete your first lesson to begin your learning journey.',
         icon: '🎯',
         unlocked: false,
         category: 'python',
         xpReward: 50
       },
       {
         id: 'ach-2',
         name: 'Quiz Master',
         description: 'Score 100% on any quiz to demonstrate mastery.',
         icon: '🧠',
         unlocked: false,
         category: 'prompt',
         xpReward: 75
       },
       {
         id: 'ach-3',
         name: 'Roadmap Builder',
         description: 'Generate your first AI-powered learning roadmap.',
         icon: '🗺️',
         unlocked: false,
         category: 'agent',
         xpReward: 100
       }
     ]
   };
 }

async function loadUserDB(userEmail: string, options: { createIfMissing?: boolean } = {}): Promise<UserDB | null> {
  await ensureUsersTable();

  try {
    const result = await sql`
      SELECT password_hash, roadmap, progress, xp, last_active_date, streak
      FROM users
      WHERE email = ${userEmail.toLowerCase()}
    `;

    if (result[0]) {
      const row = result[0];
      const roadmap = row.roadmap || {};
      const progress = row.progress || {};
      
      const dbData: UserDB = {
        ...roadmap,
        ...progress,
        xp: row.xp ?? 0,
        passwordHash: row.password_hash || undefined,
        last_active_date: row.last_active_date,
        streak: row.streak ?? 0
      };
      
      // BACKWARD COMPATIBILITY: Migrate old single roadmap to roadmaps array
      if (dbData.roadmap && !Array.isArray(dbData.roadmaps)) {
        console.log('[Migration] Converting single roadmap to roadmaps array for user:', userEmail);
        dbData.roadmaps = [{
          ...dbData.roadmap,
          id: dbData.roadmap.id || `roadmap-${Date.now()}`,
          createdAt: dbData.roadmap.createdAt || new Date().toISOString()
        }];
        delete dbData.roadmap;
        // Save migrated data
        await saveUserDB(userEmail, dbData);
      }
      
      // Ensure roadmaps is always an array
      if (!dbData.roadmaps) {
        dbData.roadmaps = [];
      }
      
      return dbData;
    }

    if (options.createIfMissing === false) {
      return null;
    }

    const defaultDB = getDefaultUserDB();
    await saveUserDB(userEmail, defaultDB);
    return defaultDB;
  } catch (error) {
    console.error('[Database Error] Failed to load user data:', error);
    // Return default data if database fails
    if (options.createIfMissing !== false) {
      return getDefaultUserDB();
    }
    return null;
  }
}

async function saveUserDB(userEmail: string, dbData: UserDB): Promise<void> {
  await ensureUsersTable();

  try {
    const result = await sql`
      SELECT roadmap, progress FROM users WHERE email = ${userEmail.toLowerCase()}
    `;

    const currentRoadmap = result[0]?.roadmap || {};
    const currentProgress = result[0]?.progress || {};

    const { passwordHash, roadmaps, curated_resources, projects, topic_wise_quizzes, profile, settings, achievements, notifications, chats } = dbData;

    const newRoadmapData = {
      roadmaps: roadmaps || currentRoadmap.roadmaps || [],
      curated_resources: curated_resources || currentRoadmap.curated_resources || [],
      projects: projects || currentRoadmap.projects || [],
      topic_wise_quizzes: topic_wise_quizzes || currentRoadmap.topic_wise_quizzes || []
    };

    const newProgressData = {
      profile: profile || currentProgress.profile || {},
      settings: settings || currentProgress.settings || {},
      achievements: achievements || currentProgress.achievements || [],
      notifications: notifications || currentProgress.notifications || [],
      chats: chats || currentProgress.chats || []
    };

    const xp = (profile as any)?.xp ?? (currentProgress.profile as any)?.xp ?? 0;

    await sql`
      INSERT INTO users (email, password_hash, roadmap, progress, xp, updated_at)
      VALUES (${userEmail.toLowerCase()}, ${passwordHash || null}, ${newRoadmapData}, ${newProgressData}, ${xp}, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
        roadmap = EXCLUDED.roadmap,
        progress = EXCLUDED.progress,
        xp = COALESCE(EXCLUDED.xp, users.xp),
        updated_at = NOW()
    `;
  } catch (error) {
    console.error('[Database Error] Failed to save user data:', error);
    throw error;
  }
}

async function updateStreak(userEmail: string): Promise<number> {
  await ensureUsersTable();

  const today = new Date().toISOString().split('T')[0];
  
  try {
    const result = await sql`
      SELECT streak, last_active_date
      FROM users
      WHERE email = ${userEmail.toLowerCase()}
    `;

    let currentStreak = 0;
    let lastActiveDate: string | null = null;

    if (result[0]) {
      currentStreak = result[0].streak ?? 0;
      lastActiveDate = result[0].last_active_date;
    }

    if (lastActiveDate === today) {
      return currentStreak;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastActiveDate === yesterdayStr) {
      currentStreak += 1;
    } else if (!lastActiveDate || lastActiveDate < yesterdayStr) {
      currentStreak = 1;
    }

    await sql`
      UPDATE users
      SET streak = ${currentStreak}, last_active_date = ${today}
      WHERE email = ${userEmail.toLowerCase()}
    `;

    return currentStreak;
  } catch (error) {
    console.error('[Database Error] Failed to update streak:', error);
    return 0;
  }
}

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

// 8. API: Track Lesson Progress
app.post('/api/progress', aiLimiter, requireAuth, async (req, res) => {
  const { roadmapId, lessonId, action, totalXP } = req.body;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roadmapId || !lessonId) {
    return res.status(400).json({ error: 'roadmapId and lessonId are required' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: true });
    
    // Initialize progress if not exists
    if (!dbData.progress) {
      dbData.progress = {};
    }
    
    const roadmapProgressKey = roadmapId;
    let progress = dbData.progress[roadmapProgressKey];
    
    if (!progress) {
      // Find roadmap to calculate total lessons
      const roadmap = dbData.roadmaps?.find((r: any) => r.id === roadmapId);
      const totalLessons = roadmap?.phases?.reduce((acc: number, ph: any) => 
        acc + (ph.levels?.reduce((lAcc: number, lvl: any) => 
          lAcc + (lvl.lessons?.length || 0), 0) || 0), 0) || 0;
      
      progress = {
        userId: userEmail,
        roadmapId,
        currentLessonId: null,
        completedLessonIds: [],
        totalXP: 0,
        progressPercentage: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Handle actions
    if (action === 'complete') {
      if (!progress.completedLessonIds.includes(lessonId)) {
        progress.completedLessonIds.push(lessonId);
      }
      progress.updatedAt = new Date().toISOString();
    } else if (action === 'set-current') {
      progress.currentLessonId = lessonId;
      progress.updatedAt = new Date().toISOString();
    }

    // Calculate total XP from completed lessons
    if (action === 'get') {
      const roadmap = dbData.roadmaps?.find((r: any) => r.id === roadmapId);
      const allLessons = roadmap?.phases?.flatMap((ph: any) => 
        ph.levels?.flatMap((lvl: any) => lvl.lessons || []) || []) || [];
      const xpEarned = allLessons
        .filter((l: any) => progress.completedLessonIds.includes(l.id))
        .reduce((sum: number, l: any) => sum + (l.xpReward || 0), 0);
      progress.totalXP = xpEarned;
    }

    // Update XP if provided
    if (totalXP !== undefined) {
      progress.totalXP = totalXP;
    }

    // Calculate progress percentage
    const roadmap = dbData.roadmaps?.find((r: any) => r.id === roadmapId);
    const totalLessons = roadmap?.phases?.reduce((acc: number, ph: any) => 
      acc + (ph.levels?.reduce((lAcc: number, lvl: any) => 
        lAcc + (lvl.lessons?.length || 0), 0) || 0), 0) || 0;
    progress.progressPercentage = totalLessons > 0 
      ? Math.round((progress.completedLessonIds.length / totalLessons) * 100) 
      : 0;

    // Check if roadmap is completed
    if (progress.completedLessonIds.length >= totalLessons && totalLessons > 0) {
      progress.completedAt = progress.completedAt || new Date().toISOString();
    }

    // Update roadmap lesson statuses
    if (action === 'complete' && roadmap) {
      for (const phase of roadmap.phases || []) {
        for (const level of phase.levels || []) {
          for (const lesson of level.lessons || []) {
            if (progress.completedLessonIds.includes(lesson.id)) {
              lesson.status = 'completed';
            } else if (lesson.id === lessonId && action === 'complete') {
              // Unlock next lesson
              const nextLesson = level.lessons?.find((l: any, idx: number) => 
                idx > level.lessons?.indexOf(lesson) && l.status === 'locked');
              if (nextLesson) nextLesson.status = 'available';
            }
          }
        }
      }
      // Save roadmap updates
      await saveUserDB(userEmail, dbData);
    }

    dbData.progress[roadmapProgressKey] = progress;
    await saveUserDB(userEmail, dbData);

    return res.json({ success: true, progress });
  } catch (error: any) {
    console.error('Progress tracking error:', error);
    return res.status(500).json({ error: 'Failed to update progress' });
  }
});

// 9. API: Get Progress
app.get('/api/progress/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress?.[roadmapId] || null;
    return res.json({ progress });
  } catch (error: any) {
    console.error('Get progress error:', error);
    return res.json({ progress: null });
  }
});

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