/**
 * Helpers d'échappement HTML pour innerHTML — SECU-INNERHTML Sprint 1A
 *
 * Source de vérité miroir de l'implémentation dans index-test.html (ligne 5699).
 * Les tests Vitest vérifient le contrat. Toute modification doit être portée dans les 2 fichiers.
 */

/**
 * Échappe une string pour injection HTML safe.
 * Convertit & " ' < > en entités. null/undefined → ''.
 */
export function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Alias existant dans index-test.html */
export const escHtml = _esc;

/**
 * Tag function template literal qui escape automatiquement chaque ${...}.
 * Pour injecter du HTML déjà-construit (composition), wrapper avec _raw(...).
 *
 * Usage :
 *   _h`<b>${user.nom}</b>`                  // escape user.nom
 *   _h`<div>${_raw(buildCardsHtml(items))}</div>`  // n'escape pas le HTML interne
 *   _h`${list.map(x => _h`<li>${x}</li>`).join('')}` → array auto-escapé
 */
export function _h(strings, ...values) {
  let r = '';
  for (let i = 0; i < strings.length; i++) {
    r += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === 'object' && v.__raw === true) {
        r += v.value;
      } else {
        r += _esc(v);
      }
    }
  }
  return r;
}

/**
 * Marqueur "trusted HTML" pour bypass volontaire de l'échappement dans _h.
 * À utiliser uniquement avec du HTML construit en interne (sous-templates) ou statique.
 * JAMAIS avec une string venant directement d'un input user.
 */
export function _raw(s) {
  return { __raw: true, value: String(s == null ? '' : s) };
}
