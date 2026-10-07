/**
 * FINANCES-SUIVI-UNIQUE P1 — le moteur unique de suivi des loyers (js/core/suivi-loyers.js).
 * Spécification : docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §B, §C, §F.1 (tests 1 à 16) et
 * §I (décisions de Didier du 06/10 : locataire parti visible pendant l'année civile de son départ, Q3 virement entre
 * deux baux, GLI qui ne réduit pas la dette). Invariants : suivi-loyers-invariants.test.js.
 */
import { describe, it, expect } from 'vitest';
import {
  suiviLot, suiviPerimetre, versByLot, versEtatMoisLot, lignesRelanceBail, detteBail,
  _computeDetteBail, collecterPaiements, paiementsNonAffectes, debutSuiviDefaut, lotDepuisDb, cleBail
} from '../../js/core/suivi-loyers.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { ymRange } from '../../js/core/loyers-mois.js';
import { etatMoisLot } from './etat-mois-fixture.js';   // P7 : référence figée de la forme (etatMoisLot supprimé du module)
import { lotArslan, TODAY_ARSLAN, CLE_ANCIEN, CLE_ARSLAN, vir } from './suivi-loyers-fixtures.js';

const OPTS_ARSLAN = { today: TODAY_ARSLAN, graceLast: true };
const moisDe = (sb, ym) => sb.mois.find((m) => m.ym === ym);
const bailDe = (s, cle) => s.baux.find((b) => b.cle === cle);
const soldes = (s, yms) => yms.map((ym) => (s.mois[ym] ? s.mois[ym].solde : null));
const bail = (cle, debut, hc, ch, extra) => Object.assign({ cle, debut, fin: null, finEffective: null, archive: false, hc, ch, noms: cle }, extra || {});

// ── 1. Arslan, au centime (§C.2) ────────────────────────────────────────────────
describe('1 · cas Arslan (Ferrette - 101), tableau §C.2 au centime', () => {
  const s = suiviLot(lotArslan(), OPTS_ARSLAN);
  const g = suiviLot(lotArslan({ geste: true }), OPTS_ARSLAN);
  const anc = bailDe(s, CLE_ANCIEN), ars = bailDe(s, CLE_ARSLAN);

  it('début du suivi provisoire = mois du 1er loyer encaissé (09/03 → mars)', () => {
    expect(s.debutSuivi).toEqual({ date: '2026-03-01', source: 'provisoire' });
  });
  it('ancien bail : mars payé, avril 303,33 réglé par la retenue de 303 € sur le dépôt, 0,33 soldé par arrondi', () => {
    expect(anc.mois.map((m) => m.ym)).toEqual(['2026-03', '2026-04']);
    const avr = moisDe(anc, '2026-04');
    expect(avr.du).toEqual({ hc: 303.33, ch: 0, total: 303.33 });
    expect(avr.imputations).toEqual([{ mvId: 'dg:' + CLE_ANCIEN, date: '2026-04-13', kind: 'dg', montant: 303, poste: 'loyer' }]);
    expect(avr.arrondi).toBe(-0.33);
    expect(avr.solde).toBe(0);
    expect(anc.traces).toEqual([
      { type: 'dg', ym: '2026-04', montant: 303, ref: 'dg:' + CLE_ANCIEN },
      { type: 'arrondi', ym: '2026-04', montant: -0.33, ref: null }
    ]);
    expect(anc.position).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 });
    expect(anc.sorti).toBe(true);
  });
  it('bail Arslan : mai 729,68 (29/31), arrondi 0,32 ; juin +780 ; juillet payé par le virement du 27/06', () => {
    const mai = moisDe(ars, '2026-05');
    expect(mai.du).toEqual({ hc: 710.97, ch: 18.71, total: 729.68 });
    expect(mai.arrondi).toBe(0.32);
    expect(mai.solde).toBe(0);
    expect(moisDe(ars, '2026-06')).toMatchObject({ avance: 780, retard: 0, solde: 780 });
    const jui = moisDe(ars, '2026-07');
    expect(jui.solde).toBe(0);
    expect(jui.recu).toBe(0);
    expect(jui.imputations).toEqual([
      { mvId: 'v4', date: '2026-06-27', kind: 'virement', montant: 760, poste: 'loyer' },
      { mvId: 'v4', date: '2026-06-27', kind: 'virement', montant: 20, poste: 'charge' }
    ]);
    expect(jui.paye).toBe(true);
  });
  it('sans le geste : août −20 (charges), septembre « payé + reste dû des mois précédents : 20 (depuis août) »', () => {
    expect(moisDe(ars, '2026-08')).toMatchObject({ recu: 760, solde: -20, retard: 20, avance: 0, courant: { loyer: 0, charge: 20 } });
    const sep = moisDe(ars, '2026-09');
    expect(sep.courant).toEqual({ loyer: 0, charge: 0 });
    expect(sep.anterieur).toEqual({ loyer: 0, charge: 20, depuis: '2026-08' });
    expect(sep.paye).toBe(true);
    expect(sep.solde).toBe(-20);
    expect(ars.position).toEqual({ retardLoyer: 0, retardCharge: 20, avance: 0, solde: -20 });
  });
  it('ligne d\'écart du lot d\'avril à octobre : 0 / 0 / +780 / 0 / −20 / −20 / −20 sans geste', () => {
    expect(soldes(s, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual([0, 0, 0, 780, 0, -20, -20, -20]);
    expect(s.mois['2026-10'].retard).toBe(20);
  });
  it('avec le geste (manque accepté 20 € en août) : 0 partout sauf juin (+780), retard du lot 0', () => {
    expect(soldes(g, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']))
      .toEqual([0, 0, 0, 780, 0, 0, 0, 0]);
    const aout = moisDe(bailDe(g, CLE_ARSLAN), '2026-08');
    expect(aout.manque).toEqual({ id: 'mqa_1', montant: 20, montantDemande: 20, motif: 'panne électrique', date: '2026-08-05' });
    expect(aout.remiseAppliquee).toBe(20);
    expect(aout.recu).toBe(760);                 // un manque n'est pas un encaissement
    expect(g.mois['2026-10']).toMatchObject({ retard: 0, avance: 0, solde: 0 });
    expect(bailDe(g, CLE_ARSLAN).traces).toContainEqual({ type: 'manque', ym: '2026-08', montant: 20, ref: 'mqa_1' });
  });
});

// ── 2. Ancien locataire (cas C de R0-C) ─────────────────────────────────────────
describe('2 · la dette d\'un ancien locataire n\'entre jamais dans le bail suivant', () => {
  const lot = (paiementsB2) => ({
    ref: 'L', bareme: [], manques: [],
    debutSuivi: { date: '2026-01-01', source: 'acquisition' },
    baux: [bail('L|2025-11-01', '2025-11-01', 700, 50, { finEffective: '2026-02-28', archive: true }), bail('L|2026-03-01', '2026-03-01', 750, 0)],
    paiements: paiementsB2
  });
  it('bail 1 : 1 400 € loyer + 100 € charges ; bail 2 : 0 € de retard et 750 € d\'avance', () => {
    const s = suiviLot(lot([vir('a', '2026-03-03', 1500)]), { today: '2026-03-20' });
    expect(bailDe(s, 'L|2025-11-01').position).toEqual({ retardLoyer: 1400, retardCharge: 100, avance: 0, solde: -1500 });
    expect(bailDe(s, 'L|2026-03-01').position).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 750, solde: 750 });
    expect(detteBail(bailDe(s, 'L|2025-11-01'))).toEqual({ loyer: 1400, charge: 100, avance: 0 });
  });
});

