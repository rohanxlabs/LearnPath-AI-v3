# Supabase Auth Production Configuration

LearnPath uses Supabase Email + Password authentication for registration, login, recovery, and sessions. The application does not use OTP or magic-link login.

## Quick Setup Checklist

### 1. Enable Email Provider
Navigate to **Authentication → Providers** in your Supabase dashboard and enable the Email provider.

### 2. Email Verification Settings

**For Development/Testing:**
- Disable **Confirm email** for immediate sign-in after registration
- This allows faster testing without checking email

**⚠️ For Production (STRONGLY RECOMMENDED):**
- **Enable** **Confirm email** to verify email addresses
- This prevents:
  - Fake account creation with invalid emails
  - Typo-based account lockouts (user can't recover if email is wrong)
  - Email enumeration attacks
  - Spam/abuse from disposable email addresses

**Trade-offs:**
- ✅ Enabled: Better security, prevents abuse, validates real users
- ❌ Disabled: Faster onboarding, no email verification step required

### 3. Redirect URLs
Add the following redirect URLs in **Authentication → URL Configuration**:

**Development:**
```
http://localhost:3000/reset-password
http://localhost:5173/reset-password
```

**Production:**
```
https://<your-domain>/reset-password
```

### 4. Custom SMTP (Required for Production)

Supabase's default SMTP is rate-limited (30 emails/hour per project). For production, configure a custom SMTP provider:

**Recommended Providers:**
- [Resend](https://resend.com) - 3,000 free emails/month, excellent deliverability
- [SendGrid](https://sendgrid.com) - 100 free emails/day
- [Mailgun](https://mailgun.com) - 5,000 free emails/month

**Configuration:**
1. Navigate to **Project Settings → Auth → SMTP Settings**
2. Enable **Custom SMTP**
3. Enter your SMTP credentials
4. Set a professional from-address (e.g., `noreply@yourdomain.com`)
5. Test by triggering a password reset email

**Environment Variables:**
```bash
# For transactional emails (if using Resend API instead of SMTP)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=noreply@yourdomain.com
```

### 5. Security Best Practices

**Service Role Key:**
- ✅ Keep `SUPABASE_SERVICE_ROLE_KEY` server-only (never expose to browser)
- ✅ The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- ✅ Rotate the service role key if it is ever exposed

**Row-Level Security (RLS):**
- ✅ RLS is enabled on all tables (see migration `0006_enable_rls.sql`)
- ✅ The API accepts only Supabase Bearer JWT and validates it server-side
- ✅ Never rely on client-provided email or user IDs for authorization
- ✅ All data access goes through the authenticated Express API, not PostgREST

**JWT Validation:**
- ✅ The server validates JWTs locally (no API round-trip)
- ✅ Supports both HS256 (older projects) and ES256 (newer projects with JWKS)
- ✅ JWKS keys are cached with 10-minute TTL and auto-refresh on key rotation

### 6. Rate Limiting

Authentication endpoints are rate-limited to prevent brute-force attacks:
- **Login:** 5 attempts per 15 minutes (per IP)
- **Register/Password Reset:** 10 attempts per 15 minutes (per IP)
- **Token Refresh:** 30 attempts per 15 minutes (per IP)

For production with multiple instances, configure Redis for shared rate-limiting:
```bash
REDIS_URL=https://your-upstash-redis.upstash.io
REDIS_TOKEN=your-upstash-token
```

## Email Templates (Optional Customization)

Navigate to **Authentication → Email Templates** to customize:
- Confirm signup email
- Reset password email
- Magic link email (not used by this app)
- Email change confirmation

**Recommended Changes:**
- Add your brand name and logo
- Include support contact information
- Adjust the tone to match your brand voice
- Test all templates before going live

## Testing Your Configuration

**Before deploying to production:**

1. **Test Registration Flow:**
   - Register a new account with a real email
   - If email verification is enabled, check that the confirmation email arrives
   - Verify the email and ensure login works

2. **Test Password Reset:**
   - Request a password reset
   - Check that the reset email arrives within 1-2 minutes
   - Follow the reset link and verify it works
   - Confirm you can log in with the new password

3. **Test Rate Limiting:**
   - Attempt 6+ failed logins rapidly
   - Verify you receive a "Too many attempts" error
   - Wait 15 minutes and verify you can log in again

4. **Test JWT Validation:**
   - Log in and capture the JWT token from browser DevTools
   - Verify the token is validated successfully by the API
   - Tamper with the token and verify the API rejects it (401)

## Production Deployment Checklist

- [ ] Email verification is **enabled**
- [ ] Custom SMTP provider is configured and tested
- [ ] Redirect URLs include your production domain
- [ ] Service role key is set in Render/deployment environment (never in code)
- [ ] RLS is enabled on all tables (verified via `0006_enable_rls.sql` migration)
- [ ] Rate limiting is tested and working
- [ ] Email templates are customized (optional but recommended)
- [ ] Password reset flow tested end-to-end
- [ ] Registration flow tested end-to-end

## Troubleshooting

**"Invalid login credentials" error:**
- Check that the email exists in Supabase Auth dashboard
- If email verification is enabled, confirm the email is verified
- Try password reset if the password might be wrong

**Emails not arriving:**
- Check spam folder
- Verify custom SMTP is configured correctly
- Test SMTP credentials in Supabase dashboard
- Check Supabase email logs: **Authentication → Logs**

**"Too many requests" error:**
- This is expected behavior (rate limiting working)
- Wait 15 minutes or configure Redis for faster reset in development
- In production, ensure REDIS_URL is set for shared rate-limiting

**JWT validation failing (401):**
- Verify `SUPABASE_URL` matches your project URL exactly
- For HS256 projects, verify `SUPABASE_JWT_SECRET` is set correctly
- For ES256 projects, ensure JWKS endpoint is accessible
- Check server logs for detailed validation failure reasons
