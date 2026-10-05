// __tests__/helpers/signature-parent-reel.test.js — PARAPHE-UNIQUE (contre-audit 01/10, M13 et M16).
//
// Les VRAIES fonctions de l'app (extraites d'index.html, exécutées telles quelles avec les vrais
// mirrors js/helpers/*.global.js) : on observe ce qu'elles écrivent et ce qu'elles ouvrent.
//  - _completeRemoteSignCore : au retour du relais, le bail (devenu complet) sort COMPACTÉ, format 2.
//  - openBailSignatureFlow : refuse d'ouvrir la signature si la version servie est plus récente.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { parapheCarte, FORMAT_SIGNATURES } from '../../js/core/bail-paraphes.js';
import { MSG_VERSION_SIGNER, MSG_FORMAT_INCONNU } from '../../js/core/version-app.js';

const SRC = fs.readFileSync('index.html', 'utf8');
const VERSION = /const IMMOTRACK_VERSION = '([0-9.]+)'/.exec(SRC)[1];
const PLUS_RECENTE = VERSION.replace(/(\d+)$/, (d) => String(+d + 1).padStart(d.length, '0'));

/** Source d'une fonction de premier niveau d'index.html (de sa déclaration à la `}` en colonne 0). */
function fonction(nom) {
  const m = new RegExp('\\n((?:async )?function ' + nom + '\\()').exec(SRC);
  if (!m) throw new Error('fonction introuvable dans index.html : ' + nom);
  const debut = m.index + 1;
  const fin = SRC.indexOf('\n}', debut);
  return SRC.slice(debut, fin + 2);
}
function contexte(extra) {
  const ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout, AbortController, Promise, ...extra });
  ctx.window = ctx;
  for (const m of ['bail-paraphes', 'version-app']) vm.runInContext(fs.readFileSync(`js/helpers/${m}.global.js`, 'utf8'), ctx);
  return ctx;
}

describe('_completeRemoteSignCore (vraie fonction) — retour du relais d’un bail mixte', () => {
  const B = 'data:image/png;base64,BAILLEUR';
  function bailMixte() {
    const paraphes = {}, parapheTimes = {};
    for (let p = 1; p <= 9; p++) { paraphes[p] = { 'bailleur-0': B }; parapheTimes[p] = { 'bailleur-0': '2026-10-01T08:00:0' + p + '.000Z' }; }
    return {
      ref: 'M-1', locataires: [{ nom: 'Loc' }], clauseIrlV: 3,
      signatures: {
        mode: 'bailleur-seul', paraphes, parapheTimes, finales: { 'bailleur-0': B }, luApprouveBy: { 'bailleur-0': true },
        remoteSession: { sessionId: 's1', ownerToken: 't1', status: 'pending', signers: [{ sigId: 'loc-0', nom: 'Loc', role: 'locataire' }] }
      }
    };
  }
  async function completer(bail) {
    const ctx = contexte({
      DB: { baux: { 'M-1': bail } },
      _resolveRelayBase: () => 'https://relais.test',
      _bsRelayFetchResult: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }),
      _sha256Hex: async () => 'ab'.repeat(32),
      _buildPresentielProof: () => [],
      _buildBailCertificatePdf: async () => ({}),
      _mergeCertificateIntoBail: async (a) => a,
      _ingestSignedBailArtifacts: async () => ({ pdfRef: { key: 'p' }, certRef: { key: 'c' } }),
      _bailClauseVersionNorm: (v) => v,
      _onBailFullySigned() {}, showToast() {}, saveDB: () => true,
      _bsRelayDeleteSession: async () => {}
    });
    vm.runInContext(fonction('_completeRemoteSignCore'), ctx);
    const carteAvant = parapheCarte(JSON.parse(JSON.stringify(bail.signatures)));
    await ctx._completeRemoteSignCore('M-1', { signers: [{ ordre: 1, role: 'locataire', proof: { signedAt: '2026-10-01T09:00:00.000Z' } }] });
    return { sig: ctx.DB.baux['M-1'].signatures, carteAvant };
  }
  it('le bail sort COMPACTÉ (une image par signataire présent) avec format 2, carte relue identique', async () => {
    const { sig, carteAvant } = await completer(bailMixte());
    expect(sig.locked).toBe(true);
    expect(sig.format).toBe(FORMAT_SIGNATURES);
    expect(sig.parapheImg).toEqual({ 'bailleur-0': B });
    expect(sig.paraphes).toEqual({});
    expect(parapheCarte(sig)).toEqual(carteAvant);
  });
  it('forme FUTURE : la complétion a lieu, les paraphes ne sont pas touchés', async () => {
    const bail = bailMixte(); bail.signatures.format = FORMAT_SIGNATURES + 1;
    const avant = JSON.stringify(bail.signatures.paraphes);
    const { sig } = await completer(bail);
    expect(sig.locked).toBe(true);
    expect(JSON.stringify(sig.paraphes)).toBe(avant);
    expect(sig.parapheImg).toBeUndefined();
  });
});

describe('openBailSignatureFlow (vraie fonction) — onglet périmé', () => {
  async function ouvrir({ fetchImpl, signatures = null }) {
    const ouverts = [], toasts = [];
    const ctx = contexte({
      DB: { baux: { 'S-1': { ref: 'S-1', signatures } } },
      IMMOTRACK_VERSION: VERSION, location: { href: 'http://127.0.0.1/index.html' }, URL,
      fetch: fetchImpl,
      showToast: (m) => toasts.push(String(m)),
      openRemoteSignModal: (ref) => ouverts.push(ref)
    });
    for (const f of ['_swVersionUrl', '_appAJourPourSigner', 'openBailSignatureFlow']) vm.runInContext(fonction(f), ctx);
    await ctx.openBailSignatureFlow('S-1');
    return { ouverts, toasts };
  }
  const sw = (v) => async (url, init) => {
    expect(String(url)).toBe('http://127.0.0.1/sw.js'); expect(init.cache).toBe('no-store');
    return { ok: true, text: async () => `const CACHE_VER = 'immotrack-v${v}';` };
  };
  it('version servie plus récente → la signature ne s’ouvre pas, message de rechargement', async () => {
    const r = await ouvrir({ fetchImpl: sw(PLUS_RECENTE) });
    expect(r.ouverts).toEqual([]);
    expect(r.toasts).toContain(MSG_VERSION_SIGNER);
  });
  it('même version → la signature s’ouvre', async () => {
    expect((await ouvrir({ fetchImpl: sw(VERSION) })).ouverts).toEqual(['S-1']);
  });
  it('réseau en échec → la signature s’ouvre (jamais bloquer hors ligne)', async () => {
    expect((await ouvrir({ fetchImpl: async () => { throw new Error('hors ligne'); } })).ouverts).toEqual(['S-1']);
  });
  it('signatures d’une forme future → refus avant toute lecture réseau', async () => {
    let lu = 0;
    const r = await ouvrir({ fetchImpl: async () => { lu++; return { ok: true, text: async () => '' }; }, signatures: { format: FORMAT_SIGNATURES + 1 } });
    expect(r.ouverts).toEqual([]); expect(r.toasts).toContain(MSG_FORMAT_INCONNU); expect(lu).toBe(0);
  });
});
