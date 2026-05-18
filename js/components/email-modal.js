/**
 * components/email-modal.js — Modale de proposition d'email (EMAIL-AUTO V1 Phase 2)
 *
 * Pattern V1 "proposition de mail" (pas d'envoi backend) :
 *  - Aperçu sujet + corps éditables
 *  - Liste des pièces jointes recommandées
 *  - 3 boutons :
 *     • Ouvrir dans mon client mail (mailto: si < 1800 chars, sinon fallback)
 *     • Copier sujet + corps (clipboard)
 *     • Partager (Web Share API, mobile uniquement si dispo)
 *
 * Le DOM de la modale est injecté dynamiquement au premier appel — pas besoin
 * de polluer index-test.html avec un overlay statique.
 *
 * API :
 *   openEmailModal(type, context, opts) → ouvre la modale pré-remplie via
 *                                          _emailCompose(type, context).
 *
 * Pattern réutilisé : .ov / .modal / .m-head / .m-body / .m-foot + .btn / .btn.bs / .btn.bp
 * (cf css/main.css `.ov{...}` + `.modal{...}`).
 */

import { showToast } from './toast.js';
import { openM, closeM } from './modal.js';
import { _emailCompose } from '../core/email-compose.js';
import { escHtml } from '../core/utils.js';
// v15.80 EMAIL-SMTP-CONNECT — envoi direct via Gmail API
import { _emailToMimeBase64Url, _emailSendViaGmail } from '../core/email-send.js';

export const MODAL_ID = 'ov-email-compose';

// Limite mailto: pratique (RFC 2368 ne précise pas, mais beaucoup de clients
// coupent à ~2000 chars URL totale). On garde une marge sécurité.
const MAILTO_MAX_LENGTH = 1800;

// ────────────────────────────────────────────────────────────────────────────
// Construction URL mailto:
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construit une URL mailto: avec encodage correct.
 * @param {string} to
 * @param {string} cc
 * @param {string} subject
 * @param {string} body
 * @returns {string}
 */
export function _buildMailtoUrl(to, cc, subject, body) {
  const params = [];
  if (cc) params.push('cc=' + encodeURIComponent(cc));
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body) params.push('body=' + encodeURIComponent(body));
  const qs = params.length ? '?' + params.join('&') : '';
  return 'mailto:' + encodeURIComponent(to || '') + qs;
}

// ────────────────────────────────────────────────────────────────────────────
// DOM injection (idempotent)
// ────────────────────────────────────────────────────────────────────────────

