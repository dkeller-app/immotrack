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
// LEGAL-DPE-INTERDICTION-LOCATION — v15.05 Sprint 7 V1.1
// Loi Climat & Résilience 2021-1104, art. 23 + décret 2022-945.
// Calendrier interdictions nouvelle location :
//   - 1er janvier 2023 : G+ (conso > 450 kWh/m²/an) interdits
//   - 1er janvier 2025 : G interdits
//   - 1er janvier 2028 : F interdits
//   - 1er janvier 2034 : E interdits
// Override IMPOSSIBLE (amende 15 000 €). Différent du gel IRL (qui est sur
// baux en cours) : ici on bloque la CRÉATION/RENOUVELLEMENT d'un nouveau bail.
// ────────────────────────────────────────────────────────────────────────────

const DPE_INTERDICTION_CALENDRIER = [
  // Note : 'G+' = G avec conso > 450 kWh/m²/an. Pas systématiquement encodé
  // côté DB ; on traite ici sur la classe seule. La distinction G/G+ peut
  // être ajoutée plus tard via un champ logement.dpeKwh.
  { classe: 'G', anneeBlocage: 2025, dateBlocage: '2025-01-01', loi: 'Loi Climat 2021-1104 art. 23' },
  { classe: 'F', anneeBlocage: 2028, dateBlocage: '2028-01-01', loi: 'Loi Climat 2021-1104 art. 23' },
  { classe: 'E', anneeBlocage: 2034, dateBlocage: '2034-01-01', loi: 'Loi Climat 2021-1104 art. 23' }
];

/**
 * Indique si un logement classé `dpe` est interdit à la location à la date `dateRef`.
 * @param {string} dpe — classe DPE 'A'..'G' (case-insensitive)
 * @param {string|Date} dateRef — date à laquelle on souhaite signer/renouveler le bail (ISO YYYY-MM-DD ou Date)
 * @returns {{ interdit: boolean, raison: string, anneeBlocage: number|null, dateBlocage: string|null, classe: string }}
 *
 * Notes :
 *   - DPE A à D : jamais interdit.
 *   - DPE E à G : interdit à partir de la date de blocage du calendrier (incluse).
 *   - DPE absent ou invalide : retourne `interdit: false` (pas notre rôle d'imposer
 *     un DPE — d'autres garde-fous gèrent l'absence de DPE, ici on parle d'interdiction
 *     stricte loi Climat).
 */
export function _dpeInterditLocationAuDate(dpe, dateRef) {
  const result = { interdit: false, raison: '', anneeBlocage: null, dateBlocage: null, classe: '' };
  if (!dpe) return result;
  const c = String(dpe).toUpperCase().trim();
  if (!_isDpeClassValide(c)) return result;
  result.classe = c;
  const rule = DPE_INTERDICTION_CALENDRIER.find(r => r.classe === c);
  if (!rule) return result; // DPE A-D : jamais interdit
  // Normalise dateRef
  let refTs;
  if (dateRef instanceof Date) {
    refTs = dateRef.getTime();
  } else if (typeof dateRef === 'string' && dateRef.length >= 10) {
    refTs = new Date(dateRef.slice(0, 10) + 'T00:00:00').getTime();
  } else {
    refTs = new Date().getTime();
  }
  if (Number.isNaN(refTs)) return result;
  const blockTs = new Date(rule.dateBlocage + 'T00:00:00').getTime();
  if (refTs >= blockTs) {
    result.interdit = true;
    result.anneeBlocage = rule.anneeBlocage;
    result.dateBlocage = rule.dateBlocage;
    result.raison = `DPE ${c} interdit à la location depuis le ${rule.dateBlocage} (${rule.loi})`;
  }
  return result;
}

