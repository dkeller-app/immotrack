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
 * Audit stockage lots 2-3 (🟠3) — téléphone : le toast se pose AU-DESSUS de la barre du bas
 * (css/main.css, ≤ 767 px : bottom = --bnav-h + 12 px). La hauteur RÉELLE de la barre varie
 * (favoris, pastille d'action, encoche : son padding comprend env(safe-area-inset-bottom)) ; elle
 * est mesurée à chaque toast et publiée en --bnav-h. Barre absente ou masquée : 0.
 * Ne lève jamais (un toast ne casse rien) : rend la hauteur, ou null si la mesure est impossible.
 */
export function syncHauteurBarreBas(doc = globalThis.document, win = globalThis.window) {
  try {
    const b = doc.querySelector('.v4-bnav');
    const h = (b && win.getComputedStyle(b).display !== 'none') ? Math.ceil(b.getBoundingClientRect().height) : 0;
    doc.documentElement.style.setProperty('--bnav-h', h + 'px');
    return h;
  } catch (_e) { return null; }
}

/**
 * @param {string} msg - Le message principal (sera échappé HTML)
 * @param {''|'err'|'ok'|'warn'} type - Type d'icone/couleur
 * @param {number} dur - Durée d'affichage en ms (défaut 2800)
 * @param {string} extraHTML - HTML brut additionnel (utiliser avec parcimonie)
 */
export function showToast(msg, type = '', dur = 2800, extraHTML = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  syncHauteurBarreBas();
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
