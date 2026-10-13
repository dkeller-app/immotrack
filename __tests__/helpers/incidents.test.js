/**
 * TRAVAUX : QUI PAIE ? — registre des incidents (js/core/incidents.js).
 *   N-1 création, statuts horodatés, tri, contexte (meublé / copropriété).
 *   N-2 annuaire officiel : requête minimale (code d'activité + code postal + actifs), lecture
 *       (établissements actifs du code postal, dédoublonnés), ORDRE ALPHABÉTIQUE.
 *   N-3 liste RGE : qualification en cours seulement, une ligne par entreprise, ordre alphabétique.
 *   N-4 carnet dérivé, numéros d'assistance, famille « Incidents à traiter ».
 */
import { describe, it, expect } from 'vitest'
import {
  nouvelIncident, changerStatut, incidentsDe, estOuvert, contexteDe, annuaireUrl, lireAnnuaire, rgeUrl, lireRge,
  carnetArtisans, assistances, itemsIncidents, chiffreIncidents, NAF_METIERS, statutLbl,
} from '../../js/core/incidents.js'
import { ELEMENTS } from '../../js/core/qui-paie.js'

describe('N-1 · incident', () => {
  it('nouvelIncident : valeurs par défaut prudentes, point d\'accroche IA vide', () => {
    const i = nouvelIncident({ id: 5, logRef: 'T2', element: 'ballon', ageAns: '14' }, '2026-10-13T09:12:00.000Z')
    expect(i).toMatchObject({ id: 5, logRef: 'T2', statut: 'signale', cause: 'inconnue', intervention: 'inconnue', ageAns: 14, ia: null, mouvementIds: [] })
    expect(i.statutDates).toEqual({ signale: '2026-10-13T09:12:00.000Z' })
    expect(nouvelIncident({ ageAns: '' }, 'T').ageAns).toBeNull()
  })
  it('changerStatut : horodate chaque passage, garde les dates précédentes, refuse un statut inconnu', () => {
    const i = nouvelIncident({ id: 1 }, '2026-10-13T09:00:00Z')
    changerStatut(i, 'en_cours', '2026-10-13T10:00:00Z'); changerStatut(i, 'resolu', '2026-10-16T08:00:00Z')
    expect(i.statutDates).toEqual({ signale: '2026-10-13T09:00:00Z', en_cours: '2026-10-13T10:00:00Z', resolu: '2026-10-16T08:00:00Z' })
    changerStatut(i, 'perdu', 'x'); expect(i.statut).toBe('resolu')
    expect(statutLbl('en_cours')).toBe('En cours')
  })
  it('incidentsDe : vivants, du plus récent au plus ancien, par logement ou partie commune', () => {
    const l = [{ id: 1, logRef: 'T2', creeLe: '2026-01-01' }, { id: 2, logRef: 't2 ', creeLe: '2026-05-01' }, { id: 3, logRef: 'T2', creeLe: '2026-09-01', _deleted: true }, { id: 4, logRef: '', imm: 'Tilleuls', creeLe: '2026-02-01' }]
    expect(incidentsDe(l, { logRef: 'T2' }).map((x) => x.id)).toEqual([2, 1])
    expect(incidentsDe(l, { imm: 'tilleuls' }).map((x) => x.id)).toEqual([4])
    expect(estOuvert({ statut: 'resolu' })).toBe(false)
  })
  it('contexteDe : meublé lu sur le type de bail, copropriété sur l\'immeuble, inconnu = null', () => {
    expect(contexteDe({ bail: { type: 'meuble' }, imm: { regimeJuridique: 'Copropriété' } })).toMatchObject({ meuble: true, copro: true })
    expect(contexteDe({ bail: { type: 'nu' }, imm: { regimeJuridique: 'Monopropriété' } })).toMatchObject({ meuble: false, copro: false })
    expect(contexteDe({ bail: { type: 'mobilite' } })).toMatchObject({ meuble: true, copro: null })
    expect(contexteDe({})).toMatchObject({ meuble: null, copro: null })
  })
})

describe('N-2 · annuaire officiel des entreprises', () => {
  it('URL : code d\'activité, code postal, entreprises actives ; rien d\'autre', () => {
    const u = new URL(annuaireUrl({ metier: 'plomberie', codePostal: '68 130' }))
    expect(u.origin + u.pathname).toBe('https://recherche-entreprises.api.gouv.fr/search')
    expect(Object.fromEntries(u.searchParams)).toEqual({ activite_principale: '43.22A', code_postal: '68130', etat_administratif: 'A', per_page: '25', page: '1' })
    expect(new URL(annuaireUrl({ metier: 'ramonage', codePostal: '68130' })).searchParams.get('q')).toBe('ramonage')
    expect(annuaireUrl({ metier: 'plomberie', codePostal: '681' })).toBeNull()
    expect(annuaireUrl({ metier: 'astrologie', codePostal: '68130' })).toBeNull()
  })
  it('chaque métier des éléments a un code d\'activité', () => {
    ELEMENTS.filter((e) => e.metier).forEach((e) => expect(NAF_METIERS[e.metier], e.k).toBeTruthy())
  })
  it('lecture : établissements actifs du code postal, siège ailleurs ignoré, dédoublonnés, ordre alphabétique', () => {
    const json = { results: [
      { nom_complet: 'ZINGUERIE BADER', siege: { siret: '1', code_postal: '68130', etat_administratif: 'A', adresse: '27 RTE DE BELFORT 68130 ASPACH', libelle_commune: 'ASPACH' }, matching_etablissements: [{ siret: '1', code_postal: '68130', etat_administratif: 'A', adresse: '27 RTE DE BELFORT 68130 ASPACH', libelle_commune: 'ASPACH' }] },
      { nom_complet: 'ALTKIRCH SANITAIRE', siege: { siret: '9', code_postal: '75008', etat_administratif: 'A' }, matching_etablissements: [{ siret: '2', code_postal: '68130', etat_administratif: 'A', adresse: '5 RUE DE FERRETTE 68130 ALTKIRCH', libelle_commune: 'ALTKIRCH', liste_rge: ['x'] }, { siret: '3', code_postal: '68130', etat_administratif: 'F' }] },
      { nom_complet: 'MULHOUSE PLOMB', siege: { siret: '4', code_postal: '68100', etat_administratif: 'A' }, matching_etablissements: [] },
    ] }
    const l = lireAnnuaire(json, '68130')
    expect(l.map((x) => x.nom)).toEqual(['ALTKIRCH SANITAIRE', 'ZINGUERIE BADER'])
    expect(l[0]).toMatchObject({ siret: '2', commune: 'ALTKIRCH', rge: true, ficheUrl: 'https://annuaire-entreprises.data.gouv.fr/etablissement/2' })
    expect(lireAnnuaire(null, '68130')).toEqual([])
  })
})

