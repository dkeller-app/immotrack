import { _computeLoyerChargeAlloc, _computeLoyerArrears, _LOYER_TOLERANCE_JOUR } from './loyer-statut.js';

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
 *   - loyerDue(qui, ym) → {hc, ch} (dû proraté du mois, cascade cumulative, cf _finBailHcChAt)
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
  const isEcheance = i.isEcheance || (() => false);
  const isGestionCharge = i.isGestionCharge || (() => false); // CFE / taxe logements vacants : charge proprio HORS 2044
  const isRecupCharge = i.isRecupCharge || (() => false);     // charges récupérables payées en direct (flag recup, ligne 2044 vide) : transit locataire
  // CASCADE d'imputation CUMULATIVE (décision user 2026-07-09 : « effacer les dettes avant
  // l'avance »). On collecte l'encaissé par (lot, mois) puis on impute chronologiquement PAR LOT
  // (loyer → charges → arriérés → avance) via _computeLoyerChargeAlloc. Injecté :
  // loyerDue(qui, ym) → {hc, ch} = dû proraté du mois (cf _finBailHcChAt). Fallback = pas de dû.
  const loyerDue = i.loyerDue || (() => ({ hc: 0, ch: 0 }));
  // Lots à bail actif dans la période (injecté) : inclus au RETARD même sans aucun mouvement —
  // un locataire qui ne paie RIEN de l'année est le pire retard, il ne doit pas être invisible
  // (règle « dès qu'au moins un locataire en retard », décision user 2026-07-12). N'invente
  // aucune recette : sans encaissement, sa cascade est 0/0/0, seul son arriéré compte.
  const activeLots = Array.isArray(i.activeLots) ? i.activeLots : [];

  // Borne « mois écoulés » pour l'exercice en cours (B3/B5) : on ne projette pas l'avenir.
  // `lastMonth` peut être forcé (ex. comparer le N-1 sur la MÊME période que l'exercice en cours).
  const today = i.today || new Date().toISOString().slice(0, 10);
  const curYear = today.slice(0, 4);
  const lastMonth = (i.lastMonth != null)
    ? Math.max(1, Math.min(12, i.lastMonth))
    : ((yr === curYear) ? parseInt(today.slice(5, 7), 10) : 12);
  // Tolérance début de mois (parité Suivi des loyers, constat 45) : tant qu'on est avant le 10 ET
  // que le dernier mois affiché EST le mois courant, son loyer non encore payé n'est pas un « retard ».
  const graceLast = (yr === curYear) && (lastMonth === parseInt(today.slice(5, 7), 10)) && (parseInt(today.slice(8, 10), 10) < _LOYER_TOLERANCE_JOUR);

  const blank = () => ({
    loyersBrut: 0, loyersHC: 0, provisions: 0, avance: 0, recettesDiverses: 0,
    loyerRetard: 0, chargeRetard: 0,   // arriérés (retard orange) — running au mois, fin de période à l'année
    pret: 0, taxe: 0, travaux: 0, honoraires: 0, assurance: 0, autres: 0, gestionHF: 0, recup: 0, interets: 0,
    charges: 0, reel: 0, recupSolde: 0, cashflowNet: 0, cashflowReel: 0, base2044: 0,
    _loyerByLot: null   // { qui → total encaissé du mois } — cascadé au finalize (non exporté)
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
    // CFE / taxe logements vacants (flag gestionCharge, cat special) : charge propriétaire RÉELLE
    // mais HORS base 2044. Captée avant catLigne (qui renverrait null pour une cat special).
    if (isGestionCharge(mv)) { b.gestionHF += (db - cr) * w; return; }
    // Charges récupérables payées en direct (eau/énergie, flag recup, ligne 2044 vide) :
    // transit locataire, captées AVANT catLigne (qui renverrait null). Voir aussi 229/230 (copro).
    if (isRecupCharge(mv)) { b.recup += (db - cr) * w; return; }

    const r = catLigne(mv.cat);
    if (!r || !r.ligne2044) return;         // non mappée / special → hors résultat

    const l = r.ligne2044;
    if (l === '211') {                      // loyers (HC + provisions de charges) — cascadé par (lot, mois) au finalize
      const amt = (cr - db) * w;
      b.loyersBrut += amt;
      const q = mv.qui || '';
      if (!b._loyerByLot) b._loyerByLot = {};
      b._loyerByLot[q] = (b._loyerByLot[q] || 0) + amt;
      return;
    }
    if (l === '213') { b.recettesDiverses += (cr - db) * w; return; } // recettes diverses/GLI : imposables (parité _compute2044)
    const v = (db - cr) * w;                // net (remboursements partiels)
    if (l === '250') b.interets += v;
    else if (l === '227') b.taxe += v;
    else if (l === '224' || l === '224bis') b.travaux += v;
    else if (l === '221') b.honoraires += v;
    else if (l === '223') b.assurance += v;
    else if (l === '229' || l === '230') b.recup += v; // charges récupérables payées par le bailleur (transit locataire)
    else if (l === '226' || l === '225') b.autres += v;
  });

  const round2 = n => Math.round(n * 100) / 100;
  // (1) Cascade d'imputation CUMULATIVE par LOT sur toute la période : chaque mois comble son
  //     loyer+charges, récupère les arriérés (loyer d'abord), reliquat = avance. Les résultats
  //     mensuels somment exactement à l'annuel (le mois qui reçoit porte la récup + l'avance).
  const allLots = new Set();
  order.forEach(ym => { const lots = buckets[ym]._loyerByLot; if (lots) for (const q in lots) allLots.add(q); });
  activeLots.forEach(q => allLots.add(q));   // + lots à bail actif sans mouvement (retard « zéro paiement »)
  allLots.forEach(q => {
    const lotMonths = order.map(ym => {
      const d = loyerDue(q, ym) || {};
      return { hcDue: Number(d.hc) || 0, chDue: Number(d.ch) || 0, received: (buckets[ym]._loyerByLot && buckets[ym]._loyerByLot[q]) || 0 };
    });
    _computeLoyerChargeAlloc(lotMonths).forEach((a, idx) => {
      const b = buckets[order[idx]];
      b.loyersHC += a.loyersHC; b.provisions += a.provisions; b.avance += a.avance;
    });
    // Retard orange : arriérés courants (running) du lot, cumulés au mois. L'annuel prend la
    // FIN de période (ci-dessous), pas la somme des mois (un arriéré ne s'additionne pas).
    _computeLoyerArrears(lotMonths, graceLast).months.forEach((am, idx) => {
      const b = buckets[order[idx]];
      b.loyerRetard += am.loyerArrear; b.chargeRetard += am.chargeArrear;
    });
  });
  // (2) Champs dérivés (loyersHC/provisions/avance déjà posés : par cascade au mois, par somme à l'année).
  const finalizeDerived = b => {
    b.charges = b.pret + b.taxe + b.travaux + b.honoraires + b.assurance + b.autres + b.gestionHF;   // charges propriétaire : prêt entier + CFE/TLV
    b.reel = b.loyersHC + b.recettesDiverses - b.charges;             // résultat propre (loyers HC + recettes diverses 213 − charges)
    b.recupSolde = b.provisions - b.recup;                            // transit locataire : + trop-perçu / − bailleur a avancé
    b.cashflowNet = b.reel;                                           // ton résultat propre (hors transit locataire)
    b.cashflowReel = b.reel + b.recupSolde;                           // vrai cash sur le compte (transit inclus)
    b.base2044 = b.loyersHC + b.recettesDiverses - (b.interets + b.taxe + b.travaux + b.honoraires + b.assurance + b.autres); // 213 imposable ; capital ET gestionHF exclus
    ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'recettesDiverses', 'loyerRetard', 'chargeRetard', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'gestionHF', 'recup', 'interets', 'charges', 'reel', 'recupSolde', 'cashflowNet', 'cashflowReel', 'base2044']
      .forEach(k => { b[k] = round2(b[k]); });
    return b;
  };

  const months = order.map(ym => finalizeDerived(buckets[ym]));   // loyersHC/provisions/avance déjà posés par la cascade cumulative

  // Agrégat annuel (Σ des mois — loyersHC/provisions/avance inclus, PAS de re-cascade)
  const annual = Object.assign({ ym: yr, mo: 0 }, blank());
  months.forEach(b => {
    ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'recettesDiverses', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'gestionHF', 'recup', 'interets']
      .forEach(k => { annual[k] += b[k]; });
  });
  finalizeDerived(annual);
  // Retard annuel = FIN de période (dernier mois échu = dette encore ouverte), jamais la Σ des mois.
  const lastB = months.length ? months[months.length - 1] : null;
  annual.loyerRetard = lastB ? lastB.loyerRetard : 0;
  annual.chargeRetard = lastB ? lastB.chargeRetard : 0;

  const interetsTotal = annual.interets;
  return { months, annual, interetsTotal, interetsKnown: interetsTotal > 0 };
}
