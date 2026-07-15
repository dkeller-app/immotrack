import { describe, it, expect } from 'vitest'
import { validateNewImmNom, renameImmeubleRefs } from '../../js/core/rename-immeuble.js'

// Le lien logement↔immeuble (et mouvement/agenda/document/assurance immeuble/regulValidations) est par
// NOM (string). Renommer l'immeuble sans propager oldNom→newNom ORPHELINE ses logements (« Logements
// isolés »). Ce module propage, SCOPÉ par espace : un immeuble HOMONYME d'un autre espace (archive
// SMARTOSAURUS de Didier) n'est JAMAIS touché ; les collections de CONFIG (regul/assurances, own-only) ne
// sont re-keyées que si on renomme un immeuble de l'espace PROPRE ; les records non tagués (créés en
// session) comptent pour l'espace propre.

// ── Scénario RÉEL : Didier (own = DIDIER) renomme l'immeuble de la SCI PARTAGÉE par Marion (espace MARION).
const dbShared = () => ({
  entites: [
    { nom: 'SCI SM', _espaceId: 'MARION', immeubles: [{ nom: '1 rue', _espaceId: 'MARION' }] },
    { nom: 'SCI DD', _espaceId: 'DIDIER', immeubles: [{ nom: '1 rue', _espaceId: 'DIDIER' }] }, // HOMONYME
  ],
  logements: [
    { ref: 'F-1', imm: '1 rue', _espaceId: 'MARION' },
    { ref: 'F-2', imm: '1 rue', _espaceId: 'MARION' },
    { ref: 'A-1', imm: '1 rue', _espaceId: 'DIDIER' },   // archive homonyme — INTACT
    { ref: 'NEW', imm: '1 rue' },                        // créé en session (non tagué = propre DIDIER) — INTACT sur rename TIERS
  ],
  mouvements: [{ id: 1, imm: '1 rue', _espaceId: 'MARION' }, { id: 2, imm: '1 rue', _espaceId: 'DIDIER' }],
  agenda: [{ id: 1, immeuble: '1 rue', _espaceId: 'MARION' }],
  documents: [{ id: 1, parentType: 'immeuble', parentRef: '1 rue', _espaceId: 'MARION' }],
  assurances: [{ id: 1, portee: 'immeuble', immeuble: '1 rue' }],           // config own-only (DIDIER)
  regulValidations: { '1 rue|2025-01|2025-12': { at: 'x' } },               // config own-only (DIDIER)
})

describe('renameImmeubleRefs — rename d\'un immeuble TIERS (Didier renomme la SCI de Marion)', () => {
  it('rerattache les records de MARION seuls ; homonyme DIDIER + records non tagués (propres) + config own INTACTS', () => {
    const d = dbShared()
    const res = renameImmeubleRefs(d, '1 rue', 'Ferrette', { espaceId: 'MARION', ownEspaceId: 'DIDIER' })
    // MARION : rerattaché
    expect(d.logements.filter(l => l._espaceId === 'MARION').every(l => l.imm === 'Ferrette')).toBe(true)
    expect(d.mouvements.find(m => m._espaceId === 'MARION').imm).toBe('Ferrette')
    expect(d.agenda[0].immeuble).toBe('Ferrette')
    expect(d.documents[0].parentRef).toBe('Ferrette')
    expect(res.breakdown.logement).toBe(2)
    // DIDIER homonyme + record non tagué (propre) : INTACTS (pas de fuite inter-espaces)
    expect(d.logements.find(l => l.ref === 'A-1').imm).toBe('1 rue')
    expect(d.logements.find(l => l.ref === 'NEW').imm).toBe('1 rue')
    expect(d.mouvements.find(m => m._espaceId === 'DIDIER').imm).toBe('1 rue')
    // CONFIG own-only (regul/assurance de DIDIER) : PAS re-keyée sur un rename TIERS (réserve audit)
    expect(d.regulValidations['1 rue|2025-01|2025-12']).toEqual({ at: 'x' })
    expect(d.assurances[0].immeuble).toBe('1 rue')
    expect(res.breakdown.regulValidation).toBeUndefined()
    expect(res.breakdown.assurance).toBeUndefined()
  })
})

// ── Rename d'un immeuble PROPRE (own = MARION renomme le sien ; ou mono-espace).
const dbOwn = (own = 'OWN') => ({
  entites: [{ nom: 'SCI', _espaceId: own, immeubles: [{ nom: 'Vieux', _espaceId: own }] }],
  logements: [
    { ref: 'F-1', imm: 'Vieux', _espaceId: own },
    { ref: 'NEW', imm: 'Vieux' },   // créé en session (non tagué) sous un immeuble propre → DOIT suivre
  ],
  mouvements: [], agenda: [], documents: [],
  assurances: [{ id: 1, portee: 'immeuble', immeuble: 'Vieux' }, { id: 2, portee: 'logement', logement: 'F-1', immeuble: 'Vieux' }],
  regulValidations: { 'Vieux|2025-01|2025-12': { at: 'x' }, 'Autre|2025-01|2025-12': { at: 'y' } },
})

