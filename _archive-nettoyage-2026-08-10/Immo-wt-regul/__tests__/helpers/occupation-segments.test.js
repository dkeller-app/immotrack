import { describe, it, expect } from 'vitest'
import { logOccupationSegments } from '../../js/core/occupation-segments.js'

// ────────────────────────────────────────────────────────────────────────────
// Modèle cible : une SEULE vérité d'occupation d'un logement sur [from,to].
// Découpe en segments qui se suivent sans trou ni chevauchement.
// Chaque jour appartient à exactement un segment : locataire OU vacant→bailleur.
// Règle de fin unique par bail : dateSortie (déclarée & < fin) → sinon finEffective → sinon fin.
// Invariant : Σ occDays == totalDays.
// Réf : docs/superpowers/specs/2026-07-05-regul-vacance-depart-design.md §7
// ────────────────────────────────────────────────────────────────────────────

const FROM = '2026-01-01'
const TO = '2026-12-31'
const TOTAL = 365

const sum = segs => segs.reduce((s, x) => s + x.occDays, 0)

describe('logOccupationSegments — invariant', () => {
  it('Σ occDays == totalDays dans tous les cas', () => {
    const cases = [
      [],
      [{ debut: '2025-06-01', fin: null, nom: 'A' }],
      [{ debut: '2026-03-15', fin: null, nom: 'A' }],
      [{ debut: '2026-01-01', fin: '2029-12-31', dateSortie: '2026-06-30', nom: 'A' }],
      [{ debut: '2026-01-01', fin: '2026-06-30', nom: 'A' }, { debut: '2026-08-01', fin: null, nom: 'B' }],
    ]
    for (const bails of cases) {
      const { segments, totalDays } = logOccupationSegments(bails, FROM, TO)
      expect(totalDays).toBe(TOTAL)
      expect(sum(segments)).toBe(TOTAL)
    }
  })

  it('segments ordonnés, sans trou ni chevauchement', () => {
    const bails = [{ debut: '2026-01-01', fin: '2026-06-30', nom: 'A' }, { debut: '2026-08-01', fin: null, nom: 'B' }]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments[0].debut).toBe(FROM)
    expect(segments[segments.length - 1].fin).toBe(TO)
    for (let i = 1; i < segments.length; i++) {
      // chaque segment démarre le lendemain de la fin du précédent
      const prevFin = new Date(segments[i - 1].fin + 'T00:00:00').getTime()
      const curDeb = new Date(segments[i].debut + 'T00:00:00').getTime()
      expect(curDeb - prevFin).toBe(86400000)
    }
  })
})

describe('logOccupationSegments — cas', () => {
  it('aucun bail → tout vacant (bailleur)', () => {
    const { segments } = logOccupationSegments([], FROM, TO)
    expect(segments).toHaveLength(1)
    expect(segments[0].kind).toBe('vacant')
    expect(segments[0].isBailleur).toBe(true)
    expect(segments[0].occDays).toBe(TOTAL)
  })

  it('bail plein (entrée avant la période, pas de sortie) → 100% locataire, aucune vacance (non-régression)', () => {
    const { segments } = logOccupationSegments([{ debut: '2025-06-01', fin: null, nom: 'A' }], FROM, TO)
    expect(segments).toHaveLength(1)
    expect(segments[0].kind).toBe('locataire')
    expect(segments[0].locataire).toBe('A')
    expect(segments[0].occDays).toBe(TOTAL)
  })

  it('entrée en cours d\'année → vacance AVANT puis locataire', () => {
    const { segments } = logOccupationSegments([{ debut: '2026-03-15', fin: null, nom: 'A' }], FROM, TO)
    expect(segments.map(s => s.kind)).toEqual(['vacant', 'locataire'])
    expect(segments[0].occDays).toBe(73)   // 01/01 → 14/03 inclus
    expect(segments[1].occDays).toBe(292)  // 15/03 → 31/12 inclus
  })

  it('SORTIE DÉCLARÉE non archivée → clip à dateSortie, PAS au terme du bail (le bug corrigé)', () => {
    const bails = [{ debut: '2026-01-01', fin: '2029-12-31', dateSortie: '2026-06-30', nom: 'A' }]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments.map(s => s.kind)).toEqual(['locataire', 'vacant'])
    expect(segments[0].occDays).toBe(181)  // 01/01 → 30/06
    expect(segments[1].occDays).toBe(184)  // 01/07 → 31/12 → bailleur
    expect(segments[1].isBailleur).toBe(true)
  })

  it('rotation avec trou → loc1, vacance, loc2', () => {
    const bails = [
      { debut: '2026-01-01', fin: '2026-06-30', nom: 'A' },
      { debut: '2026-08-01', fin: null, nom: 'B' },
    ]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments.map(s => s.kind)).toEqual(['locataire', 'vacant', 'locataire'])
    expect(segments[0].occDays).toBe(181)  // A : 01/01 → 30/06
    expect(segments[1].occDays).toBe(31)   // juillet vacant
    expect(segments[2].occDays).toBe(153)  // B : 01/08 → 31/12
    expect(segments[0].locataire).toBe('A')
    expect(segments[2].locataire).toBe('B')
  })

  it('rotation sans trou (successeur le lendemain) → aucune vacance', () => {
    const bails = [
      { debut: '2026-01-01', fin: '2026-06-30', nom: 'A' },
      { debut: '2026-07-01', fin: null, nom: 'B' },
    ]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments.map(s => s.kind)).toEqual(['locataire', 'locataire'])
    expect(segments[0].occDays).toBe(181)
    expect(segments[1].occDays).toBe(184)
  })
})

