// Module pur js/core/pilotage-lot.js (« Pilotage du parc », Accueil) + son miroir IIFE window.PilotageLot.
// Décisions de Didier des 15-16/10/2026 : mockups/MATRICE-ACCUEIL/MAQUETTE-PILOTAGE.html.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as P from '../../js/core/pilotage-lot.js'

const AUJ = '2026-10-16'
const fmt = (n) => String(n) + ' €'
const libelles = (cs) => (cs || []).map((l) => l.texte)
const gestes = (cs) => (cs || []).flatMap((l) => l.gestes.map((x) => x.geste))

describe('phaseDuLot', () => {
  const bail = (o) => ({ debut: '2022-03-01', sig: 'externe', ...o })
  it('lot non loué ou sans bail : relocation', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: false, bail: bail() })).toBe('relocation')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: null })).toBe('relocation')
  })
  it('congé reçu (date de sortie enregistrée, même à venir) : relocation dès le congé (D2)', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ dateSortie: '2026-12-31' }), edlEntree: true })).toBe('relocation')
  })
  it('entrée future, ou signature commencée dans Propryo : préparation', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-11-01', sig: 'non' }) })).toBe('preparation')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2024-01-01', sig: 'partiel' }), edlEntree: true })).toBe('preparation')
  })
  it('moins de 60 jours après l\'entrée : préparation tant que signature ou EDL manque', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-09-01', sig: 'non' }), edlEntree: true })).toBe('preparation')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-09-01', sig: 'externe' }), edlEntree: false })).toBe('preparation')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-09-01', sig: 'electronique' }), edlEntree: true })).toBe('en-cours')
  })
  it('bail en cours depuis plus de 60 jours : en cours, même sans signature ni EDL classés (bail papier, bail repris)', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2021-12-07', sig: 'non' }), edlEntree: false })).toBe('en-cours')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-08-17', sig: 'non' }), edlEntree: false })).toBe('preparation')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: bail({ debut: '2026-08-16', sig: 'non' }), edlEntree: false })).toBe('en-cours')
  })
})

describe('phaseDuLot — bail loué SANS date d’entrée', () => {
  // Choix (16/10, relecture) : la date d'entrée n'est pas obligatoire à l'enregistrement (« jamais bloquer »), et rien ne date
  // une saisie en cours (_modifiedAt bouge à chaque révision ou migration) : la fiche incomplète est « en cours », jamais
  // « en préparation » à vie ; seule une signature commencée dans Propryo la garde en préparation.
  it('sans date d’entrée : en cours ; signature commencée : préparation', () => {
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: { debut: '', sig: 'non' } })).toBe('en-cours')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: { debut: '', sig: 'non', majLe: '2026-10-15' } })).toBe('en-cours')
    expect(P.phaseDuLot({ today: AUJ, loue: true, bail: { debut: '', sig: 'partiel' } })).toBe('preparation')
  })
})

describe('casesDuLot — corrections de la relecture (16/10)', () => {
  it('signature du bailleur seul sur un bail entré depuis plus de 60 jours : la signature seulement, ni EDL ni caution', () => {
    const c = P.casesDuLot({ today: AUJ, phase: 'preparation', bail: { debut: '2019-05-01', sig: 'partiel' }, edlEntree: false, cautions: ['X'], attestations: [], diagnostics: [], fmt })
    expect(libelles(c.loc)).toEqual(['Bail : signature du locataire en attente.'])
  })
  it('bail repris récent : pièces du vendeur à classer, aucune signature demandée', () => {
    const c = P.casesDuLot({ today: AUJ, phase: 'preparation', bail: { debut: '2026-09-15', sig: 'non', repris: true }, edlEntree: false, cautions: [], attestations: ['2027-09-01'], fmt })
    expect(libelles(c.loc)).toEqual(['Bail du vendeur à classer.', 'État des lieux du vendeur à classer.'])
    expect(libelles(c.loc).join(' ')).not.toMatch(/signer/i)
    expect(gestes(c.loc)).toEqual(['bail-papier', 'bail', 'edl-papier'])
  })
})

