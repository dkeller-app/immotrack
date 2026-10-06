// B3 (RETOURS-2026-10-05) — nom d'affichage du logement : on exécute le VRAI code de js/app/app-part{1,2}.js
// (fonctions extraites par nom, évaluées dans un vm avec un DB simulé), pas une réplique.
// Garantit : résolution PAR LA RÉFÉRENCE (jamais le `libelle` d'un objet qui n'est pas un logement), repli sur la
// chaîne reçue, suffixe @@espace, échappement XSS, et que le clic d'une carte garde la référence.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
const MIROIR = readFileSync(resolve(root, 'js/helpers/log-label.global.js'), 'utf8')

function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`)
  if (i < 0) throw new Error('fonction introuvable : ' + nom)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + nom)
}

function monde(DB, { avecModule = true, extra = {} } = {}) {
  const sandbox = { String, Object, Array, Number, RegExp, Date, DB, ...extra }
  sandbox.window = sandbox
  vm.createContext(sandbox)
  if (avecModule) vm.runInContext(MIROIR, sandbox)
  vm.runInContext(['escHtml', '_natCmp', '_logFindParRef', '_logNomRepli', '_logLabel', '_logLabelRef', '_logLabelMatch', '_logLabelCmp']
    .map(n => extraire(P1, n)).join('\n'), sandbox)
  return sandbox
}

const LOGS = [
  { ref: 'D-101', libelle: 'Studio RDC', locataire: 'Pierre Demo' },
  { ref: 'D-102', locataire: 'Marie Demo' },
  { ref: 'D-103', libelle: 'd-103' },                       // égal à la réf (casse ignorée) : pas un nom
  { ref: 'G-1', libelle: 'Garage', _deleted: true },       // tombstone
  { ref: 'X-9', libelle: '"><img src=x onerror=alert(1)>' },
]

describe('_logLabel / _logLabelRef (vrai code)', () => {
  for (const [nom, opts] of [['avec LogLabel', {}], ['repli sans LogLabel (file://)', { avecModule: false }]]) {
    describe(nom, () => {
      const w = monde({ logements: LOGS }, opts)
      it('par référence : le nom', () => expect(w._logLabel('D-101')).toBe('Studio RDC'))
      it('sans libellé : la référence', () => expect(w._logLabel('D-102')).toBe('D-102'))
      it('libellé égal à la réf : la référence', () => expect(w._logLabel('D-103')).toBe('D-103'))
      it('référence inconnue / saisie libre : la chaîne reçue, sans erreur', () => {
        expect(w._logLabel('ZZ-0')).toBe('ZZ-0')
        expect(w._logLabel('SCI:Dupont')).toBe('SCI:Dupont')
        expect(w._logLabel('')).toBe('')
        expect(w._logLabel(null)).toBe('')
        expect(w._logLabel(undefined)).toBe('')
      })
      it('suffixe @@espace retiré puis résolu', () => {
        expect(w._logLabel('D-101@@esp2')).toBe('Studio RDC')
        expect(w._logLabelRef('D-101@@esp2')).toBe('Studio RDC · D-101')
      })
      it('un logement (objet) est relu par sa référence', () => {
        expect(w._logLabel({ ref: 'D-101' })).toBe('Studio RDC')
        expect(w._logLabel(LOGS[0])).toBe('Studio RDC')
      })
      it('un objet qui n\'est PAS un logement : jamais son `libelle` (ruban IRL, mouvement, import)', () => {
        expect(w._logLabel({ ref: 'D-101', libelle: 'Pierre Demo · bail du 01/09/2023' })).toBe('Studio RDC')
        expect(w._logLabel({ ref: 'D-102', libelle: 'Pierre Demo · bail du 01/09/2023' })).toBe('D-102')
        expect(w._logLabelRef({ ref: 'D-102', libelle: 'VIREMENT LOYER' })).toBe('D-102')
        expect(w._logLabel({ ref: 'ZZ-0', libelle: 'VIREMENT LOYER' })).toBe('ZZ-0')
      })
      it('forme mixte « Nom · réf »', () => {
        expect(w._logLabelRef('D-101')).toBe('Studio RDC · D-101')
        expect(w._logLabelRef('D-102')).toBe('D-102')
        expect(w._logLabelRef('ZZ-0')).toBe('ZZ-0')
      })
      it('un tombstone est quand même résolu (message affiché après suppression)', () => expect(w._logLabel('G-1')).toBe('Garage'))
      it('recherche et tri', () => {
        const q = (l, s) => w._logLabelMatch(l, s)
        expect(q(LOGS[0], 'studio')).toBe(true)
        expect(q(LOGS[0], 'D-101')).toBe(true)
        expect(q(LOGS[1], 'studio')).toBe(false)
        expect(['D-102', 'D-101'].map(r => LOGS.find(l => l.ref === r)).sort(w._logLabelCmp).map(l => l.ref)).toEqual(['D-102', 'D-101'])
      })
    })
  }
  it('sans DB : ne plante pas', () => {
    const w = monde(undefined)
    expect(w._logLabel('D-101')).toBe('D-101')
  })
})

describe('_renderLogementCardFlat (vrai code) — nom, échappement, onclick', () => {
  const rend = (log, { phone = false } = {}) => {
    const w = monde({ logements: [log] }, {
      extra: {
        _bienIsBailActif: () => false, _bienActiveBail: () => null, _lotStatutLibelle: () => 'Vacant',
        _isPhone: () => phone, _ensureBiencPhCss: () => {}, _coverImg: () => '', _uiIcon: () => '',
        _lyQ: (s) => String(s).replace(/['\\]/g, '\\$&'), fd: (x) => x, fmt: (n) => String(n), fmtN: (n) => String(n)
      }
    })
    vm.runInContext(extraire(P2, '_renderLogementCardFlat'), w)
    return w._renderLogementCardFlat(log)
  }
  it('avec un nom : titre = nom, « Réf. » en petit, onclick = référence', () => {
    const h = rend({ ref: 'D-101', libelle: 'Studio RDC', entity: 'SCI' })
    expect(h).toContain('class="bien-card-title" title="Studio RDC">Studio RDC</div>')
    expect(h).toContain('Réf. D-101')
    expect(h).toContain("openLogFiche('D-101')")
    expect(h).not.toMatch(/onclick="[^"]*Studio RDC/)
  })
  it('sans nom : titre = référence, pas de ligne « Réf. »', () => {
    const h = rend({ ref: 'D-102', entity: 'SCI' })
    expect(h).toContain('>D-102</div>')
    expect(h).not.toContain('Réf. ')
  })
  for (const phone of [false, true]) {
    it(`libellé « <img onerror> » échappé (${phone ? 'téléphone' : 'PC'}), l'onclick garde la référence`, () => {
      const h = rend({ ref: 'X-9', libelle: '"><img src=x onerror=alert(1)>', entity: 'SCI' }, { phone })
      expect(h).not.toContain('<img src=x')
      expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(h).toContain("openLogFiche('X-9')")
    })
  }
})

