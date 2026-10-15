// __tests__/helpers/demo-nuage.test.js — COMPTE DÉMO : le nuage FICTIF (js/core/demo-nuage.js).
// Mêmes listes blanches que les accès réels (supabase-entry.js), semis à partir du plan du jeu de données,
// RPC simulées (émission / renouvellement / révocation d'un lien, devis à décider), persistance injectée.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { etatVide, lireEtat, semerNuage, creerNuage, cheminDemo, TABLES_EL, RPC_EL, TABLES_IC, RPC_IC, NUAGE_VERSION } from '../../js/core/demo-nuage.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ESP = 'esp-demo'
const LOC = { 'D-101': { bail_id: 'bail-101', bail_debut: '2023-06-15', logement_id: 'log-101' }, 'P-201': { bail_id: 'bail-201', bail_debut: '2024-07-01', logement_id: 'log-201' } }
const PLAN = {
  acces: [
    { id: 'a1', ref: 'D-101', rang: 0, nom: 'Pierre Martin', emis_le: '2026-09-01T18:02:00.000Z', derniere_visite: '2026-10-04T19:12:00.000Z', accord_quittance_le: '2026-09-01T18:06:00.000Z' },
    { id: 'a2', ref: 'P-201', rang: 1, nom: 'Sarah Lefèvre', emis_le: '2026-05-02T08:31:00.000Z' },
    { id: 'a9', ref: 'X-999', rang: 0, nom: 'Bail inconnu', emis_le: '2026-05-02T08:31:00.000Z' },
  ],
  messages: [{ acces: 'a1', auteur: 'locataire', corps: 'Bonjour', cree_le: '2026-10-04T19:14:00.000Z', lu: false }, { acces: 'a9', auteur: 'locataire', corps: 'orphelin', cree_le: 'x' }],
  signalements: [
    { id: 's1', acces: 'a1', piece: 'cuisine', element: 'fuite_eau', urgence: 'importante', description: 'Fuite', cree_le: '2026-09-29T07:55:00.000Z', incident: '4001', importe_le: '2026-09-29T08:01:00.000Z' },
    { id: 's2', acces: 'a1', piece: 'chambre', element: 'fenetre_volet', urgence: 'faible', description: 'Volet', cree_le: '2026-10-05T07:38:00.000Z', incident: null, importe_le: null },
    { id: 's3', acces: 'a1', piece: 'cuisine', element: 'chauffage', urgence: 'importante', description: 'Chaudière', cree_le: '2026-05-19T06:40:00.000Z', incident: '4002', importe_le: '2026-05-19T06:52:00.000Z', resultatDe: 4002 },
  ],
  artisanAcces: [{ id: 'ar1', incident: '4001', signalement: 's1', artisan_nom: 'Plomberie Muller', metier: 'plomberie', plafond_ttc: 300, emis_le: '2026-09-29T09:10:00.000Z' }],
  depots: [
    { id: 'dv1', acces: 'ar1', type_depot: 'devis', nom: 'Devis.pdf', numero: 'D-1', montant_ttc: 185, statut: 'auto_accepte', cree_le: '2026-09-30T07:52:00.000Z', fichier: 'demo_nuage_devis' },
    { id: 'dv2', acces: 'ar1', type_depot: 'devis', nom: 'Devis 2.pdf', numero: 'D-2', montant_ttc: 620, statut: 'en_attente', cree_le: '2026-10-01T07:52:00.000Z' },
  ],
}
const ctx = { espaceId: ESP, location: (ref) => LOC[ref] || null,
  documentsVoulus: (ref) => (ref === 'D-101' ? [{ cle: 'quittance:2026-09', type_doc: 'quittance', titre: 'Quittance de septembre 2026', periode: 'septembre 2026' }, { cle: 'quittance:2026-09', type_doc: 'quittance', titre: 'doublon' }] : [{ cle: 'edl:1', type_doc: 'edl', titre: 'EDL' }]),
  resultat: (s) => ({ payeur: 'bailleur', publieLe: '2026-05-22T16:30:00.000Z', pour: s.id }) }
