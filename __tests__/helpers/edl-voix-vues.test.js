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
    expect(quota).not.toContain('Réessayer');
    expect(V.banniere({ id: 'd', etape: 'texte', duree: 5 }, { ic, message: messageErreur })).toContain('Préparation des propositions');
    for (const h of [pret, off, quota]) expect(texte(h)).not.toMatch(TUTOIE);
  });
  it('échappement : un nom de pièce piégé ne s’exécute pas', () => {
    const v = V.vueEnregistrement({ piece: 'x', elements: ['<img src=x onerror=alert(1)>'] }, { ic });
    expect(v.corps).not.toContain('<img');
    expect(V.esc('"<\'&>')).toBe('&quot;&lt;&#39;&amp;&gt;');
  });
});
