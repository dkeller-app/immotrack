import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  _computeLoyerStatut,
  _loyerChipVerdict,
  _loyerToleranceActive,
  _loyerTodayLocal,
  _loyerSoldeAjuste,
  _computeLoyerCumul,
  _computeLoyerChargeAlloc,
  _computeLoyerArrears,
  _loyerSplitCascade,
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

describe('_loyerSoldeAjuste — tolérance = SEUL le mois courant est neutralisé (constat 45)', () => {
  it('avant le 10 : le loyer du mois courant non payé ne compte pas comme retard', () => {
    const s = strip({ today: '2026-07-07', totalPaid: 655 * 6 });   // 6 payés / 7 échus (juillet manque)
    expect(s.solde).toBe(-655);
    expect(_loyerSoldeAjuste(s, '2026-07-07')).toBe(0);             // juillet neutralisé
    expect(_loyerChipVerdict(_loyerSoldeAjuste(s, '2026-07-07'), 655).cls).toBe('ajour');
  });
  it('avant le 10 : les VRAIS arriérés des mois précédents restent visibles', () => {
    const s = strip({ today: '2026-07-07', totalPaid: 655 * 5 });   // mai/juin/juillet manquent
    expect(_loyerSoldeAjuste(s, '2026-07-07')).toBe(-655);          // juillet neutralisé, juin reste
    expect(_loyerChipVerdict(-655, 655).cls).toBe('retard');
  });
  it('à partir du 10 : solde inchangé', () => {
    const s = strip({ today: '2026-07-15', totalPaid: 655 * 6 });
    expect(_loyerSoldeAjuste(s, '2026-07-15')).toBe(-655);
  });
  it('autre année que celle du statut : solde inchangé (pas de neutralisation rétroactive)', () => {
    const s = strip({ year: 2025, today: '2026-07-07', totalPaid: 655 * 11 });
    expect(_loyerSoldeAjuste(s, '2026-07-07')).toBe(s.solde);
  });
});

describe('_computeLoyerCumul — position cumulée signée, bornée au suivi (Phase D-matrice, anti −63050)', () => {
  const due = () => 655;
  it('à jour : encaissé = dû sur la période → cumul 0', () => {
    const c = _computeLoyerCumul({ startYm: '2025-01', endYm: '2026-07', dueOfMonth: due, totalPaid: 655 * 19 });
    expect(c.cumul).toBe(0); expect(c.months).toBe(19); expect(c.tracked).toBe(true);
  });
  it('retard : cumul négatif (7 dus, 5 payés)', () => {
    expect(_computeLoyerCumul({ startYm: '2026-01', endYm: '2026-07', dueOfMonth: due, totalPaid: 655 * 5 }).cumul).toBe(-1310);
  });
  it('avance : cumul positif', () => {
    expect(_computeLoyerCumul({ startYm: '2026-06', endYm: '2026-06', dueOfMonth: due, totalPaid: 1310 }).cumul).toBe(655);
  });
  it('BORNE anti-fantôme : ne compte AUCUN mois avant startYm (bail 2018, suivi depuis 2026-01)', () => {
    const c = _computeLoyerCumul({ startYm: '2026-01', endYm: '2026-03', dueOfMonth: due, totalPaid: 655 * 3 });
    expect(c.cumul).toBe(0); expect(c.months).toBe(3);   // 3 mois, pas 8 ans → plus de −63050
  });
  it('dû du bail de l\'époque via dueOfMonth (IRL + prorata entrée), pas un loyer constant', () => {
    const dyn = (ym) => ym === '2026-06' ? 655.05 : (ym === '2026-01' ? 327.5 : 650);
    const c = _computeLoyerCumul({ startYm: '2026-01', endYm: '2026-06', dueOfMonth: dyn, totalPaid: 327.5 + 650 * 4 + 655.05 });
    expect(c.cumul).toBe(0);
  });
  it('startYm vide/invalide → non suivi (tracked false, cumul 0)', () => {
    expect(_computeLoyerCumul({ startYm: '', endYm: '2026-07', dueOfMonth: due, totalPaid: 0 })).toEqual({ cumul: 0, sumDue: 0, months: 0, tracked: false });
  });
  it('endYm < startYm (bail futur) → 0 mois, cumul 0', () => {
    const c = _computeLoyerCumul({ startYm: '2026-08', endYm: '2026-07', dueOfMonth: due, totalPaid: 0 });
    expect(c.months).toBe(0); expect(c.cumul).toBe(0); expect(c.tracked).toBe(true);
  });
  it('traverse une frontière d\'année (2025-11 → 2026-02 = 4 mois)', () => {
    expect(_computeLoyerCumul({ startYm: '2025-11', endYm: '2026-02', dueOfMonth: due, totalPaid: 0 }).months).toBe(4);
  });
  it('le chip du cumul réutilise _loyerChipVerdict (avance/retard/à jour)', () => {
    expect(_loyerChipVerdict(_computeLoyerCumul({ startYm: '2026-01', endYm: '2026-07', dueOfMonth: due, totalPaid: 655 * 5 }).cumul, 655).cls).toBe('retard');
    expect(_loyerChipVerdict(_computeLoyerCumul({ startYm: '2026-06', endYm: '2026-06', dueOfMonth: due, totalPaid: 1310 }).cumul, 655).cls).toBe('avance');
  });
});

