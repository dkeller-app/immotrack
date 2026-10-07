/**
 * FIXTURE DE TEST (FINANCES-SUIVI-UNIQUE P7) — constructeur de la forme « état d'un lot » à partir de mois bruts.
 *
 * `etatMoisLot` a été SUPPRIMÉ de js/core/loyers-mois.js (plus aucun appelant : l'app lit le moteur unique,
 * js/core/suivi-loyers.js → `versEtatLot` / `versEtatMoisLot`). Les helpers purs qui consomment cette forme
 * (peutQuittancer, datePaiementMois, retardLot, lignesRelance, éditeur de quittance…) restent vivants et se
 * testent sur des mois écrits à la main : ce fichier en garde le constructeur, COPIE FIGÉE (v15.715) de l'ancienne
 * fonction, qui délègue toujours à `_loyerArrearsPass` (carry:true) — la cascade vivante. Sert aussi de RÉFÉRENCE
 * à l'adaptateur (suivi-loyers.test.js : versEtatMoisLot = etatMoisLot). Jamais importé par l'app.
 */
import { _loyerArrearsPass } from '../../js/core/loyer-du-mois.js';
import { EPS_CENTIME } from '../../js/core/loyers-mois.js';

const _r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * LE verdict par mois d'un lot — délègue l'imputation à `_loyerArrearsPass`
 * (carry:true = netting avance↔retard, la politique cible des 5 surfaces).
 *
 * LOT 0 « socle des dates » : si l'appelant fournit `sources` (les mouvements encaissés
 * qui composent `received`), chaque mois porte en retour ses `paiements` — les versements
 * RÉELLEMENT imputés à CE mois par la cascade — et `datePaiement`, la date à laquelle il a
 * été soldé. I-DATE : sans rattachement daté, `datePaiement` vaut `null` et les surfaces
 * n'affichent RIEN. Aucune date n'est inventée, aucun repli sur « aujourd'hui ».
 *
 * @param {Array<{ym:string, hcDue:number, chDue:number, received:number,
 *                sources?:Array<{date:string, id?:string, montant:number}>}>} months
 *        chronologiques, ÉCHUS (l'appelant borne au mois courant).
 * @param {{graceLast?:boolean}} [opts] graceLast : neutralise le manque NEUF du
 *        dernier mois (tolérance début de mois, `_loyerToleranceActive`). NE JAMAIS
 *        l'activer pour la quittançabilité (D6 : « au centime »).
 * @returns {{list:Array, byYm:Object, resteLoyer:number, resteCharge:number,
 *            reste:number, avance:number, nbMoisNonSoldes:number,
 *            premierMoisNonSolde:string|null}}
 */
export function etatMoisLot(months, opts) {
  const ms = (months || []).filter((m) => m && /^\d{4}-\d{2}$/.test(String(m.ym)));
  const pass = _loyerArrearsPass(
    ms.map((m) => ({ hcDue: m.hcDue, chDue: m.chDue, received: m.received, sources: m.sources })),
    { carry: true, graceLast: !!(opts && opts.graceLast) }
  );
  const list = ms.map((m, i) => {
    const hcDue = Math.max(0, Number(m.hcDue) || 0);
    const chDue = Math.max(0, Number(m.chDue) || 0);
    const du = _r2(hcDue + chDue);
    const r = pass.retardMois[i] || { loyer: 0, charge: 0 };
    const resteLoyer = _r2(r.loyer);
    const resteCharge = _r2(r.charge);
    const reste = _r2(resteLoyer + resteCharge);
    const vacance = du <= EPS_CENTIME;
    const solde = !vacance && reste <= EPS_CENTIME;
    // I-DATE — les versements RÉELLEMENT imputés à ce mois par la cascade, datés.
    // Un versement sans date connue (`date:null`) n'entre pas dans `paiements` : il ne
    // peut rien prouver. `datePaiement` n'existe que si le mois est soldé ET que tout
    // ce qui l'a soldé est daté — sinon `null`, et l'écran n'affiche rien.
    const brut = (pass.imputations && pass.imputations[i]) || [];
    const paiements = brut.filter((p) => p.date).map((p) => ({ date: p.date, id: p.id, montant: p.montant, poste: p.poste }));
    const totalImpute = _r2(brut.reduce((s, p) => s + p.montant, 0));
    const totalDate = _r2(paiements.reduce((s, p) => s + p.montant, 0));
    const complet = totalImpute - totalDate <= EPS_CENTIME;
    const datesVersements = [...new Set(paiements.map((p) => p.date))].sort();
    return {
      ym: String(m.ym),
      hcDue: _r2(hcDue), chDue: _r2(chDue), du,
      received: _r2(m.received),
      resteLoyer, resteCharge, reste,
      // D6 : soldé = plus AUCUN résidu, au centime. Un mois sans dû (vacance) n'est
      // pas « soldé » : il n'y a rien à quittancer.
      solde,
      partiel: !vacance && reste > EPS_CENTIME && reste < du - EPS_CENTIME,
      vacance,
      paiements,
      montantImpute: totalImpute,
      datesVersements,
      nbVersements: datesVersements.length,
      datePaiement: (solde && complet && datesVersements.length) ? datesVersements[datesVersements.length - 1] : null
    };
  });
  const byYm = {};
  list.forEach((e) => { byYm[e.ym] = e; });
  const nonSoldes = list.filter((e) => !e.vacance && e.reste > EPS_CENTIME);
  return {
    list, byYm,
    resteLoyer: _r2(pass.loyerArrear),
    resteCharge: _r2(pass.chargeArrear),
    reste: _r2(pass.loyerArrear + pass.chargeArrear),
    avance: _r2(pass.avance || 0),
    nbMoisNonSoldes: nonSoldes.length,
    premierMoisNonSolde: nonSoldes.length ? nonSoldes[0].ym : null
  };
}
