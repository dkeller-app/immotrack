/**
 * Onglet Entretien de la fiche logement — _renderEquipForLog (app-part2), VRAI code exécuté.
 * Correctif (chantier TRAVAUX : QUI PAIE ?, l'onglet accueille désormais le registre des incidents) :
 * le nom de l'intervenant (`interv`) était pris comme intervalle → date invalide → RangeError →
 * l'onglet ne s'affichait plus. L'intervalle vient de la règle (mois prioritaires, sinon années).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraireFonction } from './_extraction-source.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
const SRC = extraireFonction(P2, '_renderEquipForLog')

function monter(DB, rules) {
  const deps = {
    DB, EQUIP_RULES: rules, AGENDA_CATS: { AUTRE: { couleur: 'x' }, ENTRETIEN: { couleur: 'y' } },
    _isAlive: (x) => x && !x._deleted, _uiIcon: () => '', _agendaIconSvg: () => '', _lyQ: (s) => s,
    escHtml: (s) => String(s == null ? '' : s), fd: (d) => d,
  }
  const noms = Object.keys(deps)
  return new Function(...noms, SRC + '\nreturn _renderEquipForLog;')(...noms.map((k) => deps[k]))
}
const regle = (x) => ({ key: 'R', cat: 'ENTRETIEN', label: 'Entretien chaudière gaz', base: 'Décret', condFn: () => true, ...x })
afterEach(() => vi.useRealTimers())

describe('_renderEquipForLog', () => {
  it('un intervenant saisi ne fait plus planter l\'onglet ; l\'intervalle vient de la règle', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T10:00:00Z'))
    const DB = { baux: { T2: { ref: 'T2' } }, logements: [{ ref: 'T2' }], equipements: { T2: { R: { lastDate: '2026-02-01', interv: 'Chauffage Kieffer' } } } }
    const html = monter(DB, [regle({ intervalYears: 1 })])('T2')
    expect(html).toContain('2027-02-01')            // prochain entretien = +1 an
    expect(html).toContain('1 an')
    expect(html).toContain('Chauffage Kieffer')      // l'intervenant est affiché comme tel
  })
  it('intervalle en mois (24 mois → 2 ans) et date invalide tolérée', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T10:00:00Z'))
    const DB = { baux: { T2: { ref: 'T2' } }, logements: [{ ref: 'T2' }], equipements: { T2: { R: { lastDate: '2025-06-01' }, S: { lastDate: 'pas une date' } } } }
    const html = monter(DB, [regle({ intervalMonths: 24 }), regle({ key: 'S', intervalYears: 1 })])('T2')
    expect(html).toContain('2027-06-01')
    expect(html).toContain('2 ans')
    expect(html).toContain('Jamais renseigné')
  })
})
