/**
 * core/preserve-fields.js — « aucun champ laissé derrière » (audit BIENS, constats C2 / I5).
 *
 * PROBLÈME DE FOND. Plusieurs modales enregistrent en RECONSTRUISANT l'objet de zéro depuis le
 * formulaire (`const im = { id, nom, adr, … }`), puis en remplaçant l'ancien : `ent.immeubles[i] = im`.
 * Tout champ qui n'a pas d'input dans cette modale disparaît alors SANS TOMBSTONE et SANS UNDO.
 * Vécu : `saveImm` ne reportait pas `compteursCollectifs` — le SEUL stockage des compteurs
 * collectifs, de leurs relevés et de leurs factures. Ouvrir « Modifier l'immeuble » puis
 * enregistrer effaçait toutes les charges communes de l'immeuble. Idem `contenance`,
 * `surfaceTotale`, les tombstones, et côté bailleur `capital` et le tag multi-espace `_espaceId`
 * (un immeuble d'une SCI partagée serait reparti dans le mauvais espace).
 *
 * RÈGLE DU PROJET, appliquée mécaniquement ici : on retire des ÉCRANS, jamais des DONNÉES. Un
 * champ absent du formulaire garde sa valeur. Le correctif est GÉNÉRIQUE volontairement : énumérer
 * les champs à sauver laisse repasser le bug au prochain champ ajouté ailleurs — c'est exactement
 * ce qui s'est produit ici (`_espaceId` était protégé nommément, ses voisins non).
 *
 * Le code inline d'index.html porte un SHADOW IDENTIQUE (file:// ne charge pas les ES modules) —
 * __tests__/helpers/preserve-fields.test.js vérifie la non-divergence.
 */

export function _preserverChampsExistants(reconstruit, existant) {
  if (!reconstruit || typeof reconstruit !== 'object') return reconstruit;
  if (!existant || typeof existant !== 'object') return reconstruit;
  var BAD = ['__proto__', 'constructor', 'prototype'];
  Object.keys(existant).forEach(function (k) {
    if (BAD.indexOf(k) >= 0) return;
    if (Object.prototype.hasOwnProperty.call(reconstruit, k)) return;
    reconstruit[k] = existant[k];
  });
  return reconstruit;
}
