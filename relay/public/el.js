// el.js — ESPACE LOCATAIRE (page publique /l du relais). Aucune dépendance, aucun CDN, aucun traceur.
// Le jeton est lu dans le FRAGMENT de l'URL (#…) et envoyé dans l'en-tête X-El-Jeton ; il n'est jamais mis dans
// une URL de requête, ni stocké. Toute donnée affichée passe par textContent (aucun innerHTML de donnée).
// Écrans : maquette validée mockups/ESPACE-LOCATAIRE/maquette.html ; ton neutre (infinitif, ni « tu » ni « vous »).

import { h, I, marque, fd, fdh, taille, plage, euros, creerToast, choisirFichiers, preparerImage, imagePourIA, creerDictee, mmss } from './lien-commun.js?v=1';   // version : changer avec EL_ASSET_VERSION / AR_ASSET_VERSION
import { documentNouveau, plusRecentDabord, confirmationAccord } from './el-lib.js';

const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const root = document.getElementById('app');
const toast = creerToast(root);
const accordInitial = () => ({ coche: false, etape: 'texte', code: '', a: '', envoi: false });
const S = {
  jeton: null, info: null, inactif: false, erreur: null,
  docs: null, sigs: null, msgs: null,
  vue: 'accueil', couche: null, filtre: 'tout', docSel: null, sigSel: null, confirmation: null,
  sig: null, accord: accordInitial(),
  msg: { texte: '', pieces: [], envoi: false },
};

