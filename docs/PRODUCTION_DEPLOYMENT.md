# Production Deployment Checklist

This guide walks you through deploying LearnPath AI v3 to production with confidence. Follow each section in order.

---

## 📋 Pre-Deployment Checklist

### Phase 1: Infrastructure Setup

#### 1.1 Database (PostgreSQL)

- [ ] Database provisioned (Supabase or Neon recommended)
- [ ] Connection string obtained (starts with `postgresql://`)
- [ ] SSL/TLS enabled (required for production)
- [ ] Connection pooling configured (PgBouncer or Supabase Pooler)
- [ ] Automated backups enabled (daily recommended)
- [ ] Test connection from local machine:
  ```bash
  psql "postgresql://user:pass@host:5432/db?sslmode=require"
  # Should connect successfully
  ```

**Recommended Providers:**
- **Supabase** (free tier includes auth + database + hosting)
- **Neon** (generous free tier, excellent performance)
- **AWS RDS** (production-grade, higher cost)

#### 1.2 Supabase Auth

- [ ] Supabase project created
- [ ] Email provider enabled (Authentication → Providers)
- [ ] **Email verification enabled** (strongly recommended for production)
- [ ] Redirect URLs configured:
  - [ ] `https://your-domain.com/reset-password`
  - [ ] `http://localhost:3000/reset-password` (for local testing)
- [ ] Custom SMTP provider configured (Resend, SendGrid, or Mailgun)
- [ ] Email templates customized (optional but recommended)
- [ ] Row-Level Security (RLS) enabled on all tables
- [ ] Service role key secured (never in version control)

**See:** [Supabase Auth Setup Guide](./SUPABASE_AUTH_SETUP.md)

#### 1.3 Redis Rate Limiting (Required for Multi-Instance)

**Single-instance deployment (Render starter plan):** Optional, can skip for now

**Multi-instance deployment (2+ servers):** REQUIRED

- [ ] Upstash Redis database created
- [ ] `REDIS_URL` obtained (e.g., `https://xxx.upstash.io`)
- [ ] `REDIS_TOKEN` obtained (from REST API tab)
- [ ] Credentials tested via curl:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" \
       https://your-redis.upstash.io/GET/test
  # Should return: {"result":null}
  ```

**See:** [Redis Rate Limiting Guide](./REDIS_RATE_LIMITING.md)

#### 1.4 External Services

- [ ] **Groq API Key** obtained ([console.groq.com/keys](https://console.groq.com/keys))
  - Free tier: 14,400 requests/day (sufficient for ~500 DAU)
  - Verify key starts with `gsk_`
- [ ] **Sentry DSN** obtained ([sentry.io](https://sentry.io)) - Optional but recommended
  - Frontend DSN (starts with `https://`)
  - Backend DSN (can be the same)
  - Free tier: 5,000 errors/month
