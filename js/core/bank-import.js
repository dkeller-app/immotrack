/**
 * core/bank-import.js — BANK-INTEGRATION V1 v15.07 Sprint 8 V1.1
 * v15.78 BUG-BANK-IMPORT-DEDUP : fingerprinting stable pour dédup robuste.
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
 * Cf docs/subjects/BANK-INTEGRATION.md + docs/subjects/BUG-BANK-IMPORT-DEDUP.md.
 *
 * Tests Vitest miroir : __tests__/helpers/bank-import.test.js
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

/**
 * Empreinte stable pour une ligne CSV brute (string source).
 * Normalise espaces multiples, accents, casse → robuste aux variations cosmétiques
 * que la banque pourrait introduire entre 2 exports du même mois.
 * @param {string} rawLine — la ligne CSV originale (avant split)
 * @returns {string} 16 chars hex
 */
export function _bankFingerprintCSV(rawLine) {
  const normalized = String(rawLine || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
    .toLowerCase();
  return _bankHashStable(normalized);
}

/**
 * Empreinte stable pour une transaction OFX (body STMTTRN entier).
 * Priorité 1 : FITID (identifiant unique fourni par la banque, retourné préfixé "fitid:").
 * Priorité 2 : hash sur (DTPOSTED|TRNAMT|NAME|MEMO) joints.
 * @param {string} stmttrnBody — contenu entre <STMTTRN> et </STMTTRN>
 * @returns {string} 'fitid:XXX' si FITID présent, sinon 16 chars hex
 */
export function _bankFingerprintOFX(stmttrnBody) {
  const body = String(stmttrnBody || '');
  const fitidMatch = body.match(/<FITID>([^<\r\n]*)/i);
  if (fitidMatch && fitidMatch[1].trim()) return 'fitid:' + fitidMatch[1].trim();
  const fields = ['DTPOSTED', 'TRNAMT', 'NAME', 'MEMO']
    .map(t => {
      const m = body.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    })
    .join('|');
  return _bankHashStable(fields);
}

// ────────────────────────────────────────────────────────────────────────────
// Parser CSV — supporte virgule + point-virgule + tabulation comme délimiteurs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse un texte CSV → { headers, rows, delimiter, rawLines }.
 * v15.78 BUG-BANK-IMPORT-DEDUP : ajoute rawLines (strings brutes) pour le fingerprinting.
 * Détecte automatiquement le délimiteur (','/';'/'\t').
 * Gère les champs entre guillemets avec virgules internes.
 */
export function _bankParseCSV(text) {
  if (!text || typeof text !== 'string') return { headers:[], rows:[], delimiter:',', rawLines:[] };
  // Détecte délimiteur sur première ligne non vide
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l => l.trim().length > 0);
  if (!lines.length) return { headers:[], rows:[], delimiter:',', rawLines:[] };
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
  const dataLines = lines.slice(1);
  const rows = dataLines.map(parseRow);
  return { headers, rows, delimiter, rawLines: dataLines };
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
  const { rows, rawLines } = parsed;
  for (let i = 0; i < (rows || []).length; i++) {
    const r = rows[i];
    const date = cols.date >= 0 ? _bankParseDate(r[cols.date]) : '';
    if (!date) continue; // ligne sans date = skip
    const libelle = cols.libelle >= 0 ? String(r[cols.libelle]||'').trim() : '';
    let debit = 0, credit = 0;
    if (cols.debit >= 0 || cols.credit >= 0) {
      debit  = cols.debit  >= 0 ? Math.abs(_bankParseAmount(r[cols.debit]))  : 0;
      credit = cols.credit >= 0 ? Math.abs(_bankParseAmount(r[cols.credit])) : 0;
    } else if (cols.montant >= 0) {
      const v = _bankParseAmount(r[cols.montant]);
      if (v >= 0) credit = v;
      else        debit  = -v;
    }
    if (debit === 0 && credit === 0) continue;
    // v15.78 : empreinte stable calculée sur la rawLine brute
    const rawLine = (rawLines && rawLines[i]) ? rawLines[i] : r.join('|');
    out.push({
      date,
      libelle,
      debit,
      credit,
      signedAmount: credit - debit,
      raw: r,
      _fingerprint: _bankFingerprintCSV(rawLine),
      _importSource: 'csv',
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
      raw: body.slice(0, 200),
      _fingerprint: _bankFingerprintOFX(body),
      _importSource: 'ofx',
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

/**
 * Détecte les doublons d'import bancaire.
 * v15.78 BUG-BANK-IMPORT-DEDUP : 2 stratégies en cascade :
 *   1. Match par `_fingerprint` (priorité, robuste post-modification user)
 *   2. Match legacy date±3j + montant±1€ + fitid (uniquement contre mouvements
 *      existants SANS _fingerprint — compat v15.07)
 *
 * @returns {Array<{...line, isDuplicate, duplicateOf, duplicateReason}>}
 */
export function _bankDedup(newLines, mouvementsExistants, options = {}) {
  const toleranceDays = options.toleranceDays ?? 3;
  const toleranceAmount = options.toleranceAmount ?? 1;
  const legacyFallback = options.legacyFallback !== false;

  // Index des fingerprints existants en DB (lookup O(1))
  const fpIndex = new Map();
  for (const m of (mouvementsExistants || [])) {
    if (!m || m._deleted || !m._fingerprint) continue;
    if (!fpIndex.has(m._fingerprint)) fpIndex.set(m._fingerprint, m);
  }

  const out = [];
  for (const line of (newLines || [])) {
    let isDuplicate = false;
    let duplicateOf = '';
    let duplicateReason = '';

    // Stratégie 1 — fingerprint (priorité)
    if (line._fingerprint && fpIndex.has(line._fingerprint)) {
      const m = fpIndex.get(line._fingerprint);
      isDuplicate = true;
      duplicateOf = String(m.id || '?');
      duplicateReason = 'Empreinte CSV/OFX identique déjà importée';
    }

    // Stratégie 2 — fallback legacy (date+montant+fitid) UNIQUEMENT contre
    // mouvements existants SANS _fingerprint (compat v15.07).
    if (!isDuplicate && legacyFallback) {
      const lineMontant = line.credit > 0 ? line.credit : -line.debit;
      const lineDate = line.date ? new Date(line.date + 'T00:00:00').getTime() : NaN;
      for (const m of (mouvementsExistants || [])) {
        if (!m || m._deleted) continue;
        if (m._fingerprint) continue; // déjà couvert par stratégie 1
        // Bonus fitid OFX
        if (line.fitid && m.fitid && line.fitid === m.fitid) {
          isDuplicate = true;
          duplicateOf = String(m.id || '?');
          duplicateReason = 'FITID OFX identique (legacy)';
          break;
        }
        if (!m.date || !isFinite(lineDate)) continue;
        const mMontant = (m.cr || 0) > 0 ? (m.cr || 0) : -(m.db || 0);
        if (Math.abs(mMontant - lineMontant) > toleranceAmount) continue;
        const mDate = new Date(m.date + 'T00:00:00').getTime();
        const dayDiff = Math.abs((mDate - lineDate) / 86400000);
        if (dayDiff > toleranceDays) continue;
        isDuplicate = true;
        duplicateOf = String(m.id || '?');
        duplicateReason = `Date ±${toleranceDays}j + montant ±${toleranceAmount}€ (legacy)`;
        break;
      }
    }

    // Stratégie 3 — relevé déjà DÉCOUPÉ : la ligne source ne matche aucune part individuelle
    // (montants différents) et n'a pas d'empreinte (CSV legacy). On détecte que son montant = la
    // SOMME des parts d'import bancaire du MÊME jour (même compte si connu). Robuste sans empreinte.
    if (!isDuplicate) {
      const lineMontant = line.credit > 0 ? line.credit : -line.debit;
      const acct = line._bankAccountId || null;
      const parts = (mouvementsExistants || []).filter(m =>
        m && !m._deleted && m.date === line.date && m._source === 'bank_import' &&
        (!acct || !m._bankAccountId || m._bankAccountId === acct));
      if (parts.length >= 2) {
        const sum = parts.reduce((s, m) => s + ((m.cr || 0) > 0 ? (m.cr || 0) : -(m.db || 0)), 0);
        if (Math.abs(sum - lineMontant) <= toleranceAmount) {
          isDuplicate = true;
          duplicateOf = String(parts[0].id || '?');
          duplicateReason = 'Relevé déjà importé et découpé (somme des parts du jour)';
        }
      }
    }

    out.push({ ...line, isDuplicate, duplicateOf, duplicateReason });
  }
  return out;
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
 * Hash stable des en-têtes d'un CSV → identifiant de SCHÉMA (pas du contenu).
 * Permet de reconnaître automatiquement un fichier CSV provenant de la même banque
 * (même structure de colonnes) entre 2 imports. L'user le mappera la 1re fois à un
 * compte (label) ; les fois suivantes la reconnaissance est auto.
 * @param {{headers:string[], delimiter?:string}} parsed — sortie de _bankParseCSV
 * @returns {string|null} 'csv:XXXX' ou null si pas d'en-têtes.
 */
export function _bankCsvHeaderHash(parsed) {
  if (!parsed || !Array.isArray(parsed.headers) || !parsed.headers.length) return null;
  const norm = parsed.headers
    .map(h => String(h || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim())
    .join('|');
  return 'csv:' + _bankHashStable(norm + '|' + (parsed.delimiter || ','));
}

// ────────────────────────────────────────────────────────────────────────────
// BANK-IMPORT-V2 (v15.162 Phase D) — Pointeur de progression par compte
// ────────────────────────────────────────────────────────────────────────────

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
 * @param {object[]} acceptedLines — lignes effectivement importées (chacune avec date + _fingerprint)
 * @param {number} previousCount — compteur cumulé existant (avant cet import)
 * @returns {{date:string, fingerprint:string|null, count:number, at:string} | null}
 *   null si la liste est vide.
 */
export function _bankComputeLastImport(acceptedLines, previousCount) {
  if (!Array.isArray(acceptedLines) || !acceptedLines.length) return null;
  const sorted = acceptedLines.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = sorted[sorted.length - 1];
  return {
    date: last.date || '',
    fingerprint: last._fingerprint || null,
    count: (Number(previousCount) || 0) + acceptedLines.length,
    at: new Date().toISOString()
  };
}
