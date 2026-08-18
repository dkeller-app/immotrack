/**
 * Harnais de l'INVARIANT I-1 — REFONTE FINANCES socle (CDC-FINANCES § 0).
 *
 *   « Aucun chiffre de Finances n'est calculé sur une valeur "actuelle" appliquée au passé.
 *     Tout se lit sur l'historique du mois concerné. »
 *
 * Ce fichier N'EST PAS un test : c'est l'outil RÉUTILISABLE que chaque étape du chantier
 * (tableau, ratios, drills, popups, clé P-4…) rebranche sur SES surfaces pour prouver
 * qu'elle n'a pas réintroduit d'infraction. Le cas de référence est celui du CDC :
 * un lot à 800 € de janvier à juillet, indexé à 850 € au 1ᵉʳ août → aucun chiffre de
 * janvier à juillet ne bouge.
 *
 * Usage type dans une future étape :
 *   const { avant, apres, moisFiges } = casReferenceIRL();
 *   const surfaces = { ...surfacesSocle({ mouvements: MVTS }), 'ma nouvelle surface': fn };
 *   expect(infractionsI1({ avant, apres, moisFiges, surfaces })).toEqual([]);
 *
 * Une « surface » = (ctx, ym) => valeur JSON-comparable des chiffres de ce mois.
 * `ctx` a la forme attendue par duMois : { ref, bails, bareme }.
 */

import { duMois } from '../../js/core/loyer-du-mois.js';
import { appliquerNouvellePeriode, periodeInitialeBail } from '../../js/core/loyer-bareme.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { computeExigibiliteWindow } from '../../js/core/finances-window.js';

const _r2 = (n) => Math.round(n * 100) / 100;
const _ym = (y, mo) => y + '-' + String(mo).padStart(2, '0');

/**
 * Le CAS DE RÉFÉRENCE du CDC, construit avec les VRAIES fonctions du barème
 * (`periodeInitialeBail` + `appliquerNouvellePeriode`) — jamais un barème écrit à la main :
 * on veut prouver que le chemin RÉEL d'une révision IRL ne réécrit pas le passé.
 *
 * `apres` reflète la réalité d'après-révision : le barème porte deux périodes datées ET le
 * bail courant porte désormais 850 € (c'est exactement le piège — toute surface qui lit
 * `bail.hc` au lieu du barème facturera 850 € depuis janvier).
 *
 * @param {{ref?:string, annee?:number, hc?:number, ch?:number, hcApres?:number,
 *          dateEffet?:string}} [opts]
 * @returns {{avant, apres, moisFiges:string[], moisIndexes:string[], dateEffet:string,
 *            ref:string, annee:number, hc:number, hcApres:number, ch:number}}
 */
export function casReferenceIRL(opts) {
  const o = opts || {};
  const ref = o.ref || 'LOT-800';
  const annee = o.annee || 2026;
  const hc = o.hc != null ? o.hc : 800;
  const ch = o.ch != null ? o.ch : 100;
  const hcApres = o.hcApres != null ? o.hcApres : 850;
  const dateEffet = o.dateEffet || (annee + '-08-01');
  // Le cas de référence est INTRA-annuel : une date d'effet d'un autre millésime rendrait
  // `moisFiges` incohérent (et le harnais mesurerait à côté sans le dire).
  if (Number(dateEffet.slice(0, 4)) !== Number(annee)) {
    throw new RangeError(`casReferenceIRL : dateEffet ${dateEffet} hors de l'exercice ${annee}`);
  }
  const moEffet = parseInt(dateEffet.slice(5, 7), 10);

  const bail = { ref, debut: annee + '-01-01', hc, ch };
  const baremeAvant = [periodeInitialeBail(bail)];
  const baremeApres = appliquerNouvellePeriode(baremeAvant, {
    ref, debut: dateEffet, hc: hcApres, ch, source: 'irl', bailDebut: bail.debut,
    note: 'révision IRL'
  });

  const mkCtx = (bareme, hcBail) => ({
    ref,
    bails: [{ debut: bail.debut, finEffective: null, archive: false, hc: hcBail, ch }],
    bareme
  });

  const moisFiges = [];
  for (let mo = 1; mo < moEffet; mo++) moisFiges.push(_ym(annee, mo));
  const moisIndexes = [];
  for (let mo = moEffet; mo <= 12; mo++) moisIndexes.push(_ym(annee, mo));

  return {
    avant: mkCtx(baremeAvant, hc),
    apres: mkCtx(baremeApres, hcApres),      // le bail courant vaut 850 € : c'est LE piège
    moisFiges, moisIndexes, dateEffet, ref, annee, hc, hcApres, ch
  };
}

/**
 * Les surfaces du SOCLE (celles qui existent à l'étape 1). Les étapes suivantes ajoutent
 * les leurs au même dictionnaire — le harnais ne change pas.
 * @param {{mouvements?:Array, today?:string}} [opts] mouvements bancaires (identiques
 *        avant/après : appliquer une IRL ne modifie aucun relevé de compte)
 */
