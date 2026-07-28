import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass } from './AuthLayout';

export function ForgotPassword({ navigate }: { navigate: (path: string) => void }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await authService.requestPasswordReset(
        String(new FormData(event.currentTarget).get('email')),
      );
      setSent(true);
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
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-violet-950">
            Email
            <input className={inputClass} name="email" type="email" required />
          </label>
          <button className={buttonClass} disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <button
        className="mt-5 text-sm font-medium text-violet-700 hover:text-fuchsia-600"
        onClick={() => navigate('/login')}
      >
        Back to sign in
      </button>
    </AuthLayout>
  );
}
