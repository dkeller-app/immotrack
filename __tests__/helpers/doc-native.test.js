// __tests__/helpers/doc-native.test.js — CDC-QUITTANCES-IRL D26 (docs en TEXTE NATIF).
//
// Ce qu'on prouve, comportement par comportement :
//  - htmlToText / htmlToWords : décodent les entités et retirent le balisage SANS perdre un mot ;
//  - splitTopLevelBlocks : découpe le corps d'un document du gabarit en blocs de PREMIER niveau,
//    en respectant l'imbrication (pro-parties contient des <p>, une <table> reste atomique) ;
//  - parseDocDoc : reconstruit {titre, ctx, ref, date, blocks} depuis le HTML .pro-doc réel du
//    gabarit (celui que produisent _buildQuittanceHtml / _buildIRLLetterHtml / _buildDecompteHtml) ;
//  - docWords : les MOTS d'un document rendu, hors bandeaux d'écran no-print ;
//  - renderDocToPdf : chaque mot du document est envoyé à pdf.text() — AUCUN mot perdu ni ajouté
//    (le garde-fou de D26 : « zéro mot perdu/ajouté » entre l'aperçu et le PDF).
//
// PUR : aucun DOM. Le HTML de gabarit est reconstruit ici via les VRAIES primitives DocTemplate
// (importées du module de référence), donc on teste le tokenizer contre la vraie sortie, pas une
// approximation.

import { describe, it, expect } from 'vitest';
import {
  htmlToText, htmlToWords, splitTopLevelBlocks, parseDocDoc, docWords, renderDocToPdf, PDF_NATIVE
} from './doc-native.js';
import {
  docParties, docActe, docLignes, docMention, docEncart, docLieu, docSignzone, docPage
} from './doc-template.js';

// ── FakeJsPdf : capture les appels text() (mots rendus) comme email-pdf-attachment.test.js ──
function makeFakePdf() {
  const calls = [];
  const pdf = {
    calls,
    _font: 'helvetica', _size: 10.5,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getCurrentPageInfo: () => ({ pageNumber: 1 }) },
    lastAutoTable: { finalY: 0 },
    setFont() { return pdf; }, setFontSize(s) { pdf._size = s; return pdf; },
    setTextColor() { return pdf; }, setDrawColor() { return pdf; }, setFillColor() { return pdf; },
    setLineWidth() { return pdf; }, line() { return pdf; }, rect() { return pdf; },
    roundedRect() { return pdf; }, circle() { return pdf; }, addImage() { calls.push(['addImage']); return pdf; },
    getImageProperties() { return { width: 100, height: 40 }; },
    getTextWidth(t) { return String(t).length * 1.8; },
    addPage() { calls.push(['addPage']); return pdf; },
    splitTextToSize(t, w) {
      // Découpe naïve par largeur (approx. 1.8mm/char à 10.5pt) — suffisant pour le test.
      const words = String(t).split(/\s+/).filter(Boolean);
      const perLine = Math.max(1, Math.floor((w || 180) / 1.9));
      const lines = []; let cur = '';
      for (const wd of words) {
        if ((cur + ' ' + wd).length > perLine && cur) { lines.push(cur); cur = wd; }
        else cur = cur ? cur + ' ' + wd : wd;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    },
    text(t, x, y, opts) {
      const arr = Array.isArray(t) ? t : [t];
      arr.forEach(s => calls.push(['text', String(s)]));
      return pdf;
    },
    autoTable(conf) {
      (conf.head || []).forEach(row => row.forEach(c => calls.push(['text', String(c)])));
      (conf.body || []).forEach(row => row.forEach(c => calls.push(['text', String(c)])));
      pdf.lastAutoTable = { finalY: (conf.startY || 0) + 20 };
      return pdf;
    },
    output() { return new Blob(['%PDF'], { type: 'application/pdf' }); }
  };
  return pdf;
}
const textWords = (pdf) => pdf.calls.filter(c => c[0] === 'text').map(c => c[1]).join(' ')
  .split(/\s+/).filter(Boolean);

