import { describe, it, expect } from 'vitest'
import { validateNewRef, canRenameLogement, renameLogementRef } from '../../js/core/rename-logement.js'

const stamp = x => { if (x) x._modifiedAt = 'TS'; return x }
function db() {
  return {
    logements: [{ ref: 'A', entity: 'SCI X' }],
    baux: { 'A': { ref: 'A', entity: 'SCI X', signatures: {} } },
    baux_historique: [{ ref: 'A', logement: 'A' }],
    mouvements: [{ qui: 'A' }, { qui: 'SCI:SCI X' }],
    quittances: [{ logement: 'A' }, { logement: 'A' }],
    edl: [{ logement: 'A', signatures: {} }],
    assurances: [{ logement: 'A' }],
    mrh: [{ logement: 'A' }],
    agenda: [{ logement: 'A', autoKey: 'BAIL:A:2026-01' }],
    documents: [{ parentType: 'logement', parentRef: 'A', logRef: 'A' }, { parentType: 'entite', parentRef: 'A' }],
    candidats: [{ logRef: 'A' }],
    compteursReleves: { 'A': { elec: [{ v: 1 }] } },
    equipements: { 'A': { chaudiere: { lastDate: '2026-01' } } },
    irlHistorique: [{ ref: 'A' }, { ref: 'Z' }],
    candidatLinks: [{ logRef: 'A' }],
  }
}

describe('validateNewRef', () => {
  it('refuse ref identique', () => { expect(validateNewRef(db(), 'A', 'A').ok).toBe(false) })
  it('refuse format invalide', () => { expect(validateNewRef(db(), 'A', 'a@b').ok).toBe(false) })
  it('refuse collision (norm-égale, y compris tombstone)', () => {
    const d = db(); d.logements.push({ ref: 'B2', _deleted: true })
    expect(validateNewRef(d, 'A', 'b2').ok).toBe(false)
  })
  it('accepte un nom neuf valide', () => { expect(validateNewRef(db(), 'A', 'A-cave').ok).toBe(true) })
})

describe('canRenameLogement', () => {
  it('bloque si bail locked', () => {
    const d = db(); d.baux['A'].signatures = { locked: true }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('bloque si bail signedAt', () => {
    const d = db(); d.baux['A'].signatures = { signedAt: '2026-01-01' }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('bloque si EDL signé', () => {
    const d = db(); d.edl[0].signatures = { signedAt: '2026-01-01' }
    expect(canRenameLogement(d, 'A').ok).toBe(false)
  })
  it('autorise si rien de signé', () => { expect(canRenameLogement(db(), 'A').ok).toBe(true) })
})

describe('renameLogementRef', () => {
  it('reporte les 11 rattachements + re-keye la map baux', () => {
    const d = db()
    const r = renameLogementRef(d, 'A', 'A-cave', { stamp })
    expect(r.ok).toBe(true)
    expect(d.logements[0].ref).toBe('A-cave')
    expect(d.baux['A']).toBeUndefined()
    expect(d.baux['A-cave'].ref).toBe('A-cave')
    expect(d.baux_historique[0].ref).toBe('A-cave')
    expect(d.baux_historique[0].logement).toBe('A-cave')
    expect(d.mouvements[0].qui).toBe('A-cave')
    expect(d.mouvements[1].qui).toBe('SCI:SCI X')
    expect(d.quittances.every(q => q.logement === 'A-cave')).toBe(true)
    expect(d.edl[0].logement).toBe('A-cave')
    expect(d.assurances[0].logement).toBe('A-cave')
    expect(d.mrh[0].logement).toBe('A-cave')
    expect(d.agenda[0].logement).toBe('A-cave')
    expect(d.agenda[0].autoKey).toBe('BAIL:A-cave:2026-01')
    expect(d.documents[0].parentRef).toBe('A-cave')
    expect(d.documents[0].logRef).toBe('A-cave')
    expect(d.documents[1].parentRef).toBe('A')
    expect(d.candidats[0].logRef).toBe('A-cave')
    // Collections du blob config (compteurs, équipements, IRL, liens candidat)
    expect(d.compteursReleves['A']).toBeUndefined()
    expect(d.compteursReleves['A-cave']).toEqual({ elec: [{ v: 1 }] })
    expect(d.equipements['A']).toBeUndefined()
    expect(d.equipements['A-cave']).toEqual({ chaudiere: { lastDate: '2026-01' } })
    expect(d.irlHistorique[0].ref).toBe('A-cave')
    expect(d.irlHistorique[1].ref).toBe('Z')        // autre bien intact
    expect(d.candidatLinks[0].logRef).toBe('A-cave')
    expect(r.touched).toBeGreaterThanOrEqual(16)
    expect(d.baux['A-cave']._modifiedAt).toBe('TS')
  })
  it('refuse (retourne error) si bail locked, sans muter', () => {
    const d = db(); d.baux['A'].signatures = { locked: true }
    const r = renameLogementRef(d, 'A', 'A-cave', { stamp })
    expect(r.ok).toBe(false)
    expect(d.logements[0].ref).toBe('A')
  })
  it('no-op si oldRef===newRef', () => { expect(renameLogementRef(db(), 'A', 'A', { stamp }).ok).toBe(false) })
})
