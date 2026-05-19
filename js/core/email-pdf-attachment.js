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
    // v15.105 : scale réduite (1.5 au lieu de 2) + JPEG quality 0.85 au lieu de PNG
    // → PDF ~5-10× plus léger (de ~10 MB à ~500-1000 KB pour une quittance A4)
    const canvas = await window.html2canvas(target, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    // compress: true active la compression interne jsPDF
    const pdf = new Cls({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 16; // 8mm margin chaque côté
    const imgH = (canvas.height * imgW) / canvas.width;
    let position = 8;
    let heightLeft = imgH;
    // FAST : compression jsPDF native sur l'image (réduit encore la taille)
    pdf.addImage(imgData, 'JPEG', 8, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= (pageH - 16);
    while (heightLeft > 0) {
      position = -heightLeft + 8;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 8, position, imgW, imgH, undefined, 'FAST');
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

  // v15.106 — Vérif paiement réel (même check que window._buildQuittanceHtml)
  // pour bloquer la PJ si "non-payé". Lecture DB.mouvements pour récupérer mvsPay.
  if (typeof window !== 'undefined' && typeof window._buildQuittanceHtml === 'function') {
    try {
      const built = window._buildQuittanceHtml(q, log, ent, bail);
      if (built && built.status === 'non-paye') {
        return {
          error: 'no-payment',
          message: 'Aucun paiement enregistré pour ce mois — impossible de générer la quittance. Saisir le paiement dans les mouvements d\'abord.'
        };
      }
    } catch (_) { /* fallback */ }
  }

  // v15.106 — PDF text-natif Times qui reproduit visuellement le rendu officiel
  // (h1 bleu souligné, sections 1./2. soulignées, dotted lines, signature image).
  // Plus de html2canvas (qui produisait 10 Mo de PDF). Résultat : ~50 KB net,
  // texte sélectionnable, signature image conservée.
  return _genPdfQuittanceTextNatif(c);
}

/**
 * v15.106 EM-2d V1.2 — Quittance PDF text-natif Times NR (reproduit visuellement
 * le rendu officiel _buildQuittanceHtml). Texte sélectionnable, ~50 KB, sans flou.
 *
 * @param {object} c — ctx { locataire, bail, logement, entite, quittance }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfQuittanceTextNatif(c) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  c = c || {};
  const q = c.quittance || {};
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};

  const hc = Number(q.hc) || 0;
  const ch = Number(q.ch) || 0;
  const total = Number(q.total) || (hc + ch);
  const adrBien = bail.adrBien || log.adr || '—';

  // Ville titre (extraite du siège pour "Fait à X")
  const siegeStr = ent.siege || '';
  const villeMatch = siegeStr.match(/\d{5}\s+(.+)/);
  const ville = villeMatch ? villeMatch[1].split(',')[0].trim() : '';
  const villeTitre = ville ? ville.charAt(0).toUpperCase() + ville.slice(1).toLowerCase() : '—';

  // SIREN/RCS pour en-tête bailleur
  const siren = ent.siren ? ent.siren + (ent.rcs ? ' RCS ' + ent.rcs : '') : '';

  // Mois période (pour "période de location du X au Y")
  const moisLabel = q.mois || '—';
  const dateEmission = q.date ? _formatDateFr(q.date) : _formatDateFr(new Date().toISOString().slice(0, 10));
  const datePay = q.datePaiement ? _formatDateFr(q.datePaiement) : dateEmission;

  // Locataires (string composite avec civilité + nom + DDN si dispo)
  const locsData = bail.locataires || (bail.nom ? [{ nom: bail.nom, ddn: bail.ddn, lieuNaiss: bail.lieuNaiss, civilite: bail.civilite }] : null);
  let locataireLignes = [];
  if (locsData && locsData.length) {
    for (const l of locsData) {
      const civ = l.civilite ? l.civilite + ' ' : '';
      let line = civ + (l.nom || '—');
      if (l.ddn) line += ', né' + (l.civilite === 'Mme' ? 'e' : '') + ' le ' + _formatDateFr(l.ddn);
      if (l.lieuNaiss) line += ' à ' + l.lieuNaiss;
      line += ', demeurant ' + adrBien + ' ;';
      locataireLignes.push(line);
    }
  } else {
    locataireLignes.push((q.locataire || '—') + ', demeurant ' + adrBien + ' ;');
  }

  // Montant en lettres (helper window.numToWords si dispo, sinon fallback texte)
  const totalLettres = (typeof window !== 'undefined' && typeof window.numToWords === 'function')
    ? window.numToWords(total) : '';

  // ─── Construction PDF ────────────────────────────────────────────────────
  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const MARGIN_L = 25, MARGIN_R = 25, PAGE_W = 210, PAGE_H = 297;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  let y = 28;

  pdf.setFont('times', 'normal');

  // En-tête bailleur (top right, bold)
  pdf.setFont('times', 'bold').setFontSize(11);
  pdf.text(ent.nom || '—', PAGE_W - MARGIN_R, y, { align: 'right' });
  y += 5;
  pdf.setFont('times', 'normal').setFontSize(10);
  if (ent.type) {
    pdf.text(ent.type, PAGE_W - MARGIN_R, y, { align: 'right' }); y += 5;
  }
  if (siegeStr) {
    pdf.text(siegeStr, PAGE_W - MARGIN_R, y, { align: 'right' }); y += 5;
  }
  if (siren) {
    pdf.text(siren, PAGE_W - MARGIN_R, y, { align: 'right' }); y += 5;
  }
  if (ent.gerant) {
    pdf.text('Représentée par ' + ent.gerant, PAGE_W - MARGIN_R, y, { align: 'right' }); y += 5;
  }
  y += 8;

  // Titre h1 centré bleu souligné
  pdf.setFont('times', 'bold').setFontSize(16).setTextColor(0, 51, 153);
  const titre = 'Quittance de loyer';
  pdf.text(titre, PAGE_W / 2, y, { align: 'center' });
  const titreW = pdf.getTextWidth(titre);
  pdf.setDrawColor(0, 51, 153).setLineWidth(0.4);
  pdf.line(PAGE_W / 2 - titreW / 2, y + 1.2, PAGE_W / 2 + titreW / 2, y + 1.2);
  pdf.setTextColor(0, 0, 0).setDrawColor(0, 0, 0);
  y += 12;

  // ─── 1. Le(s) Bailleur(s) (h2 souligné) ──────────────────────────────────
  pdf.setFont('times', 'bold').setFontSize(11);
  const h2_1 = '1. Le(s) Bailleur(s)';
  pdf.text(h2_1, MARGIN_L, y);
  const h2_1W = pdf.getTextWidth(h2_1);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN_L, y + 1, MARGIN_L + h2_1W, y + 1);
  y += 6;
  pdf.setFont('times', 'normal').setFontSize(10.5);
  const bailleurText = (ent.nom || '—')
    + (ent.type ? ', ' + ent.type : '')
    + (siegeStr ? ', dont le siège social est situé ' + siegeStr : '')
    + (siren ? ', immatriculée au RCS sous le n° ' + siren : '')
    + (ent.gerant ? ', représentée par ' + ent.gerant + ' en sa qualité de Gérant, dûment habilité' : '')
    + ' ;';
  y = _writeWrappedText(pdf, bailleurText, MARGIN_L, y, CONTENT_W, 4.5);
  y += 2;
  y = _writeWrappedText(pdf, 'Désigné(s) ci-après, le « Bailleur » ;', MARGIN_L, y, CONTENT_W, 4.5);
  y = _writeWrappedText(pdf, "Et, d'autre part,", MARGIN_L, y, CONTENT_W, 4.5);
  y += 5;

  // ─── 2. Le(s) Locataire(s) (h2 souligné) ─────────────────────────────────
  pdf.setFont('times', 'bold').setFontSize(11);
  const h2_2 = '2. Le(s) Locataire(s)';
  pdf.text(h2_2, MARGIN_L, y);
  const h2_2W = pdf.getTextWidth(h2_2);
  pdf.line(MARGIN_L, y + 1, MARGIN_L + h2_2W, y + 1);
  y += 6;
  pdf.setFont('times', 'normal').setFontSize(10.5);
  for (const ll of locataireLignes) {
    y = _writeWrappedText(pdf, ll, MARGIN_L, y, CONTENT_W, 4.5);
  }
  y = _writeWrappedText(pdf, 'désigné(s) ci-après le « Locataire ».', MARGIN_L, y, CONTENT_W, 4.5);
  y += 6;

  // ─── Déclaration "Je soussigné..." ───────────────────────────────────────
  pdf.setFont('times', 'normal').setFontSize(10.5);
  let decl = 'Je soussigné(e) le Bailleur du logement sis ' + adrBien
    + ', déclare avoir reçu le ' + datePay + ' du locataire, la somme de '
    + _fmtMontant(total) + (totalLettres ? ' – ' + totalLettres : '')
    + ' se décomposant comme suit :';
  y = _writeWrappedText(pdf, decl, MARGIN_L, y, CONTENT_W, 4.8);
  y += 4;

  // ─── Tableau Loyer / Charges / Total (dotted lines) ──────────────────────
  pdf.setFont('times', 'normal').setFontSize(10.5);
  const LBL_X = MARGIN_L;
  const VAL_X = PAGE_W - MARGIN_R;
  // Loyer
  pdf.text('Loyer', LBL_X, y);
  pdf.text(_fmtMontant(hc), VAL_X, y, { align: 'right' });
  // Dotted entre label et valeur
  pdf.setLineDashPattern([0.6, 0.6], 0).setLineWidth(0.2);
  pdf.line(LBL_X + pdf.getTextWidth('Loyer') + 2, y - 0.5, VAL_X - pdf.getTextWidth(_fmtMontant(hc)) - 2, y - 0.5);
  pdf.setLineDashPattern([], 0);
  y += 5;
  // Charges
  pdf.text('Charges', LBL_X, y);
  pdf.text(_fmtMontant(ch), VAL_X, y, { align: 'right' });
  pdf.setLineDashPattern([0.6, 0.6], 0).setLineWidth(0.2);
  pdf.line(LBL_X + pdf.getTextWidth('Charges') + 2, y - 0.5, VAL_X - pdf.getTextWidth(_fmtMontant(ch)) - 2, y - 0.5);
  pdf.setLineDashPattern([], 0);
  y += 3;
  // Ligne séparation top total
  pdf.setLineWidth(0.6).setDrawColor(0, 0, 0);
  pdf.line(LBL_X, y, VAL_X, y);
  y += 5;
  // Total (bold, fontSize 12)
  pdf.setFont('times', 'bold').setFontSize(12);
  pdf.text('Total des sommes payées', LBL_X, y);
  pdf.text(_fmtMontant(total), VAL_X, y, { align: 'right' });
  y += 10;

  // ─── Phrase "Cette somme correspond..." ──────────────────────────────────
  pdf.setFont('times', 'normal').setFontSize(10.5);
  const periodeStr = _moisToPeriodeFr(moisLabel);
  const closure = 'Cette somme correspond au règlement du loyer et des charges pour la période de location '
    + periodeStr + ". J'en donne quittance sous réserve du bon encaissement de cette somme.";
  y = _writeWrappedText(pdf, closure, MARGIN_L, y, CONTENT_W, 4.8);
  y += 6;

  // ─── "Fait à X, le Y" ────────────────────────────────────────────────────
  pdf.text('Fait à ' + villeTitre + ',', MARGIN_L, y); y += 5;
  pdf.text('Le ' + dateEmission, MARGIN_L, y); y += 12;

  // ─── Signature (à droite) ────────────────────────────────────────────────
  // Bloc signature de 80mm de largeur, aligné à droite
  const SIG_W = 70;
  const SIG_X = PAGE_W - MARGIN_R - SIG_W;
  if (ent.signature) {
    try {
      // image format AUTO (jsPDF détecte PNG/JPEG depuis dataURL)
      pdf.addImage(ent.signature, SIG_X + 10, y, SIG_W - 20, 18);
      y += 20;
    } catch (e) {
      // si image échoue, laisse espace pour signature manuelle
      y += 18;
    }
  } else {
    y += 18; // espace pour signature manuelle à l'impression
  }
  // Ligne sous la signature
  pdf.setLineWidth(0.3).setDrawColor(80, 80, 80);
  pdf.line(SIG_X, y, SIG_X + SIG_W, y);
  y += 4;
  pdf.setFont('times', 'normal').setFontSize(10);
  pdf.text('Le(s) Bailleur(s)', SIG_X + SIG_W / 2, y, { align: 'center' });
  y += 10;

  // ─── Mention "Cette quittance annule..." (italique gris) ─────────────────
  pdf.setFont('times', 'italic').setFontSize(9.5).setTextColor(85, 85, 85);
  // Ligne séparation grise au-dessus de la mention
  pdf.setLineWidth(0.2).setDrawColor(180, 180, 180);
  pdf.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
  y += 4;
  const mention = "Cette quittance annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du montant du présent terme. Elle est à conserver par le locataire. Délivrée conformément à l'article 21 de la loi n° 89-462 du 6 juillet 1989.";
  y = _writeWrappedText(pdf, mention, MARGIN_L, y, CONTENT_W, 4.2);
  pdf.setTextColor(0, 0, 0);

  // ─── Sortie ──────────────────────────────────────────────────────────────
  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Quittance-' + (q.mois || 'mois').replace(/\s+/g, '-') + '-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

// Helpers internes v15.106
function _formatDateFr(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return m[3] + '/' + m[2] + '/' + m[1];
}
function _fmtMontant(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function _writeWrappedText(pdf, txt, x, y, maxWidth, lineHeight) {
  const lines = pdf.splitTextToSize(txt, maxWidth);
  for (const line of lines) {
    pdf.text(line, x, y);
    y += lineHeight;
  }
  return y;
}
function _moisToPeriodeFr(moisLabel) {
  // "mai 2026" → "du 01/05/2026 au 31/05/2026"
  if (!moisLabel) return '—';
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const parts = String(moisLabel).toLowerCase().split(' ');
  const mIdx = MOIS.indexOf(parts[0]);
  const annee = parseInt(parts[1]) || new Date().getFullYear();
  if (mIdx < 0) return moisLabel;
  const debut = new Date(annee, mIdx, 1);
  const fin = new Date(annee, mIdx + 1, 0);
  return 'du ' + debut.toLocaleDateString('fr-FR') + ' au ' + fin.toLocaleDateString('fr-FR');
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
 * Génère un décompte de régularisation des charges (art. 23 loi 1989).
 *
 * @param {object} ctx — { locataire, bail, logement, entite, annee, provisions, chargesReelles, solde, soldeSens }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfDecompteRegul(ctx) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
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

/**
 * Génère un récap du bail signé (annexe — le PDF officiel du bail reste dans Drive).
 *
 * @param {object} ctx — { locataire, bail, logement, entite }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfBailSigne(ctx) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
  const bail = c.bail || {};
  const log = c.logement || {};
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

  // Récap conditions
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

  pdf.text("Vous trouverez le contrat de bail complet (signé) et l'état des lieux d'entrée (s'il a été réalisé) " +
           "en pièce jointe séparée. N'oubliez pas de souscrire votre assurance habitation (obligation légale art. 7g loi 1989).",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 14;

  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y); y += 14;
  const ent = c.entite || {};
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y);

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Recap-bail-' + (log.ref || 'logement') + '.pdf';
  return { filename, base64, mimeType: 'application/pdf' };
}

/**
 * Génère un récap d'état des lieux (entrée ou sortie).
 * @param {string} sens 'entree' | 'sortie'
 */
async function _genPdfEdlSigne(ctx, sens) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
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
 * Génère un accusé de réception d'acte de cautionnement.
 */
async function _genPdfCautionnement(ctx) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
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
 * Génère une lettre de révision IRL PDF.
 *  - En-tête bailleur
 *  - Bloc locataire
 *  - Objet, formule politesse, détail variation IRL, table avant/après
 *  - Mention art 17-1 loi 1989
 *  - Signature
 *
 * @param {object} ctx — { locataire, bail, logement, entite, ancienHC, nouveauHC, moisApplication }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfIrlRevision(ctx) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
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
