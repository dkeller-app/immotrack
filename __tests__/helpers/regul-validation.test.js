/**
 * ALERTE-REGUL (14/10/2026) — la régularisation validée, PARTAGÉE par toute la SCI.
 *
 *   V  règle de validation (js/core/regul-validation.js) : validé / non validé / période à cheval /
 *      plusieurs immeubles / plusieurs SCI / logement sans immeuble.
 *   A  règle d'alerte (AlertRules.regulAEmettre) branchée sur cette validation.
 *   M  migration douce de l'ancien stockage (config de l'espace propre) vers les logements.
 *   S  synchronisation simulée de DEUX membres de la SCI (propriétaire + associé) à travers les vrais
 *      stores cloud (store-supabase + store-multi) et un serveur en mémoire.
 */
import { describe, it, expect } from 'vitest'
import {
  SANS_IMMEUBLE, groupeRegul, clePeriode, lirePeriode, periodeValidee, regulValideePourAnnee,
  logementsDuGroupe, groupeValide, validerPeriode, validationsDuLogement, migrerValidationsHeritees,
} from '../../js/core/regul-validation.js'
import { regulAEmettre } from './alert-rules.js'
import { createSupabaseStore } from '../../js/core/store-supabase.js'
import { createMultiStore } from '../../js/core/store-multi.js'
import { makeDetUuid } from '../../js/core/det-uuid.js'

const TODAY = new Date('2026-10-15T00:00:00')
const isLoyer = c => c === 'Loyers encaissés'
const estValidee = (l, annee) => regulValideePourAnnee(l, annee)
const loyer2025 = ref => ({ id: 'm-' + ref, qui: ref, cat: 'Loyers encaissés', cr: 700, date: '2025-03-05' })

