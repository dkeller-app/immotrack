/**
 * Tests pour BANK-INTEGRATION V1 v15.07 Sprint 8 V1.1.
 * Module js/core/bank-import.js — import CSV/OFX + matching auto.
 */
import { describe, it, expect } from 'vitest';
import {
  _bankParseCSV, _bankAutoDetectColumns, _bankParseAmount, _bankParseDate,
  _bankNormalizeCSV, _bankParseOFX, _bankMatchHeuristic, _bankDedup,
  _bankHashStable, _bankFingerprintCSV, _bankFingerprintOFX, _bankMigrateFingerprints,
  _bankExtractOFXAccount, _bankCsvHeaderHash,
  _bankSliceAfterFingerprint, _bankComputeLastImport
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


// ═══════════════════════════════════════════════════════════════════
//  v15.78 BUG-BANK-IMPORT-DEDUP — fingerprinting stable
// ═══════════════════════════════════════════════════════════════════

describe("_bankHashStable", () => {
  it("hash deterministe : meme input → meme output", () => {
    expect(_bankHashStable("hello world")).toBe(_bankHashStable("hello world"));
  });
  it("16 chars hex", () => {
    expect(_bankHashStable("test").length).toBe(16);
    expect(_bankHashStable("test")).toMatch(/^[0-9a-f]{16}$/);
  });
  it("inputs differents → outputs differents", () => {
    expect(_bankHashStable("a")).not.toBe(_bankHashStable("b"));
  });
  it("empty + null safe", () => {
    expect(_bankHashStable("")).toBe(_bankHashStable(""));
    expect(_bankHashStable(null)).toBe(_bankHashStable(""));
  });
});

describe("_bankFingerprintCSV — normalisation", () => {
  it("meme empreinte pour casse differente", () => {
    expect(_bankFingerprintCSV("VIR ALICE MARTIN 650"))
      .toBe(_bankFingerprintCSV("vir alice martin 650"));
  });
  it("meme empreinte pour espaces multiples", () => {
    expect(_bankFingerprintCSV("VIR ALICE  MARTIN   650"))
      .toBe(_bankFingerprintCSV("VIR ALICE MARTIN 650"));
  });
  it("meme empreinte pour accents (NFKD)", () => {
    expect(_bankFingerprintCSV("VIR MULLER 650"))
      .toBe(_bankFingerprintCSV("VIR MÜLLER 650"));
  });
  it("empreintes differentes pour 2 lignes distinctes", () => {
    expect(_bankFingerprintCSV("01/01/2026;VIR ALICE;650"))
      .not.toBe(_bankFingerprintCSV("01/01/2026;VIR BOB;650"));
  });
  it("trim leading/trailing", () => {
    expect(_bankFingerprintCSV("  test  ")).toBe(_bankFingerprintCSV("test"));
  });
});

describe("_bankFingerprintOFX — priorite FITID", () => {
  it("utilise FITID si present (prefix fitid:)", () => {
    const body = "<TRNTYPE>CREDIT<DTPOSTED>20260315<TRNAMT>650<FITID>ABC123<NAME>VIR ALICE";
    expect(_bankFingerprintOFX(body)).toBe("fitid:ABC123");
  });
  it("fallback hash si FITID absent", () => {
    const body = "<TRNTYPE>CREDIT<DTPOSTED>20260315<TRNAMT>650<NAME>VIR ALICE<MEMO>loyer";
    const fp = _bankFingerprintOFX(body);
    expect(fp).not.toMatch(/^fitid:/);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
  it("FITID vide → fallback hash", () => {
    const body = "<TRNTYPE>CREDIT<DTPOSTED>20260315<TRNAMT>650<FITID>   <NAME>VIR ALICE";
    expect(_bankFingerprintOFX(body)).toMatch(/^[0-9a-f]{16}$/);
  });
  it("body vide/null safe", () => {
    expect(_bankFingerprintOFX("")).toMatch(/^[0-9a-f]{16}$/);
    expect(_bankFingerprintOFX(null)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("_bankNormalizeCSV — ajout _fingerprint sur chaque ligne", () => {
  it("chaque ligne normalisee a _fingerprint + _importSource csv", () => {
    const parsed = _bankParseCSV("Date;Libelle;Montant\n01/01/2026;VIR ALICE;650\n02/01/2026;VIR BOB;-100");
    const cols = _bankAutoDetectColumns(parsed.headers);
    const out = _bankNormalizeCSV(parsed, cols);
    expect(out.length).toBe(2);
    expect(out[0]._fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(out[1]._fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(out[0]._fingerprint).not.toBe(out[1]._fingerprint);
    expect(out[0]._importSource).toBe("csv");
  });
});

describe("_bankParseOFX — ajout _fingerprint", () => {
  it("transaction avec FITID → _fingerprint = fitid:XXX", () => {
    const ofx = "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260315<TRNAMT>650<FITID>UNIQ-001<NAME>VIR ALICE</STMTTRN>";
    const out = _bankParseOFX(ofx);
    expect(out.length).toBe(1);
    expect(out[0]._fingerprint).toBe("fitid:UNIQ-001");
    expect(out[0]._importSource).toBe("ofx");
  });
});

describe("_bankDedup — strategie 1 fingerprint", () => {
  it("SKIP si fingerprint deja present en DB", () => {
    const newLines = [{ date:"2026-01-15", credit:650, debit:0, _fingerprint:"abc123" }];
    const existing = [{ id:1, date:"2026-01-15", cr:650, _fingerprint:"abc123" }];
    const out = _bankDedup(newLines, existing);
    expect(out[0].isDuplicate).toBe(true);
    expect(out[0].duplicateReason).toMatch(/empreinte/i);
  });
  it("CRITIQUE : user modifie date+libelle+montant apres import → SKIP correct", () => {
    const newLines = [{ date:"2026-01-15", libelle:"VIR ALICE 650", credit:650, debit:0, _fingerprint:"stable-fp-1" }];
    // En DB : meme fingerprint mais date/libelle/montant tous DIFFERENTS (user a edite)
    const existing = [{ id:99, date:"2026-02-28", libelle:"Renomme par user", cr:999, _fingerprint:"stable-fp-1" }];
    const out = _bankDedup(newLines, existing);
    expect(out[0].isDuplicate).toBe(true); // toujours detecte malgre les modifs !
    expect(out[0].duplicateOf).toBe("99");
  });
  it("pas duplicate si fingerprint different", () => {
    const newLines = [{ date:"2026-01-15", credit:650, debit:0, _fingerprint:"new-fp" }];
    const existing = [{ id:1, date:"2026-01-15", cr:650, _fingerprint:"other-fp" }];
    expect(_bankDedup(newLines, existing)[0].isDuplicate).toBe(false);
  });
});

describe("_bankDedup — fallback legacy (mouvements sans fingerprint)", () => {
  it("mouvement legacy sans _fingerprint → fallback date+montant", () => {
    const newLines = [{ date:"2026-01-15", credit:650, debit:0, _fingerprint:"new-fp" }];
    const existing = [{ id:1, date:"2026-01-15", cr:650 }]; // pas de _fingerprint
    const out = _bankDedup(newLines, existing);
    expect(out[0].isDuplicate).toBe(true);
    expect(out[0].duplicateReason).toMatch(/legacy/i);
  });
  it("mix legacy + modern dans meme DB → match les 2 strategies", () => {
    const newLines = [
      { date:"2026-01-15", credit:650, debit:0, _fingerprint:"fp1" },   // matche modern
      { date:"2026-02-15", credit:700, debit:0, _fingerprint:"fp-X" },  // matche legacy via date+montant
    ];
    const existing = [
      { id:1, date:"2026-01-15", cr:650, _fingerprint:"fp1" },   // modern
      { id:2, date:"2026-02-15", cr:700 },                        // legacy (pas de fp)
    ];
    const out = _bankDedup(newLines, existing);
    expect(out[0].isDuplicate).toBe(true);
    expect(out[1].isDuplicate).toBe(true);
  });
  it("disable legacy fallback → seul fp marche", () => {
    const newLines = [{ date:"2026-01-15", credit:650, debit:0, _fingerprint:"new-fp" }];
    const existing = [{ id:1, date:"2026-01-15", cr:650 }]; // legacy
    const out = _bankDedup(newLines, existing, { legacyFallback:false });
    expect(out[0].isDuplicate).toBe(false);
  });
});

describe("_bankMigrateFingerprints", () => {
  it("migre fitid OFX legacy vers _fingerprint", () => {
    const movs = [{ id:1, fitid:"OFX-ABC" }, { id:2, fitid:"OFX-DEF" }];
    const r = _bankMigrateFingerprints(movs);
    expect(r.migrated).toBe(2);
    expect(movs[0]._fingerprint).toBe("fitid:OFX-ABC");
    expect(movs[1]._fingerprint).toBe("fitid:OFX-DEF");
  });
  it("idempotent : 2e appel ne re-migre pas", () => {
    const movs = [{ id:1, fitid:"OFX-ABC" }];
    _bankMigrateFingerprints(movs);
    const r2 = _bankMigrateFingerprints(movs);
    expect(r2.migrated).toBe(0);
    expect(r2.skipped).toBe(1);
  });
  it("skip mouvements sans fitid (CSV legacy / saisis manuel)", () => {
    const movs = [{ id:1, date:"2026-01-15", cr:650, libelle:"Saisi manuel" }];
    const r = _bankMigrateFingerprints(movs);
    expect(r.migrated).toBe(0);
    expect(movs[0]._fingerprint).toBeUndefined();
  });
  it("skip mouvements _deleted", () => {
    const movs = [{ id:1, fitid:"X", _deleted:true }];
    const r = _bankMigrateFingerprints(movs);
    expect(r.migrated).toBe(0);
  });
  it("non-array → { migrated:0, skipped:0 }", () => {
    expect(_bankMigrateFingerprints(null)).toEqual({ migrated:0, skipped:0 });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BANK-IMPORT-V2 Phase A — Identification du compte source
// ═══════════════════════════════════════════════════════════════════

describe('_bankExtractOFXAccount', () => {
  it('Extrait ACCTID + BANKID depuis BANKACCTFROM (SGML)', () => {
    const ofx = `<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM>
<BANKID>30002
<ACCTID>00000012345
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<STMTTRN><DTPOSTED>20260101<TRNAMT>100.00<FITID>X1</STMTTRN>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const acc = _bankExtractOFXAccount(ofx);
    expect(acc).toBeTruthy();
    expect(acc.bankId).toBe('30002');
    expect(acc.acctId).toBe('00000012345');
    expect(acc.acctType).toBe('CHECKING');
    expect(acc.identifier).toBe('acct:30002:00000012345');
  });

  it('Extrait ACCTID depuis CCACCTFROM (carte crédit)', () => {
    const ofx = `<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>4444555566667777</CCACCTFROM>
<STMTTRN><DTPOSTED>20260101<TRNAMT>50</STMTTRN>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const acc = _bankExtractOFXAccount(ofx);
    expect(acc).toBeTruthy();
    expect(acc.acctId).toBe('4444555566667777');
    expect(acc.identifier).toBe('acct:4444555566667777');  // pas de BANKID pour les cartes
  });

  it('Texte vide ou non-OFX → null', () => {
    expect(_bankExtractOFXAccount('')).toBeNull();
    expect(_bankExtractOFXAccount('pas du tout un OFX')).toBeNull();
    expect(_bankExtractOFXAccount(null)).toBeNull();
  });

  it('OFX sans ACCTID → null (compte non identifiable)', () => {
    const ofx = `<OFX><BANKACCTFROM><BANKID>30002</BANKACCTFROM></OFX>`;
    expect(_bankExtractOFXAccount(ofx)).toBeNull();
  });
});

describe('_bankCsvHeaderHash', () => {
  it('Même schéma de colonnes → même hash (stable)', () => {
    const a = _bankCsvHeaderHash({ headers:['Date','Libelle','Debit','Credit'], delimiter:';' });
    const b = _bankCsvHeaderHash({ headers:['Date','Libelle','Debit','Credit'], delimiter:';' });
    expect(a).toBe(b);
    expect(a).toMatch(/^csv:[a-f0-9]{16}$/);
  });

  it('Insensible à la casse + accents (variantes cosmétiques)', () => {
    const a = _bankCsvHeaderHash({ headers:['Date','Libellé','Débit','Crédit'], delimiter:';' });
    const b = _bankCsvHeaderHash({ headers:['DATE','LIBELLE','DEBIT','CREDIT'], delimiter:';' });
    expect(a).toBe(b);
  });

  it('Schémas différents → hashes différents', () => {
    const a = _bankCsvHeaderHash({ headers:['Date','Libelle','Montant'], delimiter:';' });
    const b = _bankCsvHeaderHash({ headers:['Date','Libelle','Debit','Credit'], delimiter:';' });
    expect(a).not.toBe(b);
  });

  it('Délimiteur différent → hash différent (banques distinctes peuvent partager les noms)', () => {
    const a = _bankCsvHeaderHash({ headers:['Date','Lib','Montant'], delimiter:';' });
    const b = _bankCsvHeaderHash({ headers:['Date','Lib','Montant'], delimiter:',' });
    expect(a).not.toBe(b);
  });

  it("Pas d'en-têtes → null", () => {
    expect(_bankCsvHeaderHash({ headers:[] })).toBeNull();
    expect(_bankCsvHeaderHash(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  BANK-IMPORT-V2 Phase D — Pointeur de progression
// ═══════════════════════════════════════════════════════════════════

describe('_bankSliceAfterFingerprint', () => {
  const L = (i) => ({ date: '2026-01-' + String(i).padStart(2,'0'), _fingerprint: 'fp_' + i });

  it('Fingerprint trouvé en milieu → slice après', () => {
    const lines = [L(1), L(2), L(3), L(4), L(5)];
    const r = _bankSliceAfterFingerprint(lines, 'fp_2');
    expect(r.found).toBe(true);
    expect(r.idx).toBe(1);
    expect(r.after.length).toBe(3);
    expect(r.after[0]._fingerprint).toBe('fp_3');
  });

  it('Fingerprint = dernière ligne → after vide (tout déjà importé)', () => {
    const lines = [L(1), L(2), L(3)];
    const r = _bankSliceAfterFingerprint(lines, 'fp_3');
    expect(r.found).toBe(true);
    expect(r.after).toEqual([]);
  });

  it('Fingerprint = première ligne → after = toutes sauf la 1re', () => {
    const lines = [L(1), L(2), L(3)];
    const r = _bankSliceAfterFingerprint(lines, 'fp_1');
    expect(r.after.length).toBe(2);
    expect(r.after[0]._fingerprint).toBe('fp_2');
  });

  it('Fingerprint introuvable → found:false, after = toutes (fallback heuristique)', () => {
    const lines = [L(1), L(2), L(3)];
    const r = _bankSliceAfterFingerprint(lines, 'fp_inexistant');
    expect(r.found).toBe(false);
    expect(r.idx).toBe(-1);
    expect(r.after).toBe(lines); // same ref, full lines
  });

  it('Fingerprint vide/null/undefined → found:false, after = lines', () => {
    const lines = [L(1)];
    expect(_bankSliceAfterFingerprint(lines, null).found).toBe(false);
    expect(_bankSliceAfterFingerprint(lines, '').found).toBe(false);
    expect(_bankSliceAfterFingerprint(lines, undefined).found).toBe(false);
  });

  it('Lines null/undefined → after:[] propre, pas de throw', () => {
    expect(_bankSliceAfterFingerprint(null, 'fp_1').after).toEqual([]);
    expect(_bankSliceAfterFingerprint(undefined, 'fp_1').after).toEqual([]);
  });

  it("Ignore les lignes sans _fingerprint (n'arrête pas la recherche)", () => {
    const lines = [L(1), { date:'2026-01-02' /* pas de fp */ }, L(3)];
    const r = _bankSliceAfterFingerprint(lines, 'fp_3');
    expect(r.found).toBe(true);
    expect(r.idx).toBe(2);
  });
});

describe('_bankComputeLastImport', () => {
  it("Calcule pointeur depuis le lot accepté (dernière date)", () => {
    const lines = [
      { date:'2026-01-15', _fingerprint:'fpA' },
      { date:'2026-01-31', _fingerprint:'fpZ' }, // la plus récente
      { date:'2026-01-20', _fingerprint:'fpB' }
    ];
    const r = _bankComputeLastImport(lines, 0);
    expect(r.date).toBe('2026-01-31');
    expect(r.fingerprint).toBe('fpZ');
    expect(r.count).toBe(3);
    expect(r.at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO
  });

  it("Cumule previousCount", () => {
    const lines = [{ date:'2026-02-01', _fingerprint:'fpX' }];
    const r = _bankComputeLastImport(lines, 42);
    expect(r.count).toBe(43);
  });

  it("Liste vide → null (pas d'erreur)", () => {
    expect(_bankComputeLastImport([], 0)).toBeNull();
    expect(_bankComputeLastImport(null, 0)).toBeNull();
  });

  it("Ligne sans _fingerprint → fingerprint:null mais pointeur quand même utile (date)", () => {
    const lines = [{ date:'2026-03-15' /* pas de fingerprint */ }];
    const r = _bankComputeLastImport(lines, 0);
    expect(r.date).toBe('2026-03-15');
    expect(r.fingerprint).toBeNull();
    expect(r.count).toBe(1);
  });

  it("previousCount non-numérique → coercé à 0", () => {
    const lines = [{ date:'2026-01-01', _fingerprint:'fp' }];
    expect(_bankComputeLastImport(lines, undefined).count).toBe(1);
    expect(_bankComputeLastImport(lines, null).count).toBe(1);
    expect(_bankComputeLastImport(lines, 'abc').count).toBe(1);
  });
});

