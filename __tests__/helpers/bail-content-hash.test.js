import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { bailContentHash, bailLegalContent, canonicalStringify, sha256Hex } from '../../js/core/bail-content-hash.js'

const baseBail = {
  hc: 700, ch: 50, dg: 700, jpay: 5, debut: '2026-05-03', fin: '2027-05-02', finEffective: null,
  typeContrat: 'nu', type: 'nu',
  locataires: [{ nom: 'Dupont', email: 'd@x.fr' }],
  signataires: [{ nom: 'Garant 1' }],
  mobilier: [{ piece: 'cuisine', nom: 'four' }],
  irl: { trimestre: 'T1', valeur: 143.46 }, irlHistorique: [],
  signatures: {
    signedAt: '2026-05-03T10:00:00.000Z',
    bailSnapshot: { log: { ref: 'F3', surf: 30 }, imm: { nom: 'Imm A' }, capturedAt: '2026-05-03T10:00:00.000Z' },
    contentHash: 'abc-pdf-hash', mode: 'avec-locataire', locked: true,
  },
}

describe('bail-content-hash — empreinte légale canonique', () => {
  it('canonicalStringify : clés triées récursivement, déterministe, ordre array préservé', () => {
    expect(canonicalStringify({ b: 1, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"b":1}')
    expect(canonicalStringify([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalStringify(undefined)).toBe('null')
    expect(canonicalStringify(null)).toBe('null')
  })

  it('sha256Hex : byte-identique à Node crypto (crypto.subtle ↔ createHash)', async () => {
    const s = 'itbailhashv1|{"x":1}'
    expect(await sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
    expect(await sha256Hex(s)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('déterministe : 2 appels = même hash', async () => {
    expect(await bailContentHash(baseBail)).toBe(await bailContentHash(baseBail))
    expect(await bailContentHash(baseBail)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("stable à l'ordre des clés d'entrée (canonicalisation)", async () => {
    const reordered = { signatures: baseBail.signatures, irlHistorique: [], irl: baseBail.irl, mobilier: baseBail.mobilier, signataires: baseBail.signataires, locataires: baseBail.locataires, type: 'nu', typeContrat: 'nu', finEffective: null, fin: '2027-05-02', debut: '2026-05-03', jpay: 5, dg: 700, ch: 50, hc: 700 }
    expect(await bailContentHash(reordered)).toBe(await bailContentHash(baseBail))
  })

  it('WHITELIST : un champ volatil/interne ajouté au bail ne change PAS le hash', async () => {
    const ref = await bailContentHash(baseBail)
    const withVolatile = { ...baseBail, _modifiedAt: 1718500000000, _drvDirty: true, quittAutoGen: true, __whatever: 'x', _deleted: false }
    expect(await bailContentHash(withVolatile)).toBe(ref)
  })

  it('un TERME juridique modifié change le hash', async () => {
    const ref = await bailContentHash(baseBail)
    expect(await bailContentHash({ ...baseBail, hc: 701 })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, debut: '2026-05-04' })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, locataires: [{ nom: 'Autre' }] })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, signataires: [{ nom: 'Autre signataire bailleur' }] })).not.toBe(ref)
  })

  it('les GARANTS/CAUTIONS (champs plats legacy) changent le hash — couverture EXPLICITE, pas via le snapshot', async () => {
    const ref = await bailContentHash(baseBail)
    expect(await bailContentHash({ ...baseBail, garant: 'Garant Réel' })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, garant2: 'Garant 2', adrGarant2: '1 rue X' })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, ddnGarant: '1990-01-01', lieuGarant: 'Paris' })).not.toBe(ref)
    expect(await bailContentHash({ ...baseBail, plafondCaution: 5000 })).not.toBe(ref)
  })

  it('robustesse : bail null/undefined/{} → hash défini, aucun throw', async () => {
    expect(await bailContentHash(null)).toMatch(/^[0-9a-f]{64}$/)
    expect(await bailContentHash(undefined)).toMatch(/^[0-9a-f]{64}$/)
    expect(await bailContentHash({})).toMatch(/^[0-9a-f]{64}$/)
    expect(await bailContentHash(null)).toBe(await bailContentHash(undefined))
  })

  it('le SNAPSHOT figé modifié change le hash', async () => {
    const ref = await bailContentHash(baseBail)
    const altSnap = { ...baseBail, signatures: { ...baseBail.signatures, bailSnapshot: { log: { ref: 'F3', surf: 31 }, imm: { nom: 'Imm A' } } } }
    expect(await bailContentHash(altSnap)).not.toBe(ref)
  })

  it('signedAt modifié change le hash', async () => {
    const ref = await bailContentHash(baseBail)
    const alt = { ...baseBail, signatures: { ...baseBail.signatures, signedAt: '2026-05-03T11:00:00.000Z' } }
    expect(await bailContentHash(alt)).not.toBe(ref)
  })

  it("le hash NE dépend PAS de l'empreinte PDF (preuve secondaire) ni du verrou ni du mode", async () => {
    const ref = await bailContentHash(baseBail)
    const alt = { ...baseBail, signatures: { ...baseBail.signatures, contentHash: 'autre-pdf-hash', locked: false, mode: 'distance', pdfRef: { driveFileId: 'x' } } }
    expect(await bailContentHash(alt)).toBe(ref)
  })

  it('versionné : le sentinel itbailhashv1| est inclus (v1 ≠ hash brut)', async () => {
    const content = bailLegalContent(baseBail)
    const withSentinel = await sha256Hex('itbailhashv1|' + canonicalStringify(content))
    const without = await sha256Hex(canonicalStringify(content))
    expect(await bailContentHash(baseBail)).toBe(withSentinel)
    expect(withSentinel).not.toBe(without)
  })

  it('montants normalisés : "700" (string) == 700 (number)', async () => {
    expect(await bailContentHash({ ...baseBail, hc: '700' })).toBe(await bailContentHash(baseBail))
  })
})
