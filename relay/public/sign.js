import { initPad } from '/sign/pad.js';
import { loadDocument, renderPageInto } from '/sign/viewer.js';
import { readingPlanFor } from '/sign/stamp.js?v=6';   // versionné : readingPlanFor n'existe pas dans un stamp.js en cache
import { buildMentionLines, buildProofObject } from '/sign/proof.js';

const S = window.__SIGN__ || {};
const TOKEN = window.__SIGN_TOKEN__;
const SID = window.__SESSION_ID__;
const app = document.getElementById('app');

// Échappe toute donnée de session (bailRef, role…) avant interpolation dans innerHTML — anti DOM-XSS.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
// Encode un objet en base64url(JSON UTF-8) — symétrique du décodage relais (X-Sign-Proof).
const b64urlJson = (obj) => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function show(id) { for (const s of app.querySelectorAll('.step')) s.hidden = s.id !== id; window.scrollTo(0, 0); }
function fail(msg) { app.innerHTML = ''; app.appendChild(h(`<div class="state-card"><h1>${msg}</h1></div>`)); }

let master;                 // Uint8Array intacts (jamais passés à PDF.js)
let pdf;                    // doc PDF.js (lecture)
let signerName = '';
const paraphesByPage = {};  // {page → dataURL} — le paraphe apposé sur chaque page (clic par page)
let signaturePad = null;    // pad de la signature finale (distinct des paraphes)
let emailVerified = false;          // confirmation anti-transfert (§5 #2), autorité serveur
let consentElectronic = false;      // case « procédé électronique » (acte de volonté)
let luApprouve = false;             // case « je reconnais signer ce bail »
let readCompletedAt = null;         // fin de lecture (§5 #3)
const openedAt = new Date().toISOString();  // ouverture du lien (§5 #3)

