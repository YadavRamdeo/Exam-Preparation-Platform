const CACHE_NAME = 'fintram-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    // Network-first for API
    event.respondWith(
      fetch(event.request).then((res) => res).catch(() => caches.match(event.request))
    );
    return;
  }
  // Cache-first for static
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