const monter = () => {
  const etat = semerNuage(PLAN, ctx); const ecrits = []; let n = 0
  const N = creerNuage({ etat, espaceId: ESP, sauver: (e) => ecrits.push(JSON.stringify(e)), maintenant: () => '2026-10-05T10:00:00.000Z', nouvelId: () => 'id-' + (++n),
    uuid: (c, k) => c + ':' + k, infoBail: (bid) => (bid === 'bail-101' ? { bail_debut: '2023-06-15', logement_id: 'log-101' } : null) })
  return { etat, N, ecrits }
}

describe('semis du plan', () => {
  const e = semerNuage(PLAN, ctx)
  it('accès : seulement pour une location trouvée (jamais orphelin), avec les colonnes du cloud', () => {
    expect(e.tables.locataire_acces.map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(e.tables.locataire_acces[0]).toMatchObject({ espace_id: ESP, bail_id: 'bail-101', bail_debut: '2023-06-15', locataire_rang: 0, revoque_le: null, accord_quittance_version: 'v1', jeton_sha256: null })
    expect(e.tables.locataire_acces[1].accord_quittance_version).toBe(null)
  })
  it('messages et signalements rattachés à un accès semé ; lu → lu_bailleur_le', () => {
    expect(e.tables.locataire_messages).toHaveLength(1)
    expect(e.tables.locataire_messages[0].lu_bailleur_le).toBe(null)
    expect(e.tables.locataire_signalements.map((s) => [s.id, s.importe_le, s.incident_legacy_id])).toEqual([['s1', '2026-09-29T08:01:00.000Z', '4001'], ['s2', null, null], ['s3', '2026-05-19T06:52:00.000Z', '4002']])
    expect(e.tables.locataire_signalements[2].resultat).toMatchObject({ payeur: 'bailleur', pour: 's3' })
    expect(e.tables.locataire_signalements[2].resultat_publie_le).toBe('2026-05-22T16:30:00.000Z')
  })
  it('documents déjà publiés : un par clé et par location (rang 0 seulement), chemin fictif', () => {
    expect(e.tables.locataire_documents.map((d) => d.cle)).toEqual(['quittance:2026-09'])
    expect(e.tables.locataire_documents[0].storage_path).toBe(cheminDemo(ESP, 'el_quittance:2026-09.pdf'))
  })
  it('liens et dépôts d\'artisan ; le fichier du devis est relié à sa clé IndexedDB', () => {
    expect(e.tables.artisan_acces[0]).toMatchObject({ id: 'ar1', incident_legacy_id: '4001', signalement_id: 's1', revoque_le: null })
    expect('incident' in e.tables.artisan_acces[0]).toBe(false)
    const p = e.tables.artisan_depots[0].storage_path
    expect(e.fichiers[p]).toBe('demo_nuage_devis')
  })
  it('état relu : version et forme vérifiées, sinon à resemer', () => {
    expect(lireEtat(JSON.stringify(e))).toBeTruthy()
    expect(lireEtat('{')).toBe(null)
    expect(lireEtat(JSON.stringify({ ...e, v: NUAGE_VERSION + 1 }))).toBe(null)
    expect(lireEtat(JSON.stringify({ v: NUAGE_VERSION, tables: {} }))).toBe(null)
    expect(lireEtat(etatVide())).toBeTruthy()
  })
})

describe('accès bornés (mêmes listes blanches que supabase-entry.js)', () => {
  const src = readFileSync(resolve(ROOT, 'js/app/supabase-entry.js'), 'utf8')
  const liste = (nom) => JSON.parse(src.match(new RegExp('const ' + nom + ' = (\\[[^\\]]*\\])'))[1].replace(/'/g, '"'))
  it('tables et fonctions identiques au cloud réel', () => {
    expect([...TABLES_EL]).toEqual(liste('_EL_TABLES'))
    expect([...RPC_EL]).toEqual(liste('_EL_RPC'))
    expect([...TABLES_IC]).toEqual(liste('_IC_TABLES'))
    expect([...RPC_IC]).toEqual(liste('_IC_RPC'))
  })
  it('table ou fonction hors périmètre → refus', async () => {
    const { N } = monter()
    await expect(N.espaceLoc.select('artisan_acces', {})).rejects.toThrow(/hors/)
    await expect(N.incidentCircuit.select('locataire_messages', {})).rejects.toThrow(/hors/)
    await expect(N.espaceLoc.rpc('purge_mon_espace', {})).rejects.toThrow(/hors/)
    await expect(N.incidentCircuit.rpc('el_acces_emettre', {})).rejects.toThrow(/hors/)
  })
})

describe('espace locataire (fictif)', () => {
  it('select : filtres égalité / liste / null, projection des colonnes, copies', async () => {
    const { N, etat } = monter()
    const r = await N.espaceLoc.select('locataire_signalements', { importe_le: null })
    expect(r.map((x) => x.id)).toEqual(['s2'])
    const p = await N.espaceLoc.select('locataire_acces', { id: ['a1', 'zz'] }, 'id,locataire_nom,inexistante')
    expect(p).toEqual([{ id: 'a1', locataire_nom: 'Pierre Martin', inexistante: null }])
    p[0].locataire_nom = 'modifié'
    expect(etat.tables.locataire_acces[0].locataire_nom).toBe('Pierre Martin')
  })
  it('update conditionnel (réservation d\'un signalement) : une seule fois', async () => {
    const { N, ecrits } = monter()
    const a = await N.espaceLoc.update('locataire_signalements', 's2', { importe_le: 'x', incident_legacy_id: '9' }, { importe_le: null })
    const b = await N.espaceLoc.update('locataire_signalements', 's2', { importe_le: 'y' }, { importe_le: null })
    expect(a).toHaveLength(1); expect(b).toEqual([]); expect(ecrits.length).toBe(1)
  })
  it('message déposé : id, date, non lu ; document en double → 23505', async () => {
    const { N } = monter()
    const m = await N.espaceLoc.insert('locataire_messages', { acces_id: 'a1', auteur: 'bailleur', corps: 'Réponse', pieces: [] })
    expect(m).toMatchObject({ id: 'id-1', cree_le: '2026-10-05T10:00:00.000Z', lu_bailleur_le: null })
    const doc = { bail_id: 'bail-101', bail_debut: '2023-06-15', cle: 'quittance:2026-09' }
    await expect(N.espaceLoc.insert('locataire_documents', doc)).rejects.toMatchObject({ code: '23505' })
    const d2 = await N.espaceLoc.insert('locataire_documents', { ...doc, cle: 'quittance:2026-10' })
    expect(d2).toMatchObject({ publie_le: '2026-10-05T10:00:00.000Z', retire_le: null })
  })
  it('RPC : émettre (nouveau colocataire ou réémission), renouveler, révoquer, droit de publier', async () => {
    const { N, etat } = monter()
    const id = await N.espaceLoc.rpc('el_acces_emettre', { p_bail_id: 'bail-101', p_rang: 1, p_nom: 'Paul Martin', p_jeton_sha256: 'h' })
    expect(etat.tables.locataire_acces.find((x) => x.id === id)).toMatchObject({ bail_debut: '2023-06-15', logement_id: 'log-101', locataire_rang: 1, emis_le: '2026-10-05T10:00:00.000Z' })
    expect(await N.espaceLoc.rpc('el_acces_emettre', { p_bail_id: 'bail-101', p_rang: 0, p_nom: 'pierre martin', p_jeton_sha256: 'h2' })).toBe('a1')
    await expect(N.espaceLoc.rpc('el_acces_emettre', { p_bail_id: 'bail-inconnu', p_nom: 'X' })).rejects.toThrow()
    await N.espaceLoc.rpc('el_acces_revoquer', { p_acces_id: 'a1' })
    expect(etat.tables.locataire_acces[0].revoque_le).toBe('2026-10-05T10:00:00.000Z')
    await N.espaceLoc.rpc('el_acces_renouveler', { p_acces_id: 'a1', p_jeton_sha256: 'h3' })
    expect(etat.tables.locataire_acces[0].revoque_le).toBe(null)
    expect(await N.espaceLoc.rpc('el_peut_publier', { p_bail_id: 'bail-101' })).toBe(true)
  })
  it('dépôt d\'un fichier : confié à la fonction injectée, chemin relié', async () => {
    const deposes = []
    const etat = semerNuage(PLAN, ctx)
    const N = creerNuage({ etat, espaceId: ESP, deposer: async (p) => { deposes.push(p) } })
    expect(await N.espaceLoc.upload('esp/x/files/a.pdf', {}, 'application/pdf')).toBe('esp/x/files/a.pdf')
    expect(deposes).toEqual(['esp/x/files/a.pdf'])
    expect(N.fichierDe('esp/x/files/a.pdf')).toBe('demo_nuage:esp/x/files/a.pdf')
    expect(N.fichierDe('autre')).toBe(null)
  })
})

describe('circuit d\'un incident (fictif)', () => {
  it('nouvelle demande : l\'ancien lien du même incident est retiré', async () => {
    const { N, etat } = monter()
    const id = await N.incidentCircuit.rpc('ar_acces_emettre', { p_incident_legacy_id: 4001, p_artisan_nom: 'Autre', p_metier: 'plomberie', p_plafond_ttc: 300 })
    expect(etat.tables.artisan_acces.find((x) => x.id === 'ar1').revoque_le).toBe('2026-10-05T10:00:00.000Z')
    expect(etat.tables.artisan_acces.find((x) => x.id === id)).toMatchObject({ incident_legacy_id: '4001', revoque_le: null, espace_id: ESP })
  })
  it('devis : décidé une seule fois', async () => {
    const { N, etat } = monter()
    await N.incidentCircuit.rpc('ar_devis_decider', { p_depot_id: 'dv2', p_accepte: true })
    expect(etat.tables.artisan_depots[1]).toMatchObject({ statut: 'accepte', decide_le: '2026-10-05T10:00:00.000Z' })
    await expect(N.incidentCircuit.rpc('ar_devis_decider', { p_depot_id: 'dv2', p_accepte: false })).rejects.toThrow(/deja-decide/)
    await expect(N.incidentCircuit.rpc('ar_devis_decider', { p_depot_id: 'dv1', p_accepte: true })).rejects.toThrow(/deja-decide/)
  })
  it('valider puis retirer le lien ; publier le résultat au locataire', async () => {
    const { N, etat } = monter()
    await N.incidentCircuit.rpc('ar_acces_valider', { p_acces_id: 'ar1' })
    expect(etat.tables.artisan_acces[0].valide_le).toBe('2026-10-05T10:00:00.000Z')
    await N.incidentCircuit.rpc('ar_acces_revoquer', { p_acces_id: 'ar1' })
    expect(etat.tables.artisan_acces[0].revoque_le).toBe('2026-10-05T10:00:00.000Z')
    expect(await N.incidentCircuit.publierResultat('s1', { payeur: 'bailleur' })).toBe(true)
    expect(etat.tables.locataire_signalements[0]).toMatchObject({ resultat: { payeur: 'bailleur' }, resultat_publie_le: '2026-10-05T10:00:00.000Z' })
    expect(await N.incidentCircuit.publierResultat('inconnu', {})).toBe(false)
  })
  it('stockage plein : l\'erreur de persistance ne casse pas le geste', async () => {
    const etat = semerNuage(PLAN, ctx)
    const N = creerNuage({ etat, espaceId: ESP, sauver: () => { throw new Error('QuotaExceededError') } })
    await expect(N.incidentCircuit.rpc('ar_acces_valider', { p_acces_id: 'ar1' })).resolves.toBe(null)
  })
})
