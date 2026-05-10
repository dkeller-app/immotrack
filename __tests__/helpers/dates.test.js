/**
 * Tests pour les helpers temporels (BUG-DASH-001)
 *
 * Ces tests valident l'API attendue des helpers _loyerHCAtDate, _chargesAtDate,
 * _bailEstActif et _bailGelIRL. Ils servent de spec de référence pour
 * l'implémentation finale dans index.html.
 *
 * Lancer :  npm test                (mode watch)
 *           npm run test:run        (1 passe)
 */

import { describe, it, expect } from 'vitest'
import { _loyerHCAtDate, _chargesAtDate, _bailEstActif, _bailGelIRL } from './dates.js'
import fixtures from '../fixtures.json'

describe('_loyerHCAtDate (BUG-DASH-001 dimension 2)', () => {
  const bailAvecRevision = fixtures.baux['ALPHA-001'] // 650€ initial, révisé 665.4€ le 2025-01-01
  const bailSansRevision = fixtures.baux['ALPHA-002'] // 950€, jamais révisé

  it('renvoie le HC initial quand aucune révision', () => {
    expect(_loyerHCAtDate(bailSansRevision, '2026-01-01')).toBe(950)
  })

  it('renvoie le HC initial pour une date AVANT toute révision', () => {
    expect(_loyerHCAtDate(bailAvecRevision, '2024-06-15')).toBe(650)
  })

  it('renvoie le HC révisé pour une date APRÈS la révision', () => {
    expect(_loyerHCAtDate(bailAvecRevision, '2025-03-15')).toBe(665.4)
  })

  it('renvoie le HC révisé pile à la date d\'application', () => {
    expect(_loyerHCAtDate(bailAvecRevision, '2025-01-01')).toBe(665.4)
  })

  it('renvoie le HC initial la veille de la révision', () => {
    expect(_loyerHCAtDate(bailAvecRevision, '2024-12-31')).toBe(650)
  })

  it('renvoie 0 pour un bail null/undefined', () => {
    expect(_loyerHCAtDate(null, '2026-01-01')).toBe(0)
    expect(_loyerHCAtDate(undefined, '2026-01-01')).toBe(0)
  })

  it('renvoie le HC initial pour une date invalide', () => {
    expect(_loyerHCAtDate(bailAvecRevision, 'pas-une-date')).toBe(650)
  })
})

describe('_chargesAtDate', () => {
  const bail = fixtures.baux['ALPHA-001']

  it('renvoie les charges initiales (pas de révision charges dans fixture)', () => {
    expect(_chargesAtDate(bail, '2026-01-01')).toBe(50)
  })
})

describe('_bailEstActif', () => {
  const bailAlpha001 = fixtures.baux['ALPHA-001'] // 2024-01-01 → 2027-01-01
  const bailAlpha002 = fixtures.baux['ALPHA-002'] // 2025-06-01 → 2028-06-01

  it('actif pendant la période du bail', () => {
    expect(_bailEstActif(bailAlpha001, '2025-06-15')).toBe(true)
  })

  it('inactif AVANT le début', () => {
    expect(_bailEstActif(bailAlpha002, '2024-12-01')).toBe(false)
  })

  it('inactif APRÈS la fin', () => {
    expect(_bailEstActif(bailAlpha001, '2027-06-01')).toBe(false)
  })

  it('actif pile au début', () => {
    expect(_bailEstActif(bailAlpha001, '2024-01-01')).toBe(true)
  })

  it('actif pile à la fin', () => {
    expect(_bailEstActif(bailAlpha001, '2027-01-01')).toBe(true)
  })
})

describe('_bailGelIRL (loi Climat 2021)', () => {
  it('gel pour DPE F', () => {
    expect(_bailGelIRL(fixtures.baux['PERS-001'])).toBe(true) // DPE F
  })

  it('pas de gel pour DPE C', () => {
    expect(_bailGelIRL(fixtures.baux['ALPHA-001'])).toBe(false) // DPE C
  })

  it('pas de gel pour DPE B', () => {
    expect(_bailGelIRL(fixtures.baux['BETA-001'])).toBe(false) // DPE B
  })

  it('pas de gel pour bail sans DPE', () => {
    expect(_bailGelIRL({ hc: 500 })).toBe(false)
  })
})

describe('Cas réels combinés (scénarios BUG-DASH-001)', () => {
  it('Loyer attendu mai 2024 sur ALPHA-001 = 650€ (avant révision)', () => {
    const bail = fixtures.baux['ALPHA-001']
    expect(_bailEstActif(bail, '2024-05-15')).toBe(true)
    expect(_loyerHCAtDate(bail, '2024-05-15')).toBe(650)
  })

  it('Loyer attendu mars 2025 sur ALPHA-001 = 665.4€ (après révision)', () => {
    const bail = fixtures.baux['ALPHA-001']
    expect(_bailEstActif(bail, '2025-03-15')).toBe(true)
    expect(_loyerHCAtDate(bail, '2025-03-15')).toBe(665.4)
  })

  it('PERS-001 actif mais soumis au gel DPE F', () => {
    const bail = fixtures.baux['PERS-001']
    expect(_bailEstActif(bail, '2026-01-15')).toBe(true)
    expect(_bailGelIRL(bail)).toBe(true)
    // Le calcul de révision IRL doit donc retourner 0 (à implémenter dans computeIRLRevision)
  })
})
