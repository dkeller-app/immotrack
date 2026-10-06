/**
 * FINANCES-SUIVI-UNIQUE P1 — défauts trouvés par le contre-audit indépendant du moteur
 * (js/core/suivi-loyers.js + js/core/loyer-du-mois.js). Chaque test a été écrit AVANT le
 * correctif et vu en échec ; il reproduit le scénario adverse de l'auditeur.
 *   1. avoir net négatif d'un mois perdu (pool écrasé à 0) ;
 *   2. manque accepté sous tolérance (grace) qui soldait la dette ANCIENNE à la place du mois ;
 *   3. retenue sur dépôt comptée sans restitution enregistrée ; dgPaid = 0 ignoré ;
 *   6. bail archivé sans aucun paiement : aucune dette (aucun suivi) ;
 *   mineurs : manque.montant = appliqué ; cartes copiées ; imputation dg hors des paiements par id ;
 *   manque hors des mois du bail tracé.
 */
import { describe, it, expect } from 'vitest';
import {
  suiviLot, suiviPerimetre, versEtatMoisLot, lignesRelanceBail, lotDepuisDb, debutSuiviDefaut, _computeDetteBail
} from '../../js/core/suivi-loyers.js';
import { _loyerArrearsPass } from '../../js/core/loyer-du-mois.js';
import { lotArslan, TODAY_ARSLAN, CLE_ANCIEN, vir } from './suivi-loyers-fixtures.js';

const moisDe = (sb, ym) => sb.mois.find((m) => m.ym === ym);
const bail = (cle, debut, hc, ch, extra) => Object.assign({ cle, debut, fin: null, finEffective: null, archive: false, hc, ch, noms: cle }, extra || {});
// `causeLoyer/causeCharge[].recv` est l'ÉCHO du reçu brut du mois (signé), pas de l'arithmétique :
// on le neutralise pour comparer la sortie à celle du même mois dont le reçu est ramené à 0.
const sansEcho = (r) => Object.assign({}, r, { causeLoyer: r.causeLoyer.map(({ recv, ...e }) => e), causeCharge: r.causeCharge.map(({ recv, ...e }) => e) });
const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' } : null);

