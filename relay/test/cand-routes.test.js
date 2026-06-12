import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { verifyToken } from '../src/tokens.js';
import { putCand, getCand } from '../src/storage.js';

const PDF = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
const DOSSIER = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' }, situation:{ contrat:'CDI', employeur:'ACME', revenus:3200 }, garant:null };

async function createInvite() {
  const res = await SELF.fetch('https://relay.test/candidatures', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ logRef: 'L1', bienLabel: 'T2 Lilas', loyer: 1100, message: 'Bonjour', expDays: 14 })
  });
  return res;
}
async function candTokenOf(linkId) {
  const res = await SELF.fetch(`https://relay.test/d/${linkId}`);
  return (await res.text()).match(/window\.__CAND_TOKEN__\s*=\s*"([^"]+)"/)[1];
}

describe('POST /candidatures', () => {
  it('401 sans APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/candidatures', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ logRef:'L1', expDays:14 }) });
    expect(res.status).toBe(401);
  });
  it('201 + linkId + ownerToken cand-owner valide', async () => {
    const res = await createInvite();
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(b.linkId).toMatch(/^[0-9a-f]{64}$/);
    expect(b.candidatUrl).toContain(`/d/${b.linkId}`);
    const ver = await verifyToken(b.ownerToken, env.SIGNING_SECRET);
    expect(ver.payload.role).toBe('cand-owner');
    expect(ver.payload.lid).toBe(b.linkId);
  });
  it('400 expDays invalide', async () => {
    const res = await SELF.fetch('https://relay.test/candidatures', { method:'POST', headers:{ Authorization:`Bearer ${env.APP_KEY}`, 'content-type':'application/json'}, body: JSON.stringify({ logRef:'L1', expDays:99 }) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/ping', () => {
  it('401 sans APP_KEY', async () => {
    expect((await SELF.fetch('https://relay.test/api/ping')).status).toBe(401);
  });
  it('200 { ok:true } avec APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/api/ping', { headers: { Authorization: `Bearer ${env.APP_KEY}` } });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('GET /d/:linkId', () => {
  it('404 si inconnu', async () => expect((await SELF.fetch('https://relay.test/d/deadbeef')).status).toBe(404));
  it('sert le HTML + injecte un candToken valide', async () => {
    const { linkId } = await (await createInvite()).json();
    const res = await SELF.fetch(`https://relay.test/d/${linkId}`);
    expect(res.status).toBe(200);
    const ver = await verifyToken(await candTokenOf(linkId), env.SIGNING_SECRET);
    expect(ver.payload.role).toBe('candidat');
    expect(ver.payload.lid).toBe(linkId);
  });
});

describe('flux candidat complet', () => {
  it('dossier + pièce + submit, puis lecture bailleur + pièce + purge', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);

    const d = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, {
      method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    expect(d.status).toBe(200);

    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, {
      method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf', 'X-Piece-Categorie':'identite', 'X-Piece-Filename':'cni.pdf' }, body: PDF() });
    expect(p.status).toBe(201);
    const { pieceId } = await p.json();

    const s = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect((await s.json()).status).toBe('submitted');

    const r = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.dossier.identite.nom).toBe('Moreau');
    expect(body.pieces[0].pieceId).toBe(pieceId);

    const pb = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece/${pieceId}`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(pb.status).toBe(200);
    expect(new Uint8Array(await pb.arrayBuffer())[0]).toBe(0x25);

    const pu = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}`, { method:'DELETE', headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(pu.status).toBe(200);
    const after = await SELF.fetch(`https://relay.test/d/${invite.linkId}`);
    expect(after.status).toBe(404);
  });

  it('result 200 + status:open tant que non soumis (pas de 409 → pas de rouge console)', async () => {
    const invite = await (await createInvite()).json();
    const r = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`, { headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe('open');
  });

  it('complément D13 : reopen remet en open et ré-autorise l\'écriture', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    const ro = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/reopen`, { method:'POST', headers:{ 'X-Owner-Token': invite.ownerToken, 'content-type':'application/json' }, body: JSON.stringify({ note:'Ajoutez le contrat' }) });
    expect((await ro.json()).status).toBe('open');
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf', 'X-Piece-Categorie':'situation', 'X-Piece-Filename':'contrat.pdf' }, body: PDF() });
    expect(p.status).toBe(201);
  });

  it('reopen-self : le candidat rouvre lui-même son dossier soumis (submitted → open) + peut ré-uploader', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    const ro = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/reopen-self`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect(ro.status).toBe(200);
    expect((await ro.json()).status).toBe('open');
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf', 'X-Piece-Categorie':'autre', 'X-Piece-Filename':'extra.pdf' }, body: PDF() });
    expect(p.status).toBe(201);
  });

  it('reopen-self : 409 si pas encore soumis (état open)', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const ro = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/reopen-self`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect(ro.status).toBe(409);
    expect((await ro.json()).error).toBe('not-submitted');
  });

  it('reopen-self : 410 si révoqué par le bailleur (le candidat ne peut plus rouvrir)', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(DOSSIER) });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/revoke`, { method:'POST', headers:{ 'X-Owner-Token': invite.ownerToken } });
    const ro = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/reopen-self`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect(ro.status).toBe(410);
  });

  it('submit refusé 400 si dossier jamais renseigné (contournement JS)', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const s = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect(s.status).toBe(400);
    expect((await s.json()).error).toBe('identite-missing');
  });

  it('submit refusé 400 si revenus absents (identité seule, contournement JS)', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const partial = { identite:{ civilite:'M.', nom:'Durand', prenom:'Jean', ddn:'1985-05-05', lieuNaiss:'Paris', tel:'0600000000', email:'j@x.fr' }, situation:{ contrat:'CDI', employeur:'', revenus:0 }, garant:null };
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/json' }, body: JSON.stringify(partial) });
    const s = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, { method:'POST', headers:{ 'X-Cand-Token': tok } });
    expect(s.status).toBe(400);
    expect((await s.json()).error).toBe('revenus-missing');
  });

  it('revoke rend le lien 410', async () => {
    const invite = await (await createInvite()).json();
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/revoke`, { method:'POST', headers:{ 'X-Owner-Token': invite.ownerToken } });
    expect((await SELF.fetch(`https://relay.test/d/${invite.linkId}`)).status).toBe(410);
  });

  it('upload non conforme rejeté 400', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const p = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, { method:'POST', headers:{ 'X-Cand-Token': tok, 'content-type':'application/pdf' }, body: new Uint8Array([1,2,3,4]) });
    expect(p.status).toBe(400);
  });
});