describe('V · règle de validation', () => {
  it('V-1 groupe : immeuble, sinon « (sans immeuble) »', () => {
    expect(groupeRegul({ imm: 'Tilleuls' })).toBe('Tilleuls')
    expect(groupeRegul({ imm: '' })).toBe(SANS_IMMEUBLE)
    expect(groupeRegul({})).toBe(SANS_IMMEUBLE)
  })
  it('V-2 clé de période : dates ISO seulement', () => {
    expect(clePeriode('2025-01-01', '2025-12-31')).toBe('2025-01-01|2025-12-31')
    expect(clePeriode('2025-01-01T10:00:00', '2025-12-31')).toBe('2025-01-01|2025-12-31')
    expect(clePeriode('2025-01', '2025-12')).toBeNull()
    expect(clePeriode('', '2025-12-31')).toBeNull()
    expect(lirePeriode('2025-01-01|2025-12-31')).toEqual({ du: '2025-01-01', au: '2025-12-31' })
    expect(lirePeriode('Imm|2025-01-01|2025-12-31')).toBeNull()
  })
  it('V-3 non validé : rien posé, objet vide, valeur fausse', () => {
    expect(regulValideePourAnnee({ ref: 'A' }, 2025)).toBe(false)
    expect(regulValideePourAnnee({ ref: 'A', regulValidations: {} }, 2025)).toBe(false)
    expect(regulValideePourAnnee({ ref: 'A', regulValidations: { '2025-01-01|2025-12-31': null } }, 2025)).toBe(false)
    expect(regulValideePourAnnee(null, 2025)).toBe(false)
  })
  it('V-4 validé : exercice civil de l\'année', () => {
    const l = { ref: 'A', regulValidations: { '2025-01-01|2025-12-31': { at: 'x' } } }
    expect(regulValideePourAnnee(l, 2025)).toBe(true)
    expect(regulValideePourAnnee(l, 2024)).toBe(false)   // une autre année n'est pas soldée
    expect(periodeValidee(l, '2025-01-01', '2025-12-31')).toBe(true)
    expect(periodeValidee(l, '2025-01-01', '2025-06-30')).toBe(false)
  })
  it('V-5 période à cheval : un exercice décalé qui CONTIENT le 31/12 solde l\'année ; une période partielle non', () => {
    const decale = { ref: 'A', regulValidations: { '2025-07-01|2026-06-30': { at: 'x' } } }
    expect(regulValideePourAnnee(decale, 2025)).toBe(true)
    expect(regulValideePourAnnee(decale, 2026)).toBe(false)
    const partielle = { ref: 'A', regulValidations: { '2025-01-01|2025-03-31': { at: 'x' } } }
    expect(regulValideePourAnnee(partielle, 2025)).toBe(false)
    const finPile = { ref: 'A', regulValidations: { '2025-04-01|2025-12-31': { at: 'x' } } }
    expect(regulValideePourAnnee(finPile, 2025)).toBe(true)
  })
  it('V-6 valider pose la période sur chaque logement, idempotent (garde la date du premier)', () => {
    const L = [{ ref: 'A' }, { ref: 'B', regulValidations: { '2024-01-01|2024-12-31': { at: 'old' } } }, { ref: 'C', _deleted: true }]
    const stamped = []
    const r = validerPeriode(L, '2025-01-01', '2025-12-31', { at: 'T1', stamp: l => stamped.push(l.ref) })
    expect(r).toEqual({ cle: '2025-01-01|2025-12-31', refs: ['A', 'B'] })
    expect(stamped).toEqual(['A', 'B'])
    expect(L[1].regulValidations).toEqual({ '2024-01-01|2024-12-31': { at: 'old' }, '2025-01-01|2025-12-31': { at: 'T1' } })
    expect(L[2].regulValidations).toBeUndefined()   // tombstone jamais touché
    const r2 = validerPeriode(L, '2025-01-01', '2025-12-31', { at: 'T2' })
    expect(r2.refs).toEqual([])
    expect(L[0].regulValidations['2025-01-01|2025-12-31'].at).toBe('T1')
    expect(validerPeriode(L, '2025-01', '2025-12').cle).toBeNull()
  })
  it('V-7 plusieurs immeubles : valider un immeuble ne valide pas l\'autre', () => {
    const logs = [{ ref: 'A1', imm: 'Tilleuls' }, { ref: 'A2', imm: 'Tilleuls' }, { ref: 'B1', imm: 'Chênes' }]
    validerPeriode(logementsDuGroupe(logs, 'Tilleuls'), '2025-01-01', '2025-12-31', { at: 'x' })
    expect(logs.map(l => regulValideePourAnnee(l, 2025))).toEqual([true, true, false])
    expect(groupeValide(logementsDuGroupe(logs, 'Tilleuls'), '2025-01-01', '2025-12-31')).toBe(true)
    expect(groupeValide(logementsDuGroupe(logs, 'Chênes'), '2025-01-01', '2025-12-31')).toBe(false)
  })
  it('V-8 plusieurs SCI : le filtre de bailleur actif borne la validation', () => {
    const logs = [{ ref: 'A1', imm: 'Gare', entity: 'SCI A' }, { ref: 'B1', imm: 'Gare', entity: 'SCI B' }]
    const g = logementsDuGroupe(logs, 'Gare', l => l.entity === 'SCI A')
    expect(g.map(l => l.ref)).toEqual(['A1'])
    validerPeriode(g, '2025-01-01', '2025-12-31', { at: 'x' })
    expect(regulValideePourAnnee(logs[0], 2025)).toBe(true)
    expect(regulValideePourAnnee(logs[1], 2025)).toBe(false)   // l'autre SCI n'est pas touchée
  })
  it('V-9 logement sans immeuble : son propre groupe, validé comme les autres', () => {
    const logs = [{ ref: 'Maison' }, { ref: 'Studio', imm: '' }, { ref: 'A1', imm: 'Tilleuls' }]
    const g = logementsDuGroupe(logs, SANS_IMMEUBLE)
    expect(g.map(l => l.ref)).toEqual(['Maison', 'Studio'])
    validerPeriode(g, '2025-01-01', '2025-12-31', { at: 'x' })
    expect(logs.map(l => regulValideePourAnnee(l, 2025))).toEqual([true, true, false])
  })
  it('V-10 groupe validé = TOUS ses logements concernés (et au moins un)', () => {
    const a = { ref: 'A', regulValidations: { '2025-01-01|2025-12-31': { at: 'x' } } }, b = { ref: 'B' }
    expect(groupeValide([a, b], '2025-01-01', '2025-12-31')).toBe(false)
    expect(groupeValide([a], '2025-01-01', '2025-12-31')).toBe(true)
    expect(groupeValide([], '2025-01-01', '2025-12-31')).toBe(false)
  })
  it('V-11 validations d\'un logement listées (clés valides seulement, triées)', () => {
    const l = { regulValidations: { '2025-01-01|2025-12-31': { at: 'b' }, 'n|imp': { at: 'z' }, '2024-01-01|2024-12-31': { at: 'a' }, '2023-01-01|2023-12-31': false } }
    expect(validationsDuLogement(l)).toEqual([
      { du: '2024-01-01', au: '2024-12-31', at: 'a' },
      { du: '2025-01-01', au: '2025-12-31', at: 'b' },
    ])
    expect(validationsDuLogement({})).toEqual([])
  })
})

