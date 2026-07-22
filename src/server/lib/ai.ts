import { jsonrepair } from 'jsonrepair';
import { logger } from './logger';

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

export function sanitizeForPrompt(input: string | number | undefined | null, maxLength: number = 500): string {
  if (input === null || input === undefined) return '';
  let cleaned = String(input).trim();
  if (cleaned.length > maxLength) cleaned = cleaned.slice(0, maxLength);
  cleaned = cleaned
    .replace(/[`{}<>\\]/g, '')
    .replace(/\b(system:|human:|assistant:)\b/gi, '');
  return cleaned;
}

// ---------------------------------------------------------------------------
// Groq LLM client
// ---------------------------------------------------------------------------

/**
 * Groq model cascade — ordered by capability and token limits.
 * All models are available on Groq's free tier.
 * https://console.groq.com/docs/models
 */
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',   // primary — strongest reasoning, 128k context
  'llama-3.1-70b-versatile',   // second choice — very capable
  'llama-3.1-8b-instant',      // fast fallback — good for lighter tasks
  'gemma2-9b-it',              // Google Gemma fallback
  'mixtral-8x7b-32768',        // Mixtral with 32k context window
];

// Keep the old export name as an alias so existing call-sites that import
// OPENROUTER_MODELS still compile without change.
export const OPENROUTER_MODELS = GROQ_MODELS;

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

// Keep old interface name as alias.
export type OpenRouterOptions = GroqOptions;

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

      const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      const content = parsed.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('Groq returned an empty completion');
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
      console.warn(`[Model Fallback] Groq model ${model} failed:`, reason);
    }
  }

  throw lastError || new Error('All Groq models failed');
}

// Keep old function name as alias so call-sites need zero changes.
export const callOpenRouterChatCompletion = callGroqChatCompletion;
