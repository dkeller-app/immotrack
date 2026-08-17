import { describe, it, expect } from 'vitest';
import {
  casReferenceIRL, surfacesSocle, infractionsI1, formatInfractionsI1,
  SURFACE_FAUTIVE_LOYER_ACTUEL
} from './finances-invariant-i1.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

// Cas de référence du CDC : 800 € HC + 100 € de charges de janvier à juillet 2026,
// indexé à 850 € au 1er août. Le locataire paie 900 € le 5 de chaque mois toute l'année
// (les relevés bancaires ne changent pas quand on applique une IRL).
const CAS = casReferenceIRL();
const MVTS = [];
for (let mo = 1; mo <= 12; mo++) {
  MVTS.push({ date: `2026-${String(mo).padStart(2, '0')}-05`, cat: 'Loyer', qui: CAS.ref, cr: 900, db: 0 });
}
const SURFACES = surfacesSocle({ mouvements: MVTS, today: '2026-12-31' });

describe('INVARIANT I-1 — aucune valeur actuelle appliquée au passé', () => {
  it('le cas de référence est bien construit par le VRAI chemin du barème', () => {
    expect(CAS.moisFiges).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
    expect(CAS.moisIndexes[0]).toBe('2026-08');
    // Le piège est armé : après la révision, le bail courant vaut 850 €.
    expect(CAS.avant.bails[0].hc).toBe(800);
    expect(CAS.apres.bails[0].hc).toBe(850);
    // Le barème porte deux périodes datées, la 1re close à la veille de la date d'effet.
    const vivantes = CAS.apres.bareme.filter(p => !p._deleted);
    expect(vivantes.length).toBe(2);
    expect(vivantes[0].fin).toBe('2026-07-31');
    expect(vivantes[1].debut).toBe('2026-08-01');
    expect(vivantes[1].hc).toBe(850);
  });

  it('AUCUN chiffre de janvier à juillet ne bouge, sur TOUTES les surfaces du socle', () => {
    const violations = infractionsI1({ ...CAS, surfaces: SURFACES });
    expect(formatInfractionsI1(violations)).toBe('invariant I-1 tenu');
    expect(violations).toEqual([]);
  });

  it('le dû des mois figés reste à 800 € HC alors que le bail affiche 850 €', () => {
    CAS.moisFiges.forEach(ym => {
      expect(duMois(CAS.apres, ym)).toEqual({ hc: 800, ch: 100, total: 900, source: 'bareme' });
    });
  });

  it('la révision produit bien son effet À PARTIR du mois d\'effet (sinon le test serait vide)', () => {
    expect(duMois(CAS.avant, '2026-08').hc).toBe(800);
    expect(duMois(CAS.apres, '2026-08').hc).toBe(850);
    expect(duMois(CAS.apres, '2026-12').hc).toBe(850);
  });

  it('le retard/l\'avance des mois figés ne bougent pas non plus (cascade chronologique)', () => {
    const pnl = SURFACES['tableau P&L (_computeFinancesMonthly)'];
    CAS.moisFiges.forEach(ym => {
      const a = pnl(CAS.avant, ym), b = pnl(CAS.apres, ym);
      expect(b.loyerRetard).toBe(a.loyerRetard);
      expect(b.chargeRetard).toBe(a.chargeRetard);
      expect(b.avance).toBe(a.avance);
      expect(b.cashflowReel).toBe(a.cashflowReel);
    });
    // Et le retard APPARAÎT bien en août (900 € versés pour 950 € dus) : la révision agit.
    // Il tombe sur les CHARGES, pas sur le loyer — conséquence assumée de la cascade H-1
    // (« sur un paiement partiel, le manque tombe d'abord sur les charges »).
    expect(pnl(CAS.avant, '2026-08').chargeRetard).toBe(0);
    expect(pnl(CAS.apres, '2026-08').chargeRetard).toBe(50);
    expect(pnl(CAS.apres, '2026-08').loyerRetard).toBe(0);
  });

  it('le cumul de recouvrement au 31/07 est identique avant/après (7 × 900 €)', () => {
    const cum = SURFACES['recouvrement · dû CC cumulé (R-2)'];
    expect(cum(CAS.avant, '2026-07')).toBe(6300);
    expect(cum(CAS.apres, '2026-07')).toBe(6300);
  });

  it('l\'écart annuel du dû = UNIQUEMENT celui des mois indexés (5 × 50 €)', () => {
    const somme = (ctx, mois) => mois.reduce((s, ym) => s + duMois(ctx, ym).total, 0);
    const tous = CAS.moisFiges.concat(CAS.moisIndexes);
    expect(somme(CAS.apres, tous) - somme(CAS.avant, tous)).toBe(250);
    expect(somme(CAS.apres, CAS.moisFiges) - somme(CAS.avant, CAS.moisFiges)).toBe(0);
  });
});

