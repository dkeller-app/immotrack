import { describe, it, expect, vi } from 'vitest';
import {
  WINDOW_KIND,
  computeConstatWindow, computeExigibiliteWindow, alignPreviousYear,
  windowLabel, isFutureMonth, lastMovementMonth
} from '../../js/core/finances-window.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { _loyerTodayLocal } from '../../js/core/loyer-statut.js';
import { resolveScope, inScope } from '../../js/core/finances-scope.js';

// 13/09/2026 — le cas du CDC : 9 mois échus, un loyer déjà encaissé en octobre (post-daté).
const TODAY = '2026-09-13';
const MVTS = [
  { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },
  { date: '2026-09-03', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },
  { date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },   // POST-DATÉ (décision « B »)
  { date: '2025-12-30', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },   // autre exercice
  { date: '2026-11-04', cat: 'Loyer', qui: 'L9', cr: 800, db: 0, _deleted: true }
];

describe('finances-window — fenêtre d\'EXIGIBILITÉ (F-1)', () => {
  it('exercice en cours : 01/01 → dernier mois échu (le mois courant)', () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY });
    expect(w.kind).toBe(WINDOW_KIND.EXIGIBILITE);
    expect(w.lastMonth).toBe(9);
    expect(w.fromYm).toBe('2026-01');
    expect(w.toYm).toBe('2026-09');
    expect(w.nbMois).toBe(9);
  });

  it("un mouvement post-daté N\'ÉTEND PAS l\'exigibilité (on n\'est pas en retard sur un dû à venir)", () => {
    // L'assertion ne vaut que COMPAREE au constat : passer `mouvements` a une fonction
    // qui ne les lit jamais ne prouvait rien (elle ne pouvait pas echouer). On oppose donc
    // les DEUX fenetres sur exactement les memes entrees — c'est l'ecart qui porte le sens.
    const entrees = { year: 2026, today: TODAY, mouvements: MVTS };
    const exi = computeExigibiliteWindow(entrees);
    const cons = computeConstatWindow(entrees);
    expect(cons.lastMonth).toBe(10);      // le constat, lui, s'etend bien
    expect(exi.lastMonth).toBe(9);        // l'exigibilite reste au dernier mois echu
    expect(exi.lastMonth).toBe(exi.dueMonth);
    expect(exi.lastMonth).toBeLessThan(cons.lastMonth);
  });

  it("aucun mois n\'est « à venir » dans la fenêtre d\'exigibilité", () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY });
    expect(w.months.every(m => m.future === false)).toBe(true);
  });

  it('exercice clos → année pleine', () => {
    const w = computeExigibiliteWindow({ year: 2025, today: TODAY });
    expect(w.lastMonth).toBe(12);
    expect(w.toYm).toBe('2025-12');
  });

  it("exercice à venir → fenêtre VIDE (rien n\'est encore exigible)", () => {
    const w = computeExigibiliteWindow({ year: 2027, today: TODAY });
    expect(w.lastMonth).toBe(0);
    expect(w.months).toEqual([]);
    expect(w.empty).toBe(true);
    expect(w.toYm).toBe('');
  });

  it('tolérance de début de mois (constat 45) : graceLast avant le 10 du mois courant', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-09-03' }).graceLast).toBe(true);
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-09-13' }).graceLast).toBe(false);
    expect(computeExigibiliteWindow({ year: 2025, today: '2026-09-03' }).graceLast).toBe(false);
  });
});

