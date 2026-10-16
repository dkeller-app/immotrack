// MATRICE-ACCUEIL (16/10) — l'Agenda reprend le rappel « bientôt dû » de l'assurance habitation retiré de l'Accueil :
// « Demander l'attestation d'assurance » à l'échéance de l'attestation COURANTE (AlertRules.attestationCourante), rappel
// 30 jours avant, locataire présent seulement ; une nouvelle attestation déplace l'événement ; aucun doublon.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as AlertRules from './alert-rules.js'
import { extraireFonction } from './_extraction-source.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')

function monde(DB, { loue = true, irl = null } = {}) {
  let n = 0
  const reel = {
    DB, window: { AlertRules }, Date, String, Object, Array, Number, Set, Map, JSON, Math, RegExp,
    _lotEstLoue: () => loue, computeIRLRevision: irl ? (() => ({ dateRevision: new Date(irl + 'T00:00:00') })) : null, _bailEcheanceEffective: () => null, _bailPreavisInfo: () => null,
    agendaId: () => 'ev' + (++n), saveDB: () => {}, fd: (s) => String(s).split('-').reverse().join('/'), fmt: String,
    _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), _stamp: () => {},
  }
  const proxy = new Proxy(reel, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]), set: (t, k, v) => { t[k] = v; return true } })
  const code = '(function(__p){ with(__p){ ' + extraireFonction(P1, 'agendaAutoSync') + '\nreturn agendaAutoSync; } })'
  return vm.runInContext(code, vm.createContext({}))(proxy)
}
const base = () => ({
  logements: [{ ref: 'A', imm: 'Tilleuls', locataire: 'Mme Durand', debut: '2025-01-01' }],
  baux: { A: { ref: 'A', debut: '2025-01-01', ch: 0, entity: 'SCI' } },
  mrh: [{ id: 1735700000000, logement: 'A', echeance: '2027-03-31' }],
  agenda: [],
})
const mrhEv = (DB) => DB.agenda.filter(e => e.cat === 'MRH')

describe('Agenda — rappel d’attestation d’assurance habitation', () => {
  it('crée « Demander l’attestation d’assurance » à l’échéance, sans rappel anticipé (Didier 16/10)', () => {
    const DB = base(); monde(DB)()
    expect(mrhEv(DB)).toHaveLength(1)
    expect(mrhEv(DB)[0]).toMatchObject({ titre: 'Demander l’attestation d’assurance — A', date: '2027-03-31', rappels: [], auto: true, autoKey: 'MRH:A:2027-03-31', logement: 'A' })
  })
  it('idempotent : une deuxième synchronisation ne crée aucun doublon', () => {
    const DB = base(); const sync = monde(DB); sync(); sync()
    expect(mrhEv(DB)).toHaveLength(1)
  })
  it('une nouvelle attestation déplace l’événement (l’ancien est retiré)', () => {
    const DB = base(); const sync = monde(DB); sync()
    DB.mrh.push({ id: 1767200000000, logement: 'A', echeance: '2028-03-31' }); sync()
    expect(mrhEv(DB).map(e => e.date)).toEqual(['2028-03-31'])
  })
  it('une nouvelle attestation sans échéance retire l’événement', () => {
    const DB = base(); const sync = monde(DB); sync()
    DB.mrh.push({ id: 1767200000000, logement: 'A', echeance: '' }); sync()
    expect(mrhEv(DB)).toHaveLength(0)
  })
  it('aucun événement sans locataire présent (lot vide, bail pas encore commencé) ni pour l’attestation du locataire précédent', () => {
    const vide = base(); monde(vide, { loue: false })()
    expect(mrhEv(vide)).toHaveLength(0)
    const futur = base(); futur.baux.A.debut = '2099-01-01'; monde(futur)()
    expect(mrhEv(futur)).toHaveLength(0)
    const prec = base(); prec.mrh = [{ logement: 'A', echeance: '2024-12-31' }]; monde(prec)()
    expect(mrhEv(prec)).toHaveLength(0)
  })
})

