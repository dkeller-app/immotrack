import { describe, it, expect } from 'vitest';
import { arriereLoyerSurPeriode, _calculerSoldeDG } from '../../js/core/gestion-dg-impayes.js';

/**
 * R0-C (AUDIT-GLOBAL) — La retenue sur dépôt de garantie doit lire LE MAÎTRE.
 *
 * CDC-FINANCES §0bis : « le retard [a] une seule implémentation, celle de Finances ».
 * Or `_calculerSoldeDG` lisait `_rgClotureImpayes` → `_loyerEtatLot`, un moteur d'arriéré
 * PARALLÈLE. Finances et l'écran de restitution pouvaient donc annoncer deux dettes
 * différentes pour le même locataire sortant — et c'est l'écran de restitution qui produit
 * un acte opposable (art. 22 loi 89-462) et un virement réel.
 *
 * Cette fonction est la brique PURE : elle reçoit les mois du maître (`byLot[ref].months`,
 * concaténés sur les exercices couverts) et somme le résidu de LOYER sur la période du bail.
 *
 * Anti-double-compte (modèle Didier, chantier Charges) : on ne somme QUE `loyerRetard`.
 * Les charges impayées sont portées par la régularisation (`bail.dgRetenu`), jamais
 * re-comptées ici — sinon le locataire les paierait deux fois.
 */

const M = (ym, loyerRetard, chargeRetard = 0) => ({ ym, loyerRetard, chargeRetard });

