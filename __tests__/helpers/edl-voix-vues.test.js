/**
 * __tests__/helpers/edl-voix-vues.test.js — chantier EDL-VOIX-IA : vues de la dictée (charte mobile).
 * M-4 une action primaire · M-9/M-10 icône jamais seule, zéro emoji · M-13 ton neutre · M-14 pas de « … »
 * Les gestes ne commencent jamais par « edl[A-Z] » (ce préfixe déclenche l'autosave au clic).
 */
import { describe, it, expect } from 'vitest';
import * as V from '../../js/core/edl-voix-vues.js';
import { notice } from '../../js/core/ia-transparence.js';
import { messageErreur } from '../../js/core/ia-client.js';

const ic = (n) => `<svg class="uic" data-i="${n}"></svg>`;
// Mots entiers, lettres accentuées comprises (\b ASCII verrait « tes » dans « prêtes »).
const TUTOIE = /(?<!\p{L})(tu|te|toi|ton|ta|tes|vous|votre|vos)(?!\p{L})/iu;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const texte = (h) => h.replace(/<[^>]+>/g, ' ');

function verifierCharte(v) {
  const tout = [v.titre, v.sousTitre || '', v.corps, v.pied || ''].join(' ');
  expect(texte(tout)).not.toMatch(TUTOIE);
  expect(tout).not.toMatch(EMOJI);
  expect(texte(tout)).not.toMatch(/\.\.\.|…/);
  expect((v.pied || '').match(/evx-pri/g) || []).toHaveLength((v.pied || '').includes('evx-pri') ? 1 : 0);
  // aucun bouton sans texte visible
  for (const b of (tout.match(/<button[\s\S]*?<\/button>/g) || [])) expect(texte(b).trim().length).toBeGreaterThan(0);
  // aucun geste en edl[A-Z]
  for (const m of tout.matchAll(/onclick="([^"]+)"/g)) expect(m[1]).not.toMatch(/^\s*edl[A-Z]/);
}

