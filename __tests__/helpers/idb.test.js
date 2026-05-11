import { describe, it, expect } from 'vitest';
import {
  _IDB_NAME, _IDB_STORE,
  _idbOpen, _idbPut, _idbGet, _idbDel, _idbKey
} from '../../js/core/idb.js';

describe('core/idb.js — constants', () => {
  it('expose le nom de la DB', () => {
    expect(_IDB_NAME).toBe('immotrack_photos');
  });

  it('expose le nom du store', () => {
    expect(_IDB_STORE).toBe('photos');
  });
});

describe('core/idb.js — _idbKey', () => {
  it('génère une clé qui commence par "ph_"', () => {
    const k = _idbKey();
    expect(k).toMatch(/^ph_\d+_[a-z0-9]+$/);
  });

  it('génère des clés uniques sur 100 appels rapprochés', () => {
    const keys = new Set();
    for (let i = 0; i < 100; i++) keys.add(_idbKey());
    expect(keys.size).toBe(100);
  });

  it('format clé : ph_<timestamp>_<random>', () => {
    const k = _idbKey();
    const parts = k.split('_');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('ph');
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts[2]).toMatch(/^[a-z0-9]+$/);
    expect(parts[2].length).toBeGreaterThanOrEqual(3);
    expect(parts[2].length).toBeLessThanOrEqual(6);
  });
});

describe('core/idb.js — signatures', () => {
  it('_idbOpen est une fonction async (retourne Promise)', () => {
    expect(typeof _idbOpen).toBe('function');
    // En Node sans indexedDB global, l'appel devrait throw, mais la fonction
    // elle-même existe. On vérifie juste sa nature.
  });

  it('_idbPut/_idbGet/_idbDel sont des fonctions', () => {
    expect(typeof _idbPut).toBe('function');
    expect(typeof _idbGet).toBe('function');
    expect(typeof _idbDel).toBe('function');
  });

  it('_idbPut prend (key, data) - signature 2 args', () => {
    expect(_idbPut.length).toBe(2);
  });

  it('_idbGet prend (key) - signature 1 arg', () => {
    expect(_idbGet.length).toBe(1);
  });

  it('_idbDel prend (key) - signature 1 arg', () => {
    expect(_idbDel.length).toBe(1);
  });
});
