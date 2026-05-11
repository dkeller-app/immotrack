/**
 * components/toast.js — Notifications transitoires (Sprint 2 Phase 2).
 *
 * Le toast est un élément #toast présent dans le DOM d'index-test.html.
 * showToast(msg, type, dur, extraHTML) affiche le toast pendant `dur` ms.
 *
 * Types : '' (info default), 'err' (rouge), 'ok' (vert), 'warn' (orange).
 *
 * extraHTML est ajouté tel quel après le msg échappé — utilisé pour le bouton
 * « ↶ Annuler » du système UNDO-OP v14.21.
 */

import { escHtml } from '../core/utils.js';

/**
 * @param {string} msg - Le message principal (sera échappé HTML)
 * @param {''|'err'|'ok'|'warn'} type - Type d'icone/couleur
 * @param {number} dur - Durée d'affichage en ms (défaut 2800)
 * @param {string} extraHTML - HTML brut additionnel (utiliser avec parcimonie)
 */
export function showToast(msg, type = '', dur = 2800, extraHTML = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = escHtml(msg) + (extraHTML || '');
  t.style.display = 'flex';
  t.style.alignItems = 'center';
  t.style.gap = '6px';
  t.style.color =
    type === 'err' ? 'var(--red)' :
    type === 'ok'  ? 'var(--grn)' :
    type === 'warn' ? 'var(--ora)' : 'var(--t1)';
  clearTimeout(window._toastTmr);
  window._toastTmr = setTimeout(() => t.style.display = 'none', dur);
}
