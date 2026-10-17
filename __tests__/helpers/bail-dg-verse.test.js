// RETOURS-2026-10-05 B4 — case « Dépôt de garantie versé » (bail.dgVerse), sans mouvement bancaire.
// Audit d'intégration v15.728 🟠3 (décision du pilote 07/10, R-0) : UNE définition du dépôt versé, _dgVerseMontant
// (js/core/gestion-dg-impayes.js + sa copie file:// d'app-part2), lue par TOUS les calculs du dépôt.
//   dgVerse === false → 0 (ni détenu, ni à restituer, ni déduit au solde) ; true ou absent → dgPaid, sinon dg.
// Le vrai code est exécuté (module, copie inline, fonctions d'app-part1 extraites).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { _dgStatut as dgCore, _calculerSoldeDG as soldeCore, _dgVerseMontant as montantCore, _dgVerseCoche as cocheCore, _dgRetenueLoyerDecidee as retenueCore, DG_STATUS } from '../../js/core/gestion-dg-impayes.js'
import { CHAMPS_BAIL } from '../../js/core/bail-modifications.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const lire = (p) => readFileSync(resolve(root, p), 'utf8')
const P1 = lire('js/app/app-part1.js')
const P2 = lire('js/app/app-part2.js')
const HTML = lire('index.html')

function extraire(src, nom) {
  const i = src.indexOf(`function ${nom}(`)
  if (i < 0) throw new Error('introuvable : ' + nom)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error(nom)
}
// Copies file:// d'app-part2 (statut, solde, règle).
const sb = { DG_STATUS, td: () => '2026-10-06', Date, Number, String, window: {}, _calculerLoyerImpayeCumule: () => 0 }
vm.createContext(sb)
vm.runInContext(['_dgVerseMontant', '_dgVerseCoche', '_dgStatut', '_calculerSoldeDG'].map(n => extraire(P2, n)).join('\n'), sb)

const CAS = [
  [{ dg: 760 }, 760], [{ dg: 760, dgVerse: true }, 760], [{ dg: 760, dgVerse: false }, 0], [{ dg: 760, dgPaid: 500 }, 500],
  [{ dg: 760, dgPaid: 500, dgVerse: false }, 0], [{ dg: '760' }, 760], [{ dg: 0 }, 0], [{}, 0], [null, 0],
]

describe('_dgVerseMontant — LA définition du dépôt versé', () => {
  it.each(CAS)('%j → %s (module)', (b, attendu) => expect(montantCore(b)).toBe(attendu))
  it('copie file:// d\'app-part2 identique au module, cas par cas (repli dgLot compris)', () => {
    for (const [b] of CAS) expect(sb._dgVerseMontant(b)).toBe(montantCore(b))
    for (const [b] of CAS) expect(sb._dgVerseMontant(b, 640)).toBe(montantCore(b, 640))
    expect(montantCore({ dg: 0 }, 640)).toBe(640)
    expect(montantCore({ dgVerse: false }, 640)).toBe(0)
  })
  it('_dgVerseCoche : bail existant sans réponse → coché ; décoché seulement s\'il l\'a été ; pas de bail → décoché', () => {
    for (const f of [cocheCore, (b) => sb._dgVerseCoche(b)]) {
      expect(f({ dg: 760 })).toBe(true); expect(f({ dgVerse: true })).toBe(true)
      expect(f({ dgVerse: false })).toBe(false); expect(f(null)).toBe(false); expect(f(undefined)).toBe(false)
    }
  })
})

