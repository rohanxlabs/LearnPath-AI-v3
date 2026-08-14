import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

// ---------------------------------------------------------------------------
// Environment validation — fail fast with clear error messages before any
// other initialization. Must run before Sentry so we can log to console if
// logger config itself depends on invalid env vars.
// ---------------------------------------------------------------------------
import { validateEnvironmentOrExit } from './src/server/lib/validateEnv';
validateEnvironmentOrExit();

// ---------------------------------------------------------------------------
// Sentry MUST be initialised before any other import that could throw, so
// the very first import after dotenv is the dedicated backend Sentry module.
// ---------------------------------------------------------------------------
import { initialiseSentryBackend, Sentry, setupExpressErrorHandler } from './src/server/lib/sentry';
initialiseSentryBackend();

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { createServer as createViteServer } from 'vite';
import pinoHttp from 'pino-http';
import fs from 'fs';
import { randomUUID } from 'crypto';

import { logger } from './src/server/lib/logger';
import { pool } from './src/server/db/drizzle';
import { ensureRoadmapTables } from './src/server/db/queries';

// ---------------------------------------------------------------------------
// Startup configuration
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';

export const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Security & request middleware (ordered carefully — helmet first)
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Vite HMR needs eval + inline in dev only. Production serves a
      // pre-built static bundle and must not permit either.
      scriptSrc: isProduction
        ? ["'self'"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://api.groq.com',
        'https://*.sentry.io',
        // Supabase — auth, realtime, storage (the subdomain matches the project ref)
        'https://*.supabase.co',
        'wss://*.supabase.co',
        // Vite HMR websocket (dev only)
        ...(!isProduction ? ['ws://localhost:24678', 'ws://localhost:3000'] : []),
      ],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : isProduction
    ? []
    : ['http://localhost:5173', 'http://localhost:3000'];

// Every mutation requires Authorization: Bearer <token>, which cross-site forms
// cannot set — CSRF at the cookie level is therefore unnecessary.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(pinoHttp({
  logger,
  // Attach a stable request ID to every log line so a single request's
  // full lifecycle can be traced across middleware and route handlers.
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (typeof existing === 'string' && existing) ? existing : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' },
}));

app.use(express.json({ limit: '4mb', type: 'application/json' }));
// No endpoint accepts large form-encoded bodies; 100 kb is generous.
app.use(express.urlencoded({ limit: '100kb', extended: true }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
import authRouter from './src/server/routes/auth';
import roadmapsRouter from './src/server/routes/roadmaps';
import lessonsRouter from './src/server/routes/lessons';
import aiRouter from './src/server/routes/ai';
import userRouter from './src/server/routes/user';

// Disable ETag-based 304 caching for all API routes.
// Every /api endpoint is auth-gated and returns user-specific mutable data —
// a stale 304 can hide lesson completion, progress updates, and profile changes
// until the user hard-refreshes.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (_req, res) => {
  // Shallow DB liveness check — cheap single-row query, no table scan.
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {
    // DB unreachable — surface as degraded, not 500, so load balancers keep
    // the instance in rotation (the process itself is healthy).
  }
  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    aiActive: !!process.env.GROQ_API_KEY,
    db: dbOk,
  });
});

app.use('/api', authRouter);
app.use('/api', roadmapsRouter);
app.use('/api', lessonsRouter);
app.use('/api', aiRouter);
app.use('/api', userRouter);

// ---------------------------------------------------------------------------
// Debug / verification endpoint — DEVELOPMENT ONLY.
// Intentionally throws so you can verify Sentry receives the event, stack
// trace, request metadata, and feature tag.
// Remove this endpoint after verifying the Sentry integration.
// ---------------------------------------------------------------------------
if (!isProduction) {
  app.get('/debug/sentry', (_req, res, _next) => {
    Sentry.setTag('feature', 'sentry-debug');
    throw new Error('Backend Sentry Test');
  });
}

// ---------------------------------------------------------------------------
// Redis-backed rate-limit store (Upstash).
// When REDIS_URL is present the auth/login limiters are upgraded to a shared
// store so horizontal scaling (multiple instances) shares the same counters.
// Falls back silently to in-memory when not configured.
//
// bootstrap() awaits this before calling app.listen so the Redis-backed
// instances are in place before any request arrives.
// ---------------------------------------------------------------------------
async function buildAuthLimiters() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (isProduction) {
      // P0: Without a shared Redis store, every instance carries independent
      // rate-limit counters.  An attacker with one IP can fire N×limit requests
      // when N instances are running.  Set REDIS_URL (Upstash or compatible) to
      // enable a shared store.  On a single-instance deployment this is acceptable
      // but must be resolved before horizontal scaling.
      logger.warn(
        '[RateLimit] ⚠️  REDIS_URL is not set in production. ' +
        'Auth brute-force limits (login: 5/15min, register: 10/15min) are per-process only — ' +
        'they will NOT be shared across multiple instances. ' +
        'Set REDIS_URL to an Upstash Redis URL to enable shared rate-limiting.'
      );
    }
    return;
  }
  try {
    const { default: RedisStore } = await import('./src/server/lib/redisStore');
    // Create a single Redis connection then derive three isolated stores, one per
    // limiter.  express-rate-limit v8 throws ERR_ERL_STORE_REUSE if the same
    // store object is shared across multiple rateLimit() calls.
    const baseStore = await RedisStore.create(redisUrl);
    const { setAuthLimiters } = await import('./src/server/lib/middleware');
    setAuthLimiters({
      auth:    baseStore.withPrefix('rl:auth:'),
      login:   baseStore.withPrefix('rl:login:'),
      refresh: baseStore.withPrefix('rl:refresh:'),
    });
    logger.info('[RateLimit] Upgraded to Redis-backed store (Upstash)');
  } catch (err: any) {
    logger.warn({ err: err?.message }, '[RateLimit] Redis store init failed, staying in-memory');
  }
}

