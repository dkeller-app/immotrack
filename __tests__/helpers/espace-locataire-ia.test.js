/**
 * CIRCUIT D'UN INCIDENT (0060) — signalement du locataire avec l'aide de l'IA (js/core/espace-locataire.js).
 *   I-1 aide de l'IA bornée, clés connues seulement
 *   I-2 contact : téléphone seulement avec l'accord du locataire (D13)
 *   I-3 import dans le registre : élément et nature déduits par l'IA, sinon comportement 0059 inchangé
 */
import { describe, it, expect } from 'vitest'
import { normaliserIaSignalement, normaliserContactSignalement, champsIncident } from '../../js/core/espace-locataire.js'

describe('I · signalement avec l\'aide de l\'IA', () => {
  it('I-1 aide de l\'IA : bornée, clés connues ; vide → null', () => {
    const ia = normaliserIaSignalement({ resume: '  Fuite   goutte à goutte ', element: 'canalisation', nature: 'licorne', urgences: ['eau', 'eau', 'x'], texte: 't'.repeat(3000), reponses: [{ q: 'Continu ?', r: 'Non' }, { q: '', r: 'x' }, { q: 'a', r: 'b' }], pirate: true })
    expect(ia).toMatchObject({ resume: 'Fuite goutte à goutte', element: 'canalisation', nature: null, urgences: ['eau'], reponses: [{ q: 'Continu ?', r: 'Non' }] })
    expect(ia.texte).toHaveLength(2000)
    expect(ia.pirate).toBeUndefined()
    expect(normaliserIaSignalement({})).toBeNull()
    expect(normaliserIaSignalement([1])).toBeNull()
    expect(normaliserIaSignalement('x')).toBeNull()
  })
  it('I-2 téléphone transmis SEULEMENT avec l\'accord du locataire, numéro plausible', () => {
    expect(normaliserContactSignalement({ tel_partage: true, telephone: '06 39 98 12 34', acces_info: 'Code', presence: '' })).toEqual({ tel_partage: true, telephone: '06 39 98 12 34', acces_info: 'Code', presence: null })
    expect(normaliserContactSignalement({ tel_partage: false, telephone: '06 39 98 12 34' })).toMatchObject({ tel_partage: false, telephone: null })
    expect(normaliserContactSignalement({ tel_partage: true, telephone: 'appeler le soir' })).toMatchObject({ tel_partage: false, telephone: null })
    expect(normaliserContactSignalement({ tel_partage: 'oui', telephone: '0639981234' }).tel_partage).toBe(false)
  })
  it('I-3 import : élément et nature de l\'IA ; urgences de l\'IA si « urgent » ; sans IA : comme 0059', () => {
    const base = { id: 'a1b2c3d4-e5f6-4000-8000-000000000000', piece: 'cuisine', element: 'fuite_eau', urgence: 'urgente', description: 'Fuite', cree_le: '2026-10-14T18:42:00Z' }
    const avec = champsIncident({ ...base, ia: { resume: 'Fuite', element: 'canalisation', nature: 'fuite', urgences: ['eau', 'electricite'] } }, { logRef: 'T3', entity: 'SCI Dupont', nom: 'Camille' })
    expect(avec).toMatchObject({ element: 'canalisation', elementLibre: 'Cuisine', nature: 'fuite', urgences: ['eau', 'electricite'], canal: 'espace' })
    const sans = champsIncident(base, { logRef: 'T3' })
    expect(sans).toMatchObject({ element: 'autre', elementLibre: 'Fuite d\'eau · Cuisine', nature: 'fuite', urgences: ['eau'] })
    expect(champsIncident({ ...base, urgence: 'faible', ia: { element: 'robinet', urgences: ['eau'] } }, {}).urgences).toEqual([])
  })
})
