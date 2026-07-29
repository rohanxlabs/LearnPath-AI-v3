import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass, authLinkClass, labelClass } from './AuthLayout';

export function Login({ navigate }: { navigate: (path: string) => void }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await authService.login(
        String(form.get('email') || ''),
        String(form.get('password') || ''),
      );
      navigate('/');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your email and password.">
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        <div>
          <label htmlFor="login-email" className={labelClass}>
            Email
          </label>
          <input id="login-email" className={inputClass} name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <input id="login-password" className={inputClass} name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-100/80 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <button className={buttonClass} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="mt-2 flex justify-between">
        <button className={authLinkClass} onClick={() => navigate('/forgot-password')}>
          Forgot password?
        </button>
        <button className={authLinkClass} onClick={() => navigate('/register')}>
          Create account
        </button>
      </div>
    </AuthLayout>
  );
}
