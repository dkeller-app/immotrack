import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createCandidature, loadCandidature, saveDossier, addPiece, removePiece,
  markOpened, submitCandidature, reopenForComplement, revokeCandidature, purgeCandidature
} from '../src/candidatures.js';
import { getCand, getPiece } from '../src/storage.js';

const base = { logRef: 'L1', bienLabel: 'T2 rue des Lilas', loyer: 1100, message: 'Bonjour', expDays: 14 };
const dossier = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' }, situation: { contrat:'CDI', employeur:'ACME', revenus:3200 }, garant: null };

describe('candidatures', () => {
  it('createCandidature génère un linkId 64 hex, status open, expiresAt cohérent', async () => {
    const { linkId, candidature } = await createCandidature(env, base);
    expect(linkId).toMatch(/^[0-9a-f]{64}$/);
    expect(candidature.status).toBe('open');
    expect(candidature.dossier).toBeNull();
    expect(candidature.pieces).toEqual([]);
    expect(new Date(candidature.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('saveDossier enregistre le dossier, status reste open', async () => {
    const { linkId } = await createCandidature(env, base);
    const c = await saveDossier(env, linkId, dossier);
    expect(c.dossier.identite.nom).toBe('Moreau');
    expect(c.status).toBe('open');
  });

  it('addPiece stocke les octets + meta, removePiece les retire', async () => {
    const { linkId } = await createCandidature(env, base);
    const bytes = new Uint8Array([0x25,0x50,0x44,0x46,1,2]);
    const { pieceId, candidature } = await addPiece(env, linkId, { categorie:'identite', filename:'cni.pdf', contentType:'application/pdf', bytes });
    expect(candidature.pieces).toHaveLength(1);
    expect(candidature.pieces[0].pieceId).toBe(pieceId);
    expect(new Uint8Array(await getPiece(env, linkId, pieceId))).toEqual(bytes);
    const after = await removePiece(env, linkId, pieceId);
    expect(after.pieces).toHaveLength(0);
    expect(await getPiece(env, linkId, pieceId)).toBeNull();
  });

  it('markOpened pose openedAt une seule fois', async () => {
    const { linkId } = await createCandidature(env, base);
    const c1 = await markOpened(env, linkId);
    expect(c1.openedAt).toBeTruthy();
    const c2 = await markOpened(env, linkId);
    expect(c2.openedAt).toBe(c1.openedAt);
  });

  it('submitCandidature passe open → submitted', async () => {
    const { linkId } = await createCandidature(env, base);
    await saveDossier(env, linkId, dossier);
    const c = await submitCandidature(env, linkId);
    expect(c.status).toBe('submitted');
    expect(c.submittedAt).toBeTruthy();
  });

  it('reopenForComplement passe submitted → open + note', async () => {
    const { linkId } = await createCandidature(env, base);
    await saveDossier(env, linkId, dossier);
    await submitCandidature(env, linkId);
    const c = await reopenForComplement(env, linkId, 'Merci d\'ajouter le contrat');
    expect(c.status).toBe('open');
    expect(c.complementNote).toBe('Merci d\'ajouter le contrat');
  });

  it('revokeCandidature passe status → revoked', async () => {
    const { linkId } = await createCandidature(env, base);
    expect((await revokeCandidature(env, linkId)).status).toBe('revoked');
  });

  it('purgeCandidature supprime meta + toutes les pièces', async () => {
    const { linkId } = await createCandidature(env, base);
    const { pieceId } = await addPiece(env, linkId, { categorie:'identite', filename:'a.pdf', contentType:'application/pdf', bytes:new Uint8Array([0x25,0x50,0x44,0x46]) });
    await purgeCandidature(env, linkId);
    expect(await loadCandidature(env, linkId)).toBeNull();
    expect(await getPiece(env, linkId, pieceId)).toBeNull();
  });
});