describe.each([['module core', dgCore], ['copie inline app-part2', (...a) => sb._dgStatut(...a)]])('_dgStatut (%s)', (_n, dgStatut) => {
  it('bail ancien, case absente → présumé versé : « complet »', () => {
    const r = dgStatut({ dg: 760 })
    expect(r.statut).toBe(DG_STATUS.COMPLET); expect(r.dgPaid).toBe(760)
  })
  it('case cochée → « complet », montant = DG dû', () => {
    const r = dgStatut({ dg: 760, dgVerse: true })
    expect(r.statut).toBe(DG_STATUS.COMPLET); expect(r.dgPaid).toBe(760); expect(r.soldeRestant).toBe(0)
  })
  it('case décochée → « manquant », même bail clôturé (rien à restituer)', () => {
    expect(dgStatut({ dg: 760, dgVerse: false }).statut).toBe(DG_STATUS.MANQUANT)
    const r = dgStatut({ dg: 760, dgVerse: false, cloture: true, finEffective: '2026-09-30' })
    expect(r.statut).toBe(DG_STATUS.MANQUANT); expect(r.dgPaid).toBe(0)
  })
  it('un montant réellement versé (dgPaid) l\'emporte', () => {
    const r = dgStatut({ dg: 760, dgPaid: 500, dgVerse: true })
    expect(r.dgPaid).toBe(500); expect(r.statut).toBe(DG_STATUS.PARTIEL)
  })
  it('sans DG dû, pas d\'état parasite', () => expect(dgStatut({ dg: 0, dgVerse: true }).statut).toBe(DG_STATUS.COMPLET))
})

describe('_calculerSoldeDG — case décochée : rien n\'est déduit ni restitué', () => {
  it.each([['module', soldeCore], ['copie inline', (...a) => sb._calculerSoldeDG(...a)]])('%s', (_n, solde) => {
    expect(solde({ dg: 760, dgVerse: false }, []).dgPaid).toBe(0)
    expect(solde({ dg: 760, dgVerse: false }, []).soldeRestitue).toBe(0)
    expect(solde({ dg: 760 }, []).dgPaid).toBe(760)
  })
})

describe('_dgDetenuDuBail (vrai code d\'app-part1) — dépôts détenus', () => {
  const w = { _dgVerseMontant: montantCore, Number, Math }
  w.window = { _dgRetenueLoyerDecidee: retenueCore }
  vm.createContext(w)
  vm.runInContext(extraire(P1, '_dgRestitutionEnregistree') + '\n' + extraire(P1, '_dgRetenueLoyerDe') + '\n' + extraire(P1, '_dgDetenuDuBail'), w)
  it('case décochée → rien n\'est détenu ; absente ou cochée → le dépôt ; repli sur la fiche du lot', () => {
    expect(w._dgDetenuDuBail({ dg: 760, dgVerse: false }, 0)).toBe(0)
    expect(w._dgDetenuDuBail({ dg: 760 }, 0)).toBe(760)
    expect(w._dgDetenuDuBail({ dg: 760, dgVerse: true }, 0)).toBe(760)
    expect(w._dgDetenuDuBail({ dg: 0 }, 640)).toBe(640)
    expect(w._dgDetenuDuBail({ dg: 0, dgVerse: false }, 640)).toBe(0)
    expect(w._dgDetenuDuBail({ dg: 760, dgRestitueAt: '2026-09-01' }, 0)).toBe(0)
  })
  it('DÉPÔT DÉTENU (17/10) : la retenue pour loyer sort du dépôt détenu, le reste reste détenu jusqu\'à la restitution datée', () => {
    expect(w._dgDetenuDuBail({ dg: 700, dgRetenueLoyer: 303 }, 0)).toBe(397)
    expect(w._dgDetenuDuBail({ dg: 700, dgRetenueLoyer: 303, cloture: true, clotureV: 2, dgRetenu: 150, dgRestitue: 0 }, 0)).toBe(397)
    expect(w._dgDetenuDuBail({ dg: 450, dgRetenueLoyer: 900 }, 0)).toBe(0)
    expect(w._dgDetenuDuBail({ dg: 700, dgRetenueLoyer: '' }, 0)).toBe(700)
    expect(w._dgDetenuDuBail({ dg: 700, dgRetenueLoyer: 303, dgRestitueAt: '2026-10-20' }, 0)).toBe(0)
    // ancienne clôture (avant clotureV) avec un montant saisi : comptée soldée — la migration de données la date ou la rouvre
    expect(w._dgDetenuDuBail({ dg: 700, cloture: true, dgRestitue: 247, dgRetenu: 150 }, 0)).toBe(0)
  })
})

