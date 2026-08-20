/**
 * LOT 0 du CDC-LOYERS-DESIGN — LE SOCLE DES DATES.
 *
 * Le §4 du CDC constate que « la cascade d'imputation DÉTRUIT les dates » :
 * `recuParYm[ym] += m.cr` agrégeait des montants seuls, et `_loyerArrearsPass` ne
 * manipulait aucune date. Résultat : les 8 surfaces du tableau §4 affichaient une date
 * FAUSSE (dernier encaissement du lot, ou pire, la date d'émission / « aujourd'hui »).
 *
 * Ces tests encodent l'invariant **I-DATE** (§3.4 du CDC) :
 *   « Aucune date de paiement affichée qui ne corresponde pas réellement au mois
 *     quittancé ou constaté. En l'absence de rattachement : RIEN. »
 *
 * Et son corollaire non négociable : les fragments datés ne DÉCIDENT rien — l'arithmétique
 * du moteur unique (`_loyerArrearsPass`) doit rester au centime identique avec ou sans
 * `sources`. Sinon on aurait fabriqué un 8ᵉ moteur d'imputation.
 */
import { describe, it, expect } from 'vitest';
import { _loyerArrearsPass } from '../../js/core/loyer-du-mois.js';
import { etatMoisLot, datePaiementMois, mentionDateRecu } from '../../js/core/loyers-mois.js';

/** Un mois de 500 HC + 100 CH. */
const M = (ym, received, sources) => ({ ym, hcDue: 500, chDue: 100, received, sources });
const sansSources = (ms) => ms.map(({ ym, hcDue, chDue, received }) => ({ ym, hcDue, chDue, received }));

describe('LOT 0 — l\'arithmétique ne bouge pas d\'un centime (pas de 8ᵉ moteur)', () => {
  const cas = [
    ['rattrapage de 5 mois', [
      M('2026-01', 0), M('2026-02', 0), M('2026-03', 0), M('2026-04', 0),
      M('2026-05', 0), M('2026-06', 3600, [{ date: '2026-06-14', id: 'mv1', montant: 3600 }])
    ]],
    ['avance', [
      M('2026-01', 1800, [{ date: '2026-01-03', id: 'a1', montant: 1800 }]),
      M('2026-02', 0), M('2026-03', 0)
    ]],
    ['paiement partiel', [
      M('2026-01', 400, [{ date: '2026-01-05', id: 'p1', montant: 400 }]),
      M('2026-02', 600, [{ date: '2026-02-05', id: 'p2', montant: 600 }])
    ]],
    ['aucun paiement', [M('2026-01', 0), M('2026-02', 0)]],
    ['plusieurs versements sur un mois', [
      M('2026-01', 600, [
        { date: '2026-01-04', id: 'v1', montant: 250 },
        { date: '2026-01-19', id: 'v2', montant: 350 }
      ])
    ]]
  ];
  for (const [nom, months] of cas) {
    it(`${nom} — mêmes retards, mêmes arriérés, même avance avec et sans sources`, () => {
      const avec = _loyerArrearsPass(months, { carry: true });
      const sans = _loyerArrearsPass(sansSources(months), { carry: true });
      expect(avec.retardMois).toEqual(sans.retardMois);
      expect(avec.loyerArrear).toBe(sans.loyerArrear);
      expect(avec.chargeArrear).toBe(sans.chargeArrear);
      expect(avec.avance).toBe(sans.avance);
      expect(avec.causeLoyer).toEqual(sans.causeLoyer);
      expect(avec.causeCharge).toEqual(sans.causeCharge);
    });
    it(`${nom} — idem sans netting (carry:false, chemin legacy)`, () => {
      const avec = _loyerArrearsPass(months, { carry: false });
      const sans = _loyerArrearsPass(sansSources(months), { carry: false });
      expect(avec.retardMois).toEqual(sans.retardMois);
      expect(avec.loyerArrear).toBe(sans.loyerArrear);
      expect(avec.chargeArrear).toBe(sans.chargeArrear);
    });
  }

  it('Σ des montants imputés à un mois ≤ son dû, et Σ globale = Σ des encaissements consommés', () => {
    const months = [M('2026-01', 0), M('2026-02', 0),
      M('2026-03', 1800, [{ date: '2026-03-11', id: 'x', montant: 1800 }])];
    const p = _loyerArrearsPass(months, { carry: true });
    p.imputations.forEach((parts, i) => {
      const s = parts.reduce((a, x) => a + x.montant, 0);
      expect(s).toBeLessThanOrEqual(months[i].hcDue + months[i].chDue + 0.005);
    });
    const tot = p.imputations.flat().reduce((a, x) => a + x.montant, 0);
    expect(Math.round(tot * 100) / 100).toBe(1800);
  });
});

