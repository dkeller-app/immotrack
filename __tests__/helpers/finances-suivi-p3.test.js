/**
 * FINANCES-SUIVI-UNIQUE P3 — Finances LIT le suivi unique (js/core/suivi-loyers.js).
 *
 * `_computeFinancesMonthly({ …, suivi })` : retard, avance de suivi (`avanceLot`), ligne d'écart
 * (`ecart`, « Avance / retard du lot ») et `byLot` viennent des POSITIONS de fin de mois du suivi
 * par bail ; la passe fiscale (_computeLoyerChargeAlloc) reste intouchée.
 *
 * Invariants prouvés ici (docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §F.1) :
 *   I-d  Σ des cartes de la fenêtre = valeur de la case = Σ des lots, chaque mois exigible ;
 *        colonne Année = position au dernier mois exigible (jamais la somme des mois).
 *   I-h  loyersHC, provisions, base2044 (et avance fiscale, rattrapage, loyersBrut) identiques au
 *        centime avec ou sans suivi injecté (mois ET année) — ≥ 300 jeux aléatoires + cas Arslan.
 *        La preuve sur l'export réel est faite par compare-moteurs.mjs (I-h P3, exit 1 sinon).
 * + le cas Arslan (Ferrette - 101) au centime dans la ligne d'écart, avec et sans le geste, et la
 *   dette d'un locataire parti visible l'année affichée seulement (décision Q2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { suiviLot, suiviPerimetre, versByLot } from '../../js/core/suivi-loyers.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { lotArslan, TODAY_ARSLAN, prng, lotAleatoire } from './suivi-loyers-fixtures.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const catLigne = (cat) => ({
  Loyer: { ligne2044: '211', type: 'recette' },
  GLI: { ligne2044: '213', type: 'recette' },
  Taxe: { ligne2044: '227', type: 'charge' }
}[cat] || null);
const FISC = ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'rattrapage', 'recettesDiverses', 'base2044', 'duHC', 'duCH', 'reel', 'cashflowReel'];

/** Les mouvements bancaires d'un lot de test (211 = virements, 213 = GLI). Le dépôt n'en est pas un. */
function mouvementsDe(lot) {
  return lot.paiements.map((p) => ({
    id: p.id, date: p.date, qui: lot.ref, cat: p.kind === 'gli' ? 'GLI' : 'Loyer',
    cr: p.montant > 0 ? p.montant : 0, db: p.montant < 0 ? -p.montant : 0
  }));
}
/** loyerDue du P&L fiscal (dû du lot entier au mois, comme _finBailHcChAt hors borne 1er versement). */
const loyerDueDe = (lots) => (qui, ym) => {
  const l = lots.find((x) => x.ref === qui);
  if (!l) return { hc: 0, ch: 0 };
  const d = duMois({ ref: l.ref, bails: l.baux, bareme: l.bareme }, ym);
  return { hc: d.hc || 0, ch: d.ch || 0 };
};
function pl(lots, today, avecSuivi, extraMv) {
  const year = today.slice(0, 4), mo = parseInt(today.slice(5, 7), 10);
  const graceLast = parseInt(today.slice(8, 10), 10) < 10;
  const suivi = avecSuivi ? lots.map((l) => suiviLot(l, { today, graceLast })) : undefined;
  const r = _computeFinancesMonthly({
    mouvements: lots.flatMap(mouvementsDe).concat(extraMv || []), year, scope: null, scopeWeight: () => 1,
    catLigne, isEcheance: () => false, loyerDue: loyerDueDe(lots), activeLots: lots.map((l) => l.ref),
    window: { lastMonth: mo, dueMonth: mo, today }, today, suivi
  });
  return { r, suivi };
}

