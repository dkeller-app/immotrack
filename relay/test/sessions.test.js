import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createSession, loadSession, recordSignature } from '../src/sessions.js';
import { getOriginalPdf, getSignedPdf } from '../src/storage.js';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);

async function newSession(signers) {
  return createSession(env, {
    bailRef: 'BAIL-2026-001',
    pdfBytes: PDF,
    signers
  });
}

describe('createSession', () => {
  it('crée une session pending, currentIndex 0, et stocke le PDF original', async () => {
    const { sessionId, session } = await newSession([
      { role: 'locataire', emailHash: 'h-loc', tel: '', ordre: 1 }
    ]);
    expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(session.status).toBe('pending');
    expect(session.currentIndex).toBe(0);
    expect(session.signers[0].statut).toBe('pending');
    const obj = await getOriginalPdf(env, sessionId);
    expect(obj).not.toBeNull();
  });

  it('persiste la session (loadSession la relit)', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const reloaded = await loadSession(env, sessionId);
    expect(reloaded.bailRef).toBe('BAIL-2026-001');
  });
});

describe('recordSignature (machine d\'état)', () => {
  it('marque le signataire courant done, capture la preuve, complète si dernier', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 7, 7]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes,
      proof: { ip: '1.2.3.4', userAgent: 'UA', signedAt: '2026-06-02T10:00:00Z' }
    });
    expect(updated.signers[0].statut).toBe('done');
    expect(updated.signers[0].proof.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(updated.signers[0].proof.ip).toBe('1.2.3.4');
    expect(updated.status).toBe('completed');
    const obj = await getSignedPdf(env, sessionId);
    expect(obj).not.toBeNull();
  });

  it('avance currentIndex sans compléter quand il reste un signataire', async () => {
    const { sessionId } = await newSession([
      { role: 'bailleur', emailHash: 'hb', tel: '', ordre: 1 },
      { role: 'locataire', emailHash: 'hl', tel: '', ordre: 2 }
    ]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 5]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes,
      proof: { ip: '1.1.1.1', userAgent: 'UA', signedAt: '2026-06-02T10:00:00Z' }
    });
    expect(updated.signers[0].statut).toBe('done');
    expect(updated.currentIndex).toBe(1);
    expect(updated.status).toBe('pending');
  });

  it('conserve l\'heure de chaque paraphe (page → ISO), filtrée et bornée', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes,
      proof: { ip: 'x', userAgent: 'y', signedAt: 'z' },
      clientProof: { signerName: 'Jean', parapheTimes: { 1: '2026-09-29T15:43:12.836Z', 2: '2026-09-29T15:43:33.945Z', abc: 'ignoré' } }
    });
    expect(updated.signers[0].proof.parapheTimes).toEqual({ 1: '2026-09-29T15:43:12.836Z', 2: '2026-09-29T15:43:33.945Z' });
  });

  it('conserve l\'accusé de réception des annexes (annexesRecuesAt)', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 7]),
      proof: { ip: 'x', userAgent: 'y', signedAt: 'z' },
      clientProof: { signerName: 'Jean', annexesRecuesAt: '2026-09-29T09:59:00Z' }
    });
    expect(updated.signers[0].proof.annexesRecuesAt).toBe('2026-09-29T09:59:00Z');
  });

  it('parapheTimes vaut null quand absent', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const updated = await recordSignature(env, sessionId, {
      signedBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 8]),
      proof: { ip: 'x', userAgent: 'y', signedAt: 'z' },
      clientProof: { signerName: 'Jean' }
    });
    expect(updated.signers[0].proof.parapheTimes).toBeNull();
  });

  it('refuse une 2e signature sur une session déjà completed', async () => {
    const { sessionId } = await newSession([{ role: 'locataire', emailHash: 'h', tel: '', ordre: 1 }]);
    const signedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]);
    await recordSignature(env, sessionId, { signedBytes, proof: { ip: 'x', userAgent: 'y', signedAt: 'z' } });
    await expect(
      recordSignature(env, sessionId, { signedBytes, proof: { ip: 'x', userAgent: 'y', signedAt: 'z' } })
    ).rejects.toThrow(/completed/);
  });
});
