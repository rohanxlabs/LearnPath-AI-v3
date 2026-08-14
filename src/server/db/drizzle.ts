// Drizzle ORM client — single shared instance for the server.
//
// Uses the node-postgres (pg) driver which works with any standard PostgreSQL
// host including Supabase. The neon-http driver only works with Neon's
// serverless HTTP proxy and cannot be used with Supabase.
//
// `pool` is exported so src/server/lib/db.ts can reuse the same connection
// pool for its raw `sql` tagged-template helper.  This guarantees a single
// Pool in the process (max: 10) rather than two pools totalling 20 connections.

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../drizzle/schema';

// Connection pool size: defaults to 10, configurable via DATABASE_POOL_MAX.
// Production deployments may need higher limits (20-50) depending on:
//   - Number of app instances (each has its own pool)
//   - Concurrent request volume
//   - Database connection limit (Supabase free: 60, paid: higher)
// Rule of thumb: (instances × pool_size) should be < 80% of DB connection limit.
const poolMax = process.env.DATABASE_POOL_MAX
  ? Number(process.env.DATABASE_POOL_MAX)
  : 10;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Verify TLS certificates in production. Set DATABASE_INSECURE_SSL=true only
  // for a local self-signed dev database (same env gate as db.ts).
  ssl: process.env.DATABASE_INSECURE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true },
  max: poolMax,
  // Supabase / PgBouncer drops idle connections after ~5 min. Evict pool
  // entries well before that so we never hand a dead socket to a query.
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  // TCP keep-alive prevents the OS / firewall from silently killing idle
  // sockets between the app server and the PgBouncer proxy.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// drizzle-orm/node-postgres uses `name: undefined` for non-.prepare() queries,
// which makes pg use the simple query protocol — compatible with PgBouncer in
// transaction mode. No additional options needed.
export const db = drizzle(pool, { schema });
