import { describe, it, expect } from 'vitest';
import { _computeDetteBail, _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';
import { duMoisSuivi, _debutSuivi, duMois } from '../../js/core/loyer-du-mois.js';
import { etatMoisLot, retardLot } from '../../js/core/loyers-mois.js';
import { jeuUnBail, catLigne, premierVersementYm, estLoyer, ymRange } from './r0c-jeux.js';
import { debutSuiviLot } from '../../js/core/anteriorite.js';

/**
 * R0-C lot 1 — HARNAIS D'ÉGALITÉ « dette de restitution = dette Finances bornée ».
 *
 * CDC-FINANCES §0bis : un chiffre d'argent qui apparaît sur deux écrans est LE MÊME OCTET.
 * Sur 240 jeux générés (graine fixe) — entrée n'importe quel jour de 2021 à 2026, 0 à 3 IRL
 * réelles, bail ouvert ou clos, paiements exacts/partiels/absents/doublés/rattrapés sur
 * plusieurs exercices/payés le 28 du mois d'avant/contre-passés, 1ᵉʳ versement tardif, bien
 * ACHETÉ LOUÉ (bail commencé chez le vendeur, entrée en jouissance n'importe quel jour — Q1
 * révisé), dépôt de garantie et autre lot en bruit, encaissement post-daté — la dette du bail vaut, AU
 * CENTIME, le retard que Finances affiche pour ce lot sur l'exercice où le bail se termine
 * (Σ byLot[ref].months.loyerRetard, ouverture N-1 comprise UNE fois).
 *
 * Le maître reçoit ici la règle Q1 RÉVISÉE (Didier 01/10) : dû = duMoisSuivi borné par l'entrée en
 * jouissance du bailleur actuel (sinon depuis l'entrée du bail, jamais depuis le 1ᵉʳ relevé),
 * pré-passe d'ouverture démarrée au début du dû (`debutDu`).
 */
const SEEDS = Array.from({ length: 240 }, (_, i) => 7000 + i);

function mesurer(seed) {
  const j = jeuUnBail(seed);
  // Même règle que l'app (js/core/anteriorite.js) : date d'achat > antériorité notée ; solde d'ouverture.
  const suivi = debutSuiviLot({ dateAcqImm: j.jouissance, bails: j.ctx.bails, provisoireIso: null });
  // Sans achat ni antériorité, le suivi part de l'entrée du bail (date que l'utilisateur confirmerait) :
  // même borne, AU JOUR, pour le maître et la dette (2ᵉ audit 🔴1 : un encaissement daté avant elle n'est
  // pas imputé, sauf la réserve du mois qui précède — le loyer payé le 28 du mois d'avant).
  const borne = suivi.date || j.bailDebut;
  const debutDu = borne;
  const ouv = suivi.ouverture;
  const d = _computeDetteBail({ ref: j.ref, ctx: j.ctx, bailDebut: j.bailDebut, fin: j.fin, mouvements: j.mouvements,
    catLigne, today: j.today, debutSuivi: borne, ouverture: ouv });
  if (!d || !d.to) return { j, d, maitre: { loyer: 0, charge: 0 }, annee: null };
  const annee = Number(d.to.slice(0, 4));
  const r = _computeFinancesMonthly({
    mouvements: j.mouvements, year: annee, window: computeConstatWindow({ year: annee, today: j.today, mouvements: j.mouvements }),
    today: j.today, catLigne, activeLots: [j.ref], debutDu: () => debutDu,
    ouverture: () => (ouv ? { ym: ouv.date.slice(0, 7), loyer: ouv.loyer, charge: ouv.charge, avance: ouv.avance } : null),
    loyerDue: (q, ym) => (q === j.ref ? duMoisSuivi(j.ctx, ym, borne) : { hc: 0, ch: 0 })
  });
  const b = r.byLot[j.ref];
  const s = (k) => (b ? Math.round(b.months.reduce((t, m) => t + m[k], 0) * 100) / 100 : 0);
  return { j, d, annee, maitre: { loyer: s('loyerRetard'), charge: s('chargeRetard') } };
}

describe('R0-C — dette de restitution == retard Finances du lot, au centime (240 jeux à un bail)', () => {
  const RES = SEEDS.map(mesurer);

  it('le harnais mesure vraiment quelque chose : dettes non nulles, Q1 exercé, baux clos et ouverts, IRL', () => {
    expect(RES.filter((x) => x.d && x.d.loyer > 0).length).toBeGreaterThan(80);
    expect(RES.filter((x) => x.d && x.d.charge > 0).length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.j.fin).length).toBeGreaterThan(40);
    expect(RES.filter((x) => !x.j.fin).length).toBeGreaterThan(40);
    expect(RES.filter((x) => x.j.ctx.bareme.length > 1).length).toBeGreaterThan(60);
    // Q1 révisé : biens achetés loués (borne de jouissance) ET premiers mois dus avant tout paiement
    expect(RES.filter((x) => x.j.jouissance && x.d.suiviPartiel).length).toBeGreaterThan(40);
    // antériorités notées : arriéré et avance posés en ouverture (une seule fois)
    expect(RES.filter((x) => x.j.ctx.bails[0].anteriorite && x.j.ctx.bails[0].anteriorite.situation === 'arriere').length).toBeGreaterThan(10);
    expect(RES.filter((x) => x.j.ctx.bails[0].anteriorite && x.j.ctx.bails[0].anteriorite.situation === 'avance').length).toBeGreaterThan(5);
    expect(RES.filter((x) => { const fp = premierVersementYm(x.j.mouvements, x.j.ref); return fp && fp > x.j.bailDebut.slice(0, 7); }).length).toBeGreaterThan(30);
    // et l'ouverture N-1 est réellement exercée (dette reportée d'un exercice antérieur)
    expect(RES.filter((x) => x.d && x.d.from && x.annee && Number(x.d.from.slice(0, 4)) < x.annee && x.d.loyer > 0).length).toBeGreaterThan(40);
  });

  for (const x of RES) {
    it(`jeu ${x.j.ref} (${x.j.bailDebut} → ${x.j.fin || 'ouvert'}, au ${x.j.today}) : loyer ${x.maitre.loyer} · charges ${x.maitre.charge}`, () => {
      expect(x.d).not.toBeNull();
      expect({ loyer: x.d.loyer, charge: x.d.charge }).toEqual(x.maitre);
    });
  }
});

