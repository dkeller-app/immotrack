// BAIL-EN-COURS-SIGNE-HORS-PROPRYO §5.2 — l'état de signature d'un bail et la déclaration « signé hors Propryo ».
// Module pur js/core/bail-signature-etat.js + son miroir IIFE (window.BailSignatureEtat) ; gardes « preuve électronique »
// du VRAI code (app-part1 : __immoArchiveBailPdf, _regenBailCertificate) ; clause garage de bail-echeance (module ET miroir).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import {
  etatSignatureBail, preuveElectronique, estSigneExterne, declarerSignatureExterne, retirerSignatureExterne,
  archiverSignatures, dateJourValide, libelleSignatureBail, FORMAT_SIGNATURE_EXTERNE
} from '../../js/core/bail-signature-etat.js'
import { FORMAT_SIGNATURES } from '../../js/core/bail-paraphes.js'
import { bailSigneComplet } from '../../js/core/bail-modifications.js'
import { garageContratAppReconductible } from '../../js/core/bail-echeance.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const NOW = '2026-10-06T08:30:00.000Z'

describe('etatSignatureBail', () => {
  it('non signé', () => {
    expect(etatSignatureBail(null).etat).toBe('non')
    expect(etatSignatureBail({}).etat).toBe('non')
    expect(etatSignatureBail({ signatures: {} }).conclu).toBe(false)
    expect(etatSignatureBail({ signatures: { mode: 'externe' } }).etat).toBe('non')   // pas de signedAt : rien
  })
  it('partiel : bailleur-seul (le constat 0.3 : jamais « signé »)', () => {
    const r = etatSignatureBail({ signatures: { signedAt: '2026-09-01T10:00:00Z', mode: 'bailleur-seul' } })
    expect(r).toEqual({ etat: 'partiel', conclu: false, date: '2026-09-01' })
  })
  it('électronique : avec-locataire, distance et ancien format sans mode', () => {
    for (const mode of ['avec-locataire', 'distance', undefined]) {
      const r = etatSignatureBail({ signatures: { signedAt: '2026-09-01T10:00:00Z', mode } })
      expect(r.etat, String(mode)).toBe('electronique')
      expect(r.conclu).toBe(true)
    }
  })
  it('externe : conclu, date = date déclarée', () => {
    const r = etatSignatureBail({ signatures: { signedAt: '2024-02-20T12:00:00.000Z', mode: 'externe', externe: { date: '2024-02-20' } } })
    expect(r).toEqual({ etat: 'externe', conclu: true, date: '2024-02-20' })
  })
  it('conclu ≡ bailSigneComplet (même règle que le scellement cloud) sur tous les états', () => {
    const cas = [null, {}, { signatures: { signedAt: 'x', mode: 'bailleur-seul' } }, { signatures: { signedAt: 'x', mode: 'distance' } },
      { signatures: { signedAt: 'x', mode: 'externe' } }, { signatures: { signedAt: 'x' } }, { signatures: { mode: 'externe' } }]
    for (const b of cas) expect(etatSignatureBail(b).conclu, JSON.stringify(b)).toBe(bailSigneComplet(b))
  })
  it('preuveElectronique : seul l\'électronique a une preuve', () => {
    expect(preuveElectronique({ signatures: { signedAt: 'x', mode: 'avec-locataire' } })).toBe(true)
    expect(preuveElectronique({ signatures: { signedAt: 'x', mode: 'externe' } })).toBe(false)
    expect(preuveElectronique({ signatures: { signedAt: 'x', mode: 'bailleur-seul' } })).toBe(false)
    expect(preuveElectronique({})).toBe(false)
    expect(estSigneExterne({ signatures: { signedAt: 'x', mode: 'externe' } })).toBe(true)
  })
  it('libellés', () => {
    expect(libelleSignatureBail({ signatures: { signedAt: 'x', mode: 'externe' } })).toBe('Signé hors Propryo')
    expect(libelleSignatureBail({ signatures: { signedAt: 'x', mode: 'bailleur-seul' } })).toBe('Signature en cours')
    expect(libelleSignatureBail({})).toBe('Non signé')
  })
})

