// __tests__/helpers/lecture-photo-relais.test.js — LECTURE-PHOTOS : la page publique de dépôt (relais) sert le MÊME
// lecteur de photos que l'app. Source unique : js/core + js/vendor ; copie : relay/public/vendor (npm run
// build:lecture-photo dans relay/). Une copie qui diverge fait échouer ce test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const COPIES = [
  ['js/core/lecture-photo.js', 'relay/public/vendor/lecture-photo.js'],
  ['js/core/lecture-photo-client.js', 'relay/public/vendor/lecture-photo-client.js'],
  ['js/core/lecture-photo-worker.js', 'relay/public/vendor/lecture-photo-worker.js'],
  ['js/vendor/zxing-library-0.21.3.min.js', 'relay/public/vendor/zxing-library-0.21.3.min.js'],
  ['js/vendor/zxing-library-0.21.3.LICENSE.txt', 'relay/public/vendor/zxing-library-0.21.3.LICENSE.txt']
];

describe('copie du lecteur de photos dans le relais', () => {
  for (const [src, copie] of COPIES) {
    it(copie + ' = ' + src + ' (à l\'octet)', () => {
      expect(fs.readFileSync(path.join(ROOT, copie)).equals(fs.readFileSync(path.join(ROOT, src)))).toBe(true);
    });
  }
  it('le Worker n\'importe que des fichiers voisins (mêmes chemins relatifs dans l\'app et dans le relais)', () => {
    const w = fs.readFileSync(path.join(ROOT, 'js/core/lecture-photo-worker.js'), 'utf8');
    const imports = [...w.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['../vendor/zxing-library-0.21.3.min.js', './lecture-photo.js']);
    expect(w).not.toMatch(/fetch\(|XMLHttpRequest|importScripts/);              // aucune requête : rien ne sort
  });
});
