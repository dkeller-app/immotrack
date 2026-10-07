/**
 * Tests pour PILOTAGE-MATRICIEL v15.07 Sprint 8 V1.1.
 *
 * Réplique fidèle de la logique inline (sans DB / DOM) pour tester
 * les 2 helpers purs : _pilStatutDoc, _pilBulkMajLoyersSimule.
 */
import { describe, it, expect } from 'vitest';

// ─── Réplique fidèle des helpers inline ─────────────────────────────────────

function pilStatutDoc(bail, log, type, dateRef, ctx = {}) {
  const today = dateRef instanceof Date ? dateRef : new Date();
  const _ok      = { statut:'ok',      label:'OK' };
  const _expire  = { statut:'expire',  label:'Expiré' };
  const _absent  = { statut:'absent',  label:'Absent' };
  const _na      = { statut:'na',      label:'N/A' };
  const _ko      = { statut:'ko',      label:'À vérif' };

  if (!bail || !log) return _absent;

  if (type === 'bail') {
    if (bail.signatures && bail.signatures.bailleur && bail.signatures.locataire) return _ok;
    if (bail.debut) return { statut:'partial', label:'Non signé' };
    return _absent;
  }
  if (type === 'edl') {
    const edls = ctx.edls || [];
    const hasEdl = edls.some(e => e && !e._deleted && e.logement === log.ref && (e.type === 'entree' || !e.type));
    return hasEdl ? _ok : _absent;
  }
  if (type === 'mrh') {
    const mrhs = ctx.mrh || [];
    const mrh = mrhs.find(m => m && !m._deleted && m.logement === log.ref);
    if (!mrh) return _absent;
    if (mrh.echeance) {
      const ech = new Date(mrh.echeance + 'T23:59:59');
      if (ech < today) return _expire;
      const days = (ech - today) / 86400000;
      if (days < 60) return { statut:'soon', label:'<60j' };
    }
    return _ok;
  }
  if (type === 'chauffage') {
    const eq = (ctx.equipements && ctx.equipements[log.ref]) || [];
    const ch = eq.find(e => /chaud|chauff/i.test(e.type||e.nom||''));
    if (!ch) return _na;
    if (!ch.dernierControle) return _absent;
    const last = new Date(ch.dernierControle + 'T00:00:00');
    const days = (today - last) / 86400000;
    if (days > 395) return _expire;
    return _ok;
  }
  if (type === 'caution') {
    const hasGarant = !!(bail.garant || bail.garant2);
    if (!hasGarant) return _na;
    if (bail.signatures && bail.signatures.garant) return _ok;
    return _absent;
  }
  if (type === 'ddt') {
    const ddtCheck = ctx.ddtCheck;
    if (typeof ddtCheck !== 'function') return _na;
    const ddt = ddtCheck(log, today);
    return ddt.complet ? _ok : { ..._ko, label:`${ddt.manquants.length + ddt.expires.length} diag` };
  }
  return _na;
}

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
//  _pilStatutDoc
// ═══════════════════════════════════════════════════════════════════

describe('_pilStatutDoc — bail', () => {
  it('signé bailleur + locataire → ok', () => {
    const bail = { debut:'2026-01-01', signatures: { bailleur:'sig1', locataire:'sig2' } };
    expect(pilStatutDoc(bail, {ref:'F-001'}, 'bail').statut).toBe('ok');
  });
  it('avec debut mais pas signé → partial', () => {
    expect(pilStatutDoc({ debut:'2026-01-01' }, {ref:'F-001'}, 'bail').statut).toBe('partial');
  });
  it('sans debut → absent', () => {
    expect(pilStatutDoc({}, {ref:'F-001'}, 'bail').statut).toBe('absent');
  });
});

