// js/core/entite-doublon.js — Détection des bailleurs (entités) en double. Module PUR.
//
// Pourquoi : l'app relie logements, baux, quittances et mouvements à leur bailleur par le NOM
// (`l.entity === e.nom`). Deux bailleurs homonymes deviennent indiscernables et leurs données se
// mélangent (incident réel 28/09 : deux « SCI SMARTOSAURUS », l'une partagée par un associé, l'autre
// copie privée → 12 biens affichés au lieu de 6). En multi-espace, DB.entites contient les bailleurs
// de TOUS les espaces visibles : la recherche porte sur l'ensemble.
//
// Source unique pour : saveEnt (fiche bailleur) et l'import d'acte (_acteFindDupEntity).

// Même normalisation que la saisie du nom dans saveEnt (NFC, tirets typographiques, espaces
// insécables, espaces multiples) + casse : deux noms « identiques à l'œil » sont un doublon.
export function normNomEntite(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// SIREN d'une saisie : 9 chiffres (SIREN) ou 14 (SIRET → ses 9 premiers). Toute autre longueur → ''
// (saisie incomplète : on ne fabrique pas de faux doublon).
export function sirenDe(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '')
  if (d.length === 9) return d
  if (d.length === 14) return d.slice(0, 9)
  return ''
}

// Cherche un autre bailleur VIVANT de même nom et/ou de même SIREN que `cand` ({nom, siren}).
// `self` = l'objet en cours d'édition, exclu PAR RÉFÉRENCE (les ids legacy peuvent coïncider
// entre deux espaces). Renvoie { nom: entité|null, siren: entité|null }.
export function trouverDoublonEntite(entites, cand, self) {
  const out = { nom: null, siren: null }
  if (!Array.isArray(entites) || !cand) return out
  const n = normNomEntite(cand.nom), s = sirenDe(cand.siren)
  for (const e of entites) {
    if (!e || e === self || e._deleted) continue
    if (!out.nom && n && normNomEntite(e.nom) === n) out.nom = e
    if (!out.siren && s && sirenDe(e.siren) === s) out.siren = e
  }
  return out
}
