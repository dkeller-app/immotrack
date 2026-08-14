// __tests__/helpers/doc-brand.test.js
// S4 — bandeau d'identité des documents : logo du bailleur à gauche (ou son nom s'il n'en a pas),
// logo Propryo à droite, MÊME hauteur. Gabarit validé par Didier le 12/08
// (mockups/DOCUMENTS-PROPRYO, variante B) ; logo retenu = piste 01 « Le point »
// (mockups/SIGNATURE-PAGE-LOCATAIRE/sign-propryo.css, déjà en prod sur la page locataire).
//
// Le tracé du logo est reproduit en VECTORIEL dans le PDF (roundedRect + circle jsPDF) plutôt
// que rastérisé : net à tout zoom, aucune police ni canvas en jeu, et la géométrie devient
// testable — c'est l'objet de ce fichier.

import { describe, it, expect } from 'vitest';
import {
  PROPRYO_MARK, PROPRYO_MARK_SVG, propryoMarkOps, propryoLockupWidth,
  propryoRectSvgPath, brandzoneModel, brandzoneHtml, BRAND
} from './doc-brand.js';

describe('PROPRYO_MARK — le tracé retenu, pas un dessin de circonstance', () => {
  it('reprend exactement les valeurs du SVG en prod (piste 01 « Le point »)', () => {
    expect(PROPRYO_MARK.viewBox).toBe(32);
    expect(PROPRYO_MARK.rect).toEqual({ x: 3.5, y: 3.5, w: 25, h: 25, r: 7.5, stroke: 3 });
    expect(PROPRYO_MARK.dot).toEqual({ cx: 21, cy: 21, r: 4.2 });
    expect(PROPRYO_MARK.color).toEqual([255, 90, 60]);       // corail #ff5a3c
  });

  it('le point est décentré en bas à droite — surtout pas centré', () => {
    expect(PROPRYO_MARK.dot.cx).toBeGreaterThan(PROPRYO_MARK.viewBox / 2);
    expect(PROPRYO_MARK.dot.cy).toBeGreaterThan(PROPRYO_MARK.viewBox / 2);
  });

  it('le SVG exporté contient le même tracé (source unique app / documents)', () => {
    expect(PROPRYO_MARK_SVG).toContain('rx="7.5"');
    expect(PROPRYO_MARK_SVG).toContain('cx="21"');
    expect(PROPRYO_MARK_SVG).toContain('#ff5a3c');
  });
});

describe('propryoMarkOps — le tracé mis à l\'échelle pour jsPDF (mm)', () => {
  it('à 8 mm, chaque cote est mise à l\'échelle 8/32', () => {
    const ops = propryoMarkOps(20, 100, 8);
    const s = 8 / 32;
    expect(ops).toEqual([
      { op: 'roundedRect', x: 20 + 3.5 * s, y: 100 + 3.5 * s, w: 25 * s, h: 25 * s, r: 7.5 * s, lineWidth: 3 * s, color: [255, 90, 60] },
      { op: 'circle', x: 20 + 21 * s, y: 100 + 21 * s, r: 4.2 * s, color: [255, 90, 60] }
    ]);
  });

  it('reste dans le carré demandé, quelle que soit la taille', () => {
    for (const size of [4, 6.5, 8, 13]) {
      for (const o of propryoMarkOps(0, 0, size)) {
        const left = o.op === 'circle' ? o.x - o.r : o.x;
        const right = o.op === 'circle' ? o.x + o.r : o.x + o.w;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(size + 1e-9);
      }
    }
  });

  it('le chemin SVG du pavé porte les MÊMES cotes que le tracé jsPDF', () => {
    // pdf-lib (certificat de preuve) n'a pas de rectangle arrondi : sans ce chemin, le logo
    // sortait à coins carrés alors qu'il est très arrondi (r = 7,5 sur un viewBox de 32).
    const p = propryoRectSvgPath();
    expect(p).toMatch(/^M 11 3\.5 H 21 A 7\.5 7\.5 /);          // départ + 1er arc
    expect((p.match(/A 7\.5 7\.5 /g) || []).length).toBe(4);    // les 4 coins
    expect(p.trim().endsWith('Z')).toBe(true);                  // chemin fermé
    // aucune coordonnée ne sort du viewBox
    for (const n of p.match(/-?\d+(\.\d+)?/g).map(Number)) expect(n).toBeLessThanOrEqual(32);
  });

  it('taille nulle ou négative → aucun tracé (pas de dessin dégénéré)', () => {
    expect(propryoMarkOps(10, 10, 0)).toEqual([]);
    expect(propryoMarkOps(10, 10, -3)).toEqual([]);
  });
});

