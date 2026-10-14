// RETOURS-2026-10-05 lot A (A1–A6) : on exécute le VRAI code de js/app/app-part{1,2}.js (fonctions extraites
// par nom, évaluées dans un vm avec un DB simulé), pas une réplique. Les miroirs purs de js/core/diagnostics.js
// sont testés avec leurs propres cas.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { etatSignatureBail } from '../../js/core/bail-signature-etat.js'
import {
  _diagDateExpiration, _ddtControleSaveBail as ctrlCore, _ddtDateBailEnPlace as dateCore, _diagExpireARefaire as aRefaireCore
} from '../../js/core/diagnostics.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')

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
function monde(DB, extra = {}) {
  const sandbox = { DB, Date, String, Object, Array, Number, RegExp, ...extra }
  vm.createContext(sandbox)
  return (src, ...noms) => { vm.runInContext(noms.map(n => extraire(src, n)).join('\n'), sandbox); return sandbox }
}

describe('A1 — _ddtControleSaveBail (interblocage DDT ↔ validation financière)', () => {
  const sb = monde({})(P1, '_ddtControleSaveBail')
  const f = sb._ddtControleSaveBail
  for (const [nom, fn] of [['inline', f], ['core', ctrlCore]]) {
    it(`${nom} : création → contrôle`, () => expect(fn({ bailExistant: null, pendingVal: null, today: '2026-10-05' })).toBe(true))
    it(`${nom} : validation financière déjà franchie → pas de 2ᵉ contrôle`, () =>
      expect(fn({ bailExistant: { debut: '2027-01-01' }, pendingVal: { dateEffet: '2026-10-01', motif: 'x' }, today: '2026-10-05' })).toBe(false))
    it(`${nom} : bail signé → pas de contrôle`, () =>
      expect(fn({ bailExistant: { debut: '2027-01-01', signatures: { signedAt: '2026-09-01T10:00:00Z' } }, today: '2026-10-05' })).toBe(false))
    it(`${nom} : bail commencé → pas de contrôle`, () =>
      expect(fn({ bailExistant: { debut: '2026-09-01' }, today: '2026-10-05' })).toBe(false))
    it(`${nom} : brouillon pas encore commencé → contrôle conservé`, () =>
      expect(fn({ bailExistant: { debut: '2026-12-01' }, today: '2026-10-05' })).toBe(true))
    it(`${nom} : bail tombstone → traité comme création`, () =>
      expect(fn({ bailExistant: { _deleted: true, debut: '2026-01-01' }, today: '2026-10-05' })).toBe(true))
  }
})

