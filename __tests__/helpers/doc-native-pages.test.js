// __tests__/helpers/doc-native-pages.test.js — mise en page RÉELLE (jsPDF de l'app sous Node).
//
// AVENANT-REFONTE §7 (audit du 28/09, mesuré) : un avenant d'une page sortait en 2 pages avec
// 2 locataires, 3 pages avec 3 ; le nom d'un signataire partait seul sur la page suivante, loin
// de sa ligne ; une page pouvait être créée pour le seul pied. Ces tests tracent le document
// avec le vrai moteur et vérifient ce que l'utilisateur voit : nombre de pages, cadres entiers.

import { describe, it, expect } from 'vitest';
import { tracedPdf } from './_real-jspdf.js';
import { parseDocDoc, renderDocToPdf, PDF_NATIVE } from './doc-native.js';
import { docPage, docLieu, docSignzone, docLignes } from './doc-template.js';
import { buildAvenantHtml } from '../../js/core/avenant.js';

function render(html) {
  const pdf = tracedPdf();
  renderDocToPdf(pdf, { nom: 'SCI Les Tilleuls' }, parseDocDoc(html), PDF_NATIVE);
  return { pdf, pages: pdf.getNumberOfPages(), log: pdf.__log };
}

function avenantHtml(locs, objets) {
  const r = buildAvenantHtml({
    no: 2, bailleur: 'SCI Les Tilleuls', locataires: locs, bien: '12 rue des Lilas, 69003 Lyon',
    dateBail: '2025-01-01', bailSigne: true, loyer0: 800, effetIso: '2026-09-30', ville: 'Lyon',
    objets: objets || [{ k: 'loyer', data: { motif: 'Accord des parties', nouveau: '850' } }],
  });
  return docPage({ titre: 'AVENANT N° 2 AU CONTRAT DE BAIL D\'HABITATION', ctx: 'Loi n° 89-462 du 6 juillet 1989',
    corps: r.html, ref: 'COL-1', date: 'Effet du 30/09/2026', withStyle: false });
}

/** Chaque ligne de signature (trait court de cadre) a son libellé sur la MÊME page, juste dessous. */
function cadresEntiers(log) {
  const traits = log.filter(e => e.op === 'line' && e.w > 40 && e.w < 80);
  // + le cadre reste DANS la page (l'ancien moteur posait le 3ᵉ cadre à x = 171 mm, hors page).
  return traits.every(t => t.x + t.w <= 195.01 && log.some(e => e.op === 'text' && e.page === t.page && e.y > t.y && e.y < t.y + 8 && e.x >= t.x - 1 && e.x <= t.x + t.w));
}

const para = (n) => '<p>' + 'Paragraphe de remplissage destiné à pousser le contenu vers le bas de la page. '.repeat(n) + '</p>';
const mention = (n) => '<p class="pro-mention">' + 'Mention courte. '.repeat(n) + '</p>';
// Balaye finement la hauteur du contenu (paragraphes ~7,2 mm + mentions ~6,6 mm) pour tomber
// dans les fenêtres étroites où les défauts apparaissent (quelques mm en bas de page).
const remplissages = () => { const out = []; for (let n = 24; n <= 34; n++) for (let m = 0; m <= 5; m++) { let c = ''; for (let i = 0; i < n; i++) c += para(1); for (let k = 0; k < m; k++) c += mention(2); out.push(c); } return out; };
const doc = (corps, extra) => docPage(Object.assign({ titre: 'DOCUMENT', ctx: 'Contexte', corps, ref: 'REF-1', date: 'Émis le 28/09/2026', withStyle: false }, extra || {}));