describe('LOT 0 — I-DATE : la date affichée est celle du mouvement qui a soldé CE mois', () => {
  it('rattrapage de 5 mois : les 5 mois portent la date du versement de rattrapage, pas la leur', () => {
    const months = [
      M('2026-01', 0), M('2026-02', 0), M('2026-03', 0), M('2026-04', 0),
      M('2026-05', 0), M('2026-06', 3600, [{ date: '2026-06-14', id: 'mv1', montant: 3600 }])
    ];
    const e = etatMoisLot(months);
    for (const ym of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
      expect(e.byYm[ym].solde).toBe(true);
      expect(datePaiementMois(e, ym).date).toBe('2026-06-14');
    }
  });

  it('avance : un mois futur couvert porte la VRAIE date de paiement (V8 — le critère est PAYÉ, pas ÉCHU)', () => {
    const months = [
      M('2026-01', 1800, [{ date: '2026-01-03', id: 'a1', montant: 1800 }]),
      M('2026-02', 0), M('2026-03', 0)
    ];
    const e = etatMoisLot(months);
    expect(datePaiementMois(e, '2026-03').date).toBe('2026-01-03');
    expect(e.byYm['2026-03'].solde).toBe(true);
  });

  it('mois soldé par DEUX versements : la date est celle du DERNIER, et nbVersements = 2', () => {
    const months = [M('2026-01', 600, [
      { date: '2026-01-04', id: 'v1', montant: 250 },
      { date: '2026-01-19', id: 'v2', montant: 350 }
    ])];
    const d = datePaiementMois(etatMoisLot(months), '2026-01');
    expect(d.date).toBe('2026-01-19');
    expect(d.nb).toBe(2);
    expect(d.dates).toEqual(['2026-01-04', '2026-01-19']);
  });

  it('paiement partiel : AUCUNE date de solde, mais les versements imputés restent datés (surface #2)', () => {
    const months = [M('2026-01', 400, [{ date: '2026-01-05', id: 'p1', montant: 400 }])];
    const e = etatMoisLot(months);
    expect(e.byYm['2026-01'].solde).toBe(false);
    const d = datePaiementMois(e, '2026-01');
    expect(d.date).toBeNull();              // I-DATE : pas soldé ⇒ pas de date de solde
    expect(d.dates).toEqual(['2026-01-05']); // mais le reçu partiel a de quoi être honnête
    expect(d.montant).toBe(400);
  });

  it('aucun paiement : rien — ni date, ni liste, ni montant (I-DATE, « sinon RIEN »)', () => {
    const e = etatMoisLot([M('2026-01', 0)]);
    expect(datePaiementMois(e, '2026-01')).toEqual({ date: null, dates: [], nb: 0, solde: false, montant: 0 });
  });

  it('mois inconnu / hors suivi : rien, jamais un repli', () => {
    const e = etatMoisLot([M('2026-01', 600, [{ date: '2026-01-05', montant: 600 }])]);
    expect(datePaiementMois(e, '2019-07').date).toBeNull();
    expect(datePaiementMois(null, '2026-01').date).toBeNull();
  });

  it('mois vacant (aucun dû) : rien à quittancer, donc aucune date', () => {
    const e = etatMoisLot([{ ym: '2026-01', hcDue: 0, chDue: 0, received: 0, sources: [] }]);
    expect(e.byYm['2026-01'].vacance).toBe(true);
    expect(datePaiementMois(e, '2026-01').date).toBeNull();
  });

  it('encaissement SANS date connue : le mois est soldé mais l\'app n\'invente aucune date', () => {
    // `sources` absent = l'appelant ne sait pas dire d'où vient l'argent (repli file://,
    // données anciennes). Le montant compte, la date reste nulle.
    const e = etatMoisLot([{ ym: '2026-01', hcDue: 500, chDue: 100, received: 600 }]);
    expect(e.byYm['2026-01'].solde).toBe(true);
    expect(datePaiementMois(e, '2026-01').date).toBeNull();
    expect(e.byYm['2026-01'].paiements).toEqual([]);
  });

  it('solde MIXTE (une part datée, une part anonyme) : pas de date — on ne prouve rien à moitié', () => {
    const e = etatMoisLot([{
      ym: '2026-01', hcDue: 500, chDue: 100, received: 600,
      sources: [{ date: '2026-01-08', id: 'v1', montant: 250 }]   // 350 € sans origine
    }]);
    expect(e.byYm['2026-01'].solde).toBe(true);
    expect(datePaiementMois(e, '2026-01').date).toBeNull();
  });

  it('sources incohérentes avec received : c\'est le MONTANT qui fait foi, jamais les sources', () => {
    // 900 € de sources annoncés pour 600 € réellement encaissés : on rogne les sources.
    const e = etatMoisLot([{
      ym: '2026-01', hcDue: 500, chDue: 100, received: 600,
      sources: [{ date: '2026-01-02', id: 'a', montant: 600 }, { date: '2026-01-20', id: 'b', montant: 300 }]
    }]);
    expect(e.byYm['2026-01'].received).toBe(600);
    expect(e.byYm['2026-01'].montantImpute).toBe(600);
    expect(datePaiementMois(e, '2026-01').date).toBe('2026-01-02');
  });

  it('un versement en couvre deux mois : chaque mois reçoit sa part, pas le total', () => {
    const months = [M('2026-01', 0), M('2026-02', 1200, [{ date: '2026-02-09', id: 'z', montant: 1200 }])];
    const e = etatMoisLot(months);
    expect(e.byYm['2026-01'].montantImpute).toBe(600);
    expect(e.byYm['2026-02'].montantImpute).toBe(600);
    expect(datePaiementMois(e, '2026-01').date).toBe('2026-02-09');
    expect(datePaiementMois(e, '2026-02').date).toBe('2026-02-09');
  });

  it('les paiements imputés portent leur poste (loyer / charge) — le reçu partiel en a besoin', () => {
    const e = etatMoisLot([M('2026-01', 600, [{ date: '2026-01-05', id: 'v', montant: 600 }])]);
    const postes = e.byYm['2026-01'].paiements.map((p) => p.poste).sort();
    expect(postes).toEqual(['charge', 'loyer']);
  });
});

