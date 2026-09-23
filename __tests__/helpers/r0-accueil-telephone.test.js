/**
 * R0-F — l'Accueil TÉLÉPHONE lit le même moteur que l'Accueil PC.
 *
 * Le téléphone sommait `_v4ComputeLotStatus(l).recu`, c'est-à-dire les seuls loyers alloués à un
 * lot. Le PC, lui, affiche les RECETTES du moteur Finances. Sur un compte réel avec une indemnité
 * GLI, le PC annonçait 1 150 € et le téléphone 900 € — pour la même question, le même jour.
 * CDC-FINANCES §0bis : « un chiffre d'argent présent sur deux écrans doit être le même octet ».
 *
 * Presque tous ces tests EXÉCUTENT le bloc de calcul extrait d'index.html : ils vérifient les
 * chiffres produits, moteur présent puis moteur absent. Les deux derniers, eux, lisent la SOURCE :
 * ils portent sur des libellés, qui ne sont pas calculés. C'est dit ici pour que personne ne les
 * prenne pour ce qu'ils ne sont pas.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

/** Une tranche de source délimitée par deux ancres littérales. `null` si l'une a bougé. */
function tranche(debut, finInclus) {
  const i = html.indexOf(debut);
  if (i === -1) return null;
  const j = html.indexOf(finInclus, i);
  return j === -1 ? null : html.slice(i, j + finInclus.length);
}

/**
 * Le calcul de `_renderAccueilPhone` : occupation, encaissé, puis le reste dû et la barre.
 * Les deux tranches sont séparées dans le fichier par du code de rendu (dépôts, « À regarder »,
 * nom, périmètre) qui n'entre pas dans ces chiffres.
 */
function blocCalcul() {
  const a = tranche(
    '  // R0-F — L\'Accueil TELEPHONE',
    "  else logs.forEach(function(l){ try{ encYTD += (_v4ComputeLotStatus(l, yr, '', ctx.mvsYTD).recu||0); }catch(e){} });");
  const b = tranche(
    '  // C1 : le reste du vient du maitre',
    "  else _subMois = 'rien en retard';");
  return (a && b) ? (a + '\n' + b) : null;
}

/**
 * Exécute ce bloc avec des dépendances contrôlées et rend tout ce qui s'affiche.
 * `deps` permet de retirer une pièce du moteur pour éprouver les replis.
 */
function calculer(deps) {
  const src = blocCalcul();
  if (!src) throw new Error('bloc de calcul introuvable — le test ne teste plus rien');
  const noms = ['logs', 'yr', 'moNow', 'ctx', 'DB', 'window', 'F', '_lotEstLoue', '_computeOccupationLots',
    '_dashCfReel', '_finEntScope', '_finWindows', '_finMonthly', '_v4ComputeLotStatus'];
  const f = new Function(...noms, src +
    '\nreturn { occ:occ, occSub:occSub, encMois:encMois, attMois:attMois, encYTD:encYTD,' +
    ' reste:reste, pctPay:pctPay, sub:_subMois, grace:_grace, graceConnu:_graceConnu };');
  return f(...noms.map(n => deps[n]));
}

// Un parc d'un seul lot, loué toute l'année, 800 HC + 100 CH. Le locataire paie 900 € de loyer en
// septembre, et l'assureur verse 250 € d'indemnité GLI : le moteur encaisse 1 150 € de recettes,
// la somme des loyers du lot 900 €.
const LOTS = [{ ref: 'A-1', locataire: '' }];
const MOIS = 9;

/** Les `MOIS` entrées de frise que le vrai moteur produit (pas 12 : il s'arrête au constat). */
const frise = (surcharge) => Array.from({ length: MOIS }, (_, i) => Object.assign(
  { ym: '2026-' + String(i + 1).padStart(2, '0'), duHC: 800, duCH: 100, encaisse: 900,
    loyerRetard: 0, chargeRetard: 0, avance: 0, rattrapage: 0 },
  typeof surcharge === 'function' ? surcharge(i) : surcharge));

