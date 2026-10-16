// LECTURE-PHOTOS : copie le lecteur de photos de l'app (source unique : js/core + js/vendor) dans public/vendor, pour
// le contrôle immédiat de la page de dépôt. Copie vérifiée à l'octet par __tests__/helpers/lecture-photo-relais.test.js :
// après toute modification des sources, relancer `npm run build:lecture-photo` (dans relay/).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const relais = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(relais, '..');
const vendor = join(relais, 'public', 'vendor');
await mkdir(vendor, { recursive: true });
export const COPIES = [
  ['js/core/lecture-photo.js', 'lecture-photo.js'],
  ['js/core/lecture-photo-client.js', 'lecture-photo-client.js'],
  ['js/core/lecture-photo-worker.js', 'lecture-photo-worker.js'],
  ['js/vendor/zxing-library-0.21.3.min.js', 'zxing-library-0.21.3.min.js'],
  ['js/vendor/zxing-library-0.21.3.LICENSE.txt', 'zxing-library-0.21.3.LICENSE.txt']
];
for (const [src, dst] of COPIES) {
  await copyFile(join(app, src), join(vendor, dst));
  console.log('copié', dst);
}
