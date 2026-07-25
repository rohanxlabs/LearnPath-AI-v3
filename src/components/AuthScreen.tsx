import React, { useState } from 'react';
import { Sparkles, Eye, EyeOff } from 'lucide-react';

export interface AuthScreenProps {
  // Mode
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;

  // Field values
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authName: string;
  setAuthName: (v: string) => void;
  authStep: 'credentials' | 'otp-pending';
  pendingSignupEmail: string;

  // Error & loading
  authError: string;
  setAuthError: (v: string) => void;
  isAuthenticating: boolean;

  // Forgot password
  forgotPasswordMode: boolean;
  setForgotPasswordMode: (v: boolean) => void;
  forgotEmail: string;
  setForgotEmail: (v: string) => void;
  forgotStatus: 'idle' | 'sending' | 'sent' | 'error';
  setForgotStatus: (v: 'idle' | 'sending' | 'sent' | 'error') => void;

  // Reset password
  resetToken: string | null;
  resetPassword: string;
  setResetPassword: (v: string) => void;
  resetStatus: 'idle' | 'submitting' | 'success' | 'error';
  setResetStatus: (v: 'idle' | 'submitting' | 'success' | 'error') => void;

  // Handlers
  handleAuthenticate: (e: React.FormEvent) => void;
  verifySignupOtp: (email: string, token: string) => Promise<void>;
  handleForgotPassword: (e: React.FormEvent) => void;
  handleResetPassword: (e: React.FormEvent) => void;
}

