// js/core/store-sync.js — Moteur de synchronisation arrière-plan (cœur de l'Option C).
//
// À chaque sauvegarde, l'app écrit instantanément son cache local (localStorage) PUIS appelle
// markDirty() : ce module repère, en différentiel vs un instantané « déjà synchronisé », ce qui a
// changé/disparu, et le pousse dans Supabase LIGNE PAR LIGNE via le Store (concurrence `version`,
// jamais de perte). Le diff est fail-safe vers le SUR-envoi : une fausse différence ne fait qu'un
// upsert idempotent (gardé version), jamais d'omission (même contenu ⟺ même signature JSON).
//
// Dépendances INJECTÉES (testable offline) :
//   store   = { upsert(coll, rec)→{status}, remove(coll, rec)→{status} }  (createSupabaseStore)
//   getDB   = () => DB en mémoire (lu à chaque flush → reflète l'état courant)
//   schedule(fn) = (option) planifie un flush debouncé (app : setTimeout 800ms ; test : capture)
//
// Identité de diff par collection = la clé legacy NATURELLE (celle dont dérive l'id déterministe du
// mapping) : entites/immeubles par nom, logements par ref, baux par clé de map, le reste par id.
import { TABLE_COLLECTIONS } from './store-supabase.js'   // source unique des collections table-backées
import { bailContentHash } from './bail-content-hash.js'  // empreinte légale canonique des baux signés (verrou)

const norm = s => String(s == null ? '' : s).trim().toLowerCase()

// PÉRIMÈTRE de ce moteur = les collections adossées à une TABLE métier (11). Sont gérées AILLEURS,
// pas un oubli :
//   • config (params/categories/templates/irlTable/catConfig/piecesEDL/auditTrail/candidats/
//     compteursReleves) → espace_config.data (chemin de sync séparé, pièce 2).
//   • ⚠️ GAP SCHÉMA CONNU : `DB.assurances` = assurance BAILLEUR (PNO/GLI/lot copro, ≠ `mrh` =
//     MRH locataire). AUCUNE table Supabase aujourd'hui (la table `assurances` modélise `mrh`).
//     Vide dans les vraies données (0 ligne) → pas synchronisée ici À DESSEIN. À trancher en phase
//     schéma (table dédiée OU colonne discriminante) AVANT qu'un utilisateur saisisse une assurance
//     bailleur. NE PAS l'ajouter naïvement à COLLECTIONS (collision d'ids nid() avec `mrh` → même table).
//
// Collections poussées vers des TABLES, ORDONNÉES parent→enfant (la ligne parente doit exister
// côté Postgres avant l'insert d'un enfant : FK composite (parent_id, espace_id)).
const COLLECTIONS = [
  { coll: 'entites',         enumerate: db => db.entites || [],                         key: r => norm(r.nom) },
  // immeubles IMBRIQUÉS : héritent de la suppression du parent (nesting = appartenance structurelle).
  // delEnt tombstone l'entité mais préserve ses immeubles SANS `_deleted` → sans cette propagation,
  // l'immeuble partirait en upsert = ligne zombie vivante sous une entité supprimée. Robuste quel que
  // soit le chemin de suppression de l'app (défense en profondeur, indépendant de delEnt).
  { coll: 'immeubles',       enumerate: db => (db.entites || []).flatMap(e => (Array.isArray(e.immeubles) ? e.immeubles : []).map(im => ({ ...im, __entiteNom: e.nom, _deleted: !!(im && im._deleted) || !!(e && e._deleted) }))), key: r => norm(r.nom) },
  { coll: 'logements',       enumerate: db => db.logements || [],                       key: r => norm(r.ref) },
  // VERROU LÉGAL : `immutable` = un bail signé verrouillé. S'il est DÉJÀ verrouillé au baseline (déjà
  // synchronisé locked), le moteur ne le ré-upserte/supprime JAMAIS (le trigger DB refuserait → conflit).
  { coll: 'baux',            enumerate: db => Object.entries(db.baux || {}).map(([k, v]) => ({ __key: k, ...v })), key: r => norm(r.__key), immutable: r => !!(r && r.signatures && r.signatures.locked) },
  // ⚠️ clé = identité EXACTE du mapping (store-mapping baux_historique : detUuid('bailhist', ref + '|' + _archivedAt)).
  //    Keyer par `id` (non unique sur un log d'archive) regrouperait deux archives distinctes → perte silencieuse.
  { coll: 'baux_historique', enumerate: db => db.baux_historique || [],                 key: r => String(r.ref ?? '') + '|' + (r._archivedAt ?? '') },
  // documents AVANT mouvements : FK DURE mouvements_pj_fk (pj_document_id) → documents (la ligne
  // document doit exister avant l'insert d'un mouvement qui la référence). documents.parent_id est
  // polymorphe SANS FK dure → peut précéder ses parents sans violation. (Aligné sur l'ETL import.mjs.)
  { coll: 'documents',       enumerate: db => db.documents || [],                       key: r => String(r.id) },
  { coll: 'mouvements',      enumerate: db => db.mouvements || [],                       key: r => String(r.id) },
  { coll: 'quittances',      enumerate: db => db.quittances || [],                      key: r => String(r.id) },
  // ⚠️ EDL : `immutable` est prêt, MAIS il n'y a PAS de `sealSignedEdl` (cf. sealSignedBaux) → un EDL
  //    signé partirait NON verrouillé en base. Scellement EDL DIFFÉRÉ (hors-scope spec : 0 EDL signé
  //    aujourd'hui ; concept de verrou EDL non câblé). À compléter avant la 1ʳᵉ signature d'EDL.
  { coll: 'edl',             enumerate: db => db.edl || [],                             key: r => String(r.id), immutable: r => !!(r && r.signatures && r.signatures.locked) },
  { coll: 'mrh',             enumerate: db => db.mrh || [],                             key: r => String(r.id) },   // → table assurances
  { coll: 'agenda',          enumerate: db => db.agenda || [],                          key: r => String(r.id) },
]

