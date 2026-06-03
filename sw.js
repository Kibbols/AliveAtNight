const CACHE_NAME = 'aliveatnight-v33';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/killers.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always network-first for JS/HTML so updates land immediately
  if (e.request.url.match(/\.(js|html)$/) ||
      e.request.url.includes('FEEDME') ||
      e.request.url.includes('workers.dev') ||
      e.request.url.includes('api.github.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for CSS, fonts, images
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
