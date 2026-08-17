/**
 * core/bank-import.js — Import bancaire (lecture, dédup, compte, reprise).
 *
 * CDC : docs/CDC-IMPORT.md (validé 17/08). Refonte v15.518 « IMPORT-MOUVEMENTS ».
 *
 * Formats acceptés : **OFX** (privilégié) + **Excel** (.xlsx/.xls). Le lecteur CSV
 * a été RETIRÉ (①.1) : format libre, illisible pour l'utilisateur, à l'origine de
 * la totalité des bugs de lecture — un CSV mal lu n'échoue pas franchement, il
 * importe des montants faux sans le dire.
 *
 * Principe transverse T-1 « ON NE CACHE RIEN » : aucune ligne n'est écartée,
 * corrigée ou masquée en silence. Chaque ligne non retenue sort dans
 * `discarded[]` avec son motif, et le récapitulatif de lecture (`meta`) expose
 * ce qui a été décidé et **ce qui l'a prouvé**.
 *
 * Architecture : 100% offline-first (pas de backend AISP DSP2).
 * Les fonctions sont PURES : la lecture du fichier (FileReader, XLSX.read) reste
 * côté index.html, le module reçoit du texte (OFX) ou un tableau de lignes (Excel).
 *
 * Tests Vitest miroir : __tests__/helpers/bank-import.test.js
 *                     + __tests__/helpers/bank-read.test.js
 */

// ────────────────────────────────────────────────────────────────────────────
// v15.78 — Hash stable synchrone (FNV-1a + DJB2 concat) — 16 chars hex
// Pas de besoin cryptographique (just dedup), donc pas de crypto.subtle async.
// 64 bits ≈ 1.8×10^19 valeurs → collision négligeable sur < 10k mouvements.
// ────────────────────────────────────────────────────────────────────────────

export function _bankHashStable(str) {
  const s = String(str || '');
  let h1 = 0x811c9dc5;   // FNV-1a 32-bit offset
  let h2 = 5381;          // DJB2 init
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = ((h2 * 33) + c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Normalisation commune des textes d'empreinte (accents, casse, espaces). */
function _bankNormTxt(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
    .toLowerCase();
}

/**
 * Empreinte stable d'une ligne de tableur (Excel) : date + montant signé + libellé.
 * Remplace l'ancienne empreinte CSV (calculée sur la ligne brute) : un tableur n'a
 * pas de « ligne brute » et une empreinte sur le contenu métier est plus stable.
 * @returns {string} 16 chars hex
 */
export function _bankFingerprintRow(date, signedAmount, libelle) {
  const amt = (Math.round((Number(signedAmount) || 0) * 100) / 100).toFixed(2);
  return _bankHashStable(_bankNormTxt(date) + '|' + amt + '|' + _bankNormTxt(libelle));
}

/**
 * Empreinte stable pour une transaction OFX (body STMTTRN entier).
 * Priorité 1 : FITID (identifiant unique fourni par la banque, retourné préfixé "fitid:").
 * Priorité 2 : hash sur (DTPOSTED|TRNAMT|NAME|MEMO) joints.
 * ⚠️ La valeur d'une balise SGML court jusqu'au `<` suivant, PAS jusqu'au retour à la
 * ligne (②.1) : un MEMO sur deux lignes était tronqué, donc l'empreinte changeait
 * d'un export à l'autre.
 * @param {string} stmttrnBody — contenu entre <STMTTRN> et </STMTTRN>
 * @returns {string} 'fitid:XXX' si FITID présent, sinon 16 chars hex
 */
export function _bankFingerprintOFX(stmttrnBody) {
  const body = String(stmttrnBody || '');
  const fitid = _bankOfxTag(body, 'FITID');
  if (fitid) return 'fitid:' + fitid;
  const fields = ['DTPOSTED', 'TRNAMT', 'NAME', 'MEMO']
    .map(t => _bankOfxTag(body, t))
    .join('|');
  return _bankHashStable(fields);
}

// ────────────────────────────────────────────────────────────────────────────
// ①.1 — RECONNAISSANCE DU FICHIER PAR SIGNATURE RÉELLE (fini le « sinon c'est du CSV »)
// ────────────────────────────────────────────────────────────────────────────

/** Taille maximale acceptée pour un relevé (①.2, inchangé). */
export const _BANK_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Reconnaît le format d'un fichier par sa SIGNATURE binaire / textuelle.
 * Aucun repli « sinon c'est du CSV » : un fichier non reconnu est refusé
 * explicitement, avec un message qui dit quoi faire (①.1 / ①.5).
 *
 * @param {Uint8Array|number[]} bytes — les premiers octets du fichier (≥ 512 conseillé)
 * @param {string} [filename] — sert UNIQUEMENT de départage secondaire, jamais de preuve
 * @returns {{format:'ofx'|'xlsx'|'xls'|'unknown', reason:string}}
 */
export function _bankDetectFormat(bytes, filename) {
  const b = bytes && bytes.length ? Array.from(bytes.slice(0, 8)) : [];
  const name = String(filename || '').toLowerCase();
  // ZIP (PK\x03\x04) = OOXML → .xlsx
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    return { format: 'xlsx', reason: 'signature ZIP/OOXML (PK)' };
  }
  // OLE2 compound file → .xls (Excel 97-2003)
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    return { format: 'xls', reason: 'signature OLE2 (Excel 97-2003)' };
  }
  // OFX : SGML ou XML, reconnu sur le début du texte
  let head = '';
  try {
    const raw = bytes && bytes.length ? bytes.slice(0, 2048) : [];
    head = Array.from(raw).map(c => String.fromCharCode(c)).join('');
  } catch (e) { head = ''; }
  if (/OFXHEADER|<OFX[\s>]|<STMTTRN>|<BANKMSGSRSV1>/i.test(head)) {
    return { format: 'ofx', reason: 'en-tête OFX' };
  }
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) {
    // Extension OFX mais aucune balise reconnue → on refuse plutôt que de deviner.
    return { format: 'unknown', reason: 'extension OFX mais aucune balise OFX trouvée' };
  }
  return { format: 'unknown', reason: 'signature inconnue' };
}

// ────────────────────────────────────────────────────────────────────────────
// Primitives montants / dates
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse un montant FR/EN vers nombre. "1 234,56 €" → 1234.56.
 * ②.4 : les **parenthèses comptables** valent le signe négatif — `(487,00)` → -487.
 * Gère aussi l'espace insécable (U+00A0) et l'espace fine (U+202F) des exports FR,
 * et le signe suffixé `487,00-` (exports SEPA/mainframe).
 */
export function _bankParseAmount(s) {
  if (s == null || s === '') return 0;
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  let v = String(s).replace(/[\s   €$£]/g, '').trim();
  if (!v) return 0;
  let neg = false;
  // Parenthèses comptables : (487,00) = −487,00
  const par = v.match(/^\((.*)\)$/);
  if (par) { neg = true; v = par[1]; }
  // Signe suffixé : 487,00-
  if (/-$/.test(v)) { neg = !neg; v = v.slice(0, -1); }
  if (/^\+/.test(v)) v = v.slice(1);
  if (/^-/.test(v)) { neg = !neg; v = v.slice(1); }
  // Format FR : 1.234,56 → 1234.56. Si présence de virgule + point, le dernier domine.
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
    else                      v = v.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Si virgule = séparateur décimal (toujours 1-2 décimales après) → remplace
    if (/,\d{1,2}$/.test(v)) v = v.replace(',', '.');
    else                      v = v.replace(/,/g, '');
  }
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/**
 * Parse une date FR/ISO vers YYYY-MM-DD. "15/06/2026" → "2026-06-15".
 * Accepte aussi un objet Date (Excel lu avec `cellDates:true`) et un numéro de
 * série Excel (repli quand la cellule n'a pas de format date).
 * Retourne '' si la date n'est pas reconnue OU n'existe pas (31/02).
 */
export function _bankParseDate(s) {
  if (s == null || s === '') return '';
  if (s instanceof Date) {
    if (isNaN(s.getTime())) return '';
    const y = s.getFullYear(), mo = s.getMonth() + 1, d = s.getDate();
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (typeof s === 'number') {
    // Numéro de série Excel (époque 1899-12-30). Bornes larges : 1990 → 2100.
    if (s < 32874 || s > 73415) return '';
    const ms = Math.round(s) * 86400000 + Date.UTC(1899, 11, 30);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const str = String(s).trim();
  let y = 0, mo = 0, d = 0, m;
  if ((m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))                      { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)))     { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = str.match(/^(\d{4})(\d{2})(\d{2})/)))                        { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/)))     { d = +m[1]; mo = +m[2]; y = 2000 + (+m[3]); }
  else return '';
  if (!_bankIsRealDate(y, mo, d)) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Une date qui n'existe pas au calendrier (31/02, 30/02, mois 13) n'est pas une date. */
