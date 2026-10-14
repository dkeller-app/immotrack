// Audit d'intégration v15.728 🟡3 — Accueil (Pilotage) : la famille (dépôt / fin de bail) et le nom d'une tâche viennent des
// champs STRUCTURÉS de l'item (_computeUnifiedTodo : `nom`, `hasDG`), jamais du sous-titre affiché. Un nom d'affichage (B3)
// peut contenir « — » ou « DG » : le découper ou y chercher « DG » classait mal la tâche et tronquait le nom.
// Vrai code de _pilCollectFamilles exécuté (doubles pour le reste de l'app).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extraireFonction } from './_extraction-source.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')

function familles(items) {
  const scope = {
    window: { _loyerTodayLocal: () => '2026-10-07', AlertRules: {} }, DB: { agenda: [], candidats: [] },
    _isLoyerCategory: () => false, _computeImpayes: () => ({ items: [] }), _computeUnifiedTodo: () => items,
    _lotEstLoue: () => true, _logLabel: (r) => r, computePilotageFamilles: (src) => src,
    Date, Math, Number, String, Object, Array, Set, Map, parseInt, isNaN,
  }
  const f = new Function('scope', 'with (scope) {\n' + extraireFonction(P1, '_pilCollectFamilles') + '\nreturn _pilCollectFamilles;\n}')(scope)
  return f({ scopeLogs: [{ ref: 'D-101' }, { ref: 'D-102' }], yr: '2026', mo: '', activeEnt: '' })
}

describe('_pilCollectFamilles — champs structurés, jamais le sous-titre', () => {
  const NOM = 'Studio — DG rez-de-chaussée'   // nom d'affichage piégé : « — » ET « DG »
  it('départ SANS échéance de dépôt, nom contenant « DG » et « — » → fin de bail, nom entier', () => {
    const src = familles([{ type: 'depart', score: 58, contextRef: 'D-101', nom: NOM, hasDG: false, subtitle: NOM + ' — Martin' }])
    expect(src.depot).toEqual([])
    expect(src.finbail).toEqual([expect.objectContaining({ ref: 'D-101', nom: NOM })])
  })
  it('dépôt à restituer (hasDG) dont le sous-titre ne contient pas « DG » → dépôt', () => {
    const src = familles([{ type: 'depart', score: 78, contextRef: 'D-102', nom: 'D-102', hasDG: true, subtitle: 'D-102 — Lea · 900 €' }])
    expect(src.depot).toEqual([expect.objectContaining({ ref: 'D-102', nom: 'D-102' })])
    expect(src.finbail).toEqual([])
  })
  it('documents, IRL, régul, entretiens : le nom structuré, entier', () => {
    const src = familles([
      { type: 'diag', score: 88, contextRef: 'D-101', nom: NOM, subtitle: NOM + ' — Martin' },
      { type: 'irl', score: 70, contextRef: 'D-101', nom: NOM, subtitle: NOM + ' — 600 € → 612 €' },
    ])
    expect(src.document[0].nom).toBe(NOM)
    expect(src.irl[0].nom).toBe(NOM)
  })
  it('_computeUnifiedTodo porte les champs : `nom` sur les tâches de lot, `hasDG` sur les deux tâches de départ', () => {
    const b = extraireFonction(P1, '_computeUnifiedTodo')
    expect((b.match(/nom:_logLabel\((l|it)\.ref\)/g) || []).length).toBe(11)
    expect(b).toMatch(/hasDG:true/)
    expect(b).toMatch(/hasDG:!!dgTxt/)
    const c = extraireFonction(P1, '_pilCollectFamilles')
    expect(c).not.toMatch(/split\(' — '\)/)
    expect(c).not.toMatch(/\/ DG \//)
  })
})
