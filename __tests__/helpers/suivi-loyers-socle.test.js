/**
 * FINANCES-SUIVI-UNIQUE P1 — extensions RÉTRO-COMPATIBLES du socle loyer-du-mois.js (§B.2 de
 * docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md). Règle d'or : options absentes ⇒ sortie
 * IDENTIQUE à avant (prouvé ici sur des jeux aléatoires, et par les tests existants inchangés).
 *   1. duMois(ctx, ym, { bailDebut }) : le segment d'UN bail, après troncature C4 ;
 *   2. _loyerArrearsPass : months[i].remise (manque accepté), opts.seuilArrondi, opts.detail
 *      (courant / antérieur / remise / arrondi par mois), sources[].kind recopié, months[i].grace.
 */
import { describe, it, expect } from 'vitest';
import { duMois, _loyerArrearsPass, occupationBaux } from '../../js/core/loyer-du-mois.js';

const M = (hcDue, chDue, received, extra) => Object.assign({ hcDue, chDue, received }, extra || {});

// PRNG à graine fixe (mulberry32) : jeux reproductibles.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('duMois — option bailDebut (segment d\'un seul bail)', () => {
  const ctx = {
    ref: 'L1',
    bails: [
      { debut: '2024-08-20', finEffective: '2026-04-13', archive: true, hc: 700, ch: 0 },
      { debut: '2026-04-20', finEffective: null, archive: false, hc: 760, ch: 20 }
    ],
    bareme: []
  };
  it('sans option : sortie identique (Σ du lot)', () => {
    const d = duMois(ctx, '2026-04');
    expect(d).toEqual({ hc: 582, ch: 7.33, total: 589.33, source: 'bail' });
  });
  it('avec bailDebut : seulement le segment du bail, et Σ baux = lot', () => {
    const a = duMois(ctx, '2026-04', { bailDebut: '2024-08-20' });
    const b = duMois(ctx, '2026-04', { bailDebut: '2026-04-20' });
    expect(a).toEqual({ hc: 303.33, ch: 0, total: 303.33, source: 'bail' });
    expect(b).toEqual({ hc: 278.67, ch: 7.33, total: 286, source: 'bail' });
    const lot = duMois(ctx, '2026-04');
    expect(Math.round((a.total + b.total) * 100)).toBe(Math.round(lot.total * 100));
  });
  it('bail hors du mois → vacance', () => {
    expect(duMois(ctx, '2026-06', { bailDebut: '2024-08-20' })).toEqual({ hc: 0, ch: 0, total: 0, source: 'vacance' });
  });
  it('troncature C4 appliquée AVANT la sélection : pas de dû doublé au chevauchement', () => {
    const c2 = { ref: 'L1', bareme: [], bails: [
      { debut: '2026-01-01', finEffective: null, archive: true, fin: '2026-12-31', hc: 500, ch: 0 },
      { debut: '2026-03-01', finEffective: null, archive: false, hc: 600, ch: 0 }
    ] };
    expect(duMois(c2, '2026-03', { bailDebut: '2026-01-01' }).total).toBe(0);
    expect(duMois(c2, '2026-03', { bailDebut: '2026-03-01' }).total).toBe(600);
  });
  it('occupationBaux expose les segments tronqués avec l\'index du bail d\'origine', () => {
    const segs = occupationBaux([ctx.bails[1], ctx.bails[0]]);
    expect(segs.map((s) => [s.i, s.debut, s.end])).toEqual([[1, '2024-08-20', '2026-04-13'], [0, '2026-04-20', null]]);
  });
});

