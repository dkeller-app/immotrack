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

describe('LECTURE-PHOTOS : lecteur de photos fourni (localisation, redressement, grille)', () => {
  it('photo : passe par le lecteur de photos (réduite à 3 000 px), plus par les fenêtres', async () => {
    const vus = []; let fenetres = 0;
    const lirePhoto = async (c) => { vus.push([c.width, c.height]); return 'DC04PHOTO'; };
    const a = await analyserFichier({ octets: new Uint8Array([1, 2]), mime: 'image/jpeg' },
      { lire: () => { fenetres++; return null; }, creerCanvas, lirePhoto, chargerImage: async () => ({ source: {}, largeur: 4000, hauteur: 3000 }) });
    expect(a.codes).toEqual(['DC04PHOTO']); expect(vus).toEqual([[3000, 2250]]); expect(fenetres).toBe(0);
  });
  it('lecteur de photos en échec → aucun code, sans exception', async () => {
    const a = await analyserFichier({ octets: new Uint8Array([1, 2]), mime: 'image/png' },
      { lire, creerCanvas, lirePhoto: async () => { throw new Error('délai'); }, chargerImage: async () => ({ source: { tag: 'DC04' }, largeur: 100, hauteur: 100 }) });
    expect(a).toMatchObject({ illisible: false, codes: [] });
  });
  it('PDF : page rendue sans code trouvé → la page passe au lecteur de photos (scan, photo dans un PDF)', async () => {
    const f = fauxPdf({});
    const vus = []; const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' },
      { pdfjs: f.pdfjs, lire, creerCanvas, lirePhoto: async (c) => { vus.push(c.width); return 'DC04SCAN'; } });
    expect(a.codes).toEqual(['DC04SCAN']); expect(vus).toHaveLength(1);
  });
  it('PDF avec couche texte (impots.gouv, bulletin numérique) → pas de lecteur de photos (temps borné)', async () => {
    const f = fauxPdf({ textes: [[['Avis d\'impôt sur les revenus 2025', 40, 700], ['Revenu fiscal de référence', 40, 632]]] }); let n = 0;
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas, lirePhoto: async () => { n++; return 'X'; } });
    expect(a.codes).toEqual([]); expect(n).toBe(0);
  });
  it('PDF scanné AVEC texte reconnu (application de numérisation) : la grande image de la page l\'envoie au lecteur de photos', async () => {
    const scan = { width: 4960, height: 7016, data: new Uint8Array(3), kind: 3 };           // page A4 scannée à 600 dpi (trop grande pour la recherche directe)
    const f = fauxPdf({ images: [[scan]], textes: [[['Avis d\'impôt sur les revenus 2025 — texte reconnu', 40, 700]]] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire: () => null, creerCanvas, lirePhoto: async () => 'DC04SCANOCR' });
    expect(a).toMatchObject({ codes: ['DC04SCANOCR'], codeParPhoto: true });
  });
  it('budget de la recherche directe épuisé : les pages scannées suivantes passent quand même au lecteur de photos', async () => {
    const f = fauxPdf({ pages: 2 }); const vues = [];
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire: () => null, creerCanvas, essaisMax: 1, lirePhoto: async () => { vues.push(1); return null; } });
    expect(vues).toHaveLength(2); expect(a.codes).toEqual([]);
  });
  it('lecture de photo pas finie (délai) → « inacheve », jamais confondue avec « aucun code »', async () => {
    const lirePhoto = async () => { throw new Error('délai'); };
    const img = await analyserFichier({ octets: new Uint8Array([1, 2]), mime: 'image/jpeg' }, { lire, creerCanvas, lirePhoto, chargerImage: async () => ({ source: {}, largeur: 100, hauteur: 100 }) });
    expect(img).toMatchObject({ codes: [], inacheve: true });
    const pdf = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: fauxPdf({}).pdfjs, lire, creerCanvas, lirePhoto });
    expect(pdf).toMatchObject({ codes: [], inacheve: true });
  });
  it('PDF numérique : code trouvé directement → le lecteur de photos n\'est pas appelé', async () => {
    const f = fauxPdf({ codeAuRendu: ['DC04RENDU'], textes: [[['Avis d\'impôt sur les revenus 2025', 40, 700]]] }); let n = 0;
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas, lirePhoto: async () => { n++; return 'X'; } });
    expect(a.codes).toEqual(['DC04RENDU']); expect(n).toBe(0);
  });
  it('page scannée : le lecteur de photos SEUL (pas de fenêtres sur le fil principal avant lui)', async () => {
    let fenetres = 0;
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: fauxPdf({}).pdfjs, lire: () => { fenetres++; return null; }, creerCanvas, lirePhoto: async () => 'DC04SCAN' });
    expect(a.codes).toEqual(['DC04SCAN']); expect(fenetres).toBe(0);
  });
  it('relecture adverse : 7 logos avant le code d\'un PDF numérique → l\'image du code est quand même examinée', async () => {
    const logo = { width: 400, height: 60, bitmap: { tag: null } };                 // bandeaux (ratio > 3) : filtrés
    const code = { width: 120, height: 120, bitmap: { tag: 'DC04CODE' } };
    const f = fauxPdf({ images: [[logo, logo, logo, logo, logo, logo, logo, code]], textes: [[['Avis', 40, 700], ['Revenu fiscal de référence', 40, 632]]] });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas });
    expect(a.codes).toEqual(['DC04CODE']); expect(f.rendus).toEqual([]);
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

describe('relecture du 14/10 (Opus) : jamais bloqué, temps de calcul borné', () => {
  it('objet image qui ne se résout jamais (objs ou commonObjs « g_… ») : coupé, la lecture continue jusqu\'au rendu', async () => {
    const f = fauxPdf({ images: [[{ width: 120, height: 120 }]], codeAuRendu: ['DC04RENDU'] });
    const p0 = await f.pdfjs.getDocument().promise;
    const page = await p0.getPage(1);
    const enAttente = { get: () => {} };                       // n'appelle jamais le rappel
    f.pdfjs.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getMetadata: async () => ({ info: {} }), destroy() {}, getPage: async () => ({ ...page, objs: enAttente, commonObjs: enAttente, getOperatorList: async () => ({ fnArray: [85, 85], argsArray: [['img_p0_1'], ['g_d0_img_1']] }) }) }) });
    const a = await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire, creerCanvas, delaiObjetMs: 20, ceder: async () => {} });
    expect(a.codes).toEqual(['DC04RENDU']);
  });
  it('les images partagées entre pages sont lues dans commonObjs', async () => {
    const { attendreObjet } = await import('../../js/core/lecture-pieces.js');
    const page = { objs: { get: () => {} }, commonObjs: { get: (n, cb) => cb({ nom: n }) } };
    expect(await attendreObjet(page, 'g_d0_img_1', 20)).toEqual({ nom: 'g_d0_img_1' });
    expect(await attendreObjet(page, 'img_p0_1', 20)).toBeNull();
  });
  it('budget de décodage par document ; vignettes et bandeaux ignorés', async () => {
    let appels = 0;
    const f = fauxPdf({ pages: 3, images: [[{ width: 10, height: 10, bitmap: {} }, { width: 600, height: 40, bitmap: {} }, { width: 400, height: 400, bitmap: {} }], [], []] });
    await analyserFichier({ octets: PDF, mime: 'application/pdf' }, { pdfjs: f.pdfjs, lire: () => { appels++; return null; }, creerCanvas, essaisMax: 7, ceder: async () => {} });
    expect(appels).toBe(7);
  });
});
