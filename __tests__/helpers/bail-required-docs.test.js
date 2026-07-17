import { describe, it, expect } from 'vitest'
import { computeRequiredDocs, PIECES_META } from './bail-required-docs.js'

const doc = (keys) => ({ id: 1, name: 'f.pdf', requirementKeys: keys })

describe('computeRequiredDocs — résolution d’état (pur)', () => {
  it('diagnostic applicable + fichier tagué → ok', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true },
      imm: {}, log: { ref: 'F-1' }, documents: [doc(['dpe'])],
    })
    const dpe = r.find(p => p.key === 'dpe')
    expect(dpe.state).toBe('ok')
    expect(dpe.files.map(f => f.id)).toEqual([1])
  })

  it('diagnostic applicable sans fichier → miss', () => {
    const r = computeRequiredDocs({ diagApplicability: { gaz: true }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'gaz').state).toBe('miss')
  })

  it('applicabilité null (champ décisif absent) → verify', () => {
    const r = computeRequiredDocs({ diagApplicability: { gaz: null }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'gaz').state).toBe('verify')
  })

  it('applicabilité null MAIS fichier joint → ok (présence prime sur le doute)', () => {
    const r = computeRequiredDocs({ diagApplicability: { gaz: null }, imm: {}, log: {}, documents: [doc(['gaz'])] })
    expect(r.find(p => p.key === 'gaz').state).toBe('ok')
  })

  it('applicabilité false → na (même avec un fichier résiduel)', () => {
    const r = computeRequiredDocs({ diagApplicability: { crep: false }, imm: {}, log: {}, documents: [doc(['crep'])] })
    expect(r.find(p => p.key === 'crep').state).toBe('na')
  })

  it('applicabilité false → na', () => {
    const r = computeRequiredDocs({ diagApplicability: { crep: false }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'crep').state).toBe('na')
  })

  it('un seul fichier à requirementKeys multiples satisfait plusieurs pièces', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true, amiante: true, elec: true },
      imm: {}, log: {}, documents: [doc(['dpe', 'amiante', 'elec'])],
    })
    expect(r.filter(p => p.state === 'ok').map(p => p.key).sort()).toEqual(['amiante', 'dpe', 'elec'])
  })

  it('copropriété (nbLots>1) → règlement copro requis ; sinon na', () => {
    const yes = computeRequiredDocs({ diagApplicability: {}, imm: { nbLots: 8 }, log: {}, documents: [] })
    expect(yes.find(p => p.key === 'copro').state).toBe('miss')
    const no = computeRequiredDocs({ diagApplicability: {}, imm: { nbLots: 1 }, log: {}, documents: [] })
    expect(no.find(p => p.key === 'copro').state).toBe('na')
  })

  it('documents supprimés (_deleted) ne satisfont pas', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true }, imm: {}, log: {},
      documents: [{ id: 9, requirementKeys: ['dpe'], _deleted: true }],
    })
    expect(r.find(p => p.key === 'dpe').state).toBe('miss')
  })

  it('chaque pièce porte label/legal/level depuis PIECES_META', () => {
    const r = computeRequiredDocs({ diagApplicability: { dpe: true }, imm: {}, log: {}, documents: [] })
    const dpe = r.find(p => p.key === 'dpe')
    expect(dpe.label).toBe(PIECES_META.dpe.label)
    expect(dpe.level).toBe('logement')
    expect(PIECES_META.copro.level).toBe('immeuble')
  })
})

describe('completenessCount — comptage (pur)', () => {
  it('ne compte que les pièces applicables (na exclus)', async () => {
    const { completenessCount } = await import('./bail-required-docs.js')
    const pieces = computeRequiredDocs({
      diagApplicability: { dpe: true, crep: false, gaz: true }, imm: {}, log: {},
      documents: [{ id: 1, requirementKeys: ['dpe'] }],
    })
    expect(completenessCount(pieces)).toEqual({ ok: 1, total: 2 })
  })
})