const BASE = {
  logs: LOTS,
  yr: '2026',
  moNow: MOIS,
  ctx: { yr: '2026', activeEnt: '', mvs: [], mvsYTD: [], scopeLogs: LOTS },
  DB: {},
  window: {},
  F: (n) => Math.round(n || 0) + ' €',
  _lotEstLoue: (l) => !!l && l.ref === 'A-1',
  _computeOccupationLots: () => ({ louableDays: 266, taux: 100 }),
  _dashCfReel: () => ({ recettes: 1150 }),
  _finEntScope: () => ({}),
  // La vraie forme : `_finWindows` rend { constat, exigibilite, n1 } — c'est `exigibilite`
  // qui porte la tolérance de début de mois (`finances-window.js:158`).
  _finWindows: () => ({ constat: { lastMonth: MOIS, dueMonth: MOIS }, exigibilite: { graceLast: false } }),
  _finMonthly: () => ({ byLot: { 'A-1': { months: frise() } } }),
  _v4ComputeLotStatus: () => ({ recu: 900, attendu: 900 })
};

describe('Accueil téléphone — les chiffres viennent du moteur', () => {
  it('le cumul annuel est celui du PC (recettes), pas la somme des loyers du lot', () => {
    // AVANT : 900 € (Σ `_v4ComputeLotStatus.recu`). Le PC affichait 1 150 € le même jour.
    expect(calculer(BASE).encYTD).toBe(1150);
  });

  it('un lot hors périmètre n’entre pas dans le mois', () => {
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: {
        'A-1': { months: frise() },
        'Z-9': { months: frise({ duHC: 5000, duCH: 0, encaisse: 5000 }) }
      } })
    });
    expect(r.encMois).toBe(900);
    expect(r.attMois).toBe(900);
  });

  it('le mois lit le maître, pas le calcul par lot', () => {
    // Le maître dit 900 encaissés sur 900 dus ; le calcul par lot dirait 40.
    const r = calculer({ ...BASE, _v4ComputeLotStatus: () => ({ recu: 40, attendu: 40 }) });
    expect(r.encMois).toBe(900);
    expect(r.attMois).toBe(900);
  });

  it('sans moteur (mode file://), l’écran affiche encore un chiffre', () => {
    // Le repli n'invente rien : il redonne l'ancien calcul, explicitement.
    const r = calculer({ ...BASE, _finMonthly: undefined, _dashCfReel: undefined });
    expect(r.encMois).toBe(900);
    expect(r.encYTD).toBe(900);
  });

  it('un moteur qui lève ne casse pas l’écran d’accueil', () => {
    const r = calculer({ ...BASE, _finMonthly: () => { throw new Error('boum'); } });
    expect(r.encMois).toBe(900); // repli
  });

  it('`_dashCfReel` qui rend null (il le peut) ne met pas « null € » à l’écran', () => {
    const r = calculer({ ...BASE, _dashCfReel: () => null });
    expect(r.encYTD).toBe(900); // repli par lot, pas un NaN ni un null
  });

  it('une frise plus courte que le mois courant ne fait pas planter l’écran', () => {
    // Le vrai `months` s'arrête au mois de constat : `months[moNow-1]` peut être absent.
    const r = calculer({ ...BASE, _finMonthly: () => ({ byLot: { 'A-1': { months: frise().slice(0, 3) } } }) });
    expect(r.encMois).toBe(0);
    expect(r.attMois).toBe(0);
  });
});

