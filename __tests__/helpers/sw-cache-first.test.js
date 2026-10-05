// Perf — sw.js : les URL JS/CSS à empreinte (?v=<8 hex>) sont servies CACHE-FIRST (zéro réseau),
// sans revalidation ni ménage (invariant empreinte = contenu), avec contrôle du type. Le SW ne tourne pas en local :
// on exécute sw.js dans un bac à sable (vm) avec un faux `caches` / `fetch` pour en vérifier la logique.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SW = readFileSync(resolve(root, 'sw.js'), 'utf8')
const ORIGIN = 'https://app.propryo.fr'

function monde({ reseau = {}, cache = {} } = {}) {
  const store = new Map(Object.entries(cache).map(([u, t]) => [u, t]))   // url complète -> texte
  const appels = []
  const reponse = (txt, ct = 'application/javascript') => ({ ok: true, type: 'basic', headers: { get: () => ct }, text: txt, clone() { return reponse(txt, ct) } })
  const handlers = {}
  const cacheObj = {
    keys: async () => [...store.keys()].map(url => ({ url })),
    delete: async (k) => store.delete(k.url),
    put: async (req, res) => { store.set(req.url, res.text) },
    match: async (req) => store.has(req.url) ? reponse(store.get(req.url)) : undefined,
    addAll: async () => {},
  }
  const sandbox = {
    URL, Promise, console,
    location: { origin: ORIGIN },
    self: { addEventListener: (t, f) => { handlers[t] = f }, registration: { scope: ORIGIN + '/' }, skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open: async () => cacheObj, match: async (req) => cacheObj.match(req), keys: async () => [], delete: async () => true },
    fetch: async (req, opts) => {
      const url = typeof req === 'string' ? req : req.url
      appels.push({ url, opts })
      if (url in reseau) { const r = reseau[url]; return typeof r === 'function' ? r() : reponse(r) }
      return { ok: false, status: 404, type: 'basic', headers: { get: () => '' }, clone() { return this } }
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(SW, sandbox)
  const envoyer = async (path) => {
    const req = { url: ORIGIN + path, method: 'GET', mode: 'no-cors' }
    let repondu
    handlers.fetch({ request: req, respondWith: p => { repondu = p } , waitUntil: () => {} })
    const res = repondu ? await repondu : null
    await new Promise(r => setTimeout(r, 5))   // laisse finir revalidation / mise en cache en arrière-plan
    return res
  }
  return { store, appels, envoyer, reponse }
}

describe('sw.js — branche cache-first des URL à empreinte', () => {
  it('en cache : servi depuis le cache SANS AUCUN appel réseau (pas de revalidation)', async () => {
    const m = monde({ cache: { [ORIGIN + '/js/app/app-part1.js?v=a1b2c3d4']: 'CACHE' }, reseau: { [ORIGIN + '/js/app/app-part1.js?v=a1b2c3d4']: 'RESEAU' } })
    const res = await m.envoyer('/js/app/app-part1.js?v=a1b2c3d4')
    expect(res.text).toBe('CACHE')
    expect(m.appels).toHaveLength(0)
  })

  it('pas en cache : réseau, puis mis en cache (visite suivante instantanée)', async () => {
    const m = monde({ reseau: { [ORIGIN + '/js/helpers/dpe-texte.global.js?v=0f1e2d3c']: 'CODE' } })
    const res = await m.envoyer('/js/helpers/dpe-texte.global.js?v=0f1e2d3c')
    expect(res.text).toBe('CODE')
    expect(m.store.get(ORIGIN + '/js/helpers/dpe-texte.global.js?v=0f1e2d3c')).toBe('CODE')
  })

  it('deux versions : une ancienne empreinte demandée plus tard n’efface ni n’écrase la nouvelle', async () => {
    // le serveur sert par CHEMIN : même contenu NEUF sous ?v=OLD et ?v=NEW — l'ancienne clé ne doit pas être polluée
    const m = monde({
      cache: { [ORIGIN + '/js/app/app-part2.js?v=cccccccc']: 'NEUF' },
      reseau: { [ORIGIN + '/js/app/app-part2.js?v=aaaaaaaa']: 'NEUF-MAIS-SERVI-SOUS-ANCIEN-NOM' },
    })
    await m.envoyer('/js/app/app-part2.js?v=aaaaaaaa')
    expect(m.store.get(ORIGIN + '/js/app/app-part2.js?v=cccccccc')).toBe('NEUF')   // l'entrée neuve n'est pas supprimée
  })

  it('un 404 ou un type inattendu (HTML de substitution) n’est jamais mis en cache', async () => {
    const m = monde({ reseau: { [ORIGIN + '/js/x.js?v=abcdef01']: () => m.reponse('<html>', 'text/html') } })
    await m.envoyer('/js/x.js?v=abcdef01')
    expect(m.store.size).toBe(0)
    const m2 = monde()
    const r = await m2.envoyer('/js/absent.js?v=abcdef01')
    expect(r.ok).toBe(false)
    expect(m2.store.size).toBe(0)
  })

  it('main.css?v=15.709 et les URL sans empreinte restent en network-first (non concernés)', async () => {
    const m = monde({ cache: { [ORIGIN + '/css/main.css?v=15.709']: 'VIEUX' }, reseau: { [ORIGIN + '/css/main.css?v=15.709']: () => m.reponse('NEUF', 'text/css') } })
    const res = await m.envoyer('/css/main.css?v=15.709')
    expect(res.text).toBe('NEUF')                                    // le réseau gagne : pas de cache-first
    expect(m.appels[0].opts).toEqual({ cache: 'no-cache' })
  })

  it('une empreinte de 8 chiffres sans lettre (ex. un futur ?v=20261005) n’est PAS traitée comme immuable', async () => {
    const m = monde({ cache: { [ORIGIN + '/js/y.js?v=20261005']: 'VIEUX' }, reseau: { [ORIGIN + '/js/y.js?v=20261005']: 'NEUF' } })
    const res = await m.envoyer('/js/y.js?v=20261005')
    expect(res.text).toBe('NEUF')
  })
})
