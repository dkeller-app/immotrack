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
 * Règle (maître, dette d'un bail, onglet Loyers — `_avantBorne` dans finances-monthly.js) : le solde noté
 * à la date (antériorité « à jour », arriéré, avance) ou l'entrée en jouissance résume tout ce qui précède.
 * Un encaissement daté avant n'est JAMAIS imputé (3ᵉ audit A1 : plus de réserve) ; il est listé dans
 * `horsSuivi`, ceux du mois qui précède un ACHAT marqués « à rattacher » par l'utilisateur.
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
    debutSuivi: sv.date, sourceSuivi: sv.source, ouverture: sv.ouverture });
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
    // 17 encaissements hors suivi (01/2024 → 05/2025) listés, aucun « à rattacher » (antériorité)
    expect(d.horsSuivi).toHaveLength(17);
    expect(d.horsSuivi[0]).toEqual({ date: '2024-01-05', montant: 750, aRattacher: false });
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
    // juin : terme exigible le 01/06, avant la date notée → déjà dans le solde noté, comme le loyer du 05/06
    expect(d).toMatchObject({ loyer: 1400, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 1400 });
    expect(d.horsSuivi[d.horsSuivi.length - 1]).toEqual({ date: '2025-06-05', montant: 750, aRattacher: false });
  });
  it('S1e · avance de 560 € notée au 01/03/2026 avec 2 ans de relevés avant, tout payé, départ 31/05/2026 → 560 € restituables', () => {
    const { d, m } = cas({ date: '2026-03-01', situation: 'avance', avance: 560 }, tout('2024-01', '2026-05'), { finEffective: '2026-05-31' });
    expect(d).toMatchObject({ loyer: 0, charge: 0, avance: 560 });
    expect(m(2026)).toMatchObject({ loyer: 0, charge: 0 });
  });
  // 3ᵉ audit A1 — plus de « réserve du mois qui précède » : elle effaçait une dette réelle (R1, R3) et
  // comptait le même argent plusieurs fois (R2). La situation notée contient TOUS les paiements antérieurs.
  const R = (ant, mvts) => cas(ant, mvts);
  const jusquaMai = () => ymRange('2024-01', '2025-05').map((ym) => pay('A', ym + '-05', 750));
  it('R1 · « à jour » au 01/06/2025, mai payé le 05/05 (loyer NORMAL de mai), plus rien ensuite → 16 mois dus : 11 200 / 800', () => {
    const { d, m } = R({ date: '2025-06-01', situation: 'a-jour' }, jusquaMai());
    expect(d).toMatchObject({ loyer: 11200, charge: 800, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 11200, charge: 800 });
  });
  it('R1b · mai payé EN RETARD le 28/05 (compris dans « à jour ») → 11 200 / 800', () => {
    const { d, m } = R({ date: '2025-06-01', situation: 'a-jour' }, [...ymRange('2024-01', '2025-04').map((ym) => pay('A', ym + '-05', 750)), pay('A', '2025-05-28', 750)]);
    expect(d).toMatchObject({ loyer: 11200, charge: 800 });
    expect(m(2026)).toMatchObject({ loyer: 11200, charge: 800 });
  });
  it('R2 · avance de 750 notée ET juin payé le 28/05 (le même argent) : compté UNE fois → juin couvert, 15 mois dus : 10 500 / 750', () => {
    const { d, m } = R({ date: '2025-06-01', situation: 'avance', avance: 750 }, [...jusquaMai(), pay('A', '2025-05-28', 750)]);
    expect(d).toMatchObject({ loyer: 10500, charge: 750, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 10500, charge: 750 });
  });
  it('R3 · « à jour » + juin payé d\'avance le 28/05 : la situation notée fait foi (un terme payé d\'avance se note « avait payé d\'avance ») → 11 200 / 800', () => {
    const { d, m } = R({ date: '2025-06-01', situation: 'a-jour' }, [...jusquaMai(), pay('A', '2025-05-28', 750)]);
    expect(d).toMatchObject({ loyer: 11200, charge: 800, avance: 0 });
    expect(m(2026)).toMatchObject({ loyer: 11200, charge: 800 });
    expect(d.horsSuivi.every((h) => h.aRattacher === false)).toBe(true);   // antériorité : rien « à rattacher »
  });
  it('arriéré noté + 2 loyers versés le 20/05 : ils ne soldent rien, ne deviennent jamais un trop-perçu', () => {
    const { d, m } = cas({ date: '2025-06-01', situation: 'arriere', loyer: 700, charges: 0 }, [pay('A', '2025-05-20', 1500), ...tout('2025-06', '2026-10')]);
    expect(d).toMatchObject({ loyer: 700, avance: 0, avanceBrute: 0 });
    expect(m(2026)).toMatchObject({ loyer: 700 });
  });
  it('DATE D\'ACHAT : les encaissements du mois qui précède sont « à rattacher » (horsSuivi), jamais imputés', () => {
    // achat 01/03/2026 ; mars payé le 25/02 au compte de l'acquéreur ; avril-octobre payés
    const { sv, d, m } = cas(null, [pay('A', '2026-01-05', 750), pay('A', '2026-02-25', 750), ...tout('2026-04', '2026-10')], { debut: '2018-03-16', jouissance: '2026-03-01' });
    expect(sv.source).toBe('acquisition');
    expect(d.horsSuivi).toEqual([{ date: '2026-01-05', montant: 750, aRattacher: false }, { date: '2026-02-25', montant: 750, aRattacher: true }]);
    expect(d).toMatchObject({ loyer: 700, charge: 50 });   // mars reste dû tant que l'utilisateur n'a pas rattaché le versement
    expect(m(2026)).toMatchObject({ loyer: 700, charge: 50 });
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
      debutSuivi: sv.date, sourceSuivi: sv.source, ouverture: sv.ouverture });
    const annee = d && d.to ? Number(d.to.slice(0, 4)) : null;
    const mt = annee ? maitre({ ref: j.ref, ctx: j.ctx, mouvements, borne: sv.date, ouv: sv.ouverture, annee, today: j.today }) : null;
    return { sv, d, annee, mt };
  };
  const RES = SEEDS.map((seed) => { const j = jeuAnteriorite(seed); return { j, ...mesurer(j, j.mouvements) }; });

  it('le harnais exerce le cas : relevés avant la date notée, arriérés / avances / à jour, terme payé d\'avance, achats', () => {
    const avant = (x) => x.j.mouvements.some((m) => m.qui === x.j.ref && m.cat !== 'Dépôt de garantie (reçu / restitué)' && m.date < x.sv.date);
    expect(RES.filter(avant).length).toBeGreaterThan(120);
    expect(RES.filter((x) => x.d.horsSuivi.length > 3).length).toBeGreaterThan(100);
    expect(RES.filter((x) => x.sv.ouverture && x.sv.ouverture.loyer > 0).length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.sv.ouverture && x.sv.ouverture.avance > 0).length).toBeGreaterThan(20);
    expect(RES.filter((x) => x.j.ant.situation === 'a-jour').length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.j.mouvements.some((m) => m.qui === x.j.ref && m.date.slice(8) === '28' && m.date < x.sv.date && m.date >= ymAdd(x.sv.date.slice(0, 7), -1))).length).toBeGreaterThan(20);
    expect(RES.filter((x) => x.j.jouissance).length).toBeGreaterThan(20);   // achat AVANT la date notée (elle fait foi)
    expect(RES.filter((x) => x.sv.date.slice(8) !== '01').length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.d.loyer > 0).length).toBeGreaterThan(50);
  });
  it('dette du bail == retard Finances du lot, au centime, sur chaque jeu', () => {
    const ecarts = RES.filter((x) => x.mt && (x.mt.loyer !== x.d.loyer || x.mt.charge !== x.d.charge))
      .map((x) => ({ ref: x.j.ref, dette: [x.d.loyer, x.d.charge], maitre: [x.mt.loyer, x.mt.charge] }));
    expect(ecarts).toEqual([]);
  });
  it('AUCUN encaissement d\'avant la date notée ne change quoi que ce soit (ni dette, ni avance, ni Finances) — 3ᵉ audit A1', () => {
    RES.forEach((x) => {
      const sans = mesurer(x.j, x.j.mouvements.filter((m) => !(m.qui === x.j.ref && m.date < x.sv.date)));
      expect({ ref: x.j.ref, loyer: sans.d.loyer, charge: sans.d.charge, avance: sans.d.avance })
        .toEqual({ ref: x.j.ref, loyer: x.d.loyer, charge: x.d.charge, avance: x.d.avance });
      if (x.mt && sans.mt) expect([sans.mt.loyer, sans.mt.charge]).toEqual([x.mt.loyer, x.mt.charge]);
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
