/**
 * __tests__/helpers/stockage-registre-ecrivains.test.js — CDC-STOCKAGE lot 1, gate G1.
 *
 * LE GARDE-FOU PERMANENT : « aucune sauvegarde n'écrit dans le stockage dont
 * dépend le save principal » (S-2), « toute clé écrite est déclarée » (S-3) et
 * « la base ne s'écrit que par l'écrivain unique, qui sait libérer la place » (S-1).
 *
 * L'incident du 28/08 est né d'un `localStorage.setItem(<clé datée>,
 * JSON.stringify(DB))` ajouté un jour par un chantier, que personne n'a revu
 * ensuite. Ce test inventorie TOUS les écrivains `localStorage.setItem(` de
 * l'app (index.html + js/, hors vendor), RÉSOUT la clé de chacun en valeurs
 * concrètes selon la PORTÉE LEXICALE réelle, puis EXÉCUTE le registre
 * (`classerCle`) sur chacune.
 *
 * Portée (audits lot 1) : les fonctions et blocs sont délimités par APPARIEMENT
 * D'ACCOLADES (chaînes, commentaires et regex ignorés — helper commun
 * `_extraction-source.js`). Une définition `const/let/var` n'est retenue que si
 * elle est dans le MÊME fichier, AVANT l'appel, et que son bloc CONTIENT l'appel
 * (ou qu'elle est au niveau supérieur). Un appel placé après la fermeture d'une
 * fonction n'appartient pas à cette fonction.
 *
 * C'est un invariant de CODEBASE (comme scripts/check-inline-js.mjs) : il ne
 * vérifie pas qu'une ligne précise existe, il vérifie qu'AUCUN écrivain ne
 * viole la règle — y compris ceux qu'un chantier futur ajoutera. Les sources
 * synthétiques en fin de fichier prouvent qu'il sait échouer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { classerCle } from '../../js/core/stockage-local.js';
import { MIROIR_KEY, MIROIR_ECRIT_KEY, FLUSH_OK_KEY, ESPACES_KEY } from '../../js/core/offline-boot.js';
import { parcourirJs } from './_extraction-source.js';

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
 * Clés dont l'expression ne se déduit pas du texte du MÊME fichier : clé construite dans une
 * page générée, alias d'import, membre d'un module importé. Les valeurs viennent des VRAIS
 * modules (importés ci-dessus), pas d'un texte recopié. Toute entrée ici doit être justifiée ;
 * un nouvel écrivain illisible fait échouer la suite tant qu'il n'y est pas ajouté.
 */
const RESOLUTIONS_MANUELLES = {
  // Popup de signature (code GÉNÉRÉ en chaîne, repli « Path 2 » quand l'opener est perdu) :
  // `var _BAIL_LS_KEY=` + JSON.stringify(KEY) → le miroir lui-même, dans son namespace.
  '_BAIL_LS_KEY': ['immotrack_v4', '_test_immotrack_v4'],
  // js/app/supabase-entry.js : `import { MIROIR_KEY as MIRROR_KEY } from '../core/offline-boot.js'`.
  'MIRROR_KEY': [MIROIR_KEY],
  // js/app/supabase-entry.js : `_offlineBoot = await import('../core/offline-boot.js')`.
  '_offlineBoot.ESPACES_KEY': [ESPACES_KEY],
  '_offlineBoot.FLUSH_OK_KEY': [FLUSH_OK_KEY],
  '_offlineBoot.MIROIR_ECRIT_KEY': [MIROIR_ECRIT_KEY],
};

// ── Analyse de portée ─────────────────────────────────────────────────────────────────────────

/** Les régions JavaScript d'un fichier : tout le fichier pour un .js, les <script> inline pour un .html. */
function regionsJs(fichier, src) {
  if (!fichier.endsWith('.html')) return [[0, src.length]];
  // Les commentaires HTML sont neutralisés (mêmes longueurs, positions conservées) : ils peuvent
  // contenir le mot « <script> » (même précaution que scripts/check-inline-js.mjs).
  const neutre = src.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(neutre))) { const debut = m.index + m[0].indexOf('>') + 1; out.push([debut, debut + m[1].length]); }
  return out;
}

const MOTS_DE_BLOC = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

