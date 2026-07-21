import React from 'react';
import { Sparkles } from 'lucide-react';

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
  handleForgotPassword: (e: React.FormEvent) => void;
  handleResetPassword: (e: React.FormEvent) => void;
}

export function AuthScreen({
  authMode, setAuthMode,
  authEmail, setAuthEmail,
  authPassword, setAuthPassword,
  authName, setAuthName,
  authError, setAuthError,
  isAuthenticating,
  forgotPasswordMode, setForgotPasswordMode,
  forgotEmail, setForgotEmail,
  forgotStatus, setForgotStatus,
  resetToken,
  resetPassword, setResetPassword,
  resetStatus, setResetStatus,
  handleAuthenticate, handleForgotPassword, handleResetPassword,
}: AuthScreenProps) {
  const cardClass = "w-full max-w-sm rounded-[24px] bg-[#111111] border border-white/10 p-6 shadow-2xl space-y-6 relative overflow-hidden";
  const inputClass = "w-full px-3.5 py-2.5 bg-[#0A0A0A] border border-white/5 rounded-xl text-xs text-white focus:outline-hidden focus:border-purple-500";
  const btnClass = "w-full py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 hover:brightness-110 rounded-xl transition-all shadow-[0_0_12px_rgba(168,85,247,0.3)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  // Focus trap: keeps Tab/Shift-Tab cycling within the card
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
                <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Min 8 chars, include a number" className={inputClass} required minLength={8} />
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
                <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" className={inputClass} required />
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

  // ── Normal login / signup form ──
  return (
    <div role="dialog" aria-modal="true" aria-label={authMode === 'login' ? 'Sign in to LearnPath AI' : 'Create your LearnPath AI account'} className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4" onKeyDown={handleFocusTrap}>
      <div className={cardClass}>
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-xl pointer-events-none" />
        {header}

        {authError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthenticate} className="space-y-4">
          {authMode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs uppercase font-bold text-zinc-400">Full Name</label>
              <input type="text" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Jane Smith" className={inputClass} required />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs uppercase font-bold text-zinc-400">Registry Email</label>
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="bobby.fisher@learnpath.ai" className={inputClass} required />
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center text-xs">
              <label className="block uppercase font-bold text-zinc-400">Security Password</label>
              {authMode === 'login' && (
                <button type="button" onClick={() => { setForgotPasswordMode(true); setAuthError(''); }} className="text-zinc-500 hover:text-white cursor-pointer">
                  Forgot Password?
                </button>
              )}
            </div>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className={inputClass} required />
          </div>

          <button type="submit" disabled={isAuthenticating} className={btnClass}>
            {isAuthenticating ? 'Processing...' : authMode === 'login' ? 'Confirm Sign In' : 'Create Free Account'}
          </button>
        </form>

        <div className="text-center pt-2 space-y-3.5 border-t border-white/10 pb-1.5">
          <button
            onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
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
