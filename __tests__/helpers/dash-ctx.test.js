/**
 * Tests du contexte dashboard canonique (DRY chantier 2+4).
 */
import { describe, it, expect } from 'vitest'
import { buildDashCtx, makeMatchMv, occupationKpis, mvTotals } from './dash-ctx.js'

const LOGS = [
  { ref: 'A', entity: 'SCI X', imm: 'Imm1', locataire: 'Dupont' },
  { ref: 'B', entity: 'SCI X', imm: 'Imm1', locataire: '' },        // vacant
  { ref: 'C', entity: 'SCI Y', imm: 'Imm2', locataire: 'Martin' },
  { ref: 'D', entity: 'SCI X', imm: 'Imm1', locataire: 'X', _deleted: true },  // tombstone
]
const MVS = [
  { qui: 'A', imm: 'Imm1', cr: 500, db: 0, date: '2026-03-05' },
  { qui: 'A', imm: 'Imm1', cr: 500, db: 20, date: '2026-02-05' },
  { qui: 'C', imm: 'Imm2', cr: 700, db: 0, date: '2026-03-10' },
  { qui: 'A', imm: 'Imm1', cr: 400, db: 0, date: '2025-12-05' },   // année précédente
  { qui: 'A', imm: 'Imm1', cr: 999, db: 0, date: '2026-03-01', _deleted: true }, // tombstone
]

describe('buildDashCtx', () => {
  it('scope sans entité = tous logements vivants (tombstone exclu)', () => {
    const ctx = buildDashCtx(LOGS, MVS, '2026', '3', '')
    expect(ctx.scopeLogs.map(l => l.ref)).toEqual(['A', 'B', 'C'])
    expect(ctx.scopeImms).toEqual(['Imm1', 'Imm2'])
  })
  it('scope entité = filtre entity, mouvements scopés', () => {
    const ctx = buildDashCtx(LOGS, MVS, '2026', '3', 'SCI X')
    expect(ctx.scopeLogs.map(l => l.ref)).toEqual(['A', 'B'])
    expect(ctx.mvs.map(m => m.cr)).toEqual([500])           // mars, SCI X, tombstone exclu
    expect(ctx.mvsYTD.map(m => m.cr)).toEqual([500, 500])   // année 2026, SCI X
  })
  it('mvsPrev vide sans withPrev, rempli avec (mois précédent)', () => {
    const sans = buildDashCtx(LOGS, MVS, '2026', '3', 'SCI X')
    expect(sans.mvsPrev).toEqual([])
    const avec = buildDashCtx(LOGS, MVS, '2026', '3', 'SCI X', { withPrev: true })
    expect(avec.mvsPrev.map(m => m.cr)).toEqual([500])      // février
  })
  it('withPrev en janvier → décembre année précédente', () => {
    const ctx = buildDashCtx(LOGS, MVS, '2026', '1', 'SCI X', { withPrev: true })
    expect(ctx.mvsPrev.map(m => m.cr)).toEqual([400])       // déc 2025
  })
  it('withPrev sans mois (année entière) → année précédente entière', () => {
    const ctx = buildDashCtx(LOGS, MVS, '2026', '', 'SCI X', { withPrev: true })
    expect(ctx.mvsPrev.map(m => m.cr)).toEqual([400])
  })
  it('refYrMo bien formé', () => {
    expect(buildDashCtx(LOGS, MVS, '2026', '3', '').refYrMo).toBe('2026-03')
    expect(buildDashCtx(LOGS, MVS, '2026', '', '').refYrMo).toBe('2026-' + String(new Date().getMonth() + 1).padStart(2, '0'))
  })
})

describe('makeMatchMv', () => {
  const match = makeMatchMv('SCI X', ['A', 'B'], ['Imm1'])
  it('SCI:nom matche même si qui hors refs', () => {
    expect(match({ qui: 'SCI:SCI X', date: '2026-03-01' }, '2026', '3')).toBe(true)
  })
  it('mois filtré', () => {
    expect(match({ qui: 'A', date: '2026-02-01' }, '2026', '3')).toBe(false)
  })
  it('imm dans scope', () => {
    expect(match({ qui: 'Z', imm: 'Imm1', date: '2026-03-01' }, '2026', '3')).toBe(true)
  })
})

describe('occupationKpis', () => {
  it('compte total/occupés/vacants/pct', () => {
    const k = occupationKpis([{ locataire: 'X' }, { locataire: '' }, { locataire: 'Y' }, { locataire: null }])
    expect(k).toMatchObject({ nbTotal: 4, nbOcc: 2, nbVacants: 2, pctOcc: 50 })
  })
  it('occupied est un TABLEAU des occupés (contrat de type — consommé par occupied[0] dans Solo)', () => {
    const k = occupationKpis([{ ref: 'X', locataire: 'A' }, { ref: 'Y', locataire: '' }])
    expect(Array.isArray(k.occupied)).toBe(true)
    expect(k.occupied.map(l => l.ref)).toEqual(['X'])
  })
  it('parc vide → 0 % (pas de division par zéro)', () => {
    expect(occupationKpis([])).toMatchObject({ nbTotal: 0, nbOcc: 0, nbVacants: 0, pctOcc: 0 })
  })
})

describe('mvTotals', () => {
  it('somme cr/db sur mvs, mvsPrev, mvsYTD', () => {
    const ctx = { mvs: [{ cr: 500, db: 20 }], mvsPrev: [{ cr: 300, db: 0 }], mvsYTD: [{ cr: 500, db: 20 }, { cr: 300 }] }
    expect(mvTotals(ctx)).toEqual({ totalCr: 500, totalDb: 20, prevCr: 300, prevDb: 0, crYTD: 800, dbYTD: 20 })
  })
  it('tableaux absents → 0', () => {
    expect(mvTotals({})).toEqual({ totalCr: 0, totalDb: 0, prevCr: 0, prevDb: 0, crYTD: 0, dbYTD: 0 })
  })
})
