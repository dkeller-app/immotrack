import { describe, it, expect } from 'vitest'
import { validateNewImmNom, renameImmeubleRefs } from '../../js/core/rename-immeuble.js'

// Le lien logement↔immeuble (et mouvement/agenda/document/regulValidations) est par NOM (string).
// Renommer l'immeuble sans propager oldNom→newNom ORPHELINE ses logements (« Logements isolés »).
// Ce module propage la ref, SCOPÉ à l'espace de l'immeuble (multi-espace : un immeuble HOMONYME d'un
// autre espace — ex. l'archive SMARTOSAURUS de Didier — ne doit JAMAIS être touché).

const db = () => ({
  entites: [
    { nom: 'SCI SM', _espaceId: 'MARION', immeubles: [{ nom: '1 rue', _espaceId: 'MARION' }] },
    { nom: 'SCI DD', _espaceId: 'DIDIER', immeubles: [{ nom: '1 rue', _espaceId: 'DIDIER' }] }, // HOMONYME autre espace
  ],
  logements: [
    { ref: 'F-1', imm: '1 rue', entity: 'SCI SM', _espaceId: 'MARION' },
    { ref: 'F-2', imm: '1 rue', entity: 'SCI SM', _espaceId: 'MARION' },
    { ref: 'A-1', imm: '1 rue', entity: 'SCI DD', _espaceId: 'DIDIER' },   // archive homonyme — NE PAS toucher
  ],
  mouvements: [{ id: 1, imm: '1 rue', _espaceId: 'MARION' }, { id: 2, imm: '1 rue', _espaceId: 'DIDIER' }],
  agenda: [{ id: 1, immeuble: '1 rue', _espaceId: 'MARION' }, { id: 2, immeuble: '1 rue', _espaceId: 'DIDIER' }],
  documents: [
    { id: 1, parentType: 'immeuble', parentRef: '1 rue', _espaceId: 'MARION' },
    { id: 2, parentType: 'immeuble', parentRef: '1 rue', _espaceId: 'DIDIER' },
    { id: 3, parentType: 'logement', parentRef: 'F-1', _espaceId: 'MARION' },   // pas un doc d'immeuble
  ],
  regulValidations: { '1 rue|2025-01|2025-12': { at: 'x' }, 'Autre|2025-01|2025-12': { at: 'y' } },
})

describe('renameImmeubleRefs — propagation du renommage d\'immeuble (scopée par espace)', () => {
  it('propage oldNom→newNom sur logements/mouvements/agenda/documents de l\'espace CIBLE, jamais l\'homonyme d\'un autre espace', () => {
    const d = db()
    const res = renameImmeubleRefs(d, '1 rue', 'Ferrette', { espaceId: 'MARION' })
    // MARION : rerattaché
    expect(d.logements.filter(l => l._espaceId === 'MARION').every(l => l.imm === 'Ferrette')).toBe(true)
    expect(d.mouvements.find(m => m._espaceId === 'MARION').imm).toBe('Ferrette')
    expect(d.agenda.find(a => a._espaceId === 'MARION').immeuble).toBe('Ferrette')
    expect(d.documents.find(x => x.id === 1).parentRef).toBe('Ferrette')
    // DIDIER (archive homonyme) : INTACT
    expect(d.logements.find(l => l.ref === 'A-1').imm).toBe('1 rue')
    expect(d.mouvements.find(m => m._espaceId === 'DIDIER').imm).toBe('1 rue')
    expect(d.agenda.find(a => a._espaceId === 'DIDIER').immeuble).toBe('1 rue')
    expect(d.documents.find(x => x.id === 2).parentRef).toBe('1 rue')
    // doc logement (pas immeuble) intact
    expect(d.documents.find(x => x.id === 3).parentRef).toBe('F-1')
    expect(res.touched).toBeGreaterThan(0)
    expect(res.breakdown.logement).toBe(2)
  })

  it('renomme les clés regulValidations « <immeuble>|... » de l\'espace cible', () => {
    const d = db()
    renameImmeubleRefs(d, '1 rue', 'Ferrette', { espaceId: 'MARION' })
    expect(d.regulValidations['Ferrette|2025-01|2025-12']).toEqual({ at: 'x' })
    expect(d.regulValidations['1 rue|2025-01|2025-12']).toBeUndefined()
    expect(d.regulValidations['Autre|2025-01|2025-12']).toEqual({ at: 'y' })   // autre immeuble intact
  })

  it('mono-espace (aucun tag _espaceId) : propage (scope null===null)', () => {
    const d = { logements: [{ ref: 'F-1', imm: 'Vieux' }], mouvements: [], agenda: [], documents: [] }
    const res = renameImmeubleRefs(d, 'Vieux', 'Neuf', {})
    expect(d.logements[0].imm).toBe('Neuf')
    expect(res.breakdown.logement).toBe(1)
  })

  it('ignore les tombstones et no-op si nom inchangé', () => {
    const d = { logements: [{ ref: 'F-1', imm: 'X', _deleted: true }], mouvements: [], agenda: [], documents: [] }
    renameImmeubleRefs(d, 'X', 'Y', {})
    expect(d.logements[0].imm).toBe('X')   // tombstone non touché
    const d2 = { logements: [{ ref: 'F-1', imm: 'X' }] }
    expect(renameImmeubleRefs(d2, 'X', 'X', {}).touched).toBe(0)   // inchangé
  })
})

describe('validateNewImmNom — anti-collision (même uuid déterministe si nom identique dans l\'espace)', () => {
  it('refuse un nom déjà porté par un AUTRE immeuble du même espace ; accepte sinon / inchangé / autre espace', () => {
    const d = db()
    d.entites[0].immeubles.push({ nom: 'Bloc B', _espaceId: 'MARION' })
    expect(validateNewImmNom(d, '1 rue', 'Bloc B', 'MARION').ok).toBe(false)     // collision même espace
    expect(validateNewImmNom(d, '1 rue', 'Ferrette', 'MARION').ok).toBe(true)    // libre
    expect(validateNewImmNom(d, '1 rue', '1 rue', 'MARION').ok).toBe(true)       // inchangé
    expect(validateNewImmNom(d, '1 rue', '', 'MARION').ok).toBe(false)           // vide
    // « 1 rue » existe aussi chez DIDIER mais ce n'est PAS une collision pour l'espace MARION
    expect(validateNewImmNom(d, 'Ferrette', '1 rue', 'MARION').ok).toBe(false)   // collision avec le sien
  })
})
