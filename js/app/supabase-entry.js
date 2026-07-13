// js/app/supabase-entry.js — Entrée du MODE CLOUD (Supabase) du monolithe.
//
// CLOUD-ONLY (cutover « Connexion B », 2026-06-23) : Supabase est la SEULE persistance. Toute page servie
// en http(s) boote ici (login → hydrate → app). Le module reste INERTE uniquement sur le harnais de test
// (index-test*.html / ?sandbox=1), qui garde son storage local isolé _test_*. Google Drive a été retiré.
//
// ÉTAPE 2a (ce fichier) : login email/mdp (Variante A) → résout l'espace → HYDRATE les vraies données
// depuis Supabase dans une variable LOCALE → affiche les compteurs (preuve bout-en-bout dans le navigateur).
// Ne touche PAS window.DB ni le rendu (ça vient à l'étape 2b). Donc zéro interférence avec l'app derrière.

const FLAG = (() => {
  try {
    const path = (location.pathname || '').toLowerCase()
    const inSandbox = /[?&]sandbox=1/.test(location.search || '')
    const served = location.protocol === 'http:' || location.protocol === 'https:'
    // HARNAIS DE TEST — les pages index-test*.html / ?sandbox=1 restent en mode legacy/démo isolé
    // (storage local _test_*). Le module cloud y est INERTE : aucun login, aucun réseau. Même détection
    // que le boot-gate (head) et _isTestMode (index.html) → ne pas diverger.
    const isTestPage = path.endsWith('index-test.html') || path.endsWith('/test') || path.includes('-test.') || inSandbox
    if (isTestPage) return false
    // CLOUD-ONLY (cutover « Connexion B », 2026-06-23 — Google Drive PHYSIQUEMENT retiré) : toute page
    // servie en http(s) boote sur Supabase, sans échappatoire. Le bi-mode et le flag immo_use_supabase
    // sont supprimés (l'ancien `?supabase=0` / localStorage immo_use_supabase=0 n'a plus aucun effet).
    return served
  } catch { return false }
})()

// v15.437 FIX-CDN-VENDORED — client Supabase SELF-HOSTED (même origine github.io), plus de CDN runtime.
// Avant : import dynamique depuis esm.sh → sur un réseau d'entreprise qui bloque/filtre esm.sh (pare-feu,
// DNS, proxy), le boot échouait ou traînait pour TOUS les navigateurs → app cassée chez le client (démo).
// Désormais : fichier vendored `js/vendor/supabase-js-2.110.2.esm.js` (UMD officiel wrappé ESM, exposant
// { createClient }), servi par github.io comme le reste de l'app → aucune dépendance tierce au chargement.
// Régénérer : curl UMD `@supabase/supabase-js@<ver>/dist/umd/supabase.js` + wrapper ESM (voir en-tête du fichier).
const CDN = new URL('../vendor/supabase-js-2.110.2.esm.js', import.meta.url).href
const COUNTS = [
  ['entites', 'entités'], ['logements', 'logements'], ['baux', 'baux'], ['mouvements', 'mouvements'],
  ['quittances', 'quittances'], ['edl', 'états des lieux'], ['documents', 'documents'],
  ['mrh', 'assurances locataire'], ['agenda', 'agenda'], ['baux_historique', 'historique baux'],
]
const sizeOf = c => (Array.isArray(c) ? c.length : (c && typeof c === 'object' ? Object.keys(c).length : 0))

// DÉCOUPLAGE cloud↔Drive — espace courant (posé au login) pour résoudre les chemins Supabase Storage des
// fichiers : `<espaceId>/files/<idbKey>`. Lu par le helper window.__immoCloudFileUrl (ouverture de documents).
let _cloudEspaceId = null
let _cloudOwnerId = null  // owner de l'espace (posé au login) = namespace du detUuid → résout l'entite_id d'une SCI (chemin Storage par-SCI)
let _supaClient = null   // client supabase (posé au boot) — pour le canal Realtime de synchro live
let _makeDetUuid = null  // fabrique d'uuid déterministe (importée au boot) — pour window.__immoEntiteUuid
let _espaceOwners = {}   // MULTI-ESPACE : espaceId → ownerId (tous les espaces vus). Une SCI TIERS vit sous
//   l'espaceId de SON propriétaire et son entite_id se dérive avec LE detUuid de ce propriétaire → résolution
//   par-entité (jamais l'owner propre figé). Vide / un seul espace à N=1 → tout retombe sur l'espace propre.
let _liveDBRef = null    // réf vers le DB fusionné vivant (= liveDB), pour résoudre l'espace/owner d'une SCI
let _resolveEntiteOwner = null, _resolveEspaceOfSeg = null   // résolveurs PURS (store-multi.js) — résolution par-SCI

// BOOT-GATE — le <head> d'index.html pose `html[data-lpboot]` qui masque tout le body SAUF #imsb-overlay
// (+ #toast) le temps que ce module injecte l'overlay de login. Une fois l'overlay en place (ou l'app
// cloud révélée à onLoggedIn), on lève le gate en retirant l'attribut. Le portail Drive #ov-drive-connect
// a été PHYSIQUEMENT retiré (cutover « Connexion B ») → plus rien à masquer côté legacy.
function _liftDriveGate() {
  try { document.documentElement.removeAttribute('data-lpboot') } catch (e) {}
}

