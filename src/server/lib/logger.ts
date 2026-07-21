import pino from 'pino';

// ---------------------------------------------------------------------------
// Structured logger (pino) — replaces console.log in the server layer.
// In development, logs are pretty-printed; in production they emit JSON so
// log aggregators (Datadog, Logtail, Railway logs) can parse them.
// ---------------------------------------------------------------------------
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }
    : {}),
});
