/**
 * F-5 / F-6 / F-7 (AUDIT-GLOBAL) — un acte n'affirme que ce que l'app a VÉRIFIÉ.
 *
 * Suite de DOC-C, même famille : là où DOC-C empêchait un acte de partir avec des TROUS,
 * celui-ci l'empêche de partir avec des AFFIRMATIONS non vérifiées. Trois cas constatés :
 *
 *  F-7 · La mise en demeure disait « Malgré nos relances des {{rappel1Date}} et {{rappel2Date}} »
 *        — deux relances, toujours. Depuis la modale d'actes, les jetons valaient littéralement
 *        « (relance 1) » et « (relance 2) » ; depuis le Hub, une absence de relance donnait
 *        « (inconnu) ». C'est l'étape amiable qui précède le commandement de payer visant la
 *        clause résolutoire : y affirmer des courriers qui n'existent pas est un cadeau au
 *        locataire, et perdre la date exacte d'une relance réelle est une preuve gâchée.
 *
 *  F-5 · L'avenant « travaux » certifiait que la majoration était « alignée sur le plafond
 *        retenu pour la relocation encadrée » — sans condition, alors que `loyerTravauxGuard`
 *        se contente d'avertir et que l'utilisateur peut passer outre.
 *
 *  F-6 · L'avenant « durée » affirmait « respecte la durée minimale légale » sans aucune
 *        vérification — et l'app ne PEUT pas la vérifier (art. 10 : trois ans pour les personnes
 *        physiques et les bailleurs de l'art. 13, dont les SCI familiales ; six ans pour les
 *        autres personnes morales — et rien, dans le modèle de données, ne dit si une SCI est
 *        familiale). Une affirmation invérifiable n'a pas sa place dans un acte.
 */

import { describe, it, expect } from 'vitest';
import { phraseRelances } from '../../js/core/email-compose.js';
import { avenantArticle, loyerTravauxGuard } from '../../js/core/avenant.js';

describe('F-7 — la mise en demeure s’appuie sur les relances RÉELLEMENT envoyées', () => {
  it('aucune relance : la phrase n’en invente pas', () => {
    const p = phraseRelances([]);
    expect(p).toBe('Nous constatons que');
    expect(p).not.toMatch(/relance/i);
  });

  it('une seule relance : le singulier, et sa date', () => {
    expect(phraseRelances(['12/03/2026'])).toBe('Malgré notre relance du 12/03/2026, nous constatons que');
  });

  it('deux relances : le pluriel, et les deux dates', () => {
    expect(phraseRelances(['12/03/2026', '02/04/2026']))
      .toBe('Malgré nos relances des 12/03/2026 et 02/04/2026, nous constatons que');
  });

  it('trois relances ou plus : énumération correcte, sans « et » perdu', () => {
    expect(phraseRelances(['a', 'b', 'c'])).toBe('Malgré nos relances des a, b et c, nous constatons que');
  });

  it('les dates vides sont ignorées, pas comptées comme des relances', () => {
    expect(phraseRelances(['', null, undefined, '  '])).toBe('Nous constatons que');
    expect(phraseRelances(['12/03/2026', ''])).toBe('Malgré notre relance du 12/03/2026, nous constatons que');
  });

  it('ne renvoie JAMAIS une chaîne vide', () => {
    // `_interpolateEmail` transforme '' en « (inconnu) » : une phrase vide réintroduirait
    // exactement le défaut qu'on ferme, sous une autre forme.
    for (const e of [undefined, null, [], ['']]) expect(phraseRelances(e).length).toBeGreaterThan(0);
  });

  it('entrées dégradées : jamais d’exception', () => {
    expect(() => phraseRelances('pas un tableau')).not.toThrow();
    expect(phraseRelances('pas un tableau')).toBe('Nous constatons que');
  });
});

describe('F-5 — l’avenant travaux ne certifie le plafond que s’il est tenu', () => {
  // Loyer 800 €/mois → demi-année = 4 800 €. Travaux 6 000 € → plafond de hausse = 6000×15%/12 = 75 €/mois.
  const base = { desc: 'Cuisine équipée', cout: 6000, dpe: 'D', motif: 'Travaux d\'amélioration' };
  const ctx = { loyer0: 800 };

  it('le garde-fou confirme les bornes sur lesquelles on s’appuie', () => {
    const g = loyerTravauxGuard({ loyer0: 800, coutTTC: 6000, nouveau: 870, motif: base.motif });
    expect(g.seuil).toBe(4800);
    expect(g.maxHausseMois).toBe(75);
  });

  it('hausse DANS le plafond et travaux au-dessus du seuil → la certification est méritée', () => {
    const a = avenantArticle('loyer', { ...base, nouveau: 870 }, ctx);   // +70 € ≤ 75 €
    expect(a.html).toMatch(/aligné sur le plafond/);
  });

  it('hausse AU-DESSUS du plafond → plus aucune certification', () => {
    const a = avenantArticle('loyer', { ...base, nouveau: 900 }, ctx);   // +100 € > 75 €
    expect(a.html).not.toMatch(/aligné sur le plafond/);
    expect(a.html).toMatch(/d'un commun accord entre les parties/);
    // Le fondement légal, lui, reste énoncé : c'est la conformité qu'on cesse d'affirmer.
    expect(a.html).toMatch(/article 17-1, II/);
  });

  it('travaux SOUS la demi-année de loyer → plus aucune certification', () => {
    const a = avenantArticle('loyer', { ...base, cout: 1000, nouveau: 810 }, ctx);
    expect(a.html).not.toMatch(/aligné sur le plafond/);
  });

  it('champs incomplets → on n’affirme rien', () => {
    expect(avenantArticle('loyer', { ...base, cout: 0, nouveau: 870 }, ctx).html).not.toMatch(/aligné sur le plafond/);
    expect(avenantArticle('loyer', { ...base, nouveau: 0 }, ctx).html).not.toMatch(/aligné sur le plafond/);
  });
});

describe('F-6 — l’avenant durée n’affirme plus une conformité qu’il n’a pas contrôlée', () => {
  it('la certification a disparu', () => {
    const a = avenantArticle('duree', { act: 'Prorogation', fin: '2030-01-01' }, { loyer0: 800 });
    expect(a.html).not.toMatch(/respecte la durée minimale/);
  });

  it('… mais la règle est rappelée, et le terme toujours énoncé', () => {
    const a = avenantArticle('duree', { act: 'Prorogation', fin: '2030-01-01' }, { loyer0: 800 });
    expect(a.html).toMatch(/ne peut être inférieure à la durée minimale/);
    expect(a.html).toMatch(/01\/01\/2030/);
  });
});