describe('declarerSignatureExterne', () => {
  const bail = { ref: 'D-101', debut: '2024-03-01', hc: 600 }
  const sg = declarerSignatureExterne(bail, { date: '2024-02-20', now: NOW, auteur: 'Didier' })
  it('forme cible : midi UTC, source externe, format 2, déclaration figée', () => {
    expect(sg.mode).toBe('externe')
    expect(sg.signatureSource).toBe('externe')
    expect(sg.format).toBe(2)
    expect(FORMAT_SIGNATURE_EXTERNE).toBe(FORMAT_SIGNATURES)
    expect(sg.signedAt).toBe('2024-02-20T12:00:00.000Z')
    expect(sg.persistedAt).toBe(NOW)
    expect(sg.externe).toEqual({ date: '2024-02-20', origine: 'papier', declareLe: NOW, declarePar: 'Didier' })
  })
  it('AUCUNE preuve fabriquée : ni signature, ni paraphe, ni preuve, ni empreinte, ni certificat, ni PDF, ni relais', () => {
    for (const k of ['finales', 'paraphes', 'parapheImg', 'parapheTimes', 'proof', 'contentHash', 'contentHashTerms', 'locked',
      'certRef', 'cloudPdfKey', 'remoteSession', 'signedBailleurAt', 'signedLocataireAt', 'pjDocId']) {
      expect(sg, k).not.toHaveProperty(k)
    }
    expect(sg.externe).not.toHaveProperty('pjDocId')
  })
  it('bail repris : origine « repris » ; origine explicite respectée ; date approximative notée', () => {
    expect(declarerSignatureExterne({ typeContrat: 'repris' }, { date: '2020-01-01', now: NOW }).externe.origine).toBe('repris')
    expect(declarerSignatureExterne(bail, { date: '2024-02-20', now: NOW, origine: 'session-expiree' }).externe.origine).toBe('session-expiree')
    expect(declarerSignatureExterne(bail, { date: '2024-02-20', now: NOW, origine: 'n-importe-quoi' }).externe.origine).toBe('papier')
    expect(declarerSignatureExterne({ typeContrat: 'repris' }, { date: '2020-01-01', now: NOW, dateApprox: true }).externe.dateApprox).toBe(true)
    expect(sg.externe).not.toHaveProperty('dateApprox')
  })
  it('date invalide refusée (vide, format, 31/02)', () => {
    for (const d of [undefined, '', '2024-2-20', '20/02/2024', '2024-02-31', '2024-13-01', 'hier']) {
      expect(() => declarerSignatureExterne(bail, { date: d, now: NOW }), String(d)).toThrow(/invalide/)
    }
    expect(dateJourValide('2024-02-29')).toBe(true)
    expect(dateJourValide('2023-02-29')).toBe(false)
  })
  it('le snapshot passé est copié sans signatures ni archives, et le bail n\'est pas modifié', () => {
    const b = { ref: 'D-101', hc: 600, signatures: { signedAt: 'x' }, signaturesAnnulees: [{}] }
    const snap = { ...b, locataires: [{ nom: 'A' }] }
    const s = declarerSignatureExterne(b, { date: '2024-02-20', now: NOW, snapshot: snap })
    expect(s.bailSnapshot.hc).toBe(600)
    expect(s.bailSnapshot.locataires[0].nom).toBe('A')
    expect(s.bailSnapshot).not.toHaveProperty('signatures')
    expect(s.bailSnapshot).not.toHaveProperty('signaturesAnnulees')
    s.bailSnapshot.locataires[0].nom = 'Z'
    expect(snap.locataires[0].nom).toBe('A')      // copie, pas une référence
    expect(b.signatures).toEqual({ signedAt: 'x' })
  })
  it('l\'objet produit est un bail « externe » pour etatSignatureBail et un bail conclu', () => {
    const r = etatSignatureBail({ signatures: sg })
    expect(r).toEqual({ etat: 'externe', conclu: true, date: '2024-02-20' })
  })
})

