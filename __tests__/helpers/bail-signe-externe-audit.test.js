// BAIL-EN-COURS-SIGNE-HORS-PROPRYO — correctifs du contre-audit (docs/subjects/BAIL-EN-COURS-SIGNE-HORS-PROPRYO-AUDIT.md).
// Le VRAI saveBail (js/app/app-part1.js) est EXÉCUTÉ : le code de la fonction est évalué dans un `with` dont le proxy fournit un
// formulaire minimal, un DB et les vraies fonctions du chantier ; tout autre nom est un bouchon inerte. Aucune réplique de logique.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')

function extraire(src, marqueur) {
  const i = src.indexOf(marqueur)
  if (i < 0) throw new Error('introuvable : ' + marqueur)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + marqueur)
}
const fn = (src, nom) => extraire(src, (src.includes('async function ' + nom + '(') ? 'async ' : '') + 'function ' + nom + '(')

// Monde d'exécution du vrai saveBail.
function monde({ form = {}, baux = {}, locataires = [{ nom: 'Martin' }], saveDB, horsLigne = false, confirm = () => true, winExtra = {} } = {}) {
  const champs = {}
  for (const [id, val] of Object.entries(form)) champs[id] = typeof val === 'boolean' ? { checked: val } : { value: val }
  const toasts = [], confirms = [], audits = []
  const DB = { baux, logements: [{ ref: 'D-101', hc: 500 }], entites: [], baux_historique: [], documents: [], bailEvents: [], loyerBareme: [] }
  const win = { BailSignatureEtat: BSE, __immoCloudInfo: { displayName: 'Didier' }, __immoHorsLigne: horsLigne, ...winExtra }
  const reel = {
    DB, window: win, escHtml: (s) => String(s),
    el: (id) => champs[id] || null, v: (id) => String((champs[id] && champs[id].value) || '').trim(), pf: (id) => Number((champs[id] && champs[id].value) || 0),
    fd: (s) => String(s).slice(0, 10).split('-').reverse().join('/'), td: () => '2026-10-06', _todayIsoLocal: () => '2026-10-06',
    confirm2: (m) => { confirms.push(m); return confirm(m) }, confirm: (m) => { confirms.push(m); return confirm(m) },
    showToast: (m, t) => toasts.push([m, t]), _appUserName: () => 'Didier', _captureBailSnapshot: () => {},
    _auditLog: (...a) => audits.push(a), _stamp: (o) => { o._modifiedAt = 'T'; return o },
    getBailLocs: () => locataires.map(l => ({ ...l })), getBailSignataireSelection: () => [],
    getBailDataFromForm: () => ({ ref: 'D-101', debut: champs['b-debut'] ? champs['b-debut'].value : '', hc: 500, ch: 20, locataires: [] }),
    _bailLegacyGarantFields: () => ({}),
    _bailValidPending: null, _skipDdtCheckOnce: false, _bailEnCours: () => false, _ARCHI_V4B_DESC_FIELDS: undefined,
    _bailModifDetecterChangements: () => [], _ddtControleSaveBail: () => false, _ddtComplet: undefined,
    _isoLocal: (d) => d.toISOString().slice(0, 10), _lyQ: (s) => s, nid: () => 1,
    saveDB: saveDB || (() => true), _undoOnSaveDBSuccess: () => {}, _journalTrace: [],
    JSON, Date, Object, Array, String, Number, Math, console, Symbol, Boolean, Promise, parseInt, parseFloat, isNaN, RegExp, Error,
  }
  const stubs = ['_bailExterneApresSave', '_refreshAfterMutation', 'closeM', 'initFilters', 'rBaux', 'refreshAllIRL', 'suggestSave',
    '_cleanupBailAgendaEvents', 'agendaAutoSync', '_pushLoyerTheoFromLive', '_gmbiAlerterEntree', '_finalizeCandidatConversion']
  const apres = []
  for (const n of stubs) reel[n] = (...a) => { if (n === '_bailExterneApresSave') apres.push(a) }
  Object.assign(reel, { _pendingCandidatConv: null, _histoBailTodayIso: () => '2026-10-06' })
  const noms = ['_bailEtatSig', '_bailAuteurCourant', '_bailExterneIntention', '_bailExterneConfirmer', '_bailExterneAppliquer',
    '_bailExterneRefusSecours', '_bailCompoResetDemande', '_bailCompositionChanged', 'saveBail']
  const code = '(function(__p){ with(__p){ let _bailExtApprox = false, _bailExtFichier = null, _bailExtRetirer = false;\n'
    + noms.map(n => fn(P1, n)).join('\n') + '\n' + ['_preserverChampsExistants', '_preserverBailExistant'].map(n => fn(P2, n)).join('\n') + '\nreturn { saveBail: saveBail, refus: _bailExterneRefusSecours, compo: _bailCompoResetDemande, intention: _bailExterneIntention }; } })'
  const proxy = new Proxy(reel, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]),
    set: (t, k, val) => { t[k] = val; return true },
  })
  const api = vm.runInContext(code, vm.createContext({}))(proxy)
  return Object.assign(api, { DB, toasts, confirms, audits, champs, win, apres, reel })
}


