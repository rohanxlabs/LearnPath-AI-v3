import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass, authLinkClass, labelClass } from './AuthLayout';

export function ForgotPassword({ navigate }: { navigate: (path: string) => void }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authService.requestPasswordReset(
        String(new FormData(event.currentTarget).get('email')),
      );
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a secure reset link if this email has an account."
    >
      {sent ? (
        <p className="mt-7 rounded-xl bg-emerald-100/80 px-3 py-2 text-sm text-emerald-700">
          Check your inbox for the reset link.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          <div>
            <label htmlFor="forgot-email" className={labelClass}>
              Email
            </label>
            <input id="forgot-email" className={inputClass} name="email" type="email" required />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-rose-100/80 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <button className={buttonClass} disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <div className="mt-2">
        <button className={authLinkClass} onClick={() => navigate('/login')}>
          ← Back to sign in
        </button>
      </div>
    </AuthLayout>
  );
}
