// Copie les builds pré-compilés des libs dans public/vendor (source unique = node_modules).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'public', 'vendor');
await mkdir(vendor, { recursive: true });

const copies = [
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs']
];
for (const [src, dst] of copies) {
  await copyFile(join(root, src), join(vendor, dst));
  console.log('vendored', dst);
}
