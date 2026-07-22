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
    },
    // Override environment per file pattern.
    // Vitest >=1.0 supports this via the `browser` field or inline docblock.
    // We use the @vitest-environment docblock in each component test file instead.
  },
});
