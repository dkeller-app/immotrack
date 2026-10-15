/**
 * RETOURS 15/10 (lot 2, point 5) — bout en bout, VRAIES fonctions de l'app (extraites de js/app/app-part*.js) dans un
 * bac à sable, avec les vrais modules js/core/bank-import.js et js/core/regle-application.js derrière `window` :
 *   a) modifier une règle depuis la fiche d'un mouvement met ce mouvement à jour ;
 *   b) après l'enregistrement : proposition « Appliquer aussi aux N mouvements » (trois groupes), rien sans confirmation,
 *      cases décochées = mouvement inchangé (D8), application par le même chemin que le mouvement de départ, une seule
 *      opération annulable (_undoOp + saveDB), journal ;
 *   c) mouvement sans compte : la règle se crée, le mouvement est rattaché au compte choisi (D7).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import * as Bank from '../../js/core/bank-import.js'
import * as RegleApplication from '../../js/core/regle-application.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')
const NOW = '2026-10-15T10:00:00.000Z'
const SRC = read('js/app/app-part1.js') + '\n' + read('js/app/app-part2.js')
function extraire(nom) {
  const m = new RegExp('\\nfunction ' + nom + '\\(').exec(SRC)
  if (!m) throw new Error('fonction absente : ' + nom)
  const fin = SRC.indexOf('\n}\n', m.index + 1)
  return SRC.slice(m.index + 1, fin + 2)
}
const FONCTIONS = ['escHtml', 'fd', '_bankRuleSave', '_bankRuleErreurs', '_bankRuleCandidate', '_bankRuleMontantDepuisSaisieDraft',
  '_bankRuleErrMsgs', '_bankRuleErrMsg', '_bankRuleApplyToSourceMv', '_bankRuleAppliquerAuMv', '_bankRuleRattacherCompte',
  '_bankRuleProposerApplication', '_bankRuleApplRender', '_bankRuleApplCase', '_bankRuleApplTout', '_bankRuleApplFermer',
  '_bankRuleApplValider', '_bankRuleApplPiedHtml', '_bankRuleApplMajPied', '_bankRuleAfterChange', '_bankImportActif', '_bankLoyerCC', '_bankAutreRegleTxt', '_logLabel',
  '_logFindParRef', '_logNomRepli', '_ccImmeuble', '_bankRuleStatut', '_bankRuleStatutHtml']

function app() {
  const window = Object.assign({}, Bank, { RegleApplication })
  const els = {}; const toasts = []; const journal = []; const undo = []; const ouverts = []
  const code = `
    let DB = { params: { bankAccounts: [] }, importRules: [], mouvements: [], logements: [], entites: [] };
    let _bankRuleDraft = null, _bankImportLines = [], _currentBankAccount = null, _bankMvIdx = -1, _bankWalk = null, _bankRuleAppl = null;
    let _saves = 0;
    function el(id) { return els[id] || null; }
    function showToast(msg, type) { toasts.push({ msg: String(msg), type }); }
    function _undoToast(msg, type) { toasts.push({ msg: String(msg), type, annuler: true }); }
    function _undoOp(label, fn) { undo.push(label); fn(); }
    function fmt(n) { return (Number(n) || 0).toFixed(2) + ' €'; }
    function _uiIcon() { return ''; }
    function _stamp(x) { if (x && typeof x === 'object') x._modifiedAt = '${NOW}'; }
    function saveDB() { _saves++; }
    function closeM() {}
    function _auditLog(a, t, id, ref) { journal.push([a, t, String(id), String(ref)]); }
    function openEditMv(id) { ouverts.push(id); }
    function _refreshAfterMutation() {}
    function rMv() {}
    ${FONCTIONS.map(extraire).join('\n')}
    return { get: n => eval(n), set: (n, v) => eval(n + ' = v') };`
  // eslint-disable-next-line no-new-func
  const api = new Function('window', 'els', 'toasts', 'journal', 'undo', 'ouverts', code)(window, els, toasts, journal, undo, ouverts)
  // Couche « Appliquer aussi » : éléments factices (le rendu écrit dans innerHTML).
  const fake = () => ({ innerHTML: '', textContent: '', classList: { remove() {}, add() {} } })
  els['ov-bank-rule-appl'] = fake(); els['brg-appl-t'] = fake(); els['brg-appl-b'] = fake(); els['brg-appl-f'] = fake()
  return { api, els, toasts, journal, undo, ouverts, call: (f, ...a) => api.get(f)(...a) }
}

const mv = (id, o) => Object.assign({ id, date: '2026-0' + (id % 9 + 1) + '-03', lib: 'VIR M PIERRE MARTIN LOYER', cr: 803.65, db: 0, _bankAccountId: 9001, _source: 'bank_import' }, o)
function scenario() {
  const A = app()
  const DB = A.api.get('DB')
  DB.params.bankAccounts = [{ id: 9001, label: 'Compte SCI', bailleur: 'SCI Démo' }]
  DB.logements = [{ ref: 'D-101', imm: 'Les Tanneurs', entity: 'SCI Démo' }]
  const b = Bank._bankRuleBuild({ mots: ['PIERRE', 'MARTIN'], sens: 'cr', compte: 9001, cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs' }, { newId: () => 'rg_1', now: NOW })
  DB.importRules = [b.rule]
  DB.mouvements = [
    mv(1, { cat: 'Loyers encaissés', imm: 'Les Tanneurs', qui: '', _rules: ['rg_1'] }),   // mouvement de départ (fiche)
    mv(2, { cat: '', qui: '', imm: '' }),                                                  // à classer
    mv(3, { cat: 'Loyers encaissés', imm: 'Les Tanneurs', qui: '', _rules: ['rg_1'] }),   // ancienne version de la règle
    mv(4, { cat: 'Dépôt de garantie (reçu / restitué)', qui: 'D-101', imm: 'Les Tanneurs', _classeMain: true, _rules: ['rg_1'] }), // à la main
    mv(5, { cat: '', lib: 'VIR M PIERRE MARTIN LOYER', _bankAccountId: undefined, _source: undefined }),                         // sans compte
  ]
  // Brouillon : la règle ouverte DEPUIS LA FICHE du mouvement 1 (édition), affectation corrigée sur le logement D-101.
  const m1 = DB.mouvements[0]
  A.api.set('_bankRuleDraft', { id: 'rg_1', chips: ['PIERRE', 'MARTIN'], mots: ['PIERRE', 'MARTIN'], saisis: [], ref: '', sens: 'cr', compte: '9001',
    compteFixe: true, compteOrigine: 'regle', montantUi: { type: 'none', valeur: '', min: '', max: '' }, exceptions: [], exNew: [],
    cat: 'Loyers encaissés', qui: 'D-101', imm: '', cc: '', bdc: false, historique: false,
    src: { date: m1.date, libelle: m1.lib, credit: 803.65, debit: 0, _bankAccountId: 9001 }, srcIndex: -1, srcMvId: 1, mvSansCompte: false })
  return { A, DB }
}

describe('a) modifier une règle depuis la fiche d\'un mouvement met CE mouvement à jour', () => {
  it('le mouvement de départ suit la règle modifiée, perd le marqueur « à la main », est journalisé', () => {
    const { A, DB } = scenario()
    A.call('_bankRuleSave')
    expect(DB.mouvements[0]).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', _modifiedAt: NOW })
    expect(A.journal.some(j => j[1] === 'mouvement' && j[2] === '1')).toBe(true)
  })
  it('la fiche se rouvre APRÈS la proposition (fermée sans rien changer)', () => {
    const { A } = scenario()
    A.call('_bankRuleSave')
    expect(A.ouverts).toEqual([])                       // la proposition est à l'écran
    A.call('_bankRuleApplFermer')
    expect(A.ouverts).toEqual([1])
  })
})

describe('b) « Appliquer aussi aux mouvements déjà enregistrés ? » — sur confirmation, jamais en silence', () => {
  it('proposition affichée avec les trois groupes ; rien n\'est reclassé avant la confirmation', () => {
    const { A, DB } = scenario()
    A.call('_bankRuleSave')
    const st = A.api.get('_bankRuleAppl')
    expect(st.groupes.aClasser.map(x => x.id)).toEqual([2])
    expect(st.groupes.parRegle.map(x => x.id)).toEqual([3])
    expect(st.groupes.autrement.map(x => x.id)).toEqual([4])
    expect([...st.coches].sort()).toEqual(['2', '3'])     // le mouvement classé à la main n'est PAS coché
    expect(DB.mouvements[1].cat).toBe('')
    expect(DB.mouvements[2].qui).toBe('')
    const html = A.els['brg-appl-b'].innerHTML
    expect(html).toContain('Appliquer aussi aux mouvements déjà enregistrés ?')
    expect(html).toContain('classé à la main')
    expect(A.els['brg-appl-f'].innerHTML).toContain('Reclasser 2 mouvements')
  })
  it('« Ne rien changer » : aucun mouvement modifié', () => {
    const { A, DB } = scenario()
    A.call('_bankRuleSave')
    const avant = JSON.stringify(DB.mouvements.slice(1))
    A.call('_bankRuleApplFermer')
    expect(JSON.stringify(DB.mouvements.slice(1))).toBe(avant)
  })
  it('« Reclasser » : seulement les cochés, une opération annulable, un enregistrement, journal ; décoché = inchangé, sans exception (D8)', () => {
    const { A, DB } = scenario()
    A.call('_bankRuleSave')
    A.call('_bankRuleApplCase', '3', false)          // décoche « ancienne version »
    A.call('_bankRuleApplCase', '4', true)           // coche volontairement le mouvement classé à la main
    const saves = A.api.get('_saves')
    A.call('_bankRuleApplValider')
    expect(DB.mouvements[1]).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs' })
    expect(DB.mouvements[3]).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101' })
    expect(DB.mouvements[3]._classeMain).toBeUndefined()
    expect(DB.mouvements[2]).toMatchObject({ cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs' })   // décoché : inchangé
    expect(DB.importRules[0].exceptions || []).toEqual([])                                            // pas d'exception créée
    expect(A.api.get('_saves')).toBe(saves + 1)
    expect(A.undo).toEqual(['Règle « PIERRE MARTIN » appliquée aux mouvements enregistrés'])
    expect(A.toasts.at(-1)).toMatchObject({ annuler: true })
    expect(A.toasts.at(-1).msg).toContain('2 mouvements reclassés')
    expect(A.journal.filter(j => j[1] === 'mouvement').map(j => j[2]).sort()).toEqual(['1', '2', '4'])
    expect(A.ouverts).toEqual([1])                   // retour à la fiche du mouvement de départ
  })
  it('« Tout décocher » / « Tout cocher » par groupe', () => {
    const { A } = scenario()
    A.call('_bankRuleSave')
    A.call('_bankRuleApplTout', 'aClasser')
    expect(A.api.get('_bankRuleAppl').coches.has('2')).toBe(false)
    A.call('_bankRuleApplTout', 'aClasser')
    expect(A.api.get('_bankRuleAppl').coches.has('2')).toBe(true)
  })
  it('aucun mouvement concerné : pas de proposition, la fiche se rouvre directement', () => {
    const { A, DB } = scenario()
    DB.mouvements = DB.mouvements.slice(0, 1)
    A.call('_bankRuleSave')
    expect(A.api.get('_bankRuleAppl')).toBeNull()
    expect(A.ouverts).toEqual([1])
  })
  it('les libellés d\'un mouvement sont échappés dans la liste', () => {
    const { A, DB } = scenario()
    DB.mouvements[1].lib = 'VIR M PIERRE MARTIN LOYER <img src=x onerror=alert(1)>'
    A.call('_bankRuleSave')
    expect(A.els['brg-appl-b'].innerHTML).not.toContain('<img')
    expect(A.els['brg-appl-b'].innerHTML).toContain('&lt;img')
  })
})

describe('c) mouvement sans compte (D7)', () => {
  it('la fiche propose « Créer une règle » (le compte sera demandé)', () => {
    const { A } = scenario()
    const h = A.call('_bankRuleStatutHtml', 'mv', 5)
    expect(h).toContain('Créer une règle depuis ce mouvement')
    expect(h).toContain('(le compte sera demandé)')
  })
  it('la règle créée depuis lui le rattache au compte choisi, puis le classe', () => {
    const { A, DB } = scenario()
    const m5 = DB.mouvements[4]
    A.api.set('_bankRuleDraft', { id: '', chips: ['VIR', 'M', 'PIERRE', 'MARTIN', 'LOYER'], mots: ['MARTIN', 'LOYER'], saisis: [], ref: '', sens: 'cr', compte: '9001',
      compteFixe: false, compteOrigine: 'aucun', montantUi: { type: 'none', valeur: '', min: '', max: '' }, exceptions: [], exNew: [],
      cat: 'Loyers encaissés', qui: 'D-101', imm: '', cc: '', bdc: false, historique: false,
      src: { date: m5.date, libelle: m5.lib, credit: 803.65, debit: 0 }, srcIndex: -1, srcMvId: 5, mvSansCompte: true })
    A.call('_bankRuleSave')
    expect(m5._bankAccountId).toBe(9001)
    expect(m5).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs' })
    expect(A.journal.some(j => j[2] === '5' && /rattaché au compte/.test(j[3]))).toBe(true)
  })
  it('jamais de rattachement d\'un mouvement qui a déjà un compte', () => {
    const { A, DB } = scenario()
    expect(A.call('_bankRuleRattacherCompte', 1, 7777)).toBe(false)
    expect(DB.mouvements[0]._bankAccountId).toBe(9001)
  })
})

describe('relectures (Fable A3 / A4 / A5)', () => {
  it('A3 — modification depuis la fiche d\'un mouvement CLASSÉ À LA MAIN : pas appliqué directement, proposé décoché', () => {
    const { A, DB } = scenario()
    DB.mouvements[0]._classeMain = true
    A.call('_bankRuleSave')
    expect(DB.mouvements[0]).toMatchObject({ qui: '', imm: 'Les Tanneurs', _classeMain: true })
    const st = A.api.get('_bankRuleAppl')
    const x = st.groupes.autrement.find(e => e.id === 1)
    expect(x && x.raison).toBe('main')
    expect(st.coches.has('1')).toBe(false)
    expect(A.toasts.some(t => /classé à la main, n'a pas été modifié/.test(t.msg))).toBe(true)
    A.call('_bankRuleApplFermer')
    expect(A.ouverts).toEqual([1])
  })
  it('A4 — mouvement sans compte : pas rattaché si la règle ne le couvre pas', () => {
    const { A, DB } = scenario()
    const m5 = DB.mouvements[4]
    A.api.set('_bankRuleDraft', { id: '', chips: ['VIR'], mots: ['DURAND'], saisis: [], ref: '', sens: 'cr', compte: '9001',
      compteFixe: false, compteOrigine: 'aucun', montantUi: { type: 'none', valeur: '', min: '', max: '' }, exceptions: [], exNew: [],
      cat: 'Loyers encaissés', qui: 'D-101', imm: '', cc: '', bdc: false, historique: false,
      src: { date: m5.date, libelle: m5.lib, credit: 803.65, debit: 0 }, srcIndex: -1, srcMvId: 5, mvSansCompte: true })
    A.call('_bankRuleSave')
    expect(m5._bankAccountId).toBeUndefined()
    expect(m5.cat).toBe('')
  })
  it('A5 — le journal « appliquée à N mouvements » est écrit dans l\'opération annulable (avant son enregistrement)', () => {
    const { A } = scenario()
    A.call('_bankRuleSave')
    const n = A.journal.length
    A.call('_bankRuleApplValider')
    const ajout = A.journal.slice(n)
    expect(ajout.at(-1)).toEqual(['update', 'import-rule', 'rg_1', 'appliquée à 2 mouvements déjà enregistrés (sur confirmation)'])
  })
})
