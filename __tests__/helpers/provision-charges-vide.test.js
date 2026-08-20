// LOT 3 du chantier ÉCRITURES DESTRUCTRICES — « une provision vidée écrit 0 € dans le barème ».
//
// MESURÉ dans le navigateur sur origin/main (v15.541), lot MUL-002 :
//   1. un bail dont la provision vaut '' (chaîne vide) et log.ch === '' ;
//      → le barème garde sa période 2022-04-01 544 + 136.
//      PROVENANCE de cet état (rectifiée par l'audit) : ce n'est PAS l'import du fichier de
//      référence — celui-ci écrit `parseFloat(...)||0`, donc un 0. C'est openAnnonce
//      (index.html) qui prenait une RÉFÉRENCE VIVANTE sur DB.baux[ref] et y écrivait
//      `bail.ch = log.chargesRef || log.ch || ''` : ouvrir la modale « Annonce » modifiait le
//      bail en base. Corrigé dans le même chantier (travail sur une copie).
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
import { periodeEnVigueurA, provisionPourRevision } from '../../js/core/loyer-du-mois.js';

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

  it('CAS VÉCU : bail dont la provision est VIDE → le barème garde 95, pas 0', () => {
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: 655, ch: '' });
    expect(out[0].ch).toBe(95);
    expect(out[0].hc).toBe(655);
  });

  it('un ZÉRO explicitement saisi écrit bien 0 (le geste de l\'utilisateur fait foi)', () => {
    const out = synchroniserPeriodeBail(periodeConnue(), { ref: 'MUL-005', debut: '2023-09-01', hc: 655, ch: 0 });
    expect(out[0].ch).toBe(0);
  });

  it('même règle sur le LOYER : un hc non saisi ne met pas le loyer à 0', () => {
    // même producteur, même dégât : le loyer du lot passait à 0 € pour tous les mois suivants.
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

describe('provisionPourRevision — la chaîne réellement appelée par _baremeRecordRevision', () => {
  // La première version de ce bloc RECOPIAIT la composition dans le test : inverser deux
  // sources dans index.html l'aurait laissé vert. On appelle maintenant la fonction exportée,
  // celle que le monolithe invoque (window._loyerProvisionPourRevision).
  const bareme = [{ ref: 'MUL-002', debut: '2022-04-01', fin: null, hc: 544, ch: 136, source: 'bail' }];
  const pour = (bailCh, logCh, dateEffet) => provisionPourRevision(bareme, 'MUL-002', dateEffet, bailCh, logCh);

  it('CAS VÉCU : bail.ch === \'\' et log.ch === \'\' → la révision reprend 136, plus 0', () => {
    expect(pour('', '', '2026-09-01')).toBe(136);
  });
  it('LE BARÈME EN VIGUEUR PASSE EN TÊTE : une correction manuelle datée n\'est pas annulée', () => {
    // _histoSaveCorrPeriode (index.html) n'écrit QUE dans le barème ; bail.ch reste sur l'ancienne
    // valeur. Reprendre bail.ch ici annulerait la correction à la révision suivante.
    expect(pour(136, 136, '2026-09-01')).toBe(136);
    const corrige = [{ ref: 'MUL-002', debut: '2022-04-01', fin: null, hc: 544, ch: 110, source: 'manuel' }];
    expect(provisionPourRevision(corrige, 'MUL-002', '2026-09-01', 136, 136)).toBe(110);
  });
  it('barème lacunaire (lot non migré) → repli sur le bail, puis sur le lot', () => {
    expect(provisionPourRevision([], 'MUL-002', '2026-09-01', 150, 120)).toBe(150);
    expect(provisionPourRevision([], 'MUL-002', '2026-09-01', '', 120)).toBe(120);
  });
  it('un 0 réellement saisi au barème reste 0', () => {
    const zero = [{ ref: 'MUL-002', debut: '2022-04-01', fin: null, hc: 544, ch: 0, source: 'manuel' }];
    expect(provisionPourRevision(zero, 'MUL-002', '2026-09-01', 136, 136)).toBe(0);
  });
  it('personne ne sait (aucune période antérieure, rien sur le bail ni le lot) → 0 assumé', () => {
    expect(pour('', '', '2020-01-01')).toBe(0);
  });
  it('BORNE bailDebut : la période ouverte du locataire PRÉCÉDENT ne dicte pas la provision', () => {
    // barème mal refermé : la période de l'ancien bail court toujours à la date d'effet. Sans
    // borne, elle gagnait sur le bail courant (100 au lieu de 150) — le nouveau locataire héritait
    // de la provision de l'ancien.
    const malReferme = [
      { ref: 'L', debut: '2020-01-01', fin: null, hc: 500, ch: 100, source: 'bail', bailDebut: '2020-01-01' }
    ];
    expect(provisionPourRevision(malReferme, 'L', '2027-06-01', 150, 150, '2027-01-01')).toBe(150);
    // sans bailDebut connu, comportement inchangé (la borne ne s'applique pas)
    expect(provisionPourRevision(malReferme, 'L', '2027-06-01', 150, 150)).toBe(100);
  });

  it('PAS DE CONTAMINATION entre locataires : un trou avant la date d\'effet ne remonte rien', () => {
    const avecTrou = [
      { ref: 'MUL-002', debut: '2020-01-01', fin: '2021-12-31', hc: 400, ch: 200, source: 'bail' }
    ];
    expect(provisionPourRevision(avecTrou, 'MUL-002', '2026-09-01', '', '')).toBe(0);
  });
});
