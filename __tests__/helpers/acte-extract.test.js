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
import { acteExtract, acteRegroup, norm, motNombre, _normEtage } from './acte-extract.js';

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

// ═══════════════════════════════════════════════════════════════════════════
//  ENRICHISSEMENT (surfaces, lots, tantièmes, étages, annexes, cadastre, RCS)
//  + REGROUPEMENT (acteRegroup) — fixtures SYNTHÉTIQUES reproduisant la
//  STRUCTURE des 4 actes réels calibrés en local (jamais leur contenu réel).
// ═══════════════════════════════════════════════════════════════════════════

// ── Copropriété : lots 5+6 « Une chambre » + Carrez groupé « 5 et 6 : 34,79 m² »
//    → DOIT se regrouper en UN seul logement (cas ENGEL réel).
const ACTE_COPRO_CARREZ = `
ACTE DE VENTE

2) ACQUÉREUR
La société dénommée «IMMO TEST», Société Civile Immobilière,
dont le siège social est à STRASBOURG (67000), 10 rue de la Paix,
identifiée au numéro unique d'identification 123 456 789,
immatriculée au Registre du commerce et des sociétés de STRASBOURG sous le numéro D 123,
au capital de 1500 euros,
dénommée "L'ACQUEREUR".

DÉSIGNATION DES BIENS
Un immeuble situé à MULHOUSE (68100), 25 avenue du Test.
Contenance totale 12 a 21 ca.
Lot numéro cinq (5) - Une chambre Et les 10 / 1.000 èmes.
Lot numéro six (6) - Une chambre Et les 11 / 1.000 èmes.
Superficie des parties privatives - Lot numéro 5 et 6 : 34,79 m².
`;

// ── Copropriété : 2 lots avec Carrez INDIVIDUELS → 2 logements distincts (pas de fusion).
const ACTE_COPRO_INDIV = `
ACQUÉREUR
La société dénommée «DEUX TEST», SCI,
dont le siège social est à LYON (69001), 3 rue du Lot,
identifiée au numéro unique d'identification 222 333 444.

DÉSIGNATION DES BIENS
Un ensemble situé à LYON (69002), 7 rue Centrale.
Lot numéro trois (3) - Un studio Et les 8 / 1.000 èmes.
Lot numéro quatre (4) - Un studio Et les 9 / 1.000 èmes.
Lot numéro 3 : 20,00 m².
Lot numéro 4 : 15,50 m².
`;

// ── Immeuble entier énuméré par étage + surface totale + annexes (cas ALTA réel).
const ACTE_IMMEUBLE_ETAGES = `
ACQUÉREUR
La société dénommée «BATI TEST», SCI,
dont le siège social est à COLMAR (68000), 5 place du Marché,
identifiée au numéro unique d'identification 987 654 321,
immatriculée au RCS de COLMAR et identifiée au répertoire SIRENE.

DÉSIGNATION DES BIENS
Un immeuble situé à COLMAR (68000), 14 rue Haute, comprenant cinq appartements.
Contenance totale 03 a 06 ca.
Ledit immeuble comprenant :
• Au rez-de-chaussée : un appartement
• Au 1 er étage à droite : un appartement
• Au 1 er étage à gauche : un appartement
• Au 2 ème étage : un appartement
• Au 2 ème étage et 3 ème étage : un appartement
La surface habitable « totale » est de 433,18 m².
Avec trois garages ainsi que l'ensemble des parkings.
`;

// ── Personne physique + surface habitable individuelle.
const ACTE_PERSONNE_SURF = `
ACQUÉREUR
Monsieur Jean TEST, demeurant à MULHOUSE (68100), 8 rue des Fleurs.

DÉSIGNATION DES BIENS
Un appartement situé à COLMAR (68000), 14 rue Haute,
Objet du prêt : achat d'un appartement d'une surface habitable de 36m² comprenant 2 pièces.
`;

describe('acteExtract — enrichissement entité (RCS + capital, bloc acquéreur)', () => {
  it('extrait le RCS (ville en majuscules, s\'arrête au 1er mot minuscule)', () => {
    expect(acteExtract(ACTE_COPRO_CARREZ).entite.rcs).toBe('STRASBOURG');
  });

  it('ne capture PAS « et identifiée » dans le RCS (anti sur-capture)', () => {
    const r = acteExtract(ACTE_IMMEUBLE_ETAGES);
    expect(r.entite.rcs).toBe('COLMAR');
  });

  it('extrait le capital numérique uniquement', () => {
    expect(acteExtract(ACTE_COPRO_CARREZ).entite.capital).toBe('1500');
  });

  it('n\'invente pas de RCS pour une personne physique', () => {
    expect(acteExtract(ACTE_PERSONNE_SURF).entite.rcs).toBeUndefined();
  });
});

