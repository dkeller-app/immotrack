// Re-export depuis la source unique js/core/utils.js (Sprint 2 ARCHI-MODULAR)
export { _isLoyerCategory, _isChargeRecupCategory } from '../../js/core/utils.js';

/** Helper test only : compte les mouvements qui matchent un filterFn donné. */
export function _countMatching(mouvements, filterFn) {
  return (mouvements || []).filter(filterFn).length;
}
