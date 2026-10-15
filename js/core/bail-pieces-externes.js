/**
 * js/core/bail-pieces-externes.js — RETOURS 15/10 (lot 2, point 1) : un bail signé HORS Propryo a PLUSIEURS pièces
 * (au moins le bail et l'acte de cautionnement), chacune typée. Décisions de Didier du 15/10 :
 *   D1 — types : bail signé, acte de cautionnement (une pièce par garant inscrit au bail), avenant, annexe, autre (nommée) ;
 *        PDF ET photos acceptés (le contrôle du contenu reste celui de l'app : _pjTypeReel) ;
 *   D2 — « Je l'ai en papier » pour l'acte de cautionnement : la caution compte comme DÉTENUE.
 *
 * Stockage (inchangé dans son principe — jamais dans bail.signatures, la ligne cloud du bail est verrouillée) :
 *   - chaque pièce = un document DB.documents { nature:'bail-signe-externe', piece, garantIdx?, pieceLibelle?,
 *     bailSignedAt, bailDebut } ; un document SANS `piece` (déposé avant ce lot) est le bail signé — migré au démarrage
 *     par `migrerPiecesExternes` (règle projet : migrer, pas tolérer) ;
 *   - « détenu en papier » = DB.bailPiecesPapier[cleBail(ref, bail)]['caution:N'] = { at, par } (configuration de
 *     l'espace, comme DB.equipements). La clé suit le BAIL (logement + date de début), pas la déclaration : re-dater la
 *     signature ne fait pas perdre l'acte papier.
 *
 * Prédicat pour l'Accueil (la matrice est refaite par un autre chantier, ce module ne la touche pas) :
 *   cautionDetenue({ bail, pieces, papier }) / etatCaution(...)
 */

export const NATURE = 'bail-signe-externe'

export const PIECE_TYPES = [
  { k: 'bail', l: 'Bail signé' },
  { k: 'caution', l: 'Acte de cautionnement' },
  { k: 'avenant', l: 'Avenant' },
  { k: 'annexe', l: 'Annexe au bail' },
  { k: 'autre', l: 'Autre pièce' },
]
const TYPES = new Set(PIECE_TYPES.map(t => t.k))
const ORDRE = { bail: 0, caution: 1, avenant: 2, annexe: 3, autre: 4 }

/** Type d'une pièce ; un document sans type (avant ce lot) est le bail signé. */
export function pieceDe(doc) {
  return doc && TYPES.has(doc.piece) ? doc.piece : 'bail'
}

/** Garants inscrits au bail (legacy à plat : garant, garant2), dans l'ordre, avec leur rang (1, 2). */
export function garantsDuBail(bail) {
  const b = bail || {}
  return [[1, b.garant], [2, b.garant2]]
    .map(([idx, nom]) => ({ idx, nom: String(nom == null ? '' : nom).trim() }))
    .filter(g => g.nom)
}

/** Libellé lisible d'une pièce. */
export function libellePiece(doc, garants) {
  const p = pieceDe(doc)
  if (p === 'caution') {
    const g = (Array.isArray(garants) ? garants : []).find(x => Number(x.idx) === Number(doc && doc.garantIdx))
    return 'Acte de cautionnement' + (g ? ' — ' + g.nom : '')
  }
  if (p === 'autre') return String((doc && doc.pieceLibelle) || '').trim() || 'Autre pièce'
  if ((p === 'avenant' || p === 'annexe') && doc && String(doc.pieceLibelle || '').trim()) return String(doc.pieceLibelle).trim()
  return (PIECE_TYPES.find(t => t.k === p) || PIECE_TYPES[0]).l
}

/** Emplacement unique d'une pièce (bail, caution de tel garant) ; null pour les pièces multiples (avenant, annexe, autre). */
export function emplacement(piece, garantIdx) {
  if (piece === 'bail') return 'bail'
  if (piece === 'caution') return 'caution:' + (Number(garantIdx) || 1)
  return null
}
export function emplacementDe(doc) {
  return emplacement(pieceDe(doc), doc && doc.garantIdx)
}

/** Pièces d'UNE déclaration (même signedAt), vivantes, triées : bail, cautions (par garant), avenants, annexes, autres. */
export function piecesDeclaration(docs, signedAt) {
  if (!signedAt) return []
  return (Array.isArray(docs) ? docs : [])
    .filter(d => d && !d._deleted && d.nature === NATURE && d.bailSignedAt === signedAt)
    .slice()
    .sort((a, b) => (ORDRE[pieceDe(a)] - ORDRE[pieceDe(b)])
      || ((Number(a.garantIdx) || 0) - (Number(b.garantIdx) || 0))
      || String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || '')))
}

/** Le document occupant un emplacement unique (le plus récent s'il y en avait plusieurs). */
export function pieceA(pieces, piece, garantIdx) {
  const e = emplacement(piece, garantIdx)
  if (!e) return null
  const l = (Array.isArray(pieces) ? pieces : []).filter(d => emplacementDe(d) === e)
  return l.sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')))[0] || null
}

/** Clé du bail pour les pièces détenues en papier : logement (sans suffixe d'espace) + date de début. */
export function cleBail(ref, bail) {
  return String(ref == null ? '' : ref).split('@@')[0] + '|' + String((bail && bail.debut) || '')
}

/**
 * État de la caution d'un bail : 'na' (aucun garant inscrit), 'detenue' (chaque garant a son acte : fichier déposé ou
 * papier déclaré), 'partielle', 'absente'.
 * @param {{bail:object, pieces?:object[], papier?:object}} o — pieces = pièces de la déclaration courante ;
 *        papier = DB.bailPiecesPapier[cleBail(ref, bail)]
 */
export function etatCaution(o = {}) {
  const garants = garantsDuBail(o.bail)
  const papier = (o.papier && typeof o.papier === 'object') ? o.papier : {}
  const detail = garants.map(g => {
    const f = pieceA(o.pieces, 'caution', g.idx)
    const p = papier['caution:' + g.idx]
    return { idx: g.idx, nom: g.nom, source: f ? 'fichier' : (p ? 'papier' : null), doc: f || null, papier: p || null }
  })
  const n = detail.filter(g => g.source).length
  const etat = !garants.length ? 'na' : (n === garants.length ? 'detenue' : (n ? 'partielle' : 'absente'))
  return { etat, garants: detail }
}

/** Prédicat simple pour l'Accueil : chaque garant inscrit au bail a son acte de cautionnement (fichier ou papier). */
export function cautionDetenue(o = {}) {
  return etatCaution(o).etat === 'detenue'
}

/**
 * Migration (idempotente) : un document « bail signé hors Propryo » déposé avant ce lot n'a pas de `piece` → c'est le
 * bail signé. Rend les documents modifiés (l'appelant horodate et enregistre).
 */
export function migrerPiecesExternes(documents) {
  const out = []
  for (const d of Array.isArray(documents) ? documents : []) {
    if (!d || d._deleted || d.nature !== NATURE || TYPES.has(d.piece)) continue
    d.piece = 'bail'
    out.push(d)
  }
  return out
}
