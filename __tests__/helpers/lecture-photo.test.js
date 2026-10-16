// __tests__/helpers/lecture-photo.test.js — LECTURE-PHOTOS : lire le code 2D-Doc d'une PHOTO, sur l'appareil.
// Images 100 % synthétiques : les matrices des spécimens officiels de la spécification 2D-Doc (France Titres v3.3.9 §16,
// certificat de TEST FR00) sont dessinées puis « photographiées » (perspective, flou, bruit) par les outils du module.
// Le décodeur est le VRAI lecteur de l'app (js/vendor/zxing-library-0.21.3.min.js), réglé par lecteurZxing.
// Règle de sûreté inchangée : la signature est vérifiée ensuite par deux-d-doc.js (aucun texte n'est « valide » ici).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  lirePhoto, lecteurZxing, versGris, nettete, SEUIL_FLOU, issueControle, TAILLES_DM, motifConnu, localiser,
  echantillonnerGrille, egaliser, dessinerGrille, redresser, quadMax, homographie, redimensionner
} from '../../js/core/lecture-photo.js';

const FIX = path.join(__dirname, '..', 'fixtures', '2ddoc');
const SPEC = JSON.parse(fs.readFileSync(path.join(FIX, 'specimens-spec-v339.json'), 'utf8'));
const MAT = JSON.parse(fs.readFileSync(path.join(FIX, 'matrices-datamatrix.json'), 'utf8'));
const brut = (s) => s.replace(/<GS>/g, '\x1d').replace(/<RS>/g, '\x1e').replace(/<US>/g, '\x1f');
const AVIS = brut(SPEC.specimens[22]);            // avis d'impôt (type 28), 64 × 64 modules
const PETIT = brut(SPEC.specimens[30]);           // 40 × 40 modules
const bits = (rows) => ({ N: rows.length, b: Uint8Array.from(rows.join(''), (c) => +c) });

let lire;
let ZX;
// Le fichier vendorisé est un UMD : en module de navigateur il pose globalThis.ZXing ; sous vitest il remplit les exports.
beforeAll(async () => { const m = await import('../../js/vendor/zxing-library-0.21.3.min.js'); ZX = globalThis.ZXing || (m.MultiFormatReader ? m : m.default); lire = lecteurZxing(ZX); });

// ── petit atelier d'images synthétiques (niveaux de gris) ──
const blanc = (w, h, v = 240) => ({ w, h, d: new Uint8Array(w * h).fill(v) });
function rng(g) { let t = g >>> 0; return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
/** Page fictive : lignes de « texte » (barres), code dessiné dans le quadrilatère `quad` (sens horaire depuis haut-gauche). */
function photo({ w = 900, h = 1200, rows, quad, flou = 0, bruit = 0, encre = 30, papier = 235, graine = 1 }) {
  const g = blanc(w, h, papier), R = rng(graine);
  for (let y = 80; y < h - 60; y += 26) for (let x = 60; x < w - 60;) { const l = 8 + R() * 40; if (R() < 0.8) for (let yy = y; yy < y + 9; yy++) for (let xx = x; xx < Math.min(w - 60, x + l); xx += 3) g.d[yy * w + xx] = encre + 40; x += l + 12; }
  const { N, b } = bits(rows);
  const H = homographie(quad, [[0, 0], [N, 0], [N, N], [0, N]]);
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const m = 12;
  for (let y = Math.max(0, Math.floor(Math.min(...ys)) - m); y < Math.min(h, Math.ceil(Math.max(...ys)) + m); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs)) - m); x < Math.min(w, Math.ceil(Math.max(...xs)) + m); x++) {
    let s = 0; for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const X = x + dx, Y = y + dy, z = H[6] * X + H[7] * Y + H[8], u = (H[0] * X + H[1] * Y + H[2]) / z, v = (H[3] * X + H[4] * Y + H[5]) / z;
      s += (u >= 0 && v >= 0 && u < N && v < N && b[(v | 0) * N + (u | 0)]) ? encre : (u > -2 && v > -2 && u < N + 2 && v < N + 2 ? papier : g.d[y * w + x]);
    }
    g.d[y * w + x] = s / 4;
  }
  let o = g;
  if (flou) o = flouer(o, flou);
  if (bruit) for (let i = 0; i < o.d.length; i++) o.d[i] = Math.max(0, Math.min(255, o.d[i] + bruit * (R() + R() + R() - 1.5) * 2));
  return o;
}
function flouer(g, s) {
  const r = Math.ceil(2.5 * s), k = []; let t = 0; for (let i = -r; i <= r; i++) { k.push(Math.exp(-i * i / (2 * s * s))); t += k[k.length - 1]; }
  const a = new Float32Array(g.d.length), o = blanc(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += g.d[y * g.w + Math.min(g.w - 1, Math.max(0, x + i))] * k[i + r]; a[y * g.w + x] = v / t; }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += a[Math.min(g.h - 1, Math.max(0, y + i)) * g.w + x] * k[i + r]; o.d[y * g.w + x] = v / t; }
  return o;
}
const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];

