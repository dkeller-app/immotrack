// Documents express venus de propryo.fr : validation, expiration, réception postMessage (script inline d'index.html),
// générateurs (jsPDF simulé), fenêtre de remise (DOM simulé).
import { describe, it, expect } from 'vitest'
import {
  validerDocExpress, lireEnAttente, purgerPerimes, genererDocument, consommerDocExpress, resumeDocument, afficherRemise,
  CLE_DOC_EXPRESS, MESSAGE_SUIVI, MAX_CHAMP, MAX_TAILLE,
} from '../../js/app/doc-express.js'
import { readFileSync } from 'node:fs'

const source = readFileSync('js/app/doc-express.js', 'utf-8')
const indexHtml = readFileSync('index.html', 'utf-8')

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
const mem = (init) => { const m = new Map(init ? [[CLE_DOC_EXPRESS, init]] : []); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m } }
const enreg = (doc, extra = {}) => JSON.stringify({ doc, t: Date.now(), ...extra })
const DOC = { type: 'quittance', champs: { bailleur: 'A', locataire: 'B', adresse: 'x', loyer: '1' } }

describe('validation', () => {
  it('accepte un document valide, accents compris', () => {
    expect(validerDocExpress({ type: 'quittance', champs: { bailleur: 'Éric Müller', loyer: '520' } }).doc).toEqual({ type: 'quittance', champs: { bailleur: 'Éric Müller', loyer: '520' } })
  })
  it('refuse un type inconnu, un format inattendu, du bruit', () => {
    for (const v of [{ type: 'virus', champs: {} }, null, 'x', [], 12, {}]) expect(validerDocExpress(v).erreur).toBe('format')
  })
  it('refuse explicitement au-delà des limites (aucune troncature silencieuse)', () => {
    expect(validerDocExpress({ type: 'bail', champs: { adresse: 'x'.repeat(MAX_CHAMP + 1) } }).erreur).toBe('taille')
    expect(validerDocExpress({ type: 'edl', champs: { pieces: Array.from({ length: 31 }, () => ({ nom: 'a' })) } }).erreur).toBe('taille')
    const trop = Object.fromEntries(Array.from({ length: 41 }, (_, i) => ['k' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)), 'v']))
    expect(validerDocExpress({ type: 'bail', champs: trop }).erreur).toBe('taille')
    const lourd = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)), 'x'.repeat(MAX_CHAMP)]))
    expect(validerDocExpress({ type: 'bail', champs: lourd }).erreur).toBe('taille')
    expect(MAX_TAILLE).toBe(8000)
  })
  it('ignore les clés au format suspect', () => {
    const v = validerDocExpress({ type: 'bail', champs: { adresse: 'a', '__proto__x': 'a', 'a b': 'c' } })
    expect(Object.keys(v.doc.champs)).toEqual(['adresse'])
  })
})

describe('document en attente : expiration et purge', () => {
  it('rend le document valide', () => {
    expect(lireEnAttente(mem(enreg(DOC))).doc.type).toBe('quittance')
  })
  it('expire après 30 minutes', () => {
    const st = mem(JSON.stringify({ doc: DOC, t: 1000 }))
    expect(lireEnAttente(st, 31 * 60 * 1000)).toBeNull()
    expect(st.m.has(CLE_DOC_EXPRESS)).toBe(false)
    expect(lireEnAttente(mem(JSON.stringify({ doc: DOC, t: 1000 })), 29 * 60 * 1000).doc.type).toBe('quittance')
  })
  it('purgerPerimes : expiré ou ancien format (#doc= base64) supprimé, frais conservé', () => {
    const vieux = mem(JSON.stringify({ b64: 'eyJ0eXBlIjoi', t: Date.now() })); purgerPerimes(vieux); expect(vieux.m.has(CLE_DOC_EXPRESS)).toBe(false)
    const perime = mem(JSON.stringify({ doc: DOC, t: 1 })); purgerPerimes(perime); expect(perime.m.has(CLE_DOC_EXPRESS)).toBe(false)
    const frais = mem(enreg(DOC)); purgerPerimes(frais); expect(frais.m.has(CLE_DOC_EXPRESS)).toBe(true)
  })
  it('entrée « null », corrompue ou invalide : supprimée', () => {
    for (const v of ['null', '{"doc":1}', '[]', 'pas du json']) { const st = mem(v); expect(lireEnAttente(st)).toBeNull(); expect(st.m.has(CLE_DOC_EXPRESS)).toBe(false) }
  })
  it('document reçu mais refusé : erreur explicite et clé supprimée', () => {
    const st = mem(enreg({ type: 'bail', champs: { adresse: 'x'.repeat(MAX_CHAMP + 5) } }))
    expect(lireEnAttente(st).erreur).toBe('taille'); expect(st.m.has(CLE_DOC_EXPRESS)).toBe(false)
  })
})