describe('R0-C — plusieurs baux sur un lot : écart ÉPINGLÉ jusqu\'au lot 4 (Q2, maître par bail)', () => {
  // Cas C du CDC : le locataire 1 part avec novembre et décembre 2024 impayés ; le locataire 2
  // paie tout, plus un double virement de 750 € en mars 2025. Aujourd'hui le maître raisonne PAR
  // LOT : le trop-perçu du locataire 2 éteint une partie de la dette du locataire 1. La dette par
  // bail, elle, ne mélange jamais deux locataires. Ce test FIGE l'écart pour que le lot 4
  // (Q2 = oui) le fasse basculer en égalité « Σ des baux = chiffre du lot ».
  const ref = 'C';
  const ctx = { ref, bareme: [], bails: [
    { debut: '2024-01-01', finEffective: '2024-12-31', archive: true, hc: 700, ch: 50 },
    { debut: '2025-01-01', finEffective: '2026-06-30', archive: true, hc: 700, ch: 50 }] };
  const mouvements = ymRange('2024-01', '2026-06').filter((ym) => ym !== '2024-11' && ym !== '2024-12')
    .map((ym) => ({ qui: ref, date: ym + '-05', cat: 'Loyers encaissés', cr: ym === '2025-03' ? 1500 : 750, db: 0 }));
  const debutDu = '2024-01';
  const today = '2026-09-30';
  const bail = (debut, fin) => _computeDetteBail({ ref, ctx, bailDebut: debut, fin, mouvements, catLigne, today });

  it('par bail : locataire 1 doit 1 400 € de loyer, locataire 2 ne doit rien et a 750 € de trop-perçu', () => {
    expect(bail('2024-01-01', '2024-12-31').loyer).toBe(1400);
    expect(bail('2025-01-01', '2026-06-30')).toMatchObject({ loyer: 0, avance: 750 });
  });
  it('Finances (par lot, avant le lot 4) : 650 € de loyer en retard — le net des deux locataires', () => {
    const r = _computeFinancesMonthly({ mouvements, year: 2026, window: computeConstatWindow({ year: 2026, today, mouvements }), today,
      catLigne, activeLots: [ref], debutDu: () => debutDu, loyerDue: (q, ym) => duMoisSuivi(ctx, ym, null) });
    expect(r.byLot[ref].months.reduce((s, m) => s + m.loyerRetard, 0)).toBe(650);
  });
});

