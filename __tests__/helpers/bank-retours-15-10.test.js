/**
 * Retours du 15/10/2026 (lot 1, point 3) — import bancaire.
 *  a) La liste « SCI / entité » (vérification d'un mouvement, formulaire de mouvement) ne filtrait que
 *     les entités de type « SCI… » : un bailleur en NOM PROPRE (type « Personne physique ») n'avait
 *     aucune entrée, même quand c'était le bailleur du compte importé.
 *  b) La fenêtre pas à pas « Renseigner / Vérifier ce mouvement » n'avait pas de geste pour écarter la
 *     ligne : « Écarter ce mouvement » réutilise _bankExcludeLine (rétablissable sous la liste).
 *  c) Une ligne écartée ne s'importe jamais, même un doublon d'abord gardé (« Importer quand même »).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { _bankPerimetre } from '../../js/core/bank-import.js'

const root = path.resolve(__dirname, '..', '..')
const ap1 = fs.readFileSync(path.join(root, 'js/app/app-part1.js'), 'utf8')
const ap2 = fs.readFileSync(path.join(root, 'js/app/app-part2.js'), 'utf8')
const corps = (src, nom) => {
  const i = src.indexOf('function ' + nom + '(')
  expect(i, nom + ' introuvable').toBeGreaterThan(-1)
  const j = src.indexOf('\nfunction ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}

describe('a) toutes les entités bailleresses sont proposées, nom propre compris', () => {
  it('aucune liste d\'entités ne filtre plus sur le type « SCI… »', () => {
    expect(ap1).not.toMatch(/type\s*&&\s*e\.type\.startsWith\('SCI'\)/)
    expect(ap1).not.toMatch(/e\.type\.startsWith\('SCI'\)/)
    expect(corps(ap1, 'fillMvQui')).toContain('DB.entites.filter(_isAlive).map(')
    expect(corps(ap1, '_affRender')).toContain('const sciAll = DB.entites.filter(_isAlive);')
  })
  it('le bailleur du compte est présélectionné quel que soit son type', () => {
    expect(corps(ap1, '_affRender')).toContain('DB.entites.some(e => _isAlive(e) && e.nom === _currentBankAccount.bailleur)')
  })
  it('périmètre du compte d\'un bailleur en nom propre : seule son entité, ses immeubles, ses lots', () => {
    const entites = [{ nom: 'SCI Patrimoine', type: 'SCI IR', immeubles: [{ nom: 'Les Tilleuls' }] },
      { nom: 'Camille Mercier', type: 'Personne physique', immeubles: [{ nom: 'Résidence du Parc' }] }]
    const logements = [{ ref: 'A', imm: 'Les Tilleuls', entity: 'SCI Patrimoine' }, { ref: 'B', imm: 'Résidence du Parc', entity: 'Camille Mercier' },
      { ref: 'C', imm: 'Sans proprio', entity: '' }]
    const per = _bankPerimetre({ bailleur: 'Camille Mercier', mixte: false }, { entites, logements })
    expect(entites.filter(e => per.entiteOk(e.nom)).map(e => e.nom)).toEqual(['Camille Mercier'])
    expect(['Les Tilleuls', 'Résidence du Parc', 'Sans proprio'].filter(per.immeubleOk)).toEqual(['Résidence du Parc', 'Sans proprio'])
    expect(logements.filter(per.logementOk).map(l => l.ref)).toEqual(['B', 'C'])
    // compte mixte / sans bailleur : aucun filtre (documenté), avertissement pour le second
    expect(_bankPerimetre({ mixte: true }, { entites, logements }).limite).toBe(false)
    const sans = _bankPerimetre({ bailleur: '' }, { entites, logements })
    expect(sans.limite).toBe(false)
    expect(sans.warn).toMatch(/pas de bailleur/)
  })
})

describe('b) « Écarter ce mouvement » dans la fenêtre pas à pas', () => {
  it('le pied de la fenêtre porte le geste, avec libellé et icône', () => {
    expect(corps(ap2, '_bankWalkRender')).toMatch(/onclick="_bankWalkExclude\(\)"[^>]*>' \+ _uiIcon\('trash'\) \+ ' Écarter ce mouvement<\/button>/)
  })
  it('réutilise _bankExcludeLine, sort la ligne du parcours sans la synchroniser, et le dit', () => {
    const f = corps(ap2, '_bankWalkExclude')
    expect(f).toContain('_bankExcludeLine(i)')
    expect(f).toContain('_bankMvIdx = -1')
    expect(f.indexOf('_bankMvIdx = -1')).toBeLessThan(f.indexOf('_bankExcludeLine(i)'))
    expect(f).toContain('_bankWalk.splice(_bankWalkPos, 1)')
    expect(f).toContain('_bankWalkDone()')
    expect(f).toMatch(/showToast\([\s\S]*rétablir/)
  })
})

describe('c) une ligne écartée n\'est jamais importée', () => {
  it('le filtre d\'import teste l\'exclusion avant le « garder » d\'un doublon', () => {
    expect(ap2).toContain('const toImport = _bankImportLines.filter(l => !l._userExclude && (l._userKeep || !l.isDuplicate) && _bankLineDone(l));')
  })
})
