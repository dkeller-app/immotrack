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

  // Une image de signature (tracé unique) + N images de paraphe distinctes (1 par page), embarquées à la demande.
  const sigPng = signaturePngDataUrl ? await pdfDoc.embedPng(dataUrlToBytes(signaturePngDataUrl)) : null;
  const paraCache = new Map();
  async function paraPngFor(page) {
    if (!paraphesByPage[page]) return null;
    if (!paraCache.has(page)) paraCache.set(page, await pdfDoc.embedPng(dataUrlToBytes(paraphesByPage[page])));
    return paraCache.get(page);
  }

  let stamped = 0, skipped = 0;
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
  }
  return { stamped, skipped, usedFallback };
}
