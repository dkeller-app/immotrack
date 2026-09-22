/**
 * DOC-B (AUDIT-GLOBAL) — le bail énonçait une condition légale QUI N'EXISTE PAS.
 *
 * La clause « congé au cours du bail » existait en TROIS exemplaires (modèle Word éditable
 * `BAIL_TEMPLATE_DEFAULT`, générateur du PDF signé `buildBailStructure`, et une copie en dur),
 * tous périmés de la même façon :
 *
 *  · ils exigeaient d'être « âgé de plus de 60 ans » pour le cas de l'état de santé — condition
 *    SUPPRIMÉE de l'art. 15-I ; le texte en vigueur n'impose aucun âge ;
 *  · ils omettaient le certificat médical, que la loi exige ;
 *  · ils ignoraient totalement le cas des violences au sein du couple (3° bis).
 *
 * Ce n'est pas un détail de rédaction. Le locataire qui lit son bail et croit devoir trois mois
 * de préavis alors qu'un seul lui est dû paie deux mois de loyer qu'il ne devait pas. Et le
 * bailleur qui s'y fie refuse un préavis d'un mois auquel il ne peut pas s'opposer.
 *
 * Source : Légifrance, loi n° 89-462 du 6 juillet 1989, art. 15-I, version consolidée en vigueur
 * (LEGIARTI000047900030).
 */

import { describe, it, expect } from 'vitest';
import { PREAVIS_REDUIT_CAS, preavisReduitClause, CONGE_CAS_REDUITS, congeLocatairePreavis } from '../../js/core/conge.js';

describe('PREAVIS_REDUIT_CAS — les six cas de l’art. 15-I, dans les termes de la loi', () => {
  it('les six cas sont là', () => {
    expect(PREAVIS_REDUIT_CAS).toHaveLength(6);
  });

  it('AUCUNE condition d’âge sur le cas de l’état de santé', () => {
    const sante = PREAVIS_REDUIT_CAS.find((c) => /état de santé/.test(c));
    expect(sante).toBeTruthy();
    expect(sante, 'la loi n’impose plus d’âge pour ce cas').not.toMatch(/\b(60|65)\b/);
    expect(sante, 'la loi exige le certificat médical').toMatch(/certificat médical/);
  });

  it('nulle part une condition d’âge ne traîne dans la clause', () => {
    expect(preavisReduitClause()).not.toMatch(/\b(60|65)\s*ans/);
  });

  it('le cas des violences au sein du couple est présent (3° bis, longtemps absent)', () => {
    expect(PREAVIS_REDUIT_CAS.some((c) => /ordonnance de protection/.test(c))).toBe(true);
    expect(PREAVIS_REDUIT_CAS.some((c) => /violences exercées au sein du couple/.test(c))).toBe(true);
  });

  it('les autres cas légaux sont là : zone tendue, emploi, RSA/AAH, logement social', () => {
    const tout = PREAVIS_REDUIT_CAS.join(' | ');
    expect(tout).toMatch(/premier alinéa de l'article 17/);
    expect(tout).toMatch(/premier emploi, de mutation, de perte d'emploi/);
    expect(tout).toMatch(/revenu de solidarité active ou de l'allocation adulte handicapé/);
    expect(tout).toMatch(/article L\. 831-1 du code de la construction/);
  });
});

describe('preavisReduitClause — UNE clause, deux habillages', () => {
  it('la version HTML met le délai en gras, pas la version nue', () => {
    expect(preavisReduitClause(true)).toContain('<strong>un (1) mois</strong>');
    expect(preavisReduitClause(false)).toContain('un (1) mois');
    expect(preavisReduitClause(false)).not.toContain('<strong>');
  });

  it('les deux versions énoncent exactement les mêmes cas', () => {
    const nus = (s) => s.replace(/<[^>]+>/g, '');
    expect(nus(preavisReduitClause(true))).toBe(preavisReduitClause(false));
  });

  it('la clause est bien construite sur les six cas, sans en perdre en route', () => {
    // ⚠️ Ce test AFFIRMAIT « la clause porte les six cas » en bouclant `toContain(cas)` sur
    // `PREAVIS_REDUIT_CAS` — or la clause EST `join(' ; ')` de ce même tableau : l'assertion
    // était vraie par construction, quel que soit le contenu. Un audit l'a prouvé en remplaçant
    // un cas légal par « BLABLA » : le test restait vert. On vérifie donc la STRUCTURE (six
    // segments séparés) plutôt que l'appartenance, et le contenu légal est testé ailleurs,
    // contre le texte de loi.
    const c = preavisReduitClause();
    const corps = c.slice(c.indexOf(' : ') + 3).replace(/\.$/, '');
    expect(corps.split(' ; ')).toHaveLength(6);
    expect(c.endsWith('.')).toBe(true);
  });
});

describe('CONGE_CAS_REDUITS — le libellé du sélecteur ne doit pas dissuader du bon cas', () => {
  it('« état de santé » n’annonce plus un âge qui n’existe pas', () => {
    const sante = CONGE_CAS_REDUITS.find((c) => /état de santé/i.test(c));
    expect(sante).toBeTruthy();
    // 65 ans = art. 15-III (protection du locataire âgé contre un congé), pas le préavis réduit.
    expect(sante, 'le sélecteur confond 15-I et 15-III').not.toMatch(/\b(60|65)\b/);
  });

  it('chaque cas de la loi a son entrée dans le sélecteur', () => {
    const tout = CONGE_CAS_REDUITS.join(' | ').toLowerCase();
    for (const attendu of ['zone tendue', 'mutation', 'perte d\'emploi', 'premier emploi',
                           'état de santé', 'rsa', 'aah', 'logement social', 'violences']) {
      expect(tout, attendu + ' absent du sélecteur').toContain(attendu);
    }
  });

  it('choisir le cas « état de santé » donne bien UN mois', () => {
    const sante = CONGE_CAS_REDUITS.find((c) => /état de santé/i.test(c));
    const r = congeLocatairePreavis({ typeBail: 'nu', casReduit: sante });
    expect(r.mois).toBe(1);
    expect(r.reduit).toBe(true);
    // Il faut un certificat : ce n'est pas un cas « sur simple mention », contrairement à la zone tendue.
    expect(r.sansJustif).toBe(false);
  });

  it('sans cas choisi, un bail nu reste à trois mois', () => {
    expect(congeLocatairePreavis({ typeBail: 'nu', casReduit: 'Aucun (préavis plein)' }).mois).toBe(3);
  });
});
