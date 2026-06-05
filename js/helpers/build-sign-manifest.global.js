/**
 * build-sign-manifest.global.js — Wrapper browser (window.BuildSignManifest)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/build-sign-manifest.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // ─── DÉPENDANCES IMPORTÉES depuis ./bail-sign-coords.js (résolues via global) ───
  function rectFromJsPdf(){
    if (!global.BailSignCoords || typeof global.BailSignCoords.rectFromJsPdf !== 'function') {
      console.warn('[mirror build-sign-manifest] dep manquante: global.BailSignCoords.rectFromJsPdf');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.BailSignCoords.rectFromJsPdf.apply(null, arguments);
  }

  // __tests__/helpers/build-sign-manifest.js

  // anchors: ancres mm jsPDF (top-left). pageHeightPt: hauteur page pdf-lib en points.
  function buildSignManifest(anchors, totalPages, pageHeightPt) {
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

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.BuildSignManifest = {
    buildSignManifest: buildSignManifest
  };
})(typeof window !== 'undefined' ? window : globalThis);
