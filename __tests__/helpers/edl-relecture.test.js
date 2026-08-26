/**
 * __tests__/helpers/edl-relecture.test.js — chantier EDL-TÉLÉPHONE, étape 4 (CDC §2.7).
 * Tests de comportement sur le module pur (jamais d'extrait de source).
 */
import { describe, it, expect } from 'vitest';
import {
  estNote, bilanRelecture, lignesSignalees, pieceAUnEcart, alertesRelecture, recapSignature,
} from '../../js/core/edl-relecture.js';

const el = (o = {}) => ({ nom: 'x', etatE: '', obsE: '', photosE: [], etatS: '', obsS: '', photosS: [], ...o });
const piece = (nom, els) => ({ nom, elements: els });

// Une pièce : Sol B→B (conforme), Murs N→M (écart), Plafond B→'' (à constater),
// + une note « Autres observations » (exclue des comptes).
const P1 = piece('Cuisine', [
  el({ nom: 'Sol', etatE: 'B', etatS: 'B' }),
  el({ nom: 'Murs', etatE: 'N', etatS: 'M' }),
  el({ nom: 'Plafond', etatE: 'B', etatS: '' }),
  el({ nom: 'Autres observations', obsE: 'RAS', obsS: 'note libre' }),
]);

describe('estNote — les « Autres observations » sont des notes libres', () => {
  it('reconnaît la note, ignore le reste', () => {
    expect(estNote('Autres observations')).toBe(true);
    expect(estNote('autres  observations diverses')).toBe(true);
    expect(estNote('Sol')).toBe(false);
    expect(estNote('')).toBe(false);
  });
});

describe('bilanRelecture — sortie : conformes / écarts / à constater (notes exclues)', () => {
  it('compte par verdict déduit, exclut la note', () => {
    const b = bilanRelecture([P1], true);
    expect(b).toMatchObject({ isSortie: true, total: 3, conformes: 1, ecarts: 1, aConstater: 1 });
  });
  it('U→U compte comme conforme (pas un écart)', () => {
    const b = bilanRelecture([piece('P', [el({ etatE: 'U', etatS: 'U', obsS: 'trace' })])], true);
    expect(b.conformes).toBe(1);
    expect(b.ecarts).toBe(0);
  });
  it('entrée : renseignés / non renseignés (notes exclues)', () => {
    const b = bilanRelecture([P1], false);
    // Sol,Murs,Plafond ont un etatE ; total 3 ; la note est exclue
    expect(b).toMatchObject({ isSortie: false, total: 3, renseignes: 3, nonRenseignes: 0 });
    const b2 = bilanRelecture([piece('P', [el({ nom: 'Sol', etatE: '' }), el({ nom: 'Murs', etatE: 'B' })])], false);
    expect(b2).toMatchObject({ total: 2, renseignes: 1, nonRenseignes: 1 });
  });
});

describe('lignesSignalees — écarts + à constater, pour « toucher → corriger »', () => {
  it('rend les lignes signalées avec leurs index, exclut conformes et notes', () => {
    const sig = lignesSignalees([P1]);
    expect(sig).toHaveLength(2);
    expect(sig.map(s => s.nom)).toEqual(['Murs', 'Plafond']);
    expect(sig[0]).toMatchObject({ pieceIdx: 0, elIdx: 1, verdict: 'ecart' });
    expect(sig[1]).toMatchObject({ pieceIdx: 0, elIdx: 2, verdict: 'a-constater' });
  });
});

describe('pieceAUnEcart — ouvrir d\'office les pièces avec écart', () => {
  it('vrai si au moins un écart, faux sinon', () => {
    expect(pieceAUnEcart(P1)).toBe(true);
    expect(pieceAUnEcart(piece('P', [el({ etatE: 'B', etatS: 'B' })]))).toBe(false);
    expect(pieceAUnEcart(piece('P', [el({ etatE: 'B', etatS: '' })]))).toBe(false); // à constater ≠ écart
  });
});

describe('alertesRelecture — non bloquantes', () => {
  it('sortie : à constater + clés non rendues', () => {
    const a = alertesRelecture([P1], true, { clesNonRendues: 1 });
    expect(a).toEqual(['1 élément non constaté', '1 clé non rendue']);
  });
  it('entrée : non renseignés', () => {
    const a = alertesRelecture([piece('P', [el({ etatE: '' }), el({ etatE: '' })])], false);
    expect(a).toEqual(['2 éléments non renseignés']);
  });
  it('tout complet sans écart → aucune alerte', () => {
    const a = alertesRelecture([piece('P', [el({ etatE: 'B', etatS: 'B' })])], true, {});
    expect(a).toEqual([]);
  });
});

describe('recapSignature — le pop-up « en connaissance de cause »', () => {
  it('sortie avec écarts + non renseignés + clé → 3 points, titre « Avant de signer »', () => {
    const r = recapSignature({ isSortie: true, ecarts: 2, nonRenseignes: 1, clesNonRendues: 1 });
    expect(r.clean).toBe(false);
    expect(r.titre).toBe('Avant de signer');
    expect(r.points.map(p => p.key)).toEqual(['ecarts', 'nonRenseignes', 'cles']);
    expect(r.points[0].texte).toContain('2 écarts');
  });
  it('tout propre → clean, titre « Confirmer la signature », aucun point', () => {
    const r = recapSignature({ isSortie: true, ecarts: 0, nonRenseignes: 0, clesNonRendues: 0 });
    expect(r.clean).toBe(true);
    expect(r.points).toEqual([]);
    expect(r.titre).toBe('Confirmer la signature');
  });
  it('entrée : pas d\'écart ni de clé, seulement non renseignés', () => {
    const r = recapSignature({ isSortie: false, ecarts: 5, nonRenseignes: 3, clesNonRendues: 4 });
    expect(r.points.map(p => p.key)).toEqual(['nonRenseignes']); // écarts/clés ignorés hors sortie
  });
  it('libellé aligné sur la bannière : sortie « non constaté(s) », entrée « non renseigné(s) »', () => {
    const s = recapSignature({ isSortie: true, nonRenseignes: 2 });
    expect(s.points[0].texte).toBe('2 éléments non constatés');
    const e = recapSignature({ isSortie: false, nonRenseignes: 1 });
    expect(e.points[0].texte).toBe('1 élément non renseigné');
  });
});