describe('_loyerArrearsPass — rétro-compatibilité (options absentes ⇒ identique)', () => {
  it('sur 300 jeux aléatoires, seuilArrondi:0 / remise absente / sans detail = sortie de base', () => {
    const rnd = prng(20261006);
    for (let n = 0; n < 300; n++) {
      const len = 1 + Math.floor(rnd() * 14);
      const ms = [];
      for (let i = 0; i < len; i++) {
        const hc = Math.round(rnd() * 900 * 100) / 100, ch = Math.round(rnd() * 60);
        const r = rnd();
        const recv = r < 0.2 ? 0 : r < 0.6 ? hc + ch : Math.round(rnd() * 2000 * 100) / 100;
        ms.push({ hcDue: hc, chDue: ch, received: recv, sources: recv ? [{ date: '2026-01-0' + (1 + (i % 9)), id: 'm' + i, montant: recv }] : [] });
      }
      const carry = rnd() < 0.7, graceLast = rnd() < 0.3;
      const base = _loyerArrearsPass(ms, { carry, graceLast });
      expect(_loyerArrearsPass(ms, { carry, graceLast, seuilArrondi: 0 })).toEqual(base);
      expect(_loyerArrearsPass(ms.map((m) => Object.assign({}, m, { remise: 0 })), { carry, graceLast })).toEqual(base);
      // `detail` n'ajoute que des champs : les champs historiques sont identiques.
      const det = _loyerArrearsPass(ms, { carry, graceLast, detail: true });
      expect(det.months.map((m) => ({ loyerArrear: m.loyerArrear, chargeArrear: m.chargeArrear, ...(carry ? { avance: m.avance } : {}) }))).toEqual(base.months);
      expect(det.retardMois).toEqual(base.retardMois);
      expect(det.imputations).toEqual(base.imputations);
    }
  });
  it('sans `kind` dans les sources, les imputations n\'ont pas de champ kind', () => {
    const r = _loyerArrearsPass([M(500, 0, 500, { sources: [{ date: '2026-01-05', id: 'a', montant: 500 }] })], { carry: true });
    expect(r.imputations[0]).toEqual([{ date: '2026-01-05', id: 'a', montant: 500, poste: 'loyer' }]);
  });
});

describe('_loyerArrearsPass — remise (manque accepté)', () => {
  it('solde le manque du mois dans l\'ordre H-1 (loyer puis charges), sans créer d\'avance', () => {
    const r = _loyerArrearsPass([M(760, 20, 760, { remise: 20 })], { carry: true, detail: true });
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.avance).toBe(0);
    expect(r.months[0].remiseAppliquee).toBe(20);
    expect(r.retardMois[0]).toEqual({ loyer: 0, charge: 0 });
  });
  it('plafonnée à la dette : jamais d\'avance', () => {
    const r = _loyerArrearsPass([M(760, 20, 760, { remise: 500 })], { carry: true, detail: true });
    expect(r.months[0].remiseAppliquee).toBe(20);
    expect(r.avance).toBe(0);
  });
  it('appliquée APRÈS l\'argent du mois : si l\'argent suffit, la remise ne sert à rien', () => {
    const r = _loyerArrearsPass([M(500, 0, 500, { remise: 50 })], { carry: true, detail: true });
    expect(r.months[0].remiseAppliquee).toBe(0);
  });
  it('n\'est pas un encaissement : les imputations ne contiennent que l\'argent', () => {
    const r = _loyerArrearsPass([M(760, 20, 760, { remise: 20, sources: [{ date: '2026-08-05', id: 'v', montant: 760 }] })], { carry: true, detail: true });
    const tot = r.imputations[0].reduce((s, p) => s + p.montant, 0);
    expect(tot).toBe(760);
  });
  it('mois courant d\'abord, puis arriérés de loyer (plus vieux d\'abord), puis arriérés de charges', () => {
    const r = _loyerArrearsPass([
      M(100, 10, 0),          // janvier : 100 loyer + 10 charges dus
      M(100, 10, 0),          // février
      M(100, 10, 90, { remise: 150 }) // mars : manque 10 loyer + 10 charges du mois, puis arriérés
    ], { carry: true, detail: true });
    // ordre : mars loyer 10, mars charges 10, janvier loyer 100, février loyer 30 (150 épuisés)
    expect(r.months[2].remiseAppliquee).toBe(150);
    expect(r.retardMois).toEqual([{ loyer: 0, charge: 10 }, { loyer: 70, charge: 10 }, { loyer: 0, charge: 0 }]);
    expect(r.remises).toEqual([
      { idx: 2, cibleIdx: 2, poste: 'loyer', montant: 10 },
      { idx: 2, cibleIdx: 2, poste: 'charge', montant: 10 },
      { idx: 2, cibleIdx: 0, poste: 'loyer', montant: 100 },
      { idx: 2, cibleIdx: 1, poste: 'loyer', montant: 30 }
    ]);
  });
  it('un paiement ultérieur de ce qui était remis devient de l\'avance', () => {
    const r = _loyerArrearsPass([M(760, 20, 760, { remise: 20 }), M(760, 20, 800)], { carry: true });
    expect(r.avance).toBe(20);
  });
});

