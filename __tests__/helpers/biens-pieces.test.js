// BIENS étapes 5 et 6 — la liste des pièces du logement.
//
// Décision du 13/08 : l'ÉTAT DES LIEUX EST LA BASE. Le kit de démarrage reprend EDL_TPL et
// EDL_EXTRA VERBATIM. Un seul écart de libellé — « Meubles bas » au lieu de « Meubles bas
// (portes, étagères, tiroirs) » — dédouble la ligne dans l'état des lieux et ruine la reprise.
// Le test de NON-DIVERGENCE ci-dessous extrait EDL_TPL / EDL_EXTRA d'index.html et compare
// chaque nom de pièce et chaque élément du kit : c'est le contrôle qui aurait attrapé la faute
// du mockup (16 lignes de Cuisine réécrites à la main au lieu de 27).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  SECTIONS_NON_PIECES, elementVide, piecesParDefaut, catalogueKit, mouleChambre,
  prochainNomChambre, elementsModeleFor, designationPieces, typeDeduit,
  EC_LABELS, partiesCommunesDepuisImm
} from '../../js/core/biens-pieces.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

let indexHtml, EDL_TPL, EDL_EXTRA;

/** Extrait `const NOM = [ … ];` d'index.html et l'évalue (littéraux purs). */
function extractConstArray(html, nom) {
  const start = html.indexOf(`const ${nom} = [`);
  if (start === -1) return null;
  const end = html.indexOf('\n];', start);
  if (end === -1) return null;
  // eslint-disable-next-line no-new-func
  return new Function('return ' + html.slice(html.indexOf('[', start), end + 2))();
}

beforeAll(() => {
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  EDL_TPL = extractConstArray(indexHtml, 'EDL_TPL');
  EDL_EXTRA = extractConstArray(indexHtml, 'EDL_EXTRA');
  expect(EDL_TPL, 'EDL_TPL introuvable dans index.html').toBeTruthy();
  expect(EDL_EXTRA, 'EDL_EXTRA introuvable dans index.html').toBeTruthy();
});

describe('NON-DIVERGENCE — le kit reprend EDL_TPL / EDL_EXTRA à l\'identique', () => {
  it('chaque nom de pièce du kit existe TEL QUEL dans EDL_TPL ∪ EDL_EXTRA', () => {
    const connus = new Set([].concat(EDL_TPL, EDL_EXTRA).map(p => p.nom));
    catalogueKit(EDL_TPL, EDL_EXTRA).forEach(p => {
      expect(connus.has(p.nom), 'nom de pièce inventé : ' + p.nom).toBe(true);
    });
    piecesParDefaut(EDL_TPL).forEach(p => {
      expect(connus.has(p.nom), 'nom de pièce inventé : ' + p.nom).toBe(true);
    });
  });

  it('chaque élément du kit existe TEL QUEL dans la pièce correspondante', () => {
    const parNom = Object.create(null);
    [].concat(EDL_TPL, EDL_EXTRA).forEach(p => { parNom[p.nom] = p.e; });
    let elements = 0;
    catalogueKit(EDL_TPL, EDL_EXTRA).forEach(p => {
      expect(p.elements, 'pièce sans éléments : ' + p.nom).toEqual(parNom[p.nom]);
      elements += p.elements.length;
    });
    piecesParDefaut(EDL_TPL).forEach(p => {
      expect(p.elements.map(x => x.nom), 'divergence sur ' + p.nom).toEqual(parNom[p.nom]);
    });
    expect(elements).toBeGreaterThan(150);   // garde-fou : un kit tronqué se verrait ici
  });

  it('le module ne code AUCUN libellé de pièce ou d\'élément en dur', () => {
    const src = readFileSync(resolve(repoRoot, 'js/core/biens-pieces.js'), 'utf8');
    // seul libellé de pièce autorisé : la section non-pièce à exclure, et le moule « Chambre »
    ['Sol', 'Plinthes', 'Murs', 'Plafond', 'Autres observations', 'Meubles bas', 'Cuisine',
     'Séjour / Salon', 'Salle de bain', 'Entrée / Couloir'].forEach(lbl => {
      expect(src.includes("'" + lbl + "'"), 'libellé codé en dur : ' + lbl).toBe(false);
    });
  });

  it('« Chambre 1 » est bien le nom de EDL_TPL et « Chambre » le moule de EDL_EXTRA — mêmes éléments', () => {
    const tplCh = EDL_TPL.find(p => p.nom === 'Chambre 1');
    const moule = mouleChambre(EDL_TPL, EDL_EXTRA);
    expect(tplCh, '« Chambre 1 » attendue dans EDL_TPL').toBeTruthy();
    expect(moule.nom).toBe('Chambre');
    expect(moule.elements).toEqual(tplCh.e);   // pas un écart de vocabulaire : un nom construit
  });
});

