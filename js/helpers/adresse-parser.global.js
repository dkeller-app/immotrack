/**
 * adresse-parser.global.js — Wrapper browser (window.AdresseParser)
 * (ARCHI-FICHES-UNIFIED Session 2, v15.212)
 *
 * Mirror du module ES `__tests__/helpers/adresse-parser.js` (testé Vitest).
 * Petit module (3 fonctions), pas besoin de script de sync auto pour l'instant —
 * si la logique évolue, copier-coller depuis l'ES (et garder les 2 fichiers
 * en synchro lors de chaque modif).
 *
 * ⚠️ Source de vérité : __tests__/helpers/adresse-parser.js
 */
(function(global) {
  'use strict';

  function parseAdresse(adr) {
    if (!adr || typeof adr !== 'string') return { rue: '', codePostal: '', ville: '' };
    const s = adr.trim();
    if (!s) return { rue: '', codePostal: '', ville: '' };

    const cpRegex = /(?:^|[\s,;])(\d{5})(?:[\s,;]|$)/;
    const m = s.match(cpRegex);

    if (!m) {
      return { rue: s, codePostal: '', ville: '' };
    }

    const cp = m[1];
    const cpIdx = m.index + m[0].indexOf(cp);
    const before = s.slice(0, cpIdx).trim();
    const after = s.slice(cpIdx + 5).trim();

    const rue = before.replace(/[,;\s]+$/, '').trim();
    const ville = after.replace(/^[,;\s]+/, '').replace(/\s+/g, ' ').trim();

    return { rue: rue, codePostal: cp, ville: ville };
  }

  function formatAdresse(imm) {
    if (!imm || typeof imm !== 'object') return '';
    const rue = (imm.adr || '').trim();
    const cp = (imm.codePostal || '').trim();
    const ville = (imm.ville || '').trim();

    if (!rue && !cp && !ville) return '';
    if (!cp && !ville) return rue;

    const parts = [];
    if (rue) parts.push(rue);
    const cpVille = [cp, ville].filter(Boolean).join(' ').trim();
    if (cpVille) parts.push(cpVille);
    return parts.join(', ');
  }

  function needsAddressSplit(imm) {
    if (!imm || typeof imm !== 'object') return false;
    if (imm.codePostal || imm.ville) return false;
    if (!imm.adr || typeof imm.adr !== 'string') return false;
    const r = parseAdresse(imm.adr);
    return !!r.codePostal;
  }

  global.AdresseParser = {
    parseAdresse: parseAdresse,
    formatAdresse: formatAdresse,
    needsAddressSplit: needsAddressSplit
  };
})(typeof window !== 'undefined' ? window : globalThis);
