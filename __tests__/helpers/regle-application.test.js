// Marqueur « classé à la main » (js/core/regle-application.js). Décision de Didier du 16/10 : une règle n'affecte que le
// futur — la proposition d'application aux mouvements déjà enregistrés est retirée ; le marqueur sert au mouvement de
// départ d'une règle modifiée depuis sa fiche.
import { describe, it, expect } from 'vitest'
import * as RA from '../../js/core/regle-application.js'
const { classementDe, classeMainApresEdition, memeClassement } = RA

describe('classeMainApresEdition', () => {
  it('la fiche change la catégorie ou l\'affectation → classé à la main ; sinon non', () => {
    const a = { cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', compteurCcId: '', lib: 'A' }
    expect(classeMainApresEdition(a, Object.assign({}, a, { lib: 'B', fac: '12' }))).toBe(false)
    expect(classeMainApresEdition(a, Object.assign({}, a, { cat: 'Travaux' }))).toBe(true)
    expect(classeMainApresEdition(a, Object.assign({}, a, { qui: 'D-102' }))).toBe(true)
    expect(classeMainApresEdition(a, Object.assign({}, a, { compteurCcId: 'cc1' }))).toBe(true)
    expect(classeMainApresEdition({ cat: null }, { cat: '' })).toBe(false)
  })
  it('memeClassement ignore le reste ; classementDe ne garde que catégorie et affectation', () => {
    expect(memeClassement({ cat: 'A', lib: 'x' }, { cat: 'A', lib: 'y' })).toBe(true)
    expect(classementDe({ cat: 'A', qui: null, lib: 'x', db: 3 })).toEqual({ cat: 'A', qui: '', imm: '', compteurCcId: '' })
  })
  it('plus aucune fonction de reclassement groupé (décision du 16/10)', () => {
    expect(Object.keys(RA).sort()).toEqual(['classeMainApresEdition', 'classementDe', 'memeClassement'])
  })
})
