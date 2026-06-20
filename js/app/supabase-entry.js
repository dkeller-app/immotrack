// js/app/supabase-entry.js — Entrée du MODE SUPABASE dans le monolithe, sous INTERRUPTEUR.
//
// Sans le flag (`?supabase=1` dans l'URL, ou localStorage immo_use_supabase=1), ce module est INERTE :
// aucun chargement réseau, aucune UI, l'app reste 100% comme aujourd'hui (localStorage + Drive). Le flag
// est notre garde-fou de bascule : on teste la version Supabase à la demande, sans risque pour l'app réelle.
//
// ÉTAPE 2a (ce fichier) : login email/mdp (Variante A) → résout l'espace → HYDRATE les vraies données
// depuis Supabase dans une variable LOCALE → affiche les compteurs (preuve bout-en-bout dans le navigateur).
// Ne touche PAS window.DB ni le rendu (ça vient à l'étape 2b). Donc zéro interférence avec l'app derrière.

const FLAG = (() => {
  try {
    const p = new URLSearchParams(location.search)
    const onTestPage = /index-supabase\.html$/.test((location.pathname || '').toLowerCase())
    const inSandbox = /[?&]sandbox=1/.test(location.search || '')
    const served = location.protocol === 'http:' || location.protocol === 'https:'
    if (p.get('supabase') === '0' || localStorage.getItem('immo_use_supabase') === '0') return false   // OFF explicite
    if (p.has('supabase') || localStorage.getItem('immo_use_supabase') === '1') return true              // ON explicite
    // opt-in « app complète » (posé par le bouton) : actif UNIQUEMENT en sandbox (?sandbox=1) → JAMAIS
    // sur l'app de tous les jours (index.html sans sandbox reste legacy, même si le flag traîne).
    if (localStorage.getItem('immo_fullapp_once') === '1' && inSandbox) return true
    // CLOUD PAR DÉFAUT (2026-06-18 — Drive DÉBRANCHÉ, « on ne garde que la version Supabase »). Toute page
    // servie en http(s) boote sur Supabase, y compris l'app de tous les jours (index.html). Échappatoire
    // legacy/Drive de secours : `?supabase=0` ou localStorage immo_use_supabase=0 (testés en tête).
    // (onTestPage conservé pour mémoire ; le défaut servi suffit désormais.)
    return served || onTestPage
  } catch { return false }
})()

const CDN = 'https://esm.sh/@supabase/supabase-js@2'
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

// En mode cloud, le boot-gate Drive legacy (`html[data-lpboot]` masque tout le body SAUF #ov-drive-connect)
// n'a aucune raison d'etre : on a notre propre overlay de login + la vraie app cloud. S'il reste leve, il
// MASQUE l'app cloud (pourtant chargee) derriere le portail Drive (bug 2026-06-16 : session persistee ->
// onLoggedIn direct sans que le boot legacy ne leve le gate). Neutralise au boot cloud + a onLoggedIn.
function _liftDriveGate() {
  try { document.documentElement.removeAttribute('data-lpboot') } catch (e) {}
  try { document.getElementById('ov-drive-connect')?.classList.add('hidden') } catch (e) {}
  // Le CSS d'index.html ne pose `display:block` que sur `#ov-drive-connect:not(.hidden)` → avec `.hidden`
  // l'élément n'est PAS masqué (display reste implicite, il reste visible EN FOND derrière l'overlay de
  // login cloud semi-transparent). On injecte UNE règle persistante qui force le `display:none`. Mode cloud
  // uniquement (ce helper n'est appelé que là) ; en legacy le fichier est inerte → l'écran Drive réapparaît.
  try {
    if (!document.getElementById('imsb-hide-drivegate')) {
      const s = document.createElement('style'); s.id = 'imsb-hide-drivegate'
      s.textContent = '#ov-drive-connect{display:none!important}'
      document.head.appendChild(s)
    }
  } catch (e) {}
}

