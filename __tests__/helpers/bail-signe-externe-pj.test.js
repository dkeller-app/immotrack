// BAIL-EN-COURS-SIGNE-HORS-PROPRYO étape 3 — le PDF facultatif d'un bail signé hors Propryo est un DOCUMENT À CÔTÉ du bail
// (jamais dans bail.signatures : la ligne cloud est verrouillée). Vrai code d'app-part1/2 exécuté dans un vm.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'
import { collectBackupFiles } from '../../js/core/backup.js'

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
const fn = (src, nom, asy = false) => extraire(src, (asy ? 'async ' : '') + 'function ' + nom + '(')
const NOMS = [['_bailEtatSig'], ['_bailScanDocsExternes'], ['_bailScanExterne'], ['_bailScansExternesOrphelins'], ['_bailScanFmtTaille'],
  ['_bailScanExterneDeposer', 1], ['_bailExterneApresSave', 1], ['_bailExterneScanExistant'], ['_bailExternePjAfficher'], ['_bailExterneRetirerPj'], ['_bailScanExterneSupprimerDoc', 1], ['_bailScanExterneRetraitMsg']]

const EXT = (extra = {}) => ({ ref: 'D-101', debut: '2024-03-01', ...extra, signatures: BSE.declarerSignatureExterne({}, { date: '2024-02-20', now: '2026-10-06T08:00:00Z' }) })
const SIGNED_AT = '2024-02-20T12:00:00.000Z'
const doc = (o) => ({ id: 1, parentType: 'bail', parentId: 'D-101', parentRef: 'D-101', logRef: 'D-101', category: 'bail', nature: 'bail-signe-externe', bailSignedAt: SIGNED_AT, bailDebut: '2024-03-01', uploadedAt: '2026-10-06T08:00:00Z', name: 's.pdf', originalName: 's.pdf', size: 1200, ...o })

function monde({ baux = { 'D-101': EXT() }, documents = [], saveFails = false, dom = {} } = {}) {
  const calls = [], toasts = [], confirms = [], reponses = []
  let nid = 100
  const sb = {
    DB: { baux, documents }, window: { BailSignatureEtat: BSE }, calls, toasts, confirms, reponses,
    v: (id) => (dom[id] && dom[id].value) || '', el: (id) => dom[id] || null,
    showToast: (m, t) => toasts.push([m, t]), confirm2: (m) => { confirms.push(m); return reponses.length ? reponses.shift() : true },
    saveDB: () => { calls.push('saveDB') }, _refreshAfterMutation: () => calls.push('refresh'),
    _attachmentSaveForEntity: async (parent, f) => {
      calls.push(['save', JSON.parse(JSON.stringify(parent))])
      if (saveFails) throw new Error('IndexedDB indisponible')
      const d = { id: ++nid, parentType: parent.type, parentId: parent.id, parentRef: parent.ref, logRef: parent.logRef, category: parent.category, name: f.name, originalName: f.name, mime: f.mime, size: f.size, uploadedAt: '2026-10-06T09:00:00Z' }
      sb.DB.documents.push(d); return d
    },
    _attachmentDelete: async (id) => { calls.push(['del', id]); const d = sb.DB.documents.find(x => x.id === id); if (d) d._deleted = true; return true },
    _attachmentLoadBinary: async () => 'data:application/pdf;base64,QQ==',
    Date, JSON, Array, Object, String, Number, console,
  }
  vm.createContext(sb)
  vm.runInContext('let _bailExtFichier = null, _bailExtRetirer = false;\n' + NOMS.map(([n, a]) => fn(P1, n, !!a)).join('\n'), sb)
  sb.setPending = (f, r) => { sb._bailExtFichier_ = f; vm.runInContext('_bailExtFichier = __f; _bailExtRetirer = __r', Object.assign(sb, { __f: f || null, __r: !!r })) }
  sb.pending = () => vm.runInContext('({f: _bailExtFichier, r: _bailExtRetirer})', sb)
  return sb
}
const FICHIER = { name: 'Bail-D-101-signe.pdf', mime: 'application/pdf', size: 1258291, dataB64: 'data:application/pdf;base64,QQ==' }