// ── 1. Avoir net négatif ────────────────────────────────────────────────────────
describe('défaut 1 · un avoir net négatif d\'un mois devient une dette (jamais perdu)', () => {
  const lotAvoir = (paiements) => ({ ref: 'X', bareme: [], manques: [], baux: [bail('X|2026-03-01', '2026-03-01', 760, 20)], paiements });
  it('avoir −100 seul en avril (aucun virement) : avril et mai en retard de 880', () => {
    const s = suiviLot(lotAvoir([vir('a', '2026-03-02', 780), vir('b', '2026-04-10', -100), vir('c', '2026-05-02', 780)]), { today: '2026-05-20' });
    const b = s.baux[0];
    expect(moisDe(b, '2026-04')).toMatchObject({ recu: -100, retard: 880, avance: 0 });
    expect(moisDe(b, '2026-05')).toMatchObject({ retard: 880, avance: 0 });
    expect(b.position.solde).toBe(-880);
  });
  it('avoir −900 qui dépasse le virement d\'avril (780) : retard 900 en avril et en mai', () => {
    const s = suiviLot(lotAvoir([vir('a', '2026-03-02', 780), vir('b', '2026-04-02', 780), vir('b2', '2026-04-10', -900), vir('c', '2026-05-02', 780)]), { today: '2026-05-20' });
    const b = s.baux[0];
    expect(moisDe(b, '2026-04')).toMatchObject({ recu: -120, retard: 900 });
    expect(moisDe(b, '2026-05')).toMatchObject({ retard: 900 });
  });
  it('avoir qui reprend une avance : l\'avance reportée diminue d\'autant (imputations cohérentes)', () => {
    const s = suiviLot(lotAvoir([vir('a', '2026-03-02', 1560), vir('b', '2026-04-10', -100)]), { today: '2026-04-20' });
    const avr = moisDe(s.baux[0], '2026-04');
    expect(avr).toMatchObject({ retard: 100, avance: 0 });
    expect(avr.imputations.reduce((t, p) => t + p.montant, 0)).toBe(680);
  });
  it('avoir après la sortie (mois sans dû) : la dette reste dans la relance (relance = KPI)', () => {
    const s = suiviLot({ ref: 'X', bareme: [], manques: [], baux: [bail('X|2026-03-01', '2026-03-01', 500, 0, { finEffective: '2026-03-31', archive: true })],
      paiements: [vir('a', '2026-03-02', 500), vir('b', '2026-05-10', -95)] }, { today: '2026-06-10' });
    const b = s.baux[0];
    expect(b.position.solde).toBe(-95);
    expect(lignesRelanceBail(b, { toleranceActive: false })).toEqual([{ ym: '2026-05', mois: 'mai 2026', libelle: 'Loyer hors charges — mai 2026', montant: 95 }]);
  });
  it('rétro-compatibilité : sans l\'option avoirNegatif, _loyerArrearsPass garde EXACTEMENT l\'ancienne sortie (avoir écrasé)', () => {
    const months = [{ hcDue: 760, chDue: 20, received: 780 }, { hcDue: 760, chDue: 20, received: -100 }, { hcDue: 760, chDue: 20, received: 780 }];
    const ancien = _loyerArrearsPass(months, { carry: true });
    expect(ancien.loyerArrear + ancien.chargeArrear).toBe(780);
    const clamp = months.map((m) => Object.assign({}, m, { received: Math.max(0, m.received) }));
    expect(sansEcho(ancien)).toEqual(sansEcho(_loyerArrearsPass(clamp, { carry: true })));
    expect(_loyerArrearsPass(months, { carry: true, avoirNegatif: true }).loyerArrear).toBe(860);
  });
  it('rétro-compatibilité (aléatoire) : options des anciens appelants ⇒ sortie identique à received clampé à 0', () => {
    let a = 12345;
    const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    for (let n = 0; n < 200; n++) {
      const months = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => {
        const hcDue = Math.round(rnd() * 900), chDue = Math.round(rnd() * 60);
        const r = rnd();
        const received = r < 0.2 ? -Math.round(rnd() * 400) : Math.round(rnd() * 2000);
        return { hcDue, chDue, received, sources: received > 0 ? [{ date: '2026-01-0' + (1 + Math.floor(rnd() * 9)), id: 'p' + n, montant: received }] : [] };
      });
      const clamp = months.map((m) => Object.assign({}, m, { received: Math.max(0, m.received) }));
      for (const opts of [{ carry: true }, { carry: false }, { carry: true, graceLast: true }, { carry: true, opening: { loyer: 100, charge: 5, avance: 50 } }]) {
        expect(sansEcho(_loyerArrearsPass(months, opts))).toEqual(sansEcho(_loyerArrearsPass(clamp, opts)));
      }
    }
  });
});

// ── 2. Manque accepté sous tolérance ────────────────────────────────────────────
describe('défaut 2 · manque accepté sous tolérance : solde le mois courant, jamais la dette ancienne à sa place', () => {
  const base = { ref: 'G', bareme: [], baux: [bail('G|2026-05-01', '2026-05-01', 760, 20)],
    paiements: [vir('a', '2026-05-02', 780), vir('b', '2026-06-02', 760), vir('c', '2026-07-02', 780), vir('d', '2026-08-05', 760)] };
  const mq = [{ id: 'm1', bailCle: 'G|2026-05-01', ym: '2026-08', montant: 20, motif: 'panne', date: '2026-08-05' }];
  for (const [lbl, today, grace] of [['vu le 05/08, tolérance active', '2026-08-05', true], ['vu le 15/08', '2026-08-15', false], ['vu le 05/09, tolérance active', '2026-09-05', true]]) {
    it(lbl + ' : retard −20 (juin reste dû), août courant 0, remise 20 appliquée à août', () => {
      const s = suiviLot(Object.assign({}, base, { manques: mq }), { today, graceLast: grace });
      const aout = moisDe(s.baux[0], '2026-08');
      expect(s.baux[0].position.solde).toBe(-20);
      expect(aout.courant).toEqual({ loyer: 0, charge: 0 });
      expect(aout.anterieur).toMatchObject({ loyer: 0, charge: 20, depuis: '2026-06' });
      expect(aout.remiseAppliquee).toBe(20);
    });
  }
  it('socle : sous grace, la remise vise le manque neuf du mois et trace cibleIdx = mois courant', () => {
    const r = _loyerArrearsPass([{ hcDue: 760, chDue: 20, received: 760 }, { hcDue: 760, chDue: 20, received: 760, remise: 20 }],
      { carry: true, graceLast: true, detail: true });
    expect(r.chargeArrear).toBe(20);
    expect(r.causeCharge).toEqual([{ idx: 0, short: 20, due: 20, recv: 760 }]);
    expect(r.months[1].courant).toEqual({ loyer: 0, charge: 0 });
    expect(r.remises).toEqual([{ idx: 1, cibleIdx: 1, poste: 'charge', montant: 20 }]);
  });
});

