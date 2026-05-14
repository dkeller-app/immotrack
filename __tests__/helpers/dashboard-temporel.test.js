import { describe, it, expect } from 'vitest';
import { _bailEstActifAt, _loyerHCAtDate, _chargesAtDate, _loyerProrataMois } from './dashboard-temporel.js';

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

// ────────────────────────────────────────────────────────────────────────────
// _loyerProrataMois — v15.19 Phase A1 BUG-PRORATA-DASH
// ────────────────────────────────────────────────────────────────────────────

describe('_loyerProrataMois — mois pleins (régression : doit donner loyer plein)', () => {
  const log = { ref: 'F-001', hc: 800 };
  const bailPlein = { debut: '2024-01-01', fin: '2026-12-31', hc: 800, ch: 100 };
  // todayRef fixé à 2024-06-15 → bail courant (fin > today)
  const today = new Date('2024-06-15T12:00:00');

  it('mois entièrement couvert par le bail (31 jours) → HC+CH plein', () => {
    expect(_loyerProrataMois(log, 2024, 4, [bailPlein], [], today)).toBeCloseTo(900, 2); // mai 31j
  });

  it('mois entièrement couvert (30 jours)', () => {
    expect(_loyerProrataMois(log, 2024, 5, [bailPlein], [], today)).toBeCloseTo(900, 2); // juin 30j
  });

  it('février 28 jours (non bissextile 2025) — toujours plein', () => {
    expect(_loyerProrataMois(log, 2025, 1, [bailPlein], [], today)).toBeCloseTo(900, 2);
  });

  it('février 29 jours (bissextile 2024) — toujours plein', () => {
    expect(_loyerProrataMois(log, 2024, 1, [bailPlein], [], today)).toBeCloseTo(900, 2);
  });
});

describe('_loyerProrataMois — entrée mi-mois (CAS BUG initial)', () => {
  const log = { ref: 'F-001', hc: 800 };
  const today = new Date('2026-05-15T12:00:00');

  it('bail commence 15/03/2026 → mars = HC+CH × 17/31', () => {
    const bail = { debut: '2026-03-15', fin: null, hc: 800, ch: 100 };
    // jours occupation : 15 au 31 = 17 jours sur 31
    const attendu = 900 * (17 / 31);
    expect(_loyerProrataMois(log, 2026, 2, [bail], [], today)).toBeCloseTo(attendu, 2);
  });

  it('bail commence 01/03/2026 → mars = HC+CH plein (pas de prorata)', () => {
    const bail = { debut: '2026-03-01', fin: null, hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 2, [bail], [], today)).toBeCloseTo(900, 2);
  });

  it('bail commence 31/03/2026 → mars = HC+CH × 1/31', () => {
    const bail = { debut: '2026-03-31', fin: null, hc: 800, ch: 100 };
    const attendu = 900 * (1 / 31);
    expect(_loyerProrataMois(log, 2026, 2, [bail], [], today)).toBeCloseTo(attendu, 2);
  });

  it('bail commence 10/03/2026 → cas user "10/03 prorata 22/31"', () => {
    const bail = { debut: '2026-03-10', fin: null, hc: 800, ch: 100 };
    // jours 10 au 31 inclus = 22 jours
    const attendu = 900 * (22 / 31);
    expect(_loyerProrataMois(log, 2026, 2, [bail], [], today)).toBeCloseTo(attendu, 2);
  });

  it('mois précédant l\'entrée → 0 (pas attendu)', () => {
    const bail = { debut: '2026-03-15', fin: null, hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 1, [bail], [], today)).toBe(0); // février
  });

  it('mois suivant l\'entrée → plein loyer', () => {
    const bail = { debut: '2026-03-15', fin: null, hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 3, [bail], [], today)).toBeCloseTo(900, 2); // avril
  });
});