// #2 (test partage) — nom d'affichage PAR-UTILISATEUR (auth), pour un invité qui n'est pas le
// propriétaire de l'espace : metadata du compte sinon partie locale de l'email « jolifiée ».
function _displayNameFromUser(user) {
  if (!user) return ''
  const m = user.user_metadata || {}
  const meta = String(m.name || m.full_name || m.display_name || '').trim()
  if (meta) return meta
  const local = String(user.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim()
  if (!local) return ''
  return local.split(' ').map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(' ')
}

async function boot() {
  injectStyles()
  const overlay = injectOverlay()
  _liftDriveGate()   // mode cloud : pas de gate Drive (sinon il masque l'overlay de login)
  // v15.422 BUG-LOGIN-PREMIERE-CONNEXION — l'import du client peut échouer (réseau, fichier absent) :
  // avant, boot() mourait en silence (console) et le formulaire restait câblé sur la soumission native
  // → chaque tentative rechargeait la page. Désormais : erreur VISIBLE + bouton « Réessayer » propre.
  // v15.437 — la source est désormais le fichier vendored MÊME ORIGINE (github.io), plus esm.sh : ce
  // catch ne se déclenche donc plus sur un blocage CDN d'entreprise, seulement sur un vrai 404/déploiement.
  let createClient, createBoot
  try {
    ;({ createClient } = await import(/* @vite-ignore */ CDN))
    ;({ createBoot } = await import('./supabase-boot.js'))
  } catch (e) {
    console.error('[ImmoSupabase] import CDN/boot :', e)
    showError(overlay, 'Impossible de charger le service de connexion (réseau ?). Recharge la page pour réessayer.')
    const btn = overlay.querySelector('#imsb-submit')
    if (btn) { btn.disabled = false; btn.textContent = 'Recharger la page'; btn.type = 'button'; btn.onclick = () => location.reload() }
    return
  }
  const client = createClient(window.IMMO_SUPABASE.url, window.IMMO_SUPABASE.anonKey, {
    // AUCUNE session persistée : le mot de passe est redemandé à CHAQUE chargement (décision cutover
    // « re-saisir le mdp à chaque ouverture »). La session vit en mémoire pour le chargement courant
    // uniquement → un rechargement ou le bouton RETOUR ramène au login (compromis accepté).
    // detectSessionInUrl (défaut true) reste actif : SSO Google / reset mdp / invitation établissent la
    // session en mémoire au retour de redirection, pour le chargement courant.
    auth: { persistSession: false, autoRefreshToken: true },
  })
  _supaClient = client
  // Jeton de session Supabase (ES256) pour authentifier l'app auprès du worker de signature : le worker
  // le vérifie via JWKS (clé publique) → AUCUNE clé/secret dans le client. '' si pas de session.
  window.__immoSupaToken = async () => {
    try { const { data } = await client.auth.getSession(); return (data && data.session && data.session.access_token) || '' } catch (e) { return '' }
  }
  const api = createBoot(client)
  // Connexion D1 — hook de déconnexion global utilisé par le menu Compte de l'app (index.html).
  // FLUSH puis signOut (api.logout) → recharge la page : sans session persistée, on retombe sur le
  // login. Repli sûr : si logout échoue, on recharge quand même (la session n'est pas persistée).
  window.__immoLogout = async () => {
    window.__immoLoggingOut = true   // le SIGNED_OUT qui suit est VOULU → pas de bannière « session expirée »
    try { await api.logout() } catch (e) { console.warn('[Supabase] logout', e) }
    try { location.reload() } catch (e) {}
  }
  try { _makeDetUuid = (await import('../core/det-uuid.js')).makeDetUuid } catch (e) { console.warn('[Supabase] det-uuid', e) }
  try { const m = await import('../core/store-multi.js'); _resolveEntiteOwner = m.resolveEntiteOwner; _resolveEspaceOfSeg = m.resolveEspaceOfSeg } catch (e) { console.warn('[Supabase] store-multi resolvers', e) }

  const _normNom = s => String(s == null ? '' : s).trim().toLowerCase()
  // MULTI-ESPACE — délégation aux résolveurs PURS (store-multi.js, testés) : owner de l'espace où vit une SCI
  // (par nom) et espaceId d'un segment Storage. SCI TIERS → owner/espace tiers ; entité neuve / introuvable /
  // résolveur non chargé → propre (défaut sûr). À N=1, _espaceOwners n'a qu'un espace → toujours le propre.
  const _entiteOwner = nom => { try { return _resolveEntiteOwner ? _resolveEntiteOwner(_liveDBRef && _liveDBRef.entites, _espaceOwners, nom, _cloudOwnerId) : _cloudOwnerId } catch (_e) { return _cloudOwnerId } }
  const _espaceOfEntiteSeg = seg => { try { return _resolveEspaceOfSeg ? _resolveEspaceOfSeg(_liveDBRef && _liveDBRef.entites, _espaceOwners, _makeDetUuid, seg, _cloudOwnerId, _cloudEspaceId) : _cloudEspaceId } catch (_e) { return _cloudEspaceId } }

  // entite_id DÉTERMINISTE d'une SCI (par NOM), pour le chemin Storage par-SCI (<espace>/<entite_id>/files/<clé>).
  // MÊME dérivation que store-mapping (mapper entites) : detUuid(owner de LA SCI) + ('entite', nom normalisé).
  // null si owner/fabrique pas prêts → orphelin.
  window.__immoEntiteUuid = function (nom) {
    try {
      const ownerId = _entiteOwner(nom)
      if (!ownerId || !_makeDetUuid) return null
      return _makeDetUuid(ownerId)('entite', _normNom(nom))
    } catch (e) { return null }
  }

  // DÉCOUPLAGE cloud↔Drive — helper global d'URL signée Storage. En mode cloud, index.html ouvre un
  // document via son idbKey → URL signée courte (5 min) du fichier dans Supabase Storage, à la place du
  // lien Drive. Retourne null si pas d'espace résolu, pas d'idbKey, ou objet absent (ex. doc Drive-only
  // non migré → le caller affiche un message). Capture `client` (closure boot) ; lit _cloudEspaceId (login).
  window.__immoCloudFileUrl = async function (pathOrKey, expiresIn) {
    try {
      if (!_cloudEspaceId || !pathOrKey) return null
      // pathOrKey = chemin complet par-SCI (<espace>/<seg>/files/<clé>, contient '/files/') OU clé nue
      // LEGACY (uploads d'avant le par-SCI) → reconstruit l'ancien chemin <espace>/files/<clé>. Rétro-compat.
      const isFullPath = String(pathOrKey).indexOf('/files/') !== -1
      const objPath = isFullPath ? pathOrKey : (_cloudEspaceId + '/files/' + pathOrKey)
      const { data, error } = await client.storage.from('espace-files').createSignedUrl(objPath, expiresIn || 300)
      return error ? null : ((data && data.signedUrl) || null)
    } catch (e) { return null }
  }

  // DÉCOUPLAGE cloud↔Drive — upload d'un blob vers Supabase Storage (`<espaceId>/files/<idbKey>`, upsert).
  // Sert à ARCHIVER le PDF du bail signé au moment de la signature (le blob existe dans la fenêtre de
  // signature) → le bouton « PDF » et le partage le rouvrent via __immoCloudFileUrl. Retourne true/false.
  window.__immoCloudUpload = async function (idbKey, blob, contentType, entiteSeg) {
    try {
      if (!_cloudEspaceId || !idbKey || !blob) return null
      // Chemin PAR-SCI : <espace>/<entite_id>/files/<clé> (ou /_orphelin/ si SCI non résolue → membre plein
      // only côté RLS, cf migration 0031). entiteSeg = uuid d'entité via window.__immoEntiteUuid, ou falsy.
      // RETOURNE le chemin complet (string, à STOCKER pour la relecture) ou null si échec.
      // entiteSeg fourni (câblage par-SCI) → <espace>/<entiteSeg>/files/<clé> (uuid de SCI ou '_orphelin').
      // ABSENT (ancien appelant, ex. index.html pas encore rafraîchi via le SW) → chemin LEGACY
      // <espace>/files/<clé> : rétro-compat, l'ancien appelant stocke la clé nue et relit via le legacy.
      // → aucune fenêtre cassée pendant un déploiement (entry réseau-first vs index.html bumpé).
      // MULTI-ESPACE : un fichier de SCI TIERS vit sous l'espaceId de SON propriétaire (pas le nôtre). On
      // résout l'espace depuis le segment d'entité ; legacy (entiteSeg absent) → espace propre. N=1 → propre.
      const eid = (entiteSeg == null) ? _cloudEspaceId : _espaceOfEntiteSeg(entiteSeg)
      const path = (entiteSeg == null)
        ? (eid + '/files/' + idbKey)
        : (eid + '/' + entiteSeg + '/files/' + idbKey)
      const { error } = await client.storage.from('espace-files').upload(path, blob, { contentType: contentType || 'application/pdf', upsert: true })
      return error ? null : path
    } catch (e) { return null }
  }

  // RÉ-UPLOAD BINAIRES (restauration cas « cloud perdu ») : upload vers un CHEMIN EXACT (le cloudKey déjà
  // stocké dans le DB) → reproduit à l'identique le fichier là où l'app le cherche, quel que soit son
  // format (par-SCI `<espace>/<seg>/files/<clé>` ou legacy). Clé nue (sans '/files/') → chemin legacy propre.
  window.__immoCloudUploadPath = async function (cloudKey, blob, contentType) {
    try {
      if (!_cloudEspaceId || !cloudKey || !blob) return null
      const objPath = String(cloudKey).indexOf('/files/') !== -1 ? cloudKey : (_cloudEspaceId + '/files/' + cloudKey)
      const { error } = await client.storage.from('espace-files').upload(objPath, blob, { contentType: contentType || 'application/octet-stream', upsert: true })
      return error ? null : objPath
    } catch (e) { return null }
  }

  // ── PARTAGE PAR SCI (étapes 2-3) — helpers MANAGER de l'écran « Partage & accès ». TOUT passe par la
  // RLS (migrations 0029/0030/0032) : le client n'agit que dans son espace, en tant que manager plein.
  // Mapping : role entite_membre 'gestionnaire'→mode 'ecriture', 'lecture_seule'→mode 'lecture'.
  // Couleur d'entité : l'app ne stocke PAS de couleur en base → on dérive une teinte stable du nom
  // (hash → HSL), même esprit que _tenantColor côté index.html (mémoire visuelle inter-vues).
  const _partageColor = (nom) => {
    const s = String(nom == null ? '' : nom)
    if (!s) return 'hsl(220,12%,60%)'
    let h = 0
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h = h & h }
    return 'hsl(' + (Math.abs(h) % 320 + 20) + ',58%,52%)'   // évite le rouge (vacance) comme _tenantColor
  }
  // « Perso » = patrimoine personnel : entité dont le type évoque une personne physique (≠ SCI/société).
  // Aligné sur la détection d'index.html (`/personne physique|perso/i` sur le type d'entité). Non figé :
  // si l'utilisateur n'a pas d'entité « Perso », rien n'est forcé — on partage les entités telles quelles.
  const _isPerso = (ent) => /personne\s*physique|perso/i.test(String((ent && ent.type) || ''))
  const _curUid = async () => { try { const { data } = await client.auth.getUser(); return (data && data.user && data.user.id) || null } catch (e) { return null } }

  // Liste des entités de l'espace (pour le picker du popup d'invitation). [{id, nom, couleur, perso}]
  async function _listEntites () {
    if (!_cloudEspaceId) return { error: 'Espace non résolu — reconnecte-toi.' }
    const { data, error } = await client
      .from('entites').select('id, nom, type, archived')
      .eq('espace_id', _cloudEspaceId)
      .order('nom', { ascending: true })
    if (error) return { error: error.message }
    const list = (data || [])
      .filter(e => e && !e.archived)
      .map(e => ({ id: e.id, nom: e.nom, couleur: _partageColor(e.nom), perso: _isPerso(e) }))
    return { entites: list }
  }

  // Membres de l'espace + leurs octrois par-entité. [{ user_id, isOwner, label, grants:[{entite_id,entite_nom,couleur,mode}] }]
  async function _listMembers () {
    if (!_cloudEspaceId) return { error: 'Espace non résolu — reconnecte-toi.' }
    const meUid = await _curUid()
    // 3 lectures parallèles (toutes sous RLS, scopées à l'espace).
    const [mRes, gRes, eRes, iRes] = await Promise.all([
      client.from('espace_members').select('user_id, role, full_espace, invite_status, invite_email').eq('espace_id', _cloudEspaceId),
      client.from('entite_membre').select('entite_id, user_id, role').eq('espace_id', _cloudEspaceId),
      client.from('entites').select('id, nom').eq('espace_id', _cloudEspaceId),
      client.from('invitations').select('invite_email, accepted_by').eq('espace_id', _cloudEspaceId).not('accepted_by', 'is', null)
    ])
    const firstErr = (mRes.error || gRes.error || eRes.error || iRes.error)
    if (firstErr) return { error: firstErr.message }
    const entById = {}
    ;(eRes.data || []).forEach(e => { entById[e.id] = { nom: e.nom, couleur: _partageColor(e.nom) } })
    // email lisible d'un partenaire : via l'invitation qu'il a acceptée (accepted_by = user_id).
    const emailByUid = {}
    ;(iRes.data || []).forEach(inv => { if (inv.accepted_by && inv.invite_email) emailByUid[inv.accepted_by] = inv.invite_email })
    // octrois groupés par user
    const grantsByUid = {}
    ;(gRes.data || []).forEach(g => {
      const ent = entById[g.entite_id] || { nom: 'Périmètre', couleur: _partageColor(g.entite_id) }
      ;(grantsByUid[g.user_id] = grantsByUid[g.user_id] || []).push({
        entite_id: g.entite_id, entite_nom: ent.nom, couleur: ent.couleur,
        mode: g.role === 'gestionnaire' ? 'ecriture' : 'lecture'
      })
    })
    const members = (mRes.data || [])
      .filter(m => m && m.user_id && m.invite_status === 'active')
      .map(m => {
        const isOwner = m.full_espace === true
        const isMe = meUid && m.user_id === meUid
        const email = emailByUid[m.user_id] || m.invite_email || ''
        const label = isMe ? 'Vous' : (email || ('Membre ' + String(m.user_id).slice(0, 8)))
        return { user_id: m.user_id, isOwner, isMe: !!isMe, label, email: isMe ? '' : email, grants: grantsByUid[m.user_id] || [] }
      })
    // owner (vous) en premier, puis partenaires
    members.sort((a, b) => (b.isOwner - a.isOwner) || (b.isMe - a.isMe))
    return { members }
  }

  // Crée une invitation (RLS = manager). grants = [{entite_id, mode:'ecriture'|'lecture'}]. → { token, url }.
  async function _createInvite (grants, inviteEmail) {
    if (!_cloudEspaceId) return { error: 'Espace non résolu — reconnecte-toi.' }
    if (!Array.isArray(grants) || grants.length === 0) return { error: 'Choisissez au moins un périmètre.' }
    const clean = grants
      .filter(g => g && g.entite_id && (g.mode === 'ecriture' || g.mode === 'lecture'))
      .map(g => ({ entite_id: g.entite_id, mode: g.mode }))
    if (clean.length === 0) return { error: 'Périmètres invalides.' }
    const em = String(inviteEmail || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { error: 'Email du partenaire requis (il sera autorisé à s\'inscrire).' }
    const row = { espace_id: _cloudEspaceId, grants: clean, invite_email: em }
    const { data, error } = await client.from('invitations').insert(row).select('token').single()
    if (error) return { error: error.message }
    const token = data && data.token
    if (!token) return { error: 'Token non renvoyé.' }
    const url = location.origin + location.pathname + '?invite=' + encodeURIComponent(token)
    return { token, url }
  }

  // Révoque l'accès d'un partenaire : octrois par-entité PUIS appartenance à l'espace (manager via RLS).
  async function _revokeMember (userId) {
    if (!_cloudEspaceId) return { error: 'Espace non résolu — reconnecte-toi.' }
    if (!userId) return { error: 'Membre invalide.' }
    const r1 = await client.from('entite_membre').delete().eq('espace_id', _cloudEspaceId).eq('user_id', userId)
    if (r1.error) return { error: r1.error.message }
    const r2 = await client.from('espace_members').delete().eq('espace_id', _cloudEspaceId).eq('user_id', userId)
    if (r2.error) return { error: r2.error.message }
    return { ok: true }
  }

  window.__immoPartage = {
    listMembers: _listMembers,
    listEntites: _listEntites,
    createInvite: _createInvite,
    revokeMember: _revokeMember
  }

  // ── Admin bêta (super-admin global) : gestion de l'allowlist d'inscription ──
  async function _isAppAdmin () {
    const { data, error } = await client.rpc('is_app_admin')
    if (error) return false
    return data === true
  }
  async function _listAllowlist () {
    const { data, error } = await client.from('beta_allowlist')
      .select('email, source, invited_by_email, created_at, registered_at').order('created_at', { ascending: false })
    if (error) return { error: error.message }
    return { rows: data || [] }
  }
  async function _addAllowedEmail (email) {
    const e = String(email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Email invalide.' }
    const { error } = await client.from('beta_allowlist').insert({ email: e, source: 'admin' })
    if (error) return { error: /duplicate|unique/i.test(error.message) ? 'Cet email est déjà autorisé.' : error.message }
    return { ok: true, email: e }
  }
  async function _removeAllowedEmail (email) {
    const { error } = await client.from('beta_allowlist').delete().eq('email', String(email || '').trim().toLowerCase())
    if (error) return { error: error.message }
    return { ok: true }
  }
  window.__immoAdmin = { isAppAdmin: _isAppAdmin, listAllowlist: _listAllowlist, addEmail: _addAllowedEmail, removeEmail: _removeAllowedEmail }

  // Lien d'INVITATION (?invite=<token>) : aperçu + acceptation (connexion OU création de compte) AVANT
  // le login normal. acceptInviteFlow enchaîne ensuite sur l'app (la RLS scope l'invité à ses SCIs).
  const _inviteTok = (new URLSearchParams(location.search)).get('invite')
  if (_inviteTok) return acceptInviteFlow(api, client, overlay, _inviteTok)

  // déjà connecté (session persistée) → enchaîner direct
  const user = await api.currentUser()
  if (user) return onLoggedIn(api, overlay, user)

  wireLoginForm(api, overlay)
}

function wireLoginForm(api, overlay, prefillEmail) {
  // Bascule Connexion ↔ Inscription (self-service gardée par le hook allowlist côté serveur).
  // Réutilise les champs email/mdp du formulaire login (DRY) : seul le mode + le libellé changent.
  let mode = 'login'  // 'login' | 'signup'
  const q = s => overlay.querySelector(s)
  const applyMode = () => {
    const h2 = q('#imsb-form .imsb-h2'), sub = q('#imsb-submit'), lnk = q('#imsb-signup'), pw = q('#imsb-pass')
    if (mode === 'signup') {
      if (h2) h2.textContent = 'Créer un compte'
      if (sub) sub.textContent = 'Créer mon compte'
      if (lnk) lnk.textContent = '← J\'ai déjà un compte'
      if (pw) { pw.setAttribute('minlength', '6'); pw.setAttribute('autocomplete', 'new-password'); pw.placeholder = '6 caractères minimum' }
    } else {
      if (h2) h2.textContent = 'Connexion'
      if (sub) sub.textContent = 'Se connecter'
      if (lnk) lnk.textContent = 'Créer un compte · essai gratuit'
      if (pw) { pw.setAttribute('autocomplete', 'current-password'); pw.placeholder = '••••••••' }
    }
    showError(overlay, '')
  }
  const sgn = q('#imsb-signup')
  if (sgn) sgn.onclick = (e) => { e.preventDefault(); mode = (mode === 'login' ? 'signup' : 'login'); applyMode() }

  q('#imsb-form').onsubmit = async (e) => {
    e.preventDefault()
    const email = q('#imsb-email').value.trim()
    const pass = q('#imsb-pass').value
    setBusy(overlay, true); showError(overlay, '')
    if (mode === 'signup') {
      const s = await api.signUpEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
      if (!s.ok) {
        setBusy(overlay, false)
        if (/already.*(regist|exist)|user already/i.test(s.error || '')) { showError(overlay, 'Ce compte existe déjà — connecte-toi.'); mode = 'login'; applyMode(); return }
        showError(overlay, traduireErreur(s.error)); return   // inclut le refus du hook (« pas encore autorisé »)
      }
      // Compte créé (confirmation email désactivée → session directe). On enchaîne sur la connexion.
      const r = await api.loginEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
      setBusy(overlay, false)
      if (!r.ok) { showError(overlay, 'Compte créé — connecte-toi avec ton mot de passe.'); mode = 'login'; applyMode(); return }
      onLoggedIn(api, overlay, r.user)
      return
    }
    const r = await api.loginEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
    setBusy(overlay, false)
    if (!r.ok) { showError(overlay, traduireErreur(r.error)); return }
    onLoggedIn(api, overlay, r.user)
  }
  q('#imsb-forgot').onclick = (e) => {
    e.preventDefault()
    showError(overlay, 'Le « mot de passe oublié » nécessite un email (SMTP) à configurer — bientôt. Pour l\'instant, le mot de passe se définit côté dashboard.')
  }
  if (prefillEmail) q('#imsb-email').value = prefillEmail
  // v15.422 BUG-LOGIN-PREMIERE-CONNEXION — l'utilisateur a cliqué « Se connecter » PENDANT le
  // chargement (garde d'injectOverlay) : on remet le bouton en état et on REJOUE sa demande
  // maintenant que le vrai handler est câblé — il n'a pas à re-cliquer.
  setBusy(overlay, false)
  if (overlay._pendingSubmit) {
    overlay._pendingSubmit = false
    const f = q('#imsb-form')
    const email = (q('#imsb-email') || {}).value, pass = (q('#imsb-pass') || {}).value
    if (f && email && pass) {
      if (typeof f.requestSubmit === 'function') f.requestSubmit()
      else f.onsubmit(new Event('submit', { cancelable: true }))
    }
  }
}

// ── PARCOURS D'ACCEPTATION D'UNE INVITATION (?invite=<token>) ─────────────────────────────────
// Aperçu (invitation_preview) → connexion / création de compte → accept_invitation → on enchaîne sur
// l'app SANS recharger (garde la session en mémoire) ; la RLS scope l'invité à ses SCIs octroyées.
function _inviteErr(m) {
  if (/ALREADY_FULL_MEMBER/.test(m)) return 'Tu es déjà membre à part entière de cet espace.'
  if (/ALREADY_USED/.test(m)) return 'Cette invitation a déjà été utilisée.'
  if (/REVOKED/.test(m)) return 'Cette invitation a été annulée.'
  if (/EXPIRED/.test(m)) return 'Cette invitation a expiré.'
  if (/NOT_FOUND/.test(m)) return 'Invitation introuvable.'
  return m || 'Impossible de rejoindre ce partage.'
}
function renderInviteError(overlay, msg) {
  const left = overlay.querySelector('#imsb-left'); if (!left) return
  overlay.classList.add('imv-auth-open')  // erreur d'invitation → ouvrir la modale (sinon message invisible)
  left.innerHTML = `${brand()}<div class="imsb-mid">
    <h2 class="imsb-h2">Invitation</h2>
    <div class="imsb-err" style="display:block">${escapeHtml(msg)}</div>
    <a class="imsb-btn imsb-ghost" href="${escapeHtml(location.origin + location.pathname)}" style="text-decoration:none;margin-top:10px">Aller à l'application</a></div>`
}
async function acceptInviteFlow(api, client, overlay, token) {
  let preview = null
  try { const r = await client.rpc('invitation_preview', { p_token: token }); preview = r && r.data } catch (e) {}
  if (!preview) return renderInviteError(overlay, 'Cette invitation est introuvable. Demande un nouveau lien.')
  if (preview.status === 'revoked') return renderInviteError(overlay, 'Cette invitation a été annulée.')
  if (preview.expired) return renderInviteError(overlay, 'Cette invitation a expiré. Demande un nouveau lien.')

  const cleanUrl = location.origin + location.pathname
  const espace = escapeHtml(preview.espace_nom || 'un espace')
  const perim = (preview.grants || []).map(g =>
    `${escapeHtml(g.entite_nom || 'SCI')} <b>(${g.mode === 'ecriture' ? 'écriture' : 'lecture'})</b>`).join(' · ') || 'des biens partagés'

  // accepte puis enchaîne SANS recharger (garde la session ; URL nettoyée du ?invite)
  const accept = async () => {
    const { error } = await client.rpc('accept_invitation', { p_token: token })
    if (error) { showError(overlay, _inviteErr(error.message)); return false }
    try { history.replaceState(null, '', cleanUrl) } catch (e) {}
    const u = await api.currentUser()
    onLoggedIn(api, overlay, u)
    return true
  }

  const user = await api.currentUser()
  const left = overlay.querySelector('#imsb-left'); if (!left) return
  overlay.classList.add('imv-auth-open')  // invitation → ouvrir la modale de connexion/acceptation
  if (user) {
    left.innerHTML = `${brand()}<div class="imsb-mid">
      <h2 class="imsb-h2">Rejoindre un partage</h2>
      <p class="imsb-lead">On te donne accès à : ${perim}<br>dans « ${espace} ».</p>
      <div class="imsb-err" id="imsb-error" style="display:none"></div>
      <button class="imsb-btn imsb-primary" id="imsb-join" type="button">Rejoindre en tant que ${escapeHtml(user.email)}</button>
      <a class="imsb-btn imsb-ghost" id="imsb-join-other" href="#" style="text-decoration:none;margin-top:6px">Utiliser un autre compte</a></div>`
    left.querySelector('#imsb-join').onclick = async (ev) => { ev.target.disabled = true; if (!(await accept())) ev.target.disabled = false }
    left.querySelector('#imsb-join-other').onclick = async (ev) => { ev.preventDefault(); try { await api.logout() } catch (e) {} acceptInviteFlow(api, client, overlay, token) }
    return
  }
  left.innerHTML = `${brand()}<form id="imsb-iform" class="imsb-mid" autocomplete="on">
    <h2 class="imsb-h2">Rejoindre un partage</h2>
    <p class="imsb-lead">On te donne accès à : ${perim}<br>dans « ${espace} ». Crée ton compte (ou connecte-toi) pour rejoindre.</p>
    <div class="imsb-err" id="imsb-error" style="display:none"></div>
    <label class="imsb-flabel">Email</label>
    <input class="imsb-input" id="imsb-email" type="email" placeholder="toi@exemple.fr" required autocomplete="username">
    <label class="imsb-flabel">Mot de passe</label>
    <input class="imsb-input" id="imsb-pass" type="password" placeholder="6 caractères minimum" required autocomplete="current-password" minlength="6">
    <button class="imsb-btn imsb-primary" id="imsb-submit" type="submit">Créer mon compte et rejoindre</button>
    <p class="imsb-note" style="margin-top:12px">Déjà un compte ? Saisis tes identifiants : on te connecte automatiquement.</p></form>`
  left.querySelector('#imsb-iform').onsubmit = async (e) => {
    e.preventDefault()
    const email = left.querySelector('#imsb-email').value.trim()
    const pass = left.querySelector('#imsb-pass').value
    const btn = left.querySelector('#imsb-submit')
    btn.disabled = true; showError(overlay, '')
    const fail = (msg) => { btn.disabled = false; showError(overlay, msg) }
    let r = await api.signUpEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
    if (!r.ok && /already.*(regist|exist)|user already/i.test(r.error || '')) {
      r = await api.loginEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
      if (!r.ok) return fail('Ce compte existe déjà, mais le mot de passe ne correspond pas.')
    } else if (!r.ok) {
      return fail(traduireErreur(r.error))
    } else if (r.ok && !r.session) {
      return fail('Compte créé : il reste à confirmer ton email (l\'envoi d\'emails n\'est pas encore activé — préviens la personne qui t\'a invité).')
    }
    if (!(await accept())) btn.disabled = false
  }
}

async function onLoggedIn(api, overlay, user) {
  renderLoading(overlay, user)
  let esp, liveDB = null, flushTimer = null, _lastFlushFn = null, _liveChannel = null

  // ── P1.1 SYNC HONNÊTE (audit 2026-07-12, cause C-B) — pastille topbar RÉELLE. L'ancien #imsb-sync
  // vivait dans le bandeau bleu supprimé au cutover → setSync était un no-op = échecs 100 % invisibles
  // (le 12/07 : 0 écriture cloud sur une journée entière, sans un seul signal). La pastille est
  // (re)créée PARESSEUSEMENT à chaque setSync → elle survit aux re-rendus/re-injections de la topbar.
  const _syncEl = () => {
    let el = document.getElementById('imsb-sync')
    if (el && el.isConnected) return el
    const tb = document.querySelector('.tb')
    if (!tb) return null                          // app pas encore rendue → retenté au prochain setSync
    if (!document.getElementById('imsb-sync-style')) {
      // Style aligné sur la pastille de co-présence (.cop-pill) : mêmes tokens app (--bd/--sur2/--t2),
      // point d'état coloré (vert=sauvé · gris pulsé=en cours · orange=échec · gris=hors ligne).
      const st = document.createElement('style'); st.id = 'imsb-sync-style'
      st.textContent = '#imsb-sync{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin-left:8px;border:1px solid var(--bd,#e4e7ee);border-radius:999px;background:var(--sur2,#f7f8fb);font:600 12px/1.2 sans-serif;color:var(--t2,#3c4658);white-space:nowrap;user-select:none;flex:none}'
        + '#imsb-sync .is-dot{width:8px;height:8px;border-radius:50%;background:var(--grn,#16a34a);flex:none}'
        + '#imsb-sync[data-state=saving] .is-dot{background:#8a93a6;animation:imsb-sync-pulse 1s ease-in-out infinite}'
        + '#imsb-sync[data-state=warn] .is-dot,#imsb-sync[data-state=dead] .is-dot{background:var(--org,#f59e0b)}'
        + '#imsb-sync[data-state=warn]{cursor:pointer}'
        + '#imsb-sync[data-state=offline] .is-dot{background:#8a93a6}'
        + '@keyframes imsb-sync-pulse{50%{opacity:.35}}'
        + '@media(max-width:700px){#imsb-sync .is-txt{display:none}#imsb-sync{padding:4px 7px}}'
      document.head.appendChild(st)
    }
    el = document.createElement('div'); el.id = 'imsb-sync'
    el.setAttribute('role', 'status')
    el.innerHTML = '<span class="is-dot"></span><span class="is-txt"></span>'
    el.onclick = () => { if (el.dataset.state === 'warn' && _lastFlushFn) runFlush(_lastFlushFn) }   // clic sur ⚠ = réessayer MAINTENANT
    const anchor = document.getElementById('presence-pill')
    if (anchor && anchor.parentElement === tb) tb.insertBefore(el, anchor)
    else tb.appendChild(el)
    return el
  }
  // I1 : JAMAIS « Enregistré » si conflit/skipped/erreur (donc pas réellement dans le cloud) — honnête.
  const setSync = (state, detail) => {
    const el = _syncEl(); if (!el) return
    el.dataset.state = state
    const msg = state === 'saving' ? 'Enregistrement…'
      : state === 'warn' ? (detail || 'Non synchronisé — réessai auto')
      : state === 'dead' ? 'Session expirée'
      : state === 'offline' ? 'Hors ligne'
      : 'Enregistré'
    const txt = el.querySelector('.is-txt'); if (txt) txt.textContent = msg
    el.title = state === 'warn' ? (msg + ' — clic : réessayer maintenant') : msg
  }

  // ── P1.1 DÉTECTION SESSION MORTE — persistSession:false = session en mémoire seule ; token mort
  // après veille = tous les appels en 401 avalés (audit C-B : « fini les 401 silencieux »). Bannière
  // UNE fois, non fermable autrement qu'en se reconnectant (les modifs ne partent plus au cloud).
  let _deadShown = false
  const _sessionDead = () => {
    if (_deadShown) return
    _deadShown = true
    setSync('dead')
    if (document.getElementById('imsb-dead')) return
    const b = document.createElement('div'); b.id = 'imsb-dead'
    b.setAttribute('role', 'alert')
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;padding:10px 16px;background:#7a1f1f;color:#fff;font:600 13.5px/1.4 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'
    b.innerHTML = '<span>⚠ Ta session a expiré : tes modifications ne sont <u>plus enregistrées</u> dans le cloud.</span>'
      + '<button id="imsb-dead-btn" style="border:none;border-radius:9px;padding:8px 16px;background:#fff;color:#7a1f1f;font:700 13px sans-serif;cursor:pointer">Se reconnecter</button>'
    document.body.appendChild(b)
    const btn = b.querySelector('#imsb-dead-btn')
    if (btn) btn.onclick = () => { try { location.reload() } catch (e) {} }
  }

  const runFlush = async (fn) => {
    flushTimer = null; setSync('saving')
    try {
      const s = await fn()   // fn = () => sync.flush() ; flush est SÉRIALISÉ côté store-sync (anti-réentrance C2)
      // P1.2 : le résumé porte désormais les échecs PAR ENREGISTREMENT (summary.errors = throws isolés)
      // en plus des conflits/skipped. Le moteur re-programme lui-même un retry backoff (errors/skipped/
      // config) via schedule({retryDelayMs}) ; les conflits attendent le chantier « conflit → re-hydrate ».
      const bad = (s ? ((s.errors && s.errors.length) || 0) + ((s.conflicts && s.conflicts.length) || 0) + ((s.skipped && s.skipped.length) || 0) : 0) + (s && s.config === 'error' ? 1 : 0)
      if (bad) {
        console.warn('[Supabase] sync incomplète (des modifs ne sont PAS dans le cloud)', s)
        // Un token mort se manifeste en erreurs JWT/401 sur chaque appel → bannière re-login, pas une ⚠ générique.
        if (s.errors && s.errors.some(er => /jwt|401|token .*(expired|invalid)|expired.*token/i.test(String(er.message)))) _sessionDead()
        if (!_deadShown) setSync('warn', bad + ' modif' + (bad > 1 ? 's' : '') + ' non synchronisée' + (bad > 1 ? 's' : '') + ' — réessai auto')
      } else if (!_deadShown) setSync('ok')
      // SYNCHRO LIVE — après une sync RÉUSSIE, signale aux AUTRES appareils de l'espace qu'il y a du neuf.
      if (!bad && _liveChannel) { try { _liveChannel.send({ type: 'broadcast', event: 'changed', payload: {} }) } catch (e) {} }
      return s
    } catch (e) {
      console.error('[Supabase] flush', e)
      if (!_deadShown) setSync(navigator.onLine === false ? 'offline' : 'warn', 'Erreur réseau — réessai à la prochaine modif')   // (audit M3) ne pas écraser l'état « session expirée »
    }
  }
  // Scheduler debouncé (800 ms, comme Drive) : saveDB → markDirty → ici → flush cloud (gardé par version).
  // P1.2 : honore les options du moteur — { immediate:true } (suppression en attente → bypass du debounce,
  // le remove part MAINTENANT) et { retryDelayMs } (retry backoff après échec). (Audit M1) un RETRY ne
  // REPOUSSE jamais un timer déjà plus proche : si une modif utilisateur attend son debounce 800 ms
  // pendant qu'un flush échoue, le retry (jusqu'à 60 s) ne doit pas la retarder — le timer court reste,
  // et son flush couvre TOUT le diff (y compris ce que le retry aurait retenté).
  let flushDueAt = 0
  const schedule = (fn, opts) => {
    _lastFlushFn = fn
    const delay = (opts && opts.immediate) ? 0 : ((opts && opts.retryDelayMs) || 800)
    if (opts && opts.retryDelayMs && flushTimer && flushDueAt <= Date.now() + delay) return
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    if (opts && opts.immediate) { runFlush(fn); return }
    flushDueAt = Date.now() + delay
    flushTimer = setTimeout(() => runFlush(fn), delay)
  }
  // P1.1 — le réseau qui tombe/revient : pastille honnête + reprise immédiate au retour du réseau.
  addEventListener('offline', () => { if (!_deadShown) setSync('offline') })
  addEventListener('online', () => { if (_deadShown) return; if (_lastFlushFn) runFlush(_lastFlushFn); else setSync('ok') })
  // C1 : à la fermeture/masquage de l'onglet, flush IMMÉDIAT du debounce en attente — sinon la modif est
  // perdue (en mode cloud, le filet localStorage de beforeunload n'existe plus). visibilitychange:hidden +
  // pagehide = plus fiables que beforeunload pour l'async. Best-effort (réseau coupé sur close dur possible).
  const flushPendingNow = () => { if (flushTimer && _lastFlushFn) { clearTimeout(flushTimer); runFlush(_lastFlushFn) } }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPendingNow() })
  addEventListener('pagehide', flushPendingNow)
  // P1.1 — session expirée/révoquée pendant la vie de l'onglet : supabase-js émet SIGNED_OUT quand le
  // refresh du token échoue (autoRefreshToken:true, session mémoire) → bannière re-login. Abonné UNE
  // SEULE fois pour la vie de la page (contrat onAuthChange). Un logout VOLONTAIRE (menu Compte) pose
  // window.__immoLoggingOut → pas de bannière pendant le signOut → reload ramène au login proprement.
  try {
    api.onAuthChange((session, evt) => {
      if (window.__immoLoggingOut) return
      if (evt === 'SIGNED_OUT' || !session) _sessionDead()
    })
  } catch (e) { console.warn('[Supabase] onAuthChange', e) }
  try {
    const _espaces = await api.resolveEspaces()
    esp = _espaces.find(e => e.mine) || _espaces[0]   // espace PROPRE = primaire (Storage/Realtime/affichage + __immoCloudInfo)
    _cloudEspaceId = esp.espaceId   // espace propre : chemins Storage par défaut (entités neuves) + canal Realtime
    _cloudOwnerId = esp.ownerId     // namespace detUuid par défaut → window.__immoEntiteUuid (entités neuves)
    _espaceOwners = {}; _espaces.forEach(e => { _espaceOwners[e.espaceId] = e.ownerId })   // résolution par-SCI (Storage/uuid)
    api.wireStores({ espaces: _espaces, getDB: () => liveDB, schedule })   // MULTI-ESPACE : 1 store/espace agrégé (N=1 = mono)
    // SYNCHRO LIVE — canal Realtime PRIVÉ de l'espace (policies P0-D). Un autre appareil qui modifie des
    // données émet « changed » → on affiche une bannière « Actualiser » (rechargement MANUEL = zéro risque
    // d'écraser une modif locale en cours). self:false → on ne reçoit pas ses propres broadcasts.
    try {
      const _syncPresence = (meUid) => {
        const list = []
        try {
          const state = (_liveChannel && _liveChannel.presenceState) ? _liveChannel.presenceState() : {}
          for (const key of Object.keys(state || {})) {
            const meta = (state[key] && state[key][0]) || {}
            list.push({ name: meta.name || 'Membre', isOwner: !!meta.isOwner, isMe: key === meUid })
          }
        } catch (e) {}
        list.sort((a, b) => (b.isOwner - a.isOwner) || (b.isMe - a.isMe))
        window.__immoPresence = list
        try { if (typeof window.__immoRenderPresence === 'function') window.__immoRenderPresence() } catch (e) {}
      }
      _liveChannel = _supaClient.channel('espace:' + esp.espaceId, { config: { private: true, broadcast: { self: false }, presence: { key: user.id } } })
        // 'changed' (émis l.~406 après flush) n'a plus de récepteur : le bandeau bleu « un autre appareil a
        // modifié » est retiré (décision cutover). Le canal continue d'émettre (réabonnable à une pastille
        // discrète plus tard). La co-présence (presence:sync) reste.
        .on('presence', { event: 'sync' }, () => { try { _syncPresence(user.id) } catch (e) {} })
        .subscribe(async (st) => {
          // CO-PRÉSENCE : on s'annonce dès la souscription (nom d'affichage + owner). Les autres reçoivent
          // un événement presence:sync → la pastille topbar se met à jour. Espace-level (v1).
          if (st === 'SUBSCRIBED') {
            try { await _liveChannel.track({ name: _displayNameFromUser(user), isOwner: !!(esp && esp.ownerId && user.id === esp.ownerId) }) } catch (e) {}
          }
          if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') console.warn('[Supabase] realtime', st)
        })
    } catch (e) { console.warn('[Supabase] realtime subscribe', e) }
    const db = await api.hydrate()
    // Si on tourne DANS l'app complète (points d'injection exposés par index.html) → injecter le DB
    // cloud EN MÉMOIRE + re-render + brancher la SAUVEGARDE cloud (2c). Sinon (page de test dédiée
    // index-supabase.html) → écran de compteurs + bouton.
    if (typeof window.__immoSetDB === 'function' && typeof window.__immoRender === 'function') {
      window.__immoSupabaseMode = true            // saveDB/beforeunload/storage ne toucheront pas localStorage
      if (window.__immoSetDB(db) === false) { renderProof(overlay, api, user, esp, db); return }   // DB invalide → fallback
      liveDB = db                                 // le sync lit CE DB (l'app le mute EN PLACE → diff = vraies modifs)
      _liveDBRef = db                             // réf pour résoudre l'espace/owner d'une SCI (Storage + uuid par-SCI)
      api.seed(db)                                // baseline = état hydraté (aucun diff au départ)
      window.__immoMarkDirty = () => api.markDirty()   // 2c : le garde saveDB l'appelle → debounce → flush cloud
      // RESTAURATION LOCALE : flush COMPLET synchrone + awaitable (renvoie le résumé {upserts,removes,conflicts,skipped}).
      // Utilisé par _backupRestoreRun (index.html) : après avoir muté DB EN PLACE = instantané, on pousse tout vers
      // Supabase et on ATTEND (le moteur diffe instantané-vs-cloud → upserts version-guardés + removes des extras +
      // saute les baux `locked`). Contrairement à markDirty (debouncé fire-and-forget), on a besoin du résultat.
      window.__immoFlush = () => api.flush()
      // 2.2 : panneau Mode cloud des Réglages. isOwner/displayName (#2) : un invité scopé ne doit pas
      // hériter du nom du PROPRIÉTAIRE (DB.params est partagé par-espace) → _appUserName lit son identité.
      window.__immoCloudInfo = {
        email: user && user.email,
        espaceNom: esp && esp.espaceNom,
        isOwner: !!(user && esp && esp.ownerId && user.id === esp.ownerId),
        displayName: _displayNameFromUser(user),
      }
      window.__immoRender()
      setSync('ok')      // P1.1 : pastille visible dès le dévoilement (état initial = hydraté ≙ enregistré)
      _liftDriveGate()   // revele l'app cloud (leve le gate Drive reste leve apres le boot legacy)
      try { localStorage.removeItem('immo_fullapp_once') } catch (e) {}   // consomme l'opt-in one-shot (M1)
      overlay.remove()                            // dévoile l'app complète sur les données cloud
      return
    }
    renderProof(overlay, api, user, esp, db)
  } catch (e) {
    renderProof(overlay, api, user, esp || {}, null, e.message)
  }
}

