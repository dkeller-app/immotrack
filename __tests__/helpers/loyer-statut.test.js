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
import { suiviLot, versFrise } from '../../js/core/suivi-loyers.js';

// SUIVI-LOYERS-SOURCE-UNIQUE Phase A — moteur pur de statut de paiement (POOL ANNUEL sans report).
// FINANCES-SUIVI-UNIQUE P6 : PLUS AUCUN ÉCRAN NE LE LIT. Le bandeau « Tous les loyers », la
// pastille _v4ComputeLotStatus et l'Accueil lisent le moteur unique (js/core/suivi-loyers.js,
// adaptateur versFrise). Le module loyer-statut.js reste en place jusqu'à P7 (sa suppression
// retirera ces tests AVEC lui) : ses tests ci-dessous valident donc l'ANCIEN contrat du module,
// pas ce que l'app affiche. Les mêmes scénarios, portés sur le moteur unique, sont dans le bloc
// « P6 — la frise du bandeau sur le moteur unique » en fin de fichier (valeurs du nouveau contrat :
// position de fin de mois, report d'une année sur l'autre, début de suivi au 1er loyer encaissé).

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
    expect(out[4]).toEqual({ loyersHC: 500, provisions: 15, avance: 0, rattrapage: 0 });    // mai : 500 loyer + 15 charges (arriéré 15)
    expect(out[5]).toEqual({ loyersHC: 570, provisions: 45, avance: 70, rattrapage: 15 });   // 15 d'arriéré de charges récupéré en juin   // juin : 500 loyer + 70 avance ; 30 courant + 15 récup
    expect(sum(out)).toEqual({ hc: 3070, prov: 180, av: 70 });               // annuel : arriéré comblé, avance 70
  });
  it('à jour → provisions pleines, 0 avance', () => {
    expect(_computeLoyerChargeAlloc([M(530), M(530)])).toEqual([
      { loyersHC: 500, provisions: 30, avance: 0, rattrapage: 0 }, { loyersHC: 500, provisions: 30, avance: 0, rattrapage: 0 }]);
  });
  it('mois impayé au milieu → AUCUN pull-back négatif (janv payé, févr 0)', () => {
    const out = _computeLoyerChargeAlloc([M(530), M(0)]);
    expect(out[0]).toEqual({ loyersHC: 500, provisions: 30, avance: 0, rattrapage: 0 });
    expect(out[1]).toEqual({ loyersHC: 0, provisions: 0, avance: 0, rattrapage: 0 });       // févr impayé, PAS de −30
  });
  it('loyer priorité : paie 500 sur 530 → 500 loyer, 0 charges (charges en arriéré)', () => {
    expect(_computeLoyerChargeAlloc([M(500)])[0]).toEqual({ loyersHC: 500, provisions: 0, avance: 0, rattrapage: 0 });
  });
  it('excédent franc : paie 545 → 500 loyer + 30 charges + 15 avance (loyersHC = 515)', () => {
    expect(_computeLoyerChargeAlloc([M(545)])[0]).toEqual({ loyersHC: 515, provisions: 30, avance: 15, rattrapage: 0 });
  });
  it('arriéré de loyer récupéré AVANT charges (loyer priorité) : janv 0, févr 1060 → tout comblé', () => {
    const out = _computeLoyerChargeAlloc([M(0), M(1060)]);
    expect(out[1]).toEqual({ loyersHC: 1000, provisions: 60, avance: 0, rattrapage: 530 });   // févr : 500 courant + 500 récup loyer, 30+30 charges
  });
  it('lot SANS bail (dû 0/0) : tout en loyer, AUCUNE avance (un arriéré n\'est pas une avance)', () => {
    expect(_computeLoyerChargeAlloc([{ hcDue: 0, chDue: 0, received: 500 }])[0]).toEqual({ loyersHC: 500, provisions: 0, avance: 0, rattrapage: 0 });
  });
  it('prorata d\'entrée : janv dû 327,50 (mi-mois), paie 327,50 → tout loyer HC, 0 charge', () => {
    expect(_computeLoyerChargeAlloc([{ hcDue: 327.5, chDue: 0, received: 327.5 }])[0]).toEqual({ loyersHC: 327.5, provisions: 0, avance: 0, rattrapage: 0 });
  });
  it('CHANGEMENT DE LOCATAIRE : un paiement sur un mois SANS dû (ancien bail non résolu) n\'est PAS une avance', () => {
    // mois 1 : ancien locataire paie 530, mais dû du mois = 0 (bail historique absent) ; mois 2 : nouveau, dû 500/30
    const out = _computeLoyerChargeAlloc([{ hcDue: 0, chDue: 0, received: 530 }, { hcDue: 500, chDue: 30, received: 530 }]);
    expect(out[0]).toEqual({ loyersHC: 530, provisions: 0, avance: 0, rattrapage: 0 });   // PAS 530 « perçu d'avance »
    expect(out[1]).toEqual({ loyersHC: 500, provisions: 30, avance: 0, rattrapage: 0 });
  });
  it('avance LÉGITIME conservée : trop-payé un mois AVEC dû actif reste une avance', () => {
    expect(_computeLoyerChargeAlloc([{ hcDue: 500, chDue: 30, received: 700 }])[0]).toEqual({ loyersHC: 670, provisions: 30, avance: 170, rattrapage: 0 });
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
  it('RÉSIDU par mois (colonnes P&L : on ne reporte pas) : chaque mois porte SON manque net, somme = annuel', () => {
    // Marion : janv-mai pleins, juin 300 (short 200/30), juil 0 (short 500/30), aucun rattrapage
    const r = _computeLoyerArrears([M(530), M(530), M(530), M(530), M(530), M(300), M(0)]);
    expect(r.retardMois.map(x => x.loyer)).toEqual([0, 0, 0, 0, 0, 200, 500]);   // PAS cumulé (running = …,200,700)
    expect(r.retardMois.map(x => x.charge)).toEqual([0, 0, 0, 0, 0, 30, 30]);
    expect(r.retardMois.reduce((s, x) => s + x.loyer, 0)).toBe(r.loyerArrear);    // invariant : Σ mois = annuel (outstanding)
    expect(r.loyerArrear).toBe(700);
  });
  it('RÉSIDU : un mois rattrapé plus tard retombe à 0 (net des rattrapages, « non encaissé » exact)', () => {
    const r = _computeLoyerArrears([M(0), M(1060)]);   // janv impayé, févr rattrape tout
    expect(r.retardMois).toEqual([{ loyer: 0, charge: 0 }, { loyer: 0, charge: 0 }]);
    expect(r.loyerArrear).toBe(0);
  });
  it('TOLÉRANCE début de mois (graceLast) : le mois COURANT impayé n\'est PAS un retard avant le 10', () => {
    const sans = _computeLoyerArrears([M(530), M(530), M(0)]);          // 3e mois (courant) impayé
    expect(sans.loyerArrear).toBe(500); expect(sans.chargeArrear).toBe(30);
    const avec = _computeLoyerArrears([M(530), M(530), M(0)], true);    // sous tolérance
    expect(avec.loyerArrear).toBe(0); expect(avec.chargeArrear).toBe(0);
    expect(avec.causeLoyer).toEqual([]); expect(avec.causeCharge).toEqual([]);
  });
  it('grace : un ARRIÉRÉ ANTÉRIEUR reste visible (seul le mois courant est neutralisé, cf constat 45)', () => {
    const avec = _computeLoyerArrears([M(0), M(0)], true);              // mois 1 arriéré, mois 2 courant impayé
    expect(avec.loyerArrear).toBe(500); expect(avec.chargeArrear).toBe(30);   // mois 1 SEULEMENT
    expect(avec.causeLoyer).toEqual([{ idx: 0, short: 500, due: 500, recv: 0 }]);
  });
  it('grace : un paiement du mois courant récupère quand même les arriérés antérieurs', () => {
    const avec = _computeLoyerArrears([M(0), M(1060)], true);           // mois 2 courant paie tout + récup mois 1
    expect(avec.loyerArrear).toBe(0); expect(avec.chargeArrear).toBe(0);
  });
});

