// scripts/verif-popup.cjs — assemble le <script> de la popup de signature et le parse.
// Le check-inline-js valide le JS de index.html mais PAS le JS assemblé qui tourne dans
// la popup window.open. Cet outil reconstruit la chaîne `scripts` et la new Function()-parse.
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');
const a = src.indexOf("var scripts = '<script>'");
if (a < 0) { console.error('MARKER var scripts NOT FOUND'); process.exit(2); }
const rhsStart = a + 'var scripts = '.length;
const endTok = "+'<\\/script>';";
const e = src.indexOf(endTok, rhsStart);
if (e < 0) { console.error('END TOKEN NOT FOUND'); process.exit(2); }
const rhs = src.slice(rhsStart, e) + "+'<\\/script>'";
const scope = new Proxy({
  JSON,
  opts: { remoteSign: false, autoPhase2: false, autoSign: true, signQueue: ['bailleur-1'], distants: [] },
  bail: { locataires: [], signatures: null },
  window: { BailSignSigid: { buildRemoteSigIdMap: () => [] } },
}, { has: () => true, get: (t, k) => (k in t) ? t[k] : '0' });
let full;
try { full = (new Function('scope', 'with(scope){ return (' + rhs + '); }'))(scope); }
catch (err) { console.error('ASSEMBLY FAILED:', err.message); process.exit(1); }
const inner = full.replace(/^<script>/, '').replace(/<\/script>$/, '');
try { new Function(inner); console.log('POPUP RUNTIME JS: PARSE OK (' + inner.length + ' chars)'); }
catch (err) { console.error('POPUP RUNTIME JS: PARSE ERROR →', err.message); process.exit(1); }
