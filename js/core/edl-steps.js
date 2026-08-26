/**
 * core/edl-steps.js — le PARCOURS DE L'EDL ENTIER (chantier EDL-TÉLÉPHONE, CDC §2.1/§2.2).
 *
 * La prod v15.545 n'a paginé QUE les pièces : les 8 sections administratives (6 884 px,
 * 63 % de la hauteur du téléphone) restaient empilées en permanence. Ce module fait de
 * CHAQUE section administrative une ÉTAPE au même titre qu'une pièce, dans l'ordre validé.
 *
 * Module PUR (ni DOM ni DB) : il répond à « quelles étapes, dans quel ordre, sous quel
 * libellé ? ». L'inline rend et masque ; ici on décide la LISTE. La navigation bornée
 * réutilise js/core/edl-parcours.js (indexClamp / suivante / …) — pas de doublon.
 *
 * Ordre validé (CDC §2.2) : Infos · Compteurs & équipements · Clés · Détecteur (DAAF) ·
 * [Mobilier — conditionnel, seulement si meublé, JAMAIS d'étape vide] · les 7 pièces ·
 * Observations + Signatures. Une seule étape à l'écran (invariant §2.10 nº2).
 */

/** Les étapes administratives fixes, dans l'ordre (hors pièces, hors fin, hors mobilier). */
export const ADMIN_HEAD = [
  { id: 'infos',     group: 'infos',     nom: 'Infos du logement' },
  { id: 'compteurs', group: 'compteurs', nom: 'Compteurs & équipements' },
  { id: 'cles',      group: 'cles',      nom: 'Clés remises' },
  { id: 'daaf',      group: 'daaf',      nom: 'Détecteur de fumée' },
];

/**
 * Construit la liste ordonnée des étapes de l'EDL.
 * @param {{mobilierEnabled?:boolean, pieceCount?:number, pieceNames?:string[]}} opts
 * @returns {Array<{id:string, group:string, kind:'admin'|'piece', nom:string, pieceIdx?:number}>}
 */
export function buildSteps(opts = {}) {
  const mobilierEnabled = !!opts.mobilierEnabled;
  const names = Array.isArray(opts.pieceNames) ? opts.pieceNames : [];
  const pieceCount = Number.isFinite(opts.pieceCount)
    ? Math.max(0, Math.trunc(opts.pieceCount))
    : names.length;

  const steps = ADMIN_HEAD.map(s => ({ ...s, kind: 'admin' }));

  // Mobilier : étape à part ENTIÈRE, mais seulement pour un logement meublé (pas d'étape
  // vide pour un logement nu — CDC §2.2). Placée juste après le DAAF, avant les pièces :
  // l'inventaire d'objets se remplit d'un même geste que les pièces qui suivent.
  if (mobilierEnabled) {
    steps.push({ id: 'mobilier', group: 'mobilier', kind: 'admin', nom: 'Inventaire mobilier' });
  }

  for (let i = 0; i < pieceCount; i++) {
    steps.push({
      id: 'piece:' + i, group: 'pieces', kind: 'piece', pieceIdx: i,
      nom: (names[i] != null && String(names[i]).trim()) ? String(names[i]) : ('Pièce ' + (i + 1)),
    });
  }

  steps.push({ id: 'fin', group: 'fin', kind: 'admin', nom: 'Observations + Signatures' });
  return steps;
}

/**
 * Décide si un nœud administratif de section doit être visible pour l'étape courante.
 * Cas particulier du MOBILIER (dual-home, invariant PC §2.9 : aucun déplacement du DOM) :
 *   - logement meublé  → la section mobilier n'est visible QUE sur l'étape « mobilier » ;
 *   - logement nu      → la section mobilier (réduite à son interrupteur « meublé ? ») est
 *     repliée dans l'étape « Infos » pour rester atteignable, sans créer d'étape vide.
 * @param {string} nodeGroup  le data-edl-step du nœud
 * @param {string} curGroup   le group de l'étape courante
 * @param {boolean} mobilierEnabled
 * @param {boolean} isMobilierSection  le nœud est-il #edl-mobilier-section ?
 */
export function sectionVisible(nodeGroup, curGroup, mobilierEnabled, isMobilierSection = false) {
  if (isMobilierSection) {
    return mobilierEnabled ? curGroup === 'mobilier' : curGroup === 'infos';
  }
  return nodeGroup === curGroup;
}

/** Libellé global du rail : « Étape 2 / 12 ». Borné, jamais de position hors plage. */
export function stepGlobalLabel(idx, total) {
  const n = Number(idx), t = Number(total);
  if (!Number.isFinite(n) || !Number.isFinite(t) || t <= 0) return '';
  const pos = Math.min(Math.max(n + 1, 1), t);
  return 'Étape ' + pos + ' / ' + t;
}

/** Index de la première étape « pièce » (ou -1). Sert à démarrer un parcours sur les pièces si voulu. */
export function firstPieceStep(steps) {
  const arr = steps || [];
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].kind === 'piece') return i;
  return -1;
}
