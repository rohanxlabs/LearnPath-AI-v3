// Drizzle Kit configuration for the normalized roadmap schema.
//
// This is the forward-looking migration target. The live app currently uses
// raw neon SQL in `src/server/db/schema.ts`. When the project adopts Drizzle:
//
//   1. Add devDependencies: `drizzle-orm` and `drizzle-kit`.
//   2. Run `npx drizzle-kit generate` to emit SQL migrations under ./drizzle.
//   3. Wire a Drizzle client (e.g. drizzle(neon(...), { schema })) in the data layer.
//
// Until then this file documents the canonical relational model and is type-checked
// independently (it references drizzle-orm types; add the dep to build it fully).

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
