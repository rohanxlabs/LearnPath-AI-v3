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

  const sqlFn = ((strings: TemplateStringsArray, ...values: any[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
    const upper = text.trim().toUpperCase();

    if (upper.includes('CREATE TABLE IF NOT EXISTS')) return Promise.resolve([]);
    if (upper.includes('ALTER TABLE') && upper.includes('ADD COLUMN IF NOT EXISTS')) return Promise.resolve([]);

    if (upper.startsWith('SELECT') && upper.includes('FROM USERS')) {
      const row = getRow(values[0]) ?? null;
      return Promise.resolve(row ? [{ ...row }] : []);
    }

    if (upper.startsWith('INSERT INTO USERS')) {
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

    if (upper.startsWith('UPDATE USERS') && upper.includes('SET STREAK')) {
      const row = ensureRow(values[2]);
      row.streak = values[0];
      row.last_active_date = values[1];
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  }) as any;

  sqlFn.unsafe = () => Promise.resolve([]);
  sqlFn.reset = () => users.clear();

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
    this.query = async (text: string, values: any[]) => {
      // Reconstruct a tagged-template call from the parameterised query so
      // the existing mockSql logic can handle it.
      const strings = text.split(/\$\d+/) as unknown as TemplateStringsArray;
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
