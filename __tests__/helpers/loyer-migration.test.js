import { describe, it, expect } from 'vitest';
import { reconstruireBaremeLot } from '../../js/core/loyer-migration.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

// AUDIT-SUIVI-LOYERS étape 3 (2026-07-16) — reconstruction du barème depuis l'EXISTANT.
// §5 de l'audit (données cassées) : entrées IRL au dateRevision = anniversaire passé (rétroactif
// = cause Fric) re-datées selon Q1 ; baux archivés sans finEffective tronqués ; désyncs log.hc≠baux.hc
// détectées. Le résultat = les périodes du barème + la liste des INCOHÉRENCES à valider (bandeau écran).
// PUR (aucune lecture de DB), idempotent, réutilise computeDateEffetIRL (Q1). Cas Fric = canonique.

const FRIC = () => ({
  ref: 'F-001',
  bails: [{ debut: '2024-03-01', fin: null, hc: 505.15, ch: 50, archive: false }], // hc déjà muté par applyIRL
  irlHistorique: [{
    ref: 'F-001', date: '2026-06-20', dateRevision: '2026-03-01',   // legacy : dateRevision = anniversaire (rétroactif)
    ancienHC: 500, nouveauHC: 505.15
  }],
  logHc: 505.15
});

describe('reconstruireBaremeLot — cas Fric : IRL legacy re-datée Q1, aucun retard rétroactif', () => {
  const r = reconstruireBaremeLot(FRIC());
  it('2 périodes : bail 500 jusqu\'au 30/06, irl 505.15 depuis le 1er juillet (jamais depuis mars)', () => {
    expect(r.periodes.length).toBe(2);
    expect(r.periodes[0]).toMatchObject({ ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, source: 'bail' });
    expect(r.periodes[1]).toMatchObject({ debut: '2026-07-01', fin: null, hc: 505.15, ch: 50, source: 'irl' });
  });
  it('la période initiale reprend l\'ANCIEN loyer (ancienHC de la 1re IRL), pas le hc courant muté', () => {
    expect(r.periodes[0].hc).toBe(500);
  });
  it('incohérence « irl-redatee » : effet re-daté 01/03 → 01/07', () => {
    const inc = r.incoherences.find(i => i.type === 'irl-redatee');
    expect(inc).toBeTruthy();
    expect(inc.ancienDateEffet).toBe('2026-03-01');
    expect(inc.dateEffet).toBe('2026-07-01');
  });
  it('le barème reconstruit se lit correctement par duMois() : mars-juin = 550, juillet = 555.15', () => {
    const ctx = { ref: 'F-001', bails: FRIC().bails, bareme: r.periodes, quittances: [] };
    for (const ym of ['2026-03', '2026-04', '2026-05', '2026-06']) expect(duMois(ctx, ym).total).toBe(550);
    expect(duMois(ctx, '2026-07').total).toBe(555.15);
  });
});

describe('reconstruireBaremeLot — IRL déjà datée (v15.486+) : dateEffet respecté, pas d\'incohérence', () => {
  const r = reconstruireBaremeLot({
    ref: 'F-001',
    bails: [{ debut: '2024-03-01', fin: null, hc: 505.15, ch: 50, archive: false }],
    irlHistorique: [{ ref: 'F-001', date: '2026-06-20', dateRevision: '2026-03-01', dateEffet: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }],
    logHc: 505.15
  });
  it('utilise dateEffet stocké → aucune incohérence irl-redatee', () => {
    expect(r.periodes[1].debut).toBe('2026-07-01');
    expect(r.incoherences.find(i => i.type === 'irl-redatee')).toBeFalsy();
  });
});

describe('reconstruireBaremeLot — renonciation : ne coupe PAS le barème', () => {
  const r = reconstruireBaremeLot({
    ref: 'F-001',
    bails: [{ debut: '2024-03-01', fin: null, hc: 500, ch: 50, archive: false }],
    irlHistorique: [{ ref: 'F-001', date: '2025-03-05', dateRevision: '2025-03-01', action: 'renonciation', ancienHC: 500, nouveauHC: 500 }],
    logHc: 500
  });
  it('une seule période à 500 (la renonciation n\'ajoute pas de période)', () => {
    expect(r.periodes.length).toBe(1);
    expect(r.periodes[0].hc).toBe(500);
    expect(r.periodes[0].fin).toBe(null);
  });
});

