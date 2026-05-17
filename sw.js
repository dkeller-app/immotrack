// ImmoTrack Service Worker — Network-First pour index.html
// Bumper CACHE_VER à chaque déploiement pour invalider les anciens caches

const CACHE_VER = 'immotrack-v31';

// ── Install : skipWaiting immédiat + pré-cache offline fallback ──────────────
self.addEventListener('install', e => {
  self.skipWaiting(); // Prend la main immédiatement, sans attendre fermeture onglets
  const base = self.registration.scope;
  e.waitUntil(
    caches.open(CACHE_VER).then(c =>
      c.addAll([base, base + 'index.html']).catch(() => {}) // Échec silencieux si offline
    )
  );
});

// ── Activate : supprime les anciens caches + revendique les clients ouverts ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // Prend le contrôle des onglets ouverts sans reload manuel
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Passe-through : requêtes non-GET et cross-origin (Drive, IRL API, CDN SheetJS...)
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    // Navigation (index.html) → NETWORK-FIRST, cache: 'no-cache' bypass HTTP cache CDN
    // v31 fix : clone() IMMÉDIATEMENT avant tout await/then, sinon le body est consommé
    // par le retour à la page → "Failed to execute 'clone' on Response" récurrent.
    e.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(res => {
          const resClone = res.clone(); // clone tout de suite, pas dans le .then async
          caches.open(CACHE_VER).then(c => c.put(request, resClone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request)) // Offline → sert la version cachée
    );
    return;
  }

  // Autres assets same-origin (icons, manifest) → cache-first
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
