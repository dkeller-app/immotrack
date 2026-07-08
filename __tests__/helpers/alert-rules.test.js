/**
 * Tests du catalogue canonique de règles d'alertes (DRY-FACTORISATION chantier 1).
 * Couvre notamment les 3 DIVERGENCES tranchées (audit 2026-07-06).
 */
import { describe, it, expect } from 'vitest'
import { mrhManquante, mrhEcheances, pnoEcheances, irlClassifier, regulAEmettre, bauxEcheance } from './alert-rules.js'

const TODAY = new Date('2026-07-06T00:00:00')

describe('mrhManquante — assurance habitation locataire', () => {
  const logs = [
    { ref: 'A', locataire: 'Dupont' },
    { ref: 'B', locataire: 'Martin' },
    { ref: 'C', locataire: '' },        // vacant → jamais concerné
  ]
  it('signale les logements occupés sans attestation dans la collection mrh', () => {
    const out = mrhManquante(logs, [{ logement: 'A' }])
    expect(out).toEqual([{ ref: 'B', locataire: 'Martin' }])
  })
  it('DIVERGENCE tranchée : la source est la collection mrh, PAS assurances type=MRH locataire', () => {
    // Ancien widget : DB.assurances.some(a => a.logement===ref && a.type==='MRH locataire')
    // → un log couvert dans mrh mais absent d assurances était FAUSSEMENT « manquant ».
    const mrh = [{ logement: 'A' }, { logement: 'B' }]
    expect(mrhManquante(logs, mrh)).toEqual([])   // canonique : tout est couvert
  })
  it('ignore les tombstones', () => {
    const out = mrhManquante(logs, [{ logement: 'A' }, { logement: 'B', _deleted: true }])
    expect(out).toEqual([{ ref: 'B', locataire: 'Martin' }])
  })
})

describe('mrhEcheances', () => {
  const logements = [{ ref: 'A', entity: 'SCI X' }, { ref: 'B', entity: 'SCI Y' }]
  it('expirée (jours<0) et préavis (≤30 j), scopé entité', () => {
    const mrh = [
      { logement: 'A', echeance: '2026-07-01' },  // expirée (-5 j)
      { logement: 'B', echeance: '2026-07-20' },  // dans 14 j mais SCI Y
      { logement: 'A', echeance: '2026-09-30' },  // trop loin
    ]
    const out = mrhEcheances(mrh, logements, 'SCI X', TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ ref: 'A', expiree: true })
  })
  it('sans filtre entité, préavis ≤ 30 j inclus', () => {
    const out = mrhEcheances([{ logement: 'B', echeance: '2026-07-20' }], logements, '', TODAY)
    expect(out[0]).toMatchObject({ ref: 'B', expiree: false, jours: 14 })
  })
})

describe('pnoEcheances — portées logement et immeuble', () => {
  const logements = [{ ref: 'A', entity: 'SCI X', imm: 'Ferrette' }]
  it('portée immeuble : label = immeuble, scope via les logements de l entité', () => {
    const out = pnoEcheances([{ portee: 'immeuble', immeuble: 'Ferrette', echeance: '2026-06-30', compagnie: 'Groupama' }], logements, 'SCI X', TODAY)
    expect(out[0]).toMatchObject({ label: 'Ferrette', expiree: true, compagnie: 'Groupama' })
  })
  it('portée immeuble hors entité active → exclue', () => {
    const out = pnoEcheances([{ portee: 'immeuble', immeuble: 'Autre', echeance: '2026-06-30' }], logements, 'SCI X', TODAY)
    expect(out).toEqual([])
  })
})

