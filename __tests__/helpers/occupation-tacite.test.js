/**
 * R0-E (AUDIT-GLOBAL) — un bail tacitement reconduit devenait « vacant ».
 *
 * `_calcOccDays` fermait tout bail à sa date de fin :
 *
 *     const bEnd = b.fin ? new Date((b.finEffective || b.fin)…) : toTs;
 *
 * Or un bail nu arrivé à échéance et non dénoncé **se reconduit tacitement** : le locataire est
 * toujours là, le loyer est toujours dû. C'est le cas le plus courant d'un parc. L'app le savait
 * déjà ailleurs — `_bienActiveBail` (index.html) ne regarde QUE la clôture depuis v15.343,
 * précisément parce que « tacite reconduction ou échu réel restent présents ».
 *
 * Le moteur d'occupation, lui, ne le savait pas. Conséquences chiffrées, toutes fausses dans le
 * même sens :
 *  · taux d'occupation sous-évalué ;
 *  · « manque à gagner » INVENTÉ sur une vacance qui n'existe pas ;
 *  · part bailleur des charges surévaluée — la clé de répartition P-4 bascule sur `loyerHcRef`
 *    au lieu du loyer réel du mois dès que le lot est vu vacant.
 *
 * La règle, alignée sur `_bienActiveBail` : un bail est terminé s'il est CLÔTURÉ (`cloture` ou
 * `finEffective`), jamais parce que sa date de fin est passée. Les baux archivés portent
 * toujours les deux (vérifié : les deux chemins d'archivage posent `finEffective` ET
 * `cloture = true` avant de pousser dans `baux_historique`).
 */

import { describe, it, expect } from 'vitest';
import { _computeOccupationLots } from '../../js/core/legal-bilan.js';

const LOT = { ref: 'F-001', hc: 800, loyerHcRef: 800 };
const db = (bailCourant, hists) => ({
  baux: bailCourant ? { 'F-001': bailCourant } : {},
  baux_historique: hists || []
});
const AN = { from: '2026-01-01', to: '2026-12-31' };

describe('R0-E — la tacite reconduction ne crée plus de vacance', () => {
  it('bail échu mais NON clôturé : occupé toute la période', () => {
    // Bail nu signé en 2023 pour 3 ans : `fin` au 31/03/2026, jamais dénoncé.
    const r = _computeOccupationLots(db({ ref:'F-001', debut:'2023-04-01', fin:'2026-03-31', hc:800 }), [LOT], AN);
    expect(r.taux, 'un bail reconduit n’est pas une vacance').toBe(100);
    expect(r.manqueAGagner, 'manque à gagner inventé sur une vacance inexistante').toBe(0);
  });

  it('bail CLÔTURÉ : la vacance qui suit est bien comptée', () => {
    // Départ réel au 30/06 : six mois occupés, six mois vides.
    const r = _computeOccupationLots(
      db({ ref:'F-001', debut:'2023-04-01', fin:'2026-03-31', finEffective:'2026-06-30', cloture:true, hc:800 }),
      [LOT], AN);
    expect(r.taux).toBeGreaterThan(45);
    expect(r.taux).toBeLessThan(55);
    expect(r.manqueAGagner, 'une vraie vacance doit coûter').toBeGreaterThan(0);
  });

  it('`finEffective` sans `cloture` ferme aussi le bail (données legacy)', () => {
    const r = _computeOccupationLots(
      db({ ref:'F-001', debut:'2023-04-01', fin:'2026-03-31', finEffective:'2026-06-30', hc:800 }),
      [LOT], AN);
    expect(r.taux).toBeLessThan(55);
  });

  it('`cloture` sans `finEffective` retombe sur la date de fin, pas sur « toujours en cours »', () => {
    const r = _computeOccupationLots(
      db({ ref:'F-001', debut:'2023-04-01', fin:'2026-03-31', cloture:true, hc:800 }),
      [LOT], AN);
    expect(r.taux, 'un bail clôturé ne peut pas occuper toute l’année').toBeLessThan(30);
  });

  it('un bail ARCHIVÉ reste borné à sa fin, même s’il est le seul du lot', () => {
    // C'est le garde-fou anti-régression : la nouvelle règle ne doit pas faire courir
    // un bail d'historique jusqu'à la fin de la période.
    const r = _computeOccupationLots(
      db(null, [{ ref:'F-001', debut:'2025-01-01', fin:'2026-02-28', finEffective:'2026-02-28', cloture:true, hc:800 }]),
      [LOT], AN);
    expect(r.taux).toBeGreaterThan(10);
    expect(r.taux).toBeLessThan(20);
  });

  it('relocation : bail archivé + bail courant reconduit = aucune vacance inventée', () => {
    const r = _computeOccupationLots(
      db({ ref:'F-001', debut:'2026-03-01', fin:'2029-02-28', hc:850 },
         [{ ref:'F-001', debut:'2024-01-01', fin:'2026-02-28', finEffective:'2026-02-28', cloture:true, hc:800 }]),
      [LOT], AN);
    expect(r.taux).toBe(100);
    expect(r.manqueAGagner).toBe(0);
  });

  it('lot sans aucun bail : toujours 100 % vacant', () => {
    const r = _computeOccupationLots(db(null, []), [LOT], AN);
    expect(r.taux).toBe(0);
    expect(r.manqueAGagner).toBeGreaterThan(0);
  });

  it('un bail supprimé (tombstone) ne compte pas comme occupation', () => {
    const r = _computeOccupationLots(db({ ref:'F-001', debut:'2023-04-01', fin:'2026-03-31', _deleted:true, hc:800 }), [LOT], AN);
    expect(r.taux).toBe(0);
  });

  it('bail commencé APRÈS la période : aucune occupation', () => {
    const r = _computeOccupationLots(db({ ref:'F-001', debut:'2027-01-01', fin:'2030-01-01', hc:800 }), [LOT], AN);
    expect(r.taux).toBe(0);
  });
});
