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
  _dpeInterditLocationAuDate, _dpeInterdictionCalendrier,
  _isLoyerCategory, _isChargeRecupCategory,
  _bailEstActifAt, _loyerHCAtDate, _chargesAtDate, _loyerProrataMois, _loyerProrataMoisSplit
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
  lotRegimeForYear, splitFonciereLots, MEUBLE_TYPES
} from './core/regime-lot.js';

import {
  _findPersonalDataForRef, _generateGdprExport, _planErasure, _isEraseEligible
} from './core/rgpd.js';

import {
  _computeBilanAnnuel, _formatBilanTexte
} from './core/legal-bilan.js';

import {
  _computeFinancesSummary
} from './core/finances-summary.js';

// B4 — sous-P&L mensuel (modèle prêt entier en charge)
import {
  _computeFinancesMonthly
} from './core/finances-monthly.js';

// SUIVI-LOYERS-SOURCE-UNIQUE Phase A — moteur unique de statut de paiement
import {
  _computeLoyerStatut, _loyerChipVerdict, _loyerToleranceActive, _loyerTodayLocal, _loyerSoldeAjuste, _computeLoyerCumul, _computeLoyerChargeAlloc, _computeLoyerArrears, _loyerSplitCascade, _LOYER_TOLERANCE_JOUR
} from './core/loyer-statut.js';

// AUDIT-SUIVI-LOYERS étape 1/2 — barème de loyer historisé (source de vérité du dû dans le temps)
import { duMois, _baremeOfLot, _debutSuivi, _computeLoyerNetting } from './core/loyer-du-mois.js';
import {
  computeDateEffetIRL, clampDateEffet, periodeInitialeBail,
  appliquerNouvellePeriode, synchroniserPeriodeBail, cloturerBareme, tombstonerPeriodesDuBail,
  _premierDuMois, _premierDuMoisSuivant
} from './core/loyer-bareme.js';

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

import { openEmailModal, _buildMailtoUrl, _emHandleAction } from './components/email-modal.js';
import { validateNewRef, canRenameLogement, renameLogementRef } from './core/rename-logement.js';
import { validateNewImmNom, renameImmeubleRefs } from './core/rename-immeuble.js';

// v15.80 EMAIL-SMTP-CONNECT - envoi direct via Gmail API
import {
  _base64UrlEncode, _emailEncodeMimeHeader, _emailMakeBoundary,
  _emailToMimeBase64Url, _emailSendViaGmail
} from './core/email-send.js';

// v15.87 EM-2b - PJ PDF auto-générée (quittance + IRL en V1.0)
import {
  _emailGenPdfAttachment, _emailPdfTypesSupportedV1, _blobToBase64
} from './core/email-pdf-attachment.js';

// v14.99 BUG-PJ-LOCALSTORAGE - helpers attachements (PJ unifiées Drive + IDB)
import {
  _attachmentBuildDoc, _attachmentValidateFile, _attachmentMatch,
  _attachmentResolve, _attachmentDriveName, _planLegacyPjMigration,
  _attachmentOrphans,
  ATTACHMENT_PARENT_TYPES, ATTACHMENT_CATEGORIES, ATTACHMENT_DEFAULT_MAX_SIZE
} from './core/attachments.js';

// v15.07 BANK-INTEGRATION V1 - import CSV/OFX + matching auto
// v15.78 BUG-BANK-IMPORT-DEDUP - fingerprinting stable + migration legacy
import {
  _bankParseCSV, _bankAutoDetectColumns, _bankParseAmount, _bankParseDate,
  _bankNormalizeCSV, _bankParseOFX, _bankMatchHeuristic, _bankDedup,
  _bankHashStable, _bankFingerprintCSV, _bankFingerprintOFX, _bankMigrateFingerprints,
  _bankExtractOFXAccount, _bankCsvHeaderHash,
  _bankSliceAfterFingerprint, _bankComputeLastImport
} from './core/bank-import.js';

// v15.10 QUITTANCES-ACTIVES - statut dynamique + matching + escalade + génération auto
import {
  _statutQuittance, _matchPaiementQuittance, _escaladeAlerte,
  _planQuittancesAGenerer, QUITTANCE_STATUS
} from './core/quittances-actives.js';

