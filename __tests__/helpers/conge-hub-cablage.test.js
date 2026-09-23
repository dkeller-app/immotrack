/**
 * LE CÂBLAGE du congé sur ses DEUX chemins de sortie — pas seulement la logique.
 *
 * DOC-C avait déjà appris qu'un module testé mais appelé nulle part ne protège personne. Ce lot
 * a appris la suite : un garde-fou câblé sur UN chemin n'en protège qu'un. Le congé bailleur
 * sort par la modale « Congé & résiliation » (PDF, gardée depuis DOC-C) **et** par le Hub
 * Communications (email), et c'est ce second chemin qui émettait un congé pour vente sans prix
 * ni conditions — nul de plein droit au titre de l'art. 15-II de la loi du 6 juillet 1989.
 *
 * Ces tests lisent la SOURCE. Ils échouent si quelqu'un :
 *  1. redonne au Hub son propre motif au lieu du générateur commun ;
 *  2. cesse de demander le prix et les conditions pour une vente ;
 *  3. retire la vérification avant les sorties de la modale email ;
 *  4. laisse la vérification arriver APRÈS la sortie ;
 *  5. ignore le résultat de la vérification (garde-fou décoratif) ;
 *  6. casse l'exposition `window` dont dépend le monolithe.
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

/** Le corps du `case '<type>':` du Hub, jusqu'à son `break`. */
function casDuHub(type) {
  const i = html.indexOf("case '" + type + "': {");
  if (i === -1) return null;
  const j = html.indexOf('\n      break; }', i);
  return j === -1 ? null : html.slice(i, j);
}

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const fin = src.indexOf('\n}', m.index);
  return fin === -1 ? null : src.slice(m.index, fin + 2);
}

describe('Le Hub n’a plus son propre congé', () => {
  it('le cas existe (sinon tout ce bloc serait vrai par le vide)', () => {
    expect(casDuHub('bail-conge-bailleur-6mois')).toBeTruthy();
  });

  it('il appelle le générateur COMMUN au lieu de recomposer le motif', () => {
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).toContain('congeMotifDetail');
  });

  it('il demande le PRIX et les CONDITIONS — art. 15-II, à peine de nullité', () => {
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code, 'le prix de la vente n’est plus collecté').toMatch(/promptVal\(\s*'Prix de vente/);
    expect(code, 'les conditions de la vente ne sont plus collectées').toMatch(/promptVal\(\s*'Conditions de la vente/);
  });

  it('il demande le bénéficiaire ET son adresse pour une reprise — art. 15-I', () => {
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).toMatch(/promptVal\(\s*'Bénéficiaire de la reprise/);
    expect(code).toMatch(/promptVal\(\s*'Adresse du bénéficiaire/);
  });

  it('il n’écrit plus lui-même la phrase de préemption (elle vit dans le générateur)', () => {
    // Cette phrase affirme « aux prix et conditions indiqués ci-dessus » : elle ne doit exister
    // qu'à l'endroit qui écrit AUSSI le prix et les conditions, sans quoi elle peut mentir.
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).not.toContain('indiqués ci-dessus');
  });

  it('il fixe une date d’effet que le préavis permet d’atteindre', () => {
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).toContain('_congeDateEffetLocale');
  });
});

describe('La modale d’actes appelle le même générateur', () => {
  it('_congeExtra délègue le motif au générateur commun', () => {
    const code = sansCommentaires(corpsDe(html, '_congeExtra') || '');
    expect(code).toContain('congeMotifDetail');
  });

  it('_congeExtra ne recompose plus la phrase de préemption à la main', () => {
    expect(sansCommentaires(corpsDe(html, '_congeExtra') || '')).not.toContain('indiqués ci-dessus');
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
    expect(code).toContain('sortieAutorisee');
    expect(code, 'le garde-fou email reprend sa propre décision').not.toContain('messageMentionsManquantes');
  });

  it('la sortie PDF du monolithe délègue au MÊME module', () => {
    const code = sansCommentaires(corpsDe(html, '_acteMentionsOk'));
    expect(code).toContain('window.sortieAutorisee');
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
      expect(mainJs).toMatch(new RegExp('import\\s*\\{[^}]*\\b' + f + '\\b[^}]*\\}\\s*from\\s*\'\\./core/conge\\.js\''));
    });
  }
});

describe('Ce que l’audit a trouvé non couvert', () => {
  it('le Hub reproduit les alinéas DANS le corps (un email n’a pas d’annexe)', () => {
    // art15Inline:false ici renverrait à « l’annexe du présent congé » — qui n’existe pas dans
    // un email. Les cinq alinéas ne seraient pas reproduits : congé pour vente NUL (art. 15-II).
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).toMatch(/art15Inline\s*:\s*true/);
  });

  it('la modale, elle, renvoie à l’annexe (sinon les alinéas seraient en double)', () => {
    const code = sansCommentaires(corpsDe(html, '_congeExtra'));
    expect(code).toMatch(/art15Inline\s*:\s*false/);
  });

  it('le Hub préserve l’adresse du bien en reconstruisant `bail`', () => {
    // Sans ce repli, l’objet du congé redevient « Congé pour vente — (inconnu) ».
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    expect(code).toMatch(/adrBien\s*:\s*_bailC\.adrBien\s*\|\|\s*_logC\.adr/);
  });

  it('chaque prompt annulé interrompt l’envoi (null, pas chaîne vide)', () => {
    // La boucle générique après le `switch` ne voit QUE `=== null`. Une chaîne vide laisserait
    // partir un congé que l’utilisateur vient d’annuler.
    const code = sansCommentaires(casDuHub('bail-conge-bailleur-6mois'));
    const annulations = code.match(/extra\.motifDetail\s*=\s*null\s*;\s*break\s*;/g) || [];
    expect(annulations.length, 'un point d’annulation a changé de forme').toBe(4);
    expect(code).not.toMatch(/extra\.motifDetail\s*=\s*''\s*;\s*break/);
  });

  it('le report de date calcule « aujourd’hui » en LOCAL, jamais en UTC', () => {
    // `td()` est UTC : entre minuit et ~2 h il désigne la veille, et un congé tardif passerait
    // pour « dans les temps ». Le pont calcule la date lui-même ; aucun appelant ne la fournit.
    const code = sansCommentaires(corpsDe(html, '_congeDateEffetLocale'));
    expect(code).toContain('_loyerTodayLocal');
    expect(code, 'td() (UTC) est de retour dans le calcul de nullité').not.toMatch(/\btd\(\)/);
    // Et le Hub ne doit plus lui passer de date du tout.
    expect(sansCommentaires(casDuHub('bail-conge-bailleur-6mois')))
      .not.toMatch(/_congeDateEffetLocale\([^)]*td\(\)/);
  });
});