describe('_bailScanExterne — le lien passe par signedAt (comme journalDuBail)', () => {
  it('trouve le document vivant le plus récent de la déclaration courante', () => {
    const w = monde({ documents: [doc({ id: 1, uploadedAt: '2026-10-01T00:00:00Z' }), doc({ id: 2, uploadedAt: '2026-10-05T00:00:00Z' })] })
    expect(w._bailScanExterne('D-101').id).toBe(2)
  })
  it('ignore : tombstone, autre date de signature, autre ref, autre nature, autre type de parent', () => {
    const w = monde({ documents: [doc({ id: 1, _deleted: true }), doc({ id: 2, bailSignedAt: '2024-02-18T12:00:00.000Z' }), doc({ id: 3, parentRef: 'D-202' }),
      doc({ id: 4, nature: 'autre' }), doc({ id: 5, parentType: 'logement' })] })
    expect(w._bailScanExterne('D-101')).toBeNull()
  })
  it('espace partagé : le PDF d\'un autre espace n\'est pas rattaché', () => {
    const w = monde({ baux: { 'D-101': EXT({ _espaceId: 'E1' }) }, documents: [doc({ id: 1, _espaceId: 'E2' }), doc({ id: 2, _espaceId: 'E1' })] })
    expect(w._bailScanExterne('D-101').id).toBe(2)
    expect(monde({ documents: [doc({ _espaceId: 'E2' })] })._bailScanExterne('D-101')).toBeNull()
  })
  it('clé « ref@@espace » : la ref nue sert à retrouver le document', () => {
    const w = monde({ baux: { 'D-101@@E1': EXT({ _espaceId: 'E1' }) }, documents: [doc({ _espaceId: 'E1' })] })
    expect(w._bailScanExterne('D-101@@E1')).not.toBeNull()
  })
  it('bail non externe (électronique, non signé) : jamais de scan externe', () => {
    const elec = { ref: 'D-101', signatures: { signedAt: SIGNED_AT, mode: 'avec-locataire' } }
    expect(monde({ baux: { 'D-101': elec }, documents: [doc()] })._bailScanExterne('D-101')).toBeNull()
    expect(monde({ baux: { 'D-101': { ref: 'D-101' } }, documents: [doc()] })._bailScanExterne('D-101')).toBeNull()
  })
})

describe('_bailScansExternesOrphelins — PDF d\'une déclaration précédente du MÊME bail', () => {
  it('re-datation / décoche : l\'ancien PDF reste, rattaché au même bail (même début)', () => {
    const b = EXT(); b.signatures = BSE.declarerSignatureExterne(b, { date: '2024-02-18', now: '2026-10-06T08:00:00Z' })   // re-datée
    const w = monde({ baux: { 'D-101': b }, documents: [doc({ id: 1 })] })
    expect(w._bailScansExternesOrphelins('D-101', b).map(d => d.id)).toEqual([1])
    expect(w._bailScanExterne('D-101')).toBeNull()
  })
  it('bail décoché (non signé) : le PDF est conservé et listé', () => {
    const b = { ref: 'D-101', debut: '2024-03-01' }
    expect(monde({ baux: { 'D-101': b }, documents: [doc({ id: 1 })] })._bailScansExternesOrphelins('D-101', b)).toHaveLength(1)
  })
  it('jamais le PDF d\'un locataire PRÉCÉDENT du logement (autre date de début)', () => {
    const b = { ref: 'D-101', debut: '2026-09-01' }
    expect(monde({ baux: { 'D-101': b }, documents: [doc({ id: 1, bailDebut: '2019-05-01' })] })._bailScansExternesOrphelins('D-101', b)).toEqual([])
  })
  it('la déclaration courante n\'est pas un orphelin', () => {
    const b = EXT()
    expect(monde({ documents: [doc()] })._bailScansExternesOrphelins('D-101', b)).toEqual([])
  })
})