async function boot() {
  injectStyles()
  const overlay = injectOverlay()
  _liftDriveGate()   // mode cloud : pas de gate Drive (sinon il masque l'overlay de login)
  const { createClient } = await import(/* @vite-ignore */ CDN)
  const { createBoot } = await import('./supabase-boot.js')
  const client = createClient(window.IMMO_SUPABASE.url, window.IMMO_SUPABASE.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  })
  _supaClient = client
  const api = createBoot(client)
  try { _makeDetUuid = (await import('../core/det-uuid.js')).makeDetUuid } catch (e) { console.warn('[Supabase] det-uuid', e) }

  // DÉCOUPLAGE — entite_id DÉTERMINISTE d'une SCI (par NOM), pour le chemin Storage par-SCI
  // (<espace>/<entite_id>/files/<clé>). MÊME dérivation que store-mapping (mapper entites) : detUuid sur le
  // namespace owner + ('entite', nom normalisé trim+lowercase). null si owner/fabrique pas prêts → orphelin.
  window.__immoEntiteUuid = function (nom) {
    try {
      if (!_cloudOwnerId || !_makeDetUuid) return null
      return _makeDetUuid(_cloudOwnerId)('entite', String(nom == null ? '' : nom).trim().toLowerCase())
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
      const path = (entiteSeg == null)
        ? (_cloudEspaceId + '/files/' + idbKey)
        : (_cloudEspaceId + '/' + entiteSeg + '/files/' + idbKey)
      const { error } = await client.storage.from('espace-files').upload(path, blob, { contentType: contentType || 'application/pdf', upsert: true })
      return error ? null : path
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
    const row = { espace_id: _cloudEspaceId, grants: clean }
    if (inviteEmail) row.invite_email = inviteEmail
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
  overlay.querySelector('#imsb-form').onsubmit = async (e) => {
    e.preventDefault()
    const email = overlay.querySelector('#imsb-email').value.trim()
    const pass = overlay.querySelector('#imsb-pass').value
    setBusy(overlay, true); showError(overlay, '')
    const r = await api.loginEmail(email, pass).catch(err => ({ ok: false, error: err.message }))
    setBusy(overlay, false)
    if (!r.ok) { showError(overlay, traduireErreur(r.error)); return }
    onLoggedIn(api, overlay, r.user)
  }
  overlay.querySelector('#imsb-forgot').onclick = (e) => {
    e.preventDefault()
    showError(overlay, 'Le « mot de passe oublié » nécessite un email (SMTP) à configurer — bientôt. Pour l\'instant, le mot de passe se définit côté dashboard.')
  }
  if (prefillEmail) overlay.querySelector('#imsb-email').value = prefillEmail
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
  // Indicateur de sync du bandeau (si présent). I1 : JAMAIS « Enregistré » si conflit/skipped (donc
  // pas réellement dans le cloud) — affichage honnête.
  const setSync = (state) => {
    const el = document.getElementById('imsb-sync'); if (!el) return
    el.textContent = state === 'saving' ? '⟳ Enregistrement…'
      : state === 'incomplete' ? '⚠ Sync incomplète — réessaie en modifiant'
      : state === 'error' ? '⚠ Erreur réseau — réessai à la prochaine modif'
      : '✓ Enregistré dans le cloud'
  }
  const runFlush = async (fn) => {
    flushTimer = null; setSync('saving')
    try {
      const s = await fn()   // fn = () => sync.flush() ; flush est SÉRIALISÉ côté store-sync (anti-réentrance C2)
      const incomplete = s && ((s.conflicts && s.conflicts.length) || (s.skipped && s.skipped.length))
      if (incomplete) console.warn('[Supabase] sync incomplet (conflits/skipped — modif PAS dans le cloud)', s)
      setSync(incomplete ? 'incomplete' : 'ok')
      // SYNCHRO LIVE — après une sync RÉUSSIE, signale aux AUTRES appareils de l'espace qu'il y a du neuf.
      if (!incomplete && _liveChannel) { try { _liveChannel.send({ type: 'broadcast', event: 'changed', payload: {} }) } catch (e) {} }
    } catch (e) { console.error('[Supabase] flush', e); setSync('error') }
  }
  // Scheduler debouncé (800 ms, comme Drive) : saveDB → markDirty → ici → flush cloud (gardé par version).
  const schedule = (fn) => { _lastFlushFn = fn; if (flushTimer) clearTimeout(flushTimer); flushTimer = setTimeout(() => runFlush(fn), 800) }
  // C1 : à la fermeture/masquage de l'onglet, flush IMMÉDIAT du debounce en attente — sinon la modif est
  // perdue (en mode cloud, le filet localStorage de beforeunload n'existe plus). visibilitychange:hidden +
  // pagehide = plus fiables que beforeunload pour l'async. Best-effort (réseau coupé sur close dur possible).
  const flushPendingNow = () => { if (flushTimer && _lastFlushFn) { clearTimeout(flushTimer); runFlush(_lastFlushFn) } }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPendingNow() })
  addEventListener('pagehide', flushPendingNow)
  try {
    esp = await api.resolveEspace()
    _cloudEspaceId = esp.espaceId   // DÉCOUPLAGE : permet à window.__immoCloudFileUrl de résoudre les chemins Storage
    _cloudOwnerId = esp.ownerId     // namespace detUuid (= celui du store) → window.__immoEntiteUuid résout l'entite_id d'une SCI
    api.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => liveDB, schedule })
    // SYNCHRO LIVE — canal Realtime PRIVÉ de l'espace (policies P0-D). Un autre appareil qui modifie des
    // données émet « changed » → on affiche une bannière « Actualiser » (rechargement MANUEL = zéro risque
    // d'écraser une modif locale en cours). self:false → on ne reçoit pas ses propres broadcasts.
    try {
      _liveChannel = _supaClient.channel('espace:' + esp.espaceId, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'changed' }, () => { try { _showUpdateBanner() } catch (e) {} })
        .subscribe((st) => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') console.warn('[Supabase] realtime', st) })
    } catch (e) { console.warn('[Supabase] realtime subscribe', e) }
    const db = await api.hydrate()
    // Si on tourne DANS l'app complète (points d'injection exposés par index.html) → injecter le DB
    // cloud EN MÉMOIRE + re-render + brancher la SAUVEGARDE cloud (2c). Sinon (page de test dédiée
    // index-supabase.html) → écran de compteurs + bouton.
    if (typeof window.__immoSetDB === 'function' && typeof window.__immoRender === 'function') {
      window.__immoSupabaseMode = true            // saveDB/beforeunload/storage ne toucheront pas localStorage
      if (window.__immoSetDB(db) === false) { renderProof(overlay, api, user, esp, db); return }   // DB invalide → fallback
      liveDB = db                                 // le sync lit CE DB (l'app le mute EN PLACE → diff = vraies modifs)
      api.seed(db)                                // baseline = état hydraté (aucun diff au départ)
      window.__immoMarkDirty = () => api.markDirty()   // 2c : le garde saveDB l'appelle → debounce → flush cloud
      window.__immoCloudInfo = { email: user && user.email, espaceNom: esp && esp.espaceNom }   // 2.2 : panneau Mode cloud des Reglages
      window.__immoRender()
      _liftDriveGate()   // revele l'app cloud (leve le gate Drive reste leve apres le boot legacy)
      try { localStorage.removeItem('immo_fullapp_once') } catch (e) {}   // consomme l'opt-in one-shot (M1)
      // injectSyncBanner(api, user, esp)         // bandeau bleu cloud RETIRÉ (P1 nettoyage connexion) —
      // l'escape « mode local » reste dispo dans les Réglages ; setSync no-op proprement sans le bandeau
      // (getElementById('imsb-sync') → if(!el) return). Fonction injectSyncBanner conservée (morte) au cas où.
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
        <p class="imsb-note" id="imsb-note">Ouvre l'app complète (tableau de bord, fiches, listes…) sur ces données cloud, en <b>mode bac à sable ISOLÉ</b> : ton appli de tous les jours (Drive) n'est PAS touchée. La <b>sauvegarde</b> vers le cloud arrive juste après.</p>
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
  overlay.querySelector('#imsb-left').innerHTML = `${brand()}<div class="imsb-mid">
    <div class="imsb-spin"></div><p class="imsb-lead">Chargement de tes données…</p></div>`
}

