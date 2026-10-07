// Documents « express » venus de propryo.fr (quittance, bail, état des lieux, avenant).
//
// Parcours : l'utilisateur remplit un formulaire sur le site ; le bouton ouvre l'app dans un nouvel onglet
// (…/?inscription&doc=attente) et lui envoie les champs par postMessage. Rien ne passe par l'URL, donc rien dans
// l'historique du navigateur. Le script inline d'index.html (avant le routeur) n'accepte le message que si
// event.origin est propryo.fr ou www.propryo.fr ET que l'expéditeur est l'onglet qui a ouvert l'app ; il range la
// saisie dans localStorage (30 min). L'inscription ou la connexion se déroule ensuite normalement ; une fois l'app
// affichée, ce module génère le PDF (jsPDF déjà embarqué) et le propose en téléchargement.
//
// Rien n'est jamais écrit dans les données de l'utilisateur : c'est un simple téléchargement.

export const CLE_DOC_EXPRESS = 'imsb-doc-express'
const VALIDITE_MS = 30 * 60 * 1000
const TYPES = ['quittance', 'bail', 'edl', 'avenant']
export const MAX_CHAMP = 300
export const MAX_TAILLE = 8000

export const MESSAGE_SUIVI =
  'Le document est téléchargé. Pour le suivi et la sauvegarde, Propryo est là : biens, locataires, loyers et documents réunis au même endroit.'

// ── validation (pure, testable) : refus explicite, jamais de troncature silencieuse ──
export function validerDocExpress(brut) {
  try {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut) || !TYPES.includes(brut.type)) return { erreur: 'format' }
    if (JSON.stringify(brut).length > MAX_TAILLE) return { erreur: 'taille' }
    const champs = nettoyerChamps(brut.champs)
    if (champs === null) return { erreur: 'taille' }
    return { doc: { type: brut.type, champs } }
  } catch (e) { return { erreur: 'format' } }
}

// null = champ ou liste trop long (refus) ; clés au format inattendu ignorées
function nettoyerChamps(c) {
  const out = {}
  if (!c || typeof c !== 'object' || Array.isArray(c)) return out
  const entrees = Object.entries(c)
  if (entrees.length > 40) return null
  for (const [k, v] of entrees) {
    if (!/^[a-zA-Z]{1,24}$/.test(k)) continue
    if (typeof v === 'string') { if (v.length > MAX_CHAMP) return null; out[k] = v }
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (Array.isArray(v)) {
      if (v.length > 30) return null
      const l = v.map(x => (x && typeof x === 'object' ? nettoyerChamps(x) : String(x)))
      if (l.some(x => x === null || (typeof x === 'string' && x.length > MAX_CHAMP))) return null
      out[k] = l
    } else if (v && typeof v === 'object') { const o = nettoyerChamps(v); if (o === null) return null; out[k] = o }
  }
  return out
}

/** Purge : expirée ou ancien format (#doc= base64) = supprimée. Appelée à CHAQUE chargement par index.html ; ici pour les tests. */
export function purgerPerimes(storage = (typeof localStorage !== 'undefined' ? localStorage : null), maintenant = Date.now()) {
  try {
    if (!storage) return
    const brut = storage.getItem(CLE_DOC_EXPRESS)
    if (!brut) return
    const r = JSON.parse(brut)
    if (!r || !r.doc || !r.t || !(maintenant - r.t < VALIDITE_MS)) storage.removeItem(CLE_DOC_EXPRESS)
  } catch (e) { try { storage && storage.removeItem(CLE_DOC_EXPRESS) } catch (_) {} }
}

/** Rend { doc } (valide), { erreur } (reçu mais refusé) ou null (rien en attente). */
export function lireEnAttente(storage = (typeof localStorage !== 'undefined' ? localStorage : null), maintenant = Date.now()) {
  try {
    if (!storage) return null
    purgerPerimes(storage, maintenant)
    const brut = storage.getItem(CLE_DOC_EXPRESS)
    if (!brut) return null
    const v = validerDocExpress((JSON.parse(brut) || {}).doc)
    if (v.erreur) { storage.removeItem(CLE_DOC_EXPRESS); return { erreur: v.erreur } }
    return v
  } catch (e) { try { storage && storage.removeItem(CLE_DOC_EXPRESS) } catch (_) {} return null }
}