// ─────────────── API (même origine, jeton en en-tête) ───────────────
const MSG_ERREUR = {
  429: 'Trop de demandes : réessayer dans quelques minutes.', 409: "Cette action n'est plus possible : le bail est terminé.",
  413: 'Fichier trop lourd : 10 Mo au plus.', 415: 'Format non accepté : photo (JPEG, PNG) ou PDF.',
  503: 'Service momentanément indisponible. Réessayer plus tard.', 404: 'Fichier introuvable. Prévenir le bailleur.',
};
// Erreurs précises du relais, prioritaires sur le message du statut (un 409 n'est pas toujours « bail terminé »).
const MSG_ERREUR_CODE = {
  sans_email: "Aucune adresse e-mail n'est connue pour ce bail : prévenir le bailleur.",
  code_inactif: 'La confirmation par code est indisponible pour le moment. Réessayer plus tard.',
};
async function api(route, corps, opts = {}) {
  const headers = { 'X-El-Jeton': S.jeton, ...(opts.headers || {}) };
  if (!opts.binaire) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch('/api/el/' + route, { method: 'POST', headers, body: opts.binaire ? corps : JSON.stringify(corps || {}), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) { throw new Error('Pas de connexion. Réessayer.'); }
  if (r.status === 410) { S.inactif = true; S.couche = null; render(); throw Object.assign(new Error('inactif'), { inactif: true }); }
  if (!r.ok) {
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    const m = j.message || MSG_ERREUR_CODE[j.erreur] || MSG_ERREUR[r.status] || (j.erreur === 'code_faux' ? 'Code incorrect.' : j.erreur === 'code_requis' ? 'Code expiré : en demander un nouveau.' : 'Une erreur est survenue. Réessayer.');
    throw Object.assign(new Error(m), { statut: r.status, code: j.erreur });
  }
  return opts.blob ? r.blob() : r.json();
}
const echec = (e) => { if (!e || !e.inactif) toast((e && e.message) || 'Une erreur est survenue.'); };

// ─────────────── chargement ───────────────
async function charger() {
  S.jeton = JETON_RE.test(location.hash.replace(/^#/, '')) ? location.hash.slice(1) : null;
  if (!S.jeton) { S.inactif = true; return render(); }
  try {
    S.info = await api('ouvrir');
    const docs = await api('documents'); S.docs = docs.liste || [];
    render();
    if (S.info.phase !== 'documents') rechargerSigs();
  } catch (e) {
    if (!e.inactif) { S.erreur = e.message; render(); }
  }
}
const cpLogement = () => { const m = /\b(\d{5})\b/.exec(String((S.info && S.info.logement) || '')); return m ? m[1] : '' };
async function rechargerSigs() { try { S.sigs = (await api('signalements', { cp: cpLogement() })).liste || []; if (S.sigSel) S.sigSel = S.sigs.find((x) => x.id === S.sigSel.id) || S.sigSel; render(); } catch (e) { echec(e); } }
async function rechargerMsgs() { try { S.msgs = (await api('messages')).liste || []; if (S.info) S.info.compteurs.messages_non_lus = 0; render(); } catch (e) { echec(e); } }

// ─────────────── navigation ───────────────
const ECRITURE = { signaler: ['complet'], message: ['complet', 'depart'], accord: ['complet', 'depart'] };
const peut = (a) => !!S.info && (ECRITURE[a] || []).includes(S.info.phase);
function navItems() {
  const c = (S.info && S.info.compteurs) || {};
  if (S.info && S.info.phase === 'documents') return [['accueil', 'home', 'Accueil'], ['documents', 'doc', 'Documents']];
  return [['accueil', 'home', 'Accueil'], ['documents', 'doc', 'Documents'], ['suivi', 'tool', 'Signalements', c.signalements_ouverts], ['messages', 'chat', 'Messages', c.messages_non_lus]];
}
function aller(vue) {
  S.vue = vue; S.couche = null; S.confirmation = null;
  if (vue === 'messages') rechargerMsgs();
  if (vue === 'suivi' && !S.sigs) rechargerSigs();
  render();
  const b = root.querySelector('.el-body'); if (b) b.scrollTop = 0;
}
function ouvrirCouche(c) { S.couche = c; render(); const f = root.querySelector('.pg .bk'); if (f) f.focus(); }
function fermerCouche() {
  if (S.couche === 'accord' && S.accord.envoi) return;   // pas de fermeture pendant l'envoi de l'accord
  if (S.sig && S.sig.dictee && S.sig.dictee.actif()) S.sig.dictee.arreter();   // la dictée en cours s'arrête avec la couche
  S.couche = null; render();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.couche) fermerCouche(); });
window.addEventListener('hashchange', () => { location.reload(); });

// ─────────────── rendu ───────────────
function render() {
  root.replaceChildren();
  if (S.inactif) return root.append(ecranInactif());
  if (S.erreur && !S.info) return root.append(h('div', { class: 'empty', style: 'margin:auto' }, h('span', { class: 'ic big' }, I('info', 26)), h('p', { class: 'h2' }, 'Espace indisponible'), h('p', { class: 'muted' }, S.erreur), h('button', { class: 'btn s', onclick: () => location.reload() }, 'Réessayer')));
  if (!S.info) return root.append(h('p', { class: 'el-boot' }, 'Chargement…'));
  const items = navItems();
  const nav = (cls) => h('nav', { class: cls, 'aria-label': 'Navigation', style: cls === 'el-bn' ? `--n:${items.length}` : null },
    items.map(([k, ic, l, n]) => h('button', { 'aria-current': S.vue === k ? 'page' : null, onclick: () => aller(k) }, I(ic, cls === 'el-bn' ? 22 : 18), h('span', null, l), n ? h('span', { class: 'pill', 'aria-label': n + ' nouveau' + (n > 1 ? 'x' : '') }, String(n)) : null)),
    cls === 'el-nav' ? h('div', { class: 'navf' }, I('lock', 14), h('span', null, 'Accès personnel par lien. Ne pas transférer ce lien.')) : null);
  const corps = VUES[S.vue] ? VUES[S.vue]() : VUES.accueil();
  root.append(
    h('header', { class: 'el-h' }, marque(), h('div', null, h('div', { class: 'tt' }, 'Espace locataire'), h('div', { class: 'st' }, S.info.logement || '')),
      h('div', { class: 'who' }, h('b', null, S.info.locataire || ''), h('br'), S.info.bailleur || '')),
    h('div', { class: 'el-main' }, nav('el-nav'), h('div', { class: 'el-col' }, h('main', { class: 'el-body' }, h('div', { class: 'wrap' }, corps.contenu)), corps.bas || null)),
    nav('el-bn'),
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
  return h('div', { class: 'el-root' }, h('header', { class: 'el-h' }, marque(), h('div', null, h('div', { class: 'tt' }, 'Espace locataire'))),
    h('main', { class: 'el-body', style: 'display:flex;align-items:center;justify-content:center' },
      h('div', { class: 'empty', style: 'max-width:420px' }, h('span', { class: 'ic big' }, I('lock', 28)),
        h('p', { class: 'h2' }, "Ce lien n'est plus actif"),
        h('p', { class: 'muted', style: 'margin:0' }, 'Le lien a été remplacé, retiré par le bailleur, ou sa période de consultation est terminée. Pour un nouveau lien, s\'adresser au bailleur.'))));
}

// ─────────────── documents ───────────────
const TYPE_DOC = { bail: ['Bail', 'shield'], avenant: ['Bail', 'doc'], edl: ['États des lieux', 'key'], quittance: ['Quittances', 'doc'], decompte: ['Charges', 'euro'], justificatif: ['Charges', 'clip'] };
const FILTRES = [['tout', 'Tout'], ['Bail', 'Bail'], ['États des lieux', 'États des lieux'], ['Quittances', 'Quittances'], ['Charges', 'Charges']];
function sousTitreDoc(d) {
  const p = [];
  if (d.type === 'justificatif' && d.visible_jusqu_au) p.push('Consultable jusqu\'au ' + fd(d.visible_jusqu_au));
  else if (d.date_doc) p.push((d.type === 'quittance' ? 'Émise le ' : d.type === 'decompte' ? 'Envoyé le ' : 'Du ') + fd(d.date_doc));
  else p.push('Publié le ' + fd(d.publie_le));
  if (d.taille) p.push((d.mime === 'application/pdf' ? 'PDF ' : '') + taille(d.taille));
  return p.join(' · ');
}
function ligneDoc(d) {
  return h('button', { class: 'li', onclick: () => { S.docSel = d; ouvrirCouche('doc'); } },
    h('span', { class: 'ic' }, I((TYPE_DOC[d.type] || [, 'doc'])[1], 20)),
    h('span', { class: 'tx' }, h('b', null, d.titre), h('span', null, sousTitreDoc(d))),
    h('span', { class: 'go' }, 'Ouvrir', I('chev', 16)));
}
function vueDocuments() {
  const docs = S.docs || [];
  const groupe = (d) => (TYPE_DOC[d.type] || ['Autres'])[0];
  const visibles = docs.filter((d) => S.filtre === 'tout' || groupe(d) === S.filtre);
  const contenu = [h('h1', { class: 'h1' }, 'Documents du bail'),
    h('p', { class: 'lead' }, "Documents définitifs, tels qu'ils ont été émis. Seuls les documents de ce bail sont visibles ici.")];
  if (!docs.length) {
    contenu.push(h('div', { class: 'card empty' }, h('span', { class: 'ic big' }, I('doc', 26)), h('p', { class: 'muted', style: 'margin:0' }, 'Aucun document pour le moment. Les documents du bail apparaissent ici dès que le bailleur les a émis.')));
    return { contenu };
  }
  const nb = (g) => docs.filter((d) => groupe(d) === g).length;
  contenu.push(h('div', { class: 'filters', role: 'toolbar', 'aria-label': 'Filtrer' }, FILTRES.filter(([k]) => k === 'tout' || nb(k)).map(([k, l]) =>
    h('button', { class: 'opt', 'aria-pressed': S.filtre === k ? 'true' : 'false', onclick: () => { S.filtre = k; render(); } }, `${l} · ${k === 'tout' ? docs.length : nb(k)}`))));
  for (const g of ['Bail', 'États des lieux', 'Charges']) {
    const l = visibles.filter((d) => groupe(d) === g); if (!l.length) continue;
    contenu.push(h('div', { class: 'sec' }, g), h('div', { class: 'list' }, l.map(ligneDoc)));
  }
  const q = visibles.filter((d) => d.type === 'quittance').sort(plusRecentDabord);   // par période, jamais par ordre de publication
  const annees = [...new Set(q.map((d) => String(d.date_doc || d.publie_le).slice(0, 4)))].sort().reverse();   // l'ordre dans chaque année reste celui de q
  for (const a of annees) contenu.push(h('div', { class: 'sec' }, 'Quittances · ' + a), h('div', { class: 'list' }, q.filter((d) => String(d.date_doc || d.publie_le).startsWith(a)).map(ligneDoc)));
  contenu.push(h('p', { class: 'small mt' }, 'En colocation, la quittance est commune aux colocataires du bail.'));
  return { contenu };
}

async function ouvrirFichier(source, id, index, nom, telecharger, bouton) {
  const w = telecharger ? null : window.open('', '_blank');
  if (bouton) bouton.classList.add('busy');
  try {
    const b = await api('fichier', { source, id, index }, { blob: true });
    const url = URL.createObjectURL(b);
    if (w) w.location.href = url;
    else { const a = h('a', { href: url, download: nom || 'document' }); document.body.append(a); a.click(); a.remove(); toast('Téléchargement lancé.'); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { if (w) w.close(); echec(e); } finally { if (bouton) bouton.classList.remove('busy'); }
}
function coucheDoc() {
  const d = S.docSel || {};
  const nom = d.titre + (d.mime === 'image/jpeg' ? '.jpg' : d.mime === 'image/png' ? '.png' : '.pdf');
  return {
    titre: (TYPE_DOC[d.type] || ['Document'])[0] === 'Quittances' ? 'Quittance' : 'Document',
    contenu: [h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ic acc' }, I('doc', 22)), h('div', { class: 'grow' }, h('b', { style: 'display:block;font-size:16px' }, d.titre), h('span', { class: 'muted' }, S.info.bailleur))),
      h('dl', { class: 'kv' }, d.periode ? [h('dt', null, 'Période'), h('dd', null, d.periode)] : null, d.date_doc ? [h('dt', null, 'Date'), h('dd', { class: 'num' }, fd(d.date_doc))] : null,
        h('dt', null, 'Publié le'), h('dd', { class: 'num' }, fd(d.publie_le)), d.taille ? [h('dt', null, 'Taille'), h('dd', null, taille(d.taille))] : null,
        d.visible_jusqu_au ? [h('dt', null, 'Consultable jusqu\'au'), h('dd', null, fd(d.visible_jusqu_au))] : null)),
      d.type === 'justificatif' && S.info.referentiel ? h('div', { class: 'banner mt' }, I('info'), h('span', null, '« ' + S.info.referentiel.art23.texte + ' » — ' + S.info.referentiel.art23.source)) : null,
      h('p', { class: 'small mt' }, "Le document s'ouvre dans le lecteur du téléphone ou de l'ordinateur.")],
    pied: [h('button', { class: 'btn s', onclick: (e) => ouvrirFichier('document', d.id, null, nom, true, e.currentTarget) }, I('dl'), 'Télécharger'),
      h('button', { class: 'btn p', onclick: (e) => ouvrirFichier('document', d.id, null, nom, false, e.currentTarget) }, I('eye'), 'Ouvrir')],
  };
}

// ─────────────── accueil ───────────────
function vueAccueil() {
  const i = S.info, docs = S.docs || [], c = i.compteurs || {};
  const contenu = [h('h1', { class: 'h1' }, i.phase === 'complet' ? 'Bonjour ' + i.locataire : 'Bail terminé'),
    h('p', { class: 'lead' }, [i.logement, i.bailleur ? 'bailleur : ' + i.bailleur : '', i.bail_debut ? 'bail du ' + fd(i.bail_debut) : ''].filter(Boolean).join(' · '))];
  if (S.confirmation) contenu.push(h('div', { class: 'banner pos', role: 'status', style: 'margin-bottom:12px' }, I('check'), h('span', null, h('b', null, S.confirmation))));
  if (i.phase !== 'complet') {
    const t = i.phase === 'depart'
      ? `Bail terminé le ${fd(i.fin_bail)}. Les messages restent ouverts jusqu'à la clôture des comptes ; les signalements sont fermés.`
      : `Comptes clos le ${fd(i.comptes_clos_le)}. Les signalements et les messages sont fermés. Télécharger les documents pour les conserver.`;
    contenu.push(h('div', { class: 'banner' }, I('clock'), h('span', null, h('b', null, `Documents consultables jusqu'au ${fd(i.fin_acces)}. `), t)));
    if (docs.length) contenu.push(h('button', { class: 'btn p w mt', onclick: (e) => toutTelecharger(e.currentTarget) }, I('zip'), `Tout télécharger (${docs.length} document${docs.length > 1 ? 's' : ''})`));
  } else {
    const recent = documentNouveau(docs);   // le plus récent par période / date du document (pas l'ordre de publication)
    if (recent) contenu.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ic acc' }, I('doc', 22)), h('div', { class: 'grow' }, h('span', { class: 'chip acc', style: 'margin-bottom:4px' }, 'Nouveau'), h('b', { style: 'display:block;font-size:15px' }, recent.titre), h('span', { class: 'muted' }, 'Disponible depuis le ' + fd(recent.publie_le)))),
      h('button', { class: 'btn p w mt', onclick: () => { S.docSel = recent; ouvrirCouche('doc'); } }, I('eye'), 'Ouvrir le document')));
  }
  if (peut('accord')) {
    const a = i.accord || {}, donne = a.donne_le && !a.retire_le;
    contenu.push(h('div', { class: 'card mt' }, h('div', { class: 'row top' }, h('span', { class: donne ? 'ic pos' : 'ic adv' }, I(donne ? 'check' : 'mail', 20)),
      h('div', { class: 'grow' }, h('b', { style: 'display:block' }, 'Quittances par voie électronique'), h('span', { class: 'muted' }, donne ? 'Accord donné le ' + fdh(a.donne_le) + '.' : "Accord non donné. La loi le permet seulement avec l'accord exprès du locataire."))),
      h('button', { class: 'btn s w mt', onclick: () => { S.accord = accordInitial(); S.confirmation = null; ouvrirCouche('accord'); } }, donne ? 'Voir ou retirer l\'accord' : 'Lire et décider', I('chev', 16))));
  }
  const tuiles = [h('button', { class: 'tile', onclick: () => aller('documents') }, h('span', { class: 'ic' }, I('doc')), h('b', null, 'Documents'), h('span', null, docs.length + ' document' + (docs.length > 1 ? 's' : '')))];
  if (peut('signaler')) tuiles.push(h('button', { class: 'tile', onclick: debuterSignalement }, h('span', { class: 'ic' }, I('alert')), h('b', null, 'Signaler un problème'), h('span', null, 'Photos possibles')));
  if (i.phase !== 'documents') {
    tuiles.push(h('button', { class: 'tile', onclick: () => aller('suivi') }, h('span', { class: 'ic' }, I('tool')), h('b', null, 'Signalements'), h('span', null, (c.signalements_ouverts || 0) + ' en cours')));
    tuiles.push(h('button', { class: 'tile', onclick: () => aller('messages') }, h('span', { class: 'ic' }, I('chat')), h('b', null, 'Messages'), h('span', null, c.messages_non_lus ? c.messages_non_lus + ' non lu' + (c.messages_non_lus > 1 ? 's' : '') : 'Écrire au bailleur')));
  }
  contenu.push(h('div', { class: 'sec' }, 'Raccourcis'), h('div', { class: 'tiles' }, tuiles));
  return { contenu };
}

// Tout télécharger : archive ZIP « stockée » (sans compression : les PDF le sont déjà), construite dans le navigateur.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStocke(fichiers) {
  const parts = [], central = []; let off = 0;
  const enc = new TextEncoder();
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), crc = crc32(f.bytes), n = f.bytes.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true); loc.setUint32(14, crc, true); loc.setUint32(18, n, true); loc.setUint32(22, n, true);
    loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
    parts.push(new Uint8Array(loc.buffer), nom, f.bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true); cen.setUint32(20, n, true); cen.setUint32(24, n, true);
    cen.setUint16(28, nom.length, true); cen.setUint32(42, off, true);
    central.push(new Uint8Array(cen.buffer), nom);
    off += 30 + nom.length + n;
  }
  const taille = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true); fin.setUint32(12, taille, true); fin.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}
