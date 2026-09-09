// Smoke end-to-end : round-trip réel (relais + tamponnage pdf-lib réel + chaînage 2 signataires).
// Exerce toute la pile fonctionnelle (routes, tokens, stockage KV miniflare, stamp.js + manifest.js +
// pdf-lib) SAUF le DOM (sign.js orchestrateur, vérifié manuellement en navigateur).
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { readFromDoc } from '../public/sign/manifest.js';
import { buildProofObject } from '../public/sign/proof.js';
import { appToken } from './_auth.js';
import { makeBailBytes, b64urlJson, signedBody } from './_fixtures.js';

async function createSession(signers, pdfBytes, bailRef = 'BAIL-E2E-001') {
  const form = new FormData();
  form.set('pdf', new File([pdfBytes], 'bail.pdf', { type: 'application/pdf' }));
  form.set('meta', JSON.stringify({ bailRef, signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${await appToken()}` }, body: form
  });
  expect(res.status).toBe(201);
  return res.json();
}

// Reproduit ce que fait sign.js (sans DOM) : lit la page de signature, confirme l'email
// (anti-transfert §5 #2), récupère le PDF, tamponne paraphes (1 par page) + signature
// finale via stamp.js, renvoie les octets signés AVEC le dossier de preuve (X-Sign-Proof).
async function signCurrentSigner(sessionId, email) {
  const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
  const token = html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  const sign = JSON.parse(html.match(/window\.__SIGN__\s*=\s*(\{.*?\});/s)[1]);

  // Étape consentement : confirmation email → emailVerifiedAt côté serveur.
  const verifyRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/verify-email`, {
    method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ email })
  });
  expect(verifyRes.status).toBe(200);
  expect((await verifyRes.json()).ok).toBe(true);

  const openedAt = new Date().toISOString();

  const pdfRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/pdf`, {
    headers: { 'X-Sign-Token': token }
  });
  expect(pdfRes.status).toBe(200);
  const bytes = new Uint8Array(await pdfRes.arrayBuffer());

  const totalPages = (await PDFDocument.load(bytes)).getPageCount();

  const proof = buildProofObject({
    signerName: 'Signataire Test', role: sign.role, sigId: sign.sigId,
    dateISO: new Date().toISOString(), consentElectronic: true, luApprouve: true,
    openedAt, readCompletedAt: new Date().toISOString()
  });
  // P0-1 : on n'envoie QUE l'image de signature (+ paraphes) ; le serveur tamponne depuis l'original.
  const postRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
    method: 'POST',
    headers: { 'X-Sign-Token': token, 'content-type': 'application/json', 'X-Sign-Proof': b64urlJson(proof) },
    body: signedBody(totalPages)
  });
  expect(postRes.status).toBe(200);
  const out = await postRes.json();
  return { sign, stampResult: out.stamp, status: out.status };
}

describe('sign e2e — round-trip réel + chaînage 2 signataires', () => {
  it('signe bailleur puis locataire, renvoie un PDF immuable (pages intactes) + manifeste préservé', async () => {
    const original = await makeBailBytes(3);
    const { sessionId, ownerToken } = await createSession([
      { role: 'bailleur', email: 'b@x.fr', ordre: 0 },
      { role: 'locataire', email: 'l@x.fr', ordre: 1 }
    ], original);

    // Signataire 1 : bailleur (sigId bailleur-0) — 3 paraphes + 1 signature = 4 tampons.
    const s1 = await signCurrentSigner(sessionId, 'b@x.fr');
    expect(s1.sign.sigId).toBe('bailleur-0');
    expect(s1.stampResult.stamped).toBe(4);
    expect(s1.stampResult.usedFallback).toBe(false);
    expect(s1.status).toBe('pending'); // il reste le locataire

    // Signataire 2 : locataire (sigId loc-0) — récupère le PDF déjà tamponné par le bailleur (chaînage).
    const s2 = await signCurrentSigner(sessionId, 'l@x.fr');
    expect(s2.sign.sigId).toBe('loc-0');
    expect(s2.stampResult.stamped).toBe(4);
    expect(s2.status).toBe('completed');

    // Dossier de preuve complet exposé au propriétaire pour les 2 signataires (§5).
    const det = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    const dossier = await det.json();
    for (const sg of dossier.signers) {
      expect(sg.proof.emailVerifiedAt).toMatch(/^20\d\d-/);
      expect(sg.proof.consentElectronic).toBe(true);
      expect(sg.proof.luApprouve).toBe(true);
      expect(sg.proof.signerName).toBe('Signataire Test');
      expect(sg.proof.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    }

    // Récupération propriétaire du PDF final.
    const resultRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    expect(resultRes.status).toBe(200);
    const finalBytes = new Uint8Array(await resultRes.arrayBuffer());

    // Immutabilité : pages d'origine intactes (aucune page ajoutée/supprimée) + manifeste préservé.
    const finalDoc = await PDFDocument.load(finalBytes);
    expect(finalDoc.getPageCount()).toBe(3);
    const manifest = readFromDoc(finalDoc);
    expect(manifest).not.toBeNull();
    expect(manifest.anchors).toHaveLength(8);
    // Le tamponnage a ajouté du contenu → fichier plus volumineux que l'original.
    expect(finalBytes.length).toBeGreaterThan(original.length);
  });

  // §6 — LE scénario qui motive la route de récupération : le bail est réellement signé, puis
  // l'app perd son ownerToken. Sans récupération, le PDF signé est définitivement hors d'atteinte.
  // On vérifie ici la chaîne complète jusqu'aux OCTETS du PDF, pas seulement le code retour.
  it('§6 — un bail SIGNÉ reste récupérable après perte de l\'ownerToken', async () => {
    const original = await makeBailBytes(2);
    // On ignore volontairement l'ownerToken renvoyé à la création : il est « perdu ».
    const { sessionId } = await createSession(
      [{ role: 'locataire', email: 'l@x.fr', ordre: 0 }],
      original
    );
    const s = await signCurrentSigner(sessionId, 'l@x.fr');
    expect(s.status).toBe('completed');

    // Sans jeton propriétaire, le résultat signé est inaccessible.
    const avant = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`);
    expect(avant.status).toBe(401);

    // Récupération par l'IDENTITÉ du créateur (pas par un jeton, qu'on n'a plus).
    const rec = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/reclaim`, {
      method: 'POST', headers: { Authorization: `Bearer ${await appToken()}` }
    });
    expect(rec.status).toBe(200);
    const { ownerToken } = await rec.json();

    const resultRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    expect(resultRes.status).toBe(200);
    const finalBytes = new Uint8Array(await resultRes.arrayBuffer());
    const finalDoc = await PDFDocument.load(finalBytes);
    expect(finalDoc.getPageCount()).toBe(2);            // c'est bien le bail, pas une page d'erreur
    expect(readFromDoc(finalDoc)).not.toBeNull();       // manifeste de signature intact
    expect(finalBytes.length).toBeGreaterThan(original.length);  // tamponné
  });

  it('mono-signataire locataire : round-trip complet → completed', async () => {
    const original = await makeBailBytes(2);
    const { sessionId, ownerToken } = await createSession(
      [{ role: 'locataire', email: 'l@x.fr', ordre: 0 }],
      original
    );
    const s = await signCurrentSigner(sessionId, 'l@x.fr');
    expect(s.sign.sigId).toBe('loc-0');
    expect(s.stampResult.stamped).toBe(3); // 2 paraphes + 1 signature
    expect(s.status).toBe('completed');

    const resultRes = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/result`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    expect(resultRes.status).toBe(200);
    const finalDoc = await PDFDocument.load(new Uint8Array(await resultRes.arrayBuffer()));
    expect(finalDoc.getPageCount()).toBe(2);
  });
});
