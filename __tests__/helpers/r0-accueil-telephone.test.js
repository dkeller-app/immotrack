/**
 * R0-F — l'Accueil TÉLÉPHONE lit le même moteur que l'Accueil PC.
 *
 * Le téléphone sommait `_v4ComputeLotStatus(l).recu`, c'est-à-dire les seuls loyers alloués à un
 * lot. Le PC, lui, affiche les RECETTES du moteur Finances. Sur un compte réel avec une indemnité
 * GLI, le PC annonçait 1 150 € et le téléphone 900 € — pour la même question, le même jour.
 * CDC-FINANCES §0bis : « un chiffre d'argent présent sur deux écrans doit être le même octet ».
 *
 * Ce test EXÉCUTE le bloc de calcul extrait d'index.html. Il ne se contente pas de lire la forme
 * du code : il vérifie les chiffres produits, moteur présent puis moteur absent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

/** Le bloc de calcul de `_renderAccueilPhone`, depuis l'occupation jusqu'au cumul annuel. */
function blocCalcul() {
  const i = html.indexOf('  // R0-F — L\'Accueil TELEPHONE');
  const fin = '  else logs.forEach(function(l){ try{ encYTD += (_v4ComputeLotStatus(l, yr, \'\', ctx.mvsYTD).recu||0); }catch(e){} });';
  const j = html.indexOf(fin, i);
  if (i === -1 || j === -1) return null;
  return html.slice(i, j + fin.length);
}

/**
 * Exécute ce bloc avec des dépendances contrôlées et rend {occ, encMois, attMois, encYTD}.
 * `deps` permet de retirer une pièce du moteur pour éprouver les replis.
 */
function calculer(deps) {
  const src = blocCalcul();
  if (!src) throw new Error('bloc de calcul introuvable — le test ne teste plus rien');
  const noms = ['logs', 'yr', 'moNow', 'ctx', 'DB', 'window', '_lotEstLoue', '_computeOccupationLots',
    '_dashCfReel', '_finEntScope', '_finWindows', '_finMonthly', '_v4ComputeLotStatus'];
  const f = new Function(...noms, src + '\nreturn { occ:occ, encMois:encMois, attMois:attMois, encYTD:encYTD };');
  return f(...noms.map(n => deps[n]));
}

// Un parc d'un seul lot, loué toute l'année. Le locataire paie 900 € de loyer, et l'assureur
// verse 250 € d'indemnité GLI : le moteur encaisse 1 150 €, la somme des loyers du lot 900 €.
const LOTS = [{ ref: 'A-1', locataire: '' }];
const BASE = {
  logs: LOTS,
  yr: '2026',
  moNow: 9,
  ctx: { yr: '2026', activeEnt: '', mvs: [], mvsYTD: [], scopeLogs: LOTS },
  DB: {},
  window: {},
  _lotEstLoue: (l) => !!l && l.ref === 'A-1',
  _computeOccupationLots: () => ({ louableDays: 273, taux: 100 }),
  _dashCfReel: () => ({ recettes: 1150 }),
  _finEntScope: () => ({}),
  _finWindows: () => ({ constat: '2026-09-23' }),
  _finMonthly: () => ({ byLot: { 'A-1': { months: Array.from({ length: 12 }, () => ({ encaisse: 900, duHC: 800, duCH: 100 })) } } }),
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
        'A-1': { months: Array.from({ length: 12 }, () => ({ encaisse: 900, duHC: 800, duCH: 100 })) },
        'Z-9': { months: Array.from({ length: 12 }, () => ({ encaisse: 5000, duHC: 5000, duCH: 0 })) }
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

  it('sans moteur (file://, service-worker périmé), l’écran affiche encore un chiffre', () => {
    // Le repli n'invente rien : il redonne l'ancien calcul, explicitement.
    const r = calculer({ ...BASE, _finMonthly: undefined, _dashCfReel: undefined });
    expect(r.encMois).toBe(900);
    expect(r.encYTD).toBe(900);
  });

  it('un moteur qui lève ne casse pas l’écran d’accueil', () => {
    const r = calculer({ ...BASE, _finMonthly: () => { throw new Error('boum'); } });
    expect(r.encMois).toBe(900); // repli
  });
});

describe('Accueil téléphone — l’occupation se lit sur le bail', () => {
  it('un bail repris (cache vide) compte comme loué', () => {
    // AVANT : `DashCtx.occupationKpis` lisait `l.locataire` → 0 lot loué, 0 %.
    const r = calculer(BASE);
    expect(r.occ.nbOcc).toBe(1);
    expect(r.occ.nbTotal).toBe(1);
  });

  it('le taux affiché est celui du moteur d’occupation (en jours), pas un instantané', () => {
    // 1 lot sur 1 ferait 100 % en instantané ; le moteur, lui, compte 182 jours sur 273.
    const r = calculer({ ...BASE, _computeOccupationLots: () => ({ louableDays: 273, taux: 66.6 }) });
    expect(r.occ.pctOcc).toBe(67);
  });

  it('aucun jour louable → on retombe sur le compte des lots, jamais sur NaN', () => {
    const r = calculer({ ...BASE, _computeOccupationLots: () => ({ louableDays: 0, taux: 0 }) });
    expect(r.occ.pctOcc).toBe(100);
  });
});

describe('Accueil téléphone — le libellé ne promet pas ce qu’il ne montre pas', () => {
  it('la ligne du mois dit « Loyers encaissés », le cumul annuel dit « Encaissé »', () => {
    // Le cumul annuel compte TOUTES les recettes ; la ligne du mois, les seuls loyers des lots.
    // Sous un même mot « Encaissé », les deux chiffres se seraient contredits à l'œil.
    expect(html).toContain('<div class="k">Loyers encaissés ce mois');
    expect(html).toContain('<div class="k">Encaissé depuis le 1ᵉʳ janvier</div>');
  });
});