function brand() {
  return `<div class="imsb-brand"><div class="imsb-logo">🏠</div><div class="imsb-name">Lodyo</div></div>
    <div class="imsb-tag">Lodyo</div>`
}

// Bandeau permanent en mode « app complète » : rappelle qu'on est sur le cloud + indicateur de sync en
// direct. Depuis 2c, les modifications SONT enregistrées dans le cloud (plus en lecture seule). Wording +
// sortie CONTEXTUELS : en sandbox (?sandbox=1) c'est un TEST (« Quitter le test ») ; en mode cloud RÉEL
// (toggle immo_use_supabase=1) c'est le vrai mode (« Revenir en mode local »). ⚠️ La sortie COUPE TOUJOURS
// le flag immo_use_supabase=0, sinon index.html re-booterait cloud (FLAG l.18) → utilisateur PIÉGÉ à l'écran
// de login (legacy gaté, Réglages inaccessibles → pas de rollback possible).
// SYNCHRO LIVE — bannière « un autre appareil a modifié des données → Actualiser ». Idempotente (une seule
// à la fois). Le rechargement re-hydrate proprement depuis le cloud (zéro merge hasardeux, zéro écrasement).
function _showUpdateBanner() {
  if (document.getElementById('imsb-update')) return
  const css = document.createElement('style')
  css.textContent = `#imsb-update{position:fixed;top:42px;left:50%;transform:translateX(-50%);z-index:2147483001;
    background:#1e3a8a;color:#fff;font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:13px;padding:9px 14px;
    border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);display:flex;align-items:center;gap:12px}
    #imsb-update button{background:#fff;color:#1e3a8a;border:none;border-radius:7px;padding:6px 14px;font-weight:700;
    cursor:pointer;font-size:13px;font-family:inherit}#imsb-update button:hover{background:#e0e7ff}`
  document.head.appendChild(css)
  const b = document.createElement('div')
  b.id = 'imsb-update'
  b.innerHTML = '<span>🔄 Un autre appareil a modifié des données</span>'
  const btn = document.createElement('button')
  btn.textContent = 'Actualiser'
  btn.onclick = () => { try { location.reload() } catch (e) {} }
  b.appendChild(btn)
  document.body.appendChild(b)
}

