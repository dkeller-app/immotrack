// « Rester connecté sur cet appareil » — où vit le jeton de session. Confidentialité sur poste partagé :
// par défaut sessionStorage (fermer l'onglet déconnecte) ; localStorage seulement si l'utilisateur coche la case,
// ou dans l'application installée (PWA). AUCUN drapeau résiduel : la personne suivante ne doit JAMAIS hériter du choix.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthStorage } from '../../js/core/auth-storage.js'

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
})