/** Expose le calendrier pour UI (lentille Conformité, alertes). */
export function _dpeInterdictionCalendrier() {
  return DPE_INTERDICTION_CALENDRIER.slice(); // copie défensive
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

// ────────────────────────────────────────────────────────────────────────────
// Prorata loyer intra-mois (v15.19 — Phase A1 BUG-PRORATA-DASH)
// Loi 6 juillet 1989 + jurisprudence Cass. 3e civ. : loyer dû au prorata du
// temps d'occupation pour entrée/sortie/transition intra-mois.
//
// AVANT v15.19 : _getActiveBailHcCh testait au 15 du mois et retournait le
// loyer plein si actif. Bug : locataire entré le 10/03 → attendu plein 1000€
// → payé prorata 710€ → marqué "impayé" à tort dans dashboard + quittances.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcule le loyer attendu (HC+CH) pour un logement sur un mois donné, avec
 * prorata jours pour entrées/sorties/transitions de bail intra-mois.
 *
 * Gère naturellement :
 *   - Bail démarrant en cours de mois (entrée mi-mois)
 *   - Bail finissant en cours de mois (sortie mi-mois)
 *   - Transition de 2 baux dans le même mois (somme prorata)
 *   - Bail courant (sans fin OU fin future) : HC via _loyerHCAtDate (révisions IRL)
 *   - Bail historique clôturé : bail.hc figé (pas de révision rétroactive)
 *
 * @param {object} log — logement (au moins {ref, hc})
 * @param {string|number} yr — année (ex: 2026 ou '2026')
 * @param {number} mi — index du mois 0-based (0=jan, 11=dec)
 * @param {Array<{debut, fin, hc, ch}>} bails — TOUS les baux du logement
 * @param {Array} irlHistorique — révisions IRL (peut être [] ou omis)
 * @param {Date} [todayRef] — date "aujourd'hui" pour distinguer bail courant vs historique (test only)
 * @returns {number} montant prorata total HC+CH pour le mois (somme baux qui chevauchent)
 */
export function _loyerProrataMois(log, yr, mi, bails, irlHistorique = [], todayRef = new Date()) {
  if (!log || !Array.isArray(bails) || !bails.length) return 0;
  const y = parseInt(yr);
  const m = parseInt(mi);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 0 || m > 11) return 0;

  // Bornes ISO du mois
  const mm = String(m + 1).padStart(2, '0');
  const firstDayOfMonth = `${y}-${mm}-01`;
  const lastDayNum = new Date(y, m + 1, 0).getDate(); // 28/29/30/31
  const lastDayOfMonth = `${y}-${mm}-${String(lastDayNum).padStart(2, '0')}`;
  const joursDansMois = lastDayNum;

  const todayIso = todayRef.toISOString().slice(0, 10);

  let total = 0;

  for (const bail of bails) {
    if (!bail || !bail.debut) continue;
    const bDebut = String(bail.debut).slice(0, 10);
    const bFin = bail.fin ? String(bail.fin).slice(0, 10) : '9999-12-31';
    // Le bail chevauche-t-il le mois ?
    if (bDebut > lastDayOfMonth) continue;
    if (bFin < firstDayOfMonth) continue;
    // Période effective intersectée avec le mois
    const debutEff = bDebut > firstDayOfMonth ? bDebut : firstDayOfMonth;
    const finEff = bFin < lastDayOfMonth ? bFin : lastDayOfMonth;
    if (debutEff > finEff) continue;
    // Jours d'occupation = (finDay - debutDay) + 1
    const debutDay = parseInt(debutEff.slice(8, 10));
    const finDay = parseInt(finEff.slice(8, 10));
    const joursOcc = (finDay - debutDay) + 1;
    if (joursOcc <= 0) continue;
    // HC à appliquer : bail courant → _loyerHCAtDate (consulte révisions IRL)
    // Bail historique clôturé → bail.hc figé (clos avec son HC final)
    const isCurrent = !bail.fin || bail.fin >= todayIso;
    const hc = isCurrent
      ? _loyerHCAtDate(log, debutEff, irlHistorique)
      : (Number(bail.hc) || 0);
    const ch = Number(bail.ch) || 0;
    const loyerMensuel = hc + ch;
    total += loyerMensuel * (joursOcc / joursDansMois);
  }

  return total;
}