describe('retirerSignatureExterne / archiverSignatures', () => {
  const ext = { signatures: declarerSignatureExterne({ ref: 'D-101' }, { date: '2024-02-20', now: NOW, auteur: 'D' }) }
  it('archive complète (copie profonde) avec motif et auteur', () => {
    const { archive } = retirerSignatureExterne(ext, { now: '2026-10-07T00:00:00.000Z', auteur: 'Didier' })
    expect(archive.motif).toBe('externe-retire')
    expect(archive.par).toBe('Didier')
    expect(archive.at).toBe('2026-10-07T00:00:00.000Z')
    expect(archive.signatures).toEqual(ext.signatures)
    expect(archive.signatures).not.toBe(ext.signatures)
  })
  it('re-datation : motif transmis', () => {
    expect(retirerSignatureExterne(ext, { motif: 'externe-redate', now: NOW }).archive.motif).toBe('externe-redate')
  })
  it('jamais d\'archivage d\'une signature électronique par ce chemin', () => {
    expect(retirerSignatureExterne({ signatures: { signedAt: 'x', mode: 'avec-locataire' } }, {}).archive).toBeNull()
    expect(retirerSignatureExterne({}, {}).archive).toBeNull()
  })
  it('signature partielle + session à distance : résumé lisible, rien de détruit', () => {
    const b = { signatures: { signedAt: '2026-09-20T10:00:00Z', mode: 'bailleur-seul', finales: { b: 'data:x' },
      remoteSession: { createdAt: '2026-09-20T10:01:00Z', signers: [{ role: 'locataire', nom: 'M. X', signedAt: null }] } } }
    const { archive } = archiverSignatures(b, { motif: 'remplace-par-externe', now: NOW, auteur: 'D', etatRelais: 'expired' })
    expect(archive.motif).toBe('remplace-par-externe')
    expect(archive.etatRelais).toBe('expired')
    expect(archive.resume).toEqual({ envoyeeLe: '2026-09-20T10:01:00Z', signataires: [{ role: 'locataire', nom: 'M. X', signedAt: null }] })
    expect(archive.signatures.finales.b).toBe('data:x')
    expect(archive.signatures.remoteSession.signers).toHaveLength(1)
  })
})

describe('miroir IIFE (window.BailSignatureEtat) = module', () => {
  it('expose les mêmes fonctions, avec le même résultat', () => {
    const src = readFileSync(resolve(root, 'js/helpers/bail-signature-etat.global.js'), 'utf8')
    const win = {}
    vm.runInNewContext(src, { window: win, globalThis: win, self: win, console })
    const M = win.BailSignatureEtat
    expect(M).toBeTruthy()
    for (const k of ['etatSignatureBail', 'preuveElectronique', 'declarerSignatureExterne', 'retirerSignatureExterne', 'archiverSignatures']) expect(typeof M[k], k).toBe('function')
    const b = { signatures: { signedAt: '2024-02-20T12:00:00.000Z', mode: 'externe', externe: { date: '2024-02-20' } } }
    expect(JSON.stringify(M.etatSignatureBail(b))).toBe(JSON.stringify(etatSignatureBail(b)))
  })
})