describe('P3 — cas Arslan (Ferrette - 101) : la ligne « Avance / retard du lot »', () => {
  const ecarts = (geste) => {
    const { r } = pl([lotArslan({ geste })], TODAY_ARSLAN, true);
    return { r, parMois: Object.fromEntries(r.months.map((m) => [m.ym.slice(5), m.ecart])) };
  };
  it('sans le geste : 0 / 0 / +780 / 0 / −20 / −20 / −20 d\'avril à octobre ; Année = −20 (position, pas Σ)', () => {
    const { r, parMois } = ecarts(false);
    expect([parMois['04'], parMois['05'], parMois['06'], parMois['07'], parMois['08'], parMois['09'], parMois['10']])
      .toEqual([0, 0, 780, 0, -20, -20, -20]);
    expect(r.annual.ecart).toBe(-20);                          // position fin octobre
    expect(r.annual.chargeRetard).toBe(20);                    // les 20 € sont des charges (H-1)
    expect(r.annual.loyerRetard).toBe(0);
    // juillet : 0 de retard ET 0 d'avance (payé d'avance le 27/06) — jamais retard + avance
    const juil = r.months.find((m) => m.ym === '2026-07');
    expect(juil.loyerRetard + juil.chargeRetard).toBe(0);
    expect(juil.avanceLot).toBe(0);
    const aout = r.months.find((m) => m.ym === '2026-08');
    expect(aout.chargeRetard).toBe(20);
    expect(aout.avanceLot).toBe(0);
  });
  it('avec le manque accepté d\'août : 0 partout sauf juin (+780)', () => {
    const { r, parMois } = ecarts(true);
    expect(Object.entries(parMois).filter(([, v]) => Math.abs(v) > 0.005)).toEqual([['06', 780]]);
    expect(r.annual.ecart).toBe(0);
    expect(r.lotsEnRetard).toEqual([]);
  });
  it('byLot (adaptateur versByLot) : retard annuel = position, plus 323,01 €', () => {
    const { r } = pl([lotArslan()], TODAY_ARSLAN, true);
    const b = r.byLot['Ferrette - 101'];
    expect(b.annual.retard).toBe(20);
    expect(b.annual.avance).toBe(0);
    expect(b.solde).toBe(-20);
    expect(b.months.find((m) => m.ym === '2026-09').courant).toBe(0);    // septembre payé (la dette est d'août)
  });
});

describe('P3 — I-d : Σ cartes = case = Σ lots ; Année = position', () => {
  const verifier = (lots, today) => {
    const { r, suivi } = pl(lots, today, true);
    const due = r.dueMonth;
    for (const m of r.months) {
      if (m.mo > due) continue;
      const P = suiviPerimetre(suivi, m.ym);
      const sigmaLots = r2(suivi.reduce((t, s) => t + ((s.mois[m.ym] && s.mois[m.ym].solde) || 0), 0));
      const sigmaCartes = r2(P.enRetard.concat(P.enAvance).reduce((t, c) => t + c.solde, 0));
      expect(m.ecart, m.ym + ' case = Σ lots').toBeCloseTo(sigmaLots, 2);
      expect(P.solde, m.ym + ' fenêtre = case').toBeCloseTo(m.ecart, 2);
      expect(sigmaCartes, m.ym + ' Σ cartes = case').toBeCloseTo(m.ecart, 2);
      expect(r2(m.loyerRetard + m.chargeRetard), m.ym + ' retard = Σ retards des cartes').toBeCloseTo(P.retard, 2);
    }
    const pos = due ? r.months.find((m) => m.mo === due) : null;
    expect(r.annual.ecart).toBe(pos ? pos.ecart : 0);
    expect(r.annual.loyerRetard).toBe(pos ? pos.loyerRetard : 0);
    expect(r.annual.chargeRetard).toBe(pos ? pos.chargeRetard : 0);
    // byLot : Σ des lots = P&L (aucune surface ne peut diverger de la case)
    const sigmaByLot = r2(Object.values(r.byLot).reduce((t, b) => t + b.annual.retard, 0));
    expect(sigmaByLot).toBeCloseTo(r2(r.annual.loyerRetard + r.annual.chargeRetard), 2);
    expect(r2(Object.values(r.byLot).reduce((t, b) => t + b.solde, 0))).toBeCloseTo(r.annual.ecart, 2);
  };
  it('Arslan + un lot en avance (case nette entre lots, sept. +29,90 de la maquette)', () => {
    // Ferrette - 104 : 49,90 € d'avance fin septembre, consommés en octobre (prototype §F.1).
    const l104 = { ref: 'Ferrette - 104', baux: [{ debut: '2026-03-01', hc: 500, ch: 30, noms: 'Loc 104' }], bareme: [], manques: [],
      paiements: ['03', '04', '05', '06', '07', '08'].map((m, k) => ({ id: 'x' + k, date: '2026-' + m + '-03', montant: 530, kind: 'virement' }))
        .concat([{ id: 'x9', date: '2026-09-02', montant: 579.9, kind: 'virement' }, { id: 'x10', date: '2026-10-02', montant: 480.1, kind: 'virement' }]) };
    const { r } = pl([lotArslan(), l104], TODAY_ARSLAN, true);
    expect(r.months.find((m) => m.ym === '2026-09').ecart).toBe(29.9);   // +49,90 − 20
    expect(r.months.find((m) => m.ym === '2026-09').loyerRetard + r.months.find((m) => m.ym === '2026-09').chargeRetard).toBe(20); // le retard n'est JAMAIS net
    verifier([lotArslan(), l104], TODAY_ARSLAN);
  });
  it('≥ 300 périmètres aléatoires (1 à 3 lots, 1 à 3 baux chacun)', () => {
    const rnd = prng(20261006);
    for (let n = 0; n < 300; n++) {
      const nb = 1 + Math.floor(rnd() * 3);
      const gen = Array.from({ length: nb }, (_, k) => lotAleatoire(rnd, n * 10 + k));
      const today = gen.map((g) => g.today).sort().pop();
      verifier(gen.map((g) => g.lot), today);
    }
  });
});

