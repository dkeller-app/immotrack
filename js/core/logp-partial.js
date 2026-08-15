/**
 * P0-1 (chantier BIENS) — merge PARTIEL par chemin pointé.
 *
 * Pourquoi : _logpReadFromForm() lisait tout le formulaire logement par el(id) et
 * renvoyait '' / false quand l'input n'existait pas dans le DOM ; saveParamLog
 * réaffectait ensuite sans condition. Retirer ou déplacer un pane effaçait donc en
 * silence log.presentation, log.quartier, log.locationInfo, log.dgRef, log.irlRef —
 * et imm.equipementsCommuns de l'immeuble parent, réécrit à chaque enregistrement
 * d'un logement (fil rouge de création compris, qui enchaîne les créations).
 *
 * Contrat : `partial` est une carte { 'chemin.pointe': valeur }. Une clé ABSENTE
 * signifie « champ non présent dans le DOM » → la valeur stockée n'est pas touchée.
 * Une clé présente écrase (une case décochée doit bien passer à false).
 * Les segments dangereux (__proto__ / constructor / prototype) sont ignorés.
 *
 * Le code inline de index.html porte un SHADOW IDENTIQUE de cette fonction (file://
 * ne charge pas les ES modules) — le test logp-partial.test.js vérifie la non-divergence.
 */
export function _logpApplyPartial(target, partial) {
  if (!target || typeof target !== 'object') return target;
  if (!partial || typeof partial !== 'object') return target;
  var BAD = ['__proto__', 'constructor', 'prototype'];
  Object.keys(partial).forEach(function (path) {
    var val = partial[path];
    if (val === undefined) return;
    var segs = String(path).split('.').filter(Boolean);
    if (!segs.length) return;
    if (segs.some(function (s) { return BAD.indexOf(s) >= 0; })) return;
    var node = target;
    for (var i = 0; i < segs.length - 1; i++) {
      if (!node[segs[i]] || typeof node[segs[i]] !== 'object') node[segs[i]] = {};
      node = node[segs[i]];
    }
    node[segs[segs.length - 1]] = val;
  });
  return target;
}