describe('Accueil téléphone — « reste à encaisser » ne peut pas contredire « À regarder »', () => {
  it('loyer payé d’AVANCE le mois précédent → rien ne reste dû', () => {
    // Le locataire a versé deux mois le 28 août. Septembre ne porte AUCUN cash daté, mais le
    // maître sait que c'est une avance : `loyerRetard` = 0. `attendu - encaissé` aurait annoncé
    // « reste 900 € à encaisser » pendant que « À regarder » disait « tout est à jour ».
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (
        i === MOIS - 2 ? { encaisse: 1800, avance: 900 } : (i === MOIS - 1 ? { encaisse: 0 } : {})
      )) } } })
    });
    expect(r.encMois).toBe(0);      // vrai : aucun euro n'est tombé ce mois-ci
    expect(r.attMois).toBe(900);
    expect(r.reste).toBe(0);        // et pourtant rien ne reste dû
    expect(r.pctPay).toBe(100);     // la barre est pleine, comme la bulle Impayés
  });

  it('mois réellement impayé → le reste est celui du maître', () => {
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (
        i === MOIS - 1 ? { encaisse: 200, loyerRetard: 600, chargeRetard: 100 } : {}
      )) } } })
    });
    expect(r.reste).toBe(700);
    expect(r.pctPay).toBe(22);      // (900 − 700) / 900
  });

  it('paiement PARTIEL qui éponge un arriéré : le reste du maître prime sur la soustraction', () => {
    // 500 € reçus, dont 200 € sont allés à un arriéré plus ancien : 300 € seulement ont servi
    // le mois, dont le dû est 900 → il en manque 600. « attendu − encaissé » dirait 400 €, et
    // sous-estimerait la dette. Le maître, lui, sait où est parti chaque euro.
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (
        i === MOIS - 1 ? { encaisse: 500, loyerRetard: 600, chargeRetard: 0, rattrapage: 200 } : {}
      )) } } })
    });
    expect(r.attMois - r.encMois).toBe(400);  // ce que la soustraction aurait dit
    expect(r.reste).toBe(600);                // ce que le maître dit
    expect(r.sub).toBe('reste 600 € à encaisser');
  });

  it('TOLÉRANCE DU 10 : rien n’est payé, mais rien n’est « en retard » — et l’écran le dit', () => {
    // Avant le 10, le moteur ne compte pas le manque NEUF du mois courant comme un retard
    // (`finances-monthly.js:87`). Le résidu tombe à 0 — ce qui ne veut pas dire que l'argent
    // est rentré. Dire « tout est encaissé » le 5, sur un loyer que personne n'a payé, est faux.
    const r = calculer({
      ...BASE,
      _finWindows: () => ({ constat: { lastMonth: MOIS, dueMonth: MOIS }, exigibilite: { graceLast: true } }),
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (i === MOIS - 1 ? { encaisse: 0 } : {})) } } })
    });
    expect(r.grace).toBe(true);
    expect(r.encMois).toBe(0);
    expect(r.reste).toBe(0);
    expect(r.sub).toBe('rien en retard · à régler avant le 10');
    expect(r.sub).not.toContain('tout est encaissé');
  });

  it('le mois COUVERT PAR UNE AVANCE se distingue du mois pas encore exigible', () => {
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (i === MOIS - 1 ? { encaisse: 0 } : {})) } } })
    });
    expect(r.sub).toBe('rien en retard · couvert par une avance');
  });

  it('« tout est encaissé » ne se dit que quand l’argent est vraiment rentré', () => {
    expect(calculer(BASE).sub).toBe('tout est encaissé');
  });

  it('JANVIER : la dette des exercices antérieurs ne s’affiche pas sous le dû du mois', () => {
    // Le moteur attribue au premier mois la position d'ouverture de l'exercice précédent :
    // six mois d'arriéré affichaient « reste 6 300 € » à côté d'un dénominateur de 900 €.
    const r = calculer({
      ...BASE,
      moNow: 1,
      _finMonthly: () => ({ byLot: { 'A-1': { months: [
        { ym: '2026-01', duHC: 800, duCH: 100, encaisse: 0, loyerRetard: 6300, chargeRetard: 0, avance: 0, rattrapage: 0 }
      ] } } })
    });
    expect(r.attMois).toBe(900);
    expect(r.reste).toBe(900);   // borné au mois, pas 6 300
    expect(r.pctPay).toBe(0);
  });

  it('sans moteur, le reste redevient une soustraction — et il est dit que c’est un repli', () => {
    const r = calculer({ ...BASE, _finMonthly: undefined, _v4ComputeLotStatus: () => ({ recu: 300, attendu: 900 }) });
    expect(r.reste).toBe(600);
    expect(r.pctPay).toBe(33);
  });

  it('aucun dû ce mois-ci : l’écran le DIT, il ne dit pas « tout est encaissé »', () => {
    // « Tout est encaissé » sur « 0 € / 0 € » est une affirmation vide. Un lot vacant, ou un
    // parc dont aucun lot n'a de dû, tombait dessus faute d'avoir son propre état.
    const r = calculer({ ...BASE, _finMonthly: () => ({ byLot: { 'A-1': { months: frise({ duHC: 0, duCH: 0, encaisse: 0 }) } } }) });
    expect(r.attMois).toBe(0);
    expect(r.reste).toBe(0);
    expect(r.pctPay).toBe(100);
    expect(r.sub).toBe('rien de dû ce mois-ci');
  });

  it('un remboursement sur un lot sans dû n’invente pas une avance', () => {
    // Bail terminé en août ; le 20 septembre le bailleur rend 450 € de trop-perçu. `encaisse`
    // est un NET : il vaut −450. `encMois + 0.5 >= attMois` était alors faux, et l'écran
    // concluait « rien en retard · couvert par une avance » — aucune avance n'existait.
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (
        i === MOIS - 1 ? { duHC: 0, duCH: 0, encaisse: -450 } : {}
      )) } } })
    });
    expect(r.encMois).toBe(-450);
    expect(r.attMois).toBe(0);
    expect(r.sub).toBe('rien de dû ce mois-ci');
  });

  it('JANVIER sur un bail clos : la dette d’ouverture ne se colle pas à un dû de zéro', () => {
    // Un ex-locataire rembourse 300 € en janvier ; son lot rentre dans `byLot` avec 6 000 € de
    // position d'ouverture et AUCUN dû. L'écran annonçait « 300 € / 0 € · reste 6 000 € », barre
    // pleine. La borne ne s'appliquait pas faute de dénominateur.
    const r = calculer({
      ...BASE,
      moNow: 1,
      _finMonthly: () => ({ byLot: { 'A-1': { months: [
        { ym: '2026-01', duHC: 0, duCH: 0, encaisse: 300, loyerRetard: 6000, chargeRetard: 0, avance: 0, rattrapage: 0 }
      ] } } })
    });
    expect(r.reste).toBe(0);
    expect(r.sub).toBe('rien de dû ce mois-ci');
  });

  it('sans fenêtre d’exigibilité, l’écran n’explique pas ce qu’il ignore', () => {
    // `_finWindows` peut rendre null alors que `_finMonthly` répond quand même : le moteur
    // recalcule alors SA tolérance de son côté. On ne sait plus si le résidu nul vient d'une
    // avance ou du 10 du mois — donc on ne l'affirme pas.
    const r = calculer({
      ...BASE,
      _finWindows: () => null,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (i === MOIS - 1 ? { encaisse: 0 } : {})) } } })
    });
    expect(r.graceConnu).toBe(false);
    expect(r.sub).toBe('rien en retard');
  });
});

