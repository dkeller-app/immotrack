import { describe, it, expect } from 'vitest';
import { _computeDetteBail, _computeSuiviLot, _positionLot, _bailDuPaiement, _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { _loyerArrearsPass, duMoisSuivi, segmentsOccupation } from '../../js/core/loyer-du-mois.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';

/**
 * FINANCES-SUIVI-V2 — LE MOTEUR UNIQUE DU SUIVI DES LOYERS (lot E des retours du 05/10, décisions Didier
 * 05/10 et 06/10, docs/subjects/FINANCES-SUIVI-UNIQUE.md). Une seule passe compensée, bail par bail :
 * avance OU retard, jamais les deux ; la dette d'un locataire parti n'est jamais payée par le suivant ;
 * règlements sans virement (retenue pour loyer, manque accepté) plafonnés, jamais une avance ; arrondi < 1 €.
 */
const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' } : null);
const pay = (qui, date, cr, extra) => Object.assign({ id: qui + '@' + date + '@' + cr, qui, date, cat: 'Loyers encaissés', cr, db: 0 }, extra || {});
const TODAY = '2026-10-05';

// Cas « Arslan » rejoué (montants du cas réel, noms retirés) : l'ancien locataire part le 13/04 ; le loyer
// d'avril (prorata 303,33 €) est retenu sur son dépôt (303 €) ; le nouveau entre le 03/05 à 760 + 20.
const REF = 'L-101';
const ctx = { ref: REF, bareme: [
  { ref: REF, debut: '2024-08-20', fin: '2026-04-13', hc: 700, ch: 0, source: 'bail', bailDebut: '2024-08-20' },
  { ref: REF, debut: '2026-05-03', fin: null, hc: 760, ch: 20, source: 'bail', bailDebut: '2026-05-03' }],
  bails: [
    { debut: '2024-08-20', fin: '2030-08-19', finEffective: '2026-04-13', archive: true, hc: 700, ch: 0 },
    { debut: '2026-05-03', finEffective: null, archive: false, hc: 760, ch: 20 }] };
const MVTS = [pay(REF, '2026-03-09', 700), pay(REF, '2026-05-04', 730), pay(REF, '2026-06-02', 780), pay(REF, '2026-06-27', 780),
  pay(REF, '2026-08-05', 760), pay(REF, '2026-09-01', 780), pay(REF, '2026-10-02', 780)];
const MANQUE_AOUT = { id: 'mqa_1', bailDebut: '2026-05-03', ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-08-06' };
const suivi = (o) => _computeSuiviLot(Object.assign({ ref: REF, ctx, mouvements: MVTS, catLigne, today: TODAY,
  debutSuivi: '2026-03-01', sourceSuivi: 'provisoire', seuilArrondi: 1, retenues: { '2024-08-20': 303 } }, o || {}));
const pos = (s, ym) => _positionLot(s, ym);

describe('cas Arslan : la dette de l\'ancien locataire n\'est plus payée par le nouveau', () => {
  it('ancien bail : avril (303,33 €) réglé par la retenue de 303 € sur le dépôt, 0,33 € soldés d\'office (arrondi)', () => {
    const b = suivi().baux.find((x) => x.debut === '2024-08-20');
    expect(b).toMatchObject({ loyer: 0, charge: 0, finDu: '2026-04-13' });
    expect(b.retenue).toEqual({ montant: 303, appliquee: 303 });
    expect(b.arrondis).toEqual([{ ym: '2026-04', montant: -0.33 }]);
  });
  it('décision 17/10 : départ avec plusieurs mois impayés, loyer + charges — la retenue ne règle aucune charge', () => {
    const R2 = 'L-202';
    const ctx2 = { ref: R2, bareme: [{ ref: R2, debut: '2025-01-01', fin: '2026-04-13', hc: 700, ch: 50, source: 'bail', bailDebut: '2025-01-01' }],
      bails: [{ debut: '2025-01-01', finEffective: '2026-04-13', archive: true, hc: 700, ch: 50 }] };
    const s = _computeSuiviLot({ ref: R2, ctx: ctx2, mouvements: [pay(R2, '2026-01-05', 750)], catLigne, today: TODAY,
      debutSuivi: '2026-01-01', sourceSuivi: 'provisoire', seuilArrondi: 1, retenues: { '2025-01-01': 5000 } });
    const b = s.baux[0];
    // février 700 + 50, mars 700 + 50, avril 13/30 : 303,33 + 21,67 — tout le loyer est retenu, les charges restent dues
    expect(b.loyer).toBe(0);
    expect(b.charge).toBe(121.67);
    expect(b.retenue).toEqual({ montant: 5000, appliquee: 1703.33 });
    expect(b.mois.filter((x) => x.ym >= '2026-02').map((x) => x.chargeRetard)).toEqual([50, 50, 21.67]);
  });
  it('charges d’un bail sorti à la régularisation (17/10) : arriéré, antériorité de charges et position sans elles — un seul porteur', () => {
    const R3 = 'L-303';
    const ctx3 = { ref: R3, bareme: [{ ref: R3, debut: '2025-01-01', fin: '2026-04-13', hc: 700, ch: 50, source: 'bail', bailDebut: '2025-01-01' }],
      bails: [{ debut: '2025-01-01', finEffective: '2026-04-13', archive: true, hc: 700, ch: 50 }] };
    const base = { ref: R3, ctx: ctx3, catLigne, today: TODAY, debutSuivi: '2026-01-01', sourceSuivi: 'anteriorite', seuilArrondi: 1,
      mouvements: ['01', '02', '03'].map((mm) => pay(R3, '2026-' + mm + '-05', 750)).concat([pay(R3, '2026-04-05', 303.33)]),
      ouverture: { bailDebut: '2025-01-01', loyer: 0, charge: 120, avance: 0 } };
    const avant = _computeSuiviLot(base).baux[0];
    expect(avant).toMatchObject({ loyer: 0, charge: 141.67, chargesRegul: 0 });   // 120 d'antériorité + 21,67 d'avril
    expect(avant.ouverture).toMatchObject({ charge: 120 });
    const apres = _computeSuiviLot(Object.assign({}, base, { chargesRegul: { '2025-01-01': true } })).baux[0];
    expect(apres).toMatchObject({ loyer: 0, charge: 0, chargesRegul: 141.67, position: 0 });
    expect(apres.ouverture).toBeNull();   // l'antériorité de charges n'est plus réclamée à part : elle est dans aLaRegul
    expect(pos({ baux: [apres] }, '2026-04')).toMatchObject({ retard: 0 });
  });
  it('nouveau bail, positions de fin de mois : mai 0 (0,32 € ignorés) · juin +780 · juillet 0 · août/sept/oct −20', () => {
    const s = suivi();
    const v = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((ym) => pos(s, ym).position);
    expect(v).toEqual([0, 780, 0, -20, -20, -20]);
    // jamais retard ET avance sur le lot le même mois
    ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach((ym) => {
      const p = pos(s, ym);
      expect(p.retard > 0.005 && p.avance > 0.005).toBe(false);
    });
  });
  it('avec le manque accepté d\'août (20 €, panne électrique) : 0 partout sauf juin (+780) — sans toucher au bail', () => {
    const s = suivi({ manques: [MANQUE_AOUT] });
    expect(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((ym) => pos(s, ym).position)).toEqual([0, 780, 0, 0, 0, 0]);
    const b = s.baux.find((x) => x.debut === '2026-05-03');
    expect(b.mois.find((m) => m.ym === '2026-08').remise).toBe(20);
    expect(b.mois.reduce((t, m) => t + m.encaisse, 0)).toBe(4610);   // un manque n'est jamais un encaissement
  });
  it('Finances lit ce suivi : retard du lot 20 € (pas 323,01), aucune avance simultanée', () => {
    const r = _computeFinancesMonthly({ mouvements: MVTS, year: 2026, today: TODAY, catLigne, activeLots: [REF],
      window: computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }), suivi: () => suivi(),
      loyerDue: (q, ym) => duMoisSuivi(ctx, ym, '2026-03-01') });
    expect(r.byLot[REF].annual).toMatchObject({ retard: 20, avance: 0, position: -20 });
    expect(r.byLot[REF].months.find((m) => m.ym === '2026-07').loyerRetard).toBe(0);   // avant : −283,01 € (dette d'avril)
    expect(r.months.find((m) => m.mo === 6).ecart).toBe(780);
    // la passe fiscale (2044) ne bouge pas : loyers et provisions à l'encaissement
    const sans = _computeFinancesMonthly({ mouvements: MVTS, year: 2026, today: TODAY, catLigne, activeLots: [REF],
      window: computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }),
      loyerDue: (q, ym) => duMoisSuivi(ctx, ym, '2026-03-01') });
    expect(r.annual.loyersHC).toBe(sans.annual.loyersHC);
    expect(r.annual.provisions).toBe(sans.annual.provisions);
    expect(r.annual.base2044).toBe(sans.annual.base2044);
  });
});