async function toutTelecharger(bouton) {
  bouton.classList.add('busy');
  const vus = new Set(), fichiers = [];
  try {
    for (const d of S.docs || []) {
      if (fichiers.length) await new Promise((r) => setTimeout(r, 250));   // débit modéré (limite du relais)
      let b;
      try { b = await api('fichier', { source: 'document', id: d.id }, { blob: true }); }
      catch (e) { if (e.statut === 404) continue; throw e; }   // document retiré entre-temps : on continue sans lui
      let nom = (d.titre || 'document').replace(/[\\/:*?"<>|]/g, '_') + (d.mime === 'image/jpeg' ? '.jpg' : d.mime === 'image/png' ? '.png' : '.pdf');
      let k = 2; while (vus.has(nom)) nom = nom.replace(/(\.\w+)$/, ` (${k++})$1`); vus.add(nom);
      fichiers.push({ nom, bytes: new Uint8Array(await b.arrayBuffer()) });
    }
    const url = URL.createObjectURL(zipStocke(fichiers));
    const a = h('a', { href: url, download: 'documents-du-bail.zip' }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    toast('Archive téléchargée.');
  } catch (e) { echec(e); } finally { bouton.classList.remove('busy'); }
}

// ─────────────── accord (art. 21) ───────────────
function coucheAccord() {
  const i = S.info, a = i.accord || {}, R = i.referentiel || {}, donne = a.donne_le && !a.retire_le;
  const loi = [h('div', { class: 'quote' }, (R.art21 ? R.art21.texte : []).map((t, k) => h('p', null, (k === 0 ? '« ' : '') + t + (k === R.art21.texte.length - 1 ? ' »' : '')))),
    h('p', { class: 'src' }, R.art21 ? R.art21.source : '')];
  if (S.accord.etape === 'code') {
    const env = S.accord.envoi;
    return { titre: 'Confirmer par code', retour: () => { if (S.accord.envoi) return; S.accord.etape = 'texte'; render(); },
      contenu: [h('p', { class: 'h2' }, 'Saisir le code reçu par e-mail'), h('p', { class: 'muted' }, `Code à 6 chiffres envoyé à ${S.accord.a}. Valable 10 minutes, 5 essais.`),
        h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Code'), h('input', { class: 'inp otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, value: S.accord.code, oninput: (e) => { S.accord.code = e.target.value.replace(/\D/g, '').slice(0, 6); } })),
        h('button', { class: 'btn g w', disabled: env, onclick: () => demanderCode() }, 'Recevoir un nouveau code')],
      pied: [h('button', { class: 'btn p', disabled: env, onclick: () => envoyerAccord(S.accord.donner) }, I('check'), env ? 'Envoi…' : 'Confirmer')] };
  }
  if (donne) {
    return { titre: 'Accord électronique', contenu: [h('div', { class: 'banner pos' }, I('check'), h('span', null, h('b', null, 'Accord donné le ' + fdh(a.donne_le) + '. '), 'Le bailleur voit cet accord.')),
      h('div', { class: 'card mt' }, h('b', { style: 'display:block;margin-bottom:4px' }, "Retirer l'accord"), h('span', { class: 'muted' }, 'Le bailleur reprend alors la remise papier sur demande. Les quittances déjà déposées restent consultables ici.')),
      h('div', { class: 'mt' }, loi)],
      pied: [h('button', { class: 'btn s', disabled: S.accord.envoi, onclick: () => lancerAccord(false) }, I('ban'), S.accord.envoi ? 'Envoi…' : "Retirer l'accord")] };
  }
  const coche = S.accord.coche;
  return { titre: 'Accord électronique', contenu: [
    h('p', { class: 'h2' }, 'Recevoir les quittances par voie électronique'),
    h('p', { class: 'muted' }, "La loi permet au bailleur de transmettre la quittance par voie électronique, seulement avec l'accord exprès du locataire :"), loi,
    h('div', { class: 'card' }, h('b', { style: 'display:block;margin-bottom:6px' }, "Ce que change l'accord"), h('ul', { style: 'margin:0;padding-left:18px;font-size:14px;color:var(--t2);line-height:1.55' },
      h('li', null, 'Chaque quittance est déposée ici (et annoncée par e-mail quand l\'envoi sera actif).'),
      h('li', null, 'Sans accord : la quittance reste consultable ici, et le bailleur la remet sur papier à la demande.'),
      h('li', null, "La quittance reste gratuite. L'accord se retire à tout moment, sur cette page."),
      h('li', null, 'Chaque colocataire décide pour lui-même.'))),
    h('button', { class: 'chk mt', role: 'checkbox', 'aria-checked': coche ? 'true' : 'false', onclick: () => { S.accord.coche = !S.accord.coche; render(); } },
      h('span', { class: 'bx' }, I('check', 16)), h('span', null, i.libelleAccord)),
    h('p', { class: 'small mt' }, 'Case jamais pré-cochée. Enregistré : date et heure, version du texte (' + (R.accordVersion || 'v1') + '). Aucune autre donnée.')],
    pied: [h('button', { class: 'btn p', disabled: !coche || S.accord.envoi, onclick: () => lancerAccord(true) }, I('check'), S.accord.envoi ? 'Envoi…' : "Donner l'accord")] };
}
// Envoi en cours : le bouton est RENDU désactivé (le DOM est reconstruit à chaque render) et un second toucher est ignoré.
// Les messages (toast) sont posés APRÈS le dernier render, qui efface le DOM — sinon la confirmation disparaîtrait aussitôt.
async function demanderCode() {
  if (S.accord.envoi) return;
  S.accord.envoi = true; render();
  let err = null;
  try { const r = await api('accord/code'); S.accord.etape = 'code'; S.accord.a = r.a || "l'adresse du bail"; }
  catch (e) { err = e; }
  S.accord.envoi = false; render();
  if (err) echec(err); else toast('Code envoyé.');
}
async function lancerAccord(donner) {
  if (S.accord.envoi) return;
  S.accord.donner = donner;
  if (S.info.codeAccord) return demanderCode();
  return envoyerAccord(donner);
}
async function envoyerAccord(donner) {
  if (S.accord.envoi) return;
  S.accord.envoi = true; render();
  let r = null, err = null;
  try { r = await api('accord', { donner, code: S.accord.code || undefined }); } catch (e) { err = e; }
  if (err) { S.accord.envoi = false; render(); echec(err); return; }
  // Succès : retour à l'ACCUEIL (la carte « Quittances par voie électronique » reflète le nouvel état) avec une confirmation
  // datée, visible tant qu'on ne change pas de page, en plus du message passager.
  S.info.accord = r.accord; S.accord = accordInitial();
  S.confirmation = confirmationAccord(donner, r.accord, fdh);
  S.vue = 'accueil'; S.couche = null; render();
  toast(S.confirmation);
}

