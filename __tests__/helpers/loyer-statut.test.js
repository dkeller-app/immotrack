import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  _loyerToleranceActive,
  _loyerTodayLocal,
  _computeLoyerChargeAlloc,
  _LOYER_TOLERANCE_JOUR
} from '../../js/core/loyer-statut.js';
import { _loyerArrearsPass } from '../../js/core/loyer-du-mois.js';
import { suiviLot, versFrise } from '../../js/core/suivi-loyers.js';

// FINANCES-SUIVI-UNIQUE P7 — loyer-statut.js ne garde que les règles PARTAGÉES : la passe FISCALE
// (_computeLoyerChargeAlloc), l'horloge locale et la tolérance du 10. Supprimés AVEC leurs tests :
// _computeLoyerStatut (13), _loyerChipVerdict (4), _loyerSoldeAjuste (4), _computeLoyerCumul (9),
// _loyerSplitCascade (9) — plus aucun appelant, les scénarios vivent dans le bloc « P6 — la frise du
// bandeau sur le moteur unique » ci-dessous. `_computeLoyerArrears` n'était qu'un appel à
// `_loyerArrearsPass(..., { carry:false })` : ses 13 tests (arriérés + cause FIFO + tolérance) visent
// désormais directement la passe (même sortie).

const flat = (m) => () => m;                       // dû constant


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


// Même appel que l'ancien wrapper supprimé : passe SANS netting (carry:false), tolérance en option.
const _computeLoyerArrears = (months, graceLast) => _loyerArrearsPass(months, { carry: false, graceLast: !!graceLast });

describe('_loyerArrearsPass { carry:false } (ex-_computeLoyerArrears) — arriérés courants + CAUSE résiduelle FIFO (retard orange, sous-ligne cliquable)', () => {
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
