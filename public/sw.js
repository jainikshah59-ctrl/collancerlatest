/* Collancer service worker — network fallback/caching (not an offline-first data layer).
   Caches successful same-origin static GET requests. Navigation requests always
   reach the network so a stale cached index.html cannot point at mismatched JS
   chunks after a deployment. */
const CACHE = 'collancer-shell-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Always fetch app navigations from the current deployment. Do not serve a
  // cached HTML shell that may reference JavaScript chunks from an older build.
  if (req.mode === 'navigate' || url.pathname === '/index.html') return;

  // Never cache API calls: OAuth callbacks and other /api/* GETs must always
  // hit the network (a cached 302-follow response under an old code+state URL
  // would replay stale results and break one-time flows).
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match('/'))
      )
  );
});
