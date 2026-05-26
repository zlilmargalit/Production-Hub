const CACHE = 'production-hub-v2';

self.addEventListener('install', (e) => {
  // Don't pre-cache index.html — always fetch it fresh so new builds load immediately
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"offline"}', {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // HTML navigation (index.html / SPA shell): network-first so rebuilds always show immediately
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed static assets (JS, CSS, images): cache-first — filenames change on rebuild
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request).then((res) => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      })
    )
  );
});
