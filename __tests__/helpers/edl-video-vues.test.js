/**
 * __tests__/helpers/edl-video-vues.test.js — chantier EDL-VIDEO-IA : vues de l'état des lieux filmé.
 * Charte mobile : M-4 une action primaire · M-10 jamais d'icône seule · M-13 ton neutre · M-14 pas de « … »
 * Gestes jamais en « edl[A-Z] » (autosave au clic). Textes variables échappés.
 */
import { describe, it, expect } from 'vitest';
import * as W from '../../js/core/edl-video-vues.js';
import * as V from '../../js/core/edl-voix-vues.js';
import { noticeVideo, mentionPdf, MENTION_PDF, MENTION_PDF_VIDEO, edlAPhotosVideo, versionNoticeVideo } from '../../js/core/ia-transparence.js';
import { lignesAccord, peutFilmer, lignesAccordAvec } from '../../js/core/edl-video.js';

const ic = (n) => `<svg class="uic" data-i="${n}"></svg>`;
const TUTOIE = /(?<!\p{L})(tu|te|toi|ton|ta|tes|vous|votre|vos)(?!\p{L})/iu;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const texte = (h) => h.replace(/<[^>]+>/g, ' ');
function charte(v) {
  const tout = [v.titre, v.sousTitre || '', v.corps, v.pied || ''].join(' ');
  expect(texte(tout)).not.toMatch(TUTOIE);
  expect(tout).not.toMatch(EMOJI);
  expect(texte(tout)).not.toMatch(/\.\.\.|…/);
  expect((v.pied || '').match(/evx-pri/g) || []).toHaveLength((v.pied || '').includes('evx-pri') ? 1 : 0);
  for (const b of (tout.match(/<button[\s\S]*?<\/button>/g) || [])) expect(texte(b).trim().length).toBeGreaterThan(0);
  for (const m of tout.matchAll(/onclick="([^"]+)"/g)) expect(m[1]).not.toMatch(/^\s*edl[A-Z]/);
}
const src = (id) => `data:image/jpeg;base64,${id}`;

