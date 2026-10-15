// RETOURS 15/10 (lot 2, point 4) — Mouvements : l'import est le geste principal (« le but est de faire les
// mouvements auto »). « Importer un relevé » = bouton corail, visible aussi au téléphone (jamais derrière « Filtrer ») ;
// « + Mouvement » (saisie à la main) = secondaire, plus petit ; « Mes comptes » / « Mes règles » restent (secondaires,
// dans « Filtrer » au téléphone, sous « Comptes et règles » — D9). Un seul bouton corail (charte M-4).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HTML = readFileSync(resolve(root, 'index.html'), 'utf8').replace(/\r/g, '')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '')

const barre = (() => {
  const i = HTML.indexOf('<div class="page" id="p-mouvements">')
  const j = HTML.indexOf('<!-- Dropdown filtre multi-choix', i)
  return HTML.slice(i, j)
})()
const boutons = [...barre.matchAll(/<button class="([^"]+)"[^>]*onclick="([^"(]+)\(/g)].map(m => ({ cls: m[1].split(/\s+/), fn: m[2] }))
const btn = fn => boutons.find(b => b.fn === fn)

describe('en-tête de Mouvements', () => {
  it('« Importer un relevé » est le seul bouton corail, toujours visible (pas mvf-adv)', () => {
    const imp = btn('_bankImportOpen')
    expect(imp.cls).toContain('bp')
    expect(imp.cls).toContain('mvf-imp')
    expect(imp.cls).not.toContain('mvf-adv')
    expect(barre).toMatch(/> Importer un relevé<\/button>/)
    expect(boutons.filter(b => b.cls.includes('bp')).length).toBe(1)
  })
  it('« + Mouvement » passe en secondaire, plus petit', () => {
    const add = btn('openNewMv')
    expect(add.cls).toEqual(expect.arrayContaining(['bs', 'bb', 'mvf-add']))
    expect(add.cls).not.toContain('bp')
  })
  it('l\'import vient après « + Mouvement » (à droite sur PC)', () => {
    expect(barre.indexOf('openNewMv()')).toBeLessThan(barre.indexOf('_bankImportOpen()'))
  })
  it('« Mes comptes » / « Mes règles » restent, secondaires, regroupés sous « Comptes et règles »', () => {
    for (const fn of ['_bankAccountsOpen', '_bankRulesOpen']) {
      expect(btn(fn).cls).toEqual(expect.arrayContaining(['bs', 'bb', 'mvf-adv', 'mvf-cr']))
    }
    expect(barre).toMatch(/<div class="mvf-sep"[^>]*>Comptes et règles<\/div>/)
  })
  it('plus aucun « Importer banque » visible dans l\'app', () => {
    expect(barre).not.toContain('Importer banque')
    expect(HTML).not.toMatch(/>[^<]*Importer banque/)
  })
})

describe('téléphone (_ensureMvPhCss) : import visible, + Mouvement compact', () => {
  const css = P1.slice(P1.indexOf('function _ensureMvPhCss('), P1.indexOf('function _ensureMvPhToolbar('))
  it('l\'import n\'est pas rangé derrière « Filtrer » et occupe la ligne, en 44 px', () => {
    expect(css).toMatch(/#p-mouvements \.mvf-imp\{[^}]*flex:1 1 auto[^}]*min-height:44px/)
    expect(css).toMatch(/#p-mouvements \.mvf-imp\{[^}]*order:1/)
  })
  it('« + Mouvement » ne s\'étire plus', () => {
    expect(css).toMatch(/#p-mouvements \.mvf-add\{[^}]*flex:0 0 auto/)
    expect(css).not.toMatch(/\.mvf-add\{flex:1 1 auto/)
  })
  it('la recherche partage la 1re ligne avec « Filtrer »', () => {
    expect(css).toMatch(/#p-mouvements #mvf-search\{flex:1 1 200px/)
  })
  it('« Comptes et règles » n\'apparaît qu\'avec « Filtrer » ouvert', () => {
    expect(css).toMatch(/\.filters\.mvf-open \.mvf-sep\{display:block/)
  })
})
