/**
 * core/utils.js — Helpers utilitaires purs (sans dépendance DB / DOM).
 *
 * Source unique de vérité pour les helpers d'échappement HTML, validation,
 * classification de catégories, etc.
 *
 * Importé par les tests Vitest et par js/main.js (qui expose à window pour
 * compatibilité avec les onclick inline encore présents dans index-test.html).
 */

// ────────────────────────────────────────────────────────────────────────────
// Sanitize / échappement HTML (Sprint 1A SECU-INNERHTML)
// ────────────────────────────────────────────────────────────────────────────

/** Échappe une string pour injection HTML safe. null/undefined → ''. */
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Alias court */
export const _esc = escHtml;

/** Tag function template literal qui escape automatiquement chaque ${...}.
 *  Pour injecter du HTML brut (composition), wrapper _raw(s). */
export function _h(strings, ...values) {
  let r = '';
  for (let i = 0; i < strings.length; i++) {
    r += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === 'object' && v.__raw === true) r += v.value;
      else r += escHtml(v);
    }
  }
  return r;
}

/** Marqueur "trusted HTML" pour bypass volontaire dans _h. */
export function _raw(s) { return { __raw: true, value: String(s == null ? '' : s) }; }

// ────────────────────────────────────────────────────────────────────────────
// Validation montants (Sprint 1B BUG-HC-GARDE-FOU)
// ────────────────────────────────────────────────────────────────────────────

export function _validateHC(value) {
  const n = Number(value);
  if (Number.isNaN(n) || value === '' || value == null) {
    return { valid: false, value: 0, reason: 'Montant non numérique' };
  }
  if (n < 1) return { valid: false, value: n, reason: 'Montant nul ou négatif' };
  if (n > 50000) return { valid: false, value: n, reason: 'Montant excessif (> 50 000 €/mois)' };
  return { valid: true, value: n };
}

export function _validateHCCH(hc, ch) {
  const hcN = Number(hc) || 0;
  const chN = Number(ch) || 0;
  if (hcN <= 0) return { coherent: false, ratio: 0, reason: 'HC manquant ou nul' };
  if (chN < 0) return { coherent: false, ratio: 0, reason: 'CH négatif' };
  const ratio = chN / hcN;
  if (ratio > 1) return { coherent: false, ratio, reason: 'Charges > loyer principal (anormal)' };
  if (ratio > 0.5) return { coherent: false, ratio, reason: 'Charges > 50% du loyer (à vérifier)' };
  return { coherent: true, ratio };
}

export function _outlierVsMedian(value, median, threshold = 10) {
  const v = Number(value) || 0;
  const m = Number(median) || 0;
  if (m <= 0 || v <= 0) return { outlier: false, ratio: 0 };
  const ratio = v / m;
  if (ratio >= threshold || ratio <= 1 / threshold) return { outlier: true, ratio };
  return { outlier: false, ratio };
}

// ────────────────────────────────────────────────────────────────────────────
// DPE / gel IRL loi Climat 2021 (Sprint 1B)
// ────────────────────────────────────────────────────────────────────────────

const DPE_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function _isDpeClassValide(classe) {
  return DPE_CLASSES.includes(String(classe || '').toUpperCase());
}

export function _bailGelDpeFG(bail) {
  if (!bail) return false;
  const c = String(bail.dpe || '').toUpperCase();
  return c === 'F' || c === 'G';
}

export function _dpeExpire(dpeDateIso, refDate = new Date()) {
  if (!dpeDateIso) return false;
  const dpeDate = new Date(dpeDateIso);
  if (Number.isNaN(dpeDate.getTime())) return false;
  const tenYearsLater = new Date(dpeDate);
  tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
  return refDate >= tenYearsLater;
}

export function _estRevisableIRL(bail) {
  if (!bail) return { revisable: false, blocking: true, raison: 'Bail non fourni' };
  const c = String(bail.dpe || '').toUpperCase();
  if (!c) return { revisable: false, blocking: true, raison: 'DPE non renseigné' };
  if (!_isDpeClassValide(c)) return { revisable: false, blocking: true, raison: 'DPE invalide' };
  if (c === 'F' || c === 'G') {
    return { revisable: false, blocking: true, raison: `Loyer gelé DPE ${c} (loi Climat 2021 art 23, 24/08/2022)` };
  }
  if (_dpeExpire(bail.dpeDate)) {
    return { revisable: true, blocking: false, raison: 'DPE expiré (> 10 ans) — révision autorisée mais à renouveler' };
  }
  return { revisable: true, blocking: false, raison: '' };
}

