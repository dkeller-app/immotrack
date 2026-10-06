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
const NOMS = [['_bailEtatSig'], ['_rsPreflight', 1], ['annulerSessionSignature', 1], ['sessionExpireeSigneHors', 1], ['_bailExterneApresSave', 1], ['_bailScanDocsExternes'], ['_bailScanExterne'], ['_bailScansExternesOrphelins']]

const RS = (extra = {}) => ({ sessionId: 'S1', ownerToken: 'T1', signUrl: 'u', relayUrl: 'https://r', status: 'expired', createdAt: '2026-09-01T08:00:00.000Z',
  signers: [{ role: 'locataire', nom: 'Pierre Demo', signedAt: null }], ...extra })
const BAIL = (rs = RS(), extraSig = {}) => ({ ref: 'D-101', nom: 'Pierre Demo', debut: '2026-09-01', signatures: { remoteSession: rs, ...extraSig } })

// relais : statut réel renvoyé par _bsRelayPollSession (ou exception)
function monde({ bail = BAIL(), relais = { status: 'expired' }, relaisThrows = false, confirms = [true], modal = true } = {}) {
  const log = { toasts: [], confirms: [], appels: [], modalHtml: null }
  const sb = {
    DB: { baux: { 'D-101': bail }, documents: [] }, window: { BailSignatureEtat: BSE }, log,
    _resolveRelayBase: (rs) => rs.relayUrl || 'https://defaut',
    _bsRelayPollSession: async () => { log.appels.push('poll'); if (relaisThrows) throw new Error('réseau'); return relais },
    _bsRelayDeleteSession: async (b, id) => { log.appels.push(['delete', id]) },
    _completeRemoteSign: async (ref, state) => { log.appels.push(['complete', ref]); delete sb.DB.baux[ref].signatures.remoteSession; sb.DB.baux[ref].signatures.signedAt = '2026-09-10T10:00:00.000Z'; sb.DB.baux[ref].signatures.mode = 'distance' },
    showToast: (m, t) => log.toasts.push([m, t]),
    confirm2: (m) => { log.confirms.push(m); return confirms.length ? confirms.shift() : true },
    _rsConfirmAnnulation: async (html) => { log.modalHtml = html; return modal },
    saveDB: () => log.appels.push('saveDB'), _refreshAfterMutation: () => log.appels.push('refresh'),
    _stamp: (o) => { o._modifiedAt = 'STAMP' }, _auditLog: (...a) => log.appels.push(['audit', a.join('|')]),
    _bailAuteurCourant: () => 'Didier', fd: (d) => d.split('-').reverse().join('/'), escHtml: (x) => String(x),
    openBail: (r) => log.appels.push(['openBail', r]), el: () => null, _bailExterneToggle: () => {},
    Date, JSON, Array, Object, String, Number, console, Promise, setTimeout,
  }
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
    expect(w.log.appels).toContainEqual(['complete', 'D-101'])
    expect(aSupprime(w)).toBe(false)
  })
  it('404 (expired) → on continue, rien à perdre ; purge() supprime la session', async () => {
    const w = monde({ relais: { status: 'expired' } })
    const r = await w._rsPreflight('D-101')
    expect(r).toMatchObject({ ok: true, etat: 'expired' })
    expect(aSupprime(w)).toBe(false)   // le preflight lui-même ne supprime JAMAIS
    await r.purge()
    expect(w.log.appels).toContainEqual(['delete', 'S1'])
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
    expect(w.log.appels).toContainEqual(['delete', 'S1'])
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
    expect(w.log.appels).toContainEqual(['delete', 'S1'])
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
    expect(w.log.appels).toContainEqual(['complete', 'D-101'])
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
