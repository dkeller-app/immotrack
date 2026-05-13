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

import {
  _auditEntry, _diffShallow, _auditFilter, _auditToCsv, _auditClean
} from './core/audit-trail.js';

import {
  _compute2044, _format2044Recap, _2044ToCsv
} from './core/legal-2044.js';

import {
  _findPersonalDataForRef, _generateGdprExport, _planErasure, _isEraseEligible
} from './core/rgpd.js';

import {
  _computeBilanAnnuel, _formatBilanTexte
} from './core/legal-bilan.js';

import {
  _buildEcritures, _buildGrandLivre, _toFEC, _journalToCsv, _grandLivreToCsv
} from './core/export-comptable.js';

import {
  _mapRentila, _mapBailFacile, _mergeImport
} from './core/import-concurrents.js';

import {
  _logError, _logEvent, _installGlobalCapture, _exportMonitoringLogs, _clearMonitoringLogs
} from './core/monitoring.js';

import {
  _emailCompose, _emailTypesSupportes, _interpolateEmail,
  _logEmailSent, _getEmailHistory
} from './core/email-compose.js';

import { openEmailModal, _buildMailtoUrl } from './components/email-modal.js';

// v14.99 BUG-PJ-LOCALSTORAGE - helpers attachements (PJ unifiées Drive + IDB)
import {
  _attachmentBuildDoc, _attachmentValidateFile, _attachmentMatch,
  _attachmentResolve, _attachmentDriveName, _planLegacyPjMigration,
  _attachmentOrphans,
  ATTACHMENT_PARENT_TYPES, ATTACHMENT_CATEGORIES, ATTACHMENT_DEFAULT_MAX_SIZE
} from './core/attachments.js';

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

// Audit Trail (Sprint 3A) - helpers purs réutilisables par UI Paramètres
window._auditEntry = _auditEntry;
window._auditDiffShallowPure = _diffShallow; // suffixé pour ne pas écraser l'inline _auditDiffShallow
window._auditFilter = _auditFilter;
window._auditToCsv = _auditToCsv;
window._auditClean = _auditClean;

// LEGAL-2044 (Sprint 3B) - calcul résultat foncier déclaration fiscale
window._compute2044 = _compute2044;
window._format2044Recap = _format2044Recap;
window._2044ToCsv = _2044ToCsv;

// RGPD (Sprint 3D) - droits accès / portabilité / effacement art. 15-22
window._findPersonalDataForRef = _findPersonalDataForRef;
window._generateGdprExport = _generateGdprExport;
window._planErasure = _planErasure;
window._isEraseEligible = _isEraseEligible;

// LEGAL-BILAN-ANNUEL (Sprint 3C) - bilan par entité
window._computeBilanAnnuel = _computeBilanAnnuel;
window._formatBilanTexte = _formatBilanTexte;

// EXPORT-COMPTABLE (Sprint 3E) - FEC + journal + grand livre
window._buildEcritures = _buildEcritures;
window._buildGrandLivre = _buildGrandLivre;
window._toFEC = _toFEC;
window._journalToCsv = _journalToCsv;
window._grandLivreToCsv = _grandLivreToCsv;

// IMPORT-CONCURRENTS (Sprint 3G) - mappers Rentila + BailFacile
window._mapRentila = _mapRentila;
window._mapBailFacile = _mapBailFacile;
window._mergeImport = _mergeImport;

// MONITORING (Sprint 4C) - capture erreurs + events anonymes
window._logError = _logError;
window._logEvent = _logEvent;
window._exportMonitoringLogs = _exportMonitoringLogs;
window._clearMonitoringLogs = _clearMonitoringLogs;
// Install global capture si user opt-in (DB.params.monitoringEnabled)
if (window.DB?.params?.monitoringEnabled === true) {
  _installGlobalCapture();
}

// EMAIL-AUTO (v14.97) - proposition de mails sortants (10 types V1, mode mailto/clipboard)
window._emailCompose = _emailCompose;
window._emailTypesSupportes = _emailTypesSupportes;
window._interpolateEmail = _interpolateEmail;
window._openEmailModal = openEmailModal;
window.openEmailModal = openEmailModal;
window._buildMailtoUrl = _buildMailtoUrl;
window._logEmailSent = _logEmailSent;
window._getEmailHistory = _getEmailHistory;

// ATTACHMENTS (v14.99 BUG-PJ-LOCALSTORAGE) - système unifié de PJ Drive + IDB
window._attachmentBuildDoc = _attachmentBuildDoc;
window._attachmentValidateFile = _attachmentValidateFile;
window._attachmentMatch = _attachmentMatch;
window._attachmentResolve = _attachmentResolve;
window._attachmentDriveName = _attachmentDriveName;
window._planLegacyPjMigration = _planLegacyPjMigration;
window._attachmentOrphans = _attachmentOrphans;
window.ATTACHMENT_PARENT_TYPES = ATTACHMENT_PARENT_TYPES;
window.ATTACHMENT_CATEGORIES = ATTACHMENT_CATEGORIES;
window.ATTACHMENT_DEFAULT_MAX_SIZE = ATTACHMENT_DEFAULT_MAX_SIZE;

// Marqueur pour les tests d'intégration
window.__IMMOTRACK_MODULE_BOOTSTRAP__ = {
  phase: 5,
  version: '14.99',
  loadedAt: new Date().toISOString(),
  helpersExposed: [
    'escHtml', '_esc', '_h', '_raw',
    '_validateHC', '_validateHCCH', '_outlierVsMedian',
    '_isDpeClassValide', '_bailGelDpeFG', '_dpeExpire', '_estRevisableIRL',
    '_isLoyerCategory', '_isChargeRecupCategory',
    '_bailEstActifAt', '_loyerHCAtDate', '_chargesAtDate',
    '_idbOpen', '_idbPut', '_idbGet', '_idbDel', '_idbKey',
    'showToast', 'openM', 'closeM', 'closeBg', 'confirm2',
    '_auditEntry', '_auditDiffShallowPure', '_auditFilter', '_auditToCsv', '_auditClean',
    '_compute2044', '_format2044Recap', '_2044ToCsv',
    '_findPersonalDataForRef', '_generateGdprExport', '_planErasure', '_isEraseEligible',
    '_computeBilanAnnuel', '_formatBilanTexte'
  ]
};

console.info('[main.js] Sprint 3C chargé - 40 helpers (utils + idb + components + audit + legal-2044 + rgpd + bilan) exposés à window');
