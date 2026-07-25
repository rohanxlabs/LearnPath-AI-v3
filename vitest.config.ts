import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Server tests run in node. Component tests use jsdom via workspace config.
    environment: 'node',
    include: [
      'src/server/__tests__/**/*.test.ts',
      'src/components/__tests__/**/*.test.tsx',
    ],
    // Per-environment setup: server tests use the existing setup.ts;
    // component tests use the jest-dom setup file in their own directory.
    setupFiles: ['src/server/__tests__/setup.ts', 'src/components/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      APP_URL: 'http://localhost:3000',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      SUPABASE_JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long!!',
      GROQ_API_KEY: 'test-groq-key',
      // Explicitly unset so buildAuthLimiters() skips Redis and stays in-memory.
      // A real REDIS_URL in .env would otherwise leak into tests and cause
      // live network calls to Upstash when rate-limit counters are incremented.
      REDIS_URL: '',
    },
    // Override environment per file pattern.
    // Vitest >=1.0 supports this via the `browser` field or inline docblock.
    // We use the @vitest-environment docblock in each component test file instead.
  },
});