describe('_loyerSplitCascade — loyer → charges → avance (remplace le ratio, décision user 2026-07-09)', () => {
  it('mois complet payé pile (530, hc 500 ch 30) → 500 loyer + 30 charges, 0 avance', () => {
    expect(_loyerSplitCascade(530, 500, 30)).toEqual({ hc: 500, provisions: 30, avance: 0 });
  });
  it('partiel (515) → loyer prioritaire : 500 loyer + 15 charges (15 encore dues), 0 avance', () => {
    expect(_loyerSplitCascade(515, 500, 30)).toEqual({ hc: 500, provisions: 15, avance: 0 });
  });
  it('excédent (615) → 500 loyer + 30 charges + 85 d\'avance ; hc inclut l\'avance = 585', () => {
    expect(_loyerSplitCascade(615, 500, 30)).toEqual({ hc: 585, provisions: 30, avance: 85 });
  });
  it('paiement < loyer (300) → tout en loyer, 0 charges', () => {
    expect(_loyerSplitCascade(300, 500, 30)).toEqual({ hc: 300, provisions: 0, avance: 0 });
  });
  it('invariant hc + provisions = payé (pour payé > 0)', () => {
    for (const p of [200, 515, 530, 615, 999.99]) {
      const s = _loyerSplitCascade(p, 500, 30);
      expect(Math.round((s.hc + s.provisions) * 100) / 100).toBe(Math.round(p * 100) / 100);
    }
  });
  it('sans charges connues (ch 0) → tout au loyer, l\'excédent au-delà du HC = avance', () => {
    expect(_loyerSplitCascade(615, 500, 0)).toEqual({ hc: 615, provisions: 0, avance: 115 });
  });
  it('remboursement / arriéré négatif → imputé au loyer, pas de provisions négatives', () => {
    expect(_loyerSplitCascade(-100, 500, 30)).toEqual({ hc: -100, provisions: 0, avance: 0 });
  });
  it('prorata entrée mi-mois (hc 250, ch 15) — pas de règle spéciale, le HC/CH est déjà proratisé', () => {
    expect(_loyerSplitCascade(265, 250, 15)).toEqual({ hc: 250, provisions: 15, avance: 0 });
    expect(_loyerSplitCascade(200, 250, 15)).toEqual({ hc: 200, provisions: 0, avance: 0 });
  });
  it('scénario table Finances : mai 515 + juin 615 → provisions 15+30=45, avance 85, loyer 500+585=1085', () => {
    const mai = _loyerSplitCascade(515, 500, 30);
    const juin = _loyerSplitCascade(615, 500, 30);
    expect(mai.provisions + juin.provisions).toBe(45);
    expect(mai.avance + juin.avance).toBe(85);
    expect(mai.hc + juin.hc).toBe(1085);
  });
});

