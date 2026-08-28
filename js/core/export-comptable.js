/**
 * core/export-comptable.js — Exports comptables (Sprint 3E).
 *
 * Formats produits :
 *   - FEC (Fichier des Écritures Comptables) — format obligatoire DGFiP
 *     pour contrôle fiscal (art. L47A LPF). Format texte avec séparateur
 *     tab ou pipe, 18 colonnes normées.
 *   - Journal général (par date + compte + libellé + débit + crédit)
 *   - Grand livre (par compte, soldes mouvementés)
 *
 * Mapping comptable simplifié pour gestion locative :
 *   Compte 411xxx (clients) — locataires
 *   Compte 706000 (prestations services) — loyers
 *   Compte 615xxx (entretien réparations) — travaux
 *   Compte 616xxx (assurances) — PNO, GLI, MRH
 *   Compte 622xxx (honoraires) — frais de gestion
 *   Compte 635xxx (impôts taxes) — taxe foncière
 *   Compte 661xxx (charges financières) — intérêts emprunt
 *   Compte 165xxx (dépôts cautionnement reçus) — DG locataires
 *
 * Tests Vitest : __tests__/helpers/export-comptable.test.js
 */

/** Mapping STD_CATEGORIES → compte comptable + sens (D/C). */
const MAPPING_COMPTE = {
  '211': { compte: '706000', libelleCompte: 'Loyers', sens: 'C' },
  '213': { compte: '758000', libelleCompte: 'Produits divers de gestion', sens: 'C' },
  '221': { compte: '622000', libelleCompte: 'Honoraires de gestion', sens: 'D' },
  '223': { compte: '616000', libelleCompte: 'Primes d\'assurance', sens: 'D' },
  '224': { compte: '615200', libelleCompte: 'Entretien et réparations', sens: 'D' },
  '224bis': { compte: '615210', libelleCompte: 'Travaux rénovation énergétique', sens: 'D' },
  '225': { compte: '615280', libelleCompte: 'Charges récup non récupérées', sens: 'D' },
  '226': { compte: '658000', libelleCompte: 'Indemnités d\'éviction', sens: 'D' },
  '227': { compte: '635110', libelleCompte: 'Taxe foncière', sens: 'D' },
  '229': { compte: '615500', libelleCompte: 'Charges copropriété', sens: 'D' },
  '230': { compte: '615510', libelleCompte: 'Régul charges copro N-1', sens: 'D' },
  '250': { compte: '661100', libelleCompte: 'Intérêts d\'emprunt', sens: 'D' }
};

/**
 * Vue « par mouvement » — SOURCE UNIQUE du filtre (période/entité) et de la
 * numérotation `num` séquentielle. `_buildEcritures` (écritures partie double) ET
 * le Dossier comptable (lien num ↔ facture) consomment cette même liste, ce qui
 * GARANTIT par construction l'alignement des `num` (même filtre, même ordre).
 *
 * @returns {Array} - [{ num, mvt, std, mapping, montant, type, date, qui, lib, cat }]
 */
export function _buildMvtRows(mouvements, stdCategories, opts = {}) {
  const { from = '', to = '', entityNom = '', refs = [] } = opts;
  const catByName = new Map();
  (stdCategories || []).forEach(c => catByName.set(c.nom, c));

  const inScope = m => {
    if (!m || m._deleted) return false;
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (entityNom) {
      const isGlobal = m.qui === 'SCI:' + entityNom;
      const isInScope = refs && refs.includes(m.qui);
      if (!isGlobal && !isInScope) return false;
    }
    return true;
  };

  const rows = [];
  let num = 1;
  (mouvements || []).filter(inScope).forEach(m => {
    const std = catByName.get(m.cat);
    if (!std || !std.ligne2044) return; // skip non-mappé ou type=special
    const mapping = MAPPING_COMPTE[std.ligne2044];
    if (!mapping) return;
    const montant = (std.type === 'recette') ? (m.cr || 0) : (m.db || 0);
    if (montant <= 0) return;
    rows.push({ num: num++, mvt: m, std, mapping, montant, type: std.type, date: m.date, qui: m.qui || '', lib: m.lib || '', cat: m.cat || '' });
  });
  return rows;
}