describe('P3 — I-h : la passe fiscale est INCHANGÉE au centime', () => {
  const compare = (lots, today, extraMv) => {
    const avant = pl(lots, today, false, extraMv).r, apres = pl(lots, today, true, extraMv).r;
    for (const k of FISC) {
      expect(apres.annual[k], 'annuel ' + k).toBe(avant.annual[k]);
      apres.months.forEach((m, i) => expect(m[k], m.ym + ' ' + k).toBe(avant.months[i][k]));
    }
    expect(apres.months.map((m) => m.ym)).toEqual(avant.months.map((m) => m.ym));
  };
  it('cas Arslan (avec et sans geste) + une charge : loyers HC, provisions, base 2044 identiques', () => {
    const taxe = [{ id: 't1', date: '2026-09-15', qui: 'Ferrette - 101', cat: 'Taxe', cr: 0, db: 812 }];
    compare([lotArslan()], TODAY_ARSLAN, taxe);
    compare([lotArslan({ geste: true })], TODAY_ARSLAN, taxe);
  });
  it('le manque accepté n\'est JAMAIS un encaissement : fiscal identique avec et sans geste', () => {
    const a = pl([lotArslan()], TODAY_ARSLAN, true).r, b = pl([lotArslan({ geste: true })], TODAY_ARSLAN, true).r;
    for (const k of FISC) expect(b.annual[k]).toBe(a.annual[k]);
  });
  it('≥ 300 jeux aléatoires', () => {
    const rnd = prng(44);
    for (let n = 0; n < 300; n++) {
      const nb = 1 + Math.floor(rnd() * 3);
      const gen = Array.from({ length: nb }, (_, k) => lotAleatoire(rnd, n * 10 + k));
      const today = gen.map((g) => g.today).sort().pop();
      compare(gen.map((g) => g.lot), today);
    }
  });
});

