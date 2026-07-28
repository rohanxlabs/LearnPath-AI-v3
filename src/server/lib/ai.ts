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
      logger.warn({ model, reason }, '[Model Fallback] Groq model failed');
    }
  }

  throw lastError || new Error('All Groq models failed');
}

