#!/usr/bin/env node
/**
 * tools/sync-helpers-global-mirrors.mjs — régénère TOUS les mirrors IIFE
 * `js/helpers/*.global.js` depuis leurs modules ES de référence
 * `__tests__/helpers/*.js` (sources testées Vitest).
 *
 * Pourquoi : avant ce script (F7 audit v15.214), chaque mirror était copié
 * manuellement → risque de désync silencieuse à chaque modif ES sans bump
 * mirror (cf. F1 LOG-ANNONCE v15.211 : 8 variantes manquantes en navigateur).
 *
 * Stratégie : lire l'ES, retirer `export ` (mot-clé seul), envelopper IIFE,
 * exposer la liste des symboles dans `global.X`. Sanity check par paire.
 *
 * Usage : `node tools/sync-helpers-global-mirrors.mjs`
 *
 * À lancer avant chaque commit qui modifie un module ES helper, ou
 * automatiser via pre-commit hook.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Liste des paires ES⇄IIFE à synchroniser.
 * Pour ajouter un nouveau helper : ajouter une entrée ici.
 */
const PAIRS = [
  {
    name: 'annonce-generator',
    src: '__tests__/helpers/annonce-generator.js',
    dst: 'js/helpers/annonce-generator.global.js',
    globalName: 'AnnonceGenerator',
    exports: [
      'setSeed', 'rand', 'pick', 'seedFromString',
      'MAP_EXPO', 'MAP_VUE', 'MAP_LUM', 'MAP_CALM', 'MAP_CAR',
      'TONS_VALIDES', 'FORMATS_VALIDES',
      'etageLabel', 'adjLifestyle', 'surfTxt', 'dpeClasse',
      'formaterDateFr', 'garantiesLabel',
      'BANQUE_TITRES', 'BANQUE_ACCROCHES',
      'genererTitre', 'genererAccroche', 'genererDescription', 'genererAtouts',
      'genererQuartier', 'genererDossier', 'genererAnnonce',
    ],
    // Vérifications spécifiques (tpl counts)
    sanity: [
      { name: 'BANQUE_TITRES tpl', pattern: /BANQUE_TITRES\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/, marker: /tpl\s*:/g },
      { name: 'BANQUE_ACCROCHES tpl', pattern: /BANQUE_ACCROCHES\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/, marker: /tpl\s*:/g },
    ]
  },
  {
    name: 'adresse-parser',
    src: '__tests__/helpers/adresse-parser.js',
    dst: 'js/helpers/adresse-parser.global.js',
    globalName: 'AdresseParser',
    exports: ['parseAdresse', 'formatAdresse', 'needsAddressSplit'],
    // v15.216 F6 — sanity : compte les `function ` en source vs sortie.
    // Tolère le préfixe `export ` en source (strippé en sortie).
    sanity: [
      { name: 'function declarations', pattern: /[\s\S]*/, marker: /^\s*(?:export\s+)?function\s+\w+/gm }
    ]
  },
  {
    name: 'log-immeuble-resolver',
    src: '__tests__/helpers/log-immeuble-resolver.js',
    dst: 'js/helpers/log-immeuble-resolver.global.js',
    globalName: 'LogImmResolver',
    exports: [
      'resolveAddressForLog', 'resolvePeriodeConstrForLog',
      'resolveRegimeJuridiqueForLog', 'resolveAnneeForLog',
      'resolveEquipementsCommunsForLog', 'resolveInheritedForLog',
      'formatLogLocation'
    ],
    // Sanity custom : vérifier que le trampoline formatAdresse défensif EST présent
    // (régression F2 audit v15.215 : trampoline non défensif crashait silencieusement)
    sanity: [
      {
        name: 'trampoline formatAdresse défensif',
        pattern: /[\s\S]*/,
        marker: /typeof\s+global\.AdresseParser\.formatAdresse/g,
        mode: 'out-min',
        minOut: 1
      }
    ]
  },
  {
    name: 'georisques-erp-detector',
    src: '__tests__/helpers/georisques-erp-detector.js',
    dst: 'js/helpers/georisques-erp-detector.global.js',
    globalName: 'GeorisquesErpDetector',
    exports: [
      'GEORISQUES_API', 'BAN_API', 'ERP_INDETERMINE',
      'parentInsee',
      'banUrl', 'seismicUrl', 'radonUrl', 'pprnUrl', 'pprtUrl', 'pprmUrl', 'georisquesReportUrl',
      'parseBan', 'parseSeismic', 'parseRadon', 'parsePpr',
      'decideErp',
    ],
    // Sanity : compte les déclarations `function ` source vs sortie (tolère `export `).
    sanity: [
      { name: 'function declarations', pattern: /[\s\S]*/, marker: /^\s*(?:export\s+)?function\s+\w+/gm }
    ]
  },
  {
    name: 'bail-sign-coords',
    src: '__tests__/helpers/bail-sign-coords.js',
    dst: 'js/helpers/bail-sign-coords.global.js',
    globalName: 'BailSignCoords',
    exports: ['PDF_NATIVE', 'mmToPt', 'rectFromJsPdf', 'fallbackAnchors'],
  },
  {
    name: 'bail-sign-sigid',
    src: '__tests__/helpers/bail-sign-sigid.js',
    dst: 'js/helpers/bail-sign-sigid.global.js',
    globalName: 'BailSignSigid',
    exports: ['buildRemoteSigIdMap', 'relayComputeSigId'],
  },
  {
    name: 'bail-sign-manifest',
    src: '__tests__/helpers/bail-sign-manifest.js',
    dst: 'js/helpers/bail-sign-manifest.global.js',
    globalName: 'BailSignManifest',
    exports: ['SENTINEL', 'encode', 'decode', 'readFromDoc', 'embedInDoc'],
  },
  {
    name: 'build-sign-manifest',
    src: '__tests__/helpers/build-sign-manifest.js',
    dst: 'js/helpers/build-sign-manifest.global.js',
    globalName: 'BuildSignManifest',
    exports: ['buildSignManifest'],
  },
];

