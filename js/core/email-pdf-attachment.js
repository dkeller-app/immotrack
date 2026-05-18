/**
 * core/email-pdf-attachment.js — EMAIL-MODAL-UX-REFONTE EM-2b v15.87
 *
 * Génère un PDF base64 prêt à attacher au MIME multipart pour `_emailToMimeBase64Url`.
 * Approche V1.0 : jsPDF natif text-based (rapide, fiable, pas de dépendance html2canvas
 * pour rendre HTML existant — celui-ci est éclaté dans `previewQuit` / `genIRLLetter` etc.
 * et serait long à factoriser). Le PDF généré est minimaliste mais contient toutes les
 * infos clés du template d'email associé.
 *
 * Une refonte V1.1 pourra utiliser html2canvas sur le rendu officiel (aperçu) si l'user
 * juge le PDF text-based insuffisant esthétiquement.
 *
 * API :
 *   _emailGenPdfAttachment(type, ctx) → Promise<{filename, base64, mimeType} | {error}>
 *
 * Types supportés V1.0 : 'quittance', 'irl-revision'.
 * Types reportés V1.1 : decompte-regul-annuel, bail-signe-final, edl-entree-signe,
 *                       edl-sortie-signe, cautionnement-signe.
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
 * Génère une quittance PDF texte minimaliste.
 *  - En-tête bailleur (entité)
 *  - Bloc locataire
 *  - Détail loyer + charges + total
 *  - Mention de quittance loi 1989
 *  - Date + signature
 *
 * @param {object} ctx — { locataire, bail, logement, entite, quittance }
 * @returns {Promise<{filename, base64, mimeType}|{error}>}
 */
async function _genPdfQuittance(ctx) {
  const Cls = _getJsPdfClass();
  if (!Cls) return { error: 'jspdf-not-loaded' };
  const c = ctx || {};
  const q = c.quittance || {};
  const bail = c.bail || {};
  const log = c.logement || {};
  const ent = c.entite || {};
  const loc = c.locataire || {};

  const pdf = new Cls({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const MARGIN = 20;
  const PAGE_W = 210;
  let y = MARGIN;

  // En-tête bailleur
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(ent.nom || '—', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  if (ent.siege) { pdf.text(ent.siege, MARGIN, y); y += 5; }
  if (ent.gerant) { pdf.text('Représenté(e) par : ' + ent.gerant, MARGIN, y); y += 5; }
  y += 4;

  // Date émission
  const dateEmission = (q.date || (new Date()).toISOString().slice(0, 10));
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text('Fait le ' + dateEmission, PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  // Titre
  pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(0, 51, 153);
  pdf.text('Quittance de loyer', PAGE_W / 2, y, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  y += 8;
  pdf.setFont('helvetica', 'italic').setFontSize(10);
  pdf.text((q.mois || '—') + ' · ' + (bail.adrBien || log.adr || '—'), PAGE_W / 2, y, { align: 'center' });
  y += 12;

  // Bloc Locataire
  pdf.setFont('helvetica', 'bold').setFontSize(11);
  pdf.text('Locataire', MARGIN, y); y += 5;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  pdf.text(_civNom(loc) || (loc.nom || '—'), MARGIN, y); y += 5;
  if (bail.adrBien) { pdf.text(bail.adrBien, MARGIN, y); y += 5; }
  y += 6;

  // Détail des sommes
  const hc = Number(q.hc) || 0;
  const ch = Number(q.ch) || 0;
  const total = Number(q.total) || (hc + ch);

  pdf.setFont('helvetica', 'normal').setFontSize(10.5);
  pdf.text("Je soussigné(e) Bailleur du logement sis " + (bail.adrBien || log.adr || '—'), MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 5;
  pdf.text("déclare avoir reçu du Locataire la somme de " + _fmt(total) + ", se décomposant comme suit :", MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 8;

  // Table compacte
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

  // Mention loi 1989
  pdf.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(60, 60, 60);
  pdf.text("Cette quittance correspond au règlement du loyer et des charges pour la période de location indiquée. " +
           "Elle est délivrée sous réserve du bon encaissement de cette somme et conformément à l'article 21 de la loi n° 89-462 du 6 juillet 1989. " +
           "Elle annule tous les reçus qui auraient pu être établis précédemment pour le même terme.",
           MARGIN, y, { maxWidth: PAGE_W - 2 * MARGIN });
  y += 18;

  // Signature
  pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0, 0, 0);
  pdf.text('Le Bailleur,', PAGE_W - MARGIN - 60, y, { align: 'left' });
  y += 14;
  pdf.text(ent.gerant || ent.nom || '—', PAGE_W - MARGIN - 60, y, { align: 'left' });

  const blob = pdf.output('blob');
  const base64 = await _blobToBase64(blob);
  const filename = 'Quittance-' + (q.mois || 'mois').replace(/\s+/g, '-') + '-' + (log.ref || 'logement') + '.pdf';

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
  const supportedV1 = ['quittance', 'irl-revision'];
  // Dispatch types non supportés AVANT chargement jsPDF (pas la peine de charger pour rien)
  if (type !== 'quittance' && type !== 'irl-revision') {
    return {
      error: 'type-not-supported-v1',
      supportedV1,
      message: 'PJ auto pour le type "' + type + '" reportée V1.1 (' + supportedV1.join(', ') + ' supportés V1.0). En attendant : joindre manuellement dans le client mail.'
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
}

/**
 * Helper test : list des types supportés V1.0.
 */
export function _emailPdfTypesSupportedV1() {
  return ['quittance', 'irl-revision'];
}
