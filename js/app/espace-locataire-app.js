// js/app/espace-locataire-app.js — ESPACE LOCATAIRE, côté PROPRIÉTAIRE (et associés de la SCI).
// CDC : mockups/ESPACE-LOCATAIRE/CDC-ESPACE-LOCATAIRE.md — décisions D1 → D14 (GO Didier 14/10/2026). Migration 0059.
//
// Chargé après l'affichage de l'app (supabase-entry.js, mode cloud seulement). Rôles :
//  1. bloc « Espace locataire » de l'onglet Bail de la fiche logement (window._elBlocHtml, appelé par rLogFiche) :
//     état du lien par colocataire, dernière visite, accord électronique, créer / renouveler et envoyer / révoquer,
//     documents visibles (retrait), messages ;
//  2. PUBLICATION automatique des documents définitifs du bail (D6) : bail et avenants signés (fichiers déjà
//     archivés), états des lieux signés, quittances et décomptes (PDF figés au moment de la publication), justificatifs ;
//  3. IMPORT des signalements du locataire dans le registre des incidents (D11, nouvelIncident) ;
//  4. fin de bail / clôture des comptes reportées sur les accès (phases D4).
// Le jeton est tiré ICI (navigateur du propriétaire) ; seule son empreinte part en base ; le lien n'est montré qu'une
// fois (D3). Toute écriture passe par la RLS par SCI (window.__immoEspaceLoc, supabase-entry.js).
import * as EL from '../core/espace-locataire.js'
import { bailLigneCle } from '../core/store-mapping.js'
import { validationsDuLogement, estDeLEspacePropre } from '../core/regul-validation.js'

const W = window
const API = () => W.__immoEspaceLoc
const G = (n) => (typeof W[n] === 'function' ? W[n] : null)          // fonctions globales de l'app (déclarations classiques)
const esc = (s) => (G('escHtml') ? W.escHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])))
const ico = (n, s) => (G('_uiIcon') ? W._uiIcon(n, s) : '')
const toast = (m, t, d) => { if (G('showToast')) W.showToast(m, t || 'ok', d) }
const fdate = (s) => (G('fd') ? W.fd(String(s || '').slice(0, 10)) : String(s || '').slice(0, 10))
const fdh = (s) => { const d = new Date(s); if (isNaN(d)) return ''; return fdate(d.toISOString()) + ' à ' + String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0') }
// Même lecture de date que store-mapping (dateOnly) : « AAAA-MM-JJ… » tel quel, sinon date UTC.
const jour = (s) => { const v = String(s == null ? '' : s); if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); const d = new Date(v); return v && !isNaN(d) ? d.toISOString().slice(0, 10) : '' }
const db = () => { try { return DB } catch (e) { return null } }   // eslint-disable-line no-undef
const vivant = (o) => o && !o._deleted

const etat = { acces: [], docs: new Map(), msgs: new Map(), relais: null, charge: false, enCours: false, dernier: 0, accesLuLe: 0, accesTenteLe: 0, echecs: new Set() }

// ─────────────────────────── Correspondance bail (app) ↔ ligne `baux` (cloud) ───────────────────────────
function locatairesDuBail(bail, log) {
  if (bail && Array.isArray(bail.locataires) && bail.locataires.length)
    return bail.locataires.map((l) => ({ nom: String((l && l.nom) || '').trim() || 'Locataire', email: String((l && l.email) || '').trim() }))
  return [{ nom: String((bail && bail.nom) || (log && log.locataire) || 'Locataire').trim(), email: String((bail && bail.email) || (log && log.mail) || '').trim() }]
}
function logDe(ref) { return ((db() || {}).logements || []).find((l) => vivant(l) && l.ref === ref) || null }
function entNomDe(bail, log) { return (bail && bail.entity) || (log && log.entity) || null }
function bailId(ref, bail) {
  const a = API(); if (!a || !bail) return null
  const r = String(ref).split('@@')[0]
  return a.uuid('bail', bailLigneCle(r, bail._bailUid), entNomDe(bail, logDe(r)))
}
// Toutes les locations connues (en cours + archivées), indexées par id de ligne `baux`.
function locations() {
  const D = db() || {}, out = []
  for (const [k, bail] of Object.entries(D.baux || {})) {
    if (!vivant(bail)) continue
    const ref = String(k).split('@@')[0]
    out.push({ ref, bail, archive: false, id: bailId(ref, bail), debut: jour(bail.debut) || null })
  }
  for (const h of D.baux_historique || []) {
    if (!vivant(h) || !h.ref) continue
    out.push({ ref: String(h.ref).split('@@')[0], bail: h, archive: true, id: bailId(h.ref, h), debut: jour(h.debut) || null })
  }
  return out
}
function locationDe(a) {
  return locations().find((t) => t.id === a.bail_id && (t.debut || null) === (a.bail_debut || null)) || null
}
const finOcc = (bail, archive) => (typeof W.finOccupationBail === 'function' ? W.finOccupationBail(bail, archive) : String(bail.finEffective || (archive ? bail.fin : '') || ''))

// ─────────────────────────── Chargement ───────────────────────────
async function chargerAcces() {
  const a = API(); if (!a || !a.pret()) return
  try {
    etat.acces = await a.select('locataire_acces', {}, 'id,espace_id,entite_id,logement_id,bail_id,bail_debut,locataire_rang,locataire_nom,emis_le,revoque_le,fin_bail,comptes_clos_le,derniere_visite,accord_quittance_le,accord_quittance_version,accord_quittance_code,accord_retire_le')
    const ids = etat.acces.map((x) => x.id)
    etat.msgs = new Map()
    if (ids.length) {
      const m = await a.select('locataire_messages', { acces_id: ids }, 'id,acces_id,auteur,corps,pieces,cree_le,lu_bailleur_le,signalement_id')
      for (const x of m) { if (!etat.msgs.has(x.acces_id)) etat.msgs.set(x.acces_id, []); etat.msgs.get(x.acces_id).push(x) }
      for (const l of etat.msgs.values()) l.sort((p, q) => String(p.cree_le).localeCompare(String(q.cree_le)))
    }
    etat.charge = true
    etat.accesLuLe = Date.now()
  } catch (e) { console.warn('[espace-locataire] accès', e && e.message) }
}
async function chargerDocs(bid) {
  try { etat.docs.set(bid, await API().select('locataire_documents', { bail_id: bid })) } catch (e) { etat.docs.set(bid, []) }
  return etat.docs.get(bid)
}
async function etatRelais() {
  if (etat.relais) return etat.relais
  try {
    const cfg = G('_relayCfg') ? W._relayCfg() : null
    const r = cfg ? await fetch(cfg.base + '/el/etat', { cache: 'no-store' }) : null
    etat.relais = r && r.ok ? await r.json() : { actif: false, emails: false }
  } catch (e) { etat.relais = { actif: false, emails: false } }
  return etat.relais
}