// Ensure sw.js is served with no-cache headers so clients detect updates instantly.
app.get('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  next();
});

// Defined here, registered LAST inside bootstrap() so it also catches errors
// thrown by the Vite/static frontend middleware.
//
// Capture strategy: setupExpressErrorHandler (registered just before this in
// bootstrap) already forwards every error to Sentry automatically.  This
// handler's only job is to log and send the HTTP response — no manual
// captureException here to avoid duplicate events in the Sentry dashboard.
const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled request error');
  // Guard against ERR_HTTP_HEADERS_SENT when a route already started a response
  // (e.g. an SSE stream that errored mid-flight, or a double-next() call).
  if (res.headersSent) return;
  res.status(status).json({ error: isProduction ? 'Internal server error' : err.message });
};

// ---------------------------------------------------------------------------
// PWA asset preparation
// ---------------------------------------------------------------------------
function preparePWAAssets() {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    // PNG icons are generated at build time (scripts/generate-icons.js) and committed
    // to public/. This function is a no-op if they already exist.
    const icon512 = path.join(publicDir, 'icon-512.png');
    const icon192 = path.join(publicDir, 'icon-192.png');

    if (fs.existsSync(icon512) && fs.existsSync(icon192)) {
      logger.info('[PWA] PNG icons present — no action needed');
      return;
    }

    // Fallback: copy the SVG source as a placeholder PNG if icons are missing at runtime.
    // The real icons should be generated by running: node scripts/generate-icons.js
    const svgPath = path.join(publicDir, 'icon.svg');
    if (fs.existsSync(svgPath)) {
      fs.copyFileSync(svgPath, icon512);
      fs.copyFileSync(svgPath, icon192);
      logger.warn('[PWA] PNG icons missing — used SVG as placeholder. Run: node scripts/generate-icons.js');
    } else {
      logger.warn('[PWA] PNG icons and SVG source both missing — manifest icons will 404');
    }
  } catch (err) {
    console.error('[PWA] Error preparing icons:', err);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function bootstrap() {
  preparePWAAssets();
  ensureRoadmapTables().catch((err: any) =>
    logger.error({ err: err?.message || err }, '[Database] Failed to ensure normalized roadmap tables')
  );

  // Provision Redis-backed limiters before the server starts accepting connections.
  await buildAuthLimiters();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Sentry Express error handler — must come BEFORE the custom errorHandler so
  // Sentry processes the error before we send a response. setupExpressErrorHandler
  // is a no-op when Sentry is disabled (no DSN), so it is always safe to call.
  setupExpressErrorHandler(app);

  // Must be the final middleware — after Vite/static so it catches their errors too.
  app.use(errorHandler);

  // Surface pool errors — these indicate a saturated or misconfigured connection
  // pool.  Log at fatal so on-call is paged immediately.
  pool.on('error', (err: Error) => {
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'database');
      scope.setLevel('fatal');
      Sentry.captureException(err);
    });
    logger.fatal({ err: err.message }, '[Pool] Idle client error — connection pool problem');
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://0.0.0.0:${PORT}`);
    logger.info(`Open in browser at http://localhost:${PORT}`);
    // Auto-launch browser in dev only — containers and CI have no display.
    if (!isProduction) {
      if (platform() === 'win32') exec(`start "" "http://localhost:${PORT}"`);
      else if (platform() === 'darwin') exec(`open "http://localhost:${PORT}"`);
      else exec(`xdg-open "http://localhost:${PORT}"`);
    }
  });
  // Allow up to 120 s for any single request (Supabase pooler cold-start +
  // large parallel DB writes can legitimately take 30–60 s on first connect).
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 65_000; // slightly above typical LB 60 s idle timeout

  // ---------------------------------------------------------------------------
  // Graceful shutdown — drain in-flight requests before the process exits.
  // Render / Kubernetes send SIGTERM before force-killing with SIGKILL.
  // Without this, in-flight DB writes and lesson completions are silently lost.
  // ---------------------------------------------------------------------------
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received — draining connections');
    server.close(async () => {
      logger.info('HTTP server closed. Draining DB pool...');
      try {
        await pool.end();
        logger.info('DB pool drained. Exiting.');
      } catch (err: any) {
        logger.error({ err: err?.message }, 'Error draining DB pool during shutdown');
      }
      process.exit(0);
    });

    // Force-exit after 15 s if drain hangs (e.g. a stalled long-poll connection).
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 15 s — forcing exit');
      process.exit(1);
    }, 15_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));

  return server;
}

// ---------------------------------------------------------------------------
// Process-level unhandled error capture — catches exceptions and rejections
// that escape all Express middleware (e.g. background tasks, startup code).
// These are forwarded to Sentry before the process crashes.
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Process] Uncaught exception — forwarding to Sentry and exiting');
  Sentry.captureException(err);
  // Flush Sentry buffer (max 2 s) then exit — don't keep running after an
  // uncaught exception since the process state is undefined.
  Sentry.close(2000).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, '[Process] Unhandled promise rejection — forwarding to Sentry');
  Sentry.captureException(err);
});

// Supertest imports `app` directly. Do not start Vite or bind a port as a
// module-import side effect, or Vitest will retain open handles.
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.fatal({ err }, 'Server failed to start');
    process.exit(1);
  });
}