// Référence INDÉPENDANTE du tokenizer : strip de balises À PLAT du corps (titre inclus, bandeau et
// pied exclus), sans jamais passer par splitTopLevelBlocks/classifyBlock/parseDocDoc. Un strip à
// plat ne peut pas "sauter" un élément de premier niveau — donc si le tokenizer en laisse tomber un,
// ses mots restent ici et le test rougit. Comparaison au niveau du MOT (robuste espace/NBSP).
function independentCorpsWords(html) {
  let h = String(html).replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const it = h.indexOf('<div class="pro-titre"');
  if (it >= 0) h = h.slice(it);                                    // enlève le bandeau (avant le titre)
  const ip = h.lastIndexOf('<div class="pro-pied"');
  if (ip >= 0) h = h.slice(0, ip);                                 // enlève le pied (ref/date comptés à part)
  h = h.replace(/<div class="[^"]*(?:no-print|alerte)[^"]*"[\s\S]*?<\/div>/g, ' ');
  h = h.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç').replace(/&ecirc;/g, 'ê').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return h.split(/\s+/).filter(Boolean);
}

describe('htmlToText / htmlToWords', () => {
  it('retire le balisage et décode les entités WinAnsi', () => {
    expect(htmlToText('Je, <b>soussigné(e)</b> le Bailleur')).toBe('Je, soussigné(e) le Bailleur');
    expect(htmlToText('a&nbsp;: b')).toBe('a : b');
    expect(htmlToText('&laquo;&nbsp;Bailleur&nbsp;&raquo;')).toBe('« Bailleur »');
    expect(htmlToText('A&amp;B')).toBe('A&B');
  });
  it('convertit <br> en saut de ligne (jamais en collant deux mots)', () => {
    expect(htmlToText('ligne1<br>ligne2')).toBe('ligne1\nligne2');
    expect(htmlToText('ligne1<br/>ligne2')).toBe('ligne1\nligne2');
  });
  it('sépare aux frontières de blocs (jamais « habilité ;Désigné(s) »)', () => {
    // Deux paragraphes voisins : sans coupure, les mots se colleraient dans le PDF natif.
    expect(htmlToText('habilité ;</p><p>Désigné(s) ci-après')).toBe('habilité ;\nDésigné(s) ci-après');
    expect(htmlToWords('<h2>Bailleur</h2><span class="pro-qui">SCI DEMO</span>')).toEqual(['Bailleur', 'SCI', 'DEMO']);
  });
  it('htmlToWords donne la suite de mots sans balise ni entité', () => {
    expect(htmlToWords('<p>Loyer&nbsp;: <b>800,00&nbsp;€</b></p>')).toEqual(['Loyer', ':', '800,00', '€']);
  });
  it('retire les emoji décoratifs non-WinAnsi (garantit 0 avertissement pdfSafeText)', () => {
    // ⏱ ✓ ⚠ 🔒 ne sont pas encodables par une police standard → retirés en amont.
    expect(htmlToText('⏱ Occupation partielle')).toBe('Occupation partielle');
    expect(htmlToText('✓ Diagnostics complets')).toBe('Diagnostics complets');
    expect(htmlToWords('🔒 Loyer gelé — DPE F')).toEqual(['Loyer', 'gelé', '—', 'DPE', 'F']);
    // Le € et les accents (WinAnsi) survivent.
    expect(htmlToWords('Total : 800,00 €')).toContain('€');
  });
});

describe('splitTopLevelBlocks — respecte l\'imbrication', () => {
  it('sépare des blocs frères, garde pro-parties (avec <p> internes) atomique', () => {
    const html = docParties([{ label: 'Bailleur', qui: 'SCI X', corps: '<p>Siège</p>' }])
      + '<p>Un paragraphe.</p>'
      + docLignes([{ lab: 'Loyer', val: '800' }, { lab: 'Total', val: '800', tot: true }]);
    const blocks = splitTopLevelBlocks(html);
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toContain('pro-parties');
    expect(blocks[0]).toContain('Siège');            // <p> interne resté dans le bloc parties
    expect(blocks[1]).toContain('Un paragraphe');
    expect(blocks[2]).toContain('pro-lignes');
  });
  it('garde une <table> atomique', () => {
    const html = '<table class="pro-tbl"><tr><td>Date</td><td>Lib</td></tr></table><p>après</p>';
    const blocks = splitTopLevelBlocks(html);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toContain('<table');
    expect(blocks[0]).toContain('</table>');
    expect(blocks[1]).toContain('après');
  });
});

