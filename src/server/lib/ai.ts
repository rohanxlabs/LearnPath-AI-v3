import { jsonrepair } from 'jsonrepair';
import { logger } from './logger';
import { Sentry } from './sentry';

// ---------------------------------------------------------------------------
// AI Usage Tracking & Cost Monitoring
// ---------------------------------------------------------------------------

// Approximate token costs per 1M tokens (as of Jan 2025)
// Groq is currently free for these models, but tracking helps monitor usage
const GROQ_PRICING = {
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },  // per 1M tokens
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },     // per 1M tokens
};

interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  estimatedCost: number;
}

// In-memory usage aggregator (resets on server restart)
// For persistent tracking, send this data to an analytics service or database
let dailyUsageStats = {
  date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  byModel: {} as Record<string, { requests: number; tokens: number; cost: number }>,
  byEndpoint: {} as Record<string, { requests: number; tokens: number; cost: number }>,
};

/**
 * Track AI API usage and log metrics for cost monitoring.
 * Call this after every successful Groq API call.
 */
export function trackAIUsage(metrics: UsageMetrics, endpoint?: string): void {
  const today = new Date().toISOString().slice(0, 10);
  
  // Reset stats at midnight UTC
  if (dailyUsageStats.date !== today) {
    // Log yesterday's stats before resetting
    logger.info(
      {
        date: dailyUsageStats.date,
        totalRequests: dailyUsageStats.totalRequests,
        totalTokens: dailyUsageStats.totalTokens,
        estimatedCost: dailyUsageStats.totalCost.toFixed(4),
        byModel: dailyUsageStats.byModel,
      },
      '[AI Usage] Daily summary'
    );
    
    dailyUsageStats = {
      date: today,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byEndpoint: {},
    };
  }
  
  // Update totals
  dailyUsageStats.totalRequests += 1;
  dailyUsageStats.totalTokens += metrics.totalTokens;
  dailyUsageStats.totalCost += metrics.estimatedCost;
  
  // Update per-model stats
  if (!dailyUsageStats.byModel[metrics.model]) {
    dailyUsageStats.byModel[metrics.model] = { requests: 0, tokens: 0, cost: 0 };
  }
  dailyUsageStats.byModel[metrics.model].requests += 1;
  dailyUsageStats.byModel[metrics.model].tokens += metrics.totalTokens;
  dailyUsageStats.byModel[metrics.model].cost += metrics.estimatedCost;
  
  // Update per-endpoint stats
  if (endpoint) {
    if (!dailyUsageStats.byEndpoint[endpoint]) {
      dailyUsageStats.byEndpoint[endpoint] = { requests: 0, tokens: 0, cost: 0 };
    }
    dailyUsageStats.byEndpoint[endpoint].requests += 1;
    dailyUsageStats.byEndpoint[endpoint].tokens += metrics.totalTokens;
    dailyUsageStats.byEndpoint[endpoint].cost += metrics.estimatedCost;
  }
  
  // Log each request with cost info
  logger.info(
    {
      model: metrics.model,
      endpoint,
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      totalTokens: metrics.totalTokens,
      estimatedCost: metrics.estimatedCost.toFixed(6),
    },
    '[AI Usage] API call'
  );
  
  // Send high-cost alerts to Sentry (useful for detecting abuse or bugs)
  if (metrics.estimatedCost > 0.10) {  // Alert if single request > $0.10
    Sentry.captureMessage(`High-cost AI request: $${metrics.estimatedCost.toFixed(4)}`, {
      level: 'warning',
      tags: {
        feature: 'ai-cost-monitoring',
        model: metrics.model,
        endpoint: endpoint || 'unknown',
      },
      extra: metrics,
    });
  }
  
  // Alert if daily cost exceeds threshold
  if (dailyUsageStats.totalCost > 10.00) {  // Alert at $10/day
    Sentry.captureMessage(`Daily AI cost exceeded $10: $${dailyUsageStats.totalCost.toFixed(2)}`, {
      level: 'error',
      tags: { feature: 'ai-cost-monitoring' },
      extra: { dailyStats: dailyUsageStats },
    });
  }
}

/**
 * Calculate estimated cost from token usage.
 * Groq is currently free, but this helps monitor usage and prepare for future pricing.
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = GROQ_PRICING[model as keyof typeof GROQ_PRICING];
  if (!pricing) {
    // Unknown model, use average pricing
    return ((promptTokens * 0.30) + (completionTokens * 0.40)) / 1_000_000;
  }
  
  const inputCost = (promptTokens * pricing.input) / 1_000_000;
  const outputCost = (completionTokens * pricing.output) / 1_000_000;
  return inputCost + outputCost;
}

/**
 * Get current daily usage stats (useful for admin dashboard or health checks).
 */
export function getDailyUsageStats() {
  return { ...dailyUsageStats };
}

// ---------------------------------------------------------------------------
// JSON repair/parse utility
// ---------------------------------------------------------------------------

/**
 * Resilient JSON cleaner and parser.
 * Uses `jsonrepair` as the primary repair strategy with a simple fallback.
 */
