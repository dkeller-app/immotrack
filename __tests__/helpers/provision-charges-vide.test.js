// LOT 3 du chantier ÉCRITURES DESTRUCTRICES — « une provision vidée écrit 0 € dans le barème ».
//
// MESURÉ dans le navigateur sur origin/main (v15.541), lot MUL-002 :
//   1. import d'un fichier de référence dont la colonne « charges » est VIDE
//      → DB.baux['MUL-002'].ch === ''  (chaîne vide, pas 0), log.ch === '' ;
//      → le barème garde sa période 2022-04-01 544 + 136.
//   2. première révision IRL (620 € au 01/09/2026)
//      → 2022-04-01 544+136 (close) · 2026-09-01 620 + 0  ← LA PROVISION A DISPARU
//   3. et sans même une révision : ouvrir ce bail puis Enregistrer, sans rien toucher
//      → 2023-09-01 655+95 devient 655 + 0 (mesuré sur MUL-005), sans popup ni avertissement.
//
// Cause : `''` passe le test `!= null` (index.html), puis `Number('') || 0` vaut 0. Un champ
// VIDE est donc traité comme un ZÉRO — exactement ce que le CDC Finances §M-1 bis interdit :
// l'app ne devine rien, un zéro doit être une saisie explicite.
//
// RÈGLE ENCODÉE ICI : une valeur NON SAISIE ne remplace jamais une valeur connue. On descend la
// chaîne des sources (bail → lot → période en vigueur au barème) et on ne retombe sur 0 que si
// personne ne sait. Un 0 réellement saisi, lui, reste un 0.

import { describe, it, expect } from 'vitest';
import { montantSaisi, premierMontantSaisi, synchroniserPeriodeBail } from '../../js/core/loyer-bareme.js';
import { periodeEnVigueurA } from '../../js/core/loyer-du-mois.js';

describe('montantSaisi — « rien de saisi » ≠ « zéro »', () => {
  it('rend null quand rien n\'a été saisi', () => {
    expect(montantSaisi('')).toBe(null);
    expect(montantSaisi('   ')).toBe(null);
    expect(montantSaisi(null)).toBe(null);
    expect(montantSaisi(undefined)).toBe(null);
    expect(montantSaisi('abc')).toBe(null);
    expect(montantSaisi(NaN)).toBe(null);
  });
  it('rend le nombre quand il a été saisi — y compris un ZÉRO explicite', () => {
    expect(montantSaisi(0)).toBe(0);
    expect(montantSaisi('0')).toBe(0);
    expect(montantSaisi(136)).toBe(136);
    expect(montantSaisi('136')).toBe(136);
    expect(montantSaisi('95.5')).toBe(95.5);
  });
});

describe('premierMontantSaisi — la chaîne des sources', () => {
  it('prend la première source réellement saisie', () => {
    expect(premierMontantSaisi('', '', 136)).toBe(136);
    expect(premierMontantSaisi('', 95, 136)).toBe(95);
    expect(premierMontantSaisi(70, 95, 136)).toBe(70);
  });
  it('un ZÉRO explicite en tête de chaîne gagne (c\'est une saisie)', () => {
    expect(premierMontantSaisi(0, 95, 136)).toBe(0);
  });
  it('rend null quand aucune source ne sait — l\'appelant décide du plancher', () => {
    expect(premierMontantSaisi('', null, undefined)).toBe(null);
    expect(premierMontantSaisi()).toBe(null);
  });
});

describe('periodeEnVigueurA — le résolveur du barème, réutilisé (aucun moteur concurrent)', () => {
  const bareme = [
    { ref: 'F-001', debut: '2022-04-01', fin: '2026-08-31', hc: 544, ch: 136, source: 'bail' },
    { ref: 'F-001', debut: '2026-09-01', fin: null, hc: 620, ch: 136, source: 'irl' },
    { ref: 'AUTRE', debut: '2020-01-01', fin: null, hc: 1, ch: 1, source: 'bail' }
  ];
  it('rend la période en vigueur à la date, pour le bon lot', () => {
    expect(periodeEnVigueurA(bareme, 'F-001', '2026-05-01').ch).toBe(136);
    expect(periodeEnVigueurA(bareme, 'F-001', '2026-09-15').hc).toBe(620);
  });
  it('rend null avant la première période, et hors lot', () => {
    expect(periodeEnVigueurA(bareme, 'F-001', '2021-01-01')).toBe(null);
    expect(periodeEnVigueurA(bareme, 'INCONNU', '2026-05-01')).toBe(null);
  });
  it('ref tolérante et tombstones filtrés (mêmes règles que duMois)', () => {
    expect(periodeEnVigueurA(bareme, ' f-001 ', '2026-05-01').ch).toBe(136);
    const mort = [{ ref: 'F-001', debut: '2022-04-01', fin: null, hc: 1, ch: 1, _deleted: true }];
    expect(periodeEnVigueurA(mort, 'F-001', '2026-05-01')).toBe(null);
  });
});

