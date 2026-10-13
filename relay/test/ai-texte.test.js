import { describe, it, expect } from 'vitest';
import { normaliser, contientExtrait, texteBorne } from '../src/ai/texte.js';

describe('socle IA — texte', () => {
  it('normaliser : minuscules, sans accents, ponctuation écrasée', () => {
    expect(normaliser("  Vasque  ÉVIER, style « ancien » ! ")).toBe('vasque evier style ancien');
    expect(normaliser("car l’âge")).toBe("car l'age");
  });
  it('contientExtrait : vrai seulement si l\'extrait est dans le texte', () => {
    const t = "car l'âge de sol en ciment, en faillance, vasque évier";
    expect(contientExtrait(t, "car l'âge de sol en ciment")).toBe(true);
    expect(contientExtrait(t, 'Vasque Évier')).toBe(true);
    expect(contientExtrait(t, 'carrelage de sol')).toBe(false);     // forme corrigée ≠ entendu
    expect(contientExtrait(t, 'a')).toBe(false);
    expect(contientExtrait(t, '')).toBe(false);
  });
  it('texteBorne : jamais de coupe — trop long ou vide → null', () => {
    expect(texteBorne('  ok  ', 5)).toBe('ok');
    expect(texteBorne('abcdef', 5)).toBe(null);
    expect(texteBorne('   ', 5)).toBe(null);
    expect(texteBorne(12, 5)).toBe(null);
  });
});