// ── 3. Manque accepté ───────────────────────────────────────────────────────────
describe('3 · manque accepté', () => {
  it('plafonné à la dette, ne crée jamais d\'avance', () => {
    const l = lotArslan({ geste: true });
    l.manques[0].montant = 500;
    const s = suiviLot(l, OPTS_ARSLAN);
    const aout = moisDe(bailDe(s, CLE_ARSLAN), '2026-08');
    expect(aout.remiseAppliquee).toBe(20);
    expect(aout.avance).toBe(0);
    expect(moisDe(bailDe(s, CLE_ARSLAN), '2026-09').avance).toBe(0);
  });
  it('annulation (tombstone) ⇒ sortie identique à l\'avant, égalité profonde', () => {
    const l = lotArslan({ geste: true });
    l.manques[0]._deleted = true;
    expect(suiviLot(l, OPTS_ARSLAN)).toEqual(suiviLot(lotArslan(), OPTS_ARSLAN));
  });
  it('geste sur la dette ancienne (C.3) : un manque saisi en juillet solde février', () => {
    const l = lotDetteAncienne();
    l.manques = [{ id: 'mqa_9', bailCle: 'D|2026-01-01', ym: '2026-07', montant: 122, motif: 'accord', date: '2026-07-20' }];
    const s = suiviLot(l, { today: '2026-07-20' });
    const jul = moisDe(s.baux[0], '2026-07');
    expect(jul.anterieur).toEqual({ loyer: 0, charge: 0, depuis: null });
    expect(jul.solde).toBe(0);
    expect(moisDe(s.baux[0], '2026-02').residu).toEqual({ loyer: 0, charge: 0 });
    expect(moisDe(s.baux[0], '2026-06').solde).toBe(-122);   // le passé ne bouge pas
  });
  it('n\'a aucun effet sur un autre bail ni sur les mois antérieurs du même bail', () => {
    const a = suiviLot(lotArslan(), OPTS_ARSLAN), b = suiviLot(lotArslan({ geste: true }), OPTS_ARSLAN);
    expect(bailDe(b, CLE_ANCIEN)).toEqual(bailDe(a, CLE_ANCIEN));
    expect(bailDe(b, CLE_ARSLAN).mois.slice(0, 3)).toEqual(bailDe(a, CLE_ARSLAN).mois.slice(0, 3));
  });
});

