// Server-side Supabase admin client.
// Uses the SERVICE_ROLE key — never expose this to the browser.
// Only imported in server route files.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;

/**
 * Returns the lazily-initialised Supabase admin client (SERVICE_ROLE key).
 *
 * ⚠️  Key rotation: if SUPABASE_SERVICE_ROLE_KEY is rotated while the process
 * is running the cached client will start returning 401 errors from Supabase.
 * Call `resetSupabaseAdminClient()` to force re-initialisation on the next
 * request, or simply restart the process.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Set both in your .env file.'
    );
  }

  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}

/**
 * Clears the cached admin client so it will be recreated on the next call to
 * `getSupabaseAdmin()`.  Call this after rotating SUPABASE_SERVICE_ROLE_KEY
 * to recover without a process restart.
 */
export function resetSupabaseAdminClient(): void {
  _adminClient = null;
}
