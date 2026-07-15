import { describe, it, expect } from 'vitest';
import {
  duMois,
  _baremeOfLot,
  _debutSuivi,
  _computeLoyerNetting
} from '../../js/core/loyer-du-mois.js';
import { _computeLoyerArrears } from '../../js/core/loyer-statut.js';

// AUDIT-SUIVI-LOYERS étape 1 (2026-07-15) — LE résolveur unique du dû d'un mois.
// Chaque CAS reprend le harness de repro `_import/repro-audit-suivi-loyers.mjs`
// (audit docs/subjects/AUDIT-SUIVI-LOYERS-2026-07-14.md) mais encode le comportement
// ATTENDU (décisions actées 14/07), pas le comportement bugué reproduit :
//   - le dû d'un mois QUITTANCÉ = la quittance émise, figée (B3) ;
//   - sinon le barème historisé (périodes datées — une révision IRL porte une date
//     d'effet EXPLICITE, jamais rétroactive : Q1) ;
//   - occupation par baux avec finEffective prioritaire, tacite reconduction (C7),
//     chevauchements tronqués (C4/CAS 5), tombstones filtrés (C10), prorata jours ;
//   - netting avance↔retard : une avance couvre les mois suivants AVANT de laisser
//     naître un retard (C2/CAS 6 — fin des retard+avance simultanés).

// ── Fixtures : le lot de Fric (bail nu au 1er mars 2024, 500 HC + 50 ch) ────────
const BAIL_FRIC = { debut: '2024-03-01', fin: null, hc: 505.15, ch: 50 }; // hc courant muté par applyIRL
const BAREME_FRIC = [
  { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, source: 'bail' },
  { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 50, source: 'irl' }
];
const ctxFric = (over) => Object.assign({
  ref: 'F-001', bails: [BAIL_FRIC], bareme: BAREME_FRIC, quittances: []
}, over);

describe('CAS 0 — témoin : barème constant, bail ouvert', () => {
  const ctx = ctxFric({ bareme: [{ ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50 }], bails: [{ debut: '2024-03-01', fin: null, hc: 500, ch: 50 }] });
  it('tous les mois échus 2026 = 550 € (500 HC + 50 ch)', () => {
    for (const ym of ['2026-01', '2026-02', '2026-03', '2026-06', '2026-07']) {
      const d = duMois(ctx, ym);
      expect(d.hc).toBe(500);
      expect(d.ch).toBe(50);
      expect(d.total).toBe(550);
      expect(d.source).toBe('bareme');
    }
  });
  it('mois avant le début du bail = vacance (dû 0)', () => {
    const d = duMois(ctx, '2024-02');
    expect(d.total).toBe(0);
    expect(d.source).toBe('vacance');
  });
});

describe('CAS 1 — IRL validée en retard : la date d\'effet EXPLICITE du barème fait foi (Q1, jamais rétroactif)', () => {
  // IRL +1,03 % validée le 20 juin 2026 → effet au 1er juillet (1er du mois suivant
  // la validation, règle Q1). Le barème porte cette date. mars→juin restent à 550.
  const ctx = ctxFric();
  it('mars à juin 2026 : dû = 550 € (ancien loyer — AUCUNE réécriture du passé)', () => {
    for (const ym of ['2026-03', '2026-04', '2026-05', '2026-06']) {
      expect(duMois(ctx, ym).total).toBe(550);
    }
  });
  it('juillet 2026 : dû = 555.15 € (le loyer révisé, à sa date d\'effet)', () => {
    const d = duMois(ctx, '2026-07');
    expect(d.hc).toBe(505.15);
    expect(d.total).toBe(555.15);
  });
  it('le hc COURANT du bail (505.15, muté par applyIRL) n\'influence PAS les mois passés', () => {
    expect(duMois(ctx, '2026-03').hc).toBe(500);
  });
});