describe('_computeLoyerChargeAlloc — cascade CUMULATIVE, dettes avant avance (correction user 2026-07-09)', () => {
  const M = (received, hcDue = 500, chDue = 30) => ({ hcDue, chDue, received });
  const sum = (out) => out.reduce((a, b) => ({ hc: a.hc + b.loyersHC, prov: a.prov + b.provisions, av: a.av + b.avance }), { hc: 0, prov: 0, av: 0 });
  it('SCÉNARIO USER : mai partiel 515, juin 615 → juin récupère les 15 d\'arriéré, avance 70 (PAS 85)', () => {
    const out = _computeLoyerChargeAlloc([M(530), M(530), M(530), M(530), M(515), M(615)]);
    expect(out[4]).toEqual({ loyersHC: 500, provisions: 15, avance: 0 });    // mai : 500 loyer + 15 charges (arriéré 15)
    expect(out[5]).toEqual({ loyersHC: 570, provisions: 45, avance: 70 });   // juin : 500 loyer + 70 avance ; 30 courant + 15 récup
    expect(sum(out)).toEqual({ hc: 3070, prov: 180, av: 70 });               // annuel : arriéré comblé, avance 70
  });
  it('à jour → provisions pleines, 0 avance', () => {
    expect(_computeLoyerChargeAlloc([M(530), M(530)])).toEqual([
      { loyersHC: 500, provisions: 30, avance: 0 }, { loyersHC: 500, provisions: 30, avance: 0 }]);
  });
  it('mois impayé au milieu → AUCUN pull-back négatif (janv payé, févr 0)', () => {
    const out = _computeLoyerChargeAlloc([M(530), M(0)]);
    expect(out[0]).toEqual({ loyersHC: 500, provisions: 30, avance: 0 });
    expect(out[1]).toEqual({ loyersHC: 0, provisions: 0, avance: 0 });       // févr impayé, PAS de −30
  });
  it('loyer priorité : paie 500 sur 530 → 500 loyer, 0 charges (charges en arriéré)', () => {
    expect(_computeLoyerChargeAlloc([M(500)])[0]).toEqual({ loyersHC: 500, provisions: 0, avance: 0 });
  });
  it('excédent franc : paie 545 → 500 loyer + 30 charges + 15 avance (loyersHC = 515)', () => {
    expect(_computeLoyerChargeAlloc([M(545)])[0]).toEqual({ loyersHC: 515, provisions: 30, avance: 15 });
  });
  it('arriéré de loyer récupéré AVANT charges (loyer priorité) : janv 0, févr 1060 → tout comblé', () => {
    const out = _computeLoyerChargeAlloc([M(0), M(1060)]);
    expect(out[1]).toEqual({ loyersHC: 1000, provisions: 60, avance: 0 });   // févr : 500 courant + 500 récup loyer, 30+30 charges
  });
  it('lot SANS bail (dû 0/0) : tout en loyer, AUCUNE avance (un arriéré n\'est pas une avance)', () => {
    expect(_computeLoyerChargeAlloc([{ hcDue: 0, chDue: 0, received: 500 }])[0]).toEqual({ loyersHC: 500, provisions: 0, avance: 0 });
  });
  it('prorata d\'entrée : janv dû 327,50 (mi-mois), paie 327,50 → tout loyer HC, 0 charge', () => {
    expect(_computeLoyerChargeAlloc([{ hcDue: 327.5, chDue: 0, received: 327.5 }])[0]).toEqual({ loyersHC: 327.5, provisions: 0, avance: 0 });
  });
});

