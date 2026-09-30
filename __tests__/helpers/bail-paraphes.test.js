// __tests__/helpers/bail-paraphes.test.js — PARAPHE-UNIQUE (v15.709).
// Une image de paraphe PAR SIGNATAIRE au lieu d'une recopie par page ; lecture compatible des
// baux déjà signés à l'ancienne forme (paraphes[page][sigId]), qui sont verrouillés et ne sont
// jamais réécrits.
import { describe, it, expect } from 'vitest';
import { parapheDe, parapheCarte, compacterParaphes } from '../../js/core/bail-paraphes.js';

const B = 'data:image/png;base64,BAILLEUR';
const L = 'data:image/png;base64,LOCATAIRE';
const L2 = 'data:image/png;base64,LOCATAIRE2';
const t = (n) => '2026-09-30T10:' + String(n).padStart(2, '0') + ':00.000Z';

// Carte en mémoire telle que la popup la construit : { page → { sigId → dataURL } }, 10 pages,
// page 10 (§ des signatures) non paraphée.
function carteEtHeures(sigs, pages = 9) {
  const carte = {}, heures = {};
  for (let p = 1; p <= pages; p++) {
    carte[p] = {}; heures[p] = {};
    for (const [id, img] of sigs) { carte[p][id] = img; heures[p][id] = t(p); }
  }
  return { carte, heures };
}
// Ce que la persistance produit après un aller-retour JSON (clés de page en chaînes).
const json = (v) => JSON.parse(JSON.stringify(v));

describe('parapheDe — lecteur unique (deux formes)', () => {
  it('ancienne forme : lit paraphes[page][sigId]', () => {
    const sig = { paraphes: { 1: { 'bailleur-0': B }, 2: { 'bailleur-0': B, 'loc-0': L } } };
    expect(parapheDe(sig, 2, 'loc-0')).toBe(L);
    expect(parapheDe(sig, '2', 'loc-0')).toBe(L);
    expect(parapheDe(sig, 1, 'loc-0')).toBeNull();
    expect(parapheDe(sig, 3, 'bailleur-0')).toBeNull();
  });

  it('ancienne forme avec des images DIFFÉRENTES par page (avant v15.697) : chaque page garde la sienne', () => {
    const sig = { paraphes: { 1: { 'loc-0': L }, 2: { 'loc-0': L2 } } };
    expect(parapheDe(sig, 1, 'loc-0')).toBe(L);
    expect(parapheDe(sig, 2, 'loc-0')).toBe(L2);
  });

  it('nouvelle forme : image du signataire sur les pages où il a une heure de paraphe', () => {
    const sig = { paraphes: {}, parapheImg: { 'loc-0': L }, parapheTimes: { 3: { 'loc-0': t(3) } } };
    expect(parapheDe(sig, 3, 'loc-0')).toBe(L);
    expect(parapheDe(sig, 4, 'loc-0')).toBeNull();   // pas d'heure → pas paraphée
    expect(parapheDe(sig, 3, 'bailleur-0')).toBeNull();
  });

  it('heure présente sans image enregistrée → rien (jamais d’image inventée)', () => {
    expect(parapheDe({ parapheTimes: { 1: { 'loc-0': t(1) } } }, 1, 'loc-0')).toBeNull();
  });

  it('signatures absentes ou vides → null, sans lever', () => {
    expect(parapheDe(null, 1, 'loc-0')).toBeNull();
    expect(parapheDe(undefined, 1, 'loc-0')).toBeNull();
    expect(parapheDe({}, 1, 'loc-0')).toBeNull();
    expect(parapheDe({ paraphes: null, parapheImg: null, parapheTimes: null }, 1, 'loc-0')).toBeNull();
  });
});

describe('parapheCarte — carte { page → { sigId → image } } pour le PDF et la réouverture', () => {
  it('ancienne forme : restitue exactement la carte stockée', () => {
    const { carte } = carteEtHeures([['bailleur-0', B], ['loc-0', L]]);
    expect(parapheCarte(json({ paraphes: carte }))).toEqual(json(carte));
  });

  it('nouvelle forme : chaque page paraphée porte l’image de chaque signataire', () => {
    const sig = json({ paraphes: {}, parapheImg: { 'bailleur-0': B, 'loc-0': L },
      parapheTimes: { 1: { 'bailleur-0': t(1), 'loc-0': t(1) }, 2: { 'bailleur-0': t(2) } } });
    expect(parapheCarte(sig)).toEqual({ 1: { 'bailleur-0': B, 'loc-0': L }, 2: { 'bailleur-0': B } });
  });

  it('pages non paraphées absentes de la carte (la réouverture en déduit noParaphe)', () => {
    const sig = json({ paraphes: {}, parapheImg: { 'loc-0': L }, parapheTimes: { 1: { 'loc-0': t(1) }, 3: { 'loc-0': t(3) } } });
    const c = parapheCarte(sig);
    expect(Object.keys(c).sort()).toEqual(['1', '3']);
    expect(c[2]).toBeUndefined();
  });

  it('ancienne forme avec une page VIDE (parcours v12.94 sans pad) : la page reste dans la carte, vide', () => {
    // La réouverture en déduit « page à cases de paraphe » (cases vides dessinées) : rendu inchangé.
    const sig = json({ paraphes: { 1: { 'bailleur-0': B }, 2: {} } });
    expect(parapheCarte(sig)).toEqual({ 1: { 'bailleur-0': B }, 2: {} });
  });

  it('signatures absentes → carte vide', () => {
    expect(parapheCarte(null)).toEqual({});
    expect(parapheCarte({})).toEqual({});
  });
});

