/**
 * __tests__/helpers/edl-16px.test.js — chantier EDL-TÉLÉPHONE, étape 1 (CDC §2.4).
 *
 * Invariant §2.10 nº1 : « Aucun champ EDL saisissable < 16 px sur mobile (tous modes). »
 * iOS zoome à chaque focus dès qu'un champ passe sous 16 px — geste terrain cassé.
 *
 * Ce test ne cherche pas un extrait de source : il PARSE la feuille de style, isole
 * le bloc `@media (max-width:1023px)` (téléphone + tablette), et vérifie que TOUTE
 * règle y visant un champ saisissable de l'EDL (input/textarea/select/.inp) et qui
 * déclare une `font-size` la déclare à ≥ 16 px. Il vérifie aussi que le garde
 * catch-all (#ov-edl …{font-size:16px}) existe toujours — sinon les champs admin
 * (compteurs, clés) retomberaient sous 16 px sans qu'aucune règle par champ ne les
 * couvre. Muter n'importe quelle règle de carte à 15/14 px fait rougir ce test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Concatène le corps de TOUS les blocs @media « mobile » (max-width ≤ 1023 px, quelle
 * que soit une éventuelle borne min-width — téléphone et tablette). Équilibrage
 * d'accolades pour ne pas couper un bloc en cours.
 */
function extractMobileBlocks(css) {
  let out = '';
  const re = /@media\s*\(([^)]*max-width:\s*(\d+)px[^)]*)\)([^{]*)\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const maxw = parseInt(m[2], 10);
    if (!(maxw <= 1023)) continue;
    const open = m.index + m[0].length - 1; // position du '{'
    let depth = 0, i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) break; }
    }
    out += '\n' + css.slice(open + 1, i);
    re.lastIndex = i + 1;
  }
  return out;
}

/** Rend les règles plates { selectors:[], decls:{} } d'un morceau de CSS sans @media imbriqué. */
function parseFlatRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0, buf = '';
  while (i < clean.length) {
    const ch = clean[i];
    if (ch === '{') {
      const prelude = buf.trim(); buf = '';
      let depth = 1, j = i + 1, body = '';
      for (; j < clean.length && depth > 0; j++) {
        if (clean[j] === '{') depth++;
        else if (clean[j] === '}') { depth--; if (depth === 0) break; }
        body += clean[j];
      }
      const decls = {};
      body.split(';').forEach(d => {
        const k = d.indexOf(':');
        if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).replace(/!important/g, '').trim();
      });
      rules.push({ selectors: prelude.split(',').map(s => s.trim()).filter(Boolean), decls });
      i = j + 1; continue;
    }
    buf += ch; i += 1;
  }
  return rules;
}

const pxOf = (v) => { const m = /(-?\d+(?:\.\d+)?)px/.exec(v || ''); return m ? parseFloat(m[1]) : null; };
// Une règle vise-t-elle un champ EDL saisissable ?
const targetsEdlField = (sel) =>
  /(#ov-edl|#edl-pieces-section)/.test(sel) && /(input|textarea|select|\.inp)\b/.test(sel);

describe('EDL — 16 px à la source sur mobile (CDC §2.4, invariant §2.10 nº1)', () => {
  let mobileRules, css;
  beforeAll(() => {
    css = readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8');
    const block = extractMobileBlocks(css);
    expect(block.length).toBeGreaterThan(100); // les blocs téléphone/tablette existent
    mobileRules = parseFlatRules(block);
  });

  it('aucune règle de champ EDL saisissable ne déclare une font-size < 16 px', () => {
    const offenders = [];
    for (const r of mobileRules) {
      if (!('font-size' in r.decls)) continue;
      const px = pxOf(r.decls['font-size']);
      if (px == null) continue;
      const hits = r.selectors.filter(targetsEdlField);
      if (hits.length && px < 16) offenders.push(hits.join(', ') + ' → ' + px + 'px');
    }
    expect(offenders).toEqual([]);
  });

  it('les champs de carte visés par le CDC §2.4 sont explicitement à 16 px', () => {
    // nom d'élément, obs entrée, obs entrée (sortie), obs sortie, nom de pièce
    const wanted = [
      /td:nth-child\(1\) input$/,
      /td:nth-child\(3\) textarea$/,
      /edl-cell-obsE textarea$/,
      /td:nth-child\(6\) textarea$/,
      /\.edl-piece-name$/,   // nom de pièce (ex-« div:first-child > input », renommé en classe §2.6)
    ];
    for (const re of wanted) {
      const rule = mobileRules.find(r => r.selectors.some(s => re.test(s)) && 'font-size' in r.decls);
      expect(rule, 'règle introuvable pour ' + re).toBeTruthy();
      expect(pxOf(rule.decls['font-size'])).toBeGreaterThanOrEqual(16);
    }
  });

  it('le garde catch-all #ov-edl …{font-size:16px} demeure (source unique des champs admin)', () => {
    const guard = mobileRules.find(r =>
      r.selectors.some(s => /#ov-edl textarea/.test(s)) &&
      'font-size' in r.decls && pxOf(r.decls['font-size']) >= 16);
    expect(guard, 'le garde catch-all a disparu → champs admin < 16 px').toBeTruthy();
  });
});
