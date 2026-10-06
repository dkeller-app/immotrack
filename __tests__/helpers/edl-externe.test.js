// BAIL-EN-COURS-SIGNE-HORS-PROPRYO étape 5 — EDL fait hors Propryo : entrée DB.edl marquée `externe` + document du LOGEMENT (jamais de
// parentType 'edl' : CHECK cloud 0040). Vrai code d'app-part1/2 exécuté dans un vm ; lecteurs (matrice, DG, assistant de départ) réels.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'
import { edlSortieQuiFaitFoi } from '../../js/core/edl-parcours.js'
import { _calculerDelaiRestitution } from '../../js/core/gestion-dg-impayes.js'
import { mapToRow } from '../../js/core/store-mapping.js'

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
const N2 = [['_edlExterne'], ['_edlExtPj'], ['_edlExtOuvrir'], ['_edlExtGarde'], ['_edlExtLibelle'], ['_edlExtMeta'], ['_edlExtBoutons'], ['_edlExtEspace'],
  ['edlExterneCreer', 1], ['_edlExtDeposerPj', 1], ['_edlSens'], ['_edlEntreeDuBail'], ['delEDL']]

const LOG = { id: 7, ref: 'D-101', entity: 'SCI DEMO' }
const BAIL = (x = {}) => ({ ref: 'D-101', nom: 'Pierre Demo', debut: '2023-09-01', locataires: [{ nom: 'Pierre Demo' }, { nom: 'Anna Demo' }], ...x })

function monde({ edl = [], documents = [], bail = BAIL(), log = LOG, horsLigne = false, saveOk = true, depotKo = false, confirms = [] } = {}) {
  const j = { toasts: [], confirms: [], appels: [] }
  let n = 1000
  const sb = {
    DB: { logements: [log], baux: { 'D-101': bail }, edl, documents }, j,
    window: { BailSignatureEtat: BSE, __immoHorsLigne: horsLigne },
    nid: () => ++n, fd: (d) => String(d).slice(0, 10).split('-').reverse().join('/'), escHtml: (x) => String(x),
    showToast: (m, t) => j.toasts.push([m, t]),
    confirm2: (m) => { j.confirms.push(m); return confirms.length ? confirms.shift() : true },
    _isAlive: (o) => !!o && !o._deleted, _stamp: (o) => { o._modifiedAt = 'STAMP' },
    _auditLog: (...a) => j.appels.push(['audit', a.join('|')]), _undoOp: (l, f) => { j.appels.push(['undo', l]); f() },
    _undoToast: () => {}, _todayIsoLocal: () => '2026-10-06', td: () => '2026-10-06', _bailAuteurCourant: () => 'Didier',
    saveDB: (o) => { j.appels.push(['saveDB', o || null]); return saveOk }, _refreshAfterMutation: () => j.appels.push('refresh'), rEDLList: () => j.appels.push('rEDLList'),
    _attachmentSaveForEntity: async (parent, f) => {
      j.appels.push(['save', JSON.parse(JSON.stringify(parent))])
      if (depotKo) throw new Error('IndexedDB indisponible')
      const d = { id: ++n, parentType: parent.type, parentId: parent.id, parentRef: parent.ref, logRef: parent.logRef, category: parent.category, name: f.name, originalName: f.name, size: f.size }
      sb.DB.documents.push(d); return d
    },
    _handleAttachmentOpen: (id) => j.appels.push(['ouvrir', id]), _attachmentDelete: async () => { j.appels.push('ATTACHMENT_DELETE') },
    _lyQ: (x) => x, _bailScanFmtTaille: (x) => '1 Ko', _avenantLireFichier: async () => null,
    Date, JSON, Array, Object, String, Number, console, Promise,
  }
  vm.createContext(sb)
  vm.runInContext(N2.map(([nm, a]) => fn(P2, nm, !!a)).join('\n') + '\n' + fn(P1, '_bailScanFmtTaille').replace('_bailScanFmtTaille', '_bailScanFmtTailleReel'), sb)
  return sb
}
const FICHIER = { name: 'EDL-D-101-entree.pdf', mime: 'application/pdf', size: 2400000, dataB64: 'data:application/pdf;base64,QQ==' }