describe('B3 — le dû d\'un mois QUITTANCÉ = la quittance émise, figée', () => {
  it('quittance mars à 550 + barème (cassé) disant 555.15 depuis mars → mars = 550, source quittance', () => {
    const ctx = ctxFric({
      bareme: [{ ref: 'F-001', debut: '2024-03-01', fin: null, hc: 505.15, ch: 50 }], // données cassées : rétroactif
      quittances: [{ ym: '2026-03', hc: 500, ch: 50 }]
    });
    const d = duMois(ctx, '2026-03');
    expect(d.hc).toBe(500);
    expect(d.ch).toBe(50);
    expect(d.total).toBe(550);
    expect(d.source).toBe('quittance');
    // le mois suivant, non quittancé, suit le barème (cassé → 555.15) : la quittance
    // est la SEULE mémoire tant que la migration (étape 3) n'a pas reconstruit le barème
    expect(duMois(ctx, '2026-04').total).toBe(555.15);
  });
  it('quittance tombstonée (_deleted) ignorée', () => {
    const ctx = ctxFric({ quittances: [{ ym: '2026-03', hc: 111, ch: 11, _deleted: true }] });
    expect(duMois(ctx, '2026-03').total).toBe(550);
  });
  it('deux quittances vivantes sur le même mois → la DERNIÈRE de la collection gagne (append-only : la plus récente)', () => {
    const ctx = ctxFric({ quittances: [{ ym: '2026-03', hc: 500, ch: 50 }, { ym: '2026-03', hc: 505, ch: 50 }] });
    expect(duMois(ctx, '2026-03').total).toBe(555);
  });
});

describe('CAS 2 — barème absent (historique effacé) : repli bail courant, quittances protègent le passé', () => {
  const ctx = ctxFric({
    bareme: [],
    quittances: [{ ym: '2026-01', hc: 500, ch: 50 }, { ym: '2026-02', hc: 500, ch: 50 }]
  });
  it('mois quittancés : figés à 550', () => {
    expect(duMois(ctx, '2026-01').total).toBe(550);
    expect(duMois(ctx, '2026-02').source).toBe('quittance');
  });
  it('mois non quittancé : repli hc/ch du bail (555.15), source "bail"', () => {
    const d = duMois(ctx, '2026-03');
    expect(d.total).toBe(555.15);
    expect(d.source).toBe('bail');
  });
});

describe('CAS 3 — _baremeOfLot : ref TOLÉRANTE + tombstones filtrés + tri par début', () => {
  it('" f-001 " matche F-001 ; _deleted et autres lots exclus ; trié', () => {
    const periods = _baremeOfLot([
      { ref: 'AUTRE', debut: '2020-01-01', hc: 1 },
      { ref: 'F-001', debut: '2026-07-01', hc: 505.15, _deleted: true },
      { ref: ' f-001 ', debut: '2026-07-01', hc: 505.15 },
      { ref: 'F-001 ', debut: '2024-03-01', hc: 500 }
    ], 'F-001');
    expect(periods.length).toBe(2);
    expect(periods[0].debut).toBe('2024-03-01');
    expect(periods[1].hc).toBe(505.15);
  });
  it('duMois rattache le barème malgré la ref désynchronisée', () => {
    const ctx = ctxFric({ bareme: BAREME_FRIC.map(p => ({ ...p, ref: ' f-001 ' })) });
    expect(duMois(ctx, '2026-03').total).toBe(550);
  });
});

describe('CAS 4 — re-bail propre : ancien bail clos, vacance, nouveau bail', () => {
  const ctx = {
    ref: 'F-002',
    bails: [
      { debut: '2023-05-01', fin: '2026-01-31', archive: true, hc: 480, ch: 45 },
      { debut: '2026-03-01', fin: null, hc: 520, ch: 50 }
    ],
    bareme: [], quittances: []
  };
  it('janvier = 525 € (ancien bail, hc figé) · février = 0 (vacance) · mars = 570 € (nouveau)', () => {
    expect(duMois(ctx, '2026-01').total).toBe(525);
    expect(duMois(ctx, '2026-02').total).toBe(0);
    expect(duMois(ctx, '2026-02').source).toBe('vacance');
    expect(duMois(ctx, '2026-03').total).toBe(570);
  });
});

describe('CAS 5 — baux CHEVAUCHANTS (archivé sans clôture) : troncature défensive, JAMAIS de dû doublé', () => {
  const ctx = {
    ref: 'F-002',
    bails: [
      { debut: '2023-05-01', fin: '2026-04-30', archive: true, hc: 480, ch: 45 },  // fin contractuelle future
      { debut: '2026-02-01', fin: null, hc: 520, ch: 50 }                          // nouveau bail
    ],
    bareme: [], quittances: []
  };
  it('l\'ancien bail est tronqué à la veille du nouveau : févr/mars/avr = 570 €, pas 1 095 €', () => {
    expect(duMois(ctx, '2026-01').total).toBe(525);   // ancien seul
    expect(duMois(ctx, '2026-02').total).toBe(570);   // nouveau seul (ancien tronqué au 31/01)
    expect(duMois(ctx, '2026-03').total).toBe(570);
    expect(duMois(ctx, '2026-04').total).toBe(570);
  });
});