describe('acteExtract — enrichissement immeuble (cadastre + surfaces)', () => {
  it('extrait la contenance cadastrale', () => {
    expect(acteExtract(ACTE_COPRO_CARREZ).immeuble.contenance).toBe('12 a 21 ca');
  });

  it('extrait la surface totale en m² (≠ contenance)', () => {
    expect(acteExtract(ACTE_IMMEUBLE_ETAGES).immeuble.surfaceTotale).toBe('433,18');
  });

  it('extrait la surface habitable individuelle (« de 36m² »)', () => {
    expect(acteExtract(ACTE_PERSONNE_SURF).surfaceHabitable).toBe('36');
  });
});

describe('acteExtract — lots de copropriété (désignation + tantièmes + Carrez)', () => {
  const r = acteExtract(ACTE_COPRO_CARREZ);

  it('extrait chaque lot avec sa désignation', () => {
    expect(r.lots).toHaveLength(2);
    expect(r.lots[0]).toMatchObject({ num: 5, designation: 'Une chambre' });
    expect(r.lots[1]).toMatchObject({ num: 6, designation: 'Une chambre' });
  });

  it('extrait les tantièmes normalisés (10/1000)', () => {
    expect(r.lots[0].tantiemes).toBe('10/1000');
    expect(r.lots[1].tantiemes).toBe('11/1000');
  });

  it('extrait le groupe Carrez « 5 et 6 : 34,79 m² »', () => {
    expect(r.carrez).toHaveLength(1);
    expect(r.carrez[0].lots).toEqual([5, 6]);
    expect(r.carrez[0].surf).toBe('34,79');
  });

  it('extrait les Carrez individuels quand ils sont séparés', () => {
    const c = acteExtract(ACTE_COPRO_INDIV).carrez;
    expect(c).toEqual(
      expect.arrayContaining([
        { lots: [3], surf: '20,00' },
        { lots: [4], surf: '15,50' }
      ])
    );
  });
});

describe('acteExtract — immeuble entier (étages + types + annexes)', () => {
  const r = acteExtract(ACTE_IMMEUBLE_ETAGES);

  it('énumère les étages (5 logements) avec libellés normalisés', () => {
    expect(r.etages).toHaveLength(5);
    expect(r.etages.map(e => e.etage)).toEqual([
      'rez-de-chaussée', '1er étage', '1er étage', '2ème étage', '2ème étage et 3ème étage'
    ]);
  });

  it('capte la position (à droite / à gauche)', () => {
    expect(r.etages[1].position).toBe('à droite');
    expect(r.etages[2].position).toBe('à gauche');
  });

  it('détecte les annexes en prose (garages + parkings)', () => {
    const natures = r.annexesRaw.map(a => a.nature);
    expect(natures).toContain('garage');
    expect(natures).toContain('parking');
  });
});

describe('acteRegroup — fusion des lots en logements (D4)', () => {
  it('regroupe les lots 5+6 (Carrez commun) en UN logement', () => {
    const g = acteRegroup(acteExtract(ACTE_COPRO_CARREZ));
    expect(g.logements).toHaveLength(1);
    expect(g.logements[0]).toMatchObject({
      surf: '34,79', numApt: '5+6', tantiemes: '21/1000', _lots: [5, 6]
    });
  });

  it('émet une note de vérification lisible pour le regroupement', () => {
    const g = acteRegroup(acteExtract(ACTE_COPRO_CARREZ));
    expect(g.notes.join(' ')).toMatch(/regroup.*5.*6/i);
  });

  it('NE fusionne PAS deux lots aux Carrez individuels (conservateur)', () => {
    const g = acteRegroup(acteExtract(ACTE_COPRO_INDIV));
    expect(g.logements).toHaveLength(2);
    expect(g.logements.map(l => l.surf).sort()).toEqual(['15,50', '20,00']);
  });

  it('produit un logement par étage pour un immeuble entier', () => {
    const g = acteRegroup(acteExtract(ACTE_IMMEUBLE_ETAGES));
    expect(g.logements).toHaveLength(5);
    expect(g.logements[1]).toMatchObject({ etage: '1er étage', position: 'à droite' });
  });

  it('range les annexes (garage/parking) dans le bucket annexes, pas dans logements', () => {
    const g = acteRegroup(acteExtract(ACTE_IMMEUBLE_ETAGES));
    const natures = g.annexes.map(a => a.nature);
    expect(natures).toContain('garage');
    expect(natures).toContain('parking');
    expect(g.logements.every(l => !/garage|parking/i.test(l.type))).toBe(true);
  });

  it('défensif : entrée vide → logements/annexes/notes vides, ne lève pas', () => {
    const g = acteRegroup({});
    expect(g.logements).toEqual([]);
    expect(g.annexes).toEqual([]);
    expect(g.notes).toEqual([]);
  });
});

describe('helpers motNombre / _normEtage', () => {
  it('motNombre : mots FR → entiers, sinon null', () => {
    expect(motNombre('cinq')).toBe(5);
    expect(motNombre('SIX')).toBe(6);
    expect(motNombre('12')).toBe(12);
    expect(motNombre('bonjour')).toBeNull();
    expect(motNombre(null)).toBeNull();
  });

  it('_normEtage : nettoie les artefacts pdf.js', () => {
    expect(_normEtage('1 er étage')).toBe('1er étage');
    expect(_normEtage('2 ème étage')).toBe('2ème étage');
    expect(_normEtage('rez - de - chaussée')).toBe('rez-de-chaussée');
  });
});