// v15.12 GESTION DG & IMPAYÉS Sprint 12 - tracking DG + plan apurement + procédure judiciaire
import {
  _dgStatut, _calculerDelaiRestitution, _calculerSoldeDG,
  _planApurementStatut, _procedureJudiciaireEtat, _listerImpayesActifs,
  DG_STATUS, PROCEDURE_ETAT
} from './core/gestion-dg-impayes.js';

// LOG-CANDIDATS (Phase 2) - helpers purs candidature locataire
import {
  _calculConfiance, _candidatVersLocataire, _candidatVersGarant,
  _nouveauCandidat, _migrerDocsCandidatVersBail, _purgeCandidatsRefuses,
  buildComplementShareMessage, shouldAutoPull, countUnreadCandidats, nouveauDossierToast,
  majDossierToast, repullDecision, loyerAttenduForLog,
  PIECES_REQUISES, piecesScoreFromCategories, candHasGarantie
} from './core/candidature.js';

// LOG-CANDIDATS (lien en ligne) — client relais Cloudflare
import {
  normalizeBase, buildCandidatUrl, relayConfigured, buildInvitationPayload,
  _relayDossierVersCandidat, relayCreateInvitation, relayFetchResult,
  relayFetchPiece, relayReopen, relayRevoke, relayPurge, relayPing
} from './core/relay-client.js';

// SAUVEGARDE (Chantier 3 cloud-cutover) — cœur PUR de la sauvegarde de sécurité.
// Exposé sous window._bk.* ; l'orchestration IMPURE (File System Access, fetch
// Storage, UI Réglages, auto-check) vit inline dans index-test.html / index.html.
import {
  FREQ_MS, backupStamp, dueForBackup, collectBackupFiles, buildManifest, crc32, storedZip
} from './core/backup.js';

// RESET-CLOUD UX — cœur PUR du « ⚠️ Vider mon espace cloud » (gating UI, saisie du nom,
// messages d'erreur RPC). Exposé sous window._espacePurge ; l'orchestration IMPURE (modale,
// export JSON préalable, appel RPC via __immoPurgeEspace) vit inline dans index.html.
import { confirmNameMatches, purgeUiState, purgeErrorMessage } from './core/espace-purge.js';

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
// v15.05 Sprint 7 V1.1 LEGAL-DPE-INTERDICTION-LOCATION
window._dpeInterditLocationAuDate = _dpeInterditLocationAuDate;
window._dpeInterdictionCalendrier = _dpeInterdictionCalendrier;
window._isLoyerCategory = _isLoyerCategory;
window._isChargeRecupCategory = _isChargeRecupCategory;
window._bailEstActifAt = _bailEstActifAt;
// _loyerHCAtDate : signature module = (log, dateRef, irlHistorique). On wrappe
// pour que window._loyerHCAtDate(log, dateRef) consomme DB.irlHistorique global
// (compat avec le code inline qui appelle sans le 3e arg).
window._loyerHCAtDate = (log, dateRef) => _loyerHCAtDate(log, dateRef, window.DB?.irlHistorique || []);
window._chargesAtDate = _chargesAtDate;
// v15.19 Phase A1 BUG-PRORATA-DASH : prorata jours intra-mois
window._loyerProrataMois = (log, yr, mi, bails) =>
  _loyerProrataMois(log, yr, mi, bails, window.DB?.irlHistorique || []);
// Split {hc, ch} proraté (même signature, irlHistorique consommé) — source du dû pour la cascade d'imputation.
window._loyerProrataMoisSplit = (log, yr, mi, bails) =>
  _loyerProrataMoisSplit(log, yr, mi, bails, window.DB?.irlHistorique || []);

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

// FEAT-REGIMES (P0) - régime fiscal par lot : exclure le meublé (BIC) du 2044 foncier
window.lotRegimeForYear = lotRegimeForYear;
window.splitFonciereLots = splitFonciereLots;
window.MEUBLE_TYPES = MEUBLE_TYPES;

// RGPD (Sprint 3D) - droits accès / portabilité / effacement art. 15-22
window._findPersonalDataForRef = _findPersonalDataForRef;
window._generateGdprExport = _generateGdprExport;
window._planErasure = _planErasure;
window._isEraseEligible = _isEraseEligible;