// ─────────────────────────── Bloc « Espace locataire » (fiche logement, onglet Bail) ───────────────────────────
const DUREE_LECTURE_ACCES = 60_000
const nonLus = (accesId) => (etat.msgs.get(accesId) || []).filter((m) => m.auteur === 'locataire' && !m.lu_bailleur_le).length
function accesDe(bid, debut) { return etat.acces.filter((a) => a.bail_id === bid && (a.bail_debut || null) === (debut || null)) }
const aujourdhui = () => jour(new Date().toISOString())
// Le colocataire d'un accès est identifié par son NOM (le rang dans bail.locataires bouge quand un colocataire part).
const accesDuLocataire = (liste, nom) => liste.find((y) => EL.cleNom(y.locataire_nom) === EL.cleNom(nom)) || null
const emailDe = (t, nom) => { if (!t) return ''; const l = locatairesDuBail(t.bail, logDe(t.ref)).find((x) => EL.cleNom(x.nom) === EL.cleNom(nom)); return (l && l.email) || '' }

function ligneAcces(x, note) {
  const ph = EL.phaseAcces(x.fin_bail, x.comptes_clos_le, aujourdhui())
  const lien = x.revoque_le ? 'Révoqué le ' + fdate(x.revoque_le)
    : ph === 'fini' ? 'Période de consultation terminée'
    : x.derniere_visite ? 'Actif · dernière visite le ' + fdh(x.derniere_visite) : 'Jamais ouvert · émis le ' + fdate(x.emis_le)
  const acc = EL.etatAccord(x, fdh)
  const fin = EL.finAcces(x.fin_bail, x.comptes_clos_le)
  const nm = (etat.msgs.get(x.id) || []).length, nl = nonLus(x.id)
  const actions = (ph === 'fini' ? '' : `<button type="button" class="btn bs bb" onclick="EspaceLoc.renouveler('${x.id}')">${ico('refresh', 14)} ${x.revoque_le ? 'Réactiver et envoyer' : 'Renouveler et envoyer'}</button>`)
    + (x.revoque_le || ph === 'fini' ? '' : `<button type="button" class="btn bs bb" onclick="EspaceLoc.revoquer('${x.id}')">${ico('close', 14)} Révoquer</button>`)
    + `<button type="button" class="btn bs bb" onclick="EspaceLoc.messages('${x.id}')">${ico('send', 14)} Messages${nl ? ' · ' + nl + ' non lu' + (nl > 1 ? 's' : '') : ''}</button>`
  return `<div class="el-locrow"><div class="el-locrow-h"><b>${esc(x.locataire_nom)}</b></div>
    ${note ? `<p class="el-note">${esc(note)}</p>` : ''}
    <div class="logf-bail-grid">
      <div class="logf-row"><span class="logf-label">Lien</span><span class="logf-value">${esc(lien)}</span></div>
      <div class="logf-row"><span class="logf-label">Quittance électronique</span><span class="logf-value">${esc(acc.texte)}</span></div>
      <div class="logf-row"><span class="logf-label">Fin d'accès</span><span class="logf-value">${fin ? esc(fdate(fin)) : 'À la clôture des comptes + 6 mois'}</span></div>
      <div class="logf-row"><span class="logf-label">Messages</span><span class="logf-value">${nm} message${nm > 1 ? 's' : ''}${nl ? ' · ' + nl + ' non lu' + (nl > 1 ? 's' : '') : ''}</span></div>
    </div>
    <div class="logf-bail-actions">${actions}</div></div>`
}

function blocInterieur(log, bail, ref) {
  const a = API()
  if (!a || !a.pret()) return ''
  const r = String(ref).split('@@')[0]
  const bid = bail ? bailId(ref, bail) : null, debut = bail ? (jour(bail.debut) || null) : null
  const liste = bail ? accesDe(bid, debut) : []
  // Anciennes locations du logement qui ont encore un accès (départ, documents seuls) : visibles et pilotables.
  const anciennes = new Map()
  for (const x of etat.acces) {
    if (bail && x.bail_id === bid && (x.bail_debut || null) === debut) continue
    const t = locationDe(x) || (x.logement_id && x.logement_id === a.uuid('logement', EL.cleNom(r), entNomDe(bail, log)) ? { ref: r, id: x.bail_id, debut: x.bail_debut || null } : null)
    if (!t || t.ref !== r) continue
    const k = x.bail_id + '|' + (x.bail_debut || '')
    if (!anciennes.has(k)) anciennes.set(k, { t, acces: [] })
    anciennes.get(k).acces.push(x)
  }
  if (!bail && !anciennes.size) return ''
  const actifs = liste.filter((x) => !x.revoque_le).length
  const chip = !etat.charge ? '<span class="logf-badge b-mute">Chargement…</span>'
    : actifs ? `<span class="logf-badge b-ok">${actifs} lien${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''}</span>` : '<span class="logf-badge b-mute">' + (bail ? 'Pas encore ouvert' : 'Ancienne location') + '</span>'
  const jsRef = esc(JSON.stringify(String(ref)))
  let corps = ''
  if (bail) {
    const locs = locatairesDuBail(bail, log)
    corps += locs.map((l, rang) => {
      const x = accesDuLocataire(liste, l.nom)
      if (!x) return `<div class="el-locrow"><div class="el-locrow-h"><b>${esc(l.nom)}</b><button type="button" class="btn bs bb" onclick='EspaceLoc.creer(${jsRef},${rang})'>${ico('link', 14)} Créer le lien</button></div></div>`
      return ligneAcces(x)
    }).join('')
    // Accès d'un colocataire qui n'est plus au bail (départ, nom corrigé) : jamais invisible, toujours révocable.
    for (const x of liste) if (!locs.some((l) => EL.cleNom(l.nom) === EL.cleNom(x.locataire_nom))) corps += ligneAcces(x, 'N\'est plus colocataire de ce bail : révoquer le lien si le départ est réglé.')
    const nDocs = (etat.docs.get(bid) || []).filter((d) => !d.retire_le && (d.bail_debut || null) === debut).length
    corps += `<div class="logf-bail-actions"><button type="button" class="btn bs bb" onclick='EspaceLoc.documents(${esc(JSON.stringify(bid))},${esc(JSON.stringify(debut))})'>${ico('doc', 14)} Documents visibles${etat.docs.has(bid) ? ' · ' + nDocs : ''}</button></div>`
  }
  for (const { t, acces } of anciennes.values()) {
    corps += `<h4 class="el-sous-titre">Ancienne location${t.debut ? ' du ' + esc(fdate(t.debut)) : ''}</h4>` + acces.map((x) => ligneAcces(x)).join('')
      + `<div class="logf-bail-actions"><button type="button" class="btn bs bb" onclick='EspaceLoc.documents(${esc(JSON.stringify(t.id))},${esc(JSON.stringify(t.debut))})'>${ico('doc', 14)} Documents visibles</button></div>`
  }
  return `<div class="flex-b" style="margin-bottom:10px;flex-wrap:wrap;gap:10px"><h3 class="logf-panel-title" style="margin:0">${ico('link')} Espace locataire</h3>${chip}</div>
    <p class="logf-panel-empty" style="margin:0 0 10px;text-align:left">Un lien personnel par locataire, sans mot de passe. Les documents définitifs de ce bail y sont publiés automatiquement.</p>
    ${corps}`
}
function blocHtml(log, bail, ref) {
  try {
    if (!API() || !API().pret()) return ''
    if (!etat.charge && !etat.enCours) setTimeout(() => { rafraichir().then(majBloc) }, 0)
    // « Dernière visite » : les accès sont relus à l'ouverture de la fiche si la lecture a plus d'une minute (sinon le bloc
    // montrait la valeur du dernier cycle, jusqu'à 10 minutes plus tôt). majBloc ne relance rien : pas de boucle.
    else if (etat.charge && !etat.enCours && Date.now() - Math.max(etat.accesLuLe, etat.accesTenteLe) > DUREE_LECTURE_ACCES) { etat.accesTenteLe = Date.now(); setTimeout(() => { rafraichir().then(majBloc) }, 0) }
    const bid = bail ? bailId(ref, bail) : null
    if (bid && !etat.docs.has(bid)) chargerDocs(bid).then(majBloc)
    const html = blocInterieur(log, bail, ref)
    // Logement sans bail ni ancien accès : conteneur vide, rempli si des accès arrivent au chargement.
    return `<div class="logf-panel el-bloc" style="grid-column:1/-1${html ? '' : ';display:none'}" id="el-bloc" data-ref="${esc(ref)}">${html}</div>`
  } catch (e) { console.warn('[espace-locataire] bloc', e); return '' }
}
function majBloc() {
  const n = document.getElementById('el-bloc'); if (!n) return
  const ref = n.getAttribute('data-ref'); const D = db() || {}
  const bail = G('_bienActiveBail') ? W._bienActiveBail(ref) : ((D.baux && D.baux[ref] && vivant(D.baux[ref]) && !D.baux[ref].cloture && !D.baux[ref].finEffective) ? D.baux[ref] : null)
  const html = blocInterieur(logDe(String(ref).split('@@')[0]), bail, ref)
  n.innerHTML = html
  n.style.display = html ? '' : 'none'
}