describe('renameImmeubleRefs — rename d\'un immeuble PROPRE (config re-keyée, enfants créés en session inclus)', () => {
  it('inclut les records non tagués (créés en session) — réserve audit « Logements isolés » ré-ouvert', () => {
    const d = dbOwn('OWN')
    renameImmeubleRefs(d, 'Vieux', 'Neuf', { espaceId: 'OWN', ownEspaceId: 'OWN' })
    expect(d.logements.find(l => l.ref === 'F-1').imm).toBe('Neuf')   // hydraté tagué
    expect(d.logements.find(l => l.ref === 'NEW').imm).toBe('Neuf')   // créé en session (non tagué) → suit
  })

  it('re-keye regulValidations + propage assurance immeuble (PNO d\'ensemble), mais pas une assurance logement', () => {
    const d = dbOwn('OWN')
    const res = renameImmeubleRefs(d, 'Vieux', 'Neuf', { espaceId: 'OWN', ownEspaceId: 'OWN' })
    expect(d.regulValidations['Neuf|2025-01|2025-12']).toEqual({ at: 'x' })
    expect(d.regulValidations['Vieux|2025-01|2025-12']).toBeUndefined()
    expect(d.regulValidations['Autre|2025-01|2025-12']).toEqual({ at: 'y' })   // autre immeuble intact
    expect(d.assurances.find(a => a.id === 1).immeuble).toBe('Neuf')           // portee immeuble → suit
    expect(d.assurances.find(a => a.id === 2).immeuble).toBe('Vieux')          // portee logement → PAS touché
    expect(res.breakdown.assurance).toBe(1)
  })

  it('immeuble PROPRE créé en session (non tagué, scope=null) en multi-espace : traité comme propre (regul re-keyée) — durcissement audit', () => {
    const d = { logements: [{ ref: 'F-1', imm: 'Vieux' }], mouvements: [], agenda: [], documents: [], regulValidations: { 'Vieux|a|b': { at: 1 } } }
    // immeuble non tagué (créé en session) → espaceId absent (scope null) MAIS ownEspaceId renseigné (multi-espace actif)
    const res = renameImmeubleRefs(d, 'Vieux', 'Neuf', { ownEspaceId: 'OWN' })
    expect(d.logements[0].imm).toBe('Neuf')
    expect(d.regulValidations['Neuf|a|b']).toEqual({ at: 1 })   // config re-keyée (scope=null → propre)
    expect(res.breakdown.regulValidation).toBe(1)
  })

  it('mono-espace (aucun tag, ownEspaceId absent → null===null) : propage tout, config incluse', () => {
    const d = { logements: [{ ref: 'F-1', imm: 'Vieux' }], mouvements: [], agenda: [], documents: [], regulValidations: { 'Vieux|a|b': { at: 1 } } }
    const res = renameImmeubleRefs(d, 'Vieux', 'Neuf', {})
    expect(d.logements[0].imm).toBe('Neuf')
    expect(d.regulValidations['Neuf|a|b']).toEqual({ at: 1 })
    expect(res.breakdown.logement).toBe(1)
  })

  it('ignore les tombstones et no-op si nom inchangé', () => {
    const d = { logements: [{ ref: 'F-1', imm: 'X', _deleted: true }] }
    renameImmeubleRefs(d, 'X', 'Y', {})
    expect(d.logements[0].imm).toBe('X')
    expect(renameImmeubleRefs({ logements: [{ ref: 'F-1', imm: 'X' }] }, 'X', 'X', {}).touched).toBe(0)
  })
})

describe('validateNewImmNom — anti-collision (même uuid déterministe si nom identique dans l\'espace)', () => {
  it('refuse un nom déjà porté par un AUTRE immeuble du même espace ; accepte sinon / inchangé / autre espace', () => {
    const d = dbShared()
    d.entites[0].immeubles.push({ nom: 'Bloc B', _espaceId: 'MARION' })
    expect(validateNewImmNom(d, '1 rue', 'Bloc B', 'MARION', 'DIDIER').ok).toBe(false)   // collision même espace (MARION)
    expect(validateNewImmNom(d, '1 rue', 'Ferrette', 'MARION', 'DIDIER').ok).toBe(true)  // libre
    expect(validateNewImmNom(d, '1 rue', '1 rue', 'MARION', 'DIDIER').ok).toBe(true)     // inchangé
    expect(validateNewImmNom(d, '1 rue', '', 'MARION', 'DIDIER').ok).toBe(false)         // vide
    // « 1 rue » existe aussi chez DIDIER mais ce n'est PAS une collision pour l'espace MARION
    expect(validateNewImmNom(d, 'Ferrette', '1 rue', 'MARION', 'DIDIER').ok).toBe(false) // collision avec le sien (MARION)
  })
})