function injectSyncBanner(api, user, esp) {
  if (document.getElementById('imsb-banner')) return
  const isSandbox = /[?&]sandbox=1/.test(location.search || '')
  const css = document.createElement('style')
  css.textContent = `#imsb-banner{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:linear-gradient(90deg,#163b78,#2b5fd0);
    color:#fff;font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:12.5px;padding:7px 16px;display:flex;align-items:center;
    justify-content:center;gap:14px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
    #imsb-banner b{font-weight:700}
    #imsb-banner #imsb-sync{font-weight:700;background:rgba(255,255,255,.16);padding:2px 9px;border-radius:999px}
    #imsb-banner button{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;
    padding:4px 12px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
    #imsb-banner button:hover{background:rgba(255,255,255,.28)}
    body{padding-top:34px!important}`
  document.head.appendChild(css)
  const b = document.createElement('div')
  b.id = 'imsb-banner'
  b.innerHTML = `<span>☁️ <b>Mode cloud ${isSandbox ? '(test)' : '(Supabase)'}</b> · ${escapeHtml(user.email)} · espace « ${escapeHtml(esp.espaceNom || '?')} »</span>
    <span id="imsb-sync">✓ Enregistré dans le cloud</span>
    <button id="imsb-banner-out">${isSandbox ? 'Quitter le test' : 'Revenir en mode local'}</button>`
  document.body.appendChild(b)
  const out = document.getElementById('imsb-banner-out')
  if (out) out.onclick = async () => {
    try { localStorage.setItem('immo_use_supabase', '0') } catch (e) {}   // anti-piège : index.html re-boote legacy (≠ flag resté à 1)
    try { localStorage.removeItem('immo_fullapp_once') } catch (e) {}     // consomme l'opt-in sandbox
    if (isSandbox) { try { await api.logout() } catch (e) {} }            // test → déconnexion ; réel → session gardée (réactivation fluide, comme _cloudModeRollback)
    location.href = 'index.html'
  }
}

