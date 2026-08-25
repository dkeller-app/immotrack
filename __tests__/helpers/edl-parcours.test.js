/**
 * __tests__/helpers/edl-parcours.test.js — chantier EDL TERRAIN, lots 5 et 7.
 *
 * CDC docs/CDC-EDL.md §4, §6, §A.1, §A.6, §9 invariants 23 à 25 et le verdict déduit.
 *
 * Tests de COMPORTEMENT sur le module pur (jamais `has('<source>')` sur index.html) :
 * l'invariant clé est « verdict = verdictDe(entrée, sortie), jamais stocké ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  VERDICTS, verdictDe, elementRenseigne, aUneObs, aUnePhoto, avertObsSortie,
  progressionPiece, compterEcarts, compterAConstater, statsPiece, statsGlobales,
  railLabel, indexClamp, suivante, precedente, aSuivante, aPrecedente,
  edlSortieQuiFaitFoi, troncaturePellicule, layoutVisionneuse,
  entreeVerrouillee, photoEntreeVerrouillee,
} from '../../js/core/edl-parcours.js';

const elem = (o = {}) => ({ nom: 'x', etatE: '', obsE: '', photosE: [], etatS: '', obsS: '', photosS: [], ...o });

describe('verdictDe — le verdict est DÉDUIT (§A.6), jamais présumé', () => {
  it('rien constaté en sortie → à constater, même avec un état d\'entrée', () => {
    expect(verdictDe('Bon état', '')).toBe(VERDICTS.A_CONSTATER);
    expect(verdictDe('Bon état', null)).toBe(VERDICTS.A_CONSTATER);
    expect(verdictDe('Bon état', '   ')).toBe(VERDICTS.A_CONSTATER);
  });
  it('même état des deux côtés → conforme', () => {
    expect(verdictDe('Bon état', 'Bon état')).toBe(VERDICTS.CONFORME);
  });
  it('état différent → écart', () => {
    expect(verdictDe('Neuf', 'Mauvais état')).toBe(VERDICTS.ECART);
  });
  it('constaté en sortie sans état d\'entrée → écart (jamais conforme par défaut)', () => {
    expect(verdictDe('', 'Bon état')).toBe(VERDICTS.ECART);
    expect(verdictDe(null, 'Mauvais état')).toBe(VERDICTS.ECART);
  });
  it('un état de sortie vide n\'est JAMAIS conforme, quel que soit l\'entrée', () => {
    for (const e of ['Neuf', 'Bon état', "État d'usage", 'Mauvais état', 'Absent', '']) {
      expect(verdictDe(e, '')).toBe(VERDICTS.A_CONSTATER);
    }
  });
  it('§A.6 invariant — le verdict est DÉDUIT, JAMAIS STOCKÉ : calculer ne mute pas l\'élément', () => {
    const x = Object.freeze({ etatE: 'Neuf', etatS: 'Mauvais état', obsE: '', obsS: '' });
    // si verdictDe (ou un appelant) écrivait x.verdict, Object.freeze le ferait échouer
    // en mode strict ; ici on vérifie surtout qu'aucune propriété « verdict » n'apparaît.
    const v = verdictDe(x.etatE, x.etatS);
    expect(v).toBe(VERDICTS.ECART);
    expect('verdict' in x).toBe(false);
    expect(Object.keys(x)).toEqual(['etatE', 'etatS', 'obsE', 'obsS']);
    // et il se recalcule à l'identique, encore et encore (aucun état caché)
    expect(verdictDe(x.etatE, x.etatS)).toBe(v);
  });
});

describe('§A.6 / valeur probante — l\'entrée SIGNÉE est verrouillée en sortie (état, obs, photos)', () => {
  it('entreeVerrouillee : verrouillée dès qu\'on est en mode sortie, jamais en entrée', () => {
    expect(entreeVerrouillee(true)).toBe(true);   // sortie → état + obs d'entrée figés
    expect(entreeVerrouillee(false)).toBe(false); // entrée → on saisit normalement
  });
  it('photoEntreeVerrouillee : SEULE la photo d\'ENTRÉE en SORTIE est protégée', () => {
    expect(photoEntreeVerrouillee('E', true)).toBe(true);   // photo d'entrée en sortie → jamais supprimable
    expect(photoEntreeVerrouillee('S', true)).toBe(false);  // photo de sortie → éditable
    expect(photoEntreeVerrouillee('E', false)).toBe(false); // en entrée, la photo d'entrée s'édite
    expect(photoEntreeVerrouillee('S', false)).toBe(false);
  });
  it('ces prédicats sont ce qui empêche edlObs/edlEtat/edlDelPhoto de muter le constat signé', () => {
    // le geste réel (obsE / delete non mutants en sortie) est prouvé au navigateur ;
    // ici on verrouille la DÉCISION : entrée verrouillée ⇔ isSortie, photo ⇔ (E ∧ sortie).
    for (const s of [true, false]) expect(entreeVerrouillee(s)).toBe(s);
    for (const side of ['E', 'S']) for (const s of [true, false])
      expect(photoEntreeVerrouillee(side, s)).toBe(side === 'E' && s);
  });
});

describe('§A.6 visionneuse — troncaturePellicule (« +N » au-delà de 3, jusqu\'à 8 photos)', () => {
  it('série courte : tout visible, pas de +N', () => {
    expect(troncaturePellicule(0)).toEqual({ visibles: 0, plusN: 0 });
    expect(troncaturePellicule(3)).toEqual({ visibles: 3, plusN: 0 });
  });
  it('série longue : 3 visibles + le reste en +N', () => {
    expect(troncaturePellicule(5)).toEqual({ visibles: 3, plusN: 2 });
    expect(troncaturePellicule(8)).toEqual({ visibles: 3, plusN: 5 }); // le max réel (Séjour > Murs)
  });
  it('cap paramétrable', () => {
    expect(troncaturePellicule(8, 2)).toEqual({ visibles: 2, plusN: 6 });
  });
});

describe('§A.6 visionneuse — layoutVisionneuse (téléphone = pellicule, PC/tablette = colonnes)', () => {
  it('sous 768 → pellicule ; à partir de 768 → colonnes', () => {
    expect(layoutVisionneuse(375)).toBe('pellicule');
    expect(layoutVisionneuse(767)).toBe('pellicule');
    expect(layoutVisionneuse(768)).toBe('colonnes'); // tablette AVEC PC pour la visionneuse (§A.6)
    expect(layoutVisionneuse(1280)).toBe('colonnes');
  });
});

/* §A.6 invariant « la photo portrait rend une image ENTIÈREMENT VISIBLE » — son
   mécanisme est object-fit:contain sur la grande image (et cover sur les vignettes
   de liste). jsdom ne calcule pas de layout : la preuve numérique (portrait 120×240
   rendu entier dans son cadre) est faite au navigateur, sur 3 formats. Ici, un garde
   qui échoue si la grande image passait en `cover` (le bug exact signalé par Didier :
   cadre 4/3 cover qui coupait les photos verticales). On lit la DÉCLARATION, pas un
   extrait figé : on isole la règle .epv-big-img et on vérifie sa propriété. */
