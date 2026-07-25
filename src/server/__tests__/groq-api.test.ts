/**
 * Groq API key smoke test.
 *
 * This test makes a real HTTP request to Groq to verify that:
 *  1. GROQ_API_KEY is present in the environment.
 *  2. The key is accepted by the Groq API.
 *  3. A completion is returned successfully.
 *
 * Run with:
 *   npx vitest run src/server/__tests__/groq-api.test.ts
 *
 * The live request is opt-in so unit-test runs and CI remain deterministic.
 * Run it explicitly with RUN_LIVE_GROQ_TESTS=true.
 */

import { describe, it, expect } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env so the key is available when running this file directly with vitest.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // fast, free-tier model on Groq

describe('Groq API Key', () => {
  it('GROQ_API_KEY is present in the environment', () => {
    const key = process.env.GROQ_API_KEY;
    expect(key, 'GROQ_API_KEY is not set in .env').toBeTruthy();
    expect(key!.trim().length, 'GROQ_API_KEY is empty').toBeGreaterThan(10);
  });

  const liveIt = process.env.RUN_LIVE_GROQ_TESTS === 'true' ? it : it.skip;

  liveIt(
    'Groq API responds successfully to a chat completion request',
    async () => {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        console.warn('Skipping live Groq test — GROQ_API_KEY not set.');
        return;
      }

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
          max_tokens: 10,
          temperature: 0,
        }),
      });

      const text = await response.text();

      expect(
        response.ok,
        `Groq API returned HTTP ${response.status}: ${text}`,
      ).toBe(true);

      const json = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      expect(json.error, `Groq returned an error: ${json.error?.message}`).toBeUndefined();

      const content = json.choices?.[0]?.message?.content ?? '';
      expect(content.trim().length, 'Groq returned an empty response').toBeGreaterThan(0);

      console.log(`\n✅ Groq API working. Model: ${GROQ_MODEL} | Reply: "${content.trim()}"`);
    },
    // 20 s timeout for network round-trip
    20_000,
  );
});