// ─────────────── signaler ───────────────
// Circuit d'un incident (0060) : avec l'IA, le locataire décrit avec ses mots (voix ou texte) + photos ; l'assistant
// reformule, pose au plus deux questions, déduit élément, nature et urgence. Urgence : SEULEMENT les consignes de sécurité.
// Sans IA (ou en cas d'échec) : le formulaire en deux étapes de 0059, jamais bloquant.
const contactVide = () => ({ tel_partage: false, telephone: '', acces_info: '', presence: '' });
function debuterSignalement() {
  S.sig = { piece: null, element: null, description: '', urgence: null, photos: [], envoi: false, ...contactVide(), ia: null, texte: '', images: [], questions: [], reponses: [], qi: 0, dictee: null, etat: 'saisie', secondes: 0, charge: false, envoye: false };
  if (S.info.ia) {
    S.sig.dictee = creerDictee((ev) => {
      const s = S.sig; if (!s) return;
      if (ev.etat === 'enregistre') { s.etat = 'dictee'; s.secondes = ev.secondes; const n = root.querySelector('#el-mm'); if (n) n.textContent = mmss(ev.secondes); if (ev.secondes === 0) render(); return; }
      if (ev.etat === 'erreur') { s.etat = 'saisie'; toast(ev.message); render(); return; }
      if (ev.etat === 'arrete') transcrireSig(ev.blob);
    });
    return ouvrirCouche('ia1');
  }
  ouvrirCouche('signaler1');
}
const choix = (liste, cle, sel, onpick) => h('div', { class: 'chips', role: 'radiogroup' }, liste.map((x) => h('button', { class: 'opt', role: 'radio', 'aria-checked': sel === x.k ? 'true' : 'false', onclick: () => onpick(x.k) }, x.lbl)));
function coucheSignaler1() {
  const R = S.info.referentiel, s = S.sig;
  const ok = s.piece && s.element && s.description.trim().length >= 3;
  return { titre: 'Signaler un problème', contenu: [h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i')), h('p', { class: 'small', style: 'margin:0 0 10px' }, 'Étape 1 sur 2'),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Où ?'), choix(R.pieces, 'piece', s.piece, (k) => { s.piece = k; render(); })),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Quoi ?'), choix(R.problemes, 'element', s.element, (k) => { s.element = k; render(); })),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Description'), h('textarea', { class: 'inp', maxlength: 2000, placeholder: 'Décrire le problème : depuis quand, ce qui se passe.', oninput: (e) => { s.description = e.target.value; const b = root.querySelector('.pg-f .btn.p'); if (b) b.disabled = !(s.piece && s.element && s.description.trim().length >= 3); } }, s.description))],
    pied: [h('button', { class: 'btn p', disabled: !ok, onclick: () => ouvrirCouche('signaler2') }, 'Continuer', I('chev', 16))] };
}
async function deposer(file) {
  const blob = await preparerImage(file);
  const nom = (file.name || 'photo').replace(/\.[^.]+$/, '') + (blob.type === 'application/pdf' ? '.pdf' : blob.type === 'image/png' ? '.png' : '.jpg');
  return api('depot', blob, { binaire: true, headers: { 'Content-Type': 'application/octet-stream', 'X-El-Nom': encodeURIComponent(nom) } });
}
async function ajouterPhotos(files) {
  const s = S.sig;
  for (const f of files) {
    if (s.photos.length >= 6) { toast('6 photos au plus.'); break; }
    const ph = { nom: f.name, url: null, charge: true }; s.photos.push(ph); render();
    try {
      const r = await deposer(f); Object.assign(ph, r, { charge: false, url: URL.createObjectURL(f) });
      // Pour l'assistant : 3 images réduites au plus, jamais conservées.
      if (S.info.ia && s.images.length < 3) { const d = await imagePourIA(f); if (d) { ph.ia = d; s.images.push(d); } }
    } catch (e) { s.photos.splice(s.photos.indexOf(ph), 1); echec(e); }
    render();
  }
}
const vignettes = (s) => h('div', { class: 'thumbs' },
  s.photos.map((p) => h('div', { class: 'thumb' }, p.url ? h('img', { src: p.url, alt: p.nom || 'photo' }) : h('span', null, 'Envoi…'),
    p.charge ? null : h('button', { class: 'x', onclick: () => { s.photos.splice(s.photos.indexOf(p), 1); if (p.ia) s.images = s.images.filter((x) => x !== p.ia); render(); } }, 'Retirer'))),
  s.photos.length < 6 ? h('button', { class: 'thumb add', onclick: () => choisirFichiers('image/*', true, ajouterPhotos) }, I('cam', 22), 'Ajouter') : null);
