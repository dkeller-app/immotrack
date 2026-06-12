import { describe, it, expect } from 'vitest'
import { mapToRow } from '../../js/core/store-mapping.js'

// ctx minimal : ids déterministes simulés + resolvers (maps clé→uuid) injectés.
const ctx = () => ({
  espaceId: 'ESP', ownerId: 'OWN',
  detUuid: (...p) => 'uuid:' + p.join('|'),
  entiteByNom: new Map([['sci a', 'uuid:entite|sci a']]),
  immeubleByNom: new Map([['imm1', 'uuid:immeuble|imm1']]),
  logementByRef: new Map([['f-1', 'uuid:logement|f-1']]),
  documentByLegacy: new Map([['900', 'uuid:document|900']]),
})

describe('mapToRow — mapping legacy → ligne de table (pur)', () => {
  it('logements : résout entite (nom) + immeuble (nom), colonnes typées + legacy_raw', () => {
    const r = mapToRow('logements', { id: 10, ref: 'F-1', entity: 'SCI A', imm: 'Imm1', surf: 42, loyerHcRef: 700 }, ctx())
    expect(r.id).toBe('uuid:logement|f-1')
    expect(r.entite_id).toBe('uuid:entite|sci a')
    expect(r.immeuble_id).toBe('uuid:immeuble|imm1')
    expect(r.ref).toBe('F-1'); expect(r.surface).toBe(42); expect(r.loyer_hc_ref).toBe(700)
    expect(r.espace_id).toBe('ESP'); expect(r.legacy_id).toBe('10')
    expect(r.legacy_raw).toEqual({ id: 10, ref: 'F-1', entity: 'SCI A', imm: 'Imm1', surf: 42, loyerHcRef: 700 })  // OBJET (pas string) → jsonb correct via supabase-js
  })

  it('logements : entité non résolue → null (skip)', () => {
    expect(mapToRow('logements', { id: 1, ref: 'X', entity: 'Inconnue' }, ctx())).toBeNull()
  })

  it('mouvements : qui=ref logement → logement_id ; imm → immeuble_id', () => {
    const r = mapToRow('mouvements', { id: 5, date: '2026-01-15', qui: 'F-1', imm: 'Imm1', cat: 'loyer', cr: 800, db: 0 }, ctx())
    expect(r.logement_id).toBe('uuid:logement|f-1'); expect(r.entite_id == null).toBe(true)
    expect(r.immeuble_id).toBe('uuid:immeuble|imm1'); expect(r.credit).toBe(800); expect(r.date_mouvement).toBe('2026-01-15')
  })

  it('mouvements : qui="SCI:"+nom → entite_id (jamais logement+entite)', () => {
    const r = mapToRow('mouvements', { id: 6, date: '2026-01-01', qui: 'SCI:SCI A', imm: 'Imm1', db: 10 }, ctx())
    expect(r.entite_id).toBe('uuid:entite|sci a'); expect(r.logement_id == null).toBe(true)
  })

  it('mouvements : sans date → null (date_mouvement NOT NULL)', () => {
    expect(mapToRow('mouvements', { id: 7, qui: 'F-1' }, ctx())).toBeNull()
  })

  it('baux : clé map (ref logement) → logement_id, signed_at depuis signatures', () => {
    const r = mapToRow('baux', { __key: 'F-1', entity: 'SCI A', hc: 700, signatures: { signedAt: '2026-02-01T10:00:00Z' } }, ctx())
    expect(r.id).toBe('uuid:bail|f-1'); expect(r.logement_id).toBe('uuid:logement|f-1')
    expect(r.legacy_ref).toBe('F-1'); expect(r.signed_at).toMatch(/^2026-02-01/)
  })

  it('quittances : logement requis (NOT NULL) → null si non résolu', () => {
    expect(mapToRow('quittances', { id: 1, logement: 'INCONNU', mois: '2026-01' }, ctx())).toBeNull()
    const r = mapToRow('quittances', { id: 2, logement: 'F-1', entity: 'SCI A', mois: '2026-01', hc: 700, ch: 100 }, ctx())
    expect(r.logement_id).toBe('uuid:logement|f-1'); expect(r.mois).toBe('2026-01')
  })

  it('assurances : depuis mrh, FK logement', () => {
    const r = mapToRow('assurances', { id: 3, logement: 'F-1', compagnie: 'AXA', numContrat: 'C1', prime: 180 }, ctx())
    expect(r.logement_id).toBe('uuid:logement|f-1'); expect(r.compagnie).toBe('AXA'); expect(r.num_contrat).toBe('C1')
  })

  it('baux_historique : archived_at NON-NULL déterministe (audit #1), jamais null', () => {
    expect(mapToRow('baux_historique', { ref: 'F-1', entity: 'SCI A', _archivedAt: '2026-03-01' }, ctx()).archived_at).toMatch(/^2026-03-01/)
    expect(mapToRow('baux_historique', { ref: 'F-1', _modifiedAt: '2026-04-01' }, ctx()).archived_at).toMatch(/^2026-04-01/)
    expect(mapToRow('baux_historique', { ref: 'F-1' }, ctx()).archived_at).toBe('1970-01-01T00:00:00.000Z')
  })

  it('documents : parent polymorphe résolu selon parentType', () => {
    const c = ctx()
    expect(mapToRow('documents', { id: 1, parentType: 'logement', parentRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
    expect(mapToRow('documents', { id: 2, parentType: 'immeuble', parentRef: 'Imm1' }, c).parent_id).toBe('uuid:immeuble|imm1')
    expect(mapToRow('documents', { id: 3, parentType: 'entite', parentRef: 'SCI A' }, c).parent_id).toBe('uuid:entite|sci a')
    expect(mapToRow('documents', { id: 4, parentType: 'mouvement', parentId: 50 }, c).parent_id).toBe('uuid:mouvement|50')
  })

  it('mapping déterministe : même entrée → sortie identique (idempotence upsert)', () => {
    const rec = { id: 10, ref: 'F-1', entity: 'SCI A', surf: 42 }
    expect(mapToRow('logements', rec, ctx())).toEqual(mapToRow('logements', rec, ctx()))
  })

  it('colonnes jsonb (typées + legacy_raw) = OBJETS/ARRAYS, jamais des strings (anti double-encodage supabase-js)', () => {
    const e = mapToRow('entites', { id: 1, nom: 'SCI A', gerants: [{ n: 'Dupont' }], signature: { url: 'x' } }, ctx())
    expect(e.gerants).toEqual([{ n: 'Dupont' }]); expect(typeof e.gerants).toBe('object')   // pas '[{"n":"Dupont"}]'
    expect(e.signature).toEqual({ url: 'x' })
    expect(e.legacy_raw).toMatchObject({ nom: 'SCI A' }); expect(typeof e.legacy_raw).toBe('object')
    const b = mapToRow('baux', { __key: 'F-1', entity: 'SCI A', locataires: [{ nom: 'X' }], signatures: { signedAt: '2026-01-01T00:00:00Z' } }, ctx())
    expect(b.locataires).toEqual([{ nom: 'X' }]); expect(b.signatures).toMatchObject({ signedAt: '2026-01-01T00:00:00Z' })
  })

  it('collection inconnue → throw', () => {
    expect(() => mapToRow('bidon', {}, ctx())).toThrow()
  })
})