function injectOverlay() {
  const ov = document.createElement('div')
  ov.id = 'imsb-overlay'
  ov.innerHTML = `<section class="imsb-panel"><div id="imsb-left">
    ${brand()}
    <form id="imsb-form" class="imsb-mid" autocomplete="on">
      <h2 class="imsb-h2">Accède à ton espace</h2>
      <p class="imsb-lead">Connecte-toi pour gérer tes locations.</p>
      <div class="imsb-err" id="imsb-error" style="display:none"></div>
      <label class="imsb-flabel">Email</label>
      <input class="imsb-input" id="imsb-email" type="email" placeholder="toi@exemple.fr" required autocomplete="username">
      <label class="imsb-flabel">Mot de passe</label>
      <input class="imsb-input" id="imsb-pass" type="password" placeholder="••••••••" required autocomplete="current-password">
      <div class="imsb-forgot"><a href="#" id="imsb-forgot">Mot de passe oublié ?</a></div>
      <button class="imsb-btn imsb-primary" id="imsb-submit" type="submit">Se connecter</button>
    </form></div>
    <aside class="imsb-right">
      <h1 class="imsb-h1">Tes données, dans le cloud.</h1>
      <p class="imsb-sub">Synchronisé, chiffré, hébergé en Europe (RGPD).</p>
    </aside></section>`
  document.body.appendChild(ov)
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
  const css = `
  #imsb-overlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;
    font-family:'IBM Plex Sans',system-ui,sans-serif;background:rgba(16,28,54,.55);backdrop-filter:blur(4px)}
  .imsb-panel{display:grid;grid-template-columns:440px 1fr;max-width:900px;width:100%;min-height:540px;
    background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 40px 90px -30px rgba(0,0,0,.55)}
  #imsb-left{padding:40px 42px;display:flex;flex-direction:column}
  .imsb-brand{display:flex;align-items:center;gap:12px}
  .imsb-logo{width:44px;height:44px;border-radius:10px;background:#163b78;display:grid;place-items:center;font-size:22px}
  .imsb-name{font-weight:700;font-size:21px;color:#163b78}
  .imsb-tag{margin-top:9px;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#2b5fd0;
    border:1px solid #cfdcf3;background:#f2f6fd;padding:4px 10px;border-radius:6px;width:fit-content}
  .imsb-mid{margin:auto 0;display:flex;flex-direction:column}
  .imsb-h2{font-size:23px;font-weight:700;margin:0 0 5px;color:#1a2332}
  .imsb-lead{color:#4b5870;font-size:14px;line-height:1.5;margin:0 0 18px}
  .imsb-flabel{font-size:12.5px;font-weight:600;color:#4b5870;margin-bottom:6px}
  .imsb-input{width:100%;border:1.5px solid #d4ddea;border-radius:8px;padding:12px 14px;font-size:14.5px;
    margin-bottom:13px;font-family:inherit}
  .imsb-input:focus{outline:none;border-color:#3b7ef6;box-shadow:0 0 0 3px rgba(59,126,246,.15)}
  .imsb-forgot{text-align:right;margin:-6px 0 15px}
  .imsb-forgot a{font-size:12.5px;color:#2b5fd0;font-weight:600;text-decoration:none}
  .imsb-btn{width:100%;border:none;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;border-radius:8px;
    padding:13px;display:flex;align-items:center;justify-content:center;gap:9px}
  .imsb-primary{background:linear-gradient(160deg,#1f4e9c,#2b5fd0);color:#fff}
  .imsb-primary:disabled{opacity:.7;cursor:default}
  .imsb-ghost{background:#fff;color:#1a2332;border:1.5px solid #d4ddea;margin-top:6px}
  .imsb-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:#8a96ab;font-size:12px;text-transform:uppercase}
  .imsb-divider::before,.imsb-divider::after{content:"";flex:1;height:1px;background:#e3e9f1}
  .imsb-err{background:#fdecec;border:1px solid #f3c4c4;color:#9d1c1c;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:14px}
  .imsb-ok{background:#eafaf0;border:1px solid #b6e6c8;color:#13703a;border-radius:8px;padding:10px 12px;font-size:13.5px;font-weight:600;margin-bottom:12px}
  .imsb-tbl{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:14px}
  .imsb-tbl td{padding:6px 4px;border-bottom:1px solid #eef2f7;color:#4b5870}
  .imsb-tbl .imsb-num{text-align:right;font-weight:700;color:#1a2332}
  .imsb-note{font-size:12px;color:#6b7890;line-height:1.5;background:#f7faff;border:1px solid #e0e9f6;border-radius:8px;padding:10px 12px}
  .imsb-note code{background:#e6eefb;padding:1px 5px;border-radius:4px;font-size:11px}
  .imsb-right{background:radial-gradient(800px 500px at 80% -10%,rgba(59,126,246,.3),transparent 60%),linear-gradient(160deg,#163b78,#1f4e9c);
    color:#dbe6f7;padding:48px 44px;display:flex;flex-direction:column;justify-content:center}
  .imsb-h1{font-weight:800;font-size:30px;line-height:1.15;color:#fff;margin:0 0 14px}
  .imsb-sub{font-size:15.5px;line-height:1.55;color:#aec3e3;margin:0}
  .imsb-spin{width:26px;height:26px;border:3px solid #d4ddea;border-top-color:#2b5fd0;border-radius:50%;animation:imsb-rot .7s linear infinite;margin-bottom:14px}
  .imsb-spin-sm{width:16px;height:16px;border-width:2.5px;border-top-color:#fff;margin:0;display:inline-block}
  @keyframes imsb-rot{to{transform:rotate(360deg)}}
  @media(max-width:760px){.imsb-panel{grid-template-columns:1fr}.imsb-right{display:none}#imsb-left{padding:32px 26px}}`
  const s = document.createElement('style'); s.id = 'imsb-style'; s.textContent = css
  document.head.appendChild(s)
}

// ── Démarrage (en dernier : toutes les déclarations const/function sont initialisées) ───────────
if (FLAG) {
  if (!window.IMMO_SUPABASE || !window.IMMO_SUPABASE.url) {
    console.warn('[ImmoSupabase] flag actif mais config absente (js/app/supabase-config.js → window.IMMO_SUPABASE).')
  } else {
    boot().catch(e => console.error('[ImmoSupabase] échec init :', e))
  }
}