describe('R0-C — arriereLoyerSurPeriode : somme le résidu de LOYER du maître, borné au bail', () => {
  it('somme les résidus de loyer des mois compris dans la période', () => {
    const mois = [M('2026-01', 100), M('2026-02', 50), M('2026-03', 0)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-01', '2026-03-31')).toBe(150);
  });

  it('exclut les mois AVANT le début du bail', () => {
    const mois = [M('2025-11', 999), M('2025-12', 999), M('2026-01', 100)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-01', '2026-01-31')).toBe(100);
  });

  it('exclut les mois APRÈS la fin du bail — la cascade ne doit pas générer du dû post-sortie', () => {
    const mois = [M('2026-01', 100), M('2026-02', 80), M('2026-03', 999)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-01', '2026-02-28')).toBe(180);
  });

  it('IGNORE le résidu de CHARGES — porté par la régularisation, jamais par le dépôt', () => {
    const mois = [M('2026-01', 100, 400), M('2026-02', 0, 300)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-01', '2026-02-28')).toBe(100);
  });

  it('borne inclusive sur le mois de début ET sur le mois de fin', () => {
    const mois = [M('2026-01', 10), M('2026-02', 20), M('2026-03', 40)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-15', '2026-03-02')).toBe(70);
  });

  it('arrondit au centime et ne rend jamais de négatif', () => {
    const mois = [M('2026-01', 33.333), M('2026-02', 33.334), M('2026-03', -5)];
    expect(arriereLoyerSurPeriode(mois, '2026-01-01', '2026-03-31')).toBe(66.67);
  });

  it('sans mois, sans bornes ou avec des entrées malformées : zéro, jamais une exception', () => {
    expect(arriereLoyerSurPeriode([], '2026-01-01', '2026-12-31')).toBe(0);
    expect(arriereLoyerSurPeriode(null, '2026-01-01', '2026-12-31')).toBe(0);
    expect(arriereLoyerSurPeriode([M('2026-01', 100)], null, null)).toBe(0);
    expect(arriereLoyerSurPeriode([{ ym: 'nawak', loyerRetard: 9 }, null], '2026-01-01', '2026-12-31')).toBe(0);
  });

  it('accepte des bornes au mois (YYYY-MM) comme au jour (YYYY-MM-DD)', () => {
    const mois = [M('2026-01', 10), M('2026-02', 20)];
    expect(arriereLoyerSurPeriode(mois, '2026-01', '2026-02')).toBe(30);
  });
});

describe('R0-C — sans le maître, on n\'INVENTE pas une dette', () => {
  // L'ancien repli calculait `(bail.hc + bail.ch) × nbMois − Σ tous les crédits` :
  //  · infraction I-1 (le loyer d'AUJOURD'HUI appliqué à tout le passé — sur un bail indexé,
  //    ça retient des centaines d'euros de trop sur le dépôt) ;
  //  · charges incluses, alors qu'elles sont portées par la régularisation (double-compte) ;
  //  · encaissé sommé SANS filtre de catégorie — le versement du dépôt lui-même comptait
  //    comme un loyer payé.
  // Un acte opposable ne se fonde pas sur une estimation. Faute de maître : aucune retenue,
  // et on le DIT (`impayeIndisponible`), pour que l'écran refuse de conclure seul.
  const bailIndexe = {
    ref: 'F-001', dg: 1200, dgPaid: 1200,
    debut: '2023-01-01', finEffective: '2025-12-31',
    hc: 850, ch: 60   // loyer COURANT, après indexation
  };

  it('n\'applique plus le loyer d\'aujourd\'hui à tout le passé', () => {
    const r = _calculerSoldeDG(bailIndexe, []);
    expect(r.loyerImpaye).toBe(0);
    expect(r.impayeIndisponible).toBe(true);
  });

  it('le dépôt est restitué au lieu d\'être absorbé par une dette fabriquée', () => {
    // Ancien comportement : 36 × 910 = 32 760 € d'« impayé » → solde 0 €, dépôt intégralement gardé.
    expect(_calculerSoldeDG(bailIndexe, []).soldeRestitue).toBe(1200);
  });

  it('les retenues explicites, elles, restent déduites', () => {
    const r = _calculerSoldeDG({ ...bailIndexe, dgRetenu: 300 }, []);
    expect(r.soldeRestitue).toBe(900);
    expect(r.impayeIndisponible).toBe(true);
  });

  it('avec le maître disponible, il fait autorité et rien n\'est signalé indisponible', () => {
    const prev = globalThis.window;
    globalThis.window = {
      td: () => '2026-01-31',
      _loyerEtatLot: () => ({}),
      _rgClotureImpayes: (ref, from, to) => { expect(ref).toBe('F-001'); return 250; }
    };
    try {
      const r = _calculerSoldeDG({ ref: 'F-001', dg: 1200, dgPaid: 1200, dgRetenu: 100, debut: '2026-01-01', finEffective: '2026-01-31' }, []);
      expect(r.loyerImpaye).toBe(250);
      expect(r.impayeIndisponible).toBe(false);
      expect(r.soldeRestitue).toBe(850);
    } finally { globalThis.window = prev; }
  });
});

describe('R0-C — un résolveur présent mais SANS maître doit se déclarer indisponible', () => {
  it('un arriéré null/undefined n\'est pas lu comme « zéro impayé »', () => {
    const prev = globalThis.window;
    globalThis.window = { td: () => '2026-01-31', _rgClotureImpayes: () => null };
    try {
      const r = _calculerSoldeDG({ ref: 'F-001', dg: 1200, dgPaid: 1200, debut: '2026-01-01', finEffective: '2026-01-31' }, []);
      expect(r.impayeIndisponible).toBe(true);
      expect(r.loyerImpaye).toBe(0);
    } finally { globalThis.window = prev; }
  });

  it('un arriéré de 0 RÉELLEMENT calculé reste disponible (locataire à jour)', () => {
    const prev = globalThis.window;
    globalThis.window = { td: () => '2026-01-31', _rgClotureImpayes: () => 0 };
    try {
      const r = _calculerSoldeDG({ ref: 'F-001', dg: 1200, dgPaid: 1200, debut: '2026-01-01', finEffective: '2026-01-31' }, []);
      expect(r.impayeIndisponible).toBe(false);
      expect(r.soldeRestitue).toBe(1200);
    } finally { globalThis.window = prev; }
  });
});
