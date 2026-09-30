/**
 * Tests — AVENANT lot 3 : « Lu et approuvé » OBLIGATOIRE et IMPRIMÉE (décision Didier du 30/09, comme le bail).
 * Comportement : validation refusée sans la case, acceptée avec ; mention présente pour CHAQUE signataire
 * dans le HTML signé ET dans le PDF (vrai jsPDF de l'app), au-dessus de sa signature ; consigne papier.
 */
import { describe, it, expect } from 'vitest';
import { buildAvenantHtml, avenantPartiesSignature, avenantHtmlSigne, avenantHtmlAImprimer, avenantSignatureManque, LU_APPROUVE } from '../../js/core/avenant.js';
import { tracedPdf } from './_real-jspdf.js';
import { parseDocDoc, renderDocToPdf, PDF_NATIVE } from './doc-native.js';
import { docPage } from './doc-template.js';
import { sortieAutorisee } from '../../js/core/actes-mentions.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CONSIGNE = 'Précéder la signature de la mention manuscrite :<br>« Lu et approuvé »';
const avenant = (locs, objets) => buildAvenantHtml({
  no: 3, bailleur: 'SCI Les Tilleuls', representant: 'Didier Martin', locataires: locs, bien: '12 rue des Lilas, 69003 Lyon',
  dateBail: '2025-01-01', bailSigne: true, loyer0: 800, effetIso: '2026-10-01', ville: 'Lyon',
  objets: objets || [{ k: 'loyer', data: { motif: 'Accord des parties', nouveau: '850' } }],
}).html;
// Contenu de l'espace de signature de chaque cadre, dans l'ordre.
const espaces = (html) => html.split('<div class="pro-sigcase"><div class="pro-sigspace">').slice(1).map(x => x.slice(0, x.indexOf('</div>')));
const render = (corps) => {
  const pdf = tracedPdf();
  renderDocToPdf(pdf, { nom: 'SCI Les Tilleuls' }, parseDocDoc(docPage({ titre: 'AVENANT N° 3', ctx: 'Loi n° 89-462', corps, ref: 'COL-1', date: 'Effet du 01/10/2026', withStyle: false })), PDF_NATIVE, { pagination: true });
  return { log: pdf.__log, pages: pdf.getNumberOfPages() };
};
const traitsSignature = (log) => log.filter(e => e.op === 'line' && e.w > 40 && e.w < 80);

describe('validation d\'une signature sur l\'appareil (règle du bail)', () => {
  it('refusée sans la case « Lu et approuvé », même signée', () => {
    expect(avenantSignatureManque(true, false)).toBe('cocher « Lu et approuvé »');
  });
  it('refusée sans signature, et sans les deux (message du bail : « signer ET cocher »)', () => {
    expect(avenantSignatureManque(false, true)).toBe('signer');
    expect(avenantSignatureManque(false, false)).toBe('signer ET cocher « Lu et approuvé »');
  });
  it('acceptée signée ET cochée', () => {
    expect(avenantSignatureManque(true, true)).toBeNull();
  });
});