// LEGAL-BILAN-ANNUEL (Sprint 3C) - bilan par entité
window._computeBilanAnnuel = _computeBilanAnnuel;
window._formatBilanTexte = _formatBilanTexte;

// REPORTING-BAILLEUR — agrégat onglet Finances
window._computeFinancesSummary = _computeFinancesSummary;

// B4 — sous-P&L mensuel (prêt entier en charge + base 2044 conditionnelle)
window._computeFinancesMonthly = _computeFinancesMonthly;

// SUIVI-LOYERS-SOURCE-UNIQUE Phase A — moteur unique de statut de paiement
window._computeLoyerStatut = _computeLoyerStatut;
window._loyerChipVerdict = _loyerChipVerdict;
window._loyerToleranceActive = _loyerToleranceActive;
window._loyerTodayLocal = _loyerTodayLocal;
window._loyerSoldeAjuste = _loyerSoldeAjuste;
window._computeLoyerCumul = _computeLoyerCumul;
window._computeLoyerChargeAlloc = _computeLoyerChargeAlloc;
window._computeLoyerArrears = _computeLoyerArrears;
window._loyerSplitCascade = _loyerSplitCascade;
window._LOYER_TOLERANCE_JOUR = _LOYER_TOLERANCE_JOUR;

// AUDIT-SUIVI-LOYERS — résolveur unique du dû + noyau barème (étapes 1-2).
// duMois(ctx, ym) : ctx est construit par l'inline (bails du lot + DB.loyerBareme + quittances).
// Les surfaces basculeront dessus à l'étape 4 ; ici le barème est ALIMENTÉ par les writers.
window.duMois = duMois;
window._baremeOfLot = (ref) => _baremeOfLot(window.DB?.loyerBareme || [], ref);
window._debutSuivi = _debutSuivi;
window._computeLoyerNetting = _computeLoyerNetting;
window._baremeComputeDateEffetIRL = computeDateEffetIRL;
window._baremeClampDateEffet = clampDateEffet;
window._baremePeriodeInitialeBail = periodeInitialeBail;
window._baremeAppliquerNouvellePeriode = appliquerNouvellePeriode;
window._baremeSynchroniserPeriodeBail = synchroniserPeriodeBail;
window._baremeCloturer = cloturerBareme;
window._baremeTombstonerBail = tombstonerPeriodesDuBail;
window._premierDuMois = _premierDuMois;
window._premierDuMoisSuivant = _premierDuMoisSuivant;

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
window._emHandleAction = _emHandleAction; // v15.82bis — onclick inline buttons
window._logEmailSent = _logEmailSent;
window._getEmailHistory = _getEmailHistory;

// v15.80 EMAIL-SMTP-CONNECT - envoi direct Gmail API
window._base64UrlEncode = _base64UrlEncode;
window._emailEncodeMimeHeader = _emailEncodeMimeHeader;
window._emailMakeBoundary = _emailMakeBoundary;
window._emailToMimeBase64Url = _emailToMimeBase64Url;
window._emailSendViaGmail = _emailSendViaGmail;

// v15.87 EM-2b - PJ PDF auto-générée
window._emailGenPdfAttachment = _emailGenPdfAttachment;
window._emailPdfTypesSupportedV1 = _emailPdfTypesSupportedV1;
window._blobToBase64 = _blobToBase64;

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

// BANK-INTEGRATION V1 (v15.07 Sprint 8) - import CSV/OFX manuel
// + v15.78 BUG-BANK-IMPORT-DEDUP fingerprinting stable
window._bankParseCSV = _bankParseCSV;
window._bankAutoDetectColumns = _bankAutoDetectColumns;
window._bankParseAmount = _bankParseAmount;
window._bankParseDate = _bankParseDate;
window._bankNormalizeCSV = _bankNormalizeCSV;
window._bankParseOFX = _bankParseOFX;
window._bankMatchHeuristic = _bankMatchHeuristic;
window._bankDedup = _bankDedup;
window._bankHashStable = _bankHashStable;
window._bankFingerprintCSV = _bankFingerprintCSV;
window._bankFingerprintOFX = _bankFingerprintOFX;
window._bankMigrateFingerprints = _bankMigrateFingerprints;
// v15.160 BANK-IMPORT-V2 Phase A : identification du compte source
window._bankExtractOFXAccount = _bankExtractOFXAccount;
window._bankCsvHeaderHash = _bankCsvHeaderHash;
// v15.162-163 BANK-IMPORT-V2 Phase D : pointeur de progression
window._bankSliceAfterFingerprint = _bankSliceAfterFingerprint;
window._bankComputeLastImport = _bankComputeLastImport;

