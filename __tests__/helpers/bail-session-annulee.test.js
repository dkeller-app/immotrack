// BAIL-EN-COURS-SIGNE-HORS-PROPRYO étape 4 — session de signature à distance expirée : contrôle préalable de l'état RÉEL au relais
// (_rsPreflight), « Annuler la session » (archive dans signaturesAnnulees), « Signé hors Propryo ». Vrai code d'app-part1 dans un vm.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')

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
const fn = (nom, asy = false) => extraire(P1, (asy ? 'async ' : '') + 'function ' + nom + '(')
const NOMS = [['_bailEtatSig'], ['_rsPreflight', 1], ['annulerSessionSignature', 1], ['sessionExpireeSigneHors', 1], ['_bailOuvrirDeclarationExterne'], ['_bailExterneApresSave', 1], ['_bailScanDocsExternes'], ['_bailScanExterne'], ['_bailScansExternesOrphelins'],
  ['_rsPurgeGardee', 1], ['_rsArchiveDeSession'], ['_rsPurgesLire'], ['_rsPurgesEcrire'], ['_rsPurgeEchouee'], ['_rsPurgesRetenter', 1], ['_rsRecupererApresArchivage', 1], ['_bailExterneRecontrole']]

const RS = (extra = {}) => ({ sessionId: 'S1', ownerToken: 'T1', signUrl: 'u', relayUrl: 'https://r', status: 'expired', createdAt: '2026-09-01T08:00:00.000Z',
  signers: [{ role: 'locataire', nom: 'Pierre Demo', signedAt: null }], ...extra })
const BAIL = (rs = RS(), extraSig = {}) => ({ ref: 'D-101', nom: 'Pierre Demo', debut: '2026-09-01', signatures: { remoteSession: rs, ...extraSig } })

