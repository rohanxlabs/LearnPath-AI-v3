# AI Cost Monitoring & Usage Tracking

## Overview

LearnPath AI v3 includes built-in cost monitoring for Groq API usage. While Groq is currently **free** (generous free tier: 14,400 requests/day), this tracking helps you:

1. **Monitor usage patterns** - Understand which endpoints consume the most tokens
2. **Prepare for scaling** - Know your costs before switching to a paid provider
3. **Detect anomalies** - Get alerts when usage spikes unexpectedly
4. **Optimize prompts** - Identify opportunities to reduce token consumption

---

## Current Pricing (Estimated)

**Groq (Current Provider):**
- **Free Tier:** 14,400 requests/day (~500 DAU capacity)
- **Cost per 1M tokens (if paid in future):**
  - `llama-3.3-70b-versatile`: $0.59 input, $0.79 output
  - `llama-3.1-8b-instant`: $0.05 input, $0.08 output

**Note:** Groq is currently free. Cost estimates are for monitoring purposes only.

---

## How It Works

### 1. Automatic Tracking

Every AI API call is automatically tracked with:
- Model used (`llama-3.3-70b-versatile` or `llama-3.1-8b-instant`)
- Tokens consumed (prompt + completion)
- Estimated cost (based on hypothetical pricing)
- Endpoint/feature that made the request

### 2. Daily Aggregation

Stats are aggregated daily and reset at midnight UTC:
- Total requests
- Total tokens consumed
- Total estimated cost
- Breakdown by model
- Breakdown by endpoint (roadmap gen, AI mentor, lesson gen, etc.)

### 3. Structured Logging

All API calls are logged with full context:

```json
{
  "level": "info",
  "msg": "[AI Usage] API call",
  "model": "llama-3.3-70b-versatile",
  "endpoint": "roadmapGeneration",
  "promptTokens": 1250,
  "completionTokens": 3800,
  "totalTokens": 5050,
  "estimatedCost": "0.003500"
}
```

### 4. Daily Summary Logs

At midnight UTC (when stats reset), a daily summary is logged:

```json
{
  "level": "info",
  "msg": "[AI Usage] Daily summary",
  "date": "2024-01-15",
  "totalRequests": 450,
  "totalTokens": 1250000,
  "estimatedCost": "0.8500",
  "byModel": {
    "llama-3.3-70b-versatile": {
      "requests": 400,
      "tokens": 1200000,
      "cost": 0.82
    },
    "llama-3.1-8b-instant": {
      "requests": 50,
      "tokens": 50000,
      "cost": 0.03
    }
  }
}
```

---

## Monitoring Endpoints

### View Current Usage Stats

**Endpoint:** `GET /api/ai-usage-stats`

**Authentication:** None (⚠️ Recommended to add IP whitelist or admin auth in production)

**Response:**
```json
{
  "date": "2024-01-15",
  "totalRequests": 450,
  "totalTokens": 1250000,
  "totalCost": 0.85,
  "byModel": {
    "llama-3.3-70b-versatile": {
      "requests": 400,
      "tokens": 1200000,
      "cost": 0.82
    },
    "llama-3.1-8b-instant": {
      "requests": 50,
      "tokens": 50000,
      "cost": 0.03
    }
  },
  "byEndpoint": {
    "roadmapGeneration": {
      "requests": 100,
      "tokens": 600000,
      "cost": 0.42
    },
    "lessonGeneration": {
      "requests": 200,
      "tokens": 400000,
      "cost": 0.28
    },
    "aiMentor": {
      "requests": 150,
      "tokens": 250000,
      "cost": 0.15
    }
  },
  "message": "Daily AI usage statistics. Note: Groq is currently free, costs are estimated for monitoring purposes."
}
```

**Example:**
```bash
curl https://your-app.onrender.com/api/ai-usage-stats
```

---

## Sentry Alerts

### High-Cost Request Alert

Triggered when a single request exceeds **$0.10**:

```
Level: Warning
Message: "High-cost AI request: $0.1234"
Tags:
  - feature: ai-cost-monitoring
  - model: llama-3.3-70b-versatile
  - endpoint: roadmapGeneration
Extra:
  - promptTokens: 5000
  - completionTokens: 8000
  - totalTokens: 13000
  - estimatedCost: 0.1234
```

**When to investigate:**
- Abnormally long prompts (check for prompt injection or data leak)
- Infinite retry loops
- User abuse (scripted API calls)

### Daily Cost Threshold Alert

Triggered when daily cost exceeds **$10.00**:

```
Level: Error
Message: "Daily AI cost exceeded $10: $12.34"
Tags:
  - feature: ai-cost-monitoring
Extra:
  - dailyStats: { ... }
```

