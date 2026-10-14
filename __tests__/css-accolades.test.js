// Garde-fou : une accolade perdue lors d'une résolution de conflit (v15.732/733) a laissé tout un bloc
// de css/main.css enfermé dans un @media téléphone. Le fichier doit rester équilibré.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('css/main.css', () => {
  it('a autant d’accolades ouvrantes que fermantes (commentaires exclus)', () => {
    const css = readFileSync(resolve(__dirname, '../css/main.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let profondeur = 0, min = 0;
    for (const ch of css) {
      if (ch === '{') profondeur++;
      else if (ch === '}') { profondeur--; min = Math.min(min, profondeur); }
    }
    expect(min).toBe(0);
    expect(profondeur).toBe(0);
  });
});
