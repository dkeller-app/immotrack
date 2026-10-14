// js/core/lecture-pieces.js — VERIF-DOCUMENTS lots 1-2 (v15.740 provisoire).
// Lecture LOCALE d'une pièce (PDF ou image) pour les vérifications : codes 2D-Doc (DataMatrix), couche texte,
// informations internes du PDF. Rien ne quitte l'appareil.
// Les dépendances du navigateur sont INJECTÉES (pdf.js, lecteur DataMatrix, canvas) : le module reste testable
// sans DOM (__tests__/helpers/lecture-pieces.test.js, avec des doublures).
// Leçons du prototype (phase 1) : le code ne se détecte pas sur une page entière → on lit d'abord les IMAGES
// intégrées au PDF, puis la page rendue, puis des fenêtres qui se chevauchent ; rendu pdf.js avec intent « print »
// (le mode écran s'arrête quand l'onglet passe en arrière-plan).

import { compterEnregistrements, trouverSuperpositions } from './indices-pdf.js';

export const MAX_PAGES = 3;
const MAX_TEXTE = 200000;
const MAX_FENETRES = 48;

/**
 * Cherche un DataMatrix dans un canvas : l'image entière, puis des fenêtres qui se chevauchent.
 * @param {object} canvas
 * @param {(c:object)=>string|null} lire  décodeur (ZXing) appliqué à un canvas
 * @param {(w:number,h:number)=>object} creerCanvas
 */
export function chercherCode(canvas, lire, creerCanvas) {
  const plein = lire(canvas); if (plein) return plein;
  const W = canvas.width, H = canvas.height; const T = Math.round(Math.min(W, H) / 2.5); if (T < 120) return null;
  const pas = Math.round(T / 2); let n = 0;
  for (let y = 0; y < H; y += pas) for (let x = 0; x < W; x += pas) {
    if (++n > MAX_FENETRES) return null;
    const c = creerCanvas(T, T); const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, T, T); g.drawImage(canvas, x, y, T, T, 0, 0, T, T);
    const t = lire(c); if (t) return t;
  }
  return null;
}

/** Image d'un objet pdf.js (bitmap, ou pixels selon ImageKind 1/2/3) → canvas, agrandi sans lissage s'il est petit. */
export function imageVersCanvas(obj, creerCanvas) {
  const w = obj.width, h = obj.height; if (!w || !h) return null;
  const marge = Math.round(Math.max(w, h) * 0.08) + 4;
  const base = creerCanvas(w + 2 * marge, h + 2 * marge); const g = base.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, base.width, base.height);
  if (obj.bitmap) g.drawImage(obj.bitmap, marge, marge);
  else if (obj.data) {
    const id = g.createImageData(w, h); const d = obj.data, o = id.data;
    if (obj.kind === 1) {                       // GRAYSCALE_1BPP : 1 bit par pixel, lignes alignées sur l'octet, bit à 1 = blanc
      const ligne = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (d[y * ligne + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; const p = 4 * (y * w + x); o[p] = o[p + 1] = o[p + 2] = v; o[p + 3] = 255; }
    } else {
      const bpp = obj.kind === 3 ? 4 : 3;
      for (let i = 0, j = 0; i < w * h; i++, j += bpp) { o[4 * i] = d[j]; o[4 * i + 1] = d[j + 1]; o[4 * i + 2] = d[j + 2]; o[4 * i + 3] = 255; }
    }
    g.putImageData(id, marge, marge);
  } else return null;
  const min = Math.min(base.width, base.height);
  if (min >= 300) return base;
  const k = Math.ceil(300 / min); const c = creerCanvas(base.width * k, base.height * k); const gg = c.getContext('2d');
  gg.imageSmoothingEnabled = false; gg.drawImage(base, 0, 0, c.width, c.height);
  return c;
}

/**
 * @param {{octets:Uint8Array, mime:string}} fichier
 * @param {{pdfjs?:object, lire:(canvas)=>string|null, creerCanvas:(w,h)=>object, chargerImage?:(octets,mime)=>Promise<{source,largeur,hauteur}>}} deps
 * @returns {Promise<{illisible:boolean, estPdf:boolean, pages?:number, codes:string[], texte:string, metadonnees?:object, enregistrements?:number, superpositions?:Array}>}
 */
