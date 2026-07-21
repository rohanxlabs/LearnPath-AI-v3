const CACHE_NAME = 'learnpath-ai-cache-v4';
const OFFLINE_URL = '/offline.html';

// External URLs (e.g. Google Fonts) are intentionally excluded from addAll().
// addAll() must succeed 100% during install; any failed fetch aborts the
// entire SW installation. Fonts load normally via <link> in index.html.
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline fallback and essentials');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Cleaning up old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests, Chrome extensions, and browser sync / live reload endpoints
  if (
    request.method !== 'GET' || 
    url.protocol === 'chrome-extension:' || 
    url.pathname.includes('/vite') || 
    url.pathname.includes('hot') ||
    url.hostname.includes('browser-sync')
  ) {
    return;
  }

  // Handle local API requests
  if (url.pathname.startsWith('/api/')) {
    // These routes carry user-specific or session-sensitive data that must
    // never be served stale — always go to the network and never cache.
    const NEVER_CACHE_ROUTES = [
      '/api/login', '/api/logout', '/api/register',
      '/api/user-profile', '/api/user-stats', '/api/bootstrap',
      '/api/password-reset', '/api/progress',
      '/api/ai-recommendations', '/api/mentor-chat',
    ];
    const isNeverCache = NEVER_CACHE_ROUTES.some(r => url.pathname.startsWith(r));
    if (isNeverCache) {
      // Pure network — no caching at all
      event.respondWith(
        fetch(request).catch(() =>
          new Response(JSON.stringify({ error: 'Offline', message: 'This feature requires a network connection.' }), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
      );
      return;
    }

    // For cacheable API routes (topics, public-stats, user-analytics) use
    // Network First: try network, fall back to cache.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cachedResponse) =>
            cachedResponse ||
            new Response(JSON.stringify({
              error: 'Offline',
              message: 'Content is cached from a previous visit. Connect to network to fetch fresh data.'
            }), { headers: { 'Content-Type': 'application/json' } })
          )
        )
    );
    return;
  }

  // Handle static assets & page requests - Stale-While-Revalidate pattern (Cache fall back to Network)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update cache
        fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
        }).catch(() => { /* offline - ignore */ });

        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // If network fails and navigation mode, return the offline fallback HTML
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Network error. Page unavailable offline.', { status: 408 });
        });
    })
  );
});

// SkipWaiting support for immediate SW activation on update
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
