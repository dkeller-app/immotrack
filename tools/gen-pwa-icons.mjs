#!/usr/bin/env node
/**
 * tools/gen-pwa-icons.mjs — génère les icônes PWA de Propryo.
 *
 * Chantier EDL TERRAIN, lot 2 (CDC docs/CDC-EDL.md §3, verrou 4) : sur iPhone,
 * un site NON installé voit Safari purger localStorage et IndexedDB après 7 jours
 * sans visite — exactement là où vivent les photos d'EDL et le miroir local.
 * Installer l'app suppose un manifeste, et un manifeste suppose des icônes.
 *
 * Pourquoi un générateur et pas des fichiers binaires posés à la main :
 *   • le tracé du logo a UNE source, `__tests__/helpers/doc-brand.js`
 *     (PROPRYO_MARK : pavé arrondi + point corail, viewBox 32) — on le rejoue,
 *     on ne le redessine pas ;
 *   • les icônes sont donc reproductibles et vérifiables, pas des opaques ;
 *   • aucune dépendance : PNG encodé avec le zlib de Node.
 *
 * Usage : node tools/gen-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'icons');

// ── La charte (docs/charte-graphique-propryo.md) ────────────────────────────
const CORAIL = [0xff, 0x5a, 0x3c];      // accent unique
const ENCRE = [0x10, 0x15, 0x21];       // titres / fond du pavé
const BLANC = [0xff, 0xff, 0xff];

// ── Le tracé, repris de __tests__/helpers/doc-brand.js (viewBox 32) ─────────
const MARK = {
  viewBox: 32,
  rect: { x: 3.5, y: 3.5, w: 25, h: 25, r: 7.5, stroke: 3 },
  dot: { cx: 21, cy: 21, r: 4.2 },
};

/** Distance signée à un rectangle arrondi centré en (cx,cy), demi-tailles (hx,hy), rayon r. */
function sdRoundRect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const mx = Math.max(qx, 0), my = Math.max(qy, 0);
  return Math.hypot(mx, my) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Couverture du tracé en un point, dans le repère du viewBox.
 * @returns {number} 0 (dehors) → 1 (dedans), anti-aliasé par sur-échantillonnage.
 */
function dansLeTrace(px, py) {
  const R = MARK.rect, D = MARK.dot;
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  const demi = R.stroke / 2;
  // L'anneau : entre le contour extérieur et le contour intérieur du trait.
  const dOut = sdRoundRect(px, py, cx, cy, R.w / 2 + demi, R.h / 2 + demi, R.r + demi);
  const dIn = sdRoundRect(px, py, cx, cy, R.w / 2 - demi, R.h / 2 - demi, Math.max(0.01, R.r - demi));
  if (dOut <= 0 && dIn >= 0) return 1;
  // Le point.
  if (Math.hypot(px - D.cx, py - D.cy) <= D.r) return 1;
  return 0;
}

/** Rendu RGBA d'une icône carrée. */
function rendre(taille, { fond, encre, echelle }) {
  const buf = Buffer.alloc(taille * taille * 4);
  const SS = 4;                                  // sur-échantillonnage 4×4
  const marge = (1 - echelle) / 2;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let couvert = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / taille;
          const v = (y + (sy + 0.5) / SS) / taille;
          // repère viewBox, mark centrée et mise à l'échelle
          const px = ((u - marge) / echelle) * MARK.viewBox;
          const py = ((v - marge) / echelle) * MARK.viewBox;
          if (px < 0 || py < 0 || px > MARK.viewBox || py > MARK.viewBox) continue;
          couvert += dansLeTrace(px, py);
        }
      }
      const a = couvert / (SS * SS);
      const i = (y * taille + x) * 4;
      buf[i] = Math.round(fond[0] * (1 - a) + encre[0] * a);
      buf[i + 1] = Math.round(fond[1] * (1 - a) + encre[1] * a);
      buf[i + 2] = Math.round(fond[2] * (1 - a) + encre[2] * a);
      buf[i + 3] = 255;                          // opaque : exigé par iOS
    }
  }
  return buf;
}

// ── Encodeur PNG minimal (RGBA, sans filtre) ────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba, taille) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0); ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bits, RGBA
  const brut = Buffer.alloc(taille * (taille * 4 + 1));
  for (let y = 0; y < taille; y++) {
    brut[y * (taille * 4 + 1)] = 0;                                      // filtre None
    rgba.copy(brut, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Les fichiers ────────────────────────────────────────────────────────────
// `echelle` = part du côté occupée par le tracé. Pour une icône « maskable »,
// le système peut rogner jusqu'à 20 % de chaque bord : on rentre le tracé.
const CIBLES = [
  { nom: 'icon-192.png', taille: 192, fond: BLANC, encre: CORAIL, echelle: 0.82 },
  { nom: 'icon-512.png', taille: 512, fond: BLANC, encre: CORAIL, echelle: 0.82 },
  { nom: 'icon-maskable-512.png', taille: 512, fond: BLANC, encre: CORAIL, echelle: 0.56 },
  // iOS n'applique aucun masque et pose l'icône sur un fond clair ou sombre :
  // fond encre + tracé corail, le lockup de la charte.
  { nom: 'apple-touch-icon-180.png', taille: 180, fond: ENCRE, encre: CORAIL, echelle: 0.70 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const c of CIBLES) {
  const data = png(rendre(c.taille, c), c.taille);
  fs.writeFileSync(path.join(OUT, c.nom), data);
  console.log(c.nom.padEnd(28) + c.taille + 'px  ' + Math.round(data.length / 1024) + ' ko');
}
console.log('→ ' + path.relative(ROOT, OUT));