// ── 3. Retenue sur dépôt ────────────────────────────────────────────────────────
describe('défaut 3 · retenue sur dépôt : seulement si la restitution est enregistrée ; dgPaid fait foi', () => {
  const db = (b) => ({ baux: {}, loyerBareme: [], baux_evenements: [],
    baux_historique: [Object.assign({ ref: 'L', debut: '2025-01-01', fin: '2028-01-01', finEffective: '2026-04-30', hc: 500, ch: 0, dg: 500 }, b)],
    mouvements: [{ id: 1, date: '2026-01-05', qui: 'L', cat: 'Loyers encaissés', cr: 500, db: 0 }, { id: 2, date: '2026-02-05', qui: 'L', cat: 'Loyers encaissés', cr: 500, db: 0 }] });
  it('dgRetenu 100 posé SANS restitution enregistrée : aucun règlement, dette 1 000', () => {
    const lot = lotDepuisDb('L', db({ dgRetenu: 100, dgRestitue: 0 }), { catLigne });
    expect(lot.baux[0].dg).toBeUndefined();
    const s = suiviLot(lot, { today: '2026-05-10' });
    expect(s.baux[0].position.solde).toBe(-1000);
    expect(s.baux[0].traces.filter((t) => t.type === 'dg')).toEqual([]);
  });
  it('dgPaid = 0 (dépôt jamais versé), restitution enregistrée à 0 : aucun règlement fantôme du dépôt contractuel', () => {
    const lot = lotDepuisDb('L', db({ dgPaid: 0, dgRetenu: 0, dgRestitueAt: '2026-05-20', dgRestitueMontant: 0 }), { catLigne });
    expect(lot.baux[0].dg).toMatchObject({ verse: 0 });
    const s = suiviLot(lot, { today: '2026-06-10' });
    expect(s.baux[0].position.solde).toBe(-1000);
  });
  it('restitution enregistrée par _dgConfirmerRestitution (dgRestitueAt + dgRestitueMontant) : retenue = versé − retenues − restitué', () => {
    const lot = lotDepuisDb('L', db({ dgPaid: 500, dgRetenu: 100, dgRestitueAt: '2026-05-20', dgRestitueMontant: 0, dgPenaliteArt22: 0 }), { catLigne });
    expect(lot.baux[0].dg).toEqual({ verse: 500, retenuAutres: 100, restitue: 0, penalite: 0, date: '2026-04-30' });
    expect(suiviLot(lot, { today: '2026-06-10' }).baux[0].position.solde).toBe(-600);
  });
  it('restitution saisie sans date (dgRestitueMontant seul) : enregistrée', () => {
    const lot = lotDepuisDb('L', db({ dgRetenu: 0, dgRestitueMontant: 500 }), { catLigne });
    expect(lot.baux[0].dg).toMatchObject({ verse: 500, restitue: 500 });
  });
});

// ── 6. Bail archivé sans aucun paiement ─────────────────────────────────────────
describe('défaut 6 · lot sans aucun paiement dont le bail est archivé : la vraie dette existe', () => {
  const lot = () => ({ ref: 'N', bareme: [], manques: [], paiements: [],
    baux: [bail('N|2025-06-01', '2025-06-01', 500, 0, { finEffective: '2026-03-31', archive: true })] });
  it('suivi au début du bail, dû de juin 2025 à la fin effective (mars 2026) = 5 000', () => {
    expect(debutSuiviDefaut(lot())).toEqual({ date: '2025-06-01', source: 'provisoire' });
    const s = suiviLot(lot(), { today: '2026-10-05' });
    expect(s.baux.length).toBe(1);
    expect(s.baux[0].mois.map((m) => m.ym)[0]).toBe('2025-06');
    expect(s.baux[0].mois[s.baux[0].mois.length - 1].ym).toBe('2026-03');
    expect(_computeDetteBail(lot(), 'N|2025-06-01', { today: '2026-10-05' })).toEqual({ loyer: 5000, charge: 0, avance: 0 });
  });
  it('plusieurs baux archivés, aucun paiement : le suivi démarre au début du plus récent', () => {
    const l = lot();
    l.baux = [bail('N|2024-01-01', '2024-01-01', 400, 0, { finEffective: '2025-03-31', archive: true })].concat(l.baux);
    expect(debutSuiviDefaut(l)).toEqual({ date: '2025-06-01', source: 'provisoire' });
  });
  it('debutSuivi injecté AVANT l\'entrée en jouissance : aucun dû avant le début du bail', () => {
    const l = Object.assign(lot(), { debutSuivi: { date: '2025-01-01', source: 'acquisition' } });
    l.baux[0] = bail('N|2025-06-15', '2025-06-15', 600, 0, { finEffective: '2026-03-31', archive: true });
    const s = suiviLot(l, { today: '2026-10-05' });
    expect(s.baux[0].mois[0]).toMatchObject({ ym: '2025-06', du: { hc: 320, ch: 0, total: 320 } });
    expect(s.baux[0].mois.filter((m) => m.ym < '2025-06').every((m) => m.du.total === 0)).toBe(true);
  });
});