describe('finances-window — fenêtre de CONSTAT (F-1 v2, décision « B »)', () => {
  it('01/01 → dernier mois contenant un mouvement connu, POST-DATÉ COMPRIS', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.kind).toBe(WINDOW_KIND.CONSTAT);
    expect(w.lastMonth).toBe(10);          // octobre entre dans l'exercice (constat 26)
    expect(w.toYm).toBe('2026-10');
    expect(w.nbMois).toBe(10);
  });

  it('les mois non échus sont COMPTÉS mais DRAPEAUTÉS « à venir » (grisage UI)', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.dueMonth).toBe(9);
    expect(w.months.filter(m => m.future).map(m => m.ym)).toEqual(['2026-10']);
    expect(isFutureMonth(w, '2026-10')).toBe(true);
    expect(isFutureMonth(w, '2026-09')).toBe(false);
  });

  it('sans mouvement post-daté, constat = exigibilité', () => {
    const sansPost = MVTS.filter(m => m.date < '2026-10');
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: sansPost });
    expect(w.lastMonth).toBe(9);
    expect(w.months.some(m => m.future)).toBe(false);
  });

  it("un mouvement supprimé n\'étend jamais la fenêtre", () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.lastMonth).toBe(10);          // novembre (tombstone) ignoré
  });

  it("les mouvements d\'un autre exercice n\'entrent pas dans le calcul", () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: [{ date: '2027-05-01', cr: 800, db: 0 }] });
    expect(w.lastMonth).toBe(9);
  });

  it("la fenêtre respecte le PÉRIMÈTRE : un post-daté hors périmètre ne l\'étend pas", () => {
    const inScope = (m) => m.qui === 'L1';
    const hors = MVTS.map(m => (m.date === '2026-10-02' ? { ...m, qui: 'AUTRE' } : m));
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: hors, inScope }).lastMonth).toBe(9);
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS, inScope }).lastMonth).toBe(10);
  });

  it('exercice clos → année pleine (aucun mois « à venir »)', () => {
    const w = computeConstatWindow({ year: 2025, today: TODAY, mouvements: MVTS });
    expect(w.lastMonth).toBe(12);
    expect(w.months.some(m => m.future)).toBe(false);
  });

  it('exercice à venir sans aucune saisie → fenêtre vide', () => {
    const w = computeConstatWindow({ year: 2027, today: TODAY, mouvements: MVTS });
    expect(w.empty).toBe(true);
    expect(w.months).toEqual([]);
  });

  it('exercice à venir DÉJÀ saisi → borné au dernier mouvement, tout est « à venir »', () => {
    const w = computeConstatWindow({ year: 2027, today: TODAY, mouvements: [{ date: '2027-03-01', cr: 800, db: 0 }] });
    expect(w.lastMonth).toBe(3);
    expect(w.months.every(m => m.future)).toBe(true);
  });

  it('lastMovementMonth est exposé et testable seul', () => {
    expect(lastMovementMonth(MVTS, 2026)).toBe(10);
    expect(lastMovementMonth(MVTS, 2024)).toBe(0);
    expect(lastMovementMonth([], 2026)).toBe(0);
    expect(lastMovementMonth(null, 2026)).toBe(0);
  });

  it("une date malformée ne casse ni n\'étend la fenêtre", () => {
    expect(lastMovementMonth([{ date: '2026-13-01', cr: 800 }, { date: 'n/a', cr: 800 }, { date: null, cr: 800 }], 2026)).toBe(0);
  });
});

describe('finances-window — libellés prêts à afficher', () => {
  it('constat, exercice en cours : « Exercice 2026 · tout ce qui est saisi au 13/09 »', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.label).toBe('Exercice 2026 · tout ce qui est saisi au 13/09');
    expect(windowLabel(w)).toBe(w.label);
  });

  it('constat, exercice clos : « Exercice 2025 · année complète »', () => {
    expect(computeConstatWindow({ year: 2025, today: TODAY }).label)
      .toBe('Exercice 2025 · année complète');
  });

  it('exigibilité : « du 01/01 au 30 septembre 2026 · 9 mois »', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: TODAY }).label)
      .toBe('du 01/01 au 30 septembre 2026 · 9 mois');
  });

  it('exigibilité, un seul mois : « 1 mois » (pas de pluriel fautif)', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-01-20' }).label)
      .toBe('du 01/01 au 31 janvier 2026 · 1 mois');
  });

  it('exigibilité, exercice clos : décembre', () => {
    expect(computeExigibiliteWindow({ year: 2025, today: TODAY }).label)
      .toBe('du 01/01 au 31 décembre 2025 · 12 mois');
  });

  it('février bissextile (29) et non bissextile (28)', () => {
    expect(computeExigibiliteWindow({ year: 2024, today: '2024-02-20' }).label)
      .toBe('du 01/01 au 29 février 2024 · 2 mois');
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-02-20' }).label)
      .toBe('du 01/01 au 28 février 2026 · 2 mois');
  });

  it('fenêtre vide : le libellé le DIT', () => {
    expect(computeExigibiliteWindow({ year: 2027, today: TODAY }).label).toBe('aucun mois échu');
    expect(computeConstatWindow({ year: 2027, today: TODAY }).label).toBe('Exercice 2027 · rien de saisi');
  });
});

