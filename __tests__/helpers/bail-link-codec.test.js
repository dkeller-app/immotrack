/**
 * Tests bail-link-codec (BAIL-SIGNATURE-DISTANCE Session 2, v15.226)
 * Couverture : encode/decode round-trip, token vérification, expiration,
 * email vérification, taille URL, cas pathologiques.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeBailLink, decodeBailLink, verifyToken,
  formatExpiration, checkLinkSize
} from './bail-link-codec.js';

// ─── Fixtures ────────────────────────────────────────────────────
const makeBail = (over = {}) => ({
  ref: 'LOG-101',
  entity: 'SCI Dupont',
  hc: 750, ch: 90, dg: 750,
  debut: '2026-06-01', fin: '2029-05-31',
  type: 'nu',
  locataires: [{ civilite: 'Mme', nom: 'HENRI', prenom: 'Pascale',
    tel: '06 22 33 44 55', email: 'henri.pascale@example.com' }],
  signatures: {
    signedBailleurAt: '2026-05-28T10:00:00Z',
    bailSnapshot: { capturedAt: '2026-05-28T10:00:00Z' }
  },
  ...over
});

const makeLog = (over = {}) => ({
  ref: 'LOG-101',
  entity: 'SCI Dupont',
  imm: 'Résidence Test',
  type: 'T3', surf: 65, npp: 3, etage: '3',
  ...over
});

// ─── Round-trip encode / decode ──────────────────────────────────
describe('encodeBailLink + decodeBailLink — round-trip', () => {
  it('encode et redécode un bail simple sans perte', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    expect(r.url).toContain('sign.html');
    expect(r.fragment).toContain('#v=1');
    expect(r.token).toMatch(/^[0-9a-f]{16}$/);
    expect(r.emailHash).toMatch(/^[0-9a-f]{8}$/);

    const d = await decodeBailLink(r.fragment);
    expect(d.payload.v).toBe(1);
    expect(d.payload.bail.ref).toBe('LOG-101');
    expect(d.payload.bail.locataires[0].nom).toBe('HENRI');
    expect(d.payload.log.imm).toBe('Résidence Test');
    expect(d.payload.signer).toBe('locataire');
    expect(d.token).toBe(r.token);
  });

  it('préserve les signatures bailleur si fournies', async () => {
    const bailleurSig = {
      paraphes: ['data:image/png;base64,iVBORw0KGgoA…', 'data:image/png;base64,iVBORw0…'],
      finale: 'data:image/png;base64,iVBORw0KGgoA…',
      signedAt: '2026-05-28T10:00:00Z',
      luApprouve: true
    };
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      bailleurSignature: bailleurSig,
      signerEmail: 'henri.pascale@example.com'
    });
    const d = await decodeBailLink(r.fragment);
    expect(d.payload.bailleurSig.luApprouve).toBe(true);
    expect(d.payload.bailleurSig.paraphes).toHaveLength(2);
    expect(d.payload.bailleurSig.finale).toContain('iVBORw0');
  });

  it('email normalisé (lowercase + trim)', async () => {
    const r1 = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: '  HENRI.PASCALE@example.COM  '
    });
    const r2 = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    // Token identique car même bail + même exp (à approx 1ms près)
    // → on vérifie le hash email seulement
    expect(r1.emailHash).toBe(r2.emailHash);
  });
});

// ─── Token vérification ─────────────────────────────────────────
describe('verifyToken — email destinataire', () => {
  it('email correct → vérification OK', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    const d = await decodeBailLink(r.fragment);
    const ok = await verifyToken(d.rawData, 'henri.pascale@example.com', d.exp, d.token);
    expect(ok).toBe(true);
  });

  it('email incorrect → vérification refusée', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    const d = await decodeBailLink(r.fragment);
    const ko = await verifyToken(d.rawData, 'autre.personne@example.com', d.exp, d.token);
    expect(ko).toBe(false);
  });

  it('email normalisé (majuscules/espaces) → vérification OK', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    const d = await decodeBailLink(r.fragment);
    const ok = await verifyToken(d.rawData, '  HENRI.PASCALE@EXAMPLE.COM  ', d.exp, d.token);
    expect(ok).toBe(true);
  });

  it('inputs invalides → refusé silencieusement', async () => {
    expect(await verifyToken('', 'a@b.c', 1000, 'xxx')).toBe(false);
    expect(await verifyToken('data', '', 1000, 'xxx')).toBe(false);
    expect(await verifyToken('data', 'a@b.c', 0, 'xxx')).toBe(false);
    expect(await verifyToken('data', 'a@b.c', 1000, '')).toBe(false);
  });
});

// ─── Expiration ──────────────────────────────────────────────────
describe('Expiration', () => {
  it('lien valide pendant 7 jours par défaut', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    const expectedExp = Date.now() + (7 * 86400000);
    // Tolérance 1s pour exécution
    expect(Math.abs(r.exp - expectedExp)).toBeLessThan(1000);
  });

  it('expiration personnalisable', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com',
      expiresInDays: 30
    });
    const expectedExp = Date.now() + (30 * 86400000);
    expect(Math.abs(r.exp - expectedExp)).toBeLessThan(1000);
  });

  it('lien expiré → decodeBailLink throw', async () => {
    // Forge un fragment avec exp dans le passé
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    // Remplace exp dans le fragment par 1 jour passé
    const pastExp = Date.now() - 86400000;
    const expired = r.fragment.replace(/exp=\d+/, 'exp=' + pastExp);
    await expect(decodeBailLink(expired)).rejects.toThrow(/expiré/i);
  });

  it('formatExpiration retourne date FR', () => {
    const exp = new Date('2026-12-25T10:00:00Z').getTime();
    const str = formatExpiration(exp);
    expect(str).toMatch(/d[ée]cembre/i);
    expect(str).toContain('2026');
  });
});

// ─── Compression efficacité ──────────────────────────────────────
describe('Compression gzip', () => {
  it('bail simple est compressé (ratio < 80%)', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    expect(r._ratio).toBeLessThan(0.8);
    expect(r._compressedSize).toBeLessThan(r._jsonSize);
  });

  it('bail complexe avec mobilier reste sous 8 KB (mobile-safe)', async () => {
    const bailComplexe = makeBail({
      mobilier: {
        litterie: { details: 'Lit double avec sommier et matelas Bultex 160x200' },
        rangement: { details: 'Armoire 3 portes IKEA Pax 200x60x236' },
        electroDom: { details: 'Lave-linge, frigo double porte, micro-ondes, plaques induction, hotte' },
        cuisine: { details: 'Vaisselle 6 personnes, casseroles, poêles, ustensiles complets' }
      },
      notes: 'Bail signé après visite du 28/05. Locataire a vu l\'EDL en présence du gestionnaire. ' +
             'Toutes clauses standard, pas de modification particulière sauf clause 9bis solidarité activée.'
    });
    const r = await encodeBailLink({
      bail: bailComplexe, log: makeLog(),
      signerEmail: 'henri.pascale@example.com'
    });
    // 8 KB = limite safe mobile
    expect(r.sizeBytes).toBeLessThan(8000);
  });
});

// ─── Taille URL ──────────────────────────────────────────────────
describe('checkLinkSize — niveaux ok/warn/err', () => {
  it('< 2 KB → ok tous navigateurs', () => {
    const c = checkLinkSize(1500);
    expect(c.level).toBe('ok');
    expect(c.maxBrowser).toBe('tous');
  });

  it('2-8 KB → ok desktop + mobile', () => {
    const c = checkLinkSize(5000);
    expect(c.level).toBe('ok');
    expect(c.maxBrowser).toContain('mobile');
  });

  it('8-32 KB → warn (mobile risqué)', () => {
    const c = checkLinkSize(20000);
    expect(c.level).toBe('warn');
  });

  it('> 32 KB → err (limite navigateur)', () => {
    const c = checkLinkSize(40000);
    expect(c.level).toBe('err');
    expect(c.maxBrowser).toContain('PJ');
  });
});

// ─── Cas pathologiques ──────────────────────────────────────────
describe('Cas pathologiques + defensive', () => {
  it('encode sans bail → throw', async () => {
    await expect(encodeBailLink({ log: makeLog(), signerEmail: 'a@b.c' })).rejects.toThrow(/bail/);
  });

  it('encode sans log → throw', async () => {
    await expect(encodeBailLink({ bail: makeBail(), signerEmail: 'a@b.c' })).rejects.toThrow(/log/);
  });

  it('encode sans email → throw', async () => {
    await expect(encodeBailLink({ bail: makeBail(), log: makeLog() })).rejects.toThrow(/signerEmail/);
  });

  it('decode fragment vide → throw', async () => {
    await expect(decodeBailLink('')).rejects.toThrow(/fragment/);
    await expect(decodeBailLink(null)).rejects.toThrow(/fragment/);
  });

  it('decode fragment sans data → throw', async () => {
    await expect(decodeBailLink('#v=1&t=abc&exp=9999999999999')).rejects.toThrow(/data/);
  });

  it('decode fragment sans token → throw', async () => {
    await expect(decodeBailLink('#v=1&data=xyz&exp=9999999999999')).rejects.toThrow(/token/);
  });

  it('decode fragment version non supportée → throw', async () => {
    await expect(decodeBailLink('#v=99&data=xyz&t=abc&exp=9999999999999')).rejects.toThrow(/version/);
  });

  it('decode fragment data corrompu → throw', async () => {
    await expect(decodeBailLink('#v=1&data=CORROMPU!@#$&t=abc&exp=9999999999999')).rejects.toThrow();
  });

  it('multi-locataires : encode chacun avec son propre email', async () => {
    const bailMulti = makeBail({
      locataires: [
        { civilite: 'M.', nom: 'DUPONT', email: 'dupont@a.fr' },
        { civilite: 'Mme', nom: 'MARTIN', email: 'martin@b.fr' }
      ]
    });
    const r1 = await encodeBailLink({ bail: bailMulti, log: makeLog(), signerEmail: 'dupont@a.fr' });
    const r2 = await encodeBailLink({ bail: bailMulti, log: makeLog(), signerEmail: 'martin@b.fr' });
    // Tokens DIFFÉRENTS car emails différents
    expect(r1.token).not.toBe(r2.token);
    expect(r1.emailHash).not.toBe(r2.emailHash);
  });

  it('returnEmail vide accepté', async () => {
    const r = await encodeBailLink({
      bail: makeBail(), log: makeLog(),
      signerEmail: 'henri.pascale@example.com',
      returnEmail: ''
    });
    const d = await decodeBailLink(r.fragment);
    expect(d.payload.ret).toBe('');
  });
});
