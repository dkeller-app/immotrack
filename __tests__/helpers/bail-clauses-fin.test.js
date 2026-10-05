/**
 * BAUX-ECHUS — clauses de durée, congé et fin, version de clauses 5 (js/core/bail-clauses-fin.js).
 * Source : mockups/BAUX-ECHUS/REGLE-LEGALE.md (Légifrance au 05/10/2026).
 */
import { describe, it, expect } from 'vitest';
import * as C from '../../js/core/bail-clauses-fin.js';

const TOUS = [C.CONGE_LOCATAIRE_MEUBLE, C.CONGE_EXPIRATION_MEUBLE, C.RECONDUCTION_MEUBLE, C.FIN_ETUDIANT,
  C.CONGE_LOCATAIRE_MOBILITE, C.FIN_MOBILITE, C.CONGE_LOCATAIRE_NU, C.CONGE_EXPIRATION_NU, C.FORMES_CONGE_ART15, C.DUREE_MOBILITE, C.RESILIATION_AUTRE, C.CLAUSE_PENALE_REF,
  C.reconductionBailNu('Personne physique'), C.reconductionBailNu('Personne morale'), C.reconductionBailNu('')];

describe('aucune citation fausse', () => {
  it('jamais « 25-7 II » (l\'article 25-7 n\'a pas de II), jamais « 1226 » pour la clause pénale', () => {
    for (const t of TOUS) {
      expect(t).not.toMatch(/25-7 II/);
      expect(t).not.toMatch(/1226/);
    }
  });
  it('jamais de « requalification » d\'un maintien tacite (non tranché par les sources)', () => {
    for (const t of TOUS) expect(t).not.toMatch(/requalifi|reconduction implicite/i);
  });
  it('plus de reconduction « pour une durée égale à celle du bail initial »', () => {
    for (const t of TOUS) expect(t).not.toMatch(/égale à celle du bail initial/);
  });
});

