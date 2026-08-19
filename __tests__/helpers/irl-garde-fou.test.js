/**
 * CDC-LOYERS-DESIGN V20/V21 — LES GARDE-FOUS NON BLOQUANTS DE LA RÉVISION IRL.
 *
 * Deux choses se testent ici, et la seconde compte autant que la première :
 *   1. les blocages qui viennent de la LOI deviennent des avertissements — le bouton reste ;
 *   2. il n'y a PAS de bouton là où il n'y a rien à débloquer (« bail < 1 an », « indice non
 *      publié ») : la date n'est pas arrivée, ou l'INSEE n'a rien publié. Un bouton
 *      « quand même » y serait un mensonge — c'est l'exception assumée du CDC.
 */
import { describe, it, expect } from 'vitest';
import { GARDE, gardeFouRevision, revisionForcable, libelleForcage } from '../../js/core/irl-garde-fou.js';

describe('V20 — le gel DPE F/G devient un avertissement', () => {
  const g = gardeFouRevision({ gelDpeFG: true, dpe: 'G' });
  it('le geste reste offert', () => {
    expect(g.kind).toBe(GARDE.GEL);
    expect(g.peut).toBe(true);
    expect(g.cta).toBe('Réviser quand même');
  });
  it('la fenêtre CITE la règle', () => {
    expect(g.loi).toContain('Climat');
    expect(g.loi).toContain('art. 23');
    expect(g.loi).toContain('classé G');
  });
  it('elle dit ce que ça engage : révision non opposable, remboursement possible', () => {
    expect(g.consequence).toContain('n’est pas opposable au locataire');
    expect(g.consequence).toContain('remboursement');
  });
  it('elle demande une confirmation à cocher', () => {
    expect(g.confirmation).toContain('J’ai compris');
  });
  it('un DPE F est nommé F, pas G', () => {
    expect(gardeFouRevision({ gelDpeFG: true, dpe: 'F' }).loi).toContain('classé F');
  });
});

describe('V20 — le cycle éteint devient un avertissement', () => {
  const g = gardeFouRevision({ perdue: { effetIso: '2024-03-01', annee: 2024 } }, { gainMensuel: 12.4 });
  it('le geste reste offert', () => {
    expect(g.kind).toBe(GARDE.CYCLE_ETEINT);
    expect(g.peut).toBe(true);
    expect(g.cta).toBe('Appliquer quand même');
  });
  it('la fenêtre cite l\'article 17-1 et la date d\'extinction, calculée à un an', () => {
    expect(g.loi).toContain('art. 17-1');
    expect(g.loi).toContain('01/03/2024');
    expect(g.loi).toContain('01/03/2025');
  });
  it('elle dit que les mois passés ne se rattrapent pas, et chiffre le manque', () => {
    expect(g.consequence).toContain('ne sont plus réclamables');
    expect(g.consequence).toContain('12,40 €');
    expect(g.consequence).toContain('pour l’avenir');
  });
  it('sans gain calculable, elle ne l\'invente pas', () => {
    const s = gardeFouRevision({ perdue: { effetIso: '2024-03-01', annee: 2024 } }, {});
    expect(s.consequence).not.toMatch(/≈/);
  });
});

describe('V21 — le blocage « DPE absent » est LEVÉ', () => {
  const g = gardeFouRevision({ dpeManquant: true });
  it('le geste est offert', () => {
    expect(g.kind).toBe(GARDE.DPE_ABSENT);
    expect(g.peut).toBe(true);
    expect(g.cta).toBe('Réviser quand même');
  });
  it('elle dit honnêtement que l\'app NE PEUT PAS vérifier — elle n\'affirme rien', () => {
    expect(g.loi).toContain('ne peut pas vérifier');
  });
  it('elle rappelle qu\'un garage, une cave ou un parking n\'a pas de DPE par nature', () => {
    expect(g.consequence).toContain('garage');
    expect(g.consequence).toContain('cave');
    expect(g.consequence).toContain('parking');
    expect(g.consequence).toContain('le gel ne les vise pas');
  });
});

describe('V21 — l\'exception assumée : PAS de bouton là où il n\'y a rien à débloquer', () => {
  it('bail de moins d\'un an : aucun bouton, et l\'écran dit pourquoi', () => {
    const g = gardeFouRevision({ etat: 'trop-jeune', effetPrevuIso: '2027-04-01' });
    expect(g.kind).toBe(GARDE.TROP_JEUNE);
    expect(g.peut).toBe(false);
    expect(g.cta).toBeUndefined();
    expect(g.pourquoi).toContain('ce n’est pas un verrou');
    expect(g.pourquoi).toContain('01/04/2027');
  });
  it('indice non publié : aucun bouton, et l\'écran dit pourquoi', () => {
    const g = gardeFouRevision({ etat: 'indice-manquant', missingKey: 'T2 2026' });
    expect(g.kind).toBe(GARDE.INDICE);
    expect(g.peut).toBe(false);
    expect(g.cta).toBeUndefined();
    expect(g.pourquoi).toContain('pas encore publié');
    expect(g.pourquoi).toContain('T2 2026');
    expect(g.pourquoi).toContain('rien à débloquer');
  });
  it('les helpers d\'affichage disent la même chose', () => {
    expect(revisionForcable({ etat: 'trop-jeune' })).toBe(false);
    expect(revisionForcable({ etat: 'indice-manquant' })).toBe(false);
    expect(revisionForcable({ gelDpeFG: true, dpe: 'F' })).toBe(true);
    expect(revisionForcable({ dpeManquant: true })).toBe(true);
    expect(libelleForcage({ etat: 'trop-jeune' })).toBeNull();
    expect(libelleForcage({ dpeManquant: true })).toBe('Réviser quand même');
  });
});

describe('Une révision ordinaire n\'a pas de garde-fou du tout', () => {
  it('aucun bandeau, aucune case à cocher', () => {
    expect(gardeFouRevision({ etat: 'a-preparer', isApplicable: true })).toBeNull();
    expect(gardeFouRevision(null)).toBeNull();
    expect(revisionForcable({ etat: 'a-preparer' })).toBe(false);
  });
});

describe('Ordre de priorité — le cycle éteint prime sur le reste', () => {
  it('un lot gelé ET dont un cycle est éteint annonce d\'abord le cycle éteint', () => {
    // C'est celui qui coûte de l'argent tout de suite ; le gel reste dit dans la révision suivante.
    const g = gardeFouRevision({ gelDpeFG: true, dpe: 'F', perdue: { effetIso: '2024-05-01', annee: 2024 } });
    expect(g.kind).toBe(GARDE.CYCLE_ETEINT);
  });
});