describe('casesDuLot — colonnes du quotidien', () => {
  const base = { today: AUJ, phase: 'en-cours', fmt, enPlace: true }
  it('rien à faire : toutes les cases vides', () => {
    const c = P.casesDuLot(base)
    expect(c).toEqual({ loyer: null, ass: null, entr: null, irl: null, loc: null })
    expect(P.aFaire(c)).toBe(false)
  })
  it('loyer impayé : montant et mois de départ (année tue si c\'est l\'année en cours)', () => {
    const c = P.casesDuLot({ ...base, impaye: { reste: 1500, depuisYm: '2026-09' } })
    expect(libelles(c.loyer)).toEqual(['Impayé : 1500 € depuis septembre.'])
    expect(gestes(c.loyer)).toEqual(['loyer'])
    expect(libelles(P.casesDuLot({ ...base, impaye: { reste: 900, depuisYm: '2025-12' } }).loyer)).toEqual(['Impayé : 900 € depuis décembre 2025.'])
    expect(P.casesDuLot({ ...base, impaye: { reste: 0.4 } }).loyer).toBeNull()
  })
  it('assurance : seulement manquante ou expirée, et seulement locataire entré dans les lieux', () => {
    expect(libelles(P.casesDuLot({ ...base, assurance: { etat: 'manquante' } }).ass)).toEqual(['Aucune attestation d’assurance habitation.'])
    expect(libelles(P.casesDuLot({ ...base, assurance: { etat: 'expiree', echeance: '2026-09-30' } }).ass)).toEqual(['Attestation expirée le 30/09/2026.'])
    expect(P.casesDuLot({ ...base, assurance: { etat: 'bientot', echeance: '2026-11-01' } }).ass).toBeNull()
    expect(P.casesDuLot({ ...base, enPlace: false, assurance: { etat: 'manquante' } }).ass).toBeNull()
  })
  it('entretiens en retard : une ligne par entretien, avec le retard', () => {
    const c = P.casesDuLot({ ...base, entretiens: [{ libelle: 'Entretien chaudière gaz', retardJours: 67 }, { libelle: 'Ramonage', retardJours: 0 }] })
    expect(libelles(c.entr)).toEqual(['Entretien chaudière gaz : en retard de 67 jours.', 'Ramonage : en retard.'])
    expect(gestes(c.entr)).toEqual(['entr', 'entr'])
  })
  it('révision due : date et nouveau loyer', () => {
    const c = P.casesDuLot({ ...base, revision: { dateAnniv: '2026-09-29', hc: 400, nouveauHC: 404.61 } })
    expect(libelles(c.irl)).toEqual(['Révision due depuis le 29/09/2026 : 400 € → 404.61 € hors charges.'])
    expect(gestes(c.irl)).toEqual(['irl'])
  })
  it('bail en cours : jamais de « Mise en location » (ni bail, ni EDL, ni caution, ni diagnostics)', () => {
    const c = P.casesDuLot({ ...base, bail: { debut: '2021-12-07', sig: 'non' }, edlEntree: false, cautions: ['M. Garant'], diagnostics: ['erp'] })
    expect(c.loc).toBeNull()
  })
})

describe('casesDuLot — Mise en location', () => {
  it('lot vide sans candidat : relouer ; avec candidatures : les étudier ; candidat retenu : établir le bail', () => {
    const v = { today: AUJ, phase: 'relocation', vacant: true, fmt }
    expect(libelles(P.casesDuLot({ ...v, candidats: { retenus: 0, aEtudier: 0 } }).loc)).toEqual(['Aucun candidat.'])
    expect(libelles(P.casesDuLot({ ...v, candidats: { retenus: 0, aEtudier: 2 } }).loc)).toEqual(['2 candidatures à étudier.'])
    expect(libelles(P.casesDuLot({ ...v, candidats: { retenus: 1, aEtudier: 2 } }).loc)).toEqual(['Candidat retenu : bail à établir.'])
  })
  it('congé reçu : date de départ, puis diagnostics à fournir pour le prochain bail', () => {
    const c = P.casesDuLot({ today: AUJ, phase: 'relocation', vacant: false, dateSortie: '2026-10-31', candidats: {}, diagnostics: ['dpe', 'erp'], fmt, enPlace: true })
    expect(libelles(c.loc)).toEqual(['Départ du locataire le 31/10/2026.', 'Diagnostics à fournir : DPE, ERP.'])
    expect(gestes(c.loc)).toEqual(['vacant', 'diag'])
  })
  it('bail en préparation : bail à signer (ou signé sur papier), EDL, caution, attestation avant l\'entrée, diagnostics', () => {
    const c = P.casesDuLot({ today: AUJ, phase: 'preparation', bail: { debut: '2026-11-01', sig: 'non' }, edlEntree: false, cautions: ['Mme Roux'], attestations: [], diagnostics: ['erp'], fmt })
    expect(libelles(c.loc)).toEqual([
      'Bail à signer (entrée le 01/11/2026).',
      'État des lieux d’entrée à faire.',
      'Acte de cautionnement de Mme Roux à classer.',
      'Attestation d’assurance à recevoir avant l’entrée.',
      'Diagnostic à fournir : ERP.',
    ])
    expect(gestes(c.loc)).toEqual(['bail', 'bail-papier', 'edl', 'edl-papier', 'caut', 'ass', 'diag'])
  })
  it('préparation : signature partielle, attestation déjà reçue, bail signé = lignes correspondantes seulement', () => {
    expect(libelles(P.casesDuLot({ today: AUJ, phase: 'preparation', bail: { debut: '2026-11-01', sig: 'partiel' }, edlEntree: true, attestations: ['2027-11-01'] }).loc))
      .toEqual(['Bail : signature du locataire en attente.'])
    expect(P.casesDuLot({ today: AUJ, phase: 'preparation', bail: { debut: '2026-11-01', sig: 'externe' }, edlEntree: true, attestations: ['2027-11-01'] }).loc).toBeNull()
  })
})

