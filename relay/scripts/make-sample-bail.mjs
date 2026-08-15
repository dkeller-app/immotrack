import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { embedInDoc } from '../public/sign/manifest.js';

const N = 3;
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= N; i++) {
  const p = doc.addPage([595.28, 841.89]);
  p.drawText(`Bail de location — page ${i}/${N}`, { x: 50, y: 780, size: 18, font });
}
const anchors = [];
for (let p = 1; p <= N; p++) {
  anchors.push({ sigId: 'bailleur-0', kind: 'paraphe', page: p, x: 15, y: 279.5, w: 70, h: 14 });
  anchors.push({ sigId: 'loc-0', kind: 'paraphe', page: p, x: 125, y: 279.5, w: 70, h: 14 });
}
anchors.push({ sigId: 'bailleur-0', kind: 'signature', page: N, x: 15, y: 210, w: 90, h: 30, luApprouve: true });
anchors.push({ sigId: 'loc-0', kind: 'signature', page: N, x: 110, y: 210, w: 90, h: 30, luApprouve: true });
embedInDoc(doc, { v: 1, totalPages: N, anchors });
await writeFile(new URL('../sample-bail.pdf', import.meta.url), await doc.save());
console.log('écrit sample-bail.pdf (', N, 'pages, manifeste embarqué )');
