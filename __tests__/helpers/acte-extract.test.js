/**
 * Tests du module acte-extract (IMPORT-ACTE-VENTE — Phase A)
 *
 * RGPD : toutes les fixtures sont SYNTHÉTIQUES et anonymisées — aucun nom,
 * SIREN, ni adresse réels. Elles reproduisent la STRUCTURE des 2 templates
 * notaire connus (validés 4/4 sur actes réels en local), pas leur contenu.
 *
 * Les fixtures sont en texte multi-ligne ; acteExtract() normalise l'espace
 * (cf. contrainte pdf.js), donc le formatage ci-dessous n'a pas d'incidence.
 */

import { describe, it, expect } from 'vitest';
import { acteExtract, norm } from './acte-extract.js';

// ── Template 1 : société entre guillemets + « numéro unique d'identification »
//    + immeuble format X (« à VILLE (CP), adresse »). Contient un VENDEUR avec
//    un AUTRE SIREN AVANT l'acquéreur (test anti-capture du SIREN vendeur) et
//    une occurrence terminologique « l'acquéreur » à ignorer.
const ACTE_SOCIETE_GUILLEMETS = `
ACTE DE VENTE

VENDEUR
La société dénommée VENDEUR SARL, société à responsabilité limitée,
dont le siège social est à PARIS (75001), 1 rue du Vendeur,
identifiée au numéro unique d'identification 111 222 333.

Lequel déclare vendre à l'acquéreur ci-après nommé.

2) ACQUÉREUR
La société dénommée «IMMO TEST», Société Civile Immobilière,
dont le siège social est à STRASBOURG (67000), 10 rue de la Paix,
identifiée au numéro unique d'identification 123 456 789,
dénommée "L'ACQUEREUR".

DÉSIGNATION DES BIENS
Un immeuble situé à MULHOUSE (68100), 25 avenue du Test,
comprenant six appartements répartis comme suit :
* Au sous-sol des caves.
* Au rez-de-chaussée un appartement.
* Au premier étage deux appartements.
* Au deuxième étage deux appartements.
* Au troisième étage un appartement.
`;

// ── Template 2 : société SANS guillemets (nom jusqu'à la virgule) + « SIREN
//    sous le numéro » + immeuble format Y (« à VILLE (DÉPARTEMENT) CP adresse »).
const ACTE_SOCIETE_SANS_GUILLEMETS = `
ACTE DE VENTE

ACQUÉREUR
La société dénommée TEST IMMO, société à responsabilité limitée SARL,
dont le siège est à COLMAR (68000), 5 place du Marché,
identifiée au SIREN sous le numéro 987 654 321.

DÉSIGNATION DES BIENS
Un bien situé à DAMELEVIERES (MEURTHE ET MOSELLE) 54360 12 rue de la Gare,
composé de quatre logements.
`;

// ── Acquéreur personne physique + domicile + immeuble format X.
const ACTE_PERSONNE = `
ACTE DE VENTE

ACQUÉREUR
Monsieur Jean TEST, né le 1er janvier 1980,
demeurant à MULHOUSE (68100), 8 rue des Fleurs.

DÉSIGNATION DES BIENS
Un immeuble situé à COLMAR (68000), 14 rue Haute,
comprenant trois appartements.
* Au rez-de-chaussée un appartement.
* Au premier étage deux appartements.
`;

// ── Copropriété : désignation par lots (autre famille d'indice logements).
const ACTE_LOTS_COPRO = `
ACQUÉREUR
La société dénommée «COPRO TEST», SCI,
dont le siège social est à LYON (69001), 3 rue du Lot,
identifiée au numéro unique d'identification 222 333 444.

DÉSIGNATION DES BIENS
Un ensemble immobilier situé à LYON (69002), 7 rue Centrale.
Lot numéro 5 : un appartement au premier étage.
Lot numéro 6 : un appartement au deuxième étage.
Lot n° 7 : une cave au sous-sol.
`;

describe('acteExtract — template société (guillemets + numéro unique)', () => {
  const r = acteExtract(ACTE_SOCIETE_GUILLEMETS);

  it('détecte le type société', () => {
    expect(r.type).toBe('societe');
  });

  it('extrait le nom entre guillemets', () => {
    expect(r.entite.nom).toBe('IMMO TEST');
  });

  it('extrait la forme juridique (SCI développée)', () => {
    expect(r.entite.forme).toBe('Société Civile Immobilière');
  });

  it('capture le SIREN de l\'ACQUÉREUR (pas celui du vendeur) — anti-doublon', () => {
    expect(r.entite.siren).toBe('123456789');
    expect(r.entite.siren).not.toBe('111222333');
  });

  it('extrait le siège social (ville + CP + adresse)', () => {
    expect(r.entite.ville).toBe('STRASBOURG');
    expect(r.entite.cp).toBe('67000');
    expect(r.entite.adr).toBe('10 rue de la Paix');
  });

  it('extrait l\'immeuble format X (à VILLE (CP), adresse)', () => {
    expect(r.immeuble.ville).toBe('MULHOUSE');
    expect(r.immeuble.cp).toBe('68100');
    expect(r.immeuble.adr).toBe('25 avenue du Test');
  });

  it('compte les logements (« comprenant six appartements »)', () => {
    expect(r.logementsHint.count).toBe('six');
    expect(r.logementsHint.unit).toBe('appartements');
  });

  it('repère la structure par étage (≥2 niveaux)', () => {
    expect(r.logementsHint.parEtage).toBeGreaterThanOrEqual(2);
  });

  it('expose les phrases sources pour l\'UI', () => {
    expect(r._src.siren).toMatch(/123 456 789/);
    expect(r._src.immeuble).toMatch(/MULHOUSE/);
  });
});

