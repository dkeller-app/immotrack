// RETOURS 15/10 (lot 2, point 5) — appliquer une règle aux mouvements déjà enregistrés, SUR CONFIRMATION.
// Le module rend la liste en trois groupes ; il n'applique jamais rien. Un mouvement classé à la main n'est jamais
// proposé coché (règle conservatrice décrite au rapport de maquette, validée par Didier le 15/10).
import { describe, it, expect } from 'vitest'
import { mouvementsConcernes, classementApres, classeMainApresEdition, memeClassement, RAISONS } from '../../js/core/regle-application.js'

const ACC = { id: 9001, label: 'Compte SCI', bailleur: 'SCI Démo' }
const LOGS = [{ ref: 'D-101', imm: 'Les Tanneurs' }, { ref: 'D-102', imm: 'Les Tanneurs' }]
const v1 = { id: 'rg_1', mots: ['PIERRE', 'MARTIN'], motsLibres: [], sens: 'cr', compte: 9001, cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs', exceptions: [] }
const v2 = Object.assign({}, v1, { qui: 'D-101', imm: '' })
const mv = (id, o) => Object.assign({ id, date: '2026-0' + (id % 9 + 1) + '-03', lib: 'VIR M PIERRE MARTIN LOYER', cr: 803.65, db: 0, _bankAccountId: 9001, _source: 'bank_import' }, o)

const base = () => [
  mv(1, { cat: '', qui: '', imm: '' }),                                                   // à classer
  mv(2, { cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs', _rules: ['rg_1'] }),     // par l'ancienne version
  mv(3, { cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs', _rules: ['rg_1'], _classeMain: true }), // retouché, marqué
  mv(4, { cat: 'Dépôt de garantie (reçu / restitué)', qui: 'D-101', imm: 'Les Tanneurs', _rules: ['rg_1'] }), // trace mais retouché (ancien)
  mv(5, { cat: 'Loyers encaissés', qui: '', imm: '', }),                                  // même catégorie, sans affectation
  mv(6, { cat: 'Loyers encaissés', qui: 'D-102', imm: 'Les Tanneurs', _rules: ['rg_autre'] }), // autre règle
  mv(7, { cat: 'Loyers encaissés', qui: 'D-102', imm: 'Les Tanneurs' }),                  // classé sans trace
  mv(8, { cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', _rules: ['rg_1'] }), // déjà conforme → absent
  mv(9, { cat: '', _splitGroup: 'sg1' }),                                                  // découpé
  mv(10, { cat: '', _bankAccountId: 7777 }),                                               // autre compte → absent
  mv(11, { cat: '', _bankAccountId: undefined }),                                          // sans compte → absent
  mv(12, { cat: '', lib: 'VIR M PAUL DURAND LOYER' }),                                     // ne correspond pas
  mv(13, { cat: '', _deleted: true }),                                                     // supprimé
  mv(14, { cat: '', cr: 0, db: 50 }),                                                      // mauvais sens
  mv(15, { cat: '' }),                                                                     // mouvement de départ
]
const opts = (o = {}) => Object.assign({ mouvements: base(), ancienne: v1, comptes: [ACC], logements: LOGS, sourceId: 15 }, o)
const ids = arr => arr.map(x => x.id).sort((a, b) => a - b)

describe('mouvementsConcernes — trois groupes', () => {
  it('à classer : sans catégorie, ou même catégorie sans affectation (cochés par défaut côté écran)', () => {
    const g = mouvementsConcernes(v2, opts())
    expect(ids(g.aClasser)).toEqual([1, 5])
  })
  it('déjà classés par cette règle : trace de la règle ET classement encore celui de l\'ancienne version', () => {
    expect(ids(mouvementsConcernes(v2, opts()).parRegle)).toEqual([2])
  })
  it('classés autrement : à la main (marqueur), retouchés (trace mais classement différent), autre règle, sans trace, découpés', () => {
    const g = mouvementsConcernes(v2, opts())
    expect(ids(g.autrement)).toEqual([3, 4, 6, 7, 9])
    const r = Object.fromEntries(g.autrement.map(x => [x.id, x.raison]))
    expect(r).toEqual({ 3: 'main', 4: 'retouche', 6: 'autre-regle', 7: 'autrement', 9: 'decoupe' })
    for (const k of Object.values(r)) expect(RAISONS[k]).toBeTruthy()
  })
  it('jamais : autre compte, sans compte, ne correspond pas, supprimé, mauvais sens, déjà conforme, mouvement de départ', () => {
    const g = mouvementsConcernes(v2, opts())
    const tous = [...g.aClasser, ...g.parRegle, ...g.autrement].map(x => x.id)
    for (const id of [8, 10, 11, 12, 13, 14, 15]) expect(tous).not.toContain(id)
    expect(g.total).toBe(tous.length)
  })
  it('création (pas d\'ancienne version) : rien dans « par cette règle », la trace seule ne suffit pas', () => {
    const g = mouvementsConcernes(v2, opts({ ancienne: null }))
    expect(g.parRegle).toEqual([])
    expect(ids(g.autrement)).toContain(2)
  })
  it('avant / après exposés, immeuble déduit du logement affecté', () => {
    const g = mouvementsConcernes(v2, opts())
    const x = g.aClasser.find(e => e.id === 1)
    expect(x.avant).toEqual({ cat: '', qui: '', imm: '', compteurCcId: '' })
    expect(x.apres).toEqual({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', compteurCcId: '' })
  })
  it('exception de la règle : jamais proposée', () => {
    const avecEx = Object.assign({}, v2, { exceptions: [{ cle: 'date|x', date: '2026-02-03' }] })
    const m = mv(1, { cat: '', fitid: 'F1' })
    const cle = 'fitid:F1'
    const r = Object.assign({}, v2, { exceptions: [{ cle }] })
    expect(mouvementsConcernes(r, opts({ mouvements: [m] })).total).toBe(0)
    expect(mouvementsConcernes(avecEx, opts({ mouvements: [m] })).total).toBe(1)
  })
  it('règle sans compte ou supprimée : rien (une règle appartient toujours à un compte)', () => {
    expect(mouvementsConcernes(Object.assign({}, v2, { compte: '' }), opts()).total).toBe(0)
    expect(mouvementsConcernes(Object.assign({}, v2, { _deleted: true }), opts()).total).toBe(0)
  })
  it('ne modifie aucun mouvement (lecture seule)', () => {
    const mvts = base(); const avant = JSON.stringify(mvts)
    mouvementsConcernes(v2, opts({ mouvements: mvts }))
    expect(JSON.stringify(mvts)).toBe(avant)
  })
  it('triés du plus récent au plus ancien', () => {
    const g = mouvementsConcernes(v2, opts())
    const d = g.autrement.map(x => x.mv.date)
    expect(d).toEqual(d.slice().sort().reverse())
  })
})

describe('classementApres / classeMainApresEdition', () => {
  it('le compteur exclut le logement', () => {
    expect(classementApres({ qui: 'D-101' }, { compteurCcId: 'cc1' }, LOGS).qui).toBe('')
  })
  it('affectation SCI : l\'immeuble n\'est pas déduit', () => {
    expect(classementApres({ imm: 'X' }, { qui: 'SCI:Démo', imm: '' }, LOGS).imm).toBe('')
  })
  it('la fiche change la catégorie ou l\'affectation → classé à la main ; sinon non', () => {
    const a = { cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', compteurCcId: '', lib: 'A' }
    expect(classeMainApresEdition(a, Object.assign({}, a, { lib: 'B', fac: '12' }))).toBe(false)
    expect(classeMainApresEdition(a, Object.assign({}, a, { cat: 'Travaux' }))).toBe(true)
    expect(classeMainApresEdition(a, Object.assign({}, a, { qui: 'D-102' }))).toBe(true)
    expect(classeMainApresEdition({ cat: null }, { cat: '' })).toBe(false)
  })
  it('memeClassement ignore le reste', () => {
    expect(memeClassement({ cat: 'A', lib: 'x' }, { cat: 'A', lib: 'y' })).toBe(true)
  })
})

describe('relecture Fable A1 — une affectation posée HORS de la règle n\'est jamais proposée cochée', () => {
  const cat1 = Object.assign({}, v1, { qui: '', imm: '' })                 // ancienne version : catégorie seule
  const avecAff = Object.assign({}, v1, { qui: 'D-101', imm: '' })        // nouvelle version : ajoute l'affectation
  it('trace de la règle + affectation faite à la main (ancienne version sans affectation) → « retouché », décoché', () => {
    const m = mv(20, { cat: 'Loyers encaissés', qui: 'D-102', imm: 'Les Tanneurs', _rules: ['rg_1'] })
    const g = mouvementsConcernes(avecAff, opts({ mouvements: [m], ancienne: cat1 }))
    expect(g.parRegle).toEqual([])
    expect(g.autrement.map(x => [x.id, x.raison])).toEqual([[20, 'retouche']])
  })
  it('sans catégorie mais déjà affecté (drill Finances) → « déjà affecté », décoché', () => {
    const m = mv(21, { cat: '', qui: 'D-102', imm: 'Les Tanneurs' })
    const g = mouvementsConcernes(avecAff, opts({ mouvements: [m] }))
    expect(g.aClasser).toEqual([])
    expect(g.autrement.map(x => [x.id, x.raison])).toEqual([[21, 'affecte']])
    expect(RAISONS.affecte).toBe('déjà affecté')
  })
  it('sans catégorie, affectation identique à celle de la règle → reste « à classer »', () => {
    const m = mv(22, { cat: '', qui: 'D-101', imm: 'Les Tanneurs' })
    expect(mouvementsConcernes(avecAff, opts({ mouvements: [m] })).aClasser.map(x => x.id)).toEqual([22])
  })
})
