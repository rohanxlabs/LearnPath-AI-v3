import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { initialiseSentry } from './lib/sentry';
import App from './App.tsx';
import './index.css';

// Initialise Sentry before React renders so the first paint is already
// instrumented.  The call is guarded against duplicate HMR invocations.
initialiseSentry();

// Simple production-safe fallback shown by the top-level ErrorBoundary.
function RootFallback({ error }: { error: Error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', background: '#0A0A0A', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <p style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</p>
      <p style={{ color: '#71717a', marginBottom: '1.5rem', maxWidth: 400 }}>
        An unexpected error occurred. Please reload the page. If the problem persists, try clearing your browser cache.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '0.6rem 1.5rem', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}
      >
        Reload
      </button>
      {import.meta.env.DEV && (
        <pre style={{ marginTop: '1.5rem', fontSize: 11, color: '#f87171', textAlign: 'left', maxWidth: 480, overflowX: 'auto' }}>
          {error.message}
        </pre>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ error }) => <RootFallback error={error as Error} />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
