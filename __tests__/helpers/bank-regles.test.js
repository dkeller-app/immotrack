/**
 * bank-regles.test.js — CHANTIER IMPORT-MOUVEMENTS, étape 4 « Règles ».
 * CDC : docs/CDC-IMPORT.md section ⑦ (mockups creer-regle.html, liste-vs-tableau.html).
 *
 * ⑦.1 motif + sens + compte (bug 8 : la restriction de compte ne tombe plus) ·
 * ⑦.2 complémentaires vs conflit · R-C « le bailleur du compte » ·
 * ⑦.4 aperçu en direct · ⑦.7 colonne « utilisée ».
 */
import { describe, it, expect } from 'vitest';
import {
  _bankLineSens, _bankRuleMatch, _bankApplyRules, _bankResolveAff,
  _bankRulePreview, _bankRuleUsage,
} from '../../js/core/bank-import.js';

const L = (libelle, montant) => ({
  libelle, credit: montant > 0 ? montant : 0, debit: montant < 0 ? -montant : 0,
});

describe('⑦.1 _bankRuleMatch — motif, sens, compte', () => {
  it('Le motif est cherché dans le libellé, insensible casse ET accents', () => {
    expect(_bankRuleMatch({ pattern: 'société des eaux' }, L('PRLV SEPA SOCIETE DES EAUX', -120))).toBe(true);
    expect(_bankRuleMatch({ pattern: 'EDF' }, L('prlv sepa edf clients', -128))).toBe(true);
  });

  it('LE SENS règle le bug « EDF » : le prélèvement matche, pas le remboursement', () => {
    const regle = { pattern: 'EDF', sens: 'db', cat: 'Charges récupérables (eau, énergie…)' };
    expect(_bankRuleMatch(regle, L('PRLV SEPA EDF', -128))).toBe(true);
    expect(_bankRuleMatch(regle, L('VIR REMB EDF TROP PERCU', 42))).toBe(false);
  });

  it('Sans critère de sens, la règle attrape les deux (comportement historique)', () => {
    const regle = { pattern: 'EDF', sens: '' };
    expect(_bankRuleMatch(regle, L('PRLV EDF', -128))).toBe(true);
    expect(_bankRuleMatch(regle, L('REMB EDF', 42))).toBe(true);
  });

  it('BUG 8 — la restriction de compte NE TOMBE PLUS quand le compte est inconnu', () => {
    const regle = { pattern: 'EDF', compte: 'A' };
    expect(_bankRuleMatch(regle, L('PRLV EDF', -1), 'A')).toBe(true);
    expect(_bankRuleMatch(regle, L('PRLV EDF', -1), 'B')).toBe(false);
    expect(_bankRuleMatch(regle, L('PRLV EDF', -1), undefined)).toBe(false); // ← avant : true
  });

  it('Une règle supprimée (tombstone) ou sans motif ne matche jamais', () => {
    expect(_bankRuleMatch({ pattern: 'EDF', _deleted: true }, L('EDF', -1))).toBe(false);
    expect(_bankRuleMatch({ pattern: '' }, L('EDF', -1))).toBe(false);
  });

  it('_bankLineSens : crédit = recette, sinon dépense', () => {
    expect(_bankLineSens(L('x', 100))).toBe('cr');
    expect(_bankLineSens(L('x', -100))).toBe('db');
  });
});

describe('⑦.2 _bankApplyRules — complémentaires vs conflit', () => {
  it('COMPLÉMENTAIRES : une règle donne la catégorie, une autre le bien → on applique les deux', () => {
    const rules = [
      { pattern: 'SYNDIC', cat: 'Charges de copropriété' },
      { pattern: 'LES TILLEULS', imm: 'Ferrette' },
    ];
    const r = _bankApplyRules(rules, L('PRLV SYNDIC LES TILLEULS T3', -420));
    expect(r.cat).toBe('Charges de copropriété');
    expect(r.aff.imm).toBe('Ferrette');
    expect(r.conflicts).toHaveLength(0);
    // L'ORIGINE de chaque champ est exposée, pour pouvoir l'afficher.
    expect(r.catRule.pattern).toBe('SYNDIC');
    expect(r.affRule.pattern).toBe('LES TILLEULS');
  });

  it('CONFLIT sur la catégorie : aucun automatisme, les candidates sont exposées', () => {
    const rules = [
      { pattern: 'EDF', cat: 'Charges récupérables (eau, énergie…)' },
      { pattern: 'EDF CLIENTS', cat: 'Divers (non déductible)' },
    ];
    const r = _bankApplyRules(rules, L('PRLV EDF CLIENTS PARTICULIERS', -128));
    expect(r.cat).toBe('');                       // rien n'est appliqué
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].field).toBe('cat');
    expect(r.conflicts[0].rules).toHaveLength(2); // affichées avec leur résultat
  });

  it('Deux règles aboutissant à la MÊME valeur ne sont pas un conflit', () => {
    const rules = [
      { pattern: 'EDF', cat: 'Charges récupérables (eau, énergie…)' },
      { pattern: 'CLIENTS PARTICULIERS', cat: 'Charges récupérables (eau, énergie…)' },
    ];
    const r = _bankApplyRules(rules, L('PRLV EDF CLIENTS PARTICULIERS', -128));
    expect(r.conflicts).toHaveLength(0);
    expect(r.cat).toBe('Charges récupérables (eau, énergie…)');
  });

  it('CONFLIT sur l\'affectation : deux biens différents → on ne choisit pas au hasard', () => {
    const rules = [
      { pattern: 'SYNDIC', imm: 'Ferrette' },
      { pattern: 'T3', qui: 'FRE-001' },
    ];
    const r = _bankApplyRules(rules, L('SYNDIC T3', -420));
    expect(r.aff).toBeNull();
    expect(r.conflicts[0].field).toBe('aff');
  });

  it('Aucune règle ne matche → byRule faux, rien d\'inventé', () => {
    const r = _bankApplyRules([{ pattern: 'GAZ' }], L('PRLV EDF', -128));
    expect(r.byRule).toBe(false);
    expect(r.cat).toBe('');
  });
});