const OK_UPSERT = new Set(['inserted', 'updated'])
const sig = rec => JSON.stringify(rec)   // signature de changement (sur-envoi sûr, jamais de sous-détection)
// L'app supprime par TOMBSTONE EN PLACE : le record RESTE dans la collection avec `_deleted:true`
// (jamais retiré de l'array). Même prédicat que l'ETL import.mjs (`isDel`). On EXCLUT les tombstones
// du « courant vivant » → un record passé live→tombstoné disparaît du courant → la branche removes
// (softDelete gardé par version) se déclenche. Sans ce filtre, le tombstone partirait en UPSERT et
// RESSUSCITERAIT la ligne côté Supabase (mapToRow ignore `_deleted`). Un record jamais synchronisé
// vivant puis tombstoné n'est ni au baseline ni au courant → ignoré (rien à supprimer côté serveur).
const isDeleted = rec => !!(rec && rec._deleted)

// VERROU LÉGAL (pièce 2) — SCELLEMENT au point UNIQUE de la sync : tout bail SIGNÉ (`signatures.signedAt`)
// pas encore scellé reçoit ici son empreinte canonique + le verrou, quelle que soit la VOIE de signature
// (présentiel / distance / futur) → un seul chokepoint, impossible de rater un chemin (≠ câbler chaque flux
// de signature dans index.html). Idempotent : un bail déjà scellé (hash + locked) est ignoré ; un hash
// existant n'est JAMAIS recalculé (immutabilité). Async (crypto.subtle) ; appelé AVANT le snapshot du flush
// → le diff voit l'état scellé et POSE le verrou ; les flushs suivants l'excluent (déjà locked, pièce 4).
async function sealSignedBaux(db) {
  for (const bail of Object.values((db && db.baux) || {})) {
    const sg = bail && bail.signatures
    if (!sg || !sg.signedAt) continue                  // pas signé → rien à sceller
    // ⚠️ C1 (audit 2026-06-16) : `bailleur-seul` = bail PARTIELLEMENT signé (bailleur OK, LOCATAIRE PAS
    // ENCORE — la Phase 2 où il signe arrive APRÈS). Le verrouiller figerait un état juridiquement
    // INCOMPLET et bloquerait/perdrait la signature du locataire. On ne scelle QUE les modes complets
    // (avec-locataire, distance, et les baux legacy déjà bilatéraux). `signedAt` ≠ « signé par tous ».
    if (sg.mode === 'bailleur-seul') continue
    if (sg.contentHashTerms && sg.locked) continue      // déjà scellé → idempotent
    if (!sg.contentHashTerms) sg.contentHashTerms = await bailContentHash(bail)   // empreinte figée (jamais recalculée)
    if (!sg.signatureSource) sg.signatureSource = 'immotrack'
    sg.locked = true
  }
}
// CONFIG = complément des tables : les collections non-tablées (params/categories/templates/irlTable/
// catConfig/piecesEDL/auditTrail/candidats/compteursReleves/assurances bailleur…) → un seul blob
// espace_config.data (chemin distinct du sync de table). Exclus : les collections table-backées
// (SOURCE UNIQUE importée de store-supabase, anti-drift) + `_modifiedAt` (interne, churn inutile).
// Le test « garde anti-drift » asserte que SYNCED_COLLECTIONS ≡ TABLE_COLLECTIONS (sinon perte silencieuse).
const CONFIG_EXCLUDED = new Set([...TABLE_COLLECTIONS, '_modifiedAt'])
export const SYNCED_COLLECTIONS = COLLECTIONS.map(c => c.coll)
const configSig = db => {
  const o = {}
  for (const k of Object.keys(db || {}).sort()) if (!CONFIG_EXCLUDED.has(k)) o[k] = db[k]
  return JSON.stringify(o)
}