describe('parseDocDoc — reconstruit un document du gabarit', () => {
  const corps = docParties([
    { label: '1. Le(s) Bailleur(s)', qui: 'SCI DEMO', corps: '<p>15 rue X ;</p>' },
    { label: '2. Le(s) Locataire(s)', qui: 'M. Test', corps: '<p>demeurant ici ;</p>' }
  ])
    + docActe('Je, soussigné(e) le Bailleur, déclare avoir reçu la somme de <b>800,00&nbsp;€</b> :')
    + docLignes([{ lab: 'Loyer', val: '650,00 €' }, { lab: 'Charges', val: '150,00 €' }, { lab: 'Total', val: '800,00 €', tot: true }])
    + docMention('Cette quittance annule tous les reçus précédents.')
    + docLieu('Fait à Mutzig,<br>Le 25/08/2026')
    + docSignzone([{ sig: '', label: 'Le(s) Bailleur(s)' }]);
  const html = docPage({ bandeau: '<div class="pro-brand">LOGO</div>', titre: 'Quittance de loyer', ctx: 'Période avril 2026', corps, ref: 'FERRETTE-001', date: 'Émis le 25/08/2026' });

  it('extrait titre, ctx, ref, date et saute le bandeau', () => {
    const p = parseDocDoc(html);
    expect(p.titre).toBe('Quittance de loyer');
    expect(p.ctx).toBe('Période avril 2026');
    expect(p.ref).toContain('FERRETTE-001');
    expect(p.date).toContain('25/08/2026');
    // Le bandeau (pro-brand) n'est pas un bloc de corps.
    expect(p.blocks.find(b => /pro-brand|LOGO/.test(JSON.stringify(b)))).toBeUndefined();
  });

  it('classe les blocs (parties, acte, lignes, mention, lieu, signzone)', () => {
    const kinds = parseDocDoc(html).blocks.map(b => b.t);
    expect(kinds).toEqual(['parties', 'acte', 'lignes', 'mention', 'lieu', 'signzone']);
  });

  it('lignes : parse label/valeur et le drapeau tot', () => {
    const lignes = parseDocDoc(html).blocks.find(b => b.t === 'lignes');
    expect(lignes.rows.map(r => r.lab)).toEqual(['Loyer', 'Charges', 'Total']);
    expect(lignes.rows.map(r => r.val)).toEqual(['650,00 €', '150,00 €', '800,00 €']);
    expect(lignes.rows[2].tot).toBe(true);
  });
});

describe('docWords / renderDocToPdf — zéro mot perdu ni ajouté (D26)', () => {
  const corps = docActe('Je déclare avoir reçu la somme de <b>huit cents euros</b> pour avril.')
    + docLignes([{ lab: 'Loyer', val: '650,00 €' }, { lab: 'Total des sommes payées', val: '800,00 €', tot: true }])
    + docMention('Quittance à conserver par le locataire.')
    + docSignzone([{ sig: '', label: 'Le Bailleur' }]);
  const html = docPage({ bandeau: '', titre: 'Quittance de loyer', ctx: 'Période avril 2026', corps, ref: 'X-1', date: 'Émis le 25/08/2026' });

  it('rend en PDF TOUS les mots du HTML source — référence INDÉPENDANTE du tokenizer (D26)', () => {
    // La référence des mots attendus vient d'un strip de balises À PLAT du HTML source, qui NE
    // PASSE PAS par splitTopLevelBlocks/classifyBlock/parseDocDoc : un mot que le tokenizer
    // laisserait tomber resterait donc dans la référence → le test ROUGIRAIT (fin de la tautologie).
    const refWords = independentCorpsWords(html);
    const pdf = makeFakePdf();
    renderDocToPdf(pdf, { nom: 'SCI DEMO' }, parseDocDoc(html), PDF_NATIVE);
    const got = textWords(pdf);
    const missing = refWords.filter(w => !got.includes(w));
    expect(missing).toEqual([]);   // zéro mot du HTML source perdu à l'écriture native
  });

  it('exclut les bandeaux no-print du compte de mots', () => {
    const corps2 = '<div class="alerte no-print">AUCUN PAIEMENT ENREGISTRÉ</div>' + docActe('Corps réel du document.');
    const html2 = docPage({ bandeau: '', titre: 'T', ctx: '', corps: corps2, ref: 'r', date: 'd' });
    const words = docWords(parseDocDoc(html2));
    expect(words.join(' ')).not.toContain('AUCUN');
    expect(words.join(' ')).toContain('Corps');
  });
});

