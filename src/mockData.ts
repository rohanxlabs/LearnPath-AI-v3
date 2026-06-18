import { UserProfile, UserSettings, Roadmap, Achievement, SystemNotification, ChatMessage, Level, Lesson, Phase } from './types';

// Bypass authentication flag
export const DEV_BYPASS_AUTH = true;

// Preloaded Static Achievements list
export const PRESET_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-foundations',
    name: 'First Steps in AI',
    description: 'Complete the Foundations Phase and understand basic neural structures.',
    icon: 'Sparkles',
    unlocked: true,
    unlockedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    category: 'expert',
    xpReward: 100,
  },
  {
    id: 'ach-python',
    name: 'Python Beginner',
    description: 'Write your first matrix operation program in NumPy.',
    icon: 'Code2',
    unlocked: true,
    unlockedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    category: 'python',
    xpReward: 150,
  },
  {
    id: 'ach-prompt',
    name: 'Prompt Engineer',
    description: 'Design a prompt system utilizing system boundaries and XML schemas.',
    icon: 'MessageSquareText',
    unlocked: false,
    category: 'prompt',
    xpReward: 200,
  },
  {
    id: 'ach-rag',
    name: 'RAG Master',
    description: 'Ingest external vector contexts and search using cosine similarity scoring.',
    icon: 'Database',
    unlocked: false,
    category: 'rag',
    xpReward: 250,
  },
  {
    id: 'ach-agent',
    name: 'AI Agent Builder',
    description: 'Design an interactive tool-using multi-agent loop with feedback control.',
    icon: 'Bot',
    unlocked: false,
    category: 'agent',
    xpReward: 300,
  },
  {
    id: 'ach-mcp',
    name: 'MCP Expert',
    description: 'Establish secure Model Context Protocol connections and read custom resources.',
    icon: 'Network',
    unlocked: false,
    category: 'mcp',
    xpReward: 350,
  },
  {
    id: 'ach-expert',
    name: 'Full-Stack AI Engineer',
    description: 'Deploy a production-ready application featuring full roadmap automation.',
    icon: 'Award',
    unlocked: false,
    category: 'expert',
    xpReward: 500,
  },
];

// Helper to seed sample items for interactive learning
const createInteractiveLessons = (phaseId: string, levelName: string): Lesson[] => {
  return [
    {
      id: `les-${phaseId}-learn`,
      name: `Demystifying ${levelName} Core Mechanics`,
      type: 'learn',
      xpReward: 20,
      status: 'available',
      content: `
### Key Concepts

Welcome to this lesson! Today we are studying **${levelName}**.
At the heart of modern engineering lies the ability to decompose complex operations into sequential steps. Let's examine how this connects to automated inference and optimization.

#### 1. Core Mathematical Representations
Variables can be organized into multi-dimensional tensors. A forward pass in a neural layer is represented as:

$$ y = \\sigma(W \\cdot x + b) $$

Where:
- $W$ is the weight matrix (determining focus parameters)
- $x$ is the input vector (the features/token metrics)
- $b$ is the bias vector (trigger baseline)
- $\\sigma$ is the activation function (introducing non-linear boundaries)

#### 2. The Feedback Loop
Without feedback, learning cannot occur. We utilize gradient optimization (usually Adam or SGD) to nudge weights inversely relative to error.
      `,
    },
    {
      id: `les-${phaseId}-quiz`,
      name: `${levelName} Verification Quiz`,
      type: 'quiz',
      xpReward: 50,
      status: 'locked',
      content: `Test your structural understanding of ${levelName}. Answer all questions to unlock high-level XP points.`,
      quizQuestions: [
        {
          id: `q-${phaseId}-1`,
          question: `What fundamental operation is used to propagate errors backward during optimization?`,
          options: [
            'Markov Forward Chain Approximation',
            'Backpropagation via the Calculus Chain Rule',
            'Brute-Force Parameter Space Grid Search',
            'Linear Interpolation of Static Vectors'
          ],
          correctIndex: 1,
          explanation: 'Backpropagation computes the gradient of the loss function with respect to each weight using the mathematical chain rule, allowing back-to-front parameter optimization.'
        },
        {
          id: `q-${phaseId}-2`,
          question: `Which component is critical to prevent a feed-forward model from compounding into a standard linear regression model?`,
          options: [
            'Adding a high bias scale',
            'Increasing token counts',
            'Non-linear activation functions (ReLU, GeLU)',
            'Adding more dense layers without transformation'
          ],
          correctIndex: 2,
          explanation: 'Without non-linear activation functions, subsequent matrix multiplications fold into a single linear transformation, meaning the model can only learn linear boundaries.'
        }
      ]
    },
    {
      id: `les-${phaseId}-code`,
      name: `${levelName} Functional Scripting`,
      type: 'coding',
      xpReward: 75,
      status: 'locked',
      content: `Write a clean python expression to compute modern metrics. Fill in the requested function and hit Run to evaluate against the validation test suite.`,
      codingExercise: {
        instructions: `Implement the function 'calculate_loss(y_true, y_pred)' which returns the Mean Squared Error (MSE) value for the given list inputs. Ensure you return a float value.`,
        templateCode: `def calculate_loss(y_true, y_pred):\n    # y_true and y_pred are lists of numerical floats.\n    # Calculate and return Mean Squared Error (MSE)\n    pass`,
        solutionCode: `def calculate_loss(y_true, y_pred):\n    squared_errors = [(yt - yp) ** 2 for yt, yp in zip(y_true, y_pred)]\n    return sum(squared_errors) / len(y_true)`,
        validationSnippet: `result = calculate_loss([1.0, 2.0, 3.0], [1.1, 1.9, 3.2])\nassert abs(result - 0.02) < 0.001`,
        hint: `To calculate Mean Squared Error, iterate through elements, take the squared subtraction difference '((yt - yp) ** 2)', sum them up, and divide by the total count.`
      }
    },
    {
      id: `les-${phaseId}-challenge`,
      name: `${levelName} Optimization Boss Challenge`,
      type: 'boss_challenge',
      xpReward: 300,
      status: 'locked',
      content: `### Objective: Solve the ultimate ${levelName} puzzle.\nDeploy a system that orchestrates high-throughput inference across distributed compute agents under restricted networking constraints.`
    }
  ];
};

