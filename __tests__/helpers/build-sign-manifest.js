// __tests__/helpers/build-sign-manifest.js
import { rectFromJsPdf } from './bail-sign-coords.js';

// anchors: ancres mm jsPDF (top-left). pageHeightPt: hauteur page pdf-lib en points.
export function buildSignManifest(anchors, totalPages, pageHeightPt) {
  return {
    v: 1,
    totalPages,
    anchors: (anchors || []).map(a => {
      const r = rectFromJsPdf({ x: a.x, y: a.y, w: a.w, h: a.h }, pageHeightPt);
      const out = { sigId: a.sigId, kind: a.kind, page: a.page, x: r.x, y: r.y, w: r.width, h: r.height };
      if (a.luApprouve != null) out.luApprouve = a.luApprouve;
      return out;
    })
  };
}
