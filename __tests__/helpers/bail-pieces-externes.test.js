// RETOURS 15/10 (lot 2, point 1) — bail signé hors Propryo : plusieurs pièces typées ; « caution détenue » (fichier ou
// papier) exposée à l'Accueil par un prédicat simple ; migration des pièces déposées avant ce lot.
import { describe, it, expect } from 'vitest'
import {
  NATURE, PIECE_TYPES, pieceDe, garantsDuBail, libellePiece, emplacement, emplacementDe, piecesDeclaration, pieceA, cleBail,
  etatCaution, cautionDetenue, migrerPiecesExternes,
} from '../../js/core/bail-pieces-externes.js'

const S1 = '2025-02-25T12:00:00.000Z'
const S0 = '2025-02-20T12:00:00.000Z'
const doc = (o) => Object.assign({ id: 1, nature: NATURE, parentType: 'bail', parentRef: 'P-202', bailSignedAt: S1, uploadedAt: '2026-10-15T08:00:00Z' }, o)
const BAIL = { ref: 'P-202', debut: '2025-03-01', garant: 'Michel Faure', garant2: '  ' }
const BAIL2 = { ref: 'P-201', debut: '2025-03-01', garant: 'A Un', garant2: 'B Deux' }

describe('types et libellés', () => {
  it('cinq types (D1), le bail en premier', () => {
    expect(PIECE_TYPES.map(t => t.k)).toEqual(['bail', 'caution', 'avenant', 'annexe', 'autre'])
  })
  it('un document sans type (déposé avant ce lot) est le bail signé ; un type inconnu aussi', () => {
    expect(pieceDe(doc({}))).toBe('bail')
    expect(pieceDe(doc({ piece: 'xyz' }))).toBe('bail')
    expect(pieceDe(doc({ piece: 'caution' }))).toBe('caution')
  })
  it('garants inscrits : noms vides ignorés, rang conservé', () => {
    expect(garantsDuBail(BAIL)).toEqual([{ idx: 1, nom: 'Michel Faure' }])
    expect(garantsDuBail({ garant2: 'Seul' })).toEqual([{ idx: 2, nom: 'Seul' }])
    expect(garantsDuBail(null)).toEqual([])
  })
  it('libellés : caution avec le nom du garant, autre pièce nommée, avenant / annexe nommables', () => {
    const g = garantsDuBail(BAIL2)
    expect(libellePiece(doc({}), g)).toBe('Bail signé')
    expect(libellePiece(doc({ piece: 'caution', garantIdx: 2 }), g)).toBe('Acte de cautionnement — B Deux')
    expect(libellePiece(doc({ piece: 'caution', garantIdx: 3 }), g)).toBe('Acte de cautionnement')
    expect(libellePiece(doc({ piece: 'autre', pieceLibelle: ' Règlement de copropriété ' }), g)).toBe('Règlement de copropriété')
    expect(libellePiece(doc({ piece: 'autre' }), g)).toBe('Autre pièce')
    expect(libellePiece(doc({ piece: 'avenant' }), g)).toBe('Avenant')
    expect(libellePiece(doc({ piece: 'avenant', pieceLibelle: 'Avenant n° 1' }), g)).toBe('Avenant n° 1')
  })
  it('emplacements uniques : bail, caution par garant ; avenant / annexe / autre multiples', () => {
    expect(emplacement('bail')).toBe('bail')
    expect(emplacement('caution', 2)).toBe('caution:2')
    expect(emplacement('caution')).toBe('caution:1')
    expect(emplacement('avenant')).toBeNull()
    expect(emplacementDe(doc({}))).toBe('bail')
  })
})