// ── Simple email format check (no round-trip needed) ──────────────────────────
function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function AuthScreen({
  authMode, setAuthMode,
  authEmail, setAuthEmail,
  authPassword, setAuthPassword,
  authName, setAuthName,
  authStep, pendingSignupEmail,
  authError, setAuthError,
  isAuthenticating,
  forgotPasswordMode, setForgotPasswordMode,
  forgotEmail, setForgotEmail,
  forgotStatus, setForgotStatus,
  resetToken,
  resetPassword, setResetPassword,
  resetStatus, setResetStatus,
  handleAuthenticate, verifySignupOtp, handleForgotPassword, handleResetPassword,
}: AuthScreenProps) {
  // Local UI-only state — not lifted to App.
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const cardClass = "w-full max-w-sm rounded-[24px] bg-[#111111] border border-white/10 p-6 shadow-2xl space-y-6 relative overflow-hidden";
  const inputClass = "w-full px-3.5 py-2.5 bg-[#0A0A0A] border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500";
  const btnClass = "w-full py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  // Focus trap: keeps Tab/Shift-Tab cycling within the card.
  // Note: on touch-only devices (no hardware keyboard) this never fires, so
  // it is safe and doesn't trap mobile users without a keyboard.
  const handleFocusTrap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const card = e.currentTarget;
    const focusable = Array.from(
      card.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])')
    ).filter(el => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  // Switch mode and immediately clear any stale error so the new form is clean.
  const switchMode = () => {
    setAuthMode(authMode === 'login' ? 'signup' : 'login');
    setAuthError('');
    setEmailTouched(false);
  };

  const header = (
    <div className="text-center flex flex-col items-center">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center shadow-lg border border-white/5">
        <Sparkles className="w-5 h-5 text-white animate-pulse" />
      </div>
      <h2 className="font-display font-extrabold text-xl tracking-tight mt-3">
        LearnPath <span className="text-purple-400">AI</span>
      </h2>
      <p className="text-xs text-zinc-400 mt-1">Premium Full-Stack AI Learning Platform</p>
    </div>
  );

  // Inline email format warning (only shown after user has blurred the field).
  const emailFormatError =
    emailTouched && authEmail.trim().length > 0 && !isValidEmailFormat(authEmail)
      ? 'Please enter a valid email address (e.g. you@example.com).'
      : '';

  const handleResendVerification = async () => {
    const email = (pendingSignupEmail || authEmail).trim().toLowerCase();
    if (!email) return;
    setIsResendingVerification(true);
    setVerificationNotice('');
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setVerificationNotice(res.ok ? 'Verification email sent. Please check your inbox.' : (data.error || 'Unable to resend verification email.'));
    } catch {
      setVerificationNotice('Unable to resend verification email.');
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setVerificationNotice('');
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setAuthError('Enter the 6-digit verification code from your email.');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await verifySignupOtp(pendingSignupEmail, code);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Invalid or expired code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // ── Password reset confirm form ──
  if (resetToken) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Reset your password" className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4" onKeyDown={handleFocusTrap}>
        <div className={cardClass}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
          {header}
          {authError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">{authError}</div>}
          {resetStatus === 'success' ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-300 text-center">
              ✅ Password updated! You can now sign in with your new password.
              <button onClick={() => { setResetStatus('idle'); setAuthError(''); }} className="block mt-2 mx-auto text-zinc-400 hover:text-white text-xs cursor-pointer">Back to Sign In</button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs uppercase font-bold text-zinc-400">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="At least 10 characters with a number"
                    className={`${inputClass} pr-10`}
                    required
                    minLength={10}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={resetStatus === 'submitting'} className={btnClass}>
                {resetStatus === 'submitting' ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Forgot password inline form ──
  if (forgotPasswordMode) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Forgot password" className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4" onKeyDown={handleFocusTrap}>
        <div className={cardClass}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
          {header}
          {forgotStatus === 'sent' ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-300 text-center">
              ✅ Check your inbox! We sent a reset link to <strong>{forgotEmail}</strong>.
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {forgotStatus === 'error' && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">Something went wrong. Please try again.</div>}
              <div className="space-y-1.5">
                <label className="block text-xs uppercase font-bold text-zinc-400">Your Email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                  required
                  autoComplete="email"
                />
              </div>
              <button type="submit" disabled={forgotStatus === 'sending'} className={btnClass}>
                {forgotStatus === 'sending' ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}
          <div className="text-center pt-2 border-t border-white/10">
            <button onClick={() => { setForgotPasswordMode(false); setForgotStatus('idle'); setForgotEmail(''); }} className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer">
              ← Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup email OTP ──
  if (authStep === 'otp-pending') {
    return (
      <div role="dialog" aria-modal="true" aria-label="Verify your email address" className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4" onKeyDown={handleFocusTrap}>
        <div className={cardClass}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
          {header}
          <div className="text-center text-xs text-zinc-400 leading-relaxed">
            We sent a 6-digit verification code to <strong className="text-zinc-200">{pendingSignupEmail}</strong>.
          </div>
          {authError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">{authError}</div>}
          {verificationNotice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-300">{verificationNotice}</div>}
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signup-otp" className="block text-xs uppercase font-bold text-zinc-400">Verification Code</label>
              <input
                id="signup-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={event => setOtpCode(event.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className={`${inputClass} text-center tracking-[0.45em] font-semibold`}
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </div>
            <button type="submit" disabled={isVerifyingOtp || otpCode.length !== 6} className={btnClass}>
              {isVerifyingOtp ? 'Verifying…' : 'Verify'}
            </button>
          </form>
          <div className="text-center pt-2 border-t border-white/10">
            <button type="button" onClick={handleResendVerification} disabled={isResendingVerification} className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50">
              {isResendingVerification ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal login / signup form ──
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={authMode === 'login' ? 'Sign in to LearnPath AI' : 'Create your LearnPath AI account'}
      className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4"
      onKeyDown={handleFocusTrap}
    >
      <div className={cardClass}>
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
        {header}

        {authError && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">
            {authError}
          </div>
        )}
        {verificationNotice && (
          <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-300">
            {verificationNotice}
          </div>
        )}
        {authError?.includes('confirm your email') && (
          <button type="button" onClick={handleResendVerification} disabled={isResendingVerification} className="w-full py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {isResendingVerification ? 'Sending…' : 'Resend verification email'}
          </button>
        )}

        <form onSubmit={handleAuthenticate} className="space-y-4" noValidate>
          {authMode === 'signup' && (
            <div className="space-y-1.5">
              <label htmlFor="auth-name" className="block text-xs uppercase font-bold text-zinc-400">Full Name</label>
              <input
                id="auth-name"
                type="text"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
                placeholder="Your name"
                className={inputClass}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="block text-xs uppercase font-bold text-zinc-400">Email</label>
            <input
              id="auth-email"
              type="email"
              value={authEmail}
              onChange={(e) => { setAuthEmail(e.target.value); if (emailTouched) setEmailTouched(false); }}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@example.com"
              className={`${inputClass} ${emailFormatError ? 'border-red-500/50' : ''}`}
              required
              autoComplete="email"
            />
            {emailFormatError && (
              <p role="alert" className="text-[11px] text-red-400 mt-1">{emailFormatError}</p>
            )}
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor="auth-password" className="block uppercase font-bold text-zinc-400">Password</label>
              {authMode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setForgotPasswordMode(true); setAuthError(''); }}
                  className="text-zinc-500 hover:text-white cursor-pointer underline-offset-2 hover:underline"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={authMode === 'signup' ? 'At least 10 characters with a number' : 'Your password'}
                className={`${inputClass} pr-10`}
                required
                minLength={authMode === 'signup' ? 10 : undefined}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating || !!emailFormatError}
            className={btnClass}
          >
            {isAuthenticating ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Free Account'}
          </button>
        </form>

        <div className="text-center pt-2 space-y-3.5 border-t border-white/10 pb-1.5">
          <button
            type="button"
            onClick={switchMode}
            className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            {authMode === 'login' ? "Don't have an account? Sign Up" : "Already registered? Sign In"}
          </button>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Your data is loaded by email and saved only to your user profile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
