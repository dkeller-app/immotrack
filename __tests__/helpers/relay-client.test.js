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
  it('exige base ET appKey', () => {
    expect(relayConfigured({ base: 'https://r.dev', appKey: 'k' })).toBe(true);
    expect(relayConfigured({ base: 'https://r.dev', appKey: '' })).toBe(false);
    expect(relayConfigured({ base: '', appKey: 'k' })).toBe(false);
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
});

describe('réseau (fetch injecté)', () => {
  it('relayCreateInvitation envoie Bearer APP_KEY et renvoie le JSON', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ linkId: 'abc', candidatUrl: 'https://r.dev/d/abc', ownerToken: 'OWN' }) }; };
    const out = await relayCreateInvitation({ base: 'https://r.dev', appKey: 'SECRET' }, { logRef: 'L1' }, fakeFetch);
    expect(out.linkId).toBe('abc');
    expect(seen.url).toBe('https://r.dev/candidatures');
    expect(seen.opts.headers.Authorization).toBe('Bearer SECRET');
  });
  it('relayFetchResult renvoie {_status:409} si pas encore soumis', async () => {
    const fakeFetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'not-submitted' }) });
    const out = await relayFetchResult({ base: 'https://r.dev' }, 'abc', 'OWN', fakeFetch);
    expect(out._status).toBe(409);
  });
  it('relayPing GET /api/ping avec Bearer APP_KEY', async () => {
    let seen;
    const fakeFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ ok: true }) }; };
    const out = await relayPing({ base: 'https://r.dev', appKey: 'SECRET' }, fakeFetch);
    expect(out.ok).toBe(true);
    expect(seen.url).toBe('https://r.dev/api/ping');
    expect(seen.opts.headers.Authorization).toBe('Bearer SECRET');
  });
});
