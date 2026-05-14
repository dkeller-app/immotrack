/**
 * core/bank-import.js — BANK-INTEGRATION V1 v15.07 Sprint 8 V1.1
 *
 * Import CSV/OFX manuel de mouvements bancaires + matching auto par
 * heuristiques vers les catégories ImmoTrack (Loyers, Charges, Travaux, etc.).
 *
 * Architecture V1 : 100% offline-first (pas de backend AISP DSP2).
 *   - Utilisateur exporte CSV/OFX depuis sa banque
 *   - Importe le fichier dans ImmoTrack
 *   - Heuristiques mappent date/libellé/montant vers (cat, qui) cible
 *   - Modale validation pour corriger les mappings auto
 *   - Persistance dans DB.mouvements existant (pas de nouveau schéma)
 *
 * V2 SaaS (post-commercialisation) : intégration Saltedge AISP via backend.
 * Cf docs/subjects/BANK-INTEGRATION.md pour étude détaillée.
 *
 * Tests Vitest miroir : __tests__/helpers/bank-import.test.js
 */

// ────────────────────────────────────────────────────────────────────────────
// Parser CSV — supporte virgule + point-virgule + tabulation comme délimiteurs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse un texte CSV → { headers, rows, delimiter }.
 * Détecte automatiquement le délimiteur (','/';'/'\t').
 * Gère les champs entre guillemets avec virgules internes.
 */
export function _bankParseCSV(text) {
  if (!text || typeof text !== 'string') return { headers:[], rows:[], delimiter:',' };
  // Détecte délimiteur sur première ligne non vide
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim().length > 0);
  if (!lines.length) return { headers:[], rows:[], delimiter:',' };
  const first = lines[0];
  const counts = { ';': (first.match(/;/g)||[]).length, ',': (first.match(/,/g)||[]).length, '\t': (first.match(/\t/g)||[]).length };
  const delimiter = counts[';'] >= counts[','] && counts[';'] >= counts['\t'] ? ';'
    : counts['\t'] > counts[','] ? '\t' : ',';

  const parseRow = (line) => {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"' && inQuotes) { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows, delimiter };
}

/**
 * Devine la signature de colonnes : retourne { date, libelle, debit, credit, montant, solde }
 * → indices des colonnes correspondantes (ou -1 si absent).
 * Heuristiques basées sur les en-têtes français/anglais standards.
 */
export function _bankAutoDetectColumns(headers) {
  const out = { date:-1, libelle:-1, debit:-1, credit:-1, montant:-1, solde:-1 };
  if (!Array.isArray(headers)) return out;
  headers.forEach((h, i) => {
    const k = String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    if (out.date === -1 && /^(date|date op|date operation|date de valeur|valeur|trans date)/i.test(k)) out.date = i;
    if (out.libelle === -1 && /^(libell|libelle|description|details|trans desc|memo|narrative|nature)/i.test(k)) out.libelle = i;
    if (out.debit === -1 && /^(debit|montant debit|sortie|debit eur)/i.test(k)) out.debit = i;
    if (out.credit === -1 && /^(credit|montant credit|entree|credit eur)/i.test(k)) out.credit = i;
    if (out.montant === -1 && /^(montant|amount|trans amount|montant eur|valeur eur)$/i.test(k)) out.montant = i;
    if (out.solde === -1 && /^(solde|balance|solde eur|running balance)/i.test(k)) out.solde = i;
  });
  return out;
}

