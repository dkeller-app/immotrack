import { describe, it, expect } from 'vitest';
import { _computeDetteBail, _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { duMois, duMoisSuivi, _debutSuivi } from '../../js/core/loyer-du-mois.js';
import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

/**
 * R0-C lot 1 (docs/CDC-R0C.md) — LA DETTE DE RESTITUTION EST LUE DANS LE MAÎTRE FINANCES.
 *
 * `_computeDetteBail` : la cascade du maître (`_computeLoyerNetting`), sur la vie d'UN bail,
 * sans jamais semer d'ouverture — le passé du bail est DANS le calcul, pas reporté. C'est ce
 * qui supprime le double/triple comptage de l'ouverture N-1 de la branche rejetée.
 * Dû = duMois (barème historisé, prorata au jour) borné au segment du bail et au début du
 * suivi (Q1) ; encaissé = loyers (ligne 211, alias M-1 compris) rattachés par date (Q4).
 */

const LOYERS = { ligne2044: '211', type: 'recette' };
const catLigne = (c) => (c === 'Loyers encaissés' || c === 'Loyer F3' ? LOYERS : null);
const pay = (qui, date, cr, cat = 'Loyers encaissés') => ({ qui, date, cr, db: 0, cat });
const ymRange = (a, b) => { const o = []; let [y, m] = a.split('-').map(Number); const [Y, M] = b.split('-').map(Number);
  while (y < Y || (y === Y && m <= M)) { o.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return o; };
const fp = (mvts, ref) => mvts.filter((m) => m.qui === ref && m.cr > 0 && catLigne(m.cat)).map((m) => m.date.slice(0, 7)).sort()[0] || null;
const dette = (o) => _computeDetteBail({ catLigne, today: '2026-09-30', premierVersementYm: fp(o.mouvements, o.ref), ...o });

describe('duMois — option segmentDebut (dû d\'UN bail sur un mois partagé)', () => {
  const ctx = { ref: 'L', bareme: [], bails: [
    { debut: '2026-01-01', finEffective: '2026-03-14', archive: true, hc: 620, ch: 0 },
    { debut: '2026-03-15', finEffective: null, archive: false, hc: 930, ch: 0 }] };
  it('sans option : le mois de rotation porte la somme des deux baux (inchangé)', () => {
    expect(duMois(ctx, '2026-03').hc).toBe(280 + 510);   // 620×14/31 + 930×17/31
  });
  it('avec segmentDebut : seule la part du bail visé, au jour près', () => {
    expect(duMois(ctx, '2026-03', { segmentDebut: '2026-01-01' }).hc).toBe(280);
    expect(duMois(ctx, '2026-03', { segmentDebut: '2026-03-15' }).hc).toBe(510);
    expect(duMois(ctx, '2026-02', { segmentDebut: '2026-03-15' }).total).toBe(0);
  });
});

describe('duMoisSuivi — Q1 : rien n\'est dû avant le début du suivi', () => {
  const ctx = { ref: 'L', bareme: [], bails: [{ debut: '2025-03-01', archive: false, hc: 700, ch: 50 }] };
  it('avant le début du suivi : zéro ; à partir de lui : le dû du barème', () => {
    expect(duMoisSuivi(ctx, '2025-02', '2025-03').total).toBe(0);
    expect(duMoisSuivi(ctx, '2025-03', '2025-03')).toEqual(duMois(ctx, '2025-03'));
  });
  it('sans début de suivi (aucun versement, aucun bail ouvert) : rien n\'est dû', () => {
    expect(duMoisSuivi(ctx, '2025-05', null).total).toBe(0);
  });
  it('le début du suivi est celui de `_debutSuivi` : entrée du bail, bornée au 1ᵉʳ janvier de l\'année du 1ᵉʳ versement', () => {
    expect(_debutSuivi(ctx, '2025-06')).toBe('2025-03');                 // premiers mois impayés : DUS
    const repris = { ref: 'L', bareme: [], bails: [{ debut: '2019-04-01', archive: false, hc: 700, ch: 50 }] };
    expect(_debutSuivi(repris, '2024-05')).toBe('2024-01');              // bail repris : pas de dette fantôme 2019-2023
  });
});

describe('_computeDetteBail — plus de double comptage de l\'ouverture N-1 (cas A, B, C du CDC)', () => {
  it('A · un impayé en mars 2024, tout le reste payé : 700 € (la branche rejetée en comptait 2 100)', () => {
    const ref = 'A', ctx = { ref, bareme: [], bails: [{ debut: '2024-01-01', finEffective: '2026-06-30', archive: true, hc: 700, ch: 50 }] };
    const mouvements = ymRange('2024-01', '2026-06').filter((ym) => ym !== '2024-03').map((ym) => pay(ref, ym + '-05', 750));
    const d = dette({ ref, ctx, bailDebut: '2024-01-01', fin: '2026-06-30', mouvements });
    expect(d.loyer).toBe(700);
    expect(d.charge).toBe(50);
  });
  it('B · l\'impayé est réglé en février 2025 : 0 € (la branche rejetée gardait 700 € fantômes)', () => {
    const ref = 'B', ctx = { ref, bareme: [], bails: [{ debut: '2024-01-01', finEffective: '2026-06-30', archive: true, hc: 700, ch: 50 }] };
    const mouvements = ymRange('2024-01', '2026-06').filter((ym) => ym !== '2024-03').map((ym) => pay(ref, ym + '-05', ym === '2025-02' ? 1500 : 750));
    const d = dette({ ref, ctx, bailDebut: '2024-01-01', fin: '2026-06-30', mouvements });
    expect(d.loyer).toBe(0);
    expect(d.charge).toBe(0);
  });
  it('C · rotation : la dette du locataire 1 n\'est JAMAIS facturée au locataire 2, son trop-perçu lui revient', () => {
    const ref = 'C', ctx = { ref, bareme: [], bails: [
      { debut: '2024-01-01', finEffective: '2024-12-31', archive: true, hc: 700, ch: 50 },
      { debut: '2025-01-01', finEffective: '2026-06-30', archive: true, hc: 700, ch: 50 }] };
    const mouvements = ymRange('2024-01', '2026-06').filter((ym) => ym !== '2024-11' && ym !== '2024-12').map((ym) => pay(ref, ym + '-05', ym === '2025-03' ? 1500 : 750));
    const l2 = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2026-06-30', mouvements });
    expect(l2.loyer).toBe(0);
    expect(l2.avance).toBe(750);                                          // Q5 : trop-perçu exposé
    const l1 = dette({ ref, ctx, bailDebut: '2024-01-01', fin: '2024-12-31', mouvements });
    expect(l1.loyer).toBe(1400);
    expect(l1.charge).toBe(100);
  });
});

describe('_computeDetteBail — la définition exacte', () => {
  const ref = 'X';
  it('I-1 : une IRL en cours de bail ne réécrit pas le passé (loyer du barème de CHAQUE mois)', () => {
    const b0 = { ref, debut: '2026-01-01', hc: 700, ch: 0 };
    const bareme = appliquerNouvellePeriode([periodeInitialeBail(b0)], { ref, debut: '2026-07-01', hc: 850, ch: 0, source: 'irl', bailDebut: '2026-01-01' });
    const ctx = { ref, bareme, bails: [{ debut: '2026-01-01', archive: false, hc: 850, ch: 0 }] };   // le bail porte le loyer COURANT
    const d = dette({ ref, ctx, bailDebut: '2026-01-01', fin: null, mouvements: [], premierVersementYm: null });
    expect(d.loyer).toBe(6 * 700 + 3 * 850);                               // 6 750, pas 9 × 850 = 7 650
  });
  it('bornes au jour : entrée le 16 et sortie le 10 sont proratisées par duMois', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-03-16', finEffective: '2026-05-10', archive: true, hc: 620, ch: 0 }] };
    const d = dette({ ref, ctx, bailDebut: '2026-03-16', fin: '2026-05-10', mouvements: [pay(ref, '2026-03-16', 1)] });
    expect(d.loyer).toBe(320 + 620 + 200 - 1);                             // 620×16/31 + 620 + 620×10/31 − 1
  });
  it('charges exclues de la retenue : le locataire paie le loyer seul → dette de loyer nulle, charges exposées à part', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', finEffective: '2026-06-30', archive: true, hc: 700, ch: 50 }] };
    const mouvements = ymRange('2026-01', '2026-06').map((ym) => pay(ref, ym + '-05', 700));
    const d = dette({ ref, ctx, bailDebut: '2026-01-01', fin: '2026-06-30', mouvements });
    expect(d.loyer).toBe(0);
    expect(d.charge).toBe(300);
  });
  it('le dépôt de garantie encaissé sur le lot ne vaut JAMAIS loyer payé ; un alias M-1 de loyer, si', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', finEffective: '2026-02-28', archive: true, hc: 700, ch: 0 }] };
    const mouvements = [pay(ref, '2026-01-02', 700, 'Dépôt de garantie (reçu / restitué)'), pay(ref, '2026-02-05', 700, 'Loyer F3'), pay(ref, '2026-01-06', 1)];
    const d = dette({ ref, ctx, bailDebut: '2026-01-01', fin: '2026-02-28', mouvements });
    expect(d.loyer).toBe(699);
  });
  it('une contre-passation (débit sur loyer) annule l\'encaissement correspondant', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', finEffective: '2026-01-31', archive: true, hc: 700, ch: 0 }] };
    const mouvements = [pay(ref, '2026-01-05', 700), { qui: ref, date: '2026-01-20', cr: 0, db: 700, cat: 'Loyers encaissés' }];
    expect(dette({ ref, ctx, bailDebut: '2026-01-01', fin: '2026-01-31', mouvements }).loyer).toBe(700);
  });
  it('tolérance de début de mois : le 5, le loyer du mois courant n\'est pas une dette ; le 12, si', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-08-01', archive: false, hc: 700, ch: 0 }] };
    const mouvements = [pay(ref, '2026-08-03', 700)];
    expect(dette({ ref, ctx, bailDebut: '2026-08-01', fin: null, mouvements, today: '2026-09-05' }).loyer).toBe(0);
    expect(dette({ ref, ctx, bailDebut: '2026-08-01', fin: null, mouvements, today: '2026-09-12' }).loyer).toBe(700);
  });
  it('un encaissement post-daté (mois non échu) ne solde aucune dette exigible', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-07-01', archive: false, hc: 700, ch: 0 }] };
    const mouvements = [pay(ref, '2026-07-02', 700), pay(ref, '2026-10-02', 1400)];
    expect(dette({ ref, ctx, bailDebut: '2026-07-01', fin: null, mouvements }).loyer).toBe(1400);
  });
  it('Q3 : la fin fournie (date de sortie) borne le dû, même si le bail est encore ouvert', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', archive: false, hc: 620, ch: 0 }] };
    const d = dette({ ref, ctx, bailDebut: '2026-01-01', fin: '2026-03-10', mouvements: [pay(ref, '2026-01-02', 1240)] });
    expect(d.loyer).toBe(200);                                             // mars proraté 10/31
    expect(d.finDu).toBe('2026-03-10');
  });
  it('bail inconnu (aucun segment ne commence à cette date) : null — une dette inconnue n\'est pas un zéro', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', archive: false, hc: 700, ch: 0 }] };
    expect(dette({ ref, ctx, bailDebut: '2025-01-01', fin: null, mouvements: [] })).toBeNull();
    expect(_computeDetteBail(null)).toBeNull();
  });
});

