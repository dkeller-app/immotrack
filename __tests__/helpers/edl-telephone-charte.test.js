/**
 * __tests__/helpers/edl-telephone-charte.test.js — chantier « EDL téléphone à la charte mobile »
 * (v15.682, 25/09 ; docs/CHARTE-MOBILE.md, maquette mockups/EDL-TELEPHONE/MAQUETTE-375.html).
 *
 * Gardes de non-régression issues de l'audit code-reviewer :
 *  - B1 : hors téléphone, les ex-champs d'une ligne (<textarea class="inp edl-1l">) gardent
 *    l'allure d'un champ — la règle globale textarea.inp (70 px + poignée) ne doit pas les étirer.
 *  - Les éléments ajoutés POUR le téléphone sont masqués par défaut (PC/tablette inchangés).
 *  - Le bloc téléphone ne déclare aucun texte sous 14 px (lecture) ni aucune cible sous 44 px
 *    quand il en fixe une.
 *  - I2 (XSS) : la page « Choisir le logement » ne met aucune valeur dans un attribut onclick.
 *  - delEDL : la confirmation ne saute qu'avec { confirme:true }, et seul _edlListMore le passe.
 *
 * Les tests CSS PARSENT la vraie feuille de style (même méthode que edl-16px.test.js).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Retire commentaires et blocs @media : ne garde que les règles de premier niveau. */
function topLevelCss(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < clean.length) {
    if (clean.startsWith('@media', i) || clean.startsWith('@supports', i)) {
      const open = clean.indexOf('{', i);
      let depth = 0, j = open;
      for (; j < clean.length; j++) {
        if (clean[j] === '{') depth++;
        else if (clean[j] === '}') { depth--; if (depth === 0) break; }
      }
      i = j + 1; continue;
    }
    out += clean[i]; i++;
  }
  return out;
}

/** Règles plates { sel, decls } d'un CSS sans @media imbriqué. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css)) !== null) {
    const decls = {};
    for (const d of m[2].split(';')) {
      const k = d.indexOf(':'); if (k < 0) continue;
      decls[d.slice(0, k).trim().toLowerCase()] = d.slice(k + 1).trim();
    }
    out.push({ sel: m[1].trim(), decls });
  }
  return out;
}

/** Le bloc @media (max-width:767px) du chantier (repéré par son commentaire d'en-tête). */
function phoneBlock(css) {
  const start = css.indexOf('EDL-TÉLÉPHONE — CHARTE MOBILE (25/09');
  if (start < 0) return null;
  const at = css.indexOf('@media (max-width:767px){', start);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  let depth = 0, j = open;
  for (; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') { depth--; if (depth === 0) break; }
  }
  return css.slice(open + 1, j).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Tailles de police déclarées (font-size ou raccourci font) en px. */
function fontPx(decls) {
  const out = [];
  if (decls['font-size']) { const m = /(\d+(?:\.\d+)?)px/.exec(decls['font-size']); if (m) out.push(+m[1]); }
  if (decls.font) { const m = /(\d+(?:\.\d+)?)px/.exec(decls.font); if (m) out.push(+m[1]); }
  return out;
}

let css, html;
beforeAll(() => {
  css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
});

describe('EDL téléphone — PC et tablette inchangés', () => {
  it('B1 : hors @media, #ov-edl textarea.inp.edl-1l annule la hauteur mini de 70 px et la poignée', () => {
    const r = rules(topLevelCss(css)).find(x => x.sel.split(',').map(s => s.trim()).includes('#ov-edl textarea.inp.edl-1l'));
    expect(r, 'règle hors media absente').toBeTruthy();
    expect(r.decls['min-height']).toBe('0');
    expect(r.decls.resize).toBe('none');
    expect(r.decls['white-space']).toBe('pre');   // une ligne, comme l'<input> d'avant (= wrap=off, tous moteurs)
  });

  it('les éléments ajoutés pour le téléphone sont masqués par défaut', () => {
    const top = rules(topLevelCss(css));
    const cachees = new Set();
    for (const r of top) if (/^none/.test(r.decls.display || '')) r.sel.split(',').forEach(s => cachees.add(s.trim()));
    for (const c of ['.edl-wd', '.edl-el-txt', '.edl-el-more', '.edl-addph-lbl', '.edl-ph-title', '.edl-ph-sub',
      '.edl-rail-prog', '.edl-rail-bar', '.edl-rail-arr-lbl', '.edl-log-card', '.edl-cle-del-lbl', '.edl-legal-foot', '.edl-lmore', '.edl-page']) {
      expect(cachees.has(c), c + ' doit être display:none hors téléphone').toBe(true);
    }
  });
});

describe('EDL téléphone — bloc ≤ 767 px à la charte', () => {
  it('existe', () => { expect(phoneBlock(css)).toBeTruthy(); });

  it('aucun texte déclaré sous 14 px (lecture), aucun champ sous 16 px', () => {
    const bad = [];
    for (const r of rules(phoneBlock(css))) {
      for (const px of fontPx(r.decls)) {
        const champ = /(input|textarea|select|\.inp|edl-page-fld)/.test(r.sel) && !/::before|label|b\b/.test(r.sel);
        if (px < 14 || (champ && px < 16)) bad.push(`${r.sel} → ${px}px`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('toute hauteur de cible déclarée est ≥ 44 px (min-height / height des boutons et lignes)', () => {
    const bad = [];
    for (const r of rules(phoneBlock(css))) {
      if (!/(button|\.btn|edl-page-row|edl-page-back|edl-page-del|edl-rail-arrow|edl-rail-prog|edl-el-more|edl-lmore|edl-ph-more|m-close|edl-addph|edl-cle-del|edl-log-change|edl-log-pick|edl-sheet-row|edl-sheet-close|\.fix|flag|label:has)/.test(r.sel)) continue;
      // les tailles d'ICÔNE (svg) et les pseudo-éléments décoratifs ne sont pas des cibles
      if (r.sel.split(',').every(s => /\bsvg\s*$|::(before|after)\s*$|\.edl-dp-i\s*$/.test(s.trim()))) continue;
      for (const k of ['min-height', 'height']) {
        const m = /^(\d+)px/.exec(r.decls[k] || ''); if (m && +m[1] < 44) bad.push(`${r.sel} ${k}:${m[1]}px`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('pas de rouge : le bloc ne réfère ni --neg ni --red (M-15)', () => {
    expect(/var\(--(neg|red)\)/.test(phoneBlock(css))).toBe(false);
  });
});

describe('EDL téléphone — garde-fous du code', () => {
  it('I2 : « Choisir le logement » ne met aucune valeur de logement dans un onclick', () => {
    const i = html.indexOf('function _edlOpenLogPage(');
    const body = html.slice(i, html.indexOf('\nfunction ', i + 10));
    expect(body).toContain('_edlPickLogIdx(${i})');
    expect(body).not.toMatch(/onclick="[^"]*\$\{JSON\.stringify/);
  });

  it('delEDL ne saute la confirmation qu’avec { confirme:true }, et seul _edlListMore le passe', () => {
    expect(html).toMatch(/function delEDL\(id, opts\)\{\s*\r?\n[^\n]*\r?\n\s*if\(!\(opts && opts\.confirme\) && !confirm2\(/);
    const appels = [...html.matchAll(/delEDL\(([^)]*)\)/g)].map(m => m[1]).filter(a => !/^id, opts$/.test(a));
    const avecOptions = appels.filter(a => a.includes(','));
    expect(avecOptions).toEqual(['${id},{confirme:true}']);
  });
});