describe('document signé : la mention n\'existe que si CHAQUE partie a coché', () => {
  const html = avenant(['Alice Martin', 'Bruno Leroy']);
  const n = avenantPartiesSignature(html).length;   // bailleur + 2 locataires
  it('une case non cochée (ou absente, ou non booléenne) → aucun document signé', () => {
    expect(n).toBe(3);
    expect(avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-30', [true, false, true])).toBeNull();
    expect(avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-30', [true, true])).toBeNull();
    expect(avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-30', [true, true, 'oui'])).toBeNull();
    expect(avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-30')).toBeNull();
  });
  it('toutes cochées → « Lu et approuvé » AU-DESSUS de chaque signature, plus aucune consigne papier', () => {
    const s = avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-30', [true, true, true]);
    const e = espaces(s);
    expect(e).toHaveLength(3);
    e.forEach((x) => {
      expect(x.indexOf(LU_APPROUVE)).toBeGreaterThanOrEqual(0);
      expect(x.indexOf(LU_APPROUVE)).toBeLessThan(x.indexOf('<img src="data:image/png'));   // mention puis signature
    });
    expect(s).not.toContain(CONSIGNE);
    expect(avenantPartiesSignature(s).map(p => p.nom)).toEqual(['SCI Les Tilleuls', 'Alice Martin', 'Bruno Leroy']);
  });
});

describe('document à imprimer (signature sur papier) : consigne pour chaque partie', () => {
  it('document enregistré : la consigne au-dessus de l\'espace de chaque partie', () => {
    const e = espaces(avenant(['Alice Martin', 'Bruno Leroy'], [{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: 'Chloé Durand', civEntrant: 'Mme' } }]));
    expect(e).toHaveLength(4);   // bailleur, 2 locataires, entrante
    e.forEach(x => expect(x).toContain(CONSIGNE));
  });
  it('avenant enregistré AVANT le 30/09 (cadres vides) : consigne posée à l\'impression ; idempotent ; signé intact', () => {
    const ancien = avenant(['Alice Martin']).split('<em class="pro-sigmention pro-sigconsigne">' + CONSIGNE + '</em>').join('');
    expect(ancien).not.toContain(CONSIGNE);
    const imprime = avenantHtmlAImprimer(ancien);
    expect(espaces(imprime).every(x => x.includes(CONSIGNE))).toBe(true);
    expect(avenantHtmlAImprimer(imprime)).toBe(imprime);
    const signe = avenantHtmlSigne(ancien, [PNG, PNG], '2026-09-30', [true, true]);
    expect(avenantHtmlAImprimer(signe)).toBe(signe);
    expect(avenantPartiesSignature(imprime)).toEqual(avenantPartiesSignature(ancien));
  });
});

describe('PDF (moteur réel de l\'app) : mention imprimée par signataire', () => {
  for (const locs of [['Alice Martin'], ['Alice Martin', 'Bruno Leroy'], ['Alice Martin', 'Bruno Leroy', 'Chloé Durand', 'Denis Petit']]) {
    it(locs.length + ' locataire(s) : « Lu et approuvé » au-dessus de CHAQUE ligne de signature, même page', () => {
      const html = avenant(locs);
      const n = avenantPartiesSignature(html).length;
      const { log } = render(avenantHtmlSigne(html, Array(n).fill(PNG), '2026-09-30', Array(n).fill(true)));
      const mentions = log.filter(e => e.op === 'text' && e.t === LU_APPROUVE);
      const traits = traitsSignature(log);
      expect(traits).toHaveLength(n);
      expect(mentions).toHaveLength(n);
      traits.forEach((t) => {
        const m = mentions.find(e => e.page === t.page && Math.abs(e.x - t.x) < 0.01);
        expect(m).toBeTruthy();
        expect(m.y).toBeLessThan(t.y - 8);   // au-dessus de l'espace où l'image de signature est posée
      });
      expect(log.some(e => e.op === 'text' && /^Précéder/.test(e.t))).toBe(false);
    });
  }
  it('document à imprimer : consigne au-dessus de chaque ligne, espace pour écrire la mention et signer', () => {
    const html = avenant(['Alice Martin', 'Bruno Leroy']);
    const { log, pages } = render(html);
    const traits = traitsSignature(log);
    const consignes = log.filter(e => e.op === 'text' && /^Précéder la signature/.test(e.t));
    expect(traits).toHaveLength(3);
    expect(consignes).toHaveLength(3);
    traits.forEach((t) => {
      const c = consignes.find(e => e.page === t.page && Math.abs(e.x - t.x) < 0.01);
      expect(c).toBeTruthy();
      expect(t.y - c.y).toBeGreaterThan(18);   // consigne + 18 mm pour la mention manuscrite et la signature
    });
    expect(pages).toBe(1);
  });
});

// Audit du lot 3 : un avenant qui contient encore « ‹à compléter› » (bien, « Fait à ») ne part pas à la
// signature sans avertissement. L'app réutilise la décision commune des actes (sortieAutorisee, appelée
// par _acteMentionsOk) : elle AVERTIT et l'utilisateur décide (jamais bloquer).
describe('« ‹à compléter› » avant de faire signer (sortieAutorisee, réutilisé)', () => {
  const incomplet = buildAvenantHtml({ no: 1, bailleur: 'SCI Les Tilleuls', locataires: ['Alice Martin'], bien: '',
    dateBail: '2025-01-01', bailSigne: true, loyer0: 800, effetIso: '2026-11-01', ville: '',
    objets: [{ k: 'loyer', data: { motif: 'Accord des parties', nouveau: '850' } }] }).html;
  it('document incomplet : question posée, « Faire signer quand même ? » ; refus → pas de signature', () => {
    const questions = [];
    expect(sortieAutorisee(incomplet, 'Faire signer', (m) => { questions.push(m); return false; })).toBe(false);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('‹à compléter›');
    expect(questions[0]).toContain('Faire signer quand même ?');
  });
  it('l\'utilisateur confirme → la signature continue (jamais bloquer)', () => {
    expect(sortieAutorisee(incomplet, 'Faire signer', () => true)).toBe(true);
  });
  it('document complet : aucune question', () => {
    let posee = false;
    expect(sortieAutorisee(avenant(['Alice Martin']), 'Faire signer', () => { posee = true; return false; })).toBe(true);
    expect(posee).toBe(false);
  });
});