describe('C7 — tacite reconduction : bail courant non clôturé, fin contractuelle passée → le dû CONTINUE', () => {
  it('fin papier 2025-04-30 dépassée, pas de finEffective → mars 2026 dû = 550', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2023-05-01', fin: '2025-04-30', hc: 500, ch: 50 }],
      bareme: [], quittances: []
    };
    expect(duMois(ctx, '2026-03').total).toBe(550);
  });
  it('finEffective posée (clôture) → prorata le mois de sortie, 0 ensuite', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, finEffective: '2026-03-15', hc: 500, ch: 50 }],
      bareme: [], quittances: []
    };
    const mars = duMois(ctx, '2026-03');
    expect(mars.hc).toBe(241.94);                    // 500 × 15/31
    expect(mars.ch).toBe(24.19);                     // 50 × 15/31
    expect(duMois(ctx, '2026-04').total).toBe(0);
  });
});

describe('Occupation — prorata, tombstones, changement de barème mi-mois', () => {
  it('entrée le 10 mars → 22/31 du loyer', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2026-03-10', fin: null, hc: 500, ch: 50 }],
      bareme: [{ ref: 'L-1', debut: '2026-03-10', fin: null, hc: 500, ch: 50 }], quittances: []
    };
    const d = duMois(ctx, '2026-03');
    expect(d.hc).toBe(354.84);                       // 500 × 22/31
    expect(d.ch).toBe(35.48);
  });
  it('bail tombstoné (_deleted) ignoré (C10)', () => {
    const ctx = {
      ref: 'L-1',
      bails: [
        { debut: '2020-01-01', fin: null, hc: 999, ch: 99, _deleted: true },
        { debut: '2026-01-01', fin: null, hc: 500, ch: 50 }
      ],
      bareme: [], quittances: []
    };
    expect(duMois(ctx, '2026-02').total).toBe(550);
    expect(duMois(ctx, '2025-06').total).toBe(0);    // le tombstone ne crée PAS d'occupation
  });
  it('changement de barème mi-mois (correction manuelle) : sous-segments proratisés', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 600, ch: 50 }],
      bareme: [
        { ref: 'L-1', debut: '2024-01-01', fin: '2026-03-15', hc: 500, ch: 50 },
        { ref: 'L-1', debut: '2026-03-16', fin: null, hc: 600, ch: 50 }
      ], quittances: []
    };
    const d = duMois(ctx, '2026-03');
    expect(d.hc).toBe(551.61);                       // 500×15/31 + 600×16/31
    expect(d.ch).toBe(50);
  });
  it('période de barème sans hc → repli hc du bail (symétrique du repli ch)', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 500, ch: 50 }],
      bareme: [{ ref: 'L-1', debut: '2024-01-01', fin: null, ch: 60 }], quittances: []
    };
    const d = duMois(ctx, '2026-03');
    expect(d.hc).toBe(500);                          // repli bail
    expect(d.ch).toBe(60);                           // barème
  });
  it('TROU entre deux périodes de barème → repli bail (une période ancienne ne déborde pas)', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2020-01-01', fin: null, hc: 777, ch: 0 }],
      bareme: [
        { ref: 'L-1', debut: '2024-01-01', fin: '2024-12-31', hc: 500, ch: 0 },
        { ref: 'L-1', debut: '2026-01-01', fin: null, hc: 600, ch: 0 }
      ], quittances: []
    };
    expect(duMois(ctx, '2025-06').hc).toBe(777);
    expect(duMois(ctx, '2024-06').hc).toBe(500);
    expect(duMois(ctx, '2026-02').hc).toBe(600);
  });
  it('trou INTRA-mois entre périodes : barème × repli × barème proratisés', () => {
    const ctx = {
      ref: 'L-1', bails: [{ debut: '2024-01-01', fin: null, hc: 555, ch: 50 }],
      bareme: [
        { ref: 'L-1', debut: '2024-01-01', fin: '2026-03-10', hc: 500, ch: 50 },
        { ref: 'L-1', debut: '2026-03-20', fin: null, hc: 600, ch: 50 }
      ], quittances: []
    };
    const d = duMois(ctx, '2026-03');
    expect(d.hc).toBe(554.68);                       // (500×10 + 555×9 + 600×12) / 31
    expect(d.ch).toBe(50);
  });
  it('année bissextile : entrée le 15 février 2024 → 15/29', () => {
    const ctx = { ref: 'L-1', bails: [{ debut: '2024-02-15', fin: null, hc: 290, ch: 0 }], bareme: [], quittances: [] };
    expect(duMois(ctx, '2024-02').hc).toBe(150);     // 290 × 15/29
  });
  it('deux baux MÊME date de début → le dernier gagne, pas d\'addition', () => {
    const ctx = {
      ref: 'L-1',
      bails: [
        { debut: '2026-01-01', fin: null, hc: 500, ch: 50, archive: true },
        { debut: '2026-01-01', fin: null, hc: 550, ch: 50 }
      ], bareme: [], quittances: []
    };
    expect(duMois(ctx, '2026-02').total).toBe(600);  // 550+50, jamais 1100
  });
  it('re-bail à la frontière d\'année : décembre = ancien, janvier = nouveau', () => {
    const ctx = {
      ref: 'L-1',
      bails: [
        { debut: '2023-01-01', fin: null, hc: 500, ch: 0, archive: true },
        { debut: '2026-01-01', fin: null, hc: 600, ch: 0 }
      ], bareme: [], quittances: []
    };
    expect(duMois(ctx, '2025-12').hc).toBe(500);
    expect(duMois(ctx, '2026-01').hc).toBe(600);
  });
  it('entrées invalides : ctx vide ou ym malformé → 0 / vacance', () => {
    expect(duMois(null, '2026-03').total).toBe(0);
    expect(duMois({ ref: 'X', bails: [], bareme: [], quittances: [] }, '2026-03').source).toBe('vacance');
    expect(duMois(ctxFric(), 'n-importe-quoi').total).toBe(0);
  });
});