describe('compacterParaphes — écriture : une image par signataire', () => {
  it('2 signataires, 9 pages : une image chacun, plus aucune recopie par page', () => {
    const { carte, heures } = carteEtHeures([['bailleur-0', B], ['loc-0', L]]);
    const out = compacterParaphes(carte, heures);
    expect(out.parapheImg).toEqual({ 'bailleur-0': B, 'loc-0': L });
    expect(out.paraphes).toEqual({});
  });

  it('aller-retour sans perte : carte relue = carte d’origine (2 et 3 signataires)', () => {
    for (const sigs of [[['bailleur-0', B], ['loc-0', L]], [['bailleur-0', B], ['loc-0', L], ['loc-1', L2]]]) {
      const { carte, heures } = carteEtHeures(sigs);
      const stocke = json({ ...compacterParaphes(carte, heures), parapheTimes: heures });
      expect(parapheCarte(stocke)).toEqual(json(carte));
      for (let p = 1; p <= 10; p++) for (const [id] of sigs) expect(parapheDe(stocke, p, id)).toBe((carte[p] && carte[p][id]) || null);
    }
  });

  it('le poids stocké ne dépend plus du nombre de pages', () => {
    const petit = carteEtHeures([['bailleur-0', B], ['loc-0', L]], 2);
    const grand = carteEtHeures([['bailleur-0', B], ['loc-0', L]], 25);
    const img = (x) => JSON.stringify(compacterParaphes(x.carte, x.heures)).length;
    expect(img(grand)).toBe(img(petit));
  });

  it('signataire aux images différentes selon la page (ancien bail repris) : ses pages restent page par page, sans perte', () => {
    // Bailleur signé AVANT v15.697 (une image par page, pas d'heure), locataire signe maintenant.
    const carte = { 1: { 'bailleur-0': B, 'loc-0': L }, 2: { 'bailleur-0': L2, 'loc-0': L } };
    const heures = { 1: { 'loc-0': t(1) }, 2: { 'loc-0': t(2) } };
    const out = compacterParaphes(carte, heures);
    expect(out.parapheImg).toEqual({ 'loc-0': L });
    expect(out.paraphes).toEqual({ 1: { 'bailleur-0': B }, 2: { 'bailleur-0': L2 } });
    expect(parapheCarte(json({ ...out, parapheTimes: heures }))).toEqual(json(carte));
  });

  it('image unique mais une page sans heure (bail d’avant les heures de paraphe) : conservé page par page', () => {
    const carte = { 1: { 'bailleur-0': B }, 2: { 'bailleur-0': B } };
    const out = compacterParaphes(carte, { 1: { 'bailleur-0': t(1) } });
    expect(out.parapheImg).toEqual({});
    expect(out.paraphes).toEqual(carte);
  });

  it('une heure sans paraphe sur une page n’ajoute JAMAIS de paraphe fantôme à la relecture', () => {
    const carte = { 1: { 'loc-0': L } };
    const heures = { 1: { 'loc-0': t(1) }, 2: { 'loc-0': t(2) } };
    const out = compacterParaphes(carte, heures);
    expect(parapheCarte(json({ ...out, parapheTimes: heures }))).toEqual(json(carte));
  });

  it('2ᵉ signataire présent à la suite : le paraphe du 1er n’est ni perdu ni dupliqué', () => {
    // Bail déjà signé par le bailleur (nouvelle forme) → relu → le locataire paraphe → réécrit.
    const b = carteEtHeures([['bailleur-0', B]]);
    const apresBailleur = json({ ...compacterParaphes(b.carte, b.heures), parapheTimes: b.heures });
    const carte = parapheCarte(apresBailleur), heures = json(apresBailleur.parapheTimes);
    for (let p = 1; p <= 9; p++) { carte[p]['loc-0'] = L; heures[p]['loc-0'] = t(30 + p); }
    const final = json({ ...compacterParaphes(carte, heures), parapheTimes: heures });
    expect(final.parapheImg).toEqual({ 'bailleur-0': B, 'loc-0': L });
    expect(final.paraphes).toEqual({});
    for (let p = 1; p <= 9; p++) expect(parapheCarte(final)[p]).toEqual({ 'bailleur-0': B, 'loc-0': L });
  });

  it('ancien bail repris avec une page vide : la page vide survit à la réécriture', () => {
    const carte = { 1: { 'bailleur-0': B, 'loc-0': L }, 2: {} };
    const heures = { 1: { 'loc-0': t(1) } };
    const out = compacterParaphes(carte, heures);
    expect(out.paraphes).toEqual({ 1: { 'bailleur-0': B }, 2: {} });
    expect(parapheCarte(json({ ...out, parapheTimes: heures }))).toEqual(json(carte));
  });

  it('carte vide ou absente → rien à stocker', () => {
    expect(compacterParaphes({}, {})).toEqual({ paraphes: {}, parapheImg: {} });
    expect(compacterParaphes(null, null)).toEqual({ paraphes: {}, parapheImg: {} });
  });

  it('n’altère pas la carte ni les heures reçues', () => {
    const { carte, heures } = carteEtHeures([['bailleur-0', B]]);
    const avant = JSON.stringify([carte, heures]);
    compacterParaphes(carte, heures);
    expect(JSON.stringify([carte, heures])).toBe(avant);
  });
});