export function surfacesSocle(opts) {
  const o = opts || {};
  const mouvements = o.mouvements || [];
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);
  const pnlCache = new Map();

  // `today` DÉRIVÉ de l'exercice testé (31/12 de l'année du mois examiné) : un `today` figé en
  // dur rendait toutes les surfaces muettes dès qu'on testait un autre millésime — donc
  // l'invariant passait en ne mesurant rien. `opts.today` reste prioritaire si on veut forcer.
  const todayFor = (ym) => o.today || (String(ym).slice(0, 4) + '-12-31');

  /** Tableau P&L mensuel réel : le bucket complet du mois (toutes ses lignes). */
  const pnl = (ctx, ym) => {
    const annee = String(ym).slice(0, 4);
    // Clé de cache = contexte ET année (le moteur est calculé par exercice).
    let parAnnee = pnlCache.get(ctx);
    if (!parAnnee) { parAnnee = new Map(); pnlCache.set(ctx, parAnnee); }
    if (!parAnnee.has(annee)) {
      parAnnee.set(annee, _computeFinancesMonthly({
        mouvements, year: Number(annee), scope: null, catLigne, today: todayFor(ym),
        lastMonth: 12, activeLots: [ctx.ref],
        loyerDue: (qui, m) => duMois(ctx, m)
      }));
    }
    const b = parAnnee.get(annee).months.find((m) => m.ym === ym);
    return b ? Object.assign({}, b, { _loyerByLot: undefined }) : null;
  };

  return {
    // 1. Le dû du mois — la source de tout le reste (barème historisé).
    'dû du mois (duMois)': (ctx, ym) => duMois(ctx, ym),

    // 2. Le tableau P&L mensuel — encaissé, retard, avance, cash-flow du mois.
    'tableau P&L (_computeFinancesMonthly)': pnl,

    // 3. Le dénominateur du recouvrement (R-2) : dû CC CUMULÉ depuis le 01/01 sur la
    //    fenêtre d'exigibilité — une valeur cumulative attrape aussi les régressions
    //    qui se compensent d'un mois à l'autre.
    'recouvrement · dû CC cumulé (R-2)': (ctx, ym) => {
      const w = computeExigibiliteWindow({ year: Number(String(ym).slice(0, 4)), today: todayFor(ym) });
      let cum = 0;
      for (const m of w.months) { if (m.ym > ym) break; cum += duMois(ctx, m.ym).total; }
      return _r2(cum);
    }
  };
}

/**
 * SURFACE VOLONTAIREMENT FAUTIVE — reproduit l'infraction nommée par le CDC
 * (`bail.hc × nombre de mois`, index.html:49527, attendu du widget impayé). Sert à prouver
 * que le harnais DÉTECTE vraiment : un test d'invariant qui ne peut pas échouer ne vaut rien.
 */
export const SURFACE_FAUTIVE_LOYER_ACTUEL = (ctx, ym) => {
  const hcActuel = (ctx.bails && ctx.bails[0] && Number(ctx.bails[0].hc)) || 0;
  return _r2(hcActuel * parseInt(String(ym).slice(5, 7), 10));
};

/**
 * Détecte les infractions à I-1 : tout mois FIGÉ dont une surface change entre `avant`
 * et `apres`.
 *
 * Une surface MUETTE (null/undefined des deux côtés) est signalée comme infraction
 * `surface-muette` : sans ça, une surface mal câblée « tient » l'invariant en ne mesurant
 * rien — c'est exactement le piège qui rendait le harnais aveugle hors de son millésime.
 *
 * @param {{avant, apres, moisFiges:string[], surfaces:Object}} input
 * @returns {Array<{surface:string, mois:string, avant:*, apres:*, raison?:string}>}
 *          vide = invariant tenu
 */
export function infractionsI1(input) {
  const i = input || {};
  const out = [];
  const noms = Object.keys(i.surfaces || {});
  (i.moisFiges || []).forEach((ym) => {
    noms.forEach((nom) => {
      const f = i.surfaces[nom];
      if (typeof f !== 'function') {
        out.push({ surface: nom, mois: ym, avant: null, apres: null, raison: 'surface-invalide' });
        return;
      }
      const a = f(i.avant, ym);
      const b = f(i.apres, ym);
      if (a == null && b == null) {
        out.push({ surface: nom, mois: ym, avant: a, apres: b, raison: 'surface-muette' });
        return;
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ surface: nom, mois: ym, avant: a, apres: b });
    });
  });
  return out;
}

/** Rend une liste d'infractions lisible dans un message d'échec. */
export function formatInfractionsI1(list) {
  if (!list || !list.length) return 'invariant I-1 tenu';
  return list.map((v) => (v.raison === 'surface-muette'
    ? `I-1 NON MESURÉ · ${v.surface} · ${v.mois} : la surface ne renvoie rien (harnais aveugle)`
    : `I-1 VIOLÉ · ${v.surface} · ${v.mois} : ${JSON.stringify(v.avant)} → ${JSON.stringify(v.apres)}`)).join('\n');
}
