import { initPad } from '/sign/pad.js';
import { loadDocument, renderPageInto } from '/sign/viewer.js';
import { stampSignature, paraphePagesFor, signaturePagesFor } from '/sign/stamp.js';
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
let paraphePages = [];      // pages 1-based à parapher pour ce sigId
let signaturePages = [];    // pages 1-based portant une zone de signature (rappel UX A3)
let curPage = 1;            // page courante en lecture
let signerName = '';
const paraphesByPage = {};  // {page → dataURL} — une image distincte par page paraphée
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
        <div class="scroll"><div id="pdf-page">Chargement du document…</div></div>
        <div class="actionbar" id="read-bar"></div>
      </section>

      <section id="step-sign" class="step" hidden>
        <div class="scroll">
          <h1>Votre signature</h1>
          <p>Tracez votre <strong>signature complète</strong> ci-dessous (distincte de vos paraphes).</p>
          <div class="pad-wrap"><canvas id="sig-pad" width="600" height="200"></canvas></div>
          <label class="chk"><input id="luSign" type="checkbox"> <strong>« Lu et approuvé »</strong> — je reconnais avoir lu l'intégralité du bail et en approuver les termes.</label>
        </div>
        <div class="actionbar">
          <p id="busy" class="busy-line" hidden>Traitement…</p>
          <div class="bar-btns">
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
    luApprouve = c1.checked; consentElectronic = c2.checked;
    show('step-read'); await startReading();
  };
  app.querySelector('#sig-clr').onclick = () => signaturePad && signaturePad.clear();
  // Q4 — écran de signature FUSIONNÉ : un seul bouton « Signer et envoyer » (plus d'écran
  // « Confirmer l'envoi » intermédiaire). On conserve les validations d'avant (signature tracée +
  // « Lu et approuvé » cochée), puis doSubmit directement. Preuve inchangée (openedAt/
  // readCompletedAt fixés en amont ; signedAt dans doSubmit ; en-tête X-Sign-Proof identique).
  app.querySelector('#submit').onclick = () => {
    if (!signaturePad || signaturePad.isEmpty()) { alert('Veuillez tracer votre signature avant de continuer.'); return; }
    if (!app.querySelector('#luSign').checked) { alert('Veuillez cocher « Lu et approuvé » pour confirmer votre signature.'); return; }
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
    paraphePages = paraphePagesFor(probe, { sigId: S.sigId, side: S.side });
    signaturePages = signaturePagesFor(probe, { sigId: S.sigId, side: S.side });
    curPage = 1;
  }
  await renderReadStep();
}

async function renderReadStep() {
  await renderPageInto(pdf, curPage, app.querySelector('#pdf-page'));
  // A2 : à chaque changement de page, on remonte la zone de lecture en haut (sinon on
  // reste scrollé en bas après avoir paraphé la page précédente).
  const sc = app.querySelector('#step-read .scroll');
  if (sc) sc.scrollTop = 0;
  window.scrollTo(0, 0);
  const total = pdf.numPages;
  const needsParaphe = paraphePages.includes(curPage);
  const isLast = curPage >= total;
  const nextLabel = isLast ? 'Terminer la lecture' : 'Page suivante';
  const bar = app.querySelector('#read-bar');
  bar.innerHTML = '';
  bar.appendChild(h(`<div class="progress">Page ${curPage} / ${total}${needsParaphe ? ' · à parapher' : ' · lecture seule'}</div>`));

  // A3 : la page qui porte la zone de signature est atteinte en lecture (avant la fin).
  // On rappelle que la signature se trace à la dernière étape — sans réordonner le PDF (intégrité légale).
  if (!needsParaphe && signaturePages.includes(curPage)) {
    bar.appendChild(h(`<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;font-size:13px;color:#92400e;margin:6px 0">📝 La zone de signature figure sur cette page, mais vous <strong>tracerez votre signature à la dernière étape</strong>, après avoir tout lu. Continuez la lecture.</div>`));
  }

  // Q3 — la zone d'action (pad de paraphe + bouton) est enfermée dans un conteneur RÉVÉLÉ : elle
  // reste cachée tant que la page n'a pas été lue jusqu'en bas ; seul l'indice « ↓ Faites défiler »
  // est visible. À l'arrivée en bas, elle apparaît (fondu + glissé) puis reste ACQUISE (latch) :
  // on ne la re-cache jamais — révéler agrandit la barre, ce qui réduit la zone de lecture et
  // ferait repasser « plus en bas » en boucle si on re-cachait.
  const zone = h(`<div class="sign-reveal is-hidden"></div>`);
  let parPad = null;
  if (needsParaphe) {
    zone.appendChild(h(`<div class="pad-wrap small"><canvas id="par-pad" width="320" height="90"></canvas></div>`));
    zone.appendChild(h(`<div class="bar-btns"><button id="par-clr" class="ghost">Effacer</button><button id="par-next" class="primary" disabled>${nextLabel}</button></div>`));
  } else {
    zone.appendChild(h(`<div class="bar-btns"><button id="par-next" class="primary" disabled>${nextLabel}</button></div>`));
  }
  bar.appendChild(zone);
  if (needsParaphe) parPad = initPad(app.querySelector('#par-pad'), { clearBtn: app.querySelector('#par-clr') });
  app.querySelector('#par-next').onclick = () => {
    if (needsParaphe) {
      if (parPad.isEmpty()) { alert('Veuillez parapher cette page avant de continuer.'); return; }
      paraphesByPage[curPage] = parPad.toDataURL();
    }
    advancePage(isLast);
  };

  // (4) Lecture forcée : la zone reste cachée tant que la page n'a pas été défilée jusqu'en bas
  // (on s'assure que le signataire a vu toute la page avant de parapher/continuer).
  // Révélation : le bouton reste `disabled` tant que la zone est cachée (gate robuste au clavier /
  // lecteur d'écran, pas seulement un clip CSS — P2-1) ; on ne l'active qu'ici, à l'arrivée en bas.
  const revealZone = () => {
    zone.classList.remove('is-hidden'); zone.classList.add('is-in');
    const pn = zone.querySelector('#par-next'); if (pn) pn.disabled = false;
  };
  if (sc) {
    const hint = h(`<div class="scroll-hint" style="font-size:12px;color:#92400e;margin-top:6px;text-align:center">↓ Faites défiler la page jusqu'en bas pour ${needsParaphe ? 'pouvoir parapher' : 'continuer'}.</div>`);
    bar.appendChild(hint);
    const atBottom = () => sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8;
    const reveal = () => { revealZone(); hint.style.display = 'none'; sc.onscroll = null; };  // latch
    const sync = () => { if (atBottom()) reveal(); };
    sc.onscroll = sync;
    sync(); // page courte (pas de défilement requis) → révélée d'emblée
  } else {
    revealZone();   // défensif : pas de zone défilante → zone visible d'emblée
  }
}

function advancePage(isLast) {
  if (isLast) { readCompletedAt = new Date().toISOString(); show('step-sign'); ensureSignaturePad(); return; }
  curPage++;
  renderReadStep();
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
      body: JSON.stringify({ signaturePngDataUrl: signaturePad.toDataURL(), paraphesByPage })
    });
    if (r.status === 403) return fail('Ce n\'est pas (ou plus) votre tour de signer.');
    if (r.status === 410) return fail('Ce document est déjà signé.');
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