describe('_loyerProrataMois — sortie mi-mois', () => {
  const log = { ref: 'F-001', hc: 800 };
  const today = new Date('2026-12-15T12:00:00'); // bail clos avant today

  it('bail finit 15/06/2026 → juin = HC+CH × 15/30', () => {
    const bail = { debut: '2024-01-01', fin: '2026-06-15', hc: 800, ch: 100 };
    const attendu = 900 * (15 / 30);
    expect(_loyerProrataMois(log, 2026, 5, [bail], [], today)).toBeCloseTo(attendu, 2);
  });

  it('bail finit 30/06/2026 → juin plein (fin = dernier jour)', () => {
    const bail = { debut: '2024-01-01', fin: '2026-06-30', hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 5, [bail], [], today)).toBeCloseTo(900, 2);
  });

  it('bail finit 01/06/2026 → juin = HC+CH × 1/30', () => {
    const bail = { debut: '2024-01-01', fin: '2026-06-01', hc: 800, ch: 100 };
    const attendu = 900 * (1 / 30);
    expect(_loyerProrataMois(log, 2026, 5, [bail], [], today)).toBeCloseTo(attendu, 2);
  });

  it('mois suivant la fin → 0', () => {
    const bail = { debut: '2024-01-01', fin: '2026-06-15', hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 6, [bail], [], today)).toBe(0); // juillet
  });

  it('mois précédant la fin → plein', () => {
    const bail = { debut: '2024-01-01', fin: '2026-06-15', hc: 800, ch: 100 };
    expect(_loyerProrataMois(log, 2026, 4, [bail], [], today)).toBeCloseTo(900, 2); // mai
  });
});

describe('_loyerProrataMois — transition mi-mois (changement de bail)', () => {
  const log = { ref: 'F-001', hc: 1100 };
  const today = new Date('2026-12-15T12:00:00');

  it('bail A finit 15/03 + bail B commence 16/03 → somme prorata', () => {
    const bailA = { debut: '2024-01-01', fin: '2026-03-15', hc: 800, ch: 100 };
    const bailB = { debut: '2026-03-16', fin: null, hc: 1100, ch: 150 };
    // bailA : 1-15 mars = 15j sur 31 × 900 = 435.48
    // bailB : 16-31 mars = 16j sur 31 × 1250 = 645.16
    const attendu = 900 * (15 / 31) + 1250 * (16 / 31);
    expect(_loyerProrataMois(log, 2026, 2, [bailA, bailB], [], today)).toBeCloseTo(attendu, 2);
  });

  it('bail A finit 31/03 + bail B commence 01/04 → mars plein pour A', () => {
    const bailA = { debut: '2024-01-01', fin: '2026-03-31', hc: 800, ch: 100 };
    const bailB = { debut: '2026-04-01', fin: null, hc: 1100, ch: 150 };
    expect(_loyerProrataMois(log, 2026, 2, [bailA, bailB], [], today)).toBeCloseTo(900, 2);
    expect(_loyerProrataMois(log, 2026, 3, [bailA, bailB], [], today)).toBeCloseTo(1250, 2);
  });

  it('vacance entre 2 baux (bailA fin 10/03, bailB commence 20/03) → seulement prorata', () => {
    const bailA = { debut: '2024-01-01', fin: '2026-03-10', hc: 800, ch: 100 };
    const bailB = { debut: '2026-03-20', fin: null, hc: 1100, ch: 150 };
    // bailA : 1-10 mars = 10/31 × 900 = 290.32
    // bailB : 20-31 mars = 12/31 × 1250 = 483.87
    // vacance 11-19 mars (9 jours) = pas comptée
    const attendu = 900 * (10 / 31) + 1250 * (12 / 31);
    expect(_loyerProrataMois(log, 2026, 2, [bailA, bailB], [], today)).toBeCloseTo(attendu, 2);
  });
});