const createLevels = (phaseId: string, phaseName: string): Level[] => {
  return [
    {
      id: `lvl-${phaseId}-basics`,
      name: 'Basics & Definitions',
      type: 'Basics',
      status: 'completed',
      lessons: createInteractiveLessons(phaseId, `${phaseName} Basics`)
    },
    {
      id: `lvl-${phaseId}-foundations`,
      name: 'Foundations & Mechanics',
      type: 'Foundations',
      status: 'current',
      lessons: createInteractiveLessons(phaseId, `${phaseName} Core`)
    },
    {
      id: `lvl-${phaseId}-intermediate`,
      name: 'Intermediate Applied Pipelines',
      type: 'Intermediate',
      status: 'locked',
      lessons: createInteractiveLessons(phaseId, `${phaseName} Operations`)
    },
    {
      id: `lvl-${phaseId}-advanced`,
      name: 'Advanced Adaptive Systems',
      type: 'Advanced',
      status: 'locked',
      lessons: createInteractiveLessons(phaseId, `${phaseName} Architecture`)
    },
    {
      id: `lvl-${phaseId}-boss`,
      name: `Boss Puzzle: ${phaseName} Integration`,
      type: 'Boss Challenge',
      status: 'locked',
      lessons: [
        {
          id: `les-${phaseId}-boss-final`,
          name: `Unlocking Phase ${phaseName} Mastery`,
          type: 'boss_challenge',
          xpReward: 300,
          status: 'locked',
          content: 'Synthesize everything you have learned in this phase to beat the boss challenge and win a legendary mastery badge.'
        }
      ]
    }
  ];
};