describe('_bailScanExterneDeposer — document à côté du bail, jamais dans signatures', () => {
  it('rattaché au BAIL (parentType « bail », ref nue, category « bail »), marqué nature / signedAt / début ; le bail n\'est PAS modifié', async () => {
    const w = monde()
    const avant = JSON.stringify(w.DB.baux['D-101'])
    expect(await w._bailScanExterneDeposer('D-101', FICHIER)).toBe(true)
    expect(JSON.stringify(w.DB.baux['D-101'])).toBe(avant)          // ni signatures, ni pjDocId, ni _modifiedAt : la ligne verrouillée n'est jamais touchée
    expect(w.calls[0]).toEqual(['save', { type: 'bail', id: 'D-101', ref: 'D-101', logRef: 'D-101', category: 'bail' }])
    const d = w.DB.documents[0]
    expect(d).toMatchObject({ nature: 'bail-signe-externe', bailSignedAt: SIGNED_AT, bailDebut: '2024-03-01' })
    expect(d).not.toHaveProperty('_espaceId')
    expect(w.calls).toContain('saveDB')
    expect(w._bailScanExterne('D-101').id).toBe(d.id)
  })
  it('jamais parentType « edl » / « logement » pour le bail', async () => {
    const w = monde(); await w._bailScanExterneDeposer('D-101', FICHIER)
    expect(w.DB.documents[0].parentType).toBe('bail')
  })
  it('partage SCI : _espaceId du bail reporté sur le document', async () => {
    const w = monde({ baux: { 'D-101@@E1': EXT({ _espaceId: 'E1' }) } })
    await w._bailScanExterneDeposer('D-101@@E1', FICHIER)
    expect(w.DB.documents[0]._espaceId).toBe('E1')
    expect(w.calls[0][1].ref).toBe('D-101')   // ref nue
  })
  it('remplacer : nouveau document, tombstone de l\'ancien (jamais réécrit), purge par _attachmentDelete', async () => {
    const w = monde({ documents: [doc({ id: 1 })] })
    await w._bailScanExterneDeposer('D-101', { ...FICHIER, name: 'v2.pdf' })
    expect(w.calls.find(c => Array.isArray(c) && c[0] === 'del')).toEqual(['del', 1])
    expect(w.DB.documents.find(d => d.id === 1)._deleted).toBe(true)
    expect(w._bailScanExterne('D-101').originalName).toBe('v2.pdf')
  })
  it('échec du dépôt : le bail reste déclaré signé, message « déposer le PDF plus tard », rien d\'orphelin, pas d\'exception', async () => {
    const w = monde({ saveFails: true })
    const avant = JSON.stringify(w.DB.baux['D-101'])
    expect(await w._bailScanExterneDeposer('D-101', FICHIER)).toBe(false)
    expect(JSON.stringify(w.DB.baux['D-101'])).toBe(avant)
    expect(w.DB.documents).toEqual([])
    expect(w.toasts[0][0]).toMatch(/bien enregistré comme signé hors Propryo/)
    expect(w.toasts[0][0]).toMatch(/plus tard/)
  })
  it('refusé sur un bail qui n\'est pas déclaré signé hors Propryo', async () => {
    const w = monde({ baux: { 'D-101': { ref: 'D-101', signatures: { signedAt: SIGNED_AT, mode: 'avec-locataire' } } } })
    expect(await w._bailScanExterneDeposer('D-101', FICHIER)).toBe(false)
    expect(w.calls).toEqual([])
  })
})

describe('_bailExterneApresSave — dépôt APRÈS l\'enregistrement', () => {
  it('fichier en attente → déposé, état en attente remis à zéro', async () => {
    const w = monde(); w.setPending(FICHIER, false)
    await w._bailExterneApresSave('D-101', { action: 'declarer' })
    expect(w.DB.documents).toHaveLength(1)
    expect(w.pending()).toEqual({ f: null, r: false })
    expect(w.calls).toContain('refresh')
  })
  it('aucun fichier : rien (le PDF est facultatif, jamais bloquant)', async () => {
    const w = monde()
    await w._bailExterneApresSave('D-101', { action: 'declarer' })
    expect(w.DB.documents).toEqual([]); expect(w.toasts).toEqual([])
  })
  it('« Retirer » : le PDF existant est retiré (tombstone)', async () => {
    const w = monde({ documents: [doc({ id: 1 })] }); w.setPending(null, true)
    await w._bailExterneApresSave('D-101', { action: null })
    expect(w.DB.documents[0]._deleted).toBe(true)
  })
  it('bail non externe (décoche dans le même enregistrement) : aucun dépôt', async () => {
    const w = monde({ baux: { 'D-101': { ref: 'D-101' } } }); w.setPending(FICHIER, false)
    await w._bailExterneApresSave('D-101', { action: 'retirer' })
    expect(w.DB.documents).toEqual([])
    expect(w.pending().f).toBeNull()
  })
  it('re-déclaration : propose de RÉUTILISER le PDF de la déclaration précédente — copié dans un nouveau document, ancien tombstoné', async () => {
    const b = EXT(); b.signatures = BSE.declarerSignatureExterne(b, { date: '2024-02-18', now: '2026-10-06T08:00:00Z' })
    const w = monde({ baux: { 'D-101': b }, documents: [doc({ id: 1 })] })
    await w._bailExterneApresSave('D-101', { action: 'redater' })
    expect(w.confirms[0]).toMatch(/déclaration précédente/)
    expect(w._bailScanExterne('D-101').bailSignedAt).toBe('2024-02-18T12:00:00.000Z')
    expect(w.DB.documents.find(d => d.id === 1)._deleted).toBe(true)
  })
  it('refus de la réutilisation : l\'ancien PDF reste tel quel', async () => {
    const b = EXT(); b.signatures = BSE.declarerSignatureExterne(b, { date: '2024-02-18', now: '2026-10-06T08:00:00Z' })
    const w = monde({ baux: { 'D-101': b }, documents: [doc({ id: 1 })] }); w.reponses.push(false)
    await w._bailExterneApresSave('D-101', { action: 'redater' })
    expect(w.DB.documents).toHaveLength(1); expect(w.DB.documents[0]._deleted).toBeUndefined()
  })
})