export async function analyserFichier(fichier, deps) {
  const octets = fichier && fichier.octets; const mime = String((fichier && fichier.mime) || '').toLowerCase();
  if (!octets || !octets.length) return { illisible: true, estPdf: false, codes: [], texte: '' };
  const codes = [];
  const ajouter = (t) => { if (t && !codes.includes(t)) codes.push(t); };
  if (mime === 'application/pdf') {
    if (!deps || !deps.pdfjs) throw new Error('pdf.js indisponible');
    let doc;
    try { doc = await deps.pdfjs.getDocument({ data: octets.slice(), isEvalSupported: false }).promise; }
    catch { return { illisible: true, estPdf: true, codes: [], texte: '' }; }
    try {
      let meta = {}; try { meta = ((await doc.getMetadata()) || {}).info || {}; } catch { meta = {}; }
      const items = []; let texte = '';
      const n = Math.min(doc.numPages || 0, MAX_PAGES);
      for (let p = 1; p <= n; p++) {
        const page = await doc.getPage(p);
        try {
          const tc = await page.getTextContent();
          for (const it of tc.items || []) {
            if (!it || typeof it.str !== 'string') continue;
            items.push({ page: p, str: it.str, x: it.transform ? it.transform[4] : 0, y: it.transform ? it.transform[5] : 0 });
            if (texte.length < MAX_TEXTE) texte += it.str + (it.hasEOL ? '\n' : ' | ');
          }
        } catch { /* couche texte absente : pas de comparaison */ }
        let trouve = null;
        try {
          const ops = await page.getOperatorList();
          const OPS = deps.pdfjs.OPS || {};
          for (let i = 0; i < ops.fnArray.length && !trouve; i++) {
            if (ops.fnArray[i] !== OPS.paintImageXObject && ops.fnArray[i] !== OPS.paintInlineImageXObject) continue;
            const arg = ops.argsArray[i] && ops.argsArray[i][0];
            const obj = typeof arg === 'string' ? await new Promise((res) => { try { page.objs.get(arg, res); } catch { res(null); } }) : arg;
            if (!obj || !obj.width || obj.width * obj.height > 16e6) continue;
            const c = imageVersCanvas(obj, deps.creerCanvas); if (c) trouve = chercherCode(c, deps.lire, deps.creerCanvas);
          }
        } catch { /* liste d'opérations indisponible : on passe au rendu */ }
        if (!trouve) {
          const vp1 = page.getViewport({ scale: 1 }); const k = Math.min(3, 2400 / Math.max(vp1.width, vp1.height));
          const vp = page.getViewport({ scale: k }); const c = deps.creerCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise;
          trouve = chercherCode(c, deps.lire, deps.creerCanvas);
        }
        ajouter(trouve);
      }
      const enr = compterEnregistrements(octets);
      return {
        illisible: false, estPdf: true, pages: doc.numPages || 0, codes, texte,
        metadonnees: { producteur: String(meta.Producer || '').slice(0, 120), createur: String(meta.Creator || '').slice(0, 120), creeLe: String(meta.CreationDate || ''), modifieLe: String(meta.ModDate || '') },
        enregistrements: enr.enregistrements, superpositions: trouverSuperpositions(items)
      };
    } finally { try { doc.destroy && doc.destroy(); } catch { /* rien */ } }
  }
  if (mime === 'image/jpeg' || mime === 'image/png') {
    let img;
    try { img = await deps.chargerImage(octets, mime); } catch { return { illisible: true, estPdf: false, codes: [], texte: '' }; }
    if (!img || !img.largeur || !img.hauteur) return { illisible: true, estPdf: false, codes: [], texte: '' };
    const k = Math.min(1, 3000 / Math.max(img.largeur, img.hauteur));
    const c = deps.creerCanvas(Math.round(img.largeur * k), Math.round(img.hauteur * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img.source, 0, 0, c.width, c.height);
    ajouter(chercherCode(c, deps.lire, deps.creerCanvas));
    return { illisible: false, estPdf: false, codes, texte: '' };
  }
  return { illisible: true, estPdf: false, codes: [], texte: '' };
}
