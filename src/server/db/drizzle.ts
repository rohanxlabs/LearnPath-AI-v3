// Drizzle ORM client — single shared instance for the server.
//
// Uses the node-postgres (pg) driver which works with any standard PostgreSQL
// host including Supabase. The neon-http driver only works with Neon's
// serverless HTTP proxy and cannot be used with Supabase.

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../drizzle/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Verify TLS certificates in production. Set DATABASE_INSECURE_SSL=true only
  // for a local self-signed dev database (same env gate as db.ts).
  ssl: process.env.DATABASE_INSECURE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// drizzle-orm/node-postgres uses `name: undefined` for non-.prepare() queries,
// which makes pg use the simple query protocol — compatible with PgBouncer in
// transaction mode. No additional options needed.
export const db = drizzle(pool, { schema });
