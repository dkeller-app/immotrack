// RETOURS 15/10 — lot 2, point 3 : un seul bouton « + Assurance » dans l'onglet Entretien & assurances,
// qui demande « du locataire » (assurance habitation) ou « du propriétaire » (PNO).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8').replace(/\r/g, '')

const corps = (src, nom) => {
  const i = src.indexOf('function ' + nom + '(')
  if (i < 0) return ''
  const j = src.indexOf('\nfunction ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}

describe('onglet Entretien & assurances : un seul bouton', () => {
  const rend = corps(P2, '_renderAssForLog')
  it('« + Assurance » remplace les deux anciens boutons', () => {
    expect(rend).toContain('>+ Assurance</button>')
    expect(rend).not.toContain('+ Assurance habitation')
    expect(rend).not.toContain('+ Assurance ce logement')
    expect(rend).toMatch(/onclick="_assChoisir\('\$\{_refA\}'\)"/)
  })
  it('bouton secondaire : le seul corail de l\'onglet reste « Signaler un incident » (charte M-4)', () => {
    const btn = rend.match(/<button class="([^"]+)"[^>]*>\+ Assurance<\/button>/)
    expect(btn).not.toBeNull()
    expect(btn[1].split(/\s+/)).not.toContain('bp')
  })
})

describe('le choix « de qui est l\'assurance ? »', () => {
  const ch = corps(P2, '_assChoisir')
  it('existe et propose les deux options, avec un libellé (jamais une icône seule)', () => {
    expect(ch).toContain('Du locataire')
    expect(ch).toContain('Du propriétaire')
  })
  it('du locataire → fiche d\'assurance habitation existante ; du propriétaire → fiche PNO du logement', () => {
    expect(ch).toMatch(/openMrh\(null,\s*ref\)/)
    expect(ch).toMatch(/openAss\(null,\s*ref,\s*'logement'\)/)
  })
  it('la référence passe par une donnée, jamais concaténée dans un gestionnaire inline', () => {
    expect(ch).not.toMatch(/onclick="[^"]*\$\{ref\}/)
  })
})
