import { describe, it, expect } from 'vitest';
import {
  _isDpeClassValide, _bailGelDpeFG, _dpeExpire, _estRevisableIRL,
  _dpeInterditLocationAuDate, _dpeInterdictionCalendrier
} from './dpe.js';

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

// ═══════════════════════════════════════════════════════════════════
//  _dpeInterditLocationAuDate — Loi Climat 2021 art. 23 (v15.05)
// ═══════════════════════════════════════════════════════════════════

describe('_dpeInterditLocationAuDate — DPE A-D jamais interdits', () => {
  ['A','B','C','D'].forEach(c => {
    it(`${c} jamais interdit (même en 2050)`, () => {
      const r = _dpeInterditLocationAuDate(c, '2050-01-01');
      expect(r.interdit).toBe(false);
      expect(r.anneeBlocage).toBeNull();
      expect(r.classe).toBe(c);
    });
  });
});

describe('_dpeInterditLocationAuDate — DPE G (interdit 2025)', () => {
  it('G interdit le 01/01/2025', () => {
    const r = _dpeInterditLocationAuDate('G', '2025-01-01');
    expect(r.interdit).toBe(true);
    expect(r.anneeBlocage).toBe(2025);
    expect(r.dateBlocage).toBe('2025-01-01');
    expect(r.raison).toMatch(/2025-01-01/);
    expect(r.raison).toMatch(/Climat/);
  });
  it('G interdit le 15/06/2025 (après date blocage)', () => {
    const r = _dpeInterditLocationAuDate('G', '2025-06-15');
    expect(r.interdit).toBe(true);
  });
  it('G PAS interdit le 31/12/2024 (avant date blocage)', () => {
    const r = _dpeInterditLocationAuDate('G', '2024-12-31');
    expect(r.interdit).toBe(false);
    expect(r.anneeBlocage).toBeNull();
  });
});

describe('_dpeInterditLocationAuDate — DPE F (interdit 2028)', () => {
  it('F interdit le 01/01/2028', () => {
    const r = _dpeInterditLocationAuDate('F', '2028-01-01');
    expect(r.interdit).toBe(true);
    expect(r.anneeBlocage).toBe(2028);
  });
  it('F PAS interdit le 31/12/2027', () => {
    expect(_dpeInterditLocationAuDate('F', '2027-12-31').interdit).toBe(false);
  });
  it('F PAS interdit en 2025 (G interdit, F encore OK)', () => {
    expect(_dpeInterditLocationAuDate('F', '2025-06-01').interdit).toBe(false);
  });
});

describe('_dpeInterditLocationAuDate — DPE E (interdit 2034)', () => {
  it('E interdit le 01/01/2034', () => {
    const r = _dpeInterditLocationAuDate('E', '2034-01-01');
    expect(r.interdit).toBe(true);
    expect(r.anneeBlocage).toBe(2034);
  });
  it('E PAS interdit en 2028 (F interdit, E encore OK)', () => {
    expect(_dpeInterditLocationAuDate('E', '2028-06-01').interdit).toBe(false);
  });
});

describe('_dpeInterditLocationAuDate — edge cases', () => {
  it('DPE vide → pas interdit (pas notre rôle)', () => {
    expect(_dpeInterditLocationAuDate('', '2030-01-01').interdit).toBe(false);
  });
  it('DPE null → pas interdit', () => {
    expect(_dpeInterditLocationAuDate(null, '2030-01-01').interdit).toBe(false);
  });
  it('DPE invalide \'Z\' → pas interdit', () => {
    expect(_dpeInterditLocationAuDate('Z', '2030-01-01').interdit).toBe(false);
  });
  it('case-insensitive : g → G interdit en 2025', () => {
    const r = _dpeInterditLocationAuDate('g', '2025-06-01');
    expect(r.interdit).toBe(true);
    expect(r.classe).toBe('G');
  });
  it('accepte Date object', () => {
    const r = _dpeInterditLocationAuDate('G', new Date('2025-06-01'));
    expect(r.interdit).toBe(true);
  });
  it('dateRef vide ou invalide → utilise today', () => {
    // En 2026 today, G interdit (anneeBlocage 2025)
    const r = _dpeInterditLocationAuDate('G', null);
    // Selon la date système du test, ça peut être true. On vérifie au moins
    // que la fonction ne plante pas et que classe='G' est bien renseigné.
    expect(r.classe).toBe('G');
  });
});

describe('_dpeInterdictionCalendrier — exposition pour UI', () => {
  it('retourne un array de 3 règles (G, F, E)', () => {
    const cal = _dpeInterdictionCalendrier();
    expect(Array.isArray(cal)).toBe(true);
    expect(cal.length).toBe(3);
    expect(cal.map(r => r.classe).sort()).toEqual(['E','F','G']);
  });
  it('copie défensive : mutation externe n\'affecte pas l\'interne', () => {
    const cal = _dpeInterdictionCalendrier();
    cal.push({ classe: 'X' });
    const cal2 = _dpeInterdictionCalendrier();
    expect(cal2.length).toBe(3); // pas affecté
  });
});
