/**
 * PostHog analytics hook.
 *
 * Wraps posthog-js with safe initialisation — does nothing when
 * VITE_POSTHOG_KEY is not set so analytics are purely opt-in.
 *
 * Usage in any component:
 *   import { useAnalytics } from '../hooks/useAnalytics';
 *   const { track } = useAnalytics();
 *   track('roadmap_generated', { goal: '...' });
 */
import { useEffect, useRef } from 'react';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

let posthogReady = false;
let posthog: any = null;

// Lazily load posthog-js only when the key is present.
async function initPostHog(key: string, host: string): Promise<void> {
  if (posthogReady) return;
  try {
    const mod = await import('posthog-js');
    posthog = mod.default;
    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // we fire manually on tab changes
      persistence: 'localStorage',
      autocapture: false,      // only explicit track() calls
    });
    posthogReady = true;
  } catch {
    // posthog-js not installed — analytics are silently disabled
  }
}

const POSTHOG_KEY = typeof window !== 'undefined'
  ? (import.meta as any).env?.VITE_POSTHOG_KEY as string | undefined
  : undefined;
const POSTHOG_HOST = typeof window !== 'undefined'
  ? ((import.meta as any).env?.VITE_POSTHOG_HOST as string | undefined) ?? 'https://app.posthog.com'
  : 'https://app.posthog.com';

export function useAnalytics() {
  const initDone = useRef(false);

  useEffect(() => {
    if (!initDone.current && POSTHOG_KEY) {
      initDone.current = true;
      initPostHog(POSTHOG_KEY, POSTHOG_HOST);
    }
  }, []);

  function track(event: string, properties?: EventProperties) {
    if (!posthogReady || !posthog) return;
    posthog.capture(event, properties);
  }

  function identify(userId: string, traits?: EventProperties) {
    if (!posthogReady || !posthog) return;
    posthog.identify(userId, traits);
  }

  function page(name: string, properties?: EventProperties) {
    if (!posthogReady || !posthog) return;
    posthog.capture('$pageview', { page: name, ...properties });
  }

  function reset() {
    if (!posthogReady || !posthog) return;
    posthog.reset();
  }

  return { track, identify, page, reset };
}