// ── UI ───────────────────────────────────────────────────────────────────────
function renderProof(overlay, api, user, esp, db, err) {
  overlay.classList.add('imv-auth-open')
  const left = overlay.querySelector('#imsb-left')
  if (err) {
    left.innerHTML = `${brand()}<div class="imsb-mid"><div class="imsb-err">⚠ Hydratation : ${escapeHtml(err)}</div>
      <button class="imsb-btn imsb-ghost" id="imsb-logout">Se déconnecter</button></div>`
  } else {
    const rows = COUNTS.map(([k, lbl]) => `<tr><td>${escapeHtml(lbl)}</td><td class="imsb-num">${sizeOf(db[k])}</td></tr>`).join('')
    left.innerHTML = `${brand()}
      <div class="imsb-mid">
        <div class="imsb-ok">✓ Connecté · données chargées depuis Supabase</div>
        <p class="imsb-lead"><b>${escapeHtml(user.email)}</b> — espace « ${escapeHtml(esp.espaceNom || '?')} »</p>
        <table class="imsb-tbl">${rows}</table>
        <button class="imsb-btn imsb-primary" id="imsb-openapp">📂 Voir dans l'app complète →</button>
        <p class="imsb-note" id="imsb-note">Tes données cloud sont prêtes. Ouvre l'app complète (tableau de bord, fiches, listes…).</p>
        <button class="imsb-btn imsb-ghost" id="imsb-logout">Se déconnecter</button>
      </div>`
  }
  const oa = overlay.querySelector('#imsb-openapp')
  if (oa) oa.onclick = () => {
    // Pas d'écriture des données dans le cache (quota du localStorage github.io partagé). On pose juste
    // un opt-in (consommé UNIQUEMENT en sandbox) puis on ouvre l'app : elle charge le cloud EN MÉMOIRE.
    try { localStorage.setItem('immo_fullapp_once', '1') } catch (e) {}
    location.href = 'index.html?sandbox=1'
  }
  const lo = overlay.querySelector('#imsb-logout')
  if (lo) lo.onclick = async () => { await api.logout(); location.reload() }
}

