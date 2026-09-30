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
import { MIROIR_KEY, MIROIR_ECRIT_KEY, FLUSH_OK_KEY, ESPACES_KEY } from '../../js/core/offline-boot.js';

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

let SOURCES;       // [{ fichier, src }]
let ECRIVAINS;     // [{ fichier, ligne, fonction, cleExpr, valeurExpr, cles:[...] | null }]

/**
 * En-tête de fonction : déclaration (`function nom(`) ou fonction affectée
 * (`nom = function (`, `nom = (…) =>`, `nom = x =>`, `async` compris).
 */
const DECLARATION = /^[ \t]*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]*)\s*\(/;
const AFFECTEE = /([\w$.]+)\s*=\s*(?:async\s*)?(?:function\b[^(]*\(|\([^()]*\)\s*=>|[\w$]+\s*=>)/;
const _entetes = new Map();   // src → [{ debut, nom }] triés (calculés UNE fois, ligne par ligne)
function entetesDe(src) {
  if (_entetes.has(src)) return _entetes.get(src);
  const out = [];
  let pos = 0;
  for (const ligne of src.split('\n')) {
    // Les lignes géantes (bibliothèques base64 inlinées) ne portent pas d'en-tête utile : on les saute.
    if (ligne.length < 2000) {
      let m = ligne.match(DECLARATION);
      if (m) out.push({ debut: pos, nom: m[1] || '' });
      else if ((m = ligne.match(AFFECTEE))) out.push({ debut: pos, nom: m[1] });
    }
    pos += ligne.length + 1;
  }
  _entetes.set(src, out);
  return out;
}

/** La fonction englobante d'une position : le dernier en-tête de fonction dont la ligne la précède. */
function fonctionEnglobante(src, index) {
  let derniere = null;
  for (const e of entetesDe(src)) { if (e.debut >= index) break; derniere = e; }
  return derniere;
}

const sansCommentaire = s => s.replace(/\r/g, '').replace(/\s+\/\/.*$/, '').trim();   // fichiers en CRLF

/** Dernière occurrence (avant `fin`) d'un motif global ; rend { valeur, index } ou null. */
function derniereAvant(re, src, debut, fin) {
  re.lastIndex = debut;
  let m, r = null;
  while ((m = re.exec(src)) && m.index < fin) r = { valeur: m[1], index: m.index };
  return r;
}

/**
 * Résout l'expression d'une clé en valeurs concrètes. PORTÉE STRICTE (audit lot 1, point 2) :
 * une définition n'est acceptée que si elle est dans le MÊME fichier et AVANT l'appel —
 * d'abord dans la fonction englobante, puis au niveau supérieur du fichier (déclaration en
 * colonne 0). Jamais une définition homonyme d'un autre fichier ou d'une autre fonction :
 * sinon « non résolue », et le test échoue (sauf RESOLUTIONS_MANUELLES).
 */
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
  // helper sans argument du MÊME fichier, déclaré AVANT l'appel : `function nom() { return EXPR; }`
  if ((m = expr.match(/^([A-Za-z_$][\w$]*)\(\)$/))) {
    const d = derniereAvant(new RegExp('^function ' + m[1] + '\\(\\)\\s*\\{\\s*return ([^;]+);', 'gm'), ctx.src, 0, ctx.index);
    return d ? resoudre(sansCommentaire(d.valeur), { src: ctx.src, index: d.index }, profondeur + 1) : null;
  }
  // identifiant nu (les membres `module.X` passent par RESOLUTIONS_MANUELLES)
  if ((m = expr.match(/^([A-Za-z_$][\w$]*)$/))) {
    const nom = m[1];
    // 1) dans la fonction englobante, avant l'appel
    const f = fonctionEnglobante(ctx.src, ctx.index);
    if (f) {
      const d = derniereAvant(new RegExp('(?:const|let|var)\\s+' + nom + '\\s*=\\s*([^;\\n]+)', 'g'), ctx.src, f.debut, ctx.index);
      if (d) return resoudre(sansCommentaire(d.valeur), { src: ctx.src, index: d.index }, profondeur + 1);
    }
    // 2) au niveau supérieur du même fichier (colonne 0), avant l'appel
    const t = derniereAvant(new RegExp('^(?:export\\s+)?(?:const|let|var)\\s+' + nom + '\\s*=\\s*([^;\\n]+)', 'gm'), ctx.src, 0, ctx.index);
    if (t) return resoudre(sansCommentaire(t.valeur), { src: ctx.src, index: t.index }, profondeur + 1);
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
      const f = fonctionEnglobante(s.src, m.index);
      ECRIVAINS.push({ fichier: s.fichier, ligne, fonction: f ? f.nom : '', cleExpr, valeurExpr, cles: resoudre(cleExpr, { src: s.src, index: m.index }) });
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

  it('S-1 — la base (clé de classe « principal ») ne s’écrit QUE par l’écrivain unique, qui libère la place', () => {
    // La règle porte sur la CLÉ, pas sur l'expression de la valeur (audit lot 1, point 1) : l'ancien
    // `localStorage.setItem(KEY, data)` avec `data = JSON.stringify(DB)` doit être attrapé.
    // Écrivains autorisés : `_miroirEcrire` (index.html), `_ecrireMiroir` (supabase-entry.js), et la
    // popup de signature (`_BAIL_LS_KEY` — page GÉNÉRÉE, sans accès aux fonctions de l'app).
    const principaux = ECRIVAINS.filter(e => (e.cles || []).some(k => classerCle(k) === 'principal'));
    const fautes = principaux
      .filter(e => !(e.fichier === 'index.html' && e.fonction === '_miroirEcrire'))
      .filter(e => !(e.fichier.includes('supabase-entry') && e.fonction === '_ecrireMiroir'))
      .filter(e => e.cleExpr !== '_BAIL_LS_KEY')
      .map(e => `${e.fichier}:${e.ligne} (${e.fonction || 'hors fonction'}) setItem(${e.cleExpr}, ${e.valeurExpr})`);
    expect(fautes).toEqual([]);
    // Aujourd'hui : exactement ces trois sites (le repli direct de chaque écrivain + la popup).
    expect(principaux.map(e => e.fonction === '_miroirEcrire' || e.fonction === '_ecrireMiroir' ? e.fonction : e.cleExpr).sort())
      .toEqual(['_BAIL_LS_KEY', '_ecrireMiroir', '_miroirEcrire']);
  });

  it('le résolveur lui-même : les formes rencontrées donnent les bonnes clés', () => {
    const src = "const KEY = _isTestMode ? '_test_immotrack_v4' : 'immotrack_v4';   // commentaire\n";
    const ctx = { src, index: src.length };
    expect(resoudre("KEY + '_ecrit_at'", ctx).sort()).toEqual(['_test_immotrack_v4_ecrit_at', 'immotrack_v4_ecrit_at']);
    expect(resoudre("(typeof _lsKey === 'function' ? _lsKey('immBlocksCollapsed') : 'immBlocksCollapsed')", ctx).sort())
      .toEqual(['_test_immBlocksCollapsed', 'immBlocksCollapsed']);
    expect(classerCle(resoudre("KEY + '_corrupt_backup_' + Date.now()", ctx)[0])).toBe('copie');
  });

  it('portée stricte : jamais une définition d’une autre fonction, d’un autre fichier, ou APRÈS l’appel', () => {
    const src = [
      "function a() {",
      "  const k = 'immo_appareil_id';",
      "  localStorage.setItem(k, '1');",
      "}",
      "function b() {",
      "  localStorage.setItem(k, '1');",          // `k` n'est défini que dans a() → non résolu
      "  localStorage.setItem(PLUS_TARD, '1');",  // défini après l'appel → non résolu
      "}",
      "const PLUS_TARD = 'immotrack_theme';",
    ].join('\n');
    const appel = (n) => { let i = -1; for (let j = 0; j < n; j++) i = src.indexOf('localStorage.setItem(', i + 1); return { src, index: i }; };
    expect(resoudre('k', appel(1))).toEqual(['immo_appareil_id']);
    expect(resoudre('k', appel(2))).toBeNull();
    expect(resoudre('PLUS_TARD', appel(3))).toBeNull();
    // Une définition homonyme présente dans un AUTRE fichier de l'app n'est jamais retenue.
    expect(SOURCES.some(s => /const k = _lsKey\('immo_appareil_id'\)/.test(s.src))).toBe(true);
    expect(resoudre('k', { src: "function c() {\n  localStorage.setItem(k, '1');\n}", index: 17 })).toBeNull();
  });
});
