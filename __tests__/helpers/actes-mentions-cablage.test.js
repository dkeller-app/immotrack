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
    expect(codeSeul(corpsDe(html, '_congeSortiePdf'))).toMatch(/if\s*\(\s*!\s*_acteMentionsOk\([^)]*\)\s*\)\s*return/);
  });
});

describe('DOC-C — le garde-fou survit à l’absence de js/main.js', () => {
  it('_acteMentionsOk existe', () => {
    expect(corpsDe(html, '_acteMentionsOk')).toBeTruthy();
  });

  it('il possède une branche de repli qui ne dépend d’aucun module', () => {
    const code = codeSeul(corpsDe(html, '_acteMentionsOk'));
    // Le repli détecte le marqueur lui-même (chevron simple) sans passer par window.*
    expect(code).toMatch(/\\u203[9a]|‹|›/);
    expect(code, 'aucune branche else : le garde-fou disparaît si le module manque').toMatch(/}\s*else\s*{/);
  });

  it('le repli aboutit à la MÊME question, pas à un passage silencieux', () => {
    const code = codeSeul(corpsDe(html, '_acteMentionsOk'));
    // `confirm2` doit être atteignable depuis les deux branches : une seule occurrence en
    // sortie commune, ou une par branche. Ce qui est interdit, c'est un `return true` nu
    // dans la branche sans module.
    const apresElse = code.slice(code.indexOf('} else {'));
    expect(apresElse).not.toMatch(/return\s+true\s*;?\s*}\s*$/);
    expect(code).toMatch(/confirm2\(/);
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
