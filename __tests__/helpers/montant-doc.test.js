// __tests__/helpers/montant-doc.test.js
// S3 SIGNATURE-SMOKE — « 1 2 / 0 0 0 , 0 0 » dans le PDF du bail.
//
// PREUVE (bp_102_7957d51b950d.pdf, page 3, flux de contenu décodé) :
//   … 28 | 00 5c 28 | 00 31 | 00 32 | 20 2f | 00 30 | 00 30 | 00 30 | 00 2c …
//   soit une chaîne encodée sur 2 OCTETS PAR CARACTÈRE ('1' → 00 31), avec
//   20 2f = U+202F NARROW NO-BREAK SPACE au milieu.
// Cause : toLocaleString('fr-FR') produit U+202F comme séparateur de milliers
// depuis ICU 72 (Chrome 111+). U+202F n'existe PAS dans WinAnsi → jsPDF bascule
// toute la chaîne en encodage 16 bits, que la police standard rend octet par
// octet → un NUL invisible devant chaque caractère + « / » (0x2f) à la place du
// séparateur. D'où « 1 2 / 0 0 0 , 0 0 ».
//
// Fix au bon niveau : formateur de montants DÉTERMINISTE (indépendant d'ICU)
// + assainisseur de texte PDF réutilisable par toutes les surfaces documents.

import { describe, it, expect } from 'vitest';
import { fmtMontantDoc, fmtEuroDoc, pdfSafeText, hasPdfUnsafeChars } from './montant-doc.js';

const NBSP = ' ';          // WinAnsi 0xA0 — SÛR pour jsPDF police standard
const NNBSP = ' ';         // U+202F — casse jsPDF (hors WinAnsi)

describe('fmtMontantDoc — séparateur de milliers sûr pour les documents', () => {
  it('formate 12000 en « 12 000,00 » avec une espace insécable WinAnsi', () => {
    expect(fmtMontantDoc(12000)).toBe('12' + NBSP + '000,00');
  });

  it('formate 1234.56 en « 1 234,56 »', () => {
    expect(fmtMontantDoc(1234.56)).toBe('1' + NBSP + '234,56');
  });

  it('formate 999 sans séparateur', () => {
    expect(fmtMontantDoc(999)).toBe('999,00');
  });

  it('n\'émet JAMAIS U+202F (le caractère qui casse le PDF)', () => {
    for (const v of [1000, 12000, 1234.56, 999999.99, 1234567.89]) {
      expect(fmtMontantDoc(v)).not.toContain(NNBSP);
    }
  });

  it('groupe les millions par tranches de 3', () => {
    expect(fmtMontantDoc(1234567.89)).toBe('1' + NBSP + '234' + NBSP + '567,89');
  });

  it('arrondit à 2 décimales', () => {
    expect(fmtMontantDoc(1234.567)).toBe('1' + NBSP + '234,57');
    expect(fmtMontantDoc(0.994)).toBe('0,99');
    expect(fmtMontantDoc(0.996)).toBe('1,00');
  });

  it('gère les négatifs (décomptes : solde en faveur du locataire)', () => {
    expect(fmtMontantDoc(-1500.5)).toBe('-1' + NBSP + '500,50');
  });

  it('rend « 0,00 » pour 0, null, undefined, NaN et chaîne vide', () => {
    for (const v of [0, null, undefined, NaN, '']) expect(fmtMontantDoc(v)).toBe('0,00');
  });

  it('accepte une chaîne numérique (données saisies)', () => {
    expect(fmtMontantDoc('12000')).toBe('12' + NBSP + '000,00');
    expect(fmtMontantDoc('1234,56')).toBe('1' + NBSP + '234,56');
  });

  it('reste identique quel que soit l\'ICU (déterministe, pas de toLocaleString)', () => {
    // Garde-fou anti-régression : si un jour on rebranche toLocaleString,
    // ce test tombe sur les runtimes ICU ≥ 72.
    expect(fmtMontantDoc(12000).charCodeAt(2)).toBe(0x00A0);
  });
});

describe('fmtEuroDoc — montant + € pour les documents', () => {
  it('ajoute « € » précédé d\'une espace insécable WinAnsi', () => {
    expect(fmtEuroDoc(12000)).toBe('12' + NBSP + '000,00' + NBSP + '€');
  });
  it('ne contient aucun caractère hors WinAnsi', () => {
    expect(hasPdfUnsafeChars(fmtEuroDoc(1234567.89))).toBe(false);
  });
});

describe('pdfSafeText — filet de sécurité sur TOUT texte envoyé à jsPDF', () => {
  it('remplace U+202F (narrow nbsp) par une espace insécable WinAnsi', () => {
    expect(pdfSafeText('12' + NNBSP + '000,00')).toBe('12' + NBSP + '000,00');
  });

  it('remplace les autres espaces typographiques hors WinAnsi', () => {
    expect(pdfSafeText('a b')).toBe('a' + NBSP + 'b');   // thin space
    expect(pdfSafeText('a b')).toBe('a' + NBSP + 'b');   // figure space
    expect(pdfSafeText('a b')).toBe('a' + NBSP + 'b');   // hair space
    expect(pdfSafeText('a⁠b')).toBe('ab');               // word joiner → supprimé
    expect(pdfSafeText('a﻿b')).toBe('ab');               // BOM → supprimé
  });

  it('remplace le trait d\'union insécable U+2011 par un tiret ASCII', () => {
    expect(pdfSafeText('Ferrette‑001')).toBe('Ferrette-001');
  });

  it('PRÉSERVE les caractères qui EXISTENT en WinAnsi (é, €, –, ’, œ)', () => {
    const ok = 'Généré · 12 000,00 € — l’entrée – œuvre';
    expect(pdfSafeText(ok)).toBe(ok);
  });

  it('est sûr sur les entrées non-chaînes', () => {
    expect(pdfSafeText(null)).toBe('');
    expect(pdfSafeText(undefined)).toBe('');
    expect(pdfSafeText(1234)).toBe('1234');
  });

  it('traite les tableaux de lignes (jsPDF accepte un array)', () => {
    expect(pdfSafeText(['12' + NNBSP + '000', 'ok'])).toEqual(['12' + NBSP + '000', 'ok']);
  });
});

describe('hasPdfUnsafeChars — détecteur de régression', () => {
  it('détecte U+202F', () => {
    expect(hasPdfUnsafeChars('12' + NNBSP + '000')).toBe(true);
  });
  it('ne signale pas un texte WinAnsi valide', () => {
    expect(hasPdfUnsafeChars('Bail — 12 000,00 € · Généré')).toBe(false);
  });
  it('détecte un caractère franchement hors WinAnsi (emoji)', () => {
    expect(hasPdfUnsafeChars('Bail ✅')).toBe(true);
  });
});
