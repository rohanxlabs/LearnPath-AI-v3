# Supabase Auth production configuration

LearnPath uses Supabase Email + Password authentication for registration, login, recovery, and sessions. The application does not use OTP or magic-link login.

- Enable the Email provider.
- Disable **Confirm email** for immediate sign-in after registration. If it remains enabled, Supabase sends its standard confirmation email and the user signs in after confirming.
- Add `https://<your-domain>/reset-password` to Supabase Auth redirect URLs (and localhost for development).
- Configure a custom SMTP provider before production; Supabase's default sender is rate-limited.
- Keep the service-role key server-only. The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The API accepts only a Supabase Bearer JWT and validates it server-side. Configure RLS on all Supabase data tables; product data must never rely on client-provided email or user IDs for authorization.
