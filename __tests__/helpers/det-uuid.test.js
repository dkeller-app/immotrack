import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { makeDetUuid } from '../../js/core/det-uuid.js'

// Référence = formule EXACTE de l'ETL _import/import.mjs (lignes 21-25). L'app DOIT produire des ids
// byte-identiques, sinon ses écritures créeraient des lignes EN DOUBLE des données importées.
function refUuid(owner, parts) {
  const h = createHash('sha1').update('immotrack-p0e|' + owner + '|' + parts.join('|')).digest('hex')
  const y = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${y}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const OWNER = '63bde261-1111-4000-8000-aaaaaaaaaaaa'
// échantillons variés : préfixes réels, accents UTF-8 (noms d'entités/immeubles français), vide, chiffres.
const CASES = [
  ['espace'], ['entite', 'sci dupont'], ['immeuble', 'résidence châtaignier'], ['logement', 'f-1'],
  ['bail', 'f-1'], ['bailhist', 'f-1|2026-01-15'], ['mouvement', '900123'], ['quittance', '42'],
  ['edl', '7'], ['document', '1001'], ['entite', 'évolution & cie — île-de-france'], ['agenda', '157'],
  ['entite', ''], ['entite', 'àéîõü ñ ç 中文 😀'],
]

describe('det-uuid — identique à l\'ETL import.mjs (app ids == lignes importées)', () => {
  it('matche le SHA-1 de Node crypto pour des entrées variées (dont accents UTF-8 + emoji)', () => {
    const det = makeDetUuid(OWNER)
    for (const parts of CASES) expect(det(...parts)).toBe(refUuid(OWNER, parts))
  })

  it('SHA-1 correct sur TOUTES les longueurs 0→130 (frontières de padding / multi-blocs)', () => {
    const det = makeDetUuid(OWNER)
    for (let n = 0; n <= 130; n++) {
      const part = 'a'.repeat(n)
      expect(det('x', part)).toBe(refUuid(OWNER, ['x', part]))
    }
  })

  it('format UUID valide (version 5, variant 8-b)', () => {
    const u = makeDetUuid(OWNER)('entite', 'x')
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('déterministe : même (owner, parts) → même uuid', () => {
    const det = makeDetUuid(OWNER)
    expect(det('logement', 'f-1')).toBe(det('logement', 'f-1'))
  })

  it('namespace par owner : owner différent → uuid différent (isolation des espaces)', () => {
    expect(makeDetUuid(OWNER)('entite', 'sci a')).not.toBe(makeDetUuid('99999999-2222-4000-8000-bbbbbbbbbbbb')('entite', 'sci a'))
  })

  it('owner absent → namespace par défaut (identique à OWNER_FOR_NS de l\'ETL)', () => {
    expect(makeDetUuid()('espace')).toBe(refUuid('00000000-0000-4000-8000-000000000000', ['espace']))
  })
})
