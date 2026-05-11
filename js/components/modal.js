/**
 * components/modal.js — Helpers d'ouverture/fermeture de modales (Sprint 2 Phase 2).
 *
 * Pattern existant dans index-test.html : les modales sont des éléments <div>
 * avec la classe `.hidden` initialement. openM('ov-X') retire .hidden,
 * closeM('ov-X') la rajoute.
 *
 * closeBg(e, id) : utilisé sur le wrapper @click="closeBg(event, 'ov-X')"
 * pour fermer la modale quand on clique en dehors du contenu.
 */

/** Affiche une modale par son id (retire .hidden). */
export function openM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

/** Masque une modale par son id (ajoute .hidden). */
export function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/** Helper pour click-outside : ferme uniquement si target = wrapper. */
export function closeBg(e, id) {
  const el = document.getElementById(id);
  if (e.target === el) closeM(id);
}

/** Wrapper simple sur window.confirm — utilisé pour confirm dialogs. */
export function confirm2(msg) {
  return window.confirm(msg);
}
