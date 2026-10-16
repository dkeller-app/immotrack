// PREMIERS PAS côté app (js/app/premiers-pas-app.js) — branchements sans DOM réel :
//  • la progression n'est créée qu'une fois les données du compte chargées (jamais sur le miroir d'avant la connexion) ;
//  • elle s'enregistre sans entrée d'annulation (saveDB autosave) et jamais hors ligne ni en lecture seule ;
//  • une invitation créée coche l'étape « associé » aussitôt ;
//  • une action inconnue n'exécute rien.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

let mod, saves
beforeAll(async () => {
  globalThis.window = globalThis
  globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} }, createElement: () => ({ setAttribute() {} }) }
  globalThis.addEventListener = () => {}
  mod = await import('../../js/app/premiers-pas-app.js')
})
beforeEach(() => {
  saves = []
  globalThis.DB = { entites: [], logements: [], baux: {}, mouvements: [], importRules: [], artisans: [], params: {} }
  globalThis._bootDataJobsDone = false
  globalThis._appReadOnly = false
  delete window.__immoHorsLigne
  delete window.__immoSupabaseMode
  window.saveDB = vi.fn((o) => { saves.push(o); return true })
  mod._pourTests.ext.invitations = null
})

describe('progression : création et enregistrement', () => {
  it('données pas encore chargées → aucune progression créée, rien d\'enregistré', () => {
    const r = mod._pourTests.evaluer()
    expect(r.pp).toBe(null)
    expect(DB.params.premiersPas).toBeUndefined()
    expect(saves).toHaveLength(0)
  })
  it('données chargées, compte vide → progression créée (visite à proposer), enregistrée SANS entrée d\'annulation', () => {
    globalThis._bootDataJobsDone = true
    const r = mod._pourTests.evaluer()
    expect(r.pp.visite.etat).toBe('a_proposer')
    expect(DB.params.premiersPas).toBe(r.pp)
    expect(saves).toEqual([{ autosave: true, quoi: 'premiers-pas' }])
  })
  it('aucun changement → aucun enregistrement à l\'affichage suivant', () => {
    globalThis._bootDataJobsDone = true
    mod._pourTests.evaluer(); saves.length = 0
    mod._pourTests.evaluer()
    expect(saves).toHaveLength(0)
  })
  it('hors ligne : rien n\'est créé (pas de décision « compte neuf » sur une base locale)', () => {
    globalThis._bootDataJobsDone = true; window.__immoHorsLigne = true
    expect(mod._pourTests.evaluer().pp).toBe(null)
    expect(saves).toHaveLength(0)
  })
  it('lecture seule : la date est gardée en mémoire, jamais écrite', () => {
    globalThis._bootDataJobsDone = true
    mod._pourTests.evaluer(); saves.length = 0
    globalThis._appReadOnly = true
    DB.logements.push({ ref: 'A1' })
    mod._pourTests.evaluer()
    expect(DB.params.premiersPas.etapes.logement).toBeTruthy()
    expect(saves).toHaveLength(0)
  })
  it('un logement ajouté → date première, pas « avant »', () => {
    globalThis._bootDataJobsDone = true
    mod._pourTests.evaluer()
    DB.logements.push({ ref: 'A1' })
    mod._pourTests.evaluer()
    expect(DB.params.premiersPas.etapes.logement.avant).toBeUndefined()
  })
})

describe('étapes cloud', () => {
  it('hors cloud : ni espace locataire ni associé', () => {
    const x = mod._pourTests.extActuel()
    expect(x.cloud).toBe(false)
  })
  it('cloud : le nombre d\'accès vient de EspaceLoc.nbAccesEmis, null si indisponible', () => {
    window.__immoSupabaseMode = true
    expect(mod._pourTests.extActuel().accesLocataire).toBe(null)
    window.EspaceLoc = { nbAccesEmis: () => 2 }
    expect(mod._pourTests.extActuel()).toMatchObject({ cloud: true, accesLocataire: 2 })
    delete window.EspaceLoc
  })
})

describe('cloud : première évaluation après les compteurs (statistiques justes pour les comptes antérieurs)', () => {
  it('compteurs inconnus → pas encore de progression ; connus → étapes cloud déjà faites marquées « avant »', async () => {
    globalThis._bootDataJobsDone = true; window.__immoSupabaseMode = true
    DB.entites = [{ id: 1, nom: 'SCI A', type: 'SCI' }]; DB.logements = [{ ref: 'L1' }]; DB.baux = { L1: {} }
    let n = 0
    window.__immoPartage = { compterInvitations: async () => { n++; return 2 } }
    expect(mod._pourTests.evaluer().pp).toBe(null)          // accès pas chargés, invitations pas lues
    window.EspaceLoc = { nbAccesEmis: () => 1 }
    expect(mod._pourTests.evaluer().pp).toBe(null)          // invitations pas encore lues
    await new Promise((r) => setTimeout(r, 1400))           // lecture différée (1,2 s)
    expect(n).toBe(1)
    const pp = mod._pourTests.evaluer().pp
    expect(pp.etapes.espace).toMatchObject({ avant: true })
    expect(pp.etapes.associe).toMatchObject({ avant: true })
    delete window.EspaceLoc; delete window.__immoPartage
  })
})

describe('actions', () => {
  it('une action inconnue (ou injectée) n\'exécute rien', () => {
    mod.demarrer()
    window.openBiensAdd = vi.fn()
    window.PremiersPas.faire('logement\');alert(1);//')
    window.PremiersPas.faire('inconnue')
    expect(window.openBiensAdd).not.toHaveBeenCalled()
    window.PremiersPas.faire('logement')
    expect(window.openBiensAdd).toHaveBeenCalledTimes(1)
  })
})

// Retour Didier 16/10 : « peut-on la retrouver quelque part sur l'app ? » — entrée toujours visible.
describe('entrée « Premiers pas » dans les menus', () => {
  it('barre latérale (PC, tablette) et feuille « Plus » (téléphone) ouvrent la liste, libellé + icône', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../js/app/app-part1.js', import.meta.url), 'utf8')
    const entrees = src.split('\n').filter((l) => l.includes('data-pp-entree'))
    expect(entrees).toHaveLength(2)
    for (const l of entrees) {
      expect(l).toMatch(/PremiersPas\.liste\(\)/)
      expect(l).toMatch(/_V4_NAV_ICONS\.premiersPas/)
      expect(l).toMatch(/<span>Premiers pas<\/span>/)
    }
    expect(src).toMatch(/_closeMoreSheet\(\);if\(window\.PremiersPas\)window\.PremiersPas\.liste\(\)/)
  })
})