// ── mise en forme ───────────────────────────────────────────────────────────
const eur = n => (isNaN(n) ? 0 : n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 10000000 ? n : 0 }
const txt = (v, defaut = '…') => (v == null || String(v).trim() === '' ? defaut : String(v).trim())
const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const PIED = 'Document établi avec Propryo (propryo.fr). Il ne remplace pas un conseil juridique.'

const TYPES_BAIL = {
  nu: { st: "Bail d'habitation, logement vide", duree: '3 ans', depMois: 1 },
  meuble: { st: "Bail d'habitation, logement meublé", duree: '1 an', depMois: 2 },
  etudiant: { st: 'Bail étudiant, logement meublé', duree: '9 mois', depMois: 2 },
  mobilite: { st: 'Bail mobilité, logement meublé', duree: '1 à 10 mois', depMois: 0 },
  garage: { st: 'Location de garage, parking ou box', duree: 'Libre', depMois: -1 },
}

// Petit « stylo » au-dessus de jsPDF : sauts de page automatiques, titres, paragraphes.
function stylo(J, { marge = 20, titrePage = '' } = {}) {
  const d = new J({ unit: 'mm', format: 'a4' })
  const W = 210, H = 282
  const s = { d, W, M: marge, y: 26 }
  s.saut = h => { if (s.y + h > H) { d.addPage(); s.y = 24 } }
  s.titreDoc = (t, sous) => {
    d.setFont('helvetica', 'bold'); d.setFontSize(20); d.setTextColor(0); d.text(t, s.M, s.y); s.y += 8
    if (sous) { d.setFont('helvetica', 'normal'); d.setFontSize(12); d.setTextColor(90); d.text(sous, s.M, s.y); d.setTextColor(0); s.y += 6 }
  }
  s.titre = t => { s.saut(14); s.y += 4; d.setFont('helvetica', 'bold'); d.setFontSize(12); d.setTextColor(0); d.text(t, s.M, s.y); s.y += 7 }
  s.para = (t, taille = 10.5) => {
    d.setFont('helvetica', 'normal'); d.setFontSize(taille); d.setTextColor(0)
    const li = d.splitTextToSize(t, W - 2 * s.M)
    s.saut(5.2 * li.length + 2); d.text(li, s.M, s.y); s.y += 5.2 * li.length + 2.5
  }
  s.ligne = (a, b) => {
    s.saut(7); d.setFont('helvetica', 'bold'); d.setFontSize(10.5); d.text(a, s.M, s.y)
    d.setFont('helvetica', 'normal'); const li = d.splitTextToSize(b, W - 2 * s.M - 42); d.text(li, s.M + 42, s.y); s.y += 6 * li.length + 1
  }
  s.pieds = () => {
    const n = d.getNumberOfPages()
    for (let i = 1; i <= n; i++) { d.setPage(i); d.setFontSize(8); d.setTextColor(130); d.text(PIED + ' Page ' + i + '/' + n, s.M, 291) }
  }
  s.signatures = (g, dr, lieu, date) => {
    s.saut(48); s.y += 6
    s.para('Fait à ' + txt(lieu, '____________________') + ', le ' + txt(date, '____ / ____ / ________') + '.')
    s.y += 8; d.setFont('helvetica', 'normal'); d.setFontSize(10.5); d.text(g, s.M, s.y); d.text(dr, W - s.M - 40, s.y)
  }
  return s
}