describe('« Extérieurs / Communs » (dont le DAAF) reste à l\'EDL, jamais dans la liste du logement', () => {
  it('la section est exclue du kit et du catalogue', () => {
    expect(SECTIONS_NON_PIECES).toContain('Extérieurs / Communs');
    expect(piecesParDefaut(EDL_TPL).map(p => p.nom)).not.toContain('Extérieurs / Communs');
    expect(catalogueKit(EDL_TPL, EDL_EXTRA).map(p => p.nom)).not.toContain('Extérieurs / Communs');
  });

  it('RÉGRESSION RÉGLEMENTAIRE — la section porte bien le détecteur de fumée et reste dans EDL_TPL', () => {
    const sec = EDL_TPL.find(p => p.nom === 'Extérieurs / Communs');
    expect(sec, 'section supprimée de EDL_TPL — le DAAF ne se constaterait plus').toBeTruthy();
    expect(sec.e).toContain('Détecteur de fumée (DAAF)');
    // l'EDL générique continue de l'ajouter lui-même
    expect(indexHtml).toContain('_edlP.push(...EDL_TPL.map(');
  });

  it('la section n\'entre pas dans la clause du bail même si un EDL rempli l\'a fait entrer dans le template', () => {
    const pieces = [{ nom: 'Cuisine' }, { nom: 'Extérieurs / Communs' }];
    expect(designationPieces(pieces)).toBe('Cuisine');
  });
});

describe('designationPieces — clause « Désignation des pièces »', () => {
  it('regroupe les chambres à la position de la première', () => {
    const pieces = [{ nom: 'Entrée / Couloir' }, { nom: 'Séjour / Salon' }, { nom: 'Chambre 1' },
                    { nom: 'Cuisine' }, { nom: 'Chambre 2' }];
    expect(designationPieces(pieces)).toBe('Entrée / Couloir, Séjour / Salon, 2 chambres, Cuisine');
  });

  it('singulier avec une seule chambre', () => {
    expect(designationPieces([{ nom: 'Cuisine' }, { nom: 'Chambre 1' }])).toBe('Cuisine, 1 chambre');
  });

  it('rend la designation attendue pour le kit par défaut', () => {
    expect(designationPieces(piecesParDefaut(EDL_TPL)))
      .toBe('Entrée / Couloir, Séjour / Salon, Cuisine, WC, Salle de bain, 1 chambre');
  });

  it('liste vide ou dégradée → chaîne vide (l\'appelant garde son repli)', () => {
    expect(designationPieces([])).toBe('');
    expect(designationPieces(null)).toBe('');
    expect(designationPieces([{ nom: '   ' }, null])).toBe('');
  });

  it('garde les pièces libres ajoutées par l\'utilisateur', () => {
    expect(designationPieces([{ nom: 'Cuisine' }, { nom: 'Atelier de poterie' }]))
      .toBe('Cuisine, Atelier de poterie');
  });
});

describe('ajout de pièces', () => {
  it('prochainNomChambre numérote au-delà du plus grand numéro présent', () => {
    expect(prochainNomChambre([])).toBe('Chambre 1');
    expect(prochainNomChambre(piecesParDefaut(EDL_TPL))).toBe('Chambre 2');
    expect(prochainNomChambre([{ nom: 'Chambre 1' }, { nom: 'Chambre 4' }])).toBe('Chambre 5');
    expect(prochainNomChambre([{ nom: 'Chambre' }])).toBe('Chambre 2');
  });

  it('elementsModeleFor rend les éléments verbatim, chambres numérotées comprises', () => {
    expect(elementsModeleFor('Cuisine', EDL_TPL, EDL_EXTRA)).toEqual(EDL_TPL.find(p => p.nom === 'Cuisine').e);
    expect(elementsModeleFor('Chambre 3', EDL_TPL, EDL_EXTRA)).toEqual(mouleChambre(EDL_TPL, EDL_EXTRA).elements);
    expect(elementsModeleFor('Atelier de poterie', EDL_TPL, EDL_EXTRA)).toEqual([]);
  });

  it('elementVide produit la forme d\'élément attendue par l\'EDL', () => {
    expect(elementVide('Sol')).toEqual({ nom: 'Sol', etatE: '', obsE: '', photosE: [], etatS: '', obsS: '', photosS: [] });
  });
});

describe('typeDeduit', () => {
  it('compte les pièces principales (séjour/salon + chambres + bureau)', () => {
    expect(typeDeduit(piecesParDefaut(EDL_TPL))).toBe('T2');   // Séjour + Chambre 1
    expect(typeDeduit([{ nom: 'Séjour / Salon' }, { nom: 'Chambre 1' }, { nom: 'Chambre 2' }])).toBe('T3');
    expect(typeDeduit([{ nom: 'Séjour / Salon' }, { nom: 'Bureau' }])).toBe('T2');
  });

  it('cuisine, WC et salle de bain ne comptent pas', () => {
    expect(typeDeduit([{ nom: 'Cuisine' }, { nom: 'WC' }, { nom: 'Salle de bain' }])).toBe('');
  });
});

