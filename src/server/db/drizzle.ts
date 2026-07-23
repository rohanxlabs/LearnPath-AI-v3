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
  ssl: { rejectUnauthorized: false }, // required for Supabase (and most managed Postgres)
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Supabase's connection pooler (PgBouncer in transaction mode) does not support
// named prepared statements. `{ prepare: false }` tells Drizzle to use the simple
// query protocol instead of Parse/Describe/Bind/Execute for every statement.
// Safe to set unconditionally — harmless on a direct (non-pooler) connection.
export const db = drizzle(pool, { schema });
