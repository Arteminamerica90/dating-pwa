const CACHE_NAME = 'walkdate-v163';
const CORE = [
  './',
  './index.html',
  './styles.css?v=163',
  './app.js?v=163',
  './storage.js?v=70',
  './idb.js?v=70',
  './encryption.js?v=70',
  './geo.js?v=70',
  './steps.js?v=70',
  './events.js?v=70',
  './questionnaire-data.js?v=70',
  './partner-filter-text.js?v=70',
  './supabase.js?v=102',
  './supabase-config.js?v=100',
  './subscriptions.js?v=95',
  './manifest.webmanifest',
  './icons/icon.svg',
  './assets/profile/photo-1024.jpg',
  './assets/profile/avatar-square.jpg',
  './assets/profile/avatar-4x5.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML: network-first so updates arrive; fallback to cache.
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Everything else: cache-first. On miss, fetch and store (also under the
  // un-versioned base URL). If the fetch fails, fall back to any cached copy
  // (base or the exact URL) so the app always boots.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          const copy = res.clone();
          const base = new URL(req.url);
          base.search = '';
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, copy);
            if (base.href !== req.url) cache.put(base.href, copy.clone());
          });
          return res;
        })
        .catch(() => {
          if (cached) return cached;
          const base = new URL(req.url);
          base.search = '';
          return caches.match(base.href);
        })
    })
  );
});