describe('règlements sans virement (_loyerArrearsPass)', () => {
  const m = (hc, ch, recu, extra) => Object.assign({ hcDue: hc, chDue: ch, received: recu }, extra || {});
  it('une remise solde le mois d\'abord, puis la dette la plus ancienne ; plafonnée, jamais une avance', () => {
    const r = _loyerArrearsPass([m(600, 50, 0), m(600, 50, 650, { remise: 1000 })], { carry: true });
    expect(r.months[1]).toMatchObject({ loyerArrear: 0, chargeArrear: 0, avance: 0 });
    expect(r.avance).toBe(0);
    // tracée sur le mois d'ORIGINE de la dette soldée (le mois 1 était payé : tout part sur le mois 0)
    expect(r.months[0].remise).toBe(650);
    expect(r.months[1].remise).toBeUndefined();
  });
  it('relecture Fable : un manque de 700 € accepté en avril solde avril (50) PUIS mars (650) — chaque quittance dit sa remise', () => {
    const r = _loyerArrearsPass([m(650, 0, 0), m(650, 0, 600, { remise: 700 })], { carry: true });
    expect(r.months[1]).toMatchObject({ loyerArrear: 0, remise: 50 });
    expect(r.months[0].remise).toBe(650);
  });
  it('arrondi NET : 650,50 puis 649,50 pour 650 et 650 → aucune dette résiduelle (l’avance abandonnée compense)', () => {
    const r = _loyerArrearsPass([m(650, 0, 650.5), m(650, 0, 649.5)], { carry: true, seuilArrondi: 1 });
    expect(r.months.map((x) => x.arrondi || 0)).toEqual([0.5, -0.5]);
    expect(r.months[1]).toMatchObject({ loyerArrear: 0, avance: 0 });
  });
  it('remise partielle : H-1 (loyer du mois, charges du mois, puis arriérés)', () => {
    const r = _loyerArrearsPass([m(600, 50, 0), m(600, 50, 0, { remise: 620 })], { carry: true });
    // mois 2 : loyer 600 soldé, charges 20 sur 50 ; il reste 30 de charges du mois 2 + 650 du mois 1
    expect(r.months[1]).toMatchObject({ loyerArrear: 600, chargeArrear: 80, remise: 620 });
    expect(r.retardMois[0]).toEqual({ loyer: 600, charge: 50 });
    expect(r.retardMois[1]).toEqual({ loyer: 0, charge: 30 });
  });
  it('décision Didier 17/10 : la retenue sur le dépôt ne règle QUE le loyer HC (mois, puis arriérés), jamais les charges', () => {
    // mars et avril impayés (700 + 50, puis 303 + 20) ; retenue de 2 000 € : seuls les 1 003 € de loyer sont réglés
    const r = _loyerArrearsPass([m(700, 50, 0), m(303, 20, 0, { reglement: 2000 })], { carry: true });
    expect(r.months[1]).toMatchObject({ loyerArrear: 0, chargeArrear: 70, avance: 0 });
    expect(r.retardMois[0]).toEqual({ loyer: 0, charge: 50 });
    expect(r.retardMois[1]).toEqual({ loyer: 0, charge: 20 });
    expect(r.months[0].reglement).toBe(700);
    expect(r.months[1].reglement).toBe(303);
    // retenue plus courte que le loyer dû : loyer du mois, puis le plus vieux arriéré ; aucune charge touchée
    const p = _loyerArrearsPass([m(700, 50, 0), m(303, 20, 0, { reglement: 500 })], { carry: true });
    expect(p.retardMois[0]).toEqual({ loyer: 503, charge: 50 });
    expect(p.retardMois[1]).toEqual({ loyer: 0, charge: 20 });
    // un manque accepté garde l'ordre H-1 (loyer du mois, charges du mois, arriérés)
    const q = _loyerArrearsPass([m(700, 50, 0), m(303, 20, 0, { remise: 330 })], { carry: true });
    expect(q.retardMois[1]).toEqual({ loyer: 0, charge: 0 });
  });
  it('cas Arslan, août 2026 : 760 € reçus pour 760 + 20, manque de 20 € accepté → la remise solde les CHARGES, tracées (remiseCharge)', () => {
    const r = _loyerArrearsPass([m(760, 20, 760, { remise: 20 })], { carry: true });
    expect(r.months[0]).toMatchObject({ loyerArrear: 0, chargeArrear: 0, remise: 20, remiseCharge: 20 });
    const s = suivi({ manques: [MANQUE_AOUT] });
    const aout = s.baux.find((x) => x.debut === '2026-05-03').mois.find((x) => x.ym === '2026-08');
    expect(aout).toMatchObject({ remise: 20, remiseCharge: 20 });
  });
  it('relecture Fable 17/10 : le mois payé par l’AVANCE d’ouverture porte son imputation (anonyme, sans date) — loyer ET charges', () => {
    const r = _loyerArrearsPass([m(700, 50, 0), m(700, 50, 750)], { carry: true, opening: { avance: 750, idx: 0 } });
    expect(r.months[0]).toMatchObject({ loyerArrear: 0, chargeArrear: 0 });
    expect(r.imputations[0]).toEqual([{ date: null, id: null, montant: 700, poste: 'loyer' }, { date: null, id: null, montant: 50, poste: 'charge' }]);
  });
  it('sans remise ni règlement : sortie identique à l\'historique (option absente)', () => {
    const ms = [m(500, 30, 530), m(500, 30, 0), m(500, 30, 900)];
    expect(_loyerArrearsPass(ms, { carry: true })).toEqual(_loyerArrearsPass(ms.map((x) => Object.assign({}, x, { remise: 0, reglement: 0 })), { carry: true }));
  });
  it('arrondi : plafond CUMULÉ de 1 € par passe, signé, tracé', () => {
    const r = _loyerArrearsPass([m(100, 0, 99.6), m(100, 0, 99.5), m(100, 0, 99.9)], { carry: true, seuilArrondi: 1 });
    expect(r.months.map((x) => x.arrondi || 0)).toEqual([-0.4, -0.5, 0]);   // 0,1 € de plus dépasserait le plafond
    expect(r.months[2].loyerArrear).toBe(0.1);
  });
});

