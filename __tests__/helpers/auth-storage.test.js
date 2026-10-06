// « Rester connecté sur cet appareil » — où vit le jeton de session. Confidentialité sur poste partagé :
// par défaut sessionStorage (fermer l'onglet déconnecte) ; localStorage seulement si l'utilisateur coche la case,
// ou dans l'application installée (PWA). AUCUN drapeau résiduel : la personne suivante ne doit JAMAIS hériter du choix.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthStorage, purgerJetonLocalLegacy, MIGRATION_KEY } from '../../js/core/auth-storage.js'

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m } }
const TOKEN = 'immo-supabase-auth'
const VERIF = TOKEN + '-code-verifier'

describe('createAuthStorage', () => {
  it('par défaut (navigateur, case décochée) : jeton en sessionStorage, JAMAIS en localStorage', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setItem(TOKEN, 'jwt-1')
    expect(session.getItem(TOKEN)).toBe('jwt-1')
    expect(local.getItem(TOKEN)).toBeNull()
    expect(s.getItem(TOKEN)).toBe('jwt-1')
    expect(s.isPersistent()).toBe(false)
  })

  it('case cochée (setPersist(true) AVANT l’écriture) : localStorage, rien en sessionStorage', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setPersist(true); s.setItem(TOKEN, 'jwt-2')
    expect(local.getItem(TOKEN)).toBe('jwt-2'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('AUCUN drapeau n’est écrit nulle part (rien ne survit à la déconnexion)', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setPersist(true); s.setItem(TOKEN, 'jwt')
    expect([...local._m.keys()]).toEqual([TOKEN])                // seulement le jeton
    expect([...session._m.keys()]).toEqual([])
  })

  it('POSTE PARTAGÉ : A coche « rester connecté », se déconnecte ; B arrive → mode session, case non héritée', () => {
    const local = mem(), session = mem()
    const a = createAuthStorage({ local, session })
    a.setPersist(true); a.setItem(TOKEN, 'jwt-A'); a.setItem(VERIF, 'v-A')
    a.removeItem(TOKEN); a.removeItem(VERIF)                       // déconnexion de A (+ purge)
    expect(local._m.size).toBe(0); expect(session._m.size).toBe(0)
    const b = createAuthStorage({ local, session })                // page suivante / personne suivante
    expect(b.isPersistent()).toBe(false)                           // rien n'est hérité
    b.setItem(TOKEN, 'jwt-B')                                      // B ne coche rien
    expect(session.getItem(TOKEN)).toBe('jwt-B'); expect(local.getItem(TOKEN)).toBeNull()
  })

  it('un jeton déjà en local (choix précédent encore connecté) reste en local : retrouvé au rechargement et réécrit en local', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-persistant')
    const s = createAuthStorage({ local, session })
    expect(s.getItem(TOKEN)).toBe('jwt-persistant')
    s.setItem(TOKEN, 'jwt-rafraichi')                              // autoRefreshToken, mode « session » par défaut
    expect(local.getItem(TOKEN)).toBe('jwt-rafraichi'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('2 onglets : l’onglet « session » qui rafraîchit n’emporte PAS le jeton persistant de l’autre onglet', () => {
    const local = mem(), session = mem()
    const onglet1 = createAuthStorage({ local, session }); onglet1.setPersist(true); onglet1.setItem(TOKEN, 'v1')
    const onglet2 = createAuthStorage({ local, session })          // ouvert avec persist=false
    onglet2.setItem(TOKEN, 'v2')                                   // son rafraîchissement
    expect(local.getItem(TOKEN)).toBe('v2'); expect(session.getItem(TOKEN)).toBeNull()
    expect(onglet1.getItem(TOKEN)).toBe('v2')                      // onglet 1 toujours connecté
  })

  it('un jeton présent seulement en sessionStorage y reste, même si persist a changé ensuite', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setItem(TOKEN, 'v1')
    s.setPersist(true)                                             // déplace ce qui existe vers le mode voulu
    expect(local.getItem(TOKEN)).toBe('v1'); expect(session.getItem(TOKEN)).toBeNull()
    s.setPersist(false)
    expect(session.getItem(TOKEN)).toBe('v1'); expect(local.getItem(TOKEN)).toBeNull()
  })

  it('deux copies (ancien jeton local + session) : l’écriture ne laisse qu’UNE copie', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'ancien'); session.setItem(TOKEN, 'autre')
    const s = createAuthStorage({ local, session })
    s.setItem(TOKEN, 'nouveau')
    expect(local.getItem(TOKEN)).toBe('nouveau'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('removeItem efface PARTOUT (déconnexion : aucun jeton ne reste, ni en local ni en onglet)', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'a'); session.setItem(TOKEN, 'b')
    createAuthStorage({ local, session }).removeItem(TOKEN)
    expect(local.getItem(TOKEN)).toBeNull(); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('application installée (standalone) : toujours localStorage, la case est sans effet', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session, standalone: true })
    expect(s.isPersistent()).toBe(true); expect(s.isStandalone()).toBe(true)
    s.setPersist(false)
    s.setItem(TOKEN, 'jwt-pwa')
    expect(local.getItem(TOKEN)).toBe('jwt-pwa'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('stockage indisponible (navigation privée stricte, quota) : ne jette jamais', () => {
    const casse = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    const s = createAuthStorage({ local: casse, session: casse })
    expect(() => s.getItem(TOKEN)).not.toThrow()
    expect(() => s.setItem(TOKEN, 'x')).not.toThrow()
    expect(() => s.removeItem(TOKEN)).not.toThrow()
    expect(() => s.setPersist(true)).not.toThrow()
  })
})

describe('jeton d’UNE AUTRE personne déjà présent (audit : le choix du clic doit l’emporter à la connexion)', () => {
  it('A est persistant (jeton en local) ; B se connecte SANS cocher → le jeton de B va en SESSION, celui de A disparaît', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-A')
    const s = createAuthStorage({ local, session })
    s.setPersist(false)                                          // clic sur « Se connecter », case décochée
    s.setItem(TOKEN, 'jwt-B')                                    // signInWithPassword écrit le jeton
    expect(session.getItem(TOKEN)).toBe('jwt-B')
    expect(local.getItem(TOKEN)).toBeNull()                      // le jeton persistant de A ne traîne plus
    expect(s.getItem(TOKEN)).toBe('jwt-B')                       // getSession restaure B, pas A
  })

  it('symétrique : jeton de A en session ; B COCHE la case → jeton de B en local, copie session supprimée', () => {
    const local = mem(), session = mem()
    session.setItem(TOKEN, 'jwt-A')
    const s = createAuthStorage({ local, session })
    s.setPersist(true); s.setItem(TOKEN, 'jwt-B')
    expect(local.getItem(TOKEN)).toBe('jwt-B'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('après la connexion, un rafraîchissement SANS nouveau clic suit l’emplacement existant', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-A')
    const s = createAuthStorage({ local, session })
    s.setPersist(false); s.setItem(TOKEN, 'jwt-B')               // connexion de B (session)
    s.setItem(TOKEN, 'jwt-B-bis')                                // autoRefreshToken
    expect(session.getItem(TOKEN)).toBe('jwt-B-bis'); expect(local.getItem(TOKEN)).toBeNull()
  })

  it('le code-verifier PKCE écrit AVANT le jeton ne consomme pas le choix : verifier ET jeton suivent la case', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-A')
    const s = createAuthStorage({ local, session })
    s.setPersist(false)
    s.setItem(VERIF, 'v-B')                                      // PKCE : verifier d'abord
    s.setItem(TOKEN, 'jwt-B')
    expect(session.getItem(VERIF)).toBe('v-B'); expect(session.getItem(TOKEN)).toBe('jwt-B')
    expect(local.getItem(TOKEN)).toBeNull()
  })

  it('création de compte PUIS connexion (confirmation sans session) : ré-armer le choix avant l’étape 2 évite l’attraction du jeton étranger', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-A')                                // jeton persistant d'une autre personne
    const s = createAuthStorage({ local, session })
    s.setPersist(false)                                          // clic de B
    s.annulerChoix()                                             // étape 1 (signUp) : aucune session écrite, choix désarmé
    s.setPersist(s.isPersistent())                               // _rearmerChoixAuth() avant l'étape 2
    s.setItem(TOKEN, 'jwt-B')                                    // étape 2 (loginEmail)
    expect(session.getItem(TOKEN)).toBe('jwt-B'); expect(local.getItem(TOKEN)).toBeNull()
  })

  it('échec de connexion : annulerChoix() — une écriture ultérieure sans rapport suit de nouveau l’emplacement existant', () => {
    const local = mem(), session = mem()
    local.setItem(TOKEN, 'jwt-A')
    const s = createAuthStorage({ local, session })
    s.setPersist(false)                                          // clic, mais le mot de passe est faux : aucune écriture
    s.annulerChoix()
    s.setItem(TOKEN, 'jwt-A-rafraichi')                          // rafraîchissement du jeton de A
    expect(local.getItem(TOKEN)).toBe('jwt-A-rafraichi'); expect(session.getItem(TOKEN)).toBeNull()
  })
})

describe('purgerJetonLocalLegacy — ancien jeton local laissé par une version précédente du site', () => {
  const cles = [TOKEN, VERIF]
  it('purge UNE fois le jeton local (hors app installée), pose son marqueur', () => {
    const local = mem()
    local.setItem(TOKEN, 'ancien-A'); local.setItem(VERIF, 'v')
    expect(purgerJetonLocalLegacy({ local, cles })).toBe(true)
    expect(local.getItem(TOKEN)).toBeNull(); expect(local.getItem(VERIF)).toBeNull()
    expect(local.getItem(MIGRATION_KEY)).toBe('1')
  })
  it('ne touche PLUS jamais ensuite un jeton persistant écrit avec la case cochée', () => {
    const local = mem(), session = mem()
    purgerJetonLocalLegacy({ local, cles })                      // 1er démarrage de cette version
    const s = createAuthStorage({ local, session }); s.setPersist(true); s.setItem(TOKEN, 'jwt-choisi')
    expect(purgerJetonLocalLegacy({ local, cles })).toBe(false)  // démarrage suivant
    expect(local.getItem(TOKEN)).toBe('jwt-choisi')
  })
  it('application installée : jamais de purge (session persistante voulue)', () => {
    const local = mem(); local.setItem(TOKEN, 'jwt-pwa')
    expect(purgerJetonLocalLegacy({ local, cles, standalone: true })).toBe(false)
    expect(local.getItem(TOKEN)).toBe('jwt-pwa')
  })
})

describe('câblage (supabase-entry.js / index.html)', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const entry = readFileSync(resolve(root, 'js/app/supabase-entry.js'), 'utf8').replace(/\r/g, '')
  const html = readFileSync(resolve(root, 'index.html'), 'utf8').replace(/\r/g, '')

  it('la case n’est JAMAIS pré-cochée (ni par le script inline, ni par _initRemember)', () => {
    expect(html).not.toMatch(/immo-rester-connecte/)
    expect(html).not.toMatch(/imsb-remember[^>]*\bchecked\b/)
    const f = entry.slice(entry.indexOf('function _initRemember'), entry.indexOf('function injectOverlay'))
    expect(f).not.toMatch(/checked\s*=(?!\s*false\b)/)         // seule affectation permise : checked = false
  })

  it('la connexion normale ET l’invitation fixent le mode AVANT d’écrire le jeton', () => {
    const wire = entry.slice(entry.indexOf('function wireLoginForm'), entry.indexOf('async function acceptInviteFlow'))
    expect(wire).toMatch(/setPersist\(!!rem\.checked\)[\s\S]*?(signUpEmail|loginEmail)/)
    const inv = entry.slice(entry.indexOf('async function acceptInviteFlow'))
    expect(inv).toMatch(/setPersist\(false\)[\s\S]*?(signUpEmail|loginEmail)/)      // invité : session de l'onglet, sans case
  })

  it('chaque connexion qui SUIT une création de compte ré-arme d’abord le choix (wireLoginForm et invitation)', () => {
    const wire = entry.slice(entry.indexOf('function wireLoginForm'), entry.indexOf('async function acceptInviteFlow'))
    expect(wire).toMatch(/_rearmerChoixAuth\(\)\s*\n\s*const r = await api\.loginEmail/)
    const inv = entry.slice(entry.indexOf('async function acceptInviteFlow'))
    expect(inv).toMatch(/_rearmerChoixAuth\(\)\s*\n\s*r = await api\.loginEmail/)
  })
})