// ── gardes « preuve électronique » : le VRAI code d'app-part1 ──────────────────────────────────────────────
function extraire(src, marqueur, ouvrante = '{') {
  const i = src.indexOf(marqueur)
  if (i < 0) throw new Error('introuvable : ' + marqueur)
  let j = src.indexOf(ouvrante, src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades non équilibrées : ' + marqueur)
}

describe('gardes « preuve électronique » (aucune fausse preuve sur un bail externe)', () => {
  const bailExterne = () => ({ ref: 'D-101', signatures: declarerSignatureExterne({ ref: 'D-101' }, { date: '2024-02-20', now: NOW }) })
  const bailElec = () => ({ ref: 'D-101', signatures: { signedAt: '2026-09-01T10:00:00Z', mode: 'avec-locataire' } })

  function archiveur(bail) {
    const appels = []
    const sandbox = {
      window: {}, DB: { baux: { 'D-101': bail } }, console, Blob, Uint8Array, Date, Array, Object, JSON,
      showToast: () => {}, saveDB: () => { appels.push('saveDB') },
      _archiveBailTerminee: () => {}, _uploadCloudRetry: async () => { appels.push('upload') }, _bailPreuveEnCours: () => null, _downloadSignedBailFallback: () => {},
      _cloudEntiteSeg: () => { appels.push('seg'); return 'seg' }, _cloudEntiteNomForBail: () => 'ent',
    }
    sandbox.window.__immoCloudUpload = async () => { appels.push('upload'); return 'k' }
    // Tout ce qui fabrique une preuve : si le code y arrive, il appelle l'un de ces noms.
    for (const n of ['_ddtAppendAnnexes', '_buildBailCertificatePdf', '_bailPresentielProof', '_sha256Hex', '_bailContentHash', '_downloadBlobAs'])
      sandbox[n] = async () => { appels.push(n); throw new Error('appelé : ' + n) }
    vm.createContext(sandbox)
    vm.runInContext(extraire(P1, 'window.__immoArchiveBailPdf = async function', '{').replace('window.__immoArchiveBailPdf = async function', 'window.__immoArchiveBailPdf = async function'), sandbox)
    return { run: () => sandbox.window.__immoArchiveBailPdf('D-101', new Blob(['%PDF'])), appels }
  }

  it('__immoArchiveBailPdf : un bail externe ne produit ni preuve, ni certificat, ni envoi', async () => {
    const bail = bailExterne()
    const a = archiveur(bail)
    await a.run()
    expect(a.appels).toEqual([])
    expect(Object.keys(bail.signatures).sort()).toEqual(Object.keys(bailExterne().signatures).sort())
    for (const k of ['proof', 'contentHash', 'certRef', 'cloudPdfKey']) expect(bail.signatures).not.toHaveProperty(k)
  })
  it('__immoArchiveBailPdf : sur un bail électronique le garde ne s\'applique PAS (le code va jusqu\'à l\'archivage)', async () => {
    const a = archiveur(bailElec())
    await a.run().catch(() => {})
    expect(a.appels).toContain('seg')     // le garde externe n'a pas court-circuité
  })

  function regen(bail) {
    const toasts = [], appels = []
    const sandbox = {
      DB: { baux: { 'D-101': bail } }, console, Date, Array, Object, String,
      showToast: (m, t) => toasts.push([m, t]),
      _buildBailCertificatePdf: async () => { appels.push('cert'); return new Blob(['x']) },
      _downloadBlobAs: () => appels.push('download'),
    }
    vm.createContext(sandbox)
    vm.runInContext(extraire(P1, 'async function _regenBailCertificate('), sandbox)
    return { run: () => sandbox._regenBailCertificate('D-101'), toasts, appels }
  }
  it('_regenBailCertificate : refus explicite pour un bail externe, même s\'il portait (à tort) une preuve', async () => {
    const bail = bailExterne()
    bail.signatures.proof = [{}]; bail.signatures.contentHash = 'abc'
    const r = regen(bail)
    await r.run()
    expect(r.appels).toEqual([])
    expect(r.toasts[0][0]).toMatch(/hors Propryo/)
  })
  it('_regenBailCertificate : un bail électronique avec preuve régénère toujours', async () => {
    const bail = bailElec(); bail.signatures.proof = [{}]; bail.signatures.contentHash = 'abc'
    const r = regen(bail)
    await r.run()
    expect(r.appels).toEqual(['cert', 'download'])
  })
  it('_buildBailCertificatePdf : refus en tête pour un bail externe', () => {
    const src = extraire(P1, 'async function _buildBailCertificatePdf(')
    expect(src).toMatch(/mode === 'externe'\) throw/)
  })
})

describe('clause de tacite reconduction des garages : jamais pour un bail externe (module ET miroir)', () => {
  const g = (mode) => ({ type: 'garage', signatures: { signedAt: '2026-10-01T12:00:00.000Z', mode } })
  const src = readFileSync(resolve(root, 'js/helpers/bail-echeance.global.js'), 'utf8')
  const win = {}
  vm.runInNewContext(src, { window: win, globalThis: win, self: win, console })
  const miroir = win.BailEcheance
  it('module : électronique postérieur au 04/09/2026 → oui ; externe → non', () => {
    expect(garageContratAppReconductible(g('avec-locataire'))).toBe(true)
    expect(garageContratAppReconductible(g('externe'))).toBe(false)
  })
  it('miroir global : idem', () => {
    expect(miroir.garageContratAppReconductible(g('distance'))).toBe(true)
    expect(miroir.garageContratAppReconductible(g('externe'))).toBe(false)
  })
})