const INITIAL_ROADMAPS: Roadmap[] = [
  {
    id: 'roadmap-ai-engineer',
    goal: 'Learn Master Full-Stack AI Engineering',
    experienceLevel: 'Beginner',
    weeklyHours: 10,
    preferredStyle: 'Hands-on',
    progressPercent: 28,
    totalXp: 1840,
    lessonsCompleted: 14,
    hoursRemaining: 67,
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    phases: [
      {
        id: 'phase-foundations',
        name: 'Foundations',
        description: 'Understand the core machine learning concepts, model parameters, and gradient updates.',
        progress: 100,
        estimatedHours: 8,
        skillsCovered: ['Numpy', 'Linear Algebra', 'Gradient Descents', 'Supervised Learning'],
        xpEarned: 500,
        status: 'completed',
        levels: createLevels('foundations', 'Foundations')
      },
      {
        id: 'phase-python',
        name: 'Python',
        description: 'Write robust Python components, configure virtual environments, and execute file pipelines.',
        progress: 60,
        estimatedHours: 12,
        skillsCovered: ['DataFrames', 'OOP Python', 'Script Pipelines', 'Virtual Envs'],
        xpEarned: 420,
        status: 'current',
        levels: createLevels('python', 'Python')
      },
      {
        id: 'phase-math-ai',
        name: 'Math for AI',
        description: 'Multivariable calculus, optimization boundaries, vectors, statistics, and loss analysis.',
        progress: 0,
        estimatedHours: 15,
        skillsCovered: ['Probability', 'Eigenvectors', 'Derivatives', 'Loss Optimization'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('math-ai', 'Math for AI')
      },
      {
        id: 'phase-llm-fund',
        name: 'LLM Fundamentals',
        description: 'Explore tokenizer strategies, attention mechanism operations, and parameter prompt optimization.',
        progress: 0,
        estimatedHours: 18,
        skillsCovered: ['Tokenizers', 'Self-Attention', 'Transformers', 'Prompt Templating'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('llm-fund', 'LLM Fundamentals')
      },
      {
        id: 'phase-ai-agents',
        name: 'AI Agents',
        description: 'Multi-agent coordination, tools routing, cyclic logical trees, and robust session execution.',
        progress: 0,
        estimatedHours: 20,
        skillsCovered: ['ReAct Loop', 'Structured Outputs', 'Router Agents', 'Memory States'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('ai-agents', 'AI Agents')
      },
      {
        id: 'phase-applied-ai',
        name: 'Applied AI',
        description: 'Inference serving scaling, caching mechanism implementation, and cloud GPU integrations.',
        progress: 0,
        estimatedHours: 16,
        skillsCovered: ['Quantization', 'FastAPI Servers', 'Redis Cache', 'Docker Deploy'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('applied-ai', 'Applied AI')
      },
      {
        id: 'phase-mcp-protocols',
        name: 'MCP & Protocols',
        description: 'Explore the Model Context Protocol, secure client-server handshake, and database connections.',
        progress: 0,
        estimatedHours: 14,
        skillsCovered: ['MCP Specs', 'Context Injection', 'Server Resource SSE', 'Secure APIs'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('mcp-protocols', 'MCP & Protocols')
      },
      {
        id: 'phase-career-ready',
        name: 'Career Ready',
        description: 'Resume calibration, enterprise coding challenges, mockup technical panels, and AI portfolios.',
        progress: 0,
        estimatedHours: 10,
        skillsCovered: ['System Design', 'Behavioral Sync', 'Mock Interviews', 'Git Portfolio'],
        xpEarned: 0,
        status: 'locked',
        levels: createLevels('career-ready', 'Career Ready')
      }
    ]
  }
];

const INITIAL_PROFILE: UserProfile = {
  id: 'user-demo',
  name: 'Alex Parker',
  email: 'alex.parker@learnpath.ai',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop',
  xp: 1840,
  level: 12,
  streak: 5,
  isPro: false,
  roadmapsCompleted: 0,
  hoursStudied: 24.5,
  aiSessionsCount: 18,
  createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
};

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: false,
  privacyPublicProfile: true
};

const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif-1',
    title: 'Daily Streak is Active!',
    message: 'Awesome job! You are on a 5-day streak. Complete a quick NumPy exercise today to maintain your momentum.',
    category: 'system',
    read: false,
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 'notif-2',
    title: 'AI Mentor Message',
    message: 'Your Python assignment is feedback-completed. AI Mentor suggested review on matrix broadcasting.',
    category: 'mentor',
    read: false,
    timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  },
  {
    id: 'notif-3',
    title: 'Achievement Unlocked: Python Beginner',
    message: 'Congratulations! You successfully implemented numpy vector computation processes.',
    category: 'achievement',
    read: true,
    timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString()
  }
];

const INITIAL_CHATS: ChatMessage[] = [
  {
    id: 'chat-1',
    sender: 'assistant',
    text: "Hi there! I am your LearnPath AI Mentor. I specialize in breaking down complex concepts, creating study plans, and scoring coding solutions. How can I help with your AI journey today?",
    timestamp: new Date(Date.now() - 3600 * 1000 * 1.5).toISOString()
  }
];

// LocalStorage helpers with automatic loading
export const loadLocalStorage = () => {
  if (typeof window === 'undefined') {
    return {
      profile: INITIAL_PROFILE,
      settings: DEFAULT_SETTINGS,
      roadmaps: INITIAL_ROADMAPS,
      achievements: PRESET_ACHIEVEMENTS,
      notifications: INITIAL_NOTIFICATIONS,
      chats: INITIAL_CHATS
    };
  }

  const getOrSet = <T>(key: string, fallback: T): T => {
    const val = localStorage.getItem(`learnpath_${key}`);
    if (val) {
      try {
        return JSON.parse(val) as T;
      } catch {
        return fallback;
      }
    } else {
      localStorage.setItem(`learnpath_${key}`, JSON.stringify(fallback));
      return fallback;
    }
  };

  return {
    profile: getOrSet('profile', INITIAL_PROFILE),
    settings: getOrSet('settings', DEFAULT_SETTINGS),
    roadmaps: getOrSet('roadmaps', INITIAL_ROADMAPS),
    achievements: getOrSet('achievements', PRESET_ACHIEVEMENTS),
    notifications: getOrSet('notifications', INITIAL_NOTIFICATIONS),
    chats: getOrSet('chats', INITIAL_CHATS)
  };
};

export const saveLocalStorage = (data: Partial<{
  profile: UserProfile;
  settings: UserSettings;
  roadmaps: Roadmap[];
  achievements: Achievement[];
  notifications: SystemNotification[];
  chats: ChatMessage[];
}>) => {
  if (typeof window === 'undefined') return;
  Object.entries(data).forEach(([key, val]) => {
    localStorage.setItem(`learnpath_${key}`, JSON.stringify(val));
  });
};
