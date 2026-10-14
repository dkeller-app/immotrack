// BAIL-EN-COURS-SIGNE-HORS-PROPRYO §2 — verrou cloud d'un bail signé hors Propryo : AUCUNE migration, la mécanique existante
// (sealSignedBaux, _identifierBaux, archivage de phase 0, journal automatique) suffit. Faux magasin, comme store-sync.test.js ;
// le VRAI mapper (store-mapping) valide ce qui partirait au cloud.
import { describe, it, expect } from 'vitest'
import { createStoreSync } from '../../js/core/store-sync.js'
import { mapToRow } from '../../js/core/store-mapping.js'
import { bailContentHash } from '../../js/core/bail-content-hash.js'
import { declarerSignatureExterne, archiverSignatures, retirerSignatureExterne } from '../../js/core/bail-signature-etat.js'
import { journalDuBail, reappliquerJournalBaux, diffModificationsBail } from '../../js/core/bail-modifications.js'

const realCtx = () => ({
  espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => 'uuid:' + p.join('|'),
  entiteByNom: new Map([['sci a', 'uuid:entite|sci a']]), immeubleByNom: new Map(),
  logementByRef: new Map([['f-1', 'uuid:logement|f-1']]), documentByLegacy: new Map(),
})
function mockStore() {
  const calls = []
  const keyOf = (coll, rec) => coll + ':' + (rec.__key ?? rec.nom ?? rec.ref ?? rec.id)
  return {
    calls,
    upsert: async (coll, rec, opts) => { calls.push({ op: 'upsert', coll, rec, opts }); return { status: 'inserted', id: keyOf(coll, rec), version: 1 } },
    remove: async (coll, rec) => { calls.push({ op: 'remove', coll, rec }); return { status: 'deleted', id: keyOf(coll, rec), version: 2 } },
    archive: async (coll, rec) => { calls.push({ op: 'archive', coll, rec }); return { status: 'archived', id: keyOf(coll, rec), version: 3 } },
  }
}
const NOW = '2026-10-06T08:00:00.000Z'
const bailNu = () => ({ entity: 'SCI A', hc: 600, ch: 40, dg: 600, debut: '2024-03-01', locataires: [{ nom: 'Dupont' }], jpay: '5' })
// Ce que saveBail écrit : le bail + signatures.externe (déclaration), AVANT tout flush.
const bailExterne = (date = '2024-02-20', extra = {}) => {
  const b = { ...bailNu(), ...extra }
  b.signatures = declarerSignatureExterne(b, { date, now: NOW, auteur: 'D', snapshot: b })
  return b
}
function setup(baux) {
  const store = mockStore()
  const db = { entites: [{ nom: 'SCI A', immeubles: [] }], logements: [{ ref: 'F-1', entity: 'SCI A' }], mouvements: [], baux, baux_historique: [], baux_evenements: [] }
  let n = 0
  const sync = createStoreSync({ store, getDB: () => db, newUid: () => 'u' + (++n), now: () => new Date('2026-10-06T08:00:00Z') })
  sync.seed()
  const bx = () => store.calls.filter(c => c.coll === 'baux').map(c => c.op + ':' + (c.rec._bailUid || '-'))
  return { store, db, sync, bx }
}