- [ ] **Resend API Key** obtained ([resend.com](https://resend.com)) - Recommended
  - Free tier: 3,000 emails/month
  - Verify domain or use `onboarding@resend.dev` for testing
- [ ] **PostHog API Key** obtained ([posthog.com](https://posthog.com)) - Optional
  - Free tier: 1M events/month
  - For product analytics

---

### Phase 2: Environment Configuration

#### 2.1 Create Environment Variables

Use this template and fill in your values:

```bash
# ============================================================================
# REQUIRED - Server will not start without these
# ============================================================================

# Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# AI Provider
GROQ_API_KEY=gsk_your_groq_api_key_here

# Supabase Auth
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Frontend (Vite)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# ============================================================================
# PRODUCTION-CRITICAL
# ============================================================================

# CORS Configuration
FRONTEND_URL=https://your-domain.com

# Node Environment
NODE_ENV=production
PORT=3000

# ============================================================================
# STRONGLY RECOMMENDED
# ============================================================================

# Redis (required for multi-instance)
REDIS_URL=https://your-redis.upstash.io
REDIS_TOKEN=your-upstash-token-here

# Error Tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Email (custom SMTP)
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# ============================================================================
# OPTIONAL - Enhances features but not required
# ============================================================================

# YouTube embeds (fallback to search links if missing)
YOUTUBE_API_KEY=your-youtube-api-key

# Analytics
VITE_POSTHOG_KEY=phc_your_posthog_key
VITE_POSTHOG_HOST=https://app.posthog.com

# Rate Limits (defaults shown)
AI_DAILY_LIMIT=50

# Database Pool (increase for high traffic)
DATABASE_POOL_MAX=10

# Logging
LOG_LEVEL=info

# ============================================================================
# SENTRY SOURCE MAPS (build time only)
# ============================================================================
SENTRY_AUTH_TOKEN=your-sentry-auth-token
SENTRY_ORG=your-sentry-org-slug
SENTRY_PROJECT=learnpath-ai
```

#### 2.2 Validate Environment Variables

Run the validation locally before deploying:

```bash
# Copy production env vars to .env.production
cp .env.example .env.production
# Edit .env.production with your production values

# Test validation
NODE_ENV=production node -e "require('dotenv').config({path: '.env.production'}); require('./src/server/lib/validateEnv').validateEnvironmentOrExit()"
```

Expected output:
```
[EnvValidation] ✓ All environment variables validated successfully
```

If you see errors or warnings, fix them before deploying.

---

### Phase 3: Database Migration

#### 3.1 Run Migrations

**Option A: Manual (Recommended for first deploy)**

```bash
# Set DATABASE_URL to your production database
export DATABASE_URL="postgresql://..."

# Run migrations
pnpm run db:migrate

# Verify tables were created
psql "$DATABASE_URL" -c "\dt"
# Should list: users, roadmaps, phases, modules, lessons, etc.
```

**Option B: Automatic (via build command)**

Render's `render.yaml` includes migrations in the build command:
```yaml
buildCommand: pnpm install --frozen-lockfile && pnpm run build && pnpm run db:migrate
```

#### 3.2 Verify RLS is Enabled

```bash
psql "$DATABASE_URL" -c "
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public' 
  ORDER BY tablename;
"
```

All tables should show `rowsecurity = t` (true).

---

### Phase 4: Build & Deploy

#### 4.1 Test Production Build Locally

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build frontend + backend
pnpm run build

# Verify dist/ folder exists with:
# - dist/server.cjs (backend)
# - dist/assets/ (frontend)
# - dist/index.html (frontend)

# Test production server locally
NODE_ENV=production node dist/server.cjs

# Visit http://localhost:3000
# Should see the app (no Vite HMR)
```

#### 4.2 Deploy to Render

**Option A: Blueprint (Recommended)**

1. Push code to GitHub
2. In Render dashboard → **New** → **Blueprint**
3. Connect your repository
4. Render will detect `render.yaml` and provision automatically
5. Add environment variables in dashboard (see Phase 2.1)
6. Deploy

**Option B: Manual Service**

1. Render dashboard → **New** → **Web Service**
2. Connect repository
3. Configure:
   - **Build Command:** `pnpm install --frozen-lockfile && pnpm run build && pnpm run db:migrate`
   - **Start Command:** `node dist/server.cjs`
   - **Environment:** Add all variables from Phase 2.1
4. Deploy

#### 4.3 Verify Deployment

- [ ] Service status shows "Live" (green)
- [ ] Build logs show no errors
- [ ] Health check passing: `curl https://your-app.onrender.com/api/health`
  - Should return: `{"status":"ok","timestamp":"...","aiActive":true,"db":true}`
- [ ] App loads in browser without errors
- [ ] Check browser console (F12) for JavaScript errors
- [ ] Check Render logs for startup errors

---

## ✅ Post-Deployment Testing

### Test 1: User Registration Flow

1. Visit your production URL
2. Click "Sign Up"
3. Register with a real email address
4. **If email verification is enabled:**
   - Check inbox for confirmation email
   - Click confirmation link
   - Verify redirect back to app
5. Log in with the new account
6. **Expected:** Successful login, redirected to home/onboarding

### Test 2: Roadmap Generation

1. Log in to your production app
2. Click "Generate Roadmap" or equivalent
3. Enter a goal (e.g., "Learn React")
4. Submit and wait for generation
5. **Expected:**
   - SSE streaming shows phases as they generate
   - Roadmap appears after 10-30 seconds
   - No errors in browser console
6. Check Render logs:
   - Should see: `[Roadmap] Generation started`
   - Should see: `[Groq] Chat completion successful`

### Test 3: Authentication & Sessions

1. Log in on desktop browser
2. Open app in incognito/private window
3. Log in with same account
4. Complete a lesson on desktop
5. Refresh incognito window
6. **Expected:** Progress syncs across sessions

### Test 4: Rate Limiting

**Test Login Rate Limit:**

```bash
# Replace with your production URL
URL="https://your-app.onrender.com"

# Attempt 6 failed logins rapidly
for i in {1..6}; do
  curl -X POST "$URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n\n"
done
```

**Expected:**
- Requests 1-5: Status 401 (Unauthorized - wrong password)
- Request 6: Status 429 (Too Many Requests - rate limited)

### Test 5: Error Tracking (Sentry)

1. Navigate to: `https://your-app.onrender.com/debug/sentry` (dev builds only)
2. **Expected:** Error page appears
3. Check Sentry dashboard ([sentry.io](https://sentry.io))
4. **Expected:** Error appears with stack trace, request metadata

**For production builds (debug endpoint removed):**
- Trigger a real error (e.g., invalid API request)
- Check Sentry dashboard for the captured error

### Test 6: Database Connectivity

```bash
# Check health endpoint
curl https://your-app.onrender.com/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-01-15T12:34:56.789Z",
  "aiActive": true,
  "db": true
}
```

If `db: false`, check:
- DATABASE_URL is correct
- Database is not paused (Supabase free tier)
- Connection pool isn't exhausted

---

## 🔍 Monitoring & Maintenance

### Daily Checks (First Week)

- [ ] Check Render logs for errors
- [ ] Monitor Sentry error dashboard
- [ ] Verify Upstash Redis usage (stay within free tier)
- [ ] Check Groq API usage ([console.groq.com/usage](https://console.groq.com/usage))
- [ ] Test critical flows (signup, login, roadmap generation)

### Weekly Checks

- [ ] Review Sentry error trends
- [ ] Check database size (Supabase dashboard)
- [ ] Monitor response times (Render metrics)
- [ ] Review user feedback (if available)
- [ ] Check for dependency updates (Dependabot alerts)

### Monthly Checks

- [ ] Review Upstash invoice (if exceeded free tier)
- [ ] Review Groq API costs (free tier is generous)
- [ ] Rotate Supabase service role key (if exposed)
- [ ] Review Sentry quota usage
- [ ] Database backup verification (test restore)

### Key Metrics to Monitor

| Metric | Tool | Threshold | Action if Exceeded |
|--------|------|-----------|-------------------|
| **Error Rate** | Sentry | < 1% of requests | Investigate top errors |
| **Response Time** | Render | p95 < 500ms | Optimize slow endpoints |
| **Groq API Usage** | Groq Console | < 12,000 req/day | Optimize prompts, cache more |
| **Database Size** | Supabase | < 500 MB (free tier) | Archive old data, upgrade plan |
| **Redis Commands** | Upstash | < 10K/day (free) | Optimize rate limits, upgrade |
| **Error Budget** | Sentry | < 5K/month (free) | Filter noise, upgrade plan |

---

## 🚨 Incident Response

### App is Down (Health Check Failing)

1. **Check Render Status:**
   - Dashboard → Service → Status
   - Red = down, Yellow = degraded, Green = healthy

2. **Check Recent Deploys:**
   - Dashboard → Deploys tab
   - If latest deploy failed, rollback to previous version

3. **Check Logs:**
   ```bash
   # Render dashboard → Logs tab
   # Look for:
   # - "Missing required environment variables"
   # - "ECONNREFUSED" (database unreachable)
   # - "Out of memory"
   # - "Port already in use"
   ```

4. **Common Fixes:**
   - Environment variable missing → Add in dashboard, redeploy
   - Database paused (Supabase free tier) → Resume in Supabase dashboard
   - Out of memory → Upgrade Render plan or optimize code
   - Migration failed → Roll back, fix migration, redeploy

### Users Can't Log In (Auth Failing)

1. **Check Supabase Status:** [status.supabase.com](https://status.supabase.com)
2. **Verify Environment Variables:**
   - `SUPABASE_URL` matches project URL
   - `SUPABASE_ANON_KEY` is correct
   - `SUPABASE_SERVICE_ROLE_KEY` is correct
3. **Check Rate Limiting:**
   - User may have exceeded login attempts (5 per 15 min)
   - Wait 15 minutes or check Redis counters
4. **Check JWT Validation:**
   - Server logs: `auth: 401 token verification failed`
   - For ES256 projects: JWKS endpoint may be unreachable
   - For HS256 projects: `SUPABASE_JWT_SECRET` may be wrong

### AI Generation Failing

1. **Check Groq API Status:** [status.groq.com](https://status.groq.com)
2. **Check API Key:**
   - `GROQ_API_KEY` is set correctly
   - Key hasn't expired or been revoked
3. **Check Quota:**
   - [console.groq.com/usage](https://console.groq.com/usage)
   - Free tier: 14,400 requests/day
   - If exceeded: fallback curriculum should activate automatically
4. **Check Logs:**
   - Server logs: `[Groq] Chat completion failed`
   - May show rate limit, quota exceeded, or network error

### Database Connection Errors

1. **Check Database Status:**
   - Supabase: Dashboard → Database → Health
   - Neon: Dashboard → Branches → Status
2. **Check Connection String:**
   - `DATABASE_URL` is correct (no typos)
   - SSL mode is `require` or `verify-full`
3. **Check Connection Pool:**
   - Server logs: `[Pool] Idle client error`
   - May indicate exhausted connections (increase `DATABASE_POOL_MAX`)
4. **Restart Service:**
   - Render dashboard → Manual Deploy → Deploy Latest Commit
   - Recreates connection pool

---

## 📈 Scaling Guide

### When to Scale (Indicators)

- Response times consistently > 500ms (p95)
- CPU usage consistently > 80%
- Memory usage consistently > 80%
- Database connection pool exhausted
- User reports of slow performance

### Vertical Scaling (Upgrade Instance)

Render Plans:
- **Starter (Free):** 0.5 CPU, 512 MB RAM - good for testing, low traffic
- **Standard ($7/mo):** 0.5 CPU, 512 MB RAM - slightly better SLA
- **Pro ($25/mo):** 1 CPU, 2 GB RAM - recommended for production
- **Pro Plus ($85/mo):** 2 CPU, 4 GB RAM - high traffic

**When to Upgrade:**
- Free → Standard: When you want better uptime SLA
- Standard → Pro: When CPU/memory limits are hit
- Pro → Pro Plus: When handling 1,000+ concurrent users

### Horizontal Scaling (Multiple Instances)

**Prerequisites:**
- [ ] Redis configured (REQUIRED for shared rate limiting)
- [ ] Database connection pool sized correctly
  - Rule: `(instances × pool_size) < 80% of DB connection limit`
  - Example: 3 instances × 15 pool = 45 connections (safe for Supabase free 60)
- [ ] Stateless app (all state in database, not memory) ✅ Already true

**Steps:**
1. Set up Redis (see [REDIS_RATE_LIMITING.md](./REDIS_RATE_LIMITING.md))
2. Adjust `DATABASE_POOL_MAX` (decrease per-instance pool size)
3. Render dashboard → Settings → Scaling
4. Increase instance count (2, 3, 5, etc.)
5. Monitor performance and costs

---

## 🔐 Security Hardening

### Before Launch

- [ ] All environment variables in deployment platform (not in code)
- [ ] RLS enabled on all database tables
- [ ] Email verification enabled (Supabase)
- [ ] Custom SMTP configured (rate limits lifted)
- [ ] Rate limiting tested and working
- [ ] HTTPS enforced (automatic on Render)
- [ ] Security headers enabled (Helmet.js) ✅ Already configured
- [ ] Content Security Policy (CSP) configured ✅ Already configured
- [ ] CORS restricted to production domain ✅ Already configured

### After Launch

- [ ] Set up uptime monitoring (UptimeRobot, Better Stack)
- [ ] Enable Sentry performance monitoring
- [ ] Configure database backup verification
- [ ] Set up log aggregation (optional, Render logs may suffice)
- [ ] Create incident runbook (this document is a start)
- [ ] Document escalation contacts

---

## 📚 Additional Resources

- [Supabase Auth Setup](./SUPABASE_AUTH_SETUP.md)
- [Redis Rate Limiting](./REDIS_RATE_LIMITING.md)
- [Render Deployment Docs](https://render.com/docs)
- [Supabase Production Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## ✅ Final Pre-Launch Checklist

Before announcing your app to users:

- [ ] All environment variables configured
- [ ] Database migrations applied successfully
- [ ] Health check endpoint returns `{"status":"ok","db":true}`
- [ ] User registration flow tested end-to-end
- [ ] Login flow tested end-to-end
- [ ] Password reset flow tested end-to-end
- [ ] Roadmap generation tested and working
- [ ] Rate limiting tested (login, AI endpoints)
- [ ] Error tracking verified (Sentry captures errors)
- [ ] Email delivery tested (custom SMTP working)
- [ ] SSL certificate active (https:// works)
- [ ] Performance acceptable (< 500ms response times)
- [ ] Logs reviewed for errors (no critical issues)
- [ ] Monitoring set up (Sentry, Render metrics)
- [ ] Backup strategy verified (daily database backups)
- [ ] Incident response plan documented (this guide)
- [ ] Support email/contact configured
- [ ] Terms of Service and Privacy Policy pages live (optional but recommended)

**When all items are checked:** You're ready to launch! 🚀

---

## Need Help?

**Common Issues:**
- Check server logs first (Render dashboard → Logs)
- Check browser console for frontend errors (F12 → Console)
- Review environment variables (typos are common)
- Restart the service (Render → Manual Deploy)

**Still Stuck?**
- GitHub Issues: [github.com/rohanxlabs/LearnPath-AI-v3/issues](https://github.com/rohanxlabs/LearnPath-AI-v3/issues)
- Check documentation files in `docs/` folder
- Review migration files in `drizzle/migrations/`

Good luck with your deployment! 🎉
