/**
 * Tests pour BANK-INTEGRATION V1 v15.07 Sprint 8 V1.1.
 * Module js/core/bank-import.js — import CSV/OFX + matching auto.
 */
import { describe, it, expect } from 'vitest';
import {
  _bankParseCSV, _bankAutoDetectColumns, _bankParseAmount, _bankParseDate,
  _bankNormalizeCSV, _bankParseOFX, _bankMatchHeuristic, _bankDedup
} from '../../js/core/bank-import.js';

// ═══════════════════════════════════════════════════════════════════
//  _bankParseCSV — parsing CSV générique
// ═══════════════════════════════════════════════════════════════════

describe('_bankParseCSV', () => {
  it('Détecte le délimiteur point-virgule (norme FR)', () => {
    const csv = 'Date;Libelle;Montant\n01/01/2026;TEST;100';
    const r = _bankParseCSV(csv);
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual(['Date','Libelle','Montant']);
    expect(r.rows).toEqual([['01/01/2026','TEST','100']]);
  });

  it('Détecte la virgule (norme EN)', () => {
    const csv = 'Date,Description,Amount\n2026-01-01,TEST,100.50';
    const r = _bankParseCSV(csv);
    expect(r.delimiter).toBe(',');
    expect(r.headers).toEqual(['Date','Description','Amount']);
  });

  it('Détecte la tabulation', () => {
    const csv = 'Date\tLibelle\tMontant\n01/01\tTEST\t100';
    const r = _bankParseCSV(csv);
    expect(r.delimiter).toBe('\t');
  });

  it('Gère les champs entre guillemets avec virgule interne', () => {
    const csv = 'Date,Libelle,Montant\n2026-01-01,"VIR ALICE, MARTIN",650.00';
    const r = _bankParseCSV(csv);
    expect(r.rows[0][1]).toBe('VIR ALICE, MARTIN');
    expect(r.rows[0][2]).toBe('650.00');
  });

  it('Gère les guillemets échappés ""', () => {
    const csv = 'Libelle\n"Le ""beau"" loyer"';
    const r = _bankParseCSV(csv);
    expect(r.rows[0][0]).toBe('Le "beau" loyer');
  });

  it('Gère CRLF Windows et LF Unix', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\n5,6';
    const r = _bankParseCSV(csv);
    expect(r.rows.length).toBe(3);
  });

  it('Ignore les lignes vides', () => {
    const csv = 'a,b\n1,2\n\n3,4\n';
    expect(_bankParseCSV(csv).rows.length).toBe(2);
  });

  it('Texte vide → résultat vide', () => {
    expect(_bankParseCSV('').rows).toEqual([]);
    expect(_bankParseCSV(null).rows).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankAutoDetectColumns — heuristiques sur en-têtes
// ═══════════════════════════════════════════════════════════════════

describe('_bankAutoDetectColumns', () => {
  it('Détecte Date FR/EN', () => {
    expect(_bankAutoDetectColumns(['Date','Libelle','Montant']).date).toBe(0);
    expect(_bankAutoDetectColumns(['Date opération','Description','Amount']).date).toBe(0);
    expect(_bankAutoDetectColumns(['Trans Date','Description','Amount']).date).toBe(0);
  });

  it('Détecte Libellé / Description', () => {
    expect(_bankAutoDetectColumns(['Date','Libellé','Montant']).libelle).toBe(1);
    expect(_bankAutoDetectColumns(['Date','Description','Amount']).libelle).toBe(1);
    expect(_bankAutoDetectColumns(['Date','Nature','Amount']).libelle).toBe(1);
  });

  it('Détecte débit + crédit séparés', () => {
    const r = _bankAutoDetectColumns(['Date','Libelle','Débit','Crédit']);
    expect(r.debit).toBe(2);
    expect(r.credit).toBe(3);
  });

  it('Détecte montant unique signé', () => {
    expect(_bankAutoDetectColumns(['Date','Libelle','Montant']).montant).toBe(2);
    expect(_bankAutoDetectColumns(['Date','Description','Amount']).montant).toBe(2);
  });

  it('Détecte solde', () => {
    expect(_bankAutoDetectColumns(['Date','Lib','Montant','Solde']).solde).toBe(3);
    expect(_bankAutoDetectColumns(['Date','Lib','Amount','Balance']).solde).toBe(3);
  });

  it('Insensible à la casse + accents', () => {
    expect(_bankAutoDetectColumns(['DATE','LIBELLÉ','MONTANT']).date).toBe(0);
  });

  it('Headers vides → tous -1', () => {
    const r = _bankAutoDetectColumns([]);
    expect(r.date).toBe(-1);
    expect(r.libelle).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankParseAmount — parsing montants FR/EN
// ═══════════════════════════════════════════════════════════════════

describe('_bankParseAmount', () => {
  it('Format FR avec virgule décimale', () => {
    expect(_bankParseAmount('1234,56')).toBe(1234.56);
    expect(_bankParseAmount('-650,00')).toBe(-650);
  });

  it('Format EN avec point décimal', () => {
    expect(_bankParseAmount('1234.56')).toBe(1234.56);
  });

  it('Format FR avec séparateur milliers', () => {
    expect(_bankParseAmount('1.234,56')).toBe(1234.56);
    expect(_bankParseAmount('1 234,56')).toBe(1234.56);
  });

  it('Format EN avec séparateur milliers', () => {
    expect(_bankParseAmount('1,234.56')).toBe(1234.56);
  });

  it('Supprime symbole € / $ / £', () => {
    expect(_bankParseAmount('650,00 €')).toBe(650);
    expect(_bankParseAmount('$1,234.56')).toBe(1234.56);
  });

  it('Vide / null → 0', () => {
    expect(_bankParseAmount('')).toBe(0);
    expect(_bankParseAmount(null)).toBe(0);
    expect(_bankParseAmount(undefined)).toBe(0);
  });

  it('Texte non numérique → 0', () => {
    expect(_bankParseAmount('abc')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankParseDate
// ═══════════════════════════════════════════════════════════════════

describe('_bankParseDate', () => {
  it('Format ISO YYYY-MM-DD', () => {
    expect(_bankParseDate('2026-01-15')).toBe('2026-01-15');
  });

  it('Format FR DD/MM/YYYY', () => {
    expect(_bankParseDate('15/01/2026')).toBe('2026-01-15');
    expect(_bankParseDate('15-01-2026')).toBe('2026-01-15');
    expect(_bankParseDate('15.01.2026')).toBe('2026-01-15');
  });

  it('Format OFX compact YYYYMMDD', () => {
    expect(_bankParseDate('20260115')).toBe('2026-01-15');
    expect(_bankParseDate('20260115120000[+1:CET]')).toBe('2026-01-15');
  });

  it('Format 2 chiffres DD/MM/YY → 20YY', () => {
    expect(_bankParseDate('15/01/26')).toBe('2026-01-15');
  });

  it('Date invalide → vide', () => {
    expect(_bankParseDate('xxx')).toBe('');
    expect(_bankParseDate('')).toBe('');
    expect(_bankParseDate(null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankNormalizeCSV
// ═══════════════════════════════════════════════════════════════════

describe('_bankNormalizeCSV', () => {
  it('Avec débit + crédit séparés', () => {
    const parsed = _bankParseCSV('Date;Libelle;Debit;Credit\n01/01/2026;VIR ALICE;0;650\n02/01/2026;ASSURANCE;120;0');
    const cols = _bankAutoDetectColumns(parsed.headers);
    const lines = _bankNormalizeCSV(parsed, cols);
    expect(lines.length).toBe(2);
    expect(lines[0].date).toBe('2026-01-01');
    expect(lines[0].credit).toBe(650);
    expect(lines[0].debit).toBe(0);
    expect(lines[0].signedAmount).toBe(650);
    expect(lines[1].debit).toBe(120);
    expect(lines[1].signedAmount).toBe(-120);
  });

  it('Avec montant unique signé', () => {
    const parsed = _bankParseCSV('Date,Libelle,Montant\n2026-01-01,LOYER,650\n2026-01-02,ASSURANCE,-120');
    const cols = _bankAutoDetectColumns(parsed.headers);
    const lines = _bankNormalizeCSV(parsed, cols);
    expect(lines[0].credit).toBe(650);
    expect(lines[1].debit).toBe(120);
  });

  it('Ignore lignes sans date', () => {
    const parsed = _bankParseCSV('Date,Libelle,Montant\n,TOTAL,1000\n2026-01-01,VRAI,500');
    const cols = _bankAutoDetectColumns(parsed.headers);
    expect(_bankNormalizeCSV(parsed, cols).length).toBe(1);
  });

  it('Ignore lignes avec montant 0/0', () => {
    const parsed = _bankParseCSV('Date,Libelle,Debit,Credit\n2026-01-01,VIDE,0,0\n2026-01-02,ASSUR,120,0');
    const cols = _bankAutoDetectColumns(parsed.headers);
    expect(_bankNormalizeCSV(parsed, cols).length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankParseOFX
// ═══════════════════════════════════════════════════════════════════

describe('_bankParseOFX', () => {
  const ofxSample = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260115120000
<TRNAMT>650.00
<FITID>TX12345
<NAME>VIR ALICE MARTIN
<MEMO>Loyer janvier
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260120
<TRNAMT>-120.00
<FITID>TX12346
<NAME>ASSURANCE MAAF
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

  it('Parse 2 transactions OFX SGML', () => {
    const txs = _bankParseOFX(ofxSample);
    expect(txs.length).toBe(2);
  });

  it('Extrait date + libellé + signe correct', () => {
    const txs = _bankParseOFX(ofxSample);
    expect(txs[0].date).toBe('2026-01-15');
    expect(txs[0].libelle).toMatch(/ALICE/);
    expect(txs[0].libelle).toMatch(/Loyer/);
    expect(txs[0].credit).toBe(650);
    expect(txs[0].fitid).toBe('TX12345');
    expect(txs[1].date).toBe('2026-01-20');
    expect(txs[1].debit).toBe(120);
  });

  it('Texte non-OFX → []', () => {
    expect(_bankParseOFX('blabla')).toEqual([]);
    expect(_bankParseOFX('')).toEqual([]);
    expect(_bankParseOFX(null)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankMatchHeuristic
// ═══════════════════════════════════════════════════════════════════

describe('_bankMatchHeuristic', () => {
  const ctx = {
    baux: {
      'F-001': { hc:600, ch:50, locataires:[{nom:'MARTIN Alice'}], debut:'2025-01-01' },
      'F-002': { hc:800, ch:80, locataires:[{nom:'DUPONT Jean'}], debut:'2025-06-01' }
    }
  };

  it('Match nom locataire + montant exact → Loyers + ref bail (confidence 0.95)', () => {
    const line = { libelle: 'VIR ALICE MARTIN LOYER', credit:650, debit:0, signedAmount:650 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toBe('Loyers encaissés');
    expect(r.qui).toBe('F-001');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('Match nom locataire avec montant divergent → confidence moyenne', () => {
    const line = { libelle: 'VIR Alice Martin partiel', credit:300, debit:0, signedAmount:300 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toBe('Loyers encaissés');
    expect(r.qui).toBe('F-001');
    expect(r.confidence).toBeLessThan(0.9);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('Mot-clé ASSURANCE → catégorie PNO', () => {
    const line = { libelle: 'ASSURANCE MAAF PRO', credit:0, debit:120, signedAmount:-120 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toMatch(/assurance|PNO/i);
  });

  it('Mot-clé EDF → catégorie énergie', () => {
    const line = { libelle: 'PRELEV EDF 0123456', credit:0, debit:85, signedAmount:-85 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toMatch(/charges|énergie/i);
  });

  it('Mot-clé SYNDIC → catégorie copropriété', () => {
    const line = { libelle: 'SYNDIC FONCIA APPEL FONDS', credit:0, debit:450, signedAmount:-450 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toMatch(/copropriété/i);
  });

  it('Mot-clé TRAVAUX → Travaux', () => {
    const line = { libelle: 'PLOMBIER VIRT INSTANT', credit:0, debit:300, signedAmount:-300 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toMatch(/Travaux/i);
  });

  it('Mot-clé taxe foncière → Taxes', () => {
    const line = { libelle: 'TAXE FONCIERE 2026', credit:0, debit:1200, signedAmount:-1200 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toMatch(/Taxes/i);
  });

  it('Fallback Autres si aucun match', () => {
    const line = { libelle: 'OPERATION INCONNUE XYZ', credit:0, debit:50, signedAmount:-50 };
    const r = _bankMatchHeuristic(line, ctx);
    expect(r.cat).toBe('Autres');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('Libellé vide → fallback', () => {
    expect(_bankMatchHeuristic({libelle:'', credit:100}, ctx).cat).toBe('');
  });

  it('Line null → empty result', () => {
    expect(_bankMatchHeuristic(null, ctx).cat).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _bankDedup
// ═══════════════════════════════════════════════════════════════════

describe('_bankDedup', () => {
  const existing = [
    { id: 1, date:'2026-01-05', cr:650, db:0, lib:'VIR ALICE' },
    { id: 2, date:'2026-01-10', cr:0,   db:120, lib:'ASSURANCE' },
    { id: 3, date:'2026-02-05', cr:650, db:0, fitid:'TX99' }
  ];

  it('Détecte doublon par date + montant exact', () => {
    const newLines = [
      { date:'2026-01-05', credit:650, debit:0, signedAmount:650, libelle:'VIR ALICE' }
    ];
    const r = _bankDedup(newLines, existing);
    expect(r[0].isDuplicate).toBe(true);
    expect(r[0].duplicateOf).toBe('1');
  });

  it('Détecte doublon par date ±3 jours', () => {
    const newLines = [
      { date:'2026-01-07', credit:650, debit:0, signedAmount:650, libelle:'VIR ALICE' }
    ];
    expect(_bankDedup(newLines, existing)[0].isDuplicate).toBe(true);
  });

  it('Pas doublon si date > 3 jours d\'écart', () => {
    const newLines = [
      { date:'2026-01-15', credit:650, debit:0, signedAmount:650, libelle:'VIR ALICE' }
    ];
    expect(_bankDedup(newLines, existing)[0].isDuplicate).toBe(false);
  });

  it('Pas doublon si montant > 1€ d\'écart', () => {
    const newLines = [
      { date:'2026-01-05', credit:655, debit:0, signedAmount:655, libelle:'VIR ALICE' }
    ];
    expect(_bankDedup(newLines, existing)[0].isDuplicate).toBe(false);
  });

  it('Match fitid OFX = certain', () => {
    const newLines = [
      { date:'2026-02-15', credit:650, debit:0, signedAmount:650, fitid:'TX99' }
    ];
    expect(_bankDedup(newLines, existing)[0].isDuplicate).toBe(true);
    expect(_bankDedup(newLines, existing)[0].duplicateOf).toBe('3');
  });

  it('Ignore les mouvements _deleted', () => {
    const existingWithDel = [
      { id: 1, date:'2026-01-05', cr:650, db:0, _deleted:true }
    ];
    const newLines = [
      { date:'2026-01-05', credit:650, debit:0, signedAmount:650 }
    ];
    expect(_bankDedup(newLines, existingWithDel)[0].isDuplicate).toBe(false);
  });

  it('Lignes vides → array vide', () => {
    expect(_bankDedup([], existing)).toEqual([]);
    expect(_bankDedup(null, existing)).toEqual([]);
  });

  it('Tolerance custom', () => {
    const newLines = [
      { date:'2026-01-15', credit:650, debit:0, signedAmount:650 }
    ];
    expect(_bankDedup(newLines, existing, { toleranceDays:10 })[0].isDuplicate).toBe(true);
  });
});
