// __tests__/helpers/relay-client.test.js
import { describe, it, expect } from 'vitest';
import {
  normalizeBase, buildCandidatUrl, relayConfigured, buildInvitationPayload,
  _relayDossierVersCandidat, relayCreateInvitation, relayFetchResult, relayPing
} from '../../js/core/relay-client.js';

describe('normalizeBase', () => {
  it('retire les slashs finaux', () => {
    expect(normalizeBase('https://r.dev/')).toBe('https://r.dev');
    expect(normalizeBase('https://r.dev///')).toBe('https://r.dev');
    expect(normalizeBase('  https://r.dev  ')).toBe('https://r.dev');
  });
  it('vide → chaîne vide', () => expect(normalizeBase(null)).toBe(''));
});

describe('buildCandidatUrl', () => {
  it('compose base + /d/linkId', () => {
    expect(buildCandidatUrl('https://r.dev/', 'abc123')).toBe('https://r.dev/d/abc123');
  });
});

describe('relayConfigured', () => {
  it('exige base ET getToken', () => {
    const gt = async () => 'tok';
    expect(relayConfigured({ base: 'https://r.dev', getToken: gt })).toBe(true);
    expect(relayConfigured({ base: 'https://r.dev' })).toBe(false);
    expect(relayConfigured({ base: '', getToken: gt })).toBe(false);
    expect(relayConfigured(null)).toBe(false);
  });
});

describe('buildInvitationPayload', () => {
  it('valide et normalise', () => {
    const p = buildInvitationPayload({ logRef: 'L1', bienLabel: 'T2', loyer: '1100', expDays: 30 });
    expect(p).toEqual({ logRef: 'L1', bienLabel: 'T2', loyer: 1100, message: '', expDays: 30 });
  });
  it('expDays par défaut = 14', () => {
    expect(buildInvitationPayload({ logRef: 'L1' }).expDays).toBe(14);
  });
  it('rejette logRef vide', () => expect(() => buildInvitationPayload({ logRef: '' })).toThrow());
  it('rejette expDays hors liste', () => expect(() => buildInvitationPayload({ logRef: 'L1', expDays: 99 })).toThrow());
});

describe('_relayDossierVersCandidat', () => {
  const result = {
    logRef: 'L9', submittedAt: '2026-06-03T10:00:00Z',
    dossier: {
      identite: { civilite: 'Mme', nom: 'Moreau', prenom: 'Camille', ddn: '1990-01-01', lieuNaiss: 'Lyon', tel: '0600', email: 'c@x.fr', adresseActuelle: '9 rue X' },
      situation: { contrat: 'CDI', employeur: 'ACME', revenus: 3200 },
      garant: { nom: 'Jean Moreau', adresse: '9 rue X', ddn: '1961-11-03', lieuNaiss: 'St-Étienne' }
    },
    pieces: [{ pieceId: 'p1', categorie: 'identite', filename: 'cni.pdf' }]
  };
  const c = _relayDossierVersCandidat(result, { logRef: 'L9', entity: 'SCI' });
  it('mappe identité + renomme adresseActuelle → adressePrecedente', () => {
    expect(c.nom).toBe('Moreau'); expect(c.prenom).toBe('Camille');
    expect(c.adressePrecedente).toBe('9 rue X');
  });
  it('mappe situation avec revenus numérique', () => {
    expect(c.contrat).toBe('CDI'); expect(c.revenus).toBe(3200); expect(typeof c.revenus).toBe('number');
  });
  it('mappe garant + renomme lieuNaiss → lieu', () => {
    expect(c.garant.nom).toBe('Jean Moreau'); expect(c.garant.lieu).toBe('St-Étienne');
  });
  it('marque la provenance lien + statut reçu + pièces non vérifiées', () => {
    expect(c.source).toBe('lien'); expect(c.statut).toBe('recu'); expect(c.piecesCompletes).toBe(false);
  });
  it("n'injecte AUCUN score (recalculé côté app)", () => {
    expect(c.confianceScore).toBeUndefined();
  });
  it('garant absent → null', () => {
    const c2 = _relayDossierVersCandidat({ dossier: { garant: null } }, {});
    expect(c2.garant).toBeNull();
  });
  it('mappe la garantie Visale (n° de visa, trimé)', () => {
    const c2 = _relayDossierVersCandidat({ dossier: { identite:{}, visale: { visaId: '  V-2026-4827193 ' } } }, {});
    expect(c2.visale).toEqual({ visaId: 'V-2026-4827193' });
  });
  it('Visale absent ou n° vide → null', () => {
    expect(_relayDossierVersCandidat({ dossier: { identite:{} } }, {}).visale).toBeNull();
    expect(_relayDossierVersCandidat({ dossier: { identite:{}, visale: { visaId: '  ' } } }, {}).visale).toBeNull();
  });
});

