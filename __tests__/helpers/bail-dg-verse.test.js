// RETOURS-2026-10-05 B4 — coche « Dépôt de garantie versé » (bail.dgVerse), sans mouvement bancaire.
// Le statut vient du module (js/core) ET de sa copie inline (app-part2.js) : on teste les deux, le vrai code.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { _dgStatut as dgCore, DG_STATUS } from '../../js/core/gestion-dg-impayes.js'
import { CHAMPS_BAIL } from '../../js/core/bail-modifications.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
const HTML = readFileSync(resolve(root, 'index.html'), 'utf8')

function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error(nom)
}
const sb = { DG_STATUS, td: () => '2026-10-06', Date, Number, String }
vm.createContext(sb)
vm.runInContext(extraire(P2, '_dgStatut'), sb)

describe.each([['module core', dgCore], ['copie inline app-part2', (...a) => sb._dgStatut(...a)]])('_dgStatut — coche versé (%s)', (_n, dgStatut) => {
  it('DG dû, rien de saisi, coche absente → « manquant » (comportement inchangé)', () =>
    expect(dgStatut({ dg: 760 }).statut).toBe(DG_STATUS.MANQUANT))
  it('DG dû + dgVerse:true → « complet » (versé), montant = DG dû', () => {
    const r = dgStatut({ dg: 760, dgVerse: true })
    expect(r.statut).toBe(DG_STATUS.COMPLET)
    expect(r.dgPaid).toBe(760)
    expect(r.soldeRestant).toBe(0)
  })
  it('dgVerse:false → toujours « manquant »', () =>
    expect(dgStatut({ dg: 760, dgVerse: false }).statut).toBe(DG_STATUS.MANQUANT))
  it('un montant réellement versé (dgPaid) l\'emporte sur la coche', () => {
    const r = dgStatut({ dg: 760, dgPaid: 500, dgVerse: true })
    expect(r.dgPaid).toBe(500)
    expect(r.statut).toBe(DG_STATUS.PARTIEL)
  })
  it('sans DG dû, la coche ne crée pas d\'état parasite', () =>
    expect(dgStatut({ dg: 0, dgVerse: true }).statut).toBe(DG_STATUS.COMPLET))
})

describe('B4 — câblage du formulaire et du journal', () => {
  it('le journal du bail signé suit le champ', () => expect(CHAMPS_BAIL.dgVerse).toBeTruthy())
  it('le gabarit porte la coche #b-dgVerse', () => expect(HTML).toMatch(/type="checkbox" id="b-dgVerse"/))
  it('chargement, état comparable et enregistrement lisent/écrivent bail.dgVerse', () => {
    expect(P1).toMatch(/el\('b-dgVerse'\)\.checked = bail\.dgVerse === true/)
    expect((P1.match(/dgVerse: el\('b-dgVerse'\) \? el\('b-dgVerse'\)\.checked : false/g) || []).length).toBe(2)
  })
})