describe('edlExterneCreer — stockage', () => {
  it('entrée : DB.edl marquée externe, casse réelle « Entrée », pièces vides, AUCUNE signature simulée, locataires du bail figés', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: null })
    const e = w.DB.edl.find(x => x.id === id)
    expect(e).toMatchObject({ type: 'Entrée', date: '2023-09-01', logement: 'D-101', locataire: 'Pierre Demo & Anna Demo', pieces: [], signatures: {} })
    expect(e.signatures.signedAt).toBeUndefined()
    expect(e.externe).toMatchObject({ pjDocId: null, declarePar: 'Didier' })
    expect(e._modifiedAt).toBe('STAMP')
    expect(w.j.appels).toContainEqual(['undo', 'Ajout d\'un EDL d\'entrée fait hors Propryo'])
  })
  it('sortie : type « Sortie »', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'sortie', date: '2026-08-31', fichier: null })
    expect(w.DB.edl.find(x => x.id === id).type).toBe('Sortie')
  })
  it('PDF : document du LOGEMENT (jamais parentType edl), category edl, lié à l\'EDL, pjDocId posé', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    const e = w.DB.edl.find(x => x.id === id)
    const d = w.DB.documents[0]
    expect(d).toMatchObject({ parentType: 'logement', parentId: 7, parentRef: 'D-101', logRef: 'D-101', category: 'edl', nature: 'edl-externe', edlId: id })
    expect(w.DB.documents.some(x => x.parentType === 'edl')).toBe(false)
    expect(e.externe.pjDocId).toBe(d.id)
    expect(w._edlExtPj(e)).toBe(d)
    // l'EDL est écrit AVANT le dépôt du PDF
    const iEdl = w.j.appels.findIndex(a => Array.isArray(a) && a[0] === 'undo'), iSave = w.j.appels.findIndex(a => Array.isArray(a) && a[0] === 'save')
    expect(iEdl).toBeGreaterThanOrEqual(0); expect(iEdl).toBeLessThan(iSave)
  })
  it('espace partagé : _espaceId du bail posé sur l\'EDL ET sur le document', async () => {
    const w = monde({ bail: BAIL({ _espaceId: 'E1' }) })
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    expect(w.DB.edl.find(x => x.id === id)._espaceId).toBe('E1')
    expect(w.DB.documents[0]._espaceId).toBe('E1')
  })
  it('échec du dépôt du PDF : l\'EDL reste enregistré, message', async () => {
    const w = monde({ depotKo: true })
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    expect(id).not.toBeNull()
    expect(w.DB.edl[0].externe.pjDocId).toBeNull()
    expect(w.j.toasts.some(([m, t]) => /dépôt du PDF a échoué/.test(m) && t === 'err')).toBe(true)
  })
  it('refus : date absente / invalide / hors ligne / écriture refusée (rollback) / doublon refusé / futur refusé', async () => {
    const w = monde(); expect(await w.edlExterneCreer('D-101', { sens: 'entree', date: '' })).toBeNull()
    expect(await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-02-31' })).toBeNull()
    expect(w.DB.edl).toHaveLength(0)
    // HORS LIGNE (audit signé hors Propryo) : l'EDL est enregistré (étiquette « edl »), seule la pièce jointe est reportée — jamais toute la saisie bloquée.
    const h = monde({ horsLigne: true }); expect(await h.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })).not.toBeNull()
    expect(h.DB.edl).toHaveLength(1); expect(h.DB.documents).toHaveLength(0)
    expect(h.j.appels).toContainEqual(['saveDB', { quoi: 'edl' }])
    expect(h.j.toasts.some(([m]) => /Hors ligne : l'EDL est enregistré, mais le PDF n'a pas été joint/.test(m))).toBe(true)
    const k = monde({ saveOk: false }); expect(await k.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01' })).toBeNull()
    expect(k.DB.edl).toHaveLength(0)
    const f = monde({ confirms: [false] }); expect(await f.edlExterneCreer('D-101', { sens: 'entree', date: '2027-01-01' })).toBeNull()
    expect(f.j.confirms[0]).toMatch(/futur/)
    const dbl = monde({ edl: [{ id: 1, type: 'Entrée', date: '2023-09-01', logement: 'D-101' }], confirms: [false] })
    expect(await dbl.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01' })).toBeNull()
    expect(dbl.j.confirms[0]).toMatch(/existe déjà/)
    expect(dbl.DB.edl).toHaveLength(1)
  })
  it('un sens différent à la même date n\'est pas un doublon', async () => {
    const w = monde({ edl: [{ id: 1, type: 'Entrée', date: '2023-09-01', logement: 'D-101' }] })
    expect(await w.edlExterneCreer('D-101', { sens: 'sortie', date: '2023-09-01' })).not.toBeNull()
    expect(w.j.confirms).toHaveLength(0)
  })
})