describe('déclaration : sealSignedBaux scelle un bail externe SANS écraser la source', () => {
  it('premier flush : signatureSource RESTE « externe », empreinte des termes, verrou ; une seule écriture ; stable ensuite', async () => {
    const { db, sync, store, bx } = setup({ 'F-1': bailNu() })     // baseline : non signé
    db.baux['F-1'] = bailExterne()                                  // saveBail : déclaration
    await sync.flush()
    const sg = db.baux['F-1'].signatures
    expect(sg.signatureSource).toBe('externe')                      // sealSignedBaux ne met 'immotrack' que si vide
    expect(sg.locked).toBe(true)
    expect(sg.contentHashTerms).toMatch(/^[0-9a-f]{64}$/)
    expect(sg.contentHashTerms).toBe(await bailContentHash(db.baux['F-1']))
    expect(bx()).toHaveLength(1)
    expect(bx()[0]).toMatch(/^upsert:/)
    // jamais de preuve fabriquée par le scellement
    for (const k of ['proof', 'contentHash', 'cloudPdfKey', 'certRef', 'finales']) expect(sg).not.toHaveProperty(k)
    store.calls.length = 0
    await sync.flush()
    expect(store.calls).toEqual([])                                 // ligne verrouillée : plus jamais poussée
  })
  it('le VRAI mapper produit la ligne cloud : signature_source=externe, locked=true, content_hash non nul, signed_at', async () => {
    const { db, sync, store } = setup({ 'F-1': bailNu() })
    db.baux['F-1'] = bailExterne()
    await sync.flush()
    const up = store.calls.find(c => c.op === 'upsert' && c.coll === 'baux')
    const row = mapToRow('baux', up.rec, realCtx())
    expect(row.signature_source).toBe('externe')
    expect(row.locked).toBe(true)
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.signed_at).toBe('2024-02-20T12:00:00.000Z')
    expect(row.signatures.mode).toBe('externe')
    expect(row.signatures.externe.date).toBe('2024-02-20')
  })
  it('déclaration d\'un bail sans empreinte (CHECK baux_immotrack_hash_chk) : externe n\'exige aucun hash côté mapper', () => {
    const b = { __key: 'F-1', entity: 'SCI A', signatures: declarerSignatureExterne({}, { date: '2024-02-20', now: NOW }) }
    const row = mapToRow('baux', b, realCtx())
    expect(row.signature_source).toBe('externe')
    expect(row.content_hash).toBeNull()
    expect(row.locked).toBe(false)         // pas de verrou tant que l'empreinte n'est pas posée (robuste à l'ordre de déploiement)
  })
  it('un bail EXTERNE n\'attend jamais une archive de PDF (archiveEnAttente ne vise que « avec-locataire »)', async () => {
    const { db, sync } = setup({ 'F-1': bailNu() })
    db.baux['F-1'] = bailExterne('2026-10-06')                       // date du jour : l'attente d'archive des signatures en présence ne s'applique pas
    await sync.flush()
    expect(db.baux['F-1'].signatures.locked).toBe(true)              // scellé immédiatement
  })
})

describe('modification APRÈS déclaration : journal automatique, rien de perdu', () => {
  it('un changement de vie du bail (départ) part au journal automatique rattaché à signedAt', async () => {
    const { db, sync } = setup({ 'F-1': bailNu() })
    db.baux['F-1'] = bailExterne()
    await sync.flush()                                              // scellé
    const { _bailUid, ...recon } = db.baux['F-1']
    db.baux['F-1'] = { ...recon, depart: { etape: 1 } }
    await sync.flush()
    const e = db.baux_evenements.at(-1)
    expect(e).toMatchObject({ source: 'auto', signedAt: '2024-02-20T12:00:00.000Z' })
    expect(e.changements.map(c => c.champ)).toEqual(['depart'])
  })
  it('journal + réapplication : les termes modifiés d\'un bail externe sont réappliqués au chargement (même mécanique que tout bail signé)', () => {
    const b = bailExterne()
    const modif = { ...b, jpay: '7' }
    const chg = diffModificationsBail(b, modif)
    expect(chg.map(c => c.champ)).toEqual(['jpay'])
    const evt = { id: 'bj_1', ref: 'F-1', bailDebut: b.debut, signedAt: b.signatures.signedAt, date: NOW, type: 'modification', changements: chg }
    expect(journalDuBail([evt], 'F-1', b)).toHaveLength(1)
    const baux = { 'F-1': JSON.parse(JSON.stringify(b)) }
    expect(reappliquerJournalBaux(baux, [evt])).toBe(1)
    expect(baux['F-1'].jpay).toBe('7')
    expect(baux['F-1'].signatures.mode).toBe('externe')           // la déclaration, elle, ne bouge jamais
  })
})