describe('R-0 — tous les calculs du dépôt lisent la définition unique', () => {
  it('statut, détenus, solde, clôture, restitution, frise : _dgVerseMontant', () => {
    expect(extraire(P1, '_dgDetenuDuBail')).toMatch(/_dgVerseMontant\(b, dgLot\)/)
    expect(extraire(P1, '_rgClotureCompute')).toMatch(/_dgVerseMontant\(bail, log\.dg\)/)
    expect(extraire(P2, '_dgOpenRestitution')).toMatch(/_dgVerseMontant\(bail\)/)
    expect(lire('js/core/bail-historique.js')).toMatch(/dgVerse: _dgVerseMontant\(b\)/)
    expect(lire('js/main.js')).toMatch(/window\._dgVerseMontant = _dgVerseMontant/)
    // plus aucun « dgPaid || dg » recopié ailleurs
    for (const [nom, src] of [['app-part1', P1], ['app-part2', P2], ['gestion-dg-impayes', lire('js/core/gestion-dg-impayes.js')]]) {
      const hors = src.replace(/function _dgVerseMontant\([\s\S]*?\n\}/g, '')
      expect(hors, nom).not.toMatch(/Number\([\w.]*dgPaid\)\s*\|\|\s*Number\([\w.]*\.dg\)/)
    }
  })
  it('GARDE-FOU : `.dgVerse` d\'un bail n\'est LU que dans _dgVerseMontant / _dgVerseCoche (module + copie)', () => {
    const fichiers = []
    for (const d of ['js/app', 'js/core', 'js/helpers']) for (const f of readdirSync(resolve(root, d))) if (/\.js$/.test(f)) fichiers.push(d + '/' + f)
    const fautes = []
    for (const f of fichiers) {
      let src = lire(f)
      // les deux fonctions de la règle (module : `export function`, copie : `function`) sont retirées avant l'analyse
      src = src.replace(/function _dgVerse(Montant|Coche)\([\s\S]*?\n\}/g, '')
      for (const m of src.matchAll(/([\w$\]\)]+)\s*\.\s*dgVerse\b/g)) {
        const avant = m[1]
        if (avant === 'ev') continue   // événement « DG restitué » de la frise : son montant versé (déjà issu de la règle)
        const ligne = src.slice(0, m.index).split('\n').length
        fautes.push(`${f}:${ligne} ${src.slice(m.index - 20, m.index + 30).replace(/\s+/g, ' ')}`)
      }
    }
    expect(fautes).toEqual([])
  })
})

describe('B4 — formulaire et journal', () => {
  it('le journal du bail signé suit le champ', () => expect(CHAMPS_BAIL.dgVerse).toBeTruthy())
  it('le gabarit porte la case #b-dgVerse', () => expect(HTML).toMatch(/type="checkbox" id="b-dgVerse"/))
  it('ouverture : bail existant via _dgVerseCoche (présumé versé), nouveau bail décoché ; bail archivé relu (🟡2)', () => {
    expect(extraire(P1, 'openBail')).toMatch(/el\('b-dgVerse'\)\.checked = ref \? _dgVerseCoche\(DB\.baux\[ref\]\) : false/)
    expect(extraire(P1, 'openBailHist')).toMatch(/el\('b-dgVerse'\)\.checked = _dgVerseCoche\(b\)/)
  })
  it('enregistrement et état comparable : l\'état RÉEL de la case, jamais un false écrit à l\'aveugle', () => {
    expect(P1).not.toMatch(/dgVerse: el\('b-dgVerse'\) \? el\('b-dgVerse'\)\.checked : false/)
    expect(extraire(P1, 'saveBail')).toMatch(/dgVerse: el\('b-dgVerse'\) \? el\('b-dgVerse'\)\.checked : _dgVerseCoche\(DB\.baux\[ref\]\)/)
    expect(extraire(P1, '_bailEtatFormulaire')).toMatch(/dgVerse: el\('b-dgVerse'\) \? el\('b-dgVerse'\)\.checked : _dgVerseCoche\(/)
  })
})