describe('verrou : un règlement de régul ne pollue JAMAIS les loyers suivis', () => {
  // P6 : l'ancien verrou lisait le pool `isLoy(m.cat)` de _suiviLoyerStrip → _computeLoyerStatut.
  // La frise lit désormais le suivi de Finances : le filtre « loyer 211 » est celui du collecteur
  // unique (collecterPaiements, catLigne injecté = _finCatLigne dans l'app).
  it('_suiviLoyerStrip lit le suivi (versFrise), dont les paiements passent par catLigne (211 seulement)', () => {
    const src = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const i = src.indexOf('function _suiviLoyerStrip(');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n}', i));
    expect(body).toContain('_finSuiviLot(log.ref)');                // le suivi de Finances, pas un pool à part
    expect(body).toContain('SL.versFrise(');
    expect(body).not.toContain('_computeLoyerStatut');
    const j = src.indexOf('function _finSuiviLot(');
    expect(src.slice(j, src.indexOf('\n}', j))).toContain('catLigne: _finCatLigne');
    // La catégorie de règlement de régul reste hors 211 (special, ligne vide) :
    expect(src).toMatch(/nom: 'Divers \(non déductible\)',\s+ligne2044:'',\s+type:'special'/);
  });
});

// ── P6 — LES MÊMES SCÉNARIOS, PORTÉS SUR LE MOTEUR UNIQUE (frise du bandeau, versFrise) ──────────
// Une case = la POSITION DE FIN DE MOIS du lot (celle de la ligne « Avance / retard du lot » de
// Finances) ; solde = position au dernier mois exigible. Les écarts au pool annuel sont voulus et
// commentés à chaque test (décisions 05/10 et 06/10, docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §C, §I).
describe('P6 — la frise du bandeau sur le moteur unique (versFrise)', () => {
  const lot1 = (debut, hc, pays, o) => ({
    ref: 'L', bareme: [], manques: (o && o.manques) || [],
    baux: [{ cle: 'L|' + debut, debut, fin: null, finEffective: null, archive: false, hc, ch: (o && o.ch) || 0, noms: 'Loc' }],
    paiements: pays.map(([date, montant], k) => ({ id: 'p' + k, date, montant, kind: 'virement' }))
  });
  const frise = (lot, today, o) => {
    const opt = o || {};
    const grace = opt.grace != null ? opt.grace : parseInt(today.slice(8, 10), 10) < 10;
    return versFrise(suiviLot(lot, { today, graceLast: grace, seuilArrondi: 1 }), opt.year || 2026, { monthlyFull: opt.mf != null ? opt.mf : 655 });
  };
  const cls = (f) => f.months.map((m) => m.cls).join(',');
  const mensuel = (debutYm, n, montant, jour) => Array.from({ length: n }, (_, k) => {
    let y = parseInt(debutYm.slice(0, 4), 10), m = parseInt(debutYm.slice(5, 7), 10) + k;
    while (m > 12) { m -= 12; y++; }
    return [y + '-' + String(m).padStart(2, '0') + '-' + (jour || '05'), montant];
  });

  it('2 mois payés en janvier, on est en février : janvier en AVANCE (+655 fin janvier), février soldé, solde 0', () => {
    // Pool annuel : « janvier ok, février ok ». Position de fin de mois : fin janvier le locataire a
    // 655 € d'avance (la case de Finances vaut +655), consommés en février.
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 1310]]), '2026-02-20');
    expect(f.curMo).toBe(2);
    expect(cls(f)).toBe('avance,ok,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir,avenir');
    expect(f.months[0].solde).toBe(655);
    expect(f.solde).toBe(0);
    expect(f.months[1].recu).toBe(0);              // argent DATÉ du mois (février n'a reçu aucun virement)
  });

  it('avance visible fin janvier : février (non échu) couvert → « avance », solde +655', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 1310]]), '2026-01-31');
    expect(f.curMo).toBe(1);
    expect(f.months[0].cls).toBe('avance');
    expect(f.months[1].cls).toBe('avance');        // mois FUTUR pré-payé
    expect(f.months[2].cls).toBe('avenir');
    expect(f.solde).toBe(655);
    expect(f.avance).toBe(655);
    expect(f.retard).toBe(0);
    expect(f.attendu).toBe(655);                   // seul janvier est échu
  });

  it('retard : 4 mois payés sur 7 échus → mai/juin/juillet impayés, solde −1 350', () => {
    const f = frise(lot1('2026-01-01', 450, mensuel('2026-01', 4, 450)), '2026-07-15', { mf: 450 });
    expect(cls(f)).toBe('ok,ok,ok,ok,imp,imp,imp,avenir,avenir,avenir,avenir,avenir');
    expect(f.months.slice(4, 7).map((m) => m.retard)).toEqual([450, 900, 1350]);   // position cumulée
    expect(f.solde).toBe(-1350);
    expect(f.attendu).toBe(3150);
    expect(f.recu).toBe(1800);
  });

  it('1 seul mois payé (janvier) sur 3 échus → janvier ok, février/mars impayés', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 655]]), '2026-03-20');
    expect(cls(f).slice(0, 14)).toBe('ok,imp,imp,ave');
  });

  it('début de suivi au 1er loyer encaissé (décision 05/10 b) : un bail de janvier payé à partir de mars → janvier/février « avant le suivi »', () => {
    // Pool annuel : janvier ok (le virement de mars comblait le plus vieux mois), février/mars impayés.
    const f = frise(lot1('2026-01-01', 655, [['2026-03-05', 655]]), '2026-03-20');
    expect(f.months.slice(0, 3).map((m) => m.cls)).toEqual(['vac', 'vac', 'ok']);
    expect(f.months[0].horsSuivi).toBe(true);
    expect(f.solde).toBe(0);
  });

  it('paiement partiel → « warn », le reçu du mois et le reste dû', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-12', 400]]), '2026-01-20');
    expect(f.months[0].cls).toBe('warn');
    expect(f.months[0].recu).toBe(400);
    expect(f.months[0].retard).toBe(255);
    expect(f.solde).toBe(-255);
  });

  it('prorata d\'entrée en cours de mois : le dû de janvier est proraté, payé pile → ok', () => {
    const s = suiviLot(lot1('2026-01-16', 655, []), { today: '2026-01-20', seuilArrondi: 1 });
    const duJanv = s.baux[0].mois[0].du.total;
    expect(duJanv).toBeLessThan(655);
    const f = frise(lot1('2026-01-16', 655, [['2026-01-17', duJanv], ['2026-02-03', 655]]), '2026-02-15');
    expect(f.months[0].cls).toBe('ok');
    expect(f.months[0].attendu).toBe(duJanv);
    expect(f.months[1].cls).toBe('ok');
    expect(f.solde).toBe(0);
  });

  it('mois sans bail → « vac » (hors bail, pas « avant le suivi »), exclus de l\'attendu', () => {
    const f = frise(lot1('2026-04-01', 655, [['2026-04-05', 655], ['2026-05-05', 655]]), '2026-06-15');
    expect(f.months.slice(0, 6).map((m) => m.cls)).toEqual(['vac', 'vac', 'vac', 'ok', 'ok', 'imp']);
    expect(f.months[0].horsSuivi).toBeUndefined();
    expect(f.attendu).toBe(1965);                  // avril+mai+juin seulement
    expect(f.solde).toBe(-655);
  });

  it('année passée : les 12 mois sont échus (curMo = 12)', () => {
    const f = frise(lot1('2025-01-01', 655, mensuel('2025-01', 12, 655)), '2026-07-15', { year: 2025 });
    expect(f.curMo).toBe(12);
    expect(f.months.every((m) => m.cls === 'ok')).toBe(true);
    expect(f.solde).toBe(0);
  });

  it('année future : curMo = 0, tout « avenir » (rien d\'échu, rien de dû)', () => {
    const f = frise(lot1('2026-01-01', 655, mensuel('2026-01', 7, 655)), '2026-07-15', { year: 2027 });
    expect(f.curMo).toBe(0);
    expect(f.months.every((m) => m.cls === 'avenir')).toBe(true);
    expect(f.attendu).toBe(0);
  });

  it('loyer de référence nul : mois futurs « vac »', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 655]]), '2026-01-15', { mf: 0 });
    expect(f.months[0].cls).toBe('ok');
    expect(f.months[1].cls).toBe('vac');
  });

  it('mois futur PARTIELLEMENT couvert → « avenir » (pas « avance »)', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 955]]), '2026-01-31');
    expect(f.months[0].cls).toBe('avance');        // +300 fin janvier
    expect(f.months[1].cls).toBe('avenir');        // 300 / 655 : pas couvert
  });

  it('arrondis à 2 décimales', () => {
    const f = frise(lot1('2026-01-01', 655.33, [['2026-01-05', 1000.01]]), '2026-02-12', { mf: 655.33 });
    f.months.forEach((m) => {
      for (const k of ['recu', 'attendu', 'retard', 'avance', 'solde']) expect(m[k]).toBe(Math.round(m[k] * 100) / 100);
    });
    expect(f.solde).toBe(Math.round(f.solde * 100) / 100);
  });

  // ── l'ancien _loyerSoldeAjuste : la tolérance du 10 est dans le suivi (graceLast) ──
  it('tolérance avant le 10 : le loyer du mois courant non payé n\'est pas un retard (case « à venir »)', () => {
    const f = frise(lot1('2026-01-01', 655, mensuel('2026-01', 6, 655)), '2026-07-07');
    expect(f.months[6].cls).toBe('avenir');
    expect(f.months[6].tolerance).toBe(true);
    expect(f.solde).toBe(0);
  });
  it('tolérance avant le 10 : les VRAIS arriérés des mois précédents restent visibles', () => {
    const f = frise(lot1('2026-01-01', 655, mensuel('2026-01', 5, 655)), '2026-07-07');
    expect(f.months[5].cls).toBe('imp');           // juin
    expect(f.solde).toBe(-655);                    // juillet neutralisé, juin reste
  });
  it('à partir du 10 : le mois courant non payé est en retard', () => {
    const f = frise(lot1('2026-01-01', 655, mensuel('2026-01', 6, 655)), '2026-07-15');
    expect(f.months[6].cls).toBe('imp');
    expect(f.solde).toBe(-655);
  });

  // ── l'ancien _computeLoyerCumul : la position traverse les années (fin du pool annuel) ──
  it('REPORT d\'une année sur l\'autre : la dette de décembre 2025 reste due en 2026 (le pool annuel la perdait)', () => {
    const f = frise(lot1('2025-01-01', 655, mensuel('2025-01', 11, 655).concat(mensuel('2026-01', 6, 655))), '2026-06-15');
    expect(f.months.slice(0, 6).map((m) => m.cls)).toEqual(['warn', 'warn', 'warn', 'warn', 'warn', 'warn']);   // mois payés, dette ancienne
    expect(f.months[0].retard).toBe(655);
    expect(f.solde).toBe(-655);
    expect(f.retard).toBe(655);
  });
  it('avance de l\'année précédente : consommée en janvier', () => {
    const f = frise(lot1('2025-06-01', 655, mensuel('2025-06', 7, 655).concat([['2025-12-20', 655]])), '2026-01-15');
    expect(f.months[0].cls).toBe('ok');
    expect(f.solde).toBe(0);
  });
  it('anti-fantôme : un bail de 2018 suivi depuis le 1er loyer encaissé (2026-01) n\'invente aucune dette', () => {
    const f = frise(lot1('2018-03-01', 655, mensuel('2026-01', 3, 655)), '2026-03-20');
    expect(f.solde).toBe(0);
    expect(f.months.slice(0, 3).map((m) => m.cls)).toEqual(['ok', 'ok', 'ok']);
  });
  it('jamais retard ET avance sur un bail le même mois', () => {
    const f = frise(lot1('2026-01-01', 655, [['2026-01-05', 1310], ['2026-04-05', 100]]), '2026-05-15');
    f.months.forEach((m) => expect(m.retard > 0.005 && m.avance > 0.005).toBe(false));
  });
  it('manque accepté : le mois soldé par la remise est « ok », plus de dette', () => {
    const sans = frise(lot1('2026-01-01', 760, [['2026-01-05', 780], ['2026-02-05', 760], ['2026-03-05', 780]], { ch: 20 }), '2026-03-15', { mf: 780 });
    expect(sans.months.slice(0, 3).map((m) => m.cls)).toEqual(['ok', 'warn', 'warn']);
    expect(sans.solde).toBe(-20);
    const avec = frise(lot1('2026-01-01', 760, [['2026-01-05', 780], ['2026-02-05', 760], ['2026-03-05', 780]],
      { ch: 20, manques: [{ id: 'm1', bailCle: 'L|2026-01-01', ym: '2026-02', montant: 20, motif: 'geste', date: '2026-02-06' }] }), '2026-03-15', { mf: 780 });
    expect(avec.months.slice(0, 3).map((m) => m.cls)).toEqual(['ok', 'ok', 'ok']);
    expect(avec.solde).toBe(0);
  });
});