describe('P3 — locataire parti (décision Q2) : dette figée, visible l\'année AFFICHÉE seulement', () => {
  // Cas C de R0-C : bail 1 (700 + 50) janv.→juin 2025, payé janv.→avr. → doit 1 400 loyer + 100
  // charges ; bail 2 (même lot) dès juillet, paie chaque mois + 750 de plus → 750 d'avance. La
  // dette du bail 1 n'est JAMAIS payée par le locataire suivant.
  const lot = {
    ref: 'L-C', bareme: [], manques: [],
    baux: [
      { debut: '2025-01-01', fin: '2025-06-30', finEffective: '2025-06-30', archive: true, hc: 700, ch: 50, noms: 'Ancien' },
      { debut: '2025-07-01', hc: 700, ch: 50, noms: 'Nouveau' }
    ],
    paiements: ['01', '02', '03', '04'].map((m, k) => ({ id: 'a' + k, date: '2025-' + m + '-05', montant: 750, kind: 'virement' }))
      .concat(['07', '08', '09', '10', '11', '12'].map((m, k) => ({ id: 'b' + k, date: '2025-' + m + '-05', montant: 750, kind: 'virement' })))
      .concat([{ id: 'b9', date: '2025-12-20', montant: 750, kind: 'virement' }])
      .concat(['01', '02', '03'].map((m, k) => ({ id: 'c' + k, date: '2026-' + m + '-05', montant: 750, kind: 'virement' })))
  };
  const today = '2026-02-15';
  const s = suiviLot(lot, { today });
  const run = (year, lastMonth) => _computeFinancesMonthly({
    mouvements: mouvementsDe(lot), year, scope: null, catLigne, isEcheance: () => false,
    loyerDue: () => ({ hc: 0, ch: 0 }), window: { lastMonth, dueMonth: lastMonth, today }, today, suivi: [s]
  });
  it('2025 (année du départ) : la dette 1 400 + 100 reste visible, l\'avance du suivant ne la paie pas', () => {
    const r = run('2025', 12);
    expect(r.annual.loyerRetard).toBe(1400);
    expect(r.annual.chargeRetard).toBe(100);
    expect(r.annual.avanceLot).toBe(750);
    expect(r.annual.ecart).toBe(-750);                // case nette : +750 − 1 500
    expect(r.byLot['L-C'].annual.retard).toBe(1500);  // bulle Impayés de 2025 : comptée (« parti »)
    expect(r.months.find((m) => m.ym === '2025-09').loyerRetard).toBe(1400);   // figée, visible les mois suivants de 2025
  });
  it('2026 (autre année) : elle disparaît de la case, de l\'Année et de byLot', () => {
    const r = run('2026', 2);
    expect(r.annual.loyerRetard + r.annual.chargeRetard).toBe(0);
    expect(r.byLot['L-C'].annual.retard).toBe(0);
    expect(r.months.find((m) => m.ym === '2026-01').avanceLot).toBe(750);   // l'avance du locataire actuel, elle, reste
  });
  it('elle reste sur le bail de l\'ancien locataire (retenue sur dépôt)', () => {
    expect(s.baux[0].position).toEqual({ retardLoyer: 1400, retardCharge: 100, avance: 0, solde: -1500 });
  });
});

describe('P3 — adaptateur versByLot : champs ajoutés (courant, solde, dueYm de la page)', () => {
  it('`courant` = manque propre au mois, `solde` = avance − retard ; dueYm de la page borne le retard', () => {
    const s = suiviLot(lotArslan(), { today: TODAY_ARSLAN, graceLast: true });
    const b = versByLot(s, 2026);
    const aout = b.months.find((m) => m.ym === '2026-08'), sept = b.months.find((m) => m.ym === '2026-09');
    expect(aout.courant).toBe(20);
    expect(aout.solde).toBe(-20);
    expect(sept.courant).toBe(0);
    expect(sept.solde).toBe(-20);
    const borne = versByLot(s, 2026, { dueYm: '2026-07' });
    expect(borne.months.find((m) => m.ym === '2026-08').loyerRetard + borne.months.find((m) => m.ym === '2026-08').chargeRetard).toBe(0);
    expect(borne.annual.retard).toBe(0);              // position fin juillet
    // la page ne peut pas déclarer exigible un mois que le suivi ne tient pas pour exigible
    expect(versByLot(s, 2026, { dueYm: '2026-12' }).annual.retard).toBe(b.annual.retard);
  });
  it('`courant` sous la tolérance du 10 : le loyer du mois courant non payé n\'est pas « à encaisser »', () => {
    const lot = { ref: 'L-T', bareme: [], manques: [], baux: [{ debut: '2026-01-01', hc: 700, ch: 0, noms: 'T' }],
      paiements: ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m, k) => ({ id: 't' + k, date: '2026-' + m + '-02', montant: 700, kind: 'virement' })) };
    const avecGrace = versByLot(suiviLot(lot, { today: '2026-10-05', graceLast: true }), 2026);
    const sansGrace = versByLot(suiviLot(lot, { today: '2026-10-15', graceLast: false }), 2026);
    expect(avecGrace.months.find((m) => m.ym === '2026-10').courant).toBe(0);     // « rien en retard, à régler avant le 10 »
    expect(avecGrace.annual.retard).toBe(0);
    expect(sansGrace.months.find((m) => m.ym === '2026-10').courant).toBe(700);
    expect(sansGrace.annual.retard).toBe(700);
  });
});

