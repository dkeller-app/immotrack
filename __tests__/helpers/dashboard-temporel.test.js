import { describe, it, expect } from 'vitest';
import { _bailEstActifAt, _loyerHCAtDate, _chargesAtDate } from './dashboard-temporel.js';

describe('_bailEstActifAt', () => {
  const log = { ref: 'F-001', debut: '2024-01-01', fin: '2025-06-30' };

  it('actif sur la période exacte', () => {
    expect(_bailEstActifAt(log, '2024-06-15')).toBe(true);
    expect(_bailEstActifAt(log, '2024-01-01')).toBe(true); // début inclus
    expect(_bailEstActifAt(log, '2025-06-30')).toBe(true); // fin inclus
  });

  it('inactif avant début', () => {
    expect(_bailEstActifAt(log, '2023-12-31')).toBe(false);
  });

  it('inactif après fin', () => {
    expect(_bailEstActifAt(log, '2025-07-01')).toBe(false);
  });

  it('bail sans fin → toujours actif après début', () => {
    const sansFin = { ref: 'F-002', debut: '2024-01-01' };
    expect(_bailEstActifAt(sansFin, '2026-12-31')).toBe(true);
    expect(_bailEstActifAt(sansFin, '2023-12-31')).toBe(false);
  });

  it('bail sans début → toujours faux', () => {
    expect(_bailEstActifAt({ ref: 'F-003' }, '2024-06-15')).toBe(false);
  });

  it('null/undefined → false sans crash', () => {
    expect(_bailEstActifAt(null, '2024-06-15')).toBe(false);
    expect(_bailEstActifAt(undefined, '2024-06-15')).toBe(false);
  });

  it('accepte Date instead of ISO string', () => {
    expect(_bailEstActifAt(log, new Date('2024-06-15T00:00:00'))).toBe(true);
  });
});

describe('_loyerHCAtDate', () => {
  // Bail démarré 1er jan 2024 à 800 HC, révisé 1er jan 2025 à 825 HC.
  const log = { ref: 'F-001', hc: 825, debut: '2024-01-01' };
  const histo = [
    { ref: 'F-001', dateRevision: '2025-01-01', ancienHC: 800, nouveauHC: 825 }
  ];

  it('avant 1ère révision → HC initial (ancienHC)', () => {
    expect(_loyerHCAtDate(log, '2024-06-15', histo)).toBe(800);
  });

  it('après révision → nouveau HC', () => {
    expect(_loyerHCAtDate(log, '2025-03-15', histo)).toBe(825);
  });

  it('à la date exacte de révision → nouveau HC', () => {
    expect(_loyerHCAtDate(log, '2025-01-01', histo)).toBe(825);
  });

  it('aucune révision → log.hc courant', () => {
    expect(_loyerHCAtDate(log, '2024-06-15', [])).toBe(825);
  });

  it('plusieurs révisions successives — choisit la plus récente applicable', () => {
    const histoMulti = [
      { ref: 'F-001', dateRevision: '2025-01-01', ancienHC: 800, nouveauHC: 815 },
      { ref: 'F-001', dateRevision: '2026-01-01', ancienHC: 815, nouveauHC: 825 }
    ];
    const logMulti = { ref: 'F-001', hc: 825, debut: '2024-01-01' };
    expect(_loyerHCAtDate(logMulti, '2023-06-15', histoMulti)).toBe(800);
    expect(_loyerHCAtDate(logMulti, '2024-06-15', histoMulti)).toBe(800);
    expect(_loyerHCAtDate(logMulti, '2025-06-15', histoMulti)).toBe(815);
    expect(_loyerHCAtDate(logMulti, '2026-06-15', histoMulti)).toBe(825);
  });

  it('renonciation → ignorée dans le calcul', () => {
    const histoRen = [
      { ref: 'F-001', dateRevision: '2025-01-01', ancienHC: 800, nouveauHC: 825, action: 'renonciation' }
    ];
    // Pas de révision réelle → tout le temps log.hc
    expect(_loyerHCAtDate(log, '2025-06-15', histoRen)).toBe(825); // log.hc actuel
  });

  it('historique de logement différent → ignoré', () => {
    const histoOther = [
      { ref: 'F-099', dateRevision: '2024-01-01', ancienHC: 600, nouveauHC: 650 }
    ];
    expect(_loyerHCAtDate(log, '2025-06-15', histoOther)).toBe(825);
  });

  it('null/undefined log → 0 sans crash', () => {
    expect(_loyerHCAtDate(null, '2024-06-15', histo)).toBe(0);
    expect(_loyerHCAtDate(undefined, '2024-06-15', histo)).toBe(0);
  });

  it('scenario complet user : "consultation dashboard mai 2024" sur bail jan 2024 / révisé jan 2025', () => {
    expect(_loyerHCAtDate(log, '2024-05-15', histo)).toBe(800);
  });

  it('scenario complet user : "consultation dashboard février 2025"', () => {
    expect(_loyerHCAtDate(log, '2025-02-15', histo)).toBe(825);
  });
});

describe('_chargesAtDate', () => {
  it('retourne log.ch courant (pas d historique distinct dans schéma actuel)', () => {
    expect(_chargesAtDate({ ch: 80 })).toBe(80);
    expect(_chargesAtDate({ ch: 0 })).toBe(0);
  });

  it('null safe', () => {
    expect(_chargesAtDate(null)).toBe(0);
    expect(_chargesAtDate({})).toBe(0);
  });
});
