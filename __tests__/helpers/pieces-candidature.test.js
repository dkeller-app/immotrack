// __tests__/helpers/pieces-candidature.test.js — CANDIDATURES-CONFORMITE lot 2.
// Liste FERMÉE des pièces (décret n° 2015-1437, annexes I et II en vigueur depuis le 01/01/2023) et
// bouclier « pièce hors liste » (art. 22-2 loi n° 89-462). Le bouclier AVERTIT, il ne bloque jamais.
import { describe, it, expect } from 'vitest';
import {
  TYPES_PIECES, TYPE_NON_PRECISE, typesPourCategorie, typeValide, libelleType,
  detecterPiecesInterdites, nomFichierHorsListe, TEXTE_AMENDE_22_2, SOURCES_PIECES
} from '../../js/core/pieces-candidature.js';

describe('liste fermée du décret 2015-1437', () => {
  it('annexe I : 4 + 4 + 7 + 9 pièces pour le candidat', () => {
    expect(typesPourCategorie('identite').length).toBe(4);
    expect(typesPourCategorie('domicile').length).toBe(4);
    expect(typesPourCategorie('situation').length).toBe(7);
    expect(typesPourCategorie('ressources').length).toBe(9);
  });
  it('annexe II (caution) + visa Visale dans la catégorie garant', () => {
    const g = typesPourCategorie('garant');
    expect(g.length).toBe(3 + 2 + 4 + 6 + 6 + 1);
    expect(g.some(t => /visa/i.test(t.libelle))).toBe(true);
  });
  it('chaque type porte un id unique, un libellé, le texte verbatim et sa référence', () => {
    const ids = new Set();
    for (const t of TYPES_PIECES) {
      expect(ids.has(t.id)).toBe(false); ids.add(t.id);
      expect(t.libelle.length).toBeGreaterThan(3);
      expect(t.texte.length).toBeGreaterThan(5);
      expect(t.ref).toMatch(/annexe|F1169/i);
    }
  });
  it('textes verbatim (échantillon relevé sur Légifrance le 12/10/2026)', () => {
    expect(TYPES_PIECES.find(t => t.id === 'I.D.2').texte).toBe('Trois derniers bulletins de salaires.');
    expect(TYPES_PIECES.find(t => t.id === 'I.A.1').texte).toBe('Carte nationale d\'identité française ou étrangère.');
    expect(TYPES_PIECES.find(t => t.id === 'II.C.2').texte).toBe('Facture d\'eau, de gaz ou d\'électricité de moins de trois mois.');
  });
  it('la facture d\'énergie n\'est PAS proposée au candidat (domicile), seulement à la caution', () => {
    expect(typesPourCategorie('domicile').some(t => /factur/i.test(t.texte))).toBe(false);
    expect(typesPourCategorie('garant').some(t => /factur/i.test(t.texte))).toBe(true);
  });
  it('les bulletins de salaire relèvent des ressources, pas de la situation professionnelle', () => {
    expect(typesPourCategorie('situation').some(t => /bulletin/i.test(t.texte))).toBe(false);
    expect(typesPourCategorie('ressources').some(t => /bulletin/i.test(t.texte))).toBe(true);
  });
  it('typeValide / libelleType / type non précisé', () => {
    expect(typeValide('ressources', 'I.D.2')).toBe(true);
    expect(typeValide('identite', 'I.D.2')).toBe(false);          // pas dans cette catégorie
    expect(typeValide('ressources', TYPE_NON_PRECISE)).toBe(true);
    expect(typeValide('ressources', 'n/importe')).toBe(false);
    expect(typeValide('inconnue', 'I.D.2')).toBe(false);
    expect(libelleType('I.D.2')).toBe('Trois derniers bulletins de salaire');
    expect(libelleType('')).toBe('Type non précisé');
    expect(libelleType('zzz')).toBe('Type non précisé');
  });
  it('sources citées avec leur URL', () => {
    expect(SOURCES_PIECES.decret.url).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\//);
    expect(SOURCES_PIECES.art222.url).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\//);
    expect(TEXTE_AMENDE_22_2).toContain('3 000 € pour une personne physique et à 15 000 € pour une personne morale');
  });
});

