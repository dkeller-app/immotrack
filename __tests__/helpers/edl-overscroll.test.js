/**
 * __tests__/helpers/edl-overscroll.test.js — chantier EDL TERRAIN, lot 0.
 *
 * CDC docs/CDC-EDL.md §3bis + §9 invariant 20 :
 *   « Un défilement vers le bas, où qu'il parte dans la modale EDL, ne déclenche
 *     JAMAIS le rechargement de la page. »
 *
 * Le mécanisme du bug (mesuré le 20/08) : `overscroll-behavior` n'existait nulle
 * part dans le dépôt. La modale EDL défile dans un conteneur imbriqué, lui-même
 * dans `.ov` qui défile : arrivé en haut, le geste se chaîne au document et le
 * navigateur déclenche son pull-to-refresh. L'app repart sur l'Accueil, la
 * modale n'existe plus.
 *
 * Ce test ne cherche pas un extrait de source : il PARSE la feuille de style,
 * résout la déclaration effective de chaque conteneur défilant de la chaîne EDL,
 * et vérifie séparément que le balisage visé par le sélecteur existe toujours
 * (sinon la règle serait vraie mais ne s'appliquerait à rien).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Parseur CSS minimal : rend les règles de PREMIER NIVEAU (hors @media/@supports)
 * sous la forme { selectors: string[], decls: {prop: value} }.
 * Suffisant ici : les règles du lot 0 sont toutes au premier niveau, donc
 * appliquées à tous les formats — c'est exactement ce qu'on veut vérifier.
 */
function parseTopLevelRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0, buf = '';
  while (i < clean.length) {
    const ch = clean[i];
    if (ch === '{') {
      const prelude = buf.trim(); buf = '';
      // Corps de la règle : lire jusqu'à l'accolade fermante appairée.
      let depth = 1, body = '';
      i++;
      while (i < clean.length && depth > 0) {
        if (clean[i] === '{') depth++;
        else if (clean[i] === '}') { depth--; if (depth === 0) break; }
        body += clean[i]; i++;
      }
      i++;
      if (prelude.startsWith('@')) {
        // At-rule à blocs (media, supports…) : on n'y descend pas volontairement.
        continue;
      }
      const decls = {};
      body.split(';').forEach(d => {
        const k = d.indexOf(':');
        if (k < 0) return;
        const prop = d.slice(0, k).trim().toLowerCase();
        const val = d.slice(k + 1).trim();
        if (prop && val && !prop.startsWith('@')) decls[prop] = val;
      });
      rules.push({ selectors: prelude.split(',').map(s => s.trim()).filter(Boolean), decls });
      continue;
    }
    buf += ch; i++;
  }
  return rules;
}

/** Valeur effective (dernière déclaration gagnante) d'une propriété pour un sélecteur exact. */
function effectiveDecl(rules, selector, prop) {
  let val;
  for (const r of rules) {
    if (!r.selectors.includes(selector)) continue;
    if (r.decls[prop] !== undefined) val = r.decls[prop];
  }
  return val;
}

/** La valeur contient-elle bien la containment ? (`contain` ou `none` empêchent le pull-to-refresh) */
function empechePullToRefresh(val) {
  if (!val) return false;
  const v = val.toLowerCase();
  return v === 'contain' || v === 'none' || /\b(contain|none)\b/.test(v);
}

let rules, indexHtml;
beforeAll(() => {
  rules = parseTopLevelRules(readFileSync(resolve(repoRoot, 'css/main.css'), 'utf8'));
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
});

describe('invariant 20 — aucun défilement de la chaîne EDL ne remonte au document', () => {
  // La chaîne réelle, du plus interne au plus externe :
  //   corps de la modale EDL → .ov (#ov-edl) → document (html/body)
  // `.pc` est le défilement de page derrière la modale, `.m-body` celui des
  // autres modales : mêmes symptômes, même correctif.
  const chaine = [
    ['html', 'la racine du document'],
    ['body', 'le document'],
    ['.ov', 'le fond de modale, qui défile lui aussi'],
    ['.m-body', 'le corps des modales'],
    ['#ov-edl > .modal > div[style*="overflow-y:auto"]', 'le corps de la modale EDL'],
    ['.pc', 'le défilement de page'],
  ];

  it.each(chaine)('%s (%s) contient son overscroll vertical', (selector) => {
    const y = effectiveDecl(rules, selector, 'overscroll-behavior-y');
    const tout = effectiveDecl(rules, selector, 'overscroll-behavior');
    expect(empechePullToRefresh(y) || empechePullToRefresh(tout)).toBe(true);
  });

  it('la règle du corps de modale EDL vise un balisage qui existe encore', () => {
    // Sans ce contrôle, la règle CSS pourrait rester vraie tout en ne
    // s'appliquant plus à rien (balisage déplacé, classe ajoutée…).
    const debut = indexHtml.indexOf('id="ov-edl"');
    expect(debut).toBeGreaterThan(0);
    const zone = indexHtml.slice(debut, debut + 4000);
    // enfant direct de .modal, avec un overflow-y:auto en style en ligne
    expect(/<div class="modal[^"]*"[\s\S]*?<div style="[^"]*overflow-y:auto[^"]*"/.test(zone)).toBe(true);
  });

  it('aucun conteneur de la chaîne ne laisse la valeur par défaut (auto)', () => {
    const defauts = chaine
      .map(([sel]) => [sel, effectiveDecl(rules, sel, 'overscroll-behavior-y') || effectiveDecl(rules, sel, 'overscroll-behavior')])
      .filter(([, v]) => !v || /^auto$/i.test(String(v)));
    expect(defauts).toEqual([]);
  });
});
