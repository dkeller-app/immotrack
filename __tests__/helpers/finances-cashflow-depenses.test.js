/**
 * Cash-flow : les vraies dépenses hors 2044 COMPTENT — l'achat d'un bien, non.
 *
 * Décision Didier du 05/10/2026 : « toutes dépenses ou recettes doivent figurer dans cash flow »,
 * précisée le même jour : « je ne veux pas que l'achat entre en compte ».
 *
 * Avant : le moteur jetait toute catégorie sans ligne 2044 (`if (!r || !r.ligne2044) return;`).
 * 12 500 € de travaux d'agrandissement payés n'apparaissaient nulle part dans le cash-flow.
 * Maintenant : « Travaux de construction / agrandissement » et « Divers (non déductible) » sont
 * comptés en charge (postes `construction` et `nonDeductible`), JAMAIS dans la base fiscale ;
 * l'achat d'un bien, les apports d'associés, les dépôts et les virements internes restent dehors.
 */

import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

// Résolveurs stub, calqués sur l'injection réelle de `_finMonthly`.
const catLigne = (cat) => ({
  'Loyer': { ligne2044: '211', type: 'recette' },
  'Taxe foncière': { ligne2044: '227', type: 'charge' }
}[cat] || null);
// En production : `(mere && mere.chargeHf) || null`, lu sur le référentiel.
const CHARGE_HF = {
  'Travaux de construction / agrandissement (non déductible)': 'construction',
  'Divers (non déductible)': 'nonDeductible'
};
const chargeHorsFiscal = (m) => CHARGE_HF[m && m.cat] || null;

const LOYERS = [
  { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-02-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-03-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-02-20', cat: 'Taxe foncière', qui: 'L1', cr: 0, db: 300 }
];
const HORS_RESULTAT = [
  { date: '2026-03-01', cat: 'Acquisition / cession de bien', qui: 'SCI:X', cr: 0, db: 182000 },
  { date: '2026-02-15', cat: 'CCA / distribution SCI', qui: 'SCI:X', cr: 40000, db: 0 },
  { date: '2026-03-02', cat: 'Dépôt de garantie (reçu / restitué)', qui: 'L1', cr: 900, db: 0 },
  { date: '2026-03-20', cat: 'Virement interne (non déclarable)', qui: 'SCI:X', cr: 0, db: 5000 }
];
const DEPENSES_HF = [
  { date: '2026-02-12', cat: 'Travaux de construction / agrandissement (non déductible)', qui: 'L1', cr: 0, db: 12500 },
  { date: '2026-03-05', cat: 'Divers (non déductible)', qui: 'L1', cr: 0, db: 340 }
];

const calc = (mouvements, avecInjection = true) => _computeFinancesMonthly(Object.assign(
  { mouvements, year: 2026, scope: null, scopeWeight: () => 1, catLigne, today: '2026-03-31' },
  avecInjection ? { chargeHorsFiscal } : {}
));

describe('Cash-flow — les dépenses réelles hors 2044 comptent', () => {
  const ref = calc(LOYERS);
  const r = calc(LOYERS.concat(DEPENSES_HF));

  it('les deux postes reçoivent leur montant, au bon mois', () => {
    expect(r.annual.construction).toBe(12500);
    expect(r.annual.nonDeductible).toBe(340);
    expect(r.months[1].construction).toBe(12500);   // février
    expect(r.months[2].nonDeductible).toBe(340);    // mars
  });

  it('ils entrent dans le total des charges et font baisser le cash-flow d’autant', () => {
    expect(r.annual.charges - ref.annual.charges).toBe(12840);
    expect(ref.annual.cashflowReel - r.annual.cashflowReel).toBe(12840);
    expect(ref.annual.cashflowNet - r.annual.cashflowNet).toBe(12840);
  });

  it('ils ne touchent JAMAIS la base fiscale', () => {
    // Non déductibles par définition : la 2044 ne doit pas bouger d'un centime.
    expect(r.annual.base2044).toBe(ref.annual.base2044);
  });

  it('un remboursement sur ces catégories vient en déduction (net, comme les autres charges)', () => {
    const avecAvoir = calc(LOYERS.concat(DEPENSES_HF, [
      { date: '2026-03-25', cat: 'Travaux de construction / agrandissement (non déductible)', qui: 'L1', cr: 500, db: 0 }
    ]));
    expect(avecAvoir.annual.construction).toBe(12000);
  });
});

describe('Cash-flow — l’achat d’un bien et les mouvements de capital restent dehors', () => {
  it('achat, apports, dépôts, virements internes : le cash-flow ne bouge pas d’un centime', () => {
    const ref = calc(LOYERS);
    const r = calc(LOYERS.concat(HORS_RESULTAT));
    expect(r.annual.cashflowReel).toBe(ref.annual.cashflowReel);
    expect(r.annual.charges).toBe(ref.annual.charges);
    expect(r.annual.construction).toBe(0);
    expect(r.annual.nonDeductible).toBe(0);
  });
});

describe('Le branchement RÉEL de l’app — `_finMonthly` lu dans le code, référentiel compris', () => {
  // Les tests ci-dessus injectent un résolveur stub. Celui-ci exécute la vraie fonction de l'app
  // avec le vrai référentiel : si l'app oubliait de transmettre le drapeau au moteur, ou si le
  // référentiel le perdait, le montant retomberait à zéro ici.
  it('les 12 500 € de travaux d’agrandissement remontent jusqu’au cash-flow', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const html = readFileSync(resolve(root, 'index.html'), 'utf8').replace(/\r/g, '');
    const corps = (nom) => { const i = html.indexOf('function ' + nom + '('); const j = html.indexOf('\n}', i); return i < 0 || j < 0 ? null : html.slice(i, j + 2); };
    const iS = html.indexOf('const STD_CATEGORIES = ['), jS = html.indexOf('\n];', iS);
    expect(iS, 'référentiel introuvable').toBeGreaterThan(-1);
    const STD = new Function(html.slice(iS, jS + 3) + '\nreturn STD_CATEGORIES;')();
    const src = corps('_finMonthly');
    expect(src, '_finMonthly introuvable').toBeTruthy();

    const mere = (nom) => STD.find(c => c.nom === nom) || null;
    const DB = { mouvements: [
      { date: '2026-01-10', cat: 'Loyers encaissés', qui: 'L1', cr: 1000, db: 0 },
      { date: '2026-02-12', cat: 'Travaux de construction / agrandissement (non déductible)', qui: 'L1', cr: 0, db: 12500 },
      { date: '2026-02-13', cat: 'Divers (non déductible)', qui: 'L1', cr: 0, db: 340 },
      { date: '2026-03-01', cat: 'Acquisition / cession de bien', qui: 'SCI:X', cr: 0, db: 182000 }
    ] };
    const f = new Function('window', 'DB', '_finMonthlyCache', '_finScopeWeight', '_finCatLigne', '_finBailHcChAt',
      '_finLotSuivi', '_finActiveLotsInScope', '_finCatMere', '_finIsRecupACharge', src + '\nreturn _finMonthly;')(
      { _computeFinancesMonthly, _dbGen: 1 }, DB, { gen: -1, m: new Map() }, () => 1,
      (cat) => { const m = mere(cat); return m && m.ligne2044 ? { ligne2044: m.ligne2044, type: m.type } : null; },
      () => ({ hc: 0, ch: 0 }), () => null, () => [], mere, () => false);
    const r = f(2026, null, 3);
    expect(r.annual.construction).toBe(12500);
    expect(r.annual.nonDeductible).toBe(340);
    expect(r.annual.charges).toBe(12840);   // l'achat de 182 000 € n'y est PAS
  });
});

