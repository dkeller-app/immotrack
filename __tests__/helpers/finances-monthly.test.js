import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

// Résolveurs stub (en prod : _finCatLigne / _finScopeWeight / _finBailHcChAt / m.cat==='Prêt').
const catLigne = (cat) => ({
  'Loyer': { ligne2044: '211', type: 'recette' },
  'Taxe foncière': { ligne2044: '227', type: 'charge' },
  'Prêt — Intérêts': { ligne2044: '250', type: 'interet' },
  'Prêt': null,            // échéance = special (hors 2044) → géré via isEcheance
}[cat] || null);
const scopeWeight = () => 1;
const isEcheance = (m) => m.cat === 'Prêt';

const mvts = [
  { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-01-05', cat: 'Prêt', qui: 'L1', cr: 0, db: 600 },          // échéance entière
  { date: '2026-01-20', cat: 'Taxe foncière', qui: 'L1', cr: 0, db: 100 },
  { date: '2026-02-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 },
  { date: '2026-02-05', cat: 'Prêt', qui: 'L1', cr: 0, db: 600 },
  { date: '2026-02-28', cat: 'Prêt — Intérêts', qui: 'L1', cr: 0, db: 150 }, // intérêts (ligne 250)
];

const base = { mouvements: mvts, year: 2026, scope: null, scopeWeight, catLigne, isEcheance, today: '2026-02-28' };

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
      scopeWeight: () => 1, isEcheance: m => m.cat === 'Prêt',
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
      loyerDue: () => ({ hc: 1000, ch: 150 }),          // dû du mois → cascade cumulative
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
      loyerDue: () => ({ hc: 1000, ch: 150 }),          // dû du mois → cascade cumulative
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
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
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

  it('split HC/charges : la cascade reçoit le bail DU MOIS (bail actif du mois, pas le bail courant)', () => {
    const mv = [
      { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 }, // ancien bail : hc 800 / ch 200
      { date: '2026-06-10', cat: 'Loyer', qui: 'L1', cr: 1000, db: 0 }  // nouveau bail : hc 500 / ch 500
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: (qui, ym) => ym < '2026-04' ? ({ hc: 800, ch: 200 }) : ({ hc: 500, ch: 500 }),
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-06-30'
    });
    // janv : payé pile 1000 → HC 800 / prov 200 ; juin : HC 500 / prov 500 → annuel HC 1300, prov 700
    expect(r.annual.loyersHC).toBe(1300);
    expect(r.annual.provisions).toBe(700);
  });

  it('CASCADE CUMULATIVE (dettes avant avance) : jan-avr pleins, mai 515 partiel, juin 615 → juin récupère l\'arriéré, avance 70', () => {
    const mv = [
      { date: '2026-01-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 },
      { date: '2026-02-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 },
      { date: '2026-03-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 },
      { date: '2026-04-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 },
      { date: '2026-05-05', cat: 'Loyer', qui: 'L1', cr: 515, db: 0 },   // dû 530 → 500 HC + 15 ch (15 en arriéré)
      { date: '2026-06-05', cat: 'Loyer', qui: 'L1', cr: 615, db: 0 }    // 500 HC + 30 ch + 15 récup mai + 70 avance
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: () => ({ hc: 500, ch: 30 }),
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-07-31'
    });
    const mai = r.months.find(m => m.mo === 5), juin = r.months.find(m => m.mo === 6);
    expect(mai.loyersHC).toBe(500); expect(mai.provisions).toBe(15); expect(mai.avance).toBe(0);
    expect(juin.loyersHC).toBe(570); expect(juin.provisions).toBe(45); expect(juin.avance).toBe(70);  // récup 15 mai + avance 70
    expect(r.annual.loyersHC).toBe(3070);
    expect(r.annual.provisions).toBe(180);   // les 15 de mai récupérés en juin
    expect(r.annual.avance).toBe(70);        // PAS 85 : les dettes passent avant l'avance
  });

  it('RETARD par lot exposé (mensuel = RÉSIDU du mois, on ne reporte pas ; annuel = somme) : Marion janv-mai pleins, juin 300, juil 0', () => {
    const mk = (mo, cr) => ({ date: '2026-' + mo + '-05', cat: 'Loyer', qui: 'L1', cr, db: 0 });
    const mv = [mk('01', 530), mk('02', 530), mk('03', 530), mk('04', 530), mk('05', 530), mk('06', 300), mk('07', 0)];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: () => ({ hc: 500, ch: 30 }),
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-07-31'
    });
    expect(r.annual.loyerRetard).toBe(700);       // somme des mois (= outstanding, pas de rattrapage ici)
    expect(r.annual.chargeRetard).toBe(60);
    const juin = r.months.find(m => m.mo === 6), juil = r.months.find(m => m.mo === 7);
    expect(juin.loyerRetard).toBe(200); expect(juin.chargeRetard).toBe(30);   // manque PROPRE de juin
    expect(juil.loyerRetard).toBe(500); expect(juil.chargeRetard).toBe(30);   // manque PROPRE de juil (PAS 700/60 cumulé)
  });

  it('POINT 1 — l\'avance d\'un lot ne MASQUE PAS le retard d\'un autre (agrégat par-lot, jamais sur le net)', () => {
    const L = (qui, mo, cr) => ({ date: '2026-' + mo + '-05', cat: 'Loyer', qui, cr, db: 0 });
    const mv = [
      L('A', '01', 530), L('A', '02', 530), L('A', '03', 530), L('A', '04', 530), L('A', '05', 530), L('A', '06', 300), L('A', '07', 0), // A : retard 700/60
      L('B', '01', 530), L('B', '02', 530), L('B', '03', 530), L('B', '04', 530), L('B', '05', 530), L('B', '06', 530), L('B', '07', 1430) // B : à jour + 900 avance
    ];
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: () => ({ hc: 500, ch: 30 }),
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-07-31'
    });
    expect(r.annual.loyerRetard).toBe(700);   // retard de A VISIBLE malgré l'avance de B
    expect(r.annual.chargeRetard).toBe(60);
    expect(r.annual.avance).toBe(900);         // avance de B (indépendante du retard de A)
  });

  it('lot à bail actif SANS aucun paiement (activeLots) : retard = dû total, PAS invisible', () => {
    const mv = [{ date: '2026-01-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 }]; // seul L1 a un mouvement ; L2 ne paie RIEN
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: () => ({ hc: 500, ch: 30 }),        // les deux lots doivent 500/30
      activeLots: ['L1', 'L2'],                     // L2 a un bail actif mais 0 mouvement
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-02-28'
    });
    expect(r.annual.loyerRetard).toBe(1500);   // L1 févr 500 + L2 janv-févr 1000 (invisible sans activeLots)
    expect(r.annual.chargeRetard).toBe(90);    // 30 + 60
    expect(r.annual.loyersHC).toBe(500);       // L2 n'INVENTE aucune recette (0 payé)
    expect(r.annual.provisions).toBe(30);
  });

  it('tolérance début de mois : le loyer du mois COURANT impayé n\'est pas « en retard » avant le 10', () => {
    const mk = (mo) => ({ date: '2026-' + mo + '-05', cat: 'Loyer', qui: 'L1', cr: 530, db: 0 });
    const mv = ['01', '02', '03', '04', '05', '06'].map(mk); // jan-juin payés ; juillet (courant) RIEN
    const opts = {
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: () => ({ hc: 500, ch: 30 }),
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null)
    };
    const avant = _computeFinancesMonthly({ ...opts, today: '2026-07-05' }); // avant le 10
    expect(avant.annual.loyerRetard).toBe(0);    // juillet impayé mais sous tolérance
    expect(avant.annual.chargeRetard).toBe(0);
    const apres = _computeFinancesMonthly({ ...opts, today: '2026-07-15' }); // après le 10
    expect(apres.annual.loyerRetard).toBe(500);  // juillet redevient un retard
    expect(apres.annual.chargeRetard).toBe(30);
  });

  it('changement de locataire : paiements de l\'ancien (mois au dû non résolu) → loyer HC, PAS « trop-perçu »', () => {
    const mk = (mo, cr) => ({ date: '2026-' + mo + '-05', cat: 'Loyer', qui: 'D1', cr, db: 0 });
    const mv = [mk('01', 530), mk('02', 530), mk('07', 640)]; // ancien loc janv-févr, nouveau juillet
    const r = _computeFinancesMonthly({
      mouvements: mv, year: 2026, scope: null, scopeWeight: () => 1,
      isEcheance: m => m.cat === 'Prêt',
      loyerDue: (qui, ym) => ym >= '2026-07' ? ({ hc: 600, ch: 40 }) : ({ hc: 0, ch: 0 }), // ancien bail non archivé → dû 0 avant juillet
      catLigne: cat => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
      today: '2026-07-31'
    });
    expect(r.annual.avance).toBe(0);        // AUCUNE fausse avance sur les paiements de l'ancien
    expect(r.annual.loyersHC).toBe(1660);   // 530 + 530 (ancien) + 600 (nouveau juillet)
    expect(r.annual.provisions).toBe(40);   // juillet : 640 → 600 HC + 40 charges
  });

  it('respecte le poids de périmètre (scopeWeight) — frais SCI répartis', () => {
    const r = _computeFinancesMonthly({ ...base, scopeWeight: (s, m) => (m.cat === 'Taxe foncière' ? 0.5 : 1) });
    // TF janv pondérée 0,5 → 50 ; réel janv = 1000 − (600 + 50) = 350
    expect(r.months[0].taxe).toBe(50);
    expect(r.months[0].reel).toBe(350);
  });
});