// Relecture finale (16/10) : un rappel automatique modifié à la main ou supprimé n'est jamais recréé en double.
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
function formulaire(DB, editId, champs) {
  const v = { 'agenda-evt-titre': 'Assurance à demander', 'agenda-evt-rec-type': 'none', 'agenda-evt-date': '2027-04-15', 'agenda-evt-datefin': '', 'agenda-evt-log': 'A',
    'agenda-evt-cat': 'MRH', 'agenda-evt-notes': '', 'agenda-evt-rec-int': '1', 'agenda-evt-rec-fin': '', 'agenda-evt-rappels': '30', ...champs }
  const reel = { DB, _agendaEditId: editId, el: (id) => ({ value: v[id] != null ? v[id] : '', checked: false }), _isAlive: (x) => !!x && !x._deleted,
    _stamp: () => {}, _preserverChampsExistants: () => {}, saveDB: () => {}, closeM: () => {}, rAgenda: () => {}, showToast: () => {}, agendaId: () => 'manuel',
    confirm: () => true, parseInt, Date, String, Object, Array, Number, isNaN }
  const proxy = new Proxy(reel, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]), set: (t, k, val) => { t[k] = val; return true } })
  const code = '(function(__p){ with(__p){ ' + extraireFonction(P2, 'saveAgendaEvt') + '\n' + extraireFonction(P2, 'deleteAgendaEvt') + '\nreturn { saveAgendaEvt, deleteAgendaEvt }; } })'
  return vm.runInContext(code, vm.createContext({}))(proxy)
}
describe('Agenda — rappel automatique modifié à la main ou supprimé', () => {
  it('modifié dans le formulaire : garde sa clé (auto:false), la synchronisation suivante ne crée pas de doublon', () => {
    const DB = base(); const sync = monde(DB); sync()
    const ev = mrhEv(DB)[0]
    formulaire(DB, ev.id).saveAgendaEvt()
    const apres = mrhEv(DB)
    expect(apres).toHaveLength(1)
    expect(apres[0]).toMatchObject({ auto: false, autoKey: 'MRH:A:2027-03-31', date: '2027-04-15' })
    sync(); sync()
    expect(mrhEv(DB)).toHaveLength(1)
    expect(mrhEv(DB)[0].date).toBe('2027-04-15')   // la date choisie à la main reste
  })
  it('supprimé : pas recréé ; une nouvelle échéance (nouvelle attestation) recrée bien un rappel', () => {
    const DB = base(); DB.params = {}; const sync = monde(DB); sync()
    formulaire(DB, null).deleteAgendaEvt({ stopPropagation() {} }, mrhEv(DB)[0].id)
    expect(DB.params.agendaAutoEcartes).toEqual(['MRH:A:2027-03-31'])
    sync()
    expect(mrhEv(DB)).toHaveLength(0)
    DB.mrh.push({ id: 1767200000000, logement: 'A', echeance: '2028-03-31' }); sync()
    expect(mrhEv(DB).map(e => e.date)).toEqual(['2028-03-31'])
  })
  it('un événement saisi à la main (sans clé) reste sans clé', () => {
    const DB = base(); DB.agenda = []
    formulaire(DB, null).saveAgendaEvt()
    expect(DB.agenda[0]).toMatchObject({ auto: false, autoKey: '' })
  })
})