describe('acteExtract — template société (sans guillemets + SIREN sous le numéro)', () => {
  const r = acteExtract(ACTE_SOCIETE_SANS_GUILLEMETS);

  it('détecte le type société', () => {
    expect(r.type).toBe('societe');
  });

  it('extrait le nom (jusqu\'à la virgule)', () => {
    expect(r.entite.nom).toBe('TEST IMMO');
  });

  it('extrait la forme juridique (SARL)', () => {
    expect(r.entite.forme).toMatch(/S\.?A\.?R\.?L\.?/i);
  });

  it('capture le SIREN via l\'ancre « SIREN sous le numéro »', () => {
    expect(r.entite.siren).toBe('987654321');
  });

  it('extrait le siège (ancre « siège est à », sans « social »)', () => {
    expect(r.entite.ville).toBe('COLMAR');
    expect(r.entite.cp).toBe('68000');
    expect(r.entite.adr).toBe('5 place du Marché');
  });

  it('extrait l\'immeuble format Y (à VILLE (DÉPARTEMENT) CP adresse)', () => {
    expect(r.immeuble.ville).toBe('DAMELEVIERES');
    expect(r.immeuble.cp).toBe('54360');
    expect(r.immeuble.adr).toBe('12 rue de la Gare');
  });

  it('compte les logements (« composé de quatre logements »)', () => {
    expect(r.logementsHint.count).toBe('quatre');
    expect(r.logementsHint.unit).toBe('logements');
  });
});

describe('acteExtract — acquéreur personne physique', () => {
  const r = acteExtract(ACTE_PERSONNE);

  it('détecte le type personne', () => {
    expect(r.type).toBe('personne');
  });

  it('extrait civilité + nom', () => {
    expect(r.entite.civilite).toBe('Monsieur');
    expect(r.entite.nom).toBe('Jean TEST');
  });

  it('n\'invente pas de SIREN pour une personne', () => {
    expect(r.entite.siren).toBeUndefined();
  });

  it('extrait le domicile (ville + CP + adresse)', () => {
    expect(r.entite.ville).toBe('MULHOUSE');
    expect(r.entite.cp).toBe('68100');
    expect(r.entite.adr).toBe('8 rue des Fleurs');
  });

  it('extrait l\'immeuble (≠ domicile de l\'acquéreur)', () => {
    expect(r.immeuble.ville).toBe('COLMAR');
    expect(r.immeuble.cp).toBe('68000');
    expect(r.immeuble.adr).toBe('14 rue Haute');
  });

  it('compte les logements', () => {
    expect(r.logementsHint.count).toBe('trois');
  });
});

describe('acteExtract — copropriété par lots', () => {
  const r = acteExtract(ACTE_LOTS_COPRO);

  it('extrait la société et son SIREN', () => {
    expect(r.type).toBe('societe');
    expect(r.entite.nom).toBe('COPRO TEST');
    expect(r.entite.forme).toMatch(/SCI/i);
    expect(r.entite.siren).toBe('222333444');
  });

  it('extrait l\'immeuble', () => {
    expect(r.immeuble.ville).toBe('LYON');
    expect(r.immeuble.cp).toBe('69002');
    expect(r.immeuble.adr).toBe('7 rue Centrale');
  });

  it('compte les lots de copropriété (3)', () => {
    expect(r.logementsHint.lots).toBe(3);
  });
});

describe('acteExtract — cas dégradés / défensifs', () => {
  it('texte vide → type personne par défaut, objets vides, ne lève pas', () => {
    const r = acteExtract('');
    expect(r.type).toBe('personne');
    expect(r.entite).toEqual({});
    expect(r.immeuble).toEqual({});
    expect(r.logementsHint).toEqual({});
  });

  it('null → ne lève pas, objets vides', () => {
    const r = acteExtract(null);
    expect(r.entite).toEqual({});
    expect(r.immeuble).toEqual({});
  });

  it('undefined → ne lève pas, objets vides', () => {
    const r = acteExtract(undefined);
    expect(r.entite).toEqual({});
    expect(r.immeuble).toEqual({});
  });

  it('texte hors-sujet → rien d\'extrait (conservative)', () => {
    const r = acteExtract('Bonjour, ceci n\'est pas un acte de vente.');
    expect(r.entite.nom).toBeUndefined();
    expect(r.immeuble.ville).toBeUndefined();
    expect(r.entite.siren).toBeUndefined();
  });

  it('SIREN à 8 chiffres seulement → rejeté (on n\'invente pas)', () => {
    const txt = `ACQUÉREUR La société dénommée «X TEST», SCI,
      identifiée au numéro unique d'identification 12 345 678.`;
    const r = acteExtract(txt);
    expect(r.entite.siren).toBeUndefined();
  });
});

describe('norm — normalisation des espaces (contrainte pdf.js)', () => {
  it('collapse les espaces multiples et retours ligne', () => {
    expect(norm('  a\n\n  b   c  ')).toBe('a b c');
  });

  it('null/undefined → chaîne vide', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});
