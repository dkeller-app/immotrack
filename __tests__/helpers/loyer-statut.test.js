import { describe, it, expect } from 'vitest';
import {
  _computeLoyerStatut,
  _loyerChipVerdict,
  _loyerToleranceActive,
  _loyerTodayLocal,
  _LOYER_TOLERANCE_JOUR
} from '../../js/core/loyer-statut.js';

// SUIVI-LOYERS-SOURCE-UNIQUE Phase A — moteur pur de statut de paiement.
// Porte l'algorithme de _suiviLoyerStrip (index.html, H1 v15.408) : allocation
// CHRONOLOGIQUE du total encaissé sur les mois dus + solde signé par locataire.
// dueOfMonth est injecté (en prod : _getActiveBailHcChProrated — prorata entrée/sortie).

const flat = (m) => () => m;                       // dû constant
const strip = (over) => _computeLoyerStatut(Object.assign({
  year: 2026, today: '2026-07-15', monthlyFull: 655, totalPaid: 0, dueOfMonth: flat(655)
}, over));
const clsOf = (s) => s.months.map(m => m.cls).join(',');

describe('_computeLoyerStatut — allocation chronologique', () => {
  it('scénario user : 2 mois payés en janvier, on est en février → février COUVERT, solde 0', () => {
    const s = strip({ today: '2026-02-20', totalPaid: 1310 });
    expect(s.curMo).toBe(2);
    expect(s.months[0].cls).toBe('ok');            // janvier payé
    expect(s.months[1].cls).toBe('ok');            // février couvert par l'avance (report)
    expect(s.months[1].recu).toBe(655);
    expect(s.solde).toBe(0);
    expect(clsOf(s)).toBe('ok,ok,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir');
  });

  it('avance visible : 2 mois payés, on est fin janvier → février marqué « avance », solde +655', () => {
    const s = strip({ today: '2026-01-31', totalPaid: 1310 });
    expect(s.curMo).toBe(1);
    expect(s.months[0].cls).toBe('ok');
    expect(s.months[1].cls).toBe('avance');        // mois FUTUR pré-payé
    expect(s.months[2].cls).toBe('avenir');
    expect(s.solde).toBe(655);
    expect(s.attendu).toBe(655);                   // seul janvier est échu
  });

  it('retard : 4 mois payés sur 7 échus → mai/juin/juillet impayés, solde −1 350', () => {
    const s = strip({ monthlyFull: 450, dueOfMonth: flat(450), totalPaid: 1800 });
    expect(clsOf(s)).toBe('ok,ok,ok,ok,imp,imp,imp,avenir,avenir,avenir,avenir,avenir');
    expect(s.solde).toBe(-1350);
    expect(s.attendu).toBe(3150);
    expect(s.recu).toBe(1800);
  });

  it('allocation au plus ancien d\'abord : 1 seul mois payé sur 3 échus → janvier ok, février/mars impayés', () => {
    const s = strip({ today: '2026-03-20', totalPaid: 655 });
    expect(clsOf(s).slice(0, 14)).toBe('ok,imp,imp,ave');
  });

  it('paiement partiel → warn avec le montant alloué', () => {
    const s = strip({ today: '2026-01-20', totalPaid: 400 });
    expect(s.months[0].cls).toBe('warn');
    expect(s.months[0].recu).toBe(400);
    expect(s.solde).toBe(-255);
  });

  it('prorata entrée mi-mois via dueOfMonth injecté (327,50 en janvier)', () => {
    const due = (mi0) => mi0 === 0 ? 327.5 : 655;
    const s = strip({ today: '2026-02-15', dueOfMonth: due, totalPaid: 982.5 });
    expect(s.months[0].cls).toBe('ok');
    expect(s.months[0].attendu).toBe(327.5);
    expect(s.months[1].cls).toBe('ok');
    expect(s.solde).toBe(0);
  });

  it('mois sans bail (dû ≤ 0,50) → « vac », exclu de l\'attendu', () => {
    const due = (mi0) => mi0 < 3 ? 0 : 655;        // bail démarre en avril
    const s = strip({ today: '2026-06-15', dueOfMonth: due, totalPaid: 1310 });
    expect(s.months.slice(0, 6).map(m => m.cls)).toEqual(['vac', 'vac', 'vac', 'ok', 'ok', 'imp']);
    expect(s.attendu).toBe(1965);                  // avril+mai+juin seulement
    expect(s.solde).toBe(-655);
  });

  it('année passée : les 12 mois sont échus (curMo = 12)', () => {
    const s = strip({ year: 2025, today: '2026-07-15', totalPaid: 655 * 12 });
    expect(s.curMo).toBe(12);
    expect(s.months.every(m => m.cls === 'ok')).toBe(true);
    expect(s.solde).toBe(0);
  });

  it('année future : curMo = 0, tout « avenir » (rien d\'échu, rien de dû)', () => {
    const s = strip({ year: 2027, today: '2026-07-15', totalPaid: 0 });
    expect(s.curMo).toBe(0);
    expect(s.months.every(m => m.cls === 'avenir')).toBe(true);
    expect(s.attendu).toBe(0);
  });

  it('monthlyFull = 0 : mois futurs en « vac » (pas de loyer de référence)', () => {
    const s = strip({ today: '2026-01-15', monthlyFull: 0, dueOfMonth: flat(655), totalPaid: 655 });
    expect(s.months[0].cls).toBe('ok');            // échu : dû réel via dueOfMonth
    expect(s.months[1].cls).toBe('vac');           // futur : référence monthlyFull = 0
  });

  it('dueOfMonth n\'est JAMAIS appelé pour les mois futurs (parité perf : prorata seulement sur l\'échu)', () => {
    const calls = [];
    const due = (mi0) => { calls.push(mi0); return 655; };
    strip({ today: '2026-03-15', dueOfMonth: due });
    expect(calls).toEqual([0, 1, 2]);              // janvier..mars seulement (curMo = 3)
  });

  it('mois futur PARTIELLEMENT couvert → « avenir » (pas « avance » : seuil 99 %)', () => {
    const s = strip({ today: '2026-01-31', totalPaid: 655 + 300 });   // janvier plein + 300 vers février
    expect(s.months[0].cls).toBe('ok');
    expect(s.months[1].cls).toBe('avenir');        // 300/655 < 99 % → pas marqué avance
    expect(s.months[1].recu).toBe(300);
  });

  it('arrondis à 2 décimales (dérive centimes)', () => {
    const s = strip({ today: '2026-02-10', dueOfMonth: flat(655.333), monthlyFull: 655.333, totalPaid: 1000.005 });
    s.months.forEach(m => {
      expect(m.recu).toBe(Math.round(m.recu * 100) / 100);
      expect(m.attendu).toBe(Math.round(m.attendu * 100) / 100);
    });
    expect(s.solde).toBe(Math.round(s.solde * 100) / 100);
  });
});

