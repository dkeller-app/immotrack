// §6 de l'audit BAIL-SIGNE-SESSION-EXPIREE (2026-07-15) — route de récupération.
//
// PROBLÈME : l'ownerToken n'existe qu'en un seul exemplaire, remis à la création de la session
// et stocké côté app. S'il est écrasé (bug, reset, appareil perdu), le bailleur ne peut plus ni
// relire l'état ni récupérer le PDF signé : un résultat SIGNÉ devient irrécupérable.
//
// SOLUTION : le worker mémorise QUI a créé la session (`createdBy` = `sub` du jeton Supabase) et
// expose `POST /api/sessions/:id/reclaim` qui re-frappe un ownerToken pour ce même utilisateur.
//
// PORTÉE VOLONTAIRE : re-frapper n'INVALIDE PAS l'ancien jeton (jetons HMAC sans état côté serveur).
// L'objectif est la RÉCUPÉRATION d'un accès perdu, pas la révocation d'un accès fuité.
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { appToken, appAuth, PUBLIC_JWK, TEST_USER_ID, OTHER_USER_ID } from './_auth.js';
import { verifyToken } from '../src/tokens.js';
import { loadSession } from '../src/sessions.js';
import { putMeta } from '../src/storage.js';

async function createTestSession(sub = TEST_USER_ID) {
  const form = new FormData();
  form.set('pdf', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1])], { type: 'application/pdf' }), 'b.pdf');
  form.set('meta', JSON.stringify({
    bailRef: 'BAIL-RECLAIM',
    signers: [{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]
  }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: await appAuth({ sub }), body: form
  });
  expect(res.status).toBe(201);
  return res.json();
}

const reclaim = (sessionId, headers) =>
  SELF.fetch(`https://relay.test/api/sessions/${sessionId}/reclaim`, { method: 'POST', headers });

describe('POST /sessions — traçabilité du créateur', () => {
  it('mémorise createdBy = sub du jeton Supabase', async () => {
    const { sessionId } = await createTestSession(TEST_USER_ID);
    const session = await loadSession(env, sessionId);
    expect(session.createdBy).toBe(TEST_USER_ID);
  });

  it('n\'expose jamais createdBy au client (GET /api/sessions/:id)', async () => {
    const { sessionId, ownerToken } = await createTestSession();
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('createdBy');
  });
});