// ─────────────────────────── Couches (composant .ov / .modal de l'app) ───────────────────────────
function couche(id, titre, corps, pied) {
  const old = document.getElementById(id); if (old) old.remove()
  document.body.insertAdjacentHTML('beforeend', `<div class="ov" id="${id}" onclick="closeBg(event,'${id}')"><div class="modal" style="max-width:600px" role="dialog" aria-modal="true" aria-label="${esc(titre)}">
    <div class="m-head"><h3>${esc(titre)}</h3><button class="m-close" aria-label="Fermer" onclick="closeM('${id}')">${ico('close', 18)}</button></div>
    <div class="m-body">${corps}</div>${pied ? `<div class="m-foot">${pied}</div>` : ''}</div></div>`)
  if (G('openM')) W.openM(id)
}
const fermer = (id) => { if (G('closeM')) W.closeM(id) }

// ─────────────────────────── Émettre / renouveler / révoquer (D3) ───────────────────────────
async function partagerLien(jeton, nom, email, bienLabel, accesId) {
  const cfg = G('_relayCfg') ? W._relayCfg() : null
  const lien = cfg ? EL.lienEspace(cfg.base, jeton) : null
  if (!lien) { toast("Adresse du relais introuvable ou non sécurisée (https exigé) : lien non transmis.", 'err', 6000); return }
  const r = await etatRelais()
  let info = '<b>Lien affiché une seule fois.</b> Seule son empreinte est enregistrée : pour le transmettre à nouveau plus tard, le renouveler (l\'ancien cessera de fonctionner).'
  if (r.emails && accesId) {
    const ok = await notifier('invitation', accesId, { jeton })
    if (ok) info = 'Invitation envoyée par e-mail à l\'adresse du bail. ' + info
  }
  if (G('_openShareModal')) {
    W._openShareModal({
      title: 'Lien de l\'espace locataire', ctxIcon: ico('link', 20), ctxTitle: bienLabel,
      ctxSub: 'Locataire : <b>' + esc(nom) + '</b>', url: lien, linkLabel: 'Lien personnel', email: email || '',
      subject: 'Espace locataire — ' + bienLabel,
      message: 'Bonjour,\n\nVoici le lien personnel de l\'espace locataire, sans mot de passe : documents du bail, quittances, signalement d\'un problème, messages.\nLe garder en favori et ne pas le transférer.',
      smsLead: 'Espace locataire (lien personnel, ne pas transférer) : ', info, doneJs: 'void 0;',
    })
  }
}
async function creer(ref, rang) {
  const D = db() || {}; const bail = D.baux && D.baux[ref]; const log = logDe(String(ref).split('@@')[0])
  if (!bail) return
  const loc = locatairesDuBail(bail, log)[rang]; if (!loc) return
  if (!(bail.locataires || []).length && !(bail.nom || (log && log.locataire))) { toast('Saisir d\'abord le nom du locataire dans le bail.', 'warn', 5000); return }
  try {
    const jeton = EL.nouveauJeton(); const h = await EL.empreinteJeton(jeton)
    const id = await API().rpc('el_acces_emettre', { p_bail_id: bailId(ref, bail), p_rang: rang, p_nom: loc.nom, p_jeton_sha256: h })
    await rafraichir(); majBloc()
    await partagerLien(jeton, loc.nom, loc.email, (log && (log.adr || log.ref)) || ref, id)
    publierBientot()
  } catch (e) { toast(/el:nom-ambigu/.test(e.message) ? 'Lien non créé : deux colocataires portent le même nom dans le bail ; les distinguer d\'abord.' : 'Lien non créé : bail pas encore enregistré dans le cloud (réessayer dans un instant), droit insuffisant ou connexion perdue.', 'err', 6000) }
}
async function renouveler(accesId) {
  const x = etat.acces.find((a) => a.id === accesId); if (!x) return
  try {
    const jeton = EL.nouveauJeton(); const h = await EL.empreinteJeton(jeton)
    await API().rpc('el_acces_renouveler', { p_acces_id: accesId, p_jeton_sha256: h })
    await rafraichir(); majBloc()
    const t = locationDe(x); const log = t ? logDe(t.ref) : null
    await partagerLien(jeton, x.locataire_nom, emailDe(t, x.locataire_nom), (log && (log.adr || log.ref)) || '', accesId)
  } catch (e) { toast('Renouvellement impossible : ' + (/periode-terminee/.test(e.message) ? 'la période de consultation est terminée.' : 'droit insuffisant ou connexion perdue.'), 'err', 6000) }
}
async function revoquer(accesId) {
  const x = etat.acces.find((a) => a.id === accesId); if (!x) return
  const ok = G('confirm2') ? W.confirm2('Révoquer le lien de ' + x.locataire_nom + ' ?\n\nLe lien cesse de fonctionner immédiatement, sur tous ses appareils. Les documents, messages et signalements restent enregistrés. Un nouveau lien peut être créé ensuite.') : true
  if (!ok) return
  try { await API().rpc('el_acces_revoquer', { p_acces_id: accesId }); await rafraichir(); majBloc(); toast('Lien révoqué.') }
  catch (e) { toast('Révocation impossible : droit insuffisant ou connexion perdue.', 'err', 5000) }
}