describe('pièces d\'une déclaration', () => {
  const docs = [
    doc({ id: 1, piece: 'autre', pieceLibelle: 'Z', uploadedAt: '2026-10-15T09:00:00Z' }),
    doc({ id: 2, piece: 'caution', garantIdx: 2 }),
    doc({ id: 3 }),                                       // bail (sans type)
    doc({ id: 4, piece: 'caution', garantIdx: 1 }),
    doc({ id: 5, piece: 'avenant' }),
    doc({ id: 6, bailSignedAt: S0 }),                     // déclaration précédente
    doc({ id: 7, _deleted: true }),
    doc({ id: 8, nature: 'edl-externe' }),
  ]
  it('même signedAt, vivantes, de la bonne nature, triées bail → cautions → avenants → annexes → autres', () => {
    expect(piecesDeclaration(docs, S1).map(d => d.id)).toEqual([3, 4, 2, 5, 1])
  })
  it('sans signedAt : rien', () => {
    expect(piecesDeclaration(docs, '')).toEqual([])
  })
  it('pieceA : le document d\'un emplacement unique (le plus récent)', () => {
    const p = piecesDeclaration(docs, S1)
    expect(pieceA(p, 'caution', 2).id).toBe(2)
    expect(pieceA(p, 'bail').id).toBe(3)
    expect(pieceA(p, 'avenant')).toBeNull()
    const deux = [doc({ id: 10, uploadedAt: '2026-01-01' }), doc({ id: 11, uploadedAt: '2026-02-01' })]
    expect(pieceA(deux, 'bail').id).toBe(11)
  })
})

describe('caution détenue (D2) — prédicat pour l\'Accueil', () => {
  const cle = cleBail('P-202@@E1', BAIL)
  it('clé du bail : logement sans suffixe d\'espace + date de début', () => {
    expect(cle).toBe('P-202|2025-03-01')
  })
  it('aucun garant inscrit → « na » (et non détenue)', () => {
    expect(etatCaution({ bail: { debut: 'x' } }).etat).toBe('na')
    expect(cautionDetenue({ bail: { debut: 'x' } })).toBe(false)
  })
  it('acte déposé (fichier) → détenue', () => {
    const p = [doc({ piece: 'caution', garantIdx: 1 })]
    const e = etatCaution({ bail: BAIL, pieces: p })
    expect(e.etat).toBe('detenue'); expect(e.garants[0].source).toBe('fichier')
    expect(cautionDetenue({ bail: BAIL, pieces: p })).toBe(true)
  })
  it('« Je l\'ai en papier » → détenue', () => {
    const e = etatCaution({ bail: BAIL, pieces: [], papier: { 'caution:1': { at: '2026-10-15' } } })
    expect(e.etat).toBe('detenue'); expect(e.garants[0].source).toBe('papier')
  })
  it('deux garants, un seul acte → « partielle » (pas détenue) ; aucun → « absente »', () => {
    expect(etatCaution({ bail: BAIL2, pieces: [doc({ piece: 'caution', garantIdx: 1 })] }).etat).toBe('partielle')
    expect(cautionDetenue({ bail: BAIL2, pieces: [doc({ piece: 'caution', garantIdx: 1 })] })).toBe(false)
    expect(etatCaution({ bail: BAIL2, pieces: [] }).etat).toBe('absente')
  })
  it('le bail signé seul ne vaut pas acte de cautionnement', () => {
    expect(cautionDetenue({ bail: BAIL, pieces: [doc({})] })).toBe(false)
  })
})

describe('migration des pièces déposées avant ce lot', () => {
  it('pose piece:\'bail\' sur les documents sans type, une seule fois', () => {
    const docs = [doc({ id: 1 }), doc({ id: 2, piece: 'caution' }), doc({ id: 3, _deleted: true }), doc({ id: 4, nature: 'edl-externe' })]
    expect(migrerPiecesExternes(docs).map(d => d.id)).toEqual([1])
    expect(docs[0].piece).toBe('bail')
    expect(docs[2].piece).toBeUndefined()
    expect(docs[3].piece).toBeUndefined()
    expect(migrerPiecesExternes(docs)).toEqual([])
  })
})