// ── générateurs (un par type) ───────────────────────────────────────────────
export function pdfQuittance(J, c) {
  const l = num(c.loyer), ch = num(c.charges), periode = txt(c.mois, '') + ' ' + txt(c.annee, '')
  const d = new J({ unit: 'mm', format: 'a4' }), W = 210, M = 22
  let y = 28
  d.setFont('helvetica', 'bold'); d.setFontSize(22); d.text('QUITTANCE DE LOYER', M, y); y += 9
  d.setFont('helvetica', 'normal'); d.setFontSize(12); d.setTextColor(90); d.text('Période : ' + periode.trim(), M, y); y += 14
  d.setTextColor(0); d.setFontSize(11)
  d.setFont('helvetica', 'bold'); d.text('Bailleur', M, y); d.setFont('helvetica', 'normal'); d.text(d.splitTextToSize(txt(c.bailleur, ''), W - 2 * M - 34), M + 34, y); y += 7
  d.setFont('helvetica', 'bold'); d.text('Locataire', M, y); d.setFont('helvetica', 'normal'); d.text(d.splitTextToSize(txt(c.locataire, ''), W - 2 * M - 34), M + 34, y); y += 7
  d.setFont('helvetica', 'bold'); d.text('Logement', M, y); d.setFont('helvetica', 'normal')
  const adr = d.splitTextToSize(txt(c.adresse, ''), W - 2 * M - 34); d.text(adr, M + 34, y); y += 7 * adr.length + 8
  d.setDrawColor(200); d.line(M, y, W - M, y); y += 9
  d.text('Loyer', M, y); d.text(eur(l) + ' EUR', W - M, y, { align: 'right' }); y += 8
  d.text('Provision pour charges', M, y); d.text(eur(ch) + ' EUR', W - M, y, { align: 'right' }); y += 5
  d.line(M, y, W - M, y); y += 8
  d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text('Total acquitté', M, y); d.text(eur(l + ch) + ' EUR', W - M, y, { align: 'right' }); y += 14
  d.setFont('helvetica', 'normal'); d.setFontSize(11)
  const corps = 'Je soussigné(e) ' + txt(c.bailleur) + ', bailleur, déclare avoir reçu de ' + txt(c.locataire) + ' la somme de ' + eur(l + ch) +
    ' euros au titre du loyer et des charges de la période indiquée, et lui en donne quittance, sous réserve de tous mes droits.'
  const li = d.splitTextToSize(corps, W - 2 * M); d.text(li, M, y); y += 6 * li.length + 12
  d.text('Fait à ' + txt(c.lieu) + ', le ' + txt(c.date), M, y); y += 18
  d.text('Le bailleur', W - M - 40, y)
  d.setFontSize(8); d.setTextColor(130)
  d.text(d.splitTextToSize('Quittance établie en application de l’article 21 de la loi du 6 juillet 1989. ' + PIED, W - 2 * M), M, 281)
  return { pdf: d, nom: 'quittance-' + slug(periode) + '.pdf' }
}

