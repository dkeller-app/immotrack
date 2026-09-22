/**
 * A-2 / A-3 — la durée du bail nu était attribuée par une regex sur un CHAMP LIBRE.
 *
 * `/personne physique|perso/i` : le fragment « perso » est contenu dans « PERSOnne morale ».
 * Mesuré sur l'ancien code :
 *
 *   "Personne morale"  → 3 ans + « le bailleur étant une personne physique »
 *   "Particulier"      → 6 ans + « le bailleur étant une personne morale (SCI) »
 *
 * Les deux sont inversés, et c'est le PDF SIGNÉ qui les portait : un bailleur particulier
 * s'engageait pour six ans au lieu de trois, et la tacite reconduction « pour une durée égale à
 * celle du bail initial » reconduisait l'erreur.
 *
 * Et l'art. 13 était ignoré : la SCI familiale et l'indivision relèvent des trois ans. L'app le
 * disait déjà — mais seulement dans la NOTICE annexée au bail. Le contrat se contredisait donc
 * lui-même, corps contre annexe.
 *
 * Sources vérifiées : Légifrance, loi n° 89-462 du 6 juillet 1989, art. 10 et art. 13.
 */

import { describe, it, expect } from 'vitest';
import { regimeBailleur, dureeBailNuLabel, dureeBailNuPhrase } from '../../js/core/bail-duree.js';

describe('regimeBailleur — la confusion d’origine est fermée', () => {
  it('« Personne morale » N’EST PAS une personne physique (le défaut exact)', () => {
    const r = regimeBailleur('Personne morale');
    expect(r.regime).toBe('morale');
    expect(r.ans).toBe(6);
    expect(r.certain).toBe(true);
  });

  it('« Particulier » EST une personne physique (l’autre moitié du défaut)', () => {
    const r = regimeBailleur('Particulier');
    expect(r.regime).toBe('physique');
    expect(r.ans).toBe(3);
    expect(r.certain).toBe(true);
  });

  it('« Personne physique » reste à trois ans', () => {
    expect(regimeBailleur('Personne physique').ans).toBe(3);
  });

  it('accents et casse ne changent rien (champ libre, saisie humaine)', () => {
    for (const t of ['PERSONNE PHYSIQUE', 'personne  physique', 'Personne Physique']) {
      expect(regimeBailleur(t).ans, t).toBe(3);
    }
  });
});

describe('regimeBailleur — l’article 13 existe enfin', () => {
  it('SCI familiale : trois ans, et le motif le dit', () => {
    const r = regimeBailleur('SCI familiale');
    expect(r.ans).toBe(3);
    expect(r.regime).toBe('art13');
    expect(r.motif).toMatch(/13/);
  });

  it('indivision : trois ans', () => {
    expect(regimeBailleur('Indivision').ans).toBe(3);
    expect(regimeBailleur('Logement en indivision').regime).toBe('art13');
  });

  it('une société civile familiale reste à trois ans même écrite « personne morale »', () => {
    // Cas réel : « Personne morale — SCI familiale ». Le mot « morale » ne doit pas l'emporter.
    expect(regimeBailleur('Personne morale - SCI familiale').ans).toBe(3);
  });

  it('SARL, SAS, association : six ans', () => {
    for (const t of ['SARL', 'SAS Immo', 'Association loi 1901']) {
      expect(regimeBailleur(t).ans, t).toBe(6);
    }
  });
});

describe('regimeBailleur — ce qu’on ne sait pas, on ne l’affirme pas', () => {
  it('une SCI sans mention de son caractère familial est INDÉTERMINÉE', () => {
    const r = regimeBailleur('SCI IS');
    expect(r.ans, 'à défaut, le droit commun des personnes morales').toBe(6);
    expect(r.certain, 'on ne peut pas savoir si elle est familiale').toBe(false);
    expect(r.motif).toMatch(/familial/);
  });

  it('type vide ou inconnu : six ans, mais jamais présenté comme établi', () => {
    for (const t of ['', null, undefined, 'Truc']) {
      const r = regimeBailleur(t);
      expect(r.ans, String(t)).toBe(6);
      expect(r.certain, String(t)).toBe(false);
    }
  });
});

describe('dureeBailNuLabel / dureeBailNuPhrase — ce qui entre dans le contrat', () => {
  it('le libellé suit le régime', () => {
    expect(dureeBailNuLabel('Particulier')).toBe('3 (trois) ans');
    expect(dureeBailNuLabel('Personne morale')).toBe('6 (six) ans');
    expect(dureeBailNuLabel('SCI familiale')).toBe('3 (trois) ans');
  });

  it('libellé et phrase ne peuvent pas se contredire', () => {
    for (const t of ['Particulier', 'Personne morale', 'SCI familiale', 'SCI IS', '', 'Indivision']) {
      const ans = dureeBailNuLabel(t).indexOf('3') === 0 ? 3 : 6;
      expect(dureeBailNuPhrase(t), t).toContain('durée de ' + ans + ' ans');
    }
  });

  it('une personne morale n’est plus présentée comme « (SCI) » par défaut', () => {
    expect(dureeBailNuPhrase('SARL')).toMatch(/personne morale/);
    expect(dureeBailNuPhrase('SARL')).not.toMatch(/\(SCI\)/);
  });

  it('un cas INDÉTERMINÉ énonce la règle au lieu de certifier une qualité', () => {
    const p = dureeBailNuPhrase('SCI IS');
    expect(p).not.toMatch(/le bailleur étant/);
    expect(p).toMatch(/article 13/);
  });

  it('un cas ÉTABLI, lui, nomme la qualité du bailleur', () => {
    expect(dureeBailNuPhrase('Particulier')).toMatch(/le bailleur étant une personne physique/);
    expect(dureeBailNuPhrase('SCI familiale')).toMatch(/article 13/);
  });

  it('la phrase cite toujours son fondement', () => {
    for (const t of ['Particulier', 'Personne morale', 'SCI familiale', 'SCI IS', '']) {
      expect(dureeBailNuPhrase(t), t).toMatch(/article 10 de la loi du 6 juillet 1989/);
    }
  });
});
