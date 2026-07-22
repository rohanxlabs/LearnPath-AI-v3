// PWAContext — online/offline status, update available, verified email status.
// Extracted from App.tsx.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePWA } from '../lib/usePWA';

interface PWAContextValue {
  pwa: ReturnType<typeof usePWA>;
  showOnlineToast: boolean;
  verifiedStatus: 'success' | 'invalid' | null;
  setVerifiedStatus: React.Dispatch<React.SetStateAction<'success' | 'invalid' | null>>;
  legalPage: 'terms' | 'privacy' | null;
  setLegalPage: React.Dispatch<React.SetStateAction<'terms' | 'privacy' | null>>;
}

const PWAContext = createContext<PWAContextValue | null>(null);

export function usePWAContext(): PWAContextValue {
  const ctx = useContext(PWAContext);
  if (!ctx) throw new Error('usePWAContext must be used inside PWAProvider');
  return ctx;
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const pwa = usePWA();
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [verifiedStatus, setVerifiedStatus] = useState<'success' | 'invalid' | null>(null);
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    if (!pwa.isOnline) {
      setWasOffline(true);
    } else if (pwa.isOnline && wasOffline) {
      setShowOnlineToast(true);
      const timer = setTimeout(() => { setShowOnlineToast(false); setWasOffline(false); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [pwa.isOnline, wasOffline]);

  // Handle ?verified= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get('verified');
    if (verified === 'success' || verified === 'invalid') {
      setVerifiedStatus(verified as 'success' | 'invalid');
      params.delete('verified');
      const remaining = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (remaining ? '?' + remaining : ''));
      setTimeout(() => setVerifiedStatus(null), 6000);
    }
  }, []);

  const value: PWAContextValue = { pwa, showOnlineToast, verifiedStatus, setVerifiedStatus, legalPage, setLegalPage };
  return <PWAContext.Provider value={value}>{children}</PWAContext.Provider>;
}
