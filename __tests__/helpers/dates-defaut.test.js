/**
 * CDC-LOYERS-DESIGN §4, surfaces 6/7/8 — les dates PROPOSÉES dans les documents.
 * Règle : la date réelle si elle existe, RIEN sinon. Jamais « aujourd'hui » en repli.
 */
import { describe, it, expect } from 'vitest';
import { dateVersementDG, dateRestitutionDG, dateEDLSortie, dateLiberation } from '../../js/core/dates-defaut.js';

const MV = [
  { qui: 'A-01', cat: 'Dépôt de garantie', lib: 'DG entrée', cr: 800, db: 0, date: '2024-03-04' },
  { qui: 'A-01', cat: 'Dépôt de garantie', lib: 'Complément DG', cr: 200, db: 0, date: '2024-04-11' },
  { qui: 'A-01', cat: 'Loyers', lib: 'Loyer mars', cr: 700, db: 0, date: '2024-03-05' },
  { qui: 'A-01', cat: 'Autre', lib: 'Restitution du dépôt de garantie', cr: 0, db: 950, date: '2026-05-20' },
  { qui: 'B-02', cat: 'Dépôt de garantie', lib: '', cr: 600, db: 0, date: '2025-01-09' },
  { qui: 'A-01', cat: 'Dépôt de garantie', lib: 'annulé', cr: 999, db: 0, date: '2020-01-01', _deleted: true }
];

describe('Surface 6 — « versé le … » du reçu de dépôt de garantie', () => {
  it('propose le PREMIER versement de DG du lot, pas le complément', () => {
    expect(dateVersementDG(MV, 'A-01')).toBe('2024-03-04');
  });
  it('ignore les mouvements supprimés', () => {
    expect(dateVersementDG(MV, 'A-01')).not.toBe('2020-01-01');
  });
  it('ne confond pas un loyer avec un dépôt de garantie', () => {
    expect(dateVersementDG([{ qui: 'C-03', cat: 'Loyers', lib: 'Loyer', cr: 700, date: '2026-02-05' }], 'C-03')).toBeNull();
  });
  it('reconnaît le DG au LIBELLÉ même si la catégorie ne le dit pas', () => {
    expect(dateVersementDG([{ qui: 'C-03', cat: 'Autre', lib: 'Caution reçue', cr: 700, date: '2026-02-05' }], 'C-03')).toBe('2026-02-05');
  });
  it('aucun mouvement de DG : RIEN (surtout pas aujourd\'hui)', () => {
    expect(dateVersementDG(MV, 'Z-99')).toBeNull();
    expect(dateVersementDG(null, 'A-01')).toBeNull();
  });
});

describe('Surface 7 — la date de restitution du dépôt de garantie', () => {
  it('propose le décaissement de DG le plus récent', () => {
    expect(dateRestitutionDG(MV, 'A-01')).toBe('2026-05-20');
  });
  it('un DG encaissé n\'est pas une restitution', () => {
    expect(dateRestitutionDG(MV, 'B-02')).toBeNull();
  });
  it('restitution pas encore faite : RIEN — l\'écran ne pré-remplit pas une date qui n\'est celle de rien', () => {
    expect(dateRestitutionDG([], 'A-01')).toBeNull();
  });
});

describe('Surface 8 — l\'attestation de logement libéré', () => {
  const EDL = [
    { logement: 'A-01', type: 'Entrée', date: '2024-03-01' },
    { logement: 'A-01', type: 'Sortie', date: '2026-04-28' },
    { logement: 'A-01', type: 'Sortie', date: '2026-04-30', _deleted: true }
  ];
  it('la date d\'EDL de sortie vient de l\'EDL, pas d\'aujourd\'hui', () => {
    expect(dateEDLSortie(EDL, 'A-01')).toBe('2026-04-28');
  });
  it('aucun EDL de sortie : RIEN', () => {
    expect(dateEDLSortie(EDL, 'B-02')).toBeNull();
    expect(dateEDLSortie([], 'A-01')).toBeNull();
  });
  it('la libération suit la sortie déclarée au départ en priorité', () => {
    expect(dateLiberation({ depart: { dateSortie: '2026-04-25' }, finEffective: '2026-04-30' }, '2026-04-28')).toBe('2026-04-25');
  });
  it('à défaut, la fin effective du bail, puis l\'EDL de sortie', () => {
    expect(dateLiberation({ finEffective: '2026-04-30' }, '2026-04-28')).toBe('2026-04-30');
    expect(dateLiberation({}, '2026-04-28')).toBe('2026-04-28');
  });
  it('rien de tout ça : RIEN', () => {
    expect(dateLiberation({}, null)).toBeNull();
    expect(dateLiberation(null, null)).toBeNull();
  });
  it('une date malformée n\'est jamais retournée', () => {
    expect(dateLiberation({ finEffective: 'bientôt' }, null)).toBeNull();
    expect(dateEDLSortie([{ logement: 'A-01', type: 'Sortie', date: 'n/c' }], 'A-01')).toBeNull();
  });
});
