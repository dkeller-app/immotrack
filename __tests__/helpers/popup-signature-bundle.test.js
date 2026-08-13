// __tests__/helpers/popup-signature-bundle.test.js
// La popup de signature est un document about:blank écrit par document.write : elle ne peut pas
// charger js/helpers/ par URL relative. previewBailData y injecte donc les helpers PURS sérialisés
// par Function.prototype.toString() (source unique, aucune copie divergente).
//
// Ce test REJOUE cette sérialisation dans un contexte vierge. Il attrape la classe de bug qui a
// frappé le 13/08 pendant l'audit : ajouter une variable libre (hasPdfUnsafeChars) dans une
// fonction injectée sans l'injecter elle aussi → « ReferenceError: hasPdfUnsafeChars is not
// defined » au clic sur « Terminer & générer PDF », c'est-à-dire APRÈS que l'utilisateur a
// paraphé les 26 pages. Aucun test unitaire classique ne le voyait : dans le module ES, la
// variable est bien dans la portée.
//
// ⚠️ Si tu ajoutes un helper à l'injection dans previewBailData, ajoute-le AUSSI ici.

import { describe, it, expect } from 'vitest';
import * as MD from './montant-doc.js';
import * as BS from './bail-signataires.js';

// Réplique EXACTE de l'ordre d'injection de index.html (previewBailData, var scripts = '<script>').
function buildPopupBundle() {
  return [
    'var _padSignersFor=' + BS.padSignersFor.toString() + ';',
    'var WINANSI_HIGH=' + JSON.stringify(MD.WINANSI_HIGH) + ';',
    'var PDF_UNSAFE_MAP=' + JSON.stringify(MD.PDF_UNSAFE_MAP) + ';',
    'var isWinAnsiChar=' + MD.isWinAnsiChar.toString() + ';',
    'var hasPdfUnsafeChars=' + MD.hasPdfUnsafeChars.toString() + ';',
    'var pdfSafeText=' + MD.pdfSafeText.toString() + ';',
    'var hardenJsPdfText=' + MD.hardenJsPdfText.toString() + ';'
  ].join('');
}

// Évalue le bundle dans une portée NEUVE : toute variable libre non injectée casse ici,
// exactement comme dans la popup.
function evalBundle() {
  const factory = new Function(buildPopupBundle()
    + 'return {padSignersFor:_padSignersFor, pdfSafeText:pdfSafeText, hasPdfUnsafeChars:hasPdfUnsafeChars, hardenJsPdfText:hardenJsPdfText};');
  return factory();
}

describe('bundle injecté dans la popup de signature', () => {
  it('s\'évalue sans variable libre manquante', () => {
    expect(() => evalBundle()).not.toThrow();
  });

  it('padSignersFor fonctionne à l\'identique côté popup', () => {
    const popup = evalBundle();
    const sigs = [{ id: 'bailleur-0', role: 'LE BAILLEUR' }, { id: 'loc-0', role: 'LOCATAIRE' }];
    expect(popup.padSignersFor(sigs, { solo: 'bailleur-0' }).sigs.map(s => s.id)).toEqual(['bailleur-0']);
    expect(popup.padSignersFor(sigs, { solo: 'bailleur' }).error.code).toBe('SIGNER_INTROUVABLE');
  });

  it('pdfSafeText fonctionne à l\'identique côté popup (U+202F + caractère inconnu)', () => {
    const popup = evalBundle();
    expect(popup.pdfSafeText('12\u202f000,00')).toBe(MD.pdfSafeText('12\u202f000,00'));
    expect(popup.hasPdfUnsafeChars(popup.pdfSafeText('Bail ✅ Nguyễn'))).toBe(false);
  });

  it('hardenJsPdfText assainit réellement les appels pdf.text de la popup', () => {
    const popup = evalBundle();
    const vus = [];
    const fakePdf = { text(t) { vus.push(t); return this; } };
    popup.hardenJsPdfText(fakePdf);
    fakePdf.text('Loyer : 12\u202f000,00 \u20ac');   // U+202F = le caractere qui casse jsPDF
    fakePdf.text(['ligne 1 : 1\u202f234,56', 'ligne 2']);
    expect(vus[0]).toBe('Loyer : 12' + MD.NBSP + '000,00 \u20ac');
    expect(vus[1]).toEqual(['ligne 1 : 1' + MD.NBSP + '234,56', 'ligne 2']);
    for (const v of vus) expect(MD.hasPdfUnsafeChars(Array.isArray(v) ? v.join('') : v)).toBe(false);
  });

  it('hardenJsPdfText préserve le chaînage et reste idempotent', () => {
    const popup = evalBundle();
    let n = 0;
    const fakePdf = { text() { n++; return this; } };
    popup.hardenJsPdfText(fakePdf);
    popup.hardenJsPdfText(fakePdf);          // 2e passe : ne doit pas ré-emballer
    expect(fakePdf.text('x')).toBe(fakePdf); // chaînage jsPDF (pdf.text(...).setFont(...))
    expect(n).toBe(1);
  });

  it('aucune source injectée ne contient « </script » (cassure du document.write)', () => {
    expect(buildPopupBundle().toLowerCase()).not.toContain('</script');
  });
});