export function pdfBail(J, c) {
  const tp = Object.prototype.hasOwnProperty.call(TYPES_BAIL, c.typeBail) ? c.typeBail : 'nu', t = TYPES_BAIL[tp]
  const l = num(c.loyer), ch = num(c.charges)
  const s = stylo(J)
  s.titreDoc('CONTRAT DE LOCATION', t.st)
  s.titre('1. Les parties')
  s.para('Le bailleur : ' + txt(c.bailleur) + '.'); s.para('Le locataire : ' + txt(c.locataire) + '.')
  s.titre('2. Le logement')
  s.para('Adresse : ' + txt(c.adresse) + '.')
  if (tp !== 'garage') s.para('Surface habitable : ' + txt(c.surface) + ' m². Le bailleur complète ici la désignation du logement : type, nombre de pièces, équipements, parties communes, chauffage et eau chaude.')
  else s.para("Le bailleur complète ici la désignation du local : numéro d'emplacement, dimensions, accès.")
  s.titre('3. Durée')
  s.para('Durée du bail : ' + t.duree + '. Date de prise d’effet : ____ / ____ / ________.')
  if (tp === 'nu') s.para("Le bail est reconduit tacitement. Le locataire peut donner congé à tout moment avec un préavis de trois mois (un mois en zone tendue ou dans les cas prévus par la loi). Le bailleur ne peut donner congé qu'à l'échéance, avec un préavis de six mois et pour un motif légitime et sérieux (reprise, vente, motif sérieux).")
  if (tp === 'meuble') s.para("Le bail est reconduit tacitement pour un an. Le locataire peut donner congé avec un préavis d'un mois. Le bailleur donne congé avec un préavis de trois mois, pour un motif légitime et sérieux.")
  if (tp === 'etudiant') s.para("Le bail de neuf mois n'est pas reconduit tacitement. Le locataire doit justifier de sa qualité d'étudiant. Il peut donner congé avec un préavis d'un mois.")
  if (tp === 'mobilite') s.para("Le bail mobilité dure de un à dix mois, non renouvelable et non reconductible. Le locataire doit justifier d'une situation prévue par la loi (formation, études, stage, mission temporaire). Préavis du locataire : un mois.")
  s.titre('4. Loyer et charges')
  s.para('Loyer mensuel hors charges : ' + eur(l) + ' euros. Provision pour charges : ' + eur(ch) + ' euros, avec régularisation annuelle sur justificatifs. Total mensuel : ' + eur(l + ch) + " euros, payable d'avance le ____ de chaque mois.")
  if (tp !== 'garage') s.para("Révision annuelle : le loyer peut être révisé chaque année à la date anniversaire, selon la variation de l'indice de référence des loyers (IRL) publié par l'INSEE. Dans les zones concernées, le loyer respecte le dispositif d'encadrement applicable.")
  s.titre('5. Dépôt de garantie')
  if (t.depMois > 0) s.para('Montant : ' + eur(l * t.depMois) + ' euros (' + t.depMois + " mois de loyer hors charges). Il est restitué dans un délai d'un mois à compter de la remise des clés si l'état des lieux de sortie est conforme à celui d'entrée, deux mois dans le cas contraire, déduction faite des sommes justifiées.")
  else if (t.depMois === 0) s.para("Le bail mobilité ne comporte pas de dépôt de garantie : la loi l'interdit.")
  else s.para('Montant librement fixé entre les parties : ________ euros.')
  s.titre('6. Obligations')
  s.para("Le locataire paie le loyer et les charges aux échéances, use paisiblement du bien, répond des dégradations survenues pendant la location, effectue l'entretien courant et les menues réparations, et s'assure contre les risques locatifs (attestation remise avec les clés puis chaque année).")
  s.para("Le bailleur délivre un logement décent, assure au locataire la jouissance paisible, entretient le bien en état de servir, réalise les réparations autres que locatives et remet gratuitement les quittances sur demande.")
  if (['meuble', 'etudiant', 'mobilite'].includes(tp)) s.para('Un inventaire détaillé et un état descriptif du mobilier sont annexés au bail.')
  s.titre('7. Clause résolutoire')
  s.para("À défaut de paiement du loyer, des charges ou du dépôt de garantie, ou de souscription de l'assurance, le bail peut être résilié de plein droit après un commandement de payer demeuré infructueux, dans les conditions et délais prévus par la loi.")
  s.titre('8. Pièces à joindre')
  const pieces = tp === 'garage' ? ["État des lieux d'entrée (conseillé)"] : [
    'Diagnostic de performance énergétique (DPE)', 'État des risques et pollutions (ERP)',
    "Notice d'information relative aux droits et obligations des parties", "État des lieux d'entrée",
    'Grille de vétusté (si convenue)', 'Extrait du règlement de copropriété (le cas échéant)',
    "Constats plomb, amiante, électricité et gaz (selon l'âge du logement)"]
  pieces.forEach(p => s.para('- ' + p))
  if (['meuble', 'etudiant', 'mobilite'].includes(tp)) s.para('- Inventaire et état descriptif du mobilier')
  s.signatures('Le bailleur', 'Le locataire')
  s.pieds()
  return { pdf: s.d, nom: 'bail-' + slug(tp) + '.pdf' }
}