function renderLoading(overlay, user) {
  overlay.classList.add('imv-auth-open')
  overlay.querySelector('#imsb-left').innerHTML = `${brand()}<div class="imsb-mid">
    <div class="imsb-spin"></div><p class="imsb-lead">Chargement de tes données…</p></div>`
}

function brand() {
  // Logo + wordmark Propryo de la charte : pavé encre + point corail (accent identité).
  return `<div class="imsb-brand">
    <span class="imsb-mark">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.2 11 12 3.6 20.8 11M5.6 9.2V19a1 1 0 0 0 1 1H10v-5h4v5h3.4a1 1 0 0 0 1-1V9.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <span class="imsb-name">Propryo</span>
  </div>`
}

// Bandeau bleu RETIRÉ (cutover) : `_showUpdateBanner` (« un autre appareil a modifié → Actualiser ») et
// `injectSyncBanner` (bandeau permanent « Mode cloud »/« Revenir en mode local ») supprimés. La synchro
// Realtime + la co-présence restent ; `setSync` pilote désormais la PASTILLE topbar #imsb-sync
// (recréée paresseusement dans .tb — P1.1 sync honnête, audit 2026-07-12).

// Le SVG « check » réutilisé dans les listes des piliers.
function _imsbCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function injectOverlay() {
  const ov = document.createElement('div')
  ov.id = 'imsb-overlay'
  // Thème mémorisé (défaut clair). On l'applique AVANT le 1er paint pour éviter le flash.
  let theme = 'clair'
  try { const t = localStorage.getItem('immo_theme'); if (t === 'sombre' || t === 'clair') theme = t } catch (e) {}
  if (theme === 'sombre') ov.classList.add('mode-sombre')

  // STRUCTURE — landing plein écran (vitrine cockpit) :
  //   #imsb-overlay
  //     .imsb-page (scroll/centrage)
  //       nav (wordmark + toggle thème + liens)
  //       .imsb-hero
  //         .imsb-pitch ........ marketing (HORS #imsb-left → reste visible pendant chargement/invitation)
  //         .imsb-right
  //           .imsb-dash ....... aperçu dashboard (HORS #imsb-left)
  //           #imsb-left ....... la COLONNE de connexion (login / chargement / invitation)
  //
  // ⚠️ #imsb-left contient le formulaire #imsb-form (#imsb-email/#imsb-pass/#imsb-submit/#imsb-error/#imsb-forgot).
  //   renderLoading() et acceptInviteFlow() font `overlay.querySelector('#imsb-left').innerHTML = …`,
  //   donc tout le marketing/aperçu DOIT rester en dehors de #imsb-left.
  ov.innerHTML = `<div class="imsb-page">
    <header class="imv-nav">
      ${brand()}
      <nav class="imv-mid">
        <a href="#">Fonctionnalités</a>
        <a href="#">Tarifs</a>
        <a href="#">Sécurité</a>
      </nav>
      <div class="imsb-nav-right">
        <a href="#" class="imv-nav-link" id="imsb-open-login">Se connecter</a>
        <a href="#" class="imv-btn-mini" id="imsb-open-signup">Créer un compte</a>
        <button type="button" id="imsb-theme" class="imsb-theme" aria-label="Basculer le thème clair / sombre" title="Clair / Sombre">
          <span class="imsb-theme-ic imsb-theme-sun" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <span class="imsb-theme-ic imsb-theme-moon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </span>
        </button>
      </div>
    </header>

    <main class="imv-hero">
      <div class="imv-hero-in">
        <div class="imv-copy">
          <span class="imv-eyebrow"><span class="imv-pip"></span>Gestion locative · particuliers &amp; SCI</span>
          <h1 class="imv-h1">Gérer son parc immobilier ne devrait pas être un <em>deuxième métier</em>.</h1>
          <p class="imv-triad"><b>La gestion locative</b> — simplifiée <i>·</i> démystifiée <i>·</i> vulgarisée.</p>
          <div class="imv-cta">
            <a class="imv-btn imv-btn-primary" href="#" id="imsb-open-signup2">Créer un compte <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
            <a class="imv-btn imv-btn-ghost" href="#">Voir la démo</a>
          </div>
          <p class="imv-trust">
            <span><span class="imv-s"></span>Hébergé en Europe</span>
            <span><span class="imv-s"></span>Vos données vous appartiennent</span>
            <span><span class="imv-s"></span>Sans engagement</span>
          </p>
        </div>

        <aside class="imv-panel">
          <div class="imv-panel-h">Du bail au bilan, <em>tout</em> le locatif maîtrisé.</div>
          <ul class="imv-feat">
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M8 3h6l5 5v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg></span><div><b>Baux conformes</b><small>générés, signés, archivés</small></div></li>
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h4"/></svg></span><div><b>Quittances</b><small>envoyées automatiquement</small></div></li>
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/></svg></span><div><b>États des lieux</b><small>horodatés, avec photos</small></div></li>
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8"/><path d="M16 8h5v5"/></svg></span><div><b>Loyers &amp; charges</b><small>suivis et relancés</small></div></li>
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h1a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1V4a1 1 0 0 1 1-1z"/><path d="M9 13l2 2 4-4"/></svg></span><div><b>Déclaration 2044</b><small>pré-remplie</small></div></li>
            <li><span class="imv-fi"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 4a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0-3-4.5"/></svg></span><div><b>Partage SCI</b><small>chacun son accès</small></div></li>
          </ul>
          <div class="imv-panel-f">Une seule app pour <b>toutes les situations</b> — nu, meublé, SCI, colocation.</div>
        </aside>
      </div>
    </main>

    <footer class="imv-footer">
      <span class="imv-foot-copy">© 2026 Propryo · Hébergé en Europe · RGPD</span>
      <nav class="imv-foot-links" aria-label="Informations légales">
        <a href="#">Mentions légales</a><a href="#">CGU</a><a href="#">CGV</a><a href="#">Confidentialité</a><a href="#">Cookies</a><a href="#">Sous-traitance</a>
      </nav>
    </footer>

    <div class="imv-authwrap" id="imsb-authwrap">
      <div class="imv-authcard">
        <button class="imv-authclose" id="imsb-authclose" type="button" aria-label="Fermer">✕</button>
        <div id="imsb-left">
          ${brand()}
          <form id="imsb-form" class="imsb-mid" autocomplete="on">
            <h2 class="imsb-h2">Connexion</h2>
            <p class="imsb-lead">Connecte-toi pour gérer tes locations.</p>
            <div class="imsb-err" id="imsb-error" style="display:none"></div>
            <label class="imsb-flabel">Email</label>
            <input class="imsb-input" id="imsb-email" type="email" placeholder="toi@exemple.fr" required autocomplete="username">
            <label class="imsb-flabel">Mot de passe</label>
            <input class="imsb-input" id="imsb-pass" type="password" placeholder="••••••••" required autocomplete="current-password">
            <div class="imsb-forgot"><a href="#" id="imsb-forgot">Mot de passe oublié ?</a></div>
            <button class="imsb-btn imsb-primary" id="imsb-submit" type="submit">Se connecter</button>
            <p class="imsb-foot">Nouveau ? <a href="#" id="imsb-signup">Créer un compte · essai gratuit</a></p>
          </form>
        </div>
      </div>
    </div>
  </div>`
  document.body.appendChild(ov)

  // v15.422 BUG-LOGIN-PREMIERE-CONNEXION — GARDE ANTI-SUBMIT-NATIF. Le formulaire est visible
  // AVANT que wireLoginForm ait câblé le vrai onsubmit : boot() attend l'import CDN de
  // supabase-js (plusieurs secondes au 1er chargement à froid). Sans garde, « Se connecter »
  // (ou Entrée) déclenchait la soumission NATIVE du <form> → rechargement de la page → les
  // identifiants tapés disparaissaient (« la première connexion échoue »). Ici : on neutralise
  // le submit, on mémorise l'intention (_pendingSubmit) et on passe le bouton en attente ;
  // wireLoginForm REJOUE la demande dès qu'il est prêt (l'utilisateur n'a rien à refaire).
  ov._pendingSubmit = false
  const _earlyForm = ov.querySelector('#imsb-form')
  if (_earlyForm) _earlyForm.onsubmit = (e) => {
    e.preventDefault()
    ov._pendingSubmit = true
    const btn = ov.querySelector('#imsb-submit')
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="imsb-spin imsb-spin-sm"></span> Chargement…' }
  }

  // Toggle thème Clair/Sombre — bascule .mode-sombre sur #imsb-overlay, persisté (immo_theme).
  const toggle = ov.querySelector('#imsb-theme')
  if (toggle) toggle.onclick = () => {
    const dark = ov.classList.toggle('mode-sombre')
    try { localStorage.setItem('immo_theme', dark ? 'sombre' : 'clair') } catch (e) {}
  }

  // Vitrine → la connexion est une MODALE révélée au clic (le formulaire n'est plus affiché en dur).
  // #imsb-left reste dans le DOM et câblé ; on montre/cache juste sa modale via la classe imv-auth-open.
  const _openAuth = () => ov.classList.add('imv-auth-open')
  const _closeAuth = () => ov.classList.remove('imv-auth-open')
  ;['imsb-open-login', 'imsb-open-signup', 'imsb-open-signup2'].forEach(id => {
    const el = ov.querySelector('#' + id)
    if (el) el.onclick = (e) => { e.preventDefault(); _openAuth() }
  })
  const _authClose = ov.querySelector('#imsb-authclose')
  if (_authClose) _authClose.onclick = _closeAuth
  const _authWrap = ov.querySelector('#imsb-authwrap')
  if (_authWrap) _authWrap.onclick = (e) => { if (e.target === _authWrap) _closeAuth() }

  // Le lien « Créer un compte » (#imsb-signup) est câblé par wireLoginForm (bascule Connexion↔Inscription),
  // qui seul dispose de `api` pour appeler signUpEmail. Inscription gardée côté serveur par le hook allowlist.

  return ov
}

