# Redis Rate Limiting Configuration

## ⚠️ P0 Production Issue: Shared Rate Limiting

**Problem:** Without Redis, each application instance maintains independent rate-limit counters in memory. In a multi-instance deployment, this creates a security vulnerability.

**Impact:**
- Auth brute-force protection is weakened by N× (where N = number of instances)
- Example: 3 instances × 5 login attempts/IP = **15 total attempts** before blocking
- An attacker can bypass rate limits by distributing requests across instances

**Solution:** Configure a Redis-backed shared store so all instances share the same rate-limit counters.

---

## When Do You Need Redis?

### ✅ Redis is REQUIRED for:
- **Multi-instance deployments** (horizontal scaling)
- **Production environments** with > 1 instance
- **Load-balanced** deployments

### ⏭️ Redis is OPTIONAL for:
- **Single-instance deployments** (Render starter plan, single dyno)
- **Development environments**
- **Low-traffic applications** that won't scale beyond 1 instance

---

## Rate Limits Overview

The application enforces these per-IP or per-user rate limits:

| Endpoint | Limit | Window | Keyed By | Purpose |
|----------|-------|--------|----------|---------|
| **Login** | 5 requests | 15 min | IP address | Prevent credential stuffing |
| **Register / Password Reset** | 10 requests | 15 min | IP address | Prevent account enumeration |
| **Token Refresh** | 30 requests | 15 min | IP address | Allow legitimate multi-tab usage |
| **AI Endpoints** | 10 requests | 1 min | User ID | Prevent API abuse |
| **Roadmap Generation** | 3 requests | 1 hour | User ID | Control expensive AI calls |
| **Lesson Completion** | 30 requests | 1 min | User ID | Prevent XP farming |
| **AI Daily Quota** | 50 requests | 24 hours | User ID | Overall daily usage cap |

**Without Redis:** Each instance has its own counters (limits multiplied by instance count)  
**With Redis:** All instances share the same counters (limits are global)

---

## Setup: Upstash Redis (Recommended)

