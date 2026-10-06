// « Rester connecté sur cet appareil » — où vit le jeton de session. Confidentialité sur poste partagé :
// par défaut sessionStorage (fermer l'onglet déconnecte) ; localStorage seulement si l'utilisateur coche la case,
// ou dans l'application installée (PWA).
import { describe, it, expect } from 'vitest'
import { createAuthStorage, REMEMBER_KEY } from '../../js/core/auth-storage.js'

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m } }
const TOKEN = 'immo-supabase-auth'

describe('createAuthStorage', () => {
  it('par défaut (navigateur, case décochée) : le jeton est écrit en sessionStorage, JAMAIS en localStorage', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setItem(TOKEN, 'jwt-1')
    expect(session.getItem(TOKEN)).toBe('jwt-1')
    expect(local.getItem(TOKEN)).toBeNull()
    expect(s.getItem(TOKEN)).toBe('jwt-1')
    expect(s.isPersistent()).toBe(false)
  })

  it('case cochée (setPersist(true) AVANT l’écriture) : localStorage, retiré de sessionStorage, drapeau mémorisé', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setPersist(true)
    s.setItem(TOKEN, 'jwt-2')
    expect(local.getItem(TOKEN)).toBe('jwt-2')
    expect(session.getItem(TOKEN)).toBeNull()
    expect(local.getItem(REMEMBER_KEY)).toBe('1')
  })

  it('un jeton rafraîchi plus tard est réécrit AU MÊME ENDROIT, sans doublon à l’autre', () => {
    const local = mem(), session = mem()
    const s = createAuthStorage({ local, session })
    s.setPersist(true); s.setItem(TOKEN, 'v1'); s.setItem(TOKEN, 'v2')
    expect(local.getItem(TOKEN)).toBe('v2'); expect(session.getItem(TOKEN)).toBeNull()
    s.setPersist(false); s.setItem(TOKEN, 'v3')
    expect(session.getItem(TOKEN)).toBe('v3'); expect(local.getItem(TOKEN)).toBeNull()   // l'ancienne copie persistante est retirée
    expect(local.getItem(REMEMBER_KEY)).toBeNull()
  })

  it('au rechargement : le choix « rester connecté » mémorisé remet le mode persistant, et le jeton local est retrouvé', () => {
    const local = mem(), session = mem()
    local.setItem(REMEMBER_KEY, '1'); local.setItem(TOKEN, 'jwt-persistant')
    const s = createAuthStorage({ local, session })
    expect(s.isPersistent()).toBe(true)
    expect(s.getItem(TOKEN)).toBe('jwt-persistant')
  })

  it('une session de l’onglet (sessionStorage) est retrouvée au rechargement, un local vide n’interfère pas', () => {
    const local = mem(), session = mem()
    session.setItem(TOKEN, 'jwt-onglet')
    expect(createAuthStorage({ local, session }).getItem(TOKEN)).toBe('jwt-onglet')
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
    s.setPersist(false)                                          // sans effet
    s.setItem(TOKEN, 'jwt-pwa')
    expect(local.getItem(TOKEN)).toBe('jwt-pwa'); expect(session.getItem(TOKEN)).toBeNull()
  })

  it('stockage indisponible (navigation privée stricte, quota) : ne jette jamais en lecture', () => {
    const casse = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
    const s = createAuthStorage({ local: casse, session: mem() })
    expect(() => s.getItem(TOKEN)).not.toThrow()
    expect(() => s.removeItem(TOKEN)).not.toThrow()
    expect(() => s.setPersist(true)).not.toThrow()
  })
})
