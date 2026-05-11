import { describe, it, expect } from 'vitest';
import { _isDpeClassValide, _bailGelDpeFG, _dpeExpire, _estRevisableIRL } from './dpe.js';

describe('_isDpeClassValide', () => {
  it('accepte les 7 classes officielles', () => {
    ['A','B','C','D','E','F','G'].forEach(c => {
      expect(_isDpeClassValide(c)).toBe(true);
    });
  });

  it('accepte minuscules', () => {
    expect(_isDpeClassValide('a')).toBe(true);
    expect(_isDpeClassValide('f')).toBe(true);
  });

  it('rejette les autres', () => {
    expect(_isDpeClassValide('')).toBe(false);
    expect(_isDpeClassValide(null)).toBe(false);
    expect(_isDpeClassValide('H')).toBe(false);
    expect(_isDpeClassValide('AA')).toBe(false);
    expect(_isDpeClassValide(0)).toBe(false);
  });
});

describe('_bailGelDpeFG', () => {
  it('retourne true pour DPE F', () => {
    expect(_bailGelDpeFG({ dpe: 'F' })).toBe(true);
  });

  it('retourne true pour DPE G', () => {
    expect(_bailGelDpeFG({ dpe: 'G' })).toBe(true);
  });

  it('retourne true pour f minuscule (norme)', () => {
    expect(_bailGelDpeFG({ dpe: 'f' })).toBe(true);
  });

  it('retourne false pour A-E', () => {
    expect(_bailGelDpeFG({ dpe: 'A' })).toBe(false);
    expect(_bailGelDpeFG({ dpe: 'D' })).toBe(false);
    expect(_bailGelDpeFG({ dpe: 'E' })).toBe(false);
  });

  it('retourne false si DPE absent', () => {
    expect(_bailGelDpeFG({})).toBe(false);
    expect(_bailGelDpeFG(null)).toBe(false);
  });
});

describe('_dpeExpire', () => {
  it('retourne false pour DPE récent (1 an)', () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    expect(_dpeExpire(oneYearAgo.toISOString().slice(0, 10))).toBe(false);
  });

  it('retourne true pour DPE de 11 ans', () => {
    const elevenYearsAgo = new Date();
    elevenYearsAgo.setFullYear(elevenYearsAgo.getFullYear() - 11);
    expect(_dpeExpire(elevenYearsAgo.toISOString().slice(0, 10))).toBe(true);
  });

  it('retourne false pour date invalide ou vide', () => {
    expect(_dpeExpire('')).toBe(false);
    expect(_dpeExpire(null)).toBe(false);
    expect(_dpeExpire('not-a-date')).toBe(false);
  });

  it('refDate personnalisée', () => {
    // DPE 2010, refDate 2019 → pas expiré (<10 ans)
    expect(_dpeExpire('2010-01-01', new Date('2019-12-31'))).toBe(false);
    // DPE 2010, refDate 2020 → expiré (10 ans pile)
    expect(_dpeExpire('2010-01-01', new Date('2020-01-02'))).toBe(true);
  });
});

describe('_estRevisableIRL', () => {
  it('autorisé pour DPE A-E avec DPE récent', () => {
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 2);
    const bail = { dpe: 'C', dpeDate: recent.toISOString().slice(0, 10) };
    const r = _estRevisableIRL(bail);
    expect(r.revisable).toBe(true);
    expect(r.blocking).toBe(false);
  });

  it('BLOQUÉ pour DPE F (loi Climat 2021)', () => {
    const r = _estRevisableIRL({ dpe: 'F' });
    expect(r.revisable).toBe(false);
    expect(r.blocking).toBe(true);
    expect(r.raison).toMatch(/Climat/i);
  });

  it('BLOQUÉ pour DPE G', () => {
    const r = _estRevisableIRL({ dpe: 'G' });
    expect(r.revisable).toBe(false);
    expect(r.blocking).toBe(true);
  });

  it('BLOQUÉ si DPE manquant (besoin info)', () => {
    expect(_estRevisableIRL({}).revisable).toBe(false);
    expect(_estRevisableIRL({}).blocking).toBe(true);
    expect(_estRevisableIRL({}).raison).toMatch(/non renseigné/i);
  });

  it('BLOQUÉ si bail null', () => {
    expect(_estRevisableIRL(null).revisable).toBe(false);
  });

  it('BLOQUÉ si DPE invalide', () => {
    expect(_estRevisableIRL({ dpe: 'Z' }).revisable).toBe(false);
    expect(_estRevisableIRL({ dpe: 'Z' }).raison).toMatch(/invalide/i);
  });

  it('AUTORISÉ avec warning si DPE expiré > 10 ans', () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 11);
    const r = _estRevisableIRL({ dpe: 'D', dpeDate: old.toISOString().slice(0, 10) });
    expect(r.revisable).toBe(true);
    expect(r.blocking).toBe(false);
    expect(r.raison).toMatch(/expiré/i);
  });
});
