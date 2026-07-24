import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { createServer as createViteServer } from 'vite';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import fs from 'fs';

import { logger } from './src/server/lib/logger';
import { ensureRoadmapTables } from './src/server/db/queries';

// ---------------------------------------------------------------------------
// Startup env-var validation — fail fast with a clear message.
// ---------------------------------------------------------------------------
// SUPABASE_JWT_SECRET is only required for HS256 projects (older Supabase).
// ES256 projects (newer Supabase) use JWKS — SUPABASE_URL is sufficient.
const requiredEnvVars = ['DATABASE_URL', 'GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  logger.fatal({ missing: missingEnvVars }, 'Missing required environment variables — server cannot start');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Sentry — must be initialised before any other instrumentation.
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: isProduction ? 0.1 : 1.0,
  });
  logger.info('[Sentry] Backend error tracking enabled');
}

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://api.groq.com',
        'https://*.sentry.io',
        // Supabase — auth, realtime, storage (the subdomain matches the project ref)
        'https://*.supabase.co',
        'wss://*.supabase.co',
      ],
      fontSrc: ["'self'", 'data:'],
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
  autoLogging: { ignore: (req) => req.url === '/api/health' },
}));

app.use(express.json({ limit: '4mb' }));
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
import emailRouter from './src/server/routes/email';

// Disable ETag-based 304 caching for all API routes.
// Every /api endpoint is auth-gated and returns user-specific mutable data —
// a stale 304 can hide lesson completion, progress updates, and profile changes
// until the user hard-refreshes.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', authRouter);
app.use('/api', roadmapsRouter);
app.use('/api', lessonsRouter);
app.use('/api', aiRouter);
app.use('/api', userRouter);
app.use('/api', emailRouter);

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
  if (!redisUrl) return;
  try {
    const { default: RedisStore } = await import('./src/server/lib/redisStore');
    const store = await RedisStore.create(redisUrl);
    // setAuthLimiters replaces the lazy-wrapper instances in middleware.ts so
    // the first request to /api/register, /api/login, etc. uses the Redis store.
    const { setAuthLimiters } = await import('./src/server/lib/middleware');
    setAuthLimiters(store);
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
const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled request error');
  // Guard against ERR_HTTP_HEADERS_SENT when a route already started a response
  // (e.g. an SSE stream that errored mid-flight, or a double-next() call).
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
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

  // Must be the final middleware — after Vite/static so it catches their errors too.
  app.use(errorHandler);

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
  return server;
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
});