// ─────────────────────────── Documents visibles (D6 : retrait possible) ───────────────────────────
const LIB_TYPE = { bail: 'Bail', avenant: 'Avenant', edl: 'État des lieux', quittance: 'Quittance', decompte: 'Décompte de charges', justificatif: 'Justificatif' }
async function documents(bid, debut) {
  if (!bid) return
  const ref = bid
  const liste = (await chargerDocs(bid)).filter((d) => (d.bail_debut || null) === (debut || null))
    .sort((a, b) => String(b.date_doc || b.publie_le).localeCompare(String(a.date_doc || a.publie_le)))
  const ligne = (d) => `<div class="el-docrow"><div><b>${esc(d.titre)}</b><div class="el-doc-s">${esc(LIB_TYPE[d.type_doc] || '')}${d.date_doc ? ' · ' + esc(fdate(d.date_doc)) : ''}${d.visible_jusqu_au ? ' · visible jusqu\'au ' + esc(fdate(d.visible_jusqu_au)) : ''}${d.retire_le ? ' · retiré le ' + esc(fdate(d.retire_le)) : ''}</div></div>`
    + (d.retire_le ? '' : `<button type="button" class="btn bs bb" onclick='EspaceLoc.retirer(${esc(JSON.stringify(d.id))},${esc(JSON.stringify(ref))},${esc(JSON.stringify(debut))})'>Retirer</button>`) + '</div>'
  couche('ov-el-docs', 'Documents visibles', `<p class="el-note">Publiés automatiquement dès qu'ils sont définitifs (bail et avenants signés, états des lieux signés, quittances, décomptes de charges et justificatifs). Retirer un document le masque dans l'espace ; le fichier reste conservé.</p>`
    + (liste.length ? liste.map(ligne).join('') : '<p class="logf-panel-empty">Aucun document publié pour le moment.</p>'),
  `<button class="btn bs" onclick="EspaceLoc.publierMaintenant()">${ico('refresh', 14)} Publier maintenant</button><button class="btn bp" onclick="closeM('ov-el-docs')">Terminé</button>`)
}
async function retirer(docId, bid, debut) {
  const ok = G('confirm2') ? W.confirm2('Retirer ce document de l\'espace locataire ?\n\nIl ne sera plus visible du locataire. Le fichier reste conservé et le document ne sera pas republié automatiquement.') : true
  if (!ok) return
  try { await API().update('locataire_documents', docId, { retire_le: new Date().toISOString() }); toast('Document retiré.'); documents(bid, debut) }
  catch (e) { toast('Retrait impossible : droit insuffisant ou connexion perdue.', 'err', 5000) }
}

// ─────────────────────────── Messages (D13 : au nom du bailleur) ───────────────────────────
const brouillons = new Map()
function messages(accesId) {
  const x = etat.acces.find((a) => a.id === accesId); if (!x) return
  const liste = etat.msgs.get(accesId) || []
  const t = locationDe(x); const log = t ? logDe(t.ref) : null
  const bailleur = entNomDe(t && t.bail, log) || 'le bailleur'
  const bulle = (m) => `<div class="el-bub ${m.auteur === 'bailleur' ? 'me' : 'them'}"><div class="el-bub-t">${esc(m.corps)}</div>`
    + (m.pieces || []).map((p, k) => `<button type="button" class="btn bs bb el-att" onclick="EspaceLoc.ouvrirPiece('${m.id}',${k})">${ico('doc', 13)} ${esc(p.nom || 'Pièce jointe')}</button>`).join('')
    + `<div class="el-bub-m">${m.auteur === 'bailleur' ? 'Envoyé au nom de ' + esc(bailleur) : esc(x.locataire_nom)} · ${esc(fdh(m.cree_le))}</div></div>`
  const ph = EL.phaseAcces(x.fin_bail, x.comptes_clos_le, jour(new Date().toISOString()))
  const ouvert = EL.peut(ph, 'message') && !x.revoque_le
  const jointes = (brouillons.get(accesId) || {}).pieces || []
  couche('ov-el-msg', 'Messages · ' + x.locataire_nom,
    `<div class="el-fil">${liste.length ? liste.map(bulle).join('') : '<p class="logf-panel-empty">Aucun message.</p>'}</div>`
    + (ouvert ? `<p class="el-note">Le locataire voit le nom « ${esc(bailleur)} », jamais celui de la personne qui répond. Réponse visible à sa prochaine ouverture de l'espace.</p>
      <textarea class="inp" id="el-msg-txt" rows="4" maxlength="4000" placeholder="Écrire au locataire">${esc((brouillons.get(accesId) || {}).texte || '')}</textarea>
      <div id="el-msg-pj">${jointes.map((p) => `<span class="el-pj">${esc(p.nom)}</span>`).join('')}</div>` : '<p class="el-note">Les messages sont fermés pour cette location.</p>'),
    ouvert ? `<button class="btn bs" onclick="EspaceLoc.joindre('${accesId}')">${ico('doc', 14)} Joindre</button><button class="btn bp" onclick="EspaceLoc.repondre('${accesId}')">${ico('send', 14)} Envoyer dans l'espace</button>` : `<button class="btn bp" onclick="closeM('ov-el-msg')">Fermer</button>`)
  // Marquer lus (au nom de qui lit : colonne lu_bailleur_le, droit d'écriture de la SCI requis ; sinon silencieux).
  const aLire = liste.filter((m) => m.auteur === 'locataire' && !m.lu_bailleur_le)
  if (aLire.length) Promise.all(aLire.map((m) => API().update('locataire_messages', m.id, { lu_bailleur_le: new Date().toISOString() }).then(() => { m.lu_bailleur_le = new Date().toISOString() }).catch(() => {}))).then(majBloc)
}
function cheminPieceProprio(x, ext) {
  const seg = x.entite_id || '_orphelin'
  const uuid = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : null
  return uuid ? `${x.espace_id}/${seg}/files/el-${x.id}-${uuid}.${ext}` : null
}
function joindre(accesId) {
  const x = etat.acces.find((a) => a.id === accesId); if (!x) return
  const b = brouillons.get(accesId) || { texte: '', pieces: [] }
  const ta = document.getElementById('el-msg-txt'); if (ta) b.texte = ta.value
  brouillons.set(accesId, b)
  if ((b.pieces || []).length >= 4) { toast('4 pièces jointes au plus.', 'warn'); return }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,application/pdf'
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return
    if (f.size > EL.DEPOT_MAX_OCTETS) { toast('Fichier trop lourd : 10 Mo au plus.', 'warn'); return }
    const ext = EL.typeReel(new Uint8Array(await f.slice(0, 16).arrayBuffer()))
    if (!ext) { toast('Format non accepté : photo (JPEG, PNG) ou PDF.', 'warn'); return }
    const path = cheminPieceProprio(x, ext); if (!path) return
    try { await API().upload(path, f, EL.MIME_DE[ext]); b.pieces.push({ path, nom: f.name.slice(0, 120), mime: EL.MIME_DE[ext], taille: f.size }); messages(accesId) }
    catch (e) { toast('Pièce non envoyée : droit insuffisant ou connexion perdue.', 'err', 5000) }
  }
  inp.click()
}
async function repondre(accesId, texteImpose, signalementId) {
  const x = etat.acces.find((a) => a.id === accesId); if (!x) return
  const b = brouillons.get(accesId) || { texte: '', pieces: [] }
  const ta = document.getElementById('el-msg-txt')
  const corps = texteImpose != null ? texteImpose : (ta ? ta.value : b.texte)
  const err = EL.erreurMessage(corps, b.pieces)
  if (err) { toast(err, 'warn'); return false }
  try {
    const row = { acces_id: accesId, auteur: 'bailleur', corps: String(corps).trim(), pieces: texteImpose != null ? [] : b.pieces }
    if (signalementId) row.signalement_id = signalementId
    const m = await API().insert('locataire_messages', row)
    if (!etat.msgs.has(accesId)) etat.msgs.set(accesId, [])
    etat.msgs.get(accesId).push(m)
    if (texteImpose == null) brouillons.delete(accesId)
    toast('Message déposé dans l\'espace locataire.')
    notifier('message', accesId, {})
    if (texteImpose == null) messages(accesId)
    majBloc()
    return true
  } catch (e) { toast('Message non envoyé : droit insuffisant ou connexion perdue.', 'err', 5000); return false }
}
async function ouvrirPiece(messageId, index) {
  for (const l of etat.msgs.values()) {
    const m = l.find((y) => y.id === messageId); if (!m) continue
    const p = (m.pieces || [])[index]; if (!p || !p.path) return
    const url = G('__immoCloudFileUrl') ? await W.__immoCloudFileUrl(p.path, 300) : null
    if (url) W.open(url, '_blank', 'noopener'); else toast('Pièce indisponible.', 'err')
    return
  }
}