describe('finances-window — alignement du comparatif N-1', () => {
  it('N-1 couvre la MÊME étendue de mois que N (jamais 9 mois contre 8)', () => {
    const n = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    const n1 = alignPreviousYear(n);
    expect(n1.year).toBe(2025);
    expect(n1.lastMonth).toBe(n.lastMonth);
    expect(n1.nbMois).toBe(n.nbMois);
    expect(n1.months.map(m => m.mo)).toEqual(n.months.map(m => m.mo));
  });

  it('N-1 est du passé : aucun mois « à venir », même si N en avait', () => {
    const n1 = alignPreviousYear(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }));
    expect(n1.months.some(m => m.future)).toBe(false);
    expect(n1.dueMonth).toBe(n1.lastMonth);
  });

  it("le libellé N-1 annonce l\'alignement", () => {
    const n1 = alignPreviousYear(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }));
    expect(n1.aligned).toBe(true);
    expect(n1.label).toBe('2025 · même période (10 mois)');
  });

  it("alignement d\'une fenêtre d\'exigibilité : même règle", () => {
    const n1 = alignPreviousYear(computeExigibiliteWindow({ year: 2026, today: TODAY }));
    expect(n1.kind).toBe(WINDOW_KIND.EXIGIBILITE);
    expect(n1.lastMonth).toBe(9);
    expect(n1.label).toBe('2025 · même période (9 mois)');
  });

  it("alignement d\'une fenêtre vide → fenêtre vide", () => {
    const n1 = alignPreviousYear(computeExigibiliteWindow({ year: 2027, today: TODAY }));
    expect(n1.empty).toBe(true);
    expect(n1.months).toEqual([]);
  });

  it('alignPreviousYear(null) ne jette pas', () => {
    expect(alignPreviousYear(null)).toBeNull();
  });
});

describe('finances-window — composition avec le moteur mensuel (contrat étape 2)', () => {
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);
  // LE GESTE JUSTE : on passe la FENÊTRE, jamais un entier (audit A1). Le moteur y lit
  // `lastMonth` (constat) pour les mois produits ET `dueMonth` (exigibilité) pour le retard.
  const run = (window, extra) => _computeFinancesMonthly(Object.assign({
    mouvements: MVTS, year: 2026, scope: null, catLigne, today: TODAY, window
  }, extra || {}));

  it("fenêtre de CONSTAT : le loyer post-daté d'octobre entre enfin dans l'exercice (constat 26)", () => {
    const r = run(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }));
    expect(r.months.map(m => m.ym)).toContain('2026-10');
    expect(r.annual.loyersBrut).toBe(2400);          // janv + sept + oct
  });

  it("fenêtre d'EXIGIBILITÉ : octobre reste hors du dû", () => {
    const r = run(computeExigibiliteWindow({ year: 2026, today: TODAY }));
    expect(r.months.map(m => m.ym)).not.toContain('2026-10');
    expect(r.annual.loyersBrut).toBe(1600);
  });

  it('les mois de la fenêtre et ceux du moteur coïncident exactement', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(run(w).months.map(m => m.ym)).toEqual(w.months.map(m => m.ym));
  });

  it("A1 : le moteur RESTITUE les deux bornes qu'il a appliquées", () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    const r = run(w);
    expect(r.lastMonth).toBe(10);      // constat
    expect(r.dueMonth).toBe(9);        // exigibilité
  });

  // ── LE PIÈGE que la décision « B » posait, désormais fermé ──────────────────
  it('A1 : la décision « B » ne fabrique PLUS de retard fantôme sur le mois courant', () => {
    const tot = '2026-09-03';          // avant le 10 → tolérance de début de mois active
    const loyerDue = () => ({ hc: 800, ch: 0 });
    const mvtsPostDate = [{ date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 }];
    const base = { mouvements: mvtsPostDate, year: 2026, scope: null, catLigne, today: tot,
                   activeLots: ['L1'], loyerDue };
    const w = computeConstatWindow({ year: 2026, today: tot, mouvements: mvtsPostDate });
    expect(w.lastMonth).toBe(10);
    expect(w.dueMonth).toBe(9);

    const r = _computeFinancesMonthly({ ...base, window: w });
    const sept = r.months.find(m => m.ym === '2026-09');
    const octo = r.months.find(m => m.ym === '2026-10');
    expect(sept.loyerRetard).toBe(0);   // tolérance respectée : elle suit dueMonth
    expect(octo.loyerRetard).toBe(0);   // un mois NON ÉCHU ne peut pas être en retard
    expect(octo.loyersBrut).toBe(800);  // …mais son encaissement est bien compté (décision B)

    // Le geste fautif d'avant (entier de constat) fabriquait ~800 € de retard par lot.
    const fautif = _computeFinancesMonthly({ ...base, lastMonth: w.lastMonth });
    expect(fautif.months.find(m => m.ym === '2026-09').loyerRetard).toBe(800);
  });

  it('A2 : une fenêtre VIDE produit ZÉRO mois, plus de janvier fantôme', () => {
    const w = computeExigibiliteWindow({ year: 2027, today: TODAY });
    expect(w.empty).toBe(true);
    const r = _computeFinancesMonthly({
      mouvements: [], year: 2027, scope: null, catLigne, today: TODAY, window: w
    });
    expect(r.months).toEqual([]);
    expect(r.lastMonth).toBe(0);
    expect(r.annual.loyersBrut).toBe(0);
    expect(r.annual.cashflowReel).toBe(0);
  });

  it('rétrocompatible : un entier `lastMonth` reste accepté (appelants historiques)', () => {
    const r = _computeFinancesMonthly({
      mouvements: MVTS, year: 2026, scope: null, catLigne, today: TODAY, lastMonth: 2
    });
    expect(r.months.map(m => m.ym)).toEqual(['2026-01', '2026-02']);
    expect(r.dueMonth).toBe(2);        // les 2 bornes se confondent, comme avant
  });
});

