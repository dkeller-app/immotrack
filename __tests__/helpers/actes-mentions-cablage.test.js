/**
 * DOC-C — le CÂBLAGE du garde-fou, pas seulement sa logique.
 *
 * Un module testé qui n'est appelé nulle part ne protège personne : c'est exactement le défaut
 * qui a laissé `_congeSortiePdf` produire un congé portant « ‹prix› » alors que le marqueur
 * existait déjà. Ces tests lisent la source d'`index.html` et de `js/main.js`.
 *
 * Trois invariants, chacun correspondant à une façon réelle de casser le garde-fou :
 *  1. la vérification précède la sortie PDF (sinon elle arrive après le mal) ;
 *  2. le repli sans `js/main.js` refuse quand même (un garde-fou légal ne s'évapore pas) ;
 *  3. les fonctions sont bien exposées sur `window` (un `import` sans binding ne sert à rien).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html, mainJs;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
  mainJs = readFileSync(resolve(repoRoot, 'js/main.js'), 'utf8').replace(/\r/g, '');
});

/** Corps d'une fonction de premier niveau (même découpe que les autres tests de câblage). */
function corpsDe(src, nom) {
  const re = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) return null;
  const debut = m.index;
  const fin = src.indexOf('\n}', debut);
  return fin === -1 ? null : src.slice(debut, fin + 2);
}
const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('DOC-C — la sortie PDF du congé est gardée', () => {
  it('_congeSortiePdf existe (sinon tout ce fichier serait vrai par le vide)', () => {
    expect(corpsDe(html, '_congeSortiePdf')).toBeTruthy();
  });

  it('elle vérifie les mentions AVANT de produire le PDF', () => {
    const code = codeSeul(corpsDe(html, '_congeSortiePdf'));
    const iVerif = code.indexOf('_acteMentionsOk');
    const iPdf = code.indexOf('_pdfSortie');
    expect(iVerif, 'le garde-fou n’est pas appelé').toBeGreaterThan(-1);
    expect(iPdf).toBeGreaterThan(-1);
    expect(iVerif, 'le garde-fou arrive APRÈS la sortie PDF').toBeLessThan(iPdf);
  });

  it('un refus interrompt réellement la fonction', () => {
    // `_acteMentionsOk(...)` dont on ignorerait le résultat serait un garde-fou décoratif.
    // (Les arguments peuvent contenir un appel imbriqué — `_acteVerbePdf()` — donc pas de `[^)]*`.)
    expect(codeSeul(corpsDe(html, '_congeSortiePdf'))).toMatch(/if\s*\(\s*!\s*_acteMentionsOk\([\s\S]*?\)\s*return/);
  });
});

describe('DOC-C — le garde-fou survit à l’absence de js/main.js', () => {
  it('_acteMentionsOk existe', () => {
    expect(corpsDe(html, '_acteMentionsOk')).toBeTruthy();
  });

  /**
   * ISOLE la branche `else` — et seulement elle.
   *
   * La première version de ces tests interrogeait le corps ENTIER : le chevron y était déjà
   * (sortie anticipée), et l'ancre `$` d'un `return true` cherchait la fin de chaîne, pas la fin
   * de branche. Résultat : neutraliser complètement le repli laissait les trois assertions
   * VERTES. Un audit l'a prouvé en exécutant la mutation. C'est le défaut que ces tests étaient
   * censés empêcher, commis dans les tests eux-mêmes.
   */
  function brancheRepli(code) {
    const i = code.indexOf('} else {');
    if (i === -1) return null;
    const debut = i + '} else {'.length;
    const fin = code.indexOf('\n  }', debut);          // la fermeture de la branche, indentée
    return fin === -1 ? null : code.slice(debut, fin);
  }

  it('il possède une branche de repli, et elle détecte le marqueur SANS aucun module', () => {
    const repli = brancheRepli(codeSeul(corpsDe(html, '_acteMentionsOk')));
    expect(repli, 'aucune branche else : le garde-fou disparaît si le module manque').toBeTruthy();
    expect(repli, 'le repli ne cherche pas le marqueur').toMatch(/[‹›]/);
    expect(repli, 'le repli passe par window.* — il ne remplace donc rien').not.toMatch(/window\./);
  });

  it('le repli aboutit à la MÊME question, pas à un passage silencieux', () => {
    const code = codeSeul(corpsDe(html, '_acteMentionsOk'));
    const repli = brancheRepli(code);
    expect(repli).toBeTruthy();
    // La branche doit CONSTRUIRE le message. Un repli neutralisé (`return true`) n'écrit plus
    // `msg`, quelle que soit la forme qu'on lui donne — c'est l'invariant qui mord vraiment.
    // (Un `return true` y est légitime quand aucun marqueur n'est trouvé : il ne faut pas poser
    //  une question qui n'a pas lieu d'être. On ne peut donc pas interdire le mot lui-même.)
    expect(repli, 'le repli ne construit plus de message : il laisse passer en silence').toMatch(/msg\s*=/);
    // Et la question finale doit rester atteignable après la branche.
    expect(code).toMatch(/return\s+confirm2\(/);
  });
});

describe('DOC-C — le module est réellement exposé', () => {
  it('js/main.js importe ET binde les trois fonctions', () => {
    expect(mainJs).toMatch(/from\s+'\.\/core\/actes-mentions\.js'/);
    for (const f of ['mentionsManquantes', 'emporteNullite', 'messageMentionsManquantes']) {
      expect(mainJs, f + ' importé mais jamais posé sur window').toMatch(
        new RegExp('window\\.' + f + '\\s*=\\s*' + f + '\\s*;')
      );
    }
  });
});
