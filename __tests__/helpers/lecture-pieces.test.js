// __tests__/helpers/lecture-pieces.test.js — VERIF-DOCUMENTS : lecture locale d'une pièce (doublures de pdf.js,
// du canvas et du lecteur DataMatrix ; le parcours réel est vérifié au geste dans le navigateur).
import { describe, it, expect } from 'vitest';
import { analyserFichier, chercherCode, imageVersCanvas, MAX_PAGES } from '../../js/core/lecture-pieces.js';

function canvas(w, h, tag) {
  const c = { width: w, height: h, tag, dessins: [], pixels: null };
  c.getContext = () => ({
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect() {}, drawImage(src) { c.dessins.push(src); if (src && src.tag) c.tag = c.tag || src.tag; },
    createImageData(w2, h2) { return { width: w2, height: h2, data: new Uint8ClampedArray(w2 * h2 * 4) }; },
    putImageData(id) { c.pixels = id; }
  });
  return c;
}
const creerCanvas = (w, h) => canvas(w, h);
const PDF = new TextEncoder().encode('%PDF-1.7\n... startxref 10 %%EOF');

function fauxPdf({ pages = 1, images = [], textes = [], codeAuRendu = null, meta = { Producer: 'P', Creator: 'C', CreationDate: 'D:20260101', ModDate: 'D:20260301' }, casse = false } = {}) {
  const rendus = [];
  const OPS = { paintImageXObject: 85, paintInlineImageXObject: 86 };
  const page = (n) => ({
    getTextContent: async () => ({ items: (textes[n - 1] || []).map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] })) }),
    getOperatorList: async () => ({ fnArray: (images[n - 1] || []).map(() => OPS.paintImageXObject), argsArray: (images[n - 1] || []).map((_, i) => ['img' + i]) }),
    objs: { get: (nom, cb) => cb((images[n - 1] || [])[+nom.slice(3)]) },
    getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }),
    render: ({ canvasContext }) => { rendus.push(n); if (codeAuRendu && codeAuRendu[n - 1]) canvasContext.drawImage({ tag: codeAuRendu[n - 1] }); return { promise: Promise.resolve() }; }
  });
  const pdfjs = { OPS, getDocument: () => ({ promise: casse ? Promise.reject(new Error('mot de passe')) : Promise.resolve({ numPages: pages, getMetadata: async () => ({ info: meta }), getPage: async (n) => page(n), destroy() {} }) }) };
  return { pdfjs, rendus };
}
const lire = (c) => c.tag || (c.dessins.find((d) => d && d.tag) || {}).tag || null;

describe('lecture d\'un PDF', () => {
  it('code trouvé dans une image intégrée : pas de rendu de page ; métadonnées, texte, enregistrements', async () => {
    const f = fauxPdf({ images: [[{ width: 120, height: 120, bitmap: { tag: 'DC04CODE' } }]], textes: [[['Revenu', 40, 632], ['31 540', 300, 632]]] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas });
    expect(a).toMatchObject({ illisible: false, estPdf: true, pages: 1, codes: ['DC04CODE'], enregistrements: 1, superpositions: [] });
    expect(a.metadonnees).toEqual({ producteur: 'P', createur: 'C', creeLe: 'D:20260101', modifieLe: 'D:20260301' });
    expect(a.texte).toContain('31 540');
    expect(f.rendus).toEqual([]);
  });
  it('pas d\'image utile : la page est rendue puis lue', async () => {
    const f = fauxPdf({ codeAuRendu: ['DC04RENDU'] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas });
    expect(a.codes).toEqual(['DC04RENDU']); expect(f.rendus).toEqual([1]);
  });
  it('au plus ' + MAX_PAGES + ' pages lues ; codes identiques dédoublonnés', async () => {
    const f = fauxPdf({ pages: 6, codeAuRendu: ['A', 'A', 'B', 'C', 'D', 'E'] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas });
    expect(a.codes).toEqual(['A', 'B']); expect(f.rendus).toEqual([1, 2, 3]);
  });
  it('textes superposés relevés', async () => {
    const f = fauxPdf({ textes: [[['31 540 EUR', 300, 632], ['41 540 EUR', 300, 632]]] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas });
    expect(a.superpositions).toEqual([{ page: 1, textes: ['31 540 EUR', '41 540 EUR'] }]);
  });
  it('PDF illisible (protégé, abîmé) → illisible, sans exception', async () => {
    const f = fauxPdf({ casse: true });
    expect(await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas })).toMatchObject({ illisible: true, estPdf: true });
  });
});