function _ensureModalDom() {
  if (typeof document === 'undefined') return null;
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'ov hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'em-title');
  // v15.82 — onclick="event.stopPropagation()" RETIRÉ du div.modal : il bloquait
  // le bubble des clicks vers document, empêchant la délégation document-level.
  // Le click-outside est géré par la condition `t === modal` dans le listener
  // (target = .ov backdrop uniquement quand on clique le bord, pas le contenu).
  modal.innerHTML = `
    <div class="modal lg">
      <div class="m-head">
        <h3 id="em-title">📧 Proposition de mail</h3>
        <button class="m-close" type="button" data-em-close aria-label="Fermer">✕</button>
      </div>
      <div class="m-body">
        <div class="fg2">
          <div class="fg">
            <label for="em-to">Destinataire</label>
            <input class="inp" type="email" id="em-to" placeholder="locataire@example.com">
          </div>
          <div class="fg">
            <label for="em-cc">CC (optionnel)</label>
            <input class="inp" type="email" id="em-cc" placeholder="copie@example.com">
          </div>
        </div>
        <div class="fg mt8">
          <label for="em-subject">Sujet</label>
          <input class="inp" type="text" id="em-subject">
        </div>
        <div class="fg mt8">
          <label for="em-body">Corps du message</label>
          <textarea class="inp" id="em-body" rows="14" style="font-family:'SF Mono',Consolas,monospace;font-size:13px;line-height:1.5"></textarea>
        </div>
        <div id="em-attachments-section" class="mt12"></div>
        <div id="em-legal-note" class="mt12"></div>
        <div id="em-mailto-warn" class="mt12" style="display:none"></div>
      </div>
      <div class="m-foot">
        <button class="btn bs" type="button" data-em-close>Annuler</button>
        <button class="btn" type="button" data-em-action="share" id="em-share-btn" style="display:none">📱 Partager</button>
        <button class="btn" type="button" data-em-action="copy">📋 Copier sujet + corps</button>
        <button class="btn" type="button" data-em-action="mailto">📧 Ouvrir dans mon client mail</button>
        <button class="btn bp" type="button" data-em-action="sendnow" id="em-sendnow-btn" style="display:none" title="Envoyer directement via votre compte Gmail (nécessite connexion Google)">📤 Envoyer maintenant</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // v15.82 BUG-EMAIL-MODAL-LISTENERS — délégation document-level (résiste aux
  // recréations DOM). Les listeners attachés sur `modal` survivent normalement,
  // mais on a constaté en prod que les clics ne déclenchaient rien — possiblement
  // car une mutation DOM ailleurs détache silencieusement le listener.
  // Solution : 1 seul listener au niveau document, scopé via .closest('#ov-email-compose').
  _ensureEmailModalDelegation();

  return modal;
}

// v15.82 — Délégation document-level (singleton, attaché 1 seule fois)
function _ensureEmailModalDelegation() {
  if (typeof document === 'undefined') return;
  if (typeof document.addEventListener !== 'function') return; // jsdom mock partiel safe
  if (document._emModalDelegationAttached) return;
  document._emModalDelegationAttached = true;

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    // Scope : on agit uniquement si le clic vient de la modale email
    const modal = t.closest('#' + MODAL_ID);
    if (!modal) return;

    // Click-outside (sur le backdrop .ov mais pas .modal lui-même)
    if (t === modal) { closeM(MODAL_ID); return; }

    const closeBtn = t.closest('[data-em-close]');
    if (closeBtn && modal.contains(closeBtn)) { closeM(MODAL_ID); return; }

    const actionBtn = t.closest('[data-em-action]');
    if (actionBtn && modal.contains(actionBtn)) {
      const action = actionBtn.getAttribute('data-em-action');
      const ctx = modal._emailCtx || {};
      if (action === 'mailto') _onMailto(ctx);
      else if (action === 'copy') _onCopy(ctx);
      else if (action === 'share') _onShare(ctx);
      else if (action === 'sendnow') _onSendNow(ctx);
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Pré-remplissage
// ────────────────────────────────────────────────────────────────────────────

function _fillModal(draft, type, opts) {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;

  // Stocker le contexte pour les boutons (lus par les handlers)
  modal._emailCtx = {
    type,
    entityType: opts.entityType || '',
    entityId: opts.entityId || '',
    legalNote: draft.legalNote || '',
    error: draft.error || ''
  };

  // Cas type inconnu → afficher le message d'erreur explicite mais permettre
  // quand même la modale (utilisateur voit l'erreur, peut annuler).
  const to = document.getElementById('em-to');
  const cc = document.getElementById('em-cc');
  const subject = document.getElementById('em-subject');
  const body = document.getElementById('em-body');
  if (to) to.value = draft.to || '';
  if (cc) cc.value = draft.cc || '';
  if (subject) subject.value = draft.subject || '';
  if (body) body.value = draft.body || '';

  // Pièces jointes
  const att = document.getElementById('em-attachments-section');
  if (att) {
    if (draft.attachments && draft.attachments.length) {
      const lis = draft.attachments
        .map(a => `<li style="padding:4px 0">📎 <b>${escHtml(a.name)}</b> <span class="mu sm">(${escHtml(a.type || 'fichier')})</span></li>`)
        .join('');
      att.innerHTML = `
        <div class="mu sm" style="margin-bottom:4px">Pièces jointes recommandées (à générer + joindre manuellement dans votre client mail) :</div>
        <ul style="margin:0;padding-left:20px;list-style:none">${lis}</ul>
      `;
    } else {
      att.innerHTML = '';
    }
  }

  // Note légale
  const ln = document.getElementById('em-legal-note');
  if (ln) {
    ln.innerHTML = draft.legalNote
      ? `<div style="background:rgba(234,88,12,.10);border-left:3px solid var(--ora);padding:8px 12px;border-radius:4px;font-size:12.5px;color:var(--t1)">⚠️ <b>Note légale :</b> ${escHtml(draft.legalNote)}</div>`
      : '';
  }

  // Warning si type inconnu
  const warn = document.getElementById('em-mailto-warn');
  if (warn) {
    if (draft.error === 'TYPE_UNKNOWN') {
      warn.style.display = '';
      warn.innerHTML = `<div style="background:rgba(220,38,38,.10);border-left:3px solid var(--red);padding:8px 12px;border-radius:4px;font-size:12.5px;color:var(--t1)">❌ Type d'email inconnu : <code>${escHtml(type)}</code></div>`;
    } else {
      warn.style.display = 'none';
      warn.innerHTML = '';
    }
  }

  // Bouton share : visible seulement si Web Share API dispo (mobile principalement)
  const shareBtn = document.getElementById('em-share-btn');
  if (shareBtn) {
    const hasShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    shareBtn.style.display = hasShare ? '' : 'none';
  }

  // v15.80 EMAIL-SMTP-CONNECT — bouton "Envoyer maintenant" visible si OAuth Gmail OK.
  // Détection : window._driveTokenValid() retourne true → token Drive actif (inclut le
  // scope gmail.send après mise à jour OAuth consent v15.80). Si l'envoi échoue 403
  // (scope insuffisant), on guidera l'user vers la reconnexion.
  const sendBtn = document.getElementById('em-sendnow-btn');
  if (sendBtn) {
    const hasGmail = typeof window !== 'undefined'
      && typeof window._driveTokenValid === 'function'
      && window._driveTokenValid();
    sendBtn.style.display = hasGmail ? '' : 'none';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Actions des boutons
// ────────────────────────────────────────────────────────────────────────────

function _readModalValues() {
  return {
    to: (document.getElementById('em-to') || {}).value || '',
    cc: (document.getElementById('em-cc') || {}).value || '',
    subject: (document.getElementById('em-subject') || {}).value || '',
    body: (document.getElementById('em-body') || {}).value || ''
  };
}

function _onMailto(ctx) {
  const v = _readModalValues();
  const url = _buildMailtoUrl(v.to, v.cc, v.subject, v.body);

  if (url.length > MAILTO_MAX_LENGTH) {
    showToast('Mail trop long pour mailto: — utilise « Copier sujet + corps » à la place', 'warn', 6000);
    return;
  }

  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
  showToast('Client mail ouvert ✉️', 'ok', 2000);
  closeM(MODAL_ID);

  // Hook log d'envoi (Phase 3 — sera actif après commit Phase 3)
  if (typeof window !== 'undefined' && typeof window._logEmailSent === 'function') {
    window._logEmailSent(ctx.entityType, ctx.entityId, {
      type: ctx.type, to: v.to, cc: v.cc, subject: v.subject, status: 'mailto'
    });
  }
}

function _onCopy(ctx) {
  const v = _readModalValues();
  const text = v.subject + '\n\n' + v.body;

  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    showToast('Presse-papier non disponible — sélectionne + copie manuellement', 'err', 4000);
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('Sujet + corps copiés 📋', 'ok', 2000);
    closeM(MODAL_ID);
    if (typeof window !== 'undefined' && typeof window._logEmailSent === 'function') {
      window._logEmailSent(ctx.entityType, ctx.entityId, {
        type: ctx.type, to: v.to, cc: v.cc, subject: v.subject, status: 'copied'
      });
    }
  }).catch((err) => {
    showToast('Erreur copie : ' + (err && err.message ? err.message : 'inconnue'), 'err');
  });
}

