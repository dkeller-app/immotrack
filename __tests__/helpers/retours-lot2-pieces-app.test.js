// RETOURS 15/10 (lot 2, point 1) — bail signé hors Propryo, plusieurs pièces : VRAI code d'app-part1/2 exécuté dans un vm,
// avec le vrai module js/core/bail-pieces-externes.js. Dépôts après l'enregistrement, emplacement unique d'un acte de
// cautionnement par garant, « détenu en papier » (D2), prédicat « caution détenue », réutilisation des pièces d'une
// déclaration précédente en UNE question, rendu de la fiche échappé.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import * as BSE from '../../js/core/bail-signature-etat.js'
import * as BPX from '../../js/core/bail-pieces-externes.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8')
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8')
const P3 = readFileSync(resolve(root, 'js/app/app-part3.js'), 'utf8')
function extraire(src, marqueur) {
  const i = src.indexOf(marqueur)
  if (i < 0) throw new Error('introuvable : ' + marqueur)
  let j = src.indexOf('{', src.indexOf(')', i)), depth = 0
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1)
  }
  throw new Error('accolades : ' + marqueur)
}
const fn = (src, nom, asy = false) => extraire(src, (asy ? 'async ' : '') + 'function ' + nom + '(')
const NOMS1 = [['_bailEtatSig'], ['_bailScanDocsExternes'], ['_bailScanExterne'], ['_bailPiecesExternes'], ['_bailPiecesPapier'], ['_bailCautionEtat'],
  ['_bailCautionDetenue'], ['_bailScansExternesOrphelins'], ['_bailScanFmtTaille'], ['_bailScanExterneDeposer', 1], ['_bailExterneApresSave', 1],
  ['_bailScanExterneSupprimerDoc', 1], ['_bailPiecePapierEcrire'], ['_bailCautionsPapierSuivreDebut'], ['_bailLogementDe'], ['_bailAuteurCourant'], ['escHtml'], ['fd']]
const NOMS2 = [['_bailPiecesFicheHtml']]

const SIGNED_AT = '2025-02-25T12:00:00.000Z'
const EXT = (extra = {}) => ({ ref: 'P-202', debut: '2025-03-01', garant: 'Michel Faure', ...extra, signatures: BSE.declarerSignatureExterne({}, { date: '2025-02-25', now: '2026-10-15T08:00:00Z' }) })
const doc = (o) => ({ id: 1, parentType: 'bail', parentId: 'P-202', parentRef: 'P-202', logRef: 'P-202', category: 'bail', nature: 'bail-signe-externe', bailSignedAt: SIGNED_AT, bailDebut: '2025-03-01', uploadedAt: '2026-10-15T08:00:00Z', name: 's.pdf', originalName: 's.pdf', size: 1200, cloudKey: 'k', ...o })
const F = (name, mime = 'application/pdf') => ({ name, mime, size: 2048, dataB64: 'data:' + mime + ';base64,QQ==' })

function monde({ baux = { 'P-202': EXT() }, documents = [], reponses = [], logements = [{ ref: 'P-202', imm: 'Résidence du Parc' }] } = {}) {
  const calls = [], toasts = [], confirms = []
  let nid = 100
  const sb = {
    DB: { baux, documents, logements }, window: { BailSignatureEtat: BSE, BailPiecesExternes: BPX }, calls, toasts, confirms,
    v: () => '', el: () => null,
    showToast: (m, t) => toasts.push([m, t]), confirm2: (m) => { confirms.push(m); return reponses.length ? reponses.shift() : true },
    saveDB: () => { calls.push('saveDB') }, _refreshAfterMutation: () => calls.push('refresh'), _stamp: () => {}, _auditLog: () => calls.push('audit'),
    _uiIcon: () => '<svg></svg>', _appUserName: () => 'Didier',
    _attachmentSaveForEntity: async (parent, f) => {
      const d = { id: ++nid, parentType: parent.type, parentId: parent.id, parentRef: parent.ref, logRef: parent.logRef, category: parent.category, name: f.name, originalName: f.name, mime: f.mime, size: f.size, uploadedAt: '2026-10-15T09:00:' + String(nid).slice(-2) + 'Z' }
      sb.DB.documents.push(d); return d
    },
    _attachmentDelete: async (id) => { calls.push(['del', id]); const d = sb.DB.documents.find(x => x.id === id); if (d) d._deleted = true; return true },
    _attachmentLoadBinary: async () => 'data:application/pdf;base64,QQ==',
    Date, JSON, Array, Object, String, Number, console, Set,
  }
  vm.createContext(sb)
  vm.runInContext('let _bailExtFichier = null, _bailExtRetirer = false;\n' + NOMS1.map(([n, a]) => fn(P1, n, !!a)).join('\n') + '\n' + NOMS2.map(([n]) => fn(P2, n)).join('\n'), sb)
  return sb
}