// ── script inline d'index.html : exécuté dans un bac à sable ────────────────
function chargerScriptInline() {
  const i = indexHtml.indexOf('<script>/* Document express venu de propryo.fr')
  const code = indexHtml.slice(indexHtml.indexOf('(function(){', i), indexHtml.indexOf('</script>', i))
  return ({ ls, search, opener, ecouteurs }) => {
    const win = { opener, addEventListener: (t, f) => ecouteurs.push(f) }
    new Function('window', 'location', 'localStorage', 'setTimeout', code)(win, { search }, ls, () => {})
  }
}

describe('réception postMessage (index.html)', () => {
  const ouvreur = () => { const envoyes = []; return { envoyes, postMessage: (m, o) => envoyes.push({ m, o }) } }
  const evt = (o, over = {}) => ({ origin: 'https://propryo.fr', source: o, data: { propryo: 'doc', doc: DOC }, ...over })
  const lancer = (over = {}) => {
    const inline = chargerScriptInline(); const op = ouvreur(); const ls = mem(); const ec = []
    inline({ ls, search: '?inscription&from=quittance&doc=attente', opener: op, ecouteurs: ec, ...over })
    return { op, ls, ec }
  }
  it('purge à chaque chargement : ancien format et expirés supprimés avant toute connexion', () => {
    const inline = chargerScriptInline()
    const a = mem(JSON.stringify({ b64: 'ancien', t: Date.now() })); inline({ ls: a, search: '', opener: null, ecouteurs: [] }); expect(a.m.has(CLE_DOC_EXPRESS)).toBe(false)
    const b = mem(JSON.stringify({ doc: DOC, t: 1 })); inline({ ls: b, search: '', opener: null, ecouteurs: [] }); expect(b.m.has(CLE_DOC_EXPRESS)).toBe(false)
    const c = mem(enreg(DOC)); inline({ ls: c, search: '', opener: null, ecouteurs: [] }); expect(c.m.has(CLE_DOC_EXPRESS)).toBe(true)
  })
  it('annonce « prêt » aux deux origines du site, et seulement elles', () => {
    const { op } = lancer()
    expect(op.envoyes.map(e => e.o).sort()).toEqual(['https://propryo.fr', 'https://www.propryo.fr'])
    expect(op.envoyes.every(e => e.m.propryo === 'doc-pret')).toBe(true)
  })
  it('n’annonce rien sans doc=attente ni sans onglet ouvreur', () => {
    expect(lancer({ search: '?inscription' }).op.envoyes).toEqual([])
    expect(lancer({ opener: null }).ls.m.size).toBe(0)
  })
  it('accepte propryo.fr et www.propryo.fr depuis l’onglet ouvreur : rangé et accusé de réception', () => {
    for (const origine of ['https://propryo.fr', 'https://www.propryo.fr']) {
      const { op, ls, ec } = lancer(); ec[0](evt(op, { origin: origine }))
      expect(JSON.parse(ls.m.get(CLE_DOC_EXPRESS)).doc.type).toBe('quittance')
      expect(op.envoyes.at(-1)).toEqual({ m: { propryo: 'doc-recu' }, o: origine })
    }
  })
  it('refuse toute autre origine (liste fermée), un autre expéditeur, un format inattendu', () => {
    const mauvais = [{ origin: 'https://evil.example' }, { origin: 'https://propryo.fr.evil.example' }, { origin: 'http://propryo.fr' }, { origin: 'https://app.propryo.fr' },
      { source: {} }, { data: { propryo: 'autre' } }, { data: null }, { data: { propryo: 'doc', doc: 'texte' } }, { data: { propryo: 'doc', doc: { type: 5 } } }]
    for (const m of mauvais) { const { op, ls, ec } = lancer(); ec[0](evt(op, m)); expect(ls.m.has(CLE_DOC_EXPRESS)).toBe(false) }
  })
  it('refuse au-delà de la taille maximale et le dit à l’expéditeur', () => {
    const { op, ls, ec } = lancer(); ec[0](evt(op, { data: { propryo: 'doc', doc: { type: 'bail', champs: { a: 'x'.repeat(9000) } } } }))
    expect(ls.m.has(CLE_DOC_EXPRESS)).toBe(false)
    expect(op.envoyes.at(-1).m).toEqual({ propryo: 'doc-refus', raison: 'taille' })
  })
  it('ne lit plus #doc= : aucune référence au fragment ni réécriture de l’adresse', () => {
    expect(indexHtml).not.toMatch(/location\.hash[^;]{0,40}doc=/)
    expect(indexHtml).not.toContain("replaceState(null,'',location.pathname+location.search)")
  })
})

