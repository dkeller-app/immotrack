// __tests__/helpers/version-app.test.js — contrôle « onglet périmé » (PARAPHE-UNIQUE, audit 01/10).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { versionDepuisSw, versionPlusRecente } from '../../js/core/version-app.js';

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
