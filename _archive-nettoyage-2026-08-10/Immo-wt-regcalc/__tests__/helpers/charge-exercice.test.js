import { describe, it, expect } from 'vitest'
import { chargeExerciceShare } from '../../js/core/charge-exercice.js'

// ────────────────────────────────────────────────────────────────────────────
// Rattachement d'une charge à un exercice de régularisation [from,to].
// Règle (décret 2005-240, pratique agences) : une charge appartient au décompte
// selon la PÉRIODE qu'elle couvre, pas la date de paiement.
//  - sans période couverte → point-date : 100% si la date ∈ exercice, sinon 0.
//  - avec période couverte → coupée au prorata des jours de chevauchement.
//    Une facture à cheval sur 2 exercices est répartie ; la somme des parts == montant.
// Réf : docs/superpowers/specs/2026-07-11-page-charges-design.md (décision B)
// ────────────────────────────────────────────────────────────────────────────

const FROM = '2026-01-01'
const TO = '2026-12-31'
const near = (a, b) => Math.abs(a - b) < 0.01

describe('chargeExerciceShare — sans période couverte (point-date)', () => {
  it('date DANS l\'exercice → montant entier', () => {
    const r = chargeExerciceShare({ montant: 120, date: '2026-06-15' }, FROM, TO)
    expect(r.share).toBe(1)
    expect(r.amount).toBe(120)
  })

  it('date HORS de l\'exercice → 0', () => {
    const r = chargeExerciceShare({ montant: 120, date: '2025-11-20' }, FROM, TO)
    expect(r.share).toBe(0)
    expect(r.amount).toBe(0)
  })

  it('bornes incluses (1er janv et 31 déc)', () => {
    expect(chargeExerciceShare({ montant: 50, date: '2026-01-01' }, FROM, TO).amount).toBe(50)
    expect(chargeExerciceShare({ montant: 50, date: '2026-12-31' }, FROM, TO).amount).toBe(50)
  })
})

describe('chargeExerciceShare — avec période couverte', () => {
  it('période entièrement dans l\'exercice → montant entier', () => {
    const r = chargeExerciceShare({ montant: 240, periodeFrom: '2026-03-01', periodeTo: '2026-08-31' }, FROM, TO)
    expect(r.share).toBe(1)
    expect(r.amount).toBe(240)
  })

  it('facture À CHEVAL (nov 2025 → janv 2026) → part au prorata des jours dans l\'exercice', () => {
    // période : 01/11/2025 → 31/01/2026 = 30+31+31 = 92 jours ; part 2026 = janvier = 31 jours
    const r = chargeExerciceShare({ montant: 92, periodeFrom: '2025-11-01', periodeTo: '2026-01-31' }, FROM, TO)
    expect(r.periodeDays).toBe(92)
    expect(r.overlapDays).toBe(31)
    expect(near(r.share, 31 / 92)).toBe(true)
    expect(near(r.amount, 31)).toBe(true)
  })

  it('période entièrement AVANT l\'exercice → 0', () => {
    const r = chargeExerciceShare({ montant: 100, periodeFrom: '2025-01-01', periodeTo: '2025-12-31' }, FROM, TO)
    expect(r.amount).toBe(0)
  })

  it('période entièrement APRÈS l\'exercice → 0', () => {
    const r = chargeExerciceShare({ montant: 100, periodeFrom: '2027-01-01', periodeTo: '2027-06-30' }, FROM, TO)
    expect(r.amount).toBe(0)
  })

  it('la période couverte prime sur la date de facture', () => {
    // facturée en 2026 mais couvrant 2025 → 0 sur l'exercice 2026
    const r = chargeExerciceShare({ montant: 100, date: '2026-02-10', periodeFrom: '2025-01-01', periodeTo: '2025-12-31' }, FROM, TO)
    expect(r.amount).toBe(0)
  })
})

describe('chargeExerciceShare — invariant de partage', () => {
  it('une facture à cheval répartie sur 2 exercices consécutifs → somme des parts == montant', () => {
    const charge = { montant: 92, periodeFrom: '2025-11-01', periodeTo: '2026-01-31' }
    const part2025 = chargeExerciceShare(charge, '2025-01-01', '2025-12-31').amount
    const part2026 = chargeExerciceShare(charge, '2026-01-01', '2026-12-31').amount
    expect(near(part2025 + part2026, 92)).toBe(true)
    expect(near(part2025, 61)).toBe(true) // nov+déc 2025
    expect(near(part2026, 31)).toBe(true) // janv 2026
  })
})