function buildUI() {
  app.innerHTML = '';
  app.appendChild(h(`
    <div class="wrap">
      <header class="sign-head"><strong>Signature du bail ${S.bailRef ? '· ' + esc(S.bailRef) : ''}</strong>
        <span class="rank">Signataire ${S.rank}/${S.total}</span></header>

      <section id="step-consent" class="step">
        <div class="scroll">
          <h1>Avant de signer</h1>
          <label>Vos nom et prénom<br><input id="name" type="text" autocomplete="name" placeholder="Jean Dupont"></label>
          <label for="email">Confirmez votre adresse email</label>
          <div class="email-row">
            <input id="email" type="email" autocomplete="email" placeholder="vous@exemple.fr">
            <button id="verifyEmail" type="button" class="ghost" hidden>Confirmer</button>
          </div>
          <p class="hint">🔒 L'adresse à laquelle ce bail vous a été envoyé. Permet de garantir que c'est bien vous qui signez (lien non transférable).</p>
          <p id="email-status" class="email-status" hidden></p>
          <div id="otp-row" class="email-row" hidden style="margin-top:8px">
            <input id="otp-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Code à 6 chiffres">
            <button id="verifyOtp" type="button" class="ghost">Valider le code</button>
          </div>
          <p id="otp-hint" class="hint" hidden></p>
          <label class="chk"><input id="c1" type="checkbox"> Je reconnais signer ce bail (${esc(S.role)}).</label>
          <label class="chk"><input id="c2" type="checkbox"> Je consens à signer par procédé électronique.</label>
        </div>
        <div class="actionbar"><button id="toRead" class="primary" disabled>Lire et parapher</button></div>
      </section>

      <section id="step-read" class="step" hidden>
        <div class="read-prog" id="read-prog" aria-live="polite"></div>
        <div class="scroll" id="read-scroll"><div id="pdf-doc" class="pdf-doc">Chargement du document…</div></div>
        <div class="actionbar" id="read-bar"></div>
      </section>

      <section id="step-sign" class="step" hidden>
        <div class="scroll">
          <h1>Votre signature</h1>
          <p id="sig-recap" class="recap" hidden></p>
          <p>Tracez votre <strong>signature complète</strong> ci-dessous (distincte de vos paraphes).</p>
          <div class="pad-wrap"><canvas id="sig-pad" width="600" height="200"></canvas></div>
          <label class="chk"><input id="luSign" type="checkbox"> <strong>« Lu et approuvé »</strong> — je reconnais avoir lu l'intégralité du bail et en approuver les termes.</label>
        </div>
        <div class="actionbar">
          <p id="busy" class="busy-line" hidden>Traitement…</p>
          <div class="bar-btns">
            <button id="sig-back" class="ghost">‹ Revoir le bail</button>
            <button id="sig-clr" class="ghost">Effacer</button>
            <button id="submit" class="primary">Signer et envoyer</button>
          </div>
        </div>
      </section>

      <section id="step-done" class="step" hidden>
        <div class="state-card"><h1>✓ Document signé</h1><p>Il a été renvoyé automatiquement. Vous pouvez fermer cette page.</p></div>
      </section>
    </div>`));

  const name = app.querySelector('#name'), c1 = app.querySelector('#c1'), c2 = app.querySelector('#c2');
  const email = app.querySelector('#email'), verifyBtn = app.querySelector('#verifyEmail');
  const statusEl = app.querySelector('#email-status');
  const otpRow = app.querySelector('#otp-row'), otpCode = app.querySelector('#otp-code');
  const verifyOtpBtn = app.querySelector('#verifyOtp'), otpHint = app.querySelector('#otp-hint');
  const toRead = app.querySelector('#toRead');
  const gate = () => { toRead.disabled = !(name.value.trim() && emailVerified && c1.checked && c2.checked); };
  [name, c1, c2].forEach((el) => el.addEventListener('input', gate));

  // Vérification email anti-transfert (§5 #2). Affichage du résultat via textContent (jamais innerHTML).
  const emailLooksValid = (v) => /.+@.+\..+/.test(v.trim());
  const setStatus = (kind, msg) => {
    statusEl.hidden = !msg;
    statusEl.className = 'email-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = msg || '';
  };
  email.addEventListener('input', () => {
    if (emailVerified) { emailVerified = false; email.readOnly = false; email.classList.remove('is-ok'); }
    email.classList.remove('is-err');
    verifyBtn.hidden = !emailLooksValid(email.value);
    if (!emailLooksValid(email.value)) setStatus(null, '');
    gate();
  });
  verifyBtn.onclick = async () => {
    const value = email.value.trim();
    if (!emailLooksValid(value)) return;
    setStatus('busy', 'Vérification…'); verifyBtn.disabled = true;
    try {
      const r = await fetch(`/api/sessions/${SID}/verify-email`, {
        method: 'POST', headers: { 'X-Sign-Token': TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ email: value })
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) {
        // Email connu → un code OTP a été envoyé. L'identité n'est confirmée qu'après sa saisie (verify-otp).
        email.readOnly = true; email.classList.remove('is-err');
        verifyBtn.hidden = true;
        otpRow.hidden = false; otpCode.focus();
        setStatus('ok', '📨 Un code à 6 chiffres vous a été envoyé par email. Saisissez-le ci-dessous.');
        otpHint.hidden = !data.devCode;
        if (data.devCode) otpHint.textContent = '🧪 Mode test : votre code est ' + data.devCode;
      } else {
        emailVerified = false;
        email.classList.remove('is-ok'); email.classList.add('is-err');
        setStatus('err', '✗ Cette adresse ne correspond pas à celle à laquelle le bail a été envoyé. Vérifiez votre saisie, ou contactez l\'expéditeur si le lien ne vous était pas destiné.');
      }
    } catch {
      setStatus('err', 'Vérification impossible. Vérifiez votre connexion et réessayez.');
    } finally {
      verifyBtn.disabled = false; gate();
    }
  };

  // Vérification du code OTP (contrôle de la boîte). Succès → emailVerified (porte d'accès à la lecture).
  verifyOtpBtn.onclick = async () => {
    const code = otpCode.value.trim();
    if (!/^[0-9]{6}$/.test(code)) { otpHint.hidden = false; otpHint.textContent = 'Entrez les 6 chiffres du code.'; return; }
    verifyOtpBtn.disabled = true;
    try {
      const r = await fetch(`/api/sessions/${SID}/verify-otp`, {
        method: 'POST', headers: { 'X-Sign-Token': TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await r.json().catch(() => ({}));
      if (data.verified) {
        emailVerified = true;
        otpRow.hidden = true; otpHint.hidden = true;
        email.classList.add('is-ok');
        setStatus('ok', '✓ Identité vérifiée — c\'est bien vous.');
      } else if (data.reason === 'expired-or-locked') {
        otpHint.hidden = false; otpHint.textContent = 'Code expiré ou trop de tentatives. Cliquez « Confirmer » pour recevoir un nouveau code.';
        otpRow.hidden = true; verifyBtn.hidden = false; email.readOnly = false;
      } else {
        otpHint.hidden = false; otpHint.textContent = 'Code incorrect, réessayez.';
      }
    } catch {
      otpHint.hidden = false; otpHint.textContent = 'Vérification impossible. Réessayez.';
    } finally {
      verifyOtpBtn.disabled = false; gate();
    }
  };

  toRead.onclick = async () => {
    signerName = name.value.trim();
    // c1 (« je reconnais signer ») = garde-fou d'accès. Le « Lu et approuvé » consigné dans la preuve
    // est la case #luSign de l'écran signature (fixée au submit, P2-3), pas cette case-ci.
    consentElectronic = c2.checked;
    show('step-read'); await startReading();
  };
  app.querySelector('#sig-clr').onclick = () => signaturePad && signaturePad.clear();
  app.querySelector('#sig-back').onclick = () => show('step-read');   // paraphes et position conservés
  // Q4 — écran de signature FUSIONNÉ : un seul bouton « Signer et envoyer » (plus d'écran
  // « Confirmer l'envoi » intermédiaire). On conserve les validations d'avant (signature tracée +
  // « Lu et approuvé » cochée), puis doSubmit directement. Preuve inchangée (openedAt/
  // readCompletedAt fixés en amont ; signedAt dans doSubmit ; en-tête X-Sign-Proof identique).
  app.querySelector('#submit').onclick = () => {
    if (!signaturePad || signaturePad.isEmpty()) { alert('Veuillez tracer votre signature avant de continuer.'); return; }
    if (!app.querySelector('#luSign').checked) { alert('Veuillez cocher « Lu et approuvé » pour confirmer votre signature.'); return; }
    // P2-3 — la preuve consigne le « Lu et approuvé » RÉEL (case #luSign de cet écran).
    luApprouve = app.querySelector('#luSign').checked;
    doSubmit();
  };
}

async function startReading() {
  if (!master) {
    const r = await fetch(`/api/sessions/${SID}/pdf`, { headers: { 'X-Sign-Token': TOKEN } });
    if (r.status === 403) return fail('Ce n\'est pas (ou plus) votre tour de signer.');
    if (r.status === 410) return fail('Ce document est déjà signé.');
    if (!r.ok) return fail('Impossible de charger le document. Réessayez plus tard.');
    master = new Uint8Array(await r.arrayBuffer());
    pdf = await loadDocument(master.slice()); // copie : PDF.js détache le buffer
    const probe = await PDFLib.PDFDocument.load(master); // master intact pour le tamponnage final
    plan = readingPlanFor(probe, { sigId: S.sigId, side: S.side });
    // Aucune case (ni paraphe ni signature) pour CE signataire = document incohérent : on s'arrête
    // plutôt que de laisser « signer » un PDF qui ne porterait aucune trace de lui.
    if (!plan.paraphes.length && !plan.signatures.length) {
      master = null;
      return fail('Ce document ne prévoit aucune case de signature pour vous. Contactez l\'expéditeur du bail.');
    }
    await buildDoc();
  }
  updateReadUI();
}

// ── Document DÉFILANT (29/09, validé Didier) ─────────────────────────────────────────────────
// Tout le document défile ; chaque page du bail porte un bouton « Parapher » posé EXACTEMENT sur sa
// case (ancre du manifeste). Le paraphe est tracé UNE fois, puis apposé d'un clic, page par page, avec
// l'heure (preuve de lecture). Les annexes (au-delà de la dernière page du bail) sont repliées :
// consultables, jamais à parapher. Base légale vérifiée : C. civ. art. 1366 / 1367 — aucun texte
// n'impose la lecture page par page ; l'intégrité reste garantie par l'empreinte du PDF.
let plan = null;                  // readingPlanFor : { paraphes, signatures, lastBailPage, pageCount }
let parapheImg = null;            // dataURL du paraphe tracé une fois
const parapheTimes = {};          // { page → ISO } : heure de chaque paraphe
const slots = {};                 // page → élément .pg (emplacement de page)
let annexOpen = false;
let io = null;

const hhmm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const nextToParaphe = () => { const a = plan.paraphes.find((p) => !paraphesByPage[p.page]); return a ? a.page : 0; };
const pct = (v) => (v * 100).toFixed(3) + '%';

async function buildDoc() {
  const doc = app.querySelector('#pdf-doc');
  const frag = document.createDocumentFragment();   // le message « Chargement… » reste affiché jusqu'au bout
  const total = pdf.numPages;
  const last = Math.min(plan.lastBailPage || total, total);
  // Taille de chaque page (sans rendu) : l'emplacement a la bonne proportion avant d'être dessiné.
  // Proportion par `--ar` + padding (et non aspect-ratio, absent de Safari iOS 14).
  for (let i = 1; i <= total; i++) {
    const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
    const pg = h(`<section class="pg" id="pg-${i}" data-page="${i}" style="--ar:${(vp.height / vp.width).toFixed(5)}"><div class="pg-canvas"></div><span class="pg-no">Page ${i} / ${total}</span></section>`);
    if (i > last) { pg.classList.add('pg-annex'); pg.hidden = true; }
    slots[i] = pg;
    frag.appendChild(pg);
    if (i === last && last < total) frag.appendChild(await annexBlock(last, total));
  }
  doc.innerHTML = '';
  doc.appendChild(frag);
  // Cases de paraphe et rappel de la zone de signature, posés sur les pages.
  for (const a of plan.paraphes) {
    // Case agrandie à ≥ 44 px (cible tactile) et gardée DANS la page : sur téléphone, la case du PDF
    // (en bas de page, ~24 px) ferait déborder le bouton hors de la page, où il serait coupé.
    const W = `max(${pct(a.width)}, 124px)`, H = `max(${pct(a.height)}, 46px)`;
    const slot = h(`<div class="par-slot" style="width:${W};height:${H};left:min(${pct(a.left)}, calc(100% - ${W}));top:min(${pct(a.top)}, calc(100% - ${H} - 4px))"></div>`);
    slot.dataset.page = a.page;
    slots[a.page] && slots[a.page].appendChild(slot);
    renderParSlot(a.page);
  }
  for (const a of plan.signatures) {
    if (!slots[a.page]) continue;
    slots[a.page].appendChild(h(`<div class="sig-slot" style="left:${pct(a.left)};top:${pct(a.top)};width:${pct(a.width)};height:${pct(a.height)}"><span>Votre signature : à la dernière étape</span></div>`));
  }
  // Rendu PARESSEUX (un bail + 75 pages d'annexes ne tiennent pas en mémoire sur un téléphone) :
  // on dessine les pages proches de l'écran et on LIBÈRE celles qui s'en éloignent (canvas remis à
  // 0 × 0 : Safari iOS ne rend la mémoire d'un canvas qu'à ce prix). 2 rendus à la fois au plus ;
  // un rendu qui se termine pour une page déjà sortie est jeté.
  const root = app.querySelector('#read-scroll');
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const n = +e.target.dataset.page;
      if (e.isIntersecting) { visible.add(n); queueDraw(n); }
      else { visible.delete(n); releasePage(n); }
    }
  }, { root, rootMargin: '1200px 0px' });
  Object.values(slots).forEach((s) => io.observe(s));
}

