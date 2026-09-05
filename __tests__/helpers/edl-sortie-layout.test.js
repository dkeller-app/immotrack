/**
 * __tests__/helpers/edl-sortie-layout.test.js — chantier EDL-TÉLÉPHONE, mode sortie (CDC §2.6).
 *
 * La carte de sortie (< 1024) : DEUX BANDES NETTES empilées (maquette ecran-05-piece).
 * D'abord TOUTE la bande ENTRÉE (état + obs + photos, grise, verrouillée), PUIS TOUTE la
 * bande SORTIE (état + obs + photos, corail, à remplir), le verdict dessous. Fini la zébrure
 * entrée/sortie interlignée (l'ancien 1fr 2fr côte à côte). Ce test parse la déclaration
 * effective de la grille : il vérifie la VALEUR des propriétés de disposition, pas un extrait
 * brut. Réinterlacer les registres (etatE à côté d'etatS) fait rougir ce test.
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

describe('EDL — carte de sortie 2 bandes nettes (CDC §2.6, invariant §2.10 nº2/3)', () => {
  let rules;
  beforeAll(() => {
    const css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
    rules = parseFlatRules(extractMobileBlocks(css));
  });

  it('la ligne d\'élément de sortie est une grille EN COLONNE UNIQUE (bandes empilées)', () => {
    const r = rules.find(x => /\.edl-sortie-mode .*tbody tr$/.test(x.sel));
    expect(r, 'règle de la carte de sortie introuvable').toBeTruthy();
    expect(r.decls['display']).toBe('grid');
    // colonne unique : chaque registre occupe toute la largeur (obs longue lisible, §2.6)
    expect(r.decls['grid-template-columns'].replace(/\s+/g, ' ')).toBe('1fr');
  });

  it('DEUX BANDES NETTES : toute l\'entrée AVANT toute la sortie, verdict en bas', () => {
    const r = rules.find(x => /\.edl-sortie-mode .*tbody tr$/.test(x.sel));
    const areas = r.decls['grid-template-areas'].replace(/\s+/g, ' ').trim();
    // ordre exact des rangées : nom, [bande entrée], [bande sortie], verdict
    expect(areas).toBe("'nom' 'etatE' 'obsE' 'photoE' 'etatS' 'obsS' 'photoS' 'verdict'");
    // invariant « bandes nettes » : les 3 zones d'entrée précèdent TOUTES les zones de sortie
    const order = (areas.match(/'([a-zA-Z]+)'/g) || []).map(s => s.replace(/'/g, ''));
    const lastEntree = Math.max(order.indexOf('etatE'), order.indexOf('obsE'), order.indexOf('photoE'));
    const firstSortie = Math.min(order.indexOf('etatS'), order.indexOf('obsS'), order.indexOf('photoS'));
    expect(lastEntree).toBeLessThan(firstSortie);
    expect(order.indexOf('verdict')).toBe(order.length - 1);
    // ce qu'on NE veut PLUS : la zébrure côte à côte (états interlignés)
    expect(areas).not.toContain('etatE etatS');
  });

  it('le registre sortie porte un liseré orange à gauche', () => {
    const r = rules.find(x => /td:nth-child\(5\),?/.test(x.sel) && x.decls['border-left']);
    expect(r, 'liseré orange du registre sortie introuvable').toBeTruthy();
    expect(r.decls['border-left']).toMatch(/var\(--ora\)/);
  });
});