describe('A2/A3 — _pilStatutDoc (vrai code)', () => {
  const log = { ref: 'F-101', id: 7 }
  const BSE = { etatSignatureBail: (...a) => etatSignatureBail(...a) }
  // Le vrai _pilStatutDoc, avec ses vrais voisins (_edlSens, _edlEntreeDuBail, _bailSuivantDebut) et le vrai module d'état.
  const stat = (DB, bail, type) => {
    const sb = { DB, Date, String, Object, Array, Number, RegExp, _ddtComplet: () => ({ complet: true }), window: { BailSignatureEtat: BSE } }
    vm.createContext(sb)
    vm.runInContext(extraire(P1, '_bailSuivantDebut') + '\n' + ['_edlSens', '_edlEntreeDuBail', '_pilStatutDoc'].map(n => extraire(P2, n)).join('\n'), sb)
    return sb._pilStatutDoc(bail, log, type)
  }
  it('A2 : bail avec signatures.signedAt (électronique) → ok', () =>
    expect(stat({}, { debut: '2026-01-01', signatures: { signedAt: '2026-01-01T09:00:00Z', mode: 'avec-locataire' } }, 'bail').statut).toBe('ok'))
  it('A2 : ancien bail signé sans mode → ok', () =>
    expect(stat({}, { debut: '2026-01-01', signatures: { signedAt: '2026-01-01T09:00:00Z' } }, 'bail').statut).toBe('ok'))
  it('A2 : bail non signé → partial « Non signé »', () =>
    expect(stat({}, { debut: '2026-01-01' }, 'bail').label).toBe('Non signé'))
  it('constat 0.3 : bailleur seul (locataire pas encore signé) → « Signature en cours », jamais OK', () => {
    const r = stat({}, { debut: '2026-01-01', signatures: { signedAt: '2026-01-01T09:00:00Z', mode: 'bailleur-seul' } }, 'bail')
    expect(r.statut).toBe('partial')
    expect(r.label).toBe('Signature en cours')
  })
  it('bail signé hors Propryo → ok, bail repris compris', () => {
    const ext = (extra) => ({ debut: '2019-05-01', ...extra, signatures: { signedAt: '2019-04-20T12:00:00.000Z', mode: 'externe', externe: { date: '2019-04-20' } } })
    expect(stat({}, ext(), 'bail').statut).toBe('ok')
    expect(stat({}, ext({ typeContrat: 'repris' }), 'bail').statut).toBe('ok')
  })
  it('A3 : EDL réellement écrit par l\'app (type « Entrée » avec majuscule et accent) → ok', () => {
    const r = (type) => stat({ edl: [{ logement: 'F-101', type, date: '2026-01-02' }], documents: [] }, { debut: '2026-01-01' }, 'edl').statut
    expect(r('Entrée')).toBe('ok')            // la valeur que saveEDL écrit : c'était le bug (0.1)
    expect(r('entree')).toBe('ok')
    expect(r(undefined)).toBe('ok')           // ancien EDL sans type = entrée
    expect(r('Sortie')).toBe('absent')        // un EDL de sortie ne vaut pas EDL d'entrée
  })
  it('A3 : _edlSens normalise casse et accents', () => {
    const f = monde({})(P2, '_edlSens')._edlSens
    expect([f({ type: 'Entrée' }), f({ type: 'ENTRÉE' }), f({ type: 'Sortie' }), f({ type: 'sortie' }), f({}), f(null)]).toEqual(['entree', 'entree', 'sortie', 'sortie', 'entree', 'entree'])
  })
  it('A3 : aucun EDL → absent', () =>
    expect(stat({ edl: [], documents: [] }, { debut: '2026-01-01' }, 'edl').statut).toBe('absent'))
  it('l\'EDL d\'entrée du locataire PRÉCÉDENT ne compte pas (avant le début du bail − 31 j)', () => {
    const bail = { debut: '2026-01-01' }
    expect(stat({ edl: [{ logement: 'F-101', type: 'Entrée', date: '2022-03-01' }] }, bail, 'edl').statut).toBe('absent')
    expect(stat({ edl: [{ logement: 'F-101', type: 'Entrée', date: '2025-12-15' }] }, bail, 'edl').statut).toBe('ok')   // dans les 31 j
    expect(stat({ edl: [{ logement: 'F-101', type: 'Entrée', date: '2025-11-29' }] }, bail, 'edl').statut).toBe('absent')   // 33 j avant
    expect(stat({ edl: [{ logement: 'F-101', type: 'Entrée' }] }, bail, 'edl').statut).toBe('ok')   // sans date : candidat
  })
  it('un EDL d\'entrée du bail SUIVANT (relocation) ne compte pas pour le bail courant archivé', () => {
    const DB = { edl: [{ logement: 'F-101', type: 'Entrée', date: '2027-02-01' }], baux: {}, baux_historique: [{ ref: 'F-101', debut: '2027-02-01' }] }
    expect(stat(DB, { ref: 'F-101', debut: '2026-01-01' }, 'edl').statut).toBe('absent')
  })
  it('EDL supprimé, d\'un autre logement → absent', () => {
    expect(stat({ edl: [{ logement: 'F-101', type: 'Entrée', date: '2026-01-02', _deleted: true }] }, { debut: '2026-01-01' }, 'edl').statut).toBe('absent')
    expect(stat({ edl: [{ logement: 'F-202', type: 'Entrée', date: '2026-01-02' }] }, { debut: '2026-01-01' }, 'edl').statut).toBe('absent')
  })
  it('plus de repli par nom de fichier : un PDF « EDL » dans les documents ne vaut plus EDL', () => {
    const doc = { parentType: 'logement', parentId: 7, originalName: 'EDL entrée 101.pdf' }
    expect(stat({ edl: [], documents: [doc] }, { debut: 'x' }, 'edl').statut).toBe('absent')
    expect(P2).not.toMatch(/\\bedl\\b\|etat\\s\*des\\s\*lieux/)
  })
})