describe('R0-C · Q8 — écart mesuré avec le moteur des relances (`_loyerEtatLot` → retardLot), hors périmètre', () => {
  // Réplique PURE de ce que `_loyerEtatLot` (index.html) donne à `retardLot` : mois depuis
  // `_debutSuivi` jusqu'au mois courant, dû = duMois du LOT, reçu = Σ CRÉDITS de loyer (les
  // débits/contre-passations sont IGNORÉS), prédicat de catégorie `_isLoyerCategory`.
  const relance = (j) => {
    const fp = premierVersementYm(j.mouvements, j.ref);
    const start = _debutSuivi(j.ctx, fp);
    if (!start) return null;
    const recu = {};
    j.mouvements.forEach((m) => { if (m.qui === j.ref && (m.cr || 0) > 0 && estLoyer(m.cat)) { const ym = m.date.slice(0, 7); recu[ym] = (recu[ym] || 0) + m.cr; } });
    const months = ymRange(start, j.today.slice(0, 7)).map((ym) => { const d = duMois(j.ctx, ym); return { ym, hcDue: d.hc, chDue: d.ch, received: recu[ym] || 0 }; });
    return retardLot(etatMoisLot(months, {}), {}).resteLoyer;
  };
  // Lots suivis depuis l'entrée (pas d'achat loué) : la fenêtre des relances (_debutSuivi) et la règle
  // Q1 révisée ne divergent alors que sur les écarts nommés ci-dessous.
  const OUVERTS = Array.from({ length: 1000 }, (_, i) => 7000 + i).map(jeuUnBail).filter((j) => !j.fin && !j.jouissance && j.today === '2026-09-30');
  const res = OUVERTS.map((j) => {
    const fp = premierVersementYm(j.mouvements, j.ref);
    const d = _computeDetteBail({ ref: j.ref, ctx: j.ctx, bailDebut: j.bailDebut, fin: null, mouvements: j.mouvements, catLigne, today: j.today });
    // Premiers mois impayés d'une année ANTÉRIEURE à celle du 1ᵉʳ versement : dus (Q1 révisé), hors
    // de la fenêtre des relances (bornée au 1ᵉʳ janvier de l'année du 1ᵉʳ versement).
    const anterieur = !!(fp && fp.slice(0, 4) > j.bailDebut.slice(0, 4));
    const contrePasse = j.mouvements.some((m) => m.qui === j.ref && estLoyer(m.cat) && (m.db || 0) > 0);
    // Loyer payé AVANT l'entrée (le 28 du mois d'avant) : le maître le rattache au bail (Q4),
    // la fenêtre des relances démarre au mois d'entrée et ne le voit pas.
    const avantEntree = j.mouvements.some((m) => m.qui === j.ref && estLoyer(m.cat) && (m.cr || 0) > 0 && m.date < j.bailDebut);
    return { j, dette: d.loyer, relance: relance(j), contrePasse, avantEntree, anterieur };
  });

  it('sans contre-passation ni loyer payé avant l\'entrée : les deux moteurs réclament le même loyer', () => {
    const simples = res.filter((x) => !x.contrePasse && !x.avantEntree && !x.anterieur);
    expect(simples.length).toBeGreaterThan(10);
    simples.forEach((x) => expect(x.relance).toBe(x.dette));
  });
  it('ÉCART CONNU 1 : une contre-passation (rejet de prélèvement) est ignorée par les relances → elles réclament MOINS', () => {
    const avec = res.filter((x) => x.contrePasse && !x.avantEntree && !x.anterieur);
    expect(avec.length).toBeGreaterThan(0);
    avec.forEach((x) => expect(x.relance).toBeLessThanOrEqual(x.dette));
    expect(avec.some((x) => x.relance < x.dette)).toBe(true);
  });
  it('ÉCART CONNU 2 : un loyer payé avant l\'entrée est ignoré par les relances → elles réclament PLUS', () => {
    const avec = res.filter((x) => x.avantEntree && !x.contrePasse && !x.anterieur);
    expect(avec.length).toBeGreaterThan(0);
    avec.forEach((x) => expect(x.relance).toBeGreaterThanOrEqual(x.dette));
    expect(avec.some((x) => x.relance > x.dette)).toBe(true);
  });
});

