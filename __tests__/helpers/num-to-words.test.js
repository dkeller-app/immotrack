import { describe, it, expect } from 'vitest';
import { numToWords } from '../../js/core/utils.js';

describe('numToWords — dizaines 70-79 / 90-99 (fix bug BUG-NUMWORDS-7090)', () => {
  it('70 → "soixante-dix"', () => {
    expect(numToWords(70).toLowerCase()).toContain('soixante-dix');
  });
  it('71 → "soixante et onze"', () => {
    expect(numToWords(71).toLowerCase()).toContain('soixante et onze');
  });
  it('90 → "quatre-vingt-dix"', () => {
    expect(numToWords(90).toLowerCase()).toContain('quatre-vingt-dix');
  });
  it('95 → "quatre-vingt-quinze"', () => {
    expect(numToWords(95).toLowerCase()).toContain('quatre-vingt-quinze');
  });
  it('650 → "six cent cinquante"', () => {
    expect(numToWords(650).toLowerCase()).toContain('six cent cinquante');
  });
});
