// el.js — ESPACE LOCATAIRE (page publique /l du relais). Aucune dépendance, aucun CDN, aucun traceur.
// Le jeton est lu dans le FRAGMENT de l'URL (#…) et envoyé dans l'en-tête X-El-Jeton ; il n'est jamais mis dans
// une URL de requête, ni stocké. Toute donnée affichée passe par textContent (aucun innerHTML de donnée).
// Écrans : maquette validée mockups/ESPACE-LOCATAIRE/maquette.html ; ton neutre (infinitif, ni « tu » ni « vous »).

const JETON_RE = /^[A-Za-z0-9_-]{43}$/;
const root = document.getElementById('app');
const S = {
  jeton: null, info: null, inactif: false, erreur: null,
  docs: null, sigs: null, msgs: null,
  vue: 'accueil', couche: null, filtre: 'tout', docSel: null, sigSel: null,
  sig: null, accord: { coche: false, etape: 'texte', code: '', a: '' },
  msg: { texte: '', pieces: [], envoi: false },
};

// ─────────────── utilitaires DOM sûrs ───────────────
function h(tag, props, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;   // CSSOM : permis par la CSP (style-src 'self'), contrairement à l'attribut
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const e of enfants.flat(Infinity)) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}
const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', doc: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  chat: 'M4 5h16v11H9l-5 4z', check: 'M5 12.5 10 17l9-10', lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  back: 'M15 5l-7 7 7 7', x: 'M6 6l12 12M18 6 6 18', chev: 'M9 5l7 7-7 7', dl: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z', info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7.5v.5',
  clip: 'M20 11.5 12 19.5a5 5 0 0 1-7-7L13.5 4a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  alert: 'M12 3 2 20h20zM12 10v4M12 17v.5', mail: 'M3 5h18v14H3zM3 7l9 6 9-6', plus: 'M12 5v14M5 12h14',
  zip: 'M3 4h18v5H3zM5 9v11h14V9M10 13h4', ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12', send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  key: 'M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8M11 12 20 3M16 7l3 3', euro: 'M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9',
};
function I(n, s) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  if (s) { svg.style.width = s + 'px'; svg.style.height = s + 'px'; }
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', P[n] || ''); svg.append(p);
  return svg;
}
function marque() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('class', 'mark'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Propryo');
  const r = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: 1.76, y: 1.76, width: 28.48, height: 28.48, rx: 7.68, fill: 'none', stroke: 'var(--acc)', 'stroke-width': 3.52 })) r.setAttribute(k, v);
  const c = document.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: 21.34, cy: 21.34, r: 4.1, fill: 'var(--acc)' })) c.setAttribute(k, v);
  svg.append(r, c); return svg;
}
const fd = (s) => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); if (m && (String(s).length <= 10 || /T23:59:59/.test(String(s)))) return `${m[3]}/${m[2]}/${m[1]}`; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const fdh = (s) => { const d = new Date(s); if (isNaN(d)) return ''; return fd(s) + ' à ' + String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0'); };
const taille = (n) => !n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
let _toastT = null;
function toast(t) {
  const old = root.querySelector('.toast'); if (old) old.remove();
  const el = h('div', { class: 'toast', role: 'status' }, t); root.append(el);
  clearTimeout(_toastT); _toastT = setTimeout(() => el.remove(), 3500);
}

// ─────────────── API (même origine, jeton en en-tête) ───────────────
const MSG_ERREUR = {
  429: 'Trop de demandes : réessayer dans quelques minutes.', 409: "Cette action n'est plus possible : le bail est terminé.",
  413: 'Fichier trop lourd : 10 Mo au plus.', 415: 'Format non accepté : photo (JPEG, PNG) ou PDF.',
  503: 'Service momentanément indisponible. Réessayer plus tard.', 404: 'Fichier introuvable. Prévenir le bailleur.',
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
    const m = j.message || MSG_ERREUR[r.status] || (j.erreur === 'code_faux' ? 'Code incorrect.' : j.erreur === 'code_requis' ? 'Code expiré : en demander un nouveau.' : 'Une erreur est survenue. Réessayer.');
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
async function rechargerSigs() { try { S.sigs = (await api('signalements')).liste || []; render(); } catch (e) { echec(e); } }
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
  S.vue = vue; S.couche = null;
  if (vue === 'messages') rechargerMsgs();
  if (vue === 'suivi' && !S.sigs) rechargerSigs();
  render();
  const b = root.querySelector('.el-body'); if (b) b.scrollTop = 0;
}
function ouvrirCouche(c) { S.couche = c; render(); const f = root.querySelector('.pg .bk'); if (f) f.focus(); }
function fermerCouche() { S.couche = null; render(); }
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
  const q = visibles.filter((d) => d.type === 'quittance');
  const annees = [...new Set(q.map((d) => String(d.date_doc || d.publie_le).slice(0, 4)))].sort().reverse();
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
  if (i.phase !== 'complet') {
    const t = i.phase === 'depart'
      ? `Bail terminé le ${fd(i.fin_bail)}. Les messages restent ouverts jusqu'à la clôture des comptes ; les signalements sont fermés.`
      : `Comptes clos le ${fd(i.comptes_clos_le)}. Les signalements et les messages sont fermés. Télécharger les documents pour les conserver.`;
    contenu.push(h('div', { class: 'banner' }, I('clock'), h('span', null, h('b', null, `Documents consultables jusqu'au ${fd(i.fin_acces)}. `), t)));
    if (docs.length) contenu.push(h('button', { class: 'btn p w mt', onclick: (e) => toutTelecharger(e.currentTarget) }, I('zip'), `Tout télécharger (${docs.length} document${docs.length > 1 ? 's' : ''})`));
  } else {
    const recent = docs.filter((d) => Date.now() - new Date(d.publie_le).getTime() < 30 * 864e5).sort((a, b) => String(b.publie_le).localeCompare(String(a.publie_le)))[0];
    if (recent) contenu.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ic acc' }, I('doc', 22)), h('div', { class: 'grow' }, h('span', { class: 'chip acc', style: 'margin-bottom:4px' }, 'Nouveau'), h('b', { style: 'display:block;font-size:15px' }, recent.titre), h('span', { class: 'muted' }, 'Disponible depuis le ' + fd(recent.publie_le)))),
      h('button', { class: 'btn p w mt', onclick: () => { S.docSel = recent; ouvrirCouche('doc'); } }, I('eye'), 'Ouvrir le document')));
  }
  if (peut('accord')) {
    const a = i.accord || {}, donne = a.donne_le && !a.retire_le;
    contenu.push(h('div', { class: 'card mt' }, h('div', { class: 'row top' }, h('span', { class: donne ? 'ic pos' : 'ic adv' }, I(donne ? 'check' : 'mail', 20)),
      h('div', { class: 'grow' }, h('b', { style: 'display:block' }, 'Quittances par voie électronique'), h('span', { class: 'muted' }, donne ? 'Accord donné le ' + fdh(a.donne_le) + '.' : "Accord non donné. La loi le permet seulement avec l'accord exprès du locataire."))),
      h('button', { class: 'btn s w mt', onclick: () => { S.accord = { coche: false, etape: 'texte', code: '', a: '' }; ouvrirCouche('accord'); } }, donne ? 'Voir ou retirer l\'accord' : 'Lire et décider', I('chev', 16))));
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
    return { titre: 'Confirmer par code', retour: () => { S.accord.etape = 'texte'; render(); },
      contenu: [h('p', { class: 'h2' }, 'Saisir le code reçu par e-mail'), h('p', { class: 'muted' }, `Code à 6 chiffres envoyé à ${S.accord.a}. Valable 10 minutes, 5 essais.`),
        h('label', { class: 'fld' }, h('span', { class: 'lb' }, 'Code'), h('input', { class: 'inp otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, value: S.accord.code, oninput: (e) => { S.accord.code = e.target.value.replace(/\D/g, '').slice(0, 6); } })),
        h('button', { class: 'btn g w', onclick: (e) => demanderCode(e.currentTarget) }, 'Recevoir un nouveau code')],
      pied: [h('button', { class: 'btn p', onclick: (e) => envoyerAccord(S.accord.donner, e.currentTarget) }, I('check'), 'Confirmer')] };
  }
  if (donne) {
    return { titre: 'Accord électronique', contenu: [h('div', { class: 'banner pos' }, I('check'), h('span', null, h('b', null, 'Accord donné le ' + fdh(a.donne_le) + '. '), 'Le bailleur voit cet accord.')),
      h('div', { class: 'card mt' }, h('b', { style: 'display:block;margin-bottom:4px' }, "Retirer l'accord"), h('span', { class: 'muted' }, 'Le bailleur reprend alors la remise papier sur demande. Les quittances déjà déposées restent consultables ici.')),
      h('div', { class: 'mt' }, loi)],
      pied: [h('button', { class: 'btn s', onclick: (e) => lancerAccord(false, e.currentTarget) }, I('ban'), "Retirer l'accord")] };
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
    pied: [h('button', { class: 'btn p', disabled: !coche, onclick: (e) => lancerAccord(true, e.currentTarget) }, I('check'), "Donner l'accord")] };
}
async function demanderCode(bouton) {
  bouton && bouton.classList.add('busy');
  try { const r = await api('accord/code'); S.accord.etape = 'code'; S.accord.a = r.a || "l'adresse du bail"; render(); toast('Code envoyé.'); }
  catch (e) { echec(e); } finally { bouton && bouton.classList.remove('busy'); }
}
async function lancerAccord(donner, bouton) {
  S.accord.donner = donner;
  if (S.info.codeAccord) return demanderCode(bouton);
  return envoyerAccord(donner, bouton);
}
async function envoyerAccord(donner, bouton) {
  bouton && bouton.classList.add('busy');
  try {
    const r = await api('accord', { donner, code: S.accord.code || undefined });
    S.info.accord = r.accord; S.accord = { coche: false, etape: 'texte', code: '', a: '' };
    S.couche = 'accord'; render(); toast(donner ? 'Accord enregistré.' : 'Accord retiré.');
  } catch (e) { echec(e); } finally { bouton && bouton.classList.remove('busy'); }
}

// ─────────────── signaler ───────────────
function debuterSignalement() { S.sig = { piece: null, element: null, description: '', urgence: null, photos: [], envoi: false }; ouvrirCouche('signaler1'); }
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
async function preparerImage(file) {
  if (file.type === 'application/pdf') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    // Ré-encodage JPEG : réduit le poids ET retire les métadonnées (position GPS de l'appareil photo).
    return await new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
  } catch (e) { if (/^image\/(jpeg|png)$/.test(file.type)) return file; throw new Error('Format non accepté : photo (JPEG, PNG) ou PDF.'); }
}
async function deposer(file) {
  const blob = await preparerImage(file);
  const nom = (file.name || 'photo').replace(/\.[^.]+$/, '') + (blob.type === 'application/pdf' ? '.pdf' : blob.type === 'image/png' ? '.png' : '.jpg');
  return api('depot', blob, { binaire: true, headers: { 'Content-Type': 'application/octet-stream', 'X-El-Nom': encodeURIComponent(nom) } });
}
function choisirFichiers(accept, multiple, onfiles) {
  const inp = h('input', { type: 'file', accept, multiple: multiple || null, class: 'vh' });
  inp.addEventListener('change', () => { onfiles([...inp.files]); inp.remove(); });
  document.body.append(inp); inp.click();
}
async function ajouterPhotos(files) {
  const s = S.sig;
  for (const f of files) {
    if (s.photos.length >= 6) { toast('6 photos au plus.'); break; }
    const ph = { nom: f.name, url: null, charge: true }; s.photos.push(ph); render();
    try { const r = await deposer(f); Object.assign(ph, r, { charge: false, url: URL.createObjectURL(f) }); }
    catch (e) { s.photos.splice(s.photos.indexOf(ph), 1); echec(e); }
    render();
  }
}
function coucheSignaler2() {
  const R = S.info.referentiel, s = S.sig;
  const pb = R.problemes.find((p) => p.k === s.element) || {};
  const consignes = s.urgence === 'urgente' && pb.urgence ? (R.consignes[pb.urgence] || []) : [];
  const charge = s.photos.some((p) => p.charge);
  return { titre: 'Signaler un problème', retour: () => ouvrirCouche('signaler1'), contenu: [
    h('div', { class: 'steps' }, h('i', { class: 'on' }), h('i', { class: 'on' })),
    h('p', { class: 'small', style: 'margin:0 0 10px' }, 'Étape 2 sur 2 · ' + ((R.pieces.find((p) => p.k === s.piece) || {}).lbl || '') + ' · ' + (pb.lbl || '')),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Photos (6 au plus)'), h('div', { class: 'thumbs' },
      s.photos.map((p) => h('div', { class: 'thumb' }, p.url ? h('img', { src: p.url, alt: p.nom || 'photo' }) : h('span', null, 'Envoi…'),
        p.charge ? null : h('button', { class: 'x', onclick: () => { s.photos.splice(s.photos.indexOf(p), 1); render(); } }, 'Retirer'))),
      s.photos.length < 6 ? h('button', { class: 'thumb add', onclick: () => choisirFichiers('image/*', true, ajouterPhotos) }, I('cam', 22), 'Ajouter') : null)),
    h('div', { class: 'fld' }, h('span', { class: 'lb' }, 'Urgence'), h('div', { class: 'radio', role: 'radiogroup' }, R.urgences.map((u) =>
      h('button', { class: 'opt', role: 'radio', 'aria-checked': s.urgence === u.k ? 'true' : 'false', onclick: () => { s.urgence = u.k; render(); } }, h('span', { class: 'dot' }), h('span', null, u.lbl, h('small', null, u.aide)))))),
    h('div', { class: 'banner acc' }, I('alert'), h('span', null, h('b', null, R.danger + ' '), consignes.join(' '))),
    h('p', { class: 'small mt' }, 'Le signalement part au bailleur, qui décide de la suite.')],
    pied: [h('button', { class: 'btn p', disabled: !s.urgence || charge || s.envoi, onclick: (e) => envoyerSignalement(e.currentTarget) }, I('send'), 'Envoyer le signalement')] };
}
async function envoyerSignalement(bouton) {
  const s = S.sig; s.envoi = true; bouton.classList.add('busy');
  try {
    await api('signaler', { piece: s.piece, element: s.element, urgence: s.urgence, description: s.description, photos: s.photos.map((p) => ({ path: p.path, nom: p.nom, mime: p.mime })) });
    s.photos.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    S.sigs = null; if (S.info.compteurs) S.info.compteurs.signalements_ouverts = (S.info.compteurs.signalements_ouverts || 0) + 1;
    S.envoyeLe = new Date().toISOString();
    ouvrirCouche('envoye'); rechargerSigs();
  } catch (e) { s.envoi = false; bouton.classList.remove('busy'); echec(e); }
}
function coucheEnvoye() {
  return { titre: 'Signalement', contenu: [h('div', { class: 'empty' }, h('span', { class: 'ic pos big' }, I('check', 28)), h('p', { class: 'h2' }, 'Signalement envoyé'),
    h('p', { class: 'muted', style: 'margin:0' }, `Envoyé le ${fdh(S.envoyeLe)} au bailleur (${S.info.bailleur}). L'avancement s'affiche dans « Signalements ». Le bailleur peut aussi répondre dans « Messages ».`))],
    pied: [h('button', { class: 'btn p', onclick: () => aller('suivi') }, 'Suivre les signalements', I('chev', 16))] };
}

