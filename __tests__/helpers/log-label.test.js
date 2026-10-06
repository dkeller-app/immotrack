import { describe, it, expect } from 'vitest'
import { normaliserLibelle, libelle, libelleEtRef, correspond, comparer } from './log-label.js'

describe('normaliserLibelle', () => {
  it('trim, espaces fusionnés, contrôles retirés', () => expect(normaliserLibelle('  Studio \n  RDC\u0000 gauche ', 'D-101')).toBe('Studio RDC gauche'))
  it('coupe à 60', () => expect(normaliserLibelle('x'.repeat(80), 'D-101')).toHaveLength(60))
  it('vide / null / espaces → vide', () => { expect(normaliserLibelle('', 'D-101')).toBe(''); expect(normaliserLibelle(null, 'D-101')).toBe(''); expect(normaliserLibelle('   ', 'D-101')).toBe('') })
  it('égal à la référence (sans casse) → vide : rien à stocker', () => { expect(normaliserLibelle('d-101', 'D-101')).toBe(''); expect(normaliserLibelle(' D-101 ', 'D-101')).toBe('') })
  it('le HTML est conservé tel quel (l\'échappement se fait à l\'affichage)', () => expect(normaliserLibelle('<script>x</script>', 'D-101')).toBe('<script>x</script>'))
})
describe('libelle / libelleEtRef', () => {
  it('avec libellé', () => { const l = { ref: 'D-101', libelle: 'Studio RDC' }; expect(libelle(l)).toBe('Studio RDC'); expect(libelleEtRef(l)).toBe('Studio RDC · D-101') })
  it('sans libellé → la référence', () => { const l = { ref: 'D-102' }; expect(libelle(l)).toBe('D-102'); expect(libelleEtRef(l)).toBe('D-102') })
  it('libellé identique à la ref → la référence seule', () => expect(libelleEtRef({ ref: 'D-101', libelle: 'D-101' })).toBe('D-101'))
  it('pas de logement → vide', () => { expect(libelle(null)).toBe(''); expect(libelleEtRef(undefined)).toBe('') })
})
describe('correspond', () => {
  const l = { ref: 'D-101', libelle: 'Studio rez-de-chaussée gauche' }
  it('par libellé, sans casse ni accents', () => { expect(correspond(l, 'REZ-DE-CHAUSSEE')).toBe(true); expect(correspond(l, 'studio')).toBe(true) })
  it('par référence', () => expect(correspond(l, 'd-101')).toBe(true))
  it('faux sinon, vrai si requête vide', () => { expect(correspond(l, 'garage')).toBe(false); expect(correspond(l, '')).toBe(true) })
})
describe('comparer', () => {
  it('tri naturel : « Apt 2 » avant « Apt 10 »', () => expect(comparer({ ref: 'A', libelle: 'Apt 2' }, { ref: 'B', libelle: 'Apt 10' })).toBeLessThan(0))
  it('noms égaux → départage par référence', () => expect(comparer({ ref: 'D-102', libelle: 'Garage' }, { ref: 'D-101', libelle: 'Garage' })).toBeGreaterThan(0))
  it('mélange avec et sans libellé', () => { const t = [{ ref: 'D-102' }, { ref: 'D-103', libelle: 'Atelier' }, { ref: 'D-101' }].sort(comparer).map(x => x.ref); expect(t).toEqual(['D-103', 'D-101', 'D-102']) })
})

describe('normaliserLibelle : invisibles, bidi, emoji (audit B3 🟡10)', () => {
  it('retire zero-width, marques bidi et surcharges RLO/LRI', () => {
    expect(normaliserLibelle('A​B‎‮C⁦D⁩E﻿F', 'X')).toBe('ABCDEF')
  })
  it('un libellé fait de caractères invisibles est vide', () => expect(normaliserLibelle('​‮﻿', 'X')).toBe(''))
  it('coupe à 60 caractères sans casser un emoji (paire de substitution)', () => {
    const r = normaliserLibelle('😀'.repeat(61), 'X')
    expect(Array.from(r).length).toBe(60)
    expect(r.endsWith('😀')).toBe(true)
  })
})
