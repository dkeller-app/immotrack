/**
 * core/quittances-actives.js — Quittances actives v15.10 Sprint 11 V1.1
 *
 * Helpers purs (sans DB / DOM) pour transformer les quittances de passives
 * (génération manuelle, pas de suivi paiement) → actives (statut auto,
 * matching paiement, escalade rappels).
 *
 * Pré-requis : helpers temporels `_loyerHCAtDate` du Sprint 1D (BUG-DASH-001)
 * → les quittances utilisent le loyer applicable à la date du mois facturé
 * (cohérent avec la logique temporelle stricte IRL-REVISION-UX-FIX v15.10).
 *
 * Tests Vitest miroir : __tests__/helpers/quittances-actives.test.js
 */

// ────────────────────────────────────────────────────────────────────────────
// Statut dynamique d'une quittance — 7 états
// ────────────────────────────────────────────────────────────────────────────

const QUITTANCE_STATUS = {
  ATTENDUE:        'attendue',           // mois en cours / futur, pas encore en retard
  PAYEE:           'payée',               // paiement reçu ≥ montant attendu
  PARTIELLE:       'partielle',           // paiement reçu mais < montant attendu
  IMPAYEE_J5:      'impayée_J5',          // J+5 après date d'échéance
  IMPAYEE_J15:     'impayée_J15',         // J+15
  IMPAYEE_J30:     'impayée_J30',         // J+30 → mise en demeure
  MISE_EN_DEMEURE: 'mise_en_demeure'      // mise en demeure envoyée
};

/**
 * Calcule le statut d'une quittance à une date de référence.
 *
 * @param {object} quittance - { mois, logement, hc, ch, dateEcheance?, miseEnDemeureEnvoyee? }
 * @param {Array<object>} mouvements - DB.mouvements (filtré par cat Loyers + qui = ref bail)
 * @param {Date|string} [dateRef=today] - date de référence pour le calcul
 * @returns {{ statut: string, montantAttendu: number, montantPaye: number, joursRetard: number }}
 */
export function _statutQuittance(quittance, mouvements, dateRef) {
  if (!quittance) {
    return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu: 0, montantPaye: 0, joursRetard: 0 };
  }
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const montantAttendu = (Number(quittance.hc)||0) + (Number(quittance.ch)||0);

  // Mouvements de paiement de loyer pour cette ref et ce mois
  const ref = quittance.logement;
  const mois = quittance.mois; // ex "janvier 2026" — format français
  const paiements = (mouvements||[]).filter(m =>
    m && !m._deleted &&
    m.qui === ref &&
    (m.cr||0) > 0 &&
    _matcheMois(m, mois)
  );
  const montantPaye = paiements.reduce((s,m) => s + (Number(m.cr)||0), 0);

  // Cas spécial : mise en demeure déjà envoyée
  if (quittance.miseEnDemeureEnvoyee) {
    return { statut: QUITTANCE_STATUS.MISE_EN_DEMEURE, montantAttendu, montantPaye, joursRetard: 0 };
  }

  if (montantPaye >= montantAttendu && montantAttendu > 0) {
    return { statut: QUITTANCE_STATUS.PAYEE, montantAttendu, montantPaye, joursRetard: 0 };
  }
  if (montantPaye > 0 && montantPaye < montantAttendu) {
    return { statut: QUITTANCE_STATUS.PARTIELLE, montantAttendu, montantPaye, joursRetard: 0 };
  }

  // Pas (encore) payé — calcul du retard
  const dateEch = quittance.dateEcheance ? new Date(quittance.dateEcheance + 'T00:00:00') : _moisToDate(mois);
  if (!dateEch || Number.isNaN(dateEch.getTime())) {
    return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu, montantPaye, joursRetard: 0 };
  }
  const joursRetard = Math.floor((today.getTime() - dateEch.getTime()) / 86400000);
  if (joursRetard < 5) return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu, montantPaye, joursRetard };
  if (joursRetard < 15) return { statut: QUITTANCE_STATUS.IMPAYEE_J5, montantAttendu, montantPaye, joursRetard };
  if (joursRetard < 30) return { statut: QUITTANCE_STATUS.IMPAYEE_J15, montantAttendu, montantPaye, joursRetard };
  return { statut: QUITTANCE_STATUS.IMPAYEE_J30, montantAttendu, montantPaye, joursRetard };
}

const _MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

