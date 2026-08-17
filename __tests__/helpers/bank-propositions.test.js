/**
 * bank-propositions.test.js — CHANTIER IMPORT-MOUVEMENTS, étape 5 « Propositions ».
 * CDC : docs/CDC-IMPORT.md ⑦.5 — les 5 corrections du match locataire (bugs 4 à 7).
 *
 * R-B v2 : une proposition (✨) est TOUJOURS soumise, elle n'applique jamais rien
 * seule. Ces tests vérifient donc ce qui est PROPOSÉ, pas ce qui serait appliqué.
 */
import { describe, it, expect } from 'vitest';
import { _bankMatchHeuristic } from '../../js/core/bank-import.js';

const cr = (libelle, montant, date) => ({ libelle, credit: montant, debit: 0, date: date || '2026-08-05' });

const BAUX = {
  'FER-001': { locataires: [{ nom: 'MARC Julien' }], hc: 780, ch: 70 },
  'FER-002': { locataires: [{ nom: 'ROY Sophie' }], hc: 600, ch: 50 },
};

describe('⑦.5 a — FRONTIÈRE DE MOT (bug 4) : « Marc » ne matche plus SUPERMARCHE', () => {
  it('Un achat en supermarché ne propose plus le locataire MARC', () => {
    const r = _bankMatchHeuristic(cr('VIR REMB SUPERMARCHE CASINO', 42), { baux: BAUX });
    expect(r.qui).toBe('');
    expect(r.cat).not.toBe('Loyers encaissés');
  });

  it('« Roy » ne matche plus ROYAL', () => {
    expect(_bankMatchHeuristic(cr('VIR HOTEL ROYAL REMBOURSEMENT', 120), { baux: BAUX }).qui).toBe('');
  });

  it('Le nom entouré de ponctuation ou de chiffres reste reconnu', () => {
    expect(_bankMatchHeuristic(cr('VIR SEPA/MARC JULIEN/LOYER', 850), { baux: BAUX }).qui).toBe('FER-001');
    expect(_bankMatchHeuristic(cr('VIR 0012 MARC 850', 850), { baux: BAUX }).qui).toBe('FER-001');
  });

  it('Insensible à la casse et aux accents', () => {
    const baux = { 'X-1': { locataires: [{ nom: 'Désiré Müller' }], hc: 500, ch: 0 } };
    expect(_bankMatchHeuristic(cr('VIR DESIRE MULLER LOYER', 500), { baux }).qui).toBe('X-1');
  });
});

describe('⑦.5 b — TOUS LES BAUX ÉVALUÉS (bug 5) : plus de « premier qui matche gagne »', () => {
  const memeNom = {
    'A-1': { locataires: [{ nom: 'MARTIN Paul' }], hc: 800, ch: 50 },
    'A-2': { locataires: [{ nom: 'MARTIN Claire' }], hc: 800, ch: 50 },
  };

  it('Deux lots au même loyer et au même nom → proposition AMBIGUË, aucun gagnant', () => {
    const r = _bankMatchHeuristic(cr('VIR SEPA MARTIN LOYER AOUT', 850), { baux: memeNom });
    expect(r.ambiguous).toBe(true);
    expect(r.qui).toBe('');
    expect(r.candidates.map(c => c.ref).sort()).toEqual(['A-1', 'A-2']);
    expect(r.source).toMatch(/2 locataires possibles/);
  });

  it("Quand le montant ne désigne qu'un seul des candidats, il tranche (ce n'est pas arbitraire)", () => {
    const baux = {
      'A-1': { locataires: [{ nom: 'MARTIN Paul' }], hc: 800, ch: 50 },
      'A-2': { locataires: [{ nom: 'MARTIN Claire' }], hc: 600, ch: 40 },
    };
    const r = _bankMatchHeuristic(cr('VIR MARTIN LOYER', 640), { baux });
    expect(r.ambiguous).toBe(false);
    expect(r.qui).toBe('A-2');
    expect(r.candidates).toHaveLength(2);   // les deux restent visibles
  });
});

