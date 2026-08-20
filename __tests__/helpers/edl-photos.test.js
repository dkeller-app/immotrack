/**
 * __tests__/helpers/edl-photos.test.js — chantier EDL TERRAIN, lot 0.
 *
 * CDC docs/CDC-EDL.md §9, invariants 22 et 34i :
 *   22.  « Ouvrir un EDL de 98 photos ne monte pas les 98 binaires en mémoire d'un coup. »
 *   34i. « Ouvrir un EDL ne monte en mémoire que les photos visibles. »
 *
 * Le volume des fixtures est le volume RÉEL mesuré (CDC §0.1) : l'EDL F3 du
 * 04/06 porte 98 photos, l'EDL Ferrette-101 en porte 77 sur 8 pièces /
 * 110 éléments. On ne teste pas sur 3 lignes.
 */
import { describe, it, expect } from 'vitest';
import {
  collectEdlPhotos, edlPhotoKeys, photoIndexByKey, photosToHydrate, keysInViewband,
  EDL_COMPTEUR_PHOTO_KEYS,
} from '../../js/core/edl-photos.js';

/** Fabrique un EDL au volume réel : nbPieces × nbElemsParPiece, nbPhotos réparties. */
function edlReel({ pieces = 8, elemsParPiece = 14, photos = 77 } = {}) {
  const rec = { pieces: [], cles: [], compteursPhotos: {}, mobilier: { elements: [] } };
  let n = 0;
  for (let p = 0; p < pieces; p++) {
    const elements = [];
    for (let e = 0; e < elemsParPiece; e++) elements.push({ nom: `El ${p}-${e}`, photosE: [], photosS: [] });
    rec.pieces.push({ nom: `Pièce ${p}`, elements });
  }
  // Réparti en tournant sur les éléments, jusqu'à 8 photos sur un même élément
  // (« Séjour > Murs » dans l'EDL réel).
  while (n < photos) {
    const p = n % pieces;
    const e = Math.floor(n / pieces) % elemsParPiece;
    rec.pieces[p].elements[e].photosE.push({ idbKey: `ph_${n}`, name: `photo ${n}.jpg` });
    n++;
  }
  return rec;
}

