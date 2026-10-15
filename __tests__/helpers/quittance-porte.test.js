import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { lotQuittanceAOuvrir } from '../../js/core/quittance-porte.js'

/**
 * Retours du 15/10/2026 (lot 1, point 5) — logement d'un bailleur en nom propre + SCI choisie dans le
 * filtre d'entité : « Faire une quittance » ouvrait le premier lot de la SCI (donc la SCI comme bailleur).
 */
const SCI = ['D-101', 'D-102']           // lots quittançables de la SCI (filtre actif)
const TOUS = ['D-101', 'D-102', 'P-201'] // + le lot en nom propre

describe('lotQuittanceAOuvrir', () => {
  it('un lot DEMANDÉ hors du filtre s\'ouvre lui-même (jamais le premier lot du filtre)', () => {
    expect(lotQuittanceAOuvrir({ ref: 'P-201', lotsPerimetre: SCI, lotsQuittancables: TOUS }))
      .toEqual({ ok: true, ref: 'P-201', horsPerimetre: true })
  })
  it('un lot demandé dans le filtre : inchangé', () => {
    expect(lotQuittanceAOuvrir({ ref: 'D-102', lotsPerimetre: SCI, lotsQuittancables: TOUS }))
      .toEqual({ ok: true, ref: 'D-102', horsPerimetre: false })
  })
  it('un lot demandé SANS bail n\'est jamais remplacé par un autre', () => {
    expect(lotQuittanceAOuvrir({ ref: 'X-9', lotsPerimetre: SCI, lotsQuittancables: TOUS })).toEqual({ ok: false, motif: 'sans-bail' })
  })
  it('porte globale (sans lot) : le premier lot du filtre, sinon un motif', () => {
    expect(lotQuittanceAOuvrir({ lotsPerimetre: SCI, lotsQuittancables: TOUS }).ref).toBe('D-101')
    expect(lotQuittanceAOuvrir({ lotsPerimetre: [], lotsQuittancables: TOUS })).toEqual({ ok: false, motif: 'perimetre-vide' })
    expect(lotQuittanceAOuvrir({ lotsPerimetre: [], lotsQuittancables: [] })).toEqual({ ok: false, motif: 'aucun-bail' })
    expect(lotQuittanceAOuvrir(null)).toEqual({ ok: false, motif: 'aucun-bail' })
  })
})

describe('_openFaireQuittance suit la règle (plus de repli sur lots[0] pour un lot demandé)', () => {
  const ap2 = fs.readFileSync(path.resolve(__dirname, '..', '..', 'js/app/app-part2.js'), 'utf8')
  const i = ap2.indexOf('function _openFaireQuittance(')
  const f = ap2.slice(i, ap2.indexOf('\nfunction ', i + 10))
  it('passe par lotQuittanceAOuvrir avec la liste du filtre ET celle de tout le parc', () => {
    expect(f).toContain('lotQuittanceAOuvrir')
    expect(f).toContain('_qeLots({ tous: true })')
    expect(f).not.toContain('lots[0].ref')
  })
})
