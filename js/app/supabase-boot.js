// js/app/supabase-boot.js — Orchestration AUTH + ESPACE + Store/Sync au-dessus d'un client supabase-js
// INJECTÉ. L'app lui passe le client chargé depuis le CDN ; les tests lui passent le client node
// @supabase/supabase-js → AUCUNE dépendance CDN ici, donc testable en intégration contre le vrai
// Postgres. Le câblage CDN + l'exposition window.ImmoSupabase vivent dans l'entrée (étape 2, index.html).
import { createSupabaseStore } from '../core/store-supabase.js'
import { createSupabaseAdapter } from '../core/store-supabase-adapter.js'
import { createStoreSync } from '../core/store-sync.js'
import { makeDetUuid } from '../core/det-uuid.js'

export function createBoot(client) {
  if (!client || !client.auth || typeof client.from !== 'function') throw new Error('createBoot: client supabase-js requis')
  let _store = null, _sync = null, _ctx = null

  // ── AUTH (Variante A : email/mdp d'abord, Google ensuite) ────────────────────
  async function loginEmail(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    return { ok: true, user: data.user }
  }
  async function loginGoogle(redirectTo) {
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: redirectTo ? { redirectTo } : undefined })
    return error ? { ok: false, error: error.message } : { ok: true }   // déclenche une redirection
  }
  async function sendPasswordReset(email, redirectTo) {
    const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
    return error ? { ok: false, error: error.message } : { ok: true }
  }
  // logout : FLUSH d'abord (pousse toute modif non encore synchronisée → pas de perte si l'utilisateur
  // se déconnecte juste après une modif), puis signOut + reset. L'app doit AUSSI annuler son timer de
  // debounce en attente (sinon un flush programmé tirerait après le reset). Best-effort (catch).
  async function logout() {
    try { if (_sync) await _sync.flush() } catch (_e) { /* réseau : la modif reste dans le cache local */ }
    await client.auth.signOut()
    _store = _sync = _ctx = null
  }
  async function currentUser() { const { data } = await client.auth.getUser(); return (data && data.user) || null }
  // onAuthChange : renvoie l'ABONNEMENT directement (appeler .unsubscribe() pour résilier). À appeler UNE
  // SEULE FOIS au boot de l'app et garder pour toute sa vie (ne PAS ré-abonner à chaque login → fuite).
  function onAuthChange(cb) {
    const { data } = client.auth.onAuthStateChange((_evt, session) => cb(session))
    return (data && data.subscription) || null
  }

  // ── ESPACE ───────────────────────────────────────────────────────────────────
  // Résout l'espace de l'utilisateur (1re appartenance visible par la RLS) ou en crée un.
  // ownerId (namespace detUuid + provenance) = OWNER de l'espace (`created_by`) = celui qui a établi
  // les ids (l'import P0-E) → les ids restent cohérents même si un gestionnaire (≠ owner) écrit.
  async function resolveEspace(defaultName = 'Mon patrimoine') {
    // .order déterministe (sans, limit(1) renvoie une ligne arbitraire si l'utilisateur a plusieurs
    // espaces → tenant chargé instable d'une session à l'autre). 1 espace aujourd'hui ; durcir
    // (sélecteur d'espace explicite) avant le vrai multi-espace.
    const { data, error } = await client.from('espaces').select('id, nom, created_by').order('created_at', { ascending: true }).limit(1)
    if (error) throw new Error('resolveEspace: ' + error.message)
    if (data && data.length) return { espaceId: data[0].id, ownerId: data[0].created_by, espaceNom: data[0].nom }
    const { data: created, error: e2 } = await client.rpc('create_espace', { p_nom: defaultName })
    if (e2) throw new Error('create_espace: ' + e2.message)
    return { espaceId: created.id, ownerId: created.created_by, espaceNom: created.nom }
  }

  // ── STORE + SYNC ───────────────────────────────────────────────────────────────
  // getDB = () => objet DB mémoire (window.DB) ; schedule(fn) = debounce app (setTimeout 800ms).
  function wireStore({ espaceId, ownerId, getDB, schedule, pageSize }) {
    if (!espaceId || !ownerId) throw new Error('wireStore: espaceId + ownerId requis')
    const adapter = createSupabaseAdapter(client, espaceId, pageSize ? { pageSize } : {})
    const detUuid = makeDetUuid(ownerId)
    _store = createSupabaseStore({ ...adapter, detUuid, espaceId, ownerId })
    _sync = createStoreSync({ store: _store, getDB, schedule })
    _ctx = { espaceId, ownerId }
    return { store: _store, sync: _sync }
  }

  async function hydrate() { if (!_store) throw new Error('hydrate: wireStore() d\'abord'); return _store.hydrate() }
  function seed(db) { if (_sync) _sync.seed(db) }              // baseline « déjà synchronisé » après hydrate
  function markDirty() { if (_sync) _sync.markDirty() }         // à brancher dans saveDB()
  async function flush(db) { return _sync ? _sync.flush(db) : null }

  return {
    loginEmail, loginGoogle, sendPasswordReset, logout, currentUser, onAuthChange,
    resolveEspace, wireStore, hydrate, seed, markDirty, flush,
    get store() { return _store }, get sync() { return _sync }, get ctx() { return _ctx },
  }
}
