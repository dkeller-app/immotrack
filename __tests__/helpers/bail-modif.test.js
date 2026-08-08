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