/** Une paire d'accolades est-elle le corps d'une FONCTION ? Si oui, son nom (ou ''). */
function classerAccolade(src, o) {
  let i = o - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  const avant = src.slice(Math.max(0, i - 400), i + 1);
  if (avant.endsWith('=>')) {
    const m = avant.match(/([\w$.]+)\s*[:=]\s*(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>$/);
    return { fn: true, nom: m ? m[1] : '' };
  }
  if (src[i] !== ')') return { fn: false, nom: '' };
  let prof = 0, j = i;
  for (; j >= 0; j--) { if (src[j] === ')') prof++; else if (src[j] === '(') { prof--; if (prof === 0) break; } }
  const tete = src.slice(Math.max(0, j - 400), j);
  let m;
  if ((m = tete.match(/function\s*\*?\s*([\w$]*)\s*$/))) {
    if (m[1]) return { fn: true, nom: m[1] };
    const a = tete.match(/([\w$.]+)\s*[:=]\s*(?:async\s+)?function\s*\*?\s*$/);
    return { fn: true, nom: a ? a[1] : '' };
  }
  if ((m = tete.match(/([\w$]+)\s*$/))) {
    if (MOTS_DE_BLOC.has(m[1])) return { fn: false, nom: '' };
    return { fn: true, nom: m[1] };            // méthode abrégée `nom(…) {` (objet ou classe)
  }
  return { fn: false, nom: '' };
}

/** Analyse une source : paires d'accolades de code, classées fonction / bloc. */
function analyser(fichier, src) {
  const regions = regionsJs(fichier, src);
  const paires = [];
  for (const [d, f] of regions) {
    const pile = [];
    parcourirJs(src, d, f, (i, c) => {
      if (c === '{') pile.push(i);
      else { const o = pile.pop(); if (o != null) paires.push({ o, c: i, ...classerAccolade(src, o) }); }
    });
  }
  paires.sort((a, b) => a.o - b.o);
  return { fichier, src, regions, paires };
}

const contient = (p, pos) => p.o < pos && pos < p.c;
/** Le bloc le plus INTÉRIEUR qui contient `pos` (null = niveau supérieur). */
function blocDe(a, pos) { let r = null; for (const p of a.paires) { if (p.o >= pos) break; if (contient(p, pos) && (!r || p.o > r.o)) r = p; } return r; }
/** La fonction la plus intérieure qui contient `pos` (null = hors fonction). */
function fonctionDe(a, pos) { let r = null; for (const p of a.paires) { if (p.o >= pos) break; if (p.fn && contient(p, pos) && (!r || p.o > r.o)) r = p; } return r; }
const dansJs = (a, pos) => a.regions.some(([d, f]) => d <= pos && pos < f);
/** Une définition en `d` est-elle visible à l'appel `p` ? (même fichier, avant, son bloc contient l'appel) */
function visible(a, d, p) {
  if (!(d < p) || !dansJs(a, d)) return false;
  const b = blocDe(a, d);
  return !b || contient(b, p);
}

const sansCommentaire = s => s.replace(/\r/g, '').replace(/\s+\/\/.*$/, '').trim();   // fichiers en CRLF

/**
 * Résout l'expression d'une clé en valeurs concrètes, dans l'analyse `a` du fichier, pour un
 * appel en `pos`. PORTÉE STRICTE : définition du même fichier, avant l'appel, visible depuis
 * l'appel. Sinon « non résolue » (null), sauf RESOLUTIONS_MANUELLES.
 */
function resoudre(expr, a, pos, profondeur = 0) {
  if (profondeur > 8) return null;
  expr = deparen(expr);
  let m;
  if ((m = expr.match(/^'([^'\\]*)'$/)) || (m = expr.match(/^"([^"\\]*)"$/))) return [m[1]];
  if ((m = expr.match(/^`([^`$\\]*)`$/))) return [m[1]];
  if ((m = expr.match(/^_lsKey\(\s*(['"])([^'"]*)\1\s*\)$/))) return [m[2], '_test_' + m[2]];
  if (Object.prototype.hasOwnProperty.call(RESOLUTIONS_MANUELLES, expr)) return RESOLUTIONS_MANUELLES[expr];
  const q = decouper(expr, ' ? ');
  if (q.length === 2) {
    const b = decouper(q[1], ' : ');
    if (b.length === 2) { const x = resoudre(b[0], a, pos, profondeur + 1), y = resoudre(b[1], a, pos, profondeur + 1); return x && y ? [...new Set([...x, ...y])] : null; }
  }
  const plus = decouper(expr, ' + ');
  if (plus.length > 1) {
    let acc = [''];
    for (const p of plus) {
      const r = /^(Date\.now\(\)|String\(.*\))$/.test(p) ? ['0'] : resoudre(p, a, pos, profondeur + 1);
      if (!r) return null;
      acc = acc.flatMap(x => r.map(y => x + y));
    }
    return acc;
  }
  // helper sans argument : `function nom() { return EXPR; }` du même fichier, déclaré avant et visible
  if ((m = expr.match(/^([A-Za-z_$][\w$]*)\(\)$/))) {
    const re = new RegExp('function ' + m[1] + '\\(\\)\\s*\\{\\s*return ([^;]+);', 'g');
    let x, retenue = null;
    while ((x = re.exec(a.src)) && x.index < pos) if (visible(a, x.index, pos)) retenue = x;
    return retenue ? resoudre(sansCommentaire(retenue[1]), a, retenue.index, profondeur + 1) : null;
  }
  // identifiant nu : dernière définition visible
  if ((m = expr.match(/^([A-Za-z_$][\w$]*)$/))) {
    const re = new RegExp('(?:const|let|var)\\s+' + m[1] + '\\s*=\\s*([^;\\n]+)', 'g');
    let x, retenue = null;
    while ((x = re.exec(a.src)) && x.index < pos) if (visible(a, x.index, pos)) retenue = x;
    return retenue ? resoudre(sansCommentaire(retenue[1]), a, retenue.index, profondeur + 1) : null;
  }
  return null;
}

/** Tous les écrivains `localStorage.setItem(` d'un ensemble de sources [{ fichier, src }]. */
function inventorier(sources) {
  const out = [];
  for (const s of sources) {
    const a = analyser(s.fichier, s.src);
    const re = /localStorage\.setItem\(/g;
    let m;
    while ((m = re.exec(s.src))) {
      const [cleExpr, valeurExpr] = argumentsDe(s.src, m.index + m[0].length);
      const f = fonctionDe(a, m.index);
      out.push({
        fichier: s.fichier, ligne: s.src.slice(0, m.index).split('\n').length,
        fonction: f ? f.nom : '', cleExpr, valeurExpr, cles: resoudre(cleExpr, a, m.index),
      });
    }
  }
  return out;
}

// ── Les trois règles ──────────────────────────────────────────────────────────────────────────
function fautesS3(ecrivains) {
  const fautes = [];
  for (const e of ecrivains) {
    if (!e.cles) { fautes.push(`${e.fichier}:${e.ligne} clé non résolue « ${e.cleExpr} »`); continue; }
    for (const k of e.cles) if (classerCle(k) === 'inconnue') fautes.push(`${e.fichier}:${e.ligne} clé « ${k} » absente du registre (js/core/stockage-local.js)`);
  }
  return fautes;
}
function fautesS2(ecrivains) {
  return ecrivains.filter(e => (e.cles || []).some(k => classerCle(k) === 'copie'))
    .map(e => `${e.fichier}:${e.ligne} écrit une copie de la base (« ${e.cleExpr} »)`);
}
const principaux = ecrivains => ecrivains.filter(e => (e.cles || []).some(k => classerCle(k) === 'principal'));
function fautesS1(ecrivains) {
  // La règle porte sur la CLÉ (classe « principal »), pas sur l'expression de la valeur.
  // Écrivains autorisés : `_miroirEcrire` (index.html), `_ecrireMiroir` (supabase-entry.js), et la
  // popup de signature (`_BAIL_LS_KEY` — page GÉNÉRÉE, sans accès aux fonctions de l'app).
  return principaux(ecrivains)
    .filter(e => !(e.fichier === 'index.html' && e.fonction === '_miroirEcrire'))
    .filter(e => !(e.fichier.includes('supabase-entry') && e.fonction === '_ecrireMiroir'))
    .filter(e => e.cleExpr !== '_BAIL_LS_KEY')
    .map(e => `${e.fichier}:${e.ligne} (${e.fonction || 'hors fonction'}) setItem(${e.cleExpr}, ${e.valeurExpr})`);
}

let SOURCES, ECRIVAINS;
beforeAll(() => {
  const fichiers = [join(repoRoot, 'index.html'), ...fichiersJs(join(repoRoot, 'js'))];
  SOURCES = fichiers.map(f => ({ fichier: relative(repoRoot, f), src: readFileSync(f, 'utf8') }));
  ECRIVAINS = inventorier(SOURCES);
});

describe('G1 — registre des écrivains du stockage local (inventaire RÉEL de l’app)', () => {
  it('l’inventaire trouve les écrivains attendus (garde contre un faux vert)', () => {
    expect(ECRIVAINS.length).toBeGreaterThanOrEqual(39);
    expect(ECRIVAINS.some(e => e.fichier === 'index.html')).toBe(true);
    expect(ECRIVAINS.some(e => e.fichier.includes('supabase-entry'))).toBe(true);
  });

  it('S-3 — chaque clé écrite se résout (portée stricte) et est reconnue par le registre', () => {
    expect(fautesS3(ECRIVAINS)).toEqual([]);
  });

  it('S-2 — aucune clé de classe « copie » n’a d’écrivain', () => {
    expect(fautesS2(ECRIVAINS)).toEqual([]);
  });

  it('S-1 — la base ne s’écrit QUE par l’écrivain unique (et la popup de signature)', () => {
    expect(fautesS1(ECRIVAINS)).toEqual([]);
    expect(principaux(ECRIVAINS).map(e => e.fonction === '_miroirEcrire' || e.fonction === '_ecrireMiroir' ? e.fonction : e.cleExpr).sort())
      .toEqual(['_BAIL_LS_KEY', '_ecrireMiroir', '_miroirEcrire']);
  });
});

describe('G1 — le détecteur SAIT ÉCHOUER (sources synthétiques des audits)', () => {
  const src = (fichier, lignes) => [{ fichier, src: lignes.join('\n') }];

  it('écrivain `setItem(KEY, data)` avec `data = JSON.stringify(DB)` hors de l’écrivain unique → S-1 échoue', () => {
    const e = inventorier(src('js/core/fautif.js', [
      "const KEY = 'immotrack_v4';",
      'export function fautif(DB) {',
      '  const data = JSON.stringify(DB);',
      '  localStorage.setItem(KEY, data);',
      '}',
    ]));
    expect(fautesS1(e)).toHaveLength(1);
  });

  it('REVUE 1 — `setItem` de haut niveau placé APRÈS `_miroirEcrire` : il n’en fait pas partie → S-1 échoue', () => {
    const e = inventorier(src('index.html', [
      '<script>',
      "const KEY = 'immotrack_v4';",
      'function _miroirEcrire(json) {',
      '  localStorage.setItem(KEY, json);',
      '}',
      'localStorage.setItem(KEY, JSON.stringify(DB));',
      '</script>',
    ]));
    expect(e.map(x => x.fonction)).toEqual(['_miroirEcrire', '']);
    expect(fautesS1(e)).toHaveLength(1);
    expect(fautesS1(e)[0]).toContain('hors fonction');
  });

  it('REVUE 2 — méthode d’objet `ecrire() {` : le `const k` de la fonction PRÉCÉDENTE n’est pas visible → S-3 échoue', () => {
    const e = inventorier(src('js/core/methode.js', [
      'function avant() {',
      "  const k = 'immo_appareil_id';",
      "  localStorage.setItem(k, '1');",
      '}',
      'const o = {',
      '  ecrire() {',
      "    localStorage.setItem(k, '1');",
      '  },',
      '};',
    ]));
    expect(e[0].cles).toEqual(['immo_appareil_id']);
    expect(e[1].fonction).toBe('ecrire');
    expect(fautesS3(e)).toEqual([expect.stringContaining('clé non résolue « k »')]);
  });

  it('REVUE 3 — en-tête sur une ligne de plus de 2000 caractères : pas de reprise du `const` précédent → S-3 échoue', () => {
    const e = inventorier(src('js/core/longue.js', [
      'function avant() {',
      "  const k = 'immo_appareil_id';",
      '}',
      "function fautive() { const remplissage = '" + 'x'.repeat(2500) + "'; localStorage.setItem(k, '1'); }",
    ]));
    expect(e[0].fonction).toBe('fautive');
    expect(fautesS3(e)).toEqual([expect.stringContaining('clé non résolue « k »')]);
  });

  it('définition APRÈS l’appel, ou dans un bloc qui ne contient pas l’appel → non résolue', () => {
    const e = inventorier(src('js/core/portee.js', [
      'function f(x) {',
      "  if (x) { const k = 'immotrack_theme'; }",
      "  localStorage.setItem(k, '1');",
      "  localStorage.setItem(PLUS_TARD, '1');",
      '}',
      "const PLUS_TARD = 'immotrack_theme';",
    ]));
    expect(e.map(x => x.cles)).toEqual([null, null]);
  });

  it('les formes légitimes restent résolues (niveau supérieur, ternaire, concaténation, helper)', () => {
    const e = inventorier(src('js/core/formes.js', [
      "const KEY = _isTestMode ? '_test_immotrack_v4' : 'immotrack_v4';   // commentaire",
      "function _menuKey() { return (typeof _lsKey === 'function') ? _lsKey('immo_menu_on') : 'immo_menu_on'; }",
      'function g() {',
      "  localStorage.setItem(KEY + '_ecrit_at', '1');",
      "  localStorage.setItem(_menuKey(), '[]');",
      "  const k = _lsKey('immo_appareil_id');",
      "  if (true) { localStorage.setItem(k, 'ap-1'); }",
      '}',
    ]));
    expect(e.map(x => (x.cles || []).slice().sort())).toEqual([
      ['_test_immotrack_v4_ecrit_at', 'immotrack_v4_ecrit_at'],
      ['_test_immo_menu_on', 'immo_menu_on'],
      ['_test_immo_appareil_id', 'immo_appareil_id'],
    ]);
    expect(fautesS3(e)).toEqual([]);
  });
});
