// __tests__/helpers/demo-isolation.test.js — COMPTE DÉMO (?demo=1) : ISOLATION démo / réel.
//
// 1. Le script du <head> d'index.html (exécuté tel quel, avec des doubles de navigateur) :
//    - hors ?demo=1 il ne touche à RIEN (horloge, réseau, stockage, IndexedDB) ;
//    - en démo : horloge figée au 05/10/2026, réseau fermé vers le cloud (Supabase, relais, Google, INSEE),
//      localStorage cloisonné sous `_demo_` (lecture, écriture, énumération, effacement), IndexedDB sous `demo__`.
// 2. Parité des QUATRE détections du mode test (boot-gate du <head>, _isTestMode, FLAG de supabase-entry, script démo).
// 3. Namespaces : `_demo_` en démo, `_test_` en sandbox, clés nues en prod (KEY, _lsKey) ; jamais d'injection
//    automatique hors démo ; le chargeur n'efface que SON namespace (« Recharger la démo » remet à zéro).
// 4. Le jeu de données : aucun jeton, aucune session de signature, aucun lien de candidature, aucun score.
import { describe, it, expect, beforeAll } from 'vitest'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraireFonction } from './_extraction-source.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lire = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r/g, '')
let HTML, P1, ENTRY, MAIN, SCRIPT_DEMO
beforeAll(() => {
  HTML = lire('index.html'); P1 = lire('js/app/app-part1.js'); ENTRY = lire('js/app/supabase-entry.js'); MAIN = lire('js/main.js')
  const i = HTML.indexOf("<script>(function(){try{\n  if(!/[?&]demo=1/.test(location.search||'')) return;")
  if (i < 0) throw new Error('script démo du <head> introuvable')
  SCRIPT_DEMO = HTML.slice(i + '<script>'.length, HTML.indexOf('</script>', i))
})

// ── Doubles de navigateur ─────────────────────────────────────────────────────────────────────────────
function navigateur(search, origine = 'https://app.propryo.fr') {
  class Storage {
    constructor() { Object.defineProperty(this, '_m', { value: new Map() }) }
    getItem(k) { return this._m.has(String(k)) ? this._m.get(String(k)) : null }
    setItem(k, v) { this._m.set(String(k), String(v)) }
    removeItem(k) { this._m.delete(String(k)) }
    key(i) { return [...this._m.keys()][i] ?? null }
    clear() { this._m.clear() }
    get length() { return this._m.size }
  }
  const ouverts = [], effaces = []
  class IDBFactory { open(n) { ouverts.push(n); return { nom: n } } deleteDatabase(n) { effaces.push(n); return {} } databases() { return Promise.resolve([{ name: 'immotrack_photos' }, { name: 'demo__immotrack_photos' }]) } }
  const appels = []
  class XMLHttpRequest { open(m, u) { appels.push(['xhr', u]) } }
  class WebSocket { constructor(u) { appels.push(['ws', u]) } }
  class EventSource { constructor(u) { appels.push(['es', u]) } }
  const localStorage = new Storage(), sessionStorage = new Storage()
  localStorage.setItem('immotrack_v4', '{"vrai":1}'); localStorage.setItem('immo-supabase-auth', 'jeton-reel'); localStorage.setItem('_test_immotrack_v4', '{"sandbox":1}')
  const w = { location: { search, href: origine + '/index.html' + search, origin: origine }, Date, Reflect, Object, Promise, URL, console: { warn() {}, info() {} },
    Storage, localStorage, sessionStorage, IDBFactory, indexedDB: new IDBFactory(), XMLHttpRequest, WebSocket, EventSource,
    navigator: { sendBeacon: (u) => { appels.push(['beacon', u]); return true } }, fetch: (u) => { appels.push(['fetch', String(u && u.url || u)]); return Promise.resolve({ ok: true }) },
    open: () => null }
  w.window = w
  vm.createContext(w)
  return { w, appels, ouverts, effaces, localStorage, sessionStorage }
}
const executer = (n) => vm.runInContext(SCRIPT_DEMO, n.w)