describe('INVARIANT I-1 — le harnais DÉTECTE (un test qui ne peut pas échouer ne vaut rien)', () => {
  it('la surface fautive « bail.hc × nombre de mois » (index.html:49527) est prise en flagrant délit', () => {
    const violations = infractionsI1({
      ...CAS, surfaces: { 'attendu impayé (loyer actuel × mois)': SURFACE_FAUTIVE_LOYER_ACTUEL }
    });
    expect(violations.length).toBe(CAS.moisFiges.length);
    expect(violations[0]).toEqual({
      surface: 'attendu impayé (loyer actuel × mois)', mois: '2026-01', avant: 800, apres: 850
    });
    expect(formatInfractionsI1(violations)).toContain('I-1 VIOLÉ');
  });

  it('la surface « loyer moyen × jours d\'occupation » (attenduHCTheo, R-2) est aussi détectée', () => {
    // Reproduction fidèle de `loyerMensuelMoyen × occDays / 30,44` (legal-bilan.js:67 et :80) :
    // le loyer COURANT du bail étalé sur les jours d'occupation du mois, qui écrase l'historique.
    const attenduHCTheo = (ctx, ym) => {
      const hc = Number(ctx.bails[0].hc) || 0;
      const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
      const occDays = new Date(y, mo, 0).getDate();
      return Math.round((occDays / 30.44) * hc * 100) / 100;
    };
    const v = infractionsI1({ ...CAS, surfaces: { attenduHCTheo } });
    expect(v.length).toBe(CAS.moisFiges.length);
    expect(v[0].avant).not.toBe(v[0].apres);           // le chiffre de janvier a bel et bien bougé
  });

  it('une surface honnête et une surface fautive côte à côte : seule la fautive ressort', () => {
    const violations = infractionsI1({
      ...CAS,
      surfaces: { 'dû du mois (duMois)': SURFACES['dû du mois (duMois)'], 'fautive': SURFACE_FAUTIVE_LOYER_ACTUEL }
    });
    expect(new Set(violations.map(v => v.surface))).toEqual(new Set(['fautive']));
  });

  it('une surface MUETTE est signalée, jamais silencieusement validée', () => {
    // Sans ce garde-fou, une surface mal câblée « tient » l'invariant en ne mesurant rien —
    // c'est précisément ce qui rendait le harnais aveugle hors de son millésime.
    const muette = () => null;
    const v = infractionsI1({ ...CAS, surfaces: { 'surface mal câblée': muette } });
    expect(v.length).toBe(CAS.moisFiges.length);
    expect(v[0].raison).toBe('surface-muette');
    expect(formatInfractionsI1(v)).toContain('I-1 NON MESURÉ');
  });

  it('appels dégénérés : le harnais ne jette pas et n\'invente pas d\'infraction', () => {
    expect(infractionsI1({ ...CAS, surfaces: {} })).toEqual([]);
    expect(infractionsI1({ avant: CAS.avant, apres: CAS.apres, moisFiges: [], surfaces: SURFACES })).toEqual([]);
    expect(infractionsI1(null)).toEqual([]);
  });
});

