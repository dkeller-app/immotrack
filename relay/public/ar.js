// ar.js — LIEN DE L'ARTISAN (page publique /a du relais). Aucune dépendance, aucun CDN, aucun traceur.
// Le jeton est lu dans le FRAGMENT de l'URL (#…) et envoyé dans l'en-tête X-Ar-Jeton ; il n'est jamais mis dans une URL
// de requête, ni stocké. Toute donnée affichée passe par textContent. Maquette validée : mockups/INCIDENT-CIRCUIT
// (écrans « Artisan ») ; ton neutre (infinitif, ni « tu » ni « vous ») ; téléphone d'abord (charte M-1 → M-17).
import { h, I, marque, fd, fdh, plage, euros, creerToast, choisirFichiers, preparerImage, creerDictee, mmss } from './lien-commun.js?v=3';   // version : changer avec EL_ASSET_VERSION / AR_ASSET_VERSION

const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const root = document.getElementById('app');
const toast = creerToast(root);
const S = { jeton: null, info: null, inactif: false, erreur: null, couche: null, doc: null, creneau: null, expl: null, photosDemande: new Map() };

// ─────────────── API (même origine, jeton en en-tête) ───────────────
const MSG_ERREUR = {
  429: 'Trop de demandes : réessayer dans quelques minutes.', 409: 'Cette action n\'est plus possible.',
  413: 'Fichier trop lourd : 10 Mo au plus.', 415: 'Format non accepté : photo (JPEG, PNG) ou PDF.',
  503: 'Service momentanément indisponible. Réessayer plus tard.', 404: 'Fichier introuvable.',
};
async function api(route, corps, opts = {}) {
  const headers = { 'X-Ar-Jeton': S.jeton, ...(opts.headers || {}) };
  if (!opts.binaire) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch('/api/ar/' + route, { method: 'POST', headers, body: opts.binaire ? corps : JSON.stringify(corps || {}), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch (e) { throw new Error('Pas de connexion. Réessayer.'); }
  if (r.status === 410) { S.inactif = true; S.couche = null; render(); throw Object.assign(new Error('inactif'), { inactif: true }); }
  if (!r.ok) {
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    throw Object.assign(new Error(j.message || (j.erreur === 'quota' ? 'Limite d\'aide automatique atteinte pour aujourd\'hui : écrire directement.' : MSG_ERREUR[r.status]) || 'Une erreur est survenue. Réessayer.'), { statut: r.status, code: j.erreur });
  }
  return opts.blob ? r.blob() : r.json();
}
const echec = (e) => { if (!e || !e.inactif) toast((e && e.message) || 'Une erreur est survenue.'); };

async function charger() {
  S.jeton = JETON_RE.test(location.hash.replace(/^#/, '')) ? location.hash.slice(1) : null;
  if (!S.jeton) { S.inactif = true; return render(); }
  try { S.info = await api('ouvrir'); render(); } catch (e) { if (!e.inactif) { S.erreur = e.message; render(); } }
}
async function recharger() { try { S.info = await api('ouvrir'); render(); } catch (e) { echec(e); } }

function ouvrirCouche(c) { S.couche = c; render(); const f = root.querySelector('.pg .bk'); if (f) f.focus(); }
function fermerCouche() { if (S.expl && S.expl.dictee && S.expl.dictee.actif()) S.expl.dictee.arreter(); S.couche = null; render(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.couche) fermerCouche(); });
window.addEventListener('hashchange', () => { location.reload(); });

// ─────────────── rendu ───────────────
function render() {
  root.replaceChildren();
  if (S.inactif) return root.append(ecranInactif());
  if (S.erreur && !S.info) return root.append(h('div', { class: 'empty', style: 'margin:auto' }, h('span', { class: 'ic big' }, I('info', 26)), h('p', { class: 'h2' }, 'Page indisponible'), h('p', { class: 'muted' }, S.erreur), h('button', { class: 'btn s', onclick: () => location.reload() }, 'Réessayer')));
  if (!S.info) return root.append(h('p', { class: 'el-boot' }, 'Chargement…'));
  const i = S.info;
  const etape = prochaineEtape();
  root.append(
    h('header', { class: 'el-h' }, marque(), h('div', null, h('div', { class: 'tt' }, 'Demande d\'intervention'), h('div', { class: 'st' }, 'Envoyée par Propryo pour le compte de ' + (i.bailleur || 'le propriétaire'))),
      h('div', { class: 'who' }, h('b', null, i.artisan || ''), h('br'), 'Lien valable jusqu\'au ' + fd(i.fin_lien))),
    h('div', { class: 'el-main' }, h('div', { class: 'el-col' }, h('main', { class: 'el-body' }, h('div', { class: 'wrap' }, corps())),
      etape ? h('div', { class: 'pg-f' }, h('button', { class: 'btn p', onclick: etape.action }, I(etape.ic), etape.lbl)) : null)),
  );
  if (S.couche && COUCHES[S.couche]) {
    const c = COUCHES[S.couche]();
    root.append(h('div', { class: 'scrim', onclick: fermerCouche }),
      h('section', { class: 'pg', role: 'dialog', 'aria-modal': 'true', 'aria-label': c.titre },
        h('div', { class: 'pg-h' }, h('button', { class: 'bk', onclick: c.retour || fermerCouche }, I(c.retour ? 'back' : 'x', 20), h('span', null, c.retour ? 'Retour' : 'Fermer')), h('h2', { class: 'tt' }, c.titre)),
        h('div', { class: 'pg-b' }, c.contenu), c.pied ? h('div', { class: 'pg-f' }, c.pied) : null));
  }
}
function ecranInactif() {
  return h('div', { class: 'el-root' }, h('header', { class: 'el-h' }, marque(), h('div', null, h('div', { class: 'tt' }, 'Demande d\'intervention'))),
    h('main', { class: 'el-body', style: 'display:flex;align-items:center;justify-content:center' },
      h('div', { class: 'empty', style: 'max-width:420px' }, h('span', { class: 'ic big' }, I('lock', 28)), h('p', { class: 'h2' }, 'Ce lien n\'est plus actif'),
        h('p', { class: 'muted', style: 'margin:0' }, 'L\'intervention est close, le lien a été retiré par le propriétaire, ou sa durée est dépassée. Pour toute question, contacter le propriétaire.'),
        h('p', { class: 'small', style: 'margin:6px 0 0' }, 'Aucune information n\'est affichée tant que le lien n\'est pas valide.'))));
}

const depots = (type) => (S.info.depots || []).filter((d) => d.type === type);
// Une seule action principale (M-4) : la prochaine étape utile.
function prochaineEtape() {
  if (S.info.valide) return depots('facture').length ? null : { lbl: 'Déposer la facture', ic: 'upload', action: () => ouvrirDoc('facture') };
  if (!S.info.creneau) return { lbl: 'Proposer un créneau', ic: 'cal', action: ouvrirCreneau };
  if (!depots('devis').length) return { lbl: 'Déposer le devis', ic: 'upload', action: () => ouvrirDoc('devis') };
  if (!S.info.constat) return { lbl: 'Expliquer l\'intervention', ic: 'mic', action: ouvrirExpl };
  if (!depots('facture').length) return { lbl: 'Déposer la facture', ic: 'upload', action: () => ouvrirDoc('facture') };
  return null;
}

function chargerPhoto(source, index, id, img) {
  const cle = source + ':' + (id || index);
  if (S.photosDemande.has(cle)) { img.src = S.photosDemande.get(cle); return; }
  api('fichier', { source, index, id }, { blob: true }).then((b) => { const u = URL.createObjectURL(b); S.photosDemande.set(cle, u); img.src = u; }).catch(() => { img.alt = 'Photo indisponible'; });
}
async function ouvrirFichier(source, index, id, bouton) {
  const w = window.open('', '_blank'); if (bouton) bouton.classList.add('busy');
  try { const b = await api('fichier', { source, index, id }, { blob: true }); const u = URL.createObjectURL(b); if (w) w.location.href = u; setTimeout(() => URL.revokeObjectURL(u), 120000); }
  catch (e) { if (w) w.close(); echec(e); } finally { if (bouton) bouton.classList.remove('busy'); }
}

function corps() {
  const i = S.info, d = i.demande || {}, R = i.referentiel || {};
  const out = [];
  if (i.valide) out.push(h('div', { class: 'banner pos' }, I('check'), h('span', null, h('b', null, 'Intervention validée par le propriétaire. '), 'La facture peut encore être déposée ici jusqu\'au ' + fd(i.fin_lien) + '.')));
  out.push(h('div', { class: 'cap' }, h('span', { class: 'ic pos' }, I('check', 22)), h('div', null,
    h('div', { class: 'amt num' }, Number(i.plafond_ttc) > 0 ? euros(i.plafond_ttc).replace(',00', '') + ' TTC' : 'Sur devis'),
    h('div', { class: 'small', style: 'color:var(--t2);margin-top:4px' }, i.phrasePlafond))));
  out.push(h('div', { class: 'sec' }, 'Le problème'));
  out.push(h('div', { class: 'card' }, h('b', { style: 'display:block;margin-bottom:4px' }, d.titre || 'Intervention'),
    d.urgent ? h('span', { class: 'chip acc', style: 'margin-bottom:6px' }, I('alert', 13), 'Urgent') : null,
    h('p', { class: 'muted', style: 'margin:4px 0 0;white-space:pre-wrap' }, d.description || ''),
    (d.photos || []).length ? h('div', { class: 'thumbs mt' }, d.photos.map((p) => { const img = h('img', { alt: p.nom || 'Photo' }); chargerPhoto('demande', p.index, null, img); return h('button', { class: 'thumb', 'aria-label': 'Ouvrir la photo ' + (p.index + 1), onclick: (e) => ouvrirFichier('demande', p.index, null, e.currentTarget) }, img); })) : null,
    d.signaleLe ? h('p', { class: 'small', style: 'margin:8px 0 0' }, 'Signalé le ' + fdh(d.signaleLe) + ' · résumé relu par le locataire.') : null));
  out.push(h('div', { class: 'sec' }, 'Sur place'));
  const kv = [['Adresse', d.adresse], ['Accès', d.acces], ['Locataire', d.locataire], ['Téléphone', d.telephone], ['Présence', d.presence]].filter(([, v]) => v);
  out.push(h('div', { class: 'card' }, h('dl', { class: 'kv', style: 'margin:0' }, kv.map(([k, v]) => [h('dt', null, k), h('dd', { class: k === 'Téléphone' ? 'num' : null }, v)])),
    d.telephone ? h('a', { class: 'btn s w mt', href: 'tel:' + String(d.telephone).replace(/[^\d+]/g, '') }, I('phone', 16), 'Appeler le locataire') : h('p', { class: 'small', style: 'margin:8px 0 0' }, 'Pour le rendez-vous : proposer un créneau ici ; le locataire le confirme dans son espace.')));
  out.push(h('div', { class: 'sec' }, 'Rendez-vous'));
  const cr = i.creneau;
  out.push(h('div', { class: 'card' }, cr
    ? [h('b', { style: 'display:block' }, plage(cr)), h('span', { class: 'muted' }, cr.confirme_le ? 'Confirmé par le locataire le ' + fdh(cr.confirme_le) + '.' : 'En attente de la confirmation du locataire.'),
      i.creneauAccordExpres && i.creneauAccordExpres.exige ? h('p', { class: 'small', style: 'margin:6px 0 0' }, 'Samedi, dimanche ou jour férié : travaux seulement avec l\'accord exprès du locataire (loi n° 89-462, art. 7 e).') : null,
      i.valide ? null : h('button', { class: 'btn g', style: 'padding:0 2px;margin-top:4px', onclick: ouvrirCreneau }, I('cal', 16), 'Proposer un autre créneau')]
    : h('span', { class: 'muted' }, 'Aucun créneau proposé.')));
  out.push(h('div', { class: 'sec' }, 'Devis, constat et facture'));
  const lignes = (i.depots || []).map((x) => h('button', { class: 'li', onclick: (e) => ouvrirFichier('depot', null, x.id, e.currentTarget) },
    h('span', { class: 'ic ' + (x.statut === 'auto_accepte' || x.statut === 'accepte' ? 'pos' : x.statut === 'refuse' ? '' : '') }, I(x.type === 'photo' ? 'cam' : 'doc', 20)),
    h('span', { class: 'tx' }, h('b', null, ({ devis: 'Devis', facture: 'Facture', photo: 'Photo' }[x.type]) + (x.numero ? ' ' + x.numero : '') + (x.montant_ttc != null ? ' · ' + euros(x.montant_ttc) + ' TTC' : '')),
      h('span', null, 'Déposé le ' + fdh(x.cree_le) + (x.statut ? ' · ' + (R.statutsDevis || {})[x.statut] : ''))),
    h('span', { class: 'go' }, 'Ouvrir', I('chev', 16))));
  out.push(lignes.length ? h('div', { class: 'list' }, lignes) : h('p', { class: 'muted' }, 'Rien de déposé pour le moment.'));
  out.push(h('div', { class: 'acts mt' },
    i.valide ? null : h('button', { class: 'btn s', onclick: () => ouvrirDoc('devis') }, I('upload', 16), 'Devis'),
    h('button', { class: 'btn s', onclick: () => ouvrirDoc('facture') }, I('upload', 16), 'Facture'),
    h('button', { class: 'btn s', onclick: ajouterPhotos }, I('cam', 16), 'Photos'),
    i.valide ? null : h('button', { class: 'btn s', onclick: ouvrirExpl }, I('mic', 16), i.constat ? 'Constat' : 'Expliquer')));
  if (i.constat) out.push(h('div', { class: 'card mt' }, h('b', { style: 'display:block;margin-bottom:4px' }, 'Constat enregistré'),
    h('span', { class: 'muted' }, [lbl(R.constats, i.constat.constat), lbl(R.ampleurs, i.constat.ampleur)].filter(Boolean).join(' · ')),
    i.constat.resume ? h('p', { class: 'small', style: 'margin:6px 0 0' }, i.constat.resume) : null));
  out.push(h('div', { class: 'banner mt' }, I('doc'), h('span', null, h('b', null, 'Devis avant intervention. '), 'Client : ' + (i.bailleur || 'le propriétaire') + ' ; lieu : l\'adresse ci-dessus. Sous le montant autorisé, le devis déposé ici est accepté automatiquement ; au-delà, attendre la réponse du propriétaire avant de commencer.')));
  if (R.devis) out.push(h('div', { class: 'quote' }, '« ' + R.devis.extrait + ' »'), h('p', { class: 'src' }, R.devis.ref + ' — Légifrance'));
  return out;
}
const lbl = (l, k) => ((l || []).find((x) => x.k === k) || {}).lbl || '';

// ─────────────── créneau ───────────────
// Code postal de l'adresse d'intervention (jours fériés propres à l'Alsace-Moselle).
function codePostal() { const m = /\b(\d{5})\b/.exec(String((S.info && S.info.demande && S.info.demande.adresse) || '')); return m ? m[1] : ''; }
function ouvrirCreneau() { const c = S.info.creneau || {}; S.creneau = { date: c.date || '', debut: c.debut || '', fin: c.fin || '' }; ouvrirCouche('creneau'); }
function coucheCreneau() {
  const c = S.creneau;
  return { titre: 'Proposer un créneau', contenu: [
    h('p', { class: 'muted', style: 'margin-top:0' }, 'Le locataire reçoit la proposition dans son espace et la confirme.'),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Jour'), h('input', { class: 'inp', type: 'date', value: c.date, oninput: (e) => { c.date = e.target.value; } })),
    h('div', { class: 'row', style: 'gap:10px' },
      h('label', { class: 'fld grow' }, h('span', { class: 'lb' }, 'De'), h('input', { class: 'inp', type: 'time', value: c.debut, oninput: (e) => { c.debut = e.target.value; } })),
      h('label', { class: 'fld grow' }, h('span', { class: 'lb' }, 'À'), h('input', { class: 'inp', type: 'time', value: c.fin, oninput: (e) => { c.fin = e.target.value; } }))),
    h('p', { class: 'small' }, 'Samedi, dimanche ou jour férié : seulement avec l\'accord exprès du locataire (loi n° 89-462, art. 7 e).')],
    pied: [h('button', { class: 'btn p', onclick: (e) => envoyerCreneau(e.currentTarget) }, I('send'), 'Envoyer la proposition')] };
}
async function envoyerCreneau(b) {
  b.classList.add('busy');
  try { await api('creneau', { date: S.creneau.date, debut: S.creneau.debut || null, fin: S.creneau.fin || null, cp: codePostal() }); S.couche = null; await recharger(); toast('Créneau proposé au locataire.'); }
  catch (e) { echec(e); } finally { b.classList.remove('busy'); }
}

// ─────────────── devis / facture / photos ───────────────
function ouvrirDoc(type) { S.doc = { type, fichier: null, nom: '', montant: '', numero: '', envoi: false }; ouvrirCouche('doc'); }
function coucheDoc() {
  const d = S.doc, devis = d.type === 'devis';
  return { titre: devis ? 'Déposer le devis' : 'Déposer la facture', contenu: [
    devis ? h('div', { class: 'banner' }, I('info'), h('span', null, S.info.phrasePlafond)) : null,
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, devis ? 'Devis (PDF ou photo)' : 'Facture (PDF ou photo)'),
      h('button', { class: 'chk', onclick: () => choisirFichiers('image/*,application/pdf', false, (f) => { if (f[0]) { d.fichier = f[0]; d.nom = f[0].name; render(); } }) },
        h('span', { class: 'ic' }, I(d.fichier ? 'check' : 'upload', 20)), h('span', null, d.fichier ? d.nom : 'Choisir le fichier ou prendre une photo'))),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Montant total TTC, en euros'), h('input', { class: 'inp num', inputmode: 'decimal', placeholder: '0,00', value: d.montant, oninput: (e) => { d.montant = e.target.value; } })),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Numéro (facultatif)'), h('input', { class: 'inp', value: d.numero, maxlength: 60, oninput: (e) => { d.numero = e.target.value; } })),
    h('p', { class: 'small' }, devis ? 'Le devis est enregistré tel qu\'il est déposé. Le montant saisi décide de l\'acceptation automatique : il doit être celui du devis.' : 'Facture à l\'ordre du propriétaire (' + (S.info.bailleur || '') + ').')],
    pied: [h('button', { class: 'btn p', disabled: !d.fichier || d.envoi || null, onclick: (e) => envoyerDoc(e.currentTarget) }, I('send'), 'Envoyer')] };
}
async function deposer(file) {
  const blob = await preparerImage(file);
  const nom = (file.name || 'document').replace(/\.[^.]+$/, '') + (blob.type === 'application/pdf' ? '.pdf' : blob.type === 'image/png' ? '.png' : '.jpg');
  return api('depot', blob, { binaire: true, headers: { 'Content-Type': 'application/octet-stream', 'X-Ar-Nom': encodeURIComponent(nom) } });
}
async function envoyerDoc(b) {
  const d = S.doc; d.envoi = true; b.classList.add('busy');
  try {
    const f = await deposer(d.fichier);
    const r = await api('document', { type: d.type, path: f.path, nom: f.nom, montant_ttc: d.montant, numero: d.numero });
    S.couche = null;
    await recharger();
    toast(d.type === 'devis' ? (r.statut === 'auto_accepte' ? 'Devis accepté automatiquement : intervenir sans attendre.' : 'Devis envoyé au propriétaire : attendre sa réponse avant de commencer.') : 'Facture envoyée au propriétaire.');
  } catch (e) { d.envoi = false; b.classList.remove('busy'); echec(e); }
}
function ajouterPhotos() {
  choisirFichiers('image/*', true, async (files) => {
    let n = 0;
    for (const f of files.slice(0, 6)) { try { const x = await deposer(f); await api('document', { type: 'photo', path: x.path, nom: x.nom }); n++; } catch (e) { echec(e); break; } }
    if (n) { await recharger(); toast(n === 1 ? 'Photo envoyée.' : n + ' photos envoyées.'); }
  });
}