describe('moteur doc-native : ce que voit l\'utilisateur', () => {
  it('h3 reconnu comme titre (plus de contenu « non géré » rendu en texte courant)', () => {
    const p = parseDocDoc(doc('<h3>Article I — Objet</h3><p>Texte.</p>'));
    expect(p.blocks[0]).toEqual({ t: 'h3', v: 'Article I — Objet' });
  });
  it('un titre d\'article en bas de page part avec son texte (jamais seul)', () => {
    for (const r of remplissages()) {
      const { log } = render(doc(r + '<h3>Article X — Titre</h3>' + para(2)));
      const t = log.find(e => e.op === 'text' && /Article X/.test(e.t));
      const suite = log.find(e => e.op === 'text' && /^Paragraphe/.test(e.t) && e.y > t.y && e.page === t.page);
      expect(suite).toBeTruthy();
    }
  });
  it('pro-kv rendu en clé / valeur (et plus en tableau)', () => {
    const p = parseDocDoc(doc('<table class="pro-kv"><tr><td>Clé</td><td>Valeur</td></tr></table>'));
    expect(p.blocks[0].t).toBe('kv');
    const { log } = render(doc('<table class="pro-kv"><tr><td>Clé</td><td>Valeur</td></tr></table>'));
    const k = log.find(e => e.op === 'text' && e.t === 'Clé'), v = log.find(e => e.op === 'text' && e.t === 'Valeur');
    expect(v.x).toBeGreaterThan(k.x + 60);   // valeur dans la 2ᵉ colonne, pas alignée à droite
  });
  it('jamais de page créée pour le seul pied', () => {
    // Contenu qui s'arrête au ras de la zone utile, terminé par un bloc de montants (quittance) :
    // avant, une 2ᵉ page ne portait que le pied (reproduit avec l'ancien moteur).
    const totaux = docLignes([{ lab: 'Loyer', val: '800,00 €' }, { lab: 'Total', val: '895,00 €', tot: true }]);
    for (const r of remplissages()) {
      const { pdf, log } = render(doc(r + totaux));
      const derniere = pdf.getNumberOfPages();
      const contenu = log.filter(e => e.op === 'text' && e.page === derniere && e.t !== 'REF-1' && !/^Émis le/.test(e.t));
      expect(contenu.length).toBeGreaterThan(0);
    }
  });
  it('quittance (1 cadre à droite) : un cadre en bas de page passe ENTIER à la page suivante', () => {
    for (const r of remplissages()) {
      const corps = r + docLieu('Fait à Lyon, le 28/09/2026') + docSignzone([{ sig: '', label: 'Le bailleur<br><strong>SCI Les Tilleuls</strong>' }]);
      const { log } = render(doc(corps));
      expect(cadresEntiers(log)).toBe(true);
      const lieu = log.find(e => e.op === 'text' && /Fait à Lyon/.test(e.t));
      const trait = log.find(e => e.op === 'line' && e.w === 70);
      expect(lieu.page).toBe(trait.page);   // « Fait à » jamais séparé de son cadre
    }
  });
  it('le cadre reste sur la page de « Fait à » dès qu\'il y tient (le blanc APRÈS le cadre ne compte pas)', () => {
    // Audit lot 1 : le blanc posé après le cadre était compté → page en plus (lettre IRL, reçu).
    // Hauteur d'une rangée : 8 (air) + 11 (espace de signature) + 2 + libellé 2 lignes en 8 pt (6,9) = 27,9 mm.
    const LIEU = docLieu('Fait à Lyon, le 28/09/2026');
    const CADRE = docSignzone([{ sig: '', label: 'Le bailleur<br><strong>SCI Les Tilleuls</strong>' }]);
    let verifies = 0;
    for (const r of remplissages()) {
      const sans = render(doc(r + LIEU)).log.find(e => e.op === 'text' && /Fait à Lyon/.test(e.t));
      const tient = sans.y + 4.2 + 0.5 + PDF_NATIVE.PARAGRAPH_GAP + 27.9 <= PDF_NATIVE.PAGE_H - PDF_NATIVE.MARGIN_BOTTOM;
      const avec = render(doc(r + LIEU + CADRE)).log.find(e => e.op === 'text' && /Fait à Lyon/.test(e.t));
      if (tient) { expect(avec.page).toBe(sans.page); verifies++; }
    }
    expect(verifies).toBeGreaterThan(10);
  });
  it('une mention longue APRÈS le cadre ne sépare jamais « Fait à » de son cadre', () => {
    const corps = para(3) + docLieu('Fait à Lyon, le 28/09/2026') + docSignzone([{ sig: '', label: 'Le bailleur' }]) + mention(400);
    const { log } = render(doc(corps));
    const lieu = log.find(e => e.op === 'text' && /Fait à Lyon/.test(e.t));
    const trait = log.find(e => e.op === 'line' && e.w === 70);
    expect(lieu.page).toBe(1);
    expect(trait.page).toBe(1);
  });
  it('paraphes : 9 parties → toutes les cases dans la page', () => {
    let corps = ''; for (let i = 0; i < 70; i++) corps += para(1);
    const pdf = tracedPdf();
    const noms = Array.from({ length: 9 }, (_, i) => 'P' + (i + 1));
    renderDocToPdf(pdf, {}, parseDocDoc(doc(corps)), PDF_NATIVE, { paraphes: noms });
    const lbl = pdf.__log.find(e => e.op === 'text' && e.t === 'Paraphes');
    expect(lbl.x).toBeGreaterThan(PDF_NATIVE.MARGIN_LEFT);
  });
  it('pagination « Page p / N » sur chaque page quand demandée ; absente sinon (aspect des quittances)', () => {
    let corps = ''; for (let i = 0; i < 70; i++) corps += para(1);
    const pdf = tracedPdf();
    renderDocToPdf(pdf, {}, parseDocDoc(doc(corps)), PDF_NATIVE, { pagination: true });
    const n = pdf.getNumberOfPages();
    expect(n).toBeGreaterThan(1);
    for (let p = 1; p <= n; p++) expect(pdf.__log.some(e => e.op === 'text' && e.page === p && e.t === 'Page ' + p + ' / ' + n)).toBe(true);
    const sans = render(doc(corps));
    expect(sans.log.some(e => /^Page \d/.test(e.t || ''))).toBe(false);
  });
  it('paraphes : sur chaque page sauf la dernière, seulement si le document a plusieurs pages', () => {
    let corps = ''; for (let i = 0; i < 70; i++) corps += para(1);
    const pdf = tracedPdf();
    renderDocToPdf(pdf, {}, parseDocDoc(doc(corps)), PDF_NATIVE, { pagination: true, paraphes: ['Bailleur', 'Loc. 1'] });
    const n = pdf.getNumberOfPages();
    const pagesParaphe = [...new Set(pdf.__log.filter(e => e.op === 'text' && e.t === 'Paraphes').map(e => e.page))];
    expect(pagesParaphe).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1));
    const court = tracedPdf();
    renderDocToPdf(court, {}, parseDocDoc(doc(para(2))), PDF_NATIVE, { pagination: true, paraphes: ['Bailleur', 'Loc. 1'] });
    expect(court.__log.some(e => e.t === 'Paraphes')).toBe(false);
  });
});