[Upstash](https://upstash.com) provides a serverless Redis with a free tier (10,000 commands/day) — perfect for rate limiting.

### Step 1: Create an Upstash Database

1. Sign up at [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database:
   - **Name:** `learnpath-rate-limits` (or any name)
   - **Region:** Choose the same region as your app server (lowest latency)
   - **Type:** Regional (free tier)
   - **Eviction:** `allkeys-lru` (recommended for rate limiting)

### Step 2: Get Connection Details

Navigate to your database in the Upstash console → **REST API** tab:

You'll see two values:
- **UPSTASH_REDIS_REST_URL** (e.g., `https://uncommon-toad-177204.upstash.io`)
- **UPSTASH_REDIS_REST_TOKEN** (e.g., `AbCdEf...` — long alphanumeric string)

### Step 3: Configure Environment Variables

Add these to your `.env` file (development) and deployment environment (production):

```bash
# Upstash Redis for shared rate-limiting
REDIS_URL=https://uncommon-toad-177204.upstash.io
REDIS_TOKEN=your-upstash-rest-token-here
```

**Important for Render users:**
- When adding environment variables in Render dashboard
- Paste ONLY the value (not `REDIS_URL=...`)
- Do NOT include quotes around the value
- Example: In the "Value" field, paste: `https://uncommon-toad-177204.upstash.io`

### Step 4: Restart Your Server

The application will detect Redis and log:
```
[RateLimit] Upgraded to Redis-backed store (Upstash)
```

If you see this warning instead:
```
[RateLimit] ⚠️ REDIS_URL is not set in production. Auth brute-force limits are per-process only.
```
...then Redis is not configured yet.

---

## Alternative: Standard Redis (Self-Hosted or Redis Cloud)

If you prefer a traditional Redis connection string (e.g., `redis://` or `rediss://`):

### Using Redis Cloud, AWS ElastiCache, etc.

```bash
# Standard Redis connection string
REDIS_URL=rediss://:password@endpoint:port
```

The application automatically detects and converts standard Redis URLs to Upstash REST format.

### Using a Local Redis Instance (Development Only)

```bash
# Local Redis (no auth)
REDIS_URL=redis://localhost:6379
```

---

## Verifying Redis is Working

### 1. Check Server Logs at Startup

Look for this line in the logs:
```
[RateLimit] Upgraded to Redis-backed store (Upstash)
```

### 2. Test Rate Limiting Across Instances

**Without Redis (before):**
1. Start 2 instances of your app (e.g., `http://localhost:3000` and `http://localhost:3001`)
2. Make 5 failed login attempts on instance 1
3. Make 5 more failed login attempts on instance 2
4. **Result:** Both succeed (10 total attempts, limits not shared)

**With Redis (after):**
1. Start 2 instances with same `REDIS_URL`
2. Make 5 failed login attempts on instance 1
3. Attempt a 6th login on instance 2
4. **Result:** Instance 2 is rate-limited (counters are shared)

### 3. Monitor Redis Commands (Upstash Console)

In the Upstash dashboard → Database → **Metrics** tab:
- You should see commands/sec increase when users hit rate-limited endpoints
- Each rate-limited request performs 2-3 Redis operations (GET, INCR, EXPIRE)

---

## Cost & Scaling

### Upstash Free Tier
- **10,000 commands/day** (~4,000-5,000 rate-limited requests/day)
- Sufficient for:
  - Small to medium traffic applications
  - ~500-1,000 daily active users
  - Development and staging environments

### Upstash Pay-As-You-Go
- **$0.20 per 100,000 commands** (after free tier)
- Example costs:
  - 1M commands/month = $2.00/month
  - 10M commands/month = $20.00/month
- Much cheaper than running a dedicated Redis instance

### When to Upgrade
Upgrade from free tier when:
- You consistently hit the 10K daily limit (Upstash will send email alerts)
- You have > 1,000 daily active users
- You add more instances (each instance adds Redis load)

---

## Troubleshooting

### Error: "Redis store init failed, staying in-memory"

**Causes:**
1. `REDIS_URL` or `REDIS_TOKEN` is incorrect
2. Upstash database is paused or deleted
3. Network connectivity issue

**Solutions:**
1. Verify environment variables are set correctly (no typos, no quotes in Render)
2. Check Upstash console — database should show "Active" status
3. Test Redis connection manually:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://your-redis.upstash.io/GET/test-key
   ```
   Should return: `{"result":null}` (key doesn't exist, but connection works)

### Warning: "REDIS_URL is not set in production"

**Cause:** Environment variable is missing or not set in deployment environment

**Solution:**
1. Check Render dashboard → Service → Environment → Environment Variables
2. Ensure `REDIS_URL` and `REDIS_TOKEN` are added
3. Redeploy the service (environment changes require restart)

### Rate limits not working (users can spam requests)

**Diagnosis:**
1. Check server logs for rate-limit setup messages
2. Test with a single user/IP exceeding the limit
3. Verify the endpoint is protected by a rate-limit middleware

**Common issues:**
- Middleware not applied to the route (check route definitions)
- `req.ip` is undefined (ensure `app.set('trust proxy', 1)` is set)
- Redis connection failed silently (check startup logs)

### High Redis command usage (unexpected costs)

**Causes:**
1. Too many instances (each instance polls Redis)
2. Rate-limit window is too short (more frequent resets)
3. High traffic volume (expected if app is growing)

**Solutions:**
1. Optimize instance count (don't over-provision)
2. Increase rate-limit windows (e.g., 15 min → 30 min) if security allows
3. Consider upgrading to Upstash Pro for better pricing

---

## Security Best Practices

### 1. Protect Redis Credentials
- ✅ Never commit `REDIS_URL` or `REDIS_TOKEN` to version control
- ✅ Use environment variables only
- ✅ Rotate tokens if exposed (Upstash console → Reset Token)

### 2. Regional Data Compliance
- Choose Upstash region matching your user base (GDPR, data residency)
- Available regions: US, EU, Asia-Pacific

### 3. Network Security
- Upstash REST API uses HTTPS (encrypted in transit) ✅
- No need for VPC or firewall rules (public endpoint, token-authenticated)

### 4. Access Control
- Use separate Redis databases for dev/staging/production
- Never share production Redis credentials with developers

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  User Requests                                           │
└───────────┬─────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────┐
│  Load Balancer (Render / Nginx / CloudFlare)             │
└───────┬───────────────────────────────┬───────────────────┘
        │                               │
        ▼                               ▼
┌─────────────────┐           ┌─────────────────┐
│  App Instance 1 │           │  App Instance 2 │
│                 │           │                 │
│  Rate Limiter   │◄─────────►│  Rate Limiter   │
└────────┬────────┘           └────────┬────────┘
         │                              │
         └──────────────┬───────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Upstash Redis   │
              │  (Shared Store)  │
              │                  │
              │  IP:count pairs  │
              │  user:count      │
              │  with TTL        │
              └──────────────────┘
```

**Without Redis:** Each instance has its own in-memory Map (not shared)  
**With Redis:** All instances read/write to the same Redis database

---

## Migration Path

### Phase 1: Single Instance (Current)
- **Status:** Redis optional, in-memory rate limiting works fine
- **Action:** None required immediately

### Phase 2: Scaling to 2-3 Instances
- **Status:** Redis becomes important
- **Action:** Set up Upstash free tier (10 min setup)

### Phase 3: High Traffic (5+ instances)
- **Status:** Redis is critical
- **Action:** Monitor Upstash usage, upgrade to paid tier if needed

---

## Summary Checklist

Before deploying to multi-instance production:

- [ ] Upstash Redis database created
- [ ] `REDIS_URL` and `REDIS_TOKEN` set in deployment environment
- [ ] Server logs show: `[RateLimit] Upgraded to Redis-backed store`
- [ ] Rate limiting tested across 2+ instances
- [ ] Upstash usage monitored (stay within free tier or budget accordingly)
- [ ] Redis credentials secured (not in version control)

**For single-instance deployments:** You can skip Redis for now, but set it up before scaling horizontally.

---

## Additional Resources

- [Upstash Documentation](https://docs.upstash.com/redis)
- [express-rate-limit with Redis](https://express-rate-limit.mintlify.app/reference/stores)
- [Upstash Free Tier Limits](https://upstash.com/pricing)