// Incident → message au locataire (règle du chantier Travaux : le texte part seulement par geste explicite, après
// relecture). Appelé depuis la vue « Message au locataire » de l'incident.
const ouvertAuxMessages = (x) => x && !x.revoque_le && EL.peut(EL.phaseAcces(x.fin_bail, x.comptes_clos_le, aujourdhui()), 'message')
function accesPourIncident(inc) {
  if (!inc) return null
  if (inc.espaceAccesId) { const a = etat.acces.find((x) => x.id === inc.espaceAccesId && ouvertAuxMessages(x)); if (a) return a }
  const D = db() || {}; const bail = inc.logRef && D.baux && D.baux[inc.logRef]
  if (!bail) return null
  const bid = bailId(inc.logRef, bail)
  return accesDe(bid, jour(bail.debut) || null).filter(ouvertAuxMessages).sort((a, b) => a.locataire_rang - b.locataire_rang)[0] || null
}
function disponiblePourIncident(inc) { return !!accesPourIncident(inc) }
async function envoyerTexteIncident(incId) {
  const inc = ((db() || {}).incidents || []).find((i) => vivant(i) && String(i.id) === String(incId)); if (!inc) return
  const a = accesPourIncident(inc); if (!a) { toast('Aucun espace locataire actif pour ce bail.', 'warn'); return }
  const ta = document.getElementById('inc-msg'); const t = ta ? ta.value : ''
  const corps = String(t).split('\n').filter((l, i) => !(i === 0 && /^Objet\s*:/.test(l))).join('\n').trim()
  const ok = G('confirm2') ? W.confirm2('Déposer ce message dans l\'espace locataire de ' + a.locataire_nom + ' ?\n\nLe texte part tel qu\'il est affiché.') : true
  if (!ok) return
  await repondre(a.id, corps, (inc.espaceAccesId === a.id && inc.espaceSignalementId) || null)
}