describe('reconstruireBaremeLot — re-bail : archivé figé + tronqué à la veille du nouveau bail (C4)', () => {
  const r = reconstruireBaremeLot({
    ref: 'F-002',
    bails: [
      { debut: '2023-05-01', fin: '2026-04-30', hc: 480, ch: 45, archive: true },   // fin contractuelle FUTURE (pas de clôture)
      { debut: '2026-03-01', fin: null, hc: 520, ch: 50, archive: false }
    ],
    irlHistorique: [],
    logHc: 520
  });
  it('l\'ancien bail est tronqué au 28/02/2026 (veille du nouveau), pas de chevauchement', () => {
    expect(r.periodes[0]).toMatchObject({ debut: '2023-05-01', fin: '2026-02-28', hc: 480, ch: 45, source: 'bail' });
    expect(r.periodes[1]).toMatchObject({ debut: '2026-03-01', fin: null, hc: 520, ch: 50, source: 'bail' });
  });
  it('incohérence « bail-tronque » signalée', () => {
    expect(r.incoherences.find(i => i.type === 'bail-tronque')).toBeTruthy();
  });
  it('duMois : pas de dû doublé (le câblage pose finEffective d\'après l\'incohérence bail-tronque)', () => {
    // Le câblage (3b) applique la troncature aux BAUX (finEffective) d'après l'incohérence.
    const inc = r.incoherences.find(i => i.type === 'bail-tronque');
    const bails = [
      { debut: '2023-05-01', fin: '2026-04-30', finEffective: inc.nouvelleFin, archive: true, hc: 480, ch: 45 },
      { debut: '2026-03-01', fin: null, hc: 520, ch: 50 }
    ];
    const ctx = { ref: 'F-002', bails, bareme: r.periodes, quittances: [] };
    expect(duMois(ctx, '2026-02').total).toBe(525);   // ancien bail seul (jusqu'au 28/02)
    expect(duMois(ctx, '2026-03').total).toBe(570);   // nouveau bail seul — PAS 1095 (troncature effective)
    expect(duMois(ctx, '2026-04').total).toBe(570);   // sans troncature, l'ancien (fin 30/04) doublait avril
  });
});

describe('reconstruireBaremeLot — désync log.hc ≠ hc reconstruit', () => {
  it('signale une incohérence desync-hc quand logHc diverge de la période courante', () => {
    const r = reconstruireBaremeLot({
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 520, ch: 50, archive: false }],
      irlHistorique: [], logHc: 500
    });
    const inc = r.incoherences.find(i => i.type === 'desync-hc');
    expect(inc).toBeTruthy();
    expect(inc.logHc).toBe(500);
    expect(inc.baremeHc).toBe(520);
  });
  it('pas de desync si logHc == hc courant', () => {
    const r = reconstruireBaremeLot({
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 520, ch: 50, archive: false }],
      irlHistorique: [], logHc: 520
    });
    expect(r.incoherences.find(i => i.type === 'desync-hc')).toBeFalsy();
  });
});

describe('reconstruireBaremeLot — IRL sans date exploitable → incohérence, pas de crash', () => {
  const r = reconstruireBaremeLot({
    ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 500, ch: 50, archive: false }],
    irlHistorique: [{ ref: 'L-1', date: '', dateRevision: '', ancienHC: 500, nouveauHC: 510 }],
    logHc: 500
  });
  it('l\'entrée sans date est ignorée du barème mais signalée', () => {
    expect(r.periodes.length).toBe(1);
    expect(r.incoherences.find(i => i.type === 'irl-sans-date')).toBeTruthy();
  });
});

describe('reconstruireBaremeLot — tombstones filtrés + tri', () => {
  it('un bail _deleted n\'entre pas dans la reconstruction', () => {
    const r = reconstruireBaremeLot({
      ref: 'L-1',
      bails: [
        { debut: '2020-01-01', fin: null, hc: 999, ch: 99, archive: true, _deleted: true },
        { debut: '2024-01-01', fin: null, hc: 500, ch: 50, archive: false }
      ],
      irlHistorique: [], logHc: 500
    });
    expect(r.periodes.length).toBe(1);
    expect(r.periodes[0].hc).toBe(500);
  });
});

describe('reconstruireBaremeLot — idempotence (re-migration)', () => {
  it('deux passes produisent le même barème', () => {
    const a = reconstruireBaremeLot(FRIC());
    const b = reconstruireBaremeLot(FRIC());
    expect(b.periodes).toEqual(a.periodes);
  });
});