// ── Corrections d'audit ───────────────────────────────────────────────────────
describe('finances-window — robustesse (corrections d\'audit)', () => {
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);

  it('I1 : la date du jour est LOCALE, jamais toISOString()/UTC', () => {
    vi.useFakeTimers();
    try {
      // 1ᵉʳ janvier, 00 h 30 LOCAL : en UTC+X on est encore le 31/12 de l'exercice précédent.
      // Avec l'UTC, l'exercice en cours basculait en « à venir » → fenêtre VIDE.
      vi.setSystemTime(new Date(2026, 0, 1, 0, 30, 0));
      const w = computeExigibiliteWindow({ year: 2026 });
      expect(w.today).toBe(_loyerTodayLocal());
      expect(w.today).toBe('2026-01-01');
      expect(w.empty).toBe(false);
      expect(w.lastMonth).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it("A2 : fenetre vide — le moteur ne fabrique plus de janvier fantome", () => {
    const w = computeExigibiliteWindow({ year: 2027, today: TODAY });
    expect(w.empty).toBe(true);
    expect(w.lastMonth).toBe(0);
    expect(w.months).toEqual([]);
    // Avant A2, `lastMonth: 0` etait remonte a 1 par le moteur (Math.max(1, …)) et produisait
    // un mois de janvier ABSENT de la fenetre. Passee en OBJET, la fenetre est desormais
    // respectee a la lettre : zero mois exigible = zero mois produit.
    const r = _computeFinancesMonthly({
      mouvements: [], year: 2027, scope: null, catLigne, today: TODAY, window: w
    });
    expect(r.months).toEqual([]);
    expect(r.lastMonth).toBe(0);
  });

  it("en décembre de l\'exercice EN COURS, le libellé ne ment pas (« année complète »)", () => {
    const enCours = computeConstatWindow({ year: 2026, today: '2026-12-05' });
    expect(enCours.lastMonth).toBe(12);
    expect(enCours.label).toBe('Exercice 2026 · tout ce qui est saisi au 05/12');
    // Une fois l'exercice CLOS, le libellé devient légitime.
    expect(computeConstatWindow({ year: 2026, today: '2027-01-05' }).label)
      .toBe('Exercice 2026 · année complète');
  });

  it("isFutureMonth ignore les mois d\'un AUTRE exercice", () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(isFutureMonth(w, '2026-10')).toBe(true);
    expect(isFutureMonth(w, '2027-10')).toBe(false);   // même n° de mois, autre exercice
    expect(isFutureMonth(w, '2025-10')).toBe(false);
    expect(isFutureMonth(w, 10)).toBe(true);           // n° de mois nu : rétrocompatible
    expect(isFutureMonth(null, '2026-10')).toBe(false);
  });

  it('M1 : un exercice non numérique donne une fenêtre VIDE, jamais des mois « NaN-01 »', () => {
    ['abcd', '', null, undefined, NaN, 26].forEach(y => {
      const w = computeExigibiliteWindow({ year: y, today: TODAY });
      expect(w.empty).toBe(true);
      expect(w.months).toEqual([]);
      expect(w.fromYm).toBe('');
      expect(JSON.stringify(w)).not.toContain('NaN');
    });
    const c = computeConstatWindow({ year: 'oups', today: TODAY, mouvements: MVTS });
    expect(c.empty).toBe(true);
    expect(c.months).toEqual([]);
  });
});

// ── I2 · collision d’arite sur le perimetre ────────────────────────────────
describe("finances-window — perimetre : garde-fou d’arite (I2)", () => {
  const PARC = [
    { ref: 'A1', entity: 'SCI Alpha', imm: 'Lilas' },
    { ref: 'D1', entity: 'Dupont', imm: 'Chenes' }
  ];
  const MV = [
    { date: '2026-09-03', qui: 'A1', cr: 800, db: 0 },
    { date: '2026-10-02', qui: 'A1', cr: 800, db: 0 },   // post-date DANS le perimetre
    { date: '2026-11-02', qui: 'D1', cr: 900, db: 0 }    // post-date HORS perimetre
  ];
  const win = (perimetre) => computeConstatWindow(
    Object.assign({ year: 2026, today: TODAY, mouvements: MV }, perimetre));

  it("l’OBJET scope est la forme attendue : le perimetre borne la fenetre", () => {
    expect(win({ scope: resolveScope({ ent: 'SCI Alpha' }, PARC) }).lastMonth).toBe(10);
    expect(win({ scope: resolveScope({ ent: 'Dupont' }, PARC) }).lastMonth).toBe(11);
    expect(win({ scope: resolveScope({}, PARC) }).lastMonth).toBe(11);
  });

  it("passer finances-scope.inScope (binaire) LEVE une erreur au lieu de tout vider", () => {
    // Avant correction : chaque mouvement sortait du perimetre en silence, la fenetre
    // retombait a 9 et la decision « B » etait annulee sans que personne ne le voie.
    expect(() => win({ inScope })).toThrow(TypeError);
    expect(() => win({ inScope })).toThrow(/binaire/);
    expect(() => lastMovementMonth(MV, 2026, inScope)).toThrow(/OBJET scope/);
  });

  it("un predicat UNAIRE reste accepte (echappatoire documentee)", () => {
    expect(win({ filtreMouvement: (mv) => mv.qui === 'A1' }).lastMonth).toBe(10);
  });

  it("aucun perimetre = tout le patrimoine", () => {
    expect(win({}).lastMonth).toBe(11);
  });
});

// ── M4 / M6 · cas manquants ───────────────────────────────────────────────────
describe("finances-window — cas limites du constat (M4, M6)", () => {
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);

  it("M4 : un mouvement a montant NUL n'ouvre pas de colonne", () => {
    const vide = [{ date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 0, db: 0 }];
    expect(lastMovementMonth(vide, 2026)).toBe(0);
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: vide }).lastMonth).toBe(9);
    // ... alors qu'un centime, lui, compte (c'est de l'argent).
    const centime = [{ date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 0.01, db: 0 }];
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: centime }).lastMonth).toBe(10);
    // Un debit seul compte aussi (une charge payee d'avance).
    const debit = [{ date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 0, db: 300 }];
    expect(lastMovementMonth(debit, 2026)).toBe(10);
  });

  it("M6 : mouvement date de DECEMBRE en septembre — 3 colonnes futures d'un coup", () => {
    const tot = '2026-09-13';
    const mvts = [{ date: '2026-12-20', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 }];
    const w = computeConstatWindow({ year: 2026, today: tot, mouvements: mvts });
    expect(w.lastMonth).toBe(12);
    expect(w.dueMonth).toBe(9);
    expect(w.months.filter(m => m.future).map(m => m.ym))
      .toEqual(['2026-10', '2026-11', '2026-12']);
    expect(w.nbMois).toBe(12);
    // Le libelle reste factuel : ce n'est PAS une « annee complete ».
    expect(w.label).toBe('Exercice 2026 · tout ce qui est saisi au 13/09');

    // Le pire cas de A1 : 3 mois non echus, AUCUN retard fantome, encaissement compte.
    const r = _computeFinancesMonthly({
      mouvements: mvts, year: 2026, scope: null, catLigne, today: tot,
      activeLots: ['L1'], loyerDue: () => ({ hc: 800, ch: 0 }), window: w
    });
    expect(r.lastMonth).toBe(12);
    expect(r.dueMonth).toBe(9);
    ['2026-10', '2026-11', '2026-12'].forEach(ym => {
      expect(r.months.find(m => m.ym === ym).loyerRetard).toBe(0);
    });
    expect(r.months.find(m => m.ym === '2026-12').loyersBrut).toBe(800);
    // Le N-1 aligne couvre bien 12 mois, pas 9 (sinon la variation compare des durees).
    expect(alignPreviousYear(w).nbMois).toBe(12);
  });

  it("M6 : la bascule UTC/locale ne change pas le nombre de colonnes", () => {
    vi.useFakeTimers();
    try {
      // 1er octobre 00 h 30 LOCAL : en UTC+X on est encore le 30/09.
      vi.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));
      const w = computeConstatWindow({ year: 2026, mouvements: [] });
      expect(w.today).toBe(_loyerTodayLocal());
      expect(w.lastMonth).toBe(10);      // octobre existe : on ne perd pas la colonne
      expect(w.dueMonth).toBe(10);
      expect(w.months.some(m => m.future)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
