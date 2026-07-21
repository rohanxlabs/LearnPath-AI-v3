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
// OpenRouter LLM client
// ---------------------------------------------------------------------------

export const OPENROUTER_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-2-27b-it:free',
  'tencent/hy3:free',
  'openrouter/free'
];

// Models known NOT to support the `response_format: json_object` request param.
export const MODELS_WITHOUT_JSON_MODE = new Set(['tencent/hy3:free', 'openrouter/free']);

export function isJsonModeUnsupportedError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return /response_format|json_object|response format|does not support/i.test(msg);
}

// Default per-request timeout.
export const OPENROUTER_TIMEOUT_MS = 15000;

export interface OpenRouterOptions {
  temperature?: number;
  asJSON?: boolean;
  timeoutMs?: number;
  maxTokens?: number;
}

export async function callOpenRouterChatCompletion(
  prompt: string,
  options: OpenRouterOptions = {}
): Promise<string> {
  const { temperature = 0.7, asJSON = false, timeoutMs = OPENROUTER_TIMEOUT_MS, maxTokens } = options;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');

  const systemContent = asJSON
    ? 'You are a precise data generator. Output a single valid JSON object only, with no markdown fences, comments, or prose.'
    : 'You are a helpful AI assistant. Provide responses in markdown format with clear headings and bullet points.';

  const tryModel = async (model: string, useJsonFormat: boolean): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, any> = {
        model,
        temperature,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt }
        ]
      };
      if (useJsonFormat) body.response_format = { type: 'json_object' };
      if (maxTokens) body.max_tokens = maxTokens;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(responseText || `OpenRouter request failed with status ${response.status}`);
      }

      const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      const content = parsed.choices?.[0]?.message?.content || '';
      if (!content.trim()) throw new Error('OpenRouter returned an empty completion');
      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let lastError: Error | null = null;

  for (const model of OPENROUTER_MODELS) {
    const wantsJsonFormat = asJSON && !MODELS_WITHOUT_JSON_MODE.has(model);
    try {
      return await tryModel(model, wantsJsonFormat);
    } catch (error: any) {
      lastError = error;
      const reason = error.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 1000)}s` : error.message;
      console.warn(`[Model Fallback] Model ${model} failed:`, reason);
      if (asJSON && wantsJsonFormat && isJsonModeUnsupportedError(error)) {
        try {
          return await tryModel(model, false);
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`[Model Fallback] Model ${model} (plain-text retry) failed:`, retryErr.message);
        }
      }
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}
