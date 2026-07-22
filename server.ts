import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { createServer as createViteServer } from 'vite';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import fs from 'fs';

import { logger } from './src/server/lib/logger';
import { ensureRoadmapTables } from './src/server/db/queries';
import { validateCsrf } from './src/server/lib/middleware';

// ---------------------------------------------------------------------------
// Startup env-var validation — fail fast with a clear message.
// ---------------------------------------------------------------------------
const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET', 'OPENROUTER_API_KEY'];
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
// Session store (PostgreSQL-backed via connect-pg-simple)
// ---------------------------------------------------------------------------
const PgStore = connectPgSimple(session);
let sessionStore: any;
// Skip the Postgres session store in test — pg.Pool would try to connect to
// a real database and crash session.regenerate() with ECONNREFUSED.
if (process.env.NODE_ENV !== 'test') {
  try {
    const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    sessionStore = new PgStore({ pool: pgPool, createTableIfMissing: true });
    logger.info('[Session] Using PostgreSQL-backed persistent session store');
  } catch (err) {
    logger.warn({ err }, '[Session] Falling back to in-memory store');
    sessionStore = undefined;
  }
}

declare module 'express-session' {
  interface SessionData {
    userEmail?: string;
  }
}

// ---------------------------------------------------------------------------
// Security & request middleware (ordered carefully — helmet first)
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite HMR + React needs eval in dev
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://openrouter.ai', 'https://*.sentry.io'],
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

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
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
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(session({
  store: sessionStore,
  name: 'learnpath.sid',
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// ---------------------------------------------------------------------------
// Route modules
// ---------------------------------------------------------------------------
import authRouter from './src/server/routes/auth';
import roadmapsRouter from './src/server/routes/roadmaps';
import lessonsRouter from './src/server/routes/lessons';
import aiRouter from './src/server/routes/ai';
import userRouter from './src/server/routes/user';
import emailRouter from './src/server/routes/email';

// CSRF validation applied once here before all routes.
// The validateCsrf middleware skips GET/HEAD/OPTIONS and test environments.
app.use('/api', validateCsrf);

app.use('/api', authRouter);
app.use('/api', roadmapsRouter);
app.use('/api', lessonsRouter);
app.use('/api', aiRouter);
app.use('/api', userRouter);
app.use('/api', emailRouter);

// ---------------------------------------------------------------------------
// Redis-backed rate-limit store (Upstash) — item 10.
// When REDIS_URL is present the in-memory limiters are upgraded to a shared
// store so horizontal scaling (multiple instances) shares the same counters.
// Falls back silently to in-memory when not configured.
// ---------------------------------------------------------------------------
async function upgradeRateLimitStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const { default: RedisStore } = await import('./src/server/lib/redisStore');
    const store = await RedisStore.create(redisUrl);
    const { RATE_LIMIT_STORE: limiterRef } = await import('./src/server/lib/middleware');
    // Mutate the exported reference so all limiters already created pick it up
    // on next request (express-rate-limit reads opts.store per request).
    (await import('./src/server/lib/middleware')).RATE_LIMIT_STORE = store;
    logger.info('[RateLimit] Upgraded to Redis-backed store (Upstash)');
  } catch (err: any) {
    logger.warn({ err: err?.message }, '[RateLimit] Redis store init failed, staying in-memory');
  }
}
upgradeRateLimitStore();

// Ensure sw.js is served with no-cache headers so clients detect updates instantly.
app.get('/sw.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  next();
});

// Global error handler — must be after all routes.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled request error');
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: isProduction ? 'Internal server error' : err.message });
});

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

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://0.0.0.0:${PORT}`);
    logger.info(`Open in browser at http://localhost:${PORT}`);
    if (platform() === 'win32') exec(`start "" "http://localhost:${PORT}"`);
    else if (platform() === 'darwin') exec(`open "http://localhost:${PORT}"`);
    else exec(`xdg-open "http://localhost:${PORT}"`);
  });
  return server;
}

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMainModule) {
  bootstrap().catch((err) => {
    logger.fatal({ err }, 'Server failed to start');
    process.exit(1);
  });
}