describe('R-C _bankResolveAff — « le bailleur du compte », une seule règle pour toutes les SCI', () => {
  it('Résout le bailleur depuis le compte reconnu (cas ICARUS)', () => {
    const r = _bankResolveAff({ bailleurDuCompte: true }, { bailleur: 'SCI DES TILLEULS' });
    expect(r.qui).toBe('SCI:SCI DES TILLEULS');
  });

  it('Un compte mixte ne peut rien résoudre : affectation vide et signalée', () => {
    const r = _bankResolveAff({ bailleurDuCompte: true }, { bailleur: 'SCI A', mixte: true });
    expect(r.qui).toBe('');
    expect(r.unresolved).toBe(true);
  });

  it('Une affectation classique passe telle quelle', () => {
    expect(_bankResolveAff({ imm: 'Ferrette' }, { bailleur: 'X' }).imm).toBe('Ferrette');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ⑦.4 — L'aperçu en direct : ce que le prompt() ne pouvait pas dire
// ═══════════════════════════════════════════════════════════════════

describe('⑦.4 _bankRulePreview — aperçu en direct', () => {
  const importLines = [
    L('PRLV SEPA SOCIETE DES EAUX', -399.94),
    L('PRLV SEPA EDF CLIENTS PARTICULIERS ECH/060826', -128.40),
    L('PRLV SEPA EDF CLIENTS PARTICULIERS ECH/110826', -96.10),
    L('VIR SEPA M BAYSANG LOYER AOUT 2026', 680),
    L('VIR SEPA REMB EDF TROP PERCU 2025', 42.15),
  ];
  const mouvements = [
    { id: 1, lib: 'PRLV EDF CLIENTS PARTICULIERS', db: 128, cr: 0, cat: 'Charges récupérables (eau, énergie…)' },
    { id: 2, lib: 'VIR SEPA MME FRIC LOYER', db: 0, cr: 850, cat: 'Loyers encaissés' },
  ];

  it('Motif précis : les lignes de l\'import ET le nombre en base', () => {
    const p = _bankRulePreview({ pattern: 'EDF CLIENTS PARTICULIERS', sens: 'db' }, { importLines, mouvements });
    expect(p.lines).toHaveLength(2);
    expect(p.nBase).toBe(1);
    expect(p.level).toBe('ok');
  });

  it('ALERTE motif trop court (< 4 caractères)', () => {
    const p = _bankRulePreview({ pattern: 'VIR' }, { importLines, mouvements });
    expect(p.tooShort).toBe(true);
    expect(p.level).toBe('warn');
  });

  it('ALERTE natures différentes : le motif attrape des dépenses ET des recettes', () => {
    const p = _bankRulePreview({ pattern: 'SEPA' }, { importLines, mouvements });
    expect(p.mixed).toBe(true);
    expect(p.level).toBe('warn');
  });

  it('Le critère de sens désamorce l\'alerte de nature (c\'est à ça qu\'il sert)', () => {
    const p = _bankRulePreview({ pattern: 'SEPA', sens: 'db' }, { importLines, mouvements: [] });
    expect(p.mixed).toBe(false);
  });

  it('⑦.7 — fonctionne SANS import : il s\'appuie alors sur les mouvements en base', () => {
    const p = _bankRulePreview({ pattern: 'CLIENTS PARTICULIERS' }, { mouvements });
    expect(p.lines).toHaveLength(0);
    expect(p.nBase).toBe(1);
  });

  it('Motif vide → aperçu vide, aucune alerte gratuite', () => {
    const p = _bankRulePreview({ pattern: '   ' }, { importLines });
    expect(p.level).toBe('');
    expect(p.lines).toHaveLength(0);
  });
});

describe('⑦.7 _bankRuleUsage — la colonne « utilisée » repère une règle obsolète', () => {
  const mvs = [
    { id: 1, date: '2026-07-02', _rules: ['EDF'] },
    { id: 2, date: '2026-08-12', _rules: ['EDF', 'SYNDIC'] },
    { id: 3, date: '2026-08-20', _rules: ['SYNDIC'] },
    { id: 4, date: '2026-09-01', _rules: ['EDF'], _deleted: true },
  ];

  it('Compte les mouvements classés et donne la dernière fois', () => {
    const u = _bankRuleUsage({ pattern: 'edf' }, mvs);
    expect(u.count).toBe(2);
    expect(u.lastDate).toBe('2026-08-12');
  });

  it('Une règle jamais utilisée se voit tout de suite', () => {
    expect(_bankRuleUsage({ pattern: 'NOTAIRE' }, mvs).count).toBe(0);
  });

  it('Ignore les mouvements supprimés', () => {
    expect(_bankRuleUsage({ pattern: 'EDF' }, mvs).lastDate).not.toBe('2026-09-01');
  });
});
