// Popup du bail (fenêtre about:blank de MÊME ORIGINE que l'app) : aucune donnée du bail ne doit pouvoir y
// devenir du HTML ou du script. Deux voies fermées avant la bêta :
//   1. les données sérialisées dans le <script> inline (structure du bail, signataires, réf, émetteur…) :
//      JSON.stringify laisse passer « </script> » → passage par _jsonPourScript ;
//   2. le titre (réf + noms des locataires) et le nom court des signataires, rendus en HTML.
// Le nom d'un locataire peut venir d'un CANDIDAT externe (lien de candidature → conversion en bail).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

const SRC = fs.readFileSync('index.html', 'utf8')
const PIEGE = 'x</script><img src=x onerror=alert(1)>&\u2028y'

const jsonPourScript = (() => {
  const i = SRC.indexOf('function _jsonPourScript(')
  const j = SRC.indexOf('\n}', i)
  if (i < 0 || j < 0) throw new Error('_jsonPourScript introuvable')
  return new Function(SRC.slice(i, j + 2) + '\nreturn _jsonPourScript;')()
})()

function corpsDe (nom) {
  const i = SRC.indexOf('function ' + nom + '(')
  if (i < 0) throw new Error(nom + ' introuvable')
  const j = SRC.indexOf('\nfunction ', i + 10)
  return SRC.slice(i, j < 0 ? undefined : j)
}

describe('_jsonPourScript', () => {
  it('ne laisse aucun caractère qui puisse fermer un <script> ou couper une ligne JS', () => {
    const out = jsonPourScript({ nom: PIEGE, liste: [PIEGE] })
    expect(out).not.toMatch(/[<>&\u2028\u2029]/)
  })
  it('la valeur relue par le moteur JS est identique', () => {
    const v = { nom: PIEGE, n: 3, b: true, x: null, t: ['a<b', 'c>d'] }
    expect(vm.runInNewContext('(' + jsonPourScript(v) + ')')).toEqual(v)
  })
  it('undefined reste undefined (même sortie que JSON.stringify concaténé)', () => {
    expect(jsonPourScript(undefined)).toBe('undefined')
  })
})

describe('previewBailData — câblage', () => {
  const corps = corpsDe('previewBailData')
  const a = corps.indexOf("var scripts = '<script>'")
  const bloc = corps.slice(a, corps.indexOf("var _N='+N_PAGES+';'", a))

  it('le bloc de données du <script> ne sérialise plus rien par JSON.stringify brut', () => {
    expect(a).toBeGreaterThan(0)
    expect(bloc.split("='+_jsonPourScript(").length - 1).toBeGreaterThanOrEqual(20)   // garde anti-vacuité
    expect(bloc).not.toContain("='+JSON.stringify(")
  })
  it('signataires et structure du bail passent par _jsonPourScript', () => {
    expect(corps).toContain('var sigsJson = _jsonPourScript(')
    expect(corps).toContain('var bailStructureJson = _jsonPourScript(')
    expect(corps).not.toMatch(/var (sigsJson|bailStructureJson) = JSON\.stringify\(/)
  })
  it('le titre (réf + noms) n\'est jamais concaténé brut', () => {
    expect(corps.split('escHtml(titleLabel)').length - 1).toBe(2)
    expect(corps).not.toMatch(/\+\s*titleLabel\s*\+/)
  })
  it('le nom court d\'un signataire est échappé partout où la popup le rend', () => {
    const usages = bloc.length ? corps.slice(a).match(/[^.\w]s\.nomCourt/g) || [] : []
    expect(usages.length).toBeGreaterThanOrEqual(3)                                  // garde anti-vacuité
    expect(corps.slice(a)).not.toMatch(/\+\s*s\.nomCourt\s*\+/)
  })
})

describe('previewBailDataV2 — titre', () => {
  it('la réf est échappée dans le <title>', () => {
    const corps = corpsDe('previewBailDataV2')
    expect(corps).toContain('<title>Bail V2 — ${escHtml(ref)}</title>')
  })
})