// Charge n'importe quelles fonctions de app-part1/2 dans un monde à proxy (noms inconnus = undefined, jamais d'erreur d'accès).
function charger(noms, reel, lets = '') {
  const code = '(function(__p){ with(__p){ ' + lets + '\n' + noms.map(n => { const src = P1.includes('function ' + n + '(') ? P1 : P2; return fn(src, n) }).join('\n')
    + '\nreturn { ' + noms.map(n => n + ': ' + n).join(', ') + ' }; } })'
  const proxy = new Proxy(reel, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]), set: (t, k, val) => { t[k] = val; return true } })
  return vm.runInContext(code, vm.createContext({}))(proxy)
}
const rs = (status, extra) => ({ sessionId: 's1', ownerToken: 't1', status, createdAt: '2026-10-01T09:00:00Z', signers: [{ role: 'locataire', nom: 'Martin' }], ...extra })
const PARTIEL = (rsStatus) => ({ ref: 'D-101', debut: '2024-03-01', hc: 500, locataires: [{ nom: 'Martin' }], signatures: {
  signedAt: '2024-02-20T10:00:00Z', signedBailleurAt: '2024-02-20T10:00:00Z', mode: 'bailleur-seul', finales: { b: 'data:x' },
  bailSnapshot: { ref: 'D-101', locataires: [{ nom: 'Martin' }] }, ...(rsStatus ? { remoteSession: rs(rsStatus) } : {}) } })
const FORM = (o) => ({ 'b-ref': 'D-101', 'b-edit-ref': 'D-101', 'b-debut': '2024-03-01', 'b-externe': true, 'b-dateSignature': '2024-02-20', ...o })