describe('INVARIANT I-1 — réutilisable sur d\'autres scénarios que le cas du CDC', () => {
  it('révision au 1er avril : les 3 premiers mois sont figés', () => {
    const cas = casReferenceIRL({ dateEffet: '2026-04-01', hcApres: 900 });
    expect(cas.moisFiges).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(infractionsI1({ ...cas, surfaces: surfacesSocle({ mouvements: MVTS }) })).toEqual([]);
    expect(duMois(cas.apres, '2026-04').hc).toBe(900);
  });

  it('BAISSE de loyer (travaux, régularisation) : le passé ne baisse pas non plus', () => {
    const cas = casReferenceIRL({ hcApres: 700 });
    expect(infractionsI1({ ...cas, surfaces: surfacesSocle({ mouvements: MVTS }) })).toEqual([]);
    expect(duMois(cas.apres, '2026-07').hc).toBe(800);
    expect(duMois(cas.apres, '2026-08').hc).toBe(700);
  });

  it('révision au 1er janvier : aucun mois figé, mais le harnais ne casse pas', () => {
    const cas = casReferenceIRL({ dateEffet: '2026-01-01' });
    expect(cas.moisFiges).toEqual([]);
    expect(infractionsI1({ ...cas, surfaces: surfacesSocle({ mouvements: MVTS }) })).toEqual([]);
  });

  it('deux révisions successives : le 2e palier fige AUSSI le premier', () => {
    const cas = casReferenceIRL();                       // 800 € → 850 € au 01/08
    const ctx3 = {
      ...cas.apres,
      bareme: appliquerNouvellePeriode(cas.apres.bareme, {
        ref: cas.ref, debut: '2026-11-01', hc: 900, ch: cas.ch, source: 'irl', bailDebut: '2026-01-01'
      }),
      bails: [{ ...cas.apres.bails[0], hc: 900 }]        // le bail courant vaut maintenant 900 €
    };
    const figes = cas.moisFiges.concat(['2026-08', '2026-09', '2026-10']);
    expect(infractionsI1({
      avant: cas.apres, apres: ctx3, moisFiges: figes, surfaces: surfacesSocle({ mouvements: MVTS })
    })).toEqual([]);
    expect(duMois(ctx3, '2026-07').hc).toBe(800);        // 1er palier intact
    expect(duMois(ctx3, '2026-10').hc).toBe(850);        // 2e palier intact
    expect(duMois(ctx3, '2026-11').hc).toBe(900);        // 3e palier appliqué
  });
});

// ── I4 · le harnais doit rester MESURANT sur n'importe quel millésime ─────────
describe('INVARIANT I-1 — le harnais n\'est pas aveugle hors de 2026', () => {
  const casAn = (annee) => {
    const c = casReferenceIRL({ annee });
    const mvts = [];
    for (let mo = 1; mo <= 12; mo++) {
      mvts.push({ date: `${annee}-${String(mo).padStart(2, '0')}-05`, cat: 'Loyer', qui: c.ref, cr: 900, db: 0 });
    }
    return { c, surfaces: surfacesSocle({ mouvements: mvts }) };
  };

  it('2027 : les surfaces MESURENT vraiment (pas de null des deux côtés)', () => {
    const { c, surfaces } = casAn(2027);
    const pnl = surfaces['tableau P&L (_computeFinancesMonthly)'];
    expect(pnl(c.avant, '2027-03')).not.toBeNull();
    expect(pnl(c.avant, '2027-03').loyersHC).toBeGreaterThan(0);
    expect(surfaces['recouvrement · dû CC cumulé (R-2)'](c.avant, '2027-03')).toBe(2700);
  });

  it('2027 et 2024 : l\'invariant tient ET reste mesuré', () => {
    [2027, 2024].forEach(annee => {
      const { c, surfaces } = casAn(annee);
      const v = infractionsI1({ ...c, surfaces });
      expect(v).toEqual([]);                                   // aucune infraction…
      // …et aucune surface muette : la preuve que le zéro d'infractions veut dire quelque chose.
      const pnl = surfaces['tableau P&L (_computeFinancesMonthly)'];
      c.moisFiges.forEach(ym => expect(pnl(c.avant, ym)).toBeTruthy());
    });
  });

  it('2027 : la surface fautive est TOUJOURS prise en flagrant délit', () => {
    const { c } = casAn(2027);
    expect(infractionsI1({ ...c, surfaces: { fautive: SURFACE_FAUTIVE_LOYER_ACTUEL } }).length)
      .toBe(c.moisFiges.length);
  });

  it('le cache du P&L distingue les exercices (un ctx, deux années)', () => {
    const c = casReferenceIRL({ annee: 2026 });
    const mvts = [
      { date: '2026-03-05', cat: 'Loyer', qui: c.ref, cr: 900, db: 0 },
      { date: '2027-03-05', cat: 'Loyer', qui: c.ref, cr: 900, db: 0 }
    ];
    const pnl = surfacesSocle({ mouvements: mvts })['tableau P&L (_computeFinancesMonthly)'];
    expect(pnl(c.avant, '2026-03').ym).toBe('2026-03');
    expect(pnl(c.avant, '2027-03').ym).toBe('2027-03');        // ← renvoyait null avant correction
    expect(pnl(c.avant, '2027-03').loyersBrut).toBe(900);
  });
});
