import { neon } from '@neondatabase/serverless';
import { withUserLock } from './middleware';
import {
  getRoadmapsByOwner,
  migrateRoadmapJsonToTables
} from '../db/queries';

export const sql = neon(process.env.DATABASE_URL!);

// ---------------------------------------------------------------------------
// In-memory caches
// ---------------------------------------------------------------------------
type RecCacheEntry = { data: any; timestamp: number };
export const recCache: Map<string, RecCacheEntry> = new Map();
export const REC_CACHE_TTL = 5 * 60 * 1000;

type RoadmapCacheEntry = { data: any[]; timestamp: number };
const roadmapCache: Map<string, RoadmapCacheEntry> = new Map();
const ROADMAP_CACHE_TTL = 30 * 1000;

// ---------------------------------------------------------------------------
// Users table bootstrap
// ---------------------------------------------------------------------------
export type UserDB = {
  passwordHash?: string;
  [key: string]: any;
};

let usersTableReady: Promise<void> | null = null;

export async function ensureUsersTable(): Promise<void> {
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
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`;
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

export function getDefaultUserDB(): UserDB {
  return {
    roadmaps: [],
    curated_resources: [
      { id: 'res-1', phaseId: 'phase-0', title: 'Deep Learning Foundations & Abstractions', type: 'video', url: 'https://www.youtube.com/watch?v=aircAruvnKk', provider: '3Blue1Brown', duration: '22 mins', description: 'Excellent video explaining deep neural networks and backpropagation visually.' },
      { id: 'res-2', phaseId: 'phase-0', title: 'Google Machine Learning Crash Course', type: 'course', url: 'https://developers.google.com/machine-learning/crash-course', provider: 'Google Devs', duration: '15 hours', description: "Google's high-speed structured introduction to core ML concepts." },
      { id: 'res-3', phaseId: 'phase-1', title: 'Advanced Scientific Computing with NumPy', type: 'article', url: 'https://numpy.org/doc/stable/user/quickstart.html', provider: 'NumPy Org', duration: '45 mins', description: 'Comprehensive tutorials on tensor layouts, multi-dimensional slicing, and broadcast loops.' },
      { id: 'res-4', phaseId: 'phase-1', title: 'A Whirlwind Tour of Python Coding', type: 'book', url: 'https://github.com/jakevdp/WhirlwindTourOfPython', provider: "O'Reilly Press", duration: '3 hours', description: 'Fast track course on essential syntax, structures, and object orientation.' },
      { id: 'res-5', phaseId: 'phase-2', title: 'Linear Algebra Cheat Sheet & Vectors', type: 'article', url: 'https://medium.com', provider: 'Towards Data Science', duration: '15 mins', description: 'A beautifully formatted guide covering matrices, dot products, and principal dimensions.' },
      { id: 'res-6', phaseId: 'phase-2', title: 'The Matrix Calculus & Backpropagation Handbook', type: 'paper', url: 'https://arxiv.org', provider: 'arXiv Preprints', duration: '2 hours', description: 'Rigorous derivation of cost function optimizations and weight updates.' },
      { id: 'res-7', phaseId: 'phase-3', title: 'Attention Is All You Need (Transformer Paper)', type: 'paper', url: 'https://arxiv.org/abs/1706.03762', provider: 'arXiv Preprints', duration: '1.2 hours', description: 'The breakthrough research paper detailing the self-attention architecture.' },
      { id: 'res-8', phaseId: 'phase-3', title: 'Prompt Engineering Techniques & Standards', type: 'course', url: 'https://www.promptingguide.ai/', provider: 'DAIR.AI', duration: '4 hours', description: 'Industry-standard guides on dynamic template styling, few-shot routing, and chain of thought.' }
    ],
    topic_wise_quizzes: [
      { id: 'quiz-python', quizId: 'quiz-python', quizName: 'Python Foundations & Data Structure Quiz', score: 100, totalQuestions: 5, attemptsCount: 2, lastAttemptedAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString() },
      { id: 'quiz-math', quizId: 'quiz-math', quizName: 'Linear Algebra & Dimensional Calculus Quiz', score: 80, totalQuestions: 5, attemptsCount: 1, lastAttemptedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString() },
      { id: 'quiz-llm', quizId: 'quiz-llm', quizName: 'Attention Engine & LLM Architecture Quiz', score: 0, totalQuestions: 5, attemptsCount: 0, lastAttemptedAt: 'Never' },
      { id: 'quiz-rag', quizId: 'quiz-rag', quizName: 'Vector Embeddings & RAG Optimization Quiz', score: 0, totalQuestions: 5, attemptsCount: 0, lastAttemptedAt: 'Never' }
    ],
    projects: [
      { id: 'proj-1', title: 'Custom AI Prompt Template Builder & Proxy', difficulty: 'beginner', description: 'Build an editor to style and optimize customizable system prompts, validating them using strict safety filters.', techStack: ['React', 'Tailwind', 'localStorage', 'lucide-react'], features: ['Dynamic variable injection', 'Precompiled templates library', 'One-click markdown export'], progress: 100, githubUrl: 'https://github.com/learnpath/prompt-builder' },
      { id: 'proj-2', title: 'Interactive NumPy Tensor Calculator', difficulty: 'beginner', description: 'A visual calculator demonstrating dot products, matrix multiplications, transpose operations, and scalar broadcasting rules.', techStack: ['React', 'NumPy Web Assembly', 'Tailwind CSS'], features: ['Interactive matrix grid inputs', 'Staggered computation steps visualization', 'Dimension validation warnings'], progress: 30, githubUrl: 'https://github.com/learnpath/tensor-calc' },
      { id: 'proj-3', title: 'Document PDF Ingestion Engine & Summarizer', difficulty: 'intermediate', description: 'A robust web utility that parses text from uploaded PDF chapters, generates chunk-based summaries, and builds high-speed search filters.', techStack: ['Express', 'React', 'PDF-Parse', 'Gemini Core'], features: ['Recursive token splitting', 'Auto-generated context tags map', 'Search with text highlight markers'], progress: 0 },
      { id: 'proj-4', title: 'Local Git Commit Enhancer & Interactive Explainer', difficulty: 'intermediate', description: 'Integrate dynamic git hooks to read git diff files, draft informative commit messages matching core conventions, and explain semantic changes.', techStack: ['Node.js CLI', 'Simple Git API', 'Gemini LLMs'], features: ['Automatic Conventional Commits formatting', 'Performance impact flag review', 'Security-sensitive files monitor'], progress: 0 },
      { id: 'proj-5', title: 'Autonomous AI Debugging Sandbox & Runner', difficulty: 'advanced', description: 'Create a secured, encapsulated browser coding playground that runs exercises, analyzes error logs, and requests corrective instructions from Gemini.', techStack: ['React', 'WebContainers', 'Xterm.js', 'LLM Agents'], features: ['Real-time terminal execution logs', 'Automated code diagnostics tool', 'Staggered auto-repair loops'], progress: 0 }
    ],
    achievements: [
      { id: 'ach-1', name: 'First Steps', description: 'Complete your first lesson to begin your learning journey.', icon: '🎯', unlocked: false, category: 'python', xpReward: 50 },
      { id: 'ach-2', name: 'Quiz Master', description: 'Score 100% on any quiz to demonstrate mastery.', icon: '🧠', unlocked: false, category: 'prompt', xpReward: 75 },
      { id: 'ach-3', name: 'Roadmap Builder', description: 'Generate your first AI-powered learning roadmap.', icon: '🗺️', unlocked: false, category: 'agent', xpReward: 100 }
    ]
  };
}

export async function loadUserDB(userEmail: string, options: { createIfMissing?: boolean } = {}): Promise<UserDB | null> {
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
        progress,
        xp: row.xp ?? 0,
        passwordHash: row.password_hash || undefined,
        last_active_date: row.last_active_date,
        streak: row.streak ?? 0
      };

      // BACKWARD COMPATIBILITY: Migrate old single roadmap to roadmaps array.
      if (dbData.roadmap && !Array.isArray(dbData.roadmaps)) {
        console.log('[Migration] Converting single roadmap to roadmaps array for user:', userEmail);
        dbData.roadmaps = [{
          ...dbData.roadmap,
          id: dbData.roadmap.id || `roadmap-${Date.now()}`,
          createdAt: dbData.roadmap.createdAt || new Date().toISOString()
        }];
        delete dbData.roadmap;
        await saveUserDB(userEmail, dbData);
      }

      // MIGRATION: Backfill profile.name for accounts created before the name field existed.
      if (!dbData.profile) dbData.profile = {};
      if (!dbData.profile.name || !dbData.profile.name.trim()) {
        const derivedName = userEmail
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        console.log('[Migration] Backfilling profile.name for user:', userEmail);
        dbData.profile.name = derivedName;
        await saveUserDB(userEmail, dbData);
      }

      if (!dbData.roadmaps) dbData.roadmaps = [];

      // BACKWARD COMPATIBILITY (Phase 2): one-time backfill of normalized tables.
      if (dbData.roadmaps.length > 0) {
        const alreadyMigrated = (await getRoadmapsByOwner(userEmail)).length > 0;
        if (!alreadyMigrated) {
          migrateRoadmapJsonToTables(userEmail, dbData.roadmaps).catch((err: any) => {
            console.error('[Migration] Normalized table backfill failed for', userEmail, err?.message || err);
          });
        }
      }

      return dbData;
    }

    if (options.createIfMissing === false) return null;

    const defaultDB = getDefaultUserDB();
    await saveUserDB(userEmail, defaultDB);
    return defaultDB;
  } catch (error) {
    console.error('[Database Error] Failed to load user data:', error);
    if (options.createIfMissing !== false) return getDefaultUserDB();
    return null;
  }
}

export async function saveUserDB(userEmail: string, dbData: UserDB): Promise<void> {
  return withUserLock(userEmail, async () => {
    await ensureUsersTable();
    try {
      const result = await sql`
        SELECT roadmap, progress FROM users WHERE email = ${userEmail.toLowerCase()}
      `;
      const currentRoadmap = result[0]?.roadmap || {};
      const currentProgress = result[0]?.progress || {};

      const { passwordHash, roadmaps, curated_resources, projects, topic_wise_quizzes, profile, settings, achievements, notifications, chats, resource_states, activityLog } = dbData;

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
        chats: chats || currentProgress.chats || [],
        resource_states: resource_states || currentProgress.resource_states || { completedIds: [], savedIds: [] },
        activityLog: activityLog || currentProgress.activityLog || {}
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
  });
}

export async function getUserRoadmaps(userEmail: string): Promise<any[]> {
  const key = userEmail.toLowerCase();
  const cached = roadmapCache.get(key);
  if (cached && Date.now() - cached.timestamp < ROADMAP_CACHE_TTL) return cached.data;

  const dbData = await loadUserDB(userEmail, { createIfMissing: false });
  const roadmaps = dbData?.roadmaps || [];
  roadmapCache.set(key, { data: roadmaps, timestamp: Date.now() });
  return roadmaps;
}

export function invalidateUserRoadmaps(userEmail: string): void {
  roadmapCache.delete(userEmail.toLowerCase());
}

export async function updateStreak(userEmail: string): Promise<number> {
  await ensureUsersTable();
  const today = new Date().toISOString().split('T')[0];
  try {
    const result = await sql`
      SELECT streak, last_active_date FROM users WHERE email = ${userEmail.toLowerCase()}
    `;
    let currentStreak = 0;
    let lastActiveDate: string | null = null;

    if (result[0]) {
      currentStreak = result[0].streak ?? 0;
      lastActiveDate = result[0].last_active_date;
    }

    if (lastActiveDate === today) return currentStreak;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    if (lastActiveDate === yesterdayStr) {
      // Consecutive day — increment streak.
      currentStreak += 1;
    } else if (lastActiveDate === twoDaysAgoStr) {
      // One-day grace window — preserve streak, do not reset or increment.
    } else if (!lastActiveDate || lastActiveDate < twoDaysAgoStr) {
      // Missed more than one day — reset.
      currentStreak = 1;
    }

    await sql`
      UPDATE users SET streak = ${currentStreak}, last_active_date = ${today}
      WHERE email = ${userEmail.toLowerCase()}
    `;
    return currentStreak;
  } catch (error) {
    console.error('[Database Error] Failed to update streak:', error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Achievement unlock helper — idempotent, adds XP, persists.
// Returns the achievement object if it was just unlocked, null if already unlocked
// or not found.
// ---------------------------------------------------------------------------
export async function unlockAchievement(
  userEmail: string,
  achievementId: string
): Promise<{ id: string; name: string; icon: string; xpReward: number } | null> {
  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    if (!dbData) return null;

    const achievements: any[] = Array.isArray(dbData.progress?.achievements)
      ? dbData.progress.achievements
      : Array.isArray(dbData.achievements)
        ? dbData.achievements
        : [];

    const ach = achievements.find((a: any) => a.id === achievementId);
    if (!ach || ach.unlocked) return null; // already unlocked or not found

    ach.unlocked = true;
    ach.unlockedAt = new Date().toISOString();

    // Award XP
    const xpReward = Number(ach.xpReward) || 0;
    dbData.xp = (dbData.xp || 0) + xpReward;
    if (!dbData.profile) dbData.profile = {};
    dbData.profile.xp = dbData.xp;

    // Persist achievements in the right location
    if (Array.isArray(dbData.progress?.achievements)) {
      dbData.progress.achievements = achievements;
    } else {
      if (!dbData.progress) dbData.progress = {};
      dbData.progress.achievements = achievements;
    }

    await saveUserDB(userEmail, dbData);
    return { id: ach.id, name: ach.name, icon: ach.icon, xpReward };
  } catch (err: any) {
    console.error('[Achievement] Failed to unlock achievement:', err?.message || err);
    return null;
  }
}

