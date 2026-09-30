// Cœur de tamponnage. Reçoit le PDFDocument pdf-lib + deps.rgb en paramètre (aucun import pdf-lib).
// Paraphe ≠ signature : deux entrées distinctes (signaturePngDataUrl + paraphesByPage{page→dataURL}).
import { rectFromJsPdf, mmToPt, fallbackAnchors } from './coords.js';
import { readFromDoc } from './manifest.js';
// Texte tamponné avec la police standard Helvetica (encodage WinAnsi) : pdf-lib LÈVE sur tout caractère
// hors WinAnsi (« Ștefan », « Łukasz », « Yılmaz », espace fine U+202F…). Depuis v15.703 le nom vient du
// bail et n'est plus modifiable : une exception ici rendait la signature IMPOSSIBLE (500 à chaque essai).
// On ramène chaque caractère à sa lettre de base (Ș → S, ł → l), « ? » en dernier recours. Seule la
// MENTION tamponnée est concernée : la preuve garde le nom exact.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const LETTRE_BASE = { 'ł': 'l', 'Ł': 'L', 'ı': 'i', 'đ': 'd', 'Đ': 'D', 'ħ': 'h', 'Ħ': 'H', 'ŀ': 'l', 'Ŀ': 'L', 'ŧ': 't', 'Ŧ': 'T' };
const enWinAnsi = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch);
};
export function winAnsiSafe(text) {
  return Array.from(String(text == null ? '' : text).normalize('NFC').replace(/[ -​  　]/g, ' '))
    .map((ch) => {
      if (enWinAnsi(ch)) return ch;
      if (LETTRE_BASE[ch]) return LETTRE_BASE[ch];
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return base && Array.from(base).every(enWinAnsi) ? base : '?';
    })
    .join('');
}


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
  let lastBailPage = Math.min(pageCount, Math.max(0, ...all.filter(inRange).map((a) => a.page)) || pageCount);
  // Annexes DÉCLARÉES par l'app (manifeste.annexes : liste des pièces du DDT + 1re page d'annexe) :
  // prévaut sur la déduction par les ancres dès que la 1re page est cohérente.
  const annexes = (manifest && manifest.annexes && typeof manifest.annexes === 'object') ? manifest.annexes : null;
  const from = annexes && Number(annexes.from);
  // Garde : jamais sous une page portant une ancre de N'IMPORTE QUEL signataire (manifeste incohérent).
  if (Number.isInteger(from) && from > 1 && from <= pageCount && from - 1 >= Math.max(0, ...all.filter(inRange).map((a) => a.page))) {
    lastBailPage = from - 1;
  }
  // Ordre de LECTURE (30/09, validé Didier) : les annexes se lisent AVANT la page des signatures.
  //  • sigStart = 1re page portant une case de signature (tous signataires) — la page « Signatures » ;
  //  • lastAnchorPage = dernière page portant une case (paraphe ou signature) ;
  //  • annexStart = 1re page après la dernière case : tout ce qui suit (annexes du bail, notice, DDT)
  //    est une annexe, sans case. 0 = aucune page d'annexe.
  // Le fichier PDF, lui, garde son ordre (annexes après la page des signatures, usage d'un acte).
  const onPage = all.filter(inRange);
  const lastAnchorPage = Math.max(0, ...onPage.map((a) => a.page));
  const sigPages = onPage.filter((a) => a.kind === 'signature').map((a) => a.page);
  const sigStart = sigPages.length ? Math.min(...sigPages) : 0;
  const annexStart = lastAnchorPage && lastAnchorPage < pageCount ? lastAnchorPage + 1 : 0;
  return { paraphes, signatures, lastBailPage, pageCount, annexes, sigStart, lastAnchorPage, annexStart };
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
        page.drawText(winAnsiSafe(line), { x: r.x, y: ty, size, font, color: rgb(0.42, 0.42, 0.42) });
        ty -= size + 2;
      }
    }
    stamped++;
    if (a.kind === 'signature') signed++;
  }
  return { stamped, skipped, usedFallback, signed };
}
