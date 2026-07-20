import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/server/__tests__/**/*.test.ts'],
    setupFiles: ['src/server/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      APP_URL: 'http://localhost:3000',
    },
  },
});