describe('Accueil téléphone — l’occupation se lit sur le bail, et nomme son dénominateur', () => {
  it('un bail repris (cache vide) compte comme loué', () => {
    // AVANT : `DashCtx.occupationKpis` lisait `l.locataire` → 0 lot loué, 0 %.
    const r = calculer(BASE);
    expect(r.occ.nbOcc).toBe(1);
    expect(r.occ.nbTotal).toBe(1);
  });

  it('le taux affiché est celui du moteur (en jours), et le sous-titre le dit', () => {
    // « 1 lot loué sur 1 » avec 32 % se contredit à l'œil tant que le dénominateur n'est pas nommé.
    const r = calculer({ ...BASE, _computeOccupationLots: () => ({ louableDays: 266, taux: 31.95 }) });
    expect(r.occ.pctOcc).toBe(32);
    expect(r.occSub).toBe('taux en jours sur l’année');
  });

  it('aucun jour louable → compte des lots, et le sous-titre change de dénominateur', () => {
    const r = calculer({ ...BASE, _computeOccupationLots: () => ({ louableDays: 0, taux: 0 }) });
    expect(r.occ.pctOcc).toBe(100);
    expect(r.occSub).toBe('taux à l’instant');
  });

  it('la fenêtre d’occupation est celle du PC : du 1ᵉʳ janvier à aujourd’hui', () => {
    let vu = null;
    calculer({ ...BASE, _computeOccupationLots: (db, lots, w) => { vu = w; return { louableDays: 266, taux: 100 }; },
      window: { _loyerTodayLocal: () => '2026-09-23' } });
    expect(vu).toEqual({ from: '2026-01-01', to: '2026-09-23' });
  });
});

describe('Accueil téléphone — les libellés (lecture de source, pas d’exécution)', () => {
  it('la ligne du mois dit « Loyers encaissés », le cumul annuel dit « Encaissé »', () => {
    // Le cumul annuel compte TOUTES les recettes ; la ligne du mois, les seuls loyers des lots.
    // Sous un même mot « Encaissé », les deux chiffres se seraient contredits à l'œil.
    expect(html).toContain('<div class="k">Loyers encaissés ce mois');
    expect(html).toContain('<div class="k">Encaissé depuis le 1ᵉʳ janvier</div>');
  });

  it('le sous-titre d’occupation porte le dénominateur du pourcentage', () => {
    expect(html).toContain("+occ.nbTotal+' · '+occSub+'</span>");
  });
});
