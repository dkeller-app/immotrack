// __tests__/helpers/version-app.test.js — contrôle « onglet périmé » (PARAPHE-UNIQUE, audit 01/10).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { versionDepuisSw, versionPlusRecente, versionServieRecente } from '../../js/core/version-app.js';

describe('versionDepuisSw', () => {
  it('lit la version de CACHE_VER', () => {
    expect(versionDepuisSw("const CACHE_VER = 'immotrack-v15.709';\nself.addEventListener")).toBe('15.709');
  });
  it('texte inattendu (page d’erreur, vide) → null', () => {
    expect(versionDepuisSw('<html>404</html>')).toBeNull();
    expect(versionDepuisSw(null)).toBeNull();
  });
});

describe('versionPlusRecente', () => {
  it('compare numériquement segment par segment', () => {
    expect(versionPlusRecente('15.710', '15.709')).toBe(true);
    expect(versionPlusRecente('16.001', '15.999')).toBe(true);
    expect(versionPlusRecente('15.709', '15.709')).toBe(false);
    expect(versionPlusRecente('15.708', '15.709')).toBe(false);
  });
  it('donnée absente ou illisible → false (on ne bloque jamais sur un doute)', () => {
    expect(versionPlusRecente(null, '15.709')).toBe(false);
    expect(versionPlusRecente('15.710', '')).toBe(false);
    expect(versionPlusRecente('abc', '15.709')).toBe(false);
  });
});

describe('source de la version servie = sw.js, alignée sur IMMOTRACK_VERSION', () => {
  it('CACHE_VER de sw.js et IMMOTRACK_VERSION d’index.html ont la même valeur', () => {
    const sw = versionDepuisSw(fs.readFileSync('sw.js', 'utf8'));
    const m = /const IMMOTRACK_VERSION = '([\d.]+)'/.exec(fs.readFileSync('index.html', 'utf8'));
    expect(sw).not.toBeNull();
    expect(sw).toBe(m && m[1]);
  });
});

describe('versionServieRecente — lecture de sw.js bornée (réponse ET corps)', () => {
  const vraiFetch = globalThis.fetch;
  const avec = (impl) => { globalThis.fetch = impl; };
  afterEach(() => { globalThis.fetch = vraiFetch; });
  it('version servie plus récente → true ; même version → false', async () => {
    avec(async () => ({ ok: true, text: async () => "const CACHE_VER = 'immotrack-v15.710';" }));
    expect(await versionServieRecente('sw.js', '15.709', 200)).toBe(true);
    avec(async () => ({ ok: true, text: async () => "const CACHE_VER = 'immotrack-v15.709';" }));
    expect(await versionServieRecente('sw.js', '15.709', 200)).toBe(false);
  });
  it('lecture sans cache', async () => {
    let init = null;
    avec(async (u, i) => { init = i; return { ok: true, text: async () => '' }; });
    await versionServieRecente('sw.js', '15.709', 200);
    expect(init.cache).toBe('no-store');
  });
  it('réseau en échec ou réponse non OK → false (jamais bloquer hors ligne)', async () => {
    avec(async () => { throw new Error('hors ligne'); });
    expect(await versionServieRecente('sw.js', '15.709', 200)).toBe(false);
    avec(async () => ({ ok: false, text: async () => "const CACHE_VER = 'immotrack-v99.999';" }));
    expect(await versionServieRecente('sw.js', '15.709', 200)).toBe(false);
  });
  it('CORPS bloqué (en-têtes reçus, texte jamais livré) → false dans le délai', async () => {
    avec(async () => ({ ok: true, text: () => new Promise(() => {}) }));
    const t0 = Date.now();
    expect(await versionServieRecente('sw.js', '15.709', 80)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it('réponse jamais reçue → false dans le délai', async () => {
    avec(() => new Promise(() => {}));
    const t0 = Date.now();
    expect(await versionServieRecente('sw.js', '15.709', 80)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
