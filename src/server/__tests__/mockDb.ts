// In-memory mock of the Neon serverless `sql` tagged-template API used by server.ts.
// Supports the exact query shapes the app issues (SELECT/INSERT/CREATE/ALTER) against
// the `users` table, keyed by lowercase email. Intentionally minimal — sufficient for
// critical-path smoke tests without a live database.

export type UserRow = {
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

type SqlQuery = { text: string; values: any[] };

function buildQuery(strings: TemplateStringsArray, values: any[]): SqlQuery {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
  return { text, values };
}

export function createMockSql() {
  const users = new Map<string, UserRow>();

  function getRow(email: string): UserRow | undefined {
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
    const { text, values: params } = buildQuery(strings, values);
    const upper = text.toUpperCase();

    if (upper.includes('CREATE TABLE IF NOT EXISTS')) return Promise.resolve([]);
    if (upper.includes('ALTER TABLE') && upper.includes('ADD COLUMN IF NOT EXISTS')) return Promise.resolve([]);

    if (upper.startsWith('SELECT') && upper.includes('FROM USERS')) {
      const row = getRow(params[0]) ?? null;
      return Promise.resolve(row ? [{ ...row }] : []);
    }

    if (upper.startsWith('INSERT INTO USERS')) {
      const emailIdx = params.findIndex((v: any) => typeof v === 'string' && v.includes('@'));
      const email = params[emailIdx];
      const passwordHash = params[emailIdx + 1] ?? null;
      const roadmap = params[emailIdx + 2];
      const progress = params[emailIdx + 3];
      const xp = params[emailIdx + 4] ?? 0;
      const row = ensureRow(email, passwordHash);
      if (roadmap !== undefined && roadmap !== null) row.roadmap = roadmap;
      if (progress !== undefined && progress !== null) row.progress = progress;
      if (xp !== undefined && xp !== null) row.xp = xp ?? row.xp;
      row.updated_at = new Date().toISOString();
      return Promise.resolve([]);
    }

    if (upper.startsWith('UPDATE USERS') && upper.includes('SET STREAK')) {
      const streak = params[0];
      const lastActive = params[1];
      const email = params[2];
      const row = ensureRow(email);
      row.streak = streak;
      row.last_active_date = lastActive;
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  }) as any;

  sqlFn.unsafe = () => Promise.resolve([]);
  sqlFn.reset = () => users.clear();
  return sqlFn;
}