describe('_debutSuivi — départ du suivi = 1er versement, rattrapage d\'entrée (C6), millésimes antérieurs bornés', () => {
  const mk = (bails) => ({ ref: 'L-1', bails, bareme: [], quittances: [] });
  it('bail janvier 2026, 1er paiement mars 2026 → suivi depuis 2026-01 (janv/févr DUS, pas une avance)', () => {
    expect(_debutSuivi(mk([{ debut: '2026-01-01', fin: null }]), '2026-03')).toBe('2026-01');
  });
  it('bail 2019, 1er paiement juin 2024 → suivi depuis 2024-01 (les années sans données restent bornées)', () => {
    expect(_debutSuivi(mk([{ debut: '2019-06-01', fin: null }]), '2024-06')).toBe('2024-01');
  });
  it('bail nov 2023, 1er paiement févr 2024 → 2024-01 (le millésime du 1er versement, pas avant)', () => {
    expect(_debutSuivi(mk([{ debut: '2023-11-15', fin: null }]), '2024-02')).toBe('2024-01');
  });
  it('AUCUN paiement + bail actif → début du bail (zéro paiement = pire retard, pas invisible)', () => {
    expect(_debutSuivi(mk([{ debut: '2026-01-01', fin: null }]), null)).toBe('2026-01');
  });
  it('aucun paiement + bail clôturé → null (rien à suivre)', () => {
    expect(_debutSuivi(mk([{ debut: '2023-01-01', fin: null, finEffective: '2025-12-31', archive: true }]), null)).toBe(null);
  });
  it('paiement pendant une vacance avant le bail → suivi au début du bail', () => {
    expect(_debutSuivi(mk([{ debut: '2026-02-01', fin: null }]), '2025-12')).toBe('2026-02');
  });
  it('aucun bail → null', () => {
    expect(_debutSuivi(mk([]), '2026-01')).toBe(null);
  });
});