// ── Bulle Impayés (_computeImpayes, app-part1.js) branchée sur byLot = adaptateur versByLot ──
// Exécutée depuis index.html assemblé (comme impayes-perimetre.test.js), le maître étant le VRAI
// moteur avec le suivi injecté. Prouve : bulle = Finances au centime (même byLot) ; la dette d'un
// locataire PARTI est comptée l'année de son départ, à SON nom, marquée parti (Q2) ; une dette
// couverte par la GLI reste comptée (Q4 : l'indemnité ne réduit pas la dette du locataire).
describe('P3 — bulle Impayés lue sur l\'adaptateur versByLot', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url).pathname, 'utf8');
  const extrait = (nom) => { const i = html.indexOf('function ' + nom + '('); const j = html.indexOf('\n}', i); return (i === -1 || j === -1) ? null : html.slice(i, j + 2); };
  const impayes = (lotsIn, logements, today) => {
    const suivi = lotsIn.map((l) => suiviLot(l, { today }));
    const mo = parseInt(today.slice(5, 7), 10);
    const r = _computeFinancesMonthly({ mouvements: lotsIn.flatMap(mouvementsDe), year: today.slice(0, 4), scope: null, catLigne,
      isEcheance: () => false, loyerDue: loyerDueDe(lotsIn), window: { lastMonth: mo, dueMonth: mo, today }, today, suivi });
    const src = extrait('_computeImpayes') + '\n' + extrait('_nomsDuBail') + '\n' + extrait('_finSuiviDetteLot');
    const f = new Function('DB', '_finMonthly', '_finEntScope', '_finWindows', '_bienActiveBail', 'window', '_finSuiviLot', src + '\nreturn _computeImpayes;');
    const out = f({ logements, baux_historique: [] }, () => r, () => null, () => null, () => null,
      { _loyerTodayLocal: () => today }, (ref) => suivi.find((s) => s.ref === ref))({ scopeLogs: logements, yr: today.slice(0, 4), mo: '', activeEnt: '' });
    return { out, r };
  };
  it('Arslan : bulle = 20 € (la case), plus 323,01 € ; le locataire ACTUEL est nommé', () => {
    const { out, r } = impayes([lotArslan()], [{ ref: 'Ferrette - 101', locataire: 'cache périmé' }], TODAY_ARSLAN);
    expect(out.totalDue).toBe(20);
    expect(out.totalDue).toBe(r2(r.annual.loyerRetard + r.annual.chargeRetard));   // bulle = Finances
    expect(out.items[0]).toMatchObject({ locataire: 'Elise ARSLAN', depuisYm: '2026-08', parti: false });
  });
  it('locataire PARTI : compté l\'année de son départ, à son nom, « parti » ; plus l\'année suivante', () => {
    const lot = { ref: 'L-P', bareme: [], manques: [],
      baux: [{ debut: '2026-01-01', fin: '2026-04-30', finEffective: '2026-04-30', archive: true, hc: 600, ch: 0, noms: 'Parti Paul' },
        { debut: '2026-06-01', hc: 600, ch: 0, noms: 'Actuel Anne' }],
      paiements: [{ id: 'a', date: '2026-01-05', montant: 600, kind: 'virement' }, { id: 'b', date: '2026-02-05', montant: 600, kind: 'virement' },
        ...['06', '07', '08', '09'].map((m, k) => ({ id: 'n' + k, date: '2026-' + m + '-05', montant: 600, kind: 'virement' }))] };
    const { out } = impayes([lot], [{ ref: 'L-P', locataire: 'Actuel Anne' }], '2026-09-20');
    expect(out.totalDue).toBe(1200);
    expect(out.items[0]).toMatchObject({ locataire: 'Parti Paul (parti)', parti: true, depuisYm: '2026-03' });
  });
  it('dette couverte par la GLI : toujours comptée (Q4)', () => {
    const lot = { ref: 'L-G', bareme: [], manques: [], baux: [{ debut: '2026-01-01', hc: 800, ch: 0, noms: 'Gé' }],
      paiements: [{ id: 'a', date: '2026-01-05', montant: 800, kind: 'virement' }, { id: 'g', date: '2026-04-20', montant: 1600, kind: 'gli' }] };
    const { out } = impayes([lot], [{ ref: 'L-G', locataire: 'Gé' }], '2026-04-25');
    expect(out.totalDue).toBe(2400);                     // févr. + mars + avr. : la GLI n'efface rien
    expect(out.items[0].depuisYm).toBe('2026-02');
  });
});