describe('⑦.5 c — LE DÛ EST CELUI DU MOIS DU RELEVÉ (bug 6), via duMois', () => {
  const baux = { 'FER-001': { locataires: [{ nom: 'BAYSANG' }], hc: 700, ch: 60 } };  // loyer d'AUJOURD'HUI = 760

  it('Après indexation, un versement d\'un mois antérieur reste une proposition sûre', () => {
    // Le dû de mars était 680 (avant indexation). Sans duMois, l'écart aurait été de
    // 80 € et la confiance serait tombée pour un motif faux.
    const duMois = (ref, ym) => ({ total: ym === '2026-03' ? 680 : 760 });
    const r = _bankMatchHeuristic(cr('VIR BAYSANG LOYER MARS', 680, '2026-03-03'), { baux, duMois });
    expect(r.qui).toBe('FER-001');
    expect(r.confidence).toBe(0.95);
    expect(r.source).toMatch(/dû du mois 680,00 €/);
  });

  it('Sans résolveur duMois (mode dégradé), on retombe sur le loyer du bail', () => {
    const r = _bankMatchHeuristic(cr('VIR BAYSANG LOYER', 760), { baux });
    expect(r.qui).toBe('FER-001');
    expect(r.confidence).toBe(0.95);
  });
});

describe('⑦.5 d — LES BAUX CLÔTURÉS REDEVIENNENT CANDIDATS (bug 7)', () => {
  const baux = { 'FER-003': { locataires: [{ nom: 'DUPONT Jean' }], hc: 500, ch: 50, cloture: true } };

  it('Un arriéré versé après le départ matche de nouveau, avec la mention « ancien locataire »', () => {
    const r = _bankMatchHeuristic(cr('VIR DUPONT SOLDE ARRIERE', 320), { baux });
    expect(r.qui).toBe('FER-003');
    expect(r.source).toMatch(/ancien locataire/);
  });
});

describe('⑦.5 e — LE MONTANT EST UN INDICATEUR, PAS UN CRITÈRE (fin du seuil ±5 €)', () => {
  it('Un paiement PARTIEL propose quand même, et affiche l\'écart', () => {
    const r = _bankMatchHeuristic(cr('VIR MARC JULIEN ACOMPTE', 680), { baux: BAUX });
    expect(r.qui).toBe('FER-001');
    expect(r.cat).toBe('Loyers encaissés');
    expect(r.source).toMatch(/montant 680,00 € · dû du mois 850,00 €/);
    expect(r.source).toMatch(/reste 170,00 €/);
  });

  it('Une AVANCE propose aussi, et le dit', () => {
    const r = _bankMatchHeuristic(cr('VIR MARC JULIEN', 1000), { baux: BAUX });
    expect(r.source).toMatch(/avance de 150,00 €/);
  });

  it('Le montant gradue la confiance : exact > proche > éloigné', () => {
    expect(_bankMatchHeuristic(cr('VIR MARC', 850), { baux: BAUX }).confidence).toBe(0.95);
    expect(_bankMatchHeuristic(cr('VIR MARC', 845), { baux: BAUX }).confidence).toBe(0.85);
    expect(_bankMatchHeuristic(cr('VIR MARC', 300), { baux: BAUX }).confidence).toBe(0.75);
  });

  it("Un montant SEUL ne propose que s'il n'y a QU'UN lot dont le dû corresponde", () => {
    const r = _bankMatchHeuristic(cr('VIR SEPA INCONNU 12345', 650), { baux: BAUX });
    expect(r.qui).toBe('FER-002');
    expect(r.confidence).toBe(0.6);
  });

  it('Deux lots au même dû et aucun nom reconnu → aucune proposition (jamais au hasard)', () => {
    const baux = {
      'A-1': { locataires: [{ nom: 'ALPHA' }], hc: 850, ch: 0 },
      'A-2': { locataires: [{ nom: 'BETA' }], hc: 850, ch: 0 },
    };
    expect(_bankMatchHeuristic(cr('VIR SEPA ANONYME', 850), { baux }).qui).toBe('');
  });
});

describe('Les mots-clés (② étage) restent inchangés et ne proposent que des catégories', () => {
  it('Un prélèvement EDF propose une catégorie, jamais un bien', () => {
    const r = _bankMatchHeuristic({ libelle: 'PRLV SEPA EDF', credit: 0, debit: 128, date: '2026-08-06' }, { baux: BAUX });
    expect(r.cat).toBe('Charges récupérables (eau, énergie…)');
    expect(r.qui).toBe('');
  });

  it('Aucun match → aucune catégorie inventée', () => {
    const r = _bankMatchHeuristic({ libelle: 'ZZZ OPERATION INCONNUE', credit: 0, debit: 12, date: '2026-08-06' }, { baux: BAUX });
    expect(r.cat).toBe('');
    expect(r.confidence).toBe(0);
  });
});
