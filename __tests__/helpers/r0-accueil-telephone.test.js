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
    '    : (encMois>0?100:0);');
  return (a && b) ? (a + '\n' + b) : null;
}

/**
 * Exécute ce bloc avec des dépendances contrôlées et rend tout ce qui s'affiche.
 * `deps` permet de retirer une pièce du moteur pour éprouver les replis.
 */
function calculer(deps) {
  const src = blocCalcul();
  if (!src) throw new Error('bloc de calcul introuvable — le test ne teste plus rien');
  const noms = ['logs', 'yr', 'moNow', 'ctx', 'DB', 'window', '_lotEstLoue', '_computeOccupationLots',
    '_dashCfReel', '_finEntScope', '_finWindows', '_finMonthly', '_v4ComputeLotStatus'];
  const f = new Function(...noms, src +
    '\nreturn { occ:occ, occSub:occSub, encMois:encMois, attMois:attMois, encYTD:encYTD, reste:reste, pctPay:pctPay };');
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
  _lotEstLoue: (l) => !!l && l.ref === 'A-1',
  _computeOccupationLots: () => ({ louableDays: 266, taux: 100 }),
  _dashCfReel: () => ({ recettes: 1150 }),
  _finEntScope: () => ({}),
  _finWindows: () => ({ constat: '2026-09-23' }),
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

  it('paiement PARTIEL : le reste du maître prime sur la soustraction', () => {
    // Le maître a nettoyé 300 € d'arriéré avec ce versement : le résidu du mois est 150 €,
    // pas les 400 € que donnerait « attendu − encaissé ».
    const r = calculer({
      ...BASE,
      _finMonthly: () => ({ byLot: { 'A-1': { months: frise(i => (
        i === MOIS - 1 ? { encaisse: 500, loyerRetard: 150, chargeRetard: 0, rattrapage: 300 } : {}
      )) } } })
    });
    expect(r.attMois - r.encMois).toBe(400);  // ce que la soustraction aurait dit
    expect(r.reste).toBe(150);                // ce que le maître dit
  });

  it('sans moteur, le reste redevient une soustraction — et il est dit que c’est un repli', () => {
    const r = calculer({ ...BASE, _finMonthly: undefined, _v4ComputeLotStatus: () => ({ recu: 300, attendu: 900 }) });
    expect(r.reste).toBe(600);
    expect(r.pctPay).toBe(33);
  });

  it('aucun dû ce mois-ci → pas de division par zéro', () => {
    const r = calculer({ ...BASE, _finMonthly: () => ({ byLot: { 'A-1': { months: frise({ duHC: 0, duCH: 0, encaisse: 0 }) } } }) });
    expect(r.attMois).toBe(0);
    expect(r.reste).toBe(0);
    expect(Number.isFinite(r.pctPay)).toBe(true);
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
