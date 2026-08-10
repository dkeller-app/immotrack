/**
 * demo/verify-2044.mjs — Vérifie la 2044 du seed Camille avec la VRAIE logique de l'app.
 *
 * Méthode :
 *   1. Importe _compute2044 depuis le module réel js/core/legal-2044.js (ESM).
 *   2. Extrait STD_CATEGORIES (le tableau réel) depuis index.html par découpage de texte
 *      (la const n'est pas exportée) — pas de copie manuelle = pas de dérive.
 *   3. Construit le DB Camille via demo/propryo-demo-seed.js (mêmes données que le navigateur).
 *   4. Reconstruit `opts` comme _legal2044BuildOpts (index.html ~47381) le ferait pour
 *      l'entité « Camille Mercier », année 2025 :
 *        refs = 3 logements nus, imms = 3 immeubles, nbLocaux = 3, partBailleur225 = 0.
 *   5. Imprime le tableau 2044 + le résultat foncier.
 *
 * Lancer :  node demo/verify-2044.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 1) Vraie logique 2044
const { _compute2044 } = await import('file://' + join(ROOT, 'js', 'core', 'legal-2044.js'));

// 2) STD_CATEGORIES depuis index.html (tableau réel, non exporté → extraction par texte)
function extractStdCategories() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('const STD_CATEGORIES = [');
  if (start < 0) throw new Error('STD_CATEGORIES introuvable dans index.html');
  const open = html.indexOf('[', start);
  // Trouver le ] correspondant (les objets ne contiennent pas de [ ] imbriqués ici).
  let depth = 0, end = -1;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('Fin du tableau STD_CATEGORIES introuvable');
  const literal = html.slice(open, end + 1);
  // eslint-disable-next-line no-eval
  const arr = eval('(' + literal + ')');
  if (!Array.isArray(arr) || !arr.length) throw new Error('STD_CATEGORIES vide après parse');
  return arr;
}
const STD = extractStdCategories();

// 3) DB Camille (même seed que le navigateur). Le seed est un script navigateur
//    (package "type":"module" → on l'évalue dans un sandbox CJS factice, pas d'import ESM).
function loadSeed() {
  const src = readFileSync(join(__dirname, 'propryo-demo-seed.js'), 'utf8');
  const sandbox = { module: { exports: {} }, self: undefined, window: undefined, globalThis: {} };
  sandbox.localStorage = undefined;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'propryo-demo-seed.js' });
  return sandbox.module.exports;
}
const seed = loadSeed();
const db = seed.build('camille');

// 4) opts = ce que _legal2044BuildOpts produirait pour entité « Camille Mercier », 2025.
const yr = '2025';
const entityNom = 'Camille Mercier';
const refs = db.logements.map(l => l.ref);                  // 3 lots NUS → tous fonciers
const imms = db.entites[0].immeubles.map(i => i.nom);       // 3 immeubles
const opts = {
  from: yr + '-01-01', to: yr + '-12-31',
  entityNom, refs, imms,
  nbLocaux: refs.length,   // forfait 222 = 3 × 20 = 60
  partBailleur225: 0       // pas de compteur collectif → régul = 0
};

const r = _compute2044(db.mouvements, STD, opts);

// 5) Affichage
const eur = n => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €';
const LABELS = {
  '211': 'Loyers encaissés (211)',
  '221': 'Frais de gestion / honoraires / compta (221)',
  '222': 'Forfait gestion 20 EUR/local (222, AUTO)',
  '223': "Primes d'assurance PNO/GLI (223)",
  '224': 'Travaux entretien/réparation (224)',
  '227': 'Taxe foncière (227)',
  '229': 'Charges de copropriété (229)',
  '250': "Intérêts d'emprunt (250)"
};

console.log('\n=== 2044 — Camille Mercier — exercice ' + yr + ' ===\n');
console.log('Périmètre : ' + refs.length + ' logements nus (' + refs.join(', ') + ')');
console.log('           ' + imms.length + ' immeubles (' + imms.join(', ') + ')\n');

const order = ['211', '221', '222', '223', '224', '227', '229', '250'];
order.forEach(ln => {
  if (r.lignes[ln] != null) {
    const cnt = r.comptes[ln] != null ? '  [' + r.comptes[ln] + ' mvt]' : '';
    console.log('  ' + (LABELS[ln] || ln).padEnd(46) + eur(r.lignes[ln]).padStart(13) + cnt);
  }
});
// Lignes inattendues éventuelles
Object.keys(r.lignes).filter(ln => !order.includes(ln)).forEach(ln => {
  console.log('  [INATTENDU] ligne ' + ln.padEnd(34) + eur(r.lignes[ln]).padStart(13));
});

console.log('\n  ' + 'Total recettes brutes'.padEnd(46) + eur(r.totalRecettes).padStart(13));
console.log('  ' + 'Total charges déductibles'.padEnd(46) + eur(r.totalCharges).padStart(13));
console.log('  ' + "Total intérêts d'emprunt".padEnd(46) + eur(r.totalInterets).padStart(13));
console.log('  ' + '─'.repeat(60));
console.log('  ' + 'RÉSULTAT FONCIER (recettes − charges − intérêts)'.padEnd(46) + eur(r.resultatFoncier).padStart(13));

if (r.nonMappes && r.nonMappes.length) {
  console.log('\n  ⚠ ' + r.nonMappes.length + ' mouvement(s) non mappé(s) : '
    + r.nonMappes.map(m => m.cat).join(', '));
} else {
  console.log('\n  ✓ Aucun mouvement non mappé.');
}

// Garde-fous attendus
const EXPECT = { '211': 24360, '221': 90, '222': 60, '223': 420, '224': 2130, '227': 2280, '229': 1800, '250': 2640 };
let allOk = true;
console.log('\n=== Contrôle vs attendu ===');
Object.keys(EXPECT).forEach(ln => {
  const got = Math.round((r.lignes[ln] || 0) * 100) / 100;
  const ok = Math.abs(got - EXPECT[ln]) < 0.005;
  if (!ok) allOk = false;
  console.log('  ' + (ok ? '✓' : '✗') + ' ligne ' + ln + ' : ' + eur(got) + ' (attendu ' + eur(EXPECT[ln]) + ')');
});
const expResult = 24360 - (90 + 60 + 420 + 2130 + 2280 + 1800) - 2640; // = 14940
const okRes = Math.abs(r.resultatFoncier - expResult) < 0.005;
if (!okRes) allOk = false;
console.log('  ' + (okRes ? '✓' : '✗') + ' résultat foncier : ' + eur(r.resultatFoncier) + ' (attendu ' + eur(expResult) + ')');
console.log('\n' + (allOk ? '✅ TOUT CONFORME' : '❌ ÉCART DÉTECTÉ') + '\n');
process.exit(allOk ? 0 : 1);
