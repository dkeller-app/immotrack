/**
 * core/finances-monthly.js — Sous-P&L mensuel (B4).
 *
 * Éclate le compte de résultat de l'onglet Finances mois par mois, sur le modèle
 * « prêt entier en charge » validé 2026-06-25 :
 *   - ligne « Prêt » = ÉCHÉANCE entière (mouvement cat « Prêt » = capital + intérêts).
 *   - Résultat réel après prêt = loyers HC − (prêt entier + autres charges propriétaire).
 *   - Base imposable 2044 = loyers HC − (INTÉRÊTS ligne 250 + autres charges) — le capital
 *     n'entre JAMAIS dans la base fiscale ; verrouillée tant qu'aucun intérêt n'est saisi.
 *   - Les deux vues ne s'additionnent jamais (réel = échéance, 2044 = intérêts).
 *
 * Pure / testable : reçoit les résolveurs de l'app par injection (DRY, pas de recopie).
 *   - scopeWeight(scope, m) → 0..1 (périmètre entité/immeuble + poids SCI, cf _finScopeWeight)
 *   - catLigne(cat) → {ligne2044, type} | null (cf _finCatLigne)
 *   - hcRatio(qui) → 0..1 (part HC du loyer 211, cf _finLoyersHC)
 *   - isEcheance(m) → bool (mouvement = échéance de prêt, en prod : m.cat === 'Prêt')
 *
 * @param {Object} input
 * @returns {{months: Array, annual: Object, interetsTotal: number, interetsKnown: boolean}}
 */
export function _computeFinancesMonthly(input) {
  const i = input || {};
  const yr = String(i.year);
  const mvts = Array.isArray(i.mouvements) ? i.mouvements : [];
  const scope = i.scope;
  const scopeWeight = i.scopeWeight || (() => 1);
  const catLigne = i.catLigne || (() => null);
  const hcRatio = i.hcRatio || (() => 1);
  const isEcheance = i.isEcheance || (() => false);

  // Borne « mois écoulés » pour l'exercice en cours (B3/B5) : on ne projette pas l'avenir.
  const today = i.today || new Date().toISOString().slice(0, 10);
  const curYear = today.slice(0, 4);
  const lastMonth = (yr === curYear) ? parseInt(today.slice(5, 7), 10) : 12;

  const blank = () => ({
    loyersBrut: 0, loyersHC: 0, provisions: 0,
    pret: 0, taxe: 0, travaux: 0, honoraires: 0, assurance: 0, autres: 0, interets: 0,
    charges: 0, reel: 0, base2044: 0
  });

  const buckets = {};            // ym → agrégat
  const order = [];
  for (let m = 1; m <= lastMonth; m++) {
    const ym = yr + '-' + String(m).padStart(2, '0');
    buckets[ym] = Object.assign({ ym, mo: m }, blank());
    order.push(ym);
  }

  mvts.forEach(mv => {
    if (!mv || mv._deleted || !mv.date || mv.date.slice(0, 4) !== yr) return;
    const ym = mv.date.slice(0, 7);
    const b = buckets[ym];
    if (!b) return;                         // mois hors période écoulée
    const w = scopeWeight(scope, mv);
    if (!w) return;                         // hors périmètre

    const cr = Number(mv.cr) || 0, db = Number(mv.db) || 0;

    // Échéance de prêt (cat « Prêt ») = mensualité entière → ligne « Prêt » (jamais via catLigne).
    if (isEcheance(mv)) { b.pret += (db - cr) * w; return; }

    const r = catLigne(mv.cat);
    if (!r || !r.ligne2044) return;         // non mappée / special → hors résultat

    const l = r.ligne2044;
    if (l === '211') {                      // loyers (HC + provisions de charges)
      const amt = (cr - db) * w;
      b.loyersBrut += amt;
      b.loyersHC += amt * hcRatio(mv.qui);
      return;
    }
    if (l === '213') return;                // recettes diverses : hors loyers HC, neutres ici
    const v = (db - cr) * w;                // net (remboursements partiels)
    if (l === '250') b.interets += v;
    else if (l === '227') b.taxe += v;
    else if (l === '224' || l === '224bis') b.travaux += v;
    else if (l === '221') b.honoraires += v;
    else if (l === '223') b.assurance += v;
    else if (l === '229' || l === '230') { /* récupérables copro — exclu propriétaire */ }
    else if (l === '226' || l === '225') b.autres += v;
  });

  const round2 = n => Math.round(n * 100) / 100;
  const finalize = b => {
    b.provisions = Math.max(0, b.loyersBrut - b.loyersHC);
    b.charges = b.pret + b.taxe + b.travaux + b.honoraires + b.assurance + b.autres;   // réel : échéance entière
    b.reel = b.loyersHC - b.charges;
    b.base2044 = b.loyersHC - (b.interets + b.taxe + b.travaux + b.honoraires + b.assurance + b.autres); // capital exclu
    ['loyersBrut', 'loyersHC', 'provisions', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'interets', 'charges', 'reel', 'base2044']
      .forEach(k => { b[k] = round2(b[k]); });
    return b;
  };

  const months = order.map(ym => finalize(buckets[ym]));

  // Agrégat annuel (Σ des mois)
  const annual = Object.assign({ ym: yr, mo: 0 }, blank());
  months.forEach(b => {
    ['loyersBrut', 'loyersHC', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'interets']
      .forEach(k => { annual[k] += b[k]; });
  });
  finalize(annual);

  const interetsTotal = annual.interets;
  return { months, annual, interetsTotal, interetsKnown: interetsTotal > 0 };
}