/**
 * v15.80 EMAIL-SMTP-CONNECT — envoie l'email directement via Gmail API.
 * Pré-requis : token OAuth Drive avec scope gmail.send (cf index.html DRIVE_SCOPE).
 * Si erreur 403 (scope manquant) → guide l'user vers reconnexion.
 */
function _onSendNow(ctx) {
  const v = _readModalValues();
  if (!v.to) { showToast('Destinataire vide', 'err'); return; }

  // Récupère le token Drive (existe car bouton conditionnellement affiché)
  const token = (typeof window !== 'undefined') ? window._driveToken : null;
  if (!token) {
    showToast('Connexion Google requise — cliquez sur ☁ Drive dans la sidebar', 'err', 5000);
    return;
  }

  // Lock UI : disable boutons pendant l'envoi
  const sendBtn = document.getElementById('em-sendnow-btn');
  const allBtns = document.querySelectorAll('#' + MODAL_ID + ' .m-foot .btn');
  allBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });
  if (sendBtn) sendBtn.textContent = '📤 Envoi en cours…';

  let mime;
  try {
    mime = _emailToMimeBase64Url({ to: v.to, cc: v.cc, subject: v.subject, body: v.body });
  } catch (e) {
    showToast('Erreur de construction du message : ' + (e.message || e), 'err');
    allBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
    if (sendBtn) sendBtn.textContent = '📤 Envoyer maintenant';
    return;
  }

  _emailSendViaGmail(token, mime)
    .then(result => {
      showToast('Email envoyé ✓ depuis votre Gmail', 'ok', 3000);
      closeM(MODAL_ID);
      // Log avec status='sent' + externalId pour traçabilité (RGPD : métadonnées seules)
      if (typeof window !== 'undefined' && typeof window._logEmailSent === 'function') {
        window._logEmailSent(ctx.entityType, ctx.entityId, {
          type: ctx.type, to: v.to, cc: v.cc, subject: v.subject,
          status: 'sent', externalId: result && result.id ? result.id : '',
          sendChannel: 'gmail-api',
        });
      }
    })
    .catch(err => {
      const status = err && err.status;
      let msg = err && err.message ? err.message : String(err);
      if (status === 403) {
        msg = 'Permission insuffisante (scope gmail.send manquant). Reconnecte Drive pour autoriser l\'envoi d\'emails.';
      } else if (status === 401) {
        msg = 'Token expiré. Reconnecte Drive et réessaie.';
      } else if (status === 429 || status === 503) {
        msg = 'Quota Gmail dépassé temporairement. Réessaie dans quelques minutes ou utilise « Ouvrir client mail ».';
      }
      showToast(msg, 'err', 6000);
      allBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
      if (sendBtn) sendBtn.textContent = '📤 Envoyer maintenant';
    });
}