// Contact pour l'intervention : le téléphone n'est transmis à l'entreprise QU'avec l'accord coché (D13).
function blocContact(s) {
  return [h('div', { class: 'sec' }, 'Pour l\'intervention'),
    h('button', { class: 'chk', role: 'checkbox', 'aria-checked': s.tel_partage ? 'true' : 'false', onclick: () => { s.tel_partage = !s.tel_partage; render(); } },
      h('span', { class: 'bx' }, I('check', 16)), h('span', null, 'L\'entreprise d\'intervention peut appeler ' + (S.info.locataire || 'le locataire') + ' pour fixer le rendez-vous.', h('br'), h('span', { class: 'small' }, 'Sans cet accord, le rendez-vous passe par le bailleur et par cet espace.'))),
    s.tel_partage ? h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Téléphone'), h('input', { class: 'inp', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, value: s.telephone, oninput: (e) => { s.telephone = e.target.value; } })) : null,
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Accès (facultatif)'), h('input', { class: 'inp', maxlength: 300, placeholder: 'Code, étage, interphone', value: s.acces_info, oninput: (e) => { s.acces_info = e.target.value; } })),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Moments où quelqu\'un est présent (facultatif)'), h('input', { class: 'inp', maxlength: 300, value: s.presence, oninput: (e) => { s.presence = e.target.value; } }))];
}
function coucheSignaler2() {
  const R = S.info.referentiel, s = S.sig;
  const pb = R.problemes.find((p) => p.k === s.element) || {};
  const consignes = s.urgence === 'urgente' && pb.urgence ? (R.consignes[pb.urgence] || []) : [];
  const charge = s.photos.some((p) => p.charge);
  return { titre: 'Signaler un problème', retour: () => ouvrirCouche('signaler1'), contenu: [
    h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i', { class: 'on' })),
    h('p', { class: 'small', style: 'margin:0 0 10px' }, 'Étape 2 sur 2 · ' + ((R.pieces.find((p) => p.k === s.piece) || {}).lbl || '') + ' · ' + (pb.lbl || '')),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Photos (6 au plus)'), vignettes(s)),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Urgence'), h('div', { class: 'radio', role: 'radiogroup' }, R.urgences.map((u) =>
      h('button', { class: 'opt', role: 'radio', 'aria-checked': s.urgence === u.k ? 'true' : 'false', onclick: () => { s.urgence = u.k; render(); } }, h('span', { class: 'dot' }), h('span', null, u.lbl, h('small', null, u.aide)))))),
    h('div', { class: 'banner acc' }, I('alert'), h('span', null, h('b', null, R.danger + ' '), consignes.join(' '))),
    blocContact(s),
    h('p', { class: 'small mt' }, 'Le signalement part au bailleur, qui organise l\'intervention.')],
    pied: [h('button', { class: 'btn p', disabled: !s.urgence || charge || s.envoi, onclick: (e) => envoyerSignalement(e.currentTarget) }, I('send'), 'Envoyer le signalement')] };
}

