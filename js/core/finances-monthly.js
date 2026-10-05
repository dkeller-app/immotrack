import { _computeLoyerChargeAlloc, _LOYER_TOLERANCE_JOUR, _loyerTodayLocal } from './loyer-statut.js';
// AUDIT-SUIVI-LOYERS étape 4 — le RETARD affiché passe au netting avance↔retard (une avance
// couvre les mois suivants avant de laisser naître un retard) : fin des « retard ET avance
// simultanés » (C2, scénario user « 2 loyers payés en janvier, rien en février »).
import { _computeLoyerNetting, duMoisSuivi, segmentsOccupation } from './loyer-du-mois.js';
// R0-C : la dette de restitution suit la MÊME fenêtre d'exigibilité que Finances (tolérance < 10).
import { computeExigibiliteWindow } from './finances-window.js';

/**
 * R0-C lot 1 — LE collecteur des encaissements de LOYER (ligne 2044 « 211 », alias M-1 compris
 * via `catLigne`), par lot et par mois, net des contre-passations (`cr − db`), pondéré par le
 * périmètre. UNE implémentation, lue par la pré-passe d'ouverture N-1 du maître ET par la dette
 * de restitution (`_computeDetteBail`) : la restitution ne peut plus compter un encaissement que
 * Finances ne compte pas (ex. le versement du dépôt de garantie, catégorie hors 2044).
 * @param {Array} mvts mouvements
 * @param {function} catLigne cat → {ligne2044} | null
 * @param {function} poids mv → 0..1 (0 = hors périmètre)
 * @param {function} garder (mv, ym) → bool (filtre de dates / de lot, appliqué AVANT tout calcul)
 * @returns {{parLot:Object<string,Object<string,number>>, premierYm:string|null,
 *            lignes:Array<{qui:string, date:string, ym:string, montant:number}>}}
 */
function _collecterLoyers211(mvts, catLigne, poids, garder) {
  const parLot = {};
  const lignes = [];
  let premierYm = null;
  (mvts || []).forEach(mv => {
    if (!mv || mv._deleted || !mv.date) return;
    const ym = mv.date.slice(0, 7);
    if (!garder(mv, ym)) return;
    const r0 = catLigne(mv.cat);
    if (!r0 || r0.ligne2044 !== '211') return;    // seuls les loyers (HC + provisions)
    const w0 = poids(mv); if (!w0) return;
    const q0 = mv.qui || ''; if (!q0) return;
    const amt0 = ((Number(mv.cr) || 0) - (Number(mv.db) || 0)) * w0;
    (parLot[q0] = parLot[q0] || {})[ym] = (parLot[q0][ym] || 0) + amt0;
    lignes.push({ qui: q0, date: String(mv.date).slice(0, 10), ym, montant: amt0 });
    if (!premierYm || ym < premierYm) premierYm = ym;
  });
  return { parLot, premierYm, lignes };
}

