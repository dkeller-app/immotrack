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

// sessionStorage gardé : son accès peut throw (mode privé ancien / cookies bloqués). undefined →
// supabase retombe sur son storage mémoire interne (≈ persistSession:false), le login reste vivant.
function _safeSessionStorage() {
  try { const s = window.sessionStorage; s.getItem('__immo_probe'); return s } catch (e) { return undefined }
}

async function boot() {
  injectStyles()
  const overlay = injectOverlay()
  _liftDriveGate()   // mode cloud : pas de gate Drive (sinon il masque l'overlay de login)
  const { createClient } = await import(/* @vite-ignore */ CDN)
  const { createBoot } = await import('./supabase-boot.js')
  const client = createClient(window.IMMO_SUPABASE.url, window.IMMO_SUPABASE.anonKey, {
    // Session PAR ONGLET (sessionStorage) : pas d'auto-connexion silencieuse à froid — un nouvel
    // onglet / navigateur fermé n'a pas de session → mot de passe redemandé (besoin « ressaisir »).
    // MAIS un rechargement ou le bouton RETOUR dans le même onglet garde la session : sinon back =
    // recharge le document = plus de session (persistSession:false) = on retombe sur le login.
    auth: { persistSession: true, storage: _safeSessionStorage(), autoRefreshToken: true },
  })
  _supaClient = client
  // Jeton de session Supabase (ES256) pour authentifier l'app auprès du worker de signature : le worker
  // le vérifie via JWKS (clé publique) → AUCUNE clé/secret dans le client. '' si pas de session.
  window.__immoSupaToken = async () => {
    try { const { data } = await client.auth.getSession(); return (data && data.session && data.session.access_token) || '' } catch (e) { return '' }
  }
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
        .on('broadcast', { event: 'changed' }, () => { try { _showUpdateBanner() } catch (e) {} })
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
      api.seed(db)                                // baseline = état hydraté (aucun diff au départ)
      window.__immoMarkDirty = () => api.markDirty()   // 2c : le garde saveDB l'appelle → debounce → flush cloud
      // 2.2 : panneau Mode cloud des Réglages. isOwner/displayName (#2) : un invité scopé ne doit pas
      // hériter du nom du PROPRIÉTAIRE (DB.params est partagé par-espace) → _appUserName lit son identité.
      window.__immoCloudInfo = {
        email: user && user.email,
        espaceNom: esp && esp.espaceNom,
        isOwner: !!(user && esp && esp.ownerId && user.id === esp.ownerId),
        displayName: _displayNameFromUser(user),
      }
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
  // Logo + wordmark Propryo de la charte : pavé encre + point corail (accent identité).
  return `<div class="imsb-brand">
    <span class="imsb-mark">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.2 11 12 3.6 20.8 11M5.6 9.2V19a1 1 0 0 0 1 1H10v-5h4v5h3.4a1 1 0 0 0 1-1V9.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <span class="imsb-name">Propryo</span>
  </div>`
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
    <nav class="imsb-nav">
      ${brand()}
      <div class="imsb-nav-right">
        <div class="imsb-nav-links">
          <a href="#" class="imsb-nav-link">Fonctionnalités</a>
          <a href="#" class="imsb-nav-link">Tarifs</a>
        </div>
        <button type="button" id="imsb-theme" class="imsb-theme" aria-label="Basculer le thème clair / sombre" title="Clair / Sombre">
          <span class="imsb-theme-ic imsb-theme-sun" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <span class="imsb-theme-ic imsb-theme-moon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </span>
        </button>
      </div>
    </nav>

    <div class="imsb-hero">
      <div class="imsb-pitch">
        <div class="imsb-rate">
          <div class="imsb-avatars"><span class="av1">SL</span><span class="av2">MK</span><span class="av3">TD</span><span class="av4">PB</span></div>
          <span class="imsb-stars">★★★★★</span><span class="imsb-rate-txt">4,9/5 · 1 200+ bailleurs</span>
        </div>
        <h1 class="imsb-h1">Du bail au bilan,<br><span class="imsb-hl">tout</span> ton locatif maîtrisé.</h1>
        <p class="imsb-sub">Un seul outil pour gérer tes biens et piloter tes finances. Zéro paperasse.</p>
        <div class="imsb-piliers">
          <div class="imsb-pil">
            <div class="imsb-pi-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12h8M8 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
            <h4>Gestion</h4>
            <ul>
              <li>${_imsbCheck()}Baux &amp; révision IRL</li>
              <li>${_imsbCheck()}EDL photos &amp; quittances</li>
              <li>${_imsbCheck()}Signature à distance</li>
            </ul>
          </div>
          <div class="imsb-pil">
            <div class="imsb-pi-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5m0 14h16M8 15v-4m4 4V8m4 7v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <h4>Finance</h4>
            <ul>
              <li>${_imsbCheck()}Dashboard &amp; KPI</li>
              <li>${_imsbCheck()}Loyers · payé / relance</li>
              <li>${_imsbCheck()}Charges, régul &amp; cashflow</li>
            </ul>
          </div>
        </div>
        <div class="imsb-actions">
          <div class="imsb-stat-saved"><em>6 h</em><span>économisées / mois</span></div>
        </div>
        <div class="imsb-trustline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          Hébergé en France / Europe<span class="imsb-dot"></span>chiffré<span class="imsb-dot"></span>conforme RGPD
        </div>
      </div>

      <div class="imsb-right">
        <div class="imsb-dash">
          <div class="imsb-dashbar">
            <div class="imsb-dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
            <div class="imsb-url">app.propryo.fr/tableau-de-bord</div>
          </div>
          <div class="imsb-mock">
            <div class="imsb-mock-grid">
              <div class="imsb-mock-side">
                <div class="imsb-m-brand"><span class="imsb-mm"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3.2 11 12 3.6 20.8 11M5.6 9.2V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1V9.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Propryo</div>
                <div class="imsb-m-nav">
                  <a class="on"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/></svg>Tableau de bord</a>
                  <a><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Baux</a>
                  <a><svg viewBox="0 0 24 24" fill="none"><path d="M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Mes biens</a>
                  <a><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5m0 14h16M8 15v-4m4 4V8m4 7v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Finances</a>
                </div>
              </div>
              <div class="imsb-mock-body">
                <div class="imsb-mock-head"><h4>Tableau de bord</h4><span class="imsb-m-date">Juin 2026</span></div>
                <div class="imsb-kpis">
                  <div class="imsb-kpi accent"><div class="imsb-k-lab">Encaissé</div><div class="imsb-k-val">8 420 €</div><div class="imsb-k-delta up">▲ 4,2 %</div></div>
                  <div class="imsb-kpi"><div class="imsb-k-lab">En attente</div><div class="imsb-k-val">1 150 €</div><div class="imsb-k-delta">2 lots</div></div>
                  <div class="imsb-kpi"><div class="imsb-k-lab">Renta nette</div><div class="imsb-k-val">6,1 %</div><div class="imsb-k-delta up">▲ an</div></div>
                  <div class="imsb-kpi"><div class="imsb-k-lab">Occupation</div><div class="imsb-k-val">94 %</div><div class="imsb-k-delta up">12/13</div></div>
                </div>
                <div class="imsb-mock-cols">
                  <div class="imsb-panel">
                    <div class="imsb-p-head"><h5>Cashflow mensuel</h5><span class="imsb-p-tag">2026</span></div>
                    <div class="imsb-chart">
                      <div class="imsb-bar fill"><div class="imsb-bb" style="height:48%"></div><div class="imsb-bl">J</div></div>
                      <div class="imsb-bar fill"><div class="imsb-bb" style="height:56%"></div><div class="imsb-bl">F</div></div>
                      <div class="imsb-bar fill"><div class="imsb-bb" style="height:52%"></div><div class="imsb-bl">M</div></div>
                      <div class="imsb-bar fill"><div class="imsb-bb" style="height:66%"></div><div class="imsb-bl">A</div></div>
                      <div class="imsb-bar fill"><div class="imsb-bb" style="height:72%"></div><div class="imsb-bl">M</div></div>
                      <div class="imsb-bar hl"><div class="imsb-bb" style="height:90%"></div><div class="imsb-bl">J</div></div>
                    </div>
                  </div>
                  <div class="imsb-panel">
                    <div class="imsb-p-head"><h5>Suivi des loyers</h5><span class="imsb-p-tag">Juin</span></div>
                    <div class="imsb-loyers">
                      <div class="imsb-loyer"><div class="imsb-l-av" style="background:#3f8f7a">SL</div><div class="imsb-l-info"><div class="imsb-l-name">S. Lefèvre</div><div class="imsb-l-meta">T2 · le 5</div></div><span class="imsb-badge b-paid">Payé</span></div>
                      <div class="imsb-loyer"><div class="imsb-l-av" style="background:#b27a12">MK</div><div class="imsb-l-info"><div class="imsb-l-name">M. Kaci</div><div class="imsb-l-meta">Studio · J-2</div></div><span class="imsb-badge b-wait">Attente</span></div>
                      <div class="imsb-loyer"><div class="imsb-l-av" style="background:#7b6bb0">TD</div><div class="imsb-l-info"><div class="imsb-l-name">T. Dubois</div><div class="imsb-l-meta">T3 · relance</div></div><span class="imsb-badge b-late">Retard</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

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

  // Toggle thème Clair/Sombre — bascule .mode-sombre sur #imsb-overlay, persisté (immo_theme).
  const toggle = ov.querySelector('#imsb-theme')
  if (toggle) toggle.onclick = () => {
    const dark = ov.classList.toggle('mode-sombre')
    try { localStorage.setItem('immo_theme', dark ? 'sombre' : 'clair') } catch (e) {}
  }

  // « Créer un compte · essai gratuit » — inscription publique pas encore ouverte → message informatif.
  const signup = ov.querySelector('#imsb-signup')
  if (signup) signup.onclick = (e) => {
    e.preventDefault()
    showError(ov, "L'inscription arrive bientôt — pour l'instant le compte est créé côté admin.")
  }

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
  .imsb-page{max-width:1280px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:0 0 48px}

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
  #imsb-left{position:absolute;right:-12px;bottom:-26px;width:286px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);padding:20px;z-index:3;display:flex;flex-direction:column}
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
