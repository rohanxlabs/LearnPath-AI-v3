import { useEffect, useState } from 'react';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { ForgotPassword } from '../pages/ForgotPassword';
import { ResetPassword } from '../pages/ResetPassword';

export function AuthGateway() {
  const [path, setPath] = useState(window.location.pathname);
  const navigate = (next: string) => {
    window.history.pushState({}, '', next);
    setPath(next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  if (path === '/register') return <Register navigate={navigate} />;
  if (path === '/forgot-password') return <ForgotPassword navigate={navigate} />;
  if (path === '/reset-password') return <ResetPassword navigate={navigate} />;
  return <Login navigate={navigate} />;
}