describe('AUDIT C3 — une QUITTANCE ne porte une date que si le mois est réellement soldé', () => {
  // Le défaut : sur un mois partiellement payé (800 € dus, 300 € reçus le 14/06), la quittance
  // sortait « déclare avoir reçu LE 14/06/2026 … la somme de 800 € » — alors que le bandeau V7
  // affiché juste au-dessus promet « le document sortira SANS ligne payé le ». Sur un document
  // que l'article 21 rend opposable au bailleur, c'était pire qu'avant le chantier.
  const fr = (iso) => String(iso).split('-').reverse().join('/');

  it('mois NON soldé + un versement daté → la quittance ne dit AUCUNE date', () => {
    const m = mentionDateRecu({ date: null, dates: ['2026-06-14'], nb: 1 }, fr);
    expect(m.avecDate).toBe(false);
    expect(m.mention).toBe('');
  });
  it('le même cas sur un REÇU PARTIEL → la date du versement, car c'.concat("'est ce qu'il reconnaît avoir reçu"), () => {
    const m = mentionDateRecu({ date: null, dates: ['2026-06-14'], nb: 1 }, fr, { partiel: true });
    expect(m.avecDate).toBe(true);
    expect(m.mention).toBe(' le 14/06/2026');
  });
  it('mois soldé par DEUX versements → la branche multi-versements est atteinte (S1)', () => {
    const m = mentionDateRecu({ date: '2026-01-19', dates: ['2026-01-04', '2026-01-19'], nb: 2 }, fr);
    expect(m.mention).toBe(' en 2 versements, le dernier le 19/01/2026');
  });
  it('mois soldé par un seul versement → la date simple', () => {
    expect(mentionDateRecu({ date: '2026-01-05', dates: ['2026-01-05'], nb: 1 }, fr).mention).toBe(' le 05/01/2026');
  });
  it('mois soldé mais dont une part n\'a pas d\'origine datée → rien (I-DATE)', () => {
    expect(mentionDateRecu({ date: null, dates: [], nb: 0 }, fr).avecDate).toBe(false);
  });
  it('bout en bout : un mois partiel n\'expose jamais de date de solde', () => {
    const etat = etatMoisLot([{ ym: '2026-06', hcDue: 700, chDue: 100, received: 300,
      sources: [{ date: '2026-06-14', id: 'p', montant: 300 }] }]);
    const info = datePaiementMois(etat, '2026-06');
    expect(info.date).toBeNull();
    expect(mentionDateRecu(info, fr).avecDate).toBe(false);                    // quittance
    expect(mentionDateRecu(info, fr, { partiel: true }).avecDate).toBe(true);  // reçu partiel
  });
});