describe('collectEdlPhotos — la source unique de la liste des photos', () => {
  it('ramasse les 98 photos de l’EDL réel F3', () => {
    const rec = edlReel({ pieces: 6, elemsParPiece: 15, photos: 98 });
    expect(collectEdlPhotos(rec)).toHaveLength(98);
  });

  it('ramasse pièces (E+S), clés (E+S), compteurs et mobilier', () => {
    const rec = {
      pieces: [{ elements: [{ photosE: [{ idbKey: 'a' }], photosS: [{ idbKey: 'b' }] }] }],
      cles: [{ photos: [{ idbKey: 'c' }], photosS: [{ idbKey: 'd' }] }],
      compteursPhotos: { elec: [{ idbKey: 'e' }], eauFS: [{ idbKey: 'f' }] },
      mobilier: { elements: [{ photosE: [{ idbKey: 'g' }], photosS: [{ idbKey: 'h' }] }] },
    };
    expect(edlPhotoKeys(rec).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('couvre les 8 emplacements de compteurs, entrée et sortie', () => {
    const cpt = {};
    EDL_COMPTEUR_PHOTO_KEYS.forEach((k, i) => { cpt[k] = [{ idbKey: 'cpt_' + i }]; });
    expect(edlPhotoKeys({ compteursPhotos: cpt })).toHaveLength(EDL_COMPTEUR_PHOTO_KEYS.length);
  });

  it('ignore une photo sans idbKey et déduplique une photo partagée', () => {
    const rec = {
      pieces: [{ elements: [
        { photosE: [{ idbKey: 'x' }, { name: 'sans clé' }] },
        { photosE: [{ idbKey: 'x' }] },
      ] }],
    };
    expect(edlPhotoKeys(rec)).toEqual(['x']);
  });

  it('ne casse pas sur un enregistrement vide, nul ou mal formé', () => {
    expect(collectEdlPhotos(null)).toEqual([]);
    expect(collectEdlPhotos({})).toEqual([]);
    expect(collectEdlPhotos({ pieces: [null], cles: [null], mobilier: { elements: [null] } })).toEqual([]);
  });
});

describe('photosToHydrate — invariants 22 et 34i', () => {
  it('ouvrir un EDL de 98 photos sans vignette visible ne charge RIEN', () => {
    const photos = collectEdlPhotos(edlReel({ pieces: 6, elemsParPiece: 15, photos: 98 }));
    expect(photos).toHaveLength(98);
    expect(photosToHydrate({ photos, visibleKeys: [], cache: {} })).toHaveLength(0);
  });

  it('sur 77 photos réelles, seules les vignettes visibles sont montées', () => {
    const photos = collectEdlPhotos(edlReel({ photos: 77 }));
    const visibles = photos.slice(0, 6).map(p => p.idbKey);
    const aCharger = photosToHydrate({ photos, visibleKeys: visibles, cache: {} });
    expect(aCharger.map(p => p.idbKey)).toEqual(visibles);
    // Aucune photo hors du champ visible ne peut sortir d'ici.
    expect(aCharger.every(p => visibles.includes(p.idbKey))).toBe(true);
  });

  it('ne recharge pas une photo déjà en mémoire', () => {
    const photos = collectEdlPhotos(edlReel({ photos: 77 }));
    const visibles = photos.slice(0, 6).map(p => p.idbKey);
    const cache = { [visibles[0]]: 'data:image/jpeg;base64,AAA', [visibles[3]]: 'data:image/jpeg;base64,BBB' };
    const aCharger = photosToHydrate({ photos, visibleKeys: visibles, cache });
    expect(aCharger.map(p => p.idbKey)).toEqual([visibles[1], visibles[2], visibles[4], visibles[5]]);
  });

  it('accepte un Set de clés visibles et ne rend jamais de doublon', () => {
    const photos = [{ idbKey: 'a' }, { idbKey: 'a' }, { idbKey: 'b' }];
    const out = photosToHydrate({ photos, visibleKeys: new Set(['a', 'b']), cache: {} });
    expect(out.map(p => p.idbKey)).toEqual(['a', 'b']);
  });

  it('sans argument, ne charge rien plutôt que de planter', () => {
    expect(photosToHydrate()).toEqual([]);
  });
});

describe('keysInViewband — ce qui est réellement à l’écran', () => {
  /** 77 vignettes réparties sur les 42 843 px mesurés dans l'app au volume réel. */
  function rectsReels(scrollTop) {
    const HAUTEUR = 42843, N = 77, PAS = HAUTEUR / N;
    return Array.from({ length: N }, (_, i) => {
      const top = i * PAS - scrollTop;
      return { idbKey: 'ph_' + i, top, bottom: top + 72 };
    });
  }

  it('en haut de l’EDL réel, une poignée de vignettes au plus — jamais les 77', () => {
    const dans = keysInViewband(rectsReels(0), { viewportHeight: 812, margin: 300 });
    expect(dans.length).toBeGreaterThan(0);
    expect(dans.length).toBeLessThan(10);
    expect(dans.length).toBeLessThan(77);
  });

  it('au milieu du défilement, seules les vignettes du milieu sortent', () => {
    const dans = keysInViewband(rectsReels(20000), { viewportHeight: 812, margin: 300 });
    expect(dans.length).toBeLessThan(10);
    expect(dans).not.toContain('ph_0');
    expect(dans).not.toContain('ph_76');
  });

  it('une vignette très au-dessus ou très au-dessous est exclue', () => {
    const rects = [
      { idbKey: 'haut', top: -5000, bottom: -4928 },
      { idbKey: 'ecran', top: 100, bottom: 172 },
      { idbKey: 'bas', top: 9000, bottom: 9072 },
    ];
    expect(keysInViewband(rects, { viewportHeight: 812, margin: 300 })).toEqual(['ecran']);
  });

  it('la marge fait entrer ce qui arrive juste avant l’écran', () => {
    const juste = [{ idbKey: 'proche', top: 900, bottom: 972 }];
    expect(keysInViewband(juste, { viewportHeight: 812, margin: 300 })).toEqual(['proche']);
    expect(keysInViewband(juste, { viewportHeight: 812, margin: 0 })).toEqual([]);
  });

  it('modale pas encore affichée (rectangles plats) : AUCUNE vignette hydratée', () => {
    // Cas mesuré dans l'app : à l'ouverture, le rendu des pièces a lieu avant
    // l'affichage de la modale → tous les rectangles valent 0. Sans garde-fou,
    // les 77 photos réelles étaient toutes déclarées visibles et rechargées.
    const plats = Array.from({ length: 77 }, (_, i) => ({ idbKey: 'ph_' + i, top: 0, bottom: 0 }));
    expect(keysInViewband(plats, { viewportHeight: 812, margin: 300 })).toEqual([]);
  });

  it('sans rectangles, ne rend rien', () => {
    expect(keysInViewband(null, { viewportHeight: 812 })).toEqual([]);
    expect(keysInViewband([{ top: 0, bottom: 10 }], { viewportHeight: 812 })).toEqual([]);
  });
});

describe('photoIndexByKey — retrouver le cloudKey d’une vignette à hydrater', () => {
  it('indexe par idbKey et conserve le cloudKey', () => {
    const idx = photoIndexByKey([{ idbKey: 'a', cloudKey: 'esp/ent/files/a' }, { name: 'sans clé' }]);
    expect(idx.a.cloudKey).toBe('esp/ent/files/a');
    expect(Object.keys(idx)).toEqual(['a']);
  });
});
