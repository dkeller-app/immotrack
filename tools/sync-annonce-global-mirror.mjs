#!/usr/bin/env node
/**
 * tools/sync-annonce-global-mirror.mjs — auto-régénère le mirror IIFE
 * `js/helpers/annonce-generator.global.js` depuis le module ES
 * `__tests__/helpers/annonce-generator.js` (source de vérité testée Vitest).
 *
 * Pourquoi : avant ce script, le mirror était copié manuellement → 8 variantes
 * d'accroches manquantes en prod et descriptions tronquées (audit v15.210 F1).
 *
 * Stratégie : lire l'ES, retirer les `export ` (mot-clé), envelopper dans une
 * IIFE qui attache au global tout ce qui est listé dans EXPORTS_PUBLICS.
 * Idempotent et déterministe.
 *
 * Usage : `node tools/sync-annonce-global-mirror.mjs`
 *         (et lancer en pré-commit ou avant chaque bump version).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, '__tests__/helpers/annonce-generator.js');
const DST  = path.join(ROOT, 'js/helpers/annonce-generator.global.js');

// Liste explicite des symboles à exposer sur window.AnnonceGenerator.
// (Synchro avec le bloc `EXPORTS` en bas du module ES.)
const EXPORTS_PUBLICS = [
  'setSeed', 'rand', 'pick', 'seedFromString',
  'MAP_EXPO', 'MAP_VUE', 'MAP_LUM', 'MAP_CALM', 'MAP_CAR',
  'TONS_VALIDES', 'FORMATS_VALIDES',
  'etageLabel', 'adjLifestyle', 'surfTxt', 'dpeClasse',
  'formaterDateFr', 'garantiesLabel',
  'BANQUE_TITRES', 'BANQUE_ACCROCHES',
  'genererTitre', 'genererAccroche', 'genererDescription', 'genererAtouts',
  'genererQuartier', 'genererDossier', 'genererAnnonce',
];

const srcContent = fs.readFileSync(SRC, 'utf8');

// 1) Retirer chaque `export ` (mot-clé seul, conserve la déclaration).
//    On ne touche pas aux `export default` ni aux `export { a, b }` qui ne
//    sont pas utilisés dans ce module.
const stripped = srcContent.replace(/^export\s+/gm, '');

// 2) Construire le header du wrapper IIFE.
const header = `/**
 * annonce-generator.global.js — Wrapper browser (window.AnnonceGenerator)
 * (LOG-ANNONCE, généré automatiquement v15.211)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis
 *    __tests__/helpers/annonce-generator.js par
 *    tools/sync-annonce-global-mirror.mjs
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-annonce-global-mirror.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

`;

// 3) Indent pour rester dans l'IIFE.
const indented = stripped.split('\n').map(l => l.length ? '  ' + l : '').join('\n');

// 4) Bloc final qui attache les exports publics sur global.AnnonceGenerator.
const footerLines = ['  // ─── EXPORT GLOBAL ───────────────────────────────────────────────'];
footerLines.push('  global.AnnonceGenerator = {');
EXPORTS_PUBLICS.forEach((name, idx) => {
  const comma = idx < EXPORTS_PUBLICS.length - 1 ? ',' : '';
  footerLines.push(`    ${name}: ${name}${comma}`);
});
footerLines.push('  };');
footerLines.push('})(typeof window !== \'undefined\' ? window : globalThis);');

const out = header + indented + '\n\n' + footerLines.join('\n') + '\n';

fs.writeFileSync(DST, out, 'utf8');

// 5) Sanity check : compter les BANQUE_TITRES et BANQUE_ACCROCHES variantes en
//    source vs sortie (heuristique simple : compter `tpl:` dans chaque banque).
function countTpl(content, banqueName) {
  // Match jusqu'à `});` après l'ouverture de la banque.
  const re = new RegExp(banqueName + '\\s*=\\s*Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);');
  const m = content.match(re);
  if (!m) return -1;
  return (m[0].match(/tpl\s*:/g) || []).length;
}
const srcTitres   = countTpl(srcContent, 'BANQUE_TITRES');
const srcAccroch  = countTpl(srcContent, 'BANQUE_ACCROCHES');
const outTitres   = countTpl(out, 'BANQUE_TITRES');
const outAccroch  = countTpl(out, 'BANQUE_ACCROCHES');

console.log(`[sync-mirror] SRC ${path.relative(ROOT, SRC)} → DST ${path.relative(ROOT, DST)}`);
console.log(`[sync-mirror] BANQUE_TITRES tpl: source ${srcTitres}, sortie ${outTitres}`);
console.log(`[sync-mirror] BANQUE_ACCROCHES tpl: source ${srcAccroch}, sortie ${outAccroch}`);

if (srcTitres !== outTitres || srcAccroch !== outAccroch) {
  console.error('[sync-mirror] ❌ Désync détectée — abort.');
  process.exit(1);
}
console.log('[sync-mirror] ✓ Sync OK');