/** Même jour, un mois plus tôt (fin de mois recadrée : 31/03 → 28/02 ou 29/02). */
const _isoMoinsUnMois = (iso) => {
  const y = parseInt(iso.slice(0, 4), 10), m = parseInt(iso.slice(5, 7), 10), d = parseInt(iso.slice(8, 10), 10);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const dd = Math.min(d, new Date(py, pm, 0).getDate());
  return py + '-' + String(pm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
};

const _ymPlus = (ym, k) => {
  let y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) + k;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};

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
  // ── C2 : POSITION D'OUVERTURE de l'arriéré (Finances maître, décision user (b) 2026-09-07) ──
  // Le retard était borné à l'année → un arriéré ouvert en N-1 n'y entrait pas. On calcule, par lot,
  // l'arriéré reporté du DÉBUT DU SUIVI (1er mouvement de la base) au 31/12 N-1, en faisant tourner
  // le MÊME netting sur les mois pré-exercice (dû = loyerDue du bail de l'époque, 0 avant le bail →
  // auto-borné). Il sera SEMÉ dans le netting de l'année (idx 0) → recouvré en priorité par les
  // paiements de l'année (une avance de l'année solde d'abord la dette N-1 : jamais « avance ET
  // retard » simultanés). N'entre QUE dans le retard/position : la cascade fiscale (loyersHC /
  // provisions / avance imposable, base 2044) reste année-scopée et INTOUCHÉE.
  // R0-C lot 1 : collecte déléguée au collecteur unique (même prédicat, même montant, même poids).
  const _pre = _collecterLoyers211(mvts, catLigne, (mv) => scopeWeight(scope, mv), (mv, ym) => ym < yr + '-01');
  const preRecv = _pre.parLot;   // qui → { ym → reçu 211 scopé } avant l'exercice
  const _suiviStartYm = _pre.premierYm;
  const _preYmsDepuis = (start) => {
    const out = [];
    if (!start) return out;
    let py = parseInt(start.slice(0, 4), 10), pm = parseInt(start.slice(5, 7), 10);
    const endY = parseInt(yr, 10) - 1;
    while ((py < endY) || (py === endY && pm <= 12)) {
      out.push(py + '-' + String(pm).padStart(2, '0'));
      pm++; if (pm > 12) { pm = 1; py++; }
      if (out.length > 600) break;                // garde-fou 50 ans
    }
    return out;
  };
  const _preYms = _preYmsDepuis(_suiviStartYm);
  // R0-C · Q1 — `debutDu(q)` (injecté, optionnel) : mois où le dû du lot commence ('YYYY-MM' :
  // entrée du bail, bornée par l'entrée en jouissance / l'antériorité — Q1 révisé 01/10). Le dû
  // peut précéder le 1ᵉʳ versement (premiers mois impayés d'un bail) : la pré-passe doit alors
  // démarrer à ce début, sinon ces mois dus tombent hors de
  // l'ouverture et la dette reste invisible. Absent → comportement historique à l'identique.
  const debutDu = (typeof i.debutDu === 'function') ? i.debutDu : null;
  const _preYmsLot = (q) => {
    const d = debutDu ? debutDu(q) : null;
    if (d && /^\d{4}-\d{2}$/.test(String(d)) && (!_suiviStartYm || d < _suiviStartYm)) return _preYmsDepuis(String(d));
    return _preYms;
  };
  // R0-C · Q1 RÉVISÉ — `ouverture(q)` (injecté, optionnel) : le SOLDE D'OUVERTURE noté sur le bail
  // (antériorité : arriéré de loyer / de charges, ou avance, à la date de début du suivi), posé UNE
  // fois à cette date. { ym:'YYYY-MM', loyer, charge, avance } | null. Avant l'exercice : semé dans la
  // pré-passe (il est alors soldé, ou reporté, par le même netting que tout arriéré) ; dans l'exercice :
  // ajouté à la position d'ouverture de l'exercice. Absent → comportement historique à l'identique.
  const ouvertureOf = (typeof i.ouverture === 'function') ? i.ouverture : null;
  const _ouv = (q) => {
    const o = ouvertureOf ? ouvertureOf(q) : null;
    if (!o || !/^\d{4}-\d{2}$/.test(String(o.ym || ''))) return null;
    const v = { loyer: Math.max(0, Number(o.loyer) || 0), charge: Math.max(0, Number(o.charge) || 0), avance: Math.max(0, Number(o.avance) || 0) };
    return (v.loyer + v.charge + v.avance) > 0.005 ? Object.assign({ ym: String(o.ym) }, v) : null;
  };
  const _openingOf = (q) => {
    const yms = _preYmsLot(q);
    const ouv = _ouv(q);
    const ouvAvant = ouv && ouv.ym < yr + '-01' ? ouv : null;
    const ouvDans = ouv && ouv.ym >= yr + '-01' && ouv.ym <= yr + '-12' ? ouv : null;
    let res = null;
    if (yms.length) {
      const pm = yms.map(ym => {
        const d = loyerDue(q, ym) || {};
        return { hcDue: Number(d.hc) || 0, chDue: Number(d.ch) || 0, received: (preRecv[q] && preRecv[q][ym]) || 0 };
      });
      const pr = _computeLoyerNetting(pm, false, ouvAvant);   // pas de tolérance sur le passé clos
      if (pr.loyerArrear > 0.005 || pr.chargeArrear > 0.005) res = { loyer: pr.loyerArrear, charge: pr.chargeArrear };
      else if (pr.avance > 0.005) res = { avance: pr.avance };   // trop-perçu de N-1 reporté (audit C2 #1, CDC (b))
    }
    if (ouvDans) {
      res = res || {};
      res = { loyer: (res.loyer || 0) + ouvDans.loyer, charge: (res.charge || 0) + ouvDans.charge, avance: (res.avance || 0) + ouvDans.avance };
    }
    return res;
  };

  const lotsEnRetard = [];       // R-2 : lots à retard résiduel > 0 (compteur « N impayés »)
  // KPI Lot 0 (CDC-KPI §R-0 / D34) : le détail par lot est EXPOSÉ, pas jeté. Aucun calcul de
  // plus — on range dans byLot exactement ce que la cascade et le netting produisent déjà.
  const byLot = {};
  const allLots = new Set();
  order.forEach(ym => { const lots = buckets[ym]._loyerByLot; if (lots) for (const q in lots) allLots.add(q); });
  activeLots.forEach(q => allLots.add(q));   // + lots à bail actif sans mouvement (retard « zéro paiement »)
  allLots.forEach(q => {
    const lotMonths = order.map(ym => {
      const d = loyerDue(q, ym) || {};
      return { hcDue: Number(d.hc) || 0, chDue: Number(d.ch) || 0, received: (buckets[ym]._loyerByLot && buckets[ym]._loyerByLot[q]) || 0 };
    });
    // KPI : une ligne de frise par mois, remplie au fil des deux passes ci-dessous.
    const lotFrise = order.map((ym, idx) => ({
      ym, duHC: lotMonths[idx].hcDue, duCH: lotMonths[idx].chDue,
      encaisse: lotMonths[idx].received, loyerRetard: 0, chargeRetard: 0, avance: 0, rattrapage: 0
    }));
    // R-2 : le dû CC du mois (barème historisé) est RENDU — c'est le dénominateur unique du
    // recouvrement (remplace `attenduHCTheo`, la 2ᵉ définition du dû qui écrasait l'historique).
    lotMonths.forEach((lm, idx) => { const b = buckets[order[idx]]; b.duHC += lm.hcDue; b.duCH += lm.chDue; });
    _computeLoyerChargeAlloc(lotMonths).forEach((a, idx) => {
      const b = buckets[order[idx]];
      b.loyersHC += a.loyersHC; b.provisions += a.provisions; b.avance += a.avance;
      b.rattrapage += a.rattrapage || 0;
      lotFrise[idx].avance = a.avance; lotFrise[idx].rattrapage = a.rattrapage || 0;
    });
    // Retard orange : RÉSIDU du mois (manque encore dû attribué à son mois d'origine, net des
    // rattrapages) — colonne P&L par mois, on ne reporte pas (user 2026-07-13). L'annuel = SOMME
    // des mois (= dette ouverte de fin de période, puisque le résidu somme à l'arriéré final).
    // Calculé sur les seuls mois EXIGIBLES : un mois non échu (compté au constat parce qu'il
    // porte déjà un encaissement — décision « B ») ne peut pas être « en retard ». Les mois
    // au-delà de `dueMonth` gardent donc un retard de 0.
    let _retardLot = 0;
    _computeLoyerNetting(lotMonths.slice(0, dueMonth), graceLast, _openingOf(q)).retardMois.forEach((rm, idx) => {
      const b = buckets[order[idx]];
      b.loyerRetard += rm.loyer; b.chargeRetard += rm.charge;
      lotFrise[idx].loyerRetard = rm.loyer; lotFrise[idx].chargeRetard = rm.charge;
      _retardLot += rm.loyer + rm.charge;
    });
    // R-2 : le compteur « N impayés » vient du MÊME moteur (lots à retard résiduel > 0),
    // plus d'une liste calculée à part.
    if (_retardLot > 0.005 && q) lotsEnRetard.push(q);

    // KPI : agrégats du lot = Σ de sa frise (mêmes règles que l'annuel du moteur). `solde` est
    // la position de trésorerie signée du lot : encaissé − dû (+ avance / − retard).
    if (q) {
      const sum = (k) => lotFrise.reduce((s, m) => s + (m[k] || 0), 0);
      const encaisse = round2(sum('encaisse'));
      const duHC = round2(sum('duHC')), duCH = round2(sum('duCH'));
      byLot[q] = {
        months: lotFrise.map(m => ({
          ym: m.ym, duHC: round2(m.duHC), duCH: round2(m.duCH), encaisse: round2(m.encaisse),
          loyerRetard: round2(m.loyerRetard), chargeRetard: round2(m.chargeRetard),
          avance: round2(m.avance), rattrapage: round2(m.rattrapage)
        })),
        annual: {
          duHC, duCH, encaisse,
          retard: round2(sum('loyerRetard') + sum('chargeRetard')),
          avance: round2(sum('avance'))
        },
        solde: round2(encaisse - duHC - duCH)
      };
    }
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
  return { months, annual, interetsTotal, interetsKnown: interetsTotal > 0, lastMonth, dueMonth, lotsEnRetard, byLot };
}

/**
 * R0-C lot 1 (docs/CDC-R0C.md, option B « Finances fait foi ») — LA DETTE D'UN BAIL, lue dans
 * le maître. C'est elle que la restitution du dépôt de garantie retient (art. 22 loi 89-462).
 *
 * Même cascade que le maître (`_computeLoyerNetting` : loyer → charges → arriérés → avance),
 * même dû (`duMoisSuivi` : barème historisé, prorata au jour, début du suivi Q1), mêmes
 * encaissements (`_collecterLoyers211` : ligne 211, alias M-1, net des contre-passations),
 * même fenêtre d'exigibilité (tolérance avant le 10). Une seule différence, voulue : le calcul
 * court sur la vie D'UN bail, d'une traite, SANS JAMAIS SEMER D'OUVERTURE. Le passé du bail est
 * dans le calcul au lieu d'être reporté — c'est ce qui supprime le double/triple comptage de
 * l'ouverture N-1 (branche rejetée feat/r0c-retenue-dg) et la dette d'un locataire facturée au
 * suivant (cas C). Égalité au centime avec Finances prouvée par
 * __tests__/helpers/r0c-egalite-maitre.test.js (lots à un bail).
 *
 * Décisions Didier 30/09 intégrées :
 *   Q1 RÉVISÉ (01/10) — le dû part de l'entrée du bail, borné par `debutSuivi` (jouissance du bailleur
 *        actuel ou début de suivi d'une antériorité), jamais par une absence de relevés. Une part du
 *        bail antérieure à la borne → `suiviPartiel: true` ; un bail achevé avant la borne →
 *        `suiviAbsent: true` et montants `null` (dette inconnue, jamais un zéro muet).
 *   Q3 — `fin` = date de fin effective, sinon date de sortie (l'appelant choisit et avertit) ;
 *        elle borne le dû au jour près, même si le bail est encore ouvert.
 *   Q4 — un encaissement appartient au bail en vigueur à sa DATE ; la vacance qui suit un bail
 *        lui revient (arriéré réglé après la sortie), celle qui précède le 1ᵉʳ bail du lot aussi
 *        (loyer payé le 28 du mois d'avant). Date de bascule = entrée du bail suivant. Tout
 *        encaissement pris hors des dates d'occupation est listé dans `horsPeriode`.
 *        Un encaissement daté dans le mois qui précède l'entrée d'un bail voisin est listé dans
 *        `aRattacher` : il peut solder une dette, jamais devenir un trop-perçu versé (🟠6).
 *   Q5 — le trop-perçu restant est rendu dans `avance` (hors encaissements « à rattacher »).
 * Charges : `charge` est exposée, JAMAIS à retenir sur le dépôt (elles relèvent de la
 * régularisation — anti-double-compte).
 *
 * @param {Object} input
 * @param {string} input.ref ref du lot (clé `qui` des mouvements, comparaison exacte comme le maître)
 * @param {{bails:Array, bareme:Array}} input.ctx contexte duMois du LOT (tous ses baux)
 * @param {string} input.bailDebut 'YYYY-MM-DD' — identifie le bail (début de son segment)
 * @param {string|null} [input.fin] fin du dû 'YYYY-MM-DD' (Q3) ; absente = fin du segment
 * @param {Array} input.mouvements
 * @param {function} input.catLigne cat → {ligne2044} | null (en prod `_finCatLigne`)
 * @param {string|null} [input.debutSuivi] borne du suivi 'YYYY-MM-DD' : entrée en jouissance du bailleur
 *        actuel / début de suivi d'une antériorité ; absente = depuis l'entrée du bail
 * @param {{loyer?:number, charge?:number, avance?:number}|null} [input.ouverture] solde d'ouverture de
 *        l'antériorité notée sur CE bail (posé une fois, au début du suivi)
 * @param {string} [input.today] horloge locale 'YYYY-MM-DD'
 * @returns {null | {loyer:number|null, charge:number|null, avance:number|null, avanceBrute:number|null,
 *           mois:Array, from:string|null, to:string|null, debutSuivi:string|null, finDu:string|null,
 *           horsPeriode:Array<{date:string, montant:number}>,
 *           aRattacher:Array<{date:string, montant:number, compte:boolean, motif:string}>,
 *           graceLast:boolean, suiviPartiel:boolean, suiviAbsent:boolean}}
 *          null = bail introuvable ou bornes incohérentes : dette INCONNUE (≠ 0). Montants null +
 *          `suiviAbsent` = le bail s'achève avant la borne de suivi : dette inconnue, aussi.
 */
export function _computeDetteBail(input) {
  const i = input || {};
  const ref = i.ref, ctx = i.ctx;
  if (!ref || !ctx || !i.bailDebut) return null;
  const debut = String(i.bailDebut).slice(0, 10);
  const segs = segmentsOccupation(ctx.bails);
  const k = segs.findIndex(s => s.debut === debut);
  if (k < 0) return null;
  const seg = segs[k], next = segs[k + 1] || null, aUnPrecedent = k > 0;
  const catLigne = i.catLigne || (() => null);
  const today = i.today || _loyerTodayLocal();
  const round2 = n => Math.round(n * 100) / 100;

  // Q3 — fin du dû : la plus tôt entre la fin du segment (fin effective / troncature C4) et `fin`.
  let finDu = seg.end || null;
  if (i.fin) { const f = String(i.fin).slice(0, 10); if (!finDu || f < finDu) finDu = f; }
  if (finDu && finDu < debut) return null;

  // Q1 RÉVISÉ (Didier 01/10) — borne de suivi FOURNIE par l'appelant : date d'entrée en jouissance du
  // bailleur actuel, ou date de début de suivi d'une antériorité saisie. Sans borne, le dû part de
  // l'entrée du bail. Jamais d'une absence de relevés.
  const debutSuivi = i.debutSuivi ? (String(i.debutSuivi).length === 7 ? i.debutSuivi + '-01' : String(i.debutSuivi).slice(0, 10)) : null;
  // 🟠5 — dette PARTIELLEMENT connue : la part du bail antérieure à la borne n'est pas calculée (elle
  // relève d'une antériorité). Dette TOTALEMENT inconnue : le bail s'achève avant la borne → null.
  const suiviPartiel = !!(debutSuivi && debutSuivi > debut);
  if (debutSuivi && finDu && debutSuivi > finDu) {
    return { loyer: null, charge: null, avance: null, avanceBrute: null, mois: [], from: null, to: null, debutSuivi, finDu,
      horsPeriode: [], aRattacher: [], graceLast: false, suiviPartiel: true, suiviAbsent: true };
  }
  // Dû de CE bail seul, sa fin portée à `finDu` (segmentDebut isole sa part d'un mois partagé).
  const ctxDu = {
    ref, bareme: ctx.bareme || [],
    bails: (ctx.bails || []).map(b => (b && !b._deleted && b.debut && String(b.debut).slice(0, 10) === debut && finDu)
      ? Object.assign({}, b, { finEffective: finDu }) : b)
  };

  // Fenêtre d'exigibilité de Finances : rien au-delà du dernier mois échu.
  const W = computeExigibiliteWindow({ year: Number(today.slice(0, 4)), today });
  const moisCourant = today.slice(0, 7);
  const dernierExigible = W.dueMonth > 0 ? today.slice(0, 4) + '-' + String(W.dueMonth).padStart(2, '0') : _ymPlus(today.slice(0, 4) + '-01', -1);

  // Q4 — rattachement par la date : [entrée (ou −∞ pour le 1ᵉʳ bail du lot) ; entrée du suivant[.
  const col = _collecterLoyers211(i.mouvements, catLigne, () => 1, (mv, ym) => {
    if (mv.qui !== ref || ym > dernierExigible) return false;
    const d = String(mv.date).slice(0, 10);
    if (aUnPrecedent && d < debut) return false;
    if (next && d >= next.debut) return false;
    return true;
  });
  const recu = col.parLot[ref] || {};
  const derniereLigne = col.lignes.reduce((m, l) => (l.ym > m ? l.ym : m), '');
  let from = debut.slice(0, 7);
  if (col.premierYm && col.premierYm < from) from = col.premierYm;
  let to = finDu ? finDu.slice(0, 7) : dernierExigible;
  if (derniereLigne > to) to = derniereLigne;
  if (to > dernierExigible) to = dernierExigible;

  const yms = [];
  for (let ym = from; ym <= to && yms.length <= 1200; ym = _ymPlus(ym, 1)) yms.push(ym);
  const lignesMois = yms.map(ym => {
    const d = duMoisSuivi(ctxDu, ym, debutSuivi, { segmentDebut: debut });
    return { ym, hcDue: Number(d.hc) || 0, chDue: Number(d.ch) || 0, received: recu[ym] || 0 };
  });
  const graceLast = !!W.graceLast && yms.length > 0 && yms[yms.length - 1] === moisCourant;
  // Aucune ouverture REPORTÉE (le passé du bail est dans le calcul) ; seule l'antériorité NOTÉE sur ce bail
  // (Q1 révisé) est posée, une fois, au début du suivi.
  const ouv = i.ouverture ? { loyer: Math.max(0, Number(i.ouverture.loyer) || 0), charge: Math.max(0, Number(i.ouverture.charge) || 0), avance: Math.max(0, Number(i.ouverture.avance) || 0) } : null;
  const r = _computeLoyerNetting(lignesMois, graceLast, ouv);
  const mois = lignesMois.map((m, idx) => ({
    ym: m.ym, duHC: round2(m.hcDue), duCH: round2(m.chDue), encaisse: round2(m.received),
    loyerRetard: round2(r.retardMois[idx].loyer), chargeRetard: round2(r.retardMois[idx].charge),
    avance: round2((r.months[idx] && r.months[idx].avance) || 0)
  }));
  const horsPeriode = col.lignes
    .filter(l => l.date < debut || (finDu && l.date > finDu))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({ date: l.date, montant: round2(l.montant) }));
  // 🟠6 — encaissements « à rattacher » : datés dans le mois qui précède l'entrée d'un bail VOISIN. La
  // date les donne au bail en vigueur (Q4), mais c'est souvent le 1ᵉʳ loyer du locataire suivant
  // (terme à échoir) : ils peuvent solder une dette, JAMAIS devenir un trop-perçu versé au locataire.
  // Côté SORTANT (`compte: true`) : seule la part qui ferait un trop-perçu est en cause. On remonte les encaissements
  // de la fenêtre du plus récent au plus ancien jusqu'à couvrir l'avance produite : ce sont eux qui
  // « débordent » (le loyer normal du dernier mois, lui, a servi au dernier mois).
  const avanceBrute = round2(r.avance || 0);
  const aRattacher = [];
  if (next && avanceBrute > 0.005) {
    const seuil = _isoMoinsUnMois(next.debut);
    let reste = avanceBrute;
    col.lignes.filter(l => l.date >= seuil && l.date < next.debut && l.montant > 0)
      .sort((x, y) => y.date.localeCompare(x.date))
      .forEach(l => {
        if (reste <= 0.005) return;
        const m = round2(Math.min(reste, l.montant));
        reste = round2(reste - m);
        aRattacher.push({ date: l.date, montant: m, compte: true, motif: 'avant l’entrée du bail suivant' });
      });
  }
  // Côté ENTRANT (`compte: false`, non comptés dans CE bail) : les mêmes encaissements, vus depuis le
  // bail suivant (calculés sur le bail précédent, sans récursion au-delà d'un voisin).
  if (aUnPrecedent && !i._sansVoisin) {
    const prec = _computeDetteBail(Object.assign({}, i, { bailDebut: segs[k - 1].debut, fin: null, _sansVoisin: true }));
    ((prec && prec.aRattacher) || []).forEach(x => aRattacher.push({ date: x.date, montant: x.montant, compte: false,
      motif: 'avant l’entrée de ce bail' }));
  }
  aRattacher.sort((x, y) => x.date.localeCompare(y.date));
  const enAttente = round2(aRattacher.filter(x => x.compte).reduce((t, x) => t + x.montant, 0));
  return {
    // Σ des résidus mensuels ARRONDIS au centime — exactement la règle d'agrégation du maître.
    loyer: round2(mois.reduce((s, m) => s + m.loyerRetard, 0)),
    charge: round2(mois.reduce((s, m) => s + m.chargeRetard, 0)),
    // Q5 — trop-perçu restituable : jamais celui qui viendrait d'un encaissement « à rattacher ».
    avance: round2(Math.max(0, avanceBrute - enAttente)),
    avanceBrute,
    mois, from: yms.length ? from : null, to: yms.length ? to : null,
    debutSuivi, finDu, horsPeriode, aRattacher, graceLast,
    suiviPartiel, suiviAbsent: false
  };
}