describe('§A.6 CSS — la grande image est en contain (jamais rognée), les vignettes en cover', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'css', 'main.css'), 'utf8');
  const ruleBody = (selector) => {
    const i = css.indexOf(selector + '{');
    if (i < 0) return null;
    return css.slice(i + selector.length + 1, css.indexOf('}', i));
  };
  const objectFit = (selector) => {
    const body = ruleBody(selector);
    if (body == null) return null;
    const m = body.match(/object-fit\s*:\s*([a-z-]+)/);
    return m ? m[1] : null;
  };
  it('.epv-big-img est en object-fit:contain', () => {
    expect(objectFit('.epv-big-img'), 'la grande image doit être contain, jamais cover').toBe('contain');
  });
  it('.epv-thumb img (pellicule de la visionneuse) est en object-fit:cover', () => {
    expect(objectFit('.epv-thumb img')).toBe('cover');
  });
  it('.edl-thumb (vignette de liste dans l\'élément) est en object-fit:cover', () => {
    expect(objectFit('.edl-thumb'), 'la vignette de liste doit être cover ; l\'entier s\'ouvre au clic').toBe('cover');
  });
});

describe('avertObsSortie — prévient sans décider (§A.6 reco)', () => {
  it('observation de sortie mais aucun écart → avertit', () => {
    expect(avertObsSortie(elem({ etatE: 'Bon état', etatS: 'Bon état', obsS: 'trace' }))).toBe(true); // conforme + obs
    expect(avertObsSortie(elem({ etatE: 'Bon état', etatS: '', obsS: 'rayure' }))).toBe(true);          // à constater + obs
  });
  it('observation de sortie AVEC écart → pas d\'avertissement (déjà tranché)', () => {
    expect(avertObsSortie(elem({ etatE: 'Neuf', etatS: 'Mauvais état', obsS: 'cassé' }))).toBe(false);
  });
  it('pas d\'observation de sortie → pas d\'avertissement', () => {
    expect(avertObsSortie(elem({ etatE: 'Bon état', etatS: 'Bon état', obsS: '' }))).toBe(false);
  });
});

