// Documents express venus de propryo.fr : décodage du fragment, validité, générateurs (jsPDF simulé).
import { describe, it, expect } from 'vitest'
import {
  decoderDocExpress, lireEnAttente, genererDocument, CLE_DOC_EXPRESS, MESSAGE_SUIVI,
} from '../../js/app/doc-express.js'
import { readFileSync } from 'node:fs'

const encoder = obj => Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// jsPDF simulé : enregistre tout le texte écrit, ne dessine rien.
class FauxPdf {
  constructor() { this.textes = []; this.pages = 1 }
  setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} line() {} addPage() { this.pages++ } setPage() {}
  getNumberOfPages() { return this.pages }
  splitTextToSize(t, w) { const s = String(t); const n = Math.max(20, Math.floor(w * 1.9)); const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : [''] }
  text(t) { this.textes.push(Array.isArray(t) ? t.join(' ') : String(t)) }
  save() {}
}
const tout = d => d.textes.join(' | ')

describe('décodage', () => {
  it('décode un document valide, accents compris', () => {
    const doc = decoderDocExpress(encoder({ type: 'quittance', champs: { bailleur: 'Éric Müller', loyer: '520' } }))
    expect(doc).toEqual({ type: 'quittance', champs: { bailleur: 'Éric Müller', loyer: '520' } })
  })
  it('refuse un type inconnu, du bruit et un contenu trop long', () => {
    expect(decoderDocExpress(encoder({ type: 'virus', champs: {} }))).toBeNull()
    expect(decoderDocExpress('@@@')).toBeNull()
    expect(decoderDocExpress('a'.repeat(13000))).toBeNull()
    expect(decoderDocExpress(null)).toBeNull()
  })
  it('tronque les champs et ignore les clés suspectes', () => {
    const doc = decoderDocExpress(encoder({ type: 'bail', champs: { adresse: 'x'.repeat(900), '__proto__x': 'a', 'a b': 'c' } }))
    expect(doc.champs.adresse.length).toBe(300)
    expect(Object.keys(doc.champs)).toEqual(['adresse'])
  })
})

describe('document en attente', () => {
  const faux = (valeur) => ({ getItem: () => valeur, removeItem() { this.retire = true } })
  it('rend le document valide', () => {
    const b64 = encoder({ type: 'edl', champs: { sens: 'entree' } })
    expect(lireEnAttente(faux(JSON.stringify({ b64, t: 1000 })), 2000).type).toBe('edl')
  })
  it('expire après 48 heures', () => {
    const b64 = encoder({ type: 'edl', champs: {} })
    const st = faux(JSON.stringify({ b64, t: 0 }))
    expect(lireEnAttente(st, 3 * 24 * 3600 * 1000)).toBeNull()
    expect(st.retire).toBe(true)
  })
  it('ignore un stockage vide ou corrompu', () => {
    expect(lireEnAttente(faux(null))).toBeNull()
    expect(lireEnAttente(faux('pas du json'))).toBeNull()
  })
})

describe('générateurs', () => {
  it('quittance : total et période', () => {
    const d = new FauxPdf(); const r = genererDocument(function () { return d }, { type: 'quittance', champs: { bailleur: 'A', locataire: 'B', adresse: '1 rue X', mois: 'mars', annee: '2026', loyer: '520', charges: '80' } })
    expect(tout(d)).toContain('600,00')
    expect(r.nom).toBe('quittance-mars-2026.pdf')
  })
  it('bail : dépôt selon le type, aucun dépôt en mobilité', () => {
    for (const [t, attendu] of [['nu', '520,00 euros (1 mois'], ['meuble', '1 040,00 euros (2 mois'], ['mobilite', 'interdit']]) {
      const d = new FauxPdf(); genererDocument(function () { return d }, { type: 'bail', champs: { typeBail: t, loyer: '520', charges: '80', adresse: 'x' } })
      expect(tout(d).replace(/ /g, ' ')).toContain(attendu)
    }
  })
  it('état des lieux : sens et pièces', () => {
    const d = new FauxPdf(); const r = genererDocument(function () { return d }, { type: 'edl', champs: { sens: 'sortie', pieces: [{ nom: 'Séjour', etat: 'usage', remarque: 'rayure parquet' }] } })
    expect(tout(d)).toContain('DE SORTIE'); expect(tout(d)).toContain("État d'usage. rayure parquet"); expect(r.nom).toContain('sortie')
  })
  it('avenant : majoration annuelle et plafond en zone tendue', () => {
    const d = new FauxPdf(); genererDocument(function () { return d }, { type: 'avenant', champs: { loyerActuel: '500', loyerNouveau: '540', montantTravaux: '10000', zoneTendue: true } })
    const t = tout(d).replace(/ | /g, ' ')
    expect(t).toContain('40,00 euros par mois'); expect(t).toContain('480,00 euros par an'); expect(t).toContain('1 500,00')
  })
  it('type inconnu : erreur', () => {
    expect(() => genererDocument(FauxPdf, { type: 'x', champs: {} })).toThrow()
  })
})

describe('câblage', () => {
  it('index.html range #doc= avant les scripts applicatifs', () => {
    const html = readFileSync('index.html', 'utf-8')
    const i = html.indexOf("imsb-doc-express"), j = html.indexOf('js/app/supabase-entry.js')
    expect(i).toBeGreaterThan(0); expect(i).toBeLessThan(j)
    expect(html).toContain("history.replaceState(null,'',location.pathname+location.search)")
  })
  it('la clé et le message de suivi sont stables', () => {
    expect(CLE_DOC_EXPRESS).toBe('imsb-doc-express')
    expect(MESSAGE_SUIVI).toContain('Propryo est là')
  })
})
