// Fixtures partagés pour les tests de signature (P0-1 : tamponnage serveur).
// DRY : un seul vrai PDF pdf-lib (avec manifeste bailleur-0/loc-0) + le corps JSON du POST /signed.
import { PDFDocument } from 'pdf-lib';
import { embedInDoc } from '../public/sign/manifest.js';

// 1×1 PNG transparent valide (fausse signature / faux paraphe).
export const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Vrai bail pdf-lib avec manifeste (paraphes par page + signature finale pour les 2 côtés).
export async function makeBailBytes(pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont('Helvetica');
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595.28, 841.89]);
    p.drawText(`Bail de location — page ${i}/${pages}`, { x: 50, y: 780, size: 18, font });
  }
  const anchors = [];
  for (let p = 1; p <= pages; p++) {
    anchors.push({ sigId: 'bailleur-0', kind: 'paraphe', page: p, x: 15, y: 279.5, w: 70, h: 14 });
    anchors.push({ sigId: 'loc-0', kind: 'paraphe', page: p, x: 125, y: 279.5, w: 70, h: 14 });
  }
  anchors.push({ sigId: 'bailleur-0', kind: 'signature', page: pages, x: 15, y: 210, w: 90, h: 30, luApprouve: true });
  anchors.push({ sigId: 'loc-0', kind: 'signature', page: pages, x: 110, y: 210, w: 90, h: 30, luApprouve: true });
  embedInDoc(doc, { v: 1, totalPages: pages, anchors });
  return doc.save();
}

// base64url(JSON UTF-8), symétrique du décodage relais (X-Sign-Proof) — comme sign.js.
export function b64urlJson(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Corps JSON du POST /signed (nouveau contrat : le client envoie son image de signature + paraphes,
// jamais les octets du document — le serveur tamponne depuis l'original stocké).
export function signedBody(pages = 2) {
  const paraphesByPage = {};
  for (let p = 1; p <= pages; p++) paraphesByPage[p] = PNG_1x1;
  return JSON.stringify({ signaturePngDataUrl: PNG_1x1, paraphesByPage });
}
