import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

// Résolveurs stub (en prod : _finCatLigne / _finScopeWeight / hcRatio / m.cat==='Prêt').
const catLigne = (cat) => ({
  'Loyer': { ligne2044: '211', type: 'recette' },
  'Taxe foncière': { ligne2044: '227', type: 'charge' },
  'Prêt — Intérêts': { ligne2044: '250', type: 'interet' },
  'Prêt': null,            // échéance = special (hors 2044) → géré via isEcheance
}[cat] || null);
const scopeWeight = () => 1;
const hcRatio = () => 1;                 // tout en HC (pas de provisions)
const isEcheance = (m) => m.cat === 'Prêt';

const mvts = [
  { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-01-05', cat: 'Prêt', qui: 'L1', cr: 0, db: 600 },          // échéance entière
  { date: '2026-01-20', cat: 'Taxe foncière', qui: 'L1', cr: 0, db: 100 },
  { date: '2026-02-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-02-05', cat: 'Prêt', qui: 'L1', cr: 0, db: 600 },
  { date: '2026-02-28', cat: 'Prêt — Intérêts', qui: 'L1', cr: 0, db: 150 }, // intérêts (ligne 250)
];

const base = { mouvements: mvts, year: 2026, scope: null, scopeWeight, catLigne, hcRatio, isEcheance, today: '2026-02-28' };

describe('_computeFinancesMonthly — modèle prêt entier', () => {
  it('produit les mois écoulés de l\'exercice (janv + févr 2026)', () => {
    const r = _computeFinancesMonthly(base);
    expect(r.months.map(m => m.ym)).toEqual(['2026-01', '2026-02']);
  });

  it('ligne « Prêt » = échéance entière (cat Prêt), pas seulement les intérêts', () => {
    const r = _computeFinancesMonthly(base);
    expect(r.months[0].pret).toBe(600);
    expect(r.annual.pret).toBe(1200);
  });

  it('Résultat réel après prêt = loyers HC − (prêt entier + autres charges)', () => {
    const r = _computeFinancesMonthly(base);
    // janv : 1000 − (600 prêt + 100 TF) = 300
    expect(r.months[0].reel).toBe(300);
    // févr : 1000 − 600 = 400
    expect(r.months[1].reel).toBe(400);
    expect(r.annual.reel).toBe(700);
  });

  it('Base imposable 2044 = loyers HC − (intérêts + autres charges), le capital JAMAIS dedans', () => {
    const r = _computeFinancesMonthly(base);
    // annuel : 2000 − (150 intérêts + 100 TF) = 1750 (capital 1050 exclu)
    expect(r.annual.base2044).toBe(1750);
  });

  it('intérêts renseignés → base 2044 disponible', () => {
    const r = _computeFinancesMonthly(base);
    expect(r.interetsTotal).toBe(150);
    expect(r.interetsKnown).toBe(true);
  });

  it('aucun intérêt saisi → base 2044 verrouillée (interetsKnown=false)', () => {
    const sansInt = mvts.filter(m => m.cat !== 'Prêt — Intérêts');
    const r = _computeFinancesMonthly({ ...base, mouvements: sansInt });
    expect(r.interetsTotal).toBe(0);
    expect(r.interetsKnown).toBe(false);
  });

  it('option lastMonth borne la période (N-1 sur la même période que l\'exercice en cours)', () => {
    const r = _computeFinancesMonthly({ ...base, lastMonth: 1 });   // janvier seulement
    expect(r.months.map(m => m.ym)).toEqual(['2026-01']);
    expect(r.annual.reel).toBe(300);                                 // janv uniquement
  });

  it('CFE / taxe vacance (gestionCharge) : comptées dans le réel mais EXCLUES de la base 2044', () => {
    const mv2 = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
      { date: '2026-01-20', cat: 'CFE', qui: 'L1', cr: 0, db: 300 } // special hors 2044
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv2, year: 2026, scope: null,
      scopeWeight: () => 1, hcRatio: () => 1, isEcheance: m => m.cat === 'Prêt',
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      isGestionCharge: m => m.cat === 'CFE',
      today: '2026-01-31'
    });
    expect(r.annual.gestionHF).toBe(300);
    expect(r.annual.reel).toBe(700);      // 1000 − 300 (CFE déduite du réel)
    expect(r.annual.base2044).toBe(1000); // CFE EXCLUE de la base imposable
  });

  it('charges récupérables : solde trésorerie (provisions − récup payées) → cash-flow réel & net', () => {
    const mv3 = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1150, db: 0 },        // HC 1000 + provisions 150
      { date: '2026-01-15', cat: 'Prêt', qui: 'L1', cr: 0, db: 600 },          // échéance
      { date: '2026-01-20', cat: 'Charges copro', qui: 'L1', cr: 0, db: 200 }  // récupérable 229 payée par le bailleur
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv3, year: 2026, scope: null,
      scopeWeight: () => 1, isEcheance: m => m.cat === 'Prêt',
      hcRatio: () => 1000 / 1150,
      catLigne: cat => ({ 'Loyer': { ligne2044: '211', type: 'recette' }, 'Charges copro': { ligne2044: '229', type: 'charge' } }[cat] || null),
      today: '2026-01-31'
    });
    expect(r.annual.loyersHC).toBe(1000);
    expect(r.annual.provisions).toBe(150);     // payées par le locataire
    expect(r.annual.recup).toBe(200);          // payées par le bailleur
    expect(r.annual.recupSolde).toBe(-50);     // 150 − 200 (le bailleur a avancé 50)
    expect(r.annual.cashflowNet).toBe(400);    // = réel après prêt (loyers HC − prêt) = ton résultat propre
    expect(r.annual.cashflowReel).toBe(350);   // = net + solde récup = 400 − 50 (le vrai cash)
  });

  it('charges récupérables payées en direct (flag recup, ligne 2044 vide) comptées dans recup', () => {
    const mv = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1150, db: 0 },       // HC 1000 + provisions 150
      { date: '2026-01-20', cat: 'Eau commune', qui: 'L1', cr: 0, db: 120 }   // special recup (ligne2044 vide)
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      isRecupCharge: m => m.cat === 'Eau commune',          // flag recup → captée avant catLigne
      hcRatio: () => 1000 / 1150,
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null), // Eau commune non mappée
      today: '2026-01-31'
    });
    expect(r.annual.recup).toBe(120);          // captée malgré ligne2044 vide
    expect(r.annual.provisions).toBe(150);
    expect(r.annual.recupSolde).toBe(30);      // 150 − 120 = +30 (trop-perçu, à rendre)
    expect(r.annual.cashflowNet).toBe(1000);   // aucune charge propriétaire → réel = loyers HC
    expect(r.annual.cashflowReel).toBe(1030);  // 1000 + 30
  });

  it('recettes diverses (ligne 213 : parking, GLI) comptées en revenus, cash-flow ET base 2044', () => {
    const mv = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },     // 211 loyer HC
      { date: '2026-01-15', cat: 'Parking', qui: 'L1', cr: 200, db: 0 },    // 213 recette diverse (imposable)
      { date: '2026-01-20', cat: 'Taxe foncière', qui: 'L1', cr: 0, db: 100 } // 227 charge
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1, hcRatio: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      catLigne: cat => ({
        'Loyer': { ligne2044: '211', type: 'recette' },
        'Parking': { ligne2044: '213', type: 'recette' },
        'Taxe foncière': { ligne2044: '227', type: 'charge' }
      }[cat] || null),
      today: '2026-01-31'
    });
    expect(r.annual.recettesDiverses).toBe(200);       // 213 capté (avant : ignoré → perdu)
    expect(r.annual.loyersHC).toBe(1000);              // 211 inchangé
    expect(r.annual.reel).toBe(1100);                  // loyers HC 1000 + recettes 200 − taxe 100
    expect(r.annual.cashflowReel).toBe(1100);          // + solde récup 0
    expect(r.annual.base2044).toBe(1100);              // 1000 + 200 − 100 (213 imposable)
  });

  it('split HC/charges : le ratio reçoit la DATE du mouvement (bail actif du mois, pas le bail courant)', () => {
    const mv = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 }, // ancien bail : ratio 0,8
      { date: '2026-06-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 }  // nouveau bail : ratio 0,5
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      hcRatio: (qui, date) => (date < '2026-04-01' ? 0.8 : 0.5), // ratio dépend de la DATE (changement de locataire)
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-06-30'
    });
    // janv : HC 800 / prov 200 ; juin : HC 500 / prov 500 → annuel HC 1300, prov 700
    expect(r.annual.loyersHC).toBe(1300);
    expect(r.annual.provisions).toBe(700);
  });

  it('respecte le poids de périmètre (scopeWeight) — frais SCI répartis', () => {
    const r = _computeFinancesMonthly({ ...base, scopeWeight: (s, m) => (m.cat === 'Taxe foncière' ? 0.5 : 1) });
    // TF janv pondérée 0,5 → 50 ; réel janv = 1000 − (600 + 50) = 350
    expect(r.months[0].taxe).toBe(50);
    expect(r.months[0].reel).toBe(350);
  });
});
