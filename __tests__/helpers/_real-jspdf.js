// __tests__/helpers/_real-jspdf.js — le VRAI jsPDF de l'app, exécuté sous Node (pour les tests).
//
// Pourquoi : le faux jsPDF de doc-native.test.js ne mesure rien (splitTextToSize approximatif,
// pas de pages réelles). Les défauts de mise en page de l'avenant (AVENANT-REFONTE §7 : cadres de
// signature coupés, page créée pour le seul pied) ne se voient qu'avec le moteur réel.
//
// Source unique : les bibliothèques inlinées dans index.html (`window._BAIL_PDF_LIBS.jspdf` et
// `.autotable`, base64) — exactement celles que charge l'app. Aucune dépendance npm ajoutée.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

let _Cls = null;

function _lib(html, name) {
  const m = html.match(new RegExp('\\b' + name + ':\\s*"([A-Za-z0-9+/=]+)"'));
  if (!m) throw new Error('lib ' + name + ' introuvable dans index.html');
  return Buffer.from(m[1], 'base64').toString('utf8');
}

/** Classe jsPDF réelle (avec le plugin autotable), chargée une seule fois. */
export function realJsPdf() {
  if (_Cls) return _Cls;
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  vm.runInThisContext(_lib(html, 'jspdf'));
  const Cls = (globalThis.jspdf && globalThis.jspdf.jsPDF) || globalThis.jsPDF;
  if (!Cls) throw new Error('jsPDF non exposé');
  globalThis.jsPDF = Cls;
  vm.runInThisContext(_lib(html, 'autotable'));
  _Cls = Cls;
  return Cls;
}

/**
 * Nouvelle instance jsPDF A4 instrumentée : chaque texte et chaque trait est noté avec sa page,
 * pour vérifier qu'un libellé de signature est sur la même page que sa ligne.
 */
export function tracedPdf() {
  const Cls = realJsPdf();
  const pdf = new Cls({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const log = [];
  const page = () => pdf.internal.getCurrentPageInfo().pageNumber;
  const text0 = pdf.text.bind(pdf), line0 = pdf.line.bind(pdf);
  pdf.text = function (t, x, y, o) { log.push({ op: 'text', page: page(), t: [].concat(t).join(' '), x, y }); return text0(t, x, y, o); };
  pdf.line = function (x1, y1, x2, y2, s) { log.push({ op: 'line', page: page(), x: x1, y: y1, w: x2 - x1 }); return line0(x1, y1, x2, y2, s); };
  pdf.__log = log;
  return pdf;
}
