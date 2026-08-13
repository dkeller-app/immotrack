/**
 * pdf-flow.global.js — Wrapper browser (window.PdfFlow)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/pdf-flow.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // __tests__/helpers/pdf-flow.js
  // Flux de texte du générateur PDF natif : où couper un bloc pour qu'il ne descende JAMAIS
  // dans la bande basse réservée au pied de page et aux cases de paraphe.
  // PUR : aucune dépendance jsPDF/DOM. Sérialisé tel quel (toString) dans la popup de signature.
  //
  // POURQUOI (retour smoke 13/08 : « les paraphes sont sur le texte ») : le pied est dessiné
  // APRÈS coup, à position fixe, sur chaque page — filet à 275 mm, cases de paraphe à 279,5 mm.
  // Tout contenu qui franchit 272 mm se retrouve donc SOUS les paraphes. drawText écrivait
  // toutes les lignes d'un bloc en un seul pdf.text, sans jamais couper.

  /** Repères du gabarit A4 du bail (mm) — alignés sur PDF_NATIVE du générateur. */
  const PDF_BODY = {
    PAGE_H: 297,
    MARGIN_TOP: 15,
    MARGIN_BOTTOM: 25,
    FOOT_LINE_Y: 275,        // filet du pied  = PAGE_H - MARGIN_BOTTOM + 5 - 2
    PARAPHE_BOX_Y: 279.5     // haut des cases = PAGE_H - MARGIN_BOTTOM + 5 + 2.5
  };

  // Sections dont les pages ne portent PAS de case de paraphe. Depuis le retour user du 13/08,
  // il n'en reste qu'une : la page §18, qui porte les cadres de signature — on n'y paraphe pas,
  // on y signe. Les ANNEXES A et B (décrets 87-712 / 87-713) et la NOTICE d'information sont
  // désormais paraphées comme le reste du bail : elles font partie du contrat remis au locataire.
  const SECTIONS_SANS_PARAPHE = ['signatures'];

  /**
   * Étiquette chaque page du document : à quelle section elle appartient, et si elle porte
   * une case de paraphe. Une section couvre de sa page de début jusqu'à la section suivante.
   * @param {number} totalPages
   * @param {Object<string,number>} startPageByKind  ex. { signatures: 13, 'annexe-a': 14 }
   * @param {string[]} [sansParaphe] défaut SECTIONS_SANS_PARAPHE
   * @returns {Array<{page:number, kind:string, noParaphe:boolean}>}
   */
  function pageKinds(totalPages, startPageByKind, sansParaphe) {
    var sans = sansParaphe || SECTIONS_SANS_PARAPHE;
    var map = startPageByKind || {};
    var out = [];
    for (var p = 1; p <= totalPages; p++) {
      var kind = 'paraphe', best = 0;
      for (var k in map) {
        if (map[k] != null && map[k] <= p && map[k] >= best) { best = map[k]; kind = k; }
      }
      out.push({ page: p, kind: kind, noParaphe: sans.indexOf(kind) !== -1 });
    }
    return out;
  }

  /** Ordonnée à ne pas franchir pour le corps du document (272 mm en A4). */
  function bodyBottom(opts) {
    var o = opts || {};
    var pageH = o.pageH == null ? PDF_BODY.PAGE_H : o.pageH;
    var mb = o.marginBottom == null ? PDF_BODY.MARGIN_BOTTOM : o.marginBottom;
    return pageH - mb;
  }

  /**
   * Découpe un bloc de `nLines` lignes en tronçons qui tiennent chacun dans le corps de sa page.
   * @returns {Array<{page:number, y:number, from:number, to:number}>}
   *          page = décalage de page par rapport à la page courante (0 = celle-ci) ;
   *          y = ordonnée de la 1re ligne du tronçon ; [from, to) = indices des lignes.
   */
  function splitBlockAcrossPages(y, nLines, lineHeight, opts) {
    var o = opts || {};
    var top = o.marginTop == null ? PDF_BODY.MARGIN_TOP : o.marginTop;
    var bottom = bodyBottom(o);
    var n = Math.max(0, nLines | 0);
    if (!n) return [];
    var h = lineHeight > 0 ? lineHeight : 0;
    if (!h) return [{ page: 0, y: y, from: 0, to: n }];   // hauteur nulle : rien ne peut déborder

    var out = [], page = 0, cur = y, done = 0;
    while (done < n) {
      var fit = Math.floor((bottom - cur) / h);
      if (fit <= 0) {
        // Rien ne tient ici : page suivante. Si même une page vide ne suffit pas (ligne plus haute
        // qu'une page), on en pose UNE quand même — sinon la boucle ne se terminerait jamais.
        page++; cur = top;
        fit = Math.floor((bottom - cur) / h);
        if (fit <= 0) fit = 1;
      }
      var take = Math.min(fit, n - done);
      out.push({ page: page, y: cur, from: done, to: done + take });
      done += take;
      cur += take * h;
    }
    return out;
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.PdfFlow = {
    PDF_BODY: PDF_BODY,
    SECTIONS_SANS_PARAPHE: SECTIONS_SANS_PARAPHE,
    bodyBottom: bodyBottom,
    splitBlockAcrossPages: splitBlockAcrossPages,
    pageKinds: pageKinds
  };
})(typeof window !== 'undefined' ? window : globalThis);