describe('_computeDetteBail — Q1 : le dû part du début du bail (règle `_debutSuivi`)', () => {
  const ref = 'Q1';
  it('les premiers mois non payés d\'un bail SONT une dette (le maître d\'avant les ignorait)', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-03-01', finEffective: '2026-02-28', archive: true, hc: 700, ch: 0 }] };
    const mouvements = ymRange('2025-06', '2026-02').map((ym) => pay(ref, ym + '-05', 700));
    const d = dette({ ref, ctx, bailDebut: '2025-03-01', fin: '2026-02-28', mouvements });
    expect(d.debutDu).toBe('2025-03');
    expect(d.loyer).toBe(3 * 700);                                         // mars, avril, mai 2025
  });
  it('bail repris à l\'achat : rien avant le 1ᵉʳ janvier de l\'année du 1ᵉʳ versement', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2019-04-01', archive: false, hc: 700, ch: 0 }] };
    const mouvements = ymRange('2024-05', '2026-09').map((ym) => pay(ref, ym + '-05', 700));
    const d = dette({ ref, ctx, bailDebut: '2019-04-01', fin: null, mouvements });
    expect(d.debutDu).toBe('2024-01');
    expect(d.loyer).toBe(4 * 700);                                         // janvier → avril 2024
  });
  it('aucun encaissement de loyer sur le lot et bail clos : rien à suivre, et c\'est SIGNALÉ (jamais un zéro muet)', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2025-12-31', archive: true, hc: 700, ch: 0 }] };
    const d = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-12-31', mouvements: [] });
    expect(d.loyer).toBe(0);
    expect(d.suiviAbsent).toBe(true);
  });
});

describe('_computeDetteBail — Q4 : encaissements rattachés par leur date, vacance voisine comprise', () => {
  const ref = 'Q4';
  const ctx = { ref, bareme: [], bails: [
    { debut: '2025-01-01', finEffective: '2025-06-30', archive: true, hc: 700, ch: 0 },
    { debut: '2025-09-01', finEffective: null, archive: false, hc: 800, ch: 0 }] };
  it('un arriéré réglé APRÈS la sortie, pendant la vacance, revient au locataire sortant', () => {
    const mouvements = [...ymRange('2025-01', '2025-05').map((ym) => pay(ref, ym + '-05', 700)), pay(ref, '2025-08-12', 700),
      ...ymRange('2025-09', '2026-09').map((ym) => pay(ref, ym + '-05', 800))];
    const d = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-06-30', mouvements });
    expect(d.loyer).toBe(0);
    expect(d.horsPeriode).toEqual([{ date: '2025-08-12', montant: 700 }]);
    expect(dette({ ref, ctx, bailDebut: '2025-09-01', fin: null, mouvements }).loyer).toBe(0);
  });
  it('le 1ᵉʳ bail du lot récupère aussi un loyer payé AVANT l\'entrée (28 du mois précédent)', () => {
    const mouvements = [pay(ref, '2024-12-28', 700), ...ymRange('2025-02', '2025-06').map((ym) => pay(ref, ym + '-05', 700))];
    const d = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-06-30', mouvements });
    expect(d.loyer).toBe(0);
    expect(d.horsPeriode).toEqual([{ date: '2024-12-28', montant: 700 }]);
  });
  it('à partir de l\'entrée du bail suivant, un encaissement lui appartient (date de bascule)', () => {
    const mouvements = [...ymRange('2025-01', '2025-06').map((ym) => pay(ref, ym + '-05', 700)), pay(ref, '2025-09-01', 900)];
    expect(dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-06-30', mouvements }).avance).toBe(0);
    expect(dette({ ref, ctx, bailDebut: '2025-09-01', fin: '2025-09-30', mouvements }).avance).toBe(100);
  });
});

describe('maître — option `debutDu` : l\'ouverture N-1 couvre les mois dus AVANT le 1ᵉʳ versement', () => {
  const ref = 'O';
  const ctx = { ref, bareme: [], bails: [{ debut: '2025-03-01', archive: false, hc: 700, ch: 50 }] };
  const mouvements = ymRange('2025-06', '2026-09').map((ym) => pay(ref, ym + '-05', 750));
  const base = { mouvements, year: 2026, catLigne, today: '2026-09-30', lastMonth: 9, activeLots: [ref],
    loyerDue: (q, ym) => duMoisSuivi(ctx, ym, '2025-03') };
  it('sans l\'option (comportement historique) : la pré-passe démarre au 1ᵉʳ versement → mars-mai 2025 invisibles', () => {
    const r = _computeFinancesMonthly(base);
    expect(r.byLot[ref].annual.retard).toBe(0);
  });
  it('avec l\'option : les 3 mois dus avant le 1ᵉʳ versement sont reportés UNE fois en janvier', () => {
    const r = _computeFinancesMonthly({ ...base, debutDu: () => '2025-03' });
    expect(r.byLot[ref].months[0].loyerRetard).toBe(2100);
    expect(r.byLot[ref].months[0].chargeRetard).toBe(150);
    expect(r.byLot[ref].annual.retard).toBe(2250);
  });
  it('l\'option ne touche pas la base fiscale de l\'exercice (loyers HC encaissés)', () => {
    expect(_computeFinancesMonthly({ ...base, debutDu: () => '2025-03' }).annual.loyersHC)
      .toBe(_computeFinancesMonthly(base).annual.loyersHC);
  });
});