describe('lecteurs — l\'EDL externe est trouvé SANS code spécifique', () => {
  it('matrice : _edlEntreeDuBail le retient (entrée du bail) ; la sortie ne compte pas ; l\'entrée du locataire précédent non plus', async () => {
    const w = monde()
    await w.edlExterneCreer('D-101', { sens: 'sortie', date: '2024-01-10' })
    expect(w._edlEntreeDuBail(BAIL(), LOG)).toBeNull()
    await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-08-20' })   // dans [début − 31 j, …[
    expect(w._edlEntreeDuBail(BAIL(), LOG)).not.toBeNull()
    const w2 = monde()
    await w2.edlExterneCreer('D-101', { sens: 'entree', date: '2021-01-05' })   // locataire précédent
    expect(w2._edlEntreeDuBail(BAIL(), LOG)).toBeNull()
  })
  it('edlSortieQuiFaitFoi retient la sortie externe ; délai de restitution du DG : 1 mois, 2 mois si dgRetenu', async () => {
    const w = monde()
    await w.edlExterneCreer('D-101', { sens: 'sortie', date: '2026-08-31' })
    expect(edlSortieQuiFaitFoi(BAIL(), w.DB.edl)).toBe(w.DB.edl[0])
    expect(_calculerDelaiRestitution(BAIL(), w.DB.edl)).toBe(1)
    expect(_calculerDelaiRestitution(BAIL({ dgRetenu: 120 }), w.DB.edl)).toBe(2)
  })
  it('cloud : ligne edl (type_edl, pieces=[], signed_at=null) et document de logement (parent_id résolu, category edl)', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    const ctx = { espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => 'uuid:' + p.join('|'), entiteByNom: new Map(), immeubleByNom: new Map(), logementByRef: new Map([['d-101', 'uuid:logement|d-101']]), documentByLegacy: new Map() }
    const r = mapToRow('edl', JSON.parse(JSON.stringify(w.DB.edl[0])), ctx)
    expect(r).toMatchObject({ type_edl: 'Entrée', date_edl: '2023-09-01', pieces: [], signed_at: null })
    expect(r.legacy_raw.externe.pjDocId).toBe(w.DB.documents[0].id)   // le marqueur voyage dans legacy_raw
    const dr = mapToRow('documents', JSON.parse(JSON.stringify(w.DB.documents[0])), ctx)
    expect(dr.parent_type).toBe('logement'); expect(dr.parent_id).toBe('uuid:logement|d-101'); expect(dr.legacy_raw.category).toBe('edl'); expect(dr.legacy_raw.nature).toBe('edl-externe')
    expect(id).toBe(w.DB.edl[0].id)
  })
})

