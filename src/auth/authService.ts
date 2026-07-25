import { supabase } from '../lib/supabaseClient';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const authService = {
  async register(fullName: string, rawEmail: string, password: string) {
    const result = await supabase.auth.signUp({
      email: normalizeEmail(rawEmail),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (result.error) throw result.error;
    return result.data;
  },

  async login(rawEmail: string, password: string) {
    const result = await supabase.auth.signInWithPassword({
      email: normalizeEmail(rawEmail),
      password,
    });
    if (result.error) throw result.error;
    return result.data;
  },

  async requestPasswordReset(rawEmail: string) {
    const result = await supabase.auth.resetPasswordForEmail(normalizeEmail(rawEmail), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (result.error) throw result.error;
  },

  async resetPassword(password: string) {
    const result = await supabase.auth.updateUser({ password });
    if (result.error) throw result.error;
  },

  signOut: () => supabase.auth.signOut(),
};