const ETATS = { neuf: 'Neuf', bon: 'Bon état', usage: "État d'usage", mauvais: 'Mauvais état' }

export function pdfEdl(J, c) {
  const sortie = c.sens === 'sortie'
  const s = stylo(J)
  s.titreDoc("ÉTAT DES LIEUX " + (sortie ? 'DE SORTIE' : "D'ENTRÉE"), 'Établi contradictoirement entre le bailleur et le locataire')
  s.titre('Les parties et le logement')
  s.ligne('Bailleur', txt(c.bailleur)); s.ligne('Locataire', txt(c.locataire)); s.ligne('Logement', txt(c.adresse)); s.ligne('Date', txt(c.date, '____ / ____ / ________'))
  s.titre('Relevés des compteurs')
  const co = c.compteurs || {}
  s.ligne('Électricité', txt(co.elec, '________')); s.ligne('Eau', txt(co.eau, '________')); s.ligne('Gaz', txt(co.gaz, '________'))
  s.titre('Clés remises')
  s.para(txt(c.cles, '____') + ' clé(s) / badge(s) / télécommande(s).')
  s.titre('Pièces et éléments')
  const pieces = Array.isArray(c.pieces) && c.pieces.length ? c.pieces : [{ nom: 'Pièce', etat: 'bon', remarque: '' }]
  pieces.forEach(p => {
    const rem = txt(p.remarque, '')
    s.para('[ ] ' + txt(p.nom, 'Pièce') + ' : ' + (Object.prototype.hasOwnProperty.call(ETATS, p.etat) ? ETATS[p.etat] : '') + (rem ? '. ' + rem : '.'))
  })
  s.para('Photos horodatées recommandées pour chaque pièce et chaque défaut constaté.', 9.5)
  s.titre('Observations')
  s.para(txt(c.observations, '________________________________________________________________'))
  s.para("L'état des lieux est établi à l'amiable, en présence des deux parties, et annexé au bail. Chaque partie en conserve un exemplaire. " +
    (sortie ? "Il est comparé à l'état des lieux d'entrée pour déterminer les éventuelles retenues, en tenant compte de la vétusté." : "Il sert de référence à la restitution du dépôt de garantie. Le locataire peut demander sa correction dans les dix jours."))
  s.signatures('Le bailleur', 'Le locataire', c.lieu, c.date)
  s.pieds()
  return { pdf: s.d, nom: 'etat-des-lieux-' + (sortie ? 'sortie' : 'entree') + '.pdf' }
}

export function pdfAvenant(J, c) {
  const actuel = num(c.loyerActuel), nouveau = num(c.loyerNouveau), travaux = num(c.montantTravaux)
  const hausse = Math.max(0, nouveau - actuel)
  const s = stylo(J)
  s.titreDoc('AVENANT AU BAIL', 'Majoration de loyer à la suite de travaux')
  s.titre('Entre les soussignés')
  s.para('Le bailleur : ' + txt(c.bailleur) + '.'); s.para('Le locataire : ' + txt(c.locataire) + '.')
  s.titre('Le bail concerné')
  s.para('Bail du ' + txt(c.dateBail, '____ / ____ / ________') + ' portant sur le logement situé : ' + txt(c.adresse) + '.')
  s.titre('Article 1. Objet des travaux')
  s.para('Le bailleur réalise ou a réalisé les travaux suivants : ' + txt(c.objet, '________________________________________________') + '.')
  if (travaux > 0) s.para('Montant des travaux (TTC) : ' + eur(travaux) + ' euros.')
  s.titre('Article 2. Nouveau loyer')
  s.para('Loyer mensuel hors charges avant travaux : ' + eur(actuel) + ' euros. Nouveau loyer mensuel hors charges : ' + eur(nouveau) + ' euros, soit une majoration de ' + eur(hausse) + ' euros par mois (' + eur(hausse * 12) + ' euros par an).')
  s.para("Le nouveau loyer s'applique à compter du " + txt(c.dateEffet, '____ / ____ / ________') + '. Les autres clauses du bail demeurent inchangées.')
  if (c.zoneTendue === true || c.zoneTendue === 'oui') {
    const plafond = travaux * 0.15
    s.para("Le logement est situé en zone tendue : la majoration annuelle est à vérifier au regard du plafond de 15 % du coût des travaux" +
      (travaux > 0 ? ' (soit ' + eur(plafond) + ' euros par an pour ce montant)' : '') + ', et des règles d’encadrement du loyer et de performance énergétique applicables.')
  }
  s.titre('Article 3. Accord des parties')
  s.para("Le locataire déclare accepter la majoration ci-dessus. L'avenant est signé en deux exemplaires et annexé au bail.")
  s.signatures('Le bailleur', 'Le locataire', c.lieu, c.date)
  s.pieds()
  return { pdf: s.d, nom: 'avenant-bail-travaux.pdf' }
}