describe('vues vidéo', () => {
  it('barre de pièce et boutons PC : « Filmer la pièce » + « Dicter seulement », libellés + icônes', () => {
    for (const h of [W.barrePieceVideo(2, { ic }), W.boutonsPiecePCVideo(2, { ic })]) {
      expect(h).toContain('_edlVideoFilmer(2)');
      expect(h).toContain('_edlVoixDicter(2)');
      expect(h).toMatch(/data-i="video"[^<]*<\/svg> Filmer la pièce/);
      expect(h).toContain('Dicter seulement');
    }
  });
  it('accord : case jamais pré-cochée, bouton Filmer désactivé tant que l’accord manque, refus possible', () => {
    const lignes = lignesAccord(['Claire Martin', '<b>Paul</b>']);
    const v = W.vueAccord({ notice: noticeVideo(), lignes, peut: peutFilmer(lignes).ok }, { ic });
    charte(v);
    expect(v.corps.match(/aria-checked="true"/g)).toBeNull();
    expect(v.pied).toMatch(/_edlVideoAccordOk\(\)"[^>]* disabled/);
    expect(v.pied).toContain('Continuer sans vidéo');
    expect(v.corps).toContain('&lt;b&gt;Paul&lt;/b&gt;');
    expect(v.corps).toContain('article 7-1');
    lignes.forEach((l) => { l.accord = true; });
    const ok = W.vueAccord({ notice: noticeVideo(), lignes, peut: peutFilmer(lignes).ok }, { ic });
    expect(ok.pied).not.toMatch(/disabled/);
    expect(ok.corps.match(/aria-checked="true"/g)).toHaveLength(2);
  });
  it('accord déjà donné : ligne cochée et FIGÉE (aucun geste) ; notice : où est stockée la vidéo, litige ; version = empreinte du texte', () => {
    const lignes = lignesAccordAvec('Claire, Paul', [{ nom: 'Claire', accord: true, at: 'x' }]);
    const v = W.vueAccord({ notice: noticeVideo(), lignes, peut: false }, { ic });
    charte(v);
    expect(v.corps).toContain('accord déjà donné pour cet état des lieux');
    expect(v.corps).not.toContain('_edlVideoAccordCocher(0)');
    expect(v.corps).toContain('_edlVideoAccordCocher(1)');
    const n = noticeVideo();
    expect(JSON.stringify(n)).toMatch(/Union européenne/);
    expect(JSON.stringify(n)).toMatch(/litige en cours/);
    expect(versionNoticeVideo(n)).toMatch(/^nv-[0-9a-f]{8}$/);
    expect(versionNoticeVideo({ ...n, intro: n.intro + ' ' })).not.toBe(versionNoticeVideo(n));
  });
  it('viseur : vidéo muette inline, minuteur, 3 min, une action primaire, classe plein écran', () => {
    const v = W.vueFilmer({ piece: 'Cuisine', mode: 'entree', sec: 41, max: 180, elements: ['Sol', 'Évier'] }, { ic });
    charte(v);
    expect(v.corps).toMatch(/<video id="evx-viseur"[^>]*muted[^>]*playsinline/);
    expect(v.corps).toContain('3:00 au plus');
    expect(v.classe).toBe('evx-film');
    expect(W.vueFilmer({ piece: 'Cuisine', pause: true }, { ic }).pied).toContain('Reprendre');
  });
  it('traitement et envoi : étapes, barre de progression, trop lourd (plan gratuit) nommé', () => {
    const v = W.vueTraitement({ piece: 'Cuisine', duree: 59, mo: 7.1, images: 80, empreinte: 'a'.repeat(64), etape: 'photos', envoi: { etat: 'envoi', envoyes: 3 * 1048576, total: 7 * 1048576 } }, { ic });
    charte(v);
    expect(v.corps).toContain('7,1 Mo');
    expect(v.corps).toContain('aria-valuenow="43"');
    const lourd = W.blocEnvoi({ etat: 'trop_lourd', total: 60 * 1048576, maxMo: 50 }, { ic });
    expect(texte(lourd)).toMatch(/50 Mo par fichier/);
    expect(W.blocEnvoi({ etat: 'abri', total: 1048576 }, { ic })).toContain('à l’abri');
  });
  it('vignettes : instant mm:ss, Écarter / Reprendre, image échappée ; carte « vu, pas dit » sans état', () => {
    const images = [{ imageId: 'i1', t: 41, cadre: {} }, { imageId: 'i2', t: 33, cadre: {} }];
    const h = W.blocPhotos({ itemId: 'x', eid: '13', images, vu: 'Rayures <visibles>', ecartees: { '13|i2': true }, src }, { ic });
    expect(h).toContain('00:41');
    expect(h).toContain('Reprendre');
    expect(h).toContain('Rayures &lt;visibles&gt;');
    // Seule une image en data URL entre dans le style (jamais une URL ni du CSS injecté).
    const pi = W.blocPhotos({ itemId: 'x', eid: '1', images: [{ imageId: 'a', t: 1 }], src: () => "x');background:url(https://mal.test/", personnes: new Set(['a']) }, { ic });
    expect(pi).not.toContain('mal.test');
    expect(pi).toContain('Personne visible');
    const c = W.carteVu({ itemId: 'x', eid: '4', nom: 'Fenêtre', images, vu: null, ecartees: {}, statut: '', src }, { ic });
    expect(c).toContain('Aucun état proposé');
    expect(c).toContain('_edlVideoGarderVu(');
    expect(W.carteVu({ itemId: 'x', eid: '4', nom: 'F', images, ecartees: { '4|i1': true, '4|i2': true }, statut: '', src }, { ic })).toMatch(/_edlVideoGarderVu\([^)]*\)" disabled/);
  });
  it('photo en grand : cadre, images voisines, garder / écarter', () => {
    const v = W.vuePhoto({ itemId: 'x', eid: '13', nom: 'Plaques', imageId: 'i1', t: 41, src: src('i1'), cadre: { x: 0, y: 0.42, l: 1, h: 0.38 }, prec: { id: 'i0', t: 40 }, suiv: { id: 'i2', t: 42 } }, { ic });
    charte(v);
    expect(v.corps).toContain('top:42%');
    expect(v.corps).toContain('00:40');
    expect(v.pied).toContain('Garder cette photo');
  });
  it('erreur vidéo : titre « Filmer », dictée rappelée', () => {
    const v = W.vueErreurVideo({ titre: 'Accès à la caméra refusé', texte: 'x', action: { onclick: '_edlVideoImporter()', libelle: 'Importer une vidéo', icone: 'upload' } }, { ic });
    charte(v);
    expect(v.titre).toBe('Filmer · Pièce');
    expect(v.corps).toContain('La dictée et la saisie à la main restent disponibles.');
  });
});

describe('propositions de la dictée, étendues aux photos', () => {
  const item = { id: 'x', texte: 'sol', resultat: {}, duree: 59 };
  const m = { bilan: { total: 1, inscrites: 0, ignorees: 0, aValider: 1 }, lignes: [{ cle: 'p:0', prop: { etat: null, observation: 'Carrelage.', source: 'sol en ciment' }, nom: 'Sol', statut: '', corrections: [], remplace: { oui: false } }], ajouts: [], compteurs: [], nonCites: [], enAttente: 1 };
  it('sans photos : écran de la dictée inchangé', () => {
    const v = V.vuePropositions({ item, m, piece: 'Cuisine', sortie: false, duree: 59 }, { ic });
    expect(v.sousTitre).toBe('Dictée de 0:59 · entrée');
    expect(v.corps).not.toContain('evx-thumbs');
  });
  it('avec photos et « vu, pas dit » : vignettes dans la carte, section dédiée, sous-titre Vidéo', () => {
    const v = V.vuePropositions({ item, m, piece: 'Cuisine', sortie: false, duree: 59, video: true, photos: () => '<div class="evx-thumbs">P</div>', vus: '<div class="evx-card">F</div>' }, { ic });
    expect(v.sousTitre).toBe('Vidéo de 0:59 · entrée');
    expect(v.corps).toContain('evx-thumbs');
    expect(v.corps).toContain('Vu à l’image, pas dit');
    expect(v.corps).toContain('non retouchées');
  });
});

describe('mention du PDF', () => {
  it('photo tirée d’une vidéo gardée → mention vidéo ; dictée seule → mention dictée ; rien sinon', () => {
    const avecVideo = { pieces: [{ elements: [{ photosE: [{ idbKey: 'p', video: { videoId: 'v', t: 3 } }] }] }] };
    const dictee = { pieces: [{ elements: [{ iaE: { etat: true } }] }] };
    expect(edlAPhotosVideo(avecVideo)).toBe(true);
    expect(mentionPdf(avecVideo)).toBe(MENTION_PDF_VIDEO);
    expect(mentionPdf(dictee)).toBe(MENTION_PDF);
    expect(mentionPdf({ pieces: [] })).toBe('');
  });
});