// ── 4. Avance sur deux mois et plus ─────────────────────────────────────────────
describe('4 · avance sur 2 mois et plus', () => {
  it('3 loyers payés en janvier → février et mars soldés, imputés au virement de janvier', () => {
    const s = suiviLot({ ref: 'A', bareme: [], manques: [], baux: [bail('A|2026-01-01', '2026-01-01', 500, 0)],
      paiements: [vir('j', '2026-01-05', 1500)] }, { today: '2026-03-15' });
    const b = s.baux[0];
    expect(b.mois.map((m) => [m.ym, m.retard, m.avance])).toEqual([['2026-01', 0, 1000], ['2026-02', 0, 500], ['2026-03', 0, 0]]);
    expect(moisDe(b, '2026-03').imputations).toEqual([{ mvId: 'j', date: '2026-01-05', kind: 'virement', montant: 500, poste: 'loyer' }]);
    b.mois.forEach((m) => expect(m.retard > 0 && m.avance > 0).toBe(false));
  });
});

// ── 5. Prorata ──────────────────────────────────────────────────────────────────
describe('5 · prorata d\'entrée, de sortie, transition intra-mois', () => {
  it('Σ des baux = duMois du lot chaque mois', () => {
    const lot = { ref: 'P', bareme: [], manques: [], paiements: [],
      baux: [bail('P|2026-01-10', '2026-01-10', 620, 31, { finEffective: '2026-03-15', archive: true }), bail('P|2026-03-16', '2026-03-16', 700, 40)],
      debutSuivi: { date: '2026-01-01', source: 'acquisition' } };
    const s = suiviLot(lot, { today: '2026-04-20' });
    const ctx = { ref: 'P', bareme: [], bails: lot.baux };
    for (const ym of ['2026-01', '2026-02', '2026-03', '2026-04']) {
      const somme = s.baux.reduce((t, b) => t + ((moisDe(b, ym) || { du: { total: 0 } }).du.total), 0);
      expect(Math.round(somme * 100)).toBe(Math.round(duMois(ctx, ym).total * 100));
    }
    expect(moisDe(s.baux[0], '2026-01').du).toEqual({ hc: 440, ch: 22, total: 462 });  // 22/31
  });
});

