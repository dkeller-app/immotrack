/**
 * __tests__/helpers/edl-sortie-layout.test.js — chantier EDL-TÉLÉPHONE, étape 3 (CDC §2.6).
 *
 * La carte de sortie (< 1024) : deux registres nets, ÉTATS côte à côte 1/3 · 2/3,
 * OBSERVATIONS et PHOTOS en PLEINE LARGEUR (une obs de 277 car. en 1/3 est illisible).
 * Ce test parse la déclaration effective de la grille (comme edl-overscroll parse
 * overscroll-behavior) : il ne cherche pas un extrait brut, il vérifie la VALEUR des
 * propriétés de disposition. Muter les colonnes en 1fr 1fr, ou remettre les obs en
 * demi-largeur, fait rougir ce test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function extractMobileBlocks(css) {
  let out = '';
  const re = /@media\s*\(([^)]*max-width:\s*(\d+)px[^)]*)\)([^{]*)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (!(parseInt(m[2], 10) <= 1023)) continue;
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open;
    for (; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') { depth--; if (depth === 0) break; } }
    out += '\n' + css.slice(open + 1, i);
    re.lastIndex = i + 1;
  }
  return out;
}
function parseFlatRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = []; let i = 0, buf = '';
  while (i < clean.length) {
    if (clean[i] === '{') {
      const prelude = buf.trim(); buf = '';
      let depth = 1, j = i + 1, body = '';
      for (; j < clean.length && depth > 0; j++) { if (clean[j] === '{') depth++; else if (clean[j] === '}') { depth--; if (depth === 0) break; } body += clean[j]; }
      const decls = {};
      body.split(';').forEach(d => { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).replace(/!important/g, '').trim(); });
      rules.push({ sel: prelude, decls }); i = j + 1; continue;
    }
    buf += clean[i]; i += 1;
  }
  return rules;
}

describe('EDL — carte de sortie 2 registres (CDC §2.6, invariant §2.10 nº2/3)', () => {
  let rules;
  beforeAll(() => {
    const css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
    rules = parseFlatRules(extractMobileBlocks(css));
  });

  it('la ligne d\'élément de sortie est une grille 1/3 · 2/3 (états côte à côte)', () => {
    const r = rules.find(x => /\.edl-sortie-mode .*tbody tr$/.test(x.sel));
    expect(r, 'règle de la carte de sortie introuvable').toBeTruthy();
    expect(r.decls['display']).toBe('grid');
    expect(r.decls['grid-template-columns'].replace(/\s+/g, ' ')).toBe('1fr 2fr');
  });

  it('observations et photos en PLEINE LARGEUR ; états côte à côte', () => {
    const r = rules.find(x => /\.edl-sortie-mode .*tbody tr$/.test(x.sel));
    const areas = r.decls['grid-template-areas'].replace(/\s+/g, ' ');
    // états sur la même rangée (côte à côte)
    expect(areas).toContain("'etatE etatS'");
    // obs & photos : chaque côté sur sa propre rangée pleine largeur (même zone × 2 colonnes)
    expect(areas).toContain("'obsE obsE'");
    expect(areas).toContain("'obsS obsS'");
    expect(areas).toContain("'photoE photoE'");
    expect(areas).toContain("'photoS photoS'");
    expect(areas).toContain("'verdict verdict'");
    // ce qu'on NE veut PLUS : obs appariées en demi-largeur
    expect(areas).not.toContain("'obsE obsS'");
    expect(areas).not.toContain("'photoE photoS'");
  });

  it('le registre sortie porte un liseré orange à gauche', () => {
    const r = rules.find(x => /td:nth-child\(5\),?/.test(x.sel) && x.decls['border-left']);
    expect(r, 'liseré orange du registre sortie introuvable').toBeTruthy();
    expect(r.decls['border-left']).toMatch(/var\(--ora\)/);
  });
});
