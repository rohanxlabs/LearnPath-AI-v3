import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted — define ALL mock factories before any imports are resolved.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // -------------------------------------------------------------------------
  // In-memory SQL store (mirrors the neon mock that was already here)
  // -------------------------------------------------------------------------
  type UserRow = {
    email: string;
    password_hash: string | null;
    roadmap: any;
    progress: any;
    xp: number;
    last_active_date: string | null;
    streak: number;
    created_at?: string;
    updated_at?: string;
  };

  const users = new Map<string, UserRow>();

  function getRow(email: string) {
    return users.get(String(email).toLowerCase());
  }

  function ensureRow(email: string, passwordHash: string | null = null): UserRow {
    const key = String(email).toLowerCase();
    let row = users.get(key);
    if (!row) {
      row = {
        email: key,
        password_hash: passwordHash,
        roadmap: {},
        progress: {},
        xp: 0,
        last_active_date: null,
        streak: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      users.set(key, row);
    }
    return row;
  }

  const roadmapsTable = new Map<string, any>();
  const phasesTable = new Map<string, any>();
  const modulesTable = new Map<string, any>();
  const lessonsTable = new Map<string, any>();
  const userLessonProgressTable = new Map<string, any>();
  const quizzesTable = new Map<string, any>();
  const assignmentsTable = new Map<string, any>();
  const resourcesTable = new Map<string, any>();
  const phaseProjectsTable = new Map<string, any>();
  const lessonContentTable = new Map<string, any>();

  const sqlFn = ((strings: TemplateStringsArray, ...values: any[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
    const queryText = text.trim();
    const lower = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    const usersSelect = lower.startsWith('select') && lower.includes('from users');
    if (usersSelect) {
      const row = getRow(values[0]) ?? null;
      return Promise.resolve(row ? [{ ...row }] : []);
    }

    if (lower.startsWith('insert into users')) {
      const emailIdx = values.findIndex((v: any) => typeof v === 'string' && v.includes('@'));
      const email = emailIdx >= 0 ? values[emailIdx] : values[0];
      const passwordHash = values[emailIdx + 1] ?? null;
      const roadmap = values[emailIdx + 2];
      const progress = values[emailIdx + 3];
      const xp = values[emailIdx + 4] ?? 0;
      const row = ensureRow(email, passwordHash);
      if (passwordHash) row.password_hash = passwordHash;
      if (roadmap !== undefined && roadmap !== null) row.roadmap = roadmap;
      if (progress !== undefined && progress !== null) row.progress = progress;
      if (xp !== undefined && xp !== null) row.xp = xp ?? row.xp;
      row.updated_at = new Date().toISOString();
      return Promise.resolve([]);
    }

    if (lower.startsWith('update users') && lower.includes('set streak')) {
      const row = ensureRow(values[2]);
      row.streak = values[0];
      row.last_active_date = values[1];
      return Promise.resolve([]);
    }

    // Normalized roadmap tables used by Drizzle-based queries in tests.
    const insertRoadmap = lower.startsWith('insert into "roadmaps"');
    const insertPhase = lower.startsWith('insert into "phases"');
    const insertModule = lower.startsWith('insert into "modules"');
    const insertLesson = lower.startsWith('insert into "lessons"');
    const insertUserLessonProgress = lower.startsWith('insert into "user_lesson_progress"');
    const updateLessons = lower.startsWith('update "lessons"');
    const selectRoadmapsByOwner = lower.includes('from "roadmaps"') && lower.includes('where "roadmaps"."owner_email" = $1');
    const selectRoadmapById = lower.includes('from "roadmaps"') && lower.includes('where "roadmaps"."id" = $1');
    const selectPhasesByRoadmap = lower.includes('from "phases"') && lower.includes('where "phases"."roadmap_id" = $1');
    const selectModulesByRoadmap = lower.includes('from "modules"') && lower.includes('where "modules"."roadmap_id" = $1');
    const selectLessonsByRoadmap = lower.includes('from "lessons"') && lower.includes('where "lessons"."roadmap_id" = $1');
    const selectLessonByIdJoinModule = lower.includes('from "lessons"') && lower.includes('inner join "modules"') && lower.includes('where "lessons"."id" = $1');
    const selectUserLessonProgressByOwnerRoadmapCompleted = lower.includes('from "user_lesson_progress"') && lower.includes('where') && lower.includes('completed = $3');
    const selectUserLessonProgressByOwnerLesson = lower.includes('from "user_lesson_progress"') && lower.includes('where "user_lesson_progress"."owner_email" = $1') && lower.includes('"lesson_id" = $2');
    const selectLessonsByModuleStatusOrder = lower.includes('from "lessons"') && lower.includes('"lessons"."module_id" = $1') && lower.includes('"lessons"."status" = $2') && lower.includes('"lessons"."order_index" > $3');
    const selectModuleById = lower.includes('from "modules"') && lower.includes('where "modules"."id" = $1');
    const selectPhaseById = lower.includes('from "phases"') && lower.includes('where "phases"."id" = $1');
    const selectLessonsByModule = lower.includes('from "lessons"') && lower.includes('where "lessons"."module_id" = $1');
    const selectLessonsByRoadmapStatusOrder = lower.includes('from "lessons"') && lower.includes('"lessons"."roadmap_id" = $1') && lower.includes('"lessons"."status" = $2') && lower.includes('order by');
    const selectLessonsByStatus = lower.includes('from "lessons"') && lower.includes('where "lessons"."roadmap_id" = $1') && lower.includes('order by');
    const selectPhasesByRoadmapOrder = lower.includes('from "phases"') && lower.includes('where "phases"."roadmap_id" = $1') && lower.includes('order by');
    const selectModulesByPhaseOrder = lower.includes('from "modules"') && lower.includes('where "modules"."phase_id" = $1') && lower.includes('order by');
    const selectLessonsForCompletedBackfill = lower.includes('from "lessons"') && lower.includes('inner join "roadmaps"') && lower.includes('where "roadmaps"."owner_email" = $1') && lower.includes('and "lessons"."status" = $2');
    const selectUserLessonProgressByOwner = lower.includes('from "user_lesson_progress"') && lower.includes('where "user_lesson_progress"."owner_email" = $1') && lower.includes('"completed" = $2');
    const updateRoadmaps = lower.startsWith('update "roadmaps"');

    if (insertRoadmap) {
      const row = {
        id: values[0], ownerEmail: values[1], title: values[2], goal: values[3],
        experienceLevel: values[4], weeklyHours: values[5], preferredStyle: values[6],
        college: values[7], branch: values[8], year: values[9],
        progressPercent: values[10], totalXp: values[11], lessonsCompleted: values[12],
        hoursRemaining: values[13], status: values[14], updatedAt: values[15],
        createdAt: new Date().toISOString(),
      };
      roadmapsTable.set(row.id, row);
      return Promise.resolve([{ id: row.id }]);
    }

    if (insertPhase) {
      const row = {
        id: values[0], roadmapId: values[1], name: values[2], description: values[3],
        estimatedHours: values[4], skillsCovered: values[5], xpEarned: values[6],
        status: values[7], orderIndex: values[8], createdAt: values[9], updatedAt: values[10],
      };
      phasesTable.set(row.id, row);
      return Promise.resolve([]);
    }

    if (insertModule) {
      const row = {
        id: values[0], phaseId: values[1], roadmapId: values[2], name: values[3],
        type: values[4], status: values[5], orderIndex: values[6],
        createdAt: values[7], updatedAt: values[8],
      };
      modulesTable.set(row.id, row);
      return Promise.resolve([]);
    }

    if (insertLesson) {
      const row = {
        id: values[0], moduleId: values[1], phaseId: values[2], roadmapId: values[3],
        title: values[4], description: values[5], type: values[6], xpReward: values[7],
        status: values[8], learningObjectives: values[9], prerequisites: values[10],
        difficulty: values[11], estimatedMinutes: values[12], skillTags: values[13],
        contentStatus: values[14], orderIndex: values[15], createdAt: values[16], updatedAt: values[17],
      };
      lessonsTable.set(row.id, row);
      return Promise.resolve([]);
    }

    if (insertUserLessonProgress) {
      const row = {
        id: values[0], ownerEmail: values[1], roadmapId: values[2], lessonId: values[3],
        moduleId: values[4], phaseId: values[5], completed: values[6], completedAt: values[7],
        attempts: values[8], quizScore: values[9], studyMinutes: values[10], updatedAt: values[11],
      };
      const key = `${row.ownerEmail.toLowerCase()}::${row.lessonId}`;
      userLessonProgressTable.set(key, row);
      return Promise.resolve([]);
    }

    if (updateLessons) {
      const lessonId = values[values.length - 1];
      const row = lessonsTable.get(lessonId);
      if (row) {
        if (lower.includes('set "status" = $1')) row.status = values[0];
        if (lower.includes('set "updated_at" = $2')) row.updatedAt = values[1] || new Date().toISOString();
        lessonsTable.set(lessonId, row);
      }
      return Promise.resolve([]);
    }

    if (selectRoadmapsByOwner) {
      const ownerEmail = values[0];
      const rows = Array.from(roadmapsTable.values()).filter((r) => r.ownerEmail === ownerEmail);
      return Promise.resolve(rows);
    }

    if (selectRoadmapById) {
      const row = roadmapsTable.get(values[0]);
      return Promise.resolve(row ? [row] : []);
    }

    if (selectPhasesByRoadmap) {
      const roadmapId = values[0];
      const rows = Array.from(phasesTable.values()).filter((r) => r.roadmapId === roadmapId);
      return Promise.resolve(rows);
    }

    if (selectModulesByRoadmap) {
      const roadmapId = values[0];
      const rows = Array.from(modulesTable.values()).filter((r) => r.roadmapId === roadmapId);
      return Promise.resolve(rows);
    }

    if (selectLessonsByRoadmap) {
      const roadmapId = values[0];
      const rows = Array.from(lessonsTable.values()).filter((r) => r.roadmapId === roadmapId);
      return Promise.resolve(rows);
    }

    if (selectLessonByIdJoinModule) {
      const lesson = lessonsTable.get(values[0]);
      if (!lesson) return Promise.resolve([]);
      const module = modulesTable.get(lesson.moduleId);
      return Promise.resolve([{ lesson, moduleId: module?.id, phaseId: module?.phaseId, roadmapId: module?.roadmapId }]);
    }

    if (selectUserLessonProgressByOwnerLesson) {
      const ownerEmail = values[0].toLowerCase();
      const lessonId = values[1];
      const key = `${ownerEmail}::${lessonId}`;
      const row = userLessonProgressTable.get(key);
      return Promise.resolve(row ? [row] : []);
    }

    if (selectUserLessonProgressByOwnerRoadmapCompleted) {
      const ownerEmail = values[0].toLowerCase();
      const roadmapId = values[1];
      const completed = values[2];
      const rows = Array.from(userLessonProgressTable.values()).filter((r) =>
        r.ownerEmail === ownerEmail && r.roadmapId === roadmapId && r.completed === completed
      );
      return Promise.resolve(rows);
    }

    if (selectUserLessonProgressByOwner) {
      const ownerEmail = values[0].toLowerCase();
      const completed = values[1];
      const rows = Array.from(userLessonProgressTable.values()).filter((r) =>
        r.ownerEmail === ownerEmail && r.completed === completed
      );
      return Promise.resolve(rows);
    }

    if (selectLessonsByModuleStatusOrder) {
      const moduleId = values[0];
      const status = values[1];
      const orderIndex = values[2];
      const rows = Array.from(lessonsTable.values())
        .filter((r) => r.moduleId === moduleId && r.status === status && r.orderIndex > orderIndex)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      return Promise.resolve(rows.slice(0, 1));
    }

    if (selectModuleById) {
      const row = modulesTable.get(values[0]);
      return Promise.resolve(row ? [row] : []);
    }

    if (selectPhaseById) {
      const row = phasesTable.get(values[0]);
      return Promise.resolve(row ? [row] : []);
    }

    if (selectLessonsByRoadmapStatusOrder) {
      const roadmapId = values[0];
      const status = values[1];
      const rows = Array.from(lessonsTable.values())
        .filter((r) => r.roadmapId === roadmapId && r.status === status)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      return Promise.resolve(rows.slice(0, 1));
    }

    if (selectPhasesByRoadmapOrder) {
      const roadmapId = values[0];
      const rows = Array.from(phasesTable.values())
        .filter((r) => r.roadmapId === roadmapId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      return Promise.resolve(rows);
    }

    if (selectModulesByPhaseOrder) {
      const phaseId = values[0];
      const rows = Array.from(modulesTable.values())
        .filter((r) => r.phaseId === phaseId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      return Promise.resolve(rows);
    }

    if (selectLessonsByModule && lower.includes('order by')) {
      const moduleId = values[0];
      const rows = Array.from(lessonsTable.values())
        .filter((r) => r.moduleId === moduleId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      return Promise.resolve(rows);
    }

    if (selectLessonsByModule) {
      const moduleId = values[0];
      const rows = Array.from(lessonsTable.values()).filter((r) => r.moduleId === moduleId);
      return Promise.resolve(rows);
    }

    if (selectLessonsForCompletedBackfill) {
      const ownerEmail = values[0].toLowerCase();
      const status = values[1];
      const rows = Array.from(lessonsTable.values()).filter((lesson) => {
        const roadmap = roadmapsTable.get(lesson.roadmapId);
        return roadmap?.ownerEmail === ownerEmail && lesson.status === status;
      }).map((lesson) => ({
        lessonId: lesson.id,
        moduleId: lesson.moduleId,
        phaseId: lesson.phaseId,
        roadmapId: lesson.roadmapId,
        estimatedMinutes: lesson.estimatedMinutes,
      }));
      return Promise.resolve(rows);
    }

    if (updateRoadmaps) {
      const roadmapId = values[values.length - 1];
      const row = roadmapsTable.get(roadmapId);
      if (row) {
        if (values[0] !== undefined) row.lessonsCompleted = values[0];
        if (values[1] !== undefined) row.progressPercent = values[1];
        if (values[2] !== undefined) row.updatedAt = values[2];
        roadmapsTable.set(roadmapId, row);
      }
      return Promise.resolve([]);
    }

    // Return empty results for other normalized-table reads that are not needed
    // by the current test flow.
    return Promise.resolve([]);
  }) as any;

  sqlFn.unsafe = () => Promise.resolve([]);
  sqlFn.reset = () => {
    users.clear();
    roadmapsTable.clear();
    phasesTable.clear();
    modulesTable.clear();
    lessonsTable.clear();
    userLessonProgressTable.clear();
    quizzesTable.clear();
    assignmentsTable.clear();
    resourcesTable.clear();
    phaseProjectsTable.clear();
    lessonContentTable.clear();
  };

  // -------------------------------------------------------------------------
  // In-memory Supabase Auth store
  // -------------------------------------------------------------------------
  type AuthUser = { id: string; email: string; user_metadata: Record<string, any> };
  type AuthSession = { access_token: string; refresh_token: string; expires_in: number; user: AuthUser };

  const authUsers = new Map<string, AuthUser>();    // email → user
  const authTokens = new Map<string, AuthUser>();   // token → user (shared reference exposed as authTokenStore)
  const recoveryTokens = new Set<string>();         // tokens created via password-recovery flow
  let tokenCounter = 1;

  function makeToken() { return `test-token-${tokenCounter++}`; }

  function supabaseAdminMock() {
    return {
      auth: {
        admin: {
          createUser: ({ email, password, user_metadata }: any) => {
            const existing = authUsers.get(email.toLowerCase());
            if (existing) {
              return Promise.resolve({ data: { user: null }, error: { message: 'User already registered', code: 'email_exists' } });
            }
            const user: AuthUser = {
              id: `uid-${email}`,
              email: email.toLowerCase(),
              user_metadata: user_metadata || {},
            };
            authUsers.set(email.toLowerCase(), user);
            const token = makeToken();
            authTokens.set(token, user);
            return Promise.resolve({ data: { user }, error: null });
          },
          updateUserById: (_id: string, _updates: any) => {
            return Promise.resolve({ data: {}, error: null });
          },
          signOut: (_token: string) => Promise.resolve({ error: null }),
        },
        getUser: (token: string) => {
          const user = authTokens.get(token) ?? null;
          if (!user) return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
          return Promise.resolve({ data: { user }, error: null });
        },
        // verifyOtp only succeeds when the token was explicitly tagged as a recovery token.
        verifyOtp: ({ token_hash, type }: { token_hash: string; type: string }) => {
          if (type !== 'recovery') {
            return Promise.resolve({ data: { user: null }, error: { message: 'Invalid OTP type' } });
          }
          const user = authTokens.get(token_hash) ?? null;
          if (!user || !recoveryTokens.has(token_hash)) {
            return Promise.resolve({ data: { user: null }, error: { message: 'Invalid or expired recovery token' } });
          }
          return Promise.resolve({ data: { user }, error: null });
        },
      },
    };
  }

  function supabaseAnonMock() {
    return {
      auth: {
        signInWithPassword: ({ email, password: _pw }: any) => {
          const user = authUsers.get(email.toLowerCase());
          if (!user) {
            return Promise.resolve({ data: { session: null, user: null }, error: { message: 'Invalid credentials' } });
          }
          const token = makeToken();
          authTokens.set(token, user);
          const session: AuthSession = {
            access_token: token,
            refresh_token: `rt-${token}`,
            expires_in: 3600,
            user,
          };
          return Promise.resolve({ data: { session, user }, error: null });
        },
        resetPasswordForEmail: (_email: string, _opts?: any) => {
          return Promise.resolve({ data: {}, error: null });
        },
        persistSession: false,
        autoRefreshToken: false,
      },
    };
  }

  const supabaseCreateClient = (url: string, key: string) => {
    if (key === 'test-service-role-key') return supabaseAdminMock();
    return supabaseAnonMock();
  };

  const resetAuth = () => {
    authUsers.clear();
    authTokens.clear();
    recoveryTokens.clear();
    tokenCounter = 1;
  };

  // authTokenStore is the same Map reference — exposed so the jwt mock can do
  // synchronous token lookups without async getUser calls.
  // recoveryTokenStore is exposed so tests can tag a token as a recovery token.
  return { mockSql: sqlFn, supabaseCreateClient, resetAuth, authTokenStore: authTokens, recoveryTokenStore: recoveryTokens };
});

// ---------------------------------------------------------------------------
// Wire globals used by mockDb.ts helpers in individual test files
// ---------------------------------------------------------------------------
vi.stubGlobal('__mockSql', mocks.mockSql);
vi.stubGlobal('__resetMockDb', () => {
  mocks.mockSql.reset();
  mocks.resetAuth();
});
vi.stubGlobal('__supabaseCreateClient', mocks.supabaseCreateClient);
vi.stubGlobal('__authTokenStore', mocks.authTokenStore);
vi.stubGlobal('__recoveryTokenStore', mocks.recoveryTokenStore);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Keep neon mock for streak.test.ts which mocks it independently
vi.mock('@neondatabase/serverless', () => ({
  neon: () => mocks.mockSql,
}));

// Mock pg.Pool so drizzle.ts uses the in-memory store instead of a real DB.
// Vitest 4 requires constructors to use 'function' or 'class' syntax (not arrow fns).
vi.mock('pg', () => {
  const Pool = vi.fn(function (this: any) {
    this.query = async (text: any, values?: any[]) => {
      // Drizzle / pg can call query() with a config object { text, values }.
      // Normalize that shape here so the in-memory mock can still execute.
      if (text && typeof text === 'object' && typeof text.text === 'string') {
        values = values ?? text.values ?? [];
        text = text.text;
      }
      // Reconstruct a tagged-template call from the parameterised query so
      // the existing mockSql logic can handle it.
      const queryText = typeof text === 'string' ? text : String(text);
      console.log('[mock-pg] query:', queryText);
      if (values && values.length) console.log('[mock-pg] values:', values);
      const strings = queryText.split(/\$\d+/) as unknown as TemplateStringsArray;
      (strings as any).raw = strings;
      const rows = await mocks.mockSql(strings, ...(values ?? []));
      return { rows: Array.isArray(rows) ? rows : [] };
    };
    this.end = () => Promise.resolve();
  });
  return { Pool, default: { Pool } };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, _opts?: any) =>
    mocks.supabaseCreateClient(url, key),
}));

// Mock jsonwebtoken so requireAuth uses the in-memory token store instead of
// doing real JWT signature verification (test tokens are simple strings).
vi.mock('jsonwebtoken', () => ({
  default: {
    // decode() is called first in requireAuth to read the token header (alg/kid).
    // Test tokens are plain strings (not real JWTs), so we return a fake header
    // that routes them to the HS256 path where the mock verify() runs.
    decode: (token: string, opts?: any) => {
      if (opts?.complete) {
        return { header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: token }, signature: '' };
      }
      return { sub: token };
    },
    verify: (token: string, _secret: string) => {
      const authStore: Map<string, any> = (globalThis as any).__authTokenStore;
      if (!authStore) throw new Error('jwt: unknown token');
      const u = authStore.get(token);
      if (!u) throw new Error('jwt: invalid token');
      return { sub: u.id, email: u.email };
    },
    sign: (_payload: any, _secret: string) => 'mocked-jwt',
  },
}));
