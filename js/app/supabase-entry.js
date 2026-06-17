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
    // page de test DÉDIÉE (index-supabase.html) : auto en http(s). PAS index.html (app quotidienne).
    return onTestPage && served
  } catch { return false }
})()

const CDN = 'https://esm.sh/@supabase/supabase-js@2'
const COUNTS = [
  ['entites', 'entités'], ['logements', 'logements'], ['baux', 'baux'], ['mouvements', 'mouvements'],
  ['quittances', 'quittances'], ['edl', 'états des lieux'], ['documents', 'documents'],
  ['mrh', 'assurances locataire'], ['agenda', 'agenda'], ['baux_historique', 'historique baux'],
]
const sizeOf = c => (Array.isArray(c) ? c.length : (c && typeof c === 'object' ? Object.keys(c).length : 0))

// En mode cloud, le boot-gate Drive legacy (`html[data-lpboot]` masque tout le body SAUF #ov-drive-connect)
// n'a aucune raison d'etre : on a notre propre overlay de login + la vraie app cloud. S'il reste leve, il
// MASQUE l'app cloud (pourtant chargee) derriere le portail Drive (bug 2026-06-16 : session persistee ->
// onLoggedIn direct sans que le boot legacy ne leve le gate). Neutralise au boot cloud + a onLoggedIn.
function _liftDriveGate() {
  try { document.documentElement.removeAttribute('data-lpboot') } catch (e) {}
  try { document.getElementById('ov-drive-connect')?.classList.add('hidden') } catch (e) {}
}

async function boot() {
  injectStyles()
  const overlay = injectOverlay()
  _liftDriveGate()   // mode cloud : pas de gate Drive (sinon il masque l'overlay de login)
  const { createClient } = await import(/* @vite-ignore */ CDN)
  const { createBoot } = await import('./supabase-boot.js')
  const client = createClient(window.IMMO_SUPABASE.url, window.IMMO_SUPABASE.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  const api = createBoot(client)

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

async function onLoggedIn(api, overlay, user) {
  renderLoading(overlay, user)
  let esp, liveDB = null, flushTimer = null, _lastFlushFn = null
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
    api.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => liveDB, schedule })
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
      injectSyncBanner(api, user, esp)            // bandeau + indicateur de sync
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
  return `<div class="imsb-brand"><div class="imsb-logo">🏠</div><div class="imsb-name">ImmoTrack</div></div>
    <div class="imsb-tag">Mode Supabase · test</div>`
}

// Bandeau permanent en mode « app complète » : rappelle qu'on est sur le cloud + indicateur de sync en
// direct. Depuis 2c, les modifications SONT enregistrées dans le cloud (plus en lecture seule). Wording +
// sortie CONTEXTUELS : en sandbox (?sandbox=1) c'est un TEST (« Quitter le test ») ; en mode cloud RÉEL
// (toggle immo_use_supabase=1) c'est le vrai mode (« Revenir en mode local »). ⚠️ La sortie COUPE TOUJOURS
// le flag immo_use_supabase=0, sinon index.html re-booterait cloud (FLAG l.18) → utilisateur PIÉGÉ à l'écran
// de login (legacy gaté, Réglages inaccessibles → pas de rollback possible).
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
      <div class="imsb-divider">ou</div>
      <button class="imsb-btn imsb-ghost" type="button" disabled title="À activer dans le dashboard Supabase">Se connecter avec Google (bientôt)</button>
    </form></div>
    <aside class="imsb-right">
      <h1 class="imsb-h1">Tes données, dans le cloud.</h1>
      <p class="imsb-sub">Synchronisé, chiffré, hébergé en Europe (RGPD). Fini la dépendance à Google Drive.</p>
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