// ────────────────────────────────────────────────────────────────────────────
// Classification catégories (Sprint 1C BUG-CHARGE-001)
// ────────────────────────────────────────────────────────────────────────────

/** Référentiel par défaut utilisé par les tests. En prod, on lui passe le STD_CATEGORIES global. */
const STD_CATEGORIES_DEFAULT = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Arriérés de loyers', ligne2044: '211', type: 'recette' },
  { nom: 'Provisions pour charges de copropriété', ligne2044: '229', type: 'charge' },
  { nom: 'Charges récupérables non récupérées', ligne2044: '225', type: 'charge' },
  { nom: 'Régularisation provisions copro N-1', ligne2044: '230', type: 'charge' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Primes d\'assurance PNO', ligne2044: '223', type: 'charge' }
];

function _findStd(stdCats, nom) {
  return (stdCats || STD_CATEGORIES_DEFAULT).find(c => c.nom === nom);
}

/** True si cette catégorie compte comme "loyer encaissé" pour la régul. */
export function _isLoyerCategory(cat, stdCats = STD_CATEGORIES_DEFAULT) {
  if (!cat) return false;
  if (cat === 'Loyers') return true;
  const std = _findStd(stdCats, cat);
  if (std && std.type === 'recette' && std.ligne2044 === '211') return true;
  return false;
}

/** True si cette catégorie compte comme "charge récupérable" refacturable. */
export function _isChargeRecupCategory(cat, stdCats = STD_CATEGORIES_DEFAULT) {
  if (!cat) return false;
  if (cat === 'Charges') return true;
  const std = _findStd(stdCats, cat);
  if (std && (std.ligne2044 === '229' || std.ligne2044 === '230')) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers temporels (Sprint 1D BUG-DASH-001)
// ────────────────────────────────────────────────────────────────────────────

/** True si bail.debut <= dateRef <= bail.fin (ou pas de fin = ouvert). */
export function _bailEstActifAt(log, dateRef) {
  if (!log || !log.debut) return false;
  const refStr = String(dateRef);
  const refTs = new Date(refStr + (refStr.length === 10 ? 'T00:00:00' : '')).getTime();
  const debutTs = new Date(log.debut + 'T00:00:00').getTime();
  if (Number.isNaN(refTs) || Number.isNaN(debutTs)) return false;
  if (debutTs > refTs) return false;
  if (!log.fin) return true;
  const finTs = new Date(log.fin + 'T23:59:59').getTime();
  return finTs >= refTs;
}

/** Loyer HC en vigueur à la date donnée, en consultant irlHistorique[].
 *  En prod : passer DB.irlHistorique. En tests : passer un array dédié. */
export function _loyerHCAtDate(log, dateRef, irlHistorique = []) {
  if (!log) return 0;
  const refStr = String(dateRef);
  const refTs = new Date(refStr + (refStr.length === 10 ? 'T00:00:00' : '')).getTime();
  if (Number.isNaN(refTs)) return Number(log.hc) || 0;
  const hist = (irlHistorique || [])
    .filter(h => h && !h._deleted && h.ref === log.ref && h.action !== 'renonciation' && h.dateRevision);
  if (!hist.length) return Number(log.hc) || 0;
  const sorted = hist.slice().sort((a, b) => a.dateRevision.localeCompare(b.dateRevision));
  if (refTs < new Date(sorted[0].dateRevision + 'T00:00:00').getTime()) {
    return Number(sorted[0].ancienHC) || Number(log.hc) || 0;
  }
  let applicable = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (new Date(sorted[i].dateRevision + 'T00:00:00').getTime() <= refTs) {
      applicable = sorted[i];
      break;
    }
  }
  return applicable ? (Number(applicable.nouveauHC) || Number(log.hc) || 0) : (Number(log.hc) || 0);
}

/** Charges en vigueur à la date donnée. Stub : pas d'historique CH dans schéma actuel. */
export function _chargesAtDate(log /*, dateRef, chHistorique */) {
  if (!log) return 0;
  return Number(log.ch) || 0;
}
