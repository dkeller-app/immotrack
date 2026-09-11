// Bug pré-existant (repéré sur main/prod) : au boot de l'app, erreur console non
// catchée `Uncaught (in promise) ReferenceError: shouldAutoPull is not defined`.
//
// Cause : l'IIFE `_initAutoPull` (script INLINE d'index.html, exécuté pendant le
// parsing) arme un setInterval + un écouteur `visibilitychange` qui appellent
// `_autoPullCandidatures` → `shouldAutoPull(...)`. Or `shouldAutoPull` est défini
// dans le module ES `js/core/candidature.js` et bindé sur `window` par `js/main.js`
// (`<script type="module">`, DIFFÉRÉ → exécuté APRÈS le parsing). Si un
// `visibilitychange` survient (ou si main.js n'est pas servi : file://, SW périmé)
// avant que main.js n'ait bindé `window.shouldAutoPull`, la référence NUE lève une
// ReferenceError. Même famille de dégradation que `_computeLoyerStatut` & co.
//
// Invariant testé : `_autoPullCandidatures` (1) ne référence JAMAIS `shouldAutoPull`
// en global nu — toute référence passe par `window.` (jamais de ReferenceError) — et
// (2) court-circuite proprement tant que le module n'est pas chargé.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

describe('auto-pull candidatures — robustesse à l\'ordre de chargement (main.js différé)', () => {
  it('_autoPullCandidatures ne référence pas shouldAutoPull en global nu', () => {
    const body = extractFn(html, '_autoPullCandidatures');
    expect(body).toBeTruthy();
    // On raisonne sur le CODE, pas les commentaires (qui mentionnent le nom en prose).
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // Toute occurrence de `shouldAutoPull` doit être qualifiée `window.` (précédée d'un point).
    // Une référence nue `shouldAutoPull(...)` lèverait une ReferenceError si main.js n'a pas
    // encore bindé window.shouldAutoPull.
    const bare = code.match(/(?<!\.)\bshouldAutoPull\b/g);
    expect(bare, 'référence NUE à shouldAutoPull trouvée (doit être window.shouldAutoPull)').toBeNull();
  });

  it('_autoPullCandidatures court-circuite tant que le module n\'est pas chargé', () => {
    const body = extractFn(html, '_autoPullCandidatures');
    expect(body).toBeTruthy();
    // Garde de type + return anticipé, avant tout appel.
    expect(body).toMatch(/typeof\s+window\.shouldAutoPull\s*!==?\s*['"]function['"]/);
    const guardIdx = body.search(/typeof\s+window\.shouldAutoPull\s*!==?\s*['"]function['"]/);
    const callIdx = body.indexOf('window.shouldAutoPull(');
    expect(callIdx, 'appel window.shouldAutoPull(...) attendu').toBeGreaterThan(-1);
    expect(guardIdx, 'la garde doit précéder l\'appel').toBeLessThan(callIdx);
  });
});