describe('elementRenseigne / obs / photo — le bon côté', () => {
  it('entrée regarde etatE, sortie regarde etatS', () => {
    const x = elem({ etatE: 'Neuf', etatS: '' });
    expect(elementRenseigne(x, false)).toBe(true);
    expect(elementRenseigne(x, true)).toBe(false);
  });
  it('obs et photo distinguent entrée et sortie', () => {
    const x = elem({ obsE: 'a', photosS: [{ idbKey: 'k' }] });
    expect(aUneObs(x, false)).toBe(true);
    expect(aUneObs(x, true)).toBe(false);
    expect(aUnePhoto(x, true)).toBe(true);
    expect(aUnePhoto(x, false)).toBe(false);
  });
});

describe('progression et écarts — au volume d\'une pièce réelle', () => {
  const piece = {
    nom: 'Cuisine',
    elements: [
      elem({ etatE: 'Neuf', etatS: 'Neuf' }),          // conforme
      elem({ etatE: 'Bon état', etatS: 'Mauvais état' }), // écart
      elem({ etatE: "État d'usage", etatS: '' }),       // à constater (pas rempli en sortie)
      elem({ etatE: '', etatS: '' }),                    // vierge
    ],
  };
  it('progression entrée : 3 remplis sur 4', () => {
    expect(progressionPiece(piece, false)).toEqual({ total: 4, remplis: 3, restants: 1 });
  });
  it('progression sortie : 2 remplis sur 4', () => {
    expect(progressionPiece(piece, true)).toEqual({ total: 4, remplis: 2, restants: 2 });
  });
  it('un seul écart, deux à constater', () => {
    expect(compterEcarts(piece)).toBe(1);
    expect(compterAConstater(piece)).toBe(2);
  });
  it('statsPiece expose écarts en sortie et 0 en entrée', () => {
    expect(statsPiece(piece, true).ecarts).toBe(1);
    expect(statsPiece(piece, false).ecarts).toBe(0);
    expect(statsPiece(piece, false).complete).toBe(false);
  });
  it('pièce complète quand aucun restant', () => {
    const pleine = { nom: 'WC', elements: [elem({ etatE: 'Neuf' }), elem({ etatE: 'Bon état' })] };
    expect(statsPiece(pleine, false).complete).toBe(true);
  });
});

describe('statsGlobales — agrégat sur plusieurs pièces', () => {
  const pieces = [
    { nom: 'A', elements: [elem({ etatE: 'Neuf', etatS: 'Mauvais état' }), elem({ etatE: 'Neuf', etatS: 'Neuf' })] },
    { nom: 'B', elements: [elem({ etatE: '', etatS: '' })] },
  ];
  it('compte pièces, éléments, écarts et %', () => {
    const g = statsGlobales(pieces, true);
    expect(g.pieces).toBe(2);
    expect(g.total).toBe(3);
    expect(g.remplis).toBe(2);   // 2 états de sortie posés
    expect(g.ecarts).toBe(1);
    expect(g.pct).toBe(67);      // 2/3
  });
  it('pièces vides → pct 0, pas de division par zéro', () => {
    expect(statsGlobales([], false).pct).toBe(0);
    expect(statsGlobales([{ nom: 'z', elements: [] }], false).pct).toBe(0);
  });
});