describe('script du <head> HORS démo : aucun effet', () => {
  for (const s of ['', '?sandbox=1', '?demo=0', '?connexion']) {
    it(`« ${s || '(aucun paramètre)'} »`, () => {
      const n = navigateur(s); const avant = { D: n.w.Date, f: n.w.fetch, x: n.w.XMLHttpRequest, ws: n.w.WebSocket, g: n.w.Storage.prototype.getItem, o: n.w.IDBFactory.prototype.open }
      executer(n)
      expect(n.w.__immoDemo).toBeUndefined()
      expect(n.w.Date).toBe(avant.D); expect(n.w.fetch).toBe(avant.f); expect(n.w.XMLHttpRequest).toBe(avant.x); expect(n.w.WebSocket).toBe(avant.ws)
      expect(n.w.Storage.prototype.getItem).toBe(avant.g); expect(n.w.IDBFactory.prototype.open).toBe(avant.o)
      expect(n.localStorage.getItem('immotrack_v4')).toBe('{"vrai":1}')
    })
  }
})

describe('script du <head> EN démo (?demo=1)', () => {
  it('marqueur + horloge figée au 05/10/2026 (dates explicites inchangées)', () => {
    const n = navigateur('?demo=1'); executer(n)
    expect(n.w.__immoDemo).toBe(true)
    const d = vm.runInContext('new Date()', n.w)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 5])
    expect(new Date(vm.runInContext('Date.now()', n.w)).getDate()).toBe(5)
    expect(vm.runInContext("new Date('2025-01-01T00:00:00Z').toISOString()", n.w)).toBe('2025-01-01T00:00:00.000Z')
    expect(vm.runInContext('new Date() instanceof Date', n.w)).toBe(true)
  })
  it('réseau fermé vers le cloud ; même origine, données et API publiques de l\'État en lecture permises', async () => {
    const n = navigateur('?demo=1'); executer(n)
    const refus = ['https://xcbtashflclswyiyvfgn.supabase.co/rest/v1/baux', 'https://bail-sign-relay.didierkeller.workers.dev/el/etat',
      'https://gmail.googleapis.com/x', 'https://api.insee.fr/series', 'https://exemple.com/', 'http://api-adresse.data.gouv.fr/search/']
    for (const u of refus) {
      await expect(n.w.fetch(u)).rejects.toThrow(/démonstration/)
      await expect(n.w.fetch({ url: u })).rejects.toThrow(/démonstration/)
      expect(() => { const x = new n.w.XMLHttpRequest(); x.open('POST', u) }).toThrow(/démonstration/)
      expect(() => new n.w.WebSocket(u.replace('https', 'wss'))).toThrow(/démonstration/)
      expect(() => new n.w.EventSource(u)).toThrow(/démonstration/)
      expect(n.w.navigator.sendBeacon(u, 'x')).toBe(false)
    }
    for (const u of ['js/app/demo-dataset.js?v=1', 'https://app.propryo.fr/js/vendor/2ddoc-instantane.json', 'data:application/pdf;base64,AA', 'blob:https://app.propryo.fr/1',
      'https://api-adresse.data.gouv.fr/search/?q=x', 'https://recherche-entreprises.api.gouv.fr/near_point', 'https://data.ademe.fr/x', 'https://www.georisques.gouv.fr/x']) {
      await expect(n.w.fetch(u)).resolves.toBeTruthy()
    }
    expect(n.appels.map((a) => a[1])).not.toContain('https://api.insee.fr/series')
    expect(n.appels.some((a) => /supabase|workers\.dev|googleapis/.test(a[1]))).toBe(false)
  })
  it('localStorage cloisonné : les vraies clés ne sont ni lues, ni écrites, ni énumérées, ni effacées', () => {
    const n = navigateur('?demo=1'); executer(n)
    const LS = n.w.localStorage
    expect(LS.getItem('immotrack_v4')).toBe(null)                  // la vraie base est invisible
    expect(LS.getItem('immo-supabase-auth')).toBe(null)            // le vrai jeton de session aussi
    LS.setItem('immotrack_v4', 'demo'); LS.setItem('_demo_x', '1'); LS.setItem('imsb-doc-express', 'd')
    expect(LS._m.get('immotrack_v4')).toBe('{"vrai":1}')           // intacte
    expect(LS._m.get('_demo_immotrack_v4')).toBe('demo')
    expect(LS._m.get('_demo_x')).toBe('1')                         // déjà préfixée : pas de double préfixe
    expect(LS._m.get('_demo_imsb-doc-express')).toBe('d')
    const cles = []; for (let i = 0; i < LS.length; i++) cles.push(LS.key(i))
    expect(cles.sort()).toEqual(['_demo_immotrack_v4', '_demo_imsb-doc-express', '_demo_x'])
    LS.removeItem('immo-supabase-auth'); expect(LS._m.get('immo-supabase-auth')).toBe('jeton-reel')
    LS.clear()
    expect([...LS._m.keys()].sort()).toEqual(['_test_immotrack_v4', 'immo-supabase-auth', 'immotrack_v4'])
    // sessionStorage n'est pas touché (jamais lu par la démo pour des données)
    n.w.sessionStorage.setItem('k', 'v'); expect(n.w.sessionStorage._m.get('k')).toBe('v')
  })
  it('IndexedDB cloisonnée : toutes les bases sous demo__ (photos, file de l\'IA, sauvegardes)', async () => {
    const n = navigateur('?demo=1'); executer(n)
    n.w.indexedDB.open('immotrack_photos', 1); n.w.indexedDB.open('propryo_ia', 1); n.w.indexedDB.open('demo__immotrack_photos')
    n.w.indexedDB.deleteDatabase('immotrack_photos')
    expect(n.ouverts).toEqual(['demo__immotrack_photos', 'demo__propryo_ia', 'demo__immotrack_photos'])
    expect(n.effaces).toEqual(['demo__immotrack_photos'])
    expect((await n.w.indexedDB.databases()).map((d) => d.name)).toEqual(['demo__immotrack_photos'])
  })
})

