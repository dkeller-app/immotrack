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

  it('legacy_raw : retire le tag _espaceId (Store multi) mais CONSERVE __key (load-bearing hydrate)', () => {
    // _espaceId = tag de provenance posé par le Store multi-espace → ne doit pas polluer la donnée persistée.
    const r = mapToRow('logements', { id: 10, ref: 'F-1', entity: 'SCI A', _espaceId: 'ESP-TIERS' }, ctx())
    expect(r.legacy_raw._espaceId).toBeUndefined()
    expect(r.legacy_raw).toEqual({ id: 10, ref: 'F-1', entity: 'SCI A' })
    // __key DOIT rester : l'hydrate reconstruit la map baux (et les FK) depuis legacy_raw.__key.
    const b = mapToRow('baux', { __key: 'F-1', entity: 'SCI A', hc: 700, _espaceId: 'ESP-TIERS' }, ctx())
    expect(b.legacy_raw._espaceId).toBeUndefined()
    expect(b.legacy_raw.__key).toBe('F-1')
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

  it('VERROU : content_hash/signature_source/locked mappés depuis signatures (+ garde CHECK-satisfiable)', () => {
    const sg = (extra) => ({ __key: 'F-1', entity: 'SCI A', signatures: { signedAt: '2026-02-01T10:00:00Z', ...extra } })
    // signé immotrack + hash → verrouillé
    const ok = mapToRow('baux', sg({ signatureSource: 'immotrack', contentHashTerms: 'a'.repeat(64), locked: true }), ctx())
    expect(ok.locked).toBe(true); expect(ok.content_hash).toBe('a'.repeat(64)); expect(ok.signature_source).toBe('immotrack')
    // locked demandé MAIS immotrack sans hash → CHECK non satisfiable → locked:false (robuste à l'ordre de déploiement)
    const noHash = mapToRow('baux', sg({ signatureSource: 'immotrack', locked: true }), ctx())
    expect(noHash.locked).toBe(false); expect(noHash.content_hash).toBeNull()
    // externe peut omettre le hash → verrouillable
    expect(mapToRow('baux', sg({ signatureSource: 'externe', locked: true }), ctx()).locked).toBe(true)
    // source INVALIDE (corruption amont) → normalisée à null (anti-23514 en boucle) → pas de verrou
    const bad = mapToRow('baux', sg({ signatureSource: 'bidon', contentHashTerms: 'a'.repeat(64), locked: true }), ctx())
    expect(bad.signature_source).toBeNull(); expect(bad.locked).toBe(false)
    // non signé → pas verrouillé, pas de hash/source
    const unsigned = mapToRow('baux', { __key: 'F-1', entity: 'SCI A', hc: 700 }, ctx())
    expect(unsigned.locked).toBe(false); expect(unsigned.content_hash).toBeNull(); expect(unsigned.signature_source).toBeNull()
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

  // D3 — ÉCRITURE MEMBRE SCOPÉ : parent_id résolu pour les parentType émis par l'app mais laissés à
  // NULL avant (→ entité NULL → has_entite_write faux → 42501 → sync du gestionnaire scopé empoisonnée).
  // parent_id est PUREMENT une clé de résolution RLS (l'hydrate reconstruit depuis legacy_raw, pas ces
  // colonnes) → le fixer ne change jamais le document rendu par l'app. Résolution VIA LE LOGEMENT (logRef)
  // pour les 5 types 0040 ; via la clé de bail (parentRef=ref logement) pour 'bail' (résolveur existant).
  it('documents D3 : bail résolu via la clé de bail (parentRef = ref logement)', () => {
    const c = ctx()
    // bail keyé par ref logement → id de ligne bail = detUuid('bail', norm(ref)) (résolveur entite_of_bail)
    expect(mapToRow('documents', { id: 10, parentType: 'bail', parentRef: 'F-1' }, c).parent_id).toBe('uuid:bail|f-1')
  })

  it('documents D3 : assurance/mrh/equipement/quittance résolus via le logement (logRef)', () => {
    const c = ctx()
    expect(mapToRow('documents', { id: 11, parentType: 'assurance', parentId: 3, parentRef: 'AXA C1', logRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
    expect(mapToRow('documents', { id: 12, parentType: 'mrh', parentId: 4, parentRef: 'MMA', logRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
    expect(mapToRow('documents', { id: 13, parentType: 'equipement', parentId: 'F-1__chaudiere', parentRef: 'F-1 · Chaudière', logRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
    expect(mapToRow('documents', { id: 14, parentType: 'quittance', parentId: 900, parentRef: 'F-1 · 2026-01', logRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
  })

  it('documents D3 : candidat résolu via le logement (logRef) ; SCI-level sans logRef → NULL (fail-closed)', () => {
    const c = ctx()
    expect(mapToRow('documents', { id: 15, parentType: 'candidat', parentId: 'cand1', parentRef: 'cand1', logRef: 'F-1' }, c).parent_id).toBe('uuid:logement|f-1')
    // candidat rattaché à une SCI sans bien précis (logRef vide) → aucun logement → NULL → owner-only
    expect(mapToRow('documents', { id: 16, parentType: 'candidat', parentId: 'cand2', parentRef: 'cand2', logRef: null }, c).parent_id).toBeNull()
  })

  it('documents D3 : logRef inconnu (logement non résolu) → parent_id NULL (fail-closed), jamais un throw', () => {
    const c = ctx()
    expect(mapToRow('documents', { id: 17, parentType: 'assurance', parentId: 9, logRef: 'INCONNU' }, c).parent_id).toBeNull()
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
