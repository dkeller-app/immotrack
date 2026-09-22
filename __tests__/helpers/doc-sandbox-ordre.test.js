// DOC-3 (AUDIT-GLOBAL) — INVARIANT « OUVRIR AVANT DE RENDRE ».
//
// Le cadre isolé se dimensionne en MESURANT son document (`allow-same-origin`, jamais
// `allow-scripts`). Une modale encore cachée mesure 0 : le document s'affiche alors dans un
// cadre écrasé, et rien ne le corrige — le ResizeObserver intérieur, lui, ne peut pas exister
// (sans `allow-scripts`, aucun script ne tourne dans le cadre, et un observateur construit par
// le parent ne s'abonne pas à un élément d'un document sandboxé).
//
// L'invariant est donc UNIQUEMENT tenu par l'ordre des appels : `openM(...)` PUIS
// `_docRenderSandboxed(...)`. C'est le point le plus susceptible de casser silencieusement le
// jour où quelqu'un ajoute un 7ᵉ appelant — et aucun test unitaire de `docSandboxFrame` ne
// pourra l'attraper, parce que le défaut est dans le CÂBLAGE, pas dans le gabarit.
//
// Ce test lit la source d'`index.html` (même approche que `autopull-loadorder.test.js`).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

/**
 * Découpe la source en fonctions de premier niveau : une ligne `function nom(` en colonne 0
 * ouvre, la ligne `}` en colonne 0 ferme. C'est la forme qu'ont TOUS les appelants d'index.html.
 */
function fonctionsTopLevel(src) {
  const lignes = src.split('\n');
  const out = [];
  let cur = null;
  for (const ligne of lignes) {
    const m = /^function\s+([A-Za-z0-9_$]+)\s*\(/.exec(ligne);
    if (m) { cur = { nom: m[1], corps: [] }; out.push(cur); continue; }
    if (cur) {
      if (ligne === '}') { cur = null; continue; }
      cur.corps.push(ligne);
    }
  }
  return out.map(f => ({ nom: f.nom, corps: f.corps.join('\n') }));
}

/** Retire commentaires et littéraux de chaîne simples, pour ne raisonner que sur du CODE. */
function codeSeul(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('DOC-3 — le câblage : ouvrir la modale AVANT de rendre le document', () => {
  it('index.html appelle bien le rendu isolé (le test ne teste pas le vide)', () => {
    const appels = codeSeul(html).split('_docRenderSandboxed(').length - 1;
    expect(appels).toBeGreaterThanOrEqual(5);   // 1 définition + au moins 4 appelants
  });

  it('toute fonction qui ouvre ET rend, ouvre d\'abord', () => {
    const coupables = [];
    for (const f of fonctionsTopLevel(html)) {
      if (f.nom === '_docRenderSandboxed') continue;         // la définition elle-même
      const code = codeSeul(f.corps);
      const iRendu = code.indexOf('_docRenderSandboxed(');
      if (iRendu === -1) continue;
      const iOuvre = code.indexOf('openM(');
      if (iOuvre === -1) continue;                            // modale déjà ouverte par ailleurs
      if (iOuvre > iRendu) coupables.push(f.nom);
    }
    expect(coupables).toEqual([]);
  });

  it('aucun document `.pro-doc` ne repart en innerHTML dans la page', () => {
    // Les hôtes de document connus. Si l'un d'eux réapparaît à gauche d'un `innerHTML =`,
    // c'est la faille DOC-3 rouverte : le HTML du document réintègre l'origine de l'app.
    //
    // ⚠️ On ne construit PAS cette recherche par `new RegExp("…\(…")` : dans un littéral de
    // chaîne, les antislashes sont consommés AVANT d'atteindre RegExp, et la regex obtenue
    // (`el'ov-irl-lettre-content'`, sans parenthèses) ne peut matcher aucun code réel — elle
    // passe donc toujours. Ce défaut a réellement été livré ici, et un audit l'a rattrapé.
    // On reste donc sur de la recherche de sous-chaîne, qui ne peut pas mentir.
    const hotes = ['ov-irl-lettre-content', 'regul-doc-content', 'av-preview', 'cg-preview'];
    const code = codeSeul(html);
    for (const h of hotes) {
      // Toute mention de l'hôte, quel que soit l'accesseur (`el('x')`,
      // `document.getElementById('x')`, `querySelector('#x')`), puis on regarde ce qui suit.
      let i = -1;
      while ((i = code.indexOf(h, i + 1)) !== -1) {
        const suite = code.slice(i, i + 90);
        const j = suite.indexOf('.innerHTML');
        if (j === -1) continue;
        const apres = suite.slice(j + '.innerHTML'.length).replace(/^\s+/, '');
        // `=` seul est une AFFECTATION (le sink) ; `==`/`===` n'est qu'une lecture.
        const affecte = apres.startsWith('=') && !apres.startsWith('==');
        expect(affecte, h + ' : affectation innerHTML, offset ' + i).toBe(false);
      }
    }
    // Et la variable `dst` des aperçus IRL ne doit plus porter d'affectation innerHTML.
    let vuesIRL = 0;
    for (const f of fonctionsTopLevel(html)) {
      if (!/^previewIRLLetter/.test(f.nom)) continue;
      vuesIRL++;
      expect(codeSeul(f.corps)).not.toMatch(/dst\.innerHTML\s*=/);
    }
    // Garde d'anti-vacuité : si le parseur ne voit plus ces fonctions (passées en `const … =>`,
    // en méthode, ou indentées), la boucle ci-dessus n'assertait plus RIEN en silence.
    expect(vuesIRL, 'previewIRLLetter* introuvables — le parseur a décroché').toBe(2);
  });

  it('l\'impression des documents ne passe plus par une popup de même origine', () => {
    let vues = 0;
    for (const f of fonctionsTopLevel(html)) {
      if (!/^(printIRLLetter|printRegulDoc)$/.test(f.nom)) continue;
      vues++;
      const code = codeSeul(f.corps);
      expect(code, f.nom + ' : window.open direct').not.toMatch(/window\.open\(/);
      expect(code).toMatch(/_docPrintSandboxed\(/);
    }
    // Même garde : zéro fonction vue = test vrai par le vide, donc test inutile.
    expect(vues, 'print*Doc introuvables — le parseur a décroché').toBe(2);
  });
});