describe('_computeLoyerArrears — arriérés courants + CAUSE résiduelle FIFO (retard orange, sous-ligne cliquable)', () => {
  const M = (received, hcDue = 500, chDue = 30) => ({ hcDue, chDue, received });
  it('SCÉNARIO Marion : janv→mai 530, juin 300, juil 0 → retard loyer 700 + charges 60', () => {
    const r = _computeLoyerArrears([M(530), M(530), M(530), M(530), M(530), M(300), M(0)]);
    expect(r.loyerArrear).toBe(700);
    expect(r.chargeArrear).toBe(60);
    // cause résiduelle : les mois encore dus (somme = arriéré affiché)
    expect(r.causeLoyer).toEqual([{ idx: 5, short: 200, due: 500, recv: 300 }, { idx: 6, short: 500, due: 500, recv: 0 }]);
    expect(r.causeCharge).toEqual([{ idx: 5, short: 30, due: 30, recv: 300 }, { idx: 6, short: 30, due: 30, recv: 0 }]);
    expect(r.causeLoyer.reduce((s, e) => s + e.short, 0)).toBe(r.loyerArrear);   // invariant drill = sous-ligne
  });
  it('à jour → aucun arriéré, cause vide', () => {
    const r = _computeLoyerArrears([M(530), M(530)]);
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.causeLoyer).toEqual([]);
    expect(r.causeCharge).toEqual([]);
  });
  it('récupération PARTIELLE FIFO : janv 0, févr 800 → le plus vieux mois se solde d\'abord (loyer 230 restant)', () => {
    const r = _computeLoyerArrears([M(0), M(800)]);
    // févr : 500 loyer courant + 30 charges courant, reste 270 → récupère 270 sur janv loyer (500→230)
    expect(r.loyerArrear).toBe(230);
    expect(r.chargeArrear).toBe(30);
    expect(r.causeLoyer).toEqual([{ idx: 0, short: 230, due: 500, recv: 0 }]);   // seul janv reste, montant RÉSIDUEL
    expect(r.causeCharge).toEqual([{ idx: 0, short: 30, due: 30, recv: 0 }]);
  });
  it('récupération TOTALE : janv 0, févr 1060 → tout comblé, cause vide', () => {
    const r = _computeLoyerArrears([M(0), M(1060)]);
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.causeLoyer).toEqual([]);
    expect(r.causeCharge).toEqual([]);
  });
  it('lot SANS bail (dû 0/0) : jamais d\'arriéré (un impayé sans dû n\'existe pas)', () => {
    const r = _computeLoyerArrears([{ hcDue: 0, chDue: 0, received: 0 }, { hcDue: 0, chDue: 0, received: 0 }]);
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.causeLoyer).toEqual([]);
  });
  it('arriérés COURANTS par mois (running) : suivent la dette au fil de l\'eau', () => {
    const r = _computeLoyerArrears([M(530), M(300), M(0)]);
    expect(r.months.map(m => m.loyerArrear)).toEqual([0, 200, 700]);
    expect(r.months.map(m => m.chargeArrear)).toEqual([0, 30, 60]);
  });
});

describe('verrou : un règlement de régul ne pollue JAMAIS le pool loyers', () => {
  it('le wrapper _suiviLoyerStrip filtre par _isLoyerCategory (211 seulement) — un mouvement « Divers (non déductible) » est exclu', () => {
    const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const i = src.indexOf('function _suiviLoyerStrip(');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n}', i));
    expect(body).toContain('isLoy(m.cat)');                        // le pool ne prend que les loyers 211
    expect(body).toContain('_computeLoyerStatut');                 // et délègue bien au moteur unique
    // La catégorie de règlement de régul reste hors 211 (special, ligne vide) :
    expect(src).toMatch(/nom: 'Divers \(non déductible\)',\s+ligne2044:'',\s+type:'special'/);
  });
});