export function cleanAndParseJSON(rawText: string | null | undefined, fallbackDefault: string = '{}'): any {
  const fallbackVal = (() => {
    try { return JSON.parse(fallbackDefault || '{}'); } catch (_) { return {}; }
  })();

  if (!rawText) return fallbackVal;

  let cleaned = rawText.trim();

  // Strip markdown code fences if present (```json ... ```).
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  cleaned = cleaned.trim();

  // Fast path — valid JSON as-is.
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }

  // Boundary slice: keep only the outermost { } or [ ] region.
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  let sliceStr = '';
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    sliceStr = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    sliceStr = cleaned.slice(firstBracket, lastBracket + 1);
  }
  const candidate = sliceStr || cleaned;

  // jsonrepair handles trailing commas, truncation, misquotes, etc.
  try { return JSON.parse(jsonrepair(candidate)); } catch (_) { /* fall through */ }

  logger.warn('[JSON Clean] All repair strategies failed. Returning fallback.');
  return fallbackVal;
}

/**
 * Best-effort neutralisation of untrusted text before embedding it in a prompt.
 * NOT a security boundary — the real control is that model output is only ever
 * rendered as study content, never executed and never used for authorisation.
 */
export function sanitizeForPrompt(input: string | number | undefined | null, maxLength = 500): string {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // Normalise so homoglyph/unicode-escape bypasses collapse to plain ASCII.
  s = s.normalize('NFKC');

  // Strip zero-width and bidi-override characters used to hide instructions.
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');

  // Collapse control characters and excessive newlines (newline stuffing is the
  // most common way to fake a new conversational turn).
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\n{3,}/g, '\n\n');

  // Neutralise structural delimiters and role markers, tolerant of whitespace.
  s = s
    .replace(/[`{}<>\\]/g, '')
    .replace(/^\s*(system|human|user|assistant|developer)\s*:/gim, '[role]')
    .replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, '[filtered]');

  return s.trim().slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// Groq LLM client
// ---------------------------------------------------------------------------

/**
 * Groq model cascade — ordered by capability and token limits.
 * Only active (non-decommissioned) models listed here.
 * https://console.groq.com/docs/models
 *
 * Removed decommissioned / unavailable models (as of 2025):
 *   llama-3.1-70b-versatile                  → decommissioned
 *   gemma2-9b-it                              → decommissioned
 *   mixtral-8x7b-32768                        → decommissioned
 *   llama3-70b-8192                           → decommissioned (confirmed in logs)
 *   llama3-8b-8192                            → decommissioned (confirmed in logs)
 *   meta-llama/llama-4-scout-17b-16e-instruct → model_not_found / no access (confirmed in logs)
 */
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',  // primary — strong reasoning, 128k context, 12k TPM
  'llama-3.1-8b-instant',     // fallback — very fast, 128k context (use for small payloads)
];


export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Default per-request timeout (Groq is significantly faster than OpenRouter).
export const GROQ_TIMEOUT_MS = 20000;

export interface GroqOptions {
  temperature?: number;
  asJSON?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
  /** Override the default system prompt for this request. */
  systemPrompt?: string;
}

export async function callGroqChatCompletion(
  prompt: string,
  options: GroqOptions = {}
): Promise<string> {
  const { temperature = 0.7, asJSON = false, timeoutMs = GROQ_TIMEOUT_MS, maxTokens } = options;

  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured');

  const systemContent = options.systemPrompt
    ?? (asJSON
      ? 'You are a precise data generator. Output a single valid JSON object only, with no markdown fences, comments, or prose.'
      : 'You are a helpful AI assistant. Provide responses in markdown format with clear headings and bullet points.');

  const tryModel = async (model: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, any> = {
        model,
        temperature,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt },
        ],
      };
      if (asJSON) body.response_format = { type: 'json_object' };
      if (maxTokens) body.max_tokens = maxTokens;

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `Groq request failed with status ${response.status}`);
      }

      const parsed = JSON.parse(responseText) as { 
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };
      
      const content = parsed.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('Groq returned an empty completion');
      
      // Track usage metrics for cost monitoring
      if (parsed.usage) {
        const promptTokens = parsed.usage.prompt_tokens || 0;
        const completionTokens = parsed.usage.completion_tokens || 0;
        const totalTokens = parsed.usage.total_tokens || promptTokens + completionTokens;
        
        const estimatedCost = calculateCost(model, promptTokens, completionTokens);
        
        trackAIUsage(
          {
            promptTokens,
            completionTokens,
            totalTokens,
            model,
            estimatedCost,
          },
          // Extract endpoint from stack trace (optional, helps identify which route is using most tokens)
          new Error().stack?.split('\n')[3]?.match(/at (\w+)/)?.[1]
        );
      }
      
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let lastError: Error | null = null;

  for (const model of GROQ_MODELS) {
    try {
      return await tryModel(model);
    } catch (error: any) {
      lastError = error;
      const reason = error.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 1000)}s` : error.message;
      logger.warn({ model, reason }, '[Model Fallback] Groq model failed');
    }
  }

  throw lastError || new Error('All Groq models failed');
}

