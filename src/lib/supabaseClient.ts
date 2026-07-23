// Browser-side Supabase client — used only in React components / AuthContext.
// The service-role admin client lives in src/server/lib/supabaseAdmin.ts and
// must never be imported in any client-side file.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Authentication will not work. Check your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage so the user stays logged in on refresh.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles the magic-link / OAuth redirect
  },
});