function setBusy(overlay, busy) {
  const btn = overlay.querySelector('#imsb-submit')
  if (!btn) return
  btn.disabled = busy
  btn.innerHTML = busy ? '<span class="imsb-spin imsb-spin-sm"></span> Connexion…' : 'Se connecter'
}
function showError(overlay, msg) {
  const e = overlay.querySelector('#imsb-error'); if (!e) return
  if (msg) overlay.classList.add('imv-auth-open')  // rend l'erreur visible même si la modale était fermée
  e.textContent = msg; e.style.display = msg ? 'block' : 'none'
}
function traduireErreur(m) {
  if (/invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.'
  if (/email not confirmed/i.test(m)) return 'Email non confirmé.'
  return m || 'Connexion impossible.'
}
const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function injectStyles() {
  if (document.getElementById('imsb-style')) return
  // CSS de la charte Propryo, SCOPÉ à #imsb-overlay (tokens via variables ; mode sombre = .mode-sombre).
  // RÈGLE COULEUR : neutres = la base ; corail = accent SEULEMENT (CTA / liens / focus / point logo / 1 chiffre).
  const css = `
  /* ===== TOKENS — MODE CLAIR (défaut) ===== */
  #imsb-overlay{
    --bg:#f4f5f8;
    --bg-grad:radial-gradient(120% 100% at 92% -8%,#fff4f1 0%,#f5f6f9 38%,#f1f2f6 100%);
    --surface:#ffffff; --surface-2:#f7f8fb;
    --ink:#101521; --ink-2:#3c4658; --ink-3:#6e7888;
    --line:#e4e7ee; --line-2:#eef0f5;
    --neutral-soft:#eef1f6; --neutral-ink:#42506a;
    --accent:#ff5a3c; --accent-2:#e8431f; --accent-soft:#ffe7e0; --accent-on:#ffffff;
    --good:#1a8f6f; --good-soft:#dff3ec; --warn:#b27a12; --warn-soft:#f8eed6; --bad:#d23f3f; --bad-soft:#fbe4e2; --stars:#f0a13c;
    --font:'Inter',system-ui,sans-serif;
    --display:'Schibsted Grotesk','Inter',system-ui,sans-serif;
    --display-w:800; --display-ls:-.035em; --display-lh:1.03;
    --r-xs:9px; --r:13px; --r-md:15px; --r-lg:20px; --r-xl:26px; --pill:999px;
    --shadow-sm:0 1px 2px rgba(16,21,33,.06);
    --shadow-md:0 14px 36px -18px rgba(16,21,33,.20);
    --shadow-lg:0 34px 78px -30px rgba(16,21,33,.26);
    --btn-shadow:0 12px 26px -12px rgba(255,90,60,.55);
    --dash-rotate:perspective(1700px) rotateY(-7deg) rotateX(1.5deg);
    --logo-mark-bg:#101521; --frame-border:rgba(16,21,33,.10);
    --mside-bg:#141925; --mside-fg:#aab4c6; --mside-on:rgba(255,90,60,.20); --mside-on-fg:#ffffff;
    --mbody-bg:#f6f7fa; --mbar:#cfd5e2; --mbar-hl:#ff5a3c; --mbar-muted:#e2e6ee;
  }
  /* ===== TOKENS — MODE SOMBRE ===== */
  #imsb-overlay.mode-sombre{
    --bg:#14161d;
    --bg-grad:radial-gradient(120% 100% at 90% -10%,#221a1c 0%,#14161d 42%,#11131a 100%);
    --surface:#1e222c; --surface-2:#262b37;
    --ink:#f2f5fa; --ink-2:#cdd6e3; --ink-3:#9aa6b8;
    --line:rgba(255,255,255,.12); --line-2:rgba(255,255,255,.08);
    --neutral-soft:rgba(255,255,255,.07); --neutral-ink:#aeb9cb;
    --accent:#ff6a4a; --accent-2:#ff8163; --accent-soft:rgba(255,106,74,.18); --accent-on:#1a0d09;
    --good:#3fd6a3; --good-soft:rgba(63,214,163,.16); --warn:#f1bd55; --warn-soft:rgba(241,189,85,.16); --bad:#ff7a7a; --bad-soft:rgba(255,122,122,.16); --stars:#ffb454;
    --shadow-sm:0 0 0 1px rgba(255,255,255,.05);
    --shadow-md:0 0 0 1px rgba(255,255,255,.09);
    --shadow-lg:0 0 0 1px rgba(255,255,255,.11), 0 40px 90px -40px rgba(0,0,0,.7);
    --btn-shadow:0 0 0 1px rgba(255,106,74,.45), 0 12px 30px -14px rgba(255,106,74,.5);
    --logo-mark-bg:#262b37; --frame-border:rgba(255,255,255,.10);
    --mside-bg:#10131a; --mside-fg:#9aa6b8; --mside-on:rgba(255,106,74,.20); --mside-on-fg:#ffffff;
    --mbody-bg:#171a22; --mbar:#3a4150; --mbar-hl:#ff6a4a; --mbar-muted:#2b313d;
  }

  /* ===== ROOT / PAGE ===== */
  #imsb-overlay{position:fixed;inset:0;z-index:2147483000;overflow:auto;
    background:var(--bg);background-image:var(--bg-grad);color:var(--ink);
    font-family:var(--font);line-height:1.5;-webkit-font-smoothing:antialiased;transition:background .25s}
  #imsb-overlay *{box-sizing:border-box}
  #imsb-overlay svg{display:block}
  /* Ambiance « agence » : halos corail + bleu froid, profondeur premium (portée du mockup validé) */
  #imsb-overlay::before{content:"";position:fixed;top:-18%;left:18%;width:48vw;height:48vw;
    background:radial-gradient(circle at 50% 50%,var(--accent),transparent 62%);opacity:.13;filter:blur(40px);pointer-events:none;z-index:0}
  #imsb-overlay::after{content:"";position:fixed;bottom:-24%;left:-12%;width:44vw;height:44vw;
    background:radial-gradient(circle at 50% 50%,#6f8bff,transparent 60%);opacity:.07;filter:blur(48px);pointer-events:none;z-index:0}
  #imsb-overlay.mode-sombre::before{opacity:.22}
  #imsb-overlay.mode-sombre::after{opacity:.11}
  .imsb-page{position:relative;z-index:1;max-width:1280px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:0 0 48px}

  /* ===== NAV ===== */
  .imsb-nav{display:flex;align-items:center;justify-content:space-between;padding:22px 44px;gap:20px}
  .imsb-brand{display:flex;align-items:center;gap:11px;font-family:var(--display);font-weight:var(--display-w);font-size:21px;letter-spacing:-.03em;color:var(--ink)}
  .imsb-mark{position:relative;width:36px;height:36px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;background:var(--logo-mark-bg);color:#fff;box-shadow:var(--shadow-sm);flex-shrink:0}
  .imsb-mark svg{width:20px;height:20px}
  .imsb-mark::after{content:"";position:absolute;right:6px;bottom:6px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--logo-mark-bg)}
  .imsb-name{font-weight:var(--display-w)}
  .imsb-nav-right{display:flex;align-items:center;gap:24px}
  .imsb-nav-links{display:flex;align-items:center;gap:28px;font-size:14.5px;font-weight:600;color:var(--ink-2)}
  .imsb-nav-link:hover{color:var(--accent)}
  /* toggle thème : icône neutre, halo corail au survol */
  .imsb-theme{position:relative;width:40px;height:40px;border-radius:var(--r);border:1px solid var(--line);background:var(--surface);color:var(--ink-2);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);transition:.16s}
  .imsb-theme:hover{color:var(--accent);border-color:var(--accent-soft)}
  .imsb-theme-ic{position:absolute;display:flex}.imsb-theme-ic svg{width:19px;height:19px}
  #imsb-overlay .imsb-theme-moon{display:none}#imsb-overlay .imsb-theme-sun{display:flex}
  #imsb-overlay.mode-sombre .imsb-theme-sun{display:none}#imsb-overlay.mode-sombre .imsb-theme-moon{display:flex}

  /* ===== HERO ===== */
  .imsb-hero{flex:1;display:grid;grid-template-columns:.88fr 1.12fr;gap:36px;padding:16px 44px 40px;align-items:center}
  .imsb-rate{display:inline-flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:var(--pill);padding:5px 15px 5px 6px;box-shadow:var(--shadow-sm);margin-bottom:22px}
  .imsb-avatars{display:flex}
  .imsb-avatars span{width:25px;height:25px;border-radius:50%;border:2.5px solid var(--surface);margin-left:-9px;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#fff}
  .imsb-avatars span:first-child{margin-left:0}
  .imsb-avatars .av1{background:#5566aa}.imsb-avatars .av2{background:#3f8f7a}.imsb-avatars .av3{background:#7b6bb0}.imsb-avatars .av4{background:#ff5a3c}
  .imsb-stars{color:var(--stars);letter-spacing:1px;font-size:13px}
  .imsb-rate-txt{font-size:12px;font-weight:700;color:var(--ink-2)}
  .imsb-h1{font-family:var(--display);font-weight:var(--display-w);font-size:47px;line-height:var(--display-lh);letter-spacing:var(--display-ls);color:var(--ink);margin:0}
  .imsb-hl{color:var(--accent);position:relative;display:inline-block}
  .imsb-hl::after{content:"";position:absolute;left:0;right:0;bottom:1px;height:8px;background:var(--accent-soft);border-radius:8px;z-index:-1}
  .imsb-sub{font-size:18px;color:var(--ink-2);font-weight:500;margin-top:16px;max-width:420px}
  .imsb-piliers{display:flex;gap:12px;margin-top:24px}
  .imsb-pil{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:15px 15px 14px;box-shadow:var(--shadow-sm)}
  .imsb-pi-ic{width:34px;height:34px;border-radius:var(--r-xs);display:flex;align-items:center;justify-content:center;margin-bottom:10px;background:var(--neutral-soft);color:var(--neutral-ink)}
  .imsb-pil h4{font-size:14px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px;color:var(--ink);font-family:var(--display)}
  .imsb-pil ul{list-style:none;display:flex;flex-direction:column;gap:6px;margin:0;padding:0}
  .imsb-pil li{font-size:12px;color:var(--ink-2);font-weight:600;display:flex;align-items:center;gap:7px}
  .imsb-pil li svg{width:13px;height:13px;flex-shrink:0;color:var(--good)}
  .imsb-actions{display:flex;align-items:center;gap:16px;margin-top:26px;flex-wrap:wrap}
  .imsb-stat-saved{font-size:23px;font-weight:800;color:var(--ink);letter-spacing:-.02em;line-height:1;font-family:var(--display)}
  .imsb-stat-saved em{font-style:normal;color:var(--accent)}
  .imsb-stat-saved span{display:block;font-size:12px;font-weight:600;color:var(--ink-3);letter-spacing:0;margin-top:3px}
  .imsb-trustline{margin-top:18px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-3);font-weight:600;flex-wrap:wrap}
  .imsb-trustline svg{color:var(--neutral-ink);flex-shrink:0}
  .imsb-dot{width:4px;height:4px;border-radius:50%;background:var(--line)}

  /* ===== RIGHT : dashboard + colonne login (#imsb-left) ===== */
  .imsb-right{position:relative}
  .imsb-dash{border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-lg);border:1px solid var(--frame-border);transform:var(--dash-rotate);transition:transform .4s ease}
  /* #imsb-left = la carte de connexion, posée en surimpression du dashboard (login / chargement / invitation) */
  #imsb-left{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);padding:22px;display:flex;flex-direction:column}
  /* le brand est répété dans #imsb-left (login/chargement/invitation) mais discret dans la carte */
  #imsb-left .imsb-brand{font-size:15px;margin-bottom:12px}
  #imsb-left .imsb-mark{width:26px;height:26px;border-radius:8px}
  #imsb-left .imsb-mark svg{width:15px;height:15px}
  #imsb-left .imsb-mark::after{right:4px;bottom:4px;width:5px;height:5px}
  .imsb-mid{display:flex;flex-direction:column}
  .imsb-h2{font-size:17px;font-weight:800;margin:0 0 4px;color:var(--ink);font-family:var(--display)}
  .imsb-lead{color:var(--ink-3);font-size:12.5px;line-height:1.45;margin:0 0 14px}
  .imsb-flabel{font-size:11.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px}
  .imsb-input{width:100%;border:1.5px solid var(--line);border-radius:var(--r);padding:11px 13px;font-size:14px;margin-bottom:11px;font-family:inherit;background:var(--surface-2);color:var(--ink);transition:.15s}
  .imsb-input::placeholder{color:var(--ink-3)}
  .imsb-input:focus{outline:none;border-color:var(--accent);background:var(--surface);box-shadow:0 0 0 4px var(--accent-soft)}
  .imsb-forgot{text-align:right;margin:-2px 0 13px}
  .imsb-forgot a{font-size:12px;color:var(--accent);font-weight:700;text-decoration:none}
  .imsb-btn{width:100%;border:none;cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:700;border-radius:var(--r);padding:12px;display:flex;align-items:center;justify-content:center;gap:9px;transition:.18s}
  .imsb-primary{background:var(--accent);color:var(--accent-on);box-shadow:var(--btn-shadow)}
  .imsb-primary:hover{background:var(--accent-2);transform:translateY(-1px)}
  .imsb-primary:disabled{opacity:.7;cursor:default;transform:none}
  .imsb-ghost{background:var(--surface);color:var(--ink-2);border:1.5px solid var(--line);margin-top:6px}
  .imsb-ghost:hover{color:var(--accent);border-color:var(--accent-soft)}
  .imsb-foot{text-align:center;font-size:12px;color:var(--ink-3);margin-top:13px;font-weight:500}
  .imsb-foot a{color:var(--accent);font-weight:700}
  .imsb-err{background:var(--bad-soft);border:1px solid var(--bad);color:var(--bad);border-radius:var(--r);padding:9px 11px;font-size:12.5px;margin-bottom:12px}
  .imsb-ok{background:var(--good-soft);border:1px solid var(--good);color:var(--good);border-radius:var(--r);padding:9px 11px;font-size:12.5px;font-weight:700;margin-bottom:12px}
  .imsb-note{font-size:11.5px;color:var(--ink-3);line-height:1.45;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r);padding:9px 11px;margin-top:10px}
  .imsb-note code{background:var(--neutral-soft);padding:1px 5px;border-radius:4px;font-size:11px}
  .imsb-tbl{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:12px}
  .imsb-tbl td{padding:5px 4px;border-bottom:1px solid var(--line-2);color:var(--ink-2)}
  .imsb-tbl .imsb-num{text-align:right;font-weight:700;color:var(--ink)}
  .imsb-spin{width:24px;height:24px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:imsb-rot .7s linear infinite;margin:8px auto 12px}
  .imsb-spin-sm{width:15px;height:15px;border-width:2.5px;border-top-color:var(--accent-on);margin:0;display:inline-block}
  @keyframes imsb-rot{to{transform:rotate(360deg)}}

  /* ===== APP MOCK (aperçu dashboard) ===== */
  .imsb-mock{background:var(--mbody-bg);font-size:12px}
  .imsb-mock-grid{display:grid;grid-template-columns:170px 1fr}
  .imsb-mock-side{background:var(--mside-bg);color:var(--mside-fg);padding:16px 14px}
  .imsb-m-brand{display:flex;align-items:center;gap:8px;color:#fff;font-weight:800;font-size:14px;margin-bottom:18px;font-family:var(--display)}
  .imsb-mm{position:relative;width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center}
  .imsb-mm::after{content:"";position:absolute;right:3px;bottom:3px;width:5px;height:5px;border-radius:50%;background:var(--accent)}
  .imsb-m-nav{display:flex;flex-direction:column;gap:3px}
  .imsb-m-nav a{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--r-xs);font-size:12.5px;font-weight:600;color:var(--mside-fg)}
  .imsb-m-nav a.on{background:var(--mside-on);color:var(--mside-on-fg)}
  .imsb-m-nav a svg{width:15px;height:15px;opacity:.9}
  .imsb-mock-body{padding:18px 20px;background:var(--mbody-bg)}
  .imsb-mock-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .imsb-mock-head h4{font-size:16px;font-weight:800;color:var(--ink);letter-spacing:-.02em;font-family:var(--display)}
  .imsb-m-date{font-size:11.5px;color:var(--ink-3);font-weight:600}
  .imsb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
  .imsb-kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 13px}
  .imsb-k-lab{font-size:10px;color:var(--ink-3);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
  .imsb-k-val{font-size:19px;font-weight:800;color:var(--ink);letter-spacing:-.02em;margin-top:5px;font-family:var(--display)}
  .imsb-kpi.accent .imsb-k-val{color:var(--accent)}
  .imsb-k-delta{font-size:10.5px;font-weight:700;margin-top:3px;color:var(--ink-3)}
  .imsb-k-delta.up{color:var(--good)}.imsb-k-delta.down{color:var(--bad)}
  .imsb-mock-cols{display:grid;grid-template-columns:1.5fr 1fr;gap:12px}
  .imsb-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px}
  .imsb-p-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .imsb-p-head h5{font-size:13px;font-weight:800;color:var(--ink);font-family:var(--display)}
  .imsb-p-tag{font-size:10.5px;font-weight:700;color:var(--ink-3)}
  .imsb-chart{display:flex;align-items:flex-end;gap:9px;height:96px;padding-top:6px;border-bottom:1px solid var(--line-2)}
  .imsb-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;height:100%}
  .imsb-bb{width:100%;border-radius:5px 5px 2px 2px;background:var(--mbar-muted)}
  .imsb-bar.fill .imsb-bb{background:var(--mbar)}
  .imsb-bar.hl .imsb-bb{background:var(--mbar-hl)}
  .imsb-bl{font-size:9.5px;color:var(--ink-3);font-weight:700}
  .imsb-loyers{display:flex;flex-direction:column;gap:9px}
  .imsb-loyer{display:flex;align-items:center;gap:10px}
  .imsb-l-av{width:30px;height:30px;border-radius:var(--r-xs);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
  .imsb-l-info{flex:1;min-width:0}
  .imsb-l-name{font-size:12px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .imsb-l-meta{font-size:10.5px;color:var(--ink-3);font-weight:600}
  .imsb-badge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:var(--pill)}
  .imsb-badge.b-paid{background:var(--good-soft);color:var(--good)}
  .imsb-badge.b-wait{background:var(--warn-soft);color:var(--warn)}
  .imsb-badge.b-late{background:var(--bad-soft);color:var(--bad)}
  .imsb-dashbar{display:flex;align-items:center;gap:8px;padding:9px 13px;background:var(--mside-bg);border-bottom:1px solid rgba(255,255,255,.07)}
  .imsb-dots{display:flex;gap:6px}
  .imsb-dots i{width:9px;height:9px;border-radius:50%;display:block}
  .imsb-url{flex:1;text-align:center;font-size:10.5px;color:rgba(255,255,255,.5);font-weight:600}

  /* ===== FOOTER LÉGAL (liens obligatoires LCEN/RGPD ; pages cibles à créer avec infos société) ===== */
  .imsb-legal{display:flex;align-items:center;justify-content:space-between;gap:12px 22px;flex-wrap:wrap;margin:0 44px;padding:20px 0 0;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3)}
  .imsb-legal-copy{font-weight:600}
  .imsb-legal-links{display:flex;flex-wrap:wrap;gap:8px 18px}
  .imsb-legal-links a{color:var(--ink-3);text-decoration:none;font-weight:600;transition:color .15s}
  .imsb-legal-links a:hover{color:var(--accent)}

  /* ===== VITRINE (page d'accueil crafted — portee du mockup valide) ===== */
  .imv-nav{display:flex;align-items:center;justify-content:space-between;padding:16px clamp(20px,5vw,56px);gap:20px}
  .imv-mid{display:flex;gap:26px}
  .imv-mid a{font-size:14px;font-weight:500;color:var(--ink-2);text-decoration:none;opacity:.85;transition:color .2s}
  .imv-mid a:hover{color:var(--accent);opacity:1}
  @media(max-width:840px){.imv-mid{display:none}}
  .imv-nav-link{font-size:14px;font-weight:600;color:var(--ink);text-decoration:none;cursor:pointer}
  .imv-nav-link:hover{color:var(--accent)}
  .imv-btn-mini{font-size:13.5px;font-weight:700;padding:9px 16px;border-radius:var(--r-xs);background:var(--accent);color:var(--accent-on);text-decoration:none;cursor:pointer;box-shadow:var(--btn-shadow);transition:background .15s}
  .imv-btn-mini:hover{background:var(--accent-2)}
  @media(max-width:520px){.imv-btn-mini{display:none}}
  .imv-hero{flex:1;display:flex;align-items:center;padding:clamp(12px,2vw,26px) clamp(20px,5vw,56px)}
  .imv-hero-in{max-width:1180px;width:100%;margin:0 auto;display:grid;grid-template-columns:1.02fr .98fr;gap:clamp(32px,5vw,68px);align-items:center}
  @media(max-width:880px){.imv-hero-in{grid-template-columns:1fr;gap:38px}}
  .imv-eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3);margin-bottom:clamp(20px,3vw,30px)}
  .imv-pip{width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
  .imv-h1{font-family:var(--display);font-weight:800;color:var(--ink);font-size:clamp(2.3rem,4.6vw,4rem);line-height:1.0;letter-spacing:-.035em;max-width:15ch;margin:0 0 clamp(16px,2vw,24px)}
  .imv-h1 em{font-style:normal;color:var(--accent)}
  .imv-triad{font-family:var(--display);font-weight:500;color:var(--ink-2);font-size:clamp(1.1rem,2vw,1.6rem);letter-spacing:-.01em;margin:0 0 clamp(26px,3.4vw,38px)}
  .imv-triad b{color:var(--ink);font-weight:600}
  .imv-triad i{font-style:normal;color:var(--accent);margin:0 .42em;font-weight:700}
  .imv-cta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:clamp(22px,3vw,30px)}
  .imv-btn{font-family:inherit;font-weight:600;font-size:16px;border-radius:var(--r);cursor:pointer;border:1px solid transparent;transition:transform .15s,background .15s;text-decoration:none;display:inline-flex;align-items:center;gap:9px}
  .imv-btn:active{transform:translateY(1px)}
  .imv-btn svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s}
  .imv-btn-primary{background:var(--accent);color:var(--accent-on);padding:15px 28px;box-shadow:var(--btn-shadow)}
  .imv-btn-primary:hover{background:var(--accent-2)}
  .imv-btn-primary:hover svg{transform:translateX(3px)}
  .imv-btn-ghost{background:var(--surface);color:var(--ink);padding:15px 22px;border-color:var(--line)}
  .imv-btn-ghost:hover{border-color:var(--ink-3)}
  .imv-trust{display:flex;gap:9px 18px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-3)}
  .imv-trust span{display:inline-flex;align-items:center;gap:8px}
  .imv-s{width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:.75}
  .imv-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:clamp(20px,2.2vw,28px);box-shadow:var(--shadow-lg)}
  .imv-panel-h{font-family:var(--display);font-weight:700;font-size:clamp(1.02rem,1.35vw,1.2rem);color:var(--ink);letter-spacing:-.015em;line-height:1.22;margin-bottom:16px}
  .imv-panel-h em{font-style:normal;color:var(--accent)}
  .imv-feat{list-style:none;display:flex;flex-direction:column;margin:0;padding:0}
  .imv-feat li{display:flex;gap:14px;align-items:center;padding:13px 2px;border-bottom:1px solid var(--line)}
  .imv-feat li:last-child{border-bottom:none}
  .imv-fi{width:40px;height:40px;border-radius:12px;background:var(--neutral-soft);border:1px solid var(--line);display:grid;place-items:center;flex-shrink:0}
  .imv-fi svg{width:20px;height:20px;stroke:var(--ink);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;opacity:.82}
  .imv-feat b{display:block;font-family:var(--display);font-weight:600;font-size:15.5px;color:var(--ink);letter-spacing:-.01em}
  .imv-feat small{display:block;font-size:12.5px;color:var(--ink-3);margin-top:2px}
  .imv-panel-f{margin-top:16px;padding-top:15px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-3);line-height:1.5}
  .imv-panel-f b{color:var(--accent);font-weight:600}
  .imv-footer{border-top:1px solid var(--line);margin:0 clamp(20px,5vw,56px);padding:14px 0 16px;display:flex;align-items:center;justify-content:space-between;gap:8px 22px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-3)}
  .imv-foot-copy{font-weight:600}
  .imv-foot-links{display:flex;flex-wrap:wrap;gap:6px 16px}
  .imv-foot-links a{color:var(--ink-3);text-decoration:none;font-weight:600;transition:color .15s}
  .imv-foot-links a:hover{color:var(--accent)}
  .imv-authwrap{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(8,10,15,.55)}
  #imsb-overlay.imv-auth-open .imv-authwrap{display:flex}
  .imv-authcard{position:relative;width:100%;max-width:340px}
  .imv-authclose{position:absolute;top:-42px;right:0;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);cursor:pointer;font-size:16px;line-height:1}
  .imv-authclose:hover{color:var(--accent)}

  /* ===== RESPONSIVE ===== */
  @media(max-width:1020px){
    .imsb-hero{grid-template-columns:1fr;gap:42px}
    .imsb-dash{transform:none}
    #imsb-left{position:static;width:100%;margin-top:18px;right:auto;bottom:auto}
    .imsb-h1{font-size:42px}
  }
  @media(max-width:620px){
    .imsb-nav{padding:16px 18px}
    .imsb-nav-links{display:none}
    .imsb-hero{padding:14px 18px 28px;gap:28px}
    .imsb-h1{font-size:33px}
    .imsb-sub{font-size:16px}
    .imsb-piliers{flex-direction:column}
    .imsb-kpis{grid-template-columns:repeat(2,1fr)}
    .imsb-mock-cols{grid-template-columns:1fr}
    .imsb-mock-side{display:none}
    .imsb-mock-grid{grid-template-columns:1fr}
    .imsb-legal{margin:0 18px;flex-direction:column;align-items:flex-start;gap:10px}
  }`
  const s = document.createElement('style'); s.id = 'imsb-style'; s.textContent = css
  document.head.appendChild(s)

  // Polices de la charte (Schibsted Grotesk + Inter), idempotent.
  try {
    if (!document.getElementById('imsb-fonts')) {
      const pre1 = document.createElement('link'); pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com'
      const pre2 = document.createElement('link'); pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous'
      const f = document.createElement('link'); f.id = 'imsb-fonts'; f.rel = 'stylesheet'
      f.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap'
      document.head.appendChild(pre1); document.head.appendChild(pre2); document.head.appendChild(f)
    }
  } catch (e) {}
}

// ── Démarrage (en dernier : toutes les déclarations const/function sont initialisées) ───────────
if (FLAG) {
  if (!window.IMMO_SUPABASE || !window.IMMO_SUPABASE.url) {
    console.warn('[ImmoSupabase] flag actif mais config absente (js/app/supabase-config.js → window.IMMO_SUPABASE).')
  } else {
    boot().catch(e => console.error('[ImmoSupabase] échec init :', e))
  }
}
