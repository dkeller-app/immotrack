/**
 * __tests__/helpers/stockage-registre-ecrivains.test.js — CDC-STOCKAGE lot 1, gate G1.
 *
 * LE GARDE-FOU PERMANENT : « aucune sauvegarde n'écrit dans le stockage dont
 * dépend le save principal » (S-2) et « toute clé écrite est déclarée » (S-3).
 *
 * L'incident du 28/08 est né d'un `localStorage.setItem(<clé datée>,
 * JSON.stringify(DB))` ajouté un jour par un chantier, que personne n'a revu
 * ensuite. Ce test inventorie TOUS les écrivains `localStorage.setItem(` de
 * l'app (index.html + js/, hors vendor), RÉSOUT la clé de chacun en valeurs
 * concrètes, puis EXÉCUTE le registre (`classerCle`) sur chacune :
 *   - une clé que le registre ne connaît pas fait échouer la suite ;
 *   - une clé de classe `copie` (copie complète de la base) fait échouer la suite ;
 *   - une sérialisation de la base passée directement à `localStorage.setItem`
 *     fait échouer la suite : le miroir s'écrit par l'écrivain unique
 *     (`_miroirEcrire` / `ecrireAvecLiberation`), qui sait libérer la place.
 *
 * C'est un invariant de CODEBASE (comme scripts/check-inline-js.mjs) : il ne
 * vérifie pas qu'une ligne précise existe, il vérifie qu'AUCUN écrivain ne
 * viole la règle — y compris ceux qu'un chantier futur ajoutera.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { classerCle } from '../../js/core/stockage-local.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fichiersJs(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'vendor') out.push(...fichiersJs(p)); }
    else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Découpe les arguments d'un appel à partir de l'index juste après `(` (virgules de niveau 0). */
function argumentsDe(src, i) {
  const args = []; let prof = 0, debut = i, chaineEn = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (chaineEn) { if (c === '\\') { i++; continue; } if (c === chaineEn) chaineEn = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { chaineEn = c; continue; }
    if (c === '(' || c === '[' || c === '{') prof++;
    else if (c === ')' || c === ']' || c === '}') {
      if (prof === 0) { args.push(src.slice(debut, i).trim()); return args; }
      prof--;
    } else if (c === ',' && prof === 0) { args.push(src.slice(debut, i).trim()); debut = i + 1; }
  }
  return args;
}

/** Retire un niveau de parenthèses englobantes. */
const deparen = e => { e = e.trim(); while (e.startsWith('(') && e.endsWith(')') && argumentsDe(e, 1).length === 1 && argumentsDe(e, 1)[0].length === e.length - 2) e = e.slice(1, -1).trim(); return e; };

/** Découpe au niveau 0 sur un opérateur (' ? ', ' : ', ' + '). */
function decouper(expr, sep) {
  const parts = []; let prof = 0, debut = 0, chaineEn = null;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (chaineEn) { if (c === '\\') { i++; continue; } if (c === chaineEn) chaineEn = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { chaineEn = c; continue; }
    if ('([{'.includes(c)) prof++;
    else if (')]}'.includes(c)) prof--;
    else if (prof === 0 && expr.startsWith(sep, i)) { parts.push(expr.slice(debut, i)); debut = i + sep.length; i += sep.length - 1; }
  }
  parts.push(expr.slice(debut));
  return parts.map(s => s.trim());
}

/**
 * Clés dont l'expression ne se déduit pas du texte (clé construite dans une page
 * générée). Toute entrée ici doit être justifiée ; un nouvel écrivain illisible
 * fait échouer la suite tant qu'il n'y est pas ajouté.
 */
const RESOLUTIONS_MANUELLES = {
  // Popup de signature (code GÉNÉRÉ en chaîne, repli « Path 2 » quand l'opener est perdu) :
  // `var _BAIL_LS_KEY=` + JSON.stringify(KEY) → le miroir lui-même, dans son namespace.
  '_BAIL_LS_KEY': ['immotrack_v4', '_test_immotrack_v4'],
};

let SOURCES;       // [{ fichier, src }]
let ECRIVAINS;     // [{ fichier, ligne, cleExpr, valeurExpr, cles:[...] | null }]