describe('casesDuLot — anticipation (Didier 16/10 : révision 30 j avant, assurance et entretiens 15 j avant)', () => {
  const base = { today: AUJ, phase: 'en-cours', fmt, enPlace: true }
  it('révision : à préparer dans les 30 jours avant la date, due ensuite ; rien au-delà de 30 jours', () => {
    expect(libelles(P.casesDuLot({ ...base, revision: { etat: 'preavis', dateAnniv: '2026-11-10', hc: 400, nouveauHC: 405 } }).irl))
      .toEqual(['Révision à préparer (le 10/11/2026) : 400 € → 405 € hors charges.'])
    expect(P.casesDuLot({ ...base, revision: { etat: 'preavis', dateAnniv: '2026-11-20', hc: 400 } }).irl).toBeNull()   // J-35
    expect(libelles(P.casesDuLot({ ...base, revision: { etat: 'applicable', dateAnniv: '2026-10-01', hc: 400, nouveauHC: 405 } }).irl))
      .toEqual(['Révision due depuis le 01/10/2026 : 400 € → 405 € hors charges.'])
  })
  it('assurance : à renouveler dans les 15 jours avant l’échéance ; rien au-delà', () => {
    expect(libelles(P.casesDuLot({ ...base, assurance: { etat: 'bientot', echeance: '2026-10-30' } }).ass))
      .toEqual(['Attestation à renouveler le 30/10/2026 : demander la nouvelle au locataire.'])
    expect(P.casesDuLot({ ...base, assurance: { etat: 'bientot', echeance: '2026-11-05' } }).ass).toBeNull()   // J-20
  })
  it('entretiens : à faire dans les 15 jours avant l’échéance, en retard ensuite ; rien au-delà', () => {
    const c = P.casesDuLot({ ...base, entretiens: [
      { libelle: 'Entretien chaudière gaz', retardJours: 0, joursAvant: 10, echeance: '2026-10-26' },
      { libelle: 'Ramonage', retardJours: 0, joursAvant: 25, echeance: '2026-11-10' },
      { libelle: 'Entretien VMC', retardJours: 12 },
    ] })
    expect(libelles(c.entr)).toEqual(['Entretien chaudière gaz : à faire avant le 26/10/2026.', 'Entretien VMC : en retard de 12 jours.'])
  })
  it('constante d’anticipation exposée', () => {
    expect(P.ANTICIPATION_JOURS).toEqual({ irl: 30, ass: 15, entr: 15 })
  })
})


describe('outils', () => {
  it('derniereEcheance : la plus récente, vides ignorées', () => {
    expect(P.derniereEcheance(['2026-09-29', '', null, '2027-09-30'])).toBe('2027-09-30')
    expect(P.derniereEcheance([])).toBe('')
  })
  it('colonnes : Assurance · Entretiens · Révision · Mise en location, chacune avec un titre de bulle', () => {
    expect(P.COLONNES.map((c) => c.l)).toEqual(['Assurance', 'Entretiens', 'Révision', 'Mise en location'])
    for (const c of P.COLONNES) expect(P.TITRES[c.k]).toBeTruthy()
    expect(P.TITRES.loyer).toBe('Loyer')
  })
  it('le miroir IIFE window.PilotageLot rend les mêmes résultats que le module', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const sb = { window: {} }
    vm.createContext(sb)
    vm.runInContext(readFileSync(resolve(root, 'js/helpers/pilotage-lot.global.js'), 'utf8'), sb)
    const G = sb.window.PilotageLot
    const f = { today: AUJ, phase: 'preparation', bail: { debut: '2026-11-01', sig: 'non' }, edlEntree: false, cautions: ['X'], diagnostics: ['erp'], fmt }
    expect(JSON.stringify(G.casesDuLot(f))).toBe(JSON.stringify(P.casesDuLot(f)))
    expect(G.phaseDuLot({ today: AUJ, loue: true, bail: { debut: '2026-11-01' } })).toBe('preparation')
  })
})
