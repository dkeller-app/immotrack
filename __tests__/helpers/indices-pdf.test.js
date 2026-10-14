// __tests__/helpers/indices-pdf.test.js — VERIF-DOCUMENTS lot 2 : indices techniques des fichiers PDF (sans IA).
// Faits seulement, chacun avec sa limite (« ne permet pas de conclure ») ; aucun mot de jugement.
import { describe, it, expect } from 'vitest';
import { lireDatePdf, compterEnregistrements, trouverSuperpositions, indicesTechniques, LIMITE } from '../../js/core/indices-pdf.js';

const enc = (s) => new TextEncoder().encode(s);
const INTERDITS = /fraude|frauduleu|faux|fausse|falsifi|suspect|douteu|(?<!véri)fiable|truqu|mensong/i;

describe('dates PDF', () => {
  it('formats courants, fuseaux, valeurs absurdes', () => {
    expect(lireDatePdf('D:20260724080000Z').toISOString()).toBe('2026-07-24T08:00:00.000Z');
    expect(lireDatePdf("D:20260724100000+02'00'").toISOString()).toBe('2026-07-24T08:00:00.000Z');
    expect(lireDatePdf('D:2026').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(lireDatePdf('')).toBeNull();
    expect(lireDatePdf('n\'importe quoi')).toBeNull();
    expect(lireDatePdf('D:00010101')).toBeNull();
  });
});

describe('enregistrements successifs', () => {
  it('un fichier simple : 1 ; mise à jour incrémentale : 2 ; linéarisé : la 2e table d\'origine ne compte pas', () => {
    expect(compterEnregistrements(enc('%PDF-1.7\n...startxref\n123\n%%EOF'))).toEqual({ enregistrements: 1, lineaire: false });
    expect(compterEnregistrements(enc('%PDF-1.7\nstartxref 1 %%EOF\n...startxref 2 %%EOF'))).toMatchObject({ enregistrements: 2 });
    expect(compterEnregistrements(enc('%PDF-1.7\n<</Linearized 1>>startxref 1 %%EOF startxref 2 %%EOF'))).toEqual({ enregistrements: 1, lineaire: true });
    expect(compterEnregistrements(enc('%PDF-1.7\n<</Linearized 1>>startxref startxref startxref'))).toMatchObject({ enregistrements: 2 });
    expect(compterEnregistrements(new Uint8Array())).toEqual({ enregistrements: 0, lineaire: false });
  });
});

describe('textes superposés', () => {
  it('deux textes différents au même endroit d\'une même page', () => {
    const items = [{ page: 1, str: '31 540 EUR', x: 300, y: 632 }, { page: 1, str: 'Revenu fiscal', x: 40, y: 632 }, { page: 1, str: '41 540 EUR', x: 300.4, y: 632.2 }];
    expect(trouverSuperpositions(items)).toEqual([{ page: 1, textes: ['31 540 EUR', '41 540 EUR'] }]);
  });
  it('pas d\'indice : même texte répété (effet de gras), autre page, espaces, positions éloignées', () => {
    expect(trouverSuperpositions([{ page: 1, str: 'TOTAL', x: 10, y: 10 }, { page: 1, str: 'TOTAL ', x: 10, y: 10 }])).toEqual([]);
    expect(trouverSuperpositions([{ page: 1, str: 'A', x: 10, y: 10 }, { page: 2, str: 'B', x: 10, y: 10 }])).toEqual([]);
    expect(trouverSuperpositions([{ page: 1, str: ' ', x: 10, y: 10 }, { page: 1, str: 'B', x: 10, y: 10 }])).toEqual([]);
    expect(trouverSuperpositions([{ page: 1, str: 'A', x: 10, y: 10 }, { page: 1, str: 'B', x: 12, y: 10 }])).toEqual([]);
    expect(trouverSuperpositions(null)).toEqual([]);
  });
  it('borné à 5 constats', () => {
    const items = []; for (let i = 0; i < 20; i++) items.push({ page: 1, str: 'a' + i, x: 1, y: 1 });
    expect(trouverSuperpositions(items).length).toBe(5);
  });
});

describe('constats T1-T3', () => {
  it('T1 : modifié plus d\'un jour après la création, avec logiciels et nombre de jours', () => {
    const c = indicesTechniques({ metadonnees: { createur: 'Logiciel de paie X', producteur: 'Éditeur PDF 12.4', creeLe: 'D:20260728090000Z', modifieLe: 'D:20261009211400Z' } });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ code: 'T1', titre: 'Le fichier a été modifié après sa création.' });
    expect(c[0].detail).toBe('Créé le 28/07/2026 avec « Logiciel de paie X », modifié le 09/10/2026 avec « Éditeur PDF 12.4 » (73 jours plus tard). ' + LIMITE);
  });
  it('pas de T1 : dates égales, écart de quelques heures, dates manquantes', () => {
    expect(indicesTechniques({ metadonnees: { creeLe: 'D:20260728090000Z', modifieLe: 'D:20260728090000Z' } })).toEqual([]);
    expect(indicesTechniques({ metadonnees: { creeLe: 'D:20260728090000Z', modifieLe: 'D:20260728200000Z' } })).toEqual([]);
    expect(indicesTechniques({ metadonnees: { modifieLe: 'D:20261009211400Z' } })).toEqual([]);
    expect(indicesTechniques({})).toEqual([]);
    expect(indicesTechniques(null)).toEqual([]);
  });
  it('T2 et T3', () => {
    const c = indicesTechniques({ enregistrements: 3, superpositions: [{ page: 1, textes: ['31 540 EUR', '41 540 EUR'] }] });
    expect(c.map((x) => x.code)).toEqual(['T2', 'T3']);
    expect(c[0].titre).toBe('Le fichier a été enregistré 3 fois (mises à jour successives).');
    expect(c[1].detail).toContain('« 31 540 EUR » et « 41 540 EUR »');
  });
  it('chaque constat dit sa limite et ne porte aucun mot de jugement', () => {
    const c = indicesTechniques({ metadonnees: { createur: 'A', creeLe: 'D:20260101', modifieLe: 'D:20260301' }, enregistrements: 2, superpositions: [{ page: 2, textes: ['a', 'b'] }] });
    expect(c).toHaveLength(3);
    for (const x of c) { expect(x.detail).toMatch(/ne permet pas de conclure/); expect(x.titre + x.detail).not.toMatch(INTERDITS); expect(x.source).toBeTruthy(); }
  });
});

describe('relecture du 14/10 (Opus) : recherche de superpositions bornée', () => {
  it('100 000 éléments de texte : réponse rapide, résultat exact', () => {
    const items = []; for (let i = 0; i < 100000; i++) items.push({ page: 1 + (i % 3), str: 'mot' + i, x: (i * 7) % 500, y: i });
    items.unshift({ page: 1, str: 'AAA', x: 300, y: 50.5 }, { page: 1, str: 'BBB', x: 300.3, y: 50.9 });   // les 20 000 premiers éléments sont examinés
    const t0 = Date.now(); const r = trouverSuperpositions(items);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(r).toEqual([{ page: 1, textes: ['AAA', 'BBB'] }]);
  });
});
