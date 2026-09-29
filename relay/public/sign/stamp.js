// Cœur de tamponnage. Reçoit le PDFDocument pdf-lib + deps.rgb en paramètre (aucun import pdf-lib).
// Paraphe ≠ signature : deux entrées distinctes (signaturePngDataUrl + paraphesByPage{page→dataURL}).
import { rectFromJsPdf, mmToPt, fallbackAnchors } from './coords.js';
import { readFromDoc } from './manifest.js';

export function dataUrlToBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Résout les ancres pour ce sigId : manifeste si présent, sinon repli déterministe.
function resolveAnchors(pdfDoc, { sigId, side }) {
  const manifest = readFromDoc(pdfDoc);
  if (manifest && Array.isArray(manifest.anchors)) {
    return { anchors: manifest.anchors.filter((a) => a.sigId === sigId), usedFallback: false };
  }
  const totalPages = pdfDoc.getPageCount();
  return { anchors: fallbackAnchors({ sigId, side: side || 'locataire', totalPages }), usedFallback: true };
}

// Pages (1-based) à parapher pour ce sigId — pilote le parcours page par page de sign.js.
// Dédupliquées + triées. Repli : toutes les pages quand pas de manifeste.
export function paraphePagesFor(pdfDoc, { sigId, side }) {
  const { anchors } = resolveAnchors(pdfDoc, { sigId, side });
  const pages = anchors.filter((a) => a.kind === 'paraphe').map((a) => a.page);
  return [...new Set(pages)].sort((a, b) => a - b);
}

// Pages (1-based) qui portent une zone de SIGNATURE pour ce sigId — sign.js y affiche
// un rappel « vous signerez à la dernière étape » (la signature ne se trace pas en lecture).
export function signaturePagesFor(pdfDoc, { sigId, side }) {
  const { anchors } = resolveAnchors(pdfDoc, { sigId, side });
  const pages = anchors.filter((a) => a.kind === 'signature').map((a) => a.page);
  return [...new Set(pages)].sort((a, b) => a - b);
}

// Plan de LECTURE du document défilant (page de signature) : pour CE signataire, les cases de
// paraphe (page + boîte en % de la page A4 → bouton « Parapher » posé exactement dessus), ses zones
// de signature, et la dernière page du BAIL (dernière page portant une ancre, tous signataires
// confondus) : au-delà commencent les annexes (DDT), consultables sans paraphe.
// Ancres en mm, repère jsPDF haut-gauche, page 210 × 297 (cf. coords.js) — aucune conversion ici.
export function readingPlanFor(pdfDoc, { sigId, side }) {
  const { anchors } = resolveAnchors(pdfDoc, { sigId, side });
  const manifest = readFromDoc(pdfDoc);
  const all = (manifest && Array.isArray(manifest.anchors)) ? manifest.anchors : anchors;
  const pageCount = pdfDoc.getPageCount();
  const box = (a) => ({ page: a.page, left: a.x / 210, top: a.y / 297, width: a.w / 210, height: a.h / 297 });
  const inRange = (a) => a.page >= 1 && a.page <= pageCount;
  const paraphes = anchors.filter((a) => a.kind === 'paraphe' && inRange(a)).map(box)
    .sort((a, b) => a.page - b.page)
    .filter((a, i, arr) => i === 0 || arr[i - 1].page !== a.page);   // 1 case par page
  const signatures = anchors.filter((a) => a.kind === 'signature' && inRange(a)).map(box);
  const lastBailPage = Math.min(pageCount, Math.max(0, ...all.filter(inRange).map((a) => a.page)) || pageCount);
  return { paraphes, signatures, lastBailPage, pageCount };
}

export async function stampSignature(
  pdfDoc,
  { sigId, signaturePngDataUrl, paraphesByPage = {}, mentionLines = [], side },
  deps
) {
  const { rgb } = deps;
  const { anchors, usedFallback } = resolveAnchors(pdfDoc, { sigId, side });
  const font = await pdfDoc.embedFont('Helvetica');
  const pad = mmToPt(1);
  const pageCount = pdfDoc.getPageCount();

  // Une image de signature (tracé unique) + les images de paraphe, embarquées à la demande. Cache par
  // IMAGE (pas par page) : un paraphe tracé une fois puis apposé sur 27 pages n'est stocké qu'une fois.
  const sigPng = signaturePngDataUrl ? await pdfDoc.embedPng(dataUrlToBytes(signaturePngDataUrl)) : null;
  const paraCache = new Map();
  async function paraPngFor(page) {
    const url = paraphesByPage[page];
    if (!url) return null;
    if (!paraCache.has(url)) paraCache.set(url, await pdfDoc.embedPng(dataUrlToBytes(url)));
    return paraCache.get(url);
  }

  let stamped = 0, skipped = 0, signed = 0;
  for (const a of anchors) {
    if (a.page < 1 || a.page > pageCount) { skipped++; continue; }
    const img = a.kind === 'signature' ? sigPng : await paraPngFor(a.page);
    if (!img) { skipped++; continue; } // pas d'image pour cette ancre (page non paraphée / pas de signature)
    const page = pdfDoc.getPage(a.page - 1);
    const r = rectFromJsPdf(a, page.getHeight());
    page.drawImage(img, {
      x: r.x + pad, y: r.y + pad,
      width: Math.max(0, r.width - 2 * pad), height: Math.max(0, r.height - 2 * pad)
    });
    // Mention légale sous le bloc signature uniquement (jamais sous un paraphe).
    if (a.kind === 'signature' && mentionLines.length) {
      const size = 7;
      let ty = r.y - mmToPt(2); // juste sous la boîte (origine bas-gauche)
      for (const line of mentionLines) {
        page.drawText(line, { x: r.x, y: ty, size, font, color: rgb(0.42, 0.42, 0.42) });
        ty -= size + 2;
      }
    }
    stamped++;
    if (a.kind === 'signature') signed++;
  }
  return { stamped, skipped, usedFallback, signed };
}