// ── Câblage (patron *-cablage.test.js) : la page lit le suivi, un seul sélecteur de bailleur ──
describe('P3 — câblage de la page Finances', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url).pathname, 'utf8').replace(/\r/g, '');
  const corps = (nom) => { const i = html.indexOf('function ' + nom + '('); const j = html.indexOf('\n}', i); return i < 0 ? '' : html.slice(i, j + 2); };
  const main = readFileSync(new URL('../../js/main.js', import.meta.url).pathname, 'utf8');
  it('main.js expose le suivi (window.SuiviLoyers, window.suiviLot)', () => {
    expect(main).toMatch(/import \* as SuiviLoyers from '\.\/core\/suivi-loyers\.js'/);
    expect(main).toMatch(/window\.suiviLot = SuiviLoyers\.suiviLot/);
  });
  it('_finMonthly injecte le suivi des lots du périmètre', () => {
    expect(corps('_finMonthly')).toMatch(/suivi:\s*\(window\.SuiviLoyers[^\n]*_finSuiviLots\(scope\)/);
  });
  it('plus aucun select de bailleur sur la page (#fin-ent) : le périmètre = la pastille de la barre de gauche', () => {
    expect(html).not.toMatch(/id="fin-ent"/);
    expect(html).not.toMatch(/el\('fin-ent'\)/);
    expect(corps('_finPageEnt')).toMatch(/return _finActiveEnt\(\);/);
    expect(html).toMatch(/id="fin-imm"/);    // l'immeuble reste
    expect(html).toMatch(/id="fin-year"/);   // l'exercice reste
  });
  it('les 3 sous-lignes sont remplacées par UNE ligne « Avance / retard du lot »', () => {
    const pl = corps('_finRenderPLv2').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');   // code seul
    expect(pl).not.toMatch(/dont loyer en retard/);
    expect(pl).not.toMatch(/dont loyer perçu d/);
    expect(pl).not.toMatch(/dont rattrapage d/);
    expect(pl.match(/↳ Avance \/ retard du lot<\/span>/g) || []).toHaveLength(1);   // UNE ligne (le libellé ; l'infobulle le répète)
    expect(pl).toMatch(/o => o\.ecart, \{ ecartSub: true, drill: 'solde' \}/);
  });
  it('les fenêtres retard/avance lisent le suivi (plus la passe fiscale non compensée)', () => {
    expect(corps('_finDrillAvance')).toMatch(/_finDrillSuivi\('avance'/);
    expect(corps('_finDrillRetard')).toMatch(/_finDrillSuivi\(/);
    expect(corps('_finDrillSuivi')).toMatch(/suiviPerimetre|_finSuiviCase/);
    expect(corps('_finDrillSuivi')).not.toMatch(/_computeLoyerChargeAlloc/);
  });
  it('graphique : mois récent à gauche (même sens que le tableau)', () => {
    expect(corps('_finVizSeries')).toMatch(/\.reverse\(\)/);
    expect(corps('_finVizPaint')).toMatch(/const lastV = cf\[0\]/);
  });
});
