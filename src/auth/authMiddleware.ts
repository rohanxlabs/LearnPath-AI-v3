import { supabase } from '../lib/supabaseClient';

/** Builds an API header from the current Supabase session. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}
