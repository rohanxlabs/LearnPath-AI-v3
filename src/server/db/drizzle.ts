// Drizzle ORM client — single shared instance for the server.
//
// Uses the neon-http driver which matches the existing @neondatabase/serverless
// dependency already in package.json.

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../../drizzle/schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
