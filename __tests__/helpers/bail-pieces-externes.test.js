// RETOURS 15/10 (lot 2, point 1) — bail signé hors Propryo : plusieurs pièces typées ; « caution détenue » (fichier,
// papier ou signature dans Propryo) exposée à l'Accueil par un prédicat simple ; l'acte suit la PERSONNE (nom du garant),
// jamais son seul rang (relecture adverse 15/10) ; migration des pièces déposées avant ce lot.
import { describe, it, expect } from 'vitest'
import {
  NATURE, PIECE_TYPES, normNom, pieceDe, garantsDuBail, acteDuGarant, actesOrphelins, libellePiece, piecesDeclaration, bailSigne,
  cleGarant, suivreDebut, etatCaution, cautionDetenue, migrerPiecesExternes,
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
  it('nom comparable : casse, accents, espaces', () => {
    expect(normNom('  Hélène   DUPRÉ ')).toBe('helene dupre')
  })
  it('libellés : l\'acte porte le nom de SA personne ; repli par rang ; autre pièce nommée ; avenant / annexe nommables', () => {
    const g = garantsDuBail(BAIL2)
    expect(libellePiece(doc({}), g)).toBe('Bail signé')
    expect(libellePiece(doc({ piece: 'caution', garantNom: 'Ancien Garant', garantIdx: 1 }), g)).toBe('Acte de cautionnement — Ancien Garant')
    expect(libellePiece(doc({ piece: 'caution', garantIdx: 2 }), g)).toBe('Acte de cautionnement — B Deux')
    expect(libellePiece(doc({ piece: 'caution', garantIdx: 3 }), g)).toBe('Acte de cautionnement')
    expect(libellePiece(doc({ piece: 'autre', pieceLibelle: ' Règlement de copropriété ' }), g)).toBe('Règlement de copropriété')
    expect(libellePiece(doc({ piece: 'autre' }), g)).toBe('Autre pièce')
    expect(libellePiece(doc({ piece: 'avenant', pieceLibelle: 'Avenant n° 1' }), g)).toBe('Avenant n° 1')
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
  it('bailSigne : le plus récent', () => {
    expect(bailSigne([doc({ id: 10, uploadedAt: '2026-01-01' }), doc({ id: 11, uploadedAt: '2026-02-01' })]).id).toBe(11)
  })
})

describe('acte de cautionnement : rattaché à la personne', () => {
  it('par nom normalisé, quel que soit le rang', () => {
    const p = [doc({ id: 2, piece: 'caution', garantIdx: 2, garantNom: 'B Deux' })]
    expect(acteDuGarant(p, { idx: 1, nom: 'b  deux' }).id).toBe(2)
  })
  it('garant 1 retiré : le garant 2 devenu rang 1 n\'hérite JAMAIS de l\'acte de l\'ancien garant 1', () => {
    const p = [doc({ id: 1, piece: 'caution', garantIdx: 1, garantNom: 'A Un' }), doc({ id: 2, piece: 'caution', garantIdx: 2, garantNom: 'B Deux' })]
    const bailApres = { debut: '2025-03-01', garant: 'B Deux' }
    const e = etatCaution({ bail: bailApres, pieces: p })
    expect(e.garants[0].doc.id).toBe(2)
    expect(actesOrphelins(p, garantsDuBail(bailApres)).map(d => d.id)).toEqual([1])
  })
  it('acte d\'une autre personne : ne compte pas (« absente »)', () => {
    const p = [doc({ id: 1, piece: 'caution', garantIdx: 1, garantNom: 'Ancien Garant' })]
    expect(etatCaution({ bail: BAIL, pieces: p }).etat).toBe('absente')
  })
  it('acte déposé SANS nom (avant ce lot) : repli par rang', () => {
    expect(acteDuGarant([doc({ id: 4, piece: 'caution', garantIdx: 1 })], { idx: 1, nom: 'Michel Faure' }).id).toBe(4)
    expect(acteDuGarant([doc({ id: 4, piece: 'caution' })], { idx: 2, nom: 'X' })).toBeNull()
  })
})

describe('caution détenue (D2) — prédicat pour l\'Accueil', () => {
  it('clé « papier » : date de début + nom normalisé', () => {
    expect(cleGarant(BAIL, ' Michel  FAURE')).toBe('2025-03-01|michel faure')
  })
  it('aucun garant inscrit → « na » (et non détenue)', () => {
    expect(etatCaution({ bail: { debut: 'x' } }).etat).toBe('na')
    expect(cautionDetenue({ bail: { debut: 'x' } })).toBe(false)
  })
  it('acte déposé (fichier) → détenue', () => {
    const p = [doc({ piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure' })]
    const e = etatCaution({ bail: BAIL, pieces: p })
    expect(e.etat).toBe('detenue'); expect(e.garants[0].source).toBe('fichier')
    expect(cautionDetenue({ bail: BAIL, pieces: p })).toBe(true)
  })
  it('« Je l\'ai en papier » → détenue ; papier d\'un autre bail (autre date de début) → non', () => {
    const e = etatCaution({ bail: BAIL, pieces: [], papier: { '2025-03-01|michel faure': { at: '2026-10-15' } } })
    expect(e.etat).toBe('detenue'); expect(e.garants[0].source).toBe('papier')
    expect(etatCaution({ bail: BAIL, papier: { '2023-01-01|michel faure': { at: 'x' } } }).etat).toBe('absente')
  })
  it('caution signée dans Propryo (bail.signatures.garant) → détenue, source « signature »', () => {
    const e = etatCaution({ bail: BAIL, pieces: [], signatureGarant: true })
    expect(e.etat).toBe('detenue'); expect(e.garants[0].source).toBe('signature')
  })
  it('deux garants, un seul acte → « partielle » (pas détenue) ; aucun → « absente »', () => {
    const p = [doc({ piece: 'caution', garantIdx: 1, garantNom: 'A Un' })]
    expect(etatCaution({ bail: BAIL2, pieces: p }).etat).toBe('partielle')
    expect(cautionDetenue({ bail: BAIL2, pieces: p })).toBe(false)
    expect(etatCaution({ bail: BAIL2, pieces: [] }).etat).toBe('absente')
  })
  it('le bail signé seul ne vaut pas acte de cautionnement', () => {
    expect(cautionDetenue({ bail: BAIL, pieces: [doc({})] })).toBe(false)
  })
  it('date de début corrigée : les actes détenus en papier suivent', () => {
    const m = { '2025-03-01|michel faure': { at: 'x' }, '2020-01-01|autre': { at: 'y' } }
    expect(suivreDebut(m, '2025-03-01', '2025-03-15')).toBe(true)
    expect(Object.keys(m).sort()).toEqual(['2020-01-01|autre', '2025-03-15|michel faure'])
    expect(suivreDebut(m, '2025-03-01', '2025-03-15')).toBe(false)
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
  it('restreinte aux documents que cet appareil peut écrire', () => {
    const docs = [doc({ id: 1, _espaceId: 'E-tiers' }), doc({ id: 2 })]
    expect(migrerPiecesExternes(docs, d => d._espaceId == null).map(d => d.id)).toEqual([2])
    expect(docs[0].piece).toBeUndefined()
  })
})
