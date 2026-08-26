/**
 * doc-native.global.js — Wrapper browser (window.DocNative)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/doc-native.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  // ─── DÉPENDANCES IMPORTÉES depuis ./pdf-flow.js (résolues via global) ───
  function splitBlockAcrossPages(){
    if (!global.PdfFlow || typeof global.PdfFlow.splitBlockAcrossPages !== 'function') {
      console.warn('[mirror doc-native] dep manquante: global.PdfFlow.splitBlockAcrossPages');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.PdfFlow.splitBlockAcrossPages.apply(null, arguments);
  }

  // ─── DÉPENDANCES IMPORTÉES depuis ./doc-brand.js (résolues via global) ───
  function brandzoneModel(){
    if (!global.DocBrand || typeof global.DocBrand.brandzoneModel !== 'function') {
      console.warn('[mirror doc-native] dep manquante: global.DocBrand.brandzoneModel');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.DocBrand.brandzoneModel.apply(null, arguments);
  }
  function propryoMarkOps(){
    if (!global.DocBrand || typeof global.DocBrand.propryoMarkOps !== 'function') {
      console.warn('[mirror doc-native] dep manquante: global.DocBrand.propryoMarkOps');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.DocBrand.propryoMarkOps.apply(null, arguments);
  }

  // ─── DÉPENDANCES IMPORTÉES depuis ./montant-doc.js (résolues via global) ───
  function pdfSafeText(){
    if (!global.MontantDoc || typeof global.MontantDoc.pdfSafeText !== 'function') {
      console.warn('[mirror doc-native] dep manquante: global.MontantDoc.pdfSafeText');
      // Fallback minimal pour formatAdresse-like (objet imm → string vide ou rue)
      return (arguments[0] && typeof arguments[0] === 'object' && arguments[0].adr) ? arguments[0].adr : '';
    }
    return global.MontantDoc.pdfSafeText.apply(null, arguments);
  }

  // __tests__/helpers/doc-native.js — CDC-QUITTANCES-IRL D26 : le MOTEUR d'écriture NATIF partagé
  // pour tous les documents émis (fini la rasterisation html2canvas).
  //
  // POURQUOI (D26) : les quatre documents restants (quittance, lettre IRL, décompte de charges,
  // récap DDT) sortaient en IMAGE (html2canvas → JPEG → addImage) : 449 Ko, 2 pages, 184 DPI,
  // flous. Le moteur natif du bail (`PDF_NATIVE`, v13.05) était enfermé dans la source stringifiée
  // de la fenêtre d'aperçu du bail — inatteignable depuis la fenêtre principale. Ce module l'expose.
  //
  // DEUX rôles, un seul fichier :
  //  1. `PDF_NATIVE` — les primitives de tracé jsPDF (marges A4, drawText à retour à la ligne,
  //     drawTitle, drawTable via autoTable, drawBrandzone vectoriel). Sous-ensemble « document »
  //     du moteur du bail (les méthodes de signature/paraphe restent au bail).
  //  2. Un pont HTML→NATIF SANS DOM : `parseDocDoc` lit le HTML `.pro-doc` que produisent déjà les
  //     générateurs (`_buildQuittanceHtml`/`_buildIRLLetterHtml`/`_buildDecompteHtml`, via le gabarit
  //     unique DocTemplate) et le rejoue en texte natif. AUCUN mot n'est réécrit : le fond juridique
  //     est celui de l'aperçu, mot pour mot (garde-fou D26 « zéro mot perdu/ajouté »).
  //
  // PUR côté parsing (aucun DOM — la cible de test est `node`) : le découpage se fait sur les
  // classes STABLES du gabarit (`pro-parties`, `pro-lignes`, `pro-tbl`, `pro-acte`, `pro-mention`,
  // `pro-encart`, `pro-lieu`, `pro-signzone`). Le tracé, lui, s'exerce contre une fausse instance
  // jsPDF qui capture `text()` — comme email-pdf-attachment.test.js.
  //
  // Tests : __tests__/helpers/doc-native.test.js




  // ────────────────────────────────────────────────────────────────────────────
  // 1. Décodage HTML → texte (aucune balise, entités WinAnsi décodées, texte assaini)
  // ────────────────────────────────────────────────────────────────────────────

  const _SP = String.fromCharCode(32);    // espace ASCII garanti
  const _NBSP = String.fromCharCode(160);  // espace insécable WinAnsi (0xA0)

  /** Entités rencontrées dans le fond des documents (escHtml + littéraux des gabarits). */
  function _decodeEntities(s) {
    return String(s == null ? '' : s)
      // Les frontières de blocs séparent les mots (comme le navigateur les rend) : sans ça, deux
      // paragraphes voisins « habilité ;</p><p>Désigné(s) » se colleraient en « ;Désigné(s) ».
      .replace(/<\/?(?:p|div|h[1-6]|li|tr|ul|ol|table|thead|tbody)\b[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, _NBSP)
      .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
      .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
      .replace(/&ccedil;/g, 'ç').replace(/&ecirc;/g, 'ê').replace(/&ocirc;/g, 'ô')
      .replace(/&euro;/g, '€')
      .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&rsquo;/g, '’')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'); // en dernier, sinon double-décodage
  }

  function _trimAsciiWs(l) {
    return l.replace(/[\t\x20]+$/, '').replace(/^[\t\x20]+/, '').replace(/[\t\x20]{2,}/g, _SP);
  }

  /**
   * HTML → texte : balises retirées, <br> → saut de ligne, espaces ASCII normalisés, PUIS assaini
   * WinAnsi (pdfSafeText). Les caractères non encodables par les polices standard (emoji décoratifs
   * ⏱/✓/⚠/🔒, espaces exotiques d'ICU) sont retirés ICI, en amont : le rendu natif ne les envoie
   * jamais à pdf.text, ce qui garantit « 0 avertissement [pdfSafeText] » (D26). Accents, €, «»,
   * tirets typographiques — tous WinAnsi — sont conservés.
   */
  function htmlToText(s) {
    const t = _decodeEntities(s);
    const lines = t.split('\n').map(l => _trimAsciiWs(pdfSafeText(_trimAsciiWs(l))));
    return lines.join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{2,}/g, '\n');
  }

  /** HTML → suite de mots (pour le garde-fou « zéro mot perdu/ajouté »). */
  function htmlToWords(s) {
    return htmlToText(s).split(/\s+/).filter(Boolean);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Tokenizer SANS DOM du corps d'un document du gabarit
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Découpe une chaîne HTML en blocs de PREMIER niveau (div / p / table), en respectant
   * l'imbrication (un `<div class="pro-parties">` qui contient des `<p>` reste un seul bloc ;
   * une `<table>` reste atomique). Le texte inter-blocs (espaces/retours) est ignoré.
   */
  function splitTopLevelBlocks(html) {
    const s = String(html || '');
    const blocks = [];
    const tagRe = /<(\/?)(?:(div|p|table))\b[^>]*>/gi;
    let depth = 0, start = -1, m;
    while ((m = tagRe.exec(s))) {
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      if (!closing) {
        if (depth === 0) start = m.index;
        // Une table de premier niveau est atomique : on saute jusqu'à </table> (ses cellules
        // peuvent contenir des <span>/<td>, jamais des blocs qu'on veut isoler).
        if (tag === 'table' && depth === 0) {
          const close = s.toLowerCase().indexOf('</table>', tagRe.lastIndex);
          const end = close < 0 ? s.length : close + 8;
          blocks.push(s.slice(m.index, end));
          start = -1; tagRe.lastIndex = end;
          continue;
        }
        depth++;
      } else {
        depth--;
        if (depth <= 0 && start >= 0) { blocks.push(s.slice(start, tagRe.lastIndex)); start = -1; depth = 0; }
      }
    }
    return blocks;
  }

  /** Retire la balise ouvrante et fermante extérieures d'un bloc (`<p ...>X</p>` → `X`). */
  function _inner(block) {
    return String(block || '').trim()
      .replace(/^<[a-z0-9]+\b[^>]*>/i, '')
      .replace(/<\/[a-z0-9]+>\s*$/i, '');
  }

  function _hasClass(s, cls) { return new RegExp('class="[^"]*\\b' + cls + '\\b').test(s); }

  function _parseParties(block) {
    const out = [];
    const re = /<div class="pro-partie">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(block))) {
      const inner = m[1];
      const label = (inner.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '';
      const qui = (inner.match(/<span class="pro-qui">([\s\S]*?)<\/span>/) || [])[1] || '';
      const corps = inner.replace(/<h2>[\s\S]*?<\/h2>/, '').replace(/<span class="pro-qui">[\s\S]*?<\/span>/, '');
      out.push({ label, qui, corps });
    }
    return out;
  }

  function _parseLignes(block) {
    const out = [];
    const re = /<div class="pro-lg([^"]*)">\s*<span class="lab">([\s\S]*?)<\/span>\s*<span class="val">([\s\S]*?)<\/span>\s*<\/div>/g;
    let m;
    while ((m = re.exec(block))) {
      out.push({ lab: m[2], val: m[3], tot: /\btot\b/.test(m[1]), hi: /\bhi\b/.test(m[1]) });
    }
    return out;
  }

  function _parseSignzone(block) {
    const out = [];
    let m, any = false;
    const objRe = /<div class="pro-sigspace">([\s\S]*?)<\/div>\s*<div class="pro-signbox">([\s\S]*?)<\/div>/g;
    while ((m = objRe.exec(block))) { out.push({ sig: m[1], label: m[2] }); any = true; }
    if (any) return out;
    const strRe = /<div class="pro-signbox">([\s\S]*?)<\/div>/g;
    while ((m = strRe.exec(block))) out.push({ sig: '', label: m[1] });
    return out;
  }

  function _parseTbl(block) {
    const rows = [...block.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)];
    let head = null; const body = []; let foot = null;
    for (const [, attrs, cellsHtml] of rows) {
      const cells = [...cellsHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => c[1]);
      if (/<th/i.test(cellsHtml)) { head = cells; continue; }
      if (/\btot\b/.test(attrs)) { foot = cells; continue; }
      body.push(cells);
    }
    return { head, rows: body, foot };
  }

  /** Classe un bloc de premier niveau du corps d'un document. */
  function classifyBlock(raw) {
    const s = String(raw || '').trim();
    if (_hasClass(s, 'no-print') || _hasClass(s, 'alerte')) return { t: 'alerte', v: s, screenOnly: true };
    if (_hasClass(s, 'pro-parties')) return { t: 'parties', blocs: _parseParties(s) };
    if (_hasClass(s, 'pro-lignes')) return { t: 'lignes', rows: _parseLignes(s) };
    if (_hasClass(s, 'pro-tbl') || /^<table/i.test(s)) return Object.assign({ t: 'tbl' }, _parseTbl(s));
    if (_hasClass(s, 'pro-acte')) return { t: 'acte', v: _inner(s) };
    if (_hasClass(s, 'pro-mention')) return { t: 'mention', v: _inner(s) };
    if (_hasClass(s, 'pro-encart')) return { t: 'encart', v: _inner(s) };
    if (_hasClass(s, 'pro-lieu')) return { t: 'lieu', v: _inner(s) };
    if (_hasClass(s, 'pro-signzone')) return { t: 'signzone', boxes: _parseSignzone(s) };
    return { t: 'para', v: _inner(s) };
  }

  /** Contenu à l'intérieur du conteneur `.pro-doc`. */
  function _innerProDoc(html) {
    const s = String(html || '');
    const m = s.match(/<div class="pro-doc"[^>]*>/);
    if (!m) return s;
    const open = m.index + m[0].length;
    const close = s.lastIndexOf('</div>');
    return close > open ? s.slice(open, close) : s.slice(open);
  }

  /**
   * Reconstruit un document du gabarit : {titre, ctx, ref, date, blocks}. Le bandeau (avant le
   * titre) et le pied sont retirés du corps — le bandeau est rejoué en vectoriel, le pied est
   * porté par {ref, date}.
   */
  function parseDocDoc(html) {
    const inner = _innerProDoc(html);
    const top = splitTopLevelBlocks(inner);
    const titreIdx = top.findIndex(b => _hasClass(b, 'pro-titre'));
    const piedIdx = top.findIndex(b => _hasClass(b, 'pro-pied'));
    const titreBlock = titreIdx >= 0 ? top[titreIdx] : '';
    const piedBlock = piedIdx >= 0 ? top[piedIdx] : '';
    const titre = (titreBlock.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
    const ctx = (titreBlock.match(/<p class="pro-ctx">([\s\S]*?)<\/p>/) || [])[1] || '';
    const piedSpans = [...piedBlock.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(mm => htmlToText(mm[1]));
    const from = titreIdx >= 0 ? titreIdx + 1 : 0;
    const to = piedIdx >= 0 ? piedIdx : top.length;
    const blocks = [];
    for (let k = from; k < to; k++) {
      const raw = top[k];
      if (_hasClass(raw, 'pro-titre') || _hasClass(raw, 'pro-pied')) continue;
      blocks.push(classifyBlock(raw));
    }
    return { titre: htmlToText(titre), ctx: htmlToText(ctx), ref: piedSpans[0] || '', date: piedSpans[1] || '', blocks };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Mots d'un document (garde-fou « zéro mot perdu/ajouté »)
  // ────────────────────────────────────────────────────────────────────────────

  function _blockText(b) {
    if (!b || b.screenOnly) return '';
    switch (b.t) {
      case 'parties': return (b.blocs || []).map(p => [p.label, p.qui, htmlToText(p.corps)].filter(Boolean).join(' ')).join(' ');
      case 'lignes': return (b.rows || []).map(r => htmlToText(r.lab) + ' ' + htmlToText(r.val)).join(' ');
      case 'tbl': return [(b.head || []).map(htmlToText).join(' '), (b.rows || []).map(r => r.map(htmlToText).join(' ')).join(' '), (b.foot || []).map(htmlToText).join(' ')].join(' ');
      case 'signzone': return (b.boxes || []).map(x => htmlToText(x.label)).join(' ');
      default: return htmlToText(b.v);
    }
  }

  /** La suite de mots d'un document (titre, ctx, corps, pied) — hors bandeaux d'écran no-print. */
  function docWords(parsed) {
    const p = parsed || {};
    const parts = [p.titre || '', p.ctx || ''];
    for (const b of (p.blocks || [])) parts.push(_blockText(b));
    parts.push(p.ref || '', p.date || '');
    return parts.join(' ').split(/\s+/).filter(Boolean);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. PDF_NATIVE — primitives de tracé (sous-ensemble « document » du moteur du bail v13.05)
  // ────────────────────────────────────────────────────────────────────────────

  const PDF_NATIVE = {
    MARGIN_LEFT: 15, MARGIN_RIGHT: 15, MARGIN_TOP: 15, MARGIN_BOTTOM: 25,
    PAGE_W: 210, PAGE_H: 297, CONTENT_W: 180,
    FONT_FAMILY: 'helvetica',
    FONT_SIZE_BODY: 10.5, FONT_SIZE_H1: 14, FONT_SIZE_H2: 11, FONT_SIZE_H3: 10.5, FONT_SIZE_NOTE: 9, FONT_SIZE_SMALL: 8,
    PARAGRAPH_GAP: 2.5, H2_GAP_BEFORE: 6, H2_GAP_AFTER: 3, H3_GAP_BEFORE: 4, H3_GAP_AFTER: 2,
    COLOR_TEXT: [25, 25, 25], COLOR_MUTED: [110, 110, 110], COLOR_TITLE: [10, 10, 10],
    COLOR_BORDER: [180, 180, 180], COLOR_TABLE_HEADER_BG: [240, 240, 240],
    COLOR_PLACEHOLDER_BORDER: [200, 200, 200], COLOR_PLACEHOLDER_LABEL: [150, 150, 150],

    drawText: function (pdf, text, x, y, opts) {
      opts = opts || {};
      var size = opts.size || PDF_NATIVE.FONT_SIZE_BODY;
      var style = opts.style || 'normal';
      var color = opts.color || PDF_NATIVE.COLOR_TEXT;
      var maxWidth = opts.maxWidth || PDF_NATIVE.CONTENT_W;
      var align = opts.align || 'left';
      pdf.setFont(PDF_NATIVE.FONT_FAMILY, style);
      pdf.setFontSize(size);
      pdf.setTextColor(color[0], color[1], color[2]);
      var lines = pdf.splitTextToSize(String(text || ''), maxWidth);
      var lineHeight = size * 0.4;
      var actualX = x;
      if (align === 'center') actualX = x + maxWidth / 2;
      else if (align === 'right') actualX = x + maxWidth;
      var _chunks = splitBlockAcrossPages(y, lines.length, lineHeight, { pageH: PDF_NATIVE.PAGE_H, marginTop: PDF_NATIVE.MARGIN_TOP, marginBottom: PDF_NATIVE.MARGIN_BOTTOM });
      if (!_chunks.length) return y;
      var _endY = y, _prevPage = 0;
      for (var _c = 0; _c < _chunks.length; _c++) {
        var _ch = _chunks[_c];
        while (_prevPage < _ch.page) { pdf.addPage(); _prevPage++; }
        pdf.text(lines.slice(_ch.from, _ch.to), actualX, _ch.y, { align: align, baseline: 'top' });
        _endY = _ch.y + (_ch.to - _ch.from) * lineHeight;
      }
      return _endY + 0.5;
    },

    drawTitle: function (pdf, level, text, x, y, opts) {
      opts = opts || {};
      var maxWidth = opts.maxWidth || PDF_NATIVE.CONTENT_W;
      if (level === 1) {
        var newY1 = PDF_NATIVE.drawText(pdf, text, x, y + 4, { size: PDF_NATIVE.FONT_SIZE_H1, style: 'bold', color: PDF_NATIVE.COLOR_TITLE, align: 'center', maxWidth: maxWidth });
        return newY1 + 4;
      } else if (level === 2) {
        y += PDF_NATIVE.H2_GAP_BEFORE;
        var newY2 = PDF_NATIVE.drawText(pdf, String(text || '').toUpperCase(), x, y, { size: PDF_NATIVE.FONT_SIZE_H2, style: 'bold', color: PDF_NATIVE.COLOR_TITLE, maxWidth: maxWidth });
        pdf.setDrawColor(60, 60, 60); pdf.setLineWidth(0.4);
        pdf.line(x, newY2 + 0.5, x + maxWidth, newY2 + 0.5);
        return newY2 + PDF_NATIVE.H2_GAP_AFTER + 2;
      } else if (level === 3) {
        y += PDF_NATIVE.H3_GAP_BEFORE;
        var newY3 = PDF_NATIVE.drawText(pdf, text, x, y, { size: PDF_NATIVE.FONT_SIZE_H3, style: 'bold', color: PDF_NATIVE.COLOR_TITLE, maxWidth: maxWidth });
        return newY3 + PDF_NATIVE.H3_GAP_AFTER;
      }
      return y;
    },

    drawBrandzone: function (pdf, item, y) {
      item = item || {};
      var ratio = 1;
      if (item.logo) { try { var pr = pdf.getImageProperties(item.logo); if (pr && pr.height) ratio = pr.width / pr.height; } catch (e) {} }
      var m = brandzoneModel({ entLogo: item.logo, entNom: item.sciNom, logoRatio: ratio });
      var x = PDF_NATIVE.MARGIN_LEFT, right = PDF_NATIVE.PAGE_W - PDF_NATIVE.MARGIN_RIGHT;
      var bandH = m.logoH, topY = y;
      if (m.left.kind === 'logo') {
        try { pdf.addImage(item.logo, PDF_NATIVE.MARGIN_LEFT, topY, m.left.w, m.left.h); bandH = Math.max(bandH, m.left.h); }
        catch (e) { console.warn('[brandzone] logo bailleur illisible', e); }
      }
      var wordSize = m.propryo.wordSize * 2.83;
      pdf.setFont(PDF_NATIVE.FONT_FAMILY, 'bold'); pdf.setFontSize(wordSize);
      var wordW = pdf.getTextWidth(m.propryo.mot);
      var markSize = m.propryo.markSize, gap = markSize * 0.28;
      var markX = right - wordW - gap - markSize, markY = topY + (bandH - markSize) / 2;
      var ops = propryoMarkOps(markX, markY, markSize);
      for (var k = 0; k < ops.length; k++) {
        var o = ops[k];
        if (o.op === 'roundedRect') { pdf.setDrawColor(o.color[0], o.color[1], o.color[2]); pdf.setLineWidth(o.lineWidth); pdf.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, 'S'); }
        else { pdf.setFillColor(o.color[0], o.color[1], o.color[2]); pdf.circle(o.x, o.y, o.r, 'F'); }
      }
      pdf.setTextColor(16, 21, 33);
      pdf.text(m.propryo.mot, right, markY + markSize * 0.78, { align: 'right' });
      var ruleY = topY + bandH + 4;
      pdf.setDrawColor(228, 231, 238); pdf.setLineWidth(0.35);
      pdf.line(x, ruleY, right, ruleY);
      pdf.setTextColor(PDF_NATIVE.COLOR_TEXT[0], PDF_NATIVE.COLOR_TEXT[1], PDF_NATIVE.COLOR_TEXT[2]);
      return ruleY + 7;
    },

    drawTable: function (pdf, headers, rows, startY, opts) {
      opts = opts || {};
      var conf = {
        body: rows, startY: startY,
        margin: { top: PDF_NATIVE.MARGIN_TOP, left: PDF_NATIVE.MARGIN_LEFT, right: PDF_NATIVE.MARGIN_RIGHT, bottom: PDF_NATIVE.MARGIN_BOTTOM },
        styles: { font: PDF_NATIVE.FONT_FAMILY, fontSize: PDF_NATIVE.FONT_SIZE_BODY - 0.5, cellPadding: 1.5, textColor: PDF_NATIVE.COLOR_TEXT, lineColor: PDF_NATIVE.COLOR_BORDER, lineWidth: 0.1 },
        headStyles: { fillColor: PDF_NATIVE.COLOR_TABLE_HEADER_BG, textColor: PDF_NATIVE.COLOR_TITLE, fontStyle: 'bold' }
      };
      if (headers) conf.head = [headers];
      if (opts.columnStyles) conf.columnStyles = opts.columnStyles;
      if (opts.styles) Object.assign(conf.styles, opts.styles);
      pdf.autoTable(conf);
      return pdf.lastAutoTable.finalY + 2;
    },

    newPageIfNeeded: function (pdf, currentY, neededSpace) {
      if (currentY + (neededSpace || 10) > PDF_NATIVE.PAGE_H - PDF_NATIVE.MARGIN_BOTTOM) {
        pdf.addPage(); return PDF_NATIVE.MARGIN_TOP;
      }
      return currentY;
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Rendu natif d'un document parsé
  // ────────────────────────────────────────────────────────────────────────────

  /** Extrait le src d'une <img> (signature bailleur posée en image, comme l'EDL). */
  function _imgSrc(html) {
    var m = String(html || '').match(/<img[^>]*\bsrc="([^"]*)"/i);
    return m ? m[1] : '';
  }

  /**
   * Rejoue un document parsé (parseDocDoc) en texte natif. Le bandeau est tracé en vectoriel
   * depuis `ent` ; les signatures bailleur restent des images posées par addImage (comme l'EDL).
   * @param {object} pdf   instance jsPDF déjà blindée (MontantDoc.hardenJsPdfText)
   * @param {object} ent   entité bailleur (logo, nom)
   * @param {object} parsed sortie de parseDocDoc
   * @param {object} PN    PDF_NATIVE (injectable pour test)
   */
  function renderDocToPdf(pdf, ent, parsed, PN) {
    PN = PN || PDF_NATIVE;
    const x = PN.MARGIN_LEFT, right = PN.PAGE_W - PN.MARGIN_RIGHT, W = PN.CONTENT_W;
    let y = PN.MARGIN_TOP;
    try { y = PN.drawBrandzone(pdf, { logo: ent && ent.logo, sciNom: (ent && ent.nom) || '' }, y); } catch (e) { y = PN.MARGIN_TOP + 8; }
    if (parsed.titre) y = PN.drawTitle(pdf, 1, parsed.titre, x, y);
    if (parsed.ctx) y = PN.drawText(pdf, parsed.ctx, x, y, { size: PN.FONT_SIZE_NOTE, color: PN.COLOR_MUTED }) + 2;

    for (const b of (parsed.blocks || [])) {
      if (!b || b.screenOnly) continue;
      y = PN.newPageIfNeeded(pdf, y, b.t === 'tbl' ? 40 : 14);
      switch (b.t) {
        case 'parties':
          for (const p of (b.blocs || [])) {
            y = PN.newPageIfNeeded(pdf, y, 16);
            y = PN.drawText(pdf, htmlToText(p.label).toUpperCase(), x, y, { size: PN.FONT_SIZE_SMALL, color: PN.COLOR_MUTED }) + 0.5;
            if (p.qui) y = PN.drawText(pdf, htmlToText(p.qui), x, y, { style: 'bold' });
            const corps = htmlToText(p.corps);
            if (corps) y = PN.drawText(pdf, corps, x, y);
            y += PN.PARAGRAPH_GAP;
          }
          break;
        case 'acte':
        case 'para':
          y = PN.drawText(pdf, htmlToText(b.v), x, y) + PN.PARAGRAPH_GAP;
          break;
        case 'lignes': {
          const valW = 46;
          for (const r of (b.rows || [])) {
            y = PN.newPageIfNeeded(pdf, y, 8);
            const style = r.tot ? 'bold' : 'normal';
            const color = r.hi ? [255, 90, 60] : (r.tot ? PN.COLOR_TITLE : PN.COLOR_TEXT);
            const yLab = PN.drawText(pdf, htmlToText(r.lab), x, y, { style: style, maxWidth: W - valW - 4 });
            PN.drawText(pdf, htmlToText(r.val), right - valW, y, { style: style, color: color, align: 'right', maxWidth: valW });
            y = yLab + 0.5;
          }
          y += PN.PARAGRAPH_GAP;
          break;
        }
        case 'tbl': {
          const rows = (b.rows || []).map(r => r.map(htmlToText));
          if (b.foot) rows.push(b.foot.map(htmlToText));
          const head = b.head ? b.head.map(htmlToText) : null;
          const nCol = head ? head.length : (rows[0] ? rows[0].length : 1);
          const colStyles = {}; if (nCol > 1) colStyles[nCol - 1] = { halign: 'right' };
          y = PN.drawTable(pdf, head, rows, y, { columnStyles: colStyles }) + PN.PARAGRAPH_GAP;
          break;
        }
        case 'mention':
        case 'encart':
          y = PN.drawText(pdf, htmlToText(b.v), x, y, { size: PN.FONT_SIZE_NOTE, color: PN.COLOR_MUTED }) + PN.PARAGRAPH_GAP;
          break;
        case 'lieu':
          y += 2;
          y = PN.drawText(pdf, htmlToText(b.v), x, y) + PN.PARAGRAPH_GAP;
          break;
        case 'signzone': {
          y = PN.newPageIfNeeded(pdf, y, 24);
          y += 3;
          const boxes = b.boxes || [];
          const bw = 70, gap = 8;
          let bx = boxes.length > 1 ? x : right - bw;
          const yTop = y;
          let maxY = y;
          for (const box of boxes) {
            let yy = yTop;
            const src = _imgSrc(box.sig);
            if (src) { try { pdf.addImage(src, 'PNG', bx, yy, Math.min(bw, 58), 10); } catch (e) {} }
            yy += 11;
            pdf.setDrawColor(120, 120, 120); pdf.setLineWidth(0.2);
            pdf.line(bx, yy, bx + bw, yy);
            yy += 2;
            yy = PN.drawText(pdf, htmlToText(box.label), bx, yy, { size: PN.FONT_SIZE_SMALL, color: PN.COLOR_MUTED, maxWidth: bw });
            maxY = Math.max(maxY, yy);
            bx += bw + gap;
          }
          y = maxY + PN.PARAGRAPH_GAP;
          break;
        }
        default:
          y = PN.drawText(pdf, htmlToText(b.v), x, y) + PN.PARAGRAPH_GAP;
      }
    }

    // Pied : réf. à gauche, date à droite — comme le pied du gabarit (deux <span>, sans séparateur).
    const footY = Math.min(y + 4, PN.PAGE_H - PN.MARGIN_BOTTOM + 5);
    if (parsed.ref) PN.drawText(pdf, parsed.ref, x, footY, { size: PN.FONT_SIZE_SMALL, color: PN.COLOR_MUTED, maxWidth: W / 2 });
    if (parsed.date) PN.drawText(pdf, parsed.date, x + W / 2, footY, { size: PN.FONT_SIZE_SMALL, color: PN.COLOR_MUTED, align: 'right', maxWidth: W / 2 });
    return pdf;
  }

  /**
   * Point d'entrée : HTML `.pro-doc` (sortie d'un `_buildXHtml`) → Blob PDF natif.
   * @param {Function} JsPdfCls classe jsPDF
   * @param {object} ent  entité bailleur
   * @param {string} html HTML du document (gabarit)
   * @param {object} [opts] { hardenText }
   * @returns {Blob}
   */
  function docHtmlToPdfBlob(JsPdfCls, ent, html, opts) {
    opts = opts || {};
    const pdf = new JsPdfCls({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    if (opts.hardenText) opts.hardenText(pdf);
    const parsed = parseDocDoc(html);
    renderDocToPdf(pdf, ent, parsed, PDF_NATIVE);
    return pdf.output('blob');
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.DocNative = {
    htmlToText: htmlToText,
    htmlToWords: htmlToWords,
    splitTopLevelBlocks: splitTopLevelBlocks,
    classifyBlock: classifyBlock,
    parseDocDoc: parseDocDoc,
    docWords: docWords,
    PDF_NATIVE: PDF_NATIVE,
    renderDocToPdf: renderDocToPdf,
    docHtmlToPdfBlob: docHtmlToPdfBlob
  };
})(typeof window !== 'undefined' ? window : globalThis);