describe('reconstruireBaremeLot — plusieurs IRL successives sur le bail actif', () => {
  const r = reconstruireBaremeLot({
    ref: 'L-1',
    bails: [{ debut: '2023-01-01', fin: null, hc: 520, ch: 50, archive: false }],
    irlHistorique: [
      { ref: 'L-1', date: '2024-01-05', dateRevision: '2024-01-01', dateEffet: '2024-01-01', ancienHC: 500, nouveauHC: 510 },
      { ref: 'L-1', date: '2025-01-05', dateRevision: '2025-01-01', dateEffet: '2025-01-01', ancienHC: 510, nouveauHC: 520 }
    ],
    logHc: 520
  });
  it('3 périodes chaînées : 500 → 510 → 520, la 1re reprend le tout 1er ancienHC', () => {
    expect(r.periodes.map(p => p.hc)).toEqual([500, 510, 520]);
    expect(r.periodes[0]).toMatchObject({ debut: '2023-01-01', fin: '2023-12-31', source: 'bail' });
    expect(r.periodes[1]).toMatchObject({ debut: '2024-01-01', fin: '2024-12-31', source: 'irl' });
    expect(r.periodes[2]).toMatchObject({ debut: '2025-01-01', fin: null, source: 'irl' });
  });
});

describe('reconstruireBaremeLot — bail ARCHIVÉ avec IRL : l\'archivé est figé, l\'IRL ne l\'affecte pas', () => {
  const r = reconstruireBaremeLot({
    ref: 'L-1',
    bails: [
      { debut: '2020-01-01', fin: '2024-12-31', hc: 480, ch: 45, archive: true },   // archivé, figé à 480
      { debut: '2025-01-01', fin: null, hc: 510, ch: 50, archive: false }
    ],
    // une IRL dont l'effet tombe DANS la fenêtre de l'archivé → ne doit PAS le couper (figé)
    irlHistorique: [{ ref: 'L-1', date: '2022-03-05', dateRevision: '2022-03-01', dateEffet: '2022-03-01', ancienHC: 480, nouveauHC: 490 }],
    logHc: 510
  });
  it('l\'archivé reste une seule période à 480 (aucun découpage IRL) ; l\'IRL hors bail courant est signalée', () => {
    const arch = r.periodes.filter(p => p.bailDebut === '2020-01-01');
    expect(arch.length).toBe(1);
    expect(arch[0].hc).toBe(480);
    expect(r.incoherences.find(i => i.type === 'irl-hors-bail')).toBeTruthy();
  });
});

describe('reconstruireBaremeLot — renonciation AVANT une application : la 1re application donne le bon ancienHC', () => {
  const r = reconstruireBaremeLot({
    ref: 'L-1',
    bails: [{ debut: '2023-01-01', fin: null, hc: 510, ch: 50, archive: false }],
    irlHistorique: [
      { ref: 'L-1', date: '2024-01-05', dateRevision: '2024-01-01', action: 'renonciation', ancienHC: 500, nouveauHC: 500 },
      { ref: 'L-1', date: '2025-01-05', dateRevision: '2025-01-01', dateEffet: '2025-01-01', ancienHC: 500, nouveauHC: 510 }
    ],
    logHc: 510
  });
  it('période initiale 500 (ancienHC de la 1re APPLICATION, la renonciation étant exclue) → 510', () => {
    expect(r.periodes.map(p => p.hc)).toEqual([500, 510]);
    expect(r.periodes[0]).toMatchObject({ debut: '2023-01-01', fin: '2024-12-31', source: 'bail' });
    expect(r.periodes[1]).toMatchObject({ debut: '2025-01-01', fin: null, source: 'irl' });
  });
});

describe('reconstruireBaremeLot — combiné : re-bail + IRL sur le bail courant', () => {
  const r = reconstruireBaremeLot({
    ref: 'L-1',
    bails: [
      { debut: '2020-01-01', fin: '2023-12-31', hc: 450, ch: 40, archive: true },
      { debut: '2024-01-01', fin: null, hc: 520, ch: 50, archive: false }
    ],
    irlHistorique: [{ ref: 'L-1', date: '2025-01-05', dateRevision: '2025-01-01', dateEffet: '2025-01-01', ancienHC: 500, nouveauHC: 520 }],
    logHc: 520
  });
  it('3 périodes : archivé 450 figé, bail courant 500 puis IRL 520', () => {
    expect(r.periodes.map(p => `${p.hc}/${p.source}`)).toEqual(['450/bail', '500/bail', '520/irl']);
    expect(r.periodes[0]).toMatchObject({ debut: '2020-01-01', fin: '2023-12-31' });
    expect(r.periodes[1]).toMatchObject({ debut: '2024-01-01', fin: '2024-12-31' });
    expect(r.periodes[2]).toMatchObject({ debut: '2025-01-01', fin: null });
  });
});

describe('reconstruireBaremeLot — lot vacant / aucun bail', () => {
  it('aucun bail → barème vide, aucune incohérence', () => {
    const r = reconstruireBaremeLot({ ref: 'L-1', bails: [], irlHistorique: [], logHc: 0 });
    expect(r.periodes).toEqual([]);
    expect(r.incoherences).toEqual([]);
  });
});
