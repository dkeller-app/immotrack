/**
 * LE CÂBLAGE du congé et des sorties d'actes — pas seulement leur logique.
 *
 * Histoire de ce fichier, parce qu'elle explique ce qu'il garde :
 * le congé bailleur avait DEUX chemins de sortie. DOC-C n'en gardait qu'un (la sortie PDF de
 * la modale d'actes). Le second, le « Hub Communications », émettait un congé pour vente sans
 * prix ni conditions — nul de plein droit (art. 15-II, loi n° 89-462). En le corrigeant, on a
 * découvert qu'il était INATTEIGNABLE depuis la v15.16 : du code juridique faux sur un chemin
 * que personne ne pouvait emprunter ni tester. Il a été supprimé.
 *
 * Restent donc : UN chemin de congé (la modale), et un garde-fou sur les sorties de la modale
 * email — qui, elle, sert des chemins bien vivants (escalade quittance, lettre IRL, décompte).
 *
 * Ces tests lisent la SOURCE. Ils échouent si quelqu'un :
 *  1. redonne à la modale son propre motif au lieu du générateur commun ;
 *  2. retire la vérification avant les sorties, ou la place après ;
 *  3. ignore le résultat de la vérification (garde-fou décoratif) ;
 *  4. casse l'exposition `window` dont dépend le monolithe ;
 *  5. réintroduit un hub d'envoi sans point d'entrée.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html, mainJs, emailModal, emailCompose;
beforeAll(() => {
  const lire = (p) => readFileSync(resolve(repoRoot, p), 'utf8').replace(/\r/g, '');
  html = lire('index.html');
  mainJs = lire('js/main.js');
  emailModal = lire('js/components/email-modal.js');
  emailCompose = lire('js/core/email-compose.js');
});

const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const fin = src.indexOf('\n}', m.index);
  return fin === -1 ? null : src.slice(m.index, fin + 2);
}

describe('Le Hub Communications est supprimé, et ne doit pas revenir en douce', () => {
  it('ni la modale d’envoi, ni son overlay, ni ses appels ne subsistent', () => {
    for (const mort of ['_openCommsHub', '_commsHubSend', 'ov-comms-hub']) {
      expect(html, mort + ' est de retour').not.toContain(mort);
    }
  });

  it('le catalogue, lui, SURVIT — la page Communications le lit', () => {
    // Supprimer le hub ne doit pas emporter ce qui nomme les envois de l’historique.
    expect(html).toContain('EMAIL_HUB_CATALOG');
    expect(corpsDe(html, '_emailsTypeMeta')).toBeTruthy();
    expect(corpsDe(html, 'rEmailsPage')).toBeTruthy();
  });
});

describe('Le congé n’a plus qu’un chemin, et il délègue', () => {
  it('_congeExtra délègue le motif au générateur commun', () => {
    const code = sansCommentaires(corpsDe(html, '_congeExtra') || '');
    expect(code).toContain('congeMotifDetail');
  });

  it('_congeExtra ne recompose plus la phrase de préemption à la main', () => {
    // « aux prix et conditions indiqués ci-dessus » ne doit exister qu’à l’endroit qui écrit
    // AUSSI le prix et les conditions, sans quoi elle peut mentir.
    expect(sansCommentaires(corpsDe(html, '_congeExtra') || '')).not.toContain('indiqués ci-dessus');
  });

  it('le document renvoie à l’ANNEXE (art15Inline:false) — sinon les alinéas seraient en double', () => {
    expect(sansCommentaires(corpsDe(html, '_congeExtra') || '')).toMatch(/art15Inline\s*:\s*false/);
  });

  it('il fixe une date d’effet que le préavis permet d’atteindre', () => {
    expect(sansCommentaires(corpsDe(html, '_congeExtra') || '')).toContain('_congeDateEffetLocale');
  });

  it('le report de date calcule « aujourd’hui » en LOCAL, jamais en UTC', () => {
    // `td()` est UTC : entre minuit et ~2 h il désigne la veille, et un congé délivré trop tard
    // passerait pour « dans les temps » — la lettre affirmant le contraire. Le pont calcule la
    // date lui-même ; aucun appelant ne la fournit, donc aucun ne peut se tromper.
    const code = sansCommentaires(corpsDe(html, '_congeDateEffetLocale'));
    expect(code).toContain('_loyerTodayLocal');
    expect(code, 'td() (UTC) est de retour dans un calcul de nullité').not.toMatch(/\btd\(\)/);
  });
});

describe('Les QUATRE sorties de la modale email sont gardées', () => {
  it('_emHandleAction existe', () => {
    expect(corpsDe(emailModal, '_emHandleAction')).toBeTruthy();
  });

  it('la vérification précède TOUTE sortie', () => {
    const code = sansCommentaires(corpsDe(emailModal, '_emHandleAction'));
    const iVerif = code.indexOf('_emActeMentionsOk');
    expect(iVerif, 'le garde-fou n’est pas appelé').toBeGreaterThan(-1);
    for (const sortie of ['_onMailto', '_onCopy', '_onShare', '_onSendNow']) {
      const i = code.indexOf(sortie);
      expect(i, sortie + ' n’est plus dans le point de passage').toBeGreaterThan(-1);
      expect(iVerif, 'le garde-fou arrive APRÈS ' + sortie).toBeLessThan(i);
    }
  });

  it('un refus interrompt réellement la fonction', () => {
    expect(sansCommentaires(corpsDe(emailModal, '_emHandleAction')))
      .toMatch(/if\s*\(\s*!\s*_emActeMentionsOk\([\s\S]*?\)\s*return/);
  });

  it('le garde-fou lit les champs À L’ÉCRAN, pas le brouillon composé', () => {
    // Sujet et corps sont éditables : c'est ce qui part au locataire qui fait foi.
    const code = sansCommentaires(corpsDe(emailModal, '_emActeMentionsOk'));
    expect(code).toContain('_readModalValues');
    expect(code).toContain('sortieAutorisee');
  });

  it('il examine le SUJET autant que le corps', () => {
    const code = sansCommentaires(corpsDe(emailModal, '_emActeMentionsOk'));
    expect(code).toMatch(/v\.subject/);
    expect(code).toMatch(/v\.body/);
  });

  it('il délègue la DÉCISION au module partagé (une seule implémentation)', () => {
    // Prouvé pour de vrai dans conge-sortie.test.js ; ici on verrouille le câblage.
    const code = sansCommentaires(corpsDe(emailModal, '_emActeMentionsOk'));
    expect(code, 'le garde-fou email reprend sa propre décision').not.toContain('messageMentionsManquantes');
  });

  it('la sortie PDF du monolithe délègue au MÊME module', () => {
    expect(sansCommentaires(corpsDe(html, '_acteMentionsOk'))).toContain('window.sortieAutorisee');
  });
});

describe('Les actes formels nomment leurs trous d’identité', () => {
  it('acteFormel se DÉDUIT du modèle, pas d’une liste tenue à la main', () => {
    const code = sansCommentaires(corpsDe(emailCompose, 'acteFormel'));
    expect(code).toContain('entite');
    expect(code).toContain('TEMPLATES[type]');
  });

  it('_emailCompose applique l’enrichissement des actes', () => {
    const code = sansCommentaires(corpsDe(emailCompose, '_emailCompose'));
    expect(code).toMatch(/acteFormel\(type\)/);
    expect(code).toContain('_enrichContextActe');
  });
});

describe('Le monolithe trouve bien ce dont il dépend', () => {
  it('window.sortieAutorisee est exposé — sans lui, `_acteMentionsOk` retombe en silence sur son repli', () => {
    expect(mainJs).toContain('window.sortieAutorisee = sortieAutorisee;');
    expect(mainJs).toMatch(/import\s*\{[^}]*sortieAutorisee[^}]*\}\s*from\s*'\.\/core\/actes-mentions\.js'/);
  });

  for (const f of ['congeMotifDetail', 'congeDateEffet', 'congeMentionPreavis']) {
    it('window.' + f + ' est exposé par js/main.js', () => {
      expect(mainJs).toContain('window.' + f + ' = ' + f + ';');
      expect(mainJs).toMatch(new RegExp('import\\s*\\{[^}]*' + f + '[^}]*\\}\\s*from\\s*\'\\./core/conge\\.js\''));
    });
  }
});
