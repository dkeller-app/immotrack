// js/core/rename-immeuble.js — Cœur PUR du renommage d'un immeuble (immeuble.nom).
//
// Le lien logement↔immeuble n'est PAS un id : c'est le NOM (string). `logement.imm === immeuble.nom`,
// et les vues groupent par ce nom (« Logements isolés » quand ça ne matche plus). Idem `mouvement.imm`,
// `agenda.immeuble`, `documents{parentType:'immeuble'}.parentRef`, et les clés `regulValidations`
// « <nom immeuble>|<du>|<au> ». Renommer l'immeuble SANS propager oldNom→newNom ORPHELINE tous ses
// logements (bug observé v15.483 : rename immeuble → 6 lots « isolés »). Ce module fait la propagation,
// jumeau de rename-logement.js pour les biens.
//
// ⚠️ SCOPÉ PAR ESPACE (multi-espace) : l'id de ligne d'un immeuble = detUuid(owner,'immeuble',norm(nom))
// → un nom d'immeuble est unique DANS un espace, mais DEUX espaces peuvent porter le même (ex. la SCI
// SMARTOSAURUS partagée par Marion + l'archive homonyme de Didier). La propagation ne touche QUE les
// records du MÊME espace que l'immeuble renommé (`_espaceId` posé par le store multi à l'hydrate ;
// mono-espace = aucun tag → null === null → tout matche, comportement inchangé).

const norm = s => String(s == null ? '' : s).trim().toLowerCase()
const espOf = x => (x && x._espaceId != null) ? x._espaceId : null

// Validation anti-collision : le nouveau nom ne doit pas être DÉJÀ porté par un AUTRE immeuble du MÊME
// espace (même nom → même uuid déterministe → fusion silencieuse de deux immeubles). Renvoie {ok,error}.
export function validateNewImmNom(db, oldNom, newNom, espaceId) {
  const nn = norm(newNom)
  if (!nn) return { ok: false, error: 'Nom d\'immeuble requis' }
  if (nn === norm(oldNom)) return { ok: true }                       // inchangé → rien à valider
  const scope = espaceId != null ? espaceId : null
  const clash = (db.entites || []).some(e =>
    Array.isArray(e && e.immeubles) &&
    e.immeubles.some(im => im && !im._deleted && espOf(im) === scope && norm(im.nom) === nn))
  return clash ? { ok: false, error: 'Un immeuble porte déjà ce nom dans cet espace' } : { ok: true }
}

// Propage le renommage sur toutes les RÉFÉRENCES par nom (l'objet immeuble lui-même est mis à jour par
// l'appelant = saveImm). Scopé à `opts.espaceId` (l'espace de l'immeuble renommé). `opts.stamp` horodate
// (défaut : pose `_modifiedAt` → le diff de sync repère le changement). Renvoie { touched, breakdown }.
export function renameImmeubleRefs(db, oldNom, newNom, opts = {}) {
  const stamp = opts.stamp || (x => { if (x) x._modifiedAt = new Date().toISOString(); return x })
  const scope = opts.espaceId != null ? opts.espaceId : null
  const on = norm(oldNom)
  if (!db || on === norm(newNom)) return { touched: 0, breakdown: {} }
  const inScope = x => espOf(x) === scope
  let touched = 0; const breakdown = {}
  const bump = k => { touched++; breakdown[k] = (breakdown[k] || 0) + 1 }

  ;(db.logements || []).forEach(l => { if (l && !l._deleted && inScope(l) && norm(l.imm) === on) { l.imm = newNom; stamp(l); bump('logement') } })
  ;(db.mouvements || []).forEach(m => { if (m && !m._deleted && inScope(m) && norm(m.imm) === on) { m.imm = newNom; stamp(m); bump('mouvement') } })
  ;(db.agenda || []).forEach(ev => { if (ev && !ev._deleted && inScope(ev) && norm(ev.immeuble) === on) { ev.immeuble = newNom; stamp(ev); bump('agenda') } })
  ;(db.documents || []).forEach(d => { if (d && !d._deleted && inScope(d) && d.parentType === 'immeuble' && norm(d.parentRef) === on) { d.parentRef = newNom; stamp(d); bump('document') } })

  // regulValidations : objet du BLOB config keyé « <nom immeuble>|<du>|<au> » → renommer le segment
  // immeuble de chaque clé concernée. Config = espace PROPRE uniquement (store-multi ne fusionne pas la
  // config des tiers) → pas de tag à filtrer ; on ne re-keye que si un renommage own est en jeu (scope
  // null) OU si la clé matche (un rename tiers n'a pas ses regul chargées → boucle vide, no-op).
  if (db.regulValidations && typeof db.regulValidations === 'object') {
    for (const k of Object.keys(db.regulValidations)) {
      const i = k.indexOf('|')
      const immPart = i === -1 ? k : k.slice(0, i)
      if (norm(immPart) === on) {
        const nk = newNom + (i === -1 ? '' : k.slice(i))
        if (nk !== k) { db.regulValidations[nk] = db.regulValidations[k]; delete db.regulValidations[k]; bump('regulValidation') }
      }
    }
  }
  return { touched, breakdown }
}