describe('suppression — EDL et document dans la même opération annulable', () => {
  it('delEDL : tombstone de l\'EDL ET du document, sans _attachmentDelete (le cache IDB reste : annulation possible)', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    w.j.appels.length = 0
    w.delEDL(id, { confirme: true })
    const e = w.DB.edl.find(x => x.id === id)
    expect(e._deleted).toBe(true); expect(e.logement).toBe('D-101')
    expect(w.DB.documents[0]._deleted).toBe(true)
    expect(w.j.appels).not.toContain('ATTACHMENT_DELETE')
    expect(w.j.appels).toContainEqual(['saveDB', { quoi: 'edl' }])
    expect(w.j.appels.some(a => Array.isArray(a) && a[0] === 'undo' && /Suppression de l'EDL/.test(a[1]))).toBe(true)
    // une fois supprimé, plus aucun lecteur ne le voit
    expect(w._edlEntreeDuBail(BAIL(), LOG)).toBeNull()
  })
  it('EDL Propryo ordinaire : delEDL inchangé (aucun document touché)', () => {
    const w = monde({ edl: [{ id: 5, type: 'Entrée', date: '2023-09-01', logement: 'D-101', pieces: [] }], documents: [{ id: 9, parentType: 'logement', category: 'documents' }] })
    w.delEDL(5, { confirme: true })
    expect(w.DB.edl[0]._deleted).toBe(true); expect(w.DB.documents[0]._deleted).toBeUndefined()
  })
  it('la confirmation dit que c\'est un EDL fait hors Propryo', () => {
    const w = monde({ edl: [{ id: 5, type: 'Entrée', date: '2023-09-01', logement: 'D-101', pieces: [], externe: { pjDocId: null } }] })
    w.delEDL(5)
    expect(w.j.confirms[0]).toMatch(/hors Propryo/)
  })
})

describe('gardes — pas d\'éditeur, de visionneuse ni de PDF généré pour un EDL externe', () => {
  it('_edlExtGarde : ouvre le PDF (ou dit qu\'il n\'y en a pas) et rend true ; EDL ordinaire : false', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    expect(w._edlExtGarde(id)).toBe(true)
    expect(w.j.appels).toContainEqual(['ouvrir', w.DB.documents[0].id])
    const w2 = monde({ edl: [{ id: 5, type: 'Entrée', logement: 'D-101', pieces: [] }] })
    expect(w2._edlExtGarde(5)).toBe(false)
    const w3 = monde(); const id3 = await w3.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01' })
    expect(w3._edlExtGarde(id3)).toBe(true); expect(w3.j.toasts.at(-1)[0]).toMatch(/aucun PDF/)
  })
  it.each([['openEditEDL', 'async function openEditEDL(id) {'], ['edlOpenView', 'function edlOpenView(id) {'], ['edlOpenGallery', 'function edlOpenGallery(id) {'],
    ['downloadEDLPdfNative', 'async function downloadEDLPdfNative(id, opts) {'], ['_edlSharePhotos', 'async function _edlSharePhotos(id) {']])('%s commence par le garde', (_n, tete) => {
    const i = P2.indexOf(tete); expect(i).toBeGreaterThan(0)
    expect(P2.slice(i + tete.length, i + tete.length + 200)).toMatch(/_edlExtGarde\(id\)/)
  })
  it('boutons : Ouvrir (ou Ajouter le PDF) + Supprimer, jamais Modifier / Voir / PDF généré', async () => {
    const w = monde()
    const id = await w.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01', fichier: FICHIER })
    const html = w._edlExtBoutons(w.DB.edl.find(x => x.id === id), 'btn bs bb')
    expect(html).toMatch(/_edlExtOuvrir/); expect(html).toMatch(/delEDL/); expect(html).not.toMatch(/openEditEDL|edlOpenView|downloadEDLPdfNative/)
    const w2 = monde(); const id2 = await w2.edlExterneCreer('D-101', { sens: 'entree', date: '2023-09-01' })
    expect(w2._edlExtBoutons(w2.DB.edl.find(x => x.id === id2), 'btn bs bb')).toMatch(/Ajouter le PDF/)
  })
  it('edlLoadRef ignore les EDL externes ; rEDLList : badge « Hors Propryo » à la place de « Brouillon »', () => {
    expect(extraire(P2, 'async function edlLoadRef(')).toMatch(/!_edlExterne\(e\)/)
    const r = extraire(P2, 'function rEDLList(')
    expect(r).toMatch(/Hors Propryo/); expect(r).toMatch(/_ext \? _edlExtBoutons/)
  })
})
