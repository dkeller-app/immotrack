/**
 * Retours du 15/10/2026 (lot 1, point 1) — la carte « Régime fiscal — micro-foncier » est RETIRÉE
 * de Finances (décision Didier : Propryo n'est pas un outil de conseil fiscal ; revient sur v15.625).
 * La carte calculait en plus via _compute2044 à côté du moteur Finances (CDC § 1, principe 4).
 * Garde-fou : ni la carte, ni son module, ni son préchargement ne reviennent par une fusion.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..')
const lire = (p) => fs.readFileSync(path.join(root, p), 'utf8')

describe('Finances sans la carte micro-foncier', () => {
  it('le rendu de Finances ne contient plus la carte ni ses helpers', () => {
    const ap2 = lire('js/app/app-part2.js')
    expect(ap2).not.toMatch(/_microFoncierCardHtml|_microFoncierEntEligible|_microFoncierEval|microFoncierHtml/)
    expect(ap2).not.toContain('Régime fiscal — location nue')
    expect(ap2).not.toContain('Piste à explorer : le micro-foncier')
  })
  it('le module js/core/micro-foncier.js et son import ont disparu', () => {
    expect(fs.existsSync(path.join(root, 'js', 'core', 'micro-foncier.js'))).toBe(false)
    expect(lire('js/main.js')).not.toMatch(/micro-foncier|evaluerMicroFoncier|MF_SEUIL|MF_ABATTEMENT/)
    expect(lire('index.html')).not.toContain('js/core/micro-foncier.js')
  })
  it('les autres blocs de Finances restent rendus dans le même ordre', () => {
    const ap2 = lire('js/app/app-part2.js')
    expect(ap2).toMatch(/'<div id="fin-viz"><\/div>'\r?\n\s+\+ '<div id="fin-pl"><\/div>'\r?\n\s+\+ '<div id="fin-exports"><\/div>'/)
  })
})