describe('_loyerProrataMois — bail courant avec révisions IRL', () => {
  const log = { ref: 'F-001', hc: 825 };
  const histo = [
    { ref: 'F-001', dateRevision: '2025-01-01', ancienHC: 800, nouveauHC: 825 }
  ];

  it('mois après révision IRL → utilise nouveau HC (825)', () => {
    const bail = { debut: '2024-01-01', fin: null, hc: 825, ch: 100 };
    const today = new Date('2025-06-15T12:00:00');
    // mai 2025 plein → 825+100 = 925
    expect(_loyerProrataMois(log, 2025, 4, [bail], histo, today)).toBeCloseTo(925, 2);
  });

  it('mois avant révision IRL → ancien HC (800)', () => {
    const bail = { debut: '2024-01-01', fin: null, hc: 825, ch: 100 };
    const today = new Date('2025-06-15T12:00:00');
    // juin 2024 → 800+100 = 900
    expect(_loyerProrataMois(log, 2024, 5, [bail], histo, today)).toBeCloseTo(900, 2);
  });

  it('bail clos (historique) → bail.hc figé, IGNORE révisions IRL', () => {
    const bailClos = { debut: '2024-01-01', fin: '2024-12-31', hc: 800, ch: 100 };
    const today = new Date('2025-06-15T12:00:00');
    // bail clos avant today → on prend bail.hc=800, histo ignoré
    expect(_loyerProrataMois(log, 2024, 4, [bailClos], histo, today)).toBeCloseTo(900, 2);
  });
});

describe('_loyerProrataMois — edge cases & null-safety', () => {
  const today = new Date('2026-06-15T12:00:00');

  it('log null → 0', () => {
    expect(_loyerProrataMois(null, 2026, 2, [{ debut: '2026-01-01', hc: 800 }], [], today)).toBe(0);
  });

  it('bails vide → 0', () => {
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, 2, [], [], today)).toBe(0);
  });

  it('bails null → 0', () => {
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, 2, null, [], today)).toBe(0);
  });

  it('mi invalide (-1) → 0', () => {
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, -1, [{ debut: '2026-01-01', hc: 800 }], [], today)).toBe(0);
  });

  it('mi invalide (12) → 0', () => {
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, 12, [{ debut: '2026-01-01', hc: 800 }], [], today)).toBe(0);
  });

  it('bail sans debut → ignoré (pas de crash)', () => {
    const bails = [{ hc: 800, ch: 100 }, { debut: '2026-01-01', hc: 800, ch: 100 }];
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, 2, bails, [], today)).toBeCloseTo(900, 2);
  });

  it('bail.ch absent → 0 charges (pas crash NaN)', () => {
    const bail = { debut: '2026-01-01', fin: null, hc: 800 };
    expect(_loyerProrataMois({ ref: 'X', hc: 800 }, 2026, 2, [bail], [], today)).toBeCloseTo(800, 2);
  });
});

describe('_loyerProrataMois — SCENARIO USER : locataire entré mi-mois marqué impayé à tort', () => {
  // Reproduit exactement le cas qui faisait apparaître le faux impayé dans le dashboard.
  // Avant fix : _computeImpayes() utilisait (l.hc||0)+(l.ch||0) plein, peu importe la date.
  // Après fix : prorata jours correct.

  const log = { ref: 'A1', hc: 1000 };
  const bail = { debut: '2026-03-10', fin: null, hc: 1000, ch: 0 };
  const today = new Date('2026-04-01T12:00:00');

  it('cas user : entrée 10/03 → mars attendu = 22/31 × 1000 = 709.68 €', () => {
    const attendu = _loyerProrataMois(log, 2026, 2, [bail], [], today);
    expect(attendu).toBeCloseTo(709.68, 2);
  });

  it('locataire qui paye prorata exact (709.68 €) → reste 0 → PAS d\'impayé', () => {
    const attendu = _loyerProrataMois(log, 2026, 2, [bail], [], today);
    const paye = 709.68;
    const reste = attendu - paye;
    expect(Math.abs(reste)).toBeLessThan(0.5); // tolérance arrondi user
  });

  it('AVANT fix (bug) : attendu plein 1000 → reste 290 → marqué impayé à tort', () => {
    // Démonstration du comportement bugué pour mémoire
    const ancienAttenduBugué = 1000 + 0; // (l.hc||0) + (l.ch||0) — code bugué
    const paye = 709.68;
    const reste = ancienAttenduBugué - paye;
    expect(reste).toBeGreaterThan(0.5); // → bug : marqué impayé alors qu'il a payé son prorata
  });
});