describe('synchroniserPeriodeBail — une provision non saisie n\'écrase plus celle du barème', () => {
  const periodeConnue = () => ([
    { ref: 'MUL-005', debut: '2023-09-01', fin: null, hc: 655, ch: 95, source: 'bail', bailDebut: '2023-09-01' }
  ]);

  it('CAS VÉCU : bail dont la provision est VIDE (import) → le barème garde 95, pas 0', () => {
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: 655, ch: '' });
    expect(out[0].ch).toBe(95);
    expect(out[0].hc).toBe(655);
  });

  it('un ZÉRO explicitement saisi écrit bien 0 (le geste de l\'utilisateur fait foi)', () => {
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: 655, ch: 0 });
    expect(out[0].ch).toBe(0);
  });

  it('même règle sur le LOYER : un hc non saisi ne met pas le loyer à 0', () => {
    // un import à colonne « loyer » vide mettait le loyer du lot à 0 € pour tous les mois suivants.
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: '', ch: 95 });
    expect(out[0].hc).toBe(655);
    expect(out[0].ch).toBe(95);
  });

  it('une saisie normale continue de piloter la période (pas de blocage)', () => {
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: 670, ch: 100 });
    expect(out[0].hc).toBe(670);
    expect(out[0].ch).toBe(100);
  });

  it('CRÉATION : rien de connu nulle part → la période initiale part à 0 (plancher assumé)', () => {
    const out = synchroniserPeriodeBail([], { ref: 'NEW-001', debut: '2026-09-01', hc: 640, ch: '' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ debut: '2026-09-01', hc: 640, ch: 0, source: 'bail' });
  });

  it('IDEMPOTENCE : deux enregistrements d\'affilée avec un champ vide ne dérivent pas', () => {
    const bail = { ref: 'MUL-005', debut: '2023-09-01', hc: 655, ch: '' };
    const un = synchroniserPeriodeBail(periodeConnue(), bail);
    const deux = synchroniserPeriodeBail(un, bail);
    expect(deux).toEqual(un);
  });
});

describe('la chaîne complète d\'une révision IRL (ce que _baremeRecordRevision compose)', () => {
  // bail → lot → période en vigueur au barème → 0. C'est la composition câblée dans index.html ;
  // on la vérifie ici sur les pièces pures, avec l'état exactement mesuré sur MUL-002.
  const bareme = [{ ref: 'MUL-002', debut: '2022-04-01', fin: null, hc: 544, ch: 136, source: 'bail' }];
  const provisionPour = (bailCh, logCh, dateEffet) => {
    const p = periodeEnVigueurA(bareme, 'MUL-002', dateEffet);
    const n = premierMontantSaisi(bailCh, logCh, p && p.ch);
    return n != null ? n : 0;
  };

  it('CAS VÉCU : bail.ch === \'\' et log.ch === \'\' → la révision reprend 136, plus 0', () => {
    expect(provisionPour('', '', '2026-09-01')).toBe(136);
  });
  it('le bail sait → le bail gagne', () => {
    expect(provisionPour(150, '', '2026-09-01')).toBe(150);
  });
  it('le bail ne sait pas mais le lot sait → le lot gagne', () => {
    expect(provisionPour('', 120, '2026-09-01')).toBe(120);
  });
  it('un 0 saisi sur le bail reste 0', () => {
    expect(provisionPour(0, 120, '2026-09-01')).toBe(0);
  });
  it('personne ne sait (aucune période antérieure) → 0, plancher assumé', () => {
    expect(provisionPour('', '', '2020-01-01')).toBe(0);
  });
});