describe('meublé et étudiant', () => {
  it('préavis du locataire : 1 mois, article 25-8 I, et les trois formes du congé', () => {
    expect(C.CONGE_LOCATAIRE_MEUBLE).toMatch(/préavis d’un \(1\) mois \(article 25-8, I de la loi n° 89-462/);
    expect(C.CONGE_LOCATAIRE_MEUBLE).toMatch(/lettre recommandée .*commissaire de justice .*remise en main propre contre récépissé ou émargement/);
  });
  it('congé à l\'expiration : 3 mois bailleur, 1 mois locataire (article 25-8, I)', () => {
    expect(C.CONGE_EXPIRATION_MEUBLE).toMatch(/trois \(3\) mois avant .* BAILLEUR, et un \(1\) mois avant .* LOCATAIRE \(article 25-8, I/);
  });
  it('tacite reconduction d\'un an : article 25-7 (et non 25-8)', () => {
    expect(C.RECONDUCTION_MEUBLE).toMatch(/reconduit pour une durée d’un \(1\) an \(article 25-7 de la loi/);
    expect(C.RECONDUCTION_MEUBLE).not.toMatch(/25-8/);
  });
  it('étudiant : reconduction inapplicable (article 25-7), fin au terme', () => {
    expect(C.FIN_ETUDIANT).toMatch(/reconduction tacite est inapplicable \(article 25-7/);
    expect(C.FIN_ETUDIANT).toMatch(/prend fin à son terme/);
  });
});

describe('mobilité', () => {
  it('congé du locataire : article 25-15, un mois, trois formes ; pas de congé bailleur', () => {
    expect(C.CONGE_LOCATAIRE_MOBILITE).toMatch(/préavis d’un \(1\) mois \(article 25-15/);
    expect(C.CONGE_LOCATAIRE_MOBILITE).toMatch(/remise en main propre/);
    expect(C.CONGE_LOCATAIRE_MOBILITE).toMatch(/Le BAILLEUR ne peut pas donner congé en cours de bail/);
  });
  it('fin : non renouvelable et non reconductible ; nouveau bail conclu → titre Ier bis (article 25-14)', () => {
    expect(C.FIN_MOBILITE).toMatch(/non renouvelable et non reconductible \(article 25-14/);
    expect(C.FIN_MOBILITE).toMatch(/les parties concluent un nouveau bail portant sur le même logement meublé, ce nouveau bail est soumis aux dispositions du titre Ier bis/);
  });
  it('durée : 1 à 10 mois, et la dérogation en résidence à vocation d\'emploi (depuis le 28/11/2025)', () => {
    expect(C.DUREE_MOBILITE).toMatch(/minimale d’un mois et maximale de dix mois/);
    expect(C.DUREE_MOBILITE).toMatch(/résidence à vocation d’emploi \(article L\. 631-16-1 .*une semaine et maximale de dix-huit mois/);
  });
});

describe('bail nu : 3 ans ou 6 ans selon le bailleur (article 10 al. 3), quelle que soit la durée initiale', () => {
  it('personne physique, SCI familiale, indivision → trois ans', () => {
    for (const t of ['Personne physique', 'SCI familiale', 'Indivision']) {
      expect(C.reconductionBailNu(t)).toMatch(/reconduit pour une durée de trois \(3\) ans \(article 10 de la loi n° 89-462/);
    }
  });
  it('« Personne morale » → six ans (le fragment « perso » ne trompe plus)', () => {
    expect(C.reconductionBailNu('Personne morale')).toMatch(/durée de six \(6\) ans \(article 10/);
  });
  it('qualité non établie (SCI sans précision, vide) → la règle est énoncée, pas tranchée', () => {
    for (const t of ['SCI', '']) {
      const p = C.reconductionBailNu(t);
      expect(p).toMatch(/trois \(3\) ans si le bailleur est une personne physique ou relève de l’article 13/);
      expect(p).toMatch(/six \(6\) ans s’il est une autre personne morale/);
    }
  });
});

describe('location « autre » et clause pénale', () => {
  it('autre : à défaut de stipulation, les règles du louage du Code civil (articles 1736 à 1740)', () => {
    expect(C.RESILIATION_AUTRE).toMatch(/règles du louage du Code civil .*articles 1736 à 1740/);
    expect(C.RESILIATION_AUTRE).not.toMatch(/droit commun des contrats/);
  });
  it('clause pénale : article 1231-5 du Code civil', () => {
    expect(C.CLAUSE_PENALE_REF).toBe('article 1231-5 du Code civil');
  });
});

describe('bail nu v5 — formes du congé de l\'art. 15, I (mot pour mot)', () => {
  const FORMES = 'Le congé doit être notifié par lettre recommandée avec demande d’avis de réception, signifié par acte d’un commissaire de justice ou remis en main propre contre récépissé ou émargement (article 15, I de la loi n° 89-462 du 6 juillet 1989).';
  it('congé du locataire : trois mois + les trois formes, dont la remise en main propre', () => {
    expect(C.CONGE_LOCATAIRE_NU).toBe('Le LOCATAIRE pourra donner congé au BAILLEUR à tout moment du contrat moyennant un préavis de trois (3) mois. ' + FORMES);
  });
  it('congé à l\'expiration : six mois bailleur, trois mois locataire + les trois formes', () => {
    expect(C.CONGE_EXPIRATION_NU).toMatch(/six \(6\) mois avant .* BAILLEUR, et trois \(3\) mois avant .* LOCATAIRE\. /);
    expect(C.CONGE_EXPIRATION_NU.endsWith(FORMES)).toBe(true);
  });
});

describe('bail mobilité v5 — la durée réelle tirée des dates', () => {
  it('mois, semaines, mois et jours (fin incluse)', () => {
    expect(C.dureeMobiliteLibelle('2026-01-01', '2026-06-30')).toBe('6 (six) mois');
    expect(C.dureeMobiliteLibelle('2026-01-15', '2026-02-14')).toBe('1 (un) mois');
    expect(C.dureeMobiliteLibelle('2026-01-01', '2026-01-07')).toBe('1 (une) semaine');
    expect(C.dureeMobiliteLibelle('2026-01-01', '2026-01-14')).toBe('2 (deux) semaines');
    expect(C.dureeMobiliteLibelle('2026-01-01', '2026-04-10')).toBe('3 (trois) mois et 10 (dix) jours');
  });
  it('date manquante ou incohérente → \'\' (l\'appelant garde son marqueur « à préciser »)', () => {
    expect(C.dureeMobiliteLibelle('', '2026-06-30')).toBe('');
    expect(C.dureeMobiliteLibelle('2026-03-01', '2026-02-01')).toBe('');
  });
});