describe('CAS 6 — netting avance↔retard : une avance couvre les mois suivants AVANT de laisser naître un retard', () => {
  const M = (hcDue, chDue, received) => ({ hcDue, chDue, received });
  it('2 loyers payés en janvier, 0 en février, 1 en mars → NI retard NI avance (fini le retard+avance simultanés)', () => {
    const r = _computeLoyerNetting([M(500, 50, 1100), M(500, 50, 0), M(500, 50, 550)], false);
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.avance).toBe(0);
    expect(r.retardMois.every(m => m.loyer === 0 && m.charge === 0)).toBe(true);
    expect(r.months[0].avance).toBe(550);            // l'avance vit en janvier…
    expect(r.months[1].avance).toBe(0);              // …consommée par février
  });
  it('avance épuisée → le retard naît sur le BON mois (mars, pas février)', () => {
    const r = _computeLoyerNetting([M(500, 50, 1100), M(500, 50, 0), M(500, 50, 0)], false);
    expect(r.loyerArrear).toBe(500);
    expect(r.chargeArrear).toBe(50);
    expect(r.avance).toBe(0);
    expect(r.retardMois[1]).toEqual({ loyer: 0, charge: 0 });   // février couvert par l'avance
    expect(r.retardMois[2]).toEqual({ loyer: 500, charge: 50 }); // mars = le vrai impayé
    expect(r.causeLoyer).toEqual([{ idx: 2, short: 500, due: 500, recv: 0 }]);
  });
  it('invariant : jamais retard > 0 ET avance > 0 en fin de période', () => {
    const scenarios = [
      [M(500, 50, 1100), M(500, 50, 0), M(500, 50, 550)],
      [M(500, 50, 2000), M(500, 50, 0), M(500, 50, 0)],
      [M(500, 50, 0), M(500, 50, 1650), M(500, 50, 0)],
      [M(500, 50, 300), M(500, 50, 800), M(500, 50, 550)]
    ];
    for (const ms of scenarios) {
      const r = _computeLoyerNetting(ms, false);
      expect(r.months.length).toBe(3);
      expect((r.loyerArrear + r.chargeArrear) > 0 && r.avance > 0).toBe(false);
    }
  });
  it('rattrapage FIFO conservé : retard janv comblé par paiement double en février', () => {
    const r = _computeLoyerNetting([M(500, 50, 0), M(500, 50, 1100), M(500, 50, 550)], false);
    expect(r.loyerArrear).toBe(0);
    expect(r.chargeArrear).toBe(0);
    expect(r.retardMois.every(m => m.loyer === 0 && m.charge === 0)).toBe(true);
  });
  it('paiement partiel : cascade loyer d\'abord → résidu charges', () => {
    const r = _computeLoyerNetting([M(500, 50, 300)], false);
    expect(r.retardMois[0]).toEqual({ loyer: 200, charge: 50 });
    expect(r.causeLoyer[0].short).toBe(200);
    expect(r.causeCharge[0].short).toBe(50);
  });
  it('graceLast : le manque NEUF du dernier mois n\'est pas compté, les arriérés antérieurs restent', () => {
    const r = _computeLoyerNetting([M(500, 50, 0), M(500, 50, 0)], true);
    expect(r.loyerArrear).toBe(500);                 // janvier reste dû
    expect(r.retardMois[1]).toEqual({ loyer: 0, charge: 0 }); // février sous tolérance
  });
  it('Σ retardMois = arriéré final (invariant drill ↔ sous-ligne)', () => {
    const ms = [M(500, 50, 200), M(500, 50, 700), M(500, 50, 0), M(500, 50, 550)];
    const r = _computeLoyerNetting(ms, false);
    const sum = r.retardMois.reduce((s, m) => s + m.loyer + m.charge, 0);
    expect(Math.round(sum * 100) / 100).toBe(Math.round((r.loyerArrear + r.chargeArrear) * 100) / 100);
  });
  it('mois sans dû (vacance) au milieu : le paiement d\'un ancien locataire est porté, pas perdu', () => {
    const r = _computeLoyerNetting([M(500, 50, 550), M(0, 0, 0), M(500, 50, 550)], false);
    expect(r.months.length).toBe(3);
    expect(r.months.every(m => m.loyerArrear === 0 && m.chargeArrear === 0)).toBe(true);
    expect(r.loyerArrear).toBe(0);
    expect(r.avance).toBe(0);
  });
});

describe('_computeLoyerArrears (legacy) — comportement PRÉSERVÉ après factorisation (délégué sans netting)', () => {
  const M = (hcDue, chDue, received) => ({ hcDue, chDue, received });
  it('scénario CAS 6 : SANS netting, février reste en retard (comportement P&L actuel, remplacé à l\'étape 4)', () => {
    const r = _computeLoyerArrears([M(500, 50, 1100), M(500, 50, 0), M(500, 50, 550)], false);
    expect(r.loyerArrear).toBe(500);
    expect(r.chargeArrear).toBe(50);
    expect(r.retardMois[1]).toEqual({ loyer: 500, charge: 50 });
  });
});
