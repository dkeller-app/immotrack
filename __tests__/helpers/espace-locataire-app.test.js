// ESPACE LOCATAIRE côté propriétaire (js/app/espace-locataire-app.js) — smoke du 14/10 :
//  • l'accueil était rendu AVANT l'import asynchrone des signalements → la bulle « Incidents à traiter » n'arrivait
//    qu'au changement d'onglet : l'import doit redessiner l'accueil (et seulement l'accueil, et seulement s'il a ajouté) ;
//  • « Dernière visite » : le bloc relisait les accès au plus toutes les 10 minutes → relecture à l'ouverture de la fiche.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { bailLigneCle } from '../../js/core/store-mapping.js'
import * as INC from '../../js/core/incidents.js'

const SIG_ID = '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b'
let mod, appels, DBt, api

function monter() {
  appels = { rAccueil: 0, refresh: 0, select: [] }
  DBt = { logements: [{ ref: 'L1', imm: 'Immeuble', entity: 'SCI Test' }], baux: { L1: { debut: '2025-09-01', entity: 'SCI Test', locataires: [{ nom: 'Camille' }] } }, incidents: [], documents: [] }
  globalThis.DB = DBt
  api = {
    pret: () => true,
    uuid: (...p) => 'u:' + p.join('|'),
    select: vi.fn(async (table, filtre) => {
      appels.select.push(table)
      if (table === 'locataire_signalements') return api._sigs.filter((s) => !filtre || filtre.importe_le !== null || true)
      return []
    }),
    update: vi.fn(async () => [{ id: SIG_ID }]),
    insert: vi.fn(async () => ({})),
    _sigs: [],
  }
  window.__immoEspaceLoc = api
  window.rAccueil = () => { appels.rAccueil++ }
  window._refreshAfterMutation = () => { appels.refresh++ }
  window.saveDB = () => {}
  window._stamp = () => {}
  window.showToast = () => {}
  globalThis.currentPage = 'accueil'
  const bid = api.uuid('bail', bailLigneCle('L1', undefined), 'SCI Test')
  mod._pourTests.etat.acces = [{ id: 'acc1', bail_id: bid, bail_debut: '2025-09-01', locataire_nom: 'Camille', fin_bail: null, comptes_clos_le: null }]
  api._sigs = [{ id: SIG_ID, acces_id: 'acc1', piece: 'cuisine', element: 'autre', urgence: 'faible', description: 'fuite sous évier', cree_le: '2026-10-14T10:00:00Z', photos: [], importe_le: null }]
}

beforeAll(async () => {
  globalThis.window = globalThis
  globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null }, setItem(k, v) { this._m[k] = String(v) }, removeItem(k) { delete this._m[k] } }
  globalThis._lsKey = (k) => k
  globalThis.document = { getElementById: () => null, addEventListener: () => {}, querySelector: () => null }
  globalThis.Incidents = INC
  mod = await import('../../js/app/espace-locataire-app.js')
})
beforeEach(() => { localStorage._m = {}; monter() })

describe('import des signalements → accueil redessiné', () => {
  it('l\'import ajoute un incident : l\'accueil est re-rendu (la bulle apparaît sans changer d\'onglet)', async () => {
    const n = await mod._pourTests.importerSignalements()
    expect(n).toBe(1)
    expect(DBt.incidents).toHaveLength(1)
    expect(appels.rAccueil).toBe(1)
    expect(appels.refresh).toBe(1)
  })
  it('hors accueil : pas de rendu de l\'accueil (une autre page garde son affichage)', async () => {
    globalThis.currentPage = 'biens'
    expect(await mod._pourTests.importerSignalements()).toBe(1)
    expect(appels.rAccueil).toBe(0)
  })
  it('rien de nouveau (déjà importé) : aucun re-rendu inutile', async () => {
    await mod._pourTests.importerSignalements()
    appels.rAccueil = 0
    api._sigs = []
    expect(await mod._pourTests.importerSignalements()).toBe(0)
    expect(appels.rAccueil).toBe(0)
  })
  it('un rendu de l\'accueil qui échoue ne casse pas l\'import', async () => {
    window.rAccueil = () => { throw new Error('boum') }
    expect(await mod._pourTests.importerSignalements()).toBe(1)
    expect(DBt.incidents).toHaveLength(1)
  })
})

describe('« Dernière visite » : relecture des accès à l\'ouverture de la fiche', () => {
  const attendre = () => new Promise((r) => setTimeout(r, 30))
  const log = { ref: 'L1' }
  it('accès lus il y a plus d\'une minute : la fiche relit locataire_acces', async () => {
    const e = mod._pourTests.etat
    e.charge = true; e.enCours = false; e.accesLuLe = Date.now() - 2 * 60_000
    appels.select.length = 0
    mod._pourTests.blocHtml(log, DBt.baux.L1, 'L1')
    await attendre()
    expect(appels.select).toContain('locataire_acces')
    expect(e.accesLuLe).toBeGreaterThan(Date.now() - 5000)
  })
  it('accès lus il y a quelques secondes : pas de requête superflue', async () => {
    const e = mod._pourTests.etat
    e.charge = true; e.enCours = false; e.accesLuLe = Date.now() - 5000
    appels.select.length = 0
    mod._pourTests.blocHtml(log, DBt.baux.L1, 'L1')
    await attendre()
    expect(appels.select).not.toContain('locataire_acces')
  })
})