describe('vues — lot B1', () => {
  it('barre de pièce, bouton PC, barre des compteurs : libellé + icône micro', () => {
    for (const h of [V.barrePiece(3, { ic }), V.boutonPiecePC(3, { ic }), V.barreCompteurs({ ic })]) {
      expect(h).toContain('data-i="mic"');
      expect(h).toMatch(/Dicter (la pièce|les relevés)/);
      expect(h).toMatch(/onclick="_edlVoixDicter(Compteurs)?\((3)?\)"/);
    }
  });
  it('notice : toutes les sections, deux choix', () => {
    const v = V.vueNotice(notice(), { ic });
    verifierCharte(v);
    expect(v.corps).toContain('Mistral AI');
    expect(v.pied).toContain('_edlVoixNoticeOk()');
    expect(v.pied).toContain('Pas maintenant');
  });
  it('enregistrement : minuteur, plafond, pause / reprise, rappel, éléments de la pièce', () => {
    const v = V.vueEnregistrement({ piece: 'Cuisine', mode: 'entree', sec: 54, elements: ['Sol', 'Évier'] }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('0:54');
    expect(v.corps).toContain('5:00 au plus');
    expect(v.corps).toContain('<span>Évier</span>');
    expect(v.pied).toContain('Pause');
    expect(v.pied).toContain('Terminer et analyser');
    expect(V.vueEnregistrement({ piece: 'Cuisine', pause: true }, { ic }).pied).toContain('Reprendre');
    expect(V.vueEnregistrement({ piece: 'Compteurs', cible: 'compteurs' }, { ic }).corps).toContain('dire l’index');
  });
  it('analyse : 3 étapes, non bloquant', () => {
    const v = V.vueAnalyse({ piece: 'Cuisine', duree: 54, ko: 412 }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('412 Ko');
    expect(v.corps).toContain('reste utilisable');
    expect(v.pied).not.toContain('evx-pri');
  });
  it('erreur : visuel + texte + au plus une action, saisie manuelle rappelée', () => {
    const v = V.vueErreur({ titre: 'Accès au micro refusé', texte: 'x', action: { onclick: '_edlVoixDemarrer()', libelle: 'Réessayer', icone: 'refresh' }, lien: { onclick: '_edlVoixImporter()', libelle: 'Importer un fichier audio à la place' } }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('La saisie à la main reste disponible');
    expect((v.pied.match(/evx-pri/g) || []).length).toBe(1);
  });
  it('bandeaux : prête / en attente réseau / en cours / échec ; suppression toujours possible en cas d’échec', () => {
    const pret = V.banniere({ id: 'a', etape: 'pret', duree: 54, resultat: { propositions: [1, 2, 3], compteurs: [], aAjouter: [1] }, decisions: { 0: 'ok' } }, { ic, message: messageErreur });
    expect(pret).toContain('Propositions prêtes : 3 éléments');
    expect(pret).toContain("_edlVoixRelire('a')");
    expect(pret).toContain('3 à valider');
    const off = V.banniere({ id: 'b', etape: 'audio', duree: 54, erreur: { code: 'offline' } }, { ic, message: messageErreur });
    expect(off).toContain('Pas de réseau');
    expect(off).toContain('Supprimer la dictée');
    expect(off).toContain('Réessayer');
    const quota = V.banniere({ id: 'c', etape: 'audio', erreur: { code: 'quota', motif: 'audio' } }, { ic, message: messageErreur });
    expect(quota).toContain('Réessayer');                       // geste manuel toujours possible
    const fmt = V.banniere({ id: 'e', etape: 'audio', erreur: { code: 'format' } }, { ic, message: messageErreur });
    expect(fmt).not.toContain('Réessayer');                     // inutile : même fichier, même refus
    expect(fmt).toContain('Supprimer la dictée');
    expect(V.banniere({ id: 'd', etape: 'texte', duree: 5 }, { ic, message: messageErreur })).toContain('Préparation des propositions');
    for (const h of [pret, off, quota]) expect(texte(h)).not.toMatch(TUTOIE);
  });
  it('échappement : un nom de pièce piégé ne s’exécute pas', () => {
    const v = V.vueEnregistrement({ piece: 'x', elements: ['<img src=x onerror=alert(1)>'] }, { ic });
    expect(v.corps).not.toContain('<img');
    expect(V.esc('"<\'&>')).toBe('&quot;&lt;&#39;&amp;&gt;');
  });
});

describe('vues — lots B2 / B3 (relecture)', () => {
  const PROP = { elementId: '7', etat: "État d'usage", observation: 'Rayures.', source: 'vasque évier avec rayures', justification: '« avec rayures »', aVerifier: 'Marque à confirmer.' };
  const ligne = (o = {}) => ({ cle: 'p:7', prop: PROP, ei: 7, introuvable: false, nom: 'Évier', statut: '', remplace: { oui: false }, entreeRef: null, actuel: { etat: '', obs: '' }, corrections: [{ entendu: 'vasque', compris: 'évier' }], ...o });
  const modele = (o = {}) => ({
    lignes: [ligne(), ligne({ cle: 'p:0', nom: 'Sol', prop: { ...PROP, elementId: '0', etat: null, justification: null, aVerifier: null } })],
    ajouts: [{ cle: 'a:0', a: { nom: 'Machine à café', observation: 'Encastrée.', source: 'machine à café' }, statut: '' }],
    compteurs: [{ cle: 'c:gaz', k: { cle: 'gaz', source: 'gaz 2 314' }, libelle: 'Gaz · index (m³)', valeur: '2314', statut: '', actuel: '', bloque: null, entree: '', remplace: false }],
    nonCites: ['Murs', 'Plafond'], bilan: { total: 4, inscrites: 0, ignorees: 0, aValider: 4 }, enAttente: 2, ...o });
  it('écran des propositions : mention IA sur CHAQUE carte, extrait entendu, justification, à vérifier, non cités', () => {
    const v = V.vuePropositions({ item: { id: 'x1' }, m: modele(), piece: 'Cuisine', sortie: false, duree: 54 }, { ic });
    verifierCharte(v);
    expect((v.corps.match(/Proposé par l’IA, à vérifier/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(v.corps).toContain('« vasque évier avec rayures »');
    expect(v.corps).toContain('Compris : <s>vasque</s> → évier');
    expect(v.corps).toContain('« avec rayures »');
    expect(v.corps).toContain('Marque à confirmer.');
    expect(v.corps).toContain('État non dicté');
    expect(v.corps).toContain('Murs · Plafond');
    expect(v.corps).toContain('Ajouter à la pièce');
    expect(v.corps).toContain('validation une par une');
    expect(v.pied).toContain('Tout accepter');
    expect(v.pied).toContain('Terminer la relecture');
  });
  it('Accepter / Modifier / Ignorer ; « Tout accepter » absent quand une seule ligne attend', () => {
    const v = V.vuePropositions({ item: { id: 'x1' }, m: modele({ enAttente: 1 }), piece: 'Cuisine', duree: 5 }, { ic });
    expect(v.corps).toContain("_edlVoixAccepter('x1','p:7')");
    expect(v.corps).toContain("_edlVoixModifier('x1','p:7')");
    expect(v.corps).toContain("_edlVoixIgnorer('x1','p:7')");
    expect(v.pied).not.toContain('Tout accepter');
  });
  it('inscrit → « Annuler » ; ignoré → « Rétablir » ; remplacement annoncé ; sortie : entrée signée en référence', () => {
    const v = V.vuePropositions({ item: { id: 'x' }, m: modele({ lignes: [ligne({ statut: 'ok' }), ligne({ cle: 'p:1', statut: 'ign' }), ligne({ cle: 'p:2', remplace: { oui: true, etat: 'Bon état', obs: null }, entreeRef: { etat: 'Bon état', obs: 'Signée.' } })] }), piece: 'Cuisine', sortie: true, duree: 5 }, { ic });
    expect(v.corps).toContain("_edlVoixAnnuler('x','p:7')");
    expect(v.corps).toContain("_edlVoixRetablir('x','p:1')");
    expect(v.corps).toContain('Remplace la saisie actuelle : Bon état');
    expect(v.corps).toContain('Entrée signée');
    expect(v.corps).toContain('<span class="k">Sortie</span>');
  });
  it('aucun élément reconnu : état vide soigné', () => {
    const v = V.vuePropositions({ item: { id: 'x' }, m: modele({ lignes: [], ajouts: [], compteurs: [], nonCites: [], bilan: { total: 0, inscrites: 0, ignorees: 0, aValider: 0 }, enAttente: 0 }), piece: 'Cuisine', duree: 5 }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('Aucun élément reconnu');
  });
  it('modifier : 5 états + « Aucun », champ observation ; note sans état ; relevé : champ décimal', () => {
    const v = V.vueModifier({ id: 'x', cle: 'p:7', nom: 'Évier', prop: PROP, sortie: false }, { ic });
    verifierCharte(v);
    expect((v.corps.match(/class="evx-st"/g) || []).length).toBe(6);
    expect(v.corps).toContain('id="evx-obs"');
    const n = V.vueModifier({ id: 'x', cle: 'p:24', nom: 'Autres observations', prop: PROP, note: true }, { ic });
    expect(n.corps).not.toContain('evx-st');
    const c = V.vueModifier({ id: 'x', cle: 'c:gaz', nom: 'Gaz', compteur: { valeur: '2314', source: 'gaz', libelle: 'Gaz · index (m³)', numero: false } }, { ic });
    expect(c.corps).toContain('inputmode="decimal"');
  });
  it('tout accepter : compte, remplacements nommés, « à vérifier » listés, ajouts et compteurs exclus', () => {
    const v = V.vueToutAccepter({ id: 'x', m: modele({ lignes: [ligne({ remplace: { oui: true, etat: 'Bon état', obs: null } }), ligne({ cle: 'p:0', nom: 'Sol', prop: { ...PROP, aVerifier: null } })] }), piece: 'Cuisine' }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('Inscrire les 2 propositions en attente');
    expect(v.corps).toContain('Bon état → État d&#39;usage');
    expect(v.corps).toContain('Marquées « à vérifier » (1)');
    expect(v.corps).toContain('se confirment un par un');
  });
  it('transcription : horodatée, corrections surlignées, effacée après relecture', () => {
    const v = V.vueTranscription({ item: { id: 'x', cree: '2026-10-14T08:42:00Z', duree: 54, segments: [{ start: 24.3, text: "car l'âge de sol en ciment" }], resultat: { corrections: [{ entendu: "car l'âge", compris: 'carrelage' }] }, contexte: { pieceNom: 'Cuisine' } } }, { ic });
    verifierCharte(v);
    expect(v.corps).toContain('<mark>car l&#39;âge</mark>');
    expect(v.corps).toContain('0:24');
    expect(v.corps).toContain('enregistrement supprimé');
  });
});
