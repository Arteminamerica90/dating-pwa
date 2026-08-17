const CACHE_NAME = 'walkdate-v74';
const CORE = [
  './',
  './index.html',
  './styles.css?v=41',
  './app.js?v=41',
  './storage.js?v=41',
  './idb.js?v=41',
  './encryption.js?v=41',
  './geo.js?v=41',
  './steps.js?v=41',
  './events.js?v=41',
  './questionnaire-data.js?v=41',
  './partner-filter-text.js?v=41',
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

  // Everything else: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
