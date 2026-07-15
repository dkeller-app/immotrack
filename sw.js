// ImmoTrack Service Worker — Network-First pour index.html ET tous les modules JS/CSS
//
// v15.85 BUG-SW-CACHE-JS (EM-1) : avant cette refonte, les modules JS étaient en cache-first,
// donc les fixes restaient invisibles pour l'user tant que CACHE_VER était inchangé (problème
// récurrent : CACHE_VER figé v31 de v15.64 → v15.84 = 21 versions de retard, user voyait
// l'ancien email-modal.js depuis cache et donc pas la confirmation popup v15.84).
//
// Stratégie post-refonte :
//   - Navigation HTML (index.html) → network-first (déjà OK avant)
//   - Modules JS/CSS same-origin → network-first (nouveau)
//   - Autres assets (icons, manifest, images) → cache-first (offline-friendly)
//
// CACHE_VER est désormais synchronisée avec IMMOTRACK_VERSION (à bumper ensemble).
// Si oubli de bump : le SW continuera à servir l'ancienne version cache. Mais grâce
// au network-first sur les JS, les nouveaux JS seront quand même fetched dès qu'online.

const CACHE_VER = 'immotrack-v15.487';

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

  // 1) Navigation (index.html) → NETWORK-FIRST
  if (request.mode === 'navigate') {
    e.respondWith(_networkFirst(request));
    return;
  }

  // 2) v15.85 EM-1 : Modules JS/CSS same-origin → NETWORK-FIRST
  //    Évite que les fixes soient invisibles tant que CACHE_VER n'est pas bumpé.
  //    Cache reste alimenté pour offline (fallback transparent).
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.css')) {
    e.respondWith(_networkFirst(request));
    return;
  }

  // 3) Autres assets same-origin (icons, manifest, images, fonts) → cache-first
  //    Garde l'expérience PWA offline-friendly pour les assets statiques.
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

/**
 * Network-first avec fallback cache. Clone IMMÉDIATEMENT la response avant tout
 * await/then (sinon le body est consommé par le retour → "Failed to execute 'clone'").
 */
function _networkFirst(request) {
  return fetch(request, { cache: 'no-cache' })
    .then(res => {
      const resClone = res.clone();
      caches.open(CACHE_VER).then(c => c.put(request, resClone)).catch(() => {});
      return res;
    })
    .catch(() => caches.match(request));
}