describe('décoche : successeur, ancienne ligne archivée, bail neuf non verrouillé', () => {
  it('l\'ancienne ligne est ARCHIVÉE en phase 0 (intacte, trace de la déclaration) puis le bail repart sur sa propre ligne', async () => {
    const { db, sync, store, bx } = setup({ 'F-1': bailExterne() })
    await sync.flush()                                              // scellement (baseline non verrouillée → upsert)
    expect(db.baux['F-1'].signatures.locked).toBe(true)
    store.calls.length = 0
    // geste de saveBail / resetBailSignatures : archive + suppression de signatures
    const b = db.baux['F-1']
    const { archive } = retirerSignatureExterne(b, { now: NOW, auteur: 'D' })
    b.signaturesAnnulees = [archive]
    delete b.signatures
    await sync.flush()
    expect(bx()).toHaveLength(2)
    expect(bx()[0]).toMatch(/^archive:/)
    expect(bx()[1]).toMatch(/^upsert:u\d+$/)                         // nouvelle identité (uid neuf)
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'baux').at(-1)
    const row = mapToRow('baux', up.rec, realCtx())
    expect(row.locked).toBe(false)
    expect(row.signature_source).toBeNull()
    expect(row.signed_at).toBeNull()
    store.calls.length = 0
    await sync.flush()
    expect(store.calls).toEqual([])                                  // état stable
  })
  it('décocher AVANT le premier flush (jamais verrouillé) : simple réécriture, aucun archivage', async () => {
    const { db, sync, bx } = setup({ 'F-1': bailNu() })
    db.baux['F-1'] = bailExterne()
    delete db.baux['F-1'].signatures                                // déclaré puis retiré avant tout flush
    await sync.flush()
    expect(bx().every(o => o.startsWith('upsert'))).toBe(true)
  })
})

describe('re-datation : archivage puis nouvelle ligne verrouillée avec une empreinte RECALCULÉE', () => {
  it('nouvelle signedAt + objet neuf sans empreinte : ancienne ligne archivée, successeur scellé, hash recalculé (≠ ancien)', async () => {
    const { db, sync, store, bx } = setup({ 'F-1': bailExterne('2024-02-20') })
    await sync.flush()
    const ancien = db.baux['F-1'].signatures.contentHashTerms
    // l'empreinte est déjà « figée » : on la rend reconnaissable pour prouver qu'elle n'est pas conservée
    db.baux['F-1'].signatures.contentHashTerms = 'a'.repeat(64)
    store.calls.length = 0
    // geste de _bailExterneAppliquer('redater') : archive de l'ancienne + objet signatures NEUF (ni contentHashTerms ni locked)
    const b = db.baux['F-1']
    b.signaturesAnnulees = [archiverSignatures(b, { motif: 'externe-redate', now: NOW }).archive]
    b.signatures = declarerSignatureExterne(b, { date: '2024-02-18', now: NOW, snapshot: b })
    await sync.flush()
    expect(bx()[0]).toMatch(/^archive:/)
    expect(bx().at(-1)).toMatch(/^upsert:u\d+$/)
    const sg = db.baux['F-1'].signatures
    expect(sg.locked).toBe(true)
    expect(sg.contentHashTerms).not.toBe('a'.repeat(64))
    expect(sg.contentHashTerms).toBe(await bailContentHash(db.baux['F-1']))
    expect(sg.signatureSource).toBe('externe')
    expect(ancien).toMatch(/^[0-9a-f]{64}$/)
    // l'archive porte la déclaration d'origine (ancienne date)
    expect(db.baux['F-1'].signaturesAnnulees[0].signatures.externe.date).toBe('2024-02-20')
    store.calls.length = 0
    await sync.flush()
    expect(store.calls).toEqual([])
  })
  it('SANS vider l\'empreinte (bug évité) : l\'ancienne empreinte serait conservée pour toujours — le test de mutation du geste le prouve', async () => {
    const { db, sync } = setup({ 'F-1': bailExterne('2024-02-20') })
    await sync.flush()
    db.baux['F-1'].signatures.contentHashTerms = 'a'.repeat(64)
    const b = db.baux['F-1']
    const neuf = declarerSignatureExterne(b, { date: '2024-02-18', now: NOW })
    b.signatures = { ...neuf, contentHashTerms: 'a'.repeat(64), locked: true }   // geste FAUTIF : état hérité
    await sync.flush()
    expect(db.baux['F-1'].signatures.contentHashTerms).toBe('a'.repeat(64))      // sealSignedBaux garde ce qui est posé → d'où la règle §2.3
  })
})

describe('documents rattachés (étape 3) : parentType « bail » seulement', () => {
  it('parent_id résolu par la ref du logement (parentType:bail) ; jamais « edl » (CHECK documents_parent_type_check)', () => {
    const row = mapToRow('documents', { id: 7, parentType: 'bail', parentRef: 'F-1', category: 'bail', nature: 'bail-signe-externe' }, realCtx())
    expect(row.parent_type).toBe('bail')
    expect(row.parent_id).toBe('uuid:bail|f-1')
  })
})
