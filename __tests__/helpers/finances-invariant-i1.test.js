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
    const moyenne = (ctx, ym) => {
      const hc = Number(ctx.bails[0].hc) || 0;          // loyerMensuelMoyen de _computeBilanAnnuel
      return Math.round(hc * (30.44 / 30.44) * 100) / 100;
    };
    expect(infractionsI1({ ...CAS, surfaces: { 'attenduHCTheo': moyenne } }).length)
      .toBe(CAS.moisFiges.length);
  });

  it('une surface honnête et une surface fautive côte à côte : seule la fautive ressort', () => {
    const violations = infractionsI1({
      ...CAS,
      surfaces: { 'dû du mois (duMois)': SURFACES['dû du mois (duMois)'], 'fautive': SURFACE_FAUTIVE_LOYER_ACTUEL }
    });
    expect(new Set(violations.map(v => v.surface))).toEqual(new Set(['fautive']));
  });

  it('aucune surface / aucun mois figé → aucune infraction (harnais neutre)', () => {
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
