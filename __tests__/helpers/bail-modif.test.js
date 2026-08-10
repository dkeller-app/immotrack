import { describe, it, expect } from 'vitest';
import { detecterChangementsFinanciers, dateEffetModifDefaut } from '../../js/core/bail-modif.js';

// HISTORIQUE-BAIL-ONGLET (2026-07-17) — décision user ④ : toute modification d'un
// terme FINANCIER du bail (loyer HC, provision charges, dépôt de garantie) passe par
// une popup de validation : ancien → nouveau, date d'effet (jamais rétroactive, jamais
// dans un mois quittancé — mêmes garde-fous Q1 que l'IRL), motif obligatoire.
// hc/ch → nouvelle période datée du barème (source 'manuel', note=motif) ;
// dg → trace append-only DB.bailEvents (le DG n'est pas une composante du dû mensuel).

describe('detecterChangementsFinanciers', () => {
  const prev = { hc: 500, ch: 65, dg: 500, notes: 'a' };

  it('détecte hc / ch / dg modifiés avec avant/après', () => {
    const ch = detecterChangementsFinanciers(prev, { hc: 540, ch: 70, dg: 600 });
    expect(ch).toEqual([
      { champ: 'hc', label: 'Loyer hors charges', avant: 500, apres: 540 },
      { champ: 'ch', label: 'Provision charges', avant: 65, apres: 70 },
      { champ: 'dg', label: 'Dépôt de garantie', avant: 500, apres: 600 }
    ]);
  });

  it('aucun changement financier → [] (modif de notes/clauses = sauvegarde simple)', () => {
    expect(detecterChangementsFinanciers(prev, { hc: 500, ch: 65, dg: 500, notes: 'b' })).toEqual([]);
  });

  it('tolère chaînes numériques et champs absents (0 par défaut)', () => {
    expect(detecterChangementsFinanciers({ hc: '500', ch: 65 }, { hc: 500, ch: '65', dg: 0 })).toEqual([]);
    expect(detecterChangementsFinanciers({ hc: 500 }, { hc: 500, ch: 50 }))
      .toEqual([{ champ: 'ch', label: 'Provision charges', avant: 0, apres: 50 }]);
  });

  it('pas de bail précédent → [] (création = pas de popup)', () => {
    expect(detecterChangementsFinanciers(null, { hc: 500 })).toEqual([]);
  });
});

describe('dateEffetModifDefaut — pré-remplissage garde-fous Q1', () => {
  it('par défaut : 1er du mois SUIVANT la modification', () => {
    expect(dateEffetModifDefaut('2026-07-17', null)).toEqual({ effetIso: '2026-08-01', ajustee: false });
    expect(dateEffetModifDefaut('2026-12-05', null)).toEqual({ effetIso: '2027-01-01', ajustee: false });
  });

  it('jamais dans un mois déjà quittancé : remonté au 1er du mois suivant le dernier quittancé', () => {
    // tout 2026 quittancé jusqu'en août inclus → effet proposé 2026-08-01 remonté à 2026-09-01
    expect(dateEffetModifDefaut('2026-07-17', '2026-08')).toEqual({ effetIso: '2026-09-01', ajustee: true });
  });
});

// ── Correction d'événement (décision user ⑤) : re-dater la date d'effet d'une révision
// IRL erronée depuis la timeline — garde-fous Q1, périodes du barème re-bornées, trace.
import { redaterRevisionIRL } from '../../js/core/bail-modif.js';