export function createStoreSync({ store, getDB, schedule }) {
  if (!store || typeof store.upsert !== 'function' || typeof store.remove !== 'function')
    throw new Error('createStoreSync: store.upsert/remove requis')
  if (typeof getDB !== 'function') throw new Error('createStoreSync: getDB requis')

  // baseline = état « déjà synchronisé ». Map<coll, Map<key, { rec, sig }>>.
  const baseline = new Map()
  for (const { coll } of COLLECTIONS) baseline.set(coll, new Map())
  let _configSig = null   // signature du blob config déjà synchronisé (espace_config)

  function snapshotOf(db) {
    const snap = new Map()
    for (const { coll, enumerate, key, immutable } of COLLECTIONS) {
      const m = new Map()
      // `locked` = état d'immutabilité CAPTURÉ ici (booléen STABLE), pas relu via la référence `rec` : le
      // rec partage `signatures` avec le bail vivant (spread shallow) ; muter `signatures.locked` en place
      // changerait rétroactivement le baseline → la 1ʳᵉ transition de verrouillage serait sautée à tort.
      for (const rec of enumerate(db)) { if (isDeleted(rec)) continue; m.set(key(rec), { rec, sig: sig(rec), locked: immutable ? !!immutable(rec) : false }) }
      snap.set(coll, m)
    }
    return snap
  }

  // seed : capture le baseline depuis le DB courant (après hydrate → aucun diff au prochain flush).
  function seed(db = getDB()) {
    const snap = snapshotOf(db)
    for (const { coll } of COLLECTIONS) baseline.set(coll, snap.get(coll))
    _configSig = configSig(db)
  }

  // _doFlush : diffe le DB courant vs baseline, applique upserts (parent→enfant) puis removes
  // (enfant→parent), met à jour le baseline sur succès uniquement. Renvoie un résumé.
  // ⚠️ NE PAS appeler directement (réentrance) → passer par flush() qui SÉRIALISE.
  async function _doFlush(db) {
    const summary = { upserts: [], removes: [], conflicts: [], skipped: [] }
    await sealSignedBaux(db)                            // VERROU (pièce 2) : scelle les baux signés AVANT le diff
    const current = snapshotOf(db)

    // 1) upserts (ajouts + modifs), dans l'ordre parent→enfant.
    for (const { coll } of COLLECTIONS) {
      const cur = current.get(coll), base = baseline.get(coll)
      for (const [k, { rec, sig: s, locked: curLocked }] of cur) {
        const prev = base.get(k)
        if (prev && prev.sig === s) continue               // inchangé
        // VERROU : une ligne DÉJÀ verrouillée au baseline (`prev.locked`, figé au snapshot précédent) est
        // immuable → jamais ré-upsertée (le trigger refuserait → conflit). La 1ʳᵉ transition false→true
        // (baseline NON verrouillé) passe : c'est elle qui POSE le verrou.
        if (prev && prev.locked) continue
        const res = await store.upsert(coll, rec)
        const st = res && res.status
        if (OK_UPSERT.has(st)) { base.set(k, { rec, sig: s, locked: curLocked }); summary.upserts.push({ coll, key: k }) }
        else if (st === 'conflict') summary.conflicts.push({ coll, key: k })   // baseline inchangé → retry
        else summary.skipped.push({ coll, key: k })                            // skipped (FK non résolue) → retry
      }
    }

    // 2) removes (présents au baseline, absents du courant), dans l'ordre enfant→parent.
    for (let i = COLLECTIONS.length - 1; i >= 0; i--) {
      const { coll } = COLLECTIONS[i]
      const cur = current.get(coll), base = baseline.get(coll)
      for (const [k, { rec, locked }] of [...base]) {
        if (cur.has(k)) continue
        if (locked) continue                               // VERROU : un signé verrouillé (figé au baseline) ne se supprime pas
        const res = await store.remove(coll, rec)          // l'ANCIEN rec → résout l'id de ligne
        const st = res && res.status
        if (st === 'deleted') { base.delete(k); summary.removes.push({ coll, key: k }) }
        else if (st === 'conflict') summary.conflicts.push({ coll, key: k })
        else summary.skipped.push({ coll, key: k })
      }
    }

    // 3) config (collections non-tablées) → un seul blob espace_config, si changé. Une erreur
    // propage (comme un throw d'upsert) et n'avance PAS _configSig → réessai au prochain flush.
    if (typeof store.persistConfig === 'function') {
      const cs = configSig(db)
      if (cs !== _configSig) { await store.persistConfig(db); _configSig = cs; summary.config = 'written' }
    }
    return summary
  }

  // flush : SÉRIALISE les flush (anti-réentrance, audit C2). Un flush en vol n'est jamais doublé ; un
  // flush demandé pendant un autre attend la fin du précédent → lit `_versions`/baseline À JOUR (pas
  // de conflit de concurrence interne, donc pas de perte de modif quand 2 saves se chevauchent). Le DB
  // est relu (getDB) au moment où le run démarre → état frais. db explicite (tests) respecté.
  let _chain = Promise.resolve()
  function flush(db) {
    const p = _chain.then(() => _doFlush(db !== undefined ? db : getDB()))
    _chain = p.catch(() => {})   // la chaîne survit aux erreurs (un flush qui throw ne bloque pas les suivants)
    return p
  }

  // markDirty : programme un flush debouncé (le scheduler injecté gère le délai côté app).
  function markDirty() {
    if (typeof schedule === 'function') schedule(() => flush())
    return undefined
  }

  return { seed, flush, markDirty }
}
