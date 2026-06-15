// Conversion de repère jsPDF(mm, haut-gauche) → pdf-lib(pt, bas-gauche) + ancres de repli.
// PUR : aucune dépendance pdf-lib, aucun window.
//
// ⚠️ CONTRAT (garde anti-régression, bug double-conversion 2026-06-15) : les ancres du
// MANIFESTE (et les fallbackAnchors) sont TOUJOURS en mm/jsPDF top-left. C'est ICI, au
// tamponnage (stamp.js → rectFromJsPdf), que se fait l'UNIQUE conversion mm→pt + flip Y.
// L'ÉMETTEUR (app, buildSignManifest) ne doit JAMAIS pré-convertir : convertir des deux
// côtés applique mmToPt deux fois → ancres hors-page → tampons invisibles.

// Constantes reproduites depuis index.html (PDF_NATIVE + drawParaphesFooter).
export const PDF_NATIVE = {
  MARGIN_LEFT: 15, MARGIN_RIGHT: 15, MARGIN_TOP: 15, MARGIN_BOTTOM: 25,
  PAGE_W: 210, PAGE_H: 297,
  FOOT_Y: 297 - 25 + 5,        // 277 : ligne du label
  PARAPHE_RECT_DY: 2.5,        // les sous-cadres commencent à FOOT_Y + 2.5 = 279.5
  COL_W: 70, COL_H: 14
};

const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm) {
  return mm * PT_PER_MM;
}

// Boîte jsPDF (top-left, mm) → boîte pdf-lib (bottom-left, pt). pageHeightPt = page.getHeight().
export function rectFromJsPdf({ x, y, w, h }, pageHeightPt) {
  return {
    x: mmToPt(x),
    y: pageHeightPt - mmToPt(y + h),
    width: mmToPt(w),
    height: mmToPt(h)
  };
}

// Ancres déterministes quand le PDF n'a pas de manifeste (défensif). Coords en mm/jsPDF.
export function fallbackAnchors({ sigId, side, totalPages }) {
  const colX = side === 'locataire'
    ? PDF_NATIVE.PAGE_W - PDF_NATIVE.MARGIN_RIGHT - PDF_NATIVE.COL_W // 125
    : PDF_NATIVE.MARGIN_LEFT;                                        // 15
  const parapheY = PDF_NATIVE.FOOT_Y + PDF_NATIVE.PARAPHE_RECT_DY;   // 279.5
  const anchors = [];
  for (let p = 1; p <= totalPages; p++) {
    anchors.push({ sigId, kind: 'paraphe', page: p, x: colX, y: parapheY, w: PDF_NATIVE.COL_W, h: PDF_NATIVE.COL_H });
  }
  anchors.push({ sigId, kind: 'signature', page: totalPages, x: colX, y: 235, w: 90, h: 30, luApprouve: true });
  return anchors;
}
