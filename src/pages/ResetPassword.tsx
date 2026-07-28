import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass } from './AuthLayout';

export function ResetPassword({ navigate }: { navigate: (path: string) => void }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password.length < 10 || password !== form.get('confirm')) {
      return setError('Passwords must match and contain at least 10 characters.');
    }
    try {
      await authService.resetPassword(password);
      setDone(true);
    } catch {
      setError('This reset link is invalid or expired. Request a new one.');
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Use a unique password with at least 10 characters."
    >
      {done ? (
        <>
          <p className="mt-7 rounded-xl bg-emerald-100/80 px-3 py-2 text-sm text-emerald-700">
            Password updated successfully.
          </p>
          <button className={buttonClass} onClick={() => navigate('/login')}>
            Sign in
          </button>
        </>
      ) : (
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-violet-950">
            New password
            <input className={inputClass} name="password" type="password" minLength={10} required />
          </label>
          <label className="block text-sm font-medium text-violet-950">
            Confirm password
            <input className={inputClass} name="confirm" type="password" required />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-rose-100/80 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button className={buttonClass}>Update password</button>
        </form>
      )}
    </AuthLayout>
  );
}