describe('irlClassifier — classification unique', () => {
  const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))
  const anniv = new Date('2026-06-15T00:00:00')
  it('applicable : isApplicable + diff≠0 + !dejaApplique', () => {
    const rev = { dateRevision: anniv, isApplicable: true, diff: 5, dejaApplique: false }
    const c = irlClassifier(rev, { }, TODAY, iso)
    expect(c).toMatchObject({ etat: 'applicable', lettreEnvoyee: false })
  })
  it('DIVERGENCE tranchée : dejaApplique (ou renoncée) → null, même si isApplicable côté données', () => {
    // L ancienne bannière alertes ne filtrait pas dejaApplique sur la branche applicable.
    const rev = { dateRevision: anniv, isApplicable: true, diff: 5, dejaApplique: true }
    expect(irlClassifier(rev, {}, TODAY, iso)).toBeNull()
  })
  it('préavis ≤ 45 j avec état lettre envoyée exposé en donnée', () => {
    const futur = new Date('2026-08-01T00:00:00')
    const rev = { dateRevision: futur, isApplicable: false, diff: 5, dejaApplique: false }
    const log = { irlLettreEnvoyee: true, irlLettreEnvoyeePour: iso(futur), irlLettreEnvoyeeDate: '2026-07-01' }
    const c = irlClassifier(rev, log, TODAY, iso)
    expect(c).toMatchObject({ etat: 'preavis', jours: 26, lettreEnvoyee: true, dateLettre: '2026-07-01' })
  })
  it('au-delà de 45 j → null ; insuffisant/pasEncoreApplicable → null', () => {
    const loin = new Date('2026-10-01T00:00:00')
    expect(irlClassifier({ dateRevision: loin, isApplicable: false, diff: 3 }, {}, TODAY, iso)).toBeNull()
    expect(irlClassifier({ insuffisant: true }, {}, TODAY, iso)).toBeNull()
    expect(irlClassifier({ pasEncoreApplicable: true }, {}, TODAY, iso)).toBeNull()
  })
})

describe('regulAEmettre — sémantique canonique (clarif user)', () => {
  const isLoyer = c => c === 'Loyers encaissés'
  const logs = [{ ref: 'A', locataire: 'Dupont', ch: 50 }]
  it('signale : loué N-1 + aucune régul émise en N', () => {
    const mvs = [{ qui: 'A', cat: 'Loyers encaissés', cr: 500, date: '2025-03-05' }]
    const out = regulAEmettre(logs, mvs, TODAY, isLoyer)
    expect(out).toEqual([{ ref: 'A', locataire: 'Dupont', annee: 2025, charges: 50 }])
  })
  it('régul émise en année COURANTE → plus d alerte', () => {
    const mvs = [
      { qui: 'A', cat: 'Loyers encaissés', cr: 500, date: '2025-03-05' },
      { qui: 'A', cat: 'Régularisation de charges', cr: 30, date: '2026-02-10' },
    ]
    expect(regulAEmettre(logs, mvs, TODAY, isLoyer)).toEqual([])
  })
  it('DIVERGENCE tranchée : une régul émise en N-1 seulement NE suffit PAS (l ancien widget l acceptait)', () => {
    const mvs = [
      { qui: 'A', cat: 'Loyers encaissés', cr: 500, date: '2025-03-05' },
      { qui: 'A', cat: 'Régularisation de charges', cr: 30, date: '2025-06-10' },  // régul N-1 (au titre de N-2)
    ]
    // Canonique : la régul AU TITRE de 2025 doit être émise en 2026 → toujours à émettre.
    expect(regulAEmettre(logs, mvs, TODAY, isLoyer)).toHaveLength(1)
  })
  it('DIVERGENCE tranchée : pas de loyers perçus en N-1 → pas de régul due (l ancien widget alertait quand même)', () => {
    const mvs = []   // jamais loué en 2025 (entrée récente)
    expect(regulAEmettre(logs, mvs, TODAY, isLoyer)).toEqual([])
  })
})

describe('bauxEcheance', () => {
  it('expirés + ≤90 j, triés par urgence', () => {
    const logs = [
      { ref: 'A', locataire: 'X', fin: '2026-06-01' },  // expiré
      { ref: 'B', locataire: 'Y', fin: '2026-08-15' },  // 40 j
      { ref: 'C', locataire: 'Z', fin: '2027-01-01' },  // trop loin
      { ref: 'D', locataire: '',  fin: '2026-06-01' },  // vacant → exclu
    ]
    const out = bauxEcheance(logs, TODAY)
    expect(out.map(o => o.ref)).toEqual(['A', 'B'])
    expect(out[0].expire).toBe(true)
    expect(out[1]).toMatchObject({ expire: false, jours: 40 })
  })
})
