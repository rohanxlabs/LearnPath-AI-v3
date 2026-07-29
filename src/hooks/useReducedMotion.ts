import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  // Lazy initialiser reads the media query synchronously on first render so
  // reduced-motion users never see a single animation frame (FOAM fix).
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () => typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Sync in case the preference changed between SSR and hydration.
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

export function useMotionConfig() {
  const reduced = useReducedMotion();

  const springConfig = reduced
    ? { duration: 0.01 }
    : { stiffness: 400, damping: 30 };

  return { reduced, springConfig };
}