import { describe, it, expect } from 'vitest';
import { _computeDetteBail, _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { duMois, duMoisSuivi, duMoisSuiviFromRaw, bailsFromRaw } from '../../js/core/loyer-du-mois.js';
import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

/**
 * R0-C lot 1 (docs/CDC-R0C.md) — LA DETTE DE RESTITUTION EST LUE DANS LE MAÎTRE FINANCES.
 *
 * `_computeDetteBail` : la cascade du maître (`_computeLoyerNetting`), sur la vie d'UN bail,
 * sans jamais semer d'ouverture — le passé du bail est DANS le calcul, pas reporté. C'est ce
 * qui supprime le double/triple comptage de l'ouverture N-1 de la branche rejetée.
 * Dû = duMois (barème historisé, prorata au jour) borné au segment du bail et, s'il y en a une, à
 * la borne de suivi (Q1 RÉVISÉ 01/10 : entrée en jouissance du bailleur actuel / antériorité) ;
 * encaissé = loyers (ligne 211, alias M-1 compris) rattachés par date (Q4).
 */

const LOYERS = { ligne2044: '211', type: 'recette' };
const catLigne = (c) => (c === 'Loyers encaissés' || c === 'Loyer F3' ? LOYERS : null);
const pay = (qui, date, cr, cat = 'Loyers encaissés') => ({ qui, date, cr, db: 0, cat });
const ymRange = (a, b) => { const o = []; let [y, m] = a.split('-').map(Number); const [Y, M] = b.split('-').map(Number);
  while (y < Y || (y === Y && m <= M)) { o.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return o; };
const dette = (o) => _computeDetteBail({ catLigne, today: '2026-09-30', ...o });

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

describe('duMoisSuivi — Q1 RÉVISÉ : borné par l\'entrée en jouissance, jamais par une absence de relevés', () => {
  const ctx = { ref: 'L', bareme: [], bails: [{ debut: '2025-03-01', archive: false, hc: 620, ch: 0 }] };
  it('sans borne : le dû part de l\'entrée du bail, qu\'il y ait des relevés ou non', () => {
    expect(duMoisSuivi(ctx, '2025-03', null)).toEqual(duMois(ctx, '2025-03'));
    expect(duMoisSuivi(ctx, '2025-02', null).total).toBe(0);
  });
  it('avant le mois de la borne : zéro ; après : le dû du barème', () => {
    expect(duMoisSuivi(ctx, '2026-02', '2026-03-15').total).toBe(0);
    expect(duMoisSuivi(ctx, '2026-04', '2026-03-15')).toEqual(duMois(ctx, '2026-04'));
  });
  // 2ᵉ audit 🟠2 (décision pilotage 05/10) : le dû envers le locataire part du PREMIER TERME EXIGIBLE
  // APRÈS la borne. Plus aucun prorata au jour contre le locataire : le prorata vendeur/acquéreur
  // (art. 586 C. civ.) se règle chez le notaire, hors de la dette.
  it('mois de la borne, bail à ÉCHOIR entré avant : le terme était exigible le 1ᵉʳ, il revient au vendeur (0)', () => {
    expect(duMoisSuivi(ctx, '2026-03', '2026-03-15').total).toBe(0);
    expect(duMoisSuivi(ctx, '2026-04', '2026-03-15').hc).toBe(620);      // 1ᵉʳ terme exigible après l'achat
    expect(duMoisSuivi(ctx, '2026-03', '2026-03').hc).toBe(620);         // 'YYYY-MM' = 1ᵉʳ du mois : terme entier
    expect(duMoisSuivi(ctx, '2026-03', '2026-03-01').hc).toBe(620);
  });
  it('mois de la borne, bail à TERME ÉCHU : le terme est exigible en fin de mois, après l\'achat — dû en entier', () => {
    const echu = { ref: 'L', bareme: [], bails: [{ debut: '2025-03-01', archive: false, hc: 620, ch: 0, echu: true }] };
    expect(duMoisSuivi(echu, '2026-03', '2026-03-15').hc).toBe(620);
    expect(duMoisSuivi(echu, '2026-02', '2026-03-15').total).toBe(0);
  });
  it('segmentDebut désigne le bail par son entrée ; un bail sorti du mois de la borne y doit 0', () => {
    expect(duMoisSuivi(ctx, '2026-03', '2026-03-15', { segmentDebut: '2025-03-01' }).total).toBe(0);
    expect(duMoisSuivi(ctx, '2026-04', '2026-03-15', { segmentDebut: '2025-03-01' }).hc).toBe(620);
    expect(duMoisSuivi(ctx, '2026-03', '2026-03-15', { segmentDebut: '2024-01-01' }).total).toBe(0);
  });
  it('rotation dans le mois de l\'achat : le sortant ne doit rien, l\'entrant entré APRÈS l\'achat doit son prorata d\'entrée', () => {
    const rot = { ref: 'L', bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2026-03-10', archive: true, hc: 620, ch: 0 },
      { debut: '2026-03-20', archive: false, hc: 620, ch: 0 }] };
    expect(duMoisSuivi(rot, '2026-03', '2026-03-15', { segmentDebut: '2025-01-01' }).total).toBe(0);
    expect(duMoisSuivi(rot, '2026-03', '2026-03-15', { segmentDebut: '2026-03-20' }).hc).toBe(240);   // 12 j / 31
    expect(duMoisSuivi(rot, '2026-03', '2026-03-15').hc).toBe(240);
    // l'entrant entré AVANT l'achat (bail à échoir) : son 1ᵉʳ terme était exigible à son entrée → vendeur
    const rot2 = { ref: 'L', bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2026-03-04', archive: true, hc: 620, ch: 0 },
      { debut: '2026-03-05', archive: false, hc: 620, ch: 0 }] };
    expect(duMoisSuivi(rot2, '2026-03', '2026-03-15').total).toBe(0);
  });
  it('terme échu : un bail sorti AVANT l\'achat a vu son dernier terme exigible à sa sortie → vendeur', () => {
    const rot = { ref: 'L', bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2026-03-10', archive: true, hc: 620, ch: 0, echu: true },
      { debut: '2026-03-20', archive: false, hc: 620, ch: 0, echu: true }] };
    expect(duMoisSuivi(rot, '2026-03', '2026-03-15', { segmentDebut: '2025-01-01' }).total).toBe(0);
    expect(duMoisSuivi(rot, '2026-03', '2026-03-15').hc).toBe(240);
  });
  it('bailsFromRaw marque le terme échu (modalitePaiement « echu » / « terme_echu »), et lui seul', () => {
    const raw = (mp) => ({ currentBail: { ref: 'R', debut: '2018-03-16', hc: 650, ch: 0, modalitePaiement: mp }, bauxHistorique: [
      { ref: 'R', debut: '2010-01-01', fin: '2018-03-15', hc: 500, ch: 0, modalitePaiement: 'terme_echu' }], bareme: [] });
    expect(bailsFromRaw('R', raw('echu'))[0].echu).toBe(true);
    expect(bailsFromRaw('R', raw('echeoir'))[0]).not.toHaveProperty('echu');
    expect(bailsFromRaw('R', raw(undefined))[0]).not.toHaveProperty('echu');
    expect(bailsFromRaw('R', raw('echeoir'))[1].echu).toBe(true);
    expect(duMoisSuiviFromRaw('R', '2026-02', raw('echu'), '2026-02-15').hc).toBe(650);
    expect(duMoisSuiviFromRaw('R', '2026-02', raw('echeoir'), '2026-02-15').total).toBe(0);
  });
  it('duMoisSuiviFromRaw lit les collections brutes de l\'app (bail courant + archivés)', () => {
    const raw = { currentBail: { ref: 'R', debut: '2018-03-16', fin: '2021-03-15', hc: 650, ch: 0 }, bauxHistorique: [], bareme: [] };
    expect(duMoisSuiviFromRaw('R', '2026-02', raw, '2026-03-01').total).toBe(0);
    expect(duMoisSuiviFromRaw('R', '2026-04', raw, '2026-03-01').hc).toBe(650);   // tacite reconduction
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

describe('_computeDetteBail — Q1 RÉVISÉ et dette partiellement connue (🟠5)', () => {
  const ref = 'Q1';
  it('les premiers mois non payés d\'un bail SONT une dette, même sans aucun relevé', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-03-01', finEffective: '2026-02-28', archive: true, hc: 700, ch: 0 }] };
    const mouvements = ymRange('2025-06', '2026-02').map((ym) => pay(ref, ym + '-05', 700));
    const d = dette({ ref, ctx, bailDebut: '2025-03-01', fin: '2026-02-28', mouvements });
    expect(d.loyer).toBe(3 * 700);                                         // mars, avril, mai 2025
    expect(d.suiviPartiel).toBe(false);
  });
  it('bien acheté loué (Ferrette) : rien n\'est dû avant l\'entrée en jouissance, et la dette est dite PARTIELLE', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2018-03-16', archive: false, hc: 650, ch: 0 }] };
    const mouvements = [pay(ref, '2026-03-02', 650), pay(ref, '2026-04-02', 650)];
    const sans = dette({ ref, ctx, bailDebut: '2018-03-16', fin: null, mouvements, today: '2026-04-16' });
    const avec = dette({ ref, ctx, bailDebut: '2018-03-16', fin: null, mouvements, today: '2026-04-16', debutSuivi: '2026-03-01' });
    expect(sans.loyer).toBeGreaterThan(60000);                            // sans la date : la règle compte tout depuis 2018
    expect(avec.loyer).toBe(0);
    expect(avec.suiviPartiel).toBe(true);
    expect(avec.debutSuivi).toBe('2026-03-01');
  });
  it('X-J · entrée le 15/11/2025, 1er loyer en janvier : novembre (proraté) et décembre restent dus', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-11-15', archive: false, hc: 900, ch: 0 }] };
    const mouvements = ymRange('2026-01', '2026-09').map((ym) => pay(ref, ym + '-05', 900));
    expect(dette({ ref, ctx, bailDebut: '2025-11-15', fin: null, mouvements }).loyer).toBe(480 + 900);
  });
  it('bail achevé AVANT la borne de suivi : dette inconnue → montants null et suiviAbsent (jamais un 0 muet)', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2021-01-01', finEffective: '2023-12-31', archive: true, hc: 600, ch: 0 },
      { debut: '2024-03-01', archive: false, hc: 650, ch: 0 }] };
    const mouvements = ymRange('2024-03', '2026-09').map((ym) => pay(ref, ym + '-05', 650));
    const d = dette({ ref, ctx, bailDebut: '2021-01-01', fin: '2023-12-31', mouvements, debutSuivi: '2024-03-01' });
    expect(d).toMatchObject({ loyer: null, charge: null, avance: null, suiviAbsent: true, suiviPartiel: true });
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

describe('_computeDetteBail — 🟠6 : un loyer payé AVANT l\'entrée du suivant est « à rattacher », jamais un trop-perçu versé', () => {
  const ref = 'H';
  it('bail contigu : le 1er loyer du nouveau locataire payé le 28/06 ne devient PAS une avance du sortant', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2024-01-01', finEffective: '2025-06-30', archive: true, hc: 700, ch: 50 },
      { debut: '2025-07-01', archive: false, hc: 700, ch: 50 }] };
    const mouvements = [...ymRange('2024-01', '2025-06').map((ym) => pay(ref, ym + '-05', 750)), pay(ref, '2025-06-28', 750),
      ...ymRange('2025-08', '2026-09').map((ym) => pay(ref, ym + '-05', 750))];
    const l1 = dette({ ref, ctx, bailDebut: '2024-01-01', fin: '2025-06-30', mouvements });
    expect(l1.avanceBrute).toBe(750);
    expect(l1.avance).toBe(0);                                            // rien n'est versé automatiquement
    expect(l1.aRattacher).toEqual([{ date: '2025-06-28', montant: 750, compte: true, motif: 'avant l’entrée du bail suivant' }]);
    const l2 = dette({ ref, ctx, bailDebut: '2025-07-01', fin: null, mouvements });
    expect(l2.loyer).toBe(700);                                           // juillet, faute de rattachement
    expect(l2.aRattacher).toEqual([{ date: '2025-06-28', montant: 750, compte: false, motif: 'avant l’entrée de ce bail' }]);
  });
  it('avec vacance : un loyer payé pendant la vacance, dans le mois avant l\'entrée du suivant, est aussi à rattacher', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2025-06-30', archive: true, hc: 700, ch: 0 },
      { debut: '2025-09-01', archive: false, hc: 800, ch: 0 }] };
    const mouvements = [...ymRange('2025-01', '2025-06').map((ym) => pay(ref, ym + '-05', 700)), pay(ref, '2025-08-28', 800),
      ...ymRange('2025-10', '2026-09').map((ym) => pay(ref, ym + '-05', 800))];
    const l1 = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-06-30', mouvements });
    expect(l1.avance).toBe(0);
    expect(l1.aRattacher.map((x) => x.date)).toEqual(['2025-08-28']);
    const l2 = dette({ ref, ctx, bailDebut: '2025-09-01', fin: null, mouvements });
    expect(l2.aRattacher.map((x) => [x.date, x.compte])).toEqual([['2025-08-28', false]]);
  });
  it('un vrai trop-perçu du sortant (hors de la fenêtre) reste restituable', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2025-06-30', archive: true, hc: 700, ch: 0 },
      { debut: '2025-09-01', archive: false, hc: 800, ch: 0 }] };
    const mouvements = [...ymRange('2025-01', '2025-06').map((ym) => pay(ref, ym + '-05', 700)), pay(ref, '2025-03-20', 300)];
    expect(dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-06-30', mouvements })).toMatchObject({ avance: 300, aRattacher: [] });
  });
});

describe('_computeDetteBail — cas limites restants', () => {
  const ref = 'R';
  it('rotation EN COURS DE MOIS : chacun ne doit que sa part du mois partagé (segmentDebut)', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2025-01-01', finEffective: '2025-08-14', archive: true, hc: 620, ch: 0 },
      { debut: '2025-08-15', archive: false, hc: 620, ch: 0 }] };
    const mouvements = [...ymRange('2025-01', '2025-07').map((ym) => pay(ref, ym + '-05', 620)), pay(ref, '2025-08-05', 280),
      pay(ref, '2025-08-20', 340), ...ymRange('2025-09', '2026-09').map((ym) => pay(ref, ym + '-05', 620))];
    expect(dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-08-14', mouvements })).toMatchObject({ loyer: 0, avance: 0 });
    expect(dette({ ref, ctx, bailDebut: '2025-08-15', fin: null, mouvements })).toMatchObject({ loyer: 0, avance: 0 });
    const l1 = dette({ ref, ctx, bailDebut: '2025-01-01', fin: '2025-08-14', mouvements });
    expect(l1.mois.find((m) => m.ym === '2025-08').duHC).toBe(280);      // 620 × 14/31
  });
  it('une fin fournie APRÈS la fin effective ne prolonge pas le dû', () => {
    const ctx = { ref, bareme: [], bails: [{ debut: '2026-01-01', finEffective: '2026-03-31', archive: true, hc: 600, ch: 0 }] };
    const mouvements = ymRange('2026-01', '2026-03').map((ym) => pay(ref, ym + '-05', 600));
    const d = dette({ ref, ctx, bailDebut: '2026-01-01', fin: '2026-05-31', mouvements });
    expect(d).toMatchObject({ loyer: 0, finDu: '2026-03-31' });
  });
});

describe('maître et dette — le solde d\'ouverture de l\'ANTÉRIORITÉ est posé UNE fois (Q1 révisé, 05/10)', () => {
  const ref = 'ANT';
  const ctx = { ref, bareme: [], bails: [{ debut: '2019-09-04', archive: false, hc: 650, ch: 0 }] };
  const maitre = (year, borne, ouv, mouvements) => _computeFinancesMonthly({ mouvements, year, today: '2026-09-30', lastMonth: year === 2026 ? 9 : 12,
    catLigne, activeLots: [ref], debutDu: () => borne, ouverture: () => ouv,
    loyerDue: (q, ym) => duMoisSuivi(ctx, ym, borne) }).byLot[ref];
  const tot = (b) => Math.round(b.months.reduce((s, m) => s + m.loyerRetard, 0) * 100) / 100;
  it('arrivée au 01/01/2025 avec 1 300 € d\'arriéré, loyers payés ensuite : 1 300 € reportés, une seule fois, sur 2025 PUIS 2026', () => {
    const mouvements = ymRange('2025-01', '2026-09').map((ym) => pay(ref, ym + '-05', 650));
    const ouv = { ym: '2025-01', loyer: 1300, charge: 0, avance: 0 };
    expect(tot(maitre(2025, '2025-01-01', ouv, mouvements))).toBe(1300);
    expect(tot(maitre(2026, '2025-01-01', ouv, mouvements))).toBe(1300);        // reporté, pas doublé
    const d = dette({ ref, ctx, bailDebut: '2019-09-04', fin: null, mouvements, debutSuivi: '2025-01-01', ouverture: { loyer: 1300, charge: 0, avance: 0 } });
    expect(d.loyer).toBe(1300);
  });
  it('l\'arriéré noté est soldé par un rattrapage, comme tout arriéré (le plus ancien d\'abord)', () => {
    const mouvements = [...ymRange('2025-01', '2026-09').map((ym) => pay(ref, ym + '-05', 650)), pay(ref, '2025-06-20', 1300)];
    const ouv = { ym: '2025-01', loyer: 1300, charge: 0, avance: 0 };
    expect(tot(maitre(2026, '2025-01-01', ouv, mouvements))).toBe(0);
    expect(dette({ ref, ctx, bailDebut: '2019-09-04', fin: null, mouvements, debutSuivi: '2025-01-01', ouverture: { loyer: 1300 } }).loyer).toBe(0);
  });
  it('dans l\'exercice : suivi au 01/03/2026, 700 € d\'arriéré → 700 € en 2026', () => {
    const mouvements = ymRange('2026-03', '2026-09').map((ym) => pay(ref, ym + '-05', 650));
    expect(tot(maitre(2026, '2026-03-01', { ym: '2026-03', loyer: 700, charge: 0, avance: 0 }, mouvements))).toBe(700);
  });
  it('une avance notée couvre les premiers loyers dus avant tout retard', () => {
    const mouvements = ymRange('2026-04', '2026-09').map((ym) => pay(ref, ym + '-05', 650));   // mars non payé…
    expect(tot(maitre(2026, '2026-03-01', { ym: '2026-03', loyer: 0, charge: 0, avance: 650 }, mouvements))).toBe(0);   // …couvert par l'avance
    expect(dette({ ref, ctx, bailDebut: '2019-09-04', fin: null, mouvements, debutSuivi: '2026-03-01', ouverture: { avance: 650 } })).toMatchObject({ loyer: 0, avance: 0 });
  });
});