/** Convertit "janvier 2026" → Date(2026-01-01) pour calcul échéance. */
function _moisToDate(moisStr) {
  if (!moisStr) return null;
  const s = String(moisStr).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  // Cas FR : "janvier 2026"
  for (let i = 0; i < _MOIS_FR.length; i++) {
    const moisNorm = _MOIS_FR[i].normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (s.includes(moisNorm)) {
      const m = s.match(/(\d{4})/);
      if (m) return new Date(`${m[1]}-${String(i+1).padStart(2,'0')}-01T00:00:00`);
    }
  }
  // Cas ISO : "2026-01"
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-01T00:00:00`);
  return null;
}

/** Vérifie si un mouvement est associable à un mois donné (par sa date.startsWith). */
function _matcheMois(mvt, moisStr) {
  if (!mvt || !mvt.date || !moisStr) return false;
  const d = _moisToDate(moisStr);
  if (!d) return false;
  const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  return mvt.date.startsWith(ym);
}

// ────────────────────────────────────────────────────────────────────────────
// Matching automatique paiement → quittance
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cherche la quittance attendue qui correspond à un nouveau mouvement de loyer.
 * Critères : même ref logement + mvt.date dans le mois de la quittance + montant ≈ attendu.
 *
 * @param {object} mvt - { qui, date, cr, cat }
 * @param {Array<object>} quittances - DB.quittances
 * @param {object} [opts] - { toleranceAmount: 5 }
 * @returns {object|null} La quittance matchée ou null
 */
export function _matchPaiementQuittance(mvt, quittances, opts = {}) {
  if (!mvt || !mvt.qui || !mvt.date || !((mvt.cr||0) > 0)) return null;
  const tolerance = opts.toleranceAmount ?? 5;
  // Format YYYY-MM du mouvement
  const ym = mvt.date.slice(0, 7);
  const targets = (quittances||[]).filter(q =>
    q && !q._deleted &&
    q.logement === mvt.qui
  );
  // Cherche d'abord match exact mois
  for (const q of targets) {
    const dQ = _moisToDate(q.mois);
    if (!dQ) continue;
    const qYM = `${dQ.getFullYear()}-${String(dQ.getMonth()+1).padStart(2,'0')}`;
    if (qYM !== ym) continue;
    const attendu = (Number(q.hc)||0) + (Number(q.ch)||0);
    if (attendu > 0 && Math.abs(mvt.cr - attendu) < tolerance) return q;
    // Si même mois mais montant divergent (partiel) → quand même match
    return q;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Workflow escalade — niveau d'alerte
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pour un statut donné, retourne les métadonnées d'alerte (sévérité, action proposée).
 *
 * @param {string} statut - issu de _statutQuittance
 * @returns {{ severity: 'info'|'warn'|'err', label: string, emailType: string|null }}
 */
export function _escaladeAlerte(statut) {
  switch (statut) {
    case QUITTANCE_STATUS.PAYEE:
      return { severity: 'info', label: '✓ Payée', emailType: null };
    case QUITTANCE_STATUS.PARTIELLE:
      return { severity: 'warn', label: '⚠ Paiement partiel', emailType: 'rappel-impaye-1' };
    case QUITTANCE_STATUS.ATTENDUE:
      return { severity: 'info', label: '⏳ Attendue', emailType: 'avis-echeance' };
    case QUITTANCE_STATUS.IMPAYEE_J5:
      return { severity: 'warn', label: '⚠ Impayée J+5', emailType: 'rappel-impaye-1' };
    case QUITTANCE_STATUS.IMPAYEE_J15:
      return { severity: 'warn', label: '⚠ Impayée J+15', emailType: 'rappel-impaye-2' };
    case QUITTANCE_STATUS.IMPAYEE_J30:
      return { severity: 'err',  label: '🚨 Impayée J+30 — Mise en demeure', emailType: 'rappel-impaye-3' };
    case QUITTANCE_STATUS.MISE_EN_DEMEURE:
      return { severity: 'err',  label: '🚨 Mise en demeure envoyée', emailType: null };
    default:
      return { severity: 'info', label: 'Statut inconnu', emailType: null };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Génération auto mensuelle — planificateur idempotent
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liste les baux actifs pour lesquels une quittance du mois courant DOIT être générée
 * (et n'existe pas déjà). Helper pur — la création effective est faite côté UI.
 *
 * @param {Array} logements - DB.logements
 * @param {object} baux - DB.baux
 * @param {Array} quittances - DB.quittances
 * @param {Date|string} [dateRef=today]
 * @returns {Array<{ref, locataire, hc, ch, mois}>}
 */
export function _planQuittancesAGenerer(logements, baux, quittances, dateRef) {
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const moisIdx = today.getMonth();
  const moisLabel = `${_MOIS_FR[moisIdx]} ${today.getFullYear()}`;
  const out = [];
  for (const l of (logements||[])) {
    if (!l || l._deleted || l.archived) continue;
    if (!l.locataire) continue;
    const bail = baux && baux[l.ref];
    if (!bail || bail.cloture) continue;
    // bail actif ce mois ?
    if (bail.debut) {
      const dDebut = new Date(bail.debut + 'T00:00:00');
      if (dDebut > today) continue;
    }
    if (bail.fin) {
      const dFin = new Date(bail.fin + 'T23:59:59');
      if (dFin < today) continue;
    }
    // Quittance déjà existe ?
    const exists = (quittances||[]).some(q => q && !q._deleted && q.logement === l.ref && q.mois === moisLabel);
    if (exists) continue;
    out.push({
      ref: l.ref,
      locataire: l.locataire,
      hc: Number(bail.hc)||Number(l.hc)||0,
      ch: Number(bail.ch)||Number(l.ch)||0,
      mois: moisLabel,
      entity: bail.entity || l.entity || ''
    });
  }
  return out;
}

// Constantes exposées
export { QUITTANCE_STATUS };