describe('lecteurZxing : le lecteur de l\'app, réglé une fois pour toutes', () => {
  it('lit le DataMatrix d\'un spécimen dessiné net', () => {
    const { N, b } = bits(MAT.specimens['22']);
    expect(lire(dessinerGrille(b, N))).toBe(AVIS);
  });
  it('n\'accepte qu\'un 2D-Doc : un DataMatrix qui ne commence pas par « DC » → null', () => {
    const { N, b } = bits(MAT.horsDeuxDDoc);
    expect(lire(dessinerGrille(b, N))).toBeNull();
  });
  it('bogue v15.744 corrigé : les réglages sont passés à decode() → un code-barres EAN-13 n\'est jamais lu', () => {
    // avant : setHints() puis decode(bitmap) remettait les réglages à zéro (tous formats, codes 1D compris)
    const w = 400, h = 160, g = blanc(w, h, 250); let x = 40, noir = true;
    for (const largeur of MAT.ean13.sbs) { if (noir) for (let y = 20; y < 140; y++) for (let k = 0; k < largeur * 3; k++) g.d[y * w + x + k] = 10; x += largeur * 3; noir = !noir; }
    const toutFormat = new ZX.MultiFormatReader();                      // témoin : sans restriction, l'EAN se lit
    expect(toutFormat.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(new Uint8ClampedArray(g.d), w, h)))).getText()).toBe(MAT.ean13.texte);
    expect(lire(g)).toBeNull();
  });
  it('versGris : même conversion que le lecteur (306 R + 601 G + 117 B) / 1024', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 200, 200, 255]);
    expect(Array.from(versGris(rgba, 2, 2).d)).toEqual([76, 150, 29, 200]);
  });
});

describe('motif connu d\'un DataMatrix', () => {
  it('tailles carrées de la norme ; bordure en L pleine, bords opposés alternés', () => {
    expect(TAILLES_DM).toContain(64); expect(TAILLES_DM[0]).toBe(10);
    const m = motifConnu(10);
    for (let j = 0; j < 10; j++) expect(m[j * 10]).toBe(1);                     // colonne de gauche pleine
    for (let i = 0; i < 10; i++) expect(m[9 * 10 + i]).toBe(1);                 // ligne du bas pleine
    expect(Array.from({ length: 10 }, (_, i) => m[i])).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  });
  it('le motif connu concorde avec un vrai spécimen (64 modules, 4 × 4 régions)', () => {
    const { N, b } = bits(MAT.specimens['22']); const m = motifConnu(N); let n = 0, ok = 0;
    for (let k = 0; k < N * N; k++) if (m[k] >= 0) { n++; if (m[k] === b[k]) ok++; }
    expect(ok).toBe(n); expect(n).toBeGreaterThan(900);
  });
});

describe('géométrie', () => {
  it('homographie : envoie les 4 coins sur leurs images', () => {
    const src = [[0, 0], [10, 0], [10, 10], [0, 10]], dst = [[5, 7], [40, 2], [44, 50], [3, 41]];
    const H = homographie(src, dst);
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], z = H[6] * x + H[7] * y + H[8]; expect((H[0] * x + H[1] * y + H[2]) / z).toBeCloseTo(dst[i][0], 6); expect((H[3] * x + H[4] * y + H[5]) / z).toBeCloseTo(dst[i][1], 6); }
  });
  it('quadMax : retrouve les 4 coins d\'un carré tourné parmi les points de son contour', () => {
    const pts = []; const c = [[50, 0], [100, 50], [50, 100], [0, 50]];
    for (let k = 0; k < 4; k++) for (let t = 0; t < 1; t += 0.1) pts.push([c[k][0] + t * (c[(k + 1) % 4][0] - c[k][0]), c[k][1] + t * (c[(k + 1) % 4][1] - c[k][1])]);
    const q = quadMax(pts); const aire = 0.5 * Math.abs(q.reduce((s, p, i) => s + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0));
    expect(aire).toBeCloseTo(5000, 0);
  });
});

describe('lecture de la grille module par module', () => {
  it('code redressé un peu flou et bruité : grille relue (accord ≥ 0,95) et décodée', () => {
    const p = photo({ w: 620, h: 620, rows: MAT.specimens['22'], quad: carre(54, 54, 512), flou: 2.2, bruit: 18, graine: 4 });
    const g = echantillonnerGrille(redresser(p, carre(54, 54, 512), 512, 48), 512, 48);
    expect(g.N).toBe(64); expect(g.accord).toBeGreaterThan(0.95);
    expect(lire(dessinerGrille(g.bits, g.N))).toBe(AVIS);
  });
  it('égalisation : sur des valeurs brouillées par les voisins, les bits reviennent', () => {
    const { N, b } = bits(MAT.specimens['30']);
    const B = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : b[j * N + i];
    const v = new Float32Array(N * N), R = rng(9);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) v[j * N + i] = 220 - 120 * B(i, j) - 25 * (B(i - 1, j) + B(i + 1, j) + B(i, j - 1) + B(i, j + 1)) + 20 * (R() - 0.5);
    const seuil = Uint8Array.from(v, (x) => x < 160 ? 1 : 0);
    const m = motifConnu(N), connus = []; for (let k = 0; k < N * N; k++) if (m[k] >= 0) connus.push([k % N, (k / N) | 0, m[k]]);
    const e = egaliser(v, N, seuil, connus);
    const err = (x) => x.reduce((s, bit, k) => s + (bit !== b[k] ? 1 : 0), 0);
    expect(err(e)).toBeLessThan(err(seuil)); expect(err(e)).toBeLessThanOrEqual(2);
  });
});