/**
 * Construit la liste des écritures (journal) pour une période + entité.
 *
 * @returns {Array} - [{ date, num, compte, libelleCompte, lib, qui, debit, credit, contrepartie }]
 */
export function _buildEcritures(mouvements, stdCategories, opts = {}) {
  const ecritures = [];
  _buildMvtRows(mouvements, stdCategories, opts).forEach(r => {
    const { num: numEcr, mapping, montant, std, mvt: m } = r;
    // 1 mouvement = 2 écritures (partie double : compte du tiers + compte de produit/charge)
    const tierCompte = std.type === 'recette' ? '411000' : '401000';
    const tierLib = std.type === 'recette' ? 'Client (locataire)' : 'Fournisseur';
    if (mapping.sens === 'C') {
      // Crédit du compte produit, débit du compte tiers
      ecritures.push({ date: m.date, num: numEcr, compte: tierCompte, libelleCompte: tierLib, lib: m.lib || '', qui: m.qui || '', debit: montant, credit: 0, contrepartie: mapping.compte });
      ecritures.push({ date: m.date, num: numEcr, compte: mapping.compte, libelleCompte: mapping.libelleCompte, lib: m.lib || '', qui: m.qui || '', debit: 0, credit: montant, contrepartie: tierCompte });
    } else {
      // Débit du compte charge, crédit du compte tiers
      ecritures.push({ date: m.date, num: numEcr, compte: mapping.compte, libelleCompte: mapping.libelleCompte, lib: m.lib || '', qui: m.qui || '', debit: montant, credit: 0, contrepartie: tierCompte });
      ecritures.push({ date: m.date, num: numEcr, compte: tierCompte, libelleCompte: tierLib, lib: m.lib || '', qui: m.qui || '', debit: 0, credit: montant, contrepartie: mapping.compte });
    }
  });
  return ecritures;
}

/**
 * Construit le grand livre (groupé par compte avec totaux).
 */
export function _buildGrandLivre(ecritures) {
  const byCompte = {};
  (ecritures || []).forEach(e => {
    if (!byCompte[e.compte]) {
      byCompte[e.compte] = { compte: e.compte, libelleCompte: e.libelleCompte, lignes: [], totalDebit: 0, totalCredit: 0 };
    }
    const lvr = byCompte[e.compte];
    lvr.lignes.push(e);
    lvr.totalDebit += e.debit;
    lvr.totalCredit += e.credit;
  });
  Object.values(byCompte).forEach(c => {
    c.solde = Math.round((c.totalDebit - c.totalCredit) * 100) / 100;
    c.totalDebit = Math.round(c.totalDebit * 100) / 100;
    c.totalCredit = Math.round(c.totalCredit * 100) / 100;
  });
  return Object.values(byCompte).sort((a, b) => a.compte.localeCompare(b.compte));
}

/**
 * Génère un FEC (Fichier Écritures Comptables) format DGFiP.
 *
 * Format texte avec tab `\t` séparateur, 18 colonnes :
 *   JournalCode | JournalLib | EcritureNum | EcritureDate | CompteNum | CompteLib |
 *   CompAuxNum | CompAuxLib | PieceRef | PieceDate | EcritureLib | Debit | Credit |
 *   EcritureLet | DateLet | ValidDate | Montantdevise | Idevise
 *
 * Référence : Arrêté du 29 juillet 2013, BOI-CF-IOR-60-40-20.
 *
 * `opts.pieceRefByNum` (optionnel) : map { num → nom de fichier facture } fournie
 * par le Dossier comptable pour relier chaque écriture à son justificatif dans le
 * .zip. Absent (export FEC autonome) → comportement historique `'M'+num`.
 */
