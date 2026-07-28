/**
 * Sentry initialisation — import this module exactly once, before React renders.
 *
 * Features configured:
 *  - Browser Tracing   (page load, navigation, route transitions)
 *  - Session Replay    (masked PII; errors always recorded)
 *  - Noise filtering   (ResizeObserver, extension spam, cancelled requests)
 *  - Env-gated enable  (only active in production; DSN must be present)
 */

import * as Sentry from '@sentry/react';

// Guard against duplicate initialisation during HMR.
let _initialised = false;

export function initialiseSentry(): void {
  if (_initialised) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // No DSN → Sentry stays fully disabled; no-ops throughout the app.

  const isProd = import.meta.env.MODE === 'production';

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,

    // Enable in production only; keeps dev noise out of the dashboard.
    enabled: isProd,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask form inputs + text nodes that could contain PII.
        maskAllText: true,
        blockAllMedia: false,
        // Never record password / token field values.
        maskAllInputs: true,
      }),
    ],

    // Performance monitoring sample rates.
    tracesSampleRate: isProd ? 0.2 : 1.0,

    // Session Replay: record 5 % of sessions normally; 100 % when errors occur.
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    // ---------------------------------------------------------------------------
    // Noise filtering — ignore harmless browser-only exceptions so the Sentry
    // issue list stays actionable.
    // ---------------------------------------------------------------------------
    ignoreErrors: [
      // Chrome/Safari ResizeObserver benign loop notification.
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',

      // Fetch/XHR aborted by the user navigating away or by our own AbortController.
      'AbortError',
      'The user aborted a request',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Load failed',

      // Browser extension interference.
      'Cannot redefine property: googletag',
      'instantSearchSDKJSBridgeClearHighlight',

      // Safari/Firefox cross-origin script errors with no useful stack.
      'Script error.',
    ],

    denyUrls: [
      // Chrome / Firefox extension files.
      /extensions\//i,
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });

  _initialised = true;
}