const GENERATEURS = { quittance: pdfQuittance, bail: pdfBail, edl: pdfEdl, avenant: pdfAvenant }
export function genererDocument(J, doc) {
  const g = GENERATEURS[doc && doc.type]
  if (!g) throw new Error('type de document inconnu')
  return g(J, doc.champs || {})
}

// ── chargement de jsPDF (déjà embarqué en base64 par index.html, à la demande) ─
async function chargerJsPdf() {
  const classe = () => (window.jspdf && window.jspdf.jsPDF) || (typeof window.jsPDF === 'function' ? window.jsPDF : null)
  if (classe()) return classe()
  if (!window._BAIL_PDF_LIBS && typeof window.ensurePdfLibs === 'function') await window.ensurePdfLibs()
  const b64 = window._BAIL_PDF_LIBS && window._BAIL_PDF_LIBS.jspdf
  if (!b64) throw new Error('jsPDF indisponible')
  const bin = atob(b64)
  const octets = Uint8Array.from(bin, c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([octets], { type: 'text/javascript' }))
  await new Promise((resolve, reject) => {
    const sc = document.createElement('script')
    sc.src = url
    sc.onload = () => { URL.revokeObjectURL(url); resolve() }
    sc.onerror = () => { URL.revokeObjectURL(url); reject(new Error('jsPDF : échec de chargement')) }
    document.head.appendChild(sc)
  })
  const J = classe()
  if (!J) throw new Error('jsPDF non exposé')
  return J
}

// ── fenêtre de remise : composants et variables de l'app (thème clair/sombre), clavier, focus ──
const LIBELLES = { quittance: 'Quittance de loyer', bail: 'Contrat de location', edl: 'État des lieux', avenant: 'Avenant au bail' }

export function resumeDocument(doc) {
  const c = doc.champs || {}
  return [LIBELLES[doc.type] || 'Document', [c.bailleur, c.locataire].filter(Boolean).join(' et '), c.adresse].filter(Boolean)
}