**When to investigate:**
- Traffic spike (legitimate or attack)
- Prompt inefficiency (can you reduce token usage?)
- Need to upgrade Groq tier or switch providers

---

## Optimization Tips

### 1. Reduce Token Usage

**Roadmap Generation:**
- ✅ Current: ~5,000 tokens per roadmap
- 🎯 Target: Keep under 6,000 tokens
- **How:** Shorten system prompts, reduce example count

**Lesson Content:**
- ✅ Current: ~4,500 tokens per lesson
- 🎯 Target: Keep under 5,000 tokens
- **How:** Cache generated content, lazy-load lessons

**AI Mentor:**
- ✅ Current: ~800 tokens per chat message
- 🎯 Target: Keep under 1,000 tokens
- **How:** Limit conversation history to last 20 turns (already implemented)

### 2. Use Fallback Models Strategically

The system automatically falls back from `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` on failure.

**Consider manually routing:**
- **Use 70B model for:** Roadmap generation, complex content
- **Use 8B model for:** Simple hints, recommendations, summaries

**Savings example:**
- 100 requests with 70B: ~$0.65
- 100 requests with 8B: ~$0.06
- **Savings: 90%** (if models were paid)

### 3. Cache Aggressively

Already implemented:
- ✅ Lesson content cached permanently in DB
- ✅ Recommendations cached for 30 minutes
- ✅ Project suggestions cached per roadmap

**Additional opportunities:**
- Cache common quiz questions per topic
- Cache AI mentor responses for frequently asked questions
- Pre-generate content for popular roadmaps (Python, JavaScript, React)

### 4. Implement Rate Limiting

Already implemented:
- ✅ Per-user daily quota: 50 AI requests/day
- ✅ Per-user per-minute: 10 AI requests/minute
- ✅ Roadmap generation: 3 per hour per user

**Adjust if needed:**
```bash
# In .env or deployment environment
AI_DAILY_LIMIT=100  # Increase for paid users
```

---

## Cost Projections

### Example: 500 Daily Active Users

**Assumptions:**
- Each user generates 1 roadmap/week
- Each user opens 5 lessons/day (lazy-loaded)
- Each user sends 3 AI mentor messages/day

**Daily Token Usage:**
```
Roadmap gen:    (500/7 users) × 5,000 tokens  =   357,000 tokens
Lesson gen:     500 users × 5 lessons × 4,500  = 11,250,000 tokens
AI mentor:      500 users × 3 messages × 800   =  1,200,000 tokens
-----------------------------------------------------------
Total:                                         = 12,807,000 tokens/day
```

**Estimated Daily Cost (if Groq were paid):**
- Using 70B model: ~$8.50/day → **$255/month**
- Using 8B model: ~$0.80/day → **$24/month**
- Mixed (70% 8B, 30% 70B): ~$3.00/day → **$90/month**

**Note:** Groq is currently free. These are hypothetical costs for planning.

---

## Groq Free Tier Limits

**Current Limits:**
- **14,400 requests/day** (across all models)
- **No cost** (free tier)
- **Rate limit:** Varies by model (~30 RPM for 70B, ~100 RPM for 8B)

**When you'll hit limits:**
- **~500 DAU:** Should stay within limits comfortably
- **1,000+ DAU:** May need to implement request prioritization or upgrade
- **Abuse/scripting:** Can exhaust limits quickly (mitigated by rate limiting)

**Mitigation strategies:**
1. Aggressive caching (already implemented)
2. Use 8B model for non-critical requests
3. Implement request prioritization (roadmap gen > mentor > recommendations)
4. Add fallback to local content if quota exceeded
5. Upgrade to Groq paid tier (when available) or switch to OpenRouter/OpenAI

---

## Switching to a Paid Provider

If you need to switch from Groq (e.g., quota exceeded, need higher rate limits):

### Option 1: OpenRouter (Recommended)

**Advantages:**
- Access to 100+ models with unified API
- Competitive pricing ($0.50-$2.00 per 1M tokens)
- Built-in fallbacks across providers
- Easy migration (OpenAI-compatible API)

**Migration:**
```typescript
// In src/server/lib/ai.ts
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Update fetch call:
const response = await fetch(OPENROUTER_API_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': process.env.FRONTEND_URL,
    'X-Title': 'LearnPath AI',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});
```

**Recommended models:**
- Primary: `anthropic/claude-3.5-sonnet` (best quality, $3/1M tokens)
- Fallback: `meta-llama/llama-3.1-70b-instruct` (good quality, $0.59/1M tokens)

### Option 2: OpenAI Direct

**Advantages:**
- Best-in-class models (GPT-4, GPT-4 Turbo)
- Stable API, excellent documentation
- Good rate limits