describe('partiesCommunesDepuisImm — la clause vient du BÂTIMENT, pas du lot', () => {
  it('reprend les cases cochées de la fiche immeuble, dans l\'ordre de la modale', () => {
    const imm = { equipementsCommuns: { interphone: true, local_velos: true, jardin_commun: true, customs: [] } };
    expect(partiesCommunesDepuisImm(imm)).toBe('Interphone, Local vélos, Jardin commun');
  });

  it('ajoute les équipements libres (customs) après les cases', () => {
    const imm = { equipementsCommuns: { ascenseur: true, customs: ['Toit-terrasse', ' Local poussettes '] } };
    expect(partiesCommunesDepuisImm(imm)).toBe('Ascenseur, Toit-terrasse, Local poussettes');
  });

  it('logement autonome (pas d\'immeuble) → vide, l\'appelant garde « Néant »', () => {
    expect(partiesCommunesDepuisImm(null)).toBe('');
    expect(partiesCommunesDepuisImm({})).toBe('');
    expect(partiesCommunesDepuisImm({ equipementsCommuns: { customs: [] } })).toBe('');
  });

  it('les libellés sont ceux des cases de la modale Immeuble', () => {
    EC_LABELS.forEach(([k, label]) => {
      expect(indexHtml, 'case imm-ec-' + k + ' introuvable').toContain('id="imm-ec-' + k + '"');
      expect(indexHtml, 'libellé divergent pour ' + k + ' : ' + label).toContain('id="imm-ec-' + k + '"> ' + label + '</label>');
    });
  });
});

describe('chaînage vers le bail — la liste devient une donnée CONTRACTUELLE', () => {
  it('la clause « Désignation des pièces » est générée, la surcharge libre gagne si remplie', () => {
    expect(indexHtml).toContain("piecesDesc:      src.piecesDesc || _lbDesignationPieces(src),");
    expect(indexHtml).toContain('BP.designationPieces(src.edlTemplate.pieces || [])');
  });

  it('la clause « Parties communes » vient de l\'IMMEUBLE, la surcharge du logement gagne si remplie', () => {
    expect(indexHtml).toContain("partiesCommunes: src.partiesCommunes || _lbPartiesCommunes(_imm),");
    expect(indexHtml).toContain('BP.partiesCommunesDepuisImm(imm)');
  });

  it('IMMUTABILITÉ — edlTemplate entre au bailSnapshot (les 2 chemins de capture)', () => {
    // Sans ça, la désignation d'un bail SIGNÉ ne serait pas figée : violation directe de
    // l'immutabilité que tout le reste du snapshot protège.
    expect(indexHtml).toContain('edlTemplate: log.edlTemplate');
    expect(indexHtml).toContain("'equipements:liveLog.equipements,edlTemplate:liveLog.edlTemplate'");
  });

  it('le repli est silencieux quand le module n\'est pas chargé (file://)', () => {
    expect(indexHtml).toContain('function _lbDesignationPieces(src) {');
    expect(indexHtml).toContain('function _lbPartiesCommunes(imm) {');
    expect(indexHtml).toMatch(/catch \(e\) \{ return ''; \}/);
  });
});

describe('chaînage vers l\'état des lieux', () => {
  it('la structure venant de la FICHE se charge SANS question (le confirm2 ne reste que pour « Sauv. template »)', () => {
    expect(indexHtml).toContain("const _vientDeLaFiche = _tpl._source === 'fiche';");
    expect(indexHtml).toContain('if(_vientDeLaFiche) { loadLogEDLTemplate(ref); return; }');
    // la modale marque bien sa provenance
    expect(indexHtml).toContain("_source: 'fiche'");
  });

  it('loadLogEDLTemplate ré-ajoute les sections qui ne sont pas des pièces (DAAF)', () => {
    expect(indexHtml).toContain('BP.SECTIONS_NON_PIECES.forEach(nom => {');
    expect(indexHtml).toContain('_edlP.push({ nom: sec.nom, elements: (sec.e || []).map(BP.elementVide) });');
  });

  it('la modale écrit dans log.edlTemplate.pieces — pas dans un nouveau champ — et préserve les clés', () => {
    expect(indexHtml).toContain('pieces: JSON.parse(_next),');
    expect(indexHtml).toContain("cles: (log.edlTemplate && log.edlTemplate.cles) || [],");
    expect(indexHtml).not.toContain('log.pieces =');
  });

  it('rien n\'est écrit si la liste n\'a pas changé (pas de churn de synchro)', () => {
    expect(indexHtml).toContain('if (_next !== _prev) {');
  });

  it('rien n\'est écrit si l\'écran ne portait pas la liste (P0-1)', () => {
    expect(indexHtml).toContain("if (el('log-pieces-list')) {");
  });
});