describe('R0-C · Q8 — ÉCART CONNU 3 : premiers mois impayés d\'une année antérieure au 1ᵉʳ versement', () => {
  // Q1 révisé : le dû part de l'entrée du bail. La fenêtre des relances (_debutSuivi) commence au
  // 1ᵉʳ janvier de l'année du 1ᵉʳ versement : elle ne réclame pas ces mois-là (elle réclame MOINS).
  it('la relance ignore les premiers mois dus d\'une année sans versement', () => {
    const ref = 'Q8', ctx = { ref, bareme: [], bails: [{ debut: '2025-11-01', archive: false, hc: 700, ch: 0 }] };
    const mouvements = ymRange('2026-01', '2026-09').map((ym) => ({ qui: ref, date: ym + '-05', cat: 'Loyers encaissés', cr: 700, db: 0 }));
    const d = _computeDetteBail({ ref, ctx, bailDebut: '2025-11-01', fin: null, mouvements, catLigne, today: '2026-09-30' });
    const start = _debutSuivi(ctx, '2026-01');
    const months = ymRange(start, '2026-09').map((ym) => ({ ym, hcDue: duMois(ctx, ym).hc, chDue: 0, received: 700 }));
    expect(d.loyer).toBe(1400);
    expect(retardLot(etatMoisLot(months, {}), {}).resteLoyer).toBe(0);
  });
});

describe('R0-C — le harnais MORD : il aurait refusé la branche rejetée (feat/r0c-retenue-dg)', () => {
  // Réplique de la brique rejetée : Σ des `loyerRetard` de CHAQUE exercice de la vie du bail,
  // bornés au bail. Elle additionne des positions cumulées de fin d'exercice (ouverture N-1
  // recomptée chaque janvier, rattrapages ultérieurs ignorés). Un harnais qui ne la
  // distinguerait pas de la bonne réponse ne prouverait rien.
  const rejetee = (x) => {
    const { j, d } = x;
    const sv = debutSuiviLot({ dateAcqImm: j.jouissance, bails: j.ctx.bails, provisoireIso: null });
    const borne = sv.date || j.bailDebut, ouv = sv.ouverture;
    const debutDu = borne;
    const f7 = j.bailDebut.slice(0, 7), t7 = d.to;
    let tot = 0;
    for (let y = Number(f7.slice(0, 4)); y <= Number(t7.slice(0, 4)); y++) {
      const r = _computeFinancesMonthly({ mouvements: j.mouvements, year: y, window: computeConstatWindow({ year: y, today: j.today, mouvements: j.mouvements }),
        today: j.today, catLigne, activeLots: [j.ref], debutDu: () => debutDu,
        ouverture: () => (ouv ? { ym: ouv.date.slice(0, 7), loyer: ouv.loyer, charge: ouv.charge, avance: ouv.avance } : null),
        loyerDue: (q, ym) => (q === j.ref ? duMoisSuivi(j.ctx, ym, borne) : { hc: 0, ch: 0 }) });
      const b = r.byLot[j.ref];
      if (b) b.months.forEach((m) => { if (m.ym >= f7 && m.ym <= t7 && m.loyerRetard > 0) tot += m.loyerRetard; });
    }
    return Math.round(tot * 100) / 100;
  };
  it('sur les jeux à dette pluriannuelle, la somme par exercice diverge de la dette réelle', () => {
    const pluri = SEEDS.map(mesurer).filter((x) => x.d && x.d.to && x.d.loyer > 0 && Number(x.d.to.slice(0, 4)) > Number(x.j.bailDebut.slice(0, 4)));
    const faux = pluri.filter((x) => rejetee(x) !== x.d.loyer);
    expect(pluri.length).toBeGreaterThan(40);
    expect(faux.length).toBeGreaterThan(30);
    faux.forEach((x) => expect(rejetee(x)).toBeGreaterThan(x.d.loyer));   // toujours TROP retenu
  });
});
