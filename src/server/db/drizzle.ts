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

export const db = drizzle(pool, { schema });