export function _toFEC(ecritures, opts = {}) {
  const { entityNom = '', from = '', to = '', pieceRefByNum = null } = opts;
  const headers = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
    'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit',
    'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'
  ];
  const validDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rows = (ecritures || []).map(e => [
    'GEST',                                  // JournalCode (gestion locative)
    'Gestion locative',                       // JournalLib
    'GL' + String(e.num).padStart(6, '0'),    // EcritureNum
    e.date.replace(/-/g, ''),                  // EcritureDate (YYYYMMDD)
    e.compte,                                  // CompteNum
    (e.libelleCompte || '').slice(0, 50),     // CompteLib
    e.qui || '',                               // CompAuxNum (auxiliaire = ref locataire/fournisseur)
    (e.qui || '').slice(0, 50),                // CompAuxLib
    (pieceRefByNum && pieceRefByNum[e.num]) || ('M' + e.num), // PieceRef (nom fichier facture si Dossier comptable, sinon 'M'+num)
    e.date.replace(/-/g, ''),                  // PieceDate
    (e.lib || '').slice(0, 200).replace(/[\t\n\r]/g, ' '), // EcritureLib (anti-tab)
    e.debit ? e.debit.toFixed(2).replace('.', ',') : '0,00',
    e.credit ? e.credit.toFixed(2).replace('.', ',') : '0,00',
    '',                                        // EcritureLet (lettrage — vide V1)
    '',                                        // DateLet
    validDate,                                 // ValidDate
    '',                                        // Montantdevise (EUR uniquement)
    ''                                         // Idevise
  ]);
  return [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
}

/**
 * Échappement CSV + garde anti-injection de formule (Excel/Sheets exécutent une
 * cellule TEXTE commençant par = + @ ou tab/CR, ou par - non suivi d'un chiffre).
 * On préfixe une apostrophe pour neutraliser SANS toucher aux nombres négatifs
 * légitimes (soldes du grand livre). Puis quoting standard si , " ou saut de ligne.
 */
export function _csvCell(s) {
  let v = String(s == null ? '' : s);
  if (/^[=+@\t\r]/.test(v) || /^-(?![0-9])/.test(v)) v = "'" + v;
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/** Génère un journal général en CSV (lisible humain + Excel). */
export function _journalToCsv(ecritures) {
  const headers = ['date', 'num', 'compte', 'libelle_compte', 'tier', 'libelle', 'debit', 'credit'];
  const rows = (ecritures || []).map(e => [
    e.date, e.num, e.compte, e.libelleCompte, e.qui || '', e.lib || '',
    e.debit ? e.debit.toFixed(2) : '', e.credit ? e.credit.toFixed(2) : ''
  ]);
  return [headers.join(','), ...rows.map(r => r.map(_csvCell).join(','))].join('\n');
}

/** Génère le grand livre en CSV. */
export function _grandLivreToCsv(grandLivre) {
  const headers = ['compte', 'libelle_compte', 'date', 'piece', 'libelle', 'debit', 'credit', 'solde_progression'];
  const rows = [];
  (grandLivre || []).forEach(lvr => {
    let solde = 0;
    lvr.lignes.forEach(l => {
      solde += (l.debit || 0) - (l.credit || 0);
      rows.push([lvr.compte, lvr.libelleCompte, l.date, 'M' + l.num, l.lib || '',
        l.debit ? l.debit.toFixed(2) : '', l.credit ? l.credit.toFixed(2) : '',
        solde.toFixed(2)]);
    });
    // Ligne totaux
    rows.push([lvr.compte, '== TOTAL ' + lvr.compte + ' ==', '', '', '',
      lvr.totalDebit.toFixed(2), lvr.totalCredit.toFixed(2), lvr.solde.toFixed(2)]);
  });
  return [headers.join(','), ...rows.map(r => r.map(_csvCell).join(','))].join('\n');
}