describe('avenant : une page tant que le contenu tient (moteur réel)', () => {
  it('cas de l\'incident : départ d\'un colocataire, 2 locataires → 1 page, 3 cadres sur une rangée', () => {
    const html = avenantHtml(['Alice Martin', 'Bruno Leroy'], [{ k: 'coloc', data: { act: 'Départ d\'un colocataire (sans remplaçant)', sortant: 'Bruno Leroy' } }]);
    const { pages, log } = render(html);
    expect(pages).toBe(1);
    expect(cadresEntiers(log)).toBe(true);
    const traits = log.filter(e => e.op === 'line' && e.w > 40 && e.w < 80);
    expect(traits.length).toBe(3);
    expect(new Set(traits.map(t => Math.round(t.y))).size).toBe(1);   // même rangée
  });
  it('avenant long (plusieurs objets) : plusieurs pages, cadres entiers, pagination et paraphes', () => {
    const objets = [
      { k: 'coloc', data: { act: 'Remplacement (départ + arrivée)', sortant: 'Bruno Leroy', entrant: 'Chloé Dubois' } },
      { k: 'loyer', data: { motif: 'Accord des parties', nouveau: '850' } },
      { k: 'charges', data: { mode: 'Provisions sur charges', montant: '110' } },
      { k: 'paiement', data: { jour: '5', mode: 'virement', rib: 'FR76 0000 0000 0000 0000 0000 000' } },
      { k: 'travaux', data: { qui: 'le locataire', nature: 'pose d\'une cuisine équipée' } },
      { k: 'souslocation', data: { act: 'Refus' } },
      { k: 'clause', data: { titre: 'Animaux', texte: 'Un chat est autorisé. '.repeat(12) } },
    ];
    const pdf = tracedPdf();
    renderDocToPdf(pdf, { nom: 'SCI Les Tilleuls' }, parseDocDoc(avenantHtml(['Alice Martin', 'Bruno Leroy'], objets)), PDF_NATIVE,
      { pagination: true, paraphes: ['Bailleur', 'Loc. 1', 'Loc. 2', 'Entrant'] });
    const n = pdf.getNumberOfPages();
    expect(n).toBeGreaterThan(1);
    expect(cadresEntiers(pdf.__log)).toBe(true);
    expect(pdf.__log.some(e => e.t === 'Page ' + n + ' / ' + n)).toBe(true);
  });
  for (const n of [1, 2, 3]) {
    it(n + ' locataire(s) → 1 page, chaque cadre de signature entier', () => {
      const locs = ['Alice Martin', 'Bruno Leroy', 'Chloé Dubois'].slice(0, n);
      const { pages, log } = render(avenantHtml(locs));
      expect(pages).toBe(1);
      expect(cadresEntiers(log)).toBe(true);
    });
  }
});