// ─────────────────────────── Publication automatique (D6, D8) ───────────────────────────
let _pubTimer = null
function publierBientot() { clearTimeout(_pubTimer); _pubTimer = setTimeout(() => cycle(true), 4000) }
const sur = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)
async function sha256Hex(blob) {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function cheminComplet(cloudKey, entNom) {
  const k = String(cloudKey || ''); if (!k) return null
  if (k.indexOf('/files/') !== -1) return k
  const seg = G('_cloudEntiteSeg') ? W._cloudEntiteSeg(entNom) : '_orphelin'
  const esp = API().espaceDeSeg(seg) || API().espacePropre()
  return esp ? esp + '/files/' + k : null   // clé nue LEGACY : <espace>/files/<clé> (même relecture que __immoCloudFileUrl)
}
async function base64EnBlob(r) {
  const bin = atob(r.base64); const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}
async function televerserGenere(blob, t, cle) {
  const entNom = entNomDe(t.bail, logDe(t.ref))
  const seg = G('_cloudEntiteSeg') ? W._cloudEntiteSeg(entNom) : '_orphelin'
  const esp = API().espaceDeSeg(seg) || API().espacePropre()
  const h = await sha256Hex(blob)
  const path = `${esp}/${seg}/files/el_${sur(t.ref)}_${sur(cle)}_${h.slice(0, 12)}.pdf`
  await API().upload(path, blob, 'application/pdf')
  return { storage_path: path, sha256: h, taille: blob.size }
}

// Documents SOUHAITÉS pour une location. Les fichiers déjà archivés sont référencés ; les autres seront générés.
function souhaites(t, emisLe) {
  const D = db() || {}, out = []
  const log = logDe(t.ref), entNom = entNomDe(t.bail, log)
  const fin = (finOcc(t.bail, t.archive) || '').slice(0, 10) || null
  const sig = t.bail.signatures || {}
  if (sig.signedAt && sig.cloudPdfKey) out.push({ cle: 'bail:signe', type_doc: 'bail', titre: 'Bail signé', date_doc: jour(sig.signedAt), storage_path: cheminComplet(sig.cloudPdfKey, entNom) })
  for (const av of D.baux_evenements || []) {
    if (!vivant(av) || av.type !== 'avenant' || av.statut !== 'signe') continue
    if (String(av.ref || '').split('@@')[0] !== t.ref || (jour(av.bailDebut) || null) !== t.debut) continue
    const doc = (D.documents || []).find((d) => vivant(d) && (d.id === av.pdfDocId || d.id === av.scanDocId) && d.cloudKey)
    const p = doc ? doc.cloudKey : (typeof av.pdfKey === 'string' ? av.pdfKey : null)
    if (p) out.push({ cle: EL.cleDocument('avenant', av.id), type_doc: 'avenant', titre: 'Avenant n° ' + (av.no || ''), date_doc: jour(av.signeLe || av.date), storage_path: cheminComplet(p, entNom) })
  }
  const loc = { debut: t.debut, fin, noms: locatairesDuBail(t.bail, log).map((l) => l.nom) }
  for (const edl of D.edl || []) {
    if (!vivant(edl) || edl.logement !== t.ref || !(edl.signatures && edl.signatures.signedAt)) continue
    if (!EL.edlDeLaLocation(edl, loc)) continue   // identité + bornes : jamais l'EDL d'un autre locataire
    const sortie = /sortie/i.test(edl.type || '')
    out.push({ cle: EL.cleDocument('edl', edl.id), type_doc: 'edl', titre: sortie ? 'État des lieux de sortie' : 'État des lieux d\'entrée', date_doc: jour(edl.date),
      generer: async () => (G('generateEDLPdfNative') ? W.generateEDLPdfNative(edl) : null) })
  }
  if (!t.archive) {   // quittances : seulement pour la location EN COURS (le rendu relit le bail courant, F11)
    for (const q of D.quittances || []) {
      if (!vivant(q) || q.logement !== t.ref) continue
      const mk = EL.moisCle(q.mois); if (!mk) continue
      if (!EL.quittanceDeLaLocation(q, loc)) continue   // identité + mois : jamais la quittance d'un autre locataire
      const reedition = emisLe && q.date && jour(q.date) < jour(emisLe)
      out.push({ cle: EL.cleDocument('quittance', mk), type_doc: 'quittance', titre: EL.titreQuittance(q.mois) + (reedition ? ' (réédition du ' + fdate(new Date().toISOString()) + ')' : ''),
        periode: q.mois, date_doc: jour(q.date) || null,
        generer: async () => {
          // Rendu NATIF seulement, appelé directement (le repli texte de secours ne doit jamais être figé comme définitif).
          if (!G('_buildQuittanceHtml') || !G('_docHtmlToNativeBlob') || !W.DocNative) return null
          const ent = (D.entites || []).find((e) => e.nom === (q.entity || entNom)) || {}
          try { const built = W._buildQuittanceHtml({ ...q, total: (q.hc || 0) + (q.ch || 0) }, log || { ref: t.ref }, ent, t.bail); return built && built.html ? await W._docHtmlToNativeBlob(built.html, ent) : null }
          catch (e) { return null }
        } })
    }
  }
  // Décomptes validés + justificatifs (art. 23 : 6 mois après l'envoi)
  // ALERTE-REGUL (14/10) : la validation est portée par le LOGEMENT (partagée par la SCI, js/core/regul-validation.js),
  // plus par la configuration de l'espace propre. Périmètre inchangé : un logement rattaché à un immeuble.
  // UN SEUL PUBLIEUR, le poste du PROPRIÉTAIRE de l'espace du logement (audit 15/10) : le décompte est calculé
  // avec la configuration de l'espace propre (catégories, relevés de compteurs) — celle d'un associé peut
  // différer, et le premier document publié l'emporte. Un associé valide ; le décompte part du poste du propriétaire.
  const espOpts = G('_optsEspacePropre') ? W._optsEspacePropre() : {}
  for (const p of (log && log.imm && estDeLEspacePropre(log, espOpts) ? validationsDuLogement(log) : [])) {
    const from = p.du, to = p.au, v = { at: p.at }; if (!v.at) continue
    if (typeof W.computeRegul !== 'function') break
    let res = null; try { res = W.computeRegul(from, to) } catch (e) { res = null }
    const entries = (res && res.entries) || {}
    for (const [entryKey, e] of Object.entries(entries)) {
      if (!e || e.ref !== t.ref || (jour(e.bail && e.bail.debut) || null) !== t.debut) continue
      const annee = from.slice(0, 4), cle = EL.cleDocument('decompte', from + '_' + to)
      out.push({ cle, type_doc: 'decompte', titre: 'Décompte de régularisation des charges ' + annee, periode: fdate(from) + ' au ' + fdate(to), date_doc: jour(v.at),
        generer: async () => {
          if (!G('_buildDecompteHtml') || !G('_docHtmlToNativeBlob') || !W.DocNative) return null
          const ent = (D.entites || []).find((x) => x.nom === entNom) || {}
          try { const built = W._buildDecompteHtml(entryKey, from, to); return built && !built.error && built.html ? await W._docHtmlToNativeBlob(built.html, ent) : null }
          catch (e2) { return null }
        } })
      const vu = new Set()
      for (const ligne of e.details || []) {
        if (!ligne || ligne.mvId == null || vu.has(ligne.mvId)) continue
        vu.add(ligne.mvId)
        const m = (D.mouvements || []).find((x) => vivant(x) && x.id === ligne.mvId)
        const doc = m && G('_mvPjResolve') ? W._mvPjResolve(m) : null
        if (!doc || doc._legacy || !doc.cloudKey) continue
        out.push({ cle: EL.cleDocument('justif', from + '_' + ligne.mvId), type_doc: 'justificatif', titre: 'Justificatif : ' + (m.lib || doc.name || 'facture'), date_doc: jour(m.date),
          storage_path: cheminComplet(doc.cloudKey, entNom), parentCle: cle, visible_jusqu_au: EL.visibleJusquauJustificatifs(jour(v.at)),
          mime: /^image\/(jpeg|png)$/.test(doc.mime || '') ? doc.mime : 'application/pdf' })
      }
    }
  }
  return out.filter((d) => d.cle)
}

const MAX_GENERES_PAR_CYCLE = 12   // les PDF à générer sont étalés sur plusieurs passages (long bail repris)
async function peutPublier(bid) {
  if (!etat.droits) etat.droits = new Map()
  if (etat.droits.has(bid)) return etat.droits.get(bid)
  try { const ok = (await API().rpc('el_peut_publier', { p_bail_id: bid })) === true; etat.droits.set(bid, ok); return ok }
  catch (e) { return false }   // erreur passagère : pas mémorisée, nouvel essai au prochain passage
}
async function publierLocation(t, accesLoc) {
  if (!(await peutPublier(t.id))) return 0   // associé en lecture seule : rien n'est généré
  const espaceId = accesLoc[0].espace_id
  const emisLe = accesLoc.map((a) => a.emis_le).sort()[0]
  const voulus = souhaites(t, emisLe)
  if (!voulus.length) return 0
  const publies = (await chargerDocs(t.id)).filter((d) => (d.bail_debut || null) === t.debut)
  const parCle = new Map(publies.map((d) => [d.cle, d]))
  const plan = EL.planPublication(voulus.filter((d) => d.storage_path), publies)
  let n = 0, generes = 0
  for (const u of plan.maj) { try { await API().update('locataire_documents', u.id, u.patch) } catch (e) { /* retenté au prochain cycle */ } }
  // Parents (décomptes) avant les justificatifs.
  const ordre = voulus.filter((d) => !parCle.has(d.cle) && !etat.echecs.has(t.id + '|' + d.cle)).sort((a, b) => (a.parentCle ? 1 : 0) - (b.parentCle ? 1 : 0))
  for (const d of ordre) {
    try {
      let fichier = d.storage_path ? { storage_path: d.storage_path } : null
      if (!fichier && d.generer) {
        if (generes >= MAX_GENERES_PAR_CYCLE) continue
        generes++
        const blob = await d.generer()
        if (!blob) { etat.echecs.add(t.id + '|' + d.cle); continue }   // rendu impossible : pas de nouvel essai pendant la session
        fichier = await televerserGenere(blob, t, d.cle)
      }
      if (!fichier || !fichier.storage_path) continue
      const parent = d.parentCle ? parCle.get(d.parentCle) : null
      if (d.parentCle && !parent) continue
      const row = await API().insert('locataire_documents', {
        espace_id: espaceId, bail_id: t.id, bail_debut: t.debut, cle: d.cle, type_doc: d.type_doc, titre: d.titre.slice(0, 200),
        periode: d.periode || null, date_doc: d.date_doc || null, storage_path: fichier.storage_path, mime: d.mime || 'application/pdf',
        taille: fichier.taille || null, sha256: fichier.sha256 || null, parent_id: parent ? parent.id : null, visible_jusqu_au: d.visible_jusqu_au || null,
      })
      parCle.set(d.cle, row); n++
      await avisDocument(row, accesLoc)
    } catch (e) {
      // Échec (droit d'écriture absent, fichier refusé…) : pas de nouvel essai pendant la session — rien n'est régénéré en boucle.
      etat.echecs.add(t.id + '|' + d.cle)
      if (e && e.code !== '23505') console.warn('[espace-locataire] publication', d.cle, e && e.message)
    }
  }
  if (n) chargerDocs(t.id)
  return n
}
async function avisDocument(row, accesLoc) {
  const r = await etatRelais(); if (!r.emails) return
  for (const a of accesLoc) {
    if (a.revoque_le) continue
    if (row.type_doc === 'quittance' && !(a.accord_quittance_le && !a.accord_retire_le)) continue   // quittance par e-mail : seulement avec l'accord (art. 21)
    await notifier('document', a.id, { titre: row.titre })
  }
}
// E-mail par le relais : le destinataire et le nom du bailleur sont lus EN BASE par le relais (el_acces_contact),
// jamais envoyés d'ici ; l'invitation transmet le seul jeton (le relais reconstruit le lien sur son origine).
async function notifier(type, accesId, data) {
  try {
    const r0 = await etatRelais(); if (!r0.emails) return false
    const cfg = G('_relayCfg') ? W._relayCfg() : null; if (!cfg) return false
    const jwt = await cfg.getToken(); if (!jwt) return false
    const r = await fetch(cfg.base + '/el/notifier', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, acces_id: accesId, ...(data || {}) }) })
    return r.ok && (await r.json()).envoye === true
  } catch (e) { return false }
}

