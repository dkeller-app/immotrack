// BIENS — corrections du 2e audit code-reviewer (verdict initial : NE PAS DÉPLOYER).
//
// Cinq familles : le Wizard 2044 orphelin (bloquant), trois régressions déjà en production,
// quatre risques légaux sur l'état des lieux, et la photo de couverture.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { choisirCouverture } from '../../js/core/cover-photo.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  if (end === -1) return null;
  return src.slice(start, end + 2).replace(/\r/g, '');
}

// ════════════════════════════════════════════════════════════════════════════
describe('BLOQUANT — le Wizard 2044 a retrouvé un point d\'entrée', () => {
  it('openWizard2044 est appelé quelque part (il ne l\'était plus)', () => {
    // Son SEUL appelant vivait dans _renderEntFichePanelComptaGlobale, débranché à l'étape 10.
    // Tombaient avec lui _renderWizard2044, ses 4 étapes, le mapping éditable et _print2044 —
    // UNIQUE chemin d'impression du CERFA 2044. Finances sort un CSV, pas le formulaire.
    const appels = (html.match(/openWizard2044\(/g) || []).length;
    expect(appels, 'définition + au moins un appelant').toBeGreaterThanOrEqual(2);
  });

  it('le bouton vit dans l\'entête de la fiche bailleur, avec son sélecteur d\'année', () => {
    const heroActions = html.slice(html.indexOf('onclick="openNewEnt(${+ent.id})"'));
    const bloc = heroActions.slice(0, heroActions.indexOf('</div>'));
    expect(bloc).toContain('openWizard2044(${+ent.id})');
    expect(bloc).toContain('setEntFicheComptaYear(this.value)');
    expect(bloc).toContain('_ent2044YearOptions()');
  });

  it('la chaîne complète du 2044 est intacte', () => {
    ['openWizard2044', '_renderWizard2044', '_print2044', '_ent2044YearOptions', 'setEntFicheComptaYear']
      .forEach(fn => expect(html, fn + ' manquante').toContain('function ' + fn + '('));
  });

  it('_ent2044YearOptions propose l\'exercice courant et les 4 précédents', () => {
    const src = extractFn(html, '_ent2044YearOptions');
    // eslint-disable-next-line no-new-func
    const fn = new Function('_entFicheComptaYear', src + '\nreturn _ent2044YearOptions();');
    const courante = new Date().getFullYear();
    const out = fn(courante - 2);
    expect((out.match(/<option/g) || []).length).toBe(5);
    expect(out).toContain('value="' + courante + '"');
    expect(out).toContain('value="' + (courante - 4) + '"');
    expect(out).toContain('value="' + (courante - 2) + '" selected');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('RÉGRESSION PROD — un bail SIGNÉ ne se voit plus réécrire ses clauses', () => {
  it('aucune clause n\'est générée quand on lit un snapshot signé', () => {
    // En prod depuis v15.507 : un bail signé dont partiesCommunes était vide affichait « Néant »
    // au moment de la signature et affichait ensuite une liste GÉNÉRÉE → le document réédité
    // différait de celui qui avait été signé. Le snapshot fige la DONNÉE, pas la règle de rendu.
    expect(html).toContain("piecesDesc:      src.piecesDesc || (_isSignedSnapshot ? '' : _lbDesignationPieces(src)),");
    expect(html).toContain("partiesCommunes: src.partiesCommunes || (_isSignedSnapshot ? '' : _lbPartiesCommunes(_imm)),");
  });

  it('la génération reste active sur un bail NON signé (c\'est tout l\'intérêt)', () => {
    const src = extractFn(html, '_readLogForBail');
    expect(src).toContain('_lbDesignationPieces(src)');
    expect(src).toContain('_lbPartiesCommunes(_imm)');
  });

  it('la clause générée n\'est JAMAIS recopiée en surcharge sur le logement', () => {
    // Sinon le texte est gravé : ajouter une chambre ne met plus le bail à jour, et on réintroduit
    // la 3e source que le chantier supprime.
    expect(html).not.toContain('if(!log.piecesDesc && bail.piecesDesc) log.piecesDesc = bail.piecesDesc;');
    expect(html).not.toContain('if(!log.partiesCommunes && bail.partiesCommunes) log.partiesCommunes = bail.partiesCommunes;');
  });

  it('readBailForm ne réécrit toujours pas ces champs sur le bail (décision B3)', () => {
    expect(html).not.toMatch(/piecesDesc:\s*v\('b-piecesDesc'\)/);
    expect(html).not.toMatch(/partiesCommunes:\s*v\('b-partiesCommunes'\)/);
  });
});

describe('RÉGRESSION PROD — log.notes a retrouvé un lecteur', () => {
  it('les notes du bien sont rendues dans l\'onglet Bail, hors du bloc « bail en cours »', () => {
    // Elles décrivent le BIEN (accès, codes, équipements particuliers), pas le contrat : elles
    // doivent rester lisibles sur un logement vacant. Elles étaient devenues écriture seule.
    const src = extractFn(html, '_renderLogFichePanelBail');
    expect(src).toContain('const notesSection = log.notes ?');
    expect(src).toContain('Notes sur le bien');
    expect(src).toContain('${_renderLogFichePanelEDL(log, ref)}${notesSection}');
    // hors du if(bail) : la section est construite après la branche
    expect(src.indexOf('const notesSection')).toBeGreaterThan(src.indexOf('Aucun bail en cours'));
  });

  it('log.notes est toujours écrit par la modale (le champ n\'a pas disparu)', () => {
    expect(html).toContain("log.notes = v('log-notes');");
    expect(html).toContain('id="log-notes"');
  });
});

describe('RÉGRESSION PROD — enregistrer un relevé rafraîchit l\'écran réellement affiché', () => {
  it('les 3 points de saisie passent par _rafraichirApresReleve', () => {
    // Depuis la fiche immeuble (onglet Charges communes), rLogFiche() ne rafraîchissait rien :
    // le toast disait « enregistré » devant un écran figé, et l'utilisateur ressaisissait.
    expect((html.match(/_rafraichirApresReleve\(\);/g) || []).length).toBe(3);
    expect(html).toContain('function _rafraichirApresReleve()');
  });

  it('le helper choisit la fiche immeuble ou la fiche logement selon la page courante', () => {
    const src = extractFn(html, '_rafraichirApresReleve');
    expect(src).toContain("currentPage === 'imm-fiche'");
    expect(src).toContain('rImmFiche()');
    expect(src).toContain('rLogFiche()');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('RISQUE LÉGAL EDL — le détecteur de fumée (DAAF)', () => {
  const src = () => extractFn(html, 'loadLogEDLTemplate');

  it('FAIL-CLOSED — la section est retrouvée sans dépendre d\'un module', () => {
    // `if (BP && …)` échouait OUVERT : sans window.BiensPieces, l'EDL partait SANS la ligne
    // détecteur de fumée, et elle est irrécupérable depuis l'UI. EDL_TPL est inline : il suffit.
    const s = src();
    expect(s).toContain("['Extérieurs / Communs']");
    expect(s).not.toMatch(/if \(BP && typeof EDL_TPL/);
    expect(s).toContain('const sec = EDL_TPL.find(p => p && p.nom === nom);');
  });

  it('ANTI-DOUBLON ROBUSTE — la comparaison de noms est normalisée', () => {
    // Les noms de pièces sont éditables dans l'EDL puis re-sauvés en template : une égalité
    // stricte laissait passer « Exterieurs/Communs » et produisait DEUX sections DAAF aux états
    // contradictoires — EDL inopposable.
    expect(src()).toContain('_edlNomEquivalent(p.nom, nom)');
    const cmp = extractFn(html, '_edlNomEquivalent');
    // eslint-disable-next-line no-new-func
    const eq = new Function(cmp + '\nreturn _edlNomEquivalent;')();
    expect(eq('Extérieurs / Communs', 'Extérieurs / Communs')).toBe(true);
    expect(eq('Exterieurs/communs', 'Extérieurs / Communs')).toBe(true);
    expect(eq('EXTÉRIEURS - COMMUNS', 'Extérieurs / Communs')).toBe(true);
    expect(eq('  extérieurs   communs  ', 'Extérieurs / Communs')).toBe(true);
    expect(eq('Cuisine', 'Extérieurs / Communs')).toBe(false);
    expect(eq('', '')).toBe(false);
    expect(eq(null, undefined)).toBe(false);
  });
});

describe('RISQUE LÉGAL EDL — la source unique vaut pour les DEUX points d\'entrée', () => {
  it('_edlPrefill charge la structure du logement (« + Nouvel EDL » de la page EDL)', () => {
    // Sans ça, la « source unique » n'était tenue que depuis la fiche du bien : depuis la page
    // EDL on repartait sur la structure générique, « Chambre 2 » à rajouter à la main.
    const src = extractFn(html, '_edlPrefill');
    expect(src).toContain('loadLogEDLTemplate(ref)');
    expect(src).toContain('!_edlAUneSaisie()');
  });

  it('… mais JAMAIS par-dessus une saisie en cours', () => {
    const cmp = extractFn(html, '_edlAUneSaisie');
    // eslint-disable-next-line no-new-func
    const mk = (edlP) => new Function('_edlP', cmp + '\nreturn _edlAUneSaisie();')(edlP);
    expect(mk([{ nom: 'Cuisine', elements: [{ nom: 'Sol' }] }])).toBe(false);
    expect(mk([{ nom: 'Cuisine', elements: [{ nom: 'Sol', etatE: 'Bon' }] }])).toBe(true);
    expect(mk([{ nom: 'Cuisine', elements: [{ nom: 'Sol', obsS: 'rayure' }] }])).toBe(true);
    expect(mk([{ nom: 'Cuisine', elements: [{ nom: 'Sol', photosE: [{ idbKey: 'x' }] }] }])).toBe(true);
    expect(mk([])).toBe(false);
    expect(mk(undefined)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('photo de couverture — logique pure sortie du monolithe', () => {
  const docs = [
    { id: 1, parentType: 'logement', parentId: 9, category: 'photos', uploadedAt: '2026-01-01' },
    { id: 2, parentType: 'logement', parentId: 9, category: 'photos', uploadedAt: '2026-03-01' },
    { id: 3, parentType: 'logement', parentId: 9, category: 'documents', uploadedAt: '2026-05-01' },
    { id: 4, parentType: 'immeuble', parentId: 9, category: 'photos', uploadedAt: '2026-06-01' }
  ];

  it('sans ⭐ : la première de la galerie, c\'est-à-dire la plus récente', () => {
    expect(choisirCouverture(docs, 'logement', 9).id).toBe(2);
  });

  it('⭐ explicite : elle passe devant, même plus ancienne', () => {
    const d = docs.map(x => x.id === 1 ? { ...x, isCover: true } : x);
    expect(choisirCouverture(d, 'logement', 9).id).toBe(1);
  });

  it('ne mélange ni les catégories ni les parents', () => {
    expect(choisirCouverture(docs, 'logement', 9).category).toBe('photos');
    expect(choisirCouverture(docs, 'immeuble', 9).id).toBe(4);
    expect(choisirCouverture(docs, 'logement', 999)).toBe(null);
  });

  it('ignore les tombstones', () => {
    const d = docs.map(x => x.id === 2 ? { ...x, _deleted: true } : x);
    expect(choisirCouverture(d, 'logement', 9).id).toBe(1);
  });

  it('entrées dégradées', () => {
    expect(choisirCouverture(null, 'logement', 9)).toBe(null);
    expect(choisirCouverture(docs, '', 9)).toBe(null);
    expect(choisirCouverture(docs, 'logement', null)).toBe(null);
    expect(choisirCouverture([], 'logement', 9)).toBe(null);
  });

  it('ne mute pas la collection reçue', () => {
    const copie = JSON.parse(JSON.stringify(docs));
    choisirCouverture(docs, 'logement', 9);
    expect(docs).toEqual(copie);
  });
});

describe('photo de couverture — le rendu ne laisse jamais un carré vide', () => {
  const src = () => extractFn(html, '_coverImg');

  it('un repli visible est émis AVANT que le binaire n\'arrive', () => {
    expect(src()).toContain('cover-wrap');
    expect(src()).toContain('iconeParDefaut');
  });

  it('onload / onerror pilotent la bascule (photo introuvable → l\'icône reste)', () => {
    expect(src()).toContain('onload="_coverShow(');
    expect(src()).toContain('onerror="_coverFallback(');
    expect(html).toContain('function _coverShow(');
    expect(html).toContain('function _coverFallback(');
  });

  it('les vignettes se chargent en SÉQUENTIEL, pas N téléchargements parallèles', () => {
    // Une page Biens de 30 bulles planifiait 30 setTimeout → 30 téléchargements parallèles de
    // photos pleine résolution au premier affichage. La galerie de référence boucle en séquentiel.
    expect(src()).toContain('_coverQueue.push(');
    expect(src()).not.toContain('setTimeout(() => _loadCoverThumb');
    const drain = extractFn(html, '_coverDrainQueue');
    expect(drain).toContain('while (_coverQueue.length)');
    expect(drain).toContain('await _attachmentLoadBinary(photo)');
  });

  it('non-divergence — le shadow inline est identique au module', () => {
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/cover-photo.js'), 'utf8').replace(/^export /gm, '');
    expect(extractFn(html, 'choisirCouverture')).toBe(extractFn(moduleSrc, 'choisirCouverture'));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('mineurs', () => {
  it('les relevés incluent les logements ARCHIVÉS (ils gardent leurs relevés)', () => {
    const src = extractFn(html, '_renderImmRelevesLogements');
    expect(src).toContain('function _renderImmRelevesLogements(activeLogs, archivedLogs)');
    expect(src).toContain('[].concat(activeLogs || [], archivedLogs || [])');
    expect(src).toContain("l.archived ? ' (archivé)' : ''");
    // les 2 `return` de Charges communes (cas nominal + état vide) passent la liste complète
    expect((html.match(/\+ _renderImmRelevesLogements\(activeLogs, archivedLogs\);/g) || []).length).toBe(2);
  });

  it('le token CSS --rs (inexistant) a disparu', () => {
    const css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
    expect(css).not.toContain('var(--rs');
  });

  it('la grille d\'onglets sur téléphone s\'adapte au NOMBRE d\'onglets', () => {
    // `1fr 1fr` en dur laissait la fiche bailleur (1 onglet) avec un bouton sur la moitié gauche.
    const css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
    expect(css).toContain('.logf-subtabs[role="tablist"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))');
  });

  it('DIVERGENCE CONNUE — DEFAULT_PIECES (écran Réglages) n\'est pas le vocabulaire de l\'EDL', () => {
    // Constat de l'audit, laissé en l'état volontairement : DB.piecesEDL (semé depuis
    // DEFAULT_PIECES) n'alimente QUE l'écran Réglages « Pièces EDL ». Le moteur d'état des lieux,
    // lui, part de EDL_TPL / EDL_EXTRA. Aligner les libellés changerait le contenu d'un écran de
    // réglages sans mandat — c'est un arbitrage produit, pas une correction. Ce test VERROUILLE
    // le fait que l'écran est bien inerte, pour que personne ne suppose l'inverse.
    expect(html).toContain('const DEFAULT_PIECES = {');
    expect(html).toContain('if (!DB.piecesEDL) DB.piecesEDL = {...DEFAULT_PIECES};');
    // aucun consommateur de DB.piecesEDL dans le moteur EDL (openNewEDL part de EDL_TPL)
    const openNew = extractFn(html, 'openNewEDL');
    expect(openNew).toContain('EDL_TPL.map(');
    expect(openNew).not.toContain('piecesEDL');
    expect(extractFn(html, 'loadLogEDLTemplate')).not.toContain('piecesEDL');
  });
});