// ─────────────── expliquer avec l'IA → constat neutre ───────────────
function ouvrirExpl() {
  const c = S.info.constat;
  S.expl = { texte: '', etat: c ? 'choix' : 'saisie', secondes: 0, charge: false, constat: c ? c.constat : null, ampleur: c ? c.ampleur : null, sousType: c ? c.sous_type : null, resume: c ? c.resume || '' : '', citation: null, dictee: null };
  S.expl.dictee = creerDictee((ev) => {
    const x = S.expl; if (!x) return;
    if (ev.etat === 'enregistre') { x.etat = 'dictee'; x.secondes = ev.secondes; majMinuterie(); if (ev.secondes === 0) render(); return; }
    if (ev.etat === 'erreur') { x.etat = 'saisie'; toast(ev.message); render(); return; }
    if (ev.etat === 'arrete') transcrire(ev.blob);
  });
  ouvrirCouche('expl');
}
function majMinuterie() { const n = root.querySelector('#ar-mm'); if (n) n.textContent = mmss(S.expl.secondes); }
async function transcrire(blob) {
  const x = S.expl; x.etat = 'saisie'; x.charge = true; render();
  try { const r = await fetch('/api/ar/ia/transcrire', { method: 'POST', headers: { 'X-Ar-Jeton': S.jeton, 'Content-Type': blob.type || 'audio/webm' }, body: blob, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status === 410) { S.inactif = true; return render(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur === 'quota' ? 'Limite de dictée atteinte pour aujourd\'hui : écrire directement.' : 'Dictée non comprise : écrire plutôt.');
    x.texte = (x.texte ? x.texte + ' ' : '') + (j.text || '');
  } catch (e) { toast(e.message); } finally { x.charge = false; render(); }
}
async function proposer(b) {
  const x = S.expl; if (x.texte.trim().length < 3) { toast('Décrire en quelques mots ce qui a été constaté et fait.'); return; }
  b.classList.add('busy'); x.charge = true;
  try {
    const r = await fetch('/api/ar/ia/structurer', { method: 'POST', headers: { 'X-Ar-Jeton': S.jeton, 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      body: JSON.stringify({ task: 'constat-artisan', input: { texte: x.texte, element: (S.info.demande || {}).titre || '', description: (S.info.demande || {}).description || '' } }) });
    if (r.status === 410) { S.inactif = true; return render(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Aide automatique indisponible : choisir le constat ci-dessous.');
    Object.assign(x, { constat: j.data.constat, ampleur: j.data.ampleur, sousType: j.data.sousType, resume: j.data.resume || x.resume, citation: j.data.citation, propose: true });
  } catch (e) { toast(e.message); }
  x.charge = false; x.etat = 'choix'; render();
}
function coucheExpl() {
  const x = S.expl, R = S.info.referentiel || {};
  if (x.etat !== 'choix') {
    const enreg = x.etat === 'dictee';
    return { titre: 'Expliquer l\'intervention', contenu: [
      S.info.ia ? h('span', { class: 'ia-tag' }, I('spark', 14), 'Assistant IA') : null,
      h('p', { class: 'h2', style: 'margin-top:8px' }, 'Ce qui a été constaté et fait'),
      h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Parler comme à un collègue, ou écrire. Un constat neutre est proposé, à confirmer.'),
      S.info.ia ? h('div', { class: 'mic' }, h('span', { class: 'dot' + (enreg ? ' on' : '') }), h('span', { class: 'grow muted' }, enreg ? 'Enregistrement…' : x.charge ? 'Transcription…' : 'Dictée'), h('span', { class: 'num', id: 'ar-mm', style: 'font-weight:700' }, mmss(x.secondes)),
        h('button', { class: 'btn s', disabled: x.charge || null, onclick: () => (enreg ? x.dictee.arreter() : x.dictee.demarrer()) }, I(enreg ? 'stop' : 'mic', 16), enreg ? 'Arrêter' : 'Dicter')) : null,
      h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Texte'), h('textarea', { class: 'inp', maxlength: 6000, placeholder: 'Ex. : joint du siphon écrasé, collier rouillé ; remplacés, essai d\'étanchéité concluant.', oninput: (e) => { x.texte = e.target.value; } }, x.texte)),
      S.info.ia ? h('div', { class: 'ia-note' }, I('info', 16), h('span', null, R.mentionIA || '')) : null],
      pied: [h('button', { class: 'btn s', onclick: () => { x.etat = 'choix'; render(); } }, 'Choisir sans l\'assistant'),
        h('button', { class: 'btn p', disabled: enreg || x.charge || !S.info.ia || null, onclick: (e) => proposer(e.currentTarget) }, I('chev'), 'Voir le constat proposé')] };
  }
  return { titre: 'Constat', retour: () => { x.etat = 'saisie'; render(); }, contenu: [
    x.propose ? h('span', { class: 'ia-tag' }, I('spark', 14), 'Proposé par l\'IA, à vérifier') : null,
    x.citation ? h('p', { class: 'small', style: 'margin:8px 0 0' }, '« ' + x.citation + ' »') : null,
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Constat'), h('div', { class: 'radio', role: 'radiogroup' }, (R.constats || []).map((c) =>
      h('button', { class: 'opt', role: 'radio', 'aria-checked': x.constat === c.k ? 'true' : 'false', onclick: () => { x.constat = c.k; render(); } }, h('span', { class: 'dot' }), h('span', null, c.lbl))))),
    x.constat === 'exterieure' ? h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Origine'), h('div', { class: 'chips' }, (R.sousTypes || []).map((s) =>
      h('button', { class: 'opt', 'aria-pressed': (x.sousType || 'tiers') === s.k ? 'true' : 'false', onclick: () => { x.sousType = s.k; render(); } }, s.lbl)))) : null,
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Ampleur'), h('div', { class: 'chips' }, (R.ampleurs || []).map((a) =>
      h('button', { class: 'opt', 'aria-pressed': x.ampleur === a.k ? 'true' : 'false', onclick: () => { x.ampleur = a.k; render(); } }, a.lbl)))),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Travaux réalisés'), h('textarea', { class: 'inp', maxlength: 1000, oninput: (e) => { x.resume = e.target.value; } }, x.resume)),
    h('p', { class: 'small' }, 'Le propriétaire valide ensuite la suite ; la répartition n\'apparaît pas ici.')],
    pied: [h('button', { class: 'btn p', disabled: !x.constat || null, onclick: (e) => confirmerConstat(e.currentTarget) }, I('check'), 'Confirmer le constat')] };
}
async function confirmerConstat(b) {
  const x = S.expl; b.classList.add('busy');
  try { await api('constat', { constat: x.constat, sousType: x.sousType, ampleur: x.ampleur, resume: x.resume }); S.couche = null; S.expl = null; await recharger(); toast('Constat enregistré.'); }
  catch (e) { echec(e); b.classList.remove('busy'); }
}

const COUCHES = { creneau: coucheCreneau, doc: coucheDoc, expl: coucheExpl };
charger();
