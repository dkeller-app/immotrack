/**
 * Règles de classement — décision de Didier du 16/10 : « pour les mouvements une règle n'affecte pas le passé que le
 * futur ». Bout en bout, VRAIES fonctions de l'app (extraites de js/app/app-part*.js) dans un bac à sable, avec les vrais
 * modules js/core/bank-import.js et js/core/regle-application.js derrière `window` :
 *   a) enregistrer une règle (création ou modification) NE MODIFIE AUCUN mouvement déjà enregistré, sauf le mouvement de
 *      départ (geste explicite depuis sa fiche) ;
 *   b) mouvement de départ classé à la main + modification de la règle : confirmation demandée avant de le reclasser ;
 *   c) mouvement sans compte : le mouvement est rattaché au compte choisi (D7), seulement si la règle le couvre.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import * as Bank from '../../js/core/bank-import.js'
import * as RegleApplication from '../../js/core/regle-application.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')
const NOW = '2026-10-16T10:00:00.000Z'
const SRC = read('js/app/app-part1.js') + '\n' + read('js/app/app-part2.js')
function extraire(nom) {
  const m = new RegExp('\\nfunction ' + nom + '\\(').exec(SRC)
  if (!m) throw new Error('fonction absente : ' + nom)
  const fin = SRC.indexOf('\n}\n', m.index + 1)
  return SRC.slice(m.index + 1, fin + 2)
}
const FONCTIONS = ['escHtml', 'fd', '_bankRuleSave', '_bankRuleErreurs', '_bankRuleCandidate', '_bankRuleMontantDepuisSaisieDraft',
  '_bankRuleErrMsgs', '_bankRuleErrMsg', '_bankRuleApplyToSourceMv', '_bankRuleAppliquerAuMv', '_bankRuleRattacherCompte',
  '_bankRuleAfterChange', '_bankImportActif', '_bankLoyerCC', '_bankAutreRegleTxt', '_logLabel',
  '_logFindParRef', '_logNomRepli', '_ccImmeuble', '_bankRuleStatut', '_bankRuleStatutHtml']

function app({ confirme = true } = {}) {
  const window = Object.assign({}, Bank, { RegleApplication })
  const els = {}; const toasts = []; const journal = []; const ouverts = []; const confirms = []
  const code = `
    let DB = { params: { bankAccounts: [] }, importRules: [], mouvements: [], logements: [], entites: [] };
    let _bankRuleDraft = null, _bankImportLines = [], _currentBankAccount = null, _bankMvIdx = -1, _bankWalk = null;
    let _saves = 0;
    function el(id) { return els[id] || null; }
    function showToast(msg, type) { toasts.push({ msg: String(msg), type }); }
    function confirm2(m) { confirms.push(String(m)); return ${confirme ? 'true' : 'false'}; }
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
  const api = new Function('window', 'els', 'toasts', 'journal', 'ouverts', 'confirms', code)(window, els, toasts, journal, ouverts, confirms)
  return { api, els, toasts, journal, ouverts, confirms, call: (f, ...a) => api.get(f)(...a) }
}

const mv = (id, o) => Object.assign({ id, date: '2026-0' + (id % 9 + 1) + '-03', lib: 'VIR M PIERRE MARTIN LOYER', cr: 803.65, db: 0, _bankAccountId: 9001, _source: 'bank_import' }, o)
function scenario(opts) {
  const A = app(opts)
  const DB = A.api.get('DB')
  DB.params.bankAccounts = [{ id: 9001, label: 'Compte SCI', bailleur: 'SCI Démo' }]
  DB.logements = [{ ref: 'D-101', imm: 'Les Tanneurs', entity: 'SCI Démo' }]
  const b = Bank._bankRuleBuild({ mots: ['PIERRE', 'MARTIN'], sens: 'cr', compte: 9001, cat: 'Loyers encaissés', qui: '', imm: 'Les Tanneurs' }, { newId: () => 'rg_1', now: NOW })
  DB.importRules = [b.rule]
  DB.mouvements = [
    mv(1, { cat: 'Loyers encaissés', imm: 'Les Tanneurs', qui: '', _rules: ['rg_1'] }),   // mouvement de départ (fiche)
    mv(2, { cat: '', qui: '', imm: '' }),                                                  // à classer
    mv(3, { cat: 'Loyers encaissés', imm: 'Les Tanneurs', qui: '', _rules: ['rg_1'] }),   // classé par l'ancienne version
    mv(4, { cat: 'Dépôt de garantie (reçu / restitué)', qui: 'D-101', imm: 'Les Tanneurs', _classeMain: true, _rules: ['rg_1'] }), // à la main
    mv(5, { cat: '', lib: 'VIR M PIERRE MARTIN LOYER', _bankAccountId: undefined, _source: undefined }),                         // sans compte
  ]
  // Brouillon : la règle ouverte DEPUIS LA FICHE du mouvement 1 (modification), affectation corrigée sur le logement D-101.
  const m1 = DB.mouvements[0]
  A.api.set('_bankRuleDraft', { id: 'rg_1', chips: ['PIERRE', 'MARTIN'], mots: ['PIERRE', 'MARTIN'], saisis: [], ref: '', sens: 'cr', compte: '9001',
    compteFixe: true, compteOrigine: 'regle', montantUi: { type: 'none', valeur: '', min: '', max: '' }, exceptions: [], exNew: [],
    cat: 'Loyers encaissés', qui: 'D-101', imm: '', cc: '', bdc: false, historique: false,
    src: { date: m1.date, libelle: m1.lib, credit: 803.65, debit: 0, _bankAccountId: 9001 }, srcIndex: -1, srcMvId: 1, mvSansCompte: false })
  return { A, DB }
}

describe('a) une règle n\'affecte que le futur : aucun mouvement existant modifié, sauf le mouvement de départ', () => {
  it('modification depuis la fiche : SEUL le mouvement de départ change ; tous les autres restent identiques, octet pour octet', () => {
    const { A, DB } = scenario()
    const autresAvant = JSON.stringify(DB.mouvements.slice(1))
    A.call('_bankRuleSave')
    expect(DB.mouvements[0]).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs', _modifiedAt: NOW })
    expect(JSON.stringify(DB.mouvements.slice(1))).toBe(autresAvant)
    expect(A.journal.filter(j => j[1] === 'mouvement').map(j => j[2])).toEqual(['1'])
    expect(A.ouverts).toEqual([1])                       // retour à la fiche du mouvement de départ
    expect(A.toasts.at(-1).msg).toContain('la règle s\'applique aux prochains imports ; les autres mouvements déjà enregistrés ne changent pas')
    expect(A.confirms).toEqual([])                       // mouvement non classé à la main : aucune question
  })
  it('création « à froid » (sans mouvement de départ) : aucun mouvement modifié', () => {
    const { A, DB } = scenario()
    A.api.set('_bankRuleDraft', Object.assign({}, A.api.get('_bankRuleDraft'), { id: '', mots: ['MARTIN'], src: null, srcMvId: null }))
    const avant = JSON.stringify(DB.mouvements)
    A.call('_bankRuleSave')
    expect(DB.importRules).toHaveLength(2)
    expect(JSON.stringify(DB.mouvements)).toBe(avant)
    expect(A.journal.filter(j => j[1] === 'mouvement')).toEqual([])
    expect(A.toasts.at(-1).msg).toContain('les mouvements déjà enregistrés ne changent pas')
  })
  it('plus aucune proposition « Appliquer aussi » (code retiré)', () => {
    expect(SRC).not.toMatch(/_bankRuleProposerApplication|_bankRuleApplValider|Appliquer aussi aux mouvements/)
  })
})

describe('b) mouvement de départ classé à la main + règle modifiée : on demande avant de le reclasser', () => {
  it('confirmé → reclassé, marqueur retiré', () => {
    const { A, DB } = scenario({ confirme: true })
    DB.mouvements[0]._classeMain = true
    A.call('_bankRuleSave')
    expect(A.confirms).toHaveLength(1)
    expect(A.confirms[0]).toContain('classé à la main')
    expect(DB.mouvements[0]).toMatchObject({ qui: 'D-101' })
    expect(DB.mouvements[0]._classeMain).toBeUndefined()
  })
  it('la règle modifiée ne changerait rien à ce mouvement : aucune question', () => {
    const { A, DB } = scenario({ confirme: false })
    Object.assign(DB.mouvements[0], { _classeMain: true, qui: 'D-101', imm: 'Les Tanneurs', _rules: ['rg_1'] })
    A.call('_bankRuleSave')
    expect(A.confirms).toEqual([])
  })
  it('création (et non modification) depuis un mouvement classé à la main : appliquée sans question (geste explicite)', () => {
    const { A, DB } = scenario({ confirme: false })
    DB.mouvements[0]._classeMain = true
    A.api.set('_bankRuleDraft', Object.assign({}, A.api.get('_bankRuleDraft'), { id: '', mots: ['MARTIN', 'LOYER'] }))
    A.call('_bankRuleSave')
    expect(A.confirms).toEqual([])
    expect(DB.mouvements[0]).toMatchObject({ qui: 'D-101' })
  })
  it('refusé → laissé tel quel ; la fiche se rouvre quand même', () => {
    const { A, DB } = scenario({ confirme: false })
    DB.mouvements[0]._classeMain = true
    A.call('_bankRuleSave')
    expect(DB.mouvements[0]).toMatchObject({ qui: '', imm: 'Les Tanneurs', _classeMain: true })
    expect(A.toasts.at(-1).msg).toContain('classé à la main, n\'a pas été modifié')
    expect(A.ouverts).toEqual([1])
  })
})

describe('c) mouvement sans compte (D7)', () => {
  it('la fiche propose « Créer une règle » (le compte sera demandé)', () => {
    const { A } = scenario()
    const h = A.call('_bankRuleStatutHtml', 'mv', 5)
    expect(h).toContain('Créer une règle depuis ce mouvement')
    expect(h).toContain('(le compte sera demandé)')
  })
  it('la règle créée depuis lui le rattache au compte choisi, puis le classe ; les autres mouvements ne changent pas', () => {
    const { A, DB } = scenario()
    const m5 = DB.mouvements[4]
    const autresAvant = JSON.stringify(DB.mouvements.slice(0, 4))
    A.api.set('_bankRuleDraft', { id: '', chips: ['VIR', 'M', 'PIERRE', 'MARTIN', 'LOYER'], mots: ['MARTIN', 'LOYER'], saisis: [], ref: '', sens: 'cr', compte: '9001',
      compteFixe: false, compteOrigine: 'aucun', montantUi: { type: 'none', valeur: '', min: '', max: '' }, exceptions: [], exNew: [],
      cat: 'Loyers encaissés', qui: 'D-101', imm: '', cc: '', bdc: false, historique: false,
      src: { date: m5.date, libelle: m5.lib, credit: 803.65, debit: 0 }, srcIndex: -1, srcMvId: 5, mvSansCompte: true })
    A.call('_bankRuleSave')
    expect(m5._bankAccountId).toBe(9001)
    expect(m5).toMatchObject({ cat: 'Loyers encaissés', qui: 'D-101', imm: 'Les Tanneurs' })
    expect(A.journal.some(j => j[2] === '5' && /rattaché au compte/.test(j[3]))).toBe(true)
    expect(JSON.stringify(DB.mouvements.slice(0, 4))).toBe(autresAvant)
  })
  it('pas rattaché si la règle ne le couvre pas', () => {
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
  it('jamais de rattachement d\'un mouvement qui a déjà un compte', () => {
    const { A, DB } = scenario()
    expect(A.call('_bankRuleRattacherCompte', 1, 7777)).toBe(false)
    expect(DB.mouvements[0]._bankAccountId).toBe(9001)
  })
})

describe('textes : la règle s\'applique aux prochains imports', () => {
  it('« Mes règles » et l\'aperçu le disent, au ton neutre', () => {
    expect(SRC).toContain('Classées par compte. Une règle s\\\'applique aux prochains imports ; elle ne touche pas aux mouvements déjà enregistrés.')
    expect(SRC).toContain('la règle ne les modifie pas, elle s\\\'applique aux prochains imports')
  })
})