describe('générateurs', () => {
  it('quittance : total et période', () => {
    const d = new FauxPdf(); const r = genererDocument(function () { return d }, { type: 'quittance', champs: { bailleur: 'A', locataire: 'B', adresse: '1 rue X', mois: 'mars', annee: '2026', loyer: '520', charges: '80' } })
    expect(tout(d)).toContain('600,00'); expect(r.nom).toBe('quittance-mars-2026.pdf')
  })
  it('montants : seuls les nombres finis, positifs et plafonnés sont acceptés', () => {
    for (const mauvais of ['-500', 'Infinity', '1e999', 'abc', '99999999999']) {
      const d = new FauxPdf(); genererDocument(function () { return d }, { type: 'quittance', champs: { loyer: mauvais, charges: '0' } })
      expect(tout(d)).toContain('0,00 euros'); expect(tout(d)).not.toContain('Infinity'); expect(tout(d)).not.toContain('NaN')
    }
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
  it('type inconnu : erreur ; valeurs de prototype ignorées', () => {
    expect(() => genererDocument(FauxPdf, { type: 'x', champs: {} })).toThrow()
    const d = new FauxPdf(); genererDocument(function () { return d }, { type: 'bail', champs: { typeBail: 'constructor', loyer: '500' } })
    expect(tout(d)).not.toContain('undefined'); expect(tout(d)).toContain('3 ans')
    const e = new FauxPdf(); genererDocument(function () { return e }, { type: 'edl', champs: { pieces: [{ nom: 'Salon', etat: 'constructor' }] } })
    expect(tout(e)).not.toContain('function')
  })
})

describe('consommation', () => {
  const J = function () { return new FauxPdf() }
  it('succès : clé retirée, remise proposée, téléchargement seulement au clic', async () => {
    const st = mem(enreg(DOC)); let propose = null; let enregistre = 0
    const J2 = function () { const d = new FauxPdf(); d.save = () => { enregistre++ }; return d }
    expect(await consommerDocExpress({ storage: st, charger: async () => J2, afficher: (doc, tel) => { propose = { doc, tel } } })).toBe(true)
    expect(st.m.has(CLE_DOC_EXPRESS)).toBe(false); expect(propose.doc.type).toBe('quittance'); expect(enregistre).toBe(0)
    propose.tel(); expect(enregistre).toBe(1)
  })
  it('double appel : un seul document', async () => {
    const st = mem(enreg(DOC)); let n = 0
    await consommerDocExpress({ storage: st, charger: async () => J, afficher: () => { n++ } })
    await consommerDocExpress({ storage: st, charger: async () => J, afficher: () => { n++ } })
    expect(n).toBe(1)
  })
  it('échec transitoire : saisie gardée une fois, abandonnée au 2e échec', async () => {
    const st = mem(enreg(DOC)); const echec = async () => { throw new Error('réseau') }; const msgs = []
    expect(await consommerDocExpress({ storage: st, charger: echec, signaler: m => msgs.push(m) })).toBe(false)
    expect(JSON.parse(st.m.get(CLE_DOC_EXPRESS)).essais).toBe(1)
    expect(await consommerDocExpress({ storage: st, charger: echec, signaler: m => msgs.push(m) })).toBe(false)
    expect(st.m.has(CLE_DOC_EXPRESS)).toBe(false); expect(msgs.length).toBe(2)
  })
  it('document refusé : message clair, rien de généré', async () => {
    const st = mem(enreg({ type: 'bail', champs: { adresse: 'x'.repeat(MAX_CHAMP + 1) } })); const msgs = []
    expect(await consommerDocExpress({ storage: st, charger: async () => { throw new Error('non') }, signaler: m => msgs.push(m) })).toBe(false)
    expect(msgs[0]).toContain('trop volumineux')
  })
  it('rien en attente : ne fait rien', async () => {
    expect(await consommerDocExpress({ storage: mem(null), charger: async () => J, afficher: () => { throw new Error('non') } })).toBe(false)
  })
  it('résumé : type, parties, adresse', () => {
    expect(resumeDocument({ type: 'edl', champs: { bailleur: 'A', locataire: 'B', adresse: 'x' } })).toEqual(['État des lieux', 'A et B', 'x'])
  })
})

// ── fenêtre de remise : DOM simulé ──────────────────────────────────────────
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attrs = {}; this._text = ''; this.className = ''; this.focused = false }
  set textContent(v) { this._text = String(v) }
  get textContent() { return this._text + this.children.map(c => c.textContent).join('') }
  set innerHTML(v) { throw new Error('innerHTML interdit') }
  append(...c) { c.forEach(x => { x.parent = this; this.children.push(x) }) }
  setAttribute(k, v) { this.attrs[k] = v }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.removed = true }
  focus() { this.focused = true; fauxDoc.activeElement = this }
  trouver(fn) { const out = []; const visite = e => { e.children.forEach(c => { if (fn(c)) out.push(c); visite(c) }) }; visite(this); return out }
  querySelectorAll(sel) { return sel === 'button' ? this.trouver(c => c.tag === 'button') : [] }
}
const fauxDoc = {
  activeElement: null, body: new El('body'), ecouteurs: {},
  createElement: t => new El(t),
  addEventListener(t, f) { (this.ecouteurs[t] = this.ecouteurs[t] || []).push(f) },
  removeEventListener(t, f) { this.ecouteurs[t] = (this.ecouteurs[t] || []).filter(x => x !== f) },
}