describe('parité des détections du mode test / démo', () => {
  const cas = ['?demo=1', '?sandbox=1', '', '?demo=0', '?x=1&demo=1']
  it('boot-gate du <head>, _isTestMode, FLAG (supabase-entry) et script démo concordent', () => {
    const gate = HTML.match(/var test = (p\.endsWith[^;]+);/)[1]
    const isTest = P1.match(/const _isTestMode = \(function\(\) \{[\s\S]*?\n\}\)\(\);/)[0]
    const isDemo = P1.match(/const _isDemoMode = \(function\(\) \{[\s\S]*?\n\}\)\(\);/)[0]
    const flag = ENTRY.match(/const FLAG = \(\(\) => \{[\s\S]*?\n\}\)\(\)/)[0]
    for (const s of cas) {
      const ctx = { location: { pathname: '/index.html', search: s, protocol: 'https:' } }; vm.createContext(ctx)
      const test = vm.runInContext('(function(){var p=location.pathname.toLowerCase(),s=location.search;return ' + gate + '})()', ctx)
      const t2 = vm.runInContext(isTest + ';_isTestMode', ctx)
      const d = vm.runInContext(isDemo + ';_isDemoMode', ctx)
      const f = vm.runInContext(flag + ';FLAG', ctx)
      const demoHead = /[?&]demo=1/.test(s)
      expect([test, t2, !f]).toEqual([t2, t2, t2])                 // test ⇔ pas de cloud
      expect(d).toBe(demoHead)                                       // même détection que le script du <head>
      if (d) expect(t2).toBe(true)                                   // la démo est TOUJOURS un harnais sans cloud
    }
  })
})

