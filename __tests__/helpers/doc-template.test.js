// __tests__/helpers/doc-template.test.js
// DOCS-UNIFIES — le gabarit unique (variante B validée le 12/08) est-il fidèle au mockup,
// et surtout : ne touche-t-il jamais au fond ?

import { describe, it, expect } from 'vitest';
import {
  DOC_TPL, DOC_FONT_TITRE, DOC_FONT_CORPS,
  docCss, docStyleTag, docTitre, docParties, docActe, docLignes,
  docMention, docEncart, docLieu, docSignzone, docPied, docPage
} from './doc-template.js';

// Les valeurs ci-dessous sont recopiées du mockup mockups/DOCUMENTS-PROPRYO/index.html,
// bloc CSS « GABARIT PROPRYO » (sélecteurs .g-p + .g-sans = variante B, validée le 12/08).
// Le mockup est gitignoré (règle « mockups = fichiers locaux ») : il ne peut pas être lu
// depuis un test, donc ses cotes sont figées ici — toute dérive du gabarit casse ce test.
describe('doc-template — fidélité au mockup DOCUMENTS-PROPRYO (variante B)', () => {
  it('reprend les couleurs du gabarit sans les réinventer', () => {
    // .g-p h1 / .ctx / h2 / .mention / .pied / .acte / .partie du mockup
    expect(DOC_TPL.ENCRE).toBe('#1a2030');
    expect(DOC_TPL.ENCRE_FORTE).toBe('#101521');
    expect(DOC_TPL.GRIS).toBe('#6e7888');
    expect(DOC_TPL.GRIS_LABEL).toBe('#8b94a5');
    expect(DOC_TPL.GRIS_MENTION).toBe('#7c8698');
    expect(DOC_TPL.GRIS_PIED).toBe('#9aa3b2');
    expect(DOC_TPL.FILET).toBe('#e4e7ee');
    expect(DOC_TPL.FOND_BLOC).toBe('#f7f8fb');
    expect(DOC_TPL.ACCENT).toBe('#ff5a3c');
  });

  it('garde la typographie du gabarit (corps 10pt/1.55, étiquettes 7.5pt espacées)', () => {
    expect(DOC_TPL.CORPS_PT).toBe(10);
    expect(DOC_TPL.CORPS_LH).toBe(1.55);
    const css = docCss();
    expect(css).toContain('font-size:10pt;line-height:1.55');
    expect(css).toContain('font:600 7.5pt/1');        // .g-p h2 (étiquettes de bloc)
    expect(css).toContain('letter-spacing:.13em');
    expect(css).toContain('letter-spacing:-.025em');  // titre serré du gabarit
  });

  it('garde les traits de forme du gabarit (rayons, filet d’accent)', () => {
    const css = docCss();
    expect(css).toContain('border-radius:2.5mm');      // .partie / .lignes
    expect(css).toContain('border-left:.9mm solid');   // .acte
    expect(css).toContain('font-variant-numeric:tabular-nums');
  });

  // ── ÉCART ASSUMÉ AU MOCKUP : le rythme vertical est resserré ────────────────────
  // Le mockup dessine sur une planche sans contrainte de pagination. En production, les
  // documents sont rastérisés puis découpés en pages A4 (281 mm utiles) : au rythme du
  // mockup, la quittance, le reçu partiel, la lettre IRL et le décompte débordaient sur
  // une 2e page qui ne portait que la fin du bloc de signature. Un locataire ne doit pas
  // recevoir un document de 2 pages dont la seconde est vide.
  // Les valeurs ci-dessous sont donc des PLAFONDS, pas des copies du mockup.
  it('reste compact : aucune gouttière VERTICALE au-delà de 5 mm', () => {
    // Seuls margin/padding haut et bas coûtent de la hauteur de page. `gap` est ici toujours
    // horizontal (flex en ligne : parties côte à côte, cases de signature, pied) et la seule
    // `height` du gabarit est l'espace où l'on signe à la main — tous deux hors de ce contrôle.
    const trop = [];
    const re = /(margin|padding)(-top|-bottom)?:([^;{}]*)/g;
    let m;
    while ((m = re.exec(docCss()))) {
      const vals = m[3].trim().split(/\s+/);
      // shorthand `a b c d` → haut = vals[0], bas = vals[2] (ou vals[0] si 2 valeurs)
      const verticales = m[2] ? [vals[0]]
        : (vals.length >= 3 ? [vals[0], vals[2]] : [vals[0]]);
      for (const v of verticales) {
        const mm = /^(\d*\.?\d+)mm$/.exec(v);
        if (mm && parseFloat(mm[1]) > 5) trop.push(m[0]);
      }
    }
    expect(trop).toEqual([]);
  });

  it('budget vertical global : la somme des gouttières reste sous plafond', () => {
    // Garde-fou contre la reprise de poids par petites touches. Le contrôle unitaire
    // ci-dessus ne verrait pas dix règles passées de 2 à 4 mm ; celui-ci si.
    // Plafond calé sur la mesure navigateur du 17/08 : à ce budget, la lettre IRL (le plus
    // long des documents courants) sort à 249 mm sur 281 mm utiles, et son pire cas
    // (2 locataires aux noms longs + logo + signature) à 271 mm.
    let total = 0;
    const re = /(margin|padding)(-top|-bottom)?:([^;{}]*)/g;
    let m;
    while ((m = re.exec(docCss()))) {
      const vals = m[3].trim().split(/\s+/);
      const verticales = m[2] ? [vals[0]] : (vals.length >= 3 ? [vals[0], vals[2]] : [vals[0]]);
      for (const v of verticales) {
        const mm = /^(\d*\.?\d+)mm$/.exec(v);
        if (mm) total += parseFloat(mm[1]);
      }
    }
    expect(total).toBeLessThanOrEqual(80);
  });

  it('le titre reste dominant mais ne mange plus la page', () => {
    expect(DOC_TPL.TITRE_PT).toBeLessThanOrEqual(18);
    expect(DOC_TPL.TITRE_PT).toBeGreaterThanOrEqual(15);
    expect(DOC_TPL.TITRE_PT).toBeGreaterThan(DOC_TPL.CORPS_PT * 1.5);
  });

  it('n’embarque aucune police distante (règle « aucun CDN au runtime »)', () => {
    const css = docCss();
    expect(css).not.toMatch(/@import|fonts\.googleapis|https?:\/\//);
    expect(DOC_FONT_TITRE).toContain('Schibsted Grotesk');
    expect(DOC_FONT_TITRE).toContain('sans-serif');    // repli système
    expect(DOC_FONT_CORPS).toContain('Inter');
    expect(DOC_FONT_CORPS).toContain('sans-serif');
  });
});

describe('doc-template — la feuille de style est scopée', () => {
  it('toutes les règles sont préfixées .pro-doc (sinon elle repeindrait l’app)', () => {
    const css = docCss();
    const selectors = css
      .split('\n')
      .filter(l => l.includes('{') && !l.startsWith('@'))
      .map(l => l.slice(0, l.indexOf('{')).trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const sel of selectors) {
      for (const part of sel.split(',')) {
        expect(part.trim().startsWith('.pro-doc')).toBe(true);
      }
    }
  });

  it('ne cible ni body ni html ni * nu', () => {
    const css = docCss();
    expect(css).not.toMatch(/(^|\n)\s*(body|html|\*)\s*\{/);
  });

  it('aucune règle n’est indentée — le mirror IIFE doit rendre le MÊME texte', () => {
    // AUDIT M4 : tools/sync-helpers-global-mirrors.mjs ré-indente le corps des fonctions ;
    // docCss() renormalise pour que module ES et mirror rendent caractère pour caractère.
    const css = docCss();
    expect(css.split('\n').every(l => !/^[ \t]/.test(l))).toBe(true);
  });

  it('docStyleTag emballe la feuille dans une balise style fermée', () => {
    const tag = docStyleTag();
    expect(tag.startsWith('<style>')).toBe(true);
    expect(tag.endsWith('</style>')).toBe(true);
    expect(tag).toContain('.pro-doc');
  });
});

describe('doc-template — primitives', () => {
  it('docTitre pose le titre et la ligne de contexte', () => {
    const h = docTitre('Quittance de loyer', 'Période du 01/07 au 31/07');
    expect(h).toContain('<h1>Quittance de loyer</h1>');
    expect(h).toContain('<p class="pro-ctx">Période du 01/07 au 31/07</p>');
  });

  it('docTitre omet la ligne de contexte quand elle est vide', () => {
    expect(docTitre('Titre')).not.toContain('pro-ctx');
    expect(docTitre('Titre', '')).not.toContain('pro-ctx');
  });

  it('docParties met les blocs côte à côte et garde le fond intact', () => {
    const h = docParties([
      { label: '1. Le(s) Bailleur(s)', qui: 'SCI KELLER', corps: '<p>siège&nbsp;;</p>' },
      { label: '2. Le(s) Locataire(s)', corps: '<p>Mme <b>X</b></p>' }
    ]);
    expect(h).toContain('class="pro-parties"');
    expect((h.match(/class="pro-partie"/g) || []).length).toBe(2);
    expect(h).toContain('<span class="pro-qui">SCI KELLER</span>');
    expect(h).toContain('<p>siège&nbsp;;</p>');   // &nbsp; NON ré-échappé
    expect(h).toContain('<b>X</b>');              // balises du fond préservées
  });

  it('docParties ne rend rien sans bloc', () => {
    expect(docParties([])).toBe('');
    expect(docParties(null)).toBe('');
    expect(docParties([null, undefined])).toBe('');
  });

  it('docLignes marque le total et l’accent', () => {
    const h = docLignes([
      { lab: 'Loyer', val: '620,00 €' },
      { lab: 'Charges', val: '90,00 €' },
      { lab: 'Total', val: '710,00 €', tot: true }
    ]);
    expect((h.match(/class="pro-lg"/g) || []).length).toBe(2);
    expect(h).toContain('class="pro-lg tot"');
    expect(h).not.toContain(' hi"');
    expect(docLignes([{ lab: 'Solde', val: '60,50 €', tot: true, hi: true }]))
      .toContain('class="pro-lg tot hi"');
  });

  it('docLignes ne rend rien sans ligne', () => {
    expect(docLignes([])).toBe('');
    expect(docLignes(undefined)).toBe('');
  });

  it('docSignzone : une case à droite, deux cases aux deux bords', () => {
    expect(docSignzone(['Le Bailleur'])).toContain('class="pro-signzone"');
    const duo = docSignzone(['Le Bailleur', 'Le Locataire']);
    expect(duo).toContain('class="pro-signzone duo"');
    expect((duo.match(/pro-signbox/g) || []).length).toBe(2);
    expect(docSignzone([])).toBe('');
    expect(docSignzone(['', null])).toBe('');
  });

  it('docSignzone : la signature se pose AU-DESSUS du filet, le libellé dessous', () => {
    const h = docSignzone([{ sig: '<img src="s.png">', label: 'Le(s) Bailleur(s)' }]);
    expect(h.indexOf('pro-sigspace')).toBeLessThan(h.indexOf('pro-signbox'));
    expect(h.indexOf('s.png')).toBeLessThan(h.indexOf('Le(s) Bailleur(s)'));
  });

  it('docSignzone : sans image, l’espace de signature reste vierge (on signe à la main)', () => {
    const h = docSignzone([{ sig: '', label: 'Le bailleur' }]);
    expect(h).toContain('<div class="pro-sigspace"></div>');
    expect(h).toContain('Le bailleur');
    expect(h).not.toContain('<br>');
  });

  it('docSignzone : une case totalement vide ne crée pas de bloc fantôme', () => {
    expect(docSignzone([{ sig: '', label: '' }])).toBe('');
    expect(docSignzone([{}])).toBe('');
  });

  it('docPied n’affiche que les cases renseignées', () => {
    expect(docPied({})).toBe('');
    const p = docPied({ ref: 'FER-001', date: 'Le 17 août 2026' });
    expect(p).toContain('<span class="ref">FER-001</span>');
    expect(p).toContain('Le 17 août 2026');
    expect(p).not.toContain('page');
    expect(docPied({ ref: 'X', pages: 'page 1/2' })).toContain('page 1/2');
  });

  it('docMention / docEncart / docLieu / docActe posent la bonne classe', () => {
    expect(docMention('m')).toBe('<p class="pro-mention">m</p>');
    expect(docEncart('e')).toBe('<div class="pro-encart">e</div>');
    expect(docLieu('l')).toBe('<p class="pro-lieu">l</p>');
    expect(docActe('a')).toBe('<p class="pro-acte">a</p>');
  });
});

describe('doc-template — docPage, point d’entrée unique', () => {
  const BAND = '<div style="display:flex">BANDEAU</div>';

  it('assemble dans l’ordre du gabarit : style, bandeau, titre, corps, pied', () => {
    const html = docPage({
      bandeau: BAND, titre: 'Quittance de loyer', ctx: 'ctx',
      corps: '<p>CORPS</p>', ref: 'REF-1', date: 'Le 17 août 2026'
    });
    const iStyle = html.indexOf('<style>');
    const iBand = html.indexOf('BANDEAU');
    const iTitre = html.indexOf('<h1>');
    const iCorps = html.indexOf('CORPS');
    const iPied = html.indexOf('<div class="pro-pied">');
    expect(iStyle).toBeGreaterThanOrEqual(0);
    expect(iStyle).toBeLessThan(iBand);
    expect(iBand).toBeLessThan(iTitre);
    expect(iTitre).toBeLessThan(iCorps);
    expect(iCorps).toBeLessThan(iPied);
    expect(html).toContain('<div class="pro-doc"');
  });

  it('withStyle:false permet de sortir la feuille dans le champ css du document', () => {
    const html = docPage({ bandeau: BAND, titre: 'T', corps: 'C', withStyle: false });
    expect(html).not.toContain('<style>');
    expect(html.startsWith('<div class="pro-doc"')).toBe(true);
  });

  it('sans bandeau (DocBrand absent) le document sort quand même', () => {
    const html = docPage({ titre: 'T', corps: 'C' });
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('C');
  });

  it('pageBreakAfter permet d’enchaîner un document par destinataire', () => {
    expect(docPage({ titre: 'T', corps: 'C', pageBreakAfter: 'always' }))
      .toContain('style="page-break-after:always"');
    expect(docPage({ titre: 'T', corps: 'C' })).not.toContain('style="page-break-after');
  });

  it('ne réécrit JAMAIS le fond qu’on lui confie', () => {
    const fond = "Conformément à l'article 17-1 de la loi n° 89-462 du 6 juillet 1989, "
      + 'le loyer prend effet au <b>mois anniversaire</b>&nbsp;— 632,46&nbsp;€.';
    const html = docPage({ titre: 'T', corps: '<p>' + fond + '</p>' });
    expect(html).toContain(fond);
  });

  it('toutes les balises ouvertes sont refermées', () => {
    const html = docPage({ bandeau: BAND, titre: 'T', ctx: 'c', corps: docLignes([{ lab: 'a', val: 'b' }]), ref: 'R', date: 'D' });
    const open = (html.match(/<div\b/g) || []).length;
    const close = (html.match(/<\/div>/g) || []).length;
    expect(open).toBe(close);
    expect((html.match(/<style>/g) || []).length).toBe((html.match(/<\/style>/g) || []).length);
  });
});
