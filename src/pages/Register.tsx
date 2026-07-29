import { useState, type FormEvent } from 'react';
import { authService } from '../auth/authService';
import { AuthLayout, buttonClass, inputClass, authLinkClass, labelClass } from './AuthLayout';

const COMMON_PASSWORDS = new Set([
  'password1', 'Password1', 'password12', 'Password12',
  'qwerty123', 'Qwerty123', '12345678a', '123456789a',
  'abc12345', 'Abc12345', 'letmein1', 'welcome1',
  'monkey123', 'dragon12', 'master12', 'passw0rd',
]);

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return 'Password must contain at least one letter and one number.';
  if (COMMON_PASSWORDS.has(password))
    return 'Password is too common — please choose a less predictable one.';
  return null;
}

export function Register({ navigate }: { navigate: (path: string) => void }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    const email = String(f.get('email') || '');
    const password = String(f.get('password') || '');
    const confirm = String(f.get('confirm') || '');

    if (!name || !email) return setError('Enter your name and a valid email.');
    if (password !== confirm) return setError('Passwords do not match.');
    const pwError = validatePassword(password);
    if (pwError) return setError(pwError);

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await authService.register(name, email, password);
      if (data.session) navigate('/');
      else setMessage('Your account was created. Check your email to confirm it, then sign in.');
    } catch {
      setError('We could not create your account. Check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start building your learning path.">
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        <div>
          <label htmlFor="reg-name" className={labelClass}>Full name</label>
          <input id="reg-name" className={inputClass} name="name" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="reg-email" className={labelClass}>Email</label>
          <input id="reg-email" className={inputClass} name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="reg-password" className={labelClass}>
            Password{' '}
            <span className="text-violet-700/65">(10+ chars, letters &amp; numbers)</span>
          </label>
          <input id="reg-password" className={inputClass} name="password" type="password" minLength={10} autoComplete="new-password" required />
        </div>
        <div>
          <label htmlFor="reg-confirm" className={labelClass}>Confirm password</label>
          <input id="reg-confirm" className={inputClass} name="confirm" type="password" autoComplete="off" required />
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-100/80 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-100/80 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <button className={buttonClass} disabled={loading}>
          {loading ? 'Creating account…' : 'Continue'}
        </button>
      </form>
      <p className="mt-2 text-center text-sm text-violet-800/70">
        Already have an account?{' '}
        <button className={authLinkClass} onClick={() => navigate('/login')}>Sign in</button>
      </p>
    </AuthLayout>
  );
}