describe('railLabel (§A.1) — « Cuisine · 3 / 8 »', () => {
  it('formate nom + position 1-based', () => {
    expect(railLabel('Cuisine', 2, 8)).toBe('Cuisine · 3 / 8');
  });
  it('sans total valable, rend le nom seul', () => {
    expect(railLabel('Cuisine', 0, 0)).toBe('Cuisine');
  });
});

describe('navigation — bornée, jamais de boucle (§9 inv. 23-24)', () => {
  it('clamp aux bords', () => {
    expect(indexClamp(-3, 8)).toBe(0);
    expect(indexClamp(99, 8)).toBe(7);
    expect(indexClamp(3, 8)).toBe(3);
  });
  it('suivante/precedente ne débordent jamais', () => {
    expect(suivante(7, 8)).toBe(7);   // dernière : reste
    expect(precedente(0, 8)).toBe(0); // première : reste
    expect(suivante(3, 8)).toBe(4);
    expect(precedente(3, 8)).toBe(2);
  });
  it('aSuivante / aPrecedente pour griser les flèches', () => {
    expect(aPrecedente(0, 8)).toBe(false);
    expect(aSuivante(7, 8)).toBe(false);
    expect(aSuivante(0, 8)).toBe(true);
    expect(aPrecedente(7, 8)).toBe(true);
  });
});

describe('edlSortieQuiFaitFoi — P9 (§9 inv. 34h) : le plus récent de la fenêtre, jamais le premier', () => {
  const bail = { ref: 'FERRETTE-101', debut: '2025-01-01' };
  it('sans EDL de sortie → null', () => {
    expect(edlSortieQuiFaitFoi(bail, [])).toBe(null);
    expect(edlSortieQuiFaitFoi(bail, [{ logement: 'FERRETTE-101', type: 'Entrée', date: '2025-01-01' }])).toBe(null);
  });
  it('LE BUG P9 : logement reloué → ignore la sortie du locataire PRÉCÉDENT (avant le début du bail)', () => {
    const edls = [
      { id: 1, logement: 'FERRETTE-101', type: 'Sortie', date: '2024-06-30' }, // locataire précédent
      { id: 2, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-05-15' }, // locataire actuel
    ];
    // l'ordre d'insertion mettait la sortie 2024 en premier → find() la prenait (bug)
    expect(edlSortieQuiFaitFoi(bail, edls).id).toBe(2);
  });
  it('plusieurs sorties dans la fenêtre → la PLUS RÉCENTE', () => {
    const edls = [
      { id: 1, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-02-01' },
      { id: 2, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-05-15' },
      { id: 3, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-03-10' },
    ];
    expect(edlSortieQuiFaitFoi(bail, edls).id).toBe(2);
  });
  it('ignore les EDL supprimés, d\'un autre logement, ou d\'entrée', () => {
    const edls = [
      { id: 1, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-09-01', _deleted: true },
      { id: 2, logement: 'AUTRE-002', type: 'Sortie', date: '2026-09-02' },
      { id: 3, logement: 'FERRETTE-101', type: 'Entrée', date: '2026-09-03' },
      { id: 4, logement: 'FERRETTE-101', type: 'Sortie', date: '2026-04-04' },
    ];
    expect(edlSortieQuiFaitFoi(bail, edls).id).toBe(4);
  });
  it('bail sans début : garde le plus récent sans filtre de fenêtre', () => {
    const edls = [
      { id: 1, logement: 'X', type: 'Sortie', date: '2020-01-01' },
      { id: 2, logement: 'X', type: 'Sortie', date: '2026-01-01' },
    ];
    expect(edlSortieQuiFaitFoi({ ref: 'X' }, edls).id).toBe(2);
  });
});