describe('🔴 session de signature à distance vivante : la déclaration passe par le contrôle au relais', () => {
  for (const st of ['sent', 'chaining', 'unreachable', 'access-lost', 'expired', 'error']) {
    it('saveBail REFUSE de déclarer (' + st + ') sans l\'état relais contrôlé : rien n\'est modifié, message clair', () => {
      const baux = { 'D-101': { ref: 'D-101', debut: '2024-03-01', signatures: { remoteSession: rs(st) } } }
      const avant = JSON.stringify(baux)
      const w = monde({ form: FORM(), baux })
      w.saveBail()
      expect(JSON.stringify(w.DB.baux)).toBe(avant)
      expect(w.toasts.some(([m, t]) => t === 'err' && /signature à distance est en cours/.test(m) && /Signé hors Propryo/.test(m) && /rien n'a été modifié/.test(m))).toBe(true)
      expect(w.apres.length).toBe(0)
    })
  }
  it('avec l\'état relais contrôlé (sessionExpireeSigneHors → _rsPreflight) : la déclaration passe, la session est ARCHIVÉE', () => {
    const baux = { 'D-101': { ref: 'D-101', debut: '2024-03-01', signatures: { remoteSession: rs('sent') } } }
    const w = monde({ form: FORM(), baux, winExtra: { _bailExtEtatRelais: 'pending-invalidee', _bailExtOrigine: 'session-expiree' } })
    w.saveBail()
    const b = w.DB.baux['D-101']
    expect(b.signatures.mode).toBe('externe')
    expect(b.signatures.remoteSession).toBeUndefined()
    expect(b.signaturesAnnulees.map(a => a.motif)).toEqual(['remplace-par-externe'])
    expect(b.signaturesAnnulees[0].etatRelais).toBe('pending-invalidee')
  })
  it('sans session à distance, la déclaration depuis « Modifier le bail » reste libre (jamais de blocage)', () => {
    const w = monde({ form: FORM(), baux: { 'D-101': { ref: 'D-101', debut: '2024-03-01' } } })
    w.saveBail()
    expect(w.DB.baux['D-101'].signatures.mode).toBe('externe')
  })
  it('_bailExterneRefusSecours : pur — uniquement « déclarer » + session + pas d\'état relais', () => {
    const w = monde({})
    const ex = { signatures: { remoteSession: rs('sent') } }
    expect(w.refus(ex, { action: 'declarer' }, '')).not.toBe('')
    expect(w.refus(ex, { action: 'declarer' }, 'expired')).toBe('')
    expect(w.refus(ex, { action: 'retirer' }, '')).toBe('')
    expect(w.refus({ signatures: {} }, { action: 'declarer' }, '')).toBe('')
    expect(w.refus(null, { action: 'declarer' }, '')).toBe('')
  })
  it('« Modifier le bail » : la case est MASQUÉE tant qu\'une session existe, visible sinon (rendu réel)', () => {
    const mk = (bail) => {
      const champs = { 'b-dateSignature': { value: '' }, 'b-dateSign-locked-val': {}, 'b-externe-fg': { style: {} }, 'b-externe': { checked: false }, 'b-externe-rs': { style: {} }, 'b-externe-file': { value: '' } }
      const reel = { el: (id) => champs[id] || null, window: { BailSignatureEtat: BSE }, BailSignatureEtat: BSE, escHtml: String, fd: String, _uiIcon: () => '', _bailExterneToggle: () => {}, JSON, Object, String }
      const api = charger(['_bailEtatSig', '_bailRenderSignatureDateField'], reel, 'let _bailExtApprox = false, _bailExtFichier = null, _bailExtRetirer = false;')
      api._bailRenderSignatureDateField(bail)
      return champs
    }
    const avecSession = mk({ ref: 'D-101', signatures: { remoteSession: rs('sent') } })
    expect(avecSession['b-externe-fg'].style.display).toBe('none')
    expect(avecSession['b-externe-rs'].style.display).toBe('')
    const expiree = mk({ ref: 'D-101', signatures: { remoteSession: rs('expired') } })
    expect(expiree['b-externe-fg'].style.display).toBe('none')
    const sans = mk({ ref: 'D-101' })
    expect(sans['b-externe-fg'].style.display).toBe('')
    expect(sans['b-externe-rs'].style.display).toBe('none')
  })
  it('« Signé hors Propryo » est proposé sur la session en cours d\'envoi (sent / chaining) ET expirée ; pas de faux bouton ailleurs', () => {
    const api = charger(['_renderRemoteSignBadge'], { _lyQ: String, escHtml: String, _uiIcon: () => '', fd: String, JSON, Object, Array, String })
    const badge = (status) => api._renderRemoteSignBadge({ signatures: { remoteSession: rs(status) } }, 'D-101')
    for (const st of ['sent', 'chaining', 'expired']) expect(badge(st)).toMatch(/sessionExpireeSigneHors\('D-101'\)/)
    expect(badge('unreachable')).not.toMatch(/sessionExpireeSigneHors/)   // vérification impossible : on réessaie, on ne déclare pas à l'aveugle
  })
  it('sessionExpireeSigneHors : contrôle l\'état réel (_rsPreflight) PUIS affiche la case ; refus du contrôle = rien d\'affiché', async () => {
    const mk = (pf) => {
      const champs = { 'b-externe-fg': { style: { display: 'none' } }, 'b-externe-rs': { style: { display: '' } }, 'b-externe': { checked: false, closest: () => null } }
      const win = { BailSignatureEtat: BSE }
      const reel = { DB: { baux: { 'D-101': { ref: 'D-101', signatures: { remoteSession: rs('sent') } } } }, window: win, BailSignatureEtat: BSE, el: (id) => champs[id] || null,
        showToast: () => {}, _rsPreflight: async () => pf, openBail: () => {}, _bailExterneToggle: () => {}, JSON, Object, document: { querySelectorAll: () => [] }, Array }
      const api = charger(['_bailEtatSig', 'sessionExpireeSigneHors'], reel)
      return { api, champs, win }
    }
    const ok = mk({ ok: true, etat: 'pending-invalidee', purge: () => {} })
    await ok.api.sessionExpireeSigneHors('D-101')
    expect(ok.champs['b-externe-fg'].style.display).toBe('')
    expect(ok.win._bailExtEtatRelais).toBe('pending-invalidee')
    const ko = mk({ ok: false, raison: 'injoignable' })
    await ko.api.sessionExpireeSigneHors('D-101')
    expect(ko.champs['b-externe-fg'].style.display).toBe('none')
    expect(ko.win._bailExtEtatRelais).toBeUndefined()
  })
})

describe('🟠 composition modifiée + déclaration dans le même enregistrement : la déclaration SURVIT', () => {
  const FORM2 = (o) => FORM({ ...o })
  it('saveBail : bail à signature partielle + colocataire ajouté + déclaration → bail EXTERNE, pas de réinitialisation, archive honnête', () => {
    const w = monde({ form: FORM2(), baux: { 'D-101': PARTIEL('expired') }, locataires: [{ nom: 'Martin' }, { nom: 'Durand' }],
      winExtra: { _bailExtEtatRelais: 'expired', _bailExtOrigine: 'session-expiree' } })
    w.saveBail()
    const b = w.DB.baux['D-101']
    expect(b.signatures && b.signatures.mode).toBe('externe')
    expect(b.signatures.signedAt).toBe('2024-02-20T12:00:00.000Z')
    expect(b.signaturesAnnulees.map(a => a.motif)).toEqual(['remplace-par-externe'])
    expect(b.signaturesAnnulees[0].signatures.finales).toEqual({ b: 'data:x' })   // la signature du bailleur est archivée, pas détruite
    expect(b.signatures.bailSnapshot.locataires.map(l => l.nom)).toEqual(['Martin', 'Durand'])   // la déclaration porte la composition saisie
    expect(w.confirms.some(m => /Composition modifiée/.test(m))).toBe(false)   // pas de « réinitialiser les signatures » proposé
    expect(w.toasts.some(([m]) => /Signatures réinitialisées/.test(m))).toBe(false)
    expect(w.toasts.some(([m]) => /signé hors Propryo le 20\/02\/2024.*archivée/.test(m))).toBe(true)
    expect(w.apres.length).toBe(1)   // le PDF choisi est traité après l'enregistrement
  })
  it('contrôle : SANS déclaration, la composition modifiée réinitialise toujours les signatures (comportement existant intact)', () => {
    const w = monde({ form: FORM2({ 'b-externe': false }), baux: { 'D-101': PARTIEL() }, locataires: [{ nom: 'Martin' }, { nom: 'Durand' }] })
    w.saveBail()
    expect(w.confirms.some(m => /Composition modifiée/.test(m))).toBe(true)
    expect(w.DB.baux['D-101'].signatures).toBeUndefined()
  })
  it('_bailCompoResetDemande : pur', () => {
    const w = monde({})
    expect(w.compo({ action: 'declarer' }, true)).toBe(false)
    expect(w.compo({ action: null }, true)).toBe(true)
    expect(w.compo({ action: 'declarer' }, false)).toBe(false)
  })
})

describe('🟡 écriture refusée : jamais un « enregistré » sur des données perdues', () => {
  it('saveBail : saveDB refuse la déclaration → tout est remis, message « NON enregistrée », pas de dépôt de PDF', () => {
    const baux = { 'D-101': { ref: 'D-101', debut: '2024-03-01' } }
    const avant = JSON.stringify(baux)
    const w = monde({ form: FORM(), baux, saveDB: () => false })
    w.saveBail()
    expect(JSON.stringify(w.DB.baux)).toBe(avant)
    expect(w.toasts.some(([m, t]) => t === 'err' && /Déclaration NON enregistrée/.test(m))).toBe(true)
    expect(w.toasts.some(([m]) => /^Bail enregistré/.test(m))).toBe(false)
    expect(w.apres.length).toBe(0)
    expect(w.audits.length).toBe(0)
  })
  it('saveBail : hors ligne, la déclaration est refusée AVANT toute écriture (rien de modifié)', () => {
    const baux = { 'D-101': { ref: 'D-101', debut: '2024-03-01' } }
    const avant = JSON.stringify(baux)
    let ecritures = 0
    const w = monde({ form: FORM(), baux, horsLigne: true, saveDB: () => { ecritures++; return false } })
    w.saveBail()
    expect(JSON.stringify(w.DB.baux)).toBe(avant)
    expect(ecritures).toBe(0)
    expect(w.toasts.some(([m]) => /Hors ligne.*Rien n'a été modifié/.test(m))).toBe(true)
  })
  const annuler = (saveDB) => {
    const bail = { ref: 'D-101', signatures: { signedAt: '2024-02-20T10:00:00Z', mode: 'bailleur-seul', remoteSession: rs('expired') }, _modifiedAt: 'avant' }
    const toasts = [], purge = []
    const reel = { DB: { baux: { 'D-101': bail } }, window: { BailSignatureEtat: BSE, __immoCloudInfo: {} }, BailSignatureEtat: BSE, showToast: (m, t) => toasts.push([m, t]),
      _rsPreflight: async () => ({ ok: true, etat: 'expired', purge: async () => { purge.push(1) } }), _rsConfirmAnnulation: async () => true, _auditLog: () => {},
      _stamp: (o) => { o._modifiedAt = 'apres'; return o }, saveDB, escHtml: String, fd: String, _refreshAfterMutation: () => {}, _appUserName: () => 'Didier', JSON, Object, Array, String, Date }
    const api = charger(['_bailEtatSig', '_bailAuteurCourant', 'annulerSessionSignature'], reel)
    return { api, bail, toasts, purge }
  }
  it('« Annuler la session » : écriture refusée → la session du relais n\'est PAS purgée, le bail est remis tel quel', async () => {
    const t = annuler(() => false)
    await t.api.annulerSessionSignature('D-101')
    expect(t.purge.length).toBe(0)
    expect(t.bail.signatures.remoteSession.sessionId).toBe('s1')
    expect(t.bail.signaturesAnnulees).toBeUndefined()
    expect(t.bail._modifiedAt).toBe('avant')
    expect(t.toasts.some(([m, k]) => k === 'err' && /Session NON annulée/.test(m))).toBe(true)
  })
  it('« Annuler la session » : écriture réussie → archive + purge du relais', async () => {
    const t = annuler(() => true)
    await t.api.annulerSessionSignature('D-101')
    expect(t.purge.length).toBe(1)
    expect(t.bail.signatures).toBeUndefined()
    expect(t.bail.signaturesAnnulees.map(a => a.motif)).toEqual(['session-annulee'])
  })
})

describe('🟠 _archiveBailTerminee : jamais de PDF partiel rattaché à un bail devenu externe', () => {
  const run = (cur, initial, path) => {
    const saves = []
    const reel = { DB: { baux: cur ? { 'D-101': cur } : {} }, saveDB: () => { saves.push(1) }, console, Object, String, Array }
    charger(['_archiveBailTerminee'], reel)._archiveBailTerminee('D-101', initial, path)
    return saves.length
  }
  const initial = () => ({ ref: 'D-101', signatures: { signedAt: '2024-02-20T10:00:00Z', mode: 'bailleur-seul', proof: 'P' } })
  it('bail courant EXTERNE : aucun cloudPdfKey / archiveTermine posé sur la signature externe ; le PDF va dans l\'archive de SA signature', () => {
    const ancienne = initial().signatures
    const cur = { ref: 'D-101', signatures: { mode: 'externe', signedAt: '2024-02-20T12:00:00.000Z' }, signaturesAnnulees: [{ motif: 'remplace-par-externe', signatures: JSON.parse(JSON.stringify(ancienne)) }] }
    expect(run(cur, initial(), 'cloud/bp_partiel.pdf')).toBe(1)
    expect(cur.signatures.cloudPdfKey).toBeUndefined()
    expect(cur.signatures.archiveTermine).toBeUndefined()
    expect(cur.signaturesAnnulees[0].signatures.cloudPdfKey).toBe('cloud/bp_partiel.pdf')
  })
  it('signature courante différente (date corrigée / re-signature) : rien sur la signature courante', () => {
    const cur = { ref: 'D-101', signatures: { mode: 'avec-locataire', signedAt: '2025-01-01T10:00:00Z' } }
    run(cur, initial(), 'cloud/x.pdf')
    expect(cur.signatures.cloudPdfKey).toBeUndefined()
  })
  it('session annulée (plus de signatures) : la clé du PDF est conservée dans l\'archive au lieu d\'être perdue', () => {
    const cur = { ref: 'D-101', signaturesAnnulees: [{ motif: 'session-annulee', signatures: initial().signatures }] }
    run(cur, initial(), 'cloud/y.pdf')
    expect(cur.signaturesAnnulees[0].signatures.cloudPdfKey).toBe('cloud/y.pdf')
  })
  it('chemin normal inchangé : même signature → cloudPdfKey + archiveTermine posés', () => {
    const cur = initial()
    expect(run(cur, cur, 'cloud/ok.pdf')).toBe(1)
    expect(cur.signatures.cloudPdfKey).toBe('cloud/ok.pdf')
    expect(cur.signatures.archiveTermine).toBe(true)
  })
  it('bail courant sans signedAt comparable (électronique complet de même date) : écrit comme avant', () => {
    const cur = { ref: 'D-101', signatures: { signedAt: '2024-02-20T10:00:00Z', mode: 'avec-locataire' } }
    run(cur, initial(), 'cloud/z.pdf')
    expect(cur.signatures.cloudPdfKey).toBe('cloud/z.pdf')
  })
})

describe('🟡 EDL externe hors ligne : l\'EDL est enregistré, seule la pièce est reportée', () => {
  const creer = (horsLigne) => {
    const toasts = [], saves = [], deposes = []
    const DB = { logements: [{ ref: 'D-101', id: 7 }], edl: [], baux: {}, documents: [] }
    const reel = { DB, window: { BailSignatureEtat: BSE, __immoHorsLigne: horsLigne }, BailSignatureEtat: BSE, showToast: (m, t) => toasts.push([m, t]), fd: String, td: () => '2026-10-06', _todayIsoLocal: () => '2026-10-06',
      confirm2: () => true, nid: () => 42, _stamp: (o) => o, _auditLog: () => {}, _undoOp: (l, f) => f(), saveDB: (o) => { saves.push(o); return horsLigne ? !!(o && o.quoi === 'edl') : true },
      _isAlive: (o) => o && !o._deleted, _edlExtEspace: () => null, _edlExtDeposerPj: async () => { deposes.push(1); return true }, _bailAuteurCourant: () => 'D', _edlExterne: () => false,
      _refreshAfterMutation: () => {}, rEDLList: () => {}, JSON, Object, String, Array, Date, console }
    const api = charger(['edlExterneCreer'], reel)
    return { api, toasts, saves, deposes, DB }
  }
  it('hors ligne : EDL enregistré avec l\'étiquette « edl », PDF NON déposé, message clair', async () => {
    const t = creer(true)
    const id = await t.api.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: { name: 'edl.pdf', mime: 'application/pdf', size: 10, dataB64: 'x' } })
    expect(id).toBe(42)
    expect(t.DB.edl.length).toBe(1)
    expect(t.saves[0]).toEqual({ quoi: 'edl' })
    expect(t.deposes.length).toBe(0)
    expect(t.toasts.some(([m]) => /Hors ligne : l'EDL est enregistré, mais le PDF n'a pas été joint/.test(m))).toBe(true)
  })
  it('en ligne : l\'EDL est enregistré ET le PDF déposé', async () => {
    const t = creer(false)
    expect(await t.api.edlExterneCreer('D-101', { sens: 'sortie', date: '2023-09-01', fichier: { name: 'e.pdf', mime: 'application/pdf', size: 1, dataB64: 'x' } })).toBe(42)
    expect(t.deposes.length).toBe(1)
  })
})

describe('🟡 « Retirer le PDF » : jamais le seul exemplaire détruit sans le dire', () => {
  const mk = (doc) => {
    const supp = [], idb = [], saves = []
    const reel = { DB: { documents: [doc] }, _attachmentDelete: async (id) => { supp.push(id); return true }, _idbDel: async (k) => { idb.push(k) }, _auditLog: () => {}, saveDB: () => { saves.push(1) }, Object, Date }
    return { api: charger(['_bailScanExterneSupprimerDoc', '_bailScanExterneRetraitMsg'], reel), supp, idb, doc }
  }
  it('envoyé au cloud (cloudKey) : suppression habituelle', async () => {
    const t = mk({ id: 5, idbKey: 'k5', cloudKey: 'c5', name: 'bail.pdf' })
    await t.api._bailScanExterneSupprimerDoc(t.doc)
    expect(t.supp).toEqual([5])
  })
  it('PAS encore envoyé au cloud : le document est retiré de la liste, le binaire local est CONSERVÉ', async () => {
    const t = mk({ id: 6, idbKey: 'k6', name: 'bail.pdf', parentType: 'bail', parentId: 'D-101' })
    expect(await t.api._bailScanExterneSupprimerDoc(t.doc)).toBe(true)
    expect(t.supp).toEqual([])
    expect(t.idb).toEqual([])
    expect(t.doc._deleted).toBe(true)
  })
  it('le message de confirmation dit la vérité selon le cas', () => {
    const t = mk({ id: 1 })
    expect(t.api._bailScanExterneRetraitMsg({ name: 'a.pdf', cloudKey: 'c' })).toMatch(/déjà envoyé au cloud est conservé/)
    expect(t.api._bailScanExterneRetraitMsg({ name: 'a.pdf' })).toMatch(/pas encore été envoyé au cloud/)
  })
  it('retrait depuis « Modifier le bail » : confirmation demandée, refus = le PDF reste', () => {
    let conf = 0
    const champs = { 'b-externe-pj-nom': { textContent: '' }, 'b-externe-pj-choisir': {}, 'b-externe-pj-retirer': { style: {} } }
    const reel = { _bailExtFichier: null, v: () => 'D-101', DB: { baux: { 'D-101': { ref: 'D-101' } } }, _bailScanExterne: () => ({ id: 1, name: 'a.pdf' }), confirm2: () => { conf++; return false }, el: (id) => champs[id] || null,
      _bailScanFmtTaille: String, _bailScanExterneRetraitMsg: () => 'm' }
    const api = charger(['_bailExterneScanExistant', '_bailExterneRetirerPj', '_bailExternePjAfficher'], reel, 'let _bailExtFichier = null, _bailExtRetirer = false;')
    api._bailExterneRetirerPj()
    expect(conf).toBe(1)
    expect(champs['b-externe-pj-nom'].textContent).not.toMatch(/sera retiré/)
  })
})

describe('🟡 dates non échappées dans les nouvelles cartes', () => {
  const XSS = '<img src=x onerror=alert(1)>'
  it('_edlExtMeta échappe la date (fd rend la valeur brute si ce n\'est pas une date)', () => {
    const reel = { fd: (s) => String(s), escHtml: (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'), _edlExtPj: () => null, _bailScanFmtTaille: String, String }
    expect(charger(['_edlExtMeta'], reel)._edlExtMeta({ date: XSS })).not.toMatch(/<img/)
  })
  it('historique du bail : dates des cartes « signé hors Propryo » / archives échappées', () => {
    const reel = { fd: (s) => String(s), escHtml: (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'), _uiIcon: () => '', fmt: String, Object, Array, String }
    const h = charger(['_histoBailEventHtml'], reel)._histoBailEventHtml
    for (const ev of [{ type: 'signe-externe', date: XSS, declareLe: XSS }, { type: 'signature-annulee', motif: 'externe-retire', ancienneDate: XSS },
      { type: 'signature-annulee', motif: 'externe-redate', ancienneDate: XSS }, { type: 'signature-annulee', motif: 'session-annulee', envoyeeLe: XSS, signataires: [{ nom: 'A', signeLe: XSS }] }])
      expect(h(ev, {}, 'D-101', null)).not.toMatch(/<img/)
  })
})