describe('Compte de résultat — une ligne de charge se montre dès qu’elle porte un montant QUELQUE PART', () => {
  // L-4 : « Total charges propriétaire = somme exacte des lignes visibles ». Sur la seule année N,
  // un chantier de l'an dernier (colonne N-1) ou un achat et son avoir dans l'année (colonnes
  // mensuelles) étaient comptés dans le total mais leur ligne restait masquée.
  it('les lignes conditionnelles testent N, N-1 et chaque mois — pas seulement l’annuel N', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'index.html'), 'utf8').replace(/\r/g, '');
    const i = html.indexOf('function _finRenderPLv2('), j = html.indexOf('\n}', i);
    expect(i, '_finRenderPLv2 introuvable').toBeGreaterThan(-1);
    const corps = html.slice(i, j);
    const helper = corps.match(/const _visible = k => (\[[^\]]+\])\.concat\(cur\.months \|\| \[\]\)\.some/);
    expect(helper, 'le helper ne regarde plus N, N-1 et les mois').toBeTruthy();
    expect(helper[1]).toBe('[a, p]');
    for (const k of ['gestionHF', 'construction', 'nonDeductible', 'autres']) {
      expect(corps, k + ' : la ligne redevient conditionnée au seul annuel N').toContain("_visible('" + k + "')");
      expect(corps, k + ' : ancienne condition revenue').not.toContain('Math.abs((a && a.' + k + ') || 0) > 0.005 ?');
    }
  });

  it('la règle elle-même : un montant en N-1 ou dans un seul mois rend la ligne visible', () => {
    // Même expression que le code, exécutée : annuel N nul, N-1 non nul → visible.
    const _visible = (a, p, months) => k => [a, p].concat(months || []).some(o => Math.abs((o && o[k]) || 0) > 0.005);
    expect(_visible({ construction: 0 }, { construction: 12500 }, [])('construction')).toBe(true);
    expect(_visible({ nonDeductible: 0 }, {}, [{ nonDeductible: 3000 }, { nonDeductible: -3000 }])('nonDeductible')).toBe(true);
    expect(_visible({ construction: 0 }, {}, [{ construction: 0 }])('construction')).toBe(false);
  });
});

describe('Compatibilité — sans le résolveur, rien ne change', () => {
  it('un appelant qui n’injecte pas `chargeHorsFiscal` garde l’ancien comportement', () => {
    // Les harnais et instantanés écrits avant le 05/10 n'injectent rien : ils doivent rester stables.
    const r = calc(LOYERS.concat(DEPENSES_HF), false);
    expect(r.annual.construction).toBe(0);
    expect(r.annual.nonDeductible).toBe(0);
    expect(r.annual.charges).toBe(calc(LOYERS, false).annual.charges);
  });

  it('un résolveur qui rend une valeur inconnue n’ouvre pas de poste fantôme', () => {
    const r = _computeFinancesMonthly({
      mouvements: LOYERS.concat(DEPENSES_HF), year: 2026, scope: null, scopeWeight: () => 1, catLigne,
      today: '2026-03-31', chargeHorsFiscal: () => 'nimporteQuoi'
    });
    expect(r.annual.nimporteQuoi).toBeUndefined();
    expect(r.annual.charges).toBe(calc(LOYERS).annual.charges);
  });
});