// relais : statut réel renvoyé par _bsRelayPollSession (ou exception)
// relais : un état, ou une SUITE d'états (un par interrogation ; le dernier se répète) — p. ex. le locataire signe pendant la fenêtre.
function monde({ bail = BAIL(), relais = { status: 'expired' }, relaisThrows = false, confirms = [true], modal = true, deleteOk = true, completing = false } = {}) {
  const suite = Array.isArray(relais) ? relais.slice() : [relais]
  const ls = new Map()
  const log = { toasts: [], confirms: [], appels: [], modalHtml: null, etats: [] }
  const sb = {
    DB: { baux: { 'D-101': bail }, documents: [] }, window: { BailSignatureEtat: BSE }, log,
    _resolveRelayBase: (rs) => rs.relayUrl || 'https://defaut',
    _bsRelayPollSession: async () => { log.appels.push('poll'); if (relaisThrows) throw new Error('réseau'); return suite.length > 1 ? suite.shift() : suite[0] },
    _bsRelayDeleteSession: async (b, id, tok) => { log.appels.push(['delete', id, tok]); return deleteOk },
    _completeRemoteSign: async (ref, state) => { log.etats.push(state && state.status); log.appels.push(['complete', ref, sb.DB.baux[ref].signatures && sb.DB.baux[ref].signatures.remoteSession && sb.DB.baux[ref].signatures.remoteSession.ownerToken]); delete sb.DB.baux[ref].signatures.remoteSession; sb.DB.baux[ref].signatures.signedAt = '2026-09-10T10:00:00.000Z'; sb.DB.baux[ref].signatures.mode = 'distance' },
    showToast: (m, t) => log.toasts.push([m, t]),
    confirm2: (m) => { log.confirms.push(m); return confirms.length ? confirms.shift() : true },
    _rsConfirmAnnulation: async (html) => { log.modalHtml = html; return modal },
    saveDB: () => log.appels.push('saveDB'), _refreshAfterMutation: () => log.appels.push('refresh'),
    _stamp: (o) => { o._modifiedAt = 'STAMP' }, _auditLog: (...a) => log.appels.push(['audit', a.join('|')]),
    _bailAuteurCourant: () => 'Didier', fd: (d) => d.split('-').reverse().join('/'), escHtml: (x) => String(x),
    openBail: (r) => log.appels.push(['openBail', r]), el: () => null, _bailExterneToggle: () => {},
    _closeBailWizard: () => log.appels.push('closeWizard'), _lsKey: (k) => '_test_' + k, REMOTE_SIGN_TTL_MS: 14 * 86400000, _RS_PURGES_CLE: 'immotrack_rs_purges',
    localStorage: { getItem: (k) => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    Date, JSON, Array, Object, String, Number, console, Promise, setTimeout,
  }
  if (completing) sb.window.__remoteCompleting = { 'D-101': true }
  vm.createContext(sb)
  vm.runInContext('let _bailExtFichier = null, _bailExtRetirer = false;\n' + NOMS.map(([n, a]) => fn(n, !!a)).join('\n'), sb)
  return sb
}
const aSupprime = (w) => w.log.appels.some(a => Array.isArray(a) && a[0] === 'delete')

describe('_rsPreflight — état RÉEL au relais avant toute action', () => {
  it('completed → signature RÉCUPÉRÉE, rien n\'est annulé', async () => {
    const w = monde({ relais: { status: 'completed', signers: [] } })
    const r = await w._rsPreflight('D-101')
    expect(r).toMatchObject({ ok: false, recupere: true })
    expect(w.log.appels).toContainEqual(['complete', 'D-101', 'T1'])
    expect(aSupprime(w)).toBe(false)
  })
  it('404 (expired) → on continue, rien à perdre ; purge() supprime la session', async () => {
    const w = monde({ relais: { status: 'expired' } })
    const r = await w._rsPreflight('D-101')
    expect(r).toMatchObject({ ok: true, etat: 'expired' })
    expect(aSupprime(w)).toBe(false)   // le preflight lui-même ne supprime JAMAIS
    await r.purge()
    expect(w.log.appels).toContainEqual(['delete', 'S1', 'T1'])
  })
  it.each(['pending', 'sent', 'chaining'])('%s → confirmation (si message), puis etat pending-invalidee', async (st) => {
    const w = monde({ relais: { status: st } })
    const r = await w._rsPreflight('D-101', { confirmMsg: 'Invalider ?' })
    expect(r).toMatchObject({ ok: true, etat: 'pending-invalidee' })
    expect(w.log.confirms).toEqual(['Invalider ?'])
  })
  it('pending + refus de la confirmation → on ne fait rien', async () => {
    const w = monde({ relais: { status: 'pending' }, confirms: [false] })
    expect(await w._rsPreflight('D-101', { confirmMsg: 'Invalider ?' })).toMatchObject({ ok: false })
    expect(aSupprime(w)).toBe(false)
  })
  it('relais injoignable → REFUS (fail-closed)', async () => {
    const w = monde({ relaisThrows: true })
    expect(await w._rsPreflight('D-101')).toMatchObject({ ok: false, raison: 'injoignable' })
    expect(w.log.toasts[0][1]).toBe('err')
  })
  it('accès perdu (401 ou jeton absent) → REFUS, statut bail basculé en access-lost', async () => {
    const w = monde({ relais: { status: 'access-lost' } })
    expect(await w._rsPreflight('D-101')).toMatchObject({ ok: false, raison: 'acces-perdu' })
    expect(w.DB.baux['D-101'].signatures.remoteSession.status).toBe('access-lost')
    const w2 = monde({ bail: BAIL(RS({ ownerToken: '' })) })
    expect(await w2._rsPreflight('D-101')).toMatchObject({ ok: false, raison: 'acces-perdu' })
    expect(w2.log.appels).not.toContain('poll')   // sans jeton on n'interroge même pas
  })
  it.each([[null], [{ status: 'error' }], [{ status: 'bizarre' }], [{}]])('état indéterminé %j → REFUS', async (relais) => {
    const w = monde({ relais })
    expect(await w._rsPreflight('D-101')).toMatchObject({ ok: false, raison: 'indetermine' })
  })
  it('aucune session → ok sans rien à purger', async () => {
    const w = monde({ bail: { ref: 'D-101' } })
    expect(await w._rsPreflight('D-101')).toMatchObject({ ok: true, etat: 'aucune' })
  })
})

describe('annulerSessionSignature — le bail redevient non signé, tout est archivé', () => {
  it('session expirée (404) : bail non signé, archive complète, relais purgé, audit', async () => {
    const w = monde()
    await w.annulerSessionSignature('D-101')
    const b = w.DB.baux['D-101']
    expect(b.signatures).toBeUndefined()
    expect(b.signaturesAnnulees).toHaveLength(1)
    const a = b.signaturesAnnulees[0]
    expect(a).toMatchObject({ motif: 'session-annulee', etatRelais: 'expired', par: 'Didier' })
    expect(a.signatures.remoteSession.sessionId).toBe('S1')
    expect(a.resume).toMatchObject({ envoyeeLe: '2026-09-01T08:00:00.000Z', signataires: [{ role: 'locataire', nom: 'Pierre Demo', signedAt: null }] })
    expect(b._modifiedAt).toBe('STAMP')
    expect(w.log.appels.some(x => Array.isArray(x) && x[0] === 'audit' && /session de signature/.test(x[1]))).toBe(true)
    expect(w.log.appels).toContainEqual(['delete', 'S1', 'T1'])
    expect(BSE.etatSignatureBail(b).etat).toBe('non')
  })
  it('« Garder la session » : rien ne change', async () => {
    const w = monde({ modal: false })
    await w.annulerSessionSignature('D-101')
    expect(w.DB.baux['D-101'].signatures.remoteSession.sessionId).toBe('S1')
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(aSupprime(w)).toBe(false)
  })
  it('le bailleur avait déjà signé dans l\'app : sa signature est ARCHIVÉE, pas effacée (décision a)', async () => {
    const b = BAIL(RS(), { mode: 'bailleur-seul', signedAt: '2026-09-01T09:00:00.000Z', signedBailleurAt: '2026-09-01T09:00:00.000Z', finales: { bailleur: 'data:image/png;base64,AAA' } })
    const w = monde({ bail: b })
    await w.annulerSessionSignature('D-101')
    const bb = w.DB.baux['D-101']
    expect(bb.signatures).toBeUndefined()
    expect(bb.signaturesAnnulees[0].signatures.finales.bailleur).toBe('data:image/png;base64,AAA')
    expect(w.log.modalHtml).toMatch(/signature du bailleur/)
  })
  it('session encore active au relais : la fenêtre le dit, le lien est invalidé', async () => {
    const w = monde({ relais: { status: 'pending' } })
    await w.annulerSessionSignature('D-101')
    expect(w.log.modalHtml).toMatch(/encore active/)
    expect(w.DB.baux['D-101'].signaturesAnnulees[0].etatRelais).toBe('pending-invalidee')
    expect(w.log.appels).toContainEqual(['delete', 'S1', 'T1'])
  })
  it('session en réalité signée (completed) : RÉCUPÉRÉE, jamais annulée', async () => {
    const w = monde({ relais: { status: 'completed', signers: [] } })
    await w.annulerSessionSignature('D-101')
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(w.DB.baux['D-101'].signatures.signedAt).toBeTruthy()
    expect(w.log.modalHtml).toBeNull()
    expect(aSupprime(w)).toBe(false)
  })
  it.each([['injoignable', { relaisThrows: true }], ['indéterminé', { relais: { status: 'error' } }], ['accès perdu', { relais: { status: 'access-lost' } }]])('relais %s : on ne touche à rien', async (_n, opt) => {
    const w = monde(opt)
    await w.annulerSessionSignature('D-101')
    expect(w.DB.baux['D-101'].signatures.remoteSession.sessionId).toBe('S1')
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(w.log.modalHtml).toBeNull()
    expect(aSupprime(w)).toBe(false)
  })
  it('session vivante (sent) ou bail déjà signé : refus', async () => {
    const w = monde({ bail: BAIL(RS({ status: 'sent' })) })
    await w.annulerSessionSignature('D-101')
    expect(w.DB.baux['D-101'].signatures).toBeDefined()
    expect(w.log.appels).not.toContain('poll')
    const w2 = monde({ bail: { ref: 'D-101', signatures: { signedAt: '2026-09-02T00:00:00.000Z', mode: 'distance', remoteSession: RS() } } })
    await w2.annulerSessionSignature('D-101')
    expect(w2.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
  })
})

describe('sessionExpireeSigneHors — déclaration pré-cochée, relais purgé à l\'enregistrement seulement', () => {
  it('ouvre « Modifier le bail » avec l\'origine session-expiree, sans rien supprimer tout de suite', async () => {
    const w = monde()
    await w.sessionExpireeSigneHors('D-101')
    expect(w.log.appels).toContainEqual(['openBail', 'D-101'])
    expect(w.window._bailExtOrigine).toBe('session-expiree')
    expect(w.window._bailExtEtatRelais).toBe('expired')
    expect(aSupprime(w)).toBe(false)
    expect(w.DB.baux['D-101'].signatures.remoteSession).toBeDefined()   // intact tant qu'on n'a pas enregistré
  })
  it('session en réalité signée : récupérée, la fenêtre ne s\'ouvre pas', async () => {
    const w = monde({ relais: { status: 'completed', signers: [] } })
    await w.sessionExpireeSigneHors('D-101')
    expect(w.log.appels.find(a => Array.isArray(a) && a[0] === 'openBail')).toBeUndefined()
    expect(w.log.appels).toContainEqual(['complete', 'D-101', 'T1'])
  })
  it('relais injoignable : refus, aucune fenêtre', async () => {
    const w = monde({ relaisThrows: true })
    await w.sessionExpireeSigneHors('D-101')
    expect(w.log.appels.find(a => Array.isArray(a) && a[0] === 'openBail')).toBeUndefined()
  })
  it('à l\'enregistrement (bail déclaré externe) la purge est exécutée une fois ; sinon elle n\'est jamais lancée', async () => {
    const w = monde()
    await w.sessionExpireeSigneHors('D-101')
    w.DB.baux['D-101'].signatures = BSE.declarerSignatureExterne({}, { date: '2026-09-01', origine: 'session-expiree', now: '2026-10-06T08:00:00Z' })
    await w._bailExterneApresSave('D-101', { action: 'declarer' })
    expect(w.log.appels.filter(a => Array.isArray(a) && a[0] === 'delete')).toHaveLength(1)
    expect(w.window._bailExtPurge).toBeNull()
    // enregistrement sans déclaration (case décochée) : pas de purge
    const w2 = monde()
    await w2.sessionExpireeSigneHors('D-101')
    await w2._bailExterneApresSave('D-101', { action: null })
    expect(aSupprime(w2)).toBe(false)
  })
})

describe('câblage statique', () => {
  it('« Relancer » passe par _rsPreflight ; le panneau expiré propose les 3 actions', () => {
    expect(extraire(P1, 'async function openRemoteSignModal(')).toMatch(/_rsPreflight\(ref/)
    const badge = extraire(P1, 'function _renderRemoteSignBadge(')
    expect(badge).toMatch(/openRemoteSignModal/); expect(badge).toMatch(/sessionExpireeSigneHors/); expect(badge).toMatch(/annulerSessionSignature/)
  })
  it('saveBail transmet l\'origine session-expiree à la déclaration', () => {
    expect(extraire(P1, 'function saveBail(')).toMatch(/_bailExtOrigine/)
  })
})

// ─── Audit d'intégration v15.728 🟠1 / 🟠2 / 🟡9 : une vraie signature ne peut plus être détruite au relais ───
const deletes = (w) => w.log.appels.filter(a => Array.isArray(a) && a[0] === 'delete')
const completes = (w) => w.log.appels.filter(a => Array.isArray(a) && a[0] === 'complete')
const file = (w) => JSON.parse(w.localStorage.getItem('_test_immotrack_rs_purges') || '[]')

describe('🟠1 — course « pending → le locataire signe pendant la fenêtre »', () => {
  it('annuler : signée PENDANT la fenêtre de confirmation → 2ᵉ contrôle, signature récupérée, rien d\'annulé, rien de supprimé', async () => {
    const w = monde({ relais: [{ status: 'pending' }, { status: 'completed', signers: [] }] })
    await w.annulerSessionSignature('D-101')
    expect(w.log.modalHtml).toMatch(/encore active/)          // la fenêtre a bien été montrée (état pending)
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(completes(w)).toHaveLength(1)
    expect(deletes(w)).toHaveLength(0)
    expect(w.log.toasts.some(([m]) => /pendant la fenêtre.*abandonnée/.test(m))).toBe(true)
  })
  it('annuler : signée entre l\'archivage et la purge → purge gardée, annulation ABANDONNÉE, session rétablie avec son jeton, signature récupérée', async () => {
    const w = monde({ relais: [{ status: 'pending' }, { status: 'pending' }, { status: 'completed', signers: [] }] })
    await w.annulerSessionSignature('D-101')
    expect(deletes(w)).toHaveLength(0)
    expect(completes(w)).toEqual([['complete', 'D-101', 'T1']])   // le jeton de la session vivante, jamais celui de l'archive (null)
    expect(w.log.etats).toEqual(['completed'])   // l'état RÉEL relu au relais par la purge gardée est transmis à la récupération
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(w.DB.baux['D-101'].signatures.signedAt).toBeTruthy()
    expect(w.log.toasts.some(([m]) => /L'annulation de la session est abandonnée/.test(m))).toBe(true)
    expect(w.log.toasts.some(([m]) => /^Session annulée/.test(m))).toBe(false)
  })
  it('signé hors Propryo : signée entre la déclaration et la purge → déclaration ABANDONNÉE (archivée externe-retire), session rétablie, signature récupérée, on le dit', async () => {
    const w = monde({ relais: [{ status: 'pending' }, { status: 'completed', signers: [] }] })
    await w.sessionExpireeSigneHors('D-101')
    expect(w.window._bailExtEtatRelais).toBe('pending-invalidee')
    // l'enregistrement de la déclaration (ce que fait _bailExterneAppliquer) : la session est archivée, le bail devient externe
    const b = w.DB.baux['D-101']
    const arch = BSE.archiverSignatures(b, { now: '2026-10-07T08:00:00Z', auteur: 'Didier', motif: 'remplace-par-externe', etatRelais: 'pending-invalidee' }).archive
    b.signaturesAnnulees = [arch]
    b.signatures = BSE.declarerSignatureExterne(b, { date: '2026-09-01', origine: 'session-expiree', now: '2026-10-07T08:00:00Z' })
    await w._bailExterneApresSave('D-101', { action: 'declarer' })
    expect(deletes(w)).toHaveLength(0)
    expect(completes(w)).toEqual([['complete', 'D-101', 'T1']])
    expect(BSE.etatSignatureBail(w.DB.baux['D-101']).etat).not.toBe('externe')
    const ann = w.DB.baux['D-101'].signaturesAnnulees
    expect(ann).toHaveLength(1)
    expect(ann[0]).toMatchObject({ motif: 'externe-retire', raison: 'signe-a-distance-pendant-la-declaration' })
    expect(w.log.toasts.some(([m]) => /déclaration « signé hors Propryo » est abandonnée/.test(m))).toBe(true)
  })
  it('signé hors Propryo : session toujours pending à l\'enregistrement → purge gardée → DELETE (204) une seule fois', async () => {
    const w = monde({ relais: { status: 'pending' } })
    await w.sessionExpireeSigneHors('D-101')
    w.DB.baux['D-101'].signatures = BSE.declarerSignatureExterne({}, { date: '2026-09-01', origine: 'session-expiree', now: '2026-10-07T08:00:00Z' })
    await w._bailExterneApresSave('D-101', { action: 'declarer' })
    expect(deletes(w)).toEqual([['delete', 'S1', 'T1']])
  })
  it('récupération déjà en cours (__remoteCompleting) : _rsPreflight refuse, annuler et « signé hors Propryo » ne font rien', async () => {
    const w = monde({ relais: { status: 'pending' }, completing: true })
    expect(await w._rsPreflight('D-101')).toMatchObject({ ok: false, raison: 'completion-en-cours' })
    await w.annulerSessionSignature('D-101')
    await w.sessionExpireeSigneHors('D-101')
    expect(w.log.appels).not.toContain('poll')
    expect(w.DB.baux['D-101'].signaturesAnnulees).toBeUndefined()
    expect(w.log.appels.find(a => Array.isArray(a) && a[0] === 'openBail')).toBeUndefined()
    expect(deletes(w)).toHaveLength(0)
  })
})

describe('🟠1 — _bailExterneRecontrole : état relu au relais juste avant d\'enregistrer la déclaration', () => {
  const EXT = { action: 'declarer' }
  it('pas de déclaration, ou pas de session : on continue sans contrôle', () => {
    const w = monde()
    expect(w._bailExterneRecontrole('D-101', { action: null }, () => {})).toBe('')
    const w2 = monde({ bail: { ref: 'D-101' } })
    expect(w2._bailExterneRecontrole('D-101', EXT, () => {})).toBe('')
  })
  it('récupération en cours → refus immédiat', () => {
    const w = monde({ completing: true })
    expect(w._bailExterneRecontrole('D-101', EXT, () => { throw new Error('jamais') })).toBe('completion')
    expect(w.log.toasts[0][1]).toBe('err')
  })
  it('session encore pending → contrôle puis relance ; le passage relancé consomme le jeton (une seule fois)', async () => {
    const w = monde({ relais: { status: 'pending' } })
    let relances = 0
    const relancer = () => { relances++; expect(w._bailExterneRecontrole('D-101', EXT, relancer)).toBe('') }
    expect(w._bailExterneRecontrole('D-101', EXT, relancer)).toBe('controle')
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0))
    expect(relances).toBe(1)
    expect(w.window._bailExtEtatRelais).toBe('pending-invalidee')
    expect(typeof w.window._bailExtPurge).toBe('function')
    // jeton consommé : un nouvel enregistrement refait le contrôle
    expect(w._bailExterneRecontrole('D-101', EXT, () => {})).toBe('controle')
  })
  it('signée entre-temps → signature récupérée, fenêtre fermée, déclaration abandonnée (aucune relance), on le dit', async () => {
    const w = monde({ relais: { status: 'completed', signers: [] } })
    let relances = 0
    expect(w._bailExterneRecontrole('D-101', EXT, () => relances++)).toBe('controle')
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0))
    expect(relances).toBe(0)
    expect(completes(w)).toHaveLength(1)
    expect(w.log.appels).toContain('closeWizard')
    expect(w.log.toasts.some(([m]) => /entre-temps.*déclaration « signé hors Propryo » est abandonnée/.test(m))).toBe(true)
  })
  it('relais injoignable → rien n\'est enregistré (aucune relance)', async () => {
    const w = monde({ relaisThrows: true })
    let relances = 0
    w._bailExterneRecontrole('D-101', EXT, () => relances++)
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0))
    expect(relances).toBe(0)
  })
  it('câblage : saveBail appelle le contrôle après le refus de secours et AVANT toute écriture', () => {
    const sb = extraire(P1, 'function saveBail(')
    const iRefus = sb.indexOf('_bailExterneRefusSecours('), iCtrl = sb.indexOf('_bailExterneRecontrole('), iAppl = sb.indexOf('_bailExterneAppliquer(')
    expect(iRefus).toBeGreaterThan(0); expect(iCtrl).toBeGreaterThan(iRefus); expect(iAppl).toBeGreaterThan(iCtrl)
    expect(sb).toMatch(/_bailValidPending = _pendingVal/)
  })
})

