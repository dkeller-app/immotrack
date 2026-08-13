// __tests__/helpers/montant-doc.js
// Formatage des MONTANTS et assainissement du TEXTE pour les documents (bail, quittance,
// décomptes, EDL, certificats). PUR : aucune dépendance DOM, aucun Intl.
//
// POURQUOI (S3 SIGNATURE-SMOKE 13/08, preuve bp_102_7957d51b950d.pdf p.3) :
// `toLocaleString('fr-FR')` sépare les milliers avec U+202F (NARROW NO-BREAK SPACE)
// depuis ICU 72 (Chrome 111+). Ce caractère n'existe PAS dans l'encodage WinAnsi des
// polices standard jsPDF → jsPDF bascule TOUTE la chaîne en 16 bits, rendue octet par
// octet : « 12 000,00 » devient « 1 2 / 0 0 0 , 0 0 » (un NUL invisible devant chaque
// caractère, et 0x20 0x2F = « /» à la place du séparateur).
//
// Deux niveaux, complémentaires :
//   1. fmtMontantDoc/fmtEuroDoc — formatage DÉTERMINISTE (jamais toLocaleString) : le
//      séparateur est U+00A0, qui EXISTE en WinAnsi. Immunise aussi contre les futures
//      évolutions d'ICU et rend les tests stables quel que soit le runtime.
//   2. pdfSafeText — filet de sécurité appliqué à TOUT texte envoyé à jsPDF, y compris
//      les données saisies par l'utilisateur (un nom copié-collé peut contenir U+202F).

/** Espace insécable WinAnsi (0xA0) — le seul séparateur de milliers sûr en PDF. */
export const NBSP = ' ';

/**
 * Caractères fréquents en saisie/typographie qui n'existent PAS en WinAnsi et
 * cassent l'encodage jsPDF → remplacés par leur équivalent sûr ('' = supprimé).
 */
export const PDF_UNSAFE_MAP = {
  ' ': NBSP,   // narrow no-break space (séparateur de milliers d'ICU ≥ 72)
  ' ': NBSP,   // thin space
  ' ': NBSP,   // figure space
  ' ': NBSP,   // punctuation space
  ' ': NBSP,   // hair space
  ' ': NBSP,   // four-per-em space
  ' ': NBSP,   // six-per-em space
  ' ': ' ',    // en space
  ' ': ' ',    // em space
  ' ': ' ',    // three-per-em space
  ' ': NBSP,   // medium mathematical space
  '　': ' ',    // ideographic space
  '​': '',     // zero-width space
  '‌': '',     // zero-width non-joiner
  '‍': '',     // zero-width joiner
  '⁠': '',     // word joiner
  '﻿': '',     // BOM / zero-width no-break space
  '‑': '-',    // non-breaking hyphen
  '‒': '-',    // figure dash
  '―': '-',    // horizontal bar
  '−': '-'     // minus sign
};

// Caractères de la plage 0x80-0x9F de WinAnsi (Unicode > 0xFF mais bien encodables).
const WINANSI_HIGH = '€‚ƒ„…†‡ˆ‰Š‹Œ'
  + 'Ž‘’“”•–—˜™š›œžŸ';

/** true si `ch` est encodable par une police standard jsPDF (WinAnsi / CP1252). */
export function isWinAnsiChar(ch) {
  const c = ch.charCodeAt(0);
  if (c === 0x09 || c === 0x0A || c === 0x0D) return true;   // tab / CR / LF
  if (c >= 0x20 && c <= 0x7E) return true;                   // ASCII imprimable
  if (c >= 0xA0 && c <= 0xFF) return true;                   // Latin-1 supplement
  return WINANSI_HIGH.indexOf(ch) !== -1;
}

/**
 * Assainit un texte destiné à jsPDF : remplace les caractères connus hors WinAnsi
 * par leur équivalent sûr. Accepte une chaîne, un tableau de lignes (jsPDF le permet),
 * null/undefined (→ '') ou un nombre.
 */
export function pdfSafeText(txt) {
  if (Array.isArray(txt)) return txt.map(pdfSafeText);
  if (txt == null) return '';
  let s = String(txt);
  for (const bad in PDF_UNSAFE_MAP) {
    if (s.indexOf(bad) !== -1) s = s.split(bad).join(PDF_UNSAFE_MAP[bad]);
  }
  return s;
}

/** true si le texte contient au moins un caractère non encodable en WinAnsi. */
export function hasPdfUnsafeChars(txt) {
  const s = String(txt == null ? '' : txt);
  for (let i = 0; i < s.length; i++) if (!isWinAnsiChar(s[i])) return true;
  return false;
}

/** Parse un nombre tolérant : 12000 | '12000' | '1234,56' | '1 234,56' → Number. */
function toNumber(n) {
  if (typeof n === 'number') return isFinite(n) ? n : 0;
  if (n == null) return 0;
  const s = String(n).replace(/[\s  ]/g, '').replace(',', '.');
  const v = parseFloat(s);
  return isFinite(v) ? v : 0;
}

/**
 * Montant français pour les DOCUMENTS : « 12 000,00 » (espace insécable WinAnsi,
 * virgule décimale). Déterministe — n'utilise ni Intl ni toLocaleString.
 * @param {number|string|null} n
 * @param {number} [decimals=2]
 */
export function fmtMontantDoc(n, decimals) {
  const d = decimals == null ? 2 : decimals;
  const v = toNumber(n);
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(d);            // arrondi + décimales fixes
  const parts = fixed.split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (neg ? '-' : '') + grouped + (parts[1] ? ',' + parts[1] : '');
}

/** Montant + euro pour les documents : « 12 000,00 € » (espaces insécables). */
export function fmtEuroDoc(n, decimals) {
  return fmtMontantDoc(n, decimals) + NBSP + '€';
}

/**
 * Blinde une instance jsPDF : tout texte passé à `pdf.text(...)` est assaini.
 * Filet de sécurité pour les 46 appels existants ET les données utilisateur.
 * Idempotent (ne re-patche pas une instance déjà blindée).
 */
export function hardenJsPdfText(pdf) {
  if (!pdf || typeof pdf.text !== 'function' || pdf.__pdfTextHardened) return pdf;
  const orig = pdf.text.bind(pdf);
  pdf.text = function (txt, ...rest) { return orig(pdfSafeText(txt), ...rest); };
  pdf.__pdfTextHardened = true;
  return pdf;
}
