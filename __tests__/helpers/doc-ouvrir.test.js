import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { enteteDataUrl, typeDocument, modeOuverture, dataUrlEnOctets, essenceType, typeBlob } from '../../js/core/doc-ouvrir.js'

/**
 * Retours du 15/10/2026 (lot 1, point 4) — « Ouvrir » un bail / EDL signé hors Propryo : page blanche.
 * Cause reproduite en Chrome : iframe `data:application/pdf` au-delà de la limite de 2 Mo d'une URL
 * (PDF ≥ ~1,5 Mo). Correctif : Blob + URL.createObjectURL, fenêtre ouverte dans le geste.
 */

const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.7\n%test\n').toString('base64')

describe('typeDocument — le vrai type, même relu du stockage en ligne', () => {
  it('l\'en-tête précis fait foi', () => {
    expect(typeDocument(PDF, 'image/png', 'x.png')).toBe('application/pdf')
  })
  it('en-tête générique (octet-stream) → type enregistré, puis extension', () => {
    const gen = 'data:application/octet-stream;base64,JVBERi0='
    expect(typeDocument(gen, 'application/pdf', 'bail')).toBe('application/pdf')
    expect(typeDocument(gen, '', 'Bail signé.PDF')).toBe('application/pdf')
    expect(typeDocument(gen, 'application/octet-stream', 'photo.jpeg')).toBe('image/jpeg')
    expect(typeDocument(gen, '', 'notes.docx')).toBe('application/octet-stream')
  })
  it('base64 nue (ancien format) → type enregistré', () => {
    expect(typeDocument('JVBERi0=', 'application/pdf', '')).toBe('application/pdf')
  })
})

describe('modeOuverture', () => {
  it('PDF, images matricielles, le reste téléchargé (SVG jamais affiché)', () => {
    expect(modeOuverture('application/pdf')).toBe('pdf')
    expect(modeOuverture('image/jpeg')).toBe('image')
    expect(modeOuverture('image/webp')).toBe('image')
    expect(modeOuverture('image/svg+xml')).toBe('telecharger')
    expect(modeOuverture('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('telecharger')
  })
})

describe('dataUrlEnOctets — aucun plafond de taille', () => {
  it('décode exactement les octets', () => {
    expect(Buffer.from(dataUrlEnOctets(PDF)).toString()).toBe('%PDF-1.7\n%test\n')
    expect(Buffer.from(dataUrlEnOctets('JVBERi0=')).toString()).toBe('%PDF-')
    expect(Buffer.from(dataUrlEnOctets('data:text/plain,bonjour%20%C3%A0')).toString()).toBe('bonjour à')
  })
  it('un PDF de 8 Mo (au-delà des 2 Mo d\'URL de Chrome) est restitué intégralement', () => {
    const bytes = Buffer.alloc(8 * 1048576, 7); bytes.write('%PDF-1.7', 0)
    const url = 'data:application/pdf;base64,' + bytes.toString('base64')
    expect(url.length).toBeGreaterThan(2 * 1024 * 1024)
    const out = dataUrlEnOctets(url)
    expect(out.length).toBe(bytes.length)
    expect(Buffer.from(out.slice(0, 8)).toString()).toBe('%PDF-1.7')
  })
  it('enteteDataUrl', () => {
    expect(enteteDataUrl(PDF)).toMatchObject({ mime: 'application/pdf', base64: true })
    expect(enteteDataUrl('pas une url')).toBeNull()
  })
})

describe('l\'ouverture n\'utilise plus d\'iframe data: et ouvre la fenêtre dans le geste', () => {
  const root = path.resolve(__dirname, '..', '..')
  const ap1 = fs.readFileSync(path.join(root, 'js/app/app-part1.js'), 'utf8')
  const ap2 = fs.readFileSync(path.join(root, 'js/app/app-part2.js'), 'utf8')
  const corps = (src, sig) => { const i = src.indexOf(sig); expect(i, sig).toBeGreaterThan(-1); const j = src.indexOf('\nfunction ', i + 10); const k = src.indexOf('\nasync function ', i + 10); return src.slice(i, Math.min(j < 0 ? Infinity : j, k < 0 ? Infinity : k)) }
  it('_mvDocOpenInWindow : Blob + URL.createObjectURL, plus de document.write d\'une data URL', () => {
    const f = corps(ap1, 'function _mvDocOpenInWindow(')
    expect(f).toContain('URL.createObjectURL')
    expect(f).toContain('DocOuvrir')
    // L'ancienne iframe data: ne subsiste que dans le repli « module non chargé » (file://), APRÈS le chemin Blob.
    const iBlob = f.indexOf('URL.createObjectURL'), iRepli = f.indexOf('// Repli (module non chargé'), iIframe = f.indexOf('<iframe src="${escHtml(pj.dataB64)}"')
    expect(iBlob).toBeLessThan(iRepli)
    expect(iIframe === -1 || iIframe > iRepli).toBe(true)
  })
  it('_handleAttachmentOpen et _mvDocOpenById ouvrent la fenêtre AVANT d\'attendre le binaire', () => {
    for (const [src, sig] of [[ap2, 'async function _handleAttachmentOpen('], [ap1, 'async function _mvDocOpenById(']]) {
      const f = corps(src, sig)
      const iOpen = f.indexOf('_mvDocFenetre(')
      expect(iOpen, sig).toBeGreaterThan(-1)
      expect(iOpen, sig).toBeLessThan(f.indexOf('await '))
    }
  })
})

describe("sécurité — une URL blob: porte l'origine de l'app : liste blanche stricte (relecture adverse)", () => {
  it('SVG, HTML, XML ne sont jamais affichés, même avec un paramètre', () => {
    for (const t of ['image/svg+xml', 'image/svg+xml; charset=utf-8', 'IMAGE/SVG+XML;', 'text/html', 'text/html;charset=utf-8', 'application/xhtml+xml', 'text/xml', 'image/heic', ''])
      expect(modeOuverture(t), t).toBe('telecharger')
  })
  it("le type d'un document se réduit à son essence (en-tête data: et type enregistré)", () => {
    expect(essenceType(' Image/SVG+xml ; charset=utf-8')).toBe('image/svg+xml')
    expect(typeDocument('data:application/octet-stream;base64,PHN2Zz4=', 'image/svg+xml; charset=utf-8', 'x.png')).toBe('image/svg+xml')
    expect(modeOuverture(typeDocument('data:application/octet-stream;base64,PHN2Zz4=', 'image/svg+xml; charset=utf-8', 'x.png'))).toBe('telecharger')
    expect(typeDocument('data:application/pdf;foo=bar;base64,JVBERi0=', '', '')).toBe('application/pdf')
  })
  it("le Blob d'un téléchargement est un binaire neutre ; celui d'un PDF / d'une image garde son essence", () => {
    expect(typeBlob('image/svg+xml; charset=utf-8')).toBe('application/octet-stream')
    expect(typeBlob('text/html')).toBe('application/octet-stream')
    expect(typeBlob('application/pdf')).toBe('application/pdf')
    expect(typeBlob('image/png; x=y')).toBe('image/png')
  })
})