describe('logOccupationSegments — règle de fin', () => {
  it('dateSortie ignorée si postérieure au terme (dateSortie >= fin) → on garde fin', () => {
    // fin 2026-09-30, dateSortie 2026-12-31 (>= fin) → occupation jusqu'à fin, pas au-delà
    const bails = [{ debut: '2026-01-01', fin: '2026-09-30', dateSortie: '2026-12-31', nom: 'A' }]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments.map(s => s.kind)).toEqual(['locataire', 'vacant'])
    expect(segments[0].fin).toBe('2026-09-30')
  })

  it('finEffective prioritaire sur fin contractuelle quand pas de dateSortie', () => {
    const bails = [{ debut: '2026-01-01', fin: '2029-12-31', finEffective: '2026-05-31', nom: 'A' }]
    const { segments } = logOccupationSegments(bails, FROM, TO)
    expect(segments[0].fin).toBe('2026-05-31')
    expect(segments[0].occDays).toBe(151) // 01/01 → 31/05
  })
})

// Référence : ANCIEN _ccLogOccupations (avant refonte). On ne compare que
// occDays + isBailleur + nombre de segments (indépendants du fuseau).
// Prouve que hors départ (bails sans dateSortie), le nouveau moteur est IDENTIQUE.
function oldOcc(bails, from, to) {
  const fromMs = new Date(from + 'T00:00:00').getTime()
  const toMs = new Date(to + 'T00:00:00').getTime()
  const totalDays = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1)
  const segments = []
  const sorted = bails.slice().sort((a, b) => (a.debut || '').localeCompare(b.debut || ''))
  let cursorMs = fromMs
  for (const b of sorted) {
    if (!b.debut) continue
    const bDebMs = Math.max(fromMs, new Date(b.debut + 'T00:00:00').getTime())
    const bFinMs = Math.min(toMs, b.fin ? new Date(b.fin + 'T00:00:00').getTime() : toMs)
    if (bDebMs > toMs || bFinMs < fromMs) continue
    if (bDebMs > cursorMs) { const v = Math.round((bDebMs - cursorMs) / 86400000); if (v > 0) segments.push({ occDays: v, isBailleur: true }) }
    const occDays = Math.round((bFinMs - bDebMs) / 86400000) + 1
    if (occDays > 0) segments.push({ occDays, isBailleur: false })
    cursorMs = Math.max(cursorMs, bFinMs + 86400000)
  }
  if (cursorMs <= toMs) { const v = Math.round((toMs - cursorMs) / 86400000) + 1; if (v > 0) segments.push({ occDays: v, isBailleur: true }) }
  if (segments.length === 0) segments.push({ occDays: totalDays, isBailleur: true })
  return { segments, totalDays }
}

describe('équivalence avec l\'ancien moteur (hors départ)', () => {
  const norm = r => r.segments.map(s => ({ occDays: s.occDays, isBailleur: s.isBailleur }))
  const cases = [
    [{ debut: '2025-06-01', fin: null, nom: 'A' }],                                            // bail plein
    [{ debut: '2026-03-15', fin: null, nom: 'A' }],                                            // entrée en cours
    [{ debut: '2026-01-01', fin: '2026-06-30', nom: 'A' }, { debut: '2026-08-01', fin: null, nom: 'B' }], // rotation trou
    [{ debut: '2026-01-01', fin: '2026-06-30', nom: 'A' }, { debut: '2026-07-01', fin: null, nom: 'B' }], // rotation sans trou
    [{ debut: '2026-01-01', fin: '2026-04-30', nom: 'A' }],                                     // sortie archivée simple
    [],                                                                                          // aucun bail
  ]
  cases.forEach((bails, i) => {
    it(`cas ${i + 1} : nouveau == ancien (occDays + isBailleur)`, () => {
      expect(norm(logOccupationSegments(bails, FROM, TO))).toEqual(norm(oldOcc(bails, FROM, TO)))
    })
  })
})