describe('A4 — _logDiagScanText (vrai code)', () => {
  const scan = monde({})(P2, '_logDiagScanText')._logDiagScanText
  it('un DPE qui cite « amiante » et « risque d\'exposition » ne couvre que le DPE', () => {
    const t = 'Diagnostic de performance énergétique (DPE) N° 2491E0123456Q. Les logements construits avant 1997 peuvent contenir de l\'amiante. Risque d\'exposition aux polluants.'
    const r = scan(t)
    expect(r.numeroDpe).toBe('2491E0123456Q')
    expect(r.coverage.dpe).toBe(true)
    expect(r.coverage.amiante).toBe(false)
    expect(r.coverage.crep).toBe(false)
  })
  it('« amiante » nu ou « risque d\'exposition » seul ne déclenchent plus rien', () => {
    expect(scan('Ce bâtiment peut contenir de l\'amiante.').coverage.amiante).toBe(false)
    expect(scan('Risque d\'exposition au bruit').coverage.crep).toBe(false)
  })
  it('vrai constat plomb et repérage amiante restent détectés', () => {
    expect(scan('Constat de risque d\'exposition au plomb (CREP)').coverage.crep).toBe(true)
    expect(scan('Rapport de repérage des matériaux contenant de l\'amiante').coverage.amiante).toBe(true)
    expect(scan('Dossier amiante – parties privatives (DAPP)').coverage.amiante).toBe(true)
  })
})

describe('A5 — CREP avec plomb : 6 ans en location', () => {
  it('core : 6 ans si présence, illimité sinon', () => {
    expect(_diagDateExpiration('crep', { date: '2024-03-01', presence: true })).toBe('2030-03-01')
    expect(_diagDateExpiration('crep', { date: '2024-03-01', presence: false })).toBeNull()
  })
  it('inline : _DIAGS_CATALOG_INLINE.crep.validityIfPresence = 6 et _diagDateExpiration', () => {
    expect(P2).toMatch(/key:'crep',[^\n]*validityIfPresence:6/)
    const sb = monde({}, { _diagCatalogEntry: () => ({ key: 'crep', validityYears: null, validityIfPresence: 6 }) })(P2, '_diagAddYM', '_diagDateExpiration')
    expect(sb._diagDateExpiration('crep', { date: '2024-03-01', presence: true })).toBe('2030-03-01')
    expect(sb._diagDateExpiration('crep', { date: '2024-03-01', presence: false })).toBeNull()
  })
})

describe('A6 — diagnostics jugés à la conclusion du bail en place', () => {
  const log = { ref: 'F-101' }
  // faux _diagStatut : périmé si la date de jugement dépasse 2025-12-31
  const statut = (_k, _l, d) => (d.getTime() > new Date('2025-12-31T23:59:59').getTime() ? 'expire' : 'valide')
  const run = (bail) => monde({ baux: { 'F-101': bail } }, { _diagStatut: statut })(P2, '_ddtDateBailEnPlace', '_diagExpireARefaire')
  const AUJ = new Date('2026-10-05T12:00:00')

  it('date de conclusion : signature, sinon début, null si clôturé/absent', () => {
    expect(run({ debut: '2025-06-01', signatures: { signedAt: '2025-05-20T08:00:00Z' } })._ddtDateBailEnPlace(log)).toBe('2025-05-20')
    expect(run({ debut: '2025-06-01' })._ddtDateBailEnPlace(log)).toBe('2025-06-01')
    expect(run({ debut: '2025-06-01', cloture: true })._ddtDateBailEnPlace(log)).toBeNull()
    expect(run(undefined)._ddtDateBailEnPlace(log)).toBeNull()
  })
  it('locataire en place depuis 2025, diag périmé aujourd\'hui → PAS à refaire', () =>
    expect(run({ debut: '2025-06-01' })._diagExpireARefaire('erp', log, AUJ)).toBe(false))
  it('bail conclu en 2026 avec un diag déjà périmé à cette date → à refaire', () =>
    expect(run({ debut: '2026-02-01' })._diagExpireARefaire('erp', log, AUJ)).toBe(true))
  it('sans bail en place (vacant / relocation) → jugé à la date du jour', () =>
    expect(run(undefined)._diagExpireARefaire('erp', log, AUJ)).toBe(true))
  it('miroir core cohérent', () => {
    const logC = { anneeConstruction: 2010, periodeConstr: 'Après 1997', zoneRisques: true, diagnostics: { erp: { date: '2025-01-10' } } }
    expect(dateCore({ debut: '2025-02-01' })).toBe('2025-02-01')
    expect(aRefaireCore('erp', logC, { debut: '2025-02-01' }, AUJ)).toBe(false)  // ERP valable à la conclusion
    expect(aRefaireCore('erp', logC, null, AUJ)).toBe(true)                      // vacant : périmé aujourd'hui (6 mois)
  })
})