describe('Q3 — un virement entre deux baux (décision Didier 06/10)', () => {
  const segs = segmentsOccupation([{ debut: '2026-01-01', finEffective: '2026-06-06', archive: true }, { debut: '2026-07-18', archive: false }]);
  it('dans le bail → ce bail ; avant le 1ᵉʳ → le 1ᵉʳ ; après le dernier terminé → lui', () => {
    expect(_bailDuPaiement(segs, '2026-03-05')).toEqual({ k: 0, aConfirmer: false, choisi: false });
    expect(_bailDuPaiement(segs, '2025-12-28')).toEqual({ k: 0, aConfirmer: false, choisi: false });
    expect(_bailDuPaiement(segs, '2026-08-01')).toEqual({ k: 1, aConfirmer: false, choisi: false });
  });
  it('pendant la vacance : le plus proche, à confirmer (16/07 → le bail du 18/07)', () => {
    expect(_bailDuPaiement(segs, '2026-07-16')).toEqual({ k: 1, aConfirmer: true, choisi: false });
    expect(_bailDuPaiement(segs, '2026-06-10')).toEqual({ k: 0, aConfirmer: true, choisi: false });
  });
  it('le choix de l\'utilisateur fait foi', () => {
    expect(_bailDuPaiement(segs, '2026-07-16', '2026-01-01')).toEqual({ k: 0, aConfirmer: false, choisi: true });
  });
  it('cas « dépôt classé en loyer » : 495 € le 16/07, 2 jours avant l\'entrée → avance du nouveau bail, à confirmer, jamais restituable', () => {
    const c = { ref: 'F1', bareme: [], bails: [{ debut: '2024-10-01', finEffective: '2026-06-06', archive: true, hc: 450, ch: 0 },
      { debut: '2026-07-18', archive: false, hc: 495, ch: 30 }] };
    const mv = [pay('F1', '2026-03-01', 450), pay('F1', '2026-04-01', 450), pay('F1', '2026-05-01', 450), pay('F1', '2026-06-02', 90),
      pay('F1', '2026-07-16', 237.10), pay('F1', '2026-07-16', 495), pay('F1', '2026-08-03', 525), pay('F1', '2026-09-01', 525)];
    const s = _computeSuiviLot({ ref: 'F1', ctx: c, mouvements: mv, catLigne, today: '2026-09-20', debutSuivi: '2026-03-01', seuilArrondi: 1 });
    const nouveau = s.baux.find((b) => b.debut === '2026-07-18');
    expect(nouveau.aConfirmer.map((x) => x.montant)).toEqual([237.1, 495]);
    expect(nouveau.avanceBrute).toBe(495);
    expect(nouveau.avance).toBe(0);
    expect(_positionLot(s, '2026-09').position).toBe(495);
  });
});