describe('POST /api/sessions/:id/reclaim', () => {
  it('401 sans jeton de session', async () => {
    const { sessionId } = await createTestSession();
    expect((await reclaim(sessionId, {})).status).toBe(401);
  });

  it('401 avec un jeton illisible', async () => {
    const { sessionId } = await createTestSession();
    const res = await reclaim(sessionId, { Authorization: 'Bearer pas-un-jwt' });
    expect(res.status).toBe(401);
  });

  it('404 sur session inconnue (même authentifié)', async () => {
    const res = await reclaim('a'.repeat(64), await appAuth());
    expect(res.status).toBe(404);
  });

  it('403 pour un utilisateur connecté qui n\'est pas le créateur', async () => {
    const { sessionId } = await createTestSession(TEST_USER_ID);
    const res = await reclaim(sessionId, await appAuth({ sub: OTHER_USER_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not-owner');
  });

  it('403 sur une session ANCIENNE sans createdBy (aucun preneur possible)', async () => {
    // Sessions créées avant ce chantier : personne ne peut prouver la propriété, donc
    // personne ne récupère — sinon n'importe quel compte connecté s'approprierait un bail.
    const { sessionId } = await createTestSession();
    const legacy = await loadSession(env, sessionId);
    delete legacy.createdBy;
    await putMeta(env, sessionId, legacy);

    const res = await reclaim(sessionId, await appAuth());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('no-owner-recorded');
  });

  it('200 pour le créateur : re-frappe un ownerToken valide et exploitable', async () => {
    const { sessionId, ownerToken: original } = await createTestSession(TEST_USER_ID);

    const res = await reclaim(sessionId, await appAuth({ sub: TEST_USER_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessionId).toBe(sessionId);
    expect(body.status).toBe('pending');
    // Pas d'expiresAt : la valeur de la session est figée à la création alors que le TTL KV est
    // repoussé à chaque écriture — la renvoyer induirait l'app en erreur (famille de bug du 15/07).
    expect(body).not.toHaveProperty('expiresAt');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const ver = await verifyToken(body.ownerToken, env.SIGNING_SECRET);
    expect(ver.valid).toBe(true);
    expect(ver.payload.role).toBe('owner');
    expect(ver.payload.sid).toBe(sessionId);
    expect(ver.payload.jti).not.toBe((await verifyToken(original, env.SIGNING_SECRET)).payload.jti);

    // Le jeton re-frappé ouvre réellement les routes propriétaire.
    const check = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': body.ownerToken }
    });
    expect(check.status).toBe(200);
    expect((await check.json()).bailRef).toBe('BAIL-RECLAIM');
  });

  it('récupère une session dont l\'ownerToken d\'origine a été perdu', async () => {
    // Le scénario réel : l'app n'a plus le jeton. Elle ne présente que son identité Supabase.
    const { sessionId } = await createTestSession(TEST_USER_ID);

    const sansJeton = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {});
    expect(sansJeton.status).toBe(401);

    const { ownerToken } = await (await reclaim(sessionId, await appAuth())).json();
    const apres = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    expect(apres.status).toBe(200);
  });

  it('ne modifie ni le statut ni les signataires de la session', async () => {
    const { sessionId } = await createTestSession();
    const avant = await loadSession(env, sessionId);
    await reclaim(sessionId, await appAuth());
    const apres = await loadSession(env, sessionId);
    expect(apres.status).toBe(avant.status);
    expect(apres.currentIndex).toBe(avant.currentIndex);
    expect(apres.signers).toEqual(avant.signers);
    expect(apres.createdBy).toBe(avant.createdBy);
  });

  it('reste utilisable sur une session déjà signée (le cas qui motive la route)', async () => {
    const { sessionId } = await createTestSession();
    const s = await loadSession(env, sessionId);
    s.status = 'completed';
    await putMeta(env, sessionId, s);

    const res = await reclaim(sessionId, await appAuth());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('completed');
  });

  it('refuse un jeton Supabase expiré', async () => {
    const { sessionId } = await createTestSession();
    const expire = await appToken({ expiresIn: '-1m' });
    const res = await reclaim(sessionId, { Authorization: `Bearer ${expire}` });
    expect(res.status).toBe(401);
  });

  // Ce test verrouille le SOCLE de toute la suite : depuis que le harnais fabrique lui-même les
  // jetons, la crédibilité des 170+ tests repose sur le fait que le worker vérifie réellement la
  // SIGNATURE contre le JWKS. Une régression (jwtVerify → decodeJwt, issuer/audience retirés)
  // laisserait tout le reste vert. Ici : jeton parfaitement formé, bons iss/aud/sub/kid, signé
  // par une AUTRE clé → doit être rejeté.
  it('refuse un jeton signé par une autre clé (vérification cryptographique réelle)', async () => {
    const { sessionId } = await createTestSession();
    const { generateKeyPair, SignJWT } = await import('jose');
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    const faux = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: PUBLIC_JWK.kid })   // MÊME kid que la clé légitime
      .setIssuer(`${base}/auth/v1`)
      .setAudience('authenticated')
      .setSubject(TEST_USER_ID)                                     // MÊME sub que le créateur
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const res = await reclaim(sessionId, { Authorization: `Bearer ${faux}` });
    expect(res.status).toBe(401);
  });

  it('journalise la re-frappe (trace opposable : un jeton propriétaire peut détruire le PDF signé)', async () => {
    const { sessionId } = await createTestSession(TEST_USER_ID);
    expect((await loadSession(env, sessionId)).reclaims).toBeUndefined();

    await reclaim(sessionId, await appAuth());
    await reclaim(sessionId, await appAuth());

    const { reclaims } = await loadSession(env, sessionId);
    expect(reclaims).toHaveLength(2);
    expect(reclaims[0].by).toBe(TEST_USER_ID);
    expect(reclaims[0].at).toMatch(/^20\d\d-/);
  });

  it('ne journalise RIEN quand la récupération est refusée', async () => {
    const { sessionId } = await createTestSession(TEST_USER_ID);
    await reclaim(sessionId, await appAuth({ sub: OTHER_USER_ID }));   // 403
    await reclaim(sessionId, {});                                      // 401
    expect((await loadSession(env, sessionId)).reclaims).toBeUndefined();
  });
});
