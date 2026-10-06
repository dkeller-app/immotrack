// BAIL-EN-COURS-MODIFIER-PERIODES — étape 2 : impactEdition (« avant / après » de l'alerte non bloquante).
// Cas de la maquette : reculer la période de 720 € au 01/10/2026 → « le dû de septembre 2026 repasse de 720 à 680 ».
import { describe, it, expect } from 'vitest';
import { cleDePeriode, modifierPeriode, supprimerPeriode, ajouterPeriode, impactEdition } from '../../js/core/bareme-edition.js';
import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

const REF = 'D-101', BD = '2023-09-01';
const bail = { ref: REF, debut: BD, hc: 600, ch: 80 };
const bails = [{ debut: BD, finEffective: null, archive: false, hc: 640, ch: 80 }];
const OPTS = { motif: 'm', le: '2026-10-06T10:00:00.000Z', auteur: 'D', evtId: 'e1', bailHc: 640, bailCh: 80 };
const maquette = () => appliquerNouvellePeriode([periodeInitialeBail(bail)],
  { ref: REF, debut: '2026-09-01', hc: 640, ch: 80, source: 'manuel', bailDebut: BD, note: 'Accord' });
const cleT = (b, d) => cleDePeriode(b.find((p) => !p._deleted && p.debut === d));

describe('impactEdition', () => {
  it('MAQUETTE : reculer au 01/10/2026 → septembre 720 → 680 (−40), rien d\'autre', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2026-10' });
    expect(imp.mois).toEqual([{ ym: '2026-09', avant: { hc: 640, ch: 80, total: 720 }, apres: { hc: 600, ch: 80, total: 680 }, delta: -40 }]);
    expect(imp.futur).toBeNull();
    expect(imp.deltaTotal).toBe(-40);
    expect(imp.fenetre).toEqual({ debut: '2026-09', fin: '2026-09' });
  });

  it('un mois au-delà du mois courant est du FUTUR (pas de trop-perçu possible) : « à partir de… »', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2026-08-20' });
    expect(imp.mois).toEqual([]);
    expect(imp.futur).toMatchObject({ ym: '2026-09', des: '2026-09-01', nbMois: 1, delta: -40, apres: { total: 680 } });
  });

  it('montants seuls sur une période ouverte : passé + futur, total des écarts du passé', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { hc: 650 }, OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2026-12-15' });
    expect(imp.mois.map((m) => m.ym)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(imp.mois.every((m) => m.delta === 10)).toBe(true);
    expect(imp.deltaTotal).toBe(40);
    expect(imp.fenetre).toEqual({ debut: '2026-09', fin: null });
    expect(imp.futur).toMatchObject({ ym: '2027-01', ouvert: true, delta: 10 });
  });

  it('date en cours de mois : le dû est proratisé comme les écrans (duMois)', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-09-16' }, OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2026-10' });
    expect(imp.mois).toHaveLength(1);
    expect(imp.mois[0].apres.total).toBe(700);       // 15 j à 680 + 15 j à 720 sur 30
  });

  it('suppression : les mois reprennent le tarif de la précédente', () => {
    const b = maquette();
    const r = supprimerPeriode(b, cleT(b, '2026-09-01'), OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2026-11' });
    expect(imp.mois.map((m) => [m.ym, m.avant.total, m.apres.total])).toEqual([['2026-09', 720, 680], ['2026-10', 720, 680], ['2026-11', 720, 680]]);
  });

  it('ajout d\'une période limitée : fenêtre bornée, aucun mois hors fenêtre', () => {
    const b = maquette();
    const r = ajouterPeriode(b, { ref: REF, debut: '2027-01-01', fin: '2027-03-31', hc: 500, ch: 80 }, OPTS);
    const imp = impactEdition({ ref: REF, bails, avant: b, apres: r.periods, jusquAu: '2027-12' });
    expect(imp.mois.map((m) => m.ym)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(imp.fenetre).toEqual({ debut: '2027-01', fin: '2027-03' });
    expect(imp.futur).toBeNull();
  });

  it('aucune différence → rien à dire ; ref d\'un autre lot ignorée', () => {
    const b = maquette();
    expect(impactEdition({ ref: REF, bails, avant: b, apres: b, jusquAu: '2026-10' })).toEqual({ mois: [], futur: null, fenetre: null, deltaTotal: 0 });
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { hc: 700 }, OPTS);
    expect(impactEdition({ ref: 'AUTRE', bails, avant: b, apres: r.periods, jusquAu: '2026-10' }).mois).toEqual([]);
  });

  it('sens avant/après : permuter les deux barèmes inverse les écarts (garde-fou contre une inversion)', () => {
    const b = maquette();
    const r = modifierPeriode(b, cleT(b, '2026-09-01'), { debut: '2026-10-01' }, OPTS);
    const sens = impactEdition({ ref: REF, bails, avant: r.periods, apres: b, jusquAu: '2026-10' });
    expect(sens.mois[0].delta).toBe(40);
  });
});