// Didier 16/10 — Agenda : assurance et entretiens à date sans rappel anticipé ; révision IRL à la date de révision, rappel un mois avant.
describe('Agenda — anticipation (16/10)', () => {
  const irlEv = (DB) => DB.agenda.filter(e => e.cat === 'IRL')
  const an = new Date().getFullYear()
  it('révision IRL : un événement par année, à la date de révision, rappel 30 jours avant', () => {
    const DB = base(); monde(DB, { irl: '2026-11-15' })()
    const ev = irlEv(DB).find(e => e.autoKey === 'IRL:A:' + an)
    expect(ev).toMatchObject({ date: an + '-11-15', rappels: [30], autoDate: an + '-11-15', titre: 'Révision IRL — A (le 15/11/' + an + ')' })
    expect(new Set(irlEv(DB).map(e => e.autoKey)).size).toBe(irlEv(DB).length)
  })
  it('migration : l’ancien rappel « Préparer révision IRL » (1er du mois précédent, rappel 7 j) est recalé, sans orphelin ni doublon', () => {
    const DB = base()
    DB.agenda = [{ id: 'old', cat: 'IRL', auto: true, autoKey: 'IRL:A:' + an, autoDate: an + '-10-01', date: an + '-10-01', dateFin: an + '-10-01', rappels: [7], titre: 'Préparer révision IRL — A (éch. 15/11/' + an + ')', done: false }]
    const sync = monde(DB, { irl: '2026-11-15' }); sync(); sync()
    const evs = irlEv(DB).filter(e => e.autoKey === 'IRL:A:' + an)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toMatchObject({ id: 'old', date: an + '-11-15', rappels: [30] })
  })
  it('un rappel IRL déplacé à la main ou déjà fait n’est pas recalé', () => {
    const DB = base()
    DB.agenda = [
      { id: 'main', cat: 'IRL', auto: true, autoKey: 'IRL:A:' + an, autoDate: an + '-10-01', date: an + '-10-20', rappels: [7], titre: 'Préparer révision IRL — A (déplacé)', done: false },
      { id: 'fait', cat: 'IRL', auto: true, autoKey: 'IRL:A:' + (an + 1), autoDate: (an + 1) + '-10-01', date: (an + 1) + '-10-01', rappels: [7], titre: 'Préparer révision IRL — A (fait)', done: true },
    ]
    monde(DB, { irl: '2026-11-15' })()
    expect(DB.agenda.find(e => e.id === 'main')).toMatchObject({ date: an + '-10-20', rappels: [7] })
    expect(DB.agenda.find(e => e.id === 'fait')).toMatchObject({ date: (an + 1) + '-10-01', done: true })
  })
  it('assurance et entretiens automatiques existants : leurs rappels anticipés sont retirés ; un événement modifié à la main garde les siens', () => {
    const DB = base()
    DB.agenda = [
      { id: 'm', cat: 'MRH', auto: true, autoKey: 'MRH:A:2027-03-31', date: '2027-03-31', rappels: [30], done: false },
      { id: 'e', cat: 'CHAUDIERE', auto: true, autoKey: 'EQUIP:A:CHAUDIERE_GAZ:2027-01-10', date: '2027-01-10', rappels: [30, 7], done: false },
      { id: 'h', cat: 'MRH', auto: false, autoKey: 'MRH:A:2026-01-01', date: '2026-01-01', rappels: [30], done: false },
    ]
    monde(DB)()
    expect(DB.agenda.find(e => e.id === 'm').rappels).toEqual([])
    expect(DB.agenda.find(e => e.id === 'e').rappels).toEqual([])
    expect(DB.agenda.find(e => e.id === 'h').rappels).toEqual([30])
  })
})

describe('Agenda — rappel de révision en retard (couleur)', () => {
  const an = new Date().getFullYear()
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  const ilYa = (j) => { const d = new Date(); d.setDate(d.getDate() - j); return iso(d) }
  function enRetard(DB) {
    const reel = { DB, _isoLocal: iso, computeIRLRevision: () => null, Date, String, Array, Object, Number }
    const proxy = new Proxy(reel, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]) })
    return vm.runInContext('(function(__p){ with(__p){ ' + extraireFonction(P2, '_agendaRevisionEnRetard') + '\nreturn _agendaRevisionEnRetard; } })', vm.createContext({}))(proxy)
  }
  const monDB = (ev, extra = {}) => ({ logements: [{ ref: 'A', ...extra }], baux: { A: { debut: '2020-03-01' } }, agenda: ev })
  it('révision du cycle non faite, date passée : en retard', () => {
    const e = { cat: 'IRL', autoKey: 'IRL:A:' + an, logement: 'A', date: ilYa(10), done: false }
    expect(enRetard(monDB([e]))(e)).toBe(true)
  })
  it('pas en retard : année précédente, révision appliquée, rappel fait, avant la première révision', () => {
    const vieux = { cat: 'IRL', autoKey: 'IRL:A:' + (an - 1), logement: 'A', date: ilYa(380), done: false }
    const courant = { cat: 'IRL', autoKey: 'IRL:A:' + an, logement: 'A', date: ilYa(10), done: false }
    expect(enRetard(monDB([vieux, courant]))(vieux)).toBe(false)
    expect(enRetard(monDB([courant], { irlDerniereApplication: ilYa(5) }))(courant)).toBe(false)
    expect(enRetard(monDB([{ ...courant, done: true }]))({ ...courant, done: true })).toBe(false)
    const DBj = monDB([courant]); DBj.baux.A.debut = ilYa(200)
    expect(enRetard(DBj)(courant)).toBe(false)
  })
})