describe('frontières d\'authz candidature', () => {
  it('token croisé (lien A sur lien B) → 401', async () => {
    const inviteA = await (await createInvite()).json();
    const inviteB = await (await createInvite()).json();
    const tokA = await candTokenOf(inviteA.linkId);
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${inviteB.linkId}`, {
      headers: { 'X-Cand-Token': tokA }
    });
    expect(res.status).toBe(401);
  });

  it('mauvais rôle : token cand-owner utilisé comme X-Cand-Token → 401', async () => {
    const invite = await (await createInvite()).json();
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}`, {
      headers: { 'X-Cand-Token': invite.ownerToken }
    });
    expect(res.status).toBe(401);
  });

  it('mauvais rôle : token candidat utilisé comme X-Owner-Token → 401', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`, {
      headers: { 'X-Owner-Token': tok }
    });
    expect(res.status).toBe(401);
  });

  it('token candidat absent → 401', async () => {
    const invite = await (await createInvite()).json();
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}`);
    expect(res.status).toBe(401);
  });

  it('token owner absent → 401', async () => {
    const invite = await (await createInvite()).json();
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/result`);
    expect(res.status).toBe(401);
  });

  it('lien expiré → 410 (branche candidature-expirée, pas token-expiré)', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    const c = await getCand(env, invite.linkId);
    c.expiresAt = new Date(Date.now() - 1000).toISOString();
    await putCand(env, invite.linkId, c, 60);
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}`, {
      headers: { 'X-Cand-Token': tok }
    });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('expired');
  });

  it('écriture sur dossier soumis → 409 not-open', async () => {
    const invite = await (await createInvite()).json();
    const tok = await candTokenOf(invite.linkId);
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/dossier`, {
      method: 'POST', headers: { 'X-Cand-Token': tok, 'content-type': 'application/json' }, body: JSON.stringify(DOSSIER)
    });
    await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/submit`, {
      method: 'POST', headers: { 'X-Cand-Token': tok }
    });
    const res = await SELF.fetch(`https://relay.test/api/candidatures/${invite.linkId}/piece`, {
      method: 'POST',
      headers: { 'X-Cand-Token': tok, 'content-type': 'application/pdf', 'X-Piece-Categorie': 'situation', 'X-Piece-Filename': 'tard.pdf' },
      body: PDF()
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not-open');
  });
});