const visible = new Set();        // pages dans la zone de rendu
const drawn = new Set();          // pages dont le canvas est affiché
const queue = [];
let drawing = 0;
const MAX_DRAW = 2;
function releaseCanvas(c) { if (c) { c.width = 0; c.height = 0; c.remove(); } }
function releasePage(n) {
  const holder = slots[n] && slots[n].querySelector('.pg-canvas');
  if (holder) releaseCanvas(holder.querySelector('canvas'));
  drawn.delete(n);
}
function queueDraw(n) {
  if (drawn.has(n) || queue.includes(n)) return;
  queue.push(n);
  pump();
}
function pump() {
  while (drawing < MAX_DRAW && queue.length) {
    const n = queue.shift();
    if (!visible.has(n) || drawn.has(n)) continue;
    drawing++;
    drawPage(n).finally(() => { drawing--; pump(); });
  }
}
async function drawPage(n) {
  const holder = slots[n] && slots[n].querySelector('.pg-canvas');
  if (!holder) return;
  let canvas = null;
  try {
    const page = await pdf.getPage(n);
    const w = holder.clientWidth || 600;
    const scale = (w / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2);
    const tmp = document.createElement('div');
    canvas = await renderPageInto(pdf, n, tmp, { scale });
    page.cleanup();
  } catch (e) {
    holder.innerHTML = '<p class="pg-err">Affichage de la page impossible. Faites défiler pour réessayer, ou téléchargez le document.</p>';
    return;
  }
  if (!visible.has(n) || drawn.has(n) || !holder.isConnected) { releaseCanvas(canvas); return; }
  holder.querySelectorAll('.pg-err').forEach((x) => x.remove());
  holder.appendChild(canvas);
  drawn.add(n);
}