describe('Non-régression — AUCUN contenu de premier niveau avalé en silence (audit 26/08)', () => {
  // Un futur générateur qui poserait un <h2>, un <ul> ou du TEXTE NU au premier niveau du corps
  // ne doit pas faire disparaître des mots d'un document opposable. Le tokenizer doit les RENDRE
  // (aucun mot perdu) ET les SIGNALER (avertissement console). Ces deux exigences échouent si on
  // revient au tokenizer div/p/table-only : ces éléments seraient droppés (mots absents du PDF).
  const corps = docActe('Phrase liminaire du document.')
    + '<h2>Clause de solidarité</h2>'
    + '<ul><li>premier engagement indivis</li><li>second engagement solidaire</li></ul>'
    + 'texte nu résiduel hors balise'
    + docSignzone([{ sig: '', label: 'Le Bailleur' }]);
  const html = docPage({ bandeau: '', titre: 'Bail', ctx: '', corps, ref: 'R', date: 'd' });

  it('les mots d\'un <h2>/<ul>/texte nu de premier niveau arrivent bien dans le PDF', () => {
    const pdf = makeFakePdf();
    renderDocToPdf(pdf, {}, parseDocDoc(html), PDF_NATIVE);
    const got = textWords(pdf).join(' ');
    for (const w of ['Clause', 'solidarité', 'premier', 'indivis', 'second', 'solidaire', 'texte', 'nu', 'résiduel']) {
      expect(got).toContain(w);
    }
  });

  it('le tokenizer SIGNALE (console.warn [docNative]) tout contenu de premier niveau non géré', () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
    try { parseDocDoc(html).blocks.forEach(() => {}); }
    finally { console.warn = orig; }
    expect(warns.some(w => w.includes('[docNative]'))).toBe(true);
    // et les blocs non gérés sont marqués _unhandled (les tests d'intégration au gabarit peuvent l'exiger)
    expect(parseDocDoc(html).blocks.some(b => b._unhandled)).toBe(true);
  });

  it('Retour Didier — le PIED est EN BAS de page (pas au milieu), et un doc court ne crée pas de page en trop', () => {
    const calls = [];
    const pdf = {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getCurrentPageInfo: () => ({ pageNumber: 1 }) },
      lastAutoTable: { finalY: 0 },
      setFont() { return pdf; }, setFontSize() { return pdf; }, setTextColor() { return pdf; },
      setDrawColor() { return pdf; }, setFillColor() { return pdf; }, setLineWidth() { return pdf; },
      line() { return pdf; }, rect() { return pdf; }, roundedRect() { return pdf; }, circle() { return pdf; },
      addImage() { return pdf; }, getImageProperties() { return { width: 100, height: 40 }; },
      getTextWidth(t) { return String(t).length * 1.8; },
      addPage() { calls.push({ s: '__PAGE__', y: 0 }); return pdf; },
      splitTextToSize(t) { return [String(t)]; },
      text(t, x, y) { (Array.isArray(t) ? t : [t]).forEach(s => calls.push({ s: String(s), y })); return pdf; }
    };
    const doc = '<div class="pro-doc"><div class="pro-titre"><h1>Quittance de loyer</h1></div>'
      + '<p class="pro-acte">Je soussigne le Bailleur declare avoir recu.</p>'
      + '<div class="pro-pied"><span class="ref">F-001</span><span>Emis le 01/09/2026</span></div></div>';
    renderDocToPdf(pdf, { nom: 'SCI' }, parseDocDoc(doc), PDF_NATIVE);
    const foot = calls.find(c => c.s.indexOf('F-001') >= 0);
    expect(foot).toBeTruthy();
    // PAGE_H 297 − MARGIN_BOTTOM 25 = 272 ; le pied est posé ~280 → bas de page, jamais au milieu.
    expect(foot.y).toBeGreaterThan(270);
    expect(calls.some(c => c.s === '__PAGE__')).toBe(false);
  });
});
