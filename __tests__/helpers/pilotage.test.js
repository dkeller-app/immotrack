/**
 * Tests pour PILOTAGE-MATRICIEL v15.07 Sprint 8 V1.1.
 *
 * Réplique fidèle de la logique inline (sans DB / DOM) pour tester
 * le helper pur _pilBulkMajLoyersSimule (_pilStatutDoc supprimé : plus aucun appelant, MATRICE-ACCUEIL 16/10).
 */
import { describe, it, expect } from 'vitest';

// ─── Réplique fidèle des helpers inline ─────────────────────────────────────

function pilBulkMajLoyersSimule(items, computeIRL) {
  const out = { baux: [], totalConcernes: 0, totalExclus: 0 };
  for (const item of (items||[])) {
    if (!item) continue;
    const log = item.log || item;
    if (!log || !log.ref) continue;
    const rev = computeIRL(log);
    if (!rev) {
      out.baux.push({ ref:log.ref, exclu:true, raison:'Indice IRL non disponible' });
      out.totalExclus++; continue;
    }
    if (rev.gelDpeFG) {
      out.baux.push({ ref:log.ref, exclu:true, raison:`Gel DPE ${rev.dpe||'F/G'}` });
      out.totalExclus++; continue;
    }
    if (rev.dejaApplique) {
      out.baux.push({ ref:log.ref, exclu:true, raison:'Déjà appliquée cette année' });
      out.totalExclus++; continue;
    }
    if (rev.insuffisant || rev.pasEncoreApplicable) {
      out.baux.push({ ref:log.ref, exclu:true, raison: rev.insuffisant ? 'IRL N-1 manquant' : 'Pas encore applicable' });
      out.totalExclus++; continue;
    }
    out.baux.push({
      ref: log.ref, exclu: false,
      ancienHC: rev.ancienHC, nouveauHC: rev.nouveauHC, variation: rev.variation
    });
    out.totalConcernes++;
  }
  return out;
}
// ═══════════════════════════════════════════════════════════════════
//  _pilBulkMajLoyersSimule
// ═══════════════════════════════════════════════════════════════════

describe('_pilBulkMajLoyersSimule', () => {
  it('3 baux normaux → tous mis à jour', () => {
    const items = [{log:{ref:'A'}},{log:{ref:'B'}},{log:{ref:'C'}}];
    const compute = () => ({ ancienHC:600, nouveauHC:620, variation:0.0333 });
    const r = pilBulkMajLoyersSimule(items, compute);
    expect(r.totalConcernes).toBe(3);
    expect(r.totalExclus).toBe(0);
    expect(r.baux[0].exclu).toBe(false);
    expect(r.baux[0].nouveauHC).toBe(620);
  });

  it('Bail DPE F/G → exclu auto avec raison', () => {
    const items = [{log:{ref:'A'}}];
    const compute = () => ({ gelDpeFG:true, dpe:'G' });
    const r = pilBulkMajLoyersSimule(items, compute);
    expect(r.totalExclus).toBe(1);
    expect(r.baux[0].exclu).toBe(true);
    expect(r.baux[0].raison).toMatch(/Gel DPE G/);
  });

  it('Bail déjà appliqué → exclu', () => {
    const items = [{log:{ref:'A'}}];
    const compute = () => ({ dejaApplique:true });
    expect(pilBulkMajLoyersSimule(items, compute).totalExclus).toBe(1);
  });

  it('IRL insuffisant → exclu', () => {
    const items = [{log:{ref:'A'}}];
    const compute = () => ({ insuffisant:true });
    const r = pilBulkMajLoyersSimule(items, compute);
    expect(r.baux[0].raison).toMatch(/IRL N-1/);
  });

  it('Mix : 2 concernés, 1 gel, 1 déjà appliqué', () => {
    const items = [
      {log:{ref:'A'}},{log:{ref:'B'}},{log:{ref:'C'}},{log:{ref:'D'}}
    ];
    let i = 0;
    const compute = () => {
      const responses = [
        { ancienHC:600, nouveauHC:620, variation:0.03 },
        { gelDpeFG:true, dpe:'F' },
        { ancienHC:700, nouveauHC:721, variation:0.03 },
        { dejaApplique:true }
      ];
      return responses[i++];
    };
    const r = pilBulkMajLoyersSimule(items, compute);
    expect(r.totalConcernes).toBe(2);
    expect(r.totalExclus).toBe(2);
  });

  it('Items vides → 0/0', () => {
    const r = pilBulkMajLoyersSimule([], () => ({}));
    expect(r.totalConcernes).toBe(0);
    expect(r.totalExclus).toBe(0);
  });

  it('Items null/undefined → ignorés', () => {
    const r = pilBulkMajLoyersSimule([null, {log:null}, {log:{}}], () => ({}));
    expect(r.totalConcernes).toBe(0);
    expect(r.totalExclus).toBe(0);
  });

  it('computeIRL retourne null → exclu avec raison', () => {
    const items = [{log:{ref:'A'}}];
    const r = pilBulkMajLoyersSimule(items, () => null);
    expect(r.baux[0].exclu).toBe(true);
    expect(r.baux[0].raison).toMatch(/non disponible/);
  });
});