async function annexBlock(last, total) {
  const n = total - last;
  // Sommaire des fichiers : lu sur la page de garde des annexes (« 1. fichier — pages X à Y »).
  let items = [];
  try {
    const tc = await (await pdf.getPage(last + 1)).getTextContent();
    items = tc.items.map((it) => it.str.trim()).filter((s) => /^\d+\.\s.+\s—\spages\s\d+\sà\s\d+$/.test(s));
  } catch { items = []; }
  const list = items.length ? `<ol>${items.map((s) => `<li>${esc(s.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>` : '';
  const block = h(`<div class="ann" id="annexes">
      <h2>Annexes au bail</h2>
      <p class="ann-sub">Pages ${last + 1} à ${total} (${n} page${n > 1 ? 's' : ''}) · consultation libre, aucun paraphe demandé</p>
      ${list}
      <div class="ann-btns"><button type="button" class="line" id="ann-toggle">Afficher les annexes</button>
        <button type="button" class="line" id="ann-dl">Télécharger le document complet (PDF)</button></div>
      ${items.length ? '<p class="ann-legal">Sommaire indicatif, repris de la page de garde des annexes.</p>' : ''}
      <p class="ann-legal">Ces pièces font partie du document que vous signez : vous en recevez un exemplaire avec le bail.</p>
    </div>`);
  // Copie du PDF créée AU CLIC puis libérée (pas 20 Mo gardés en mémoire dès l'ouverture).
  block.querySelector('#ann-dl').onclick = () => {
    const url = URL.createObjectURL(new Blob([master], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `bail-${String(S.bailRef || 'document').replace(/[^\w.-]+/g, '_')}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  block.querySelector('#ann-toggle').onclick = () => {
    annexOpen = !annexOpen;
    for (let i = last + 1; i <= total; i++) slots[i].hidden = !annexOpen;
    block.querySelector('#ann-toggle').textContent = annexOpen ? 'Replier les annexes' : 'Afficher les annexes';
  };
  return block;
}

function renderParSlot(page) {
  const slot = slots[page] && slots[page].querySelector('.par-slot');
  if (!slot) return;
  slot.innerHTML = '';
  if (paraphesByPage[page]) {
    slot.className = 'par-slot is-done';
    slot.appendChild(h(`<div class="par-done"><img alt="Paraphe" src="${paraphesByPage[page]}"><small>Paraphé · ${hhmm(parapheTimes[page])}</small></div>`));
  } else {
    slot.className = 'par-slot' + (nextToParaphe() === page ? ' is-next' : '');
    const b = h(`<button type="button" class="par-btn" aria-label="Parapher la page ${page}">Parapher</button>`);
    b.onclick = () => paraphePage(page);
    slot.appendChild(b);
  }
}

function paraphePage(page) {
  if (!parapheImg) { openParapheSheet(page); return; }
  paraphesByPage[page] = parapheImg;
  parapheTimes[page] = new Date().toISOString();
  const prevNext = page;
  renderParSlot(prevNext);
  const nx = nextToParaphe(); if (nx) renderParSlot(nx);
  updateReadUI();
}

// Paraphe tracé UNE fois — dialogue (≥ 600 px) ou page pleine (téléphone).
function openParapheSheet(page) {
  const sheet = h(`<div class="par-sheet" role="dialog" aria-modal="true" aria-labelledby="par-title">
      <div class="par-card">
        <div class="par-head"><button type="button" class="ghost par-back">‹ Retour</button><h2 id="par-title">Votre paraphe</h2><button type="button" class="ghost par-x">Fermer</button></div>
        <div class="par-body">
          <p>Tracez vos <strong>initiales une seule fois</strong>. Ensuite, un clic sur « Parapher » les appose sur chaque page, page par page, avec l'heure.</p>
          <div class="pad-wrap"><canvas id="par-pad" width="600" height="220"></canvas></div>
          <p class="hint">Votre paraphe n'est jamais apposé sans votre clic sur la page concernée.</p>
        </div>
        <div class="par-foot"><button type="button" class="ghost" id="par-clr">Effacer</button><button type="button" class="primary" id="par-ok">Valider et parapher la page ${page}</button></div>
      </div></div>`);
  if (document.querySelector('.par-sheet')) return;   // pas de double feuille (double clic)
  const opener = document.activeElement;
  document.body.appendChild(sheet);
  const pad = initPad(sheet.querySelector('#par-pad'), { clearBtn: sheet.querySelector('#par-clr') });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', onKey); sheet.remove(); if (opener && opener.isConnected) opener.focus(); };
  document.addEventListener('keydown', onKey);
  sheet.querySelector('.par-back').onclick = close;
  sheet.querySelector('.par-x').onclick = close;
  sheet.querySelector('#par-ok').onclick = () => {
    if (pad.isEmpty()) { alert('Tracez votre paraphe avant de valider.'); return; }
    parapheImg = pad.toDataURL();
    close();
    paraphePage(page);
  };
  sheet.querySelector('#par-ok').focus();
}

function goToPage(page) {
  const sc = app.querySelector('#read-scroll'), el = slots[page];
  if (!sc || !el) return;
  const slot = el.querySelector('.par-slot');
  const target = slot || el;
  const top = target.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - sc.clientHeight / 2;
  sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// Barre de progression (haut) + barre d'action (bas).
function updateReadUI() {
  const tot = plan.paraphes.length, done = plan.paraphes.filter((a) => paraphesByPage[a.page]).length;
  const nx = nextToParaphe();
  const prog = app.querySelector('#read-prog');
  prog.innerHTML = '';
  if (tot) {
    prog.appendChild(h(`<div class="rp"><span class="rp-lbl" aria-live="polite">Paraphes ${done} / ${tot}</span><div class="rp-track"><div class="rp-fill${done === tot ? ' is-done' : ''}" style="width:${Math.round(done / tot * 100)}%"></div></div>${nx ? `<button type="button" class="rp-next">Page à parapher ↓</button>` : `<span class="rp-ok">✓ Bail paraphé</span>`}</div>`));
    const rn = prog.querySelector('.rp-next'); if (rn) rn.onclick = () => goToPage(nx);
  }
  const bar = app.querySelector('#read-bar');
  bar.innerHTML = '';
  if (nx) {
    bar.appendChild(h(`<div class="progress">${done} / ${tot} pages paraphées · le bouton « Parapher » est sur chaque page</div>`));
    const b = h(`<button class="primary">Aller à la page ${nx} à parapher ↓</button>`);
    b.onclick = () => goToPage(nx);
    bar.appendChild(b);
  } else {
    bar.appendChild(h(`<div class="progress">${tot ? `Les ${tot} pages du bail sont paraphées` : 'Lecture du document'}${plan.lastBailPage < plan.pageCount ? ' · les annexes restent consultables' : ''}</div>`));
    const b = h(`<button class="primary is-ok">Continuer vers la signature</button>`);
    b.onclick = () => {
      readCompletedAt = new Date().toISOString();
      const rc = app.querySelector('#sig-recap');
      if (rc) { rc.hidden = !tot; rc.textContent = `✓ ${tot} page${tot > 1 ? 's' : ''} du bail paraphée${tot > 1 ? 's' : ''}.`; }
      show('step-sign'); ensureSignaturePad();
    };
    bar.appendChild(b);
  }
}

function ensureSignaturePad() {
  if (!signaturePad) signaturePad = initPad(app.querySelector('#sig-pad'), { clearBtn: app.querySelector('#sig-clr') });
}

async function doSubmit() {
  const busy = app.querySelector('#busy'); const btn = app.querySelector('#submit');
  busy.hidden = false; btn.disabled = true;
  try {
    const dateISO = new Date().toISOString();
    // P0-1 : le tamponnage se fait CÔTÉ SERVEUR depuis l'original stocké. On n'envoie QUE l'image
    // de signature (+ paraphes par page) — jamais les octets du document (anti-substitution).
    const proof = buildProofObject({
      signerName, role: S.role, sigId: S.sigId, dateISO,
      consentElectronic, luApprouve, openedAt, readCompletedAt
    });
    const r = await fetch(`/api/sessions/${SID}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': TOKEN, 'content-type': 'application/json', 'X-Sign-Proof': b64urlJson(proof) },
      body: JSON.stringify({ signaturePngDataUrl: signaturePad.toDataURL(), paraphesByPage, parapheTimes })
    });
    if (r.status === 403) return fail('Ce n\'est pas (ou plus) votre tour de signer.');
    if (r.status === 410) return fail('Ce document est déjà signé.');
    if (r.status === 422) return fail('Signature impossible : ce document ne prévoit aucune case de signature pour vous. Contactez l\'expéditeur du bail.');
    if (!r.ok) throw new Error('http ' + r.status);
    show('step-done');
  } catch (e) {
    console.error(e);
    busy.hidden = true; btn.disabled = false;
    alert('Échec de l\'envoi. Vérifiez votre connexion et réessayez.');
  }
}

if (!TOKEN || !SID) fail('Lien invalide.');
else { buildUI(); show('step-consent'); }