describe('après l\'enregistrement : les autres pièces en attente', () => {
  it('acte de cautionnement (photo) + avenant déposés, typés, rattachés à la déclaration ; état remis à zéro', async () => {
    const w = monde()
    w.window._bailExtAutres = { ajouts: [
      { k: 'caution:michel faure', piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure', fichier: F('caution.jpg', 'image/jpeg') },
      { k: 'x:1', piece: 'avenant', pieceLibelle: 'Avenant n° 1', fichier: F('av1.pdf') },
    ], retraits: [], papier: {} }
    await w._bailExterneApresSave('P-202', { action: 'declarer' })
    const p = w._bailPiecesExternes('P-202')
    expect(p.map(d => [d.piece, d.garantIdx, d.pieceLibelle, d.bailSignedAt])).toEqual([
      ['caution', 1, undefined, SIGNED_AT], ['avenant', undefined, 'Avenant n° 1', SIGNED_AT]])
    expect(w.window._bailExtAutres).toBeNull()
    expect(w.calls).toContain('refresh')
    expect(w._bailCautionDetenue('P-202')).toBe(true)
  })
  it('un second acte pour le même garant REMPLACE le premier (emplacement unique) ; le bail signé n\'est pas touché', async () => {
    const w = monde({ documents: [doc({ id: 1 }), doc({ id: 2, piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure', name: 'v1.pdf' })] })
    w.window._bailExtAutres = { ajouts: [{ k: 'caution:michel faure', piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure', fichier: F('v2.pdf') }], retraits: [], papier: {} }
    await w._bailExterneApresSave('P-202', { action: null })
    expect(w.DB.documents.find(d => d.id === 2)._deleted).toBe(true)
    expect(w.DB.documents.find(d => d.id === 1)._deleted).toBeUndefined()
    expect(w._bailScanExterne('P-202').id).toBe(1)
    expect(w._bailPiecesExternes('P-202').filter(d => d.piece === 'caution').map(d => d.originalName)).toEqual(['v2.pdf'])
  })
  it('retrait en attente appliqué ; une pièce multiple n\'écrase jamais une autre', async () => {
    const w = monde({ documents: [doc({ id: 3, piece: 'annexe' }), doc({ id: 4, piece: 'annexe', name: 'b.pdf', originalName: 'b.pdf' })] })
    w.window._bailExtAutres = { ajouts: [{ k: 'x:2', piece: 'annexe', fichier: F('c.pdf') }], retraits: [3], papier: {} }
    await w._bailExterneApresSave('P-202', { action: null })
    expect(w.DB.documents.find(d => d.id === 3)._deleted).toBe(true)
    expect(w._bailPiecesExternes('P-202').filter(d => d.piece === 'annexe').map(d => d.originalName).sort()).toEqual(['b.pdf', 'c.pdf'])
  })
  it('« Je l\'ai en papier » (D2) : noté sur le LOGEMENT (partagé avec la SCI), clé = début du bail + nom ; la caution est détenue', async () => {
    const w = monde()
    w.window._bailExtAutres = { ajouts: [], retraits: [], papier: { 'michel faure': { on: true, nom: 'Michel Faure', idx: 1 } } }
    await w._bailExterneApresSave('P-202', { action: 'declarer' })
    const log = w.DB.logements[0]
    expect(Object.keys(log.cautionsPapier)).toEqual(['2025-03-01|michel faure'])
    expect(log.cautionsPapier['2025-03-01|michel faure']).toMatchObject({ par: 'Didier', nom: 'Michel Faure' })
    expect(w.DB.bailPiecesPapier).toBeUndefined()
    expect(w.calls).toContain('saveDB')
    expect(w._bailCautionDetenue('P-202')).toBe(true)
    expect(w._bailCautionEtat('P-202').garants[0].source).toBe('papier')
    // date de début corrigée : la mention suit le bail
    expect(w._bailCautionsPapierSuivreDebut('P-202', '2025-03-01', '2025-03-15')).toBe(true)
    expect(Object.keys(log.cautionsPapier)).toEqual(['2025-03-15|michel faure'])
    w.DB.baux['P-202'].debut = '2025-03-15'
    // le retirer
    expect(w._bailPiecePapierEcrire('P-202', w.DB.baux['P-202'], { idx: 1, nom: 'Michel Faure' }, false)).toBe(true)
    expect(log.cautionsPapier).toEqual({})
    expect(w._bailCautionDetenue('P-202')).toBe(false)
  })
  it('garant remplacé : l\'acte de l\'ancien garant ne compte pas pour le nouveau', async () => {
    const w = monde({ baux: { 'P-202': EXT({ garant: 'Nouveau Garant' }) }, documents: [doc({ id: 9, piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure', name: 'c.pdf', originalName: 'c.pdf' })] })
    expect(w._bailCautionDetenue('P-202')).toBe(false)
    const h = w._bailPiecesFicheHtml('P-202', w.DB.baux['P-202'])
    expect(h).toContain('Acte de cautionnement — Michel Faure')
    expect(h).toMatch(/n(&#39;|&#x27;|')est plus garant de ce bail/)
    expect(h).toContain('Acte de cautionnement — Nouveau Garant')
  })
  it('caution signée dans Propryo (bail.signatures.garant) : détenue', () => {
    const b = EXT(); b.signatures = Object.assign({}, b.signatures, { garant: { signedAt: 'x' } })
    expect(monde({ baux: { 'P-202': b } })._bailCautionDetenue('P-202')).toBe(true)
  })
  it('bail qui n\'est pas (ou plus) déclaré hors Propryo : rien n\'est déposé', async () => {
    const w = monde({ baux: { 'P-202': { ref: 'P-202', debut: '2025-03-01' } } })
    w.window._bailExtAutres = { ajouts: [{ k: 'x:1', piece: 'autre', fichier: F('a.pdf') }], retraits: [], papier: {} }
    await w._bailExterneApresSave('P-202', { action: 'retirer' })
    expect(w.DB.documents).toEqual([])
  })
})

describe('re-déclaration : les pièces de la déclaration précédente, en une seule question', () => {
  it('bail + acte de cautionnement proposés ensemble, rattachés avec leur type', async () => {
    const b = EXT(); b.signatures = BSE.declarerSignatureExterne(b, { date: '2025-02-26', now: '2026-10-15T08:00:00Z' })
    const w = monde({ baux: { 'P-202': b }, documents: [doc({ id: 1 }), doc({ id: 2, piece: 'caution', garantIdx: 1, garantNom: 'Michel Faure', name: 'c.pdf', originalName: 'c.pdf' })] })
    await w._bailExterneApresSave('P-202', { action: 'redater' })
    expect(w.confirms).toHaveLength(1)
    expect(w.confirms[0]).toMatch(/Des pièces de la déclaration précédente/)
    expect(w.confirms[0]).toContain('Acte de cautionnement — Michel Faure : c.pdf')
    const p = w._bailPiecesExternes('P-202')
    expect(p.map(d => d.piece)).toEqual(['bail', 'caution'])
    expect(p[1].garantIdx).toBe(1)
    expect(w.DB.documents.filter(d => d.id <= 2).every(d => d._deleted)).toBe(true)
  })
})

describe('fiche › Documents : rendu des pièces', () => {
  it('garant : « Ajouter le fichier » + « Je l\'ai en papier » ; papier → pastille « détenu en papier » + annuler', () => {
    const w = monde()
    let h = w._bailPiecesFicheHtml('P-202', w.DB.baux['P-202'])
    expect(h).toContain('Acte de cautionnement — Michel Faure')
    expect(h).toContain('Je l\'ai en papier')
    expect(h).toContain('+ Ajouter une pièce')
    w._bailPiecePapierEcrire('P-202', w.DB.baux['P-202'], { idx: 1, nom: 'Michel Faure' }, true)
    h = w._bailPiecesFicheHtml('P-202', w.DB.baux['P-202'])
    expect(h).toContain('détenu en papier')
    expect(h).toContain('Annuler « papier »')
  })
  it('aucun nom de fichier, garant ou libellé n\'est injecté tel quel ; les actions passent par data-*', () => {
    const w = monde({ baux: { 'P-202': EXT({ garant: '<img src=x onerror=alert(1)>' }) },
      documents: [doc({ id: 7, piece: 'autre', pieceLibelle: '<b>x</b>', name: '<svg onload=alert(1)>.pdf', originalName: '<svg onload=alert(1)>.pdf' })] })
    const h = w._bailPiecesFicheHtml('P-202', w.DB.baux['P-202'])
    expect(h).not.toMatch(/<img src=x|<svg onload|<b>x<\/b>/)
    expect(h).toContain('&lt;img')
    expect(h).toMatch(/data-act="retirer" data-doc="7" onclick="_bailPieceAction\(this\)"/)
    expect(h).not.toMatch(/onclick="[^"]*P-202/)
  })
})

describe('branchements', () => {
  it('la migration des pièces tourne au démarrage', () => {
    const boot = P3.slice(P3.indexOf('function _bootDataJobs()'), P3.indexOf('function _bootDataJobs()') + 12000)
    expect(boot).toMatch(/BailPiecesExternes\.migrerPiecesExternes\(DB\.documents \|\| \[\], d => d\._espaceId == null/)
  })
  it('la fiche › Documents appelle le rendu des pièces pour un bail hors Propryo', () => {
    expect(fn(P2, '_renderLogFichePanelDocuments')).toContain('_sigExt ? _bailPiecesFicheHtml(ref, bail) : \'\'')
  })
})
