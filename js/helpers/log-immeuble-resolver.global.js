/**
 * log-immeuble-resolver.global.js — Wrapper browser (window.LogImmResolver)
 * (ARCHI-FICHES-UNIFIED Session 2 Commit 2, v15.213)
 *
 * Mirror du module ES `__tests__/helpers/log-immeuble-resolver.js`.
 * Dépend de window.AdresseParser (formatAdresse).
 *
 * ⚠️ Source de vérité : __tests__/helpers/log-immeuble-resolver.js
 *    Sync manuel à chaque modif (petit module).
 */
(function(global) {
  'use strict';

  function _formatAdresse(imm) {
    // Délégation à AdresseParser si chargé, fallback minimal sinon
    if (global.AdresseParser && typeof global.AdresseParser.formatAdresse === 'function') {
      return global.AdresseParser.formatAdresse(imm);
    }
    if (!imm) return '';
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

  function resolveAddressForLog(log, imm) {
    if (imm && (imm.codePostal || imm.ville || imm.adr)) {
      return {
        rue: (imm.adr || '').trim(),
        codePostal: (imm.codePostal || '').trim(),
        ville: (imm.ville || '').trim(),
        full: _formatAdresse(imm),
        source: 'imm'
      };
    }
    if (log && log.adr) {
      return {
        rue: (log.adr || '').trim(),
        codePostal: '', ville: '',
        full: (log.adr || '').trim(),
        source: 'log-legacy'
      };
    }
    return { rue: '', codePostal: '', ville: '', full: '', source: 'none' };
  }

  function resolvePeriodeConstrForLog(log, imm) {
    if (imm && imm.periodeConstr) return { value: imm.periodeConstr, source: 'imm' };
    if (log && log.periodeConstr) return { value: log.periodeConstr, source: 'log-legacy' };
    return { value: '', source: 'none' };
  }

  function resolveRegimeJuridiqueForLog(log, imm) {
    if (imm && imm.regimeJuridique) return { value: imm.regimeJuridique, source: 'imm' };
    if (log && log.regimeJuridique) return { value: log.regimeJuridique, source: 'log-legacy' };
    return { value: '', source: 'none' };
  }

  function resolveAnneeForLog(log, imm) {
    if (imm && +imm.annee) return { value: +imm.annee, source: 'imm' };
    if (log && +log.annee) return { value: +log.annee, source: 'log-legacy' };
    return { value: 0, source: 'none' };
  }

  function resolveEquipementsCommunsForLog(log, imm) {
    if (imm && imm.equipementsCommuns && typeof imm.equipementsCommuns === 'object') {
      return { equipements: imm.equipementsCommuns, source: 'imm' };
    }
    return { equipements: { customs: [] }, source: 'none' };
  }

  function resolveInheritedForLog(log, imm) {
    return {
      address: resolveAddressForLog(log, imm),
      periodeConstr: resolvePeriodeConstrForLog(log, imm),
      regimeJuridique: resolveRegimeJuridiqueForLog(log, imm),
      annee: resolveAnneeForLog(log, imm),
      equipementsCommuns: resolveEquipementsCommunsForLog(log, imm)
    };
  }

  function formatLogLocation(log) {
    if (!log) return '';
    const numApt = (log.numApt || '').toString().trim();
    const etage = log.etage;
    let etageLbl = '';
    if (etage !== '' && etage != null) {
      if (/^rdc/i.test(String(etage))) etageLbl = 'rez-de-chaussée';
      else {
        const n = parseInt(etage, 10);
        if (!Number.isNaN(n)) {
          if (n === 0) etageLbl = 'rez-de-chaussée';
          else if (n === 1) etageLbl = '1er étage';
          else etageLbl = n + 'e étage';
        }
      }
    }
    if (numApt && etageLbl) return 'Apt ' + numApt + ', ' + etageLbl;
    if (numApt) return 'Apt ' + numApt;
    if (etageLbl) return etageLbl;
    return '';
  }

  global.LogImmResolver = {
    resolveAddressForLog: resolveAddressForLog,
    resolvePeriodeConstrForLog: resolvePeriodeConstrForLog,
    resolveRegimeJuridiqueForLog: resolveRegimeJuridiqueForLog,
    resolveAnneeForLog: resolveAnneeForLog,
    resolveEquipementsCommunsForLog: resolveEquipementsCommunsForLog,
    resolveInheritedForLog: resolveInheritedForLog,
    formatLogLocation: formatLogLocation
  };
})(typeof window !== 'undefined' ? window : globalThis);