describe('redaterRevisionIRL — corriger la date d\'effet depuis la timeline', () => {
  const irlHist = [
    { ref: 'F-001', date: '2026-06-20', dateRevision: '2026-03-01', dateEffet: '2026-07-01', dateApplication: '2026-07-01', ancienHC: 500, nouveauHC: 505.15 }
  ];
  const bareme = [
    { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 65, source: 'bail', bailDebut: '2024-03-01' },
    { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 65, source: 'irl', bailDebut: '2024-03-01' }
  ];

  it('re-date la révision + re-borne les périodes (début irl + fin de la précédente)', () => {
    const r = redaterRevisionIRL({ irlHistorique: irlHist, bareme, ref: 'F-001',
      revisionDate: '2026-06-20', ancienEffet: '2026-07-01', nouvelleDateEffet: '2026-09-01' });
    expect(r.ok).toBe(true);
    expect(r.effetIso).toBe('2026-09-01');
    const rev = r.irlHistorique[0];
    expect(rev.dateEffet).toBe('2026-09-01');
    expect(rev.dateApplication).toBe('2026-09-01');
    const pIrl = r.bareme.find(p => p.source === 'irl');
    expect(pIrl.debut).toBe('2026-09-01');
    expect(r.bareme.find(p => p.source === 'bail').fin).toBe('2026-08-31');
    // pureté : les entrées d'origine ne sont pas mutées
    expect(irlHist[0].dateEffet).toBe('2026-07-01');
    expect(bareme[1].debut).toBe('2026-07-01');
  });

  it('normalise au 1er du mois et refuse un mois déjà quittancé (remonte + signale)', () => {
    const r = redaterRevisionIRL({ irlHistorique: irlHist, bareme, ref: 'F-001',
      revisionDate: '2026-06-20', ancienEffet: '2026-07-01', nouvelleDateEffet: '2026-05-15',
      dernierMoisQuittanceYm: '2026-06' });
    expect(r.ok).toBe(true);
    expect(r.effetIso).toBe('2026-07-01');   // 05→ clampé après le dernier quittancé (06) → 07-01
    expect(r.ajustee).toBe(true);
  });

  it('refuse de franchir la période précédente (chevauchement)', () => {
    const r = redaterRevisionIRL({ irlHistorique: irlHist, bareme, ref: 'F-001',
      revisionDate: '2026-06-20', ancienEffet: '2026-07-01', nouvelleDateEffet: '2024-02-01' });
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/périod/i);
  });

  it('révision introuvable → erreur explicite', () => {
    const r = redaterRevisionIRL({ irlHistorique: irlHist, bareme, ref: 'F-001',
      revisionDate: '2020-01-01', ancienEffet: '2020-02-01', nouvelleDateEffet: '2026-09-01' });
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/introuvable/i);
  });

  it('renonciation → rien à re-dater (erreur)', () => {
    const hist = [{ ref: 'F-001', date: '2025-03-05', ancienHC: 500, action: 'renonciation' }];
    const r = redaterRevisionIRL({ irlHistorique: hist, bareme, ref: 'F-001',
      revisionDate: '2025-03-05', ancienEffet: '', nouvelleDateEffet: '2026-09-01' });
    expect(r.ok).toBe(false);
  });
});

// ── Corrections audit 17/07 : B1 (borne min d'effet = jamais avant/dans la dernière
// période vivante du lot → pas de double période ouverte) et M2 (re-datage refusé si
// la période barème de la révision est introuvable — legacy pré-Q1).
import { borneMinEffetBareme } from '../../js/core/bail-modif.js';

describe('borneMinEffetBareme — B1 : la nouvelle période ne peut pas passer derrière une période vivante', () => {
  const bareme = [
    { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 65, source: 'bail' },
    { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 65, source: 'irl' }
  ];

  it('borne = 1er du mois SUIVANT le dernier début vivant du lot', () => {
    expect(borneMinEffetBareme(bareme, 'F-001')).toBe('2026-08-01');
    // période future (IRL en attente au 01-10) → borne au 01-11
    expect(borneMinEffetBareme([...bareme, { ref: 'F-001', debut: '2026-10-01', fin: null, hc: 510, ch: 65, source: 'irl' }], 'F-001')).toBe('2026-11-01');
  });

  it('tombstones et autres lots ignorés ; barème vide → pas de borne', () => {
    expect(borneMinEffetBareme([{ ref: 'F-001', debut: '2030-01-01', _deleted: true }, { ref: 'AUTRE', debut: '2030-01-01' }, ...bareme], 'F-001')).toBe('2026-08-01');
    expect(borneMinEffetBareme([], 'F-001')).toBe('');
  });
});

describe('redaterRevisionIRL — M2 : période barème introuvable = refus explicite', () => {
  it('révision legacy sans période irl correspondante → ok:false (pas de divergence silencieuse)', () => {
    const hist = [{ ref: 'F-001', date: '2023-04-10', dateRevision: '2023-03-01', dateEffet: '2023-03-01', ancienHC: 480, nouveauHC: 490 }];
    const bareme = [{ ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 65, source: 'bail' }];
    const r = redaterRevisionIRL({ irlHistorique: hist, bareme, ref: 'F-001',
      revisionDate: '2023-04-10', ancienEffet: '2023-03-01', nouvelleDateEffet: '2023-05-01' });
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/introuvable/i);
  });
});
