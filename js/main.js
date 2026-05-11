/**
 * ImmoTrack — Bootstrap modulaire ES (Sprint 2 ARCHI-MODULAR)
 *
 * Ce fichier sera progressivement enrichi au fur et à mesure des phases :
 *   Phase 0 (v14.85) : skeleton (ici) — CSS extrait dans css/main.css
 *   Phase 1 (v14.86) : import core/{db,drive,idb,utils}.js
 *   Phase 2 (v14.87) : import components/{modal,toast,signature,charts}.js
 *   Phase 3 (v14.88+): tabs/* migrés un par un
 *   Phase 4 (v14.95) : cleanup index-test.html ne contient plus que la coquille HTML
 *
 * Compatibilité : ce fichier est chargé via <script type="module"> à la fin du
 * <body>. ⚠️ Les ES modules nécessitent un http-server (file:// CORS-bloqué).
 * Pour dev local : `npx http-server . -p 8766`.
 *
 * Pour l'instant ce skeleton sert juste de marqueur structurel.
 * Le code applicatif reste encore dans les <script> inline de index-test.html.
 */

// Marqueur pour les tests d'intégration (Phase 4 cleanup vérifiera la présence)
window.__IMMOTRACK_MODULE_BOOTSTRAP__ = {
  phase: 0,
  version: '14.85',
  loadedAt: new Date().toISOString()
};

console.info('[main.js] Phase 0 skeleton chargé (Sprint 2 ARCHI-MODULAR)');