function _bankIsRealDate(y, mo, d) {
  if (!(y >= 1900 && y <= 2200)) return false;
  if (!(mo >= 1 && mo <= 12)) return false;
  if (!(d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Une cellule ressemble-t-elle à une DATE ? (un nombre nu ne compte pas : ce serait un montant) */
export function _bankIsDateLike(v) {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v === 'number') return false;
  if (v == null || String(v).trim() === '') return false;
  return _bankParseDate(v) !== '';
}

/** Une cellule ressemble-t-elle à un MONTANT ? (chiffres + séparateurs, rien d'autre) */
export function _bankIsAmountLike(v) {
  if (v instanceof Date) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (v == null) return false;
  const s = String(v).replace(/[\s   €$£]/g, '').trim();
  if (!s) return false;
  return /^[(+-]?\d{1,3}(?:[ .,]?\d{3})*(?:[.,]\d{1,4})?\)?-?$/.test(s) || /^[(+-]?\d+(?:[.,]\d{1,4})?\)?-?$/.test(s);
}

/** Les devises autres que l'euro sont ÉCARTÉES et signalées (③.2) plutôt qu'importées à un montant faux. */
const _BANK_FOREIGN_CUR = /\b(usd|gbp|chf|cad|jpy|aud|sek|nok|dkk|pln|czk)\b|[$£¥]/i;
export function _bankForeignCurrency(cell) {
  const s = String(cell == null ? '' : cell);
  if (!s) return '';
  const m = s.match(_BANK_FOREIGN_CUR);
  return m ? m[0].toUpperCase() : '';
}

// ────────────────────────────────────────────────────────────────────────────
// Parser OFX (Open Financial Exchange) — format SGML/XML simplifié
// ────────────────────────────────────────────────────────────────────────────

/**
 * ②.1 — Lit la valeur d'une balise OFX. La valeur d'une balise SGML court jusqu'au
 * **`<` suivant**, PAS jusqu'au premier retour à la ligne : c'est exactement le bug
 * qui tronquait un `MEMO` sur deux lignes (RUM, référence de mandat, motif du
 * virement disparaissaient). Les retours à la ligne deviennent des espaces (I-2 :
 * libellé intégral, aucune troncature — n'importe quel mot doit pouvoir servir de
 * motif de règle).
 */
export function _bankOfxTag(body, tag) {
  const m = String(body || '').match(new RegExp(`<${tag}>([^<]*)`, 'i'));
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

/** Balises textuelles agrégées dans le libellé OFX (②.1), dans l'ordre de lisibilité. */
const _BANK_OFX_TEXT_TAGS = ['NAME', 'PAYEE', 'EXTDNAME', 'MEMO', 'CHECKNUM', 'REFNUM'];

/** Agrège toutes les balises textuelles d'une transaction OFX, sans doublon ni troncature. */
export function _bankOfxLabel(body) {
  const seen = new Set();
  const parts = [];
  for (const t of _BANK_OFX_TEXT_TAGS) {
    const v = _bankOfxTag(body, t);
    if (!v) continue;
    const k = _bankNormTxt(v);
    if (!k || seen.has(k)) continue;
    // Un fragment déjà contenu dans un précédent n'apporte rien (NAME répété dans MEMO).
    if (parts.some(p => _bankNormTxt(p).includes(k))) { seen.add(k); continue; }
    seen.add(k);
    parts.push(v);
  }
  return parts.join(' — ').trim();
}

/**
 * Parse un texte OFX → liste de transactions normalisées.
 * Format cible : `<STMTTRN><TRNTYPE>...<DTPOSTED>...<TRNAMT>...<NAME>...<MEMO>...</STMTTRN>`
 * Supporte SGML (tags non fermés) et XML (tags fermés).
 * T-1 : rien n'est jeté en silence — les transactions non retenues (date illisible,
 * montant nul, devise étrangère) sortent dans `discarded[]` avec leur motif.
 * @returns {object[]} lignes normalisées ; `_discarded` porte la liste des écartées.
 */
export function _bankParseOFX(text) {
  const r = _bankReadOFX(text);
  const out = r.lines;
  out._discarded = r.discarded;
  out._meta = r.meta;
  return out;
}

/**
 * Lecture OFX complète : lignes + écartées + méta de lecture (③.1).
 * @returns {{lines:object[], discarded:object[], meta:object}}
 */
export function _bankReadOFX(text) {
  const meta = { source: 'ofx', dateColLabel: 'date de comptabilisation (DTPOSTED)', dateColKind: 'comptabilisation',
                 orientation: 'signed', orientationProof: 'ofx', orientationProofLabel: 'OFX : le montant TRNAMT est signé par la banque',
                 currency: '', sheetName: '', headerRow: null, balance: { checked: false }, period: { from: '', to: '' } };
  const lines = [], discarded = [];
  if (!text || typeof text !== 'string') return { lines, discarded, meta };
  meta.currency = (_bankOfxTag(text, 'CURDEF') || 'EUR').toUpperCase();
  const tx = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)];
  tx.forEach((m, i) => {
    const body = m[1] || '';
    const libelle = _bankOfxLabel(body);
    const date = _bankParseDate(_bankOfxTag(body, 'DTPOSTED'));
    const val = _bankParseAmount(_bankOfxTag(body, 'TRNAMT'));
    const cur = (_bankOfxTag(body, 'CURSYM') || _bankOfxTag(body, 'CURRENCY') || meta.currency || 'EUR').toUpperCase();
    if (cur && cur !== 'EUR' && /^[A-Z]{3}$/.test(cur)) {
      discarded.push({ index: i, date, libelle, amount: val, reason: 'devise ' + cur + ' — non convertie', raw: body });
      return;
    }
    if (val === 0) {
      discarded.push({ index: i, date, libelle, amount: 0, reason: 'montant à 0 €', raw: body });
      return;
    }
    // ③.3 v2 : une date illisible n'écarte plus la ligne — elle est importée et MARQUÉE.
    lines.push({
      date,
      libelle,
      debit:  val < 0 ? -val : 0,
      credit: val > 0 ?  val : 0,
      signedAmount: val,
      fitid: _bankOfxTag(body, 'FITID'),
      raw: body,
      _rowIndex: i,
      _fingerprint: _bankFingerprintOFX(body),
      _importSource: 'ofx',
      _dateDouteuse: date ? '' : 'date illisible dans le relevé',
    });
  });
  _bankMarkDoubtfulDates(lines);
  const ds = lines.map(l => l.date).filter(Boolean).sort();
  meta.period = { from: ds[0] || '', to: ds[ds.length - 1] || '' };
  meta.count = lines.length;
  return { lines, discarded, meta };
}

// ────────────────────────────────────────────────────────────────────────────
// ②.2 — DÉBUT DES DONNÉES TROUVÉ PAR LE CONTENU, EN SILENCE
// « Ce n'est pas à moi d'expliquer à l'app comment lire un fichier. » On teste les
// 20 premières lignes comme candidat en-tête : une colonne contient-elle des dates
// valides sur ≥ 80 % des lignes, une ou deux des montants, le nombre de colonnes
// est-il stable. Les noms d'en-têtes ne servent que de BONUS de confiance.
// ────────────────────────────────────────────────────────────────────────────

const _BANK_H_DATE   = /(date|jour)/i;
const _BANK_H_OPER   = /op[ée]?ration|op\b|transaction/i;
const _BANK_H_COMPTA = /comptabilis/i;
const _BANK_H_VALEUR = /valeur/i;
const _BANK_H_LIB    = /(libell|intitul|description|d[ée]tail|nature|motif|objet|narrative|memo|r[ée]f[ée]rence)/i;
const _BANK_H_DEBIT  = /(d[ée]bit|retrait|sortie|withdraw|paiement|d[ée]pense)/i;
const _BANK_H_CREDIT = /(cr[ée]dit|d[ée]p[oô]t|entr[ée]e|deposit|recette|encaiss)/i;
const _BANK_H_MONT   = /(montant|amount|somme|valeur eur)/i;
const _BANK_H_SOLDE  = /(solde|balance)/i;

function _bankHdr(headers, i) {
  return _bankNormTxt(headers && headers[i] != null ? headers[i] : '');
}

/**
 * Statistiques d'une colonne sur les lignes de données (dates / montants / textes).
 * Un montant libellé en devise étrangère (« 1200 USD ») compte comme un MONTANT :
 * la colonne doit être reconnue pour que la ligne puisse être écartée avec son
 * motif (③.2) — sinon elle disparaîtrait en faisant échouer toute la lecture.
 */
function _bankColStats(data, ci) {
  let nonEmpty = 0, dates = 0, amounts = 0, texts = 0, textLen = 0;
  for (const r of data) {
    const v = r ? r[ci] : null;
    if (v == null || String(v).trim() === '') continue;
    nonEmpty++;
    if (_bankIsDateLike(v)) dates++;
    else if (_bankIsAmountLike(v)) amounts++;
    else if (_bankForeignCurrency(v) && /\d/.test(String(v))) amounts++;
    else { texts++; textLen += String(v).length; }
  }
  return { nonEmpty, dates, amounts, texts, avgTextLen: texts ? textLen / texts : 0 };
}

/**
 * Trouve la ligne d'en-tête (ou son absence) PAR LE CONTENU.
 * @param {Array<Array>} rows — lignes brutes du tableur (tableau de tableaux)
 * @param {{maxProbe?:number}} [opts]
 * @returns {{headerRow:number, headers:string[], data:Array<Array>, ncols:number,
 *            dateCols:number[], amountCols:number[], textCols:number[],
 *            goodRows:number, headerBonus:number, ok:boolean}}
 *   `headerRow` = -1 quand le fichier n'a pas d'en-tête (les données commencent à la 1re ligne).
 */
export function _bankFindHeaderRow(rows, opts = {}) {
  const maxProbe = opts.maxProbe != null ? opts.maxProbe : 20;
  const all = Array.isArray(rows) ? rows : [];
  const empty = { headerRow: -1, headers: [], data: [], ncols: 0, dateCols: [], amountCols: [], textCols: [], goodRows: 0, headerBonus: 0, ok: false };
  if (!all.length) return empty;

  const candidates = [];
  const last = Math.min(maxProbe, all.length - 1);
  for (let h = -1; h <= last; h++) {
    const data = all.slice(h + 1).filter(r => Array.isArray(r) && r.some(c => c != null && String(c).trim() !== ''));
    if (data.length < 2) continue;
    const ncols = Math.max(...data.map(r => r.length), 0);
    if (!ncols) continue;
    const dateCols = [], amountCols = [], textCols = [];
    for (let c = 0; c < ncols; c++) {
      const s = _bankColStats(data, c);
      if (!s.nonEmpty) continue;
      // Seuil à 70 % (et non 80 %) : une ligne de total ou un pied de page suffit à
      // faire tomber une colonne de dates à 75 % sur un relevé court. Ces lignes-là
      // ressortent ensuite dans `discarded[]` avec leur motif (T-1).
      if (s.dates / s.nonEmpty >= 0.7 && s.dates >= Math.max(2, data.length * 0.5)) dateCols.push(c);
      else if (s.amounts / s.nonEmpty >= 0.7) amountCols.push(c);
      else textCols.push(c);
    }
    if (!dateCols.length || !amountCols.length) continue;
    // Stabilité du nombre de colonnes : part des lignes au format majoritaire.
    const widths = {};
    data.forEach(r => { const w = r.filter(c => c != null && String(c).trim() !== '').length; widths[w] = (widths[w] || 0) + 1; });
    const stable = Math.max(...Object.values(widths)) / data.length;
    const dcol = dateCols[0];
    const goodRows = data.filter(r => _bankIsDateLike(r[dcol]) && amountCols.some(c => _bankIsAmountLike(r[c]) && _bankParseAmount(r[c]) !== 0)).length;
    if (!goodRows) continue;
    const headers = h >= 0 ? (all[h] || []).map(c => (c == null ? '' : String(c))) : [];
    let headerBonus = 0;
    headers.forEach((_, i) => {
      const k = _bankHdr(headers, i);
      if (!k) return;
      if (_BANK_H_DATE.test(k) || _BANK_H_LIB.test(k) || _BANK_H_DEBIT.test(k) ||
          _BANK_H_CREDIT.test(k) || _BANK_H_MONT.test(k) || _BANK_H_SOLDE.test(k)) headerBonus++;
    });
    candidates.push({ headerRow: h, headers, data, ncols, dateCols, amountCols, textCols, goodRows, headerBonus, stable, ok: true });
  }
  if (!candidates.length) return empty;
  candidates.sort((a, b) =>
    (b.goodRows - a.goodRows) ||
    (b.headerBonus - a.headerBonus) ||
    (b.stable - a.stable) ||
    (b.headerRow - a.headerRow));
  return candidates[0];
}

/**
 * ②.3 — La DATE D'OPÉRATION fait foi (pas la date de valeur) : c'est le jour où
 * l'argent a bougé, celui que dit le locataire et que porte la quittance.
 * Priorité si en-têtes présents : opération > comptabilisation > valeur ;
 * sinon la première colonne de dates.
 */
export function _bankPickDateColumn(headers, dateCols) {
  const cols = Array.isArray(dateCols) ? dateCols : [];
  if (!cols.length) return { idx: -1, label: '', kind: 'aucune' };
  const score = (c) => {
    const k = _bankHdr(headers, c);
    if (!k) return 0;
    if (_BANK_H_OPER.test(k)) return 3;
    if (_BANK_H_COMPTA.test(k)) return 2;
    if (_BANK_H_VALEUR.test(k)) return 1;
    return 0;
  };
  let best = cols[0], bestScore = score(cols[0]);
  for (const c of cols.slice(1)) { const s = score(c); if (s > bestScore) { best = c; bestScore = s; } }
  const kind = bestScore === 3 ? 'operation' : bestScore === 2 ? 'comptabilisation' : bestScore === 1 ? 'valeur' : 'inconnue';
  const lbl = headers && headers[best] ? String(headers[best]).trim() : '';
  return { idx: best, label: lbl || ('colonne ' + (best + 1)), kind };
}

/**
 * ②.4 — ORIENTATION DÉBIT/CRÉDIT : prouvée, pas devinée.
 * Reconnaissance : deux colonnes jamais remplies ensemble = couple débit/crédit ;
 * une colonne avec des positifs ET des négatifs = montant signé ; une colonne texte
 * à deux valeurs = colonne de sens.
 * Ordre de résolution : **solde → signes → en-têtes → convention**.
 *
 * @returns {{mode:'debitCredit'|'signed'|'sens', debitIdx:number, creditIdx:number,
 *            amountIdx:number, sensIdx:number, proof:string, proofLabel:string}}
 */
export function _bankDetectOrientation(data, ctx = {}) {
  const headers = ctx.headers || [];
  const soldeIdx = ctx.soldeIdx != null ? ctx.soldeIdx : -1;
  const amountCols = (ctx.amountCols || []).filter(c => c !== soldeIdx);
  const out = { mode: 'signed', debitIdx: -1, creditIdx: -1, amountIdx: -1, sensIdx: -1, proof: 'convention', proofLabel: '' };

  // ── Colonne de SENS : une colonne texte à deux valeurs (D/C, débit/crédit…) ──
  const sensIdx = (ctx.textCols || []).find(c => {
    const vals = new Set();
    for (const r of data) {
      const v = _bankNormTxt(r && r[c]);
      if (!v) continue;
      vals.add(v);
      if (vals.size > 2) return false;
    }
    if (vals.size !== 2) return false;
    return [...vals].every(v => /^(d|c|db|cr|debit|credit|-|\+|dr|d[ée]bit|cr[ée]dit)$/.test(v));
  });
  if (sensIdx != null && amountCols.length === 1) {
    out.mode = 'sens'; out.sensIdx = sensIdx; out.amountIdx = amountCols[0];
    out.proof = 'colonne de sens';
    out.proofLabel = 'une colonne « ' + (_bankHdr(headers, sensIdx) || ('colonne ' + (sensIdx + 1))) + ' » ne prend que deux valeurs (débit / crédit)';
    return out;
  }

  // ── Couple débit/crédit : deux colonnes JAMAIS remplies ensemble ──
  if (amountCols.length >= 2) {
    for (let i = 0; i < amountCols.length; i++) {
      for (let j = i + 1; j < amountCols.length; j++) {
        const a = amountCols[i], b = amountCols[j];
        let both = 0, one = 0;
        for (const r of data) {
          const va = _bankParseAmount(r && r[a]) !== 0;
          const vb = _bankParseAmount(r && r[b]) !== 0;
          if (va && vb) both++; else if (va || vb) one++;
        }
        if (both === 0 && one >= 2) {
          out.mode = 'debitCredit';
          // Preuve n° 1 : le solde. On teste les deux affectations, celle qui boucle gagne.
          if (soldeIdx >= 0) {
            const fit = (dIdx, cIdx) => _bankCheckBalance(
              data.map(r => ({ signed: Math.abs(_bankParseAmount(r && r[cIdx])) - Math.abs(_bankParseAmount(r && r[dIdx])), solde: _bankParseAmount(r && r[soldeIdx]) }))).ok;
            if (fit(a, b)) { out.debitIdx = a; out.creditIdx = b; out.proof = 'solde'; out.proofLabel = 'le solde de chaque ligne confirme le sens'; return out; }
            if (fit(b, a)) { out.debitIdx = b; out.creditIdx = a; out.proof = 'solde'; out.proofLabel = 'le solde de chaque ligne confirme le sens'; return out; }
          }
          // Preuve n° 2 : les signes (une colonne systématiquement négative = les débits).
          const negRate = (c) => { let n = 0, t = 0; for (const r of data) { const v = _bankParseAmount(r && r[c]); if (v !== 0) { t++; if (v < 0) n++; } } return t ? n / t : 0; };
          const na = negRate(a), nb = negRate(b);
          if (na >= 0.9 && nb <= 0.1) { out.debitIdx = a; out.creditIdx = b; out.proof = 'signes'; out.proofLabel = 'une colonne ne contient que des montants négatifs'; return out; }
          if (nb >= 0.9 && na <= 0.1) { out.debitIdx = b; out.creditIdx = a; out.proof = 'signes'; out.proofLabel = 'une colonne ne contient que des montants négatifs'; return out; }
          // Preuve n° 3 : les en-têtes.
          const ka = _bankHdr(headers, a), kb = _bankHdr(headers, b);
          if (_BANK_H_DEBIT.test(ka) && _BANK_H_CREDIT.test(kb)) { out.debitIdx = a; out.creditIdx = b; out.proof = 'en-têtes'; out.proofLabel = 'les en-têtes « ' + ka + ' » et « ' + kb +' »'; return out; }
          if (_BANK_H_DEBIT.test(kb) && _BANK_H_CREDIT.test(ka)) { out.debitIdx = b; out.creditIdx = a; out.proof = 'en-têtes'; out.proofLabel = 'les en-têtes « ' + kb + ' » et « ' + ka + ' »'; return out; }
          // Repli : convention (la colonne de gauche = les débits).
          out.debitIdx = a; out.creditIdx = b; out.proof = 'convention';
          out.proofLabel = 'aucune preuve — convention appliquée : la colonne de gauche = les débits';
          return out;
        }
      }
    }
  }

  // ── Colonne unique de montant signé ──
  const amountIdx = amountCols.length ? amountCols[0] : -1;
  out.mode = 'signed'; out.amountIdx = amountIdx;
  if (amountIdx < 0) { out.proofLabel = 'aucune colonne de montant trouvée'; return out; }
  let pos = 0, neg = 0;
  for (const r of data) { const v = _bankParseAmount(r && r[amountIdx]); if (v > 0) pos++; else if (v < 0) neg++; }
  if (soldeIdx >= 0) {
    const direct = _bankCheckBalance(data.map(r => ({ signed: _bankParseAmount(r && r[amountIdx]), solde: _bankParseAmount(r && r[soldeIdx]) })));
    if (direct.ok) { out.proof = 'solde'; out.proofLabel = 'le solde de chaque ligne confirme les montants'; return out; }
    const inv = _bankCheckBalance(data.map(r => ({ signed: -_bankParseAmount(r && r[amountIdx]), solde: _bankParseAmount(r && r[soldeIdx]) })));
    if (inv.ok) { out.invert = true; out.proof = 'solde'; out.proofLabel = 'le solde prouve que les montants sont inversés — correction appliquée'; return out; }
  }
  if (pos > 0 && neg > 0) { out.proof = 'signes'; out.proofLabel = 'la colonne contient des montants positifs et négatifs — les négatifs sont les dépenses'; return out; }
  const k = _bankHdr(headers, amountIdx);
  if (_BANK_H_DEBIT.test(k))  { out.allDebit = true;  out.proof = 'en-têtes'; out.proofLabel = 'en-tête « ' + k + ' » : toutes les lignes sont des dépenses'; return out; }
  if (_BANK_H_CREDIT.test(k)) { out.allCredit = true; out.proof = 'en-têtes'; out.proofLabel = 'en-tête « ' + k + ' » : toutes les lignes sont des recettes'; return out; }
  out.proof = 'convention';
  out.proofLabel = 'aucune preuve — convention appliquée : montant positif = recette';
  return out;
}

/**
 * ②.5 — LE SOLDE CERTIFIE LA LECTURE. `solde(n) − solde(n−1) = crédit − débit` sur
 * toutes les lignes → prouve d'un coup : bonnes colonnes, aucune ligne oubliée,
 * aucune ligne parasite, montants bien lus, sens non inversé.
 * **Informe, ne bloque pas** ; en cas d'écart, montre LA LIGNE où ça décroche.
 * Gère les relevés chronologiques croissants ET décroissants.
 *
 * @param {{signed:number, solde:number}[]} entries — dans l'ordre du fichier
 * @returns {{checked:boolean, ok:boolean, count:number, brokenAt:number, expected:number, got:number, order:string}}
 */
export function _bankCheckBalance(entries, tol = 0.011) {
  const e = (entries || []).filter(x => x && Number.isFinite(x.solde) && x.solde !== 0);
  const res = { checked: false, ok: false, count: 0, brokenAt: -1, expected: 0, got: 0, order: '' };
  if (e.length < 2) return res;
  res.checked = true;
  // Croissant : solde(n) − solde(n−1) = mouvement(n).
  // Décroissant (Crédit Agricole : le plus récent en tête) : solde(n−1) − solde(n) =
  // mouvement(n−1) — c'est le mouvement de la ligne du DESSUS qui explique l'écart.
  const run = (asc) => {
    let firstBreak = -1, expected = 0, got = 0, breaks = 0;
    for (let i = 1; i < e.length; i++) {
      const delta = asc ? (e[i].solde - e[i - 1].solde) : (e[i - 1].solde - e[i].solde);
      const mv = Number((asc ? e[i] : e[i - 1]).signed) || 0;
      if (Math.abs(delta - mv) > tol) {
        breaks++;
        if (firstBreak < 0) { firstBreak = asc ? i : (i - 1); expected = mv; got = delta; }
      }
    }
    return { breaks, firstBreak, expected, got };
  };
  const asc = run(true), desc = run(false);
  const best = asc.breaks <= desc.breaks ? asc : desc;
  res.order = asc.breaks <= desc.breaks ? 'croissant' : 'décroissant';
  res.count = e.length;
  res.ok = best.breaks === 0;
  res.brokenAt = best.firstBreak;
  res.expected = best.expected;
  res.got = best.got;
  res.breaks = best.breaks;
  return res;
}

/**
 * ③.3 v2 — DATES ABERRANTES : on IMPORTE et on MARQUE. Une date éloignée de plus
 * de 12 mois de la période du fichier n'est pas écartée : la ligne atterrit dans
 * « À compléter » avec un badge `⚠ date douteuse`.
 * Mutation en place de `_dateDouteuse`.
 */
export function _bankMarkDoubtfulDates(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const dates = [...new Set(arr.map(l => l && l.date).filter(Boolean))].sort();
  if (dates.length < 3) return arr;
  // On regroupe les dates par « paquets » séparés de plus de 12 mois, puis on garde
  // le plus gros paquet comme période du relevé. Un historique long mais régulier
  // (5 ans de loyers) reste UN seul paquet — rien n'est marqué ; une date isolée en
  // 2019 au milieu d'un relevé d'août 2026 forme son propre paquet → marquée.
  const gapMonths = (a, b) => {
    const da = new Date(a + 'T00:00:00Z'), db = new Date(b + 'T00:00:00Z');
    return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
  };
  const clusters = [[dates[0]]];
  for (let i = 1; i < dates.length; i++) {
    if (gapMonths(dates[i - 1], dates[i]) > 12) clusters.push([dates[i]]);
    else clusters[clusters.length - 1].push(dates[i]);
  }
  if (clusters.length === 1) {
    for (const l of arr) { if (l && !l.date) l._dateDouteuse = l._dateDouteuse || 'date illisible dans le relevé'; }
    return arr;
  }
  const core = clusters.reduce((a, b) => (b.length > a.length ? b : a));
  const lo = core[0], hi = core[core.length - 1];
  for (const l of arr) {
    if (!l) continue;
    if (!l.date) { l._dateDouteuse = l._dateDouteuse || 'date illisible dans le relevé'; continue; }
    if (l.date < lo || l.date > hi) l._dateDouteuse = 'date éloignée de plus de 12 mois de la période du relevé';
  }
  return arr;
}

/**
 * ①.4 — Excel multi-feuilles : on lit **la feuille qui contient des mouvements**
 * (colonne de dates + colonne de montants). Une seule correspond → aucune question.
 * Plusieurs → on affiche leur nom et le nombre de lignes, l'utilisateur choisit.
 * @param {{name:string, rows:Array<Array>}[]} sheets
 * @returns {{name:string, nRows:number, isCandidate:boolean, reason:string}[]}
 */
export function _bankPickSheets(sheets) {
  return (sheets || []).map(s => {
    const head = _bankFindHeaderRow(s.rows || []);
    return {
      name: s.name,
      nRows: head.ok ? head.goodRows : 0,
      isCandidate: !!head.ok,
      reason: head.ok ? (head.goodRows + ' mouvement(s)') : 'aucune colonne de dates + montants',
    };
  });
}

/**
 * ②/③ — LECTURE COMPLÈTE D'UN TABLEAU (Excel). Fonction pure : reçoit les lignes
 * brutes, rend les mouvements, les lignes écartées AVEC LEUR MOTIF (T-1) et le
 * récapitulatif de lecture (③.1).
 *
 * @param {Array<Array>} rows
 * @param {{sheetName?:string, invert?:boolean}} [opts]
 * @returns {{ok:boolean, lines:object[], discarded:object[], meta:object}}
 */
export function _bankReadTable(rows, opts = {}) {
  const meta = {
    source: 'xlsx', sheetName: opts.sheetName || '', headerRow: -1,
    dateColLabel: '', dateColKind: 'aucune',
    orientation: '', orientationProof: '', orientationProofLabel: '',
    balance: { checked: false }, period: { from: '', to: '' }, count: 0, currency: 'EUR',
  };
  const head = _bankFindHeaderRow(rows, opts);
  if (!head.ok) {
    return { ok: false, lines: [], discarded: [], meta,
             error: "Aucune colonne de dates + montants trouvée dans cette feuille." };
  }
  meta.headerRow = head.headerRow;
  const headers = head.headers;
  // Colonne de solde : en-tête explicite, sinon la colonne de montants qui « boucle ».
  let soldeIdx = head.amountCols.find(c => _BANK_H_SOLDE.test(_bankHdr(headers, c)));
  if (soldeIdx == null) soldeIdx = -1;
  const dcol = _bankPickDateColumn(headers, head.dateCols);
  meta.dateColLabel = dcol.label; meta.dateColKind = dcol.kind;
  // L'orientation se décide sur les VRAIES lignes de mouvement (celles qui portent une
  // date) : une ligne de total remplit débit ET crédit, ce qui casserait la reconnaissance
  // du couple « deux colonnes jamais remplies ensemble ».
  const oriData = head.data.filter(r => _bankParseDate(r[dcol.idx]));
  const ori = _bankDetectOrientation(oriData.length >= 2 ? oriData : head.data,
    { headers, amountCols: head.amountCols, textCols: head.textCols, soldeIdx });
  meta.orientation = ori.mode;
  meta.orientationProof = ori.proof;
  meta.orientationProofLabel = ori.proofLabel;
  // Colonnes de libellé : TOUTES les colonnes texte (hors sens) — I-2, aucune troncature,
  // n'importe quel mot ou référence doit pouvoir servir de motif de règle.
  const libCols = head.textCols.filter(c => c !== ori.sensIdx);
  libCols.sort((a, b) => {
    const ka = _BANK_H_LIB.test(_bankHdr(headers, a)) ? 1 : 0;
    const kb = _BANK_H_LIB.test(_bankHdr(headers, b)) ? 1 : 0;
    return (kb - ka) || (a - b);
  });
  const userInvert = !!opts.invert;

  const lines = [], discarded = [], balEntries = [];
  head.data.forEach((r, i) => {
    const date = _bankParseDate(r[dcol.idx]);
    // Devise étrangère → écartée et signalée (③.2), jamais importée à un montant faux.
    let foreign = '';
    for (const c of head.amountCols) { const f = _bankForeignCurrency(r[c]); if (f) { foreign = f; break; } }
    let debit = 0, credit = 0;
    if (ori.mode === 'debitCredit') {
      debit  = Math.abs(_bankParseAmount(r[ori.debitIdx]));
      credit = Math.abs(_bankParseAmount(r[ori.creditIdx]));
    } else if (ori.mode === 'sens') {
      const v = Math.abs(_bankParseAmount(r[ori.amountIdx]));
      const s = _bankNormTxt(r[ori.sensIdx]);
      if (/^(c|cr|credit|cr[ée]dit|\+)$/.test(s)) credit = v; else debit = v;
    } else {
      let v = _bankParseAmount(r[ori.amountIdx]);
      if (ori.invert) v = -v;
      if (ori.allDebit) { debit = Math.abs(v); }
      else if (ori.allCredit) { credit = Math.abs(v); }
      else if (v >= 0) credit = v; else debit = -v;
    }
    if (userInvert) { const t = debit; debit = credit; credit = t; }
    const libelle = libCols.map(c => (r[c] == null ? '' : String(r[c]).replace(/\s+/g, ' ').trim()))
      .filter(Boolean)
      .filter((v, k, a) => a.findIndex(x => _bankNormTxt(x) === _bankNormTxt(v)) === k)
      .join(' · ');
    const rowNo = head.headerRow + 2 + i;   // n° de ligne « comme dans le tableur »
    if (foreign) {
      discarded.push({ index: i, rowNo, date, libelle, amount: credit - debit, reason: 'devise ' + foreign + ' — non convertie', raw: r });
      return;
    }
    if (debit === 0 && credit === 0) {
      discarded.push({ index: i, rowNo, date, libelle, amount: 0, reason: 'montant à 0 €', raw: r });
      return;
    }
    // Ni date ni libellé : ce n'est pas un mouvement dont la date serait illisible (③.3),
    // c'est une ligne de total ou un pied de page. Écartée AVEC SON MOTIF, réintégrable.
    if (!date && !libelle) {
      discarded.push({ index: i, rowNo, date: '', libelle: '', amount: credit - debit,
                       reason: 'ligne sans date ni libellé — total ou pied de page', raw: r });
      return;
    }
    const signed = credit - debit;
    if (soldeIdx >= 0) balEntries.push({ signed, solde: _bankParseAmount(r[soldeIdx]), rowNo, libelle, date });
    lines.push({
      date, libelle, debit, credit, signedAmount: signed,
      raw: r, _rowIndex: i, _rowNo: rowNo,
      _fingerprint: _bankFingerprintRow(date, signed, libelle),
      _importSource: 'xlsx',
      _dateDouteuse: date ? '' : 'date illisible dans le relevé',
    });
  });
  _bankMarkDoubtfulDates(lines);
  if (soldeIdx >= 0) {
    const bal = _bankCheckBalance(balEntries);
    if (bal.checked && bal.brokenAt > 0 && balEntries[bal.brokenAt]) {
      bal.brokenRow = balEntries[bal.brokenAt].rowNo;
      bal.brokenLabel = balEntries[bal.brokenAt].libelle;
      bal.brokenDate = balEntries[bal.brokenAt].date;
    }
    meta.balance = bal;
  }
  const ds = lines.map(l => l.date).filter(Boolean).sort();
  meta.period = { from: ds[0] || '', to: ds[ds.length - 1] || '' };
  meta.count = lines.length;
  return { ok: lines.length > 0, lines, discarded, meta };
}

// ════════════════════════════════════════════════════════════════════════════
// ⑦ LES RÈGLES — « L'app propose. Tu valides. Si tu veux que ce soit
//    automatique, tu en fais une règle. »
//
// R-A v2 · AUCUNE RÈGLE LIVRÉE. La liste démarre vide et ne contient que ce que
// l'utilisateur a créé. Une mise à jour de l'app ne peut JAMAIS créer, modifier ou
// supprimer une règle : les règles sont les données de l'utilisateur, pas celles de
// l'app. Les mots-clés du moteur de PROPOSITIONS (✨) ne sont donc pas des règles —
// ils ne s'appliquent jamais seuls.
// ════════════════════════════════════════════════════════════════════════════

/** Sens d'une ligne bancaire : 'cr' (recette) ou 'db' (dépense). */
export function _bankLineSens(line) {
  return (Number(line && line.credit) || 0) > 0 ? 'cr' : 'db';
}

/** Une règle porte-t-elle une affectation ? (⑦.2 : l'affectation est UNE valeur, pas 4) */
function _bankRuleHasAff(r) {
  return !!(r && (r.bailleurDuCompte || r.qui || r.imm || r.compteurCcId));
}
function _bankRuleAffKey(r) {
  return (r.bailleurDuCompte ? 'BDC' : '') + '|' + (r.qui || '') + '|' + (r.imm || '') + '|' + (r.compteurCcId || '');
}

/**
 * ⑦.1 — Ce qu'une règle sait dire, en 3 critères :
 * **Motif** (le libellé contient ce texte, insensible casse/accents) · **Sens**
 * (dépense / recette / les deux — NOUVEAU) · **Compte** (optionnel).
 *
 * Le sens règle un vrai bug métier : une règle « EDF » attrapait le prélèvement ET
 * le remboursement de trop-perçu, et classait le remboursement en charge.
 *
 * 🐛 **BUG 8 du CDC** : la restriction de compte TOMBAIT quand le compte était
 * inconnu (`rule.compte && accountId && …`) — la règle d'un autre compte
 * s'appliquait quand même. Une règle liée à un compte ne s'applique désormais
 * QU'À ce compte.
 */
export function _bankRuleMatch(rule, line, accountId) {
  if (!rule || rule._deleted || !rule.pattern || !line) return false;
  if (rule.compte && String(rule.compte) !== String(accountId == null ? '' : accountId)) return false;
  if (rule.sens && rule.sens !== _bankLineSens(line)) return false;
  const pat = _bankNormTxt(rule.pattern);
  if (!pat) return false;
  return _bankNormTxt(line.libelle).includes(pat);
}

/**
 * ⑦.2 v2 — Quand PLUSIEURS règles correspondent.
 * - **Règles complémentaires** (champs différents) → on applique les deux, et
 *   l'origine de chaque champ est affichée (« catégorie : règle SYNDIC · bien :
 *   règle LES TILLEULS »). C'est le cas légitime, il ne doit pas être traité comme
 *   une erreur.
 * - **Règles en conflit** (même champ, valeurs différentes) → **aucun automatisme** :
 *   la ligne reste « à compléter », les candidates sont affichées avec leur résultat,
 *   l'utilisateur choisit.
 * - Deux règles aboutissant à la même valeur ne sont pas un conflit.
 *
 * @returns {{matched:object[], cat:string, catRule:object|null, aff:object|null,
 *            affRule:object|null, conflicts:{field:string, rules:object[]}[], byRule:boolean}}
 */
export function _bankApplyRules(rules, line, opts = {}) {
  const accountId = opts.accountId;
  const matched = (Array.isArray(rules) ? rules : []).filter(r => _bankRuleMatch(r, line, accountId));
  const out = { matched, cat: '', catRule: null, aff: null, affRule: null, conflicts: [], byRule: false };

  const catRules = matched.filter(r => r.cat);
  const catVals = [...new Set(catRules.map(r => r.cat))];
  if (catVals.length === 1) { out.cat = catVals[0]; out.catRule = catRules[0]; }
  else if (catVals.length > 1) out.conflicts.push({ field: 'cat', rules: catRules });

  const affRules = matched.filter(_bankRuleHasAff);
  const affVals = [...new Set(affRules.map(_bankRuleAffKey))];
  if (affVals.length === 1) {
    const r = affRules[0];
    out.aff = { bailleurDuCompte: !!r.bailleurDuCompte, qui: r.qui || '', imm: r.imm || '', compteurCcId: r.compteurCcId || '' };
    out.affRule = r;
  } else if (affVals.length > 1) out.conflicts.push({ field: 'aff', rules: affRules });

  out.byRule = !!(out.cat || out.aff);
  return out;
}

/**
 * R-C — Cas multi-bailleur (ICARUS facture toutes les SCI) : **une seule** règle,
 * dont l'affectation vaut « le bailleur du compte », résolu à l'import depuis le
 * compte reconnu. Une ligne pour tous les bailleurs, et ça reste juste quand une SCI
 * s'ajoute. Un compte mixte ne peut rien résoudre : l'affectation reste vide.
 */
export function _bankResolveAff(aff, account) {
  if (!aff) return { qui: '', imm: '', compteurCcId: '' };
  if (aff.bailleurDuCompte) {
    const b = (account && !account.mixte && account.bailleur) ? account.bailleur : '';
    return { qui: b ? 'SCI:' + b : '', imm: '', compteurCcId: '', unresolved: !b };
  }
  return { qui: aff.qui || '', imm: aff.imm || '', compteurCcId: aff.compteurCcId || '' };
}

/**
 * ⑦.4 — APERÇU EN DIRECT à la création d'une règle. Aujourd'hui on tape le motif
 * **à l'aveugle** dans un `prompt()`. Cible : voir, à chaque frappe, les lignes de
 * l'import qui correspondent, le nombre de mouvements déjà en base concernés, et une
 * alerte quand le motif est trop court ou attrape des lignes de natures différentes.
 *
 * ⑦.7 — Fonctionne **sans import** : il s'appuie alors sur les mouvements déjà
 * enregistrés (« ce motif correspond à 17 mouvements existants »).
 *
 * @param {{pattern:string, sens?:string, compte?:string}} draft
 * @param {{importLines?:object[], mouvements?:object[], accountId?:*}} ctx
 * @returns {{lines:object[], nBase:number, baseCats:string[], tooShort:boolean,
 *            mixed:boolean, ok:boolean, level:'', 'warn'|'ok'}}
 */
export function _bankRulePreview(draft, ctx = {}) {
  const pattern = String((draft && draft.pattern) || '').trim();
  const rule = { pattern, sens: (draft && draft.sens) || '', compte: (draft && draft.compte) || '' };
  const out = { lines: [], nBase: 0, baseCats: [], tooShort: false, mixed: false, ok: false, level: '' };
  if (!pattern) return out;
  out.tooShort = pattern.length < 4;
  out.lines = (ctx.importLines || []).filter(l => _bankRuleMatch(rule, l, ctx.accountId));
  const baseHits = (ctx.mouvements || []).filter(m => {
    if (!m || m._deleted) return false;
    const line = { libelle: m.lib || '', credit: m.cr || 0, debit: m.db || 0 };
    return _bankRuleMatch(rule, line, ctx.accountId != null ? ctx.accountId : m._bankAccountId);
  });
  out.nBase = baseHits.length;
  out.baseCats = [...new Set(baseHits.map(m => m.cat).filter(Boolean))];
  // « Natures différentes » = les lignes attrapées n'ont pas toutes le même sens, ou
  // les mouvements déjà en base sont classés dans plusieurs catégories.
  const senses = new Set(out.lines.map(_bankLineSens));
  out.mixed = senses.size > 1 || out.baseCats.length > 1;
  out.ok = !out.tooShort && !out.mixed && (out.lines.length > 0 || out.nBase > 0);
  out.level = (out.tooShort || out.mixed) ? 'warn' : (out.ok ? 'ok' : '');
  return out;
}

/**
 * ⑦.7 — Colonne « utilisée » de la liste des règles : « 23 mouvements classés ·
 * dernière fois le 12/08 ». Sert à repérer une règle obsolète ou trop large.
 * S'appuie sur `_rules[]`, la trace laissée sur chaque mouvement importé.
 */
export function _bankRuleUsage(rule, mouvements) {
  const pat = _bankNormTxt(rule && rule.pattern);
  const out = { count: 0, lastDate: '' };
  if (!pat) return out;
  for (const m of (mouvements || [])) {
    if (!m || m._deleted || !Array.isArray(m._rules)) continue;
    if (!m._rules.some(p => _bankNormTxt(p) === pat)) continue;
    out.count++;
    if ((m.date || '') > out.lastDate) out.lastDate = m.date || '';
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Matching heuristique vers (catégorie, qui) ImmoTrack
// ────────────────────────────────────────────────────────────────────────────

/**
 * Devine la catégorie + le bien (qui) pour une transaction.
 * @param {object} line — { date, libelle, debit, credit, signedAmount }
 * @param {object} ctx  — { baux, categories, mouvementsExistants, tolerance }
 * @returns {{ cat: string, qui: string, confidence: number, source: string }}
 *
 * Heuristiques (ordre de priorité) :
 *   1. Match nom locataire dans libellé + montant ≈ loyer attendu → Loyers + ref bail
 *   2. Libellé contient "PRELEV" + RUM connu → ...
 *   3. Match catégorie par mots-clés (ASSURANCE, ELECTRICITE, etc.)
 *   4. Fallback : catégorie "Autre" / qui ""
 */
/** Le mot est-il présent COMME MOT ENTIER dans le libellé normalisé ? (⑦.5 a) */
function _bankWordIn(libNorm, word) {
  const w = String(word || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!w) return false;
  return new RegExp('(^|[^a-z0-9])' + w + '([^a-z0-9]|$)').test(libNorm);
}

/** Construit la proposition « loyer » pour un candidat, avec l'écart affiché (⑦.5 e). */
function _bankProposeLoyer(result, c, candidates) {
  const ecartAbs = c.ecart == null ? null : Math.abs(c.ecart);
  result.cat = 'Loyers encaissés';
  result.qui = c.ref;
  result.candidates = candidates;
  // Le montant GRADUE la confiance ; il ne disqualifie plus.
  result.confidence = ecartAbs == null ? 0.7 : (ecartAbs < 1 ? 0.95 : (ecartAbs < 20 ? 0.85 : 0.75));
  const parts = ['nom du locataire reconnu'];
  if (c.ancien) parts.push('ancien locataire');
  if (c.du > 0) {
    parts.push('montant ' + _bankEur(c.du + (c.ecart || 0)) + ' · dû du mois ' + _bankEur(c.du));
    if (ecartAbs != null && ecartAbs >= 1) parts.push(c.ecart > 0 ? 'avance de ' + _bankEur(c.ecart) : 'reste ' + _bankEur(-c.ecart));
  }
  result.source = parts.join(' · ');
  return result;
}

/** Formatage minimal d'un montant pour les libellés de proposition (module PUR : pas d'Intl). */
function _bankEur(v) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return n.toFixed(2).replace('.', ',') + ' €';
}

export function _bankMatchHeuristic(line, ctx = {}) {
  const result = { cat: '', qui: '', confidence: 0, source: '', candidates: [], ambiguous: false };
  if (!line || !line.libelle) return result;
  const lib = _bankNormTxt(line.libelle);
  const baux = ctx.baux || {};

  // ── ⑦.5 · LE MATCH LOCATAIRE, 5 corrections ────────────────────────────────
  if (line.credit > 0) {
    const ym = String(line.date || '').slice(0, 7);
    const cands = [];
    for (const [ref, bail] of Object.entries(baux)) {
      if (!bail) continue;
      // 🐛 d — LES BAUX CLÔTURÉS REDEVIENNENT CANDIDATS (bug 7). Un arriéré versé
      // après le départ d'un locataire ne matchait plus rien : `if (bail.cloture) continue`.
      const ancien = !!bail.cloture;
      const rawNames = (bail.locataires || [{ nom: bail.nom }])
        .map(x => String((x && x.nom) || '').trim()).filter(Boolean);
      const locNames = rawNames.map(_bankNormTxt).filter(Boolean);
      const locWords = [];
      locNames.forEach(n => n.split(/[\s\-']+/).forEach(w => { if (w.length >= 3) locWords.push(w); }));
      // 🐛 a — FRONTIÈRE DE MOT (bug 4) : le nom est cherché comme MOT ENTIER, plus
      // comme sous-chaîne. « Marc » matchait `SUPERMARCHE`, « Roy » matchait `ROYAL` —
      // et le niveau 0,70 n'exigeait pas que le montant corresponde : un faux positif
      // suffisait à proposer le mauvais lot.
      const nameMatched = locWords.some(w => _bankWordIn(lib, w));
      // 🐛 c — LE DÛ EST CELUI DU MOIS DU RELEVÉ (bug 6), plus le loyer d'aujourd'hui :
      // après une indexation, les mois antérieurs chutaient de confiance pour un motif faux.
      const du = (typeof ctx.duMois === 'function' && ym)
        ? (Number((ctx.duMois(ref, ym) || {}).total) || 0)
        : ((Number(bail.hc) || 0) + (Number(bail.ch) || 0));
      const ecart = du > 0 ? (line.credit - du) : null;
      cands.push({ ref, nom: rawNames.join(' / '), ancien, nameMatched, du, ecart });
    }
    // 🐛 e — LE MONTANT N'EST PLUS UN CRITÈRE MAIS UN INDICATEUR : le nom suffit à
    // proposer, le montant gradue la confiance et l'écart s'affiche. Fin du seuil ±5 €
    // qui disqualifiait paiements partiels, rattrapages et avances.
    const exact = (c) => c.ecart != null && Math.abs(c.ecart) < 1;
    const byName = cands.filter(c => c.nameMatched);
    if (byName.length === 1) return _bankProposeLoyer(result, byName[0], byName);
    if (byName.length > 1) {
      // 🐛 b — TOUS LES BAUX SONT ÉVALUÉS (bug 5) : plus de « premier bail qui matche
      // gagne » (sortie de boucle immédiate, ordre des clés). Si le montant désigne
      // un seul candidat, il tranche ; sinon la proposition est AMBIGUË et les
      // candidats sont affichés — jamais de gagnant arbitraire.
      const exacts = byName.filter(exact);
      if (exacts.length === 1) return _bankProposeLoyer(result, exacts[0], byName);
      result.cat = 'Loyers encaissés';
      result.qui = '';
      result.confidence = 0.5;
      result.ambiguous = true;
      result.candidates = byName;
      result.source = byName.length + ' locataires possibles — à toi de choisir';
      return result;
    }
    // Aucun nom reconnu : un MONTANT SEUL ne propose que s'il n'y a QU'UN lot dont le
    // dû corresponde (sinon on désignerait un bien au hasard).
    const exacts = cands.filter(exact);
    if (exacts.length === 1) {
      const c = exacts[0];
      result.cat = 'Loyers encaissés';
      result.qui = c.ref;
      result.confidence = 0.6;
      result.candidates = [c];
      result.source = 'Montant exactement égal au dû du mois de ' + c.ref + (c.ancien ? ' (ancien locataire)' : '');
      return result;
    }
  }

  // 2. Catégorisation par mots-clés (débits typiquement).
  // V3-REFONTE-LOYERS : les `cat` ci-dessous sont les NOMS EXACTS de STD_CATEGORIES (index.html).
  // Avant, le moteur proposait « Taxes foncières », « Intérêts d'emprunt », « Frais de gérance,
  // rémunérations », « Autres » — qui n'existent PAS dans STD_CATEGORIES → ces mouvements ne mappaient
  // aucune ligne 2044 (nonMappes) = sous-déclaration silencieuse. Corrigé ici.
  const KEYWORDS = [
    { rx: /\b(assurance|axa|maaf|matmut|aviva|allianz|maif|groupama|gli)\b/i, cat: 'Primes d\'assurance (PNO, GLI)', confidence: 0.85, src: 'Mot-clé assurance' },
    // Frais bancaires (tenue de compte) → catégorie dédiée ; péage/carburant → Divers (tout hors 2044, couvert par le forfait 222).
    { rx: /\b(frais bancaires|tenue de compte|cotisation carte|frais de compte|commission d.intervention|abonnement compte)\b/i, cat: 'Frais bancaires', confidence: 0.72, src: 'Mot-clé frais bancaires (forfait 222)' },
    { rx: /\b(peage|autoroute|aprr|sanef|carburant|essence|station service)\b/i, cat: 'Divers (non déductible)', confidence: 0.6, src: 'Mot-clé péage/carburant (forfait 222 → Divers)' },
    { rx: /\b(edf|engie|eni|enedis|electric|electricite|gaz de france|gdf|veolia|saur|suez|sde|smede|eaux|chauffage)\b/i, cat: 'Charges récupérables (eau, énergie…)', confidence: 0.80, src: 'Mot-clé énergie/eau' },
    { rx: /\b(syndic|copropriete|copro|charges copro|appel de fonds)\b/i, cat: 'Charges de copropriété', confidence: 0.90, src: 'Mot-clé syndic' },
    { rx: /\b(travaux|renovation|reno|peinture|plombier|electricien|chauffagiste|menuisier|charpentier|carreleur|macon|serrurier)\b/i, cat: 'Travaux (entretien, réparation, amélioration)', confidence: 0.80, src: 'Mot-clé travaux' },
    { rx: /\b(taxe fonciere|tf )/i, cat: 'Taxe foncière (et taxes annexes)', confidence: 0.92, src: 'Mot-clé TF' },
    { rx: /\b(comptable|expert.comptable|comptabilite|cabinet comptable)\b/i, cat: 'Frais de gestion / honoraires / comptabilité', confidence: 0.78, src: 'Mot-clé comptable' },
    // Échéance de crédit importée → capital remboursé (trésorerie). Les intérêts (ligne 250) se saisissent
    // à part depuis l'attestation annuelle de banque (décision design 2026-06-21), pas dérivés de l'échéance.
    { rx: /\b(emprunt|pret|credit immo|credit immobilier|amortissement|echeance pret)\b/i, cat: 'Prêt', confidence: 0.72, src: 'Mot-clé emprunt (échéance ; intérêts via attestation)' },
    { rx: /\b(notaire|frais notaire)\b/i, cat: 'Acquisition / cession de bien', confidence: 0.70, src: 'Mot-clé notaire' },
    { rx: /\b(honoraires|gerance|gestion locative|agence immo)\b/i, cat: 'Frais de gestion / honoraires / comptabilité', confidence: 0.72, src: 'Mot-clé gestion' },
    { rx: /\b(dpe|diagnostic|geometre|huissier|avocat|expertise)\b/i, cat: 'Frais de gestion / honoraires / comptabilité', confidence: 0.7, src: 'Mot-clé procédure/diagnostic' }
  ];
  for (const k of KEYWORDS) {
    if (k.rx.test(lib)) {
      result.cat = k.cat;
      result.confidence = k.confidence;
      result.source = k.src;
      return result;
    }
  }

  // 3. Fallback : aucune catégorie inventée. '' → la revue affiche « à classer », l'utilisateur choisit.
  result.cat = '';
  result.confidence = 0;
  result.source = 'Aucun match — à classifier manuellement';
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Détection doublons
// ────────────────────────────────────────────────────────────────────────────

/** FITID stocké sur un mouvement, quelle qu'en soit la forme (champ direct ou empreinte). */
function _bankMvFitid(m) {
  if (!m) return '';
  if (m.fitid && String(m.fitid).trim()) return String(m.fitid).trim();
  const fp = String(m._fingerprint || '');
  return fp.startsWith('fitid:') ? fp.slice(6) : '';
}

/**
 * ⑥ DÉTECTION DES DOUBLONS — deux niveaux, deux traitements.
 *
 * **⑥.1 · Le FITID est la stratégie n° 1 en OFX.** C'est l'identifiant unique de
 * transaction fourni par la banque, plus fiable que toute empreinte calculée. Il
 * tranche **avant** l'empreinte et **dans les deux sens** : identique = doublon
 * certain ; différent = **pas** un doublon. Avant, il n'était consulté qu'en second
 * rang et contre les seuls mouvements sans empreinte → une banque qui réémet un
 * relevé avec un libellé retouché (« en cours » → « définitif ») passait pour du
 * nouveau. L'empreinte reste la stratégie principale pour Excel, qui n'a pas
 * d'identifiant de transaction.
 *
 * **⑥.2 · Certains écartés en silence, probables à trancher.**
 * - `dupLevel:'certain'` (même FITID ou même empreinte) → écarté automatiquement,
 *   replié en une ligne de résumé. Zéro clic.
 * - `dupLevel:'probable'` (date ±3 j + montant ±1 €, ou somme des parts du jour) →
 *   « à décider » : ni exclu ni inclus, et **l'import reste bloqué tant qu'il en
 *   reste un non tranché**. Cas qui motive la décision : deux loyers de 850 € à deux
 *   jours d'écart, deux locataires différents — avant, un vrai loyer disparaissait
 *   sans que rien ne le signale.
 *
 * @returns {Array<{...line, isDuplicate, dupLevel, duplicateOf, duplicateReason}>}
 */
export function _bankDedup(newLines, mouvementsExistants, options = {}) {
  const toleranceDays = options.toleranceDays ?? 3;
  const toleranceAmount = options.toleranceAmount ?? 1;
  const legacyFallback = options.legacyFallback !== false;
  const alive = (mouvementsExistants || []).filter(m => m && !m._deleted);

  // Index des fingerprints existants en DB (lookup O(1))
  const fpIndex = new Map();
  const fitidIndex = new Map();
  for (const m of alive) {
    if (m._fingerprint && !fpIndex.has(m._fingerprint)) fpIndex.set(m._fingerprint, m);
    const f = _bankMvFitid(m);
    if (f && !fitidIndex.has(f)) fitidIndex.set(f, m);
  }

  const out = [];
  for (const line of (newLines || [])) {
    let isDuplicate = false, dupLevel = '', duplicateOf = '', duplicateReason = '';

    // ── Stratégie 1 : FITID, dans les DEUX SENS ──────────────────────────────
    if (line.fitid) {
      const m = fitidIndex.get(String(line.fitid).trim());
      if (m) {
        out.push({ ...line, isDuplicate: true, dupLevel: 'certain',
          duplicateOf: String(m.id || '?'),
          duplicateReason: 'Même identifiant de transaction (FITID) — la banque dit que c’est la même opération' });
        continue;
      }
      // FITID différent de tous ceux déjà en base → ce n'est PAS un doublon. On ne
      // consulte cette preuve négative que si la base porte effectivement des FITID
      // (sinon elle ne prouve rien : mouvements saisis à la main, imports Excel).
      if (fitidIndex.size > 0) {
        out.push({ ...line, isDuplicate: false, dupLevel: '', duplicateOf: '', duplicateReason: '' });
        continue;
      }
    }

    // ── Stratégie 2 : empreinte (principale pour Excel) ──────────────────────
    if (line._fingerprint && fpIndex.has(line._fingerprint)) {
      const m = fpIndex.get(line._fingerprint);
      isDuplicate = true; dupLevel = 'certain';
      duplicateOf = String(m.id || '?');
      duplicateReason = 'Empreinte identique — opération déjà importée';
    }

    // ── Stratégie 3 : ressemblance (date ±3 j + montant ±1 €) → PROBABLE ─────
    if (!isDuplicate && legacyFallback) {
      const lineMontant = line.credit > 0 ? line.credit : -line.debit;
      const lineDate = line.date ? new Date(line.date + 'T00:00:00').getTime() : NaN;
      for (const m of alive) {
        if (m._fingerprint && m._fingerprint === line._fingerprint) continue; // déjà couvert
        if (!m.date || !isFinite(lineDate)) continue;
        const mMontant = (m.cr || 0) > 0 ? (m.cr || 0) : -(m.db || 0);
        if (Math.abs(mMontant - lineMontant) > toleranceAmount) continue;
        const mDate = new Date(m.date + 'T00:00:00').getTime();
        const dayDiff = Math.abs((mDate - lineDate) / 86400000);
        if (dayDiff > toleranceDays) continue;
        isDuplicate = true; dupLevel = 'probable';
        duplicateOf = String(m.id || '?');
        duplicateReason = `Même montant à ${Math.round(dayDiff)} jour(s) d’écart — à toi de dire si c’est la même opération`;
        break;
      }
    }

    // ── Stratégie 4 : relevé déjà importé PUIS DÉCOUPÉ ───────────────────────
    // La ligne source ne matche aucune part individuelle (montants différents) : on
    // détecte que son montant = la SOMME des parts d'import bancaire du même jour.
    if (!isDuplicate) {
      const lineMontant = line.credit > 0 ? line.credit : -line.debit;
      const acct = line._bankAccountId || null;
      const parts = alive.filter(m =>
        m.date === line.date && m._source === 'bank_import' &&
        (!acct || !m._bankAccountId || m._bankAccountId === acct));
      if (parts.length >= 2) {
        const sum = parts.reduce((s, m) => s + ((m.cr || 0) > 0 ? (m.cr || 0) : -(m.db || 0)), 0);
        if (Math.abs(sum - lineMontant) <= toleranceAmount) {
          isDuplicate = true; dupLevel = 'probable';
          duplicateOf = String(parts[0].id || '?');
          duplicateReason = 'Ce virement semble déjà importé puis découpé (la somme des lignes du jour correspond)';
        }
      }
    }

    out.push({ ...line, isDuplicate, dupLevel, duplicateOf, duplicateReason });
  }
  return out;
}

/**
 * ⑥.2 / ⑧.1 — Compte les doublons **probables non tranchés** : tant qu'il en reste,
 * la validation de l'import est bloquée (même logique que le garde-fou existant sur
 * les « Reconnus »). Un doublon certain ne bloque rien : il est écarté sans clic.
 */
export function _bankUndecidedDuplicates(lines) {
  return (Array.isArray(lines) ? lines : []).filter(l =>
    l && l.isDuplicate && l.dupLevel === 'probable' && !l._userExclude && !l._userKeep && !l._dupConfirmed).length;
}

// ────────────────────────────────────────────────────────────────────────────
// v15.78 — Migration rétroactive des fingerprints sur mouvements existants
// ────────────────────────────────────────────────────────────────────────────

/**
 * Calcule et stocke `_fingerprint` sur les mouvements existants ÉLIGIBLES,
 * sans rawLine d'origine. Stratégie :
 *   - Mouvements avec `fitid` (OFX legacy v15.07) → fingerprint = 'fitid:' + fitid
 *   - Autres mouvements (CSV legacy ou saisis manuellement) → laissés intacts,
 *     leur dédup passera par le fallback legacy au prochain import (1 fois).
 *
 * Idempotent : ne recalcule pas si `_fingerprint` déjà présent.
 *
 * @param {object[]} mouvements — DB.mouvements (modifié en place pour les éligibles)
 * @returns {{ migrated:number, skipped:number }}
 */
export function _bankMigrateFingerprints(mouvements) {
  let migrated = 0, skipped = 0;
  if (!Array.isArray(mouvements)) return { migrated, skipped };
  for (const m of mouvements) {
    if (!m || m._deleted) { skipped++; continue; }
    if (m._fingerprint) { skipped++; continue; } // déjà migré
    if (m.fitid && String(m.fitid).trim()) {
      m._fingerprint = 'fitid:' + String(m.fitid).trim();
      migrated++;
    } else {
      skipped++; // CSV legacy ou saisi manuel : pas de migration possible
    }
  }
  return { migrated, skipped };
}

// ────────────────────────────────────────────────────────────────────────────
// BANK-IMPORT-V2 (v15.160 Phase A) — Identification du compte source d'un fichier
// pour permettre un pointeur de progression par compte (au lieu du dédup heuristique
// par contenu qui casse dès que l'user modifie les lignes après import).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Extrait l'identifiant de compte d'un fichier OFX/QFX.
 * Cherche dans les blocs `<BANKACCTFROM>` (compte bancaire) ou `<CCACCTFROM>` (carte crédit).
 * @param {string} text — contenu OFX brut
 * @returns {{bankId:string, acctId:string, acctType:string, identifier:string} | null}
 *   `identifier` est préfixé 'acct:' pour distinguer des hashes CSV.
 */
export function _bankExtractOFXAccount(text) {
  if (!text || typeof text !== 'string') return null;
  // Cherche le 1er bloc BANKACCTFROM ou CCACCTFROM (peut être SGML ou XML).
  // On limite la recherche jusqu'à la prochaine balise majeure pour éviter de capturer trop.
  const blockMatch = text.match(/<(BANKACCTFROM|CCACCTFROM)>([\s\S]*?)(?:<\/\1>|<STMTTRN|<BANKTRANLIST|<LEDGERBAL)/i);
  const body = blockMatch ? blockMatch[2] : '';
  const get = (tag) => {
    const m = body.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const bankId   = get('BANKID');
  const acctId   = get('ACCTID');
  const acctType = get('ACCTTYPE');
  if (!acctId) return null;
  return {
    bankId, acctId, acctType,
    identifier: 'acct:' + (bankId ? bankId + ':' : '') + acctId
  };
}

/**
 * ④.2 — Identifiant de compte trouvé dans un fichier Excel : on cherche l'**IBAN**
 * ou le **numéro de compte** dans le préambule — les lignes qu'on écarte de l'import
 * servent à identifier le compte.
 *
 * ⚠️ On ne transpose PAS le hash d'en-têtes de l'ancien lecteur CSV : il identifiait
 * un *format*, pas un compte — deux comptes de la même banque produisaient le même
 * identifiant (collision → pointeur faussé, doublons non détectés).
 *
 * @param {Array<Array>} rows — lignes brutes du tableur
 * @param {number} [headerRow] — ligne d'en-tête trouvée ; on ne fouille qu'AVANT
 * @returns {{identifier:string, kind:'iban'|'compte', value:string} | null}
 */
export function _bankExtractSheetAccount(rows, headerRow) {
  const all = Array.isArray(rows) ? rows : [];
  const stop = (headerRow == null || headerRow < 0) ? Math.min(all.length, 15) : headerRow;
  const texts = [];
  for (let i = 0; i < stop; i++) {
    const r = all[i]; if (!Array.isArray(r)) continue;
    for (const c of r) { if (c != null && String(c).trim()) texts.push(String(c)); }
  }
  const blob = texts.join(' ');
  // IBAN FR (27 caractères), tolérant aux espaces de présentation.
  const iban = blob.replace(/[  ]/g, ' ').match(/\b([A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}[ ]?[A-Z0-9]{1,4})\b/);
  if (iban) {
    const v = iban[1].replace(/\s/g, '').toUpperCase();
    if (v.length >= 15 && v.length <= 34) return { identifier: 'iban:' + v, kind: 'iban', value: v };
  }
  // Numéro de compte annoncé explicitement (« Compte n° 00012345678 »).
  const cpt = blob.match(/(?:compte|account)[^0-9]{0,14}([0-9]{8,20})/i);
  if (cpt) return { identifier: 'cpt:' + cpt[1], kind: 'compte', value: cpt[1] };
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// BANK-IMPORT-V2 (v15.162 Phase D) — Pointeur de progression par compte
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// ④ LE COMPTE BANCAIRE — un compte appartient toujours à quelqu'un
// ────────────────────────────────────────────────────────────────────────────

/**
 * ④.1 — Le **bailleur est obligatoire** sur un compte : ce n'est pas un filtre,
 * c'est un fait. Il débloque la règle « bailleur du compte » (R-C), les biens
 * proposés, et le garde-fou d'affectation ci-dessous.
 * Échappatoire explicite : `mixte:true` (« compte mixte — plusieurs bailleurs »),
 * qui désactive la règle dynamique et impose le classement manuel.
 * @returns {{ok:boolean, reason:string}}
 */
export function _bankAccountBailleurOk(account) {
  if (!account) return { ok: false, reason: 'aucun compte' };
  if (account.mixte) return { ok: true, reason: 'compte mixte — plusieurs bailleurs' };
  if (account.bailleur && String(account.bailleur).trim()) return { ok: true, reason: '' };
  return { ok: false, reason: 'ce compte n’a pas encore de bailleur' };
}

/**
 * ④.1 — Garde-fou : un mouvement du compte de la SCI X ne peut pas être affecté à
 * un bien d'une **autre** entité (rien ne l'empêchait avant). Un compte mixte, ou
 * un compte sans bailleur, ne bloque rien.
 * Fonction PURE : l'appelant résout l'entité du bien avant d'appeler.
 * @param {{bailleur?:string, mixte?:boolean}} account
 * @param {string} entiteCible — entité du bien visé ('' si inconnue)
 * @returns {{ok:boolean, message:string}}
 */
export function _bankAffectationConflict(account, entiteCible) {
  const cible = String(entiteCible || '').trim();
  if (!account || account.mixte || !account.bailleur || !cible) return { ok: true, message: '' };
  if (_bankNormTxt(account.bailleur) === _bankNormTxt(cible)) return { ok: true, message: '' };
  return {
    ok: false,
    message: 'Ce compte appartient à ' + account.bailleur + ' — un mouvement de ce compte ne peut pas être affecté à un bien de ' + cible + '.',
  };
}

/**
 * ⑤.1 — Migration DOUCE et IDEMPOTENTE des comptes : l'ancien pointeur unique
 * (`lastImport.fingerprint`) devient une liste des **10 dernières empreintes**.
 * Ne touche à rien d'autre : aucun compte n'est supprimé, aucun bailleur inventé.
 * @param {object[]} accounts — DB.params.bankAccounts (modifié en place)
 * @returns {{migrated:number, skipped:number}}
 */
export function _bankMigrateAccounts(accounts) {
  let migrated = 0, skipped = 0;
  for (const a of (Array.isArray(accounts) ? accounts : [])) {
    if (!a || a._deleted) { skipped++; continue; }
    const li = a.lastImport;
    if (!li) { skipped++; continue; }
    if (Array.isArray(li.fingerprints)) { skipped++; continue; }   // déjà migré
    li.fingerprints = li.fingerprint ? [li.fingerprint] : [];
    migrated++;
  }
  return { migrated, skipped };
}

/** Nombre d'empreintes de reprise mémorisées par compte (⑤.1). */
export const _BANK_FP_MEMORY = 10;

/**
 * ⑤.1 — Coupe le fichier après **la plus récente des empreintes mémorisées**.
 * Une seule suffit pour rester déterministe : un chevauchement partiel, une ligne
 * disparue ou un libellé retouché ne cassent plus la reprise.
 * @param {object[]} lines
 * @param {string[]} fingerprints — les 10 dernières empreintes importées (plus récente en tête)
 * @returns {{after:object[], found:boolean, idx:number, matched:string}}
 */
export function _bankSliceAfterFingerprints(lines, fingerprints) {
  const fps = (Array.isArray(fingerprints) ? fingerprints : []).filter(Boolean);
  const all = Array.isArray(lines) ? lines : [];
  if (!fps.length) return { after: all, found: false, idx: -1, matched: '' };
  // On garde la coupe qui laisse le MOINS de lignes : c'est l'empreinte la plus
  // récente réellement présente dans le fichier.
  let best = null;
  for (const fp of fps) {
    const r = _bankSliceAfterFingerprint(all, fp);
    if (!r.found) continue;
    if (!best || r.after.length < best.after.length) best = { ...r, matched: fp };
  }
  return best || { after: all, found: false, idx: -1, matched: '' };
}

/**
 * ⑤.2 — Un fichier dont la ligne la plus récente est ANTÉRIEURE au pointeur est un
 * import **rétroactif** : accepté, mais annoncé. Toutes les lignes sont proposées,
 * les doublons déjà en base sont détectés.
 */
export function _bankIsRetroactive(lines, lastImport) {
  if (!lastImport || !lastImport.date) return false;
  const ds = (Array.isArray(lines) ? lines : []).map(l => l && l.date).filter(Boolean).sort();
  if (!ds.length) return false;
  return ds[ds.length - 1] < lastImport.date;
}

/**
 * Coupe une liste de lignes parsées à la position d'un fingerprint pointeur.
 * Sert au mode « imports suivants » : on récupère seulement ce qui est APRÈS la
 * dernière ligne déjà importée pour ce compte (identifiée par son `_fingerprint`).
 * @param {object[]} lines — lignes parsées (chaque ligne a un `_fingerprint`)
 * @param {string} fingerprint — fingerprint de la dernière ligne déjà importée
 * @returns {{after:object[], found:boolean, idx:number}}
 *   - found:true  → idx = position du pointeur ; after = les lignes PLUS RÉCENTES que le pointeur (peut être vide si tout est déjà importé)
 *   - found:false → idx = -1 ; after = lines (toutes — le caller doit appliquer un fallback : dédup heuristique)
 */
export function _bankSliceAfterFingerprint(lines, fingerprint) {
  if (!fingerprint || !Array.isArray(lines)) return { after: Array.isArray(lines) ? lines : [], found: false, idx: -1 };
  const idx = lines.findIndex(l => l && l._fingerprint === fingerprint);
  if (idx < 0) return { after: lines, found: false, idx: -1 };
  // BUG-BANK-SLICE-DESC (13/07/2026) : la sémantique est « les lignes PLUS RÉCENTES que le
  // pointeur », pas « après dans l'ordre du fichier ». Certains exports sont chronologiques
  // croissants (CM, BNP…), d'autres DÉCROISSANTS (Crédit Agricole : récent en premier) — le
  // slice positionnel supposait croissant et, sur un fichier décroissant, renvoyait le côté
  // ANCIEN (déjà importé) en jetant silencieusement toutes les nouvelles lignes. Détection de
  // l'ordre par les dates qui encadrent le fichier ; dates absentes/égales → repli positionnel
  // historique (croissant), inchangé.
  const dates = lines.map(l => (l && l.date) || '').filter(Boolean);
  const desc = dates.length >= 2 && dates[0] > dates[dates.length - 1];
  return { after: desc ? lines.slice(0, idx) : lines.slice(idx + 1), found: true, idx };
}

/**
 * Calcule le nouveau pointeur `lastImport` à partir d'un lot de lignes qu'on vient d'importer.
 * La « dernière ligne » est celle dont la `date` est la plus grande (pas l'ordre dans le fichier,
 * qui peut être DESC chez certaines banques).
 *
 * 🐛 **BUG 2 du CDC (⑤.2) — LE POINTEUR NE RECULE JAMAIS.** Avant, le pointeur était
 * recalculé comme la date max du lot importé et **écrasait** l'ancien : importer juin
 * après août faisait RECULER le pointeur de fin août à fin juin, et l'import suivant
 * reproposait juillet-août en entier. On garde désormais la date la plus récente entre
 * l'ancien pointeur et le nouveau, et l'empreinte qui va avec.
 *
 * ⑤.1 — On mémorise les **10 dernières empreintes** (plus récente en tête) au lieu
 * d'une seule : un chevauchement partiel, une ligne disparue ou un libellé retouché
 * ne cassent plus la reprise.
 *
 * @param {object[]} acceptedLines — lignes effectivement importées (chacune avec date + _fingerprint)
 * @param {number} previousCount — compteur cumulé existant (avant cet import)
 * @param {object} [previousLastImport] — pointeur existant, pour ne jamais reculer
 * @returns {{date:string, fingerprint:string|null, fingerprints:string[], count:number, at:string} | null}
 */
export function _bankComputeLastImport(acceptedLines, previousCount, previousLastImport) {
  if (!Array.isArray(acceptedLines) || !acceptedLines.length) return previousLastImport || null;
  const prev = previousLastImport || null;
  const sorted = acceptedLines.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = sorted[sorted.length - 1];
  const newDate = last.date || '';
  const prevDate = (prev && prev.date) || '';
  // Les nouvelles empreintes passent en tête (plus récentes d'abord), les anciennes suivent.
  const fresh = sorted.slice().reverse().map(l => l && l._fingerprint).filter(Boolean);
  const prevFps = Array.isArray(prev && prev.fingerprints) ? prev.fingerprints
    : ((prev && prev.fingerprint) ? [prev.fingerprint] : []);
  const fingerprints = [...new Set([...fresh, ...prevFps])].slice(0, _BANK_FP_MEMORY);
  // Le pointeur ne recule jamais : on garde la date la plus récente des deux.
  const keepPrev = prevDate && newDate && prevDate > newDate;
  return {
    date: keepPrev ? prevDate : newDate,
    fingerprint: keepPrev ? (prev.fingerprint || null) : (last._fingerprint || null),
    fingerprints,
    count: (Number(previousCount) || 0) + acceptedLines.length,
    at: new Date().toISOString()
  };
}