function _onShare(ctx) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    showToast('Partage non disponible sur ce navigateur', 'err');
    return;
  }
  const v = _readModalValues();
  navigator.share({
    title: v.subject,
    text: v.subject + '\n\n' + v.body
  }).then(() => {
    showToast('Partagé ✓', 'ok');
    closeM(MODAL_ID);
    if (typeof window !== 'undefined' && typeof window._logEmailSent === 'function') {
      window._logEmailSent(ctx.entityType, ctx.entityId, {
        type: ctx.type, to: v.to, cc: v.cc, subject: v.subject, status: 'shared'
      });
    }
  }).catch(() => {
    // Annulation user = silent
  });
}

// ────────────────────────────────────────────────────────────────────────────
// API publique
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ouvre la modale de proposition d'email pré-remplie depuis _emailCompose.
 *
 * @param {string} type - Type d'email (cf _emailTypesSupportes)
 * @param {object} context - Contexte (bail, locataire, entite, etc.)
 * @param {object} [opts]
 * @param {string} [opts.entityType] - Pour logger (Phase 3) : 'logement'|'bail'|'quittance'
 * @param {string} [opts.entityId] - Référence (log.ref, bail.ref, quittance.id)
 */
export function openEmailModal(type, context, opts = {}) {
  const draft = _emailCompose(type, context || {});
  _ensureModalDom();
  _fillModal(draft, type, opts || {});
  openM(MODAL_ID);
}