// ── avec l'assistant IA ──
async function transcrireSig(blob) {
  const s = S.sig; s.etat = 'saisie'; s.charge = true; s.dicte = true; render();
  try {
    const r = await fetch('/api/el/ia/transcrire', { method: 'POST', headers: { 'X-El-Jeton': S.jeton, 'Content-Type': blob.type || 'audio/webm' }, body: blob, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status === 410) { S.inactif = true; S.couche = null; return render(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur === 'quota' ? 'Limite de dictée atteinte pour aujourd\'hui : écrire directement.' : 'Dictée non comprise : écrire plutôt.');
    s.texte = (s.texte ? s.texte + ' ' : '') + (j.text || '');
  } catch (e) { toast(e.message); } finally { s.charge = false; render(); }
}
async function demanderIA(bouton) {
  const s = S.sig;
  if (s.texte.trim().length < 3) { toast('Décrire le problème en quelques mots.'); return; }
  if (s.photos.some((p) => p.charge)) { toast('Photo en cours d\'envoi.'); return; }
  if (bouton) bouton.classList.add('busy'); s.charge = true;
  try {
    const r = await fetch('/api/el/ia/structurer', { method: 'POST', headers: { 'X-El-Jeton': S.jeton, 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      body: JSON.stringify({ task: 'incident-locataire', input: { texte: s.texte, reponses: s.reponses, images: s.images } }) });
    if (r.status === 410) { S.inactif = true; S.couche = null; return render(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.data) throw new Error('assistant');
    s.ia = j.data;
    s.piece = j.data.piece; s.element = j.data.probleme; s.urgence = j.data.urgence; s.description = j.data.resume;
    s.charge = false;
    // Urgence : seulement les consignes de sécurité, puis l'envoi immédiat (aucune question).
    if (s.urgence === 'urgente' && consignesDe(s).length) return ouvrirCouche('urgence');
    if (!s.reponses.length && j.data.questions.length) { s.questions = j.data.questions; s.qi = 0; return ouvrirCouche('ia2'); }
    return ouvrirCouche('ia3');
  } catch (e) {
    // Jamais bloquant : sans l'assistant, le formulaire guidé reprend avec le texte déjà écrit.
    s.charge = false; if (bouton) bouton.classList.remove('busy');
    s.description = s.texte; toast('Assistant indisponible : choisir la pièce et le problème.');
    ouvrirCouche('signaler1');
  }
}
function consignesDe(s) {
  const R = S.info.referentiel, out = [];
  const urg = (s.ia && s.ia.urgences.length) ? s.ia.urgences : [((R.problemes.find((p) => p.k === s.element) || {}).urgence)].filter(Boolean);
  for (const u of urg) for (const c of (R.consignes[u] || [])) if (!out.includes(c)) out.push(c);
  if (out.length) out.push(R.danger);
  return out;
}
function coucheIa1() {
  const s = S.sig, enreg = s.etat === 'dictee';
  return { titre: 'Signaler un problème', contenu: [
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, h('span', { class: 'ia-tag' }, I('spark', 14), 'Assistant IA'), h('span', { class: 'small' }, 'Étape 1 sur 2')),
    h('p', { class: 'h2' }, 'Décrire le problème avec ses mots'),
    h('p', { class: 'muted', style: 'margin:2px 0 12px' }, 'Parler ou écrire, comme au téléphone. L\'assistant reformule et pose au plus deux questions si quelque chose manque.'),
    h('div', { class: 'mic' }, h('span', { class: 'dot' + (enreg ? ' on' : '') }), h('span', { class: 'grow muted' }, enreg ? 'Enregistrement…' : s.charge ? 'Un instant…' : 'Dictée'), h('span', { class: 'num', id: 'el-mm', style: 'font-weight:700' }, mmss(s.secondes)),
      h('button', { class: 'btn s', disabled: s.charge || null, onclick: () => (enreg ? s.dictee.arreter() : s.dictee.demarrer()) }, I(enreg ? 'stop' : 'mic', 16), enreg ? 'Arrêter' : 'Dicter')),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Texte'), h('textarea', { class: 'inp', maxlength: 3000, placeholder: 'Ex. : de l\'eau sous l\'évier de la cuisine depuis ce matin, le meuble est mouillé.', oninput: (e) => { s.texte = e.target.value; } }, s.texte)),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Photos (6 au plus, conseillées)'), vignettes(s)),
    h('div', { class: 'ia-note' }, I('info', 16), h('span', null, S.info.referentiel.mentionIA || '')),
    h('div', { class: 'banner acc mt' }, I('alert'), h('span', null, h('b', null, 'Danger immédiat (gaz, fumée, personne blessée) : appeler le 112 ou le 18'), ' avant toute chose.'))],
    pied: [h('button', { class: 'btn p', disabled: enreg || s.charge || null, onclick: (e) => demanderIA(e.currentTarget) }, I('chev'), 'Continuer')] };
}
function coucheIa2() {
  const s = S.sig, q = s.questions[s.qi] || {};
  const suivant = () => { if (s.qi + 1 < s.questions.length) { s.qi++; render(); } else demanderIA(null); };
  return { titre: 'Signaler un problème', retour: () => ouvrirCouche('ia1'), contenu: [
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, h('span', { class: 'ia-tag' }, I('spark', 14), 'Assistant IA'), h('span', { class: 'small' }, 'Question ' + (s.qi + 1) + ' sur ' + s.questions.length)),
    h('div', { class: 'msgs' }, h('div', { class: 'bub me' }, s.texte),
      h('div', { class: 'bub ia' }, h('span', { class: 'who' }, I('spark', 14), 'Assistant IA'), q.question || '')),
    h('div', { class: 'radio mt', role: 'radiogroup' }, (q.choix || []).map((c) => h('button', { class: 'opt', role: 'radio', 'aria-checked': 'false', disabled: s.charge || null, onclick: () => { s.reponses.push({ q: q.question, r: c }); suivant(); } }, h('span', { class: 'dot' }), h('span', null, c)))),
    h('p', { class: 'small mt' }, 'Deux questions au plus. Il est toujours possible de passer.')],
    pied: [h('button', { class: 'btn s', disabled: s.charge || null, onclick: () => ouvrirCouche('ia3') }, 'Passer')] };
}
function coucheIa3() {
  const R = S.info.referentiel, s = S.sig;
  const charge = s.photos.some((p) => p.charge);
  return { titre: 'Vérifier et envoyer', retour: () => ouvrirCouche('ia1'), contenu: [
    h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, h('span', { class: 'ia-tag' }, I('spark', 14), 'Assistant IA'), h('span', { class: 'small' }, 'Étape 2 sur 2')),
    h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Résumé proposé (modifiable)'), h('textarea', { class: 'inp', maxlength: 2000, oninput: (e) => { s.description = e.target.value; } }, s.description)),
    h('p', { class: 'small', style: 'margin:-4px 0 8px' }, 'Proposé par l\'IA, à vérifier. Ni cause ni responsabilité : seulement ce qui se voit.'),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Où ?'), choix(R.pieces, 'piece', s.piece, (k) => { s.piece = k; render(); })),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Urgence'), h('div', { class: 'radio', role: 'radiogroup' }, R.urgences.map((u) =>
      h('button', { class: 'opt', role: 'radio', 'aria-checked': s.urgence === u.k ? 'true' : 'false', onclick: () => { s.urgence = u.k; render(); } }, h('span', { class: 'dot' }), h('span', null, u.lbl, h('small', null, u.aide)))))),
    s.photos.length ? h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Photos'), vignettes(s)) : null,
    blocContact(s)],
    pied: [h('button', { class: 'btn p', disabled: charge || s.envoi || s.description.trim().length < 3 || null, onclick: (e) => envoyerSignalement(e.currentTarget) }, I('send'), 'Envoyer le signalement')] };
}
// Urgence : les consignes existantes (QuiPaie.URGENCES, CONSIGNE_DANGER), mot pour mot, et rien d'autre ; envoi immédiat.
function coucheUrgence() {
  const s = S.sig, c = consignesDe(s);
  return { titre: s.envoye ? 'Urgence : signalement envoyé' : 'Urgence : à faire maintenant', contenu: [
    h('div', { class: 'urg' }, h('h3', null, I('alert', 22), 'À faire maintenant'), h('ol', null, c.map((x) => h('li', null, x)))),
    h('a', { class: 'btn s w mt', href: 'tel:112' }, I('phone', 18), 'Appeler le 112'),
    s.envoye ? h('div', { class: 'banner pos mt' }, I('check'), h('span', null, h('b', null, 'Signalement envoyé en urgence le ' + fdh(S.envoyeLe) + '. '), 'Le bailleur est prévenu ; l\'avancement s\'affiche dans « Signalements ».'))
      : [h('div', { class: 'sec' }, 'Pour l\'intervention'),
        h('button', { class: 'chk', role: 'checkbox', 'aria-checked': s.tel_partage ? 'true' : 'false', onclick: () => { s.tel_partage = !s.tel_partage; render(); } }, h('span', { class: 'bx' }, I('check', 16)), h('span', null, 'L\'entreprise d\'intervention peut appeler ce numéro.')),
        s.tel_partage ? h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Téléphone'), h('input', { class: 'inp', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, value: s.telephone, oninput: (e) => { s.telephone = e.target.value; } })) : null]],
    pied: s.envoye ? [h('button', { class: 'btn p', onclick: () => aller('suivi') }, I('eye'), 'Suivre le signalement')]
      : [h('button', { class: 'btn p', disabled: s.envoi || null, onclick: (e) => envoyerSignalement(e.currentTarget, true) }, I('send'), 'Envoyer en urgence')] };
}
async function envoyerSignalement(bouton, urgence) {
  const s = S.sig; s.envoi = true; bouton.classList.add('busy');
  const ia = s.ia ? { resume: s.description, element: s.ia.element, nature: s.ia.nature, urgences: s.urgence === 'urgente' ? s.ia.urgences : [], texte: s.texte, reponses: s.reponses, dicte: !!s.dicte } : null;
  try {
    await api('signaler', { piece: s.piece || 'autre', element: s.element || 'autre', urgence: s.urgence || 'importante', description: s.description, photos: s.photos.filter((p) => p.path).map((p) => ({ path: p.path, nom: p.nom, mime: p.mime })),
      ia, tel_partage: s.tel_partage, telephone: s.telephone, acces_info: s.acces_info, presence: s.presence });
    s.photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    S.sigs = null; if (S.info.compteurs) S.info.compteurs.signalements_ouverts = (S.info.compteurs.signalements_ouverts || 0) + 1;
    S.envoyeLe = new Date().toISOString();
    if (urgence) { s.envoye = true; s.envoi = false; render(); } else ouvrirCouche('envoye');
    rechargerSigs();
  } catch (e) { s.envoi = false; bouton.classList.remove('busy'); echec(e); }
}
function coucheEnvoye() {
  return { titre: 'Signalement', contenu: [h('div', { class: 'empty' }, h('span', { class: 'ic pos big' }, I('check', 28)), h('p', { class: 'h2' }, 'Signalement envoyé'),
    h('p', { class: 'muted', style: 'margin:0' }, `Envoyé le ${fdh(S.envoyeLe)} au bailleur (${S.info.bailleur}). L'avancement s'affiche dans « Signalements » : signalé, intervention prévue, terminé.`))],
    pied: [h('button', { class: 'btn p', onclick: () => aller('suivi') }, 'Suivre les signalements', I('chev', 16))] };
}

// ─────────────── suivi ───────────────
// Trois étapes vues du locataire (0060) : Signalé → Intervention prévue → Terminé. Rien sur la cause ni le coût avant la
// publication du résultat par le bailleur, après sa validation.
const lbl = (liste, k) => ((liste || []).find((x) => x.k === k) || {}).lbl || '';
const etapeDe = (s) => ((s.resultat || s.statut === 'resolu') ? 'termine' : ((s.intervention && s.intervention.creneau) || s.statut === 'en_cours') ? 'intervention' : 'signale');
const ETAPE_LBL = { signale: 'Signalé', intervention: 'Intervention prévue', termine: 'Terminé' };
function titreSig(s) { const R = S.info.referentiel; return [lbl(R.problemes, s.element), lbl(R.pieces, s.piece).toLowerCase()].filter(Boolean).join(' · '); }
function vueSuivi() {
  const l = S.sigs;
  const contenu = [h('h1', { class: 'h1' }, 'Signalements'), h('p', { class: 'lead' }, 'Seuls les signalements faits depuis ce lien sont visibles ici.')];
  if (peut('signaler')) contenu.push(h('button', { class: 'btn p w', onclick: debuterSignalement }, I('plus'), 'Signaler un problème'));
  if (!l) { contenu.push(h('p', { class: 'small mt' }, 'Chargement…')); return { contenu }; }
  if (!l.length) { contenu.push(h('div', { class: 'card empty mt' }, h('span', { class: 'ic big' }, I('tool', 26)), h('p', { class: 'muted', style: 'margin:0' }, 'Aucun signalement pour le moment.'))); return { contenu }; }
  const sous = (s) => {
    const e = etapeDe(s), it = s.intervention;
    if (e === 'termine') return 'Signalé le ' + fd(s.cree_le) + ' · terminé' + (s.resultat_publie_le ? ' le ' + fd(s.resultat_publie_le) : s.dates.resolu ? ' le ' + fd(s.dates.resolu) : '');
    if (it && it.creneau) return 'Intervention ' + plage(it.creneau) + (it.confirme_le ? '' : ' · à confirmer');
    return 'Signalé le ' + fd(s.cree_le) + (s.nb_photos ? ' · ' + s.nb_photos + ' photo' + (s.nb_photos > 1 ? 's' : '') : '');
  };
  const ligne = (s) => h('button', { class: 'li', onclick: () => { S.sigSel = s; S.accordCreneau = false; ouvrirCouche('detail'); } }, h('span', { class: 'ic' }, I('tool', 20)),
    h('span', { class: 'tx' }, h('b', null, titreSig(s)), h('span', null, sous(s))),
    h('span', { class: 'chip ' + (etapeDe(s) === 'termine' ? 'pos' : 'adv') }, ETAPE_LBL[etapeDe(s)]));
  const ouverts = l.filter((s) => etapeDe(s) !== 'termine'), finis = l.filter((s) => etapeDe(s) === 'termine');
  if (ouverts.length) contenu.push(h('div', { class: 'sec' }, 'En cours'), h('div', { class: 'list' }, ouverts.map(ligne)));
  if (finis.length) contenu.push(h('div', { class: 'sec' }, 'Terminés'), h('div', { class: 'list' }, finis.map(ligne)));
  return { contenu };
}
function chargerImage(source, id, index, img) {
  api('fichier', { source, id, index }, { blob: true }).then((b) => { img.src = URL.createObjectURL(b); }).catch(() => { img.alt = 'Photo indisponible'; });
}
// Résultat expliqué (publié par le bailleur après sa validation) : constat, payeur, montant si le locataire paie, textes.
function blocResultat(r) {
  const loc = r.payeur === 'locataire';
  const titre = loc ? 'À la charge du locataire' + (r.montantTtc ? ' : ' + euros(r.montantTtc) : '') : r.payeur === 'bailleur' ? 'À la charge du bailleur' : r.payeur === 'syndic' ? 'Pris en charge par le syndic de copropriété' : 'Circuit de l\'assurance';
  return h('div', { class: 'verdict mt' },
    h('div', { class: 'vh' }, h('span', { class: 'ic ' + (loc ? '' : 'pos') }, I(loc ? 'scale' : 'check', 20)), h('div', null, h('b', null, titre), loc && r.facture ? h('div', { class: 'small' }, 'Facture n° ' + r.facture) : r.payeur === 'bailleur' ? h('div', { class: 'small' }, 'Rien à payer pour le locataire') : null)),
    h('div', { class: 'vb' },
      h('dl', { class: 'kv', style: 'margin:0' }, [['Constat', r.constat], ['Ampleur', r.ampleur], ['Travaux', r.travaux]].filter(([, v]) => v).map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
      (r.textes || []).map((t) => [h('div', { class: 'quote' }, '« ' + t.extrait + ' »'), h('p', { class: 'src' }, t.ref + ' — Légifrance')]),
      r.exceptions ? h('div', { class: 'banner mt' }, I('info'), h('span', null, 'Si la cause est autre (vétusté, malfaçon, vice), le signaler au bailleur : la réparation lui reviendrait alors. Selon le contrat, l\'assurance habitation peut couvrir certains dommages.')) : null,
      h('p', { class: 'small', style: 'margin:10px 0 0' }, 'Information juridique générale, pas une consultation juridique (loi n° 71-1130 du 31 décembre 1971, art. 54).')));
}
function coucheDetail() {
  const s = S.sigSel || {}, d = s.dates || {}, it = s.intervention, R = S.info.referentiel;
  const e = etapeDe(s), rang = { signale: 0, intervention: 1, termine: 2 }[e];
  const etapes = [['Signalé', fdh(s.cree_le)], ['Intervention prévue', it ? it.entreprise + (it.creneau ? ' · ' + plage(it.creneau) : ' · créneau à venir') : (d.en_cours ? 'Pris en compte le ' + fdh(d.en_cours) : '—')], ['Terminé', s.resultat_publie_le ? 'Validé par le bailleur le ' + fdh(s.resultat_publie_le) : d.resolu ? fdh(d.resolu) : 'Le résultat s\'affichera ici, expliqué.']];
  const aConfirmer = it && it.creneau && !it.confirme_le && e !== 'termine';
  const accord = it && it.accordExpres && it.accordExpres.exige;
  const contenu = [h('p', { class: 'h2' }, titreSig(s)), h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Signalé le ' + fdh(s.cree_le) + ' · ' + lbl(R.urgences, s.urgence).toLowerCase()),
    h('div', { class: 'card' }, h('ul', { class: 'tl' }, etapes.map(([l, t], i) => h('li', { class: i < rang || (i === rang && i === 2) ? 'ok' : i === rang ? 'cur' : '' },
      h('span', { class: 'd' }, i <= rang ? I(i < rang || i === 2 ? 'check' : 'clock') : null), h('div', null, h('b', null, l), h('span', null, t))))))];
  if (aConfirmer) {
    contenu.push(h('div', { class: 'card' }, h('b', { style: 'display:block;margin-bottom:4px' }, 'Confirmer le rendez-vous'), h('span', { class: 'muted' }, plage(it.creneau) + ', proposé par ' + it.entreprise + '.'),
      accord ? [h('div', { class: 'quote' }, '« ' + R.art7e.texte + ' »'), h('p', { class: 'src' }, R.art7e.source),
        h('button', { class: 'chk mt', role: 'checkbox', 'aria-checked': S.accordCreneau ? 'true' : 'false', onclick: () => { S.accordCreneau = !S.accordCreneau; render(); } }, h('span', { class: 'bx' }, I('check', 16)),
          h('span', null, S.info.locataire + ' donne son accord exprès pour une intervention ce jour-là (' + ({ samedi: 'samedi', dimanche: 'dimanche', ferie: 'jour férié' }[it.accordExpres.motif]) + ').'))] : null,
      h('button', { class: 'btn g', style: 'padding:0 2px;margin-top:6px', onclick: () => { S.msg.signalement = s.id; S.msg.texte = 'Le créneau proposé ne convient pas. Moments possibles : '; aller('messages'); } }, I('cal', 16), 'Demander un autre moment')));
  } else if (it && it.confirme_le && e !== 'termine') contenu.push(h('div', { class: 'banner pos' }, I('check'), h('span', null, 'Rendez-vous confirmé : ' + plage(it.creneau) + ' avec ' + it.entreprise + '.')));
  if (s.resultat) contenu.push(blocResultat(s.resultat));
  contenu.push(h('div', { class: 'card mt' }, h('b', { style: 'display:block;margin-bottom:6px' }, 'Description envoyée'), h('span', { class: 'muted', style: 'white-space:pre-wrap' }, s.description),
    s.nb_photos ? h('div', { class: 'thumbs mt' }, Array.from({ length: s.nb_photos }, (_, k) => { const img = h('img', { alt: 'Photo ' + (k + 1) }); chargerImage('signalement', s.id, k, img); return h('div', { class: 'thumb' }, img); })) : null));
  if (!s.resultat) contenu.push(h('p', { class: 'small mt' }, 'Aucune information sur la cause ni sur le coût avant la fin de l\'intervention.'));
  const pied = [];
  if (aConfirmer) pied.push(h('button', { class: 'btn p', disabled: (accord && !S.accordCreneau) || null, onclick: (ev) => confirmerCreneau(s, ev.currentTarget) }, I('check'), 'Confirmer le rendez-vous'));
  else if (peut('message')) pied.push(h('button', { class: s.resultat ? 'btn p' : 'btn s', onclick: () => { S.msg.signalement = s.id; aller('messages'); } }, I('chat'), s.resultat ? 'Contester ou poser une question' : 'Écrire au bailleur'));
  return { titre: 'Signalement', contenu, pied: pied.length ? pied : null };
}
async function confirmerCreneau(s, b) {
  b.classList.add('busy');
  try { await api('creneau', { signalement_id: s.id, accord_expres: !!S.accordCreneau }); S.couche = null; await rechargerSigs(); toast('Rendez-vous confirmé.'); }
  catch (e) { b.classList.remove('busy'); echec(e.code === 'accord_requis' ? new Error('Cocher l\'accord exprès pour ce jour-là.') : e); }
}

// ─────────────── messages ───────────────
function vueMessages() {
  const l = S.msgs;
  const fil = [h('span', { class: 'dsep' }, 'Fil privé entre ' + S.info.locataire + ' et le bailleur')];
  if (!l) fil.push(h('p', { class: 'small' }, 'Chargement…'));
  else if (!l.length) fil.push(h('p', { class: 'small', style: 'text-align:center' }, 'Aucun message. Écrire au bailleur ci-dessous.'));
  else {
    let jour = '';
    for (const m of l) {
      const j = fd(m.cree_le); if (j !== jour) { jour = j; fil.push(h('span', { class: 'dsep' }, j)); }
      const moi = m.auteur === 'locataire';
      fil.push(h('div', { class: 'bub ' + (moi ? 'me' : 'them') }, m.corps,
        (m.pieces || []).map((p, k) => h('button', { class: 'att', onclick: (e) => ouvrirFichier('message', m.id, k, p.nom, false, e.currentTarget) }, I('clip', 16), (p.nom || 'Pièce jointe') + (p.taille ? ' · ' + taille(p.taille) : ''))),
        h('span', { class: 'meta' }, (moi ? 'Envoyé' : S.info.bailleur) + ' · ' + fdh(m.cree_le) + (moi && m.lu ? ' · lu' : ''))));
    }
  }
  const contenu = [h('div', { class: 'msgs' }, fil), h('p', { class: 'small mt', style: 'text-align:center' }, 'Réponse non instantanée : le bailleur lit les messages dans son application.')];
  if (!peut('message')) return { contenu: contenu.concat(h('p', { class: 'small', style: 'text-align:center' }, 'Les messages sont fermés depuis la clôture des comptes.')) };
  const m = S.msg;
  const bas = h('div', { class: 'composer' },
    m.pieces.length ? h('div', { class: 'jointes' }, m.pieces.map((p) => h('span', { class: 'chip' }, p.charge ? 'Envoi…' : p.nom, p.charge ? null : h('button', { class: 'btn g', style: 'padding:0 8px', onclick: () => { m.pieces.splice(m.pieces.indexOf(p), 1); render(); } }, 'Retirer')))) : null,
    h('textarea', { 'aria-label': 'Message', placeholder: 'Écrire un message', maxlength: 4000, oninput: (e) => { m.texte = e.target.value; } }, m.texte),
    h('button', { class: 'btn s', disabled: m.pieces.length >= 4 || null, onclick: () => choisirFichiers('image/*,application/pdf', false, ajouterPiece) }, I('clip'), 'Joindre'),
    h('button', { class: 'btn p', onclick: (e) => envoyerMessage(e.currentTarget) }, I('send'), 'Envoyer'));
  return { contenu, bas };
}
async function ajouterPiece(files) {
  const m = S.msg, f = files[0]; if (!f) return;
  const p = { nom: f.name, charge: true }; m.pieces.push(p); render();
  try { Object.assign(p, await deposer(f), { charge: false }); } catch (e) { m.pieces.splice(m.pieces.indexOf(p), 1); echec(e); }
  render();
}
async function envoyerMessage(bouton) {
  const m = S.msg;
  if (!m.texte.trim()) return toast('Écrire un message.');
  if (m.pieces.some((p) => p.charge)) return toast('Pièce jointe en cours d\'envoi.');
  bouton.classList.add('busy');
  try {
    await api('message', { corps: m.texte, pieces: m.pieces.map((p) => ({ path: p.path, nom: p.nom, mime: p.mime, taille: p.taille })), signalement_id: m.signalement || null });
    S.msg = { texte: '', pieces: [], envoi: false }; toast('Message envoyé.'); await rechargerMsgs();
    const b = root.querySelector('.el-body'); if (b) b.scrollTop = b.scrollHeight;
  } catch (e) { bouton.classList.remove('busy'); echec(e); }
}

const VUES = { accueil: vueAccueil, documents: vueDocuments, suivi: vueSuivi, messages: vueMessages };
const COUCHES = { doc: coucheDoc, accord: coucheAccord, signaler1: coucheSignaler1, signaler2: coucheSignaler2, envoye: coucheEnvoye, detail: coucheDetail,
  ia1: coucheIa1, ia2: coucheIa2, ia3: coucheIa3, urgence: coucheUrgence };
charger();