// ── 6. Locataire sorti ─────────────────────────────────────────────────────────
describe('6 · locataire sorti', () => {
  const lot = () => ({ ref: 'S', bareme: [], manques: [], debutSuivi: { date: '2026-04-01', source: 'acquisition' },
    baux: [bail('S|2025-01-01', '2025-01-01', 500, 0, { finEffective: '2026-05-31', archive: true })],
    paiements: [vir('a', '2026-04-03', 500), vir('late', '2026-06-20', 500)] });
  it('paiement tardif après la sortie attribué à son bail (vacance après le dernier bail, tracé)', () => {
    const s = suiviLot(lot(), { today: '2026-07-15' });
    const b = s.baux[0];
    expect(b.sorti).toBe(true);
    expect(b.mois.map((m) => m.ym)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(b.position.solde).toBe(0);
    expect(moisDe(b, '2026-05').imputations).toEqual([{ mvId: 'late', date: '2026-06-20', kind: 'virement', montant: 500, poste: 'loyer' }]);
    expect(s.horsPeriode).toEqual([{ mvId: 'late', date: '2026-06-20', montant: 500, bailCle: 'S|2025-01-01', regle: 'vacance-apres', aConfirmer: false }]);
  });
  it('sans le paiement tardif : dette figée au départ, visible (parti) dans le lot l\'année du départ', () => {
    const l = lot(); l.paiements.pop();
    const s = suiviLot(l, { today: '2026-07-15' });
    expect(s.mois['2026-07']).toMatchObject({ solde: -500, retard: 500, bauxActifs: [], partis: ['S|2025-01-01'] });
  });
});

// ── 7. Colocataires ────────────────────────────────────────────────────────────
describe('7 · colocataires', () => {
  it('2 virements de 2 payeurs le même mois → un seul bail, imputations de 2 lignes', () => {
    const s = suiviLot({ ref: 'C', bareme: [], manques: [], baux: [bail('C|2026-01-01', '2026-01-01', 800, 0)],
      paiements: [vir('x', '2026-02-03', 400), vir('y', '2026-02-05', 400), vir('z', '2026-01-04', 800)] }, { today: '2026-02-20' });
    expect(s.baux).toHaveLength(1);
    expect(moisDe(s.baux[0], '2026-02').imputations.map((p) => p.mvId)).toEqual(['x', 'y']);
    expect(moisDe(s.baux[0], '2026-02').solde).toBe(0);
  });
});

// ── 8. Chevauchement ───────────────────────────────────────────────────────────
describe('8 · deux baux qui se chevauchent', () => {
  it('troncature C4 : l\'ancien s\'arrête la veille du nouveau, aucun dû doublé', () => {
    const lot = { ref: 'O', bareme: [], manques: [], paiements: [], debutSuivi: { date: '2026-01-01', source: 'acquisition' },
      baux: [bail('O|2026-01-01', '2026-01-01', 500, 0, { archive: true, fin: '2026-12-31' }), bail('O|2026-03-01', '2026-03-01', 600, 0)] };
    const s = suiviLot(lot, { today: '2026-04-10' });
    const ancien = bailDe(s, 'O|2026-01-01');
    expect(ancien.fin).toBe('2026-02-28');
    expect(ancien.mois.map((m) => m.ym)).toEqual(['2026-01', '2026-02']);
    expect(moisDe(bailDe(s, 'O|2026-03-01'), '2026-03').du.total).toBe(600);
    expect(s.mois['2026-04'].retard).toBe(1000 + 1200);
  });
});

// ── 9. Lot vacant ──────────────────────────────────────────────────────────────
describe('9 · lot vacant', () => {
  it('aucun bail : aucun dû ; un paiement est tracé hors période, attribué à personne', () => {
    const s = suiviLot({ ref: 'V', bareme: [], manques: [], baux: [], paiements: [vir('p', '2026-02-02', 400)] }, { today: '2026-03-01' });
    expect(s.baux).toEqual([]);
    expect(Object.values(s.mois).every((m) => m.solde === 0)).toBe(true);
    expect(s.horsPeriode).toEqual([{ mvId: 'p', date: '2026-02-02', montant: 400, bailCle: null, regle: 'aucun-bail', aConfirmer: false }]);
  });
});

// ── 10. Mouvement sans lot ─────────────────────────────────────────────────────
describe('10 · mouvement de loyer sans lot', () => {
  const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' } : null);
  const mvts = [
    { id: 1, date: '2026-02-03', qui: 'A', cat: 'Loyers encaissés', cr: 500, db: 0 },
    { id: 2, date: '2026-02-04', qui: '', cat: 'Loyers encaissés', cr: 300, db: 0 }
  ];
  it('ignoré par le suivi, rendu par paiementsNonAffectes (H-2)', () => {
    expect(collecterPaiements(mvts, { ref: 'A', catLigne }).map((p) => p.id)).toEqual([1]);
    expect(collecterPaiements(mvts, { ref: '', catLigne })).toEqual([]);
    expect(paiementsNonAffectes(mvts, { catLigne }).map((p) => p.id)).toEqual([2]);
  });
});

// ── 11. Paiement en deux fois ──────────────────────────────────────────────────
describe('11 · paiement en deux fois', () => {
  const base = (p) => ({ ref: 'T', bareme: [], manques: [], baux: [bail('T|2026-05-01', '2026-05-01', 760, 20)], paiements: p });
  it('dans le mois', () => {
    const s = suiviLot(base([vir('a', '2026-05-02', 300), vir('b', '2026-05-20', 480)]), { today: '2026-05-25' });
    expect(moisDe(s.baux[0], '2026-05')).toMatchObject({ solde: 0, paye: true });
  });
  it('à cheval 28/05 + 03/06 : juin paie d\'abord juin (H-1), puis l\'arriéré de mai', () => {
    const s = suiviLot(base([vir('a', '2026-05-28', 400), vir('b', '2026-06-03', 1160)]), { today: '2026-06-20' });
    const mai = moisDe(s.baux[0], '2026-05');
    expect(mai.imputations).toEqual([
      { mvId: 'a', date: '2026-05-28', kind: 'virement', montant: 400, poste: 'loyer' },
      { mvId: 'b', date: '2026-06-03', kind: 'virement', montant: 360, poste: 'loyer' },
      { mvId: 'b', date: '2026-06-03', kind: 'virement', montant: 20, poste: 'charge' }
    ]);
    expect(mai.solde).toBe(-380);                      // position fin mai
    expect(moisDe(s.baux[0], '2026-06').solde).toBe(0);
  });
});

// ── 12. Dette ancienne (C.3) ───────────────────────────────────────────────────
function lotDetteAncienne() {
  const p = [vir('j', '2026-01-03', 660), vir('f', '2026-02-03', 538)];
  ['03', '04', '05', '06', '07'].forEach((m) => p.push(vir('m' + m, '2026-' + m + '-03', 660)));
  return { ref: 'D', bareme: [], manques: [], baux: [bail('D|2026-01-01', '2026-01-01', 650, 10)], paiements: p };
}
describe('12 · lot à dette ancienne (§C.3)', () => {
  const s = suiviLot(lotDetteAncienne(), { today: '2026-07-20' });
  const b = s.baux[0];
  it('juillet : payé, reste dû des mois précédents 122 (112 loyer + 10 charges) depuis février', () => {
    const jul = moisDe(b, '2026-07');
    expect(jul.courant).toEqual({ loyer: 0, charge: 0 });
    expect(jul.anterieur).toEqual({ loyer: 112, charge: 10, depuis: '2026-02' });
    expect(jul.paye).toBe(true);
    expect(jul.solde).toBe(-122);
  });
  it('la relance réclame les mêmes 122 € (lignes de février)', () => {
    expect(lignesRelanceBail(b, { toleranceActive: false })).toEqual([
      { ym: '2026-02', mois: 'février 2026', libelle: 'Loyer hors charges — février 2026', montant: 112 },
      { ym: '2026-02', mois: 'février 2026', libelle: 'Provisions sur charges — février 2026', montant: 10 }
    ]);
    expect(detteBail(b)).toEqual({ loyer: 112, charge: 10, avance: 0 });
  });
});

// ── 13. cr − db ────────────────────────────────────────────────────────────────
describe('13 · cr − db : un avoir 211 réduit le reçu (C12)', () => {
  it('collecteur unique : montant = cr − db, tombstones filtrés, ref tolérante', () => {
    const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' } : null);
    const mvts = [
      { id: 1, date: '2026-03-01', qui: 'A ', cat: 'Loyers encaissés', cr: 780, db: 0 },
      { id: 2, date: '2026-03-15', qui: 'a', cat: 'Loyers encaissés', cr: 0, db: 100 },
      { id: 3, date: '2026-03-16', qui: 'A', cat: 'Loyers encaissés', cr: 50, db: 0, _deleted: true },
      { id: 4, date: '2026-03-16', qui: 'A', cat: 'Dépôt de garantie (reçu / restitué)', cr: 780, db: 0 }
    ];
    const p = collecterPaiements(mvts, { ref: 'A', catLigne });
    expect(p).toEqual([
      { id: 1, date: '2026-03-01', montant: 780, kind: 'virement' },
      { id: 2, date: '2026-03-15', montant: -100, kind: 'virement' }
    ]);
    const s = suiviLot({ ref: 'A', bareme: [], manques: [], baux: [bail('A|2026-03-01', '2026-03-01', 760, 20)], paiements: p }, { today: '2026-03-20' });
    expect(moisDe(s.baux[0], '2026-03')).toMatchObject({ recu: 680, solde: -100 });
  });
});

// ── 14. Tolérance < 10 ─────────────────────────────────────────────────────────
describe('14 · tolérance de début de mois', () => {
  const lot = { ref: 'G', bareme: [], manques: [], baux: [bail('G|2026-01-01', '2026-01-01', 500, 0)], paiements: [vir('j', '2026-01-04', 500)] };
  it('manque neuf du mois courant ignoré, dette ancienne visible', () => {
    expect(suiviLot(lot, { today: '2026-03-05', graceLast: true }).mois['2026-03'].retard).toBe(500);
    expect(suiviLot(lot, { today: '2026-03-05', graceLast: false }).mois['2026-03'].retard).toBe(1000);
  });
});

// ── 15. Ouverture (bail.anteriorite) ───────────────────────────────────────────
describe('15 · ouverture', () => {
  it('arriéré d\'ouverture : antérieur dès le 1er mois', () => {
    const s = suiviLot({ ref: 'H', bareme: [], manques: [], baux: [bail('H|2026-01-01', '2026-01-01', 500, 0, { ouverture: { loyer: 300, charge: 20 } })],
      paiements: [vir('j', '2026-01-04', 500)] }, { today: '2026-01-20' });
    const jan = moisDe(s.baux[0], '2026-01');
    expect(jan.anterieur).toEqual({ loyer: 300, charge: 20, depuis: 'ouverture' });
    expect(jan.solde).toBe(-320);
  });
  it('avance d\'ouverture : couvre le 1er mois', () => {
    const s = suiviLot({ ref: 'H', bareme: [], manques: [], baux: [bail('H|2026-01-01', '2026-01-01', 500, 0, { ouverture: { avance: 200 } })],
      paiements: [vir('j', '2026-01-04', 300)] }, { today: '2026-01-20' });
    expect(moisDe(s.baux[0], '2026-01').solde).toBe(0);
  });
});

// ── 16. Début du suivi ─────────────────────────────────────────────────────────
describe('16 · début de suivi', () => {
  const lot = () => ({ ref: 'K', bareme: [], manques: [], baux: [bail('K|2025-06-01', '2025-06-01', 500, 0)],
    paiements: [vir('old', '2026-02-02', 500), vir('a', '2026-04-03', 500)] });
  it('injecté : aucun dû avant debutSuivi, la source est rendue, les paiements antérieurs sont hors suivi', () => {
    const l = lot(); l.debutSuivi = { date: '2026-04-01', source: 'acquisition' };
    const s = suiviLot(l, { today: '2026-05-20' });
    expect(s.debutSuivi).toEqual({ date: '2026-04-01', source: 'acquisition' });
    expect(s.baux[0].mois.map((m) => m.ym)).toEqual(['2026-04', '2026-05']);
    expect(s.horsSuivi.map((p) => p.mvId)).toEqual(['old']);
    expect(s.mois['2026-05'].retard).toBe(500);
  });
  it('défaut provisoire = 1er jour du mois du 1er loyer encaissé ; sans paiement, début du bail ouvert', () => {
    expect(debutSuiviDefaut(lot())).toEqual({ date: '2026-02-01', source: 'provisoire' });
    const l = lot(); l.paiements = [];
    expect(debutSuiviDefaut(l)).toEqual({ date: '2025-06-01', source: 'provisoire' });
    expect(suiviLot(l, { today: '2025-07-20' }).debutSuivi).toEqual({ date: '2025-06-01', source: 'provisoire' });
  });
});

// ── Décisions de Didier (§I) ───────────────────────────────────────────────────
describe('Q2 · locataire parti : dette figée, visible pendant l\'année de son départ seulement', () => {
  const lot = () => ({ ref: 'L', bareme: [], manques: [], debutSuivi: { date: '2026-01-01', source: 'acquisition' },
    baux: [bail('L|2025-11-01', '2025-11-01', 700, 50, { finEffective: '2026-02-28', archive: true }), bail('L|2026-03-01', '2026-03-01', 750, 0)],
    paiements: [vir('a', '2026-03-03', 1500)].concat(['04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => vir('b' + m, '2026-' + m + '-03', 750)), [vir('c', '2027-01-03', 750)]) });
  it('année du départ : chaque mois après le départ porte la dette figée, marquée « parti »', () => {
    const s = suiviLot(lot(), { today: '2026-03-20' });
    expect(s.mois['2026-03']).toMatchObject({ retard: 1500, avance: 750, solde: -750, bauxActifs: ['L|2026-03-01'], partis: ['L|2025-11-01'] });
    const per = suiviPerimetre([s], '2026-03');
    const carte = per.enRetard.find((c) => c.bailCle === 'L|2025-11-01');
    expect(carte).toMatchObject({ parti: true, solde: -1500 });
    expect(per.solde).toBe(-750);
  });
  it('à partir du 1er janvier suivant : disparaît du lot et du périmètre, reste sur le bail (retenue sur dépôt)', () => {
    const s = suiviLot(lot(), { today: '2027-01-15' });
    expect(s.mois['2027-01']).toMatchObject({ retard: 0, partis: [] });
    expect(suiviPerimetre([s], '2027-01').enRetard).toEqual([]);
    expect(detteBail(bailDe(s, 'L|2025-11-01'))).toEqual({ loyer: 1400, charge: 100, avance: 0 });
  });
  it('ANNÉE AFFICHÉE = année du départ : 2026 regardé en 2027 montre toujours la dette (bilan stable)', () => {
    const s = suiviLot(lot(), { today: '2027-01-15' });
    expect(s.mois['2026-12']).toMatchObject({ retard: 1500, partis: ['L|2025-11-01'] });
    expect(versByLot(s, 2026).annual.retard).toBe(1500);
    expect(versByLot(s, 2027).annual.retard).toBe(0);
  });
});

describe('Q2 · le bilan d\'une année ne change pas le 1er janvier suivant (année affichée, pas année du jour)', () => {
  // Parti le 30/11/2025 avec une dette de 500 ; aucun bail suivant.
  const lot = () => ({ ref: 'P', bareme: [], manques: [], debutSuivi: { date: '2025-10-01', source: 'acquisition' },
    baux: [bail('P|2025-01-01', '2025-01-01', 500, 0, { finEffective: '2025-11-30', archive: true })],
    paiements: [vir('oct', '2025-10-03', 500)] });
  for (const today of ['2025-12-30', '2026-01-05']) {
    it('décembre 2025 = −500 (today ' + today + ')', () => {
      const s = suiviLot(lot(), { today });
      expect(s.mois['2025-12']).toMatchObject({ solde: -500, retard: 500, bauxActifs: [], partis: ['P|2025-01-01'] });
      expect(suiviPerimetre([s], '2025-12')).toMatchObject({ solde: -500, retard: 500 });
      expect(versByLot(s, 2025).annual.retard).toBe(500);
    });
  }
  it('janvier 2026 = 0 (année suivante) ; la dette reste sur le bail (position, retenue sur dépôt)', () => {
    const s = suiviLot(lot(), { today: '2026-01-05' });
    expect(s.mois['2026-01']).toMatchObject({ solde: 0, retard: 0, partis: [] });
    expect(suiviPerimetre([s], '2026-01')).toMatchObject({ solde: 0, retard: 0, enRetard: [] });
    expect(versByLot(s, 2026).annual.retard).toBe(0);
    expect(detteBail(s.baux[0])).toEqual({ loyer: 500, charge: 0, avance: 0 });
  });
});

describe('Q3 · virement entre deux baux', () => {
  const lot = (bailCle) => ({ ref: 'F', bareme: [], manques: [], debutSuivi: { date: '2026-05-01', source: 'acquisition' },
    baux: [bail('F|2024-10-01', '2024-10-01', 450, 0, { finEffective: '2026-06-06', archive: true }), bail('F|2026-07-18', '2026-07-18', 495, 30)],
    paiements: [vir('m', '2026-05-02', 450), vir('n', '2026-06-01', 90), Object.assign(vir('q', '2026-07-16', 495), bailCle ? { bailCle } : {})] });
  it('sans choix : bail le plus proche dans le temps (le nouveau, 2 jours), « à confirmer »', () => {
    const s = suiviLot(lot(), { today: '2026-07-25' });
    expect(s.horsPeriode).toEqual([{ mvId: 'q', date: '2026-07-16', montant: 495, bailCle: 'F|2026-07-18', regle: 'plus-proche', aConfirmer: true }]);
    expect(moisDe(bailDe(s, 'F|2026-07-18'), '2026-07').recu).toBe(495);
  });
  it('choix explicite de l\'utilisateur (paiement.bailCle) : respecté, plus à confirmer', () => {
    const s = suiviLot(lot('F|2024-10-01'), { today: '2026-07-25' });
    expect(s.horsPeriode).toEqual([{ mvId: 'q', date: '2026-07-16', montant: 495, bailCle: 'F|2024-10-01', regle: 'choix', aConfirmer: false }]);
    expect(moisDe(bailDe(s, 'F|2024-10-01'), '2026-07').recu).toBe(495);
  });
  it('avant le premier bail : premier bail, tracé « vacance-avant », pas à confirmer', () => {
    const s = suiviLot({ ref: 'E', bareme: [], manques: [], baux: [bail('E|2026-03-14', '2026-03-14', 650, 20)],
      paiements: [vir('e', '2026-02-05', 620)] }, { today: '2026-03-20' });
    expect(s.horsPeriode).toEqual([{ mvId: 'e', date: '2026-02-05', montant: 620, bailCle: 'E|2026-03-14', regle: 'vacance-avant', aConfirmer: false }]);
  });
});

describe('Q4 · indemnité GLI : ne réduit pas la dette, exposée en « couvert par la GLI »', () => {
  const lot = { ref: 'D-105', bareme: [], manques: [], baux: [bail('D-105|2026-01-01', '2026-01-01', 600, 0)],
    paiements: [Object.assign(vir('gli', '2026-03-20', 1200), { kind: 'gli' })] };
  it('retard inchangé, couvertGli par bail/mois et au lot, relance au même montant', () => {
    const s = suiviLot(lot, { today: '2026-03-25' });
    const b = s.baux[0];
    expect(b.position).toEqual({ retardLoyer: 1800, retardCharge: 0, avance: 0, solde: -1800 });
    expect(moisDe(b, '2026-03')).toMatchObject({ couvertGli: 1200, recu: 0 });
    expect(s.mois['2026-03']).toMatchObject({ couvertGli: 1200, retard: 1800 });
    expect(b.traces).toContainEqual({ type: 'gli', ym: '2026-03', montant: 1200, ref: 'gli' });
    expect(lignesRelanceBail(b, { toleranceActive: false }).reduce((t, l) => t + l.montant, 0)).toBe(1800);
    expect(suiviPerimetre([s], '2026-03').enRetard[0]).toMatchObject({ couvertGli: 1200, solde: -1800 });
  });
});

// ── Adaptateurs ────────────────────────────────────────────────────────────────
describe('adaptateurs de compatibilité', () => {
  it('versEtatMoisLot = etatMoisLot sur un lot à bail unique (même début, sans arrondi)', () => {
    const p = [vir('a', '2026-01-03', 500), vir('b', '2026-02-10', 200), vir('c', '2026-03-02', 900), vir('d', '2026-04-05', 520)];
    const l = { ref: 'U', bareme: [], manques: [], baux: [bail('U|2026-01-01', '2026-01-01', 480, 20)], paiements: p,
      debutSuivi: { date: '2026-01-01', source: 'acquisition' } };
    const s = suiviLot(l, { today: '2026-05-20', seuilArrondi: 0 });
    const ctx = { ref: 'U', bareme: [], bails: l.baux };
    const months = ymRange('2026-01', '2026-05').map((ym) => {
      const d = duMois(ctx, ym);
      const src = p.filter((x) => x.date.slice(0, 7) === ym).map((x) => ({ date: x.date, id: x.id, montant: x.montant }));
      return { ym, hcDue: d.hc, chDue: d.ch, received: src.reduce((t, x) => t + x.montant, 0), sources: src };
    });
    expect(versEtatMoisLot(s.baux[0])).toEqual(etatMoisLot(months));
  });
  it('versByLot : forme byLot, retard = position au dernier mois exigible, encaissé = virements', () => {
    const s = suiviLot(lotArslan(), OPTS_ARSLAN);
    const bl = versByLot(s, 2026);
    expect(bl.months.map((m) => m.ym)).toEqual(ymRange('2026-01', '2026-10'));
    expect(bl.months[5]).toMatchObject({ ym: '2026-06', encaisse: 1560, avance: 780, loyerRetard: 0, chargeRetard: 0 });
    expect(bl.months[7]).toMatchObject({ ym: '2026-08', chargeRetard: 20 });
    expect(bl.annual).toMatchObject({ encaisse: 5310, retard: 20, avance: 0 });
    expect(bl.solde).toBe(-20);
  });
  it('_computeDetteBail = detteBail(suiviLot(...).bail)', () => {
    expect(_computeDetteBail(lotArslan(), CLE_ARSLAN, OPTS_ARSLAN)).toEqual({ loyer: 0, charge: 20, avance: 0 });
    expect(_computeDetteBail(lotArslan(), 'inconnu', OPTS_ARSLAN)).toBeNull();
  });
  it('suiviPerimetre : Σ cartes = case = Σ lots ; tri décroissant ; à jour ; phrase', () => {
    const a = suiviLot(lotArslan(), OPTS_ARSLAN);
    const d = suiviLot(lotDetteAncienne(), { today: TODAY_ARSLAN });
    const c = suiviLot({ ref: 'Z', bareme: [], manques: [], baux: [bail('Z|2026-01-01', '2026-01-01', 300, 0)],
      paiements: ymRange('2026-01', '2026-10').map((ym, i) => vir('z' + i, ym + '-02', 300)) }, { today: TODAY_ARSLAN });
    const per = suiviPerimetre([a, d, c], '2026-09');
    expect(per.solde).toBe(Math.round((a.mois['2026-09'].solde + d.mois['2026-09'].solde + c.mois['2026-09'].solde) * 100) / 100);
    const cartes = per.enRetard.concat(per.enAvance);
    expect(Math.round(cartes.reduce((t, k) => t + k.solde, 0) * 100) / 100).toBe(per.solde);
    expect(per.enRetard.map((k) => k.ref)).toEqual(['D', 'Ferrette - 101']);
    expect(per.aJour).toEqual([{ ref: 'Z', noms: 'Z|2026-01-01' }]);
    expect(per.phrase).toEqual({ nbRetard: 2, nbAvance: 0, nbManques: 0 });
  });
});

// ── Assemblage depuis les collections brutes (collecteur / adaptateur) ────────
describe('lotDepuisDb — assemblage depuis les collections brutes', () => {
  const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' }
    : c === 'Indemnité GLI / loyers impayés' ? { ligne2044: '213', type: 'recette' } : null);
  const db = () => {
    const l = lotArslan();
    return {
      baux: { 'Ferrette - 101': { ref: 'Ferrette - 101', debut: '2026-05-03', fin: '2032-05-02', finEffective: '', hc: 760, ch: 20, nom: 'Elise ARSLAN', dg: 760, dgRetenu: 0, dgRestitue: 0 } },
      baux_historique: [{ ref: 'Ferrette - 101', debut: '2024-08-20', fin: '2030-08-19', finEffective: '2026-04-13', hc: 700, ch: 0, nom: 'Ancien locataire', dg: 700, dgRetenu: 150, dgRestitue: 247 }],
      loyerBareme: [],
      baux_evenements: [],
      mouvements: l.paiements.map((p) => ({ id: p.id, date: p.date, qui: 'Ferrette - 101', cat: 'Loyers encaissés', cr: p.montant, db: 0 }))
        .concat([{ id: 'dgm', date: '2026-05-03', qui: 'Ferrette - 101', cat: 'Dépôt de garantie (reçu / restitué)', cr: 760, db: 0 }])
    };
  };
  it('clés de bail, retenue sur dépôt déduite, paiements, début provisoire : même suivi que le lot construit à la main', () => {
    const lotIn = lotDepuisDb('Ferrette - 101', db(), { catLigne });
    expect(lotIn.baux.map((b) => b.cle)).toEqual([CLE_ANCIEN, CLE_ARSLAN]);
    expect(lotIn.baux[0].dg).toEqual({ verse: 700, retenuAutres: 150, restitue: 247, penalite: 0, date: '2026-04-13' });
    expect(lotIn.baux[1].dg).toBeUndefined();        // bail en cours : pas de restitution
    expect(lotIn.debutSuivi).toEqual({ date: '2026-03-01', source: 'provisoire' });
    const s1 = suiviLot(lotIn, OPTS_ARSLAN), s2 = suiviLot(lotArslan(), OPTS_ARSLAN);
    expect(soldes(s1, Object.keys(s2.mois))).toEqual(soldes(s2, Object.keys(s2.mois)));
    expect(bailDe(s1, CLE_ANCIEN).position).toEqual(bailDe(s2, CLE_ANCIEN).position);
  });
  it('manques acceptés lus dans le journal du bail (type manque_accepte), tombstones compris', () => {
    const d = db();
    d.baux_evenements = [
      { id: 'mqa_1', type: 'manque_accepte', ref: 'Ferrette - 101', bailDebut: '2026-05-03', ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-08-05' },
      { id: 'av', type: 'avenant', ref: 'Ferrette - 101' }
    ];
    const lotIn = lotDepuisDb('Ferrette - 101', d, { catLigne });
    expect(lotIn.manques).toEqual([{ id: 'mqa_1', bailCle: CLE_ARSLAN, ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-08-05', _deleted: false }]);
  });
  it('cleBail : ref|debut[|_bailUid]', () => {
    expect(cleBail('A', { debut: '2026-01-01T00:00' })).toBe('A|2026-01-01');
    expect(cleBail('A', { debut: '2026-01-01', _bailUid: 'u1' })).toBe('A|2026-01-01|u1');
  });
});
