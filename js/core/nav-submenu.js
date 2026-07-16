/**
 * core/nav-submenu.js — Modèle de rendu d'un sous-menu de sidebar (chantier NAV-SOUS-MENUS).
 *
 * Décide PUREMENT, pour un onglet de nav donné, s'il doit s'afficher comme un lien simple
 * ou comme un groupe dépliable avec ses sous-pages, à partir de :
 *   - le groupe (_NAV_GROUPS[x]) auquel l'onglet appartient (ou null s'il est autonome),
 *   - la page courante,
 *   - l'ensemble des pages visibles selon le menu perso (onSet),
 *   - l'ensemble des groupes actuellement dépliés (openSet, clés = 1re page-enfant du groupe).
 *
 * Règles :
 *   - onglet autonome (pas de groupe) → { kind:'link' } ;
 *   - un enfant masqué par le menu perso disparaît (sauf s'il EST la page courante) ;
 *   - si < 2 enfants restent visibles → { kind:'link' } (le parent redevient un lien simple,
 *     cohérent avec _navSubtabsHtml qui masque la barre à < 2 onglets) ;
 *   - sinon { kind:'group' } avec parentActive (page courante ∈ groupe), open (∈ openSet)
 *     et la liste des enfants { id, lb, active }.
 *
 * Sans DOM ni localStorage → testable (Vitest). Le shadow inline dans index.html est identique.
 */
export function navSubmenuModel(navId, group, page, onSet, openSet) {
  if (!group || !Array.isArray(group.tabs)) return { kind: 'link' };
  const groupKey = group.tabs[0][0];
  const children = group.tabs.filter(t => onSet.has(t[0]) || t[0] === page);
  if (children.length < 2) return { kind: 'link' };
  return {
    kind: 'group',
    groupKey,
    parentActive: group.tabs.some(t => t[0] === page),
    open: openSet.has(groupKey),
    children: children.map(t => ({ id: t[0], lb: t[1], active: t[0] === page }))
  };
}