describe('lirePhoto : photo entière', () => {
  it('photo droite et nette, code en haut à droite : lu', async () => {
    const p = photo({ rows: MAT.specimens['30'], quad: carre(640, 60, 200), graine: 2 });
    const r = await lirePhoto(p, lire);
    expect(r.texte).toBe(PETIT);
  }, 30000);
  it('photo en biais (perspective) avec flou léger et bruit : lue après redressement', async () => {
    const p = photo({ rows: MAT.specimens['22'], quad: [[560, 70], [840, 120], [800, 390], [530, 330]], flou: 1.2, bruit: 10, graine: 3 });
    const r = await lirePhoto(p, lire);
    expect(r.texte).toBe(AVIS);
    expect(r.etape).not.toBe('entier');
  }, 30000);
  it('faible contraste (encre 120, papier 175) : lue', async () => {
    const p = photo({ rows: MAT.specimens['30'], quad: carre(600, 80, 220), encre: 120, papier: 175, bruit: 6, graine: 5 });
    expect((await lirePhoto(p, lire)).texte).toBe(PETIT);
  }, 30000);
  it('aucun code : null, sans exception, dans le budget d\'essais', async () => {
    const p = photo({ rows: ['0'], quad: carre(-50, -50, 1) });
    let n = 0; const r = await lirePhoto(p, (g) => { n++; return lire(g); }, { essais: 12 });
    expect(r.texte).toBeNull(); expect(r.interrompu).toBe(false); expect(n).toBeLessThanOrEqual(12); expect(r.essais).toBe(n);
  }, 30000);
  it('un texte qui n\'est pas un 2D-Doc est ignoré et la recherche continue', async () => {
    const p = photo({ rows: MAT.specimens['30'], quad: carre(640, 60, 200), graine: 2 });
    let premier = true;
    const r = await lirePhoto(p, (g) => { if (premier) { premier = false; return '5901234123457'; } return lire(g); });
    expect(r.texte).toBe(PETIT);
  }, 30000);
  it('délai dépassé : s\'arrête et rend null', async () => {
    const p = photo({ rows: MAT.specimens['30'], quad: carre(640, 60, 200), flou: 6, graine: 2 });
    const t0 = Date.now(); const r = await lirePhoto(p, (g) => { const f = Date.now() + 300; while (Date.now() < f); return null; }, { delaiMs: 200 });
    expect(r.texte).toBeNull(); expect(r.interrompu).toBe(true); expect(Date.now() - t0).toBeLessThan(3000);   // « pas fini » ≠ « aucun code »
  }, 30000);
  it('localiser : la zone du code est proposée (elle recouvre le code)', () => {
    const p = photo({ rows: MAT.specimens['22'], quad: carre(560, 70, 260), graine: 7 });
    const z = localiser(p);
    expect(z.some((a) => a.x0 < 600 && a.x1 > 780 && a.y0 < 110 && a.y1 > 290)).toBe(true);
  });
});

describe('netteté et issue du contrôle immédiat (page de dépôt)', () => {
  it('une photo floue a une netteté plus faible ; seuil franchi pour un flou fort', () => {
    const net = photo({ rows: MAT.specimens['30'], quad: carre(640, 60, 200), graine: 2 });
    const floue = flouer(net, 3.2);
    expect(nettete(net)).toBeGreaterThan(nettete(floue));
    expect(nettete(net)).toBeGreaterThan(SEUIL_FLOU);
    expect(nettete(floue)).toBeLessThan(SEUIL_FLOU);
    expect(nettete(redimensionner(net, 450, 600))).toBeGreaterThan(SEUIL_FLOU);
  });
  it('trois issues, jamais de verdict : code lu, code illisible (avis seulement), photo floue', () => {
    expect(issueControle({ code: 'DC04…', avis: true, nettete: 0.1 })).toMatchObject({ issue: 'code_lu', libelle: 'Code de l\'État lu', reprendre: false });
    expect(issueControle({ code: null, avis: true, nettete: 2 })).toMatchObject({ issue: 'code_illisible', libelle: 'Code illisible', reprendre: true });
    expect(issueControle({ code: null, avis: false, nettete: 0.3 })).toMatchObject({ issue: 'floue', libelle: 'Photo floue', reprendre: true });
    expect(issueControle({ code: null, avis: false, nettete: 2 })).toBeNull();
    expect(issueControle({ code: null, avis: true, nettete: null })).toMatchObject({ issue: 'code_illisible' });
  });
});