function resoudre(expr, ctx, profondeur = 0) {
  if (profondeur > 8) return null;
  expr = deparen(expr);
  let m;
  if ((m = expr.match(/^'([^'\\]*)'$/)) || (m = expr.match(/^"([^"\\]*)"$/))) return [m[1]];
  if ((m = expr.match(/^`([^`$\\]*)`$/))) return [m[1]];
  if ((m = expr.match(/^_lsKey\(\s*(['"])([^'"]*)\1\s*\)$/))) return [m[2], '_test_' + m[2]];
  if (Object.prototype.hasOwnProperty.call(RESOLUTIONS_MANUELLES, expr)) return RESOLUTIONS_MANUELLES[expr];
  // ternaire : union des deux branches
  const q = decouper(expr, ' ? ');
  if (q.length === 2) {
    const b = decouper(q[1], ' : ');
    if (b.length === 2) { const a = resoudre(b[0], ctx, profondeur + 1), c = resoudre(b[1], ctx, profondeur + 1); return a && c ? [...new Set([...a, ...c])] : null; }
  }
  // concaténation : produit cartésien (Date.now() / String(...) → '0')
  const plus = decouper(expr, ' + ');
  if (plus.length > 1) {
    let acc = [''];
    for (const p of plus) {
      const r = /^(Date\.now\(\)|String\(.*\))$/.test(p) ? ['0'] : resoudre(p, ctx, profondeur + 1);
      if (!r) return null;
      acc = acc.flatMap(a => r.map(x => a + x));
    }
    return acc;
  }
  // appel d'un helper sans argument : `function nom() { return EXPR; }`
  if ((m = expr.match(/^([A-Za-z_$][\w$]*)\(\)$/))) {
    for (const { src } of SOURCES) {
      const d = src.match(new RegExp('function ' + m[1] + '\\(\\)\\s*\\{\\s*return ([^;]+);'));
      if (d) return resoudre(d[1], ctx, profondeur + 1);
    }
    return null;
  }
  // identifiant ou membre (`_offlineBoot.X` → X) : définition la plus proche AVANT l'écrivain,
  // sinon n'importe où (const/let/var/export const), sinon alias d'import `X as NOM`.
  if ((m = expr.match(/^(?:[A-Za-z_$][\w$]*\.)?([A-Za-z_$][\w$]*)$/))) {
    const nom = m[1];
    const def = new RegExp('(?:const|let|var)\\s+' + nom + '\\s*=\\s*([^;\\n]+)', 'g');
    const sansCommentaire = s => s.replace(/\s+\/\/.*$/, '');
    const avant = ctx.src.slice(Math.max(0, ctx.index - 1500), ctx.index);
    let dernier = null, x;
    while ((x = def.exec(avant))) dernier = x[1];
    if (dernier) {
      const r = resoudre(sansCommentaire(dernier), { src: ctx.src, index: ctx.index }, profondeur + 1);
      if (r) return r;
    }
    for (const s of [ctx, ...(SOURCES || [])]) {
      def.lastIndex = 0;
      const y = def.exec(s.src);
      if (y) { const r = resoudre(sansCommentaire(y[1]), { src: s.src, index: y.index }, profondeur + 1); if (r) return r; }
    }
    for (const s of (SOURCES || [])) {
      const a = s.src.match(new RegExp('\\b([A-Za-z_$][\\w$]*) as ' + nom + '\\b'));
      if (a) return resoudre(a[1], ctx, profondeur + 1);
    }
    return null;
  }
  return null;
}

beforeAll(() => {
  const fichiers = [join(repoRoot, 'index.html'), ...fichiersJs(join(repoRoot, 'js'))];
  SOURCES = fichiers.map(f => ({ fichier: relative(repoRoot, f), src: readFileSync(f, 'utf8') }));
  ECRIVAINS = [];
  const re = /localStorage\.setItem\(/g;
  for (const s of SOURCES) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(s.src))) {
      const [cleExpr, valeurExpr] = argumentsDe(s.src, m.index + m[0].length);
      const ligne = s.src.slice(0, m.index).split('\n').length;
      ECRIVAINS.push({ fichier: s.fichier, ligne, cleExpr, valeurExpr, cles: resoudre(cleExpr, { src: s.src, index: m.index }) });
    }
  }
});

describe('G1 — registre des écrivains du stockage local', () => {
  it('l’inventaire trouve bien les écrivains (garde contre un faux vert)', () => {
    expect(ECRIVAINS.length).toBeGreaterThan(30);
    expect(ECRIVAINS.some(e => e.fichier === 'index.html')).toBe(true);
    expect(ECRIVAINS.some(e => e.fichier.includes('supabase-entry'))).toBe(true);
  });

  it('S-3 — chaque clé écrite se résout et est reconnue par le registre', () => {
    const fautes = [];
    for (const e of ECRIVAINS) {
      if (!e.cles) { fautes.push(`${e.fichier}:${e.ligne} clé non résolue « ${e.cleExpr} »`); continue; }
      for (const k of e.cles) {
        const c = classerCle(k);
        if (c === 'inconnue') fautes.push(`${e.fichier}:${e.ligne} clé « ${k} » absente du registre (js/core/stockage-local.js)`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it('S-2 — aucune clé de classe « copie » n’a d’écrivain', () => {
    const fautes = ECRIVAINS.filter(e => (e.cles || []).some(k => classerCle(k) === 'copie'))
      .map(e => `${e.fichier}:${e.ligne} écrit une copie de la base (« ${e.cleExpr} »)`);
    expect(fautes).toEqual([]);
  });

  it('S-1 — la base n’est jamais sérialisée directement vers localStorage : l’écrivain unique libère la place', () => {
    // Seule exception : la popup de signature (page GÉNÉRÉE, sans accès aux fonctions de l'app).
    const fautes = ECRIVAINS
      .filter(e => /JSON\.stringify\(\s*(DB|db|dbLS|demoDB|cloudDB|window\.DB)\b/.test(e.valeurExpr || ''))
      .filter(e => e.cleExpr !== '_BAIL_LS_KEY')
      .map(e => `${e.fichier}:${e.ligne} setItem(${e.cleExpr}, ${e.valeurExpr})`);
    expect(fautes).toEqual([]);
  });

  it('le résolveur lui-même : les formes rencontrées donnent les bonnes clés', () => {
    const src = "const KEY = _isTestMode ? '_test_immotrack_v4' : 'immotrack_v4';   // commentaire\n";
    const ctx = { src, index: src.length };
    expect(resoudre("KEY + '_ecrit_at'", ctx).sort()).toEqual(['_test_immotrack_v4_ecrit_at', 'immotrack_v4_ecrit_at']);
    expect(resoudre("(typeof _lsKey === 'function' ? _lsKey('immBlocksCollapsed') : 'immBlocksCollapsed')", ctx).sort())
      .toEqual(['_test_immBlocksCollapsed', 'immBlocksCollapsed']);
    expect(classerCle(resoudre("KEY + '_corrupt_backup_' + Date.now()", ctx)[0])).toBe('copie');
  });
});
