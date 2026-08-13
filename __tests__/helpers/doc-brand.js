// __tests__/helpers/doc-brand.js
// S4 — bandeau d'identité, commun à TOUS les documents émis (bail, quittance, lettre IRL,
// décompte de charges, EDL, acte de cautionnement, certificat de preuve).
// PUR : aucune dépendance DOM/jsPDF. Sérialisé tel quel (toString) dans la popup de signature.
//
// SOURCE — rien n'est inventé ici :
//   • Gabarit : mockups/DOCUMENTS-PROPRYO (variante B validée par Didier le 12/08) —
//     émetteur à gauche, Propryo à droite, MÊME hauteur pilotée par une seule variable,
//     filet fin dessous. Sans logo bailleur, son NOM prend la place, et le bandeau se resserre.
//   • Logo : piste 01 « Le point », tracé repris à l'identique de
//     mockups/SIGNATURE-PAGE-LOCATAIRE/sign-propryo.css (déjà en prod, page locataire du relais).
//
// En PDF, le tracé est rejoué en VECTORIEL (roundedRect + circle) plutôt que rastérisé :
// net à tout zoom, aucun canvas ni police en jeu, et la géométrie reste testable.

/** Cotes du bandeau, reprises du gabarit (mm). */
export const BRAND = {
  LOGO_H: 13,        // hauteur du logo bailleur  (--logo-h du gabarit)
  NOM_H: 5.3,        // hauteur quand c'est le NOM qui occupe la gauche
  LOGO_MAX_W: 62,    // largeur maximale du logo bailleur
  RULE_GAP: 4,       // espace sous le bandeau avant le filet
  BOTTOM_GAP: 7,     // espace sous le filet avant le contenu
  WORD_RATIO: 0.58   // taille du mot « Propryo » = 0,58 × hauteur du logo
};

/** Le tracé retenu, en coordonnées du viewBox 32×32 d'origine. */
export const PROPRYO_MARK = {
  viewBox: 32,
  rect: { x: 3.5, y: 3.5, w: 25, h: 25, r: 7.5, stroke: 3 },
  dot: { cx: 21, cy: 21, r: 4.2 },
  color: [255, 90, 60]                       // #ff5a3c — corail de la charte
};

/** Le même tracé en SVG, pour les documents HTML et l'app. */
export const PROPRYO_MARK_SVG =
  '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">'
  + '<rect x="3.5" y="3.5" width="25" height="25" rx="7.5" fill="none" stroke="#ff5a3c" stroke-width="3"/>'
  + '<circle cx="21" cy="21" r="4.2" fill="#ff5a3c"/></svg>';

/**
 * Le tracé mis à l'échelle pour jsPDF, en mm, à poser en (x, y) dans un carré de `size`.
 * @returns {Array<{op:'roundedRect'|'circle', ...}>} opérations à rejouer telles quelles.
 */
export function propryoMarkOps(x, y, size) {
  if (!(size > 0)) return [];
  var s = size / PROPRYO_MARK.viewBox;
  var R = PROPRYO_MARK.rect, D = PROPRYO_MARK.dot, C = PROPRYO_MARK.color;
  return [
    { op: 'roundedRect', x: x + R.x * s, y: y + R.y * s, w: R.w * s, h: R.h * s, r: R.r * s, lineWidth: R.stroke * s, color: C },
    { op: 'circle', x: x + D.cx * s, y: y + D.cy * s, r: D.r * s, color: C }
  ];
}

/** Largeur approchée du lockup « ▢ Propryo » en mm (marque + espace + mot). */
export function propryoLockupWidth(markSize, wordWidthMm) {
  return markSize + markSize * 0.28 + (wordWidthMm || markSize * 2.6);
}

/**
 * Modèle du bandeau. Ne renvoie JAMAIS un bandeau vide : sans logo ET sans nom d'entité,
 * la gauche affiche un libellé neutre.
 * @param {{entLogo?:string, entNom?:string, logoRatio?:number}} input
 *        logoRatio = largeur/hauteur de l'image du bailleur (1 si inconnu).
 */
export function brandzoneModel(input) {
  var o = input || {};
  var nom = String(o.entNom == null ? '' : o.entNom).trim() || 'Le bailleur';
  var logo = String(o.entLogo == null ? '' : o.entLogo).trim();
  if (logo) {
    var ratio = o.logoRatio > 0 ? o.logoRatio : 1;
    var h = BRAND.LOGO_H, w = h * ratio;
    if (w > BRAND.LOGO_MAX_W) { w = BRAND.LOGO_MAX_W; h = w / ratio; }   // bridé sans déformation
    return {
      logoH: BRAND.LOGO_H,
      left: { kind: 'logo', src: logo, w: w, h: h, alt: nom },
      propryo: { mot: 'Propryo', markSize: BRAND.LOGO_H, wordSize: BRAND.LOGO_H * BRAND.WORD_RATIO }
    };
  }
  return {
    logoH: BRAND.NOM_H,
    left: { kind: 'nom', text: nom, h: BRAND.NOM_H },
    propryo: { mot: 'Propryo', markSize: BRAND.NOM_H, wordSize: BRAND.NOM_H * BRAND.WORD_RATIO }
  };
}

function escBrand(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Bandeau prêt à insérer en tête d'un document HTML (quittance, IRL, décompte, cautionnement). */
export function brandzoneHtml(model) {
  var m = model || brandzoneModel({});
  var left = m.left.kind === 'logo'
    ? '<img src="' + escBrand(m.left.src) + '" alt="' + escBrand(m.left.alt) + '" style="height:'
      + m.left.h + 'mm;width:auto;max-width:' + BRAND.LOGO_MAX_W + 'mm;object-fit:contain;display:block">'
    : '<span style="font:700 13pt/1.15 \'Schibsted Grotesk\',system-ui,sans-serif;color:#101521;letter-spacing:-.02em">'
      + escBrand(m.left.text) + '</span>';
  return '<div style="display:flex;align-items:center;gap:8mm;padding-bottom:' + BRAND.RULE_GAP
    + 'mm;margin-bottom:' + BRAND.BOTTOM_GAP + 'mm;border-bottom:.35mm solid #e4e7ee">'
    + left
    + '<span style="margin-left:auto;display:flex;align-items:center;gap:.28em;font-size:' + m.logoH + 'mm">'
    // le SVG doit remplir EXACTEMENT le carré de 1em, sinon le lockup dépasse la hauteur
    // du logo bailleur et les deux marques ne se répondent plus (vérifié au navigateur).
    + '<span style="width:1em;height:1em;display:block;flex:none;line-height:0">'
    + PROPRYO_MARK_SVG.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ') + '</span>'
    + '<span style="font:800 ' + BRAND.WORD_RATIO + 'em/1 \'Schibsted Grotesk\',system-ui,sans-serif;color:#101521;letter-spacing:-.02em">Propryo</span>'
    + '</span></div>';
}