describe('namespaces et chargeur', () => {
  const ns = (search) => {
    const ctx = { location: { pathname: '/index.html', search, protocol: 'https:' } }; vm.createContext(ctx)
    const bloc = P1.slice(P1.indexOf('const _isTestMode = (function()'), P1.indexOf('function _lsKey(k)'))
    vm.runInContext(bloc.replace(/const _CLOUD_BOOT[^\n]*\n/, '') + '\n' + extraireFonction(P1, '_lsKey') + ';this.r={KEY,ns:_NS_TEST,k:_lsKey("x")};', ctx)
    return ctx.r
  }
  it('démo → _demo_ ; sandbox → _test_ ; prod → clés nues', () => {
    expect(ns('?demo=1')).toEqual({ KEY: '_demo_immotrack_v4', ns: '_demo_', k: '_demo_x' })
    expect(ns('?sandbox=1')).toEqual({ KEY: '_test_immotrack_v4', ns: '_test_', k: '_test_x' })
    expect(ns('')).toEqual({ KEY: 'immotrack_v4', ns: '_test_', k: 'x' })
  })
  it('jamais d\'injection automatique hors démo : seul le bandeau démo charge sans geste', () => {
    const banniere = extraireFonction(P1, '_injectDemoBanner')
    expect(banniere).toMatch(/if \(!_isDemoMode\) return;/)
    expect(banniere).toMatch(/if \(!localStorage\.getItem\(_lsKey\('demo_charge'\)\)\) _loadDemoDataset\(\)/)
    const sandbox = extraireFonction(P1, '_injectTestModeBanner')
    expect(sandbox).toMatch(/if \(_isDemoMode\) \{ _injectDemoBanner\(\); return; \}/)
    // Le bouton du sandbox exige une confirmation ; aucun autre appel du chargeur dans l'app.
    const appels = (P1.match(/_loadDemoDataset\(\);/g) || []).length
    expect(appels).toBe(3)   // bouton sandbox (après confirm), « Recharger la démo » (après confirm), 1re ouverture en démo
    expect(extraireFonction(P1, '_loadDemoDataset')).toMatch(/if \(!_isTestMode\) \{[^}]*return; \}/)
    expect(MAIN).toMatch(/if \(window\.__immoDemo === true\) \{ try \{ import\('\.\/app\/demo-app\.js'\)/)
  })
  it('« Recharger la démo » : nouvelle base écrite et relue AVANT tout effacement, puis seul l\'espace démo est vidé', async () => {
    const m = new Map([['immotrack_v4', 'VRAI'], ['immo-supabase-auth', 'jeton'], ['_test_immotrack_v4', 'SANDBOX'],
      ['_demo_immotrack_v4', 'ANCIENNE'], ['_demo_demo_nuage', '{}'], ['_demo_demo_charge', 'x'], ['_demo_immotrack_archi_v1_done', '1'], ['_demo_immotrack_theme_mode', 'dark']])
    const localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } }
    let recharge = 0
    const idb = []
    const db = { entites: [{ nom: 'SCI' }], logements: [{ ref: 'D-101' }, { ref: 'D-102' }] }
    const ctx = { localStorage, console: { info() {}, warn() {}, error() {} }, JSON, Object, Error, Promise, Date,
      window: { __demoDataset: { construire: () => ({ db, fichiers: { demo_edl_1: 'data:x' }, nuage: { acces: [] } }) } },
      location: { reload: () => { recharge++ } }, alert: (e) => { throw new Error('alerte : ' + e) },
      _isTestMode: true, _isDemoMode: true, _NS_TEST: '_demo_', KEY: '_demo_immotrack_v4', IMMOTRACK_VERSION: 't', DB: {},
      _lsKey: (k) => '_demo_' + k, _idbPut: async (k, v) => { idb.push(k) }, _miroirEcrire: (json) => { m.set('_demo_immotrack_v4', json); return true } }
    vm.createContext(ctx)
    vm.runInContext(extraireFonction(P1, '_loadDemoDataset') + ';_loadDemoDataset();', ctx)
    await new Promise((r) => setTimeout(r, 20))
    expect(recharge).toBe(1)
    expect(idb).toEqual(['demo_edl_1'])
    expect(JSON.parse(m.get('_demo_immotrack_v4'))).toEqual(db)
    expect(m.get('immotrack_v4')).toBe('VRAI'); expect(m.get('immo-supabase-auth')).toBe('jeton'); expect(m.get('_test_immotrack_v4')).toBe('SANDBOX')
    expect(m.has('_demo_demo_nuage')).toBe(false)                 // le nuage fictif sera resemé au démarrage
    expect(m.get('_demo_immotrack_archi_v1_done')).toBe('1')      // marqueur de migration gardé
    expect(m.get('_demo_demo_nuage_plan')).toBe('{"acces":[]}')
    expect(m.get('_demo_immotrack_theme_mode')).toBe('sobre')
    expect(m.get('_demo_demo_charge')).toBeTruthy()
  })
  it('écriture refusée (quota) : rien n\'est effacé, pas de rechargement', async () => {
    const m = new Map([['_demo_immotrack_v4', 'ANCIENNE'], ['_demo_demo_nuage', '{}']])
    const localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } }
    let recharge = 0, alerte = ''
    const ctx = { localStorage, console: { info() {}, warn() {}, error() {} }, JSON, Object, Error, Promise, Date,
      window: { __demoDataset: { construire: () => ({ db: { logements: [{}] }, fichiers: {} }) } }, location: { reload: () => { recharge++ } }, alert: (e) => { alerte = e },
      _isTestMode: true, _isDemoMode: true, _NS_TEST: '_demo_', KEY: '_demo_immotrack_v4', IMMOTRACK_VERSION: 't', DB: {}, _lsKey: (k) => '_demo_' + k,
      _idbPut: async () => {}, _miroirEcrire: () => { throw new Error('QuotaExceededError') } }
    vm.createContext(ctx)
    vm.runInContext(extraireFonction(P1, '_loadDemoDataset') + ';_loadDemoDataset();', ctx)
    await new Promise((r) => setTimeout(r, 20))
    expect(recharge).toBe(0); expect(alerte).toMatch(/Quota/)
    expect(m.get('_demo_immotrack_v4')).toBe('ANCIENNE'); expect(m.get('_demo_demo_nuage')).toBe('{}')
  })
  it('refusé hors mode test (prod) : rien n\'est chargé', () => {
    let lu = false
    const ctx = { console: { warn() {} }, _isTestMode: false, window: { get __demoDataset() { lu = true; return null } } }
    vm.createContext(ctx)
    vm.runInContext(extraireFonction(P1, '_loadDemoDataset') + ';_loadDemoDataset();', ctx)
    expect(lu).toBe(false)
  })
})

