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
import { readFromDoc } from '../public/sign/manifest.js';

// Annexes du DDT déclarées par l'app (manifeste.annexes) : une pièce jointe OU remise hors application
// impose l'accusé de réception du LOCATAIRE (case obligatoire de l'écran « Annexes au bail »).
export function annexesAckRequired(annexes, side) {
  return side === 'locataire' && !!annexes && Array.isArray(annexes.items)
    && annexes.items.some((it) => it && (it.statut === 'joint' || it.statut === 'hors_app'));
}
export const isIsoDate = (v) => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v));

// Produit les octets signés depuis l'original + l'image de signature du signataire courant.
// sigId / side / role / mention sont DÉRIVÉS côté serveur (même source que renderSignPage) →
// le client ne peut pas les falsifier. `dateISO` = horodatage serveur (cohérent avec la preuve).
export async function stampSignedPdf(
  originalBytes,
  { signers, idx, signaturePngDataUrl, paraphesByPage = {}, signerName, dateISO, annexesRecuesAt }
) {
  const signer = signers[idx];
  if (!signer) throw new Error('signer-not-found');
  const doc = await PDFDocument.load(originalBytes);
  const sigId = computeSigId(signers, idx);
  const side = sideOf(signer.role);
  // Contrôle AVANT tout tamponnage/sauvegarde (coût CPU) : pas d'accusé des annexes → refus explicite.
  const manifest = readFromDoc(doc);
  if (annexesAckRequired(manifest && manifest.annexes, side) && !isIsoDate(annexesRecuesAt)) {
    throw Object.assign(new Error('annexes-ack-required'), { code: 'annexes-ack-required' });
  }
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