export function afficherRemise(doc, telecharger) {
  const ov = document.createElement('div')
  ov.className = 'ov'; ov.id = 'ov-doc-express'
  const modal = document.createElement('div')
  modal.className = 'modal'; modal.style.maxWidth = '460px'
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'doc-express-titre')
  modal.tabIndex = -1
  const tete = document.createElement('div'); tete.className = 'm-head'
  const h = document.createElement('h3'); h.id = 'doc-express-titre'; h.style.margin = '0'; h.textContent = 'Document prêt'
  tete.append(h)
  const corps = document.createElement('div'); corps.className = 'm-body'
  const resume = document.createElement('div'); resume.className = 'mb8'
  resume.style.cssText = 'background:var(--sur2);border:1px solid var(--bor);border-radius:10px;padding:10px 12px;line-height:1.5'
  resumeDocument(doc).forEach((l, i) => { const p = document.createElement('div'); p.textContent = l; if (i === 0) p.style.fontWeight = '700'; resume.append(p) })
  const info = document.createElement('p'); info.className = 'mb8'
  info.textContent = 'Le document correspond à la saisie faite sur propryo.fr. Le PDF se télécharge en un clic.'
  const pied = document.createElement('div'); pied.className = 'flex-c'; pied.style.gap = '8px'
  const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn bp'; bt.textContent = 'Télécharger le PDF'
  const ba = document.createElement('button'); ba.type = 'button'; ba.className = 'btn bs'; ba.textContent = 'Annuler'
  for (const b of [bt, ba]) b.style.minHeight = '44px'
  pied.append(bt, ba)
  corps.append(resume, info, pied)
  modal.append(tete, corps); ov.append(modal)

  const precedent = document.activeElement
  const fermer = () => { document.removeEventListener('keydown', clavier, true); ov.remove(); try { precedent && precedent.focus && precedent.focus() } catch (e) {} }
  function clavier(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); return }
    if (e.key !== 'Tab') return
    const f = [...modal.querySelectorAll('button')]
    if (!f.length) return
    const premier = f[0], dernier = f[f.length - 1]
    if (e.shiftKey && (document.activeElement === premier || document.activeElement === modal)) { e.preventDefault(); dernier.focus() }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus() }
  }
  bt.onclick = () => {
    try { telecharger() } catch (e) { info.textContent = 'Le téléchargement a échoué. Il suffit de refaire le document depuis propryo.fr.'; return }
    info.textContent = MESSAGE_SUIVI
    bt.remove(); ba.textContent = 'Fermer'; ba.className = 'btn bp'; ba.focus()
  }
  ba.onclick = fermer
  document.addEventListener('keydown', clavier, true)
  document.body.append(ov)
  modal.focus()   // focus initial sur la fenêtre (titre lu), pas sur « Télécharger » : pas de clic involontaire
}

// ── point d'entrée, appelé une fois l'application affichée ──────────────────
const ESSAIS_MAX = 2
const MSG_REFUS = {
  taille: "Le document reçu de propryo.fr est trop volumineux : il n'a pas été retenu. Il suffit de le refaire avec des textes plus courts.",
  format: "Le document reçu de propryo.fr n'a pas pu être lu. Il suffit de le refaire depuis le site.",
}

export async function consommerDocExpress({ storage = localStorage, charger = chargerJsPdf, afficher = afficherRemise, signaler } = {}) {
  const lu = lireEnAttente(storage)
  if (!lu) return false
  const prevenir = signaler || (m => { try { if (typeof window !== 'undefined' && typeof window.showToast === 'function') window.showToast(m, 'err', 9000) } catch (_) {} })
  if (lu.erreur) { prevenir(MSG_REFUS[lu.erreur] || MSG_REFUS.format); return false }
  const doc = lu.doc
  let brut = null
  try { brut = JSON.parse(storage.getItem(CLE_DOC_EXPRESS)) } catch (e) {}
  const essais = (brut && brut.essais) || 0
  // la clé est retirée AVANT l'essai (pas de boucle, pas de doublon d'un autre onglet) ; remise en cas d'échec
  // transitoire (réseau, libs PDF), au plus ESSAIS_MAX fois
  try { storage.removeItem(CLE_DOC_EXPRESS) } catch (e) {}
  try {
    const J = await charger()
    const { pdf, nom } = genererDocument(J, doc)
    afficher(doc, () => pdf.save(nom))
    return true
  } catch (e) {
    try { console.warn('[doc-express]', e) } catch (_) {}
    if (brut && essais + 1 < ESSAIS_MAX) { try { storage.setItem(CLE_DOC_EXPRESS, JSON.stringify({ ...brut, essais: essais + 1 })) } catch (_) {} }
    prevenir("Le document n'a pas pu être généré. Il suffit de le refaire depuis propryo.fr.")
    return false
  }
}