// ─────────────────────────── Import des signalements (D11) ───────────────────────────
// Réservations faites par CET appareil et pas encore enregistrées localement (onglet fermé entre les deux) : seules
// celles-ci sont reprises — un incident supprimé ensuite par le propriétaire n'est jamais recréé.
// Clé de stockage local 'imsb-el-imports-en-cours' (espace de test séparé par _lsKey en ?sandbox=1).
const importsEnCours = () => { try { const v = JSON.parse(localStorage.getItem(_lsKey('imsb-el-imports-en-cours')) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-200) : [] } catch (e) { return [] } }
const ecrireImports = (l) => { try { localStorage.setItem(_lsKey('imsb-el-imports-en-cours'), JSON.stringify(l.slice(-200))) } catch (e) { /* stockage indisponible : rien à reprendre */ } }

// L'accueil (bulle « Incidents à traiter ») est rendu au chargement, AVANT cet import asynchrone : sans nouveau rendu, la
// bulle n'apparaissait qu'au changement d'onglet. _refreshAfterMutation ne connaît pas l'accueil (volontairement : il ne
// doit pas redessiner l'accueil après chaque mutation) ; ce rendu-ci est limité au cas « l'import a ajouté des incidents ».
// Réutilise _rPeriodPage (DRY : « rAccueil si on est sur l'accueil »). Sur téléphone, si la liste « À regarder » est ouverte,
// c'est elle qui est rafraîchie (rAccueil la remplacerait par l'accueil et ferait perdre la position).
function rafraichirAccueil() {
  try {
    if (document.querySelector('#accm-phone .atr') && G('_accmShowAregarder')) {
      let page = ''
      try { page = currentPage } catch (e) { return }   // eslint-disable-line no-undef
      if (page === 'accueil') W._accmShowAregarder()
      return
    }
    if (G('_rPeriodPage')) W._rPeriodPage()
  } catch (e) { console.warn('[espace-locataire] accueil', e && e.message) }
}

