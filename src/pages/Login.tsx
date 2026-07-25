import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass } from './AuthLayout';

export function Login({ navigate }: { navigate: (path: string) => void }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await authService.login(String(form.get('email') || ''), String(form.get('password') || ''));
      navigate('/');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <AuthLayout title="Welcome back" subtitle="Sign in with your email and password."><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-medium text-violet-950">Email<input className={inputClass} name="email" type="email" autoComplete="email" required /></label><label className="block text-sm font-medium text-violet-950">Password<input className={inputClass} name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="rounded-xl bg-rose-100/80 px-3 py-2 text-sm text-rose-700">{error}</p>}<button className={buttonClass} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form><div className="mt-5 flex justify-between text-sm"><button className="font-medium text-violet-700 hover:text-fuchsia-600" onClick={() => navigate('/forgot-password')}>Forgot password?</button><button className="font-medium text-violet-700 hover:text-fuchsia-600" onClick={() => navigate('/register')}>Create account</button></div></AuthLayout>;
}