**Disadvantages:**
- Higher cost ($10-$60 per 1M tokens)
- No built-in fallbacks

**Migration:**
```typescript
// Similar to OpenRouter, use OpenAI's official API
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
```

### Option 3: Self-Hosted (Advanced)

For maximum cost control:
- Run `llama-3.1-70b` or `llama-3.3-70b` on your own GPU servers
- Use [vLLM](https://github.com/vllm-project/vllm) or [TGI](https://github.com/huggingface/text-generation-inference)
- Only viable at high scale (10,000+ DAU)

---

## Security Considerations

### Current State: Public Endpoint

The `/api/ai-usage-stats` endpoint is currently **public** (no auth required).

**Risks:**
- Anyone can view your API usage stats
- Could reveal business metrics (user count, activity patterns)

**Not a security issue:**
- Does not expose API keys
- Does not expose user data
- Only shows aggregated usage stats

### Recommended: Restrict Access

**Option 1: IP Whitelist**

```typescript
// In src/server/routes/user.ts
const ADMIN_IPS = process.env.ADMIN_IPS?.split(',') || [];

router.get('/ai-usage-stats', (req, res, next) => {
  const clientIP = req.ip;
  if (ADMIN_IPS.length > 0 && !ADMIN_IPS.includes(clientIP)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}, async (_req, res) => {
  // ... existing code
});
```

**Option 2: Admin Auth Middleware**

```typescript
// Create src/server/lib/adminAuth.ts
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Apply to route
router.get('/ai-usage-stats', requireAdmin, async (_req, res) => {
  // ... existing code
});
```

---

## Logs & Observability

### Server Logs (Pino)

All AI usage is logged in structured JSON format:

```bash
# View logs on Render
render logs --tail --service your-service-name

# Filter for AI usage
render logs --tail | grep "AI Usage"
```

### Sentry (Error Tracking)

High-cost alerts and daily threshold alerts appear in Sentry:

1. Navigate to [sentry.io](https://sentry.io)
2. Select your project
3. Go to **Issues** → Filter by `feature:ai-cost-monitoring`

### Custom Dashboards (Optional)

For advanced monitoring, export usage stats to:
- **Datadog:** Forward Pino logs via HTTP drain
- **Grafana:** Query `/api/ai-usage-stats` endpoint periodically
- **PostHog:** Send custom events on each AI call

---

## Troubleshooting

### Stats Not Updating

**Symptoms:** `/api/ai-usage-stats` returns old data or zeros

**Causes:**
1. Server restarted (stats are in-memory, reset on restart)
2. No AI requests made yet today
3. Date calculation error

**Solutions:**
- Check server logs for `[AI Usage] API call` entries
- Verify timezone is UTC (stats reset at midnight UTC)
- Test with a roadmap generation request

### High Cost Alerts in Sentry

**Symptoms:** Receiving frequent "High-cost AI request" alerts

**Investigate:**
1. Check which endpoint is triggering alerts
2. Review prompt length (may be abnormally long)
3. Check for retry loops (failed requests retrying infinitely)
4. Look for abuse patterns (single user making many requests)

**Solutions:**
- Optimize prompts (reduce token count)
- Add stricter rate limiting
- Review and adjust alert threshold (`> $0.10` per request)

### Daily Limit Exceeded (Groq)

**Symptoms:** AI requests failing with `429 Too Many Requests`

**Groq Free Tier Exhausted:**
1. Check Groq dashboard: [console.groq.com/usage](https://console.groq.com/usage)
2. Review `/api/ai-usage-stats` to see daily request count
3. Identify high-usage endpoints

**Immediate mitigation:**
- Fallback content activates automatically (see logs: "using offline fallback")
- Users can still browse generated content

**Long-term solutions:**
1. Implement aggressive caching (reduce API calls)
2. Use 8B model more often (smaller, faster, less quota impact)
3. Upgrade to Groq paid tier (when available)
4. Switch to OpenRouter or OpenAI

---

## Summary

✅ **Automatic tracking** of all AI API calls  
✅ **Structured logging** with full context  
✅ **Daily aggregation** by model and endpoint  
✅ **Sentry alerts** for high costs and daily thresholds  
✅ **Public endpoint** `/api/ai-usage-stats` for monitoring  
✅ **Cost estimates** (Groq is currently free, estimates for planning)  

**Action Items:**
1. Monitor `/api/ai-usage-stats` weekly
2. Review Sentry for cost alerts
3. Optimize prompts if token usage is high
4. Plan for paid tier upgrade when approaching limits

**Next Steps:**
- Set up Sentry alerts (already configured)
- Monitor Groq usage dashboard
- Implement IP whitelist for `/ai-usage-stats` endpoint (recommended)
- Consider switching to OpenRouter if Groq limits are reached