describe('detecterPiecesInterdites — demande de complément en texte libre', () => {
  const ids = t => detecterPiecesInterdites(t).map(x => x.id);
  it('relevés bancaires, photo d\'identité, bonne tenue de compte (cas de la maquette)', () => {
    expect(ids('Merci d\'ajouter les 3 derniers relevés bancaires, une photo d\'identité et une attestation de bonne tenue de compte.'))
      .toEqual(['releve_compte', 'photo_identite', 'bonne_tenue']);
  });
  it('chaque pièce de l\'ancienne liste de l\'art. 22-2 est reconnue', () => {
    const cas = {
      carte_vitale: 'la carte Vitale', releve_compte: 'un relevé de compte postal', bonne_tenue: 'attestation de bonne tenue de compte bancaire',
      absence_credit: "une attestation d'absence de crédit en cours", prelevement: 'une autorisation de prélèvement automatique',
      jugement_divorce: 'le jugement de divorce', contrat_mariage: 'votre contrat de mariage', concubinage: 'un certificat de concubinage',
      reservation: 'un chèque de réservation', dossier_medical: 'votre dossier médical', casier: 'un extrait de casier judiciaire',
      compte_bloque: 'un versement sur un compte bloqué', bilans: 'les trois derniers bilans', ficp: 'une attestation de non-inscription au FICP'
    };
    for (const [id, txt] of Object.entries(cas)) expect(ids(txt)).toContain(id);
  });
  it('ajouts : RIB, livret de famille, carte bancaire, plus de 3 bulletins, facture d\'énergie, parents garants', () => {
    expect(ids('Envoyer un RIB')).toContain('rib');
    expect(ids('le livret de famille')).toContain('livret_famille');
    expect(ids('une copie de la carte bancaire')).toContain('carte_bancaire');
    expect(ids('les 6 derniers bulletins de salaire')).toContain('bulletins');
    expect(ids('une facture d\'électricité')).toContain('facture_energie');
    expect(ids('vos parents doivent se porter caution')).toContain('cosignature_parents');
    expect(ids('la caution de vos parents')).toContain('cosignature_parents');
  });
  it('casse, accents, apostrophes typographiques', () => {
    expect(ids('RELEVÉ DE COMPTE')).toEqual(['releve_compte']);
    expect(ids('photo d’identité récente')).toEqual(['photo_identite']);
  });
  it('les pièces autorisées ne déclenchent rien (pas de faux positif courant)', () => {
    [
      'Merci de compléter votre dossier (pièce manquante).',
      "Avis d'imposition page 2 illisible, justificatif de domicile manquant",
      'les trois derniers bulletins de salaire', 'trois dernières quittances de loyer',
      'pièce d\'identité avec photo', 'contrat de travail et attestation de l\'employeur',
      'les deux derniers bilans', 'attestation du précédent bailleur', 'simulation des aides au logement',
      'carte d\'étudiant', 'visa Visale', 'garant', 'un garant ou la garantie Visale', 'facture'
    ].forEach(t => expect(ids(t)).toEqual([]));
  });
  it('rend l\'extrait trouvé et un libellé', () => {
    const r = detecterPiecesInterdites('Fournir un RIB svp');
    expect(r[0]).toMatchObject({ id: 'rib', extrait: 'RIB' });
    expect(r[0].libelle.length).toBeGreaterThan(3);
  });
  it('une même pièce citée deux fois n\'apparaît qu\'une fois ; entrée vide → []', () => {
    expect(ids('RIB, et encore un RIB')).toEqual(['rib']);
    expect(detecterPiecesInterdites('')).toEqual([]);
    expect(detecterPiecesInterdites(null)).toEqual([]);
  });
});

describe('nomFichierHorsListe — nom d\'un fichier reçu ou ajouté', () => {
  it('reconnaît les séparateurs de nom de fichier', () => {
    expect(nomFichierHorsListe('releve-compte-garant-sept.pdf').map(x => x.id)).toEqual(['releve_compte']);
    expect(nomFichierHorsListe('RIB_Dupont.pdf').map(x => x.id)).toEqual(['rib']);
    expect(nomFichierHorsListe('carte_vitale.jpg').map(x => x.id)).toEqual(['carte_vitale']);
    expect(nomFichierHorsListe('livret.de.famille.pdf').map(x => x.id)).toEqual(['livret_famille']);
  });
  it('les noms ordinaires ne déclenchent rien', () => {
    ['cni-recto-verso.pdf', 'bulletins-juil-aout-sept.pdf', 'avis-imposition-2026.pdf', 'IMG_20261010_1842.jpg',
      'quittances.pdf', 'contrat-travail.pdf', 'attestation-hebergement.pdf', 'scan.pdf', 'photo.jpg']
      .forEach(n => expect(nomFichierHorsListe(n)).toEqual([]));
  });
});
