// js/core/store-mapping.js — Mapping LEGACY → ligne de table relationnelle (pur).
//
// Fondation partagée de la direction ÉCRITURE du Store Supabase (P3) ET de l'ETL d'import :
// transforme un enregistrement au format legacy (objet du DB en mémoire) en une ligne de la
// table cible (colonnes typées + jsonb + legacy_id + legacy_raw). Fonctions PURES.
//
// ctx (injecté) :
//   espaceId, ownerId : valeurs posées sur chaque ligne.
//   detUuid(...parts) : uuid déterministe (même (collection,clé) → même uuid → upsert idempotent).
//   entiteByNom / immeubleByNom / logementByRef : Map PLATE clé(legacy)→uuid (resolvers FK).
//     ⚠️ `.get(clé)` renvoie DIRECTEMENT l'uuid (PAS un objet {uuid,…}). Construites depuis le
//     DB en mémoire au runtime (ou depuis l'export à l'import).
//   documentByLegacy : Map (legacy doc id) → uuid (pour pj_document_id).
//
// Renvoie la ligne (objet col→valeur) ou `null` si une colonne NOT NULL ne peut être remplie
// (résolution FK manquante, champ requis absent) → l'appelant SKIP + journalise.

const norm = s => String(s == null ? '' : s).trim().toLowerCase()
const num = x => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null }
// jsonb : passer la VALEUR telle quelle (objet/array/null). supabase-js (PostgREST) l'encode en jsonb ;
// pré-stringifier ici la doublerait (la colonne jsonb recevrait une string "{…}" au lieu d'un objet,
// → hydrate relirait une string). NB : l'ETL pg a son propre jb (stringify, correct pour node-postgres
// qui parse le texte en jsonb) ; ici c'est le chemin APP via supabase-js.
const jb = x => (x == null ? null : x)
function ts(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') { const ms = v > 1e11 ? v : v > 1e9 ? v * 1000 : null; return ms ? new Date(ms).toISOString() : null }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) { const d = new Date(v); return isNaN(d) ? null : d.toISOString() }
    if (/^\d{9,13}$/.test(v)) { const n = +v, ms = n > 1e11 ? n : n * 1000; return new Date(ms).toISOString() }
    const d = new Date(v); return isNaN(d) ? null : d.toISOString()
  }
  return null
}
const dateOnly = v => { const i = ts(v); return i ? i.slice(0, 10) : (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null) }
const base = (o, ctx) => ({ espace_id: ctx.espaceId, created_by: ctx.ownerId, legacy_raw: jb(o) })