// ── Mineurs ─────────────────────────────────────────────────────────────────────
describe('mineurs du contre-audit', () => {
  const lotMq = (montant, ym) => ({ ref: 'M', bareme: [], manques: [{ id: 'm1', bailCle: 'M|2026-05-01', ym: ym || '2026-08', montant, motif: 'a', date: '2026-08-05' }],
    baux: [bail('M|2026-05-01', '2026-05-01', 760, 20)],
    paiements: [vir('a', '2026-05-02', 780), vir('b', '2026-06-02', 780), vir('c', '2026-07-02', 780), vir('d', '2026-08-05', 760), vir('e', '2026-09-02', 780)] });
  it('manque.montant = montant APPLIQUÉ (le demandé reste lisible)', () => {
    const aout = moisDe(suiviLot(lotMq(500), { today: '2026-09-20' }).baux[0], '2026-08');
    expect(aout.manque).toMatchObject({ montant: 20, montantDemande: 500 });
    expect(aout.remiseAppliquee).toBe(20);
  });
  it('manque sur un mois hors des mois du bail : tracé explicitement, sans effet', () => {
    const s = suiviLot(lotMq(20, '2026-03'), { today: '2026-09-20' });
    expect(s.baux[0].traces).toContainEqual({ type: 'manque-ignore', ym: '2026-03', montant: 20, ref: 'm1', raison: 'hors-mois-du-bail' });
  });
  it('manque rattaché à un bail inconnu : listé dans manquesIgnores', () => {
    const l = lotMq(20); l.manques[0].bailCle = 'M|1999-01-01';
    expect(suiviLot(l, { today: '2026-09-20' }).manquesIgnores).toEqual([{ id: 'm1', bailCle: 'M|1999-01-01', ym: '2026-08', montant: 20, raison: 'bail-inconnu' }]);
  });
  it('les cartes sont des copies : les muter ne modifie pas le suivi', () => {
    const s = suiviLot({ ref: 'D', bareme: [], manques: [], baux: [bail('D|2026-01-01', '2026-01-01', 650, 10)], paiements: [vir('j', '2026-01-03', 660), vir('f', '2026-02-03', 538)] }, { today: '2026-02-20' });
    const c = suiviPerimetre([s], '2026-02').enRetard[0];
    c.courant.loyer = 999; c.imputations.push({ x: 1 }); c.du.hc = 0; c.anterieur.loyer = 1; c.imputations[0].montant = 0;
    const fev = moisDe(s.baux[0], '2026-02');
    expect(fev.courant).toEqual({ loyer: 112, charge: 10 });
    expect(fev.imputations).toHaveLength(1);
    expect(fev.imputations[0].montant).toBe(538);
    expect(fev.du.hc).toBe(650);
  });
  it('versEtatMoisLot : la retenue sur dépôt n\'est pas un paiement avec un id de mouvement', () => {
    const s = suiviLot(lotArslan(), { today: TODAY_ARSLAN, graceLast: true });
    const e = versEtatMoisLot(s.baux.find((b) => b.cle === CLE_ANCIEN));
    const avr = e.byYm['2026-04'];
    expect(avr.paiements).toEqual([]);
    expect(avr.reglements).toEqual([{ date: '2026-04-13', kind: 'dg', montant: 303, poste: 'loyer' }]);
    expect(avr.solde).toBe(true);
    expect(avr.montantImpute).toBe(303);
  });
});