describe('N-3 · liste RGE (ADEME)', () => {
  it('URL par code postal ; lecture : validité en cours, domaines regroupés, ordre alphabétique', () => {
    expect(new URL(rgeUrl({ codePostal: '68130' })).searchParams.get('qs')).toBe('code_postal:68130')
    expect(rgeUrl({ codePostal: '' })).toBeNull()
    const json = { results: [
      { nom_entreprise: 'HEINIS ENERGIES', siret: '5', lien_date_fin: '2028-12-03', domaine: 'Chaudière', telephone: '03 89' },
      { nom_entreprise: 'HEINIS ENERGIES', siret: '5', lien_date_fin: '2028-12-03', domaine: 'Pompe à chaleur' },
      { nom_entreprise: 'ANCIEN RGE', siret: '6', lien_date_fin: '2025-01-01', domaine: 'Isolation' },
      { nom_entreprise: 'ALSACE ISOLATION', siret: '7', lien_date_fin: '2027-01-01', domaine: 'Isolation' },
    ] }
    const l = lireRge(json, '2026-10-13')
    expect(l.map((x) => x.nom)).toEqual(['ALSACE ISOLATION', 'HEINIS ENERGIES'])
    expect(l[1].domaines).toEqual(['Chaudière', 'Pompe à chaleur'])
  })
})

describe('N-4 · carnet, assistance, famille', () => {
  it('carnet : artisans des incidents + intervenants d\'entretien, dédoublonnés, le plus récent d\'abord', () => {
    const inc = [
      { id: 1, element: 'robinet', logRef: 'T2', artisan: { nom: 'Sanitaire Muller', tel: '03 89', siret: '111' }, statutDates: { resolu: '2026-10-05' }, creeLe: '2026-10-02' },
      { id: 2, element: 'ballon', logRef: 'T2', artisan: { nom: 'Sanitaire Muller', siret: '111' }, statutDates: { resolu: '2026-03-01' }, creeLe: '2026-03-01' },
      { id: 3, element: 'vitre', artisan: null },
      { id: 4, element: 'x', artisan: { nom: 'Supprimé' }, _deleted: true },
    ]
    const eq = { T2: { CHAUDIERE_GAZ: { lastDate: '2026-09-12', interv: 'Chauffage Kieffer' } } }
    const c = carnetArtisans(inc, eq)
    expect(c.map((a) => [a.nom, a.date])).toEqual([['Sanitaire Muller', '2026-10-05'], ['Chauffage Kieffer', '2026-09-12']])
  })
  it('assistances : MRH du logement et PNO (logement d\'abord, sinon immeuble), numéro absent = vide', () => {
    const a = assistances({
      mrh: [{ id: 1, logement: 'T2', compagnie: 'MAIF', telAssistance: '0 800 875 875', echeance: '2027-01-01' }],
      assurances: [{ id: 9, type: 'PNO', portee: 'immeuble', immeuble: 'Tilleuls', compagnie: 'Groupama' }],
      logRef: 'T2', imm: 'Tilleuls',
    })
    expect(a.mrh).toMatchObject({ compagnie: 'MAIF', tel: '0 800 875 875' })
    expect(a.pno).toMatchObject({ compagnie: 'Groupama', tel: '' })
    expect(assistances({}).mrh.id).toBeNull()
  })
  it('famille : non résolus seulement, urgences en tête, chiffre de gravité', () => {
    const inc = [
      { id: 1, logRef: 'T2', element: 'ballon', creeLe: '2026-10-13T09:00:00Z', statut: 'en_cours', urgences: ['chauffage'] },
      { id: 2, logRef: 'T2', element: 'plafond', creeLe: '2026-09-28', statut: 'signale', urgences: [] },
      { id: 3, logRef: 'F1', element: 'vitre', creeLe: '2026-01-01', statut: 'resolu' },
    ]
    const it = itemsIncidents(inc, '2026-10-13')
    expect(it).toHaveLength(2)
    expect(it.find((x) => x.incId === 1)).toMatchObject({ urgent: true, age: 0 })
    expect(it.find((x) => x.incId === 1).urgenceJours).toBeGreaterThan(it.find((x) => x.incId === 2).urgenceJours)
    expect(chiffreIncidents(it)).toBe('1 urgent')
    expect(chiffreIncidents(it.filter((x) => !x.urgent))).toBe('depuis 15 jours')
  })
})