describe('_pilStatutDoc — edl', () => {
  it('EDL entrée présent → ok', () => {
    const ctx = { edls: [{ logement:'F-001', type:'entree' }] };
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'edl', new Date(), ctx).statut).toBe('ok');
  });
  it('EDL sortie seul → absent (pas d\'entrée)', () => {
    const ctx = { edls: [{ logement:'F-001', type:'sortie' }] };
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'edl', new Date(), ctx).statut).toBe('absent');
  });
  it('Pas d\'EDL → absent', () => {
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'edl', new Date(), {edls:[]}).statut).toBe('absent');
  });
});

describe('_pilStatutDoc — mrh', () => {
  const today = new Date('2026-06-01');
  it('MRH valide → ok', () => {
    const ctx = { mrh: [{ logement:'F-001', echeance:'2027-01-01' }] };
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'mrh', today, ctx).statut).toBe('ok');
  });
  it('MRH expirée → expire', () => {
    const ctx = { mrh: [{ logement:'F-001', echeance:'2025-01-01' }] };
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'mrh', today, ctx).statut).toBe('expire');
  });
  it('MRH expire dans <60j → soon', () => {
    const ctx = { mrh: [{ logement:'F-001', echeance:'2026-07-15' }] };
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'mrh', today, ctx).statut).toBe('soon');
  });
  it('Pas de MRH → absent', () => {
    expect(pilStatutDoc({debut:'2026-01-01'}, {ref:'F-001'}, 'mrh', today, {mrh:[]}).statut).toBe('absent');
  });
});

describe('_pilStatutDoc — chauffage', () => {
  const today = new Date('2026-06-01');
  it('Pas d\'équipement chaudière → na', () => {
    expect(pilStatutDoc({}, {ref:'F-001'}, 'chauffage', today, {equipements:{}}).statut).toBe('na');
  });
  it('Chaudière sans dernier contrôle → absent', () => {
    const ctx = { equipements: { 'F-001': [{ type:'Chaudière gaz' }] } };
    expect(pilStatutDoc({}, {ref:'F-001'}, 'chauffage', today, ctx).statut).toBe('absent');
  });
  it('Contrôle récent (<13 mois) → ok', () => {
    const ctx = { equipements: { 'F-001': [{ type:'Chaudière', dernierControle:'2025-10-01' }] } };
    expect(pilStatutDoc({}, {ref:'F-001'}, 'chauffage', today, ctx).statut).toBe('ok');
  });
  it('Contrôle >13 mois → expire', () => {
    const ctx = { equipements: { 'F-001': [{ type:'Chaudière', dernierControle:'2024-12-01' }] } };
    expect(pilStatutDoc({}, {ref:'F-001'}, 'chauffage', today, ctx).statut).toBe('expire');
  });
});

describe('_pilStatutDoc — caution', () => {
  it('Pas de garant → na', () => {
    expect(pilStatutDoc({}, {ref:'F-001'}, 'caution').statut).toBe('na');
  });
  it('Garant déclaré sans signature → absent', () => {
    expect(pilStatutDoc({garant:'M. X'}, {ref:'F-001'}, 'caution').statut).toBe('absent');
  });
  it('Garant signé → ok', () => {
    expect(pilStatutDoc({garant:'M. X', signatures:{garant:'sig'}}, {ref:'F-001'}, 'caution').statut).toBe('ok');
  });
});

describe('_pilStatutDoc — ddt', () => {
  it('Sans ddtCheck → na', () => {
    expect(pilStatutDoc({}, {ref:'F-001'}, 'ddt').statut).toBe('na');
  });
  it('DDT complet → ok', () => {
    const ctx = { ddtCheck: () => ({ complet:true, manquants:[], expires:[] }) };
    expect(pilStatutDoc({}, {ref:'F-001'}, 'ddt', new Date(), ctx).statut).toBe('ok');
  });
  it('DDT incomplet → ko avec compteur', () => {
    const ctx = { ddtCheck: () => ({ complet:false, manquants:['dpe','gaz'], expires:['mrh'] }) };
    const r = pilStatutDoc({}, {ref:'F-001'}, 'ddt', new Date(), ctx);
    expect(r.statut).toBe('ko');
    expect(r.label).toMatch(/3 diag/);
  });
});

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
