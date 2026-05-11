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

// v14.86 ARCHI-MODULAR Phase 1a : import core/utils + expose à window pour
// compatibilité avec les onclick inline (toujours présents dans index-test.html).
//
// PATTERN DE TRANSITION :
// Tant qu'index-test.html garde ses définitions inline de escHtml, _h, etc.,
// ces exposures via window.X = X sont REDONDANTES (l'inline les définit déjà
// comme globales). Mais quand on migrera vers Phase 4 (cleanup inline), ces
// exposures deviendront LA SOURCE des fonctions globales.
//
// Aujourd'hui ces exposures ne CASSENT rien : assigner window.escHtml = escHtml
// re-écrit la même fonction au même nom (la version core/utils.js).
//
// 🚨 IMPORTANT : tant que l'inline existe ENCORE dans index-test.html, le code
// inline s'exécute AVANT main.js (qui est en `defer` implicite via type="module").
// Donc l'inline gagne. La ré-écriture par main.js arrive après, mais c'est
// IDEMPOTENT puisqu'on définit la même version (source unique).

import {
  escHtml, _esc, _h, _raw,
  _validateHC, _validateHCCH, _outlierVsMedian,
  _isDpeClassValide, _bailGelDpeFG, _dpeExpire, _estRevisableIRL,
  _isLoyerCategory, _isChargeRecupCategory,
  _bailEstActifAt, _loyerHCAtDate, _chargesAtDate
} from './core/utils.js';

import {
  _IDB_NAME, _IDB_STORE,
  _idbOpen, _idbPut, _idbGet, _idbDel, _idbKey
} from './core/idb.js';

import { showToast } from './components/toast.js';
import { openM, closeM, closeBg, confirm2 } from './components/modal.js';

// Expose les helpers à window pour compatibilité onclick inline + ev handlers.
// Ces helpers sont aussi définis inline dans index-test.html actuellement.
window.escHtml = escHtml;
window._esc = _esc;
window._h = _h;
window._raw = _raw;
window._validateHC = _validateHC;
window._validateHCCH = _validateHCCH;
window._outlierVsMedian = _outlierVsMedian;
window._isDpeClassValide = _isDpeClassValide;
window._bailGelDpeFG = _bailGelDpeFG;
window._dpeExpire = _dpeExpire;
window._estRevisableIRL = _estRevisableIRL;
window._isLoyerCategory = _isLoyerCategory;
window._isChargeRecupCategory = _isChargeRecupCategory;
window._bailEstActifAt = _bailEstActifAt;
// _loyerHCAtDate : signature module = (log, dateRef, irlHistorique). On wrappe
// pour que window._loyerHCAtDate(log, dateRef) consomme DB.irlHistorique global
// (compat avec le code inline qui appelle sans le 3e arg).
window._loyerHCAtDate = (log, dateRef) => _loyerHCAtDate(log, dateRef, window.DB?.irlHistorique || []);
window._chargesAtDate = _chargesAtDate;

// IndexedDB helpers (Phase 1b)
window._IDB_NAME = _IDB_NAME;
window._IDB_STORE = _IDB_STORE;
window._idbOpen = _idbOpen;
window._idbPut = _idbPut;
window._idbGet = _idbGet;
window._idbDel = _idbDel;
window._idbKey = _idbKey;

// Components UI (Phase 2)
window.showToast = showToast;
window.openM = openM;
window.closeM = closeM;
window.closeBg = closeBg;
window.confirm2 = confirm2;

// Marqueur pour les tests d'intégration
window.__IMMOTRACK_MODULE_BOOTSTRAP__ = {
  phase: 2,
  version: '14.88',
  loadedAt: new Date().toISOString(),
  helpersExposed: [
    'escHtml', '_esc', '_h', '_raw',
    '_validateHC', '_validateHCCH', '_outlierVsMedian',
    '_isDpeClassValide', '_bailGelDpeFG', '_dpeExpire', '_estRevisableIRL',
    '_isLoyerCategory', '_isChargeRecupCategory',
    '_bailEstActifAt', '_loyerHCAtDate', '_chargesAtDate',
    '_idbOpen', '_idbPut', '_idbGet', '_idbDel', '_idbKey',
    'showToast', 'openM', 'closeM', 'closeBg', 'confirm2'
  ]
};

console.info('[main.js] Phase 2 chargé - 26 helpers (utils + idb + components) exposés à window');