// ─────────────── suivi ───────────────
const STATUT = { signale: 'Signalé', en_cours: 'En cours', resolu: 'Résolu' };
const lbl = (liste, k) => ((liste || []).find((x) => x.k === k) || {}).lbl || '';
function titreSig(s) { const R = S.info.referentiel; return [lbl(R.problemes, s.element), lbl(R.pieces, s.piece).toLowerCase()].filter(Boolean).join(' · '); }
function vueSuivi() {
  const l = S.sigs;
  const contenu = [h('h1', { class: 'h1' }, 'Signalements'), h('p', { class: 'lead' }, 'Seuls les signalements faits depuis ce lien sont visibles ici.')];
  if (peut('signaler')) contenu.push(h('button', { class: 'btn p w', onclick: debuterSignalement }, I('plus'), 'Signaler un problème'));
  if (!l) { contenu.push(h('p', { class: 'small mt' }, 'Chargement…')); return { contenu }; }
  if (!l.length) { contenu.push(h('div', { class: 'card empty mt' }, h('span', { class: 'ic big' }, I('tool', 26)), h('p', { class: 'muted', style: 'margin:0' }, 'Aucun signalement pour le moment.'))); return { contenu }; }
  const ligne = (s) => h('button', { class: 'li', onclick: () => { S.sigSel = s; ouvrirCouche('detail'); } }, h('span', { class: 'ic' }, I('tool', 20)),
    h('span', { class: 'tx' }, h('b', null, titreSig(s)), h('span', null, 'Signalé le ' + fd(s.cree_le) + (s.statut === 'resolu' && s.dates.resolu ? ' · résolu le ' + fd(s.dates.resolu) : '') + (s.nb_photos ? ' · ' + s.nb_photos + ' photo' + (s.nb_photos > 1 ? 's' : '') : ''))),
    h('span', { class: 'chip ' + (s.statut === 'resolu' ? 'pos' : 'adv') }, STATUT[s.statut] || 'Signalé'));
  const ouverts = l.filter((s) => s.statut !== 'resolu'), finis = l.filter((s) => s.statut === 'resolu');
  if (ouverts.length) contenu.push(h('div', { class: 'sec' }, 'En cours'), h('div', { class: 'list' }, ouverts.map(ligne)));
  if (finis.length) contenu.push(h('div', { class: 'sec' }, 'Terminés'), h('div', { class: 'list' }, finis.map(ligne)));
  return { contenu };
}
function chargerImage(source, id, index, img) {
  api('fichier', { source, id, index }, { blob: true }).then((b) => { img.src = URL.createObjectURL(b); }).catch(() => { img.alt = 'Photo indisponible'; });
}
function coucheDetail() {
  const s = S.sigSel || {}, d = s.dates || {};
  const etapes = [['signale', 'Signalé', d.signale], ['en_cours', 'En cours', d.en_cours], ['resolu', 'Résolu', d.resolu]];
  const rang = { signale: 0, en_cours: 1, resolu: 2 }[s.statut] || 0;
  return { titre: 'Signalement', contenu: [h('p', { class: 'h2' }, titreSig(s)), h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Signalé le ' + fdh(s.cree_le) + ' · ' + lbl(S.info.referentiel.urgences, s.urgence).toLowerCase()),
    h('div', { class: 'card' }, h('ul', { class: 'tl' }, etapes.map(([k, l, dt], i) => h('li', { class: i < rang || (i === rang && k === 'resolu') ? 'ok' : i === rang ? 'cur' : '' },
      h('span', { class: 'd' }, i <= rang ? I(i < rang || k === 'resolu' ? 'check' : 'clock') : null), h('div', null, h('b', null, l), h('span', null, dt ? fdh(dt) : '—')))))),
    h('div', { class: 'card' }, h('b', { style: 'display:block;margin-bottom:6px' }, 'Description envoyée'), h('span', { class: 'muted', style: 'white-space:pre-wrap' }, s.description),
      s.nb_photos ? h('div', { class: 'thumbs mt' }, Array.from({ length: s.nb_photos }, (_, k) => { const img = h('img', { alt: 'Photo ' + (k + 1) }); chargerImage('signalement', s.id, k, img); return h('div', { class: 'thumb' }, img); })) : null),
    h('p', { class: 'small mt' }, 'La prise en charge et la suite sont décidées par le bailleur, qui peut répondre dans « Messages ».')],
    pied: peut('message') ? [h('button', { class: 'btn s', onclick: () => { S.msg.signalement = s.id; aller('messages'); } }, I('chat'), 'Écrire au bailleur')] : null };
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
const COUCHES = { doc: coucheDoc, accord: coucheAccord, signaler1: coucheSignaler1, signaler2: coucheSignaler2, envoye: coucheEnvoye, detail: coucheDetail };
charger();