describe('brandzoneModel — qui occupe la gauche, et à quelle hauteur', () => {
  it('bailleur AVEC logo : son image à gauche, hauteur de bandeau pleine', () => {
    const m = brandzoneModel({ entLogo: 'data:image/png;base64,AAA', entNom: 'SCI KELLER', logoRatio: 200 / 56 });
    expect(m.left.kind).toBe('logo');
    expect(m.left.src).toBe('data:image/png;base64,AAA');
    expect(m.logoH).toBe(BRAND.LOGO_H);                  // 13 mm
    expect(m.left.h).toBe(BRAND.LOGO_H);
    expect(m.left.w).toBeCloseTo(BRAND.LOGO_H * (200 / 56), 5);
  });

  it('bailleur SANS logo : son NOM prend la même place, bandeau resserré', () => {
    const m = brandzoneModel({ entLogo: '', entNom: 'SCI KELLER' });
    expect(m.left.kind).toBe('nom');
    expect(m.left.text).toBe('SCI KELLER');
    expect(m.logoH).toBe(BRAND.NOM_H);                   // 5,3 mm
  });

  it('un logo très large est bridé à la largeur max, sans déformation', () => {
    const m = brandzoneModel({ entLogo: 'data:x', entNom: 'X', logoRatio: 20 });   // 20:1
    expect(m.left.w).toBe(BRAND.LOGO_MAX_W);             // 62 mm
    expect(m.left.h).toBeCloseTo(BRAND.LOGO_MAX_W / 20, 5);
    expect(m.left.h).toBeLessThan(BRAND.LOGO_H);         // hauteur réduite pour tenir
  });

  it('sans nom d\'entité renseigné : jamais de bandeau vide', () => {
    const m = brandzoneModel({ entLogo: '', entNom: '' });
    expect(m.left.kind).toBe('nom');
    expect(m.left.text).toBe('Le bailleur');
  });

  it('Propryo est TOUJOURS présent, à la même hauteur que la marque de gauche', () => {
    for (const arg of [{ entLogo: 'data:x', entNom: 'A', logoRatio: 3 }, { entLogo: '', entNom: 'A' }]) {
      const m = brandzoneModel(arg);
      expect(m.propryo.mot).toBe('Propryo');
      expect(m.propryo.markSize).toBe(m.logoH);
    }
  });
});

describe('brandzoneHtml — rendu pour les documents HTML (quittance, IRL, décompte…)', () => {
  it('place le logo bailleur à gauche et le lockup Propryo à droite', () => {
    const h = brandzoneHtml(brandzoneModel({ entLogo: 'data:image/png;base64,AAA', entNom: 'SCI KELLER', logoRatio: 3 }));
    expect(h.indexOf('data:image/png;base64,AAA')).toBeLessThan(h.indexOf('Propryo'));
    expect(h).toContain('margin-left:auto');             // Propryo poussé à droite
    expect(h).toContain('border-bottom');                // filet fin sous le bandeau
  });

  it('sans logo, affiche le nom de l\'entité — échappé', () => {
    const h = brandzoneHtml(brandzoneModel({ entLogo: '', entNom: 'SCI <script>x</script>' }));
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
  });

  it('le SVG remplit exactement son carré (sinon le lockup dépasse le logo bailleur)', () => {
    const h = brandzoneHtml(brandzoneModel({ entLogo: '', entNom: 'A' }));
    expect(h).toContain('<svg style="width:100%;height:100%;display:block"');
    expect(h).toContain('line-height:0');
  });

  it('embarque le tracé du logo — aucune ressource à télécharger', () => {
    const h = brandzoneHtml(brandzoneModel({ entLogo: '', entNom: 'A' }));
    expect(h).toContain('<svg');
    // xmlns est un espace de noms, pas un téléchargement : on interdit src/href/url() distants.
    expect(h).not.toMatch(/(?:src|href)\s*=\s*"https?:/);
    expect(h).not.toMatch(/url\(\s*https?:/);
  });
});