// ── OCCUPATION / BAIL REPRIS (2026-06-03) ──────────────────────────────────
const ACTE_OCCUPE_2LOTS = `
DÉSIGNATION DES BIENS
Un immeuble situé à MULHOUSE (68100), 25 avenue du Test.
ÉTAT LOCATIF
Les lots numéros 5 et 6 sont actuellement loués à Monsieur LOCATAIRE TEST,
suivant bail en date du 01/09/2021, moyennant un loyer mensuel de 680 euros,
outre une provision pour charges de 50 euros et un dépôt de garantie de 680 euros.
`;
const ACTE_OCCUPE_PARTIEL = `
ÉTAT LOCATIF
Le bien est actuellement loué à Madame DUBOIS TEST suivant bail du 15/03/2023,
moyennant un loyer de 520 euros.
`;
const ACTE_LIBRE = `
DÉSIGNATION DES BIENS
Un studio situé à COLMAR (68000), 5 rue Test.
Le BIEN est vendu libre de toute location et occupation.
`;
const ACTE_LOYER_ANNUEL = `
ÉTAT LOCATIF
Bien loué à la société TEST suivant bail du 01/01/2020 moyennant un loyer annuel de 7200 euros.
`;

describe('acteExtract — occupation', () => {
  it('2 lots loués → 1 occupation complète, lots [5,6]', () => {
    const o = acteExtract(ACTE_OCCUPE_2LOTS).occupations;
    expect(o.length).toBe(1);
    expect(o[0].lots).toEqual([5, 6]);
    expect(o[0].locataire).toContain('LOCATAIRE TEST');
    expect(o[0].hc).toBe(680);
    expect(o[0].ch).toBe(50);
    expect(o[0].dg).toBe(680);
    expect(o[0].debut).toBe('2021-09-01');
  });
  it('partiel (loyer sans charges)', () => {
    const o = acteExtract(ACTE_OCCUPE_PARTIEL).occupations;
    expect(o.length).toBe(1);
    expect(o[0].hc).toBe(520);
    expect(o[0].ch).toBeFalsy();
    expect(o[0].debut).toBe('2023-03-15');
    expect(o[0].lots).toEqual([]);
  });
  it('vendu libre → aucune occupation', () => {
    expect(acteExtract(ACTE_LIBRE).occupations).toEqual([]);
  });
  it('loyer annuel → converti /12 + flag', () => {
    const o = acteExtract(ACTE_LOYER_ANNUEL).occupations;
    expect(o[0].hc).toBe(600);
    expect(o[0]._loyerAnnuel).toBe(true);
  });
  it('texte vide → []', () => {
    expect(acteExtract('').occupations).toEqual([]);
  });
});

describe('acteRegroup — rattachement occupation', () => {
  it('occupation lots [5,6] → rattachée au logement groupé 5+6', () => {
    const ext = {
      lots: [{ num: 5, designation: 'appartement' }, { num: 6, designation: 'appartement' }, { num: 7, designation: 'appartement' }],
      carrez: [{ lots: [5, 6], surf: '60,00' }],
      occupations: [{ lots: [5, 6], locataire: 'MARTIN TEST', hc: 680, ch: 50, debut: '2021-09-01' }],
    };
    const g = acteRegroup(ext);
    const grouped = g.logements.find(l => l._lots.includes(5) && l._lots.includes(6));
    expect(grouped.occupation).toBeTruthy();
    expect(grouped.occupation.locataire).toBe('MARTIN TEST');
    expect(grouped.occupation._matched).toBe(true);
    const lot7 = g.logements.find(l => l._lots.length === 1 && l._lots[0] === 7);
    expect(lot7.occupation).toBeFalsy();
  });
  it('occupation sans lot + 1 seul logement → rattachée à ce logement', () => {
    const ext = {
      logementsHint: { count: 'un', unit: 'logement' },
      occupations: [{ lots: [], locataire: 'DUBOIS TEST', hc: 520, debut: '2023-03-15' }],
    };
    const g = acteRegroup(ext);
    expect(g.logements.length).toBe(1);
    expect(g.logements[0].occupation.locataire).toBe('DUBOIS TEST');
  });
  it('occupation sans lot + plusieurs logements → non rattachée + note', () => {
    const ext = {
      lots: [{ num: 1, designation: 'appartement' }, { num: 2, designation: 'appartement' }],
      occupations: [{ lots: [], locataire: 'AMBIGU TEST', hc: 400 }],
    };
    const g = acteRegroup(ext);
    expect(g.logements.every(l => !l.occupation)).toBe(true);
    expect(g.notes.some(n => /sans lot identifiable/i.test(n))).toBe(true);
  });
});