describe('Q2 — locataire parti : dette figée, visible l\'année de son départ, puis plus nulle part', () => {
  const c = { ref: 'P', bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2026-03-31', archive: true, hc: 500, ch: 0 }] };
  const mv = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']
    .map((ym) => pay('P', ym + '-05', 500)).concat([pay('P', '2026-03-05', 200)]);
  const s = _computeSuiviLot({ ref: 'P', ctx: c, mouvements: mv, catLigne, today: '2027-02-15' });
  it('2026 : 800 € dus (février et 300 € de mars), visibles jusqu\'en décembre, mention « parti »', () => {
    expect(_positionLot(s, '2026-03')).toMatchObject({ retard: 800 });
    const dec = _positionLot(s, '2026-12');
    expect(dec).toMatchObject({ retard: 800 });
    expect(dec.baux[0].parti).toBe(true);
  });
  it('2027 : la dette n\'apparaît plus (elle reste sur le bail de l\'ancien locataire)', () => {
    expect(_positionLot(s, '2027-01')).toMatchObject({ retard: 0, position: 0 });
    expect(s.baux[0]).toMatchObject({ loyer: 800 });
  });
});

describe('propriété : jamais retard ET avance sur un bail le même mois (400 jeux, graine fixe)', () => {
  let x = 20261016;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  it('position compensée sur des paiements exacts, partiels, absents, doublés, avec remises et retenue', () => {
    for (let n = 0; n < 400; n++) {
      const hc = 300 + Math.round(rnd() * 900), ch = Math.round(rnd() * 80);
      const debut = '2025-0' + (1 + Math.floor(rnd() * 9)) + '-' + String(1 + Math.floor(rnd() * 27)).padStart(2, '0');
      const ferme = rnd() < 0.4;
      const c = { ref: 'X', bareme: [], bails: [{ debut, finEffective: ferme ? '2026-06-15' : null, archive: ferme, hc, ch }] };
      const mv = [];
      for (let y = 2025; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) {
        const r = rnd(); const ym = y + '-' + String(mo).padStart(2, '0');
        if (ym > '2026-09') continue;
        const k = r < 0.15 ? 0 : (r < 0.3 ? 0.5 : (r < 0.4 ? 2 : 1));
        if (k) mv.push(pay('X', ym + '-0' + (1 + Math.floor(rnd() * 8)), Math.round((hc + ch) * k * 100) / 100));
      }
      const manques = rnd() < 0.3 ? [{ bailDebut: debut, ym: '2026-0' + (1 + Math.floor(rnd() * 8)), montant: Math.round(rnd() * 400) }] : [];
      const s = _computeSuiviLot({ ref: 'X', ctx: c, mouvements: mv, catLigne, today: '2026-09-20', manques, seuilArrondi: 1,
        retenues: ferme ? { [debut]: Math.round(rnd() * 500) } : {} });
      s.baux.forEach((b) => b.mois.forEach((m) => {
        expect((m.retardLoyer + m.retardCharge) > 0.005 && m.avance > 0.005).toBe(false);
        expect(Math.abs(m.position - (m.avance - m.retardLoyer - m.retardCharge))).toBeLessThan(0.011);
      }));
    }
  });
});

describe('lecteurs du moteur : etatDepuisSuivi (onglet Loyers, relance, quittances) et _friseLot (bandeau)', async () => {
  const { etatDepuisSuivi, peutQuittancer, lignesRelance, retardLot } = await import('../../js/core/loyers-mois.js');
  const { _friseLot } = await import('../../js/core/finances-monthly.js');
  it('la relance du locataire en place ne réclame QUE son bail (jamais la dette de l’ancien)', () => {
    const s = _computeSuiviLot({ ref: REF, ctx, mouvements: MVTS, catLigne, today: TODAY, debutSuivi: '2026-03-01', seuilArrondi: 1 });   // sans retenue : l’ancien doit 303,33
    const lot = etatDepuisSuivi(s);
    const nouveau = etatDepuisSuivi(s, { debuts: ['2026-05-03'] });
    expect(lot.reste).toBe(323.33);
    expect(nouveau.reste).toBe(20);
    expect(lignesRelance(nouveau, {}).map((l) => [l.ym, l.montant])).toEqual([['2026-08', 20]]);
    expect(retardLot(nouveau, {}).depuisYm).toBe('2026-08');
  });
  it('quittance d’un mois soldé par un manque accepté : quittançable, remise et motif rendus', () => {
    const s = _computeSuiviLot({ ref: REF, ctx, mouvements: MVTS, catLigne, today: TODAY, debutSuivi: '2026-03-01', seuilArrondi: 1, manques: [MANQUE_AOUT] });
    const e = etatDepuisSuivi(s, { debuts: ['2026-05-03'], manques: [MANQUE_AOUT] });
    expect(peutQuittancer(e, '2026-08')).toEqual({ ok: true, motif: '', reste: 0 });
    expect(e.byYm['2026-08']).toMatchObject({ remise: 20, remiseMotifs: ['panne électrique'], received: 760 });
  });
  it('juillet payé d’avance le 27/06 : soldé et daté du 27/06', () => {
    const e = etatDepuisSuivi(suivi(), { debuts: ['2026-05-03'] });
    expect(e.byYm['2026-07']).toMatchObject({ solde: true, datePaiement: '2026-06-27' });
  });
  it('frise : une case = position de fin de mois ; solde = position au dernier mois exigible', () => {
    const f = _friseLot(suivi(), 2026, { dernierExigible: '2026-10', monthlyFull: 780 });
    expect(f.months.map((m) => m.cls).slice(0, 10)).toEqual(['vac', 'vac', 'ok', 'ok', 'ok', 'avance', 'ok', 'warn', 'warn', 'warn']);
    expect(f.months[10].cls).toBe('avenir');
    expect(f.solde).toBe(-20);
  });
});