const MAPPERS = {
  entites(o, ctx) {
    if (!o.nom || !String(o.nom).trim()) return null
    return { id: ctx.detUuid('entite', norm(o.nom)), legacy_id: String(o.id ?? ''), nom: o.nom, type: o.type ?? null, siren: o.siren ?? null, rcs: o.rcs ?? null, gerant: o.gerant ?? null, gerants: jb(o.gerants ?? []), siege: o.siege ?? null, iban: o.iban ?? null, bic: o.bic ?? null, email_envoi: o.emailEnvoi ?? null, signature: jb(o.signature ?? null), logo: o.logo ?? null, drive_folder_id: o.driveFolderId ?? null, ...base(o, ctx) }
  },
  immeubles(o, ctx) {
    const ent = ctx.entiteByNom.get(norm(o.__entiteNom)); if (!ent) return null
    if (!o.nom || !String(o.nom).trim()) return null
    return { id: ctx.detUuid('immeuble', norm(o.nom)), entite_id: ent, legacy_id: String(o.id ?? ''), nom: o.nom, adresse: o.adr ?? null, ...base(o, ctx) }
  },
  logements(o, ctx) {
    const ent = ctx.entiteByNom.get(norm(o.entity)); if (!ent) return null
    if (!o.ref || !String(o.ref).trim()) return null
    const imm = o.imm ? ctx.immeubleByNom.get(norm(o.imm)) : null
    return { id: ctx.detUuid('logement', norm(o.ref)), entite_id: ent, immeuble_id: imm ?? null, legacy_id: String(o.id ?? ''), ref: o.ref, type: o.type ?? null, type_usage: o.typeUsage ?? null, surface: num(o.surf), etage: o.etage ?? null, num_apt: o.numApt ?? null, adresse: o.adr ?? null, npp: o.npp ?? null, tantiemes: o.tantiemes != null ? String(o.tantiemes) : null, lot: o.lot ?? null, num_fiscal: o.numFiscal ?? null, loyer_hc_ref: num(o.loyerHcRef), charges_ref: num(o.chargesRef), chauffage: jb(o.chauffage ?? null), ecs: jb(o.ecs ?? null), diagnostics: jb(o.diagnostics ?? null), equipements: jb(o.equipements ?? null), mobilier: jb(o.mobilier ?? null), presentation: jb(o.presentation ?? null), drive_folders: jb(o.driveFolders ?? null), legacy_bail: jb({ locataire: o.locataire ?? null, hc: o.hc ?? null, ch: o.ch ?? null, dg: o.dg ?? null, irl: o.irl ?? null, debut: o.debut ?? null, fin: o.fin ?? null }), ...base(o, ctx) }
  },
  documents(o, ctx) {
    let pid = null
    if (o.parentType === 'logement') pid = ctx.logementByRef.get(norm(o.parentRef)) || (o.logRef ? ctx.logementByRef.get(norm(o.logRef)) : null)
    else if (o.parentType === 'immeuble') pid = ctx.immeubleByNom.get(norm(o.parentRef)) || null
    else if (o.parentType === 'entite') pid = ctx.entiteByNom.get(norm(o.parentRef)) || null
    else if (o.parentType === 'mouvement') pid = o.parentId != null ? ctx.detUuid('mouvement', String(o.parentId)) : null
    return { id: ctx.detUuid('document', String(o.id)), legacy_id: String(o.id ?? ''), name: o.name ?? null, mime: o.mime ?? null, size: num(o.size), idb_key: o.idbKey ?? null, drive_file_id: o.driveFileId ?? null, parent_type: o.parentType ?? null, parent_id: pid, ...base(o, ctx) }
  },
  mouvements(o, ctx) {
    const d = dateOnly(o.date); if (!d) return null
    let log = null, ent = null; const q = String(o.qui ?? '')
    if (q.startsWith('SCI:')) ent = ctx.entiteByNom.get(norm(q.slice(4))) || null
    else log = ctx.logementByRef.get(norm(q)) || null
    const imm = o.imm ? ctx.immeubleByNom.get(norm(o.imm)) || null : null
    const pj = o.pjId != null && ctx.documentByLegacy.has(String(o.pjId)) ? ctx.documentByLegacy.get(String(o.pjId)) : null
    return { id: ctx.detUuid('mouvement', String(o.id)), legacy_id: String(o.id ?? ''), date_mouvement: d, libelle: o.lib ?? null, immeuble_id: imm, categorie: o.cat ?? null, logement_id: log, entite_id: log ? null : ent, debit: num(o.db) ?? 0, credit: num(o.cr) ?? 0, facture: o.fac ?? null, compteur_cc_id: o.compteurCcId ?? null, pj_document_id: pj, ...base(o, ctx) }
  },
  quittances(o, ctx) {
    const log = ctx.logementByRef.get(norm(o.logement)); if (!log) return null
    if (!o.mois) return null
    return { id: ctx.detUuid('quittance', String(o.id)), legacy_id: String(o.id ?? ''), logement_id: log, entite_id: ctx.entiteByNom.get(norm(o.entity)) || null, locataire: o.locataire ?? null, mois: o.mois, hc: num(o.hc) ?? 0, ch: num(o.ch) ?? 0, date_paiement: dateOnly(o.datePaiement), date_quittance: dateOnly(o.date), ...base(o, ctx) }
  },
  baux(o, ctx) {
    const log = ctx.logementByRef.get(norm(o.__key)); if (!log) return null
    const sig = o.signatures && o.signatures.signedAt ? o.signatures : null
    return { id: ctx.detUuid('bail', norm(o.__key)), legacy_ref: o.__key, logement_id: log, entite_id: ctx.entiteByNom.get(norm(o.entity)) || null, type_bail: null, hc: num(o.hc), ch: num(o.ch), dg: num(o.dg), jour_paiement: num(o.jpay), date_debut: dateOnly(o.debut), date_fin: dateOnly(o.fin), date_fin_effective: dateOnly(o.finEffective), locataires: jb(o.locataires ?? []), garants: jb(o.signataires ?? null), signatures: jb(o.signatures ?? null), signed_at: sig ? ts(sig.signedAt) : null, notes: o.notes ?? null, quitt_auto_gen: !!o.quittAutoGen, ...base(o, ctx) }
  },
  baux_historique(o, ctx) {
    // archived_at est NOT NULL ; fallback déterministe (jamais null, jamais clock-dépendant) —
    // identique à l'ETL import.mjs. La CLÉ d'id reste `ref|_archivedAt??''` (matche les rows importées).
    const archived_at = ts(o._archivedAt) || ts(o._modifiedAt) || '1970-01-01T00:00:00.000Z'
    return { id: ctx.detUuid('bailhist', String(o.ref ?? '') + '|' + (o._archivedAt ?? '')), legacy_ref: o.ref ?? null, logement_id: ctx.logementByRef.get(norm(o.ref)) || null, entite_id: ctx.entiteByNom.get(norm(o.entity)) || null, archived_at, bail_snapshot: jb(o), ...base(o, ctx) }
  },
  edl(o, ctx) {
    const log = ctx.logementByRef.get(norm(o.logement)); if (!log) return null
    let te = o.type ?? o.ltype ?? null; if (te && !['Entrée', 'Sortie'].includes(te)) te = null
    const sig = o.signatures && o.signatures.signedAt ? o.signatures : null
    return { id: ctx.detUuid('edl', String(o.id)), legacy_id: String(o.id ?? ''), logement_id: log, type_edl: te, date_edl: dateOnly(o.date), identite: jb({ locataire: o.locataire ?? null, bailleur: o.bailleurNom ?? null }), pieces: jb(o.pieces ?? []), compteurs: jb(o.compteurs ?? null), compteurs_sortie: jb(o.compteursSortie ?? null), compteurs_photos: jb(o.compteursPhotos ?? null), chauffage: jb(o.chauffage ?? null), technologies: jb(o.technologies ?? null), cles: jb(o.cles ?? null), daaf: jb(o.daaf ?? null), mobilier: jb(o.mobilier ?? null), signed_at: sig ? ts(sig.signedAt) : null, signatures: jb(o.signatures ?? null), ...base(o, ctx) }
  },
  assurances(o, ctx) {
    return { id: ctx.detUuid('assurance', String(o.id)), legacy_id: String(o.id ?? ''), logement_id: ctx.logementByRef.get(norm(o.logement)) || null, compagnie: o.compagnie ?? null, num_contrat: o.numContrat ?? null, echeance: o.echeance != null ? String(o.echeance) : null, prime: num(o.prime), locataire: o.locataire ?? null, notes: o.notes ?? null, ...base(o, ctx) }
  },
  agenda(o, ctx) {
    return { id: ctx.detUuid('agenda', String(o.id)), legacy_id: String(o.id ?? ''), entite_id: ctx.entiteByNom.get(norm(o.entite)) || null, immeuble_id: ctx.immeubleByNom.get(norm(o.immeuble)) || null, logement_id: ctx.logementByRef.get(norm(o.logement)) || null, titre: o.titre ?? null, date_evt: dateOnly(o.date), date_fin: dateOnly(o.dateFin), categorie: o.cat ?? null, couleur: o.couleur ?? null, done: !!o.done, rappels: jb(o.rappels ?? null), recurrence: jb(o.recurrence ?? null), notes: o.notes ?? null, ...base(o, ctx) }
  },
}

export function mapToRow(collection, rec, ctx) {
  const m = MAPPERS[collection]
  if (!m) throw new Error('mapToRow: collection inconnue ' + collection)
  return m(rec, ctx)
}

export const MAPPED_COLLECTIONS = Object.keys(MAPPERS)
