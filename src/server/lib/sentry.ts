/**
 * Backend Sentry initialisation — Node.js / Express
 *
 * Import and call initialiseSentryBackend() exactly once, before the Express
 * app is created and before any routes are registered.
 *
 * Features:
 *  - Express request / tracing integration  (http, express integrations)
 *  - Environment-gated enable               (production only when DSN present)
 *  - Configurable sample rate               (0.2 prod / 1.0 dev)
 *  - Noise filtering                        (health checks, client disconnects, favicon)
 *  - No duplicate initialisation            (guard flag)
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger';

let _initialised = false;

export function initialiseSentryBackend(): void {
  if (_initialised) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.debug('[Sentry] SENTRY_DSN not set — backend error tracking disabled');
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',

    // Enabled only in production so dev noise never pollutes the dashboard.
    enabled: isProduction,

    // Tracing sample rates.
    tracesSampleRate: isProduction ? 0.2 : 1.0,

    integrations: [
      // Instruments Express routes, middleware timing, and auto-captures
      // incoming request breadcrumbs.
      Sentry.expressIntegration(),
      // Instruments outbound http/https requests (covers Groq API calls).
      Sentry.httpIntegration(),
    ],

    // ---------------------------------------------------------------------------
    // Noise filtering — ignore operational non-issues so the issue list stays
    // actionable. Client disconnects, health checks and favicon requests are
    // expected; they should never page anyone.
    // ---------------------------------------------------------------------------
    ignoreErrors: [
      // Client disconnected before the response was sent.
      'ECONNRESET',
      'EPIPE',
      // Upstream or downstream abort.
      'AbortError',
      'The operation was aborted',
      // Node HTTP "socket hang up" on premature client close.
      'socket hang up',
    ],

    beforeSend(event, hint) {
      const req = hint?.data as Record<string, any> | undefined;

      // Drop health-check noise entirely.
      const url: string = req?.url ?? event.request?.url ?? '';
      if (url.includes('/api/health')) return null;
      if (url.endsWith('/favicon.ico')) return null;

      // Drop cancelled-request errors that arrive through the error handler.
      const err = hint?.originalException;
      const errCode = (err as any)?.code;
      if (errCode === 'ECONNRESET' || errCode === 'EPIPE') return null;

      return event;
    },
  });

  _initialised = true;
  logger.info(`[Sentry] Backend tracking ${isProduction ? 'enabled' : 'registered (disabled — dev mode)'}`);
}

/**
 * Set the authenticated user on the current request's Sentry scope.
 * Uses getCurrentScope() so the user is bound to the active async context
 * rather than the global scope, preventing cross-request user leakage under
 * Node's concurrent request model.
 * Only attaches id and email — never passwords, tokens, or cookies.
 */
export function setSentryUser(user: { id: string; email: string }): void {
  Sentry.getCurrentScope().setUser({ id: user.id, email: user.email });
}

/** Clear the user context on the current scope at the end of a request. */
export function clearSentryUser(): void {
  Sentry.getCurrentScope().setUser(null);
}

export { Sentry };
export { setupExpressErrorHandler } from '@sentry/node';
