// ImmoTrack Service Worker — offline cache
const CACHE = 'immotrack-v1';
const ASSETS = [
  '/immotrack/',
  '/immotrack/index.html',
  '/immotrack/manifest.json',
  '/immotrack/icon-192.png',
  '/immotrack/icon-512.png'
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app assets, network-first for Drive API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network for Google APIs (Drive, OAuth)
  if (url.hostname.includes('google') || url.hostname.includes('googleapis')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Cache successful GET responses for app assets
        if (resp && resp.status === 200 && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached); // offline fallback
    })
  );
});