describe('fenêtre de remise', () => {
  const monter = (doc, telecharger = () => {}) => {
    fauxDoc.body = new El('body'); fauxDoc.ecouteurs = {}; globalThis.document = fauxDoc
    afficherRemise(doc, telecharger)
    const ov = fauxDoc.body.children[0]
    return { ov, modal: ov.children[0] }
  }
  it('le texte de l’utilisateur reste du texte (textContent, jamais de HTML)', () => {
    const piege = '<img src=x onerror=alert(1)>'
    const { ov } = monter({ type: 'edl', champs: { bailleur: piege, locataire: 'B', adresse: piege } })
    expect(ov.textContent).toContain(piege)
    expect(ov.trouver(e => e.tag === 'img')).toEqual([])
    expect(source).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/)
  })
  it('composants de l’app (thème clair/sombre), jamais de couleur en dur', () => {
    const { ov, modal } = monter(DOC)
    expect(ov.className).toBe('ov'); expect(modal.className).toBe('modal')
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
  it('accessibilité : dialog, aria-labelledby, boutons ≥ 44 px, focus initial hors « Télécharger »', () => {
    const { modal } = monter(DOC)
    expect(modal.attrs.role).toBe('dialog'); expect(modal.attrs['aria-modal']).toBe('true')
    expect(modal.trouver(e => e.id === modal.attrs['aria-labelledby']).length).toBe(1)
    const btns = modal.querySelectorAll('button')
    expect(btns.map(b => b.style.minHeight)).toEqual(['44px', '44px'])
    expect(btns[0].focused).toBe(false); expect(modal.focused).toBe(true)
  })
  it('Échap ferme ; Tab reste dans la fenêtre ; Annuler ferme', () => {
    const { ov, modal } = monter(DOC)
    const [bt, ba] = modal.querySelectorAll('button')
    const clavier = fauxDoc.ecouteurs.keydown[0]
    fauxDoc.activeElement = ba
    let evite = false; clavier({ key: 'Tab', shiftKey: false, preventDefault() { evite = true } })
    expect(evite).toBe(true); expect(bt.focused).toBe(true)
    clavier({ key: 'Escape', preventDefault() {} })
    expect(ov.removed).toBe(true); expect(fauxDoc.ecouteurs.keydown.length).toBe(0)
    const m2 = monter(DOC); m2.modal.querySelectorAll('button')[1].onclick(); expect(m2.ov.removed).toBe(true)
  })
  it('« Télécharger » : lance le téléchargement puis affiche le message de suivi', () => {
    let n = 0; const { modal } = monter(DOC, () => { n++ })
    modal.querySelectorAll('button')[0].onclick()
    expect(n).toBe(1); expect(modal.textContent).toContain(MESSAGE_SUIVI)
  })
  it('« Télécharger » en échec : message clair, pas de faux « téléchargé »', () => {
    const { modal } = monter(DOC, () => { throw new Error('bloqué') })
    modal.querySelectorAll('button')[0].onclick()
    expect(modal.textContent).toContain('a échoué'); expect(modal.textContent).not.toContain(MESSAGE_SUIVI)
  })
})

describe('registre et message', () => {
  it('clé et message de suivi stables ; durée de vie annoncée au registre', () => {
    expect(CLE_DOC_EXPRESS).toBe('imsb-doc-express'); expect(MESSAGE_SUIVI).toContain('Propryo est là')
    expect(readFileSync('js/core/stockage-local.js', 'utf-8')).toContain('(30 min)')
  })
})
