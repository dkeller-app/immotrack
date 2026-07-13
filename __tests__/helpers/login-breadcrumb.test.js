import { describe, it, expect } from 'vitest'
import { BREADCRUMB_KEY, appendCrumb, readCrumbs } from '../../js/core/login-breadcrumb.js'

// BUG-LOGIN-DOUBLE (P0 vente) — instrumentation. Le double-login est une COURSE (reload SW pendant la
// fenêtre post-login) difficile à reproduire à la demande : on pose un fil d'Ariane horodaté dans
// sessionStorage (qui SURVIT à location.reload() dans le même onglet) → au prochain incident, la
// séquence (login-ok → sw-controllerchange → sw-reload → entry-boot SANS already-connected → login-start)
// prouve la cause. Module PUR (ring-buffer + parse fail-safe) testé ici ; l'exécution
// (sessionStorage/console) vit dans supabase-entry.js + le handler SW d'index.html.

describe('BREADCRUMB_KEY — clé stable (contrat avec le wiring)', () => {
  it('est une constante non vide et distincte des clés de données', () => {
    expect(typeof BREADCRUMB_KEY).toBe('string')
    expect(BREADCRUMB_KEY.length).toBeGreaterThan(0)
    expect(BREADCRUMB_KEY).not.toBe('immotrack_v4')
  })
})

describe('appendCrumb — ring-buffer horodaté, jamais throw', () => {
  it('depuis vide (null/undefined/"") → tableau à 1 entrée {t, e}', () => {
    const out = readCrumbs(appendCrumb(null, 'entry-boot', 1000))
    expect(out).toEqual([{ t: 1000, e: 'entry-boot' }])
    expect(readCrumbs(appendCrumb(undefined, 'x', 5))).toEqual([{ t: 5, e: 'x' }])
    expect(readCrumbs(appendCrumb('', 'x', 5))).toEqual([{ t: 5, e: 'x' }])
  })

  it('empile dans l\'ordre (append en fin)', () => {
    let raw = appendCrumb(null, 'login-start', 10)
    raw = appendCrumb(raw, 'login-ok', 20)
    raw = appendCrumb(raw, 'accueil-revealed', 30)
    expect(readCrumbs(raw).map(c => c.e)).toEqual(['login-start', 'login-ok', 'accueil-revealed'])
    expect(readCrumbs(raw).map(c => c.t)).toEqual([10, 20, 30])
  })

  it('plafonne au ring-buffer (cap) : ne garde que les N plus RÉCENTS', () => {
    let raw = null
    for (let i = 0; i < 10; i++) raw = appendCrumb(raw, 'e' + i, i, 3)
    const out = readCrumbs(raw)
    expect(out.length).toBe(3)
    expect(out.map(c => c.e)).toEqual(['e7', 'e8', 'e9'])   // les 3 derniers
  })

  it('cap par défaut applique un plafond (pas de croissance illimitée)', () => {
    let raw = null
    for (let i = 0; i < 500; i++) raw = appendCrumb(raw, 'e', i)
    expect(readCrumbs(raw).length).toBeLessThanOrEqual(64)
  })

  it('entrée corrompue (JSON invalide / non-tableau) → repart d\'un buffer neuf, jamais throw', () => {
    expect(() => appendCrumb('{oops', 'x', 1)).not.toThrow()
    expect(readCrumbs(appendCrumb('{oops', 'x', 1))).toEqual([{ t: 1, e: 'x' }])
    expect(readCrumbs(appendCrumb('42', 'x', 1))).toEqual([{ t: 1, e: 'x' }])
    expect(readCrumbs(appendCrumb('{"a":1}', 'x', 1))).toEqual([{ t: 1, e: 'x' }])
  })

  it('event coercé en chaîne, robuste aux valeurs absentes', () => {
    expect(readCrumbs(appendCrumb(null, undefined, 1))[0].e).toBe('')
    expect(readCrumbs(appendCrumb(null, 123, 1))[0].e).toBe('123')
  })
})

describe('readCrumbs — parse fail-safe', () => {
  it('null / corrompu / non-tableau → []', () => {
    expect(readCrumbs(null)).toEqual([])
    expect(readCrumbs('{oops')).toEqual([])
    expect(readCrumbs('42')).toEqual([])
    expect(readCrumbs('{"a":1}')).toEqual([])
  })

  it('ne garde que les entrées bien formées {t, e}', () => {
    const raw = JSON.stringify([{ t: 1, e: 'ok' }, null, 5, { e: 'no-t' }, { t: 2, e: 'ok2' }])
    expect(readCrumbs(raw)).toEqual([{ t: 1, e: 'ok' }, { t: 2, e: 'ok2' }])
  })
})