describe('🟠2 — purge vérifiée : échec signalé, marqueur, nouvel essai', () => {
  it('suppression refusée → marqueur purgeEchouee sur l\'archive, file locale (avec jeton), avertissement', async () => {
    const w = monde({ deleteOk: false })
    await w.annulerSessionSignature('D-101')
    const a = w.DB.baux['D-101'].signaturesAnnulees[0]
    expect(a.purgeEchouee).toBe(true)
    expect(a.signatures.remoteSession.ownerToken).toBeNull()        // 🟡9 : jamais de jeton dans l'archive synchronisée
    expect(file(w)).toEqual([expect.objectContaining({ ref: 'D-101', sessionId: 'S1', ownerToken: 'T1' })])
    expect(w.log.toasts.some(([m, t]) => /n'a pas pu être supprimée du relais/.test(m) && t === 'warn')).toBe(true)
  })
  it('nouvel essai réussi → DELETE, marqueur levé, file vidée', async () => {
    const w = monde({ deleteOk: false, bail: BAIL(RS({ createdAt: new Date().toISOString() })) })
    await w.annulerSessionSignature('D-101')
    w.window.__rsPurgesEnCours = false
    w._bsRelayDeleteSession = async (b, id, tok) => { w.log.appels.push(['delete', id, tok]); return true }
    const n0 = deletes(w).length
    expect(await w._rsPurgesRetenter()).toBe(true)
    expect(deletes(w)).toHaveLength(n0 + 1)
    const a = w.DB.baux['D-101'].signaturesAnnulees[0]
    expect(a.purgeEchouee).toBeUndefined()
    expect(a.purgeeLe).toBeTruthy()
    expect(file(w)).toEqual([])
  })
  it('nouvel essai encore en échec → l\'entrée reste en file ; au-delà du TTL du relais elle est retirée sans DELETE', async () => {
    const w = monde({ deleteOk: false, bail: BAIL(RS({ createdAt: new Date().toISOString() })) })
    await w.annulerSessionSignature('D-101')
    expect(await w._rsPurgesRetenter()).toBe(false)
    expect(file(w)).toHaveLength(1)
    const f = file(w); f[0].createdAt = '2026-01-01T00:00:00.000Z'; w.localStorage.setItem('_test_immotrack_rs_purges', JSON.stringify(f))
    const n = deletes(w).length
    expect(await w._rsPurgesRetenter()).toBe(true)
    expect(deletes(w)).toHaveLength(n)
    expect(file(w)).toEqual([])
  })
  it('état du relais indéterminé au moment de la purge → pas de DELETE, mise en file', async () => {
    const w = monde({ relais: [{ status: 'expired' }, { status: 'expired' }, null] })
    await w.annulerSessionSignature('D-101')
    expect(deletes(w)).toHaveLength(0)
    expect(file(w)).toHaveLength(1)
  })
  it('_bsRelayDeleteSession (vrai code) : true sur 204 et 404, false sur 401, 500 ou réseau', async () => {
    const src = extraire(P1, 'async function _bsRelayDeleteSession(')
    const essai = async (rep) => {
      const sb = { fetch: async () => { if (rep === 'throw') throw new Error('réseau'); return { status: rep } }, console: { warn() {} }, encodeURIComponent }
      vm.createContext(sb); vm.runInContext(src, sb)
      return sb._bsRelayDeleteSession('https://r/', 'S1', 'T1')
    }
    expect(await essai(204)).toBe(true); expect(await essai(404)).toBe(true)
    expect(await essai(401)).toBe(false); expect(await essai(500)).toBe(false); expect(await essai('throw')).toBe(false)
  })
  it('câblage : _pollRemoteSignSessions retente les purges ; la relance (openRemoteSignModal) passe par la purge gardée', () => {
    expect(extraire(P1, 'async function _pollRemoteSignSessions(')).toMatch(/_rsPurgesRetenter\(\)/)
    const o = extraire(P1, 'async function openRemoteSignModal(')
    expect(o).toMatch(/await _pf\.purge\(\)/)
    expect(o).toMatch(/'completed'/)
  })
})

describe('🟡9 — le jeton propriétaire ne part jamais dans une archive', () => {
  it('archiverSignatures met ownerToken à null (le bail d\'origine garde le sien)', () => {
    const b = BAIL()
    const { archive } = BSE.archiverSignatures(b, { motif: 'session-annulee' })
    expect(archive.signatures.remoteSession.ownerToken).toBeNull()
    expect(archive.signatures.remoteSession.sessionId).toBe('S1')
    expect(b.signatures.remoteSession.ownerToken).toBe('T1')
  })
})
