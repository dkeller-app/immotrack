#!/usr/bin/env node
// v15.43 — Validateur syntaxe des inline scripts de index.html.
// Strip d'abord les commentaires HTML (sinon faux positifs quand le mot
// "<script>" apparait dans un commentaire de doc).
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m, ok = 0, errors = 0;
while ((m = re.exec(stripped)) !== null) {
  const code = m[1].trim();
  if (!code) continue;
  // v15.266 — NE PLUS sauter _BAIL_PDF_LIBS. C'est précisément ce bloc (virgule manquante
  // avant la clé `pdfLib`, introduite en v15.263) qui a cassé TOUTE la génération PDF en prod
  // (window._BAIL_PDF_LIBS jamais défini) sans que le CI ne le voie — il était le seul exclu.
  // `new Function` COMPILE sans exécuter : valide la syntaxe, ne décode aucun base64.
  try { new Function(code); ok++; }
  catch(e) { console.error('FAIL :', e.message); errors++; }
}
console.log('Inline JS blocks valid :', ok, '| errors :', errors);
process.exit(errors > 0 ? 1 : 0);