async function importerSignalements() {
  const D = db(); if (!D || !W.Incidents || typeof W.Incidents.nouvelIncident !== 'function') return 0
  if (!etat.acces.length) return 0
  let liste = []
  try { liste = await API().select('locataire_signalements', { importe_le: null }) } catch (e) { return 0 }
  const enCours = importsEnCours()
  if (enCours.length) { try { liste = liste.concat(await API().select('locataire_signalements', { id: enCours })) } catch (e) { /* reprise au prochain passage */ } }
  if (!D.incidents) D.incidents = []
  let n = 0
  const aEnregistrer = [], crees = []
  for (const s of liste) {
    const x = etat.acces.find((a) => a.id === s.acces_id); const t = x ? locationDe(x) : null
    if (!t) continue
    const legacy = EL.idIncidentDuSignalement(s.id); if (!legacy) continue
    if (D.incidents.some((i) => String(i.id) === legacy)) { if (enCours.includes(s.id)) aEnregistrer.push(s.id); continue }
    if (!s.importe_le) {
      // Réservation CONDITIONNELLE (importe_le encore vide) et droit d'écriture exigés : un associé en lecture seule
      // n'importe rien, deux membres n'importent pas deux fois.
      ecrireImports(importsEnCours().concat(s.id))
      let reserve = []
      try { reserve = await API().update('locataire_signalements', s.id, { incident_legacy_id: legacy, importe_le: new Date().toISOString() }, { importe_le: null }) } catch (e) { reserve = [] }
      if (!reserve.length) { ecrireImports(importsEnCours().filter((id) => id !== s.id)); continue }
    } else if (!enCours.includes(s.id)) continue
    const log = logDe(t.ref)
    const inc = W.Incidents.nouvelIncident(EL.champsIncident(s, { logRef: t.ref, imm: (log && log.imm) || '', entity: entNomDe(t.bail, log) || '', nom: x.locataire_nom }), new Date().toISOString())
    inc.espaceSignalementId = s.id; inc.espaceAccesId = s.acces_id; inc.vu = false
    if (G('_stamp')) W._stamp(inc)
    D.incidents.push(inc)
    if (!D.documents) D.documents = []
    ;(s.photos || []).forEach((p, k) => {
      if (!p || !p.path) return
      const docId = Number(legacy) + 1 + k   // déterministe : pas de pièce en double si deux membres importent
      if (D.documents.some((d) => d && d.id === docId)) return
      const doc = { id: docId, parentType: 'incident', parentId: inc.id, parentRef: String(inc.id), logRef: t.ref,
        category: 'incident', idbKey: null, cloudKey: p.path, name: p.nom || 'photo.jpg', originalName: p.nom || 'photo.jpg', mime: p.mime || 'image/jpeg', size: Number(p.taille) || 0,
        sha256: p.sha256 || null, uploadedAt: s.cree_le, source: 'espace-locataire' }
      if (G('_stamp')) W._stamp(doc)
      D.documents.push(doc)
    })
    if (G('_auditLog')) W._auditLog('create', 'incident', inc.id, 'signalé depuis l\'espace locataire')
    crees.push(inc)
    aEnregistrer.push(s.id)
    n++
  }
  if (n && G('saveDB')) W.saveDB()
  if (aEnregistrer.length) ecrireImports(importsEnCours().filter((id) => !aEnregistrer.includes(id)))
  if (n) {
    if (G('_refreshAfterMutation')) W._refreshAfterMutation()
    rafraichirAccueil()
    toast(n === 1 ? 'Nouveau signalement reçu depuis l\'espace locataire (registre des incidents).' : n + ' nouveaux signalements reçus depuis l\'espace locataire.', 'info', 6000)
    // Circuit d'un incident (0060) : l'artisan du carnet qui couvre le métier est prévenu (D6).
    if (W.IncCircuit && typeof W.IncCircuit.apresImport === 'function') for (const inc of crees) W.IncCircuit.apresImport(inc)
  }
  return n
}

// ─────────────────────────── Fins de bail → accès (D4) ───────────────────────────
async function reporterFins() {
  const maj = EL.majFinsAcces(etat.acces, (a) => locationDe(a), finOcc, G('_dgVerseMontant'))   // LA définition du dépôt versé (case B4)
  for (const u of maj) { try { await API().update('locataire_acces', u.id, u.patch); Object.assign(etat.acces.find((a) => a.id === u.id) || {}, u.patch) } catch (e) { /* droit insuffisant : un autre membre le fera */ } }
  return maj.length
}

// ─────────────────────────── Cycle ───────────────────────────
async function rafraichir() { etat.enCours = true; try { await chargerAcces() } finally { etat.enCours = false } }
let _cycle = null
async function cycle(force) {
  if (_cycle) return _cycle
  if (!force && Date.now() - etat.dernier < 60_000) return
  _cycle = (async () => {
    try {
      await rafraichir()
      if (!etat.acces.length) return
      await reporterFins()
      await importerSignalements()
      const parLoc = new Map()
      for (const a of etat.acces) { if (a.revoque_le) continue; const k = a.bail_id + '|' + (a.bail_debut || ''); if (!parLoc.has(k)) parLoc.set(k, []); parLoc.get(k).push(a) }
      for (const accesLoc of parLoc.values()) {
        const t = locationDe(accesLoc[0]); if (!t) continue
        if (EL.phaseAcces(accesLoc[0].fin_bail, accesLoc[0].comptes_clos_le, jour(new Date().toISOString())) === 'fini') continue
        await publierLocation(t, accesLoc)
      }
      const nl = [...etat.msgs.values()].flat().filter((m) => m.auteur === 'locataire' && !m.lu_bailleur_le).length
      if (nl && !etat.avisMsg) { etat.avisMsg = true; toast(nl === 1 ? '1 message de locataire non lu (fiche du logement, Espace locataire).' : nl + ' messages de locataires non lus (fiche du logement, Espace locataire).', 'info', 6000) }
      majBloc()
    } catch (e) { console.warn('[espace-locataire] cycle', e && e.message) } finally { etat.dernier = Date.now() }
  })()
  try { await _cycle } finally { _cycle = null }
}

let _demarre = false
export function demarrer() {
  if (!API() || !API().pret()) return
  if (_demarre) { cycle(true); return }
  _demarre = true
  W._elBlocHtml = blocHtml
  W.EspaceLoc = { creer, renouveler, revoquer, documents, retirer, messages, joindre, repondre: (id) => repondre(id), ouvrirPiece,
    disponiblePourIncident, envoyerTexteIncident,
    // Liens actifs rattachés à la ligne cloud ACTUELLE du bail (re-datation / retrait de « signé hors Propryo » → nouvelle ligne).
    accesActifsDuBail: (ref) => { const b = ((db() || {}).baux || {})[ref]; if (!b || !vivant(b)) return 0; return accesDe(bailId(ref, b), jour(b.debut) || null).filter((x) => !x.revoque_le).length },
    publierMaintenant: async () => { toast('Publication en cours…', 'info'); await cycle(true); toast('Documents à jour.') } }
  cycle(true)
  setInterval(() => cycle(false), 10 * 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cycle(false) })
  if (G('rLogFiche') && document.querySelector('.logf-panels')) { try { majBloc() } catch (e) { /* ignoré */ } }
}

// Exposé pour les tests (fonctions sans effet de bord).
export const _pourTests = { locatairesDuBail, importerSignalements, rafraichirAccueil, etat, blocHtml, DUREE_LECTURE_ACCES }