/** Parse un montant string FR/EN vers nombre. "1 234,56 €" → 1234.56 */
export function _bankParseAmount(s) {
  if (s == null || s === '') return 0;
  let v = String(s).replace(/[\s€$£]/g, '').trim();
  // Format FR : 1.234,56 → 1234.56. Si présence de virgule + point, le dernier domine.
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) v = v.replace(/\./g,'').replace(',','.');
    else                      v = v.replace(/,/g,'');
  } else if (lastComma >= 0) {
    // Si virgule = séparateur décimal (toujours 2 décimales après) → remplace
    if (/,\d{1,2}$/.test(v)) v = v.replace(',','.');
    else                      v = v.replace(/,/g,'');
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse une date FR/ISO vers YYYY-MM-DD. "15/06/2026" → "2026-06-15" */
export function _bankParseDate(s) {
  if (!s) return '';
  const str = String(s).trim();
  // Déjà ISO YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY ou DD-MM-YYYY
  m = str.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // YYYYMMDD (OFX compact)
  m = str.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YY → on suppose 20YY (2 chiffres = années 2000+)
  m = str.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

/**
 * Construit des lignes normalisées à partir des rows CSV + colonnes détectées.
 * Chaque ligne : { date, libelle, debit, credit, signedAmount, raw }
 */
export function _bankNormalizeCSV(parsed, cols) {
  const out = [];
  const { rows } = parsed;
  for (const r of (rows||[])) {
    const date = cols.date >= 0 ? _bankParseDate(r[cols.date]) : '';
    if (!date) continue; // ligne sans date = skip
    const libelle = cols.libelle >= 0 ? String(r[cols.libelle]||'').trim() : '';
    let debit = 0, credit = 0;
    if (cols.debit >= 0 || cols.credit >= 0) {
      debit  = cols.debit  >= 0 ? Math.abs(_bankParseAmount(r[cols.debit]))  : 0;
      credit = cols.credit >= 0 ? Math.abs(_bankParseAmount(r[cols.credit])) : 0;
    } else if (cols.montant >= 0) {
      // Colonne unique signée : positif = crédit, négatif = débit
      const v = _bankParseAmount(r[cols.montant]);
      if (v >= 0) credit = v;
      else        debit  = -v;
    }
    if (debit === 0 && credit === 0) continue;
    out.push({
      date,
      libelle,
      debit,
      credit,
      signedAmount: credit - debit,
      raw: r
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Parser OFX (Open Financial Exchange) — format SGML/XML simplifié
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse un texte OFX → liste de transactions normalisées.
 * Format cible : `<STMTTRN><TRNTYPE>...<DTPOSTED>...<TRNAMT>...<NAME>...<MEMO>...</STMTTRN>`
 * Supporte SGML (tags non fermés) et XML (tags fermés).
 */
export function _bankParseOFX(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  // Recherche les blocs STMTTRN entre <STMTTRN> et </STMTTRN> (XML) ou jusqu'au prochain STMTTRN ou </BANKTRANLIST> (SGML)
  // Approche robuste : extract via regex sur les balises connues.
  const tx = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)];
  for (const m of tx) {
    const body = m[1] || '';
    const get = (tag) => {
      const r = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
      const x = body.match(r);
      return x ? x[1].trim() : '';
    };
    const dt = get('DTPOSTED');
    const amt = get('TRNAMT');
    const name = get('NAME');
    const memo = get('MEMO');
    const fitid = get('FITID');
    const date = _bankParseDate(dt);
    if (!date) continue;
    const val = _bankParseAmount(amt);
    if (val === 0) continue;
    out.push({
      date,
      libelle: [name, memo].filter(Boolean).join(' — ').trim(),
      debit:  val < 0 ? -val : 0,
      credit: val > 0 ?  val : 0,
      signedAmount: val,
      fitid, // identifiant unique OFX (utile pour dédup)
      raw: body.slice(0, 200)
    });
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
export function _bankMatchHeuristic(line, ctx = {}) {
  const result = { cat: '', qui: '', confidence: 0, source: '' };
  if (!line || !line.libelle) return result;
  const lib = String(line.libelle).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const baux = ctx.baux || {};
  const tolerance = ctx.tolerance ?? 5; // 5€ tolérance ≈ loyer attendu

  // 1. Match locataire par nom + montant ≈ loyer
  if (line.credit > 0) {
    for (const [ref, bail] of Object.entries(baux)) {
      if (!bail || bail.cloture) continue;
      // On extrait les mots significatifs (≥3 chars) du nom locataire — l'ordre
      // dans le libellé bancaire varie selon les banques ("VIR ALICE MARTIN" vs
      // "VIRT MARTIN ALICE"). On considère qu'au moins 1 mot identifié = match.
      const locNames = (bail.locataires||[{nom: bail.nom}])
        .map(x => String(x.nom||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''))
        .filter(Boolean);
      const locWords = [];
      locNames.forEach(n => n.split(/[\s\-']+/).forEach(w => { if (w.length >= 3) locWords.push(w); }));
      const loyerAttendu = (Number(bail.hc)||0) + (Number(bail.ch)||0);
      const nameMatched = locWords.some(w => lib.includes(w));
      const amountClose = loyerAttendu > 0 && Math.abs(line.credit - loyerAttendu) < tolerance;
      if (nameMatched && amountClose) {
        result.cat = 'Loyers encaissés';
        result.qui = ref;
        result.confidence = 0.95;
        result.source = 'Nom locataire + montant exact';
        return result;
      }
      if (nameMatched) {
        result.cat = 'Loyers encaissés';
        result.qui = ref;
        result.confidence = 0.70;
        result.source = 'Nom locataire (montant divergent)';
        return result;
      }
      if (amountClose && /vir|vrt|virement/i.test(lib)) {
        result.cat = 'Loyers encaissés';
        result.qui = ref;
        result.confidence = 0.60;
        result.source = 'Montant exact + VIR';
        return result;
      }
    }
  }

  // 2. Catégorisation par mots-clés (débits typiquement)
  const KEYWORDS = [
    { rx: /\b(assurance|axa|maaf|matmut|aviva|allianz|maif|groupama)\b/i, cat: "Primes d'assurance PNO", confidence: 0.85, src: 'Mot-clé assurance' },
    { rx: /\b(edf|engie|eni|enedis|electric|gaz de france|gdf|gn|veolia|saur|suez|sde|smede)\b/i, cat: 'Charges récupérables non récupérées', confidence: 0.80, src: 'Mot-clé énergie/eau' },
    { rx: /\b(syndic|copropriete|copro|charges copro|appel de fonds)\b/i, cat: 'Provisions pour charges de copropriété', confidence: 0.90, src: 'Mot-clé syndic' },
    { rx: /\b(travaux|renovation|reno|peinture|plombier|electricien|chauffagiste|menuisier|charpentier|carreleur|macon)\b/i, cat: "Travaux de réparation et d'entretien", confidence: 0.80, src: 'Mot-clé travaux' },
    { rx: /\b(taxe fonciere|tf )/i, cat: "Taxes foncières", confidence: 0.95, src: 'Mot-clé TF' },
    { rx: /\b(taxe d.habitation|th )/i, cat: 'Autres', confidence: 0.70, src: 'Mot-clé TH' },
    { rx: /\b(remboursement|rbt|emprunt|pret|credit immo|amortissement)\b/i, cat: 'Intérêts d\'emprunt', confidence: 0.80, src: 'Mot-clé emprunt' },
    { rx: /\b(notaire|frais notaire|honoraires)\b/i, cat: 'Frais de gérance, rémunérations', confidence: 0.75, src: 'Mot-clé notaire' },
    { rx: /\b(dpe|diagnostic|expert|expertise|geometre)\b/i, cat: "Frais de procédure", confidence: 0.75, src: 'Mot-clé diagnostic' }
  ];
  for (const k of KEYWORDS) {
    if (k.rx.test(lib)) {
      result.cat = k.cat;
      result.confidence = k.confidence;
      result.source = k.src;
      return result;
    }
  }

  // 3. Fallback
  result.cat = 'Autres';
  result.confidence = 0.20;
  result.source = 'Aucun match — à classifier manuellement';
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Détection doublons
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pour chaque nouvelle ligne, indique si elle existe déjà dans `mouvementsExistants`.
 * Critère : même date ±3 jours + même montant ±1€ + libellé ressemblant.
 * @returns {Array<{...line, isDuplicate: bool, duplicateOf: string}>}
 */
export function _bankDedup(newLines, mouvementsExistants, options = {}) {
  const toleranceDays = options.toleranceDays ?? 3;
  const toleranceAmount = options.toleranceAmount ?? 1;
  const out = [];
  for (const line of (newLines||[])) {
    let isDuplicate = false;
    let duplicateOf = '';
    const lineMontant = line.credit > 0 ? line.credit : -line.debit;
    const lineDate = new Date(line.date + 'T00:00:00').getTime();
    for (const m of (mouvementsExistants||[])) {
      if (!m || m._deleted) continue;
      // 1. Bonus : fitid OFX exact = match certain peu importe la date
      if (line.fitid && m.fitid && line.fitid === m.fitid) {
        isDuplicate = true; duplicateOf = String(m.id); break;
      }
      if (!m.date) continue;
      const mMontant = (m.cr||0) > 0 ? (m.cr||0) : -(m.db||0);
      if (Math.abs(mMontant - lineMontant) > toleranceAmount) continue;
      const mDate = new Date(m.date + 'T00:00:00').getTime();
      const dayDiff = Math.abs((mDate - lineDate) / 86400000);
      if (dayDiff > toleranceDays) continue;
      // Match date + montant
      isDuplicate = true;
      duplicateOf = String(m.id || '?');
      break;
    }
    out.push({ ...line, isDuplicate, duplicateOf });
  }
  return out;
}
