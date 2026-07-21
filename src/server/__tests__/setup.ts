import { vi } from 'vitest';

// vi.hoisted runs before imports so we must define the mock factory inline.
const mocks = vi.hoisted(() => {
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
      // Upsert: find email among values (first string with '@')
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

  return { mockSql: sqlFn };
});

vi.stubGlobal('__mockSql', mocks.mockSql);
vi.stubGlobal('__resetMockDb', () => mocks.mockSql.reset());

vi.mock('@neondatabase/serverless', () => ({
  neon: () => mocks.mockSql,
}));