describe('réseau (fetch injecté)', () => {
  it('relayCreateInvitation envoie Bearer <jeton session> et renvoie le JSON', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ linkId: 'abc', candidatUrl: 'https://r.dev/d/abc', ownerToken: 'OWN' }) }; };
    const out = await relayCreateInvitation({ base: 'https://r.dev', getToken: async () => 'JWT' }, { logRef: 'L1' }, fakeFetch);
    expect(out.linkId).toBe('abc');
    expect(seen.url).toBe('https://r.dev/candidatures');
    expect(seen.opts.headers.Authorization).toBe('Bearer JWT');
  });
  it('relayFetchResult : relais legacy 409 → {_status:409}', async () => {
    const fakeFetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'not-submitted' }) });
    const out = await relayFetchResult({ base: 'https://r.dev' }, 'abc', 'OWN', fakeFetch);
    expect(out._status).toBe(409);
  });
  it('relayFetchResult : nouveau relais 200 {status:"open"} → sentinel {_status:409} (pas de rouge console)', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'open' }) });
    const out = await relayFetchResult({ base: 'https://r.dev' }, 'abc', 'OWN', fakeFetch);
    expect(out._status).toBe(409);
  });
  it('relayFetchResult : 200 soumis → renvoie le dossier', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'submitted', linkId: 'abc', pieces: [] }) });
    const out = await relayFetchResult({ base: 'https://r.dev' }, 'abc', 'OWN', fakeFetch);
    expect(out._status).toBeUndefined();
    expect(out.status).toBe('submitted');
    expect(out.linkId).toBe('abc');
  });
  it('relayPing GET /api/ping avec Bearer <jeton session>', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ ok: true }) }; };
    const out = await relayPing({ base: 'https://r.dev', getToken: async () => 'JWT' }, fakeFetch);
    expect(out.ok).toBe(true);
    expect(seen.url).toBe('https://r.dev/api/ping');
    expect(seen.opts.headers.Authorization).toBe('Bearer JWT');
  });
});

// ── §6 audit BAIL-SIGNE-SESSION-EXPIREE — récupération d'un ownerToken perdu ────────────────
import {
  classifyOwnerPollStatus, relayReclaimSession, applyReclaimedSession
} from '../../js/core/relay-client.js';

describe('classifyOwnerPollStatus', () => {
  it('200 → ok', () => expect(classifyOwnerPollStatus(200)).toBe('ok'));
  it('401 → access-lost (jeton propriétaire écrasé, la session existe toujours)', () => {
    expect(classifyOwnerPollStatus(401)).toBe('access-lost');
  });
  it('404 → missing (base injoignable OU session purgée — jamais terminal ici)', () => {
    expect(classifyOwnerPollStatus(404)).toBe('missing');
  });
  it('toute autre erreur → other (ne déclenche aucune conclusion)', () => {
    expect(classifyOwnerPollStatus(500)).toBe('other');
    expect(classifyOwnerPollStatus(0)).toBe('other');
  });
});

describe('relayReclaimSession', () => {
  const cfg = { base: 'https://r.dev/', getToken: async () => 'jwt-supabase' };

  it('POST /api/sessions/:id/reclaim avec le jeton de session Supabase', async () => {
    let seen = null;
    const fetchImpl = async (url, opts) => {
      seen = { url, opts };
      return { ok: true, status: 200, json: async () => ({ sessionId: 'S1', ownerToken: 'neuf', status: 'pending' }) };
    };
    const out = await relayReclaimSession(cfg, 'S1', fetchImpl);
    expect(seen.url).toBe('https://r.dev/api/sessions/S1/reclaim');
    expect(seen.opts.method).toBe('POST');
    expect(seen.opts.headers.Authorization).toBe('Bearer jwt-supabase');
    // Jamais d'ownerToken dans l'URL (capacité) ni d'X-Owner-Token : on prouve l'IDENTITÉ.
    expect(seen.opts.headers['X-Owner-Token']).toBeUndefined();
    expect(out.ownerToken).toBe('neuf');
  });

  it('encode le sessionId dans l\'URL', async () => {
    let url = '';
    const fetchImpl = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({}) }; };
    await relayReclaimSession(cfg, 'a/b?c', fetchImpl);
    expect(url).toBe('https://r.dev/api/sessions/a%2Fb%3Fc/reclaim');
  });

  it('lève avec le motif relais sur 403 (pas le créateur)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: 'not-owner' }) });
    await expect(relayReclaimSession(cfg, 'S1', fetchImpl)).rejects.toThrow(/403.*not-owner/);
  });

  it('lève sur 404 (session inconnue)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) });
    await expect(relayReclaimSession(cfg, 'S1', fetchImpl)).rejects.toThrow(/404/);
  });
});

describe('applyReclaimedSession', () => {
  const base = { sessionId: 'S1', ownerToken: 'perdu', status: 'access-lost', signers: [{ ordre: 1 }] };

  it('remplace l\'ownerToken et relance le suivi', () => {
    const out = applyReclaimedSession(base, { ownerToken: 'neuf', status: 'pending' });
    expect(out.ownerToken).toBe('neuf');
    expect(out.status).toBe('sent');           // repollable → le prochain poll recalcule tout
  });

  it('ne mute pas la session d\'origine (pur)', () => {
    applyReclaimedSession(base, { ownerToken: 'neuf', status: 'pending' });
    expect(base.ownerToken).toBe('perdu');
    expect(base.status).toBe('access-lost');
  });

  it('conserve un chaînage en cours', () => {
    const rs = { ...base, status: 'chaining' };
    expect(applyReclaimedSession(rs, { ownerToken: 'neuf' }).status).toBe('chaining');
  });

  it('préserve les signataires et le reste de la session', () => {
    const out = applyReclaimedSession(base, { ownerToken: 'neuf' });
    expect(out.signers).toEqual(base.signers);
    expect(out.sessionId).toBe('S1');
  });

  it('refuse un résultat sans ownerToken (ne casse jamais la session locale)', () => {
    expect(() => applyReclaimedSession(base, {})).toThrow(/ownerToken/);
    expect(() => applyReclaimedSession(base, null)).toThrow(/ownerToken/);
  });
});
