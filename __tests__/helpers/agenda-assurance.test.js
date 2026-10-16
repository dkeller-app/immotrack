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

function monde(DB, { loue = true } = {}) {
  let n = 0
  const reel = {
    DB, window: { AlertRules }, Date, String, Object, Array, Number, Set, Map, JSON, Math, RegExp,
    _lotEstLoue: () => loue, computeIRLRevision: null, _bailEcheanceEffective: () => null, _bailPreavisInfo: () => null,
    agendaId: () => 'ev' + (++n), saveDB: () => {}, fd: (s) => String(s).split('-').reverse().join('/'), fmt: String,
    _isoLocal: (d) => d.toISOString().slice(0, 10),
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
  it('crée « Demander l’attestation d’assurance » à l’échéance, rappel 30 jours avant', () => {
    const DB = base(); monde(DB)()
    expect(mrhEv(DB)).toHaveLength(1)
    expect(mrhEv(DB)[0]).toMatchObject({ titre: 'Demander l’attestation d’assurance — A', date: '2027-03-31', rappels: [30], auto: true, autoKey: 'MRH:A:2027-03-31', logement: 'A' })
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
