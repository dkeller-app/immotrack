import { describe, it, expect } from 'vitest';
import { _computeDetteBail, _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';
import { duMoisSuivi, _computeLoyerNetting } from '../../js/core/loyer-du-mois.js';
import { debutSuiviLot } from '../../js/core/anteriorite.js';
import { jeuAnteriorite, catLigne, ymRange, ymAdd } from './r0c-jeux.js';

/**
 * R0-C — 2ᵉ audit 🔴1 (05/10) : les loyers encaissés AVANT la date de suivi ne deviennent plus une
 * avance restituable et n'effacent plus l'arriéré noté.
 *
 * Règle (maître ET dette d'un bail, `_avantBorne` dans finances-monthly.js) : le solde noté à la date
 * (antériorité « à jour », arriéré, avance) ou l'entrée en jouissance résume tout ce qui précède. Un
 * encaissement daté avant n'est JAMAIS imputé, sauf ceux du mois qui précède (terme du 1ᵉʳ mois suivi
 * payé d'avance) : ils peuvent solder le manque d'un mois suivi, jamais l'ouverture, jamais devenir un
 * trop-perçu. Les autres sont listés dans `horsSuivi`.
 */
const pay = (qui, date, cr) => ({ qui, date, cat: 'Loyers encaissés', cr, db: 0 });
const TODAY = '2026-10-05';

function maitre({ ref, ctx, mouvements, borne, ouv, annee, today = TODAY }) {
  const r = _computeFinancesMonthly({
    mouvements, year: annee, window: computeConstatWindow({ year: annee, today, mouvements }), today, catLigne, activeLots: [ref],
    debutDu: () => borne,
    ouverture: () => (ouv ? { ym: ouv.date.slice(0, 7), loyer: ouv.loyer, charge: ouv.charge, avance: ouv.avance } : null),
    loyerDue: (q, ym) => (q === ref ? duMoisSuivi(ctx, ym, borne) : { hc: 0, ch: 0 })
  });
  const b = r.byLot[ref];
  const s = (k) => (b ? Math.round(b.months.reduce((t, m) => t + m[k], 0) * 100) / 100 : 0);
  return { loyer: s('loyerRetard'), charge: s('chargeRetard'), months: b ? b.months : [] };
}
function cas(ant, mouvements, { debut = '2024-01-01', jouissance = null, finEffective = null, today = TODAY } = {}) {
  const ref = 'A';
  const bail = { debut, archive: !!finEffective, hc: 700, ch: 50, anteriorite: ant };
  if (finEffective) bail.finEffective = finEffective;
  const ctx = { ref, bareme: [], bails: [bail] };
  const sv = debutSuiviLot({ dateAcqImm: jouissance, bails: ctx.bails, provisoireIso: null });
  const d = _computeDetteBail({ ref, ctx, bailDebut: debut, fin: finEffective, mouvements, catLigne, today,
    debutSuivi: sv.date, ouverture: sv.ouverture });
  const m = (annee) => maitre({ ref, ctx, mouvements, borne: sv.date, ouv: sv.ouverture, annee, today });
  return { sv, d, m };
}
const tout = (a, b, j = '05') => ymRange(a, b).map((ym) => pay('A', ym + '-' + j, 750));

describe('🔴1 — S1 et variantes : relevés importés AVANT la date notée', () => {
  it('S1 · bail depuis 01/2024, tout payé, arriéré de 1 400 € noté au 01/06/2025 → 1 400 € dus, 0 d\'avance (avant : 0 et 11 350 € d\'avance)', () => {
    const { d, m } = cas({ date: '2025-06-01', situation: 'arriere', loyer: 1400, charges: 0 }, tout('2024-01', '2026-10'));
    expect(d).toMatchObject({ loyer: 1400, charge: 0, avance: 0, avanceBrute: 0 });
    expect(d.from).toBe('2025-06');   // le calcul part de la date notée, pas du 1ᵉʳ relevé
    expect(m(2026)).toMatchObject({ loyer: 1400, charge: 0 });
    expect(m(2025)).toMatchObject({ loyer: 1400, charge: 0 });
    // l'arriéré noté vit AU MOIS de la date notée, pas en janvier
    expect(m(2025).months.find((x) => x.ym === '2025-06').loyerRetard).toBe(1400);
    // 16 encaissements hors suivi (01/2024 → 04/2025) listés ; mai 2025 = réserve, elle n'a servi à rien
    expect(d.horsSuivi).toHaveLength(16);
    expect(d.horsSuivi[0]).toEqual({ date: '2024-01-05', montant: 750 });
    expect(d.reserveAvant).toEqual({ montant: 750, utilise: 0 });
  });
  it('S1b · « à jour » au 01/06/2025, relevés depuis 01/2024 → ni dette ni avance (avant : 12 750 € d\'avance)', () => {
    const { d, m } = cas({ date: '2025-06-01', situation: 'a-jour' }, tout('2024-01', '2026-10'), { finEffective: '2026-10-31' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
  it('S1c · date notée DANS l\'exercice (01/06/2026), loyers 2026 importés depuis janvier → 1 400 €', () => {
    const { d, m } = cas({ date: '2026-06-01', situation: 'arriere', loyer: 1400, charges: 0 }, tout('2026-01', '2026-10'));
    expect(d).toMatchObject({ loyer: 1400, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 1400, charge: 0 });
    expect(m(2026).months.find((x) => x.ym === '2026-06').loyerRetard).toBe(1400);
    expect(m(2026).months.find((x) => x.ym === '2026-01').loyerRetard).toBe(0);
  });
  it('S1d · date notée en cours de mois (17/06/2025) : les encaissements d\'avant le 17 ne comptent pas', () => {
    const { d, m } = cas({ date: '2025-06-17', situation: 'arriere', loyer: 1400, charges: 0 }, tout('2024-01', '2026-10'));
    // juin : terme exigible le 01/06, avant la date notée → déjà dans le solde noté ; le loyer du 05/06 est la réserve
    expect(d).toMatchObject({ loyer: 1400, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 1400 });
    expect(d.reserveAvant).toEqual({ montant: 750, utilise: 0 });
  });
  it('S1e · avance de 560 € notée au 01/03/2026 avec 2 ans de relevés avant, tout payé, départ 31/05/2026 → 560 € restituables', () => {
    const { d, m } = cas({ date: '2026-03-01', situation: 'avance', avance: 560 }, tout('2024-01', '2026-05'), { finEffective: '2026-05-31' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 560 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
  it('terme payé d\'avance (le 28 du mois d\'avant) : la réserve couvre le mois qu\'il paie, pas de faux impayé', () => {
    // locataire qui paie le mois M le 28 du mois M-1 ; « à jour » au 01/06/2025 ; juin payé le 28/05
    const mvts = ymRange('2024-01', '2026-09').map((ym) => pay('A', ym + '-28', 750));
    const { d, m } = cas({ date: '2025-06-01', situation: 'a-jour' }, mvts, { today: '2026-10-20' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(d.reserveAvant).toEqual({ montant: 750, utilise: 750 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
  it('la réserve ne solde JAMAIS l\'arriéré noté (il la contient déjà) et ne devient jamais un trop-perçu', () => {
    // 2 loyers versés le 20/05/2025 (réserve 1 500), arriéré de 700 noté au 01/06/2025, tout payé ensuite
    const mvts = [pay('A', '2025-05-20', 1500), ...tout('2025-06', '2026-10')];
    const { d, m } = cas({ date: '2025-06-01', situation: 'arriere', loyer: 700, charges: 0 }, mvts);
    expect(d).toMatchObject({ loyer: 700, avance: 0, avanceBrute: 0 });
    expect(d.reserveAvant).toEqual({ montant: 1500, utilise: 0 });
    expect(m(2026)).toMatchObject({ loyer: 700 });
  });
  it('la réserve solde un manque NÉ dans le suivi (au mois où il naît), dans la limite de son montant', () => {
    // juin 2025 non payé en juin, mais 750 versés le 25/05 : la réserve le couvre
    const mvts = [pay('A', '2025-05-25', 750), ...tout('2025-07', '2026-10')];
    const { d, m } = cas({ date: '2025-06-01', situation: 'a-jour' }, mvts);
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
    // sans la réserve : juin dû
    const sans = cas({ date: '2025-06-01', situation: 'a-jour' }, tout('2025-07', '2026-10'));
    expect(sans.d).toMatchObject({ loyer: 700, charge: 50 });
  });
  it('achat le 15/02/2026 + antériorité plus ancienne (ignorée) : relevés du vendeur exclus', () => {
    const { sv, d, m } = cas({ date: '2025-06-01', situation: 'arriere', loyer: 1400 }, tout('2024-01', '2026-10'), { jouissance: '2026-02-15' });
    expect(sv.source).toBe('acquisition');
    // février : terme exigible le 01/02, avant l'achat → vendeur. Le loyer du 05/02 (au vendeur) n'est pas imputé.
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
});

describe('🟠2 — S2 : achat en cours de mois, le prorata n\'est pas une dette du locataire', () => {
  it('achat 15/02/2026, février payé au vendeur, loyers dès mars : 0 € (avant : 350 €)', () => {
    const { d, m } = cas(null, tout('2026-03', '2026-10', '03'), { debut: '2018-03-16', jouissance: '2026-02-15' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
  it('un loyer de mars versé le 25/02 (après l\'achat) est l\'avance du terme de mars, pas un trop-perçu', () => {
    const mvts = [pay('A', '2026-02-25', 750), ...tout('2026-04', '2026-10', '03')];
    const { d, m } = cas(null, mvts, { debut: '2018-03-16', jouissance: '2026-02-15' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
});

describe('🔴1 — HARNAIS : relevés antérieurs à l\'antériorité (160 jeux, graine fixe)', () => {
  const SEEDS = Array.from({ length: 160 }, (_, i) => 9100 + i);
  const mesurer = (j, mouvements) => {
    const sv = debutSuiviLot({ dateAcqImm: j.jouissance, bails: j.ctx.bails, provisoireIso: null });
    const d = _computeDetteBail({ ref: j.ref, ctx: j.ctx, bailDebut: j.bailDebut, fin: j.fin, mouvements, catLigne, today: j.today,
      debutSuivi: sv.date, ouverture: sv.ouverture });
    const annee = d && d.to ? Number(d.to.slice(0, 4)) : null;
    const mt = annee ? maitre({ ref: j.ref, ctx: j.ctx, mouvements, borne: sv.date, ouv: sv.ouverture, annee, today: j.today }) : null;
    return { sv, d, annee, mt };
  };
  const RES = SEEDS.map((seed) => { const j = jeuAnteriorite(seed); return { j, ...mesurer(j, j.mouvements) }; });

  it('le harnais exerce le cas : relevés avant la date notée, arriérés / avances / à jour, réserve, achats', () => {
    const avant = (x) => x.j.mouvements.some((m) => m.qui === x.j.ref && m.cat !== 'Dépôt de garantie (reçu / restitué)' && m.date < x.sv.date);
    expect(RES.filter(avant).length).toBeGreaterThan(120);
    expect(RES.filter((x) => x.d.horsSuivi.length > 3).length).toBeGreaterThan(100);
    expect(RES.filter((x) => x.sv.ouverture && x.sv.ouverture.loyer > 0).length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.sv.ouverture && x.sv.ouverture.avance > 0).length).toBeGreaterThan(20);
    expect(RES.filter((x) => x.j.ant.situation === 'a-jour').length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.d.reserveAvant.utilise > 0).length).toBeGreaterThan(10);
    expect(RES.filter((x) => x.j.jouissance).length).toBeGreaterThan(20);   // achat AVANT la date notée (elle fait foi)
    expect(RES.filter((x) => x.sv.date.slice(8) !== '01').length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.d.loyer > 0).length).toBeGreaterThan(50);
  });
  it('dette du bail == retard Finances du lot, au centime, sur chaque jeu', () => {
    const ecarts = RES.filter((x) => x.mt && (x.mt.loyer !== x.d.loyer || x.mt.charge !== x.d.charge))
      .map((x) => ({ ref: x.j.ref, dette: [x.d.loyer, x.d.charge], maitre: [x.mt.loyer, x.mt.charge] }));
    expect(ecarts).toEqual([]);
  });
  it('les encaissements d\'AVANT le mois qui précède la date notée ne changent RIEN (ni dette, ni avance, ni Finances)', () => {
    RES.forEach((x) => {
      const seuil = ymAdd(x.sv.date.slice(0, 7), -1) + x.sv.date.slice(7);   // même jour, un mois plus tôt (jours ≤ 28)
      const sans = mesurer(x.j, x.j.mouvements.filter((m) => !(m.qui === x.j.ref && m.date < seuil && m.date < x.sv.date)));
      expect({ ref: x.j.ref, loyer: sans.d.loyer, charge: sans.d.charge, avance: sans.d.avance })
        .toEqual({ ref: x.j.ref, loyer: x.d.loyer, charge: x.d.charge, avance: x.d.avance });
      if (x.mt && sans.mt) expect([sans.mt.loyer, sans.mt.charge]).toEqual([x.mt.loyer, x.mt.charge]);
    });
  });
  it('la réserve (mois qui précède) ne crée jamais d\'avance et ne fait que réduire la dette', () => {
    RES.forEach((x) => {
      const sans = mesurer(x.j, x.j.mouvements.filter((m) => !(m.qui === x.j.ref && m.date < x.sv.date)));
      expect(x.d.avanceBrute).toBe(sans.d.avanceBrute);
      expect(x.d.loyer + x.d.charge).toBeLessThanOrEqual(sans.d.loyer + sans.d.charge + 0.001);
    });
  });
  it('le harnais MORD : l\'ancienne règle (dû borné, encaissements antérieurs imputés) diverge sur la plupart des jeux', () => {
    // Réplique de l'avant-correctif : netting continu depuis le 1ᵉʳ relevé, dû borné, TOUS les encaissements.
    const avantCorrectif = (x) => {
      const recu = {};
      x.j.mouvements.forEach((m) => { if (m.qui === x.j.ref && catLigne(m.cat) && catLigne(m.cat).ligne2044 === '211' && m.date.slice(0, 7) <= x.d.to) recu[m.date.slice(0, 7)] = (recu[m.date.slice(0, 7)] || 0) + m.cr - m.db; });
      const from = [x.j.bailDebut.slice(0, 7), ...Object.keys(recu)].sort()[0];
      const ms = ymRange(from, x.d.to).map((ym) => { const du = duMoisSuivi(x.j.ctx, ym, x.sv.date); return { hcDue: du.hc, chDue: du.ch, received: recu[ym] || 0 }; });
      const o = x.sv.ouverture;
      const r = _computeLoyerNetting(ms, x.d.graceLast, o ? { loyer: o.loyer, charge: o.charge, avance: o.avance } : null);
      return { dette: Math.round(r.retardMois.reduce((t, m) => t + m.loyer + m.charge, 0) * 100) / 100, avance: r.avance };
    };
    const dette = (x) => Math.round((x.d.loyer + x.d.charge) * 100) / 100;
    const faux = RES.filter((x) => { const a = avantCorrectif(x); return Math.abs(a.dette - dette(x)) > 0.005 || Math.abs(a.avance - x.d.avanceBrute) > 0.005; });
    expect(faux.length).toBeGreaterThan(100);
    // et toujours dans le même sens : l'ancienne règle effaçait de la dette / fabriquait de l'avance
    faux.forEach((x) => { const a = avantCorrectif(x); expect({ ref: x.j.ref, sens: a.dette <= dette(x) + 0.005 && a.avance >= x.d.avanceBrute - 0.005 }).toEqual({ ref: x.j.ref, sens: true }); });
  });
});
