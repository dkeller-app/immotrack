/**
 * DOC-B — les clauses légales du bail ne doivent pas pouvoir redevenir fausses dans `index.html`.
 *
 * Les modules sont testés, mais le bail est rendu par le monolithe : rien n'empêchait quelqu'un
 * de recoller une clause en dur dans `BAIL_TEMPLATE_DEFAULT` ou dans `buildBailStructure`, et
 * aucun test n'aurait rougi. C'est exactement ainsi que la même clause périmée avait fini en
 * trois exemplaires.
 *
 * Ces tests lisent la source (même approche que `autopull-loadorder.test.js`).
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

/**
 * Le corps de `BAIL_TEMPLATE_DEFAULT`, du backtick ouvrant au backtick fermant.
 * On part de la DÉCLARATION (`const BAIL_TEMPLATE_DEFAULT = \``), pas de la première mention du
 * nom : celui-ci apparaît d'abord dans des commentaires et des usages, et on récupérait alors le
 * littéral d'une tout autre constante — un test vert sur le mauvais texte.
 */
function templateDefaut(src) {
  const m = /BAIL_TEMPLATE_DEFAULT\s*=\s*`/.exec(src);
  if (!m) return null;
  const a = m.index + m[0].length - 1;
  const b = src.indexOf('`', a + 1);
  return b === -1 ? null : src.slice(a + 1, b);
}

describe('La condition d’âge supprimée de la loi ne doit pas revenir', () => {
  it('aucune clause vivante n’exige « plus de 60 ans » pour l’état de santé', () => {
    // Seul le CODE MORT `p1`/`p2`/`p3` en porte encore une copie, explicitement signalée comme
    // telle. Toute AUTRE occurrence serait une clause réellement imprimée.
    const occurrences = (html.match(/plus de 60 ans/g) || []).length;
    expect(occurrences, 'une clause de préavis a été recollée en dur').toBeLessThanOrEqual(1);
  });

  it('le préavis réduit n’est plus écrit en dur dans le modèle par défaut', () => {
    const t = templateDefaut(html);
    expect(t, 'BAIL_TEMPLATE_DEFAULT introuvable — le test ne teste plus rien').toBeTruthy();
    expect(t).toContain('{{PREAVIS_REDUIT}}');
    expect(t).not.toMatch(/est âgé de plus de 60 ans/);
  });

  it('la durée n’est plus justifiée par une phrase figée dans le modèle', () => {
    const t = templateDefaut(html);
    expect(t).toContain('{{DUREE_PHRASE}}');
    expect(t, 'la phrase « personne morale (SCI) » plaquée sur tout bailleur est revenue')
      .not.toMatch(/le bailleur étant une personne morale \(SCI\)/);
  });
});

describe('Le classement du bailleur ne repose plus sur un fragment de mot', () => {
  it('la regex `perso` — qui matche « PERSOnne morale » — a disparu', () => {
    expect(html, 'le classement inversé est revenu').not.toMatch(/personne physique\|perso/);
  });

  it('les deux documents lisent le MÊME module de durée', () => {
    // Le PDF signé (`buildBailStructure`) et l'export Word (`genBailHTML`) : deux documents du
    // même bail ne peuvent pas annoncer deux durées.
    expect((html.match(/dureeBailNuLabel/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((html.match(/dureeBailNuPhrase/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('les fonctions sont importées ET posées sur window (un import seul ne sert à rien)', () => {
    expect(mainJs).toMatch(/from\s+'\.\/core\/bail-duree\.js'/);
    for (const f of ['regimeBailleur', 'dureeBailNuLabel', 'dureeBailNuPhrase']) {
      expect(mainJs, f + ' importé mais jamais exposé').toMatch(
        new RegExp('window\\.' + f + '\\s*=\\s*' + f + '\\s*;')
      );
    }
  });
});

describe('Les replis sans js/main.js restent juridiquement sûrs', () => {
  it('aucun texte de repli n’énonce une condition d’âge', () => {
    // Un repli doit renvoyer à l'article, jamais énoncer une règle qu'il n'a pas vérifiée.
    const replis = html.split('\n').filter((l) => /preavisReduitClause|dureeBailNuPhrase/.test(l) && /\?|:/.test(l));
    expect(replis.length, 'plus aucun repli : le garde-fou a disparu').toBeGreaterThan(0);
    for (const l of replis) {
      expect(l, 'un repli énonce un âge : ' + l.trim().slice(0, 90)).not.toMatch(/\b(60|65)\s*ans/);
    }
  });
});
