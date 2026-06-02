import { initPad } from '/sign/pad.js';
import { loadDocument, renderPageInto } from '/sign/viewer.js';
import { stampSignature, paraphePagesFor } from '/sign/stamp.js';
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
        </div>
        <div class="actionbar"><div class="bar-btns">
          <button id="sig-clr" class="ghost">Effacer</button>
          <button id="toConfirm" class="primary">Valider ma signature</button>
        </div></div>
      </section>

      <section id="step-confirm" class="step" hidden>
        <div class="scroll">
          <h1>Confirmer l'envoi</h1>
          <p>Vos paraphes (chaque page) et votre signature vont être apposés sur le document, qui sera renvoyé automatiquement.</p>
          <p id="busy" hidden>Traitement…</p>
        </div>
        <div class="actionbar"><button id="submit" class="primary">Signer et envoyer</button></div>
      </section>

      <section id="step-done" class="step" hidden>
        <div class="state-card"><h1>✓ Document signé</h1><p>Il a été renvoyé automatiquement. Vous pouvez fermer cette page.</p></div>
      </section>
    </div>`));

  const name = app.querySelector('#name'), c1 = app.querySelector('#c1'), c2 = app.querySelector('#c2');
  const email = app.querySelector('#email'), verifyBtn = app.querySelector('#verifyEmail');
  const statusEl = app.querySelector('#email-status');
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
        emailVerified = true; email.readOnly = true;
        email.classList.remove('is-err'); email.classList.add('is-ok');
        verifyBtn.hidden = true;
        setStatus('ok', '✓ Adresse confirmée — c\'est bien vous.');
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

  toRead.onclick = async () => {
    signerName = name.value.trim();
    luApprouve = c1.checked; consentElectronic = c2.checked;
    show('step-read'); await startReading();
  };
  app.querySelector('#sig-clr').onclick = () => signaturePad && signaturePad.clear();
  app.querySelector('#toConfirm').onclick = () => {
    if (!signaturePad || signaturePad.isEmpty()) { alert('Veuillez signer avant de continuer.'); return; }
    show('step-confirm');
  };
  app.querySelector('#submit').onclick = doSubmit;
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
    curPage = 1;
  }
  await renderReadStep();
}

async function renderReadStep() {
  await renderPageInto(pdf, curPage, app.querySelector('#pdf-page'));
  const total = pdf.numPages;
  const needsParaphe = paraphePages.includes(curPage);
  const isLast = curPage >= total;
  const nextLabel = isLast ? 'Terminer la lecture' : 'Page suivante';
  const bar = app.querySelector('#read-bar');
  bar.innerHTML = '';
  bar.appendChild(h(`<div class="progress">Page ${curPage} / ${total}${needsParaphe ? ' · à parapher' : ' · lecture seule'}</div>`));

  if (needsParaphe) {
    bar.appendChild(h(`<div class="pad-wrap small"><canvas id="par-pad" width="320" height="90"></canvas></div>`));
    bar.appendChild(h(`<div class="bar-btns"><button id="par-clr" class="ghost">Effacer</button><button id="par-next" class="primary">${nextLabel}</button></div>`));
    const parPad = initPad(app.querySelector('#par-pad'), { clearBtn: app.querySelector('#par-clr') });
    app.querySelector('#par-next').onclick = () => {
      if (parPad.isEmpty()) { alert('Veuillez parapher cette page avant de continuer.'); return; }
      paraphesByPage[curPage] = parPad.toDataURL();
      advancePage(isLast);
    };
  } else {
    bar.appendChild(h(`<div class="bar-btns"><button id="par-next" class="primary">${nextLabel}</button></div>`));
    app.querySelector('#par-next').onclick = () => advancePage(isLast);
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
    const doc = await PDFLib.PDFDocument.load(master);
    const dateISO = new Date().toISOString();
    const mentionLines = buildMentionLines({ signerName, role: S.role, dateISO });
    await stampSignature(doc, {
      sigId: S.sigId, side: S.side,
      signaturePngDataUrl: signaturePad.toDataURL(),
      paraphesByPage, mentionLines
    }, { rgb: PDFLib.rgb });
    const signed = await doc.save();
    // Dossier de preuve client (acte de volonté + horodatages d'étape, §5 #3) → en-tête X-Sign-Proof.
    const proof = buildProofObject({
      signerName, role: S.role, sigId: S.sigId, dateISO,
      consentElectronic, luApprouve, openedAt, readCompletedAt
    });
    const r = await fetch(`/api/sessions/${SID}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': TOKEN, 'content-type': 'application/pdf', 'X-Sign-Proof': b64urlJson(proof) },
      body: signed
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