let totalErrors = 0;

for (const p of PAIRS) {
  const srcAbs = path.join(ROOT, p.src);
  const dstAbs = path.join(ROOT, p.dst);

  if (!fs.existsSync(srcAbs)) {
    console.error(`[${p.name}] ❌ Source absente : ${p.src}`);
    totalErrors++;
    continue;
  }

  const srcContent = fs.readFileSync(srcAbs, 'utf8');

  // 1) Strip "export " keyword (laisse les déclarations intactes).
  //    Gère également `import { ... } from './x.js'` qu'on transforme en TODO :
  //    le mirror doit inliner les dépendances. Pour adresse-parser et resolver,
  //    le resolver importe formatAdresse depuis adresse-parser. Pour le mirror,
  //    on a déjà inliné cette logique manuellement dans le wrapper (voir
  //    log-immeuble-resolver.global.js → _formatAdresse délégant à AdresseParser).
  //    Donc on RETIRE les `import { ... } from ...;` du contenu ES avant injection.
  let stripped = srcContent
    .replace(/^export\s+/gm, '')
    .replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');

  // 2) Détecter quelles fonctions importées doivent être disponibles dans l'IIFE.
  //    v15.216 F2 (P0 audit) — utilise matchAll (flag g) pour gérer N imports.
  //    Détecte aussi `import default` et `import * as` (rejet explicite).
  //    Génère un trampoline DÉFENSIF qui ne crash pas si la dep est absente —
  //    fallback gracieux retournant arguments[0]?.adr ou string vide pour préserver
  //    la robustesse perdue par la régénération auto (cf v15.215 régression F2).
  if (/^import\s+\w+\s+from/m.test(srcContent) || /^import\s+\*\s+as/m.test(srcContent)) {
    console.error(`[${p.name}] ❌ Import default ou namespace détecté — non supporté par le script de sync.`);
    totalErrors++;
    continue;
  }
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)['"]/g;
  const importMatches = [...srcContent.matchAll(importRegex)];
  let deps = '';
  if (importMatches.length > 0) {
    const depBlocks = [];
    for (const m of importMatches) {
      const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
      const depModule = m[2].replace(/\.js$/, '');
      const moduleGlobal = depModule === 'adresse-parser' ? 'AdresseParser' :
                            depModule === 'annonce-generator' ? 'AnnonceGenerator' :
                            depModule === 'log-immeuble-resolver' ? 'LogImmResolver' :
                            depModule === 'bail-sign-coords' ? 'BailSignCoords' :
                            null;
      if (!moduleGlobal) throw new Error(`[${p.name}] Dépendance inconnue : ./${depModule}.js`);
      depBlocks.push(`  // ─── DÉPENDANCES IMPORTÉES depuis ./${depModule}.js (résolues via global) ───\n` +
        names.map(n => {
          // Trampoline défensif : ne crash pas si AdresseParser/etc. pas chargé,
          // retourne un fallback raisonnable (regression-safe).
          return `  function ${n}(){
    if (!global.${moduleGlobal} || typeof global.${moduleGlobal}.${n} !== 'function') {
      console.warn('[mirror ${p.name}] dep manquante: global.${moduleGlobal}.${n}');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.${moduleGlobal}.${n}.apply(null, arguments);
  }`;
        }).join('\n'));
    }
    deps = '\n' + depBlocks.join('\n\n') + '\n';
  }

  // 3) Header IIFE
  const header = `/**
 * ${path.basename(p.dst)} — Wrapper browser (window.${p.globalName})
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    ${p.src}
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';
${deps}
`;

  // 4) Indent du contenu pour rester dans l'IIFE
  const indented = stripped.split('\n').map(l => l.length ? '  ' + l : '').join('\n');

  // 5) Bloc final qui attache les exports publics sur global.X
  const footerLines = ['', '  // ─── EXPORT GLOBAL ───────────────────────────────────────────────'];
  footerLines.push(`  global.${p.globalName} = {`);
  p.exports.forEach((name, idx) => {
    const comma = idx < p.exports.length - 1 ? ',' : '';
    footerLines.push(`    ${name}: ${name}${comma}`);
  });
  footerLines.push('  };');
  footerLines.push('})(typeof window !== \'undefined\' ? window : globalThis);');

  const out = header + indented + footerLines.join('\n') + '\n';

  fs.writeFileSync(dstAbs, out, 'utf8');

  // 6) Sanity checks paire
  // mode: 'equal' (défaut) → compare src vs out (les 2 doivent matcher)
  // mode: 'out-min' → out doit avoir >= minOut occurrences (src ignorée)
  let okSanity = true;
  for (const s of (p.sanity || [])) {
    if (s.mode === 'out-min') {
      const outMatch = out.match(s.pattern);
      const outN = outMatch ? (outMatch[0].match(s.marker) || []).length : 0;
      if (outN < (s.minOut || 1)) {
        console.error(`[${p.name}] ❌ ${s.name} : sortie=${outN} < ${s.minOut || 1}`);
        okSanity = false;
        totalErrors++;
      } else {
        console.log(`[${p.name}] ✓ ${s.name}: ${outN}`);
      }
    } else {
      // mode 'equal'
      const srcMatch = srcContent.match(s.pattern);
      const outMatch = out.match(s.pattern);
      const srcN = srcMatch ? (srcMatch[0].match(s.marker) || []).length : -1;
      const outN = outMatch ? (outMatch[0].match(s.marker) || []).length : -1;
      if (srcN !== outN) {
        console.error(`[${p.name}] ❌ Désync ${s.name} : source=${srcN}, sortie=${outN}`);
        okSanity = false;
        totalErrors++;
      } else {
        console.log(`[${p.name}] ✓ ${s.name}: ${srcN}`);
      }
    }
  }

  console.log(`[${p.name}] ✓ Sync ${p.src} → ${p.dst}${okSanity ? '' : ' (avec désync)'}`);
}

if (totalErrors > 0) {
  console.error(`\n❌ ${totalErrors} erreur(s) détectée(s).`);
  process.exit(1);
}
console.log('\n✓ Tous les mirrors synchronisés.');