describe('A · alerte « Régularisation N-1 à émettre »', () => {
  const logs = () => [
    { ref: 'A1', imm: 'Tilleuls', locataire: 'Dupont', ch: 50 },
    { ref: 'B1', imm: 'Chênes', locataire: 'Martin', ch: 40 },
    { ref: 'M', locataire: 'Durand', ch: 30 },   // logement sans immeuble
  ]
  const mvs = [loyer2025('A1'), loyer2025('B1'), loyer2025('M')]
  it('A-1 non validé → alerte pour chaque logement loué en N-1', () => {
    expect(regulAEmettre(logs(), mvs, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['A1', 'B1', 'M'])
  })
  it('A-2 validé → l\'alerte du logement disparaît, celles des autres restent', () => {
    const L = logs()
    validerPeriode(logementsDuGroupe(L, 'Tilleuls'), '2025-01-01', '2025-12-31', { at: 'x' })
    expect(regulAEmettre(L, mvs, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['B1', 'M'])
  })
  it('A-3 logement sans immeuble : validé par son groupe, l\'alerte disparaît', () => {
    const L = logs()
    validerPeriode(logementsDuGroupe(L, SANS_IMMEUBLE), '2025-01-01', '2025-12-31', { at: 'x' })
    expect(regulAEmettre(L, mvs, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['A1', 'B1'])
  })
  it('A-4 période à cheval contenant le 31/12/N-1 → soldée ; période validée de l\'année COURANTE → ne solde pas N-1', () => {
    const L = logs()
    L[0].regulValidations = { '2025-07-01|2026-06-30': { at: 'x' } }
    L[1].regulValidations = { '2026-01-01|2026-12-31': { at: 'x' } }
    expect(regulAEmettre(L, mvs, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['B1', 'M'])
  })
  it('A-5 la catégorie AUTO du syndic n\'est pas la régul du locataire (elle n\'efface rien)', () => {
    const m2 = mvs.concat([{ id: 'syn', qui: 'A1', cat: 'Régularisation provisions copro N-1', db: 120, date: '2026-04-01' }])
    expect(regulAEmettre(logs(), m2, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['A1', 'B1', 'M'])
  })
  it('A-6 héritage : un mouvement de catégorie personnelle « régularisation » en N efface encore l\'alerte', () => {
    const m2 = mvs.concat([{ id: 'r', qui: 'B1', cat: 'Régularisation charges locataire', cr: 30, date: '2026-03-01' }])
    expect(regulAEmettre(logs(), m2, TODAY, isLoyer, estValidee).map(x => x.ref)).toEqual(['A1', 'M'])
  })
  it('A-7 sans règle de validation injectée : comportement d\'avant (prudence : l\'alerte reste)', () => {
    const L = logs()
    validerPeriode(L, '2025-01-01', '2025-12-31', { at: 'x' })
    expect(regulAEmettre(L, mvs, TODAY, isLoyer).map(x => x.ref)).toEqual(['A1', 'B1', 'M'])
  })
})

describe('M · migration de l\'ancien stockage (config de l\'espace propre)', () => {
  it('M-1 reverse chaque clé sur les logements de son groupe, retire la clé, supprime l\'objet vide', () => {
    const db = {
      logements: [{ ref: 'A1', imm: 'Tilleuls' }, { ref: 'A2', imm: 'Tilleuls' }, { ref: 'M' }, { ref: 'X', imm: 'Tilleuls', _deleted: true }],
      regulValidations: { 'Tilleuls|2025-01-01|2025-12-31': { at: 'T' }, '(sans immeuble)|2024-01-01|2024-12-31': { at: 'U' } },
    }
    const stamped = []
    const r = migrerValidationsHeritees(db, { stamp: l => stamped.push(l.ref) })
    expect(r.migres).toBe(2)
    expect(r.conservees).toEqual([])
    expect(db.regulValidations).toBeUndefined()
    expect(db.logements[0].regulValidations).toEqual({ '2025-01-01|2025-12-31': { at: 'T' } })
    expect(db.logements[2].regulValidations).toEqual({ '2024-01-01|2024-12-31': { at: 'U' } })
    expect(db.logements[3].regulValidations).toBeUndefined()
    expect(stamped.sort()).toEqual(['A1', 'A2', 'M'])
    // idempotente
    expect(migrerValidationsHeritees(db)).toEqual({ migres: 0, refs: [], conservees: [] })
  })
  it('M-2 rien n\'est jeté : clé illisible ou sans logement conservée', () => {
    const db = { logements: [{ ref: 'A1', imm: 'Tilleuls' }], regulValidations: { 'Disparu|2025-01-01|2025-12-31': { at: 'T' }, 'Tilleuls|2025-01|2025-12': { ok: 1 }, 'Tilleuls|2025-01-01|2025-12-31': { at: 'V' } } }
    const r = migrerValidationsHeritees(db)
    expect(r.migres).toBe(1)
    expect(Object.keys(db.regulValidations).sort()).toEqual(['Disparu|2025-01-01|2025-12-31', 'Tilleuls|2025-01|2025-12'])
  })
  it('M-3 nom d\'immeuble contenant « | »', () => {
    const db = { logements: [{ ref: 'A1', imm: 'A|B' }], regulValidations: { 'A|B|2025-01-01|2025-12-31': { at: 'T' } } }
    migrerValidationsHeritees(db)
    expect(regulValideePourAnnee(db.logements[0], 2025)).toBe(true)
  })
  it('M-4 mode cloud : seuls les logements de l\'espace PROPRE reçoivent la validation (jamais une SCI tierce homonyme)', () => {
    const db = {
      logements: [{ ref: 'A1', imm: 'Gare', _espaceId: 'MOI' }, { ref: 'N1', imm: 'Gare' }, { ref: 'T1', imm: 'Gare', _espaceId: 'AUTRE' }],
      regulValidations: { 'Gare|2025-01-01|2025-12-31': { at: 'T' } },
    }
    migrerValidationsHeritees(db, { espacePropre: 'MOI' })
    expect(db.logements.map(l => regulValideePourAnnee(l, 2025))).toEqual([true, true, false])
  })
  it('M-5 ne réécrit pas une validation déjà portée par le logement', () => {
    const db = { logements: [{ ref: 'A1', imm: 'T', regulValidations: { '2025-01-01|2025-12-31': { at: 'NOUVEAU' } } }], regulValidations: { 'T|2025-01-01|2025-12-31': { at: 'ANCIEN' } } }
    const r = migrerValidationsHeritees(db)
    expect(r.refs).toEqual([])
    expect(db.logements[0].regulValidations['2025-01-01|2025-12-31'].at).toBe('NOUVEAU')
  })
})

// ─── S · deux membres de la même SCI, à travers les vrais stores cloud ───────────────────────────────────
// Serveur en mémoire : une table = Map id → {id, version, deleted_at, legacy_raw}. Le writer applique la
// concurrence optimiste comme le binding réel (UPDATE gardé par version, INSERT fail-closed).
function serveur() {
  const tables = new Map()
  const t = name => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name) }
  const clone = x => JSON.parse(JSON.stringify(x))
  const writer = {
    async insert(table, row) { const T = t(table); if (T.has(row.id)) return null; T.set(row.id, { ...clone(row), version: 1, deleted_at: null }); return 1 },
    async update(table, id, row, version) { const T = t(table); const cur = T.get(id); if (!cur || cur.version !== version || cur.deleted_at) return null; T.set(id, { ...clone(row), version: version + 1, deleted_at: null }); return version + 1 },
    async softDelete(table, id, version) { const T = t(table); const cur = T.get(id); if (!cur || cur.version !== version) return null; cur.deleted_at = 'now'; cur.version++; return cur.version },
  }
  const fetchTable = async (name, espace) => [...t(name).values()].filter(r => !r.deleted_at && r.espace_id === espace).map(clone)
  return { tables, writer, fetchTable }
}
function storePour(srv, espaceId, ownerId) {
  return createSupabaseStore({
    fetchTable: name => srv.fetchTable(name, espaceId), fetchConfig: async () => ({}),
    writer: srv.writer, writeConfig: async () => {}, detUuid: makeDetUuid(ownerId), espaceId, ownerId,
  })
}

describe('S · synchronisation simulée de deux membres de la SCI', () => {
  it('S-1 l\'associée valide → après synchronisation, l\'alerte disparaît aussi chez le propriétaire (et inversement)', async () => {
    const srv = serveur()
    // Le propriétaire (espace E-DID) crée sa SCI, son immeuble, deux lots loués en 2025.
    const proprio = storePour(srv, 'E-DID', 'u-didier')
    const dbP = {
      entites: [{ id: 1, nom: 'SCI Smart', immeubles: [{ id: 1, nom: 'Tilleuls' }] }],
      logements: [{ id: 10, ref: 'A1', imm: 'Tilleuls', entity: 'SCI Smart', locataire: 'Dupont', ch: 50 }, { id: 11, ref: 'M', entity: 'SCI Smart', locataire: 'Durand', ch: 30 }],
      mouvements: [{ ...loyer2025('A1'), id: 100 }, { ...loyer2025('M'), id: 101 }],
      baux: {},
    }
    proprio.attach(dbP)
    for (const e of dbP.entites) expect((await proprio.upsert('entites', e)).status).toBe('inserted')
    for (const l of dbP.logements) expect((await proprio.upsert('logements', l)).status).toBe('inserted')
    for (const m of dbP.mouvements) expect((await proprio.upsert('mouvements', m)).status).toBe('inserted')

    // L'associée : son espace propre (vide) + la SCI octroyée par le propriétaire.
    const multiA = createMultiStore({
      espaces: [{ espaceId: 'E-MAR', ownerId: 'u-marion', mine: true }, { espaceId: 'E-DID', ownerId: 'u-didier', mine: false }],
      makeStore: (eid, oid) => storePour(srv, eid, oid),
      getDB: () => dbA,
    })
    let dbA = await multiA.hydrate()
    const alerteChez = db => regulAEmettre(db.logements, db.mouvements, TODAY, isLoyer, estValidee).map(x => x.ref)
    expect(alerteChez(dbA)).toEqual(['A1', 'M'])

    // L'associée valide la régul 2025 de l'immeuble « Tilleuls » (onglet Charges) → envoi au cloud.
    const touches = validerPeriode(logementsDuGroupe(dbA.logements, 'Tilleuls'), '2025-01-01', '2025-12-31', { at: '2026-10-15T08:00:00Z' })
    expect(touches.refs).toEqual(['A1'])
    for (const ref of touches.refs) {
      const l = dbA.logements.find(x => x.ref === ref)
      expect(l._espaceId).toBe('E-DID')   // routé vers l'espace du propriétaire (RLS par SCI : has_entite_write)
      expect((await multiA.upsert('logements', l)).status).toBe('updated')
    }

    // Le propriétaire se resynchronise : l'alerte de A1 a disparu chez lui aussi ; M reste à émettre.
    const proprio2 = storePour(srv, 'E-DID', 'u-didier')
    const dbP2 = await proprio2.hydrate()
    expect(alerteChez(dbP2)).toEqual(['M'])

    // Inversement : le propriétaire valide le logement sans immeuble → l'associée le voit après synchro.
    proprio2.attach(dbP2)
    const t2 = validerPeriode(logementsDuGroupe(dbP2.logements, SANS_IMMEUBLE), '2025-01-01', '2025-12-31', { at: '2026-10-15T09:00:00Z' })
    for (const ref of t2.refs) expect((await proprio2.upsert('logements', dbP2.logements.find(x => x.ref === ref))).status).toBe('updated')
    dbA = await multiA.hydrate()
    expect(alerteChez(dbA)).toEqual([])
    // La date reste celle du premier geste (l'associée), visible des deux côtés.
    expect(dbA.logements.find(l => l.ref === 'A1').regulValidations['2025-01-01|2025-12-31'].at).toBe('2026-10-15T08:00:00Z')
  })
})