describe('_loyerArrearsPass — seuilArrondi', () => {
  it('avance < 1 € soldée en fin de mois, trace signée +', () => {
    const r = _loyerArrearsPass([M(710.97, 18.71, 730)], { carry: true, seuilArrondi: 1, detail: true });
    expect(r.avance).toBe(0);
    expect(r.months[0].arrondi).toBe(0.32);
    expect(r.arrondis).toEqual([{ idx: 0, montant: 0.32, cibles: [] }]);   // P8 : une avance abandonnée ne solde aucun mois
  });
  it('dette < 1 € soldée en fin de mois, trace signée −', () => {
    const r = _loyerArrearsPass([M(303.33, 0, 303)], { carry: true, seuilArrondi: 1, detail: true });
    expect(r.loyerArrear).toBe(0);
    expect(r.retardMois[0]).toEqual({ loyer: 0, charge: 0 });
    expect(r.months[0].arrondi).toBe(-0.33);
  });
  it('seuil strict : 1 € pile n\'est pas soldé', () => {
    const r = _loyerArrearsPass([M(301, 0, 300)], { carry: true, seuilArrondi: 1 });
    expect(r.loyerArrear).toBe(1);
  });
});

describe('_loyerArrearsPass — detail : courant / antérieur', () => {
  it('cas C.3 : loyer du mois payé, dette ancienne visible avec son mois d\'origine', () => {
    const ms = [M(650, 10, 660), M(650, 10, 538), M(650, 10, 660), M(650, 10, 660)];
    const r = _loyerArrearsPass(ms, { carry: true, detail: true });
    expect(r.months[1].courant).toEqual({ loyer: 112, charge: 10 });
    expect(r.months[1].anterieur).toEqual({ loyer: 0, charge: 0, depuisIdx: null });
    expect(r.months[3].courant).toEqual({ loyer: 0, charge: 0 });
    expect(r.months[3].anterieur).toEqual({ loyer: 112, charge: 10, depuisIdx: 1 });
  });
  it('ouverture : comptée en antérieur, depuisIdx = -1', () => {
    const r = _loyerArrearsPass([M(500, 0, 500)], { carry: true, detail: true, opening: { loyer: 200 } });
    expect(r.months[0].anterieur).toEqual({ loyer: 200, charge: 0, depuisIdx: -1 });
  });
});

describe('_loyerArrearsPass — sources[].kind et grâce par mois', () => {
  it('kind recopié dans les imputations (retenue sur dépôt)', () => {
    const r = _loyerArrearsPass([M(303.33, 0, 303, { sources: [{ date: '2026-04-13', id: 'dg', montant: 303, kind: 'dg' }] })], { carry: true });
    expect(r.imputations[0]).toEqual([{ date: '2026-04-13', id: 'dg', montant: 303, poste: 'loyer', kind: 'dg' }]);
  });
  it('months[i].grace : manque neuf du mois ignoré, argent compté', () => {
    const r = _loyerArrearsPass([M(500, 0, 500), M(500, 0, 200, { grace: true }), M(500, 0, 0, { grace: true })], { carry: true });
    expect(r.loyerArrear).toBe(0);
    expect(r.months[1].loyerArrear).toBe(0);
  });
});