describe('jeu de données de la démo', () => {
  let ds
  beforeAll(() => {
    const canvas = { getContext: () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true } }), toDataURL: () => 'data:image/png;base64,AA' }
    const ctx = { window: {}, document: { createElement: () => canvas }, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), JSON, Object, Math, String, Array }
    vm.createContext(ctx)
    vm.runInContext(lire('js/app/demo-dataset.js'), ctx)
    ds = ctx.window.__demoDataset.construire()
  })
  it('aucun jeton, aucune session de signature à distance, aucun lien de candidature, aucun score sur une personne', () => {
    const t = JSON.stringify(ds)
    for (const interdit of ['ownerToken', 'remoteSession', 'candidatLinks', 'confianceScore', 'jeton_sha256":"', 'sessionId', 'bailSignRelayUrl']) expect(t).not.toContain(interdit)
    expect(ds.db.params.bailSignRelayUrl).toBeUndefined()
  })
  it('cohérence : chaque incident, accès, signalement et pièce pointe vers un lot / bail / candidat existant', () => {
    const refs = new Set(ds.db.logements.map((l) => l.ref))
    for (const i of ds.db.incidents) expect(refs.has(i.logRef)).toBe(true)
    for (const a of ds.nuage.acces) expect(ds.db.baux[a.ref]).toBeTruthy()
    const acces = new Set(ds.nuage.acces.map((a) => a.id))
    for (const s of ds.nuage.signalements) expect(acces.has(s.acces)).toBe(true)
    const cands = new Set(ds.db.candidats.map((c) => c.id))
    for (const d of ds.db.documents.filter((x) => x.parentType === 'candidat')) expect(cands.has(d.parentId)).toBe(true)
    const inc = ds.db.incidents.find((i) => i.id === 4002)
    expect(ds.db.mouvements.find((m) => m.id === inc.mouvementIds[0])).toMatchObject({ incidentId: 4002, db: 145, qui: 'P-201' })
    for (const i of ds.db.incidents) if (i.circuit) expect(ds.nuage.artisanAcces.some((x) => x.id === i.circuit.accesId)).toBe(true)
  })
  it('briques récentes présentes : nom d\'affichage, dépôt non versé, bail et EDL signés hors Propryo', () => {
    expect(ds.db.logements.find((l) => l.ref === 'D-101').libelle).toBe('T2 du rez-de-chaussée')
    expect(ds.db.baux['D-102'].dgVerse).toBe(false)
    expect(ds.db.baux['P-202'].signatures).toMatchObject({ format: 2, mode: 'externe', signatureSource: 'externe', externe: { origine: 'papier' } })
    expect(ds.db.baux['P-202'].signatures.bailleur).toBeUndefined()   // aucune signature simulée
    expect(ds.db.edl.find((e) => e.logement === 'P-202')).toMatchObject({ externe: { pjDocId: null }, signatures: {} })
    expect(ds.db.entites[0].incidentReglages.valideLe).toBeTruthy()
  })
})
