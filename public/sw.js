// Service Worker for Expense Tracker PWA
// Handles install prompt and basic caching of static assets

const CACHE_NAME = 'kharcha-v1';
const STATIC_ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network-first for API calls and HTML (fresh data)
  if (url.pathname.startsWith('/api/') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, Chart.js CDN)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
