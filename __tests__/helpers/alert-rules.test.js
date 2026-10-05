/**
 * Tests du catalogue canonique de règles d'alertes (DRY-FACTORISATION chantier 1).
 * Couvre notamment les 3 DIVERGENCES tranchées (audit 2026-07-06).
 */
import { describe, it, expect } from 'vitest'
import { mrhManquante, mrhEcheances, pnoEcheances, irlClassifier, regulValidee, regulAEmettre, bauxEcheance } from './alert-rules.js'

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

// BIENS étape 9 (décision 1 du 11/08) — l'assurance MRO/PNO de l'IMMEUBLE n'a plus de rappel
// d'échéance : elle se renouvelle automatiquement, et elle redevient un simple document de
// l'entête de la fiche immeuble. Seule la portée LOGEMENT (PNO / GLI d'un lot) garde son alerte.
describe('pnoEcheances — portée logement uniquement', () => {
  const logements = [{ ref: 'A', entity: 'SCI X', imm: 'Ferrette' }]
  it('portée immeuble : PLUS d aucune alerte, même expirée (donnée dormante, pas supprimée)', () => {
    const out = pnoEcheances([{ portee: 'immeuble', immeuble: 'Ferrette', echeance: '2026-06-30', compagnie: 'Groupama' }], logements, 'SCI X', TODAY)
    expect(out).toEqual([])
  })
  it('portée immeuble sans filtre entité : exclue aussi', () => {
    expect(pnoEcheances([{ portee: 'immeuble', immeuble: 'Autre', echeance: '2026-06-30' }], logements, '', TODAY)).toEqual([])
  })
  it('portée LOGEMENT : l alerte reste entière (PNO / GLI d un lot)', () => {
    const out = pnoEcheances([{ logement: 'A', echeance: '2026-06-30', compagnie: 'Groupama' }], logements, 'SCI X', TODAY)
    expect(out[0]).toMatchObject({ label: 'A', expiree: true, compagnie: 'Groupama' })
  })
  it('portée logement hors entité active → exclue', () => {
    expect(pnoEcheances([{ logement: 'Z', echeance: '2026-06-30' }], logements, 'SCI X', TODAY)).toEqual([])
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

describe('regulAEmettre — signal réel « régul faite » (bug 05/10/2026)', () => {
  const isLoyer = c => c === 'Loyers encaissés'
  const logs = [{ ref: 'A', imm: 'Les Tilleuls', locataire: 'Dupont', ch: 50 }]
  const loyerN1 = { qui: 'A', cat: 'Loyers encaissés', cr: 500, date: '2025-03-05' }
  it('immeuble validé sur l exercice N-1 (« Valider la régul de l immeuble ») → plus d alerte', () => {
    const val = { 'Les Tilleuls|2025-01-01|2025-12-31': { at: '2026-02-01T10:00:00.000Z' } }
    expect(regulAEmettre(logs, [loyerN1], TODAY, isLoyer, val)).toEqual([])
  })
  it('validation d un AUTRE immeuble ou d une autre année → alerte maintenue', () => {
    const val = {
      'Autre|2025-01-01|2025-12-31': { at: 'x' },
      'Les Tilleuls|2024-01-01|2024-12-31': { at: 'x' },
      'Les Tilleuls|2026-01-01|2026-12-31': { at: 'x' },
    }
    expect(regulAEmettre(logs, [loyerN1], TODAY, isLoyer, val)).toHaveLength(1)
  })
  it('solde de régul rangé en « Charges récupérables » (référentiel) ne suffit pas seul ; sans validation → alerte', () => {
    const mvs = [loyerN1, { qui: 'A', cat: 'Charges récupérables (eau, énergie…)', cr: 42, date: '2026-03-01' }]
    expect(regulAEmettre(logs, mvs, TODAY, isLoyer, {})).toHaveLength(1)
  })
  it('catégorie auto du syndic « Régularisation provisions copro N-1 » ≠ régul du locataire', () => {
    const mvs = [loyerN1, { qui: 'A', cat: 'Régularisation provisions copro N-1', cr: 80, date: '2026-04-01' }]
    expect(regulAEmettre(logs, mvs, TODAY, isLoyer)).toHaveLength(1)
  })
  it('sans 5e argument (ancien appel) → comportement inchangé', () => {
    expect(regulAEmettre(logs, [loyerN1], TODAY, isLoyer)).toHaveLength(1)
  })
})

describe('regulValidee — période contenant le 31/12 de l année', () => {
  it('exercice civil', () => {
    expect(regulValidee({ 'I|2025-01-01|2025-12-31': { at: 'x' } }, 'I', 2025)).toBe(true)
  })
  it('exercice décalé se terminant après le 31/12 → compte ; se terminant avant → non', () => {
    expect(regulValidee({ 'I|2025-07-01|2026-06-30': { at: 'x' } }, 'I', 2025)).toBe(true)
    expect(regulValidee({ 'I|2024-07-01|2025-06-30': { at: 'x' } }, 'I', 2025)).toBe(false)
  })
  it('période partielle (jan→mars) → ne solde pas l année', () => {
    expect(regulValidee({ 'I|2025-01-01|2025-03-31': { at: 'x' } }, 'I', 2025)).toBe(false)
  })
  it('nom d immeuble contenant « | », clé malformée, valeur vide, entrées absentes', () => {
    expect(regulValidee({ 'A|B|2025-01-01|2025-12-31': { at: 'x' } }, 'A|B', 2025)).toBe(true)
    expect(regulValidee({ 'I|2025': { at: 'x' } }, 'I', 2025)).toBe(false)
    expect(regulValidee({ 'I||': { at: 'x' } }, 'I', 2025)).toBe(false)
    expect(regulValidee({ 'I|2025-01-01|2025-12-31': null }, 'I', 2025)).toBe(false)
    expect(regulValidee(undefined, 'I', 2025)).toBe(false)
    expect(regulValidee({ '|2025-01-01|2025-12-31': { at: 'x' } }, '', 2025)).toBe(false)
  })
})

describe('bornes de jours (fix audit : normalisation à minuit)', () => {
  const MIDI = new Date('2026-07-06T14:30:00')   // exécution l'après-midi
  it('échéance du JOUR MÊME = 0 jour (expirante, pas expirée), quelle que soit l heure', () => {
    const out = mrhEcheances([{ logement: 'A', echeance: '2026-07-06' }], [{ ref: 'A' }], '', MIDI)
    expect(out[0]).toMatchObject({ jours: 0, expiree: false })
  })
  it('borne horizon INCLUSE : 30 j pile signalé, 31 j non', () => {
    const in30 = mrhEcheances([{ logement: 'A', echeance: '2026-08-05' }], [{ ref: 'A' }], '', MIDI)
    const in31 = mrhEcheances([{ logement: 'A', echeance: '2026-08-06' }], [{ ref: 'A' }], '', MIDI)
    expect(in30[0]).toMatchObject({ jours: 30 })
    expect(in31).toEqual([])
  })
  it('échéance invalide → ignorée (pas de NaN)', () => {
    expect(mrhEcheances([{ logement: 'A', echeance: 'pas-une-date' }], [{ ref: 'A' }], '', MIDI)).toEqual([])
  })
  it('tombstones filtrés dans pnoEcheances et regulAEmettre (mouvements)', () => {
    const pno = pnoEcheances([{ logement: 'A', echeance: '2026-06-01', _deleted: true }], [{ ref: 'A' }], '', MIDI)
    expect(pno).toEqual([])
    const logs = [{ ref: 'A', locataire: 'X', ch: 50 }]
    const mvs = [{ qui: 'A', cat: 'Loyers encaissés', cr: 500, date: '2025-03-05', _deleted: true }]
    expect(regulAEmettre(logs, mvs, MIDI, c => c === 'Loyers encaissés')).toEqual([])   // loyer N-1 tombstoné = pas loué
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
