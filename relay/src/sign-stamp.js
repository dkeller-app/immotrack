// P0-1 (audit sécurité) — Tamponnage CÔTÉ SERVEUR du PDF signé.
//
// AVANT : le client tamponnait le PDF dans le navigateur et POSTait les octets à /signed ; le
// relais les scellait tels quels (aucune comparaison avec l'original) → un signataire pouvait
// SUBSTITUER n'importe quel PDF (autre loyer, autres clauses) et le faire sceller comme « signé ».
//
// ICI : le worker charge l'ORIGINAL qu'il a stocké à la création (hors de portée du signataire),
// lit le manifeste d'ancres embarqué, et tamponne lui-même la signature + les paraphes reçus en
// image. Le signataire ne fournit JAMAIS les octets du document → substitution impossible.
//
// DRY (règle projet : réutiliser, jamais recopier) : on réutilise EXACTEMENT le code de
// tamponnage client (public/sign/stamp.js) et les helpers purs (proof.js, sigid.js), bundlés
// par esbuild dans le worker. pdf-lib fournit PDFDocument + rgb côté serveur.
import { PDFDocument, rgb } from 'pdf-lib';
import { stampSignature } from '../public/sign/stamp.js';
import { buildMentionLines } from '../public/sign/proof.js';
import { computeSigId, sideOf } from '../public/sign/sigid.js';

// Produit les octets signés depuis l'original + l'image de signature du signataire courant.
// sigId / side / role / mention sont DÉRIVÉS côté serveur (même source que renderSignPage) →
// le client ne peut pas les falsifier. `dateISO` = horodatage serveur (cohérent avec la preuve).
export async function stampSignedPdf(
  originalBytes,
  { signers, idx, signaturePngDataUrl, paraphesByPage = {}, signerName, dateISO }
) {
  const signer = signers[idx];
  if (!signer) throw new Error('signer-not-found');
  const doc = await PDFDocument.load(originalBytes);
  const sigId = computeSigId(signers, idx);
  const side = sideOf(signer.role);
  const mentionLines = buildMentionLines({
    signerName: signerName || signer.role,
    role: signer.role,
    dateISO
  });
  const stamp = await stampSignature(
    doc,
    { sigId, side, signaturePngDataUrl, paraphesByPage, mentionLines },
    { rgb }
  );
  const signedBytes = await doc.save();
  return { signedBytes, stamp };
}