describe('LOT 0 — le scalaire FAIT FOI : des `sources` désalignées ne peuvent pas gonfler le pool', () => {
  // AUDIT DE RETRAIT (I2c) — cette branche de rognage n'était exercée par aucun test. Elle est
  // inatteignable aujourd'hui (l'unique site de production construit `received` comme la somme
  // des mêmes mouvements), mais c'est exactement le genre de garde qui saute en silence quand un
  // appelant futur passe autre chose : la cascade imputerait alors PLUS que ce qui est entré en
  // banque, et le locataire verrait des mois soldés qu'il n'a pas payés.
  const M2 = (ym, received, sources) => ({ ym, hcDue: 500, chDue: 100, received, sources });

  it('sources supérieures au reçu : elles sont ROGNÉES par la fin, le total imputé suit le scalaire', () => {
    const r = _loyerArrearsPass([
      M2('2026-01', 600, [{ date: '2026-01-05', id: 'a', montant: 600 },
                          { date: '2026-01-20', id: 'b', montant: 400 }])   // 1000 déclarés, 600 reçus
    ]);
    const total = (r.imputations[0] || []).reduce((s, i) => s + i.montant, 0);
    expect(Math.round(total * 100) / 100).toBe(600);
    // Le plus ANCIEN versement fait foi en entier ; c'est le dernier qui est rogné.
    expect((r.imputations[0] || []).every((i) => i.id === 'a')).toBe(true);
  });

  it('le rognage ne change AUCUN montant du calcul : mêmes soldes qu’en scalaire pur', () => {
    const avecSources = _loyerArrearsPass([
      M2('2026-01', 600, [{ date: '2026-01-05', id: 'a', montant: 600 },
                          { date: '2026-01-20', id: 'b', montant: 400 }]),
      M2('2026-02', 600, [{ date: '2026-02-05', id: 'c', montant: 900 }])
    ]);
    const scalaire = _loyerArrearsPass([
      { ym: '2026-01', hcDue: 500, chDue: 100, received: 600 },
      { ym: '2026-02', hcDue: 500, chDue: 100, received: 600 }
    ]);
    expect(avecSources.months.map((m) => [m.hcShort, m.chShort, m.arrears]))
      .toEqual(scalaire.months.map((m) => [m.hcShort, m.chShort, m.arrears]));
  });

  it('sources INFÉRIEURES au reçu : le complément est anonyme, jamais daté d’office', () => {
    const r = _loyerArrearsPass([
      M2('2026-01', 600, [{ date: '2026-01-05', id: 'a', montant: 200 }])
    ]);
    const imp = r.imputations[0] || [];
    expect(Math.round(imp.reduce((s, i) => s + i.montant, 0) * 100) / 100).toBe(600);
    expect(imp.some((i) => i.date === null)).toBe(true);          // I-DATE : on n'invente rien
  });
});