describe('modale « Modifier le bail » — affichage du fichier en attente', () => {
  const dom = () => ({ 'b-externe-pj-nom': { textContent: '' }, 'b-externe-pj-choisir': { textContent: '' }, 'b-externe-pj-retirer': { style: {} }, 'b-edit-ref': { value: 'D-101' } })
  it('aucun fichier → « Choisir un PDF », « Retirer » masqué', () => {
    const d = dom(); const w = monde({ dom: d }); w._bailExternePjAfficher()
    expect(d['b-externe-pj-nom'].textContent).toBe('Aucun fichier')
    expect(d['b-externe-pj-choisir'].textContent).toBe('Choisir un PDF')
    expect(d['b-externe-pj-retirer'].style.display).toBe('none')
  })
  it('fichier en attente → nom · taille, « Remplacer » + « Retirer »', () => {
    const d = dom(); const w = monde({ dom: d }); w.setPending(FICHIER, false); w._bailExternePjAfficher()
    expect(d['b-externe-pj-nom'].textContent).toContain('Bail-D-101-signe.pdf')
    expect(d['b-externe-pj-nom'].textContent).toContain('1,2 Mo')
    expect(d['b-externe-pj-choisir'].textContent).toBe('Remplacer')
    expect(d['b-externe-pj-retirer'].style.display).toBe('')
  })
  it('PDF déjà déposé → affiché ; « Retirer » le marque à retirer à l\'enregistrement (rien n\'est supprimé avant)', () => {
    const d = dom(); const w = monde({ dom: d, documents: [doc({ id: 1 })] })
    w._bailExternePjAfficher()
    expect(d['b-externe-pj-nom'].textContent).toContain('s.pdf')
    w._bailExterneRetirerPj()
    expect(w.pending().r).toBe(true)
    expect(d['b-externe-pj-nom'].textContent).toMatch(/sera retiré/)
    expect(w.DB.documents[0]._deleted).toBeUndefined()
  })
})

describe('branchement dans le vrai code', () => {
  const S = extraire(P1, 'function saveBail(')
  it('saveBail dépose le PDF APRÈS avoir écrit le bail (DB.baux[ref] = bail puis _bailExterneApresSave)', () => {
    expect(S.indexOf('DB.baux[ref] = bail;')).toBeGreaterThan(0)
    expect(S.indexOf('_bailExterneApresSave(ref, _ext)')).toBeGreaterThan(S.indexOf('DB.baux[ref] = bail;'))
    expect(S.indexOf('_bailExterneApresSave(ref, _ext)')).toBeGreaterThan(S.indexOf("showToast('Bail enregistré'"))
  })
  it('aperçu : le PDF déposé s\'ouvre en priorité (fiche, rBaux), sinon le document établi par Propryo', () => {
    expect(extraire(P1, 'function previewBailRef(')).toMatch(/_bailScanExterne\(ref, bail\)\) \{ _bailScanExterneOuvrir\(ref\); return; \}/)
    expect(extraire(P1, 'function previewSignedBailRef(')).toMatch(/_bailScanExterne\(ref, bail\)\) \{ _bailScanExterneOuvrir\(ref\); return; \}/)
  })
  it('Documents › Bail : Ouvrir / Remplacer / Retirer (avec PDF), « Ajouter le PDF » (sans) ; PDF précédents listés', () => {
    const D = extraire(P2, 'function _renderLogFichePanelDocuments(')
    for (const m of ['_bailScanExterneOuvrir(', '_bailScanExterneChoisir(', '_bailScanExterneRetirerRef(', 'Ajouter le PDF', '_bailScansExternesOrphelins(ref, bail)']) expect(D, m).toContain(m)
  })
  it('menu du bail : Ouvrir / Remplacer / Retirer / Ajouter (téléphone compris)', () => {
    const M = extraire(P1, 'function openBailMenu(')
    for (const m of ['Ouvrir le PDF du bail signé', 'Remplacer le PDF du bail signé', 'Retirer le PDF du bail signé', 'Ajouter le PDF du bail signé']) expect(M, m).toContain(m)
  })
  it('l\'état en attente est remis à zéro à l\'ouverture du formulaire (pas de fichier d\'un autre bail)', () => {
    expect(extraire(P1, 'function _bailRenderSignatureDateField(')).toMatch(/_bailExtFichier = null; _bailExtRetirer = false;/)
  })
})

describe('sauvegarde : le PDF du bail externe suit les autres documents (cloudKey)', () => {
  it('collectBackupFiles inclut le document « bail » porteur d\'une clé cloud, dans le dossier du bail', () => {
    const db = { documents: [doc({ id: 1, cloudKey: 'esp/ent/files/bail.pdf' })], baux: {}, logements: [{ ref: 'D-101' }], entites: [], edl: [] }
    const out = collectBackupFiles(db, 0)
    expect(out.map(f => f.key)).toContain('esp/ent/files/bail.pdf')
  })
})