describe('lecture d\'une image', () => {
  it('photo : lue entière (réduite à 3 000 px au plus) ; aucun texte, aucun indice PDF', async () => {
    const a = await analyserFichier({ octets: new Uint8Array([1, 2]), mime: 'image/jpeg' }, { lire, creerCanvas, chargerImage: async () => ({ source: { tag: 'DC04PHOTO' }, largeur: 4000, hauteur: 3000 }) });
    expect(a).toEqual({ illisible: false, estPdf: false, codes: ['DC04PHOTO'], texte: '' });
  });
  it('image qui ne se charge pas, format inconnu, fichier vide → illisible', async () => {
    const d = { lire, creerCanvas, chargerImage: async () => { throw new Error('x'); } };
    expect((await analyserFichier({ octets: new Uint8Array([1]), mime: 'image/png' }, d)).illisible).toBe(true);
    expect((await analyserFichier({ octets: new Uint8Array([1]), mime: 'text/plain' }, d)).illisible).toBe(true);
    expect((await analyserFichier({ octets: new Uint8Array(), mime: 'image/png' }, d)).illisible).toBe(true);
  });
});

describe('recherche du code et conversion des images', () => {
  it('fenêtres qui se chevauchent quand l\'image entière ne donne rien ; bornées', () => {
    let appels = 0;
    const lireN = (c) => { appels++; return appels === 5 ? 'TROUVE' : null; };
    expect(chercherCode(canvas(2000, 2000), lireN, creerCanvas)).toBe('TROUVE');
    appels = 0; expect(chercherCode(canvas(9000, 9000), () => { appels++; return null; }, creerCanvas)).toBeNull();
    expect(appels).toBeLessThanOrEqual(49);
    expect(chercherCode(canvas(200, 200), () => null, creerCanvas)).toBeNull();
  });
  it('image 1 bit par pixel (bit à 1 = blanc) et RGB ; petite image agrandie sans lissage', () => {
    const c = imageVersCanvas({ width: 8, height: 1, kind: 1, data: new Uint8Array([0b10100000]) }, creerCanvas);
    expect(c.width).toBeGreaterThanOrEqual(300);
    const base = c.dessins[0]; const px = base.pixels.data;
    expect([px[0], px[4], px[8], px[12]]).toEqual([255, 0, 255, 0]);
    const rgb = imageVersCanvas({ width: 400, height: 400, kind: 2, data: new Uint8Array(400 * 400 * 3).fill(9) }, creerCanvas);
    expect(rgb.pixels.data[0]).toBe(9); expect(rgb.pixels.data[3]).toBe(255);
    expect(imageVersCanvas({ width: 0, height: 0 }, creerCanvas)).toBeNull();
  });
});

describe('page 1 en JPEG pour la lecture IA (lot 3)', () => {
  it('PDF : page 1 rendue (intent print) puis réduite jusqu\'à passer sous la taille admise', async () => {
    const { pageVersImage, IMAGE_MAX_CARACTERES } = await import('../../js/core/lecture-pieces.js');
    const f = fauxPdf({ pages: 3 });
    const essais = [];
    const versJpeg = (c, q) => { essais.push([c.width, q]); return 'data:image/jpeg;base64,' + 'A'.repeat(essais.length < 4 ? IMAGE_MAX_CARACTERES + 10 : 100); };
    const u = await pageVersImage({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, creerCanvas, versJpeg });
    expect(u.length).toBeLessThanOrEqual(IMAGE_MAX_CARACTERES);
    expect(f.rendus).toEqual([1]);
    expect(essais.map((e) => e[1])).toEqual([0.82, 0.7, 0.55, 0.82]);
    expect(essais[3][0]).toBe(1280);   // 2e essai à 80 % de 1 600 px
  });
  it('image trop lourde même réduite → null (rien n\'est envoyé) ; format inconnu → null', async () => {
    const { pageVersImage, IMAGE_MAX_CARACTERES } = await import('../../js/core/lecture-pieces.js');
    const gros = () => 'x'.repeat(IMAGE_MAX_CARACTERES + 1);
    expect(await pageVersImage({ octets: new Uint8Array([1]), mime: 'image/png' }, { creerCanvas, chargerImage: async () => ({ source: {}, largeur: 3000, hauteur: 4000 }), versJpeg: gros })).toBeNull();
    expect(await pageVersImage({ octets: new Uint8Array([1]), mime: 'text/plain' }, { creerCanvas, versJpeg: gros })).toBeNull();
  });
});
