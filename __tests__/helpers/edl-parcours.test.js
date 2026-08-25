/**
 * __tests__/helpers/edl-parcours.test.js — chantier EDL TERRAIN, lots 5 et 7.
 *
 * CDC docs/CDC-EDL.md §4, §6, §A.1, §A.6, §9 invariants 23 à 25 et le verdict déduit.
 *
 * Tests de COMPORTEMENT sur le module pur (jamais `has('<source>')` sur index.html) :
 * l'invariant clé est « verdict = verdictDe(entrée, sortie), jamais stocké ».
 */
import { describe, it, expect } from 'vitest';
import {
  VERDICTS, verdictDe, elementRenseigne, aUneObs, aUnePhoto, avertObsSortie,
  progressionPiece, compterEcarts, compterAConstater, statsPiece, statsGlobales,
  railLabel, indexClamp, suivante, precedente, aSuivante, aPrecedente,
  edlSortieQuiFaitFoi,
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