// QUITTANCES-ACTIVES (v15.10 Sprint 11) - statut dynamique + escalade + auto-gen
window._statutQuittance = _statutQuittance;
window._matchPaiementQuittance = _matchPaiementQuittance;
window._escaladeAlerte = _escaladeAlerte;
window._planQuittancesAGenerer = _planQuittancesAGenerer;
window.QUITTANCE_STATUS = QUITTANCE_STATUS;

// GESTION DG & IMPAYÉS (v15.12 Sprint 12) - tracking DG + plan apurement + procédure
window._dgStatut = _dgStatut;
window._calculerDelaiRestitution = _calculerDelaiRestitution;
window._calculerSoldeDG = _calculerSoldeDG;
window._planApurementStatut = _planApurementStatut;
window._procedureJudiciaireEtat = _procedureJudiciaireEtat;
window._listerImpayesActifs = _listerImpayesActifs;
window.DG_STATUS = DG_STATUS;
window.PROCEDURE_ETAT = PROCEDURE_ETAT;

// LOG-CANDIDATS (Phase 2) - helpers purs candidature locataire
window._calculConfiance = _calculConfiance;
window.PIECES_REQUISES = PIECES_REQUISES;
window.piecesScoreFromCategories = piecesScoreFromCategories;
window.candHasGarantie = candHasGarantie;
window._candidatVersLocataire = _candidatVersLocataire;
window._candidatVersGarant = _candidatVersGarant;
window._nouveauCandidat = _nouveauCandidat;
window._migrerDocsCandidatVersBail = _migrerDocsCandidatVersBail;
window._purgeCandidatsRefuses = _purgeCandidatsRefuses;
window.buildComplementShareMessage = buildComplementShareMessage;
window.shouldAutoPull = shouldAutoPull;
window.countUnreadCandidats = countUnreadCandidats;
window.nouveauDossierToast = nouveauDossierToast;
window.majDossierToast = majDossierToast;
window.repullDecision = repullDecision;
window.loyerAttenduForLog = loyerAttenduForLog;

// LOG-CANDIDATS (lien en ligne) — client relais
window._relayNormalizeBase = normalizeBase;
window._buildCandidatUrl = buildCandidatUrl;
window._relayConfigured = relayConfigured;
window._buildInvitationPayload = buildInvitationPayload;
window._relayDossierVersCandidat = _relayDossierVersCandidat;
window._relayCreateInvitation = relayCreateInvitation;
window._relayFetchResult = relayFetchResult;
window._relayFetchPiece = relayFetchPiece;
window._relayReopen = relayReopen;
window._relayRevoke = relayRevoke;
window._relayPurge = relayPurge;
window._relayPing = relayPing;

// SAUVEGARDE (Chantier 3) — cœur pur exposé en bloc sous window._bk pour le code inline.
window._bk = { FREQ_MS, backupStamp, dueForBackup, collectBackupFiles, buildManifest, crc32, storedZip };

// RESET-CLOUD UX — cœur pur du « Vider mon espace cloud » (voir import en tête).
window._espacePurge = { confirmNameMatches, purgeUiState, purgeErrorMessage };
// RENOMMER UN BIEN — cœur pur exposé pour le code inline (validation + garde-fou + report des 11 rattachements).
window._renameLogement = { validate: validateNewRef, canRename: canRenameLogement, rename: renameLogementRef };
// RENOMMER UN IMMEUBLE — propage le nouveau nom aux logements/mouvements/agenda/documents/regul (scopé
// par espace) : sans ça, renommer un immeuble orpheline ses logements (« Logements isolés »).
window._renameImmeuble = { validate: validateNewImmNom, propagate: renameImmeubleRefs };

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
    '_computeBilanAnnuel', '_formatBilanTexte',
    '_computeFinancesSummary'
  ]
};

console.info('[main.js] Sprint 3C chargé - 40 helpers (utils + idb + components + audit + legal-2044 + rgpd + bilan) exposés à window');
