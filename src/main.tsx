import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('[GlobalError]', message, 'at', source, ':', lineno, ':', colno, error);
  };
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[UnhandledRejection]', event.reason);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