describe('_loyerChipVerdict — la pastille unique (seuils du Suivi des loyers)', () => {
  it('solde ≤ −20 → retard, avec équivalent en mois arrondi à 0,1', () => {
    expect(_loyerChipVerdict(-1350, 450)).toEqual({ cls: 'retard', montant: 1350, nMois: 3 });
    expect(_loyerChipVerdict(-20, 655)).toMatchObject({ cls: 'retard', montant: 20 });
  });
  it('solde ≥ +20 → avance (borne exacte +20 incluse)', () => {
    expect(_loyerChipVerdict(655, 655)).toEqual({ cls: 'avance', montant: 655, nMois: 1 });
    expect(_loyerChipVerdict(20, 655).cls).toBe('avance');
  });
  it('entre −20 et +20 → à jour (bruit de virement ignoré)', () => {
    expect(_loyerChipVerdict(-19.99, 655).cls).toBe('ajour');
    expect(_loyerChipVerdict(0, 655).cls).toBe('ajour');
    expect(_loyerChipVerdict(19.99, 655).cls).toBe('ajour');
  });
  it('monthlyFull = 0 → nMois = 0 (pas de division par zéro)', () => {
    expect(_loyerChipVerdict(-500, 0)).toEqual({ cls: 'retard', montant: 500, nMois: 0 });
  });
});

describe('tolérance début de mois — LA règle partagée (fin du « 0 impayé ici, 14 là »)', () => {
  it('constante = 10 (réf. _computeImpayes, seule règle conservée)', () => {
    expect(_LOYER_TOLERANCE_JOUR).toBe(10);
  });
  it('active avant le 10 du mois, inactive à partir du 10', () => {
    expect(_loyerToleranceActive('2026-07-07')).toBe(true);
    expect(_loyerToleranceActive('2026-07-09')).toBe(true);
    expect(_loyerToleranceActive('2026-07-10')).toBe(false);
    expect(_loyerToleranceActive('2026-07-25')).toBe(false);
  });
  it('_loyerTodayLocal : ISO local (pas UTC — parité avec l\'ancien getMonth() inline)', () => {
    expect(_loyerTodayLocal(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');   // 1er janv 0h30 local
    expect(_loyerTodayLocal(new Date(2026, 6, 8, 23, 59))).toBe('2026-07-08');
  });
});
