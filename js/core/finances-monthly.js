import { _computeLoyerChargeAlloc, _LOYER_TOLERANCE_JOUR, _loyerTodayLocal } from './loyer-statut.js';
// AUDIT-SUIVI-LOYERS étape 4 — le RETARD affiché passe au netting avance↔retard (une avance
// couvre les mois suivants avant de laisser naître un retard) : fin des « retard ET avance
// simultanés » (C2, scénario user « 2 loyers payés en janvier, rien en février »).
import { _computeLoyerNetting } from './loyer-du-mois.js';

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
 * @param {Object} [input.window] fenêtre de finances-window.js — LA forme à utiliser :
 *        `lastMonth` (constat) borne les mois produits, `dueMonth` (exigibilité) borne le retard.
 * @returns {{months: Array, annual: Object, interetsTotal: number, interetsKnown: boolean,
 *            lastMonth: number, dueMonth: number}}
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
  // L-5 : une charge récupérable AVANCÉE n'est « récupérable » que si un locataire peut la
  // rembourser — mois de vacance / lot sans bail / lot non récupérable → elle RESTE À CHARGE
  // et bascule dans « Autres charges propriétaire » (ligne 225). Injecté par l'app ; défaut =
  // tout récupérable (parité historique).
  const isRecupACharge = i.isRecupACharge || (() => false);
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

  // ── LE CONTRAT : le moteur reçoit une FENÊTRE, pas un entier (audit A1) ───────────────
  // Les deux bornes de F-1 / F-1 v2 ne sont PAS la même (finances-window.js) :
  //   `lastMonth` = fenêtre de CONSTAT     → jusqu'où on produit des mois (post-datés compris) ;
  //   `dueMonth`  = fenêtre d'EXIGIBILITÉ  → jusqu'où un dû peut être EN RETARD.
  // Les confondre était le piège de la décision « B » : passer la borne de constat (octobre)
  // faisait sauter la tolérance de début de mois et fabriquait un retard fantôme sur le mois
  // courant (~800 €/lot). `i.window` est la forme À UTILISER ; `i.lastMonth` reste accepté
  // pour les appelants historiques (les deux bornes valent alors le même mois).
  const win = i.window || null;
  // Horloge LOCALE, jamais toISOString()/UTC : le 1er du mois avant ~2 h, l'UTC recule d'un
  // mois (et d'un an au 1er janvier). Même résolveur que le suivi des loyers (audit I6).
  const today = i.today || (win && win.today) || _loyerTodayLocal();
  const curYear = today.slice(0, 4);
  const _clamp = (v) => Math.max(0, Math.min(12, v | 0));
  let lastMonth, dueMonth;
  if (win) {
    // A2 : une fenêtre VIDE produit ZÉRO mois. Elle ne doit plus être promue en janvier
    // fantôme — c'est un exercice où rien n'est encore exigible, pas un mois de janvier.
    lastMonth = _clamp(win.lastMonth);
    dueMonth = _clamp(win.dueMonth != null ? win.dueMonth : win.lastMonth);
  } else if (i.lastMonth != null) {
    lastMonth = _clamp(i.lastMonth);
    dueMonth = lastMonth;
  } else {
    lastMonth = (yr === curYear) ? parseInt(today.slice(5, 7), 10) : 12;
    dueMonth = lastMonth;
  }
  if (dueMonth > lastMonth) dueMonth = lastMonth;
  // Tolérance début de mois (parité Suivi des loyers, constat 45) : tant qu'on est avant le 10
  // ET que le dernier mois EXIGIBLE est le mois courant, son loyer non payé n'est pas un
  // « retard ». Elle suit `dueMonth`, jamais la borne de constat.
  const graceLast = dueMonth > 0 && (yr === curYear) && (dueMonth === parseInt(today.slice(5, 7), 10)) && (parseInt(today.slice(8, 10), 10) < _LOYER_TOLERANCE_JOUR);

  const blank = () => ({
    loyersBrut: 0, loyersHC: 0, provisions: 0, avance: 0, recettesDiverses: 0,
    loyerRetard: 0, chargeRetard: 0,   // arriérés (retard orange) — running au mois, fin de période à l'année
    duHC: 0, duCH: 0,                  // R-2 : dû du mois (barème historisé, Σ lots) — dénominateur du recouvrement
    rattrapage: 0,                     // part du reçu qui a servi des arriérés de mois ANTÉRIEURS (sous-ligne grise)
    nonAffecte: 0,                     // H-2 : encaissements de loyer SANS lot rattaché (comptés au total, détail faux)
    recupACharge: 0,                   // L-5 : charges récupérables restées à ta charge (sous-ensemble de `autres`)
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

  let intHorsFenetre = 0;                   // H-7 : intérêts datés HORS fenêtre (souvent 31/12) — donnée annuelle
  mvts.forEach(mv => {
    if (!mv || mv._deleted || !mv.date || mv.date.slice(0, 4) !== yr) return;
    const ym = mv.date.slice(0, 7);
    const b = buckets[ym];
    if (!b) {                               // mois hors fenêtre de constat
      // H-7 : les intérêts d'emprunt (250) sont une donnée ANNUELLE, pas un flux — datés 31/12
      // ils restaient invisibles toute l'année (constat 26). On les capte pour les répartir.
      const r0 = catLigne(mv.cat);
      if (r0 && r0.ligne2044 === '250') {
        const w0 = scopeWeight(scope, mv);
        if (w0) intHorsFenetre += ((Number(mv.db) || 0) - (Number(mv.cr) || 0)) * w0;
      }
      return;
    }
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
    if (isRecupCharge(mv)) {
      const v = (db - cr) * w;
      // L-5 : « resté à ta charge » sort du transit locataire et devient une charge propriétaire
      // (ligne 225) — le cash-flow réel ne bouge pas d'un centime (déplacement, pas ajout).
      if (isRecupACharge(mv)) { b.recupACharge += v; b.autres += v; } else { b.recup += v; }
      return;
    }

    const r = catLigne(mv.cat);
    if (!r || !r.ligne2044) return;         // non mappée / special → hors résultat

    const l = r.ligne2044;
    if (l === '211') {                      // loyers (HC + provisions de charges) — cascadé par (lot, mois) au finalize
      const amt = (cr - db) * w;
      b.loyersBrut += amt;
      const q = mv.qui || '';
      if (!q) b.nonAffecte += amt;      // H-2 : total juste, détail faux — rendu VISIBLE (sous-ligne)
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
    else if (l === '229' || l === '230') { if (isRecupACharge(mv)) { b.recupACharge += v; b.autres += v; } else { b.recup += v; } } // charges récupérables payées par le bailleur (transit locataire, sauf part restée à charge L-5)
    else if (l === '226' || l === '225') b.autres += v;
  });

  // H-7 : les intérêts d'emprunt sont une DONNÉE ANNUELLE, pas un flux de compte (souvent datés
  // 31/12 → hors fenêtre toute l'année, constat 26). Ils sont RÉPARTIS au prorata des échéances
  // de prêt payées ; sans échéance connue, ils restent datés (repli à l'identique).
  {
    let totInt = intHorsFenetre, totPret = 0;
    order.forEach(ym => { totInt += buckets[ym].interets; totPret += buckets[ym].pret; });
    if (totInt !== 0 && totPret > 0) {
      order.forEach(ym => { const b = buckets[ym]; b.interets = totInt * (b.pret / totPret); });
    } else if (intHorsFenetre !== 0 && order.length) {
      // Aucune échéance connue : pas de prorata possible — on rattache au dernier mois produit
      // plutôt que de PERDRE la donnée (l'annuel = Σ des mois).
      buckets[order[order.length - 1]].interets += intHorsFenetre;
    }
  }

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
    // R-2 : le dû CC du mois (barème historisé) est RENDU — c'est le dénominateur unique du
    // recouvrement (remplace `attenduHCTheo`, la 2ᵉ définition du dû qui écrasait l'historique).
    lotMonths.forEach((lm, idx) => { const b = buckets[order[idx]]; b.duHC += lm.hcDue; b.duCH += lm.chDue; });
    _computeLoyerChargeAlloc(lotMonths).forEach((a, idx) => {
      const b = buckets[order[idx]];
      b.loyersHC += a.loyersHC; b.provisions += a.provisions; b.avance += a.avance;
      b.rattrapage += a.rattrapage || 0;
    });
    // Retard orange : RÉSIDU du mois (manque encore dû attribué à son mois d'origine, net des
    // rattrapages) — colonne P&L par mois, on ne reporte pas (user 2026-07-13). L'annuel = SOMME
    // des mois (= dette ouverte de fin de période, puisque le résidu somme à l'arriéré final).
    // Calculé sur les seuls mois EXIGIBLES : un mois non échu (compté au constat parce qu'il
    // porte déjà un encaissement — décision « B ») ne peut pas être « en retard ». Les mois
    // au-delà de `dueMonth` gardent donc un retard de 0.
    _computeLoyerNetting(lotMonths.slice(0, dueMonth), graceLast).retardMois.forEach((rm, idx) => {
      const b = buckets[order[idx]];
      b.loyerRetard += rm.loyer; b.chargeRetard += rm.charge;
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
    ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'recettesDiverses', 'loyerRetard', 'chargeRetard', 'duHC', 'duCH', 'rattrapage', 'nonAffecte', 'recupACharge', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'gestionHF', 'recup', 'interets', 'charges', 'reel', 'recupSolde', 'cashflowNet', 'cashflowReel', 'base2044']
      .forEach(k => { b[k] = round2(b[k]); });
    return b;
  };

  const months = order.map(ym => finalizeDerived(buckets[ym]));   // loyersHC/provisions/avance déjà posés par la cascade cumulative

  // Agrégat annuel (Σ des mois — loyersHC/provisions/avance inclus, PAS de re-cascade)
  const annual = Object.assign({ ym: yr, mo: 0 }, blank());
  months.forEach(b => {
    ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'recettesDiverses', 'loyerRetard', 'chargeRetard', 'duHC', 'duCH', 'rattrapage', 'nonAffecte', 'recupACharge', 'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'gestionHF', 'recup', 'interets']
      .forEach(k => { annual[k] += b[k]; });   // retard : Σ des résidus mensuels = dette ouverte de fin de période
  });
  finalizeDerived(annual);

  const interetsTotal = annual.interets;
  // Les bornes effectivement appliquées sont RENDUES : l'appelant (et les tests) peuvent
  // vérifier quelle fenêtre a réellement piloté le calcul, au lieu de le supposer.
  return { months, annual, interetsTotal, interetsKnown: interetsTotal > 0, lastMonth, dueMonth };
}
