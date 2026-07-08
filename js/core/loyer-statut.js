/**
 * core/loyer-statut.js — SUIVI-LOYERS-SOURCE-UNIQUE Phase A.
 *
 * LE moteur unique du statut de paiement d'un locataire (décision user 2026-07-08,
 * cf docs/subjects/SUIVI-LOYERS-SOURCE-UNIQUE.md + audit AUDIT-FINANCES-COHERENCE
 * constats 4-9 / 40-45 : 6 formules différentes répondaient à « ce locataire
 * est-il à jour ? », 5 surfaces sur 11 donnaient un verdict faux sur le scénario
 * « 2 mois payés en janvier, rien en février »).
 *
 * Algorithme (porté tel quel de _suiviLoyerStrip, H1 v15.408) : le total encaissé
 * de l'année est alloué CHRONOLOGIQUEMENT sur les mois dus (le plus ancien
 * d'abord) — un paiement n'est pas rattaché au mois calendaire de sa date, il
 * comble d'abord le plus vieux mois non couvert. Le report (trop-payé un mois,
 * régularisé un autre) est donc géré par construction.
 *
 * Pure / testable : aucune lecture de DB — les résolveurs sont injectés.
 *   - dueOfMonth(mi0) → € dû du mois (index 0-11) ; en prod :
 *     _getActiveBailHcChProrated (bail actif du mois + prorata entrée/sortie).
 *   - totalPaid = Σ des loyers encaissés de l'année pour le lot (cat 211, crédits).
 *
 * Statuts d'un mois : 'ok' (payé) · 'warn' (partiel) · 'imp' (impayé) pour les
 * mois échus ; 'avance' (futur pré-payé) · 'avenir' pour les mois futurs ;
 * 'vac' si aucun dû (pas de bail actif).
 *
 * @param {Object} input { year, today (ISO), monthlyFull, totalPaid, dueOfMonth }
 * @returns {{months: Array<{mi,cls,recu,attendu,due}>, solde, recu, attendu, curMo, monthlyFull}}
 */
export function _computeLoyerStatut(input) {
  const i = input || {};
  const y = parseInt(i.year, 10);
  const today = String(i.today || _loyerTodayLocal());
  const cy = parseInt(today.slice(0, 4), 10);
  const curMo = (y < cy) ? 12 : (y > cy ? 0 : parseInt(today.slice(5, 7), 10)); // dernier mois échu
  const monthlyFull = Number(i.monthlyFull) || 0;
  const totalPaid = Number(i.totalPaid) || 0;
  const dueOfMonth = (typeof i.dueOfMonth === 'function') ? i.dueOfMonth : (() => monthlyFull);
  const round2 = (n) => Math.round(n * 100) / 100;

  const months = [];
  let attenduEcoule = 0, pool = totalPaid;
  for (let mi = 1; mi <= 12; mi++) {
    const ecoule = mi <= curMo;
    // Dû du mois : proraté (résolveur injecté) pour les mois échus ; plein loyer en
    // référence pour le futur (permet de détecter l'avance).
    const due = ecoule ? (Number(dueOfMonth(mi - 1)) || 0) : monthlyFull;
    if (ecoule) attenduEcoule += due;
    let cls, recu = 0;
    if (due <= 0.5) { cls = 'vac'; }                       // pas de bail actif ce mois
    else {
      const filled = Math.min(pool, due); pool -= filled; recu = round2(filled);
      const r = filled / due;
      if (ecoule) cls = (r >= 0.99) ? 'ok' : (r > 0.01 ? 'warn' : 'imp');  // payé / partiel / retard
      else cls = (r >= 0.99) ? 'avance' : 'avenir';                        // futur pré-payé / à venir
    }
    months.push({ mi, cls, recu, attendu: ecoule ? round2(due) : 0, due: round2(due) });
  }
  const solde = round2(totalPaid - attenduEcoule);          // + = avance, − = retard
  return { months, solde, recu: round2(totalPaid), attendu: round2(attenduEcoule), curMo, monthlyFull, year: y };
}

/**
 * Solde AJUSTÉ par la règle de tolérance début de mois : tant qu'elle est active,
 * le dû du mois COURANT est neutralisé (pas encore exigible à l'affichage) — mais les
 * arriérés des mois précédents restent visibles (contrairement à l'ancien
 * _computeImpayes qui masquait TOUT avant le 10 — audit constat 45).
 */
export function _loyerSoldeAjuste(statut, todayISO) {
  const s = statut || {};
  const today = String(todayISO || _loyerTodayLocal());
  if (!_loyerToleranceActive(today)) return s.solde || 0;
  if (parseInt(today.slice(0, 4), 10) !== s.year || !s.curMo) return s.solde || 0;
  const cur = (s.months || [])[s.curMo - 1];
  return Math.round(((s.solde || 0) + ((cur && cur.attendu) || 0)) * 100) / 100;
}

/**
 * Date du jour en ISO LOCAL (pas toISOString/UTC : l'ancien code inline utilisait
 * getMonth() local — entre minuit et ~2 h un 1er du mois, l'UTC retarderait curMo
 * d'un mois, voire d'un an au 1er janvier. Audit Phase A, point mineur).
 */
export function _loyerTodayLocal(d) {
  const n = d instanceof Date ? d : new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

/**
 * La pastille unique (mêmes seuils que la modale Suivi des loyers) :
 * ±20 € de bruit toléré ; nMois = équivalent en mois arrondi à 0,1.
 * @returns {{cls:'retard'|'avance'|'ajour', montant:number, nMois:number}}
 */
export function _loyerChipVerdict(solde, monthlyFull) {
  const s = Number(solde) || 0;
  const mf = Number(monthlyFull) || 0;
  const montant = Math.round(Math.abs(s) * 100) / 100;
  const nMois = mf > 0 ? Math.round(montant / mf * 10) / 10 : 0;
  if (s <= -20) return { cls: 'retard', montant, nMois };
  if (s >= 20) return { cls: 'avance', montant, nMois };
  return { cls: 'ajour', montant, nMois };
}

/**
 * LA règle de tolérance début de mois, partagée par toutes les surfaces
 * (réf. _computeImpayes jour < 10 — seule règle conservée ; fin du
 * « 0 impayé sur l'Accueil, 14 sur Finances » — audit constat 45).
 * Tant qu'elle est active, le loyer du mois COURANT pas encore encaissé
 * ne doit pas être présenté comme un retard.
 */
export const _LOYER_TOLERANCE_JOUR = 10;
export function _loyerToleranceActive(todayISO) {
  const d = parseInt(String(todayISO || '').slice(8, 10), 10);
  return Number.isFinite(d) ? d < _LOYER_TOLERANCE_JOUR : false;
}