// B3 audit 🟠2 : le champ « Nom affiché » de saveParamLog (vrai code _logLibelleDepuisFormulaire, avec ET sans module).
describe('_logLibelleDepuisFormulaire (vrai code, saveParamLog)', () => {
  for (const [nom, avecModule] of [['avec LogLabel', true], ['repli sans LogLabel (file://)', false]]) {
    describe(nom, () => {
      const w = () => monde({ logements: [] }, { avecModule })
      const appliquer = (log, ref, present, val) => {
        const m = w()
        vm.runInContext(extraire(P2, '_logLibelleDepuisFormulaire'), m)
        return m._logLibelleDepuisFormulaire(log, ref, present, val)
      }
      it('champ absent du DOM → libellé CONSERVÉ', () => {
        expect(appliquer({ ref: 'D-101', libelle: 'Studio' }, 'D-101', false, '').libelle).toBe('Studio')
      })
      it('champ vide → clé libelle absente', () => {
        const l = appliquer({ ref: 'D-101', libelle: 'Studio' }, 'D-101', true, '   ')
        expect('libelle' in l).toBe(false)
      })
      it('égal à la réf (casse ignorée) → clé absente', () => {
        const l = appliquer({ ref: 'D-101', libelle: 'Studio' }, 'D-101', true, ' d-101 ')
        expect('libelle' in l).toBe(false)
      })
      it('valeur normalisée stockée (espaces fusionnés, invisibles/bidi retirés, 60 car. max sans couper un emoji)', () => {
        expect(appliquer({}, 'D-101', true, '  Studio ‮  RDC​ ').libelle).toBe('Studio RDC')
        const long = appliquer({}, 'D-101', true, '😀'.repeat(70)).libelle
        expect(Array.from(long).length).toBe(60)
        expect(long).not.toMatch(/[\ud800-\udbff]$/)
      })
    })
  }
  it('saveParamLog : n\'appelle le helper que si #log-libelle existe, puis _stamp(log)', () => {
    const c = extraire(P2, 'saveParamLog')
    expect(c).toMatch(/if \(el\('log-libelle'\)\) _logLibelleDepuisFormulaire\(log, ref, true, v\('log-libelle'\)\)/)
    expect(c).toMatch(/_stamp\(log\)/)
    expect(c.indexOf("_logLibelleDepuisFormulaire") ).toBeLessThan(c.lastIndexOf('_stamp(log)'))
  })
})

// B3 audit 🟡4 : finances (drill) — un libellé contenant « · » ne doit pas être tronqué dans les tuiles/badges.
describe('_finDrillLigne : _short ne coupe pas un libellé contenant « · »', () => {
  const corps = extraire(P2, '_finDrillLigne')
  it('_short lit le nom séparé du locataire (jamais indexOf(\' · \'))', () => {
    expect(corps).toMatch(/const _short = ref => nomLotParts\(ref\)\.nom;/)
    expect(corps).not.toMatch(/indexOf\(' · '\)/)
  })
  it('nomLotParts (vrai code) : nom « Studio · RDC » + locataire séparés', () => {
    const m = /const nomLotParts = ref => \{[\s\S]*?\n  \};/.exec(corps)
    expect(m).toBeTruthy()
    const f = new Function('logByRef', '_logLabel', m[0] + '; return nomLotParts;')
    const p = f({ 'D-1': { ref: 'D-1', libelle: 'Studio · RDC', locataire: 'Marie' } }, (l) => l.libelle || l.ref)
    expect(p('D-1')).toEqual({ nom: 'Studio · RDC', loc: 'Marie' })
    expect(p('SCI:Dupont')).toEqual({ nom: 'Dupont', loc: '' })
    expect(p('?')).toEqual({ nom: '?', loc: '' })
  })
})
