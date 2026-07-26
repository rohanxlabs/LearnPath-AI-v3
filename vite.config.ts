import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const sentryEnabled = !!process.env.SENTRY_DSN && process.env.NODE_ENV === 'production';

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Sentry plugin uploads source maps in production builds so stack traces
      // in the Sentry dashboard map back to your original TypeScript source.
      // Only active when SENTRY_AUTH_TOKEN + SENTRY_DSN are set.
      ...(sentryEnabled && process.env.SENTRY_AUTH_TOKEN
        ? [sentryVitePlugin({
            org: process.env.SENTRY_ORG || '',
            project: process.env.SENTRY_PROJECT || 'learnpath-ai',
            authToken: process.env.SENTRY_AUTH_TOKEN,
          })]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Required for Sentry source maps
      sourcemap: true,
      // Belt-and-suspenders: strip all console calls and debugger statements
      // from the production bundle even if a DEV guard was accidentally omitted.
      // esbuild drop runs before sourcemap generation so stack traces stay intact.
      esbuildOptions: {
        drop: process.env.NODE_ENV === 'production' ? (['console', 'debugger'] as const) : [],
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
