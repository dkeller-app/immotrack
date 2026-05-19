/**
 * core/email-pdf-attachment.js — EMAIL-MODAL-UX-REFONTE EM-2b/c v15.87→v15.89
 *
 * Génère un PDF base64 prêt à attacher au MIME multipart pour `_emailToMimeBase64Url`.
 * Approche V1 : jsPDF natif text-based (rapide, fiable, pas de dépendance html2canvas
 * pour rendre HTML existant — celui-ci est éclaté dans `previewQuit` / `genIRLLetter` etc.
 * et serait long à factoriser). Le PDF généré est minimaliste mais contient toutes les
 * infos clés du template d'email associé.
 *
 * Une refonte V1.2 pourra utiliser html2canvas sur le rendu officiel (aperçu) si l'user
 * juge le PDF text-based insuffisant esthétiquement.
 *
 * API :
 *   _emailGenPdfAttachment(type, ctx) → Promise<{filename, base64, mimeType} | {error}>
 *
 * Types supportés (v15.89) :
 *   - quittance, irl-revision (EM-2b v15.87)
 *   - decompte-regul-annuel, bail-signe-final, edl-entree-signe, edl-sortie-signe,
 *     cautionnement-signe (EM-2c v15.89)
 *
 * Reste reporté V1.2 : autres types EMAIL-AUTO (avis-echeance, rappels impayés,
 * bail-pret-a-signer, bail-avenant, dg-recu, dg-restitution-*, attestation-logement-libere,
 * solde-tout-compte, etc.) — la plupart sont des courriers sans PDF à joindre.
 */

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convertit un Blob en base64 (string, sans le préfixe data:...).
 * Cross-env :
 *  - Browser (FileReader dispo) → FileReader.readAsDataURL
 *  - Node / Vitest (FileReader absent) → blob.arrayBuffer() + Buffer.toString('base64')
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function _blobToBase64(blob) {
  if (!blob) return Promise.reject(new Error('blob required'));

  // Path Node / Vitest : Buffer dispo + Blob a .arrayBuffer()
  if (typeof FileReader === 'undefined' && typeof Buffer !== 'undefined' && typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then(ab => Buffer.from(ab).toString('base64'));
  }

  // Path Browser : FileReader
  if (typeof FileReader === 'undefined') return Promise.reject(new Error('FileReader not available'));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      // result = "data:application/pdf;base64,JVBE..."
      const idx = String(result).indexOf('base64,');
      resolve(idx >= 0 ? String(result).slice(idx + 7) : String(result));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Récupère la classe jsPDF (inlined dans index.html via window.jspdf).
 * @returns {Function|null}
 */
function _getJsPdfClass() {
  if (typeof window === 'undefined') return null;
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (typeof window.jsPDF === 'function') return window.jsPDF;
  return null;
}

/**
 * v15.91 EM-2d — Charge html2canvas si pas déjà disponible globalement.
 * Même pattern que _ensureJsPdfLoaded — décode window._BAIL_PDF_LIBS.html2canvas
 * (inliné en base64) → Blob URL → <script src=blob:>. Idempotent.
 *
 * @returns {Promise<boolean>} true si window.html2canvas disponible après l'appel
 */
function _ensureHtml2CanvasLoaded() {
  if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') return Promise.resolve(true);
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (typeof document.createElement !== 'function') return Promise.resolve(false);
  if (!window._BAIL_PDF_LIBS || !window._BAIL_PDF_LIBS.html2canvas) return Promise.resolve(false);

  return new Promise(resolve => {
    try {
      const b64 = window._BAIL_PDF_LIBS.html2canvas;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve(typeof window.html2canvas === 'function');
      script.onerror = (e) => { console.error('[email-pdf-attachment] html2canvas script load failed', e); resolve(false); };
      document.head.appendChild(script);
    } catch (e) {
      console.error('[email-pdf-attachment] _ensureHtml2CanvasLoaded threw', e);
      resolve(false);
    }
  });
}

/**
 * v15.91 EM-2d — Rasterise un HTML/CSS donné en un PDF jsPDF (multi-pages A4)
 * via html2canvas. Retourne un Blob PDF.
 *
 * @param {string} html — body HTML à rendre
 * @param {string} css — CSS à inclure (scope auto via wrapper)
 * @returns {Promise<Blob>}
 */
async function _rasterizeHtmlToPdfBlob(html, css) {
  const Cls = _getJsPdfClass();
  if (!Cls) throw new Error('jspdf-not-loaded');
  if (typeof window === 'undefined' || typeof window.html2canvas !== 'function') {
    throw new Error('html2canvas-not-loaded');
  }
  // Conteneur off-screen (visuellement caché mais rendable par html2canvas).
  // Dimensions calées sur ~A4 700px wide (matches body max-width:700px du CSS quittance).
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111;z-index:-1';
  // Inline CSS via <style> scope sur le container pour ne pas polluer la page principale
  container.innerHTML = '<style>' + css + '</style><div class="em-pdf-render-root" style="background:#fff;padding:30px 30px;max-width:700px;margin:0 auto;font-family:\'Times New Roman\',serif;font-size:11.5pt;color:#111;line-height:1.45">' + html + '</div>';
  document.body.appendChild(container);
  try {
    const target = container.querySelector('.em-pdf-render-root');
    const canvas = await window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new Cls({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 16; // 8mm margin chaque côté
    const imgH = (canvas.height * imgW) / canvas.width;
    let position = 8;
    let heightLeft = imgH;
    pdf.addImage(imgData, 'PNG', 8, position, imgW, imgH);
    heightLeft -= (pageH - 16);
    while (heightLeft > 0) {
      position = -heightLeft + 8;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 8, position, imgW, imgH);
      heightLeft -= (pageH - 16);
    }
    return pdf.output('blob');
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

/**
 * v15.88 EM-2b fix — Charge la lib jsPDF si pas déjà disponible globalement.
 * Pattern ImmoTrack : la lib est inlinée en base64 dans `window._BAIL_PDF_LIBS.jspdf`
 * mais décodée + injectée comme <script src=blob:> UNIQUEMENT dans la fenêtre de
 * preview Bail (pas dans la fenêtre principale). Pour envoyer un mail avec PJ depuis
 * la fenêtre principale, on doit décoder + injecter la lib ici à la volée.
 *
 * Idempotent : si jsPDF est déjà chargé (cas où user a déjà ouvert un bail), retourne
 * true immédiatement. Premier appel charge la lib (~50ms), suivants instantanés.
 *
 * @returns {Promise<boolean>} true si jsPDF est disponible après l'appel
 */
function _ensureJsPdfLoaded() {
  // Déjà chargé
  if (_getJsPdfClass()) return Promise.resolve(true);
  // Pas de DOM/window (Vitest node sans jsdom) — impossible de charger
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (typeof document.createElement !== 'function') return Promise.resolve(false);
  // Pas de _BAIL_PDF_LIBS inliné → rien à décoder
  if (!window._BAIL_PDF_LIBS || !window._BAIL_PDF_LIBS.jspdf) return Promise.resolve(false);

  return new Promise(resolve => {
    try {
      const b64 = window._BAIL_PDF_LIBS.jspdf;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        // jsPDF s'expose comme window.jspdf après chargement
        resolve(!!_getJsPdfClass());
      };
      script.onerror = (e) => {
        console.error('[email-pdf-attachment] jsPDF script load failed', e);
        resolve(false);
      };
      document.head.appendChild(script);
    } catch (e) {
      console.error('[email-pdf-attachment] _ensureJsPdfLoaded threw', e);
      resolve(false);
    }
  });
}

/**
 * Helper format monétaire FR ('€' avec 2 décimales si non entier).
 */
function _fmt(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', {
    minimumFractionDigits: v === Math.trunc(v) ? 0 : 2,
    maximumFractionDigits: 2
  }) + ' €';
}

/**
 * Helper civilité affichée ('M.' → 'Monsieur', 'Mme' → 'Madame', sinon vide).
 */
function _civNom(loc) {
  if (!loc) return '';
  const civ = loc.civilite === 'M.' ? 'Monsieur' : (loc.civilite === 'Mme' ? 'Madame' : '');
  return (civ ? civ + ' ' : '') + (loc.nom || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Génération PDF par type
// ────────────────────────────────────────────────────────────────────────────

/**
 * v15.91 EM-2d — Génère une quittance PDF en utilisant le RENDU OFFICIEL
 * (`window._buildQuittanceHtml` exposé par index.html, extrait de `previewQuit`).
 * Approche : html2canvas + jsPDF multi-pages. Le PDF reçu par mail correspond
 * exactement à ce que l'user voit en cliquant 👁 Aperçu sur une quittance.
 *
 * Si rendu officiel pas disponible → fallback minimaliste (compat tests Vitest).
 *
 * @param {object} ctx — { locataire, bail, logement, entite, quittance, quittanceId? }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfQuittance(ctx) {
  const c = ctx || {};
  const q = c.quittance || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const bail = c.bail || {};

  // Path principal : rendu officiel via window._buildQuittanceHtml (v15.91)
  if (typeof window !== 'undefined' && typeof window._buildQuittanceHtml === 'function') {
    const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
    if (html2canvasLoaded) {
      try {
        const built = window._buildQuittanceHtml(q, log, ent, bail);
        if (built.status === 'non-paye') {
          return {
            error: 'no-payment',
            message: 'Aucun paiement enregistré pour ce mois — impossible de générer la quittance. Saisir le paiement dans les mouvements d\'abord.'
          };
        }
        const blob = await _rasterizeHtmlToPdfBlob(built.html, built.css);
        const base64 = await _blobToBase64(blob);
        const filename = 'Quittance-' + (q.mois || 'mois').replace(/\s+/g, '-') + '-' + (log.ref || 'logement') + '.pdf';
        return { filename, base64, mimeType: 'application/pdf' };
      } catch (e) {
        console.warn('[email-pdf] rendu officiel quittance KO, fallback text-natif :', e && e.message);
        // tombe sur fallback ci-dessous
      }
    }
  }

  // Fallback path : jsPDF text-natif (cas où window._buildQuittanceHtml absent ou
  // html2canvas pas chargeable — utilisé par les tests Vitest qui mockent FakeJsPdf).
  return _genPdfQuittanceFallbackText(c);
}

/**
 * v15.91 EM-2d — Fallback text-natif (ancien V1.0 EM-2b avant rendu officiel).
 * Préservé pour les tests Vitest (FakeJsPdf mock) et pour la compatibilité.
 *
 * @param {object} c — ctx complet
 */
async function _genPdfQuittanceFallbackText(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const q = c.quittance || {};
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const loc = c.locataire || {};

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = MARGIN;

  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(ent.nom || '—', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (ent.siege) { pdf.text(ent.siege, MARGIN, y); y += 5; }
  if (ent.gerant) { pdf.text('Représenté(e) par : ' + ent.gerant, MARGIN, y); y += 5; }
  y += 4;

  const dateEmission = (q.date || (new Date()).toISOString().slice(0, 10));
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text('Fait le ' + dateEmission, PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(0, 51, 153);
  pdf.text('Quittance de loyer', PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 8;
  pdf.setFont('helvetica', 'italic').setFontSize(10);
  pdf.text((q.mois || '—') + ' · ' + (bail.adrBien || log.adr || '—'), PAGE_W / 2, y, { align: 'center' });
  y += 12;

  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text('Locataire', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text(_civNom(loc) || (loc.nom || '—'), MARGIN, y); y += 5;
  if (bail.adrBien) { pdf.text(bail.adrBien, MARGIN, y); y += 5; }
  y += 6;

  const hc = Number(q.hc) || 0;
  const ch = Number(q.ch) || 0;
  const total = Number(q.total) || (hc + ch);

  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  pdf.text("Je soussigné(e) Bailleur du logement sis " + (bail.adrBien || log.adr || '—'), MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 5;
  pdf.text("déclare avoir reçu du Locataire la somme de " + _fmt(total) + ", se décomposant comme suit :", MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 8;

  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text('Loyer hors charges', MARGIN + 5, y);
  pdf.text(_fmt(hc), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.text('Provisions sur charges', MARGIN + 5, y);
  pdf.text(_fmt(ch), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.setDrawColor(0, 0, 0).setLineWidth(0.5);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text('Total perçu', MARGIN + 5, y);
  pdf.text(_fmt(total), PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  pdf.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(60, 60, 60);
  pdf.text("Cette quittance correspond au règlement du loyer et des charges pour la période de location indiquée. " +
           "Elle est délivrée sous réserve du bon encaissement de cette somme et conformément à l'article 21 de la loi n° 89-462 du 6 juillet 1989. " +
           "Elle annule tous les reçus qui auraient pu être établis précédemment pour le même terme.",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 18;

  pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0, 0, 0);
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y);
  y += 14;
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Quittance-' + (q.mois || 'mois').replace(/\s+/g, '-') + '-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

/**
 * v15.89 EM-2c — Helper commun : en-tête bailleur + destinataire + date.
 * Réutilisé par tous les types pour éviter la duplication.
 *
 * @param {object} pdf jsPDF instance
 * @param {object} ctx — { entite, locataire, bail }
 * @param {number} yStart
 * @returns {number} y final après en-tête
 */
function _drawHeaderBlock(pdf, ctx, yStart) {
  const MARGIN = 20;
  const PAGE_W = 210;
  const ent = ctx.entite || {};
  const loc = ctx.locataire || {};
  const bail = ctx.bail || {};
  let y = yStart;

  // En-tête bailleur
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(ent.nom || '—', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (ent.siege) { pdf.text(ent.siege, MARGIN, y); y += 5; }
  if (ent.gerant) { pdf.text(ent.gerant, MARGIN, y); y += 5; }
  y += 6;

  // Destinataire
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text(_civNom(loc) || (loc.nom || '—'), MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (bail.adrBien) { pdf.text(bail.adrBien, MARGIN, y); y += 5; }
  y += 4;

  // Date
  const dateLettre = (new Date()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  pdf.text('Fait le ' + dateLettre, PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;
  return y;
}

/**
 * v15.100 EM-2d V1.1 — Décompte régul PDF avec rendu officiel
 * (`window._buildDecompteHtml`). Path principal html2canvas + jsPDF.
 * Fallback : text-natif (compat tests Vitest).
 *
 * @param {object} ctx — { locataire, bail, logement, entite, annee, provisions, chargesReelles, solde, regulEntry?, from?, to? }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfDecompteRegul(ctx) {
  const c = ctx || {};
  const log = c.logement || {};
  const annee = c.annee || '—';

  // Path principal : rendu officiel via window._buildDecompteHtml
  if (typeof window !== 'undefined' && typeof window._buildDecompteHtml === 'function' && c.regulEntry) {
    const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
    if (html2canvasLoaded) {
      try {
        const built = window._buildDecompteHtml(c.regulEntry, c.from || '', c.to || '');
        if (built.error) {
          return { error: built.error, message: 'Décompte non émissible' };
        }
        const blob = await _rasterizeHtmlToPdfBlob(built.html, built.css);
        const base64 = await _blobToBase64(blob);
        const filename = 'Decompte-charges-' + annee + '-' + (log.ref || 'logement') + '.pdf';
        return { filename, base64, mimeType: 'application/pdf' };
      } catch (e) {
        console.warn('[email-pdf] rendu officiel décompte KO, fallback text-natif :', e && e.message);
      }
    }
  }

  // Fallback path : jsPDF text-natif (compat tests Vitest)
  return _genPdfDecompteRegulFallbackText(c);
}

async function _genPdfDecompteRegulFallbackText(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  c = c || {};
  const log = c.logement || {};
  const annee = c.annee || '—';
  const provisions = Number(c.provisions) || 0;
  const chargesReelles = Number(c.chargesReelles) || 0;
  const solde = Number(c.solde) || (chargesReelles - provisions);
  const soldeSens = c.soldeSens || (solde > 0 ? 'à régler par le locataire' : (solde < 0 ? 'à rembourser au locataire' : 'équilibré'));

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = _drawHeaderBlock(pdf, c, MARGIN);

  pdf.setFont('helvetica', 'bold').setFontSize(12);
  pdf.text("Décompte de régularisation des charges — " + annee, MARGIN, y); y += 8;

  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  pdf.text("Conformément à l'article 23 de la loi n° 89-462 du 6 juillet 1989, vous trouverez ci-dessous le décompte " +
           "de régularisation des charges récupérables pour l'année " + annee + ".",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;

  // Table
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text('Synthèse', MARGIN, y); y += 6;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text("Provisions sur charges versées sur l'année", MARGIN + 5, y);
  pdf.text(_fmt(provisions), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.text("Charges récupérables réelles (quote-part locataire)", MARGIN + 5, y);
  pdf.text(_fmt(chargesReelles), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.setLineWidth(0.5).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text("Solde " + soldeSens, MARGIN + 5, y);
  pdf.text(_fmt(Math.abs(solde)), PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  // Détails (cf PJ détaillée si dispo)
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text("Le détail par nature de charge (eau, ordures ménagères, chauffage collectif, entretien parties communes…) " +
           "est tenu à votre disposition. Vous disposez d'un délai d'un mois pour consulter les justificatifs (art. 23 loi 1989).",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 16;

  // Signature
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  const ent = c.entite || {};
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Decompte-charges-' + annee + '-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

// ────────────────────────────────────────────────────────────────────────────
// v15.101 EM-2d V1.1 — Helper CSS partagé Qonto + builders HTML pour bail/EDL/cautionnement
// (les 3 derniers types qui n'ont pas d'aperçu modal user — PDF email uniquement)
// ────────────────────────────────────────────────────────────────────────────

/**
 * CSS Qonto-style partagé pour les recaps simples (bail/EDL/cautionnement).
 * Réplique le namespace .q-page de _buildQuittanceHtml / _buildIRLLetterHtml /
 * _buildDecompteHtml pour cohérence visuelle entre tous les types.
 */
function _qontoCommonCss() {
  return `
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;font-size:11pt;color:#18181b;line-height:1.5;margin:0;padding:0;background:#fff}
.q-page{max-width:780px;margin:0 auto;padding:48px 56px 28px;min-height:1050px;display:flex;flex-direction:column}
.q-header{display:grid;grid-template-columns:1fr auto;gap:24px;margin-bottom:28px}
.q-header h1{margin:0 0 20px;font-size:30pt;font-weight:800;letter-spacing:-0.025em;color:#18181b;line-height:1}
.q-meta{display:grid;grid-template-columns:140px 1fr;font-size:10.5pt;gap:6px 0}
.q-meta .lbl{font-weight:700;color:#18181b}
.q-meta .val{color:#3f3f46}
.q-logo{text-align:right;align-self:flex-start}
.q-logo img{max-width:140px;max-height:80px;object-fit:contain}
.q-parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:24px}
.q-party .name{font-size:10.5pt;font-weight:700;color:#2563eb;margin-bottom:6px}
.q-party .line{font-size:10pt;color:#3f3f46;line-height:1.6}
.q-objet{margin:0 0 16px;padding:12px 16px;background:#f4f4f5;border-left:3px solid #18181b;border-radius:3px;font-size:11pt}
.q-objet b{color:#18181b}
.q-decl{font-size:10.5pt;line-height:1.65;color:#3f3f46;margin-bottom:14px}
.q-decl p{margin:6px 0}
.q-decl b{color:#18181b}
.q-table{width:100%;border-collapse:collapse;margin-bottom:16px}
.q-table thead th{background:#18181b;color:#fff;text-align:left;padding:9px 12px;font-size:9.5pt;font-weight:600}
.q-table thead th.num{text-align:right}
.q-table tbody td{padding:10px 12px;font-size:10.5pt;color:#18181b;border-bottom:1px solid #e4e4e7}
.q-table tbody td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.q-table tbody td.lbl{color:#52525b}
.q-legal{margin-top:12px;font-size:9.5pt;color:#71717a;line-height:1.55;font-style:italic;border-left:2px solid #d4d4d8;padding-left:12px}
.q-legal p{margin:4px 0}
.q-sign{text-align:right;margin-top:28px;margin-bottom:24px}
.q-sign .lieu-date{font-size:10pt;color:#3f3f46;margin-bottom:12px}
.q-sign-img{display:inline-block;min-width:200px;min-height:60px;border-bottom:1px solid #71717a;margin-bottom:4px;text-align:center;padding:6px 0}
.q-sign-img img{max-width:200px;max-height:60px;object-fit:contain;display:inline-block}
.q-sign .nom{font-size:10pt;font-weight:600;color:#18181b;display:block}
.q-sign .role{font-size:9.5pt;color:#71717a}
.q-footer{margin-top:auto;padding-top:14px;display:flex;justify-content:space-between;font-size:8.5pt;color:#a1a1aa;border-top:1px solid #f4f4f5}
.q-footer b{color:#71717a;font-weight:600}
@media print{.q-page{padding:24px 32px}}`;
}

/**
 * Helper HTML : bloc Bailleur Qonto (nom bleu + lignes adresse/siren/gerant).
 */
function _qontoBailleurBloc(ent) {
  if (!ent) return '<div class="name">—</div>';
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lignes = [];
  lignes.push(escape(ent.nom || '—'));
  if (ent.type && ent.siege) lignes.push(escape(ent.type) + ' · ' + escape(String(ent.siege).replace(/\s+/g, ' ')));
  else if (ent.siege) lignes.push(escape(String(ent.siege).replace(/\s+/g, ' ')));
  if (ent.siren) lignes.push('SIREN ' + escape(ent.siren));
  if (ent.gerant) lignes.push('Représentée par ' + escape(ent.gerant) + ', Gérant');
  return `<div class="name">${lignes[0]}</div><div class="line">${lignes.slice(1).join('<br>')}</div>`;
}

/**
 * Helper HTML : bloc Locataire (ou destinataire) Qonto.
 */
function _qontoPersonneBloc(personne, adresse) {
  if (!personne) return '<div class="name">—</div>';
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const civNom = _civNom(personne);
  const adr = escape(adresse || '');
  return `<div class="name">${escape(civNom)}</div><div class="line">${adr}</div>`;
}

/**
 * Helper HTML : footer ImmoTrack + ref doc + timestamp.
 */
function _qontoFooter(ent, docRef) {
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowFr = new Date().toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const sirenPart = ent && ent.siren ? '· SIREN ' + escape(ent.siren) + ' ' : '';
  return `<div class="q-footer">
    <span>${escape(ent && ent.nom || '')} ${sirenPart}· Document généré par <b>ImmoTrack</b> · ${escape(nowFr)}</span>
    <span>${escape(docRef || '')}</span>
  </div>`;
}

/**
 * Helper HTML : zone signature Bailleur (image si ent.signature, sinon ligne vide).
 */
function _qontoSigBlock(ent, lieuTitre, dateEmission) {
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sigImg = ent && ent.signature
    ? `<span class="q-sign-img"><img src="${ent.signature}" alt="Signature"></span>`
    : `<span class="q-sign-img"></span>`;
  return `<div class="q-sign">
    <div class="lieu-date">Fait à ${escape(lieuTitre || '—')}, le ${escape(dateEmission || '—')}</div>
    ${sigImg}
    <span class="nom">${escape(ent && ent.gerant || ent && ent.nom || '')}</span>
    ${ent && ent.nom ? `<span class="role">${escape(ent.nom)}</span>` : ''}
  </div>`;
}

/**
 * Extrait ville titre + date émission depuis ent.siege + today.
 */
function _qontoLieuDate(ent) {
  const siegeStr = ent && ent.siege || '';
  const villeMatch = siegeStr.match(/\d{5}\s+(.+)/);
  const ville = villeMatch ? villeMatch[1].split(',')[0].trim() : '';
  const villeTitre = ville ? ville.charAt(0).toUpperCase() + ville.slice(1).toLowerCase() : '';
  const dateEmission = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  return { villeTitre, dateEmission };
}

/**
 * Helper HTML : logo entité (image si ent.logo, sinon vide).
 */
function _qontoLogoHtml(ent) {
  if (!ent || !ent.logo) return '';
  const escape = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<img src="${ent.logo}" alt="Logo ${escape(ent.nom || '')}">`;
}

/**
 * Génère un récap du bail signé (annexe — le PDF officiel du bail reste dans Drive).
 *
 * @param {object} ctx — { locataire, bail, logement, entite }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
/**
 * v15.101 EM-2d V1.1 — Récap du bail signé, design Qonto-like (html2canvas).
 * Le bail officiel signé reste dans Drive — ce récap est une annexe au mail.
 */
async function _genPdfBailSigne(ctx) {
  const c = ctx || {};
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const loc = c.locataire || {};
  const hc = Number(bail.hc) || 0;
  const ch = Number(bail.ch) || 0;
  const dg = Number(bail.dg) || 0;
  const total = hc + ch;
  const adrBien = bail.adrBien || log.adr || '—';

  // Path principal : html2canvas + jsPDF via _rasterizeHtmlToPdfBlob
  const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  if (!html2canvasLoaded) return _genPdfBailSigneFallback(c);

  try {
    const { villeTitre, dateEmission } = _qontoLieuDate(ent);
    const docRef = 'BAIL-' + (log.ref || 'XXX') + '-RECAP';
    const escape = s => String(s || '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));

    const html = `
<div class="q-page">
  <div class="q-header">
    <div>
      <h1>Bail signé</h1>
      <div class="q-meta">
        <div class="lbl">Référence</div><div class="val">${escape(docRef)}</div>
        <div class="lbl">Date d'émission</div><div class="val">${escape(dateEmission)}</div>
        <div class="lbl">Logement</div><div class="val">${escape(log.ref || '—')}</div>
        <div class="lbl">Date d'effet</div><div class="val">${escape(bail.debut || '—')}</div>
      </div>
    </div>
    <div class="q-logo">${_qontoLogoHtml(ent)}</div>
  </div>
  <div class="q-parties">
    <div class="q-party">${_qontoBailleurBloc(ent)}</div>
    <div class="q-party">${_qontoPersonneBloc(loc, adrBien)}</div>
  </div>
  <div class="q-objet">
    <b>Objet : Récapitulatif du bail signé</b><br>
    Logement situé ${escape(adrBien)}
  </div>
  <div class="q-decl">
    <p>Nous vous remercions pour la signature de votre bail. Vous trouverez ci-dessous le récapitulatif des conditions essentielles.</p>
    <p><em>Le contrat de bail complet signé et l'état des lieux d'entrée (si réalisé) sont joints séparément dans Drive.</em></p>
  </div>
  <table class="q-table">
    <thead><tr><th>Élément</th><th class="num">Valeur</th></tr></thead>
    <tbody>
      <tr><td class="lbl">Logement</td><td class="num">${escape(adrBien)}</td></tr>
      <tr><td class="lbl">Date de prise d'effet</td><td class="num">${escape(bail.debut || '—')}</td></tr>
      <tr><td class="lbl">Loyer hors charges</td><td class="num">${_fmt(hc)} / mois</td></tr>
      <tr><td class="lbl">Provisions sur charges</td><td class="num">${_fmt(ch)} / mois</td></tr>
      <tr><td class="lbl">Total mensuel</td><td class="num">${_fmt(total)} / mois</td></tr>
      <tr><td class="lbl">Jour de paiement</td><td class="num">le ${escape(bail.jpay || '—')} de chaque mois</td></tr>
      <tr><td class="lbl">Dépôt de garantie</td><td class="num">${_fmt(dg)} (reçu)</td></tr>
    </tbody>
  </table>
  <div class="q-legal">
    <p>N'oubliez pas de souscrire votre assurance habitation (obligation légale art. 7g loi n° 89-462 du 6 juillet 1989).</p>
    <p>Bienvenue dans votre nouveau logement.</p>
  </div>
  ${_qontoSigBlock(ent, villeTitre, dateEmission)}
  ${_qontoFooter(ent, docRef)}
</div>`;
    const css = _qontoCommonCss();
    const blob = await _rasterizeHtmlToPdfBlob(html, css);
    const base64 = await _blobToBase64(blob);
    const filename = 'Recap-bail-' + (log.ref || 'logement') + '.pdf';
    return { filename, base64, mimeType: 'application/pdf' };
  } catch (e) {
    console.warn('[email-pdf] rendu Qonto bail-signe-final KO, fallback text-natif :', e && e.message);
    return _genPdfBailSigneFallback(c);
  }
}

/**
 * Fallback text-natif (compat tests Vitest avec FakeJsPdf mock).
 */
async function _genPdfBailSigneFallback(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const hc = Number(bail.hc) || 0;
  const ch = Number(bail.ch) || 0;
  const dg = Number(bail.dg) || 0;
  const total = hc + ch;

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = _drawHeaderBlock(pdf, c, MARGIN);

  pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(0, 51, 153);
  pdf.text("Récapitulatif du bail signé", PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 10;
  pdf.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(110, 110, 110);
  pdf.text("(Annexe au mail — le contrat de bail complet signé est joint séparément en PDF dans Drive)",
           PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 10;

  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text('Conditions essentielles', MARGIN, y); y += 6;
  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  const lines = [
    ['Logement', bail.adrBien || log.adr || '—'],
    ['Date de prise d\'effet', bail.debut || '—'],
    ['Loyer hors charges', _fmt(hc) + ' / mois'],
    ['Provisions sur charges', _fmt(ch) + ' / mois'],
    ['Total mensuel', _fmt(total) + ' / mois'],
    ['Jour de paiement', 'le ' + (bail.jpay || '—') + ' de chaque mois'],
    ['Dépôt de garantie', _fmt(dg) + ' (reçu)']
  ];
  for (const [lbl, val] of lines) {
    pdf.text(lbl, MARGIN + 5, y);
    pdf.setFont('helvetica', 'bold').text(val, MARGIN + 80, y);
    pdf.setFont('helvetica', 'normal');
    y += 5;
  }
  y += 6;
  pdf.text("Vous trouverez le contrat de bail complet (signé) et l'état des lieux d'entrée en pièce jointe séparée. " +
           "N'oubliez pas de souscrire votre assurance habitation (obligation légale art. 7g loi 1989).",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  return { filename: 'Recap-bail-' + (log.ref || 'logement') + '.pdf', base64, mimeType: 'application/pdf' };
}

/**
 * v15.101 EM-2d V1.1 — Récap EDL (entrée ou sortie), design Qonto.
 * @param {string} sens 'entree' | 'sortie'
 */
async function _genPdfEdlSigne(ctx, sens) {
  const c = ctx || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const bail = c.bail || {};
  const loc = c.locataire || {};
  const adrBien = bail.adrBien || log.adr || '—';
  const isSortie = sens === 'sortie';

  // Path principal : Qonto html2canvas
  const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
  const ClsCheck = _getJsPdfClass();
  if (!ClsCheck) return { error: 'jspdf-not-loaded' };
  if (!html2canvasLoaded) return _genPdfEdlSigneFallback(c, sens);

  try {
    const { villeTitre, dateEmission } = _qontoLieuDate(ent);
    const docRef = 'EDL-' + (isSortie ? 'SORTIE' : 'ENTREE') + '-' + (log.ref || 'XXX');
    const escape = s => String(s || '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));

    let coreTable = '';
    let mentionLegale = '';
    if (!isSortie) {
      // EDL entrée : relevé compteurs
      coreTable = `
<table class="q-table">
  <thead><tr><th>Compteur</th><th class="num">Relevé à l'entrée</th></tr></thead>
  <tbody>
    <tr><td class="lbl">Électricité</td><td class="num">${escape(c.compteurElec || '—')}</td></tr>
    <tr><td class="lbl">Gaz</td><td class="num">${escape(c.compteurGaz || '—')}</td></tr>
    <tr><td class="lbl">Eau froide</td><td class="num">${escape(c.compteurEauF || '—')}</td></tr>
    <tr><td class="lbl">Eau chaude</td><td class="num">${escape(c.compteurEauC || '—')}</td></tr>
  </tbody>
</table>`;
      mentionLegale = `<p>Conservez ce document : il sera comparé à l'EDL de sortie pour évaluer d'éventuelles réparations. Vous disposez de <b>10 jours</b> après votre entrée pour demander une modification (art. 3-2 al. 5 loi 89-462).</p>`;
    } else {
      // EDL sortie : bilan
      coreTable = `
<table class="q-table">
  <thead><tr><th>Élément</th><th class="num">Constatation</th></tr></thead>
  <tbody>
    <tr><td class="lbl">Comparatif compteurs entrée/sortie</td><td class="num">${escape(c.comparatifCompteurs || '—')}</td></tr>
    <tr><td class="lbl">Dégradations constatées</td><td class="num">${escape(c.degradationsBilan || '—')}</td></tr>
    ${c.conclusionEDL ? `<tr><td class="lbl">Conclusion</td><td class="num">${escape(c.conclusionEDL)}</td></tr>` : ''}
  </tbody>
</table>`;
      mentionLegale = `<p>Le solde du dépôt de garantie sera traité dans les délais légaux (<b>1 mois</b> sans dégradation, <b>2 mois</b> si retenues — art. 22 loi 89-462).</p>`;
    }

    const html = `
<div class="q-page">
  <div class="q-header">
    <div>
      <h1>État des lieux ${isSortie ? 'de sortie' : "d'entrée"}</h1>
      <div class="q-meta">
        <div class="lbl">Référence</div><div class="val">${escape(docRef)}</div>
        <div class="lbl">Date d'émission</div><div class="val">${escape(dateEmission)}</div>
        <div class="lbl">Logement</div><div class="val">${escape(log.ref || '—')}</div>
        <div class="lbl">EDL signé le</div><div class="val">${escape(c.dateEDL || '—')}</div>
      </div>
    </div>
    <div class="q-logo">${_qontoLogoHtml(ent)}</div>
  </div>
  <div class="q-parties">
    <div class="q-party">${_qontoBailleurBloc(ent)}</div>
    <div class="q-party">${_qontoPersonneBloc(loc, adrBien)}</div>
  </div>
  <div class="q-objet">
    <b>Objet : Récapitulatif EDL ${isSortie ? 'de sortie' : "d'entrée"}</b><br>
    Logement situé ${escape(adrBien)}
  </div>
  <div class="q-decl">
    <p>L'état des lieux ${isSortie ? 'de sortie' : "d'entrée"} signé contradictoirement le <b>${escape(c.dateEDL || '—')}</b> est annexé à votre bail. Le document complet (avec photos et descriptions pièce par pièce) est joint séparément en PDF.</p>
  </div>
  ${coreTable}
  <div class="q-legal">${mentionLegale}</div>
  ${_qontoSigBlock(ent, villeTitre, dateEmission)}
  ${_qontoFooter(ent, docRef)}
</div>`;
    const css = _qontoCommonCss();
    const blob = await _rasterizeHtmlToPdfBlob(html, css);
    const base64 = await _blobToBase64(blob);
    const filename = 'EDL-' + (isSortie ? 'sortie' : 'entree') + '-' + (log.ref || 'logement') + '.pdf';
    return { filename, base64, mimeType: 'application/pdf' };
  } catch (e) {
    console.warn('[email-pdf] rendu Qonto EDL KO, fallback text-natif :', e && e.message);
    return _genPdfEdlSigneFallback(c, sens);
  }
}

/**
 * Fallback text-natif EDL (préservé pour tests Vitest).
 */
async function _genPdfEdlSigneFallback(c, sens) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const log = c.logement || {};

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = _drawHeaderBlock(pdf, c, MARGIN);

  pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(0, 51, 153);
  pdf.text("État des lieux " + (sens === 'sortie' ? 'de sortie' : "d'entrée") + " — Récapitulatif", PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 10;

  pdf.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(110, 110, 110);
  pdf.text("(Annexe au mail — l'EDL complet signé est joint séparément)", PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 10;

  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  pdf.text("EDL " + (sens === 'sortie' ? 'de sortie' : "d'entrée") + " signé le " + (c.dateEDL || '—') + ".", MARGIN, y); y += 7;

  // Compteurs (entrée) ou comparatif (sortie)
  if (sens === 'entree') {
    pdf.setFont('helvetica', 'bold').setFontSize(11);
    pdf.text('Relevé des compteurs à votre entrée', MARGIN, y); y += 6;
    pdf.setFont('helvetica', 'normal').setFontSize(10);
    [
      ['Électricité', c.compteurElec],
      ['Gaz', c.compteurGaz],
      ['Eau froide', c.compteurEauF],
      ['Eau chaude', c.compteurEauC]
    ].forEach(([lbl, val]) => {
      pdf.text(lbl, MARGIN + 5, y);
      pdf.text(String(val || '—'), MARGIN + 80, y);
      y += 5;
    });
    y += 6;
    pdf.text("Conservez ce document : il sera comparé à l'EDL de sortie pour évaluer d'éventuelles réparations. " +
             "Vous disposez de 10 jours pour demander une modification (art. 3-2 al. 5 loi 1989).",
             MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  } else {
    pdf.setFont('helvetica', 'bold').setFontSize(11);
    pdf.text('Synthèse', MARGIN, y); y += 6;
    pdf.setFont('helvetica', 'normal').setFontSize(10);
    pdf.text('Comparatif compteurs entrée / sortie : ' + (c.comparatifCompteurs || '—'), MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN }); y += 7;
    pdf.text('Dégradations constatées : ' + (c.degradationsBilan || '—'), MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN }); y += 7;
    if (c.conclusionEDL) {
      pdf.text('Conclusion : ' + c.conclusionEDL, MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN }); y += 7;
    }
    y += 4;
    pdf.text("Le solde du dépôt de garantie sera traité dans les délais légaux (1 mois sans dégradation, 2 mois si retenues — art. 22 loi 1989).",
             MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  }
  y += 14;

  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  const ent = c.entite || {};
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'EDL-' + (sens === 'sortie' ? 'sortie' : 'entree') + '-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

/**
 * v15.101 EM-2d V1.1 — Accusé de réception d'acte de cautionnement, design Qonto.
 */
async function _genPdfCautionnement(ctx) {
  const c = ctx || {};
  const log = c.logement || {};
  const garant = c.garant || {};
  const loc = c.locataire || {};
  const ent = c.entite || {};
  const bail = c.bail || {};
  const adrBien = bail.adrBien || log.adr || '—';

  const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
  const ClsCheck = _getJsPdfClass();
  if (!ClsCheck) return { error: 'jspdf-not-loaded' };
  if (!html2canvasLoaded) return _genPdfCautionnementFallback(c);

  try {
    const { villeTitre, dateEmission } = _qontoLieuDate(ent);
    const docRef = 'CAUT-' + (log.ref || 'XXX');
    const escape = s => String(s || '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
    const civGarant = _civNom(garant) || (garant.nom || '—');
    const civLoc = _civNom(loc) || (loc.nom || '—');

    const html = `
<div class="q-page">
  <div class="q-header">
    <div>
      <h1>Cautionnement reçu</h1>
      <div class="q-meta">
        <div class="lbl">Référence</div><div class="val">${escape(docRef)}</div>
        <div class="lbl">Date d'émission</div><div class="val">${escape(dateEmission)}</div>
        <div class="lbl">Logement</div><div class="val">${escape(log.ref || '—')}</div>
        <div class="lbl">Locataire couvert</div><div class="val">${escape(civLoc)}</div>
      </div>
    </div>
    <div class="q-logo">${_qontoLogoHtml(ent)}</div>
  </div>
  <div class="q-parties">
    <div class="q-party">${_qontoBailleurBloc(ent)}</div>
    <div class="q-party"><div class="name">${escape(civGarant)}</div><div class="line">Garant — acte de cautionnement</div></div>
  </div>
  <div class="q-objet">
    <b>Objet : Accusé de réception de l'acte de cautionnement</b><br>
    Logement situé ${escape(adrBien)}
  </div>
  <div class="q-decl">
    <p>Nous accusons réception de l'acte de cautionnement signé par <b>${escape(civGarant)}</b> en garantie des obligations locatives de <b>${escape(civLoc)}</b>, pour le logement situé ${escape(adrBien)}.</p>
    <p>Cet acte engage votre solidarité au paiement des loyers, charges et éventuelles indemnités d'occupation, dans les limites définies par le document signé.</p>
  </div>
  <table class="q-table">
    <thead><tr><th>Vos droits en tant que garant</th></tr></thead>
    <tbody>
      <tr><td>Demander à tout moment un point sur la situation locative (état des règlements)</td></tr>
      <tr><td>Mettre fin au cautionnement à durée indéterminée par lettre recommandée (préavis prévu à l'acte)</td></tr>
      <tr><td>Être informé de tout impayé du locataire dans les conditions prévues à l'acte</td></tr>
    </tbody>
  </table>
  <div class="q-legal">
    <p>Conservation de l'acte original 5 ans après la fin du bail (prescription civile).</p>
  </div>
  ${_qontoSigBlock(ent, villeTitre, dateEmission)}
  ${_qontoFooter(ent, docRef)}
</div>`;
    const css = _qontoCommonCss();
    const blob = await _rasterizeHtmlToPdfBlob(html, css);
    const base64 = await _blobToBase64(blob);
    const filename = 'Cautionnement-' + (log.ref || 'logement') + '.pdf';
    return { filename, base64, mimeType: 'application/pdf' };
  } catch (e) {
    console.warn('[email-pdf] rendu Qonto cautionnement KO, fallback text-natif :', e && e.message);
    return _genPdfCautionnementFallback(c);
  }
}

/**
 * Fallback text-natif cautionnement (préservé pour tests Vitest).
 */
async function _genPdfCautionnementFallback(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const log = c.logement || {};
  const garant = c.garant || {};
  const loc = c.locataire || {};

  // Helper local : remplace destinataire par garant pour l'en-tête
  const ctxForHeader = Object.assign({}, c, { locataire: garant });

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = _drawHeaderBlock(pdf, ctxForHeader, MARGIN);

  pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0, 51, 153);
  pdf.text("Accusé de réception — Acte de cautionnement", PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 10;

  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  const civGarant = _civNom(garant) || garant.nom || '—';
  pdf.text("Nous accusons réception de l'acte de cautionnement signé par vos soins (" + civGarant + ") " +
           "en garantie des obligations locatives de " + (loc.nom || '—') + ", pour le logement situé " +
           (c.bail && c.bail.adrBien ? c.bail.adrBien : '—') + ".",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;

  pdf.text("Cet acte engage votre solidarité au paiement des loyers, charges et éventuelles indemnités d'occupation, " +
           "dans les limites définies par le document signé.",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 12;

  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text("Vos droits", MARGIN, y); y += 6;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text("• Demander à tout moment un point sur la situation locative (état des règlements)", MARGIN + 5, y); y += 5;
  pdf.text("• Mettre fin au cautionnement à durée indéterminée par lettre recommandée (préavis prévu à l'acte)", MARGIN + 5, y); y += 10;

  pdf.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(110, 110, 110);
  pdf.text("Conservation de l'acte original 5 ans après la fin du bail (prescription civile).", MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  pdf.setTextColor(0, 0, 0);
  y += 14;

  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  const ent = c.entite || {};
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Cautionnement-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

/**
 * v15.99 EM-2d V1.1 — Génère lettre IRL PDF avec rendu officiel
 * (`window._buildIRLLetterHtml` exposé par index.html). Path principal :
 * html2canvas + jsPDF multi-pages. Le PDF email correspond exactement à
 * ce que l'user voit en cliquant 👁 Voir lettre sur une révision IRL.
 *
 * Si rendu officiel pas disponible → fallback text-natif (compat tests Vitest).
 *
 * @param {object} ctx — { locataire, bail, logement, entite, rev?, ancienHC, nouveauHC, moisApplication }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfIrlRevision(ctx) {
  const c = ctx || {};
  const log = c.logement || {};
  const bail = c.bail || {};
  const ent = c.entite || {};

  // Path principal : rendu officiel via window._buildIRLLetterHtml (v15.99)
  if (typeof window !== 'undefined' && typeof window._buildIRLLetterHtml === 'function') {
    const html2canvasLoaded = await _ensureHtml2CanvasLoaded();
    if (html2canvasLoaded) {
      try {
        // rev est attendu (computeIRLRevision result). Si pas dans ctx, on tente de le calculer.
        let rev = c.rev;
        if (!rev && typeof window.computeIRLRevision === 'function' && log.ref) {
          rev = window.computeIRLRevision(log);
        }
        const built = window._buildIRLLetterHtml(log, bail, ent, rev);
        if (built.error) {
          return { error: built.error, message: 'Lettre IRL non émissible : ' + built.error };
        }
        const blob = await _rasterizeHtmlToPdfBlob(built.html, built.css);
        const base64 = await _blobToBase64(blob);
        const filename = 'Lettre-revision-IRL-' + (log.ref || 'logement') + '.pdf';
        return { filename, base64, mimeType: 'application/pdf' };
      } catch (e) {
        console.warn('[email-pdf] rendu officiel IRL KO, fallback text-natif :', e && e.message);
      }
    }
  }

  // Fallback path : jsPDF text-natif (préservé pour tests Vitest)
  return _genPdfIrlRevisionFallbackText(c);
}

/**
 * v15.99 EM-2d V1.1 — Fallback text-natif IRL (ancien V1.0 EM-2b).
 * Préservé pour tests Vitest avec FakeJsPdf mock.
 */
async function _genPdfIrlRevisionFallbackText(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  c = c || {};
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const loc = c.locataire || {};
  const ancienHC = Number(c.ancienHC) || Number(bail.hc) || 0;
  const nouveauHC = Number(c.nouveauHC) || ancienHC;
  const moisApp = c.moisApplication || '—';
  const ch = Number(bail.ch) || 0;

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = MARGIN;

  // En-tête bailleur
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(ent.nom || '—', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (ent.siege) { pdf.text(ent.siege, MARGIN, y); y += 5; }
  if (ent.gerant) { pdf.text(ent.gerant, MARGIN, y); y += 5; }
  y += 6;

  // Destinataire
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text(_civNom(loc) || (loc.nom || '—'), MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (bail.adrBien) { pdf.text(bail.adrBien, MARGIN, y); y += 5; }
  y += 5;

  // Date
  const dateLettre = (new Date()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  pdf.text('Fait le ' + dateLettre, PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  // Objet
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text("Objet : Révision annuelle du loyer (IRL)", MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text("Logement : " + (bail.adrBien || log.adr || '—'), MARGIN, y); y += 10;

  // Corps
  const salut = loc.civilite === 'Mme' ? 'Madame,' : (loc.civilite === 'M.' ? 'Monsieur,' : 'Madame, Monsieur,');
  pdf.text(salut, MARGIN, y); y += 8;
  pdf.text("Conformément à l'article 17-1 de la loi n° 89-462 du 6 juillet 1989 et à la clause de révision figurant à votre bail, " +
           "nous procédons à la révision annuelle de votre loyer.",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;

  // Table compare
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text('Détail de la révision', MARGIN, y); y += 6;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text('Loyer hors charges actuel', MARGIN + 5, y);
  pdf.text(_fmt(ancienHC), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.text('Nouveau loyer hors charges', MARGIN + 5, y);
  pdf.text(_fmt(nouveauHC), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.text('Charges (inchangées)', MARGIN + 5, y);
  pdf.text(_fmt(ch), PAGE_W - MARGIN, y, { align: 'right' });
  y += 5;
  pdf.setLineWidth(0.5).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text('Nouveau total mensuel', MARGIN + 5, y);
  pdf.text(_fmt(nouveauHC + ch), PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;

  // Application
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text("Application : à compter du mois de " + moisApp + ".", MARGIN, y); y += 12;

  // Politesse
  pdf.text("Nous restons à votre disposition pour toute question.", MARGIN, y); y += 5;
  pdf.text("Veuillez agréer, " + salut.replace(',', '') + ", l'expression de nos salutations distinguées.", MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;

  // Signature
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Lettre-revision-IRL-' + (log.ref || 'logement') + '.pdf';

  return { filename, base64, mimeType: 'application/pdf' };
}

// ────────────────────────────────────────────────────────────────────────────
// API principale (dispatch)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch par type d'email.
 *
 * @param {string} type — Code du type d'email (quittance, irl-revision, etc.)
 * @param {object} ctx — Contexte (locataire, bail, logement, entite, etc.)
 * @returns {Promise<{filename, base64, mimeType} | {error: string, supportedV1: string[]}>}
 */
export async function _emailGenPdfAttachment(type, ctx) {
  const supportedV1 = [
    'quittance', 'irl-revision',
    'decompte-regul-annuel',
    'bail-signe-final',
    'edl-entree-signe', 'edl-sortie-signe',
    'cautionnement-signe'
  ];
  // Dispatch types non supportés AVANT chargement jsPDF (pas la peine de charger pour rien)
  if (supportedV1.indexOf(type) === -1) {
    return {
      error: 'type-not-supported-v1',
      supportedV1,
      message: 'PJ auto pour le type "' + type + '" non encore supportée. Types V1 : ' + supportedV1.join(', ') + '. En attendant : joindre manuellement dans le client mail.'
    };
  }
  // v15.88 EM-2b fix — assure que jsPDF est chargé dans la fenêtre principale.
  // Idempotent : noop si déjà chargé.
  const loaded = await _ensureJsPdfLoaded();
  if (!loaded) {
    return { error: 'jspdf-not-loaded', message: 'Lib jsPDF non chargée — rafraîchis la page (Ctrl+Shift+R) ou ouvre/ferme un bail une fois pour initialiser.' };
  }
  if (type === 'quittance') return _genPdfQuittance(ctx);
  if (type === 'irl-revision') return _genPdfIrlRevision(ctx);
  if (type === 'decompte-regul-annuel') return _genPdfDecompteRegul(ctx);
  if (type === 'bail-signe-final') return _genPdfBailSigne(ctx);
  if (type === 'edl-entree-signe') return _genPdfEdlSigne(ctx, 'entree');
  if (type === 'edl-sortie-signe') return _genPdfEdlSigne(ctx, 'sortie');
  if (type === 'cautionnement-signe') return _genPdfCautionnement(ctx);
}

/**
 * Helper test : liste des types supportés (V1.0 + V1.1 EM-2c v15.89).
 */
export function _emailPdfTypesSupportedV1() {
  return [
    'quittance', 'irl-revision',
    'decompte-regul-annuel',
    'bail-signe-final',
    'edl-entree-signe', 'edl-sortie-signe',
    'cautionnement-signe'
  ];
}
