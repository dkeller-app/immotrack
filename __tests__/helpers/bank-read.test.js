/**
 * bank-read.test.js — CHANTIER IMPORT-MOUVEMENTS, étape 1 « Lecture des fichiers ».
 * CDC : docs/CDC-IMPORT.md sections ①, ② et ③.
 *
 * Couvre : reconnaissance du format par signature (①.1) · Excel multi-feuilles (①.4) ·
 * OFX libellé intégral (②.1) · début des données par le contenu (②.2) · date
 * d'opération (②.3) · orientation prouvée (②.4) · contrôle par le solde (②.5) ·
 * parenthèses comptables et devises (③.2) · dates aberrantes marquées (③.3).
 */
import { describe, it, expect } from 'vitest';
import {
  _bankDetectFormat, _BANK_MAX_FILE_SIZE,
  _bankParseAmount, _bankParseDate, _bankIsDateLike, _bankIsAmountLike, _bankForeignCurrency,
  _bankOfxTag, _bankOfxLabel, _bankParseOFX, _bankReadOFX,
  _bankFindHeaderRow, _bankPickDateColumn, _bankDetectOrientation,
  _bankCheckBalance, _bankMarkDoubtfulDates, _bankPickSheets, _bankReadTable,
  _bankFingerprintRow, _bankExtractSheetAccount,
} from '../../js/core/bank-import.js';

const u8 = (s) => new Uint8Array([...s].map(c => c.charCodeAt(0)));

// ═══════════════════════════════════════════════════════════════════
//  ①.1 — Reconnaissance PAR SIGNATURE RÉELLE (fini « sinon c'est du CSV »)
// ═══════════════════════════════════════════════════════════════════

describe('①.1 _bankDetectFormat — signature réelle, jamais de repli CSV', () => {
  it('Reconnaît un OFX SGML par son en-tête', () => {
    const r = _bankDetectFormat(u8('OFXHEADER:100\nDATA:OFXSGML\n<OFX>'), 'releve.ofx');
    expect(r.format).toBe('ofx');
  });

  it('Reconnaît un OFX XML sans en-tête OFXHEADER', () => {
    expect(_bankDetectFormat(u8('<?xml version="1.0"?><OFX><BANKMSGSRSV1>'), 'x.qfx').format).toBe('ofx');
  });

  it('Reconnaît un .xlsx par la signature ZIP (PK)', () => {
    expect(_bankDetectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'a.xlsx').format).toBe('xlsx');
  });

  it('Reconnaît un .xls par la signature OLE2', () => {
    expect(_bankDetectFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]), 'a.xls').format).toBe('xls');
  });

  it('REFUSE un CSV — le lecteur CSV a été retiré (①.1)', () => {
    const r = _bankDetectFormat(u8('Date;Libelle;Montant\n01/01/2026;TEST;100'), 'releve.csv');
    expect(r.format).toBe('unknown');
  });

  it("REFUSE un fichier d'extension .ofx qui ne contient aucune balise OFX", () => {
    const r = _bankDetectFormat(u8('bonjour ceci nest pas un releve'), 'faux.ofx');
    expect(r.format).toBe('unknown');
    expect(r.reason).toMatch(/aucune balise/i);
  });

  it('Taille maximale inchangée à 5 Mo (①.2)', () => {
    expect(_BANK_MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ③.2 — Montants : parenthèses comptables, espaces insécables, devises
// ═══════════════════════════════════════════════════════════════════

describe('③.2 _bankParseAmount — parenthèses comptables et séparateurs réels', () => {
  it('(487,00) vaut −487 (notation comptable)', () => {
    expect(_bankParseAmount('(487,00)')).toBe(-487);
  });

  it('(1 234.56) vaut −1234.56', () => {
    expect(_bankParseAmount('(1 234.56)')).toBe(-1234.56);
  });

  it("Gère l'espace insécable (U+00A0) et l'espace fine (U+202F) des exports FR", () => {
    expect(_bankParseAmount('1 234,56 €')).toBe(1234.56);
    expect(_bankParseAmount('1 234,56')).toBe(1234.56);
  });

  it('Gère le signe suffixé des exports mainframe : 487,00-', () => {
    expect(_bankParseAmount('487,00-')).toBe(-487);
  });

  it('Reste compatible avec le format FR classique et EN', () => {
    expect(_bankParseAmount('1.234,56')).toBe(1234.56);
    expect(_bankParseAmount('1,234.56')).toBe(1234.56);
    expect(_bankParseAmount('-350.75')).toBe(-350.75);
  });

  it('Accepte un nombre natif (cellule Excel numérique)', () => {
    expect(_bankParseAmount(-42.5)).toBe(-42.5);
  });

  it('Une devise étrangère est reconnue pour être écartée, pas convertie', () => {
    expect(_bankForeignCurrency('1200 USD')).toBe('USD');
    expect(_bankForeignCurrency('$1200')).toBe('$');
    expect(_bankForeignCurrency('1200 €')).toBe('');
  });
});

describe('_bankParseDate — Date native, série Excel, dates impossibles', () => {
  it('Accepte un objet Date (Excel cellDates:true), sans décalage de fuseau', () => {
    expect(_bankParseDate(new Date(2026, 7, 4))).toBe('2026-08-04');
  });

  it('Accepte un numéro de série Excel', () => {
    // 45000 = 2023-03-15 (époque 1899-12-30)
    expect(_bankParseDate(45000)).toBe('2023-03-15');
  });

  it('Rejette une date qui n\'existe pas (31/02/2026)', () => {
    expect(_bankParseDate('31/02/2026')).toBe('');
  });

  it('Reste compatible DD/MM/YYYY, ISO et YYYYMMDD (OFX compact)', () => {
    expect(_bankParseDate('15/06/2026')).toBe('2026-06-15');
    expect(_bankParseDate('2026-06-15')).toBe('2026-06-15');
    expect(_bankParseDate('20260615')).toBe('2026-06-15');
  });

  it('Un montant nu n\'est jamais pris pour une date', () => {
    expect(_bankIsDateLike(850)).toBe(false);
    expect(_bankIsAmountLike(850)).toBe(true);
    expect(_bankIsDateLike(new Date(2026, 0, 1))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ②.1 — OFX : le libellé n'est plus tronqué au premier retour à la ligne
// ═══════════════════════════════════════════════════════════════════

const OFX_MULTILIGNE = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR
<BANKACCTFROM><BANKID>10278<ACCTID>00021234567<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260804<TRNAMT>-399.94
<FITID>2026080401<NAME>PRLV SEPA EDF
<MEMO>REF MANDAT RUM-EDF-0099812
MOTIF : ELECTRICITE AOUT 2026</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260805<TRNAMT>850.00
<FITID>2026080502<NAME>VIR M DUPONT JEAN<MEMO>LOYER AOUT</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('②.1 OFX — libellé intégral, toutes balises textuelles', () => {
  it("La valeur d'une balise court jusqu'au « < » suivant, pas jusqu'au retour à la ligne", () => {
    const body = '<MEMO>REF RUM-0099812\nMOTIF : AOUT</STMTTRN>';
    expect(_bankOfxTag(body, 'MEMO')).toBe('REF RUM-0099812 MOTIF : AOUT');
  });

  it('Le MEMO sur deux lignes N\'EST PLUS TRONQUÉ (RUM + motif conservés)', () => {
    const lines = _bankParseOFX(OFX_MULTILIGNE);
    expect(lines).toHaveLength(2);
    expect(lines[0].libelle).toContain('RUM-EDF-0099812');
    expect(lines[0].libelle).toContain('ELECTRICITE AOUT 2026');
  });

  it('Le libellé agrège NAME + MEMO sans les répéter', () => {
    const lbl = _bankOfxLabel('<NAME>EDF<MEMO>EDF</MEMO>');
    expect(lbl).toBe('EDF');
  });

  it('Agrège aussi CHECKNUM et REFNUM (aucune référence perdue — I-2)', () => {
    const lbl = _bankOfxLabel('<NAME>CHEQUE<CHECKNUM>0004512<REFNUM>REF-88');
    expect(lbl).toContain('0004512');
    expect(lbl).toContain('REF-88');
  });

  it('Sens et montants OFX : TRNAMT négatif = débit', () => {
    const lines = _bankParseOFX(OFX_MULTILIGNE);
    expect(lines[0].debit).toBe(399.94);
    expect(lines[0].credit).toBe(0);
    expect(lines[1].credit).toBe(850);
  });

  it('Le FITID est exposé et sert d\'empreinte (⑥.1)', () => {
    const lines = _bankParseOFX(OFX_MULTILIGNE);
    expect(lines[0].fitid).toBe('2026080401');
    expect(lines[0]._fingerprint).toBe('fitid:2026080401');
  });

  it('T-1 : une transaction en devise étrangère est écartée AVEC SON MOTIF', () => {
    const ofx = `<OFX><CURDEF>EUR<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260804<TRNAMT>-100.00<CURRENCY>USD<NAME>ACHAT US</STMTTRN>
<STMTTRN><DTPOSTED>20260805<TRNAMT>-50.00<NAME>ACHAT FR</STMTTRN></BANKTRANLIST></OFX>`;
    const r = _bankReadOFX(ofx);
    expect(r.lines).toHaveLength(1);
    expect(r.discarded).toHaveLength(1);
    expect(r.discarded[0].reason).toMatch(/USD/);
  });

  it('T-1 : un montant à 0 € est écarté AVEC SON MOTIF (plus de disparition muette)', () => {
    const ofx = `<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260804<TRNAMT>0.00<NAME>REGUL</STMTTRN></BANKTRANLIST></OFX>`;
    const r = _bankReadOFX(ofx);
    expect(r.lines).toHaveLength(0);
    expect(r.discarded[0].reason).toMatch(/0 €/);
  });

  it('La période lue est exposée dans le récapitulatif (③.1)', () => {
    const r = _bankReadOFX(OFX_MULTILIGNE);
    expect(r.meta.period).toEqual({ from: '2026-08-04', to: '2026-08-05' });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ②.2 — Début des données trouvé PAR LE CONTENU, en silence
// ═══════════════════════════════════════════════════════════════════

const SHEET_PREAMBULE = [
  ['Banque Populaire — Extrait de compte'],
  ['Compte n° 00021234567'],
  ['Période du 01/08/2026 au 31/08/2026'],
  [],
  ['Date', 'Libellé', 'Débit', 'Crédit', 'Solde'],
  ['04/08/2026', 'PRLV EDF', '399,94', '', '5100,06'],
  ['05/08/2026', 'VIR DUPONT LOYER', '', '850,00', '5950,06'],
  ['09/08/2026', 'CB SUPERMARCHE', '52,30', '', '5897,76'],
  ['TOTAL', '', '452,24', '850,00', ''],
];

describe('②.2 _bankFindHeaderRow — le préambule ne pose aucune question', () => {
  it('Trouve la ligne d\'en-tête sous un préambule de 4 lignes', () => {
    const h = _bankFindHeaderRow(SHEET_PREAMBULE);
    expect(h.ok).toBe(true);
    expect(h.headerRow).toBe(4);
    expect(h.headers[0]).toBe('Date');
  });

  it('Lit un fichier SANS en-tête (headerRow = -1)', () => {
    const rows = [
      ['04/08/2026', 'PRLV EDF', -399.94],
      ['05/08/2026', 'VIR DUPONT', 850],
      ['09/08/2026', 'CB COURSES', -52.3],
    ];
    const h = _bankFindHeaderRow(rows);
    expect(h.ok).toBe(true);
    expect(h.headerRow).toBe(-1);
    expect(h.data).toHaveLength(3);
  });

  it('Repère les colonnes de dates, de montants et de texte', () => {
    const h = _bankFindHeaderRow(SHEET_PREAMBULE);
    expect(h.dateCols).toContain(0);
    expect(h.amountCols).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(h.textCols).toContain(1);
  });

  it('Rend ok:false quand la feuille ne contient pas de mouvements', () => {
    const h = _bankFindHeaderRow([['Titre'], ['Note libre'], ['Autre chose']]);
    expect(h.ok).toBe(false);
  });
});

describe('②.3 _bankPickDateColumn — la date d\'OPÉRATION fait foi', () => {
  it('Préfère « Date opération » à « Date de valeur »', () => {
    const p = _bankPickDateColumn(['Date de valeur', "Date d'opération", 'Montant'], [0, 1]);
    expect(p.idx).toBe(1);
    expect(p.kind).toBe('operation');
  });

  it('À défaut d\'opération, prend la comptabilisation avant la valeur', () => {
    const p = _bankPickDateColumn(['Date de valeur', 'Date de comptabilisation'], [0, 1]);
    expect(p.idx).toBe(1);
    expect(p.kind).toBe('comptabilisation');
  });

  it('Sans en-tête parlant, prend la première colonne de dates', () => {
    const p = _bankPickDateColumn([], [2, 5]);
    expect(p.idx).toBe(2);
    expect(p.kind).toBe('inconnue');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ②.4 / ②.5 — Orientation PROUVÉE, solde qui certifie la lecture
// ═══════════════════════════════════════════════════════════════════

describe('②.4 _bankDetectOrientation — solde → signes → en-têtes → convention', () => {
  it('Deux colonnes jamais remplies ensemble = couple débit/crédit, prouvé par le solde', () => {
    const data = SHEET_PREAMBULE.slice(5, 8);
    const o = _bankDetectOrientation(data, { headers: SHEET_PREAMBULE[4], amountCols: [2, 3, 4], textCols: [1], soldeIdx: 4 });
    expect(o.mode).toBe('debitCredit');
    expect(o.proof).toBe('solde');
    expect(o.debitIdx).toBe(2);
    expect(o.creditIdx).toBe(3);
  });

  it('Sans solde, les en-têtes tranchent le sens', () => {
    const data = [['04/08/2026', 'EDF', '399,94', ''], ['05/08/2026', 'LOYER', '', '850,00']];
    const o = _bankDetectOrientation(data, { headers: ['Date', 'Libellé', 'Débit', 'Crédit'], amountCols: [2, 3], textCols: [1], soldeIdx: -1 });
    expect(o.proof).toBe('en-têtes');
    expect(o.debitIdx).toBe(2);
  });

  it('Une colonne avec positifs ET négatifs = montant signé, prouvé par les signes', () => {
    const data = [['04/08/2026', 'EDF', -399.94], ['05/08/2026', 'LOYER', 850]];
    const o = _bankDetectOrientation(data, { headers: ['Date', 'Libellé', 'Montant'], amountCols: [2], textCols: [1], soldeIdx: -1 });
    expect(o.mode).toBe('signed');
    expect(o.proof).toBe('signes');
  });

  it('Une colonne texte à deux valeurs = colonne de sens', () => {
    const data = [['04/08/2026', 'EDF', 'D', 399.94], ['05/08/2026', 'LOYER', 'C', 850]];
    const o = _bankDetectOrientation(data, { headers: ['Date', 'Libellé', 'Sens', 'Montant'], amountCols: [3], textCols: [1, 2], soldeIdx: -1 });
    expect(o.mode).toBe('sens');
    expect(o.sensIdx).toBe(2);
  });

  it('À défaut de toute preuve, la convention est annoncée comme telle', () => {
    const data = [['04/08/2026', 'A', 100], ['05/08/2026', 'B', 200]];
    const o = _bankDetectOrientation(data, { headers: ['', '', ''], amountCols: [2], textCols: [1], soldeIdx: -1 });
    expect(o.proof).toBe('convention');
    expect(o.proofLabel).toMatch(/convention/i);
  });
});

describe('②.5 _bankCheckBalance — le solde certifie la lecture, informe sans bloquer', () => {
  it('Valide une suite cohérente', () => {
    const r = _bankCheckBalance([
      { signed: -399.94, solde: 5100.06 },
      { signed: 850, solde: 5950.06 },
      { signed: -52.3, solde: 5897.76 },
    ]);
    expect(r.checked).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('MONTRE LA LIGNE où ça décroche (anomalie, pas simple avertissement)', () => {
    const r = _bankCheckBalance([
      { signed: -399.94, solde: 5100.06 },
      { signed: 850, solde: 5950.06 },
      { signed: -52.3, solde: 5000.00 },   // faux
    ]);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(2);
    expect(Math.round(r.expected * 100) / 100).toBe(-52.3);
  });

  it('Gère un relevé chronologique DÉCROISSANT (Crédit Agricole)', () => {
    const r = _bankCheckBalance([
      { signed: -52.3, solde: 5897.76 },
      { signed: 850, solde: 5950.06 },
      { signed: -399.94, solde: 5100.06 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.order).toBe('décroissant');
  });

  it('Sans colonne de solde, ne prétend rien (checked:false)', () => {
    expect(_bankCheckBalance([{ signed: 10 }]).checked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ③.3 v2 — Dates aberrantes : on IMPORTE et on MARQUE
// ═══════════════════════════════════════════════════════════════════

describe('③.3 _bankMarkDoubtfulDates — importer et marquer, jamais écarter', () => {
  it('Marque une date éloignée de plus de 12 mois de la période du fichier', () => {
    const lines = [
      { date: '2026-08-01' }, { date: '2026-08-05' }, { date: '2026-08-10' },
      { date: '2026-08-15' }, { date: '2019-03-02' }, { date: '2026-08-20' },
    ];
    _bankMarkDoubtfulDates(lines);
    expect(lines[4]._dateDouteuse).toMatch(/12 mois/);
    expect(lines[0]._dateDouteuse).toBeFalsy();
  });

  it('Marque une date illisible sans supprimer la ligne', () => {
    const lines = [{ date: '2026-08-01' }, { date: '' }, { date: '2026-08-03' }, { date: '2026-08-04' }];
    _bankMarkDoubtfulDates(lines);
    expect(lines[1]._dateDouteuse).toMatch(/illisible/);
    expect(lines).toHaveLength(4);
  });

  it('Ne marque rien sur un historique long mais homogène', () => {
    const lines = ['2024-01-05', '2024-07-05', '2025-01-05', '2025-07-05', '2026-01-05', '2026-07-05'].map(d => ({ date: d }));
    _bankMarkDoubtfulDates(lines);
    expect(lines.every(l => !l._dateDouteuse)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ①.4 / lecture complète d'une feuille
// ═══════════════════════════════════════════════════════════════════

describe('①.4 _bankPickSheets — on lit la feuille qui contient des mouvements', () => {
  it('Une seule feuille candidate → aucune question à poser', () => {
    const r = _bankPickSheets([
      { name: 'Notice', rows: [['Mode d\'emploi'], ['Contactez votre agence']] },
      { name: 'Compte courant', rows: SHEET_PREAMBULE },
    ]);
    expect(r.filter(s => s.isCandidate)).toHaveLength(1);
    expect(r[1].name).toBe('Compte courant');
    expect(r[1].nRows).toBe(3);
  });
});

describe('_bankReadTable — lecture complète, rien de caché (T-1)', () => {
  const r = _bankReadTable(SHEET_PREAMBULE, { sheetName: 'Compte courant' });

  it('Lit les 3 mouvements et ignore préambule + ligne de total', () => {
    expect(r.ok).toBe(true);
    expect(r.lines).toHaveLength(3);
  });

  it('Applique le bon sens : EDF en dépense, loyer en recette', () => {
    expect(r.lines[0].debit).toBe(399.94);
    expect(r.lines[0].credit).toBe(0);
    expect(r.lines[1].credit).toBe(850);
  });

  it('Expose le récapitulatif de lecture (③.1) : feuille, date retenue, preuve, solde', () => {
    expect(r.meta.sheetName).toBe('Compte courant');
    expect(r.meta.headerRow).toBe(4);
    expect(r.meta.dateColLabel).toBe('Date');
    expect(r.meta.orientationProof).toBe('solde');
    expect(r.meta.balance.ok).toBe(true);
    expect(r.meta.balance.count).toBe(3);
    expect(r.meta.period).toEqual({ from: '2026-08-04', to: '2026-08-09' });
  });

  it('La ligne de TOTAL est ÉCARTÉE AVEC SON MOTIF, pas effacée', () => {
    expect(r.discarded).toHaveLength(1);
    expect(r.discarded[0].reason).toMatch(/total ou pied de page/);
    expect(r.discarded[0].rowNo).toBe(9);   // on sait dire QUELLE ligne
  });

  it("Le n° de ligne du tableur est conservé pour pouvoir montrer où ça décroche", () => {
    expect(r.lines[0]._rowNo).toBe(6);
  });

  it('Le bouton « ⇄ les montants sont inversés » corrige tout d\'un coup (③.5)', () => {
    const inv = _bankReadTable(SHEET_PREAMBULE, { invert: true });
    expect(inv.lines[0].credit).toBe(399.94);
    expect(inv.lines[1].debit).toBe(850);
  });

  it('Le libellé agrège toutes les colonnes texte, sans troncature (I-2)', () => {
    const rows = [
      ['Date', 'Libellé', 'Référence', 'Montant'],
      ['04/08/2026', 'PRLV SEPA EDF', 'RUM-EDF-0099812', -399.94],
      ['05/08/2026', 'VIR DUPONT', 'REF-2026-08', 850],
    ];
    const rr = _bankReadTable(rows);
    expect(rr.lines[0].libelle).toContain('PRLV SEPA EDF');
    expect(rr.lines[0].libelle).toContain('RUM-EDF-0099812');
  });

  it('Une devise étrangère est écartée et signalée, jamais importée à un montant faux', () => {
    const rows = [
      ['Date', 'Libellé', 'Montant'],
      ['04/08/2026', 'ACHAT NY', '1200 USD'],
      ['05/08/2026', 'LOYER', '850,00'],
      ['06/08/2026', 'EDF', '-399,94'],
    ];
    const rr = _bankReadTable(rows);
    expect(rr.discarded.some(d => /USD/.test(d.reason))).toBe(true);
    expect(rr.lines).toHaveLength(2);
  });

  it("Une feuille sans mouvements rend ok:false et un message, plutôt qu'un silence", () => {
    const rr = _bankReadTable([['Note'], ['Contactez votre agence']]);
    expect(rr.ok).toBe(false);
    expect(rr.error).toBeTruthy();
  });

  it("L'empreinte d'une ligne est stable entre deux lectures identiques", () => {
    const a = _bankFingerprintRow('2026-08-04', -399.94, 'PRLV EDF');
    const b = _bankFingerprintRow('2026-08-04', -399.94, '  prlv   edf ');
    expect(a).toBe(b);
    expect(a).not.toBe(_bankFingerprintRow('2026-08-04', -399.95, 'PRLV EDF'));
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ④.2 — L'identifiant de compte vient du préambule, PAS d'un hash d'en-têtes
// ═══════════════════════════════════════════════════════════════════

describe('④.2 _bankExtractSheetAccount — les lignes écartées identifient le compte', () => {
  it('Trouve un IBAN dans le préambule', () => {
    const rows = [['Relevé'], ['IBAN : FR76 3000 4000 0312 3456 7890 143'], ['Date', 'Libellé', 'Montant']];
    const a = _bankExtractSheetAccount(rows, 2);
    expect(a.kind).toBe('iban');
    expect(a.identifier).toBe('iban:FR7630004000031234567890143');
  });

  it('À défaut, trouve un numéro de compte annoncé', () => {
    const a = _bankExtractSheetAccount(SHEET_PREAMBULE, 4);
    expect(a.kind).toBe('compte');
    expect(a.identifier).toBe('cpt:00021234567');
  });

  it('Ne fabrique rien quand le préambule ne dit rien (on demandera à l\'utilisateur)', () => {
    expect(_bankExtractSheetAccount([['Date', 'Libellé', 'Montant']], 0)).toBeNull();
  });

  it('Ne regarde jamais après la ligne d\'en-tête (les mouvements ne sont pas un identifiant)', () => {
    const rows = [['Date', 'Libellé', 'Montant'], ['04/08/2026', 'VIR IBAN FR7630004000031234567890143', 100]];
    expect(_bankExtractSheetAccount(rows, 0)).toBeNull();
  });
});

describe("T-1 — un fichier sans colonne de montant d'opération le dit franchement", () => {
  it("Date + libellé + solde seulement → refus explicite, pas 'montant à 0 €' sur chaque ligne", () => {
    const rows = [
      ['Date', 'Libellé', 'Solde'],
      ['04/08/2026', 'PRLV EDF', '5100,06'],
      ['05/08/2026', 'VIR DUPONT', '5950,06'],
      ['09/08/2026', 'CB COURSES', '5897,76'],
    ];
    const r = _bankReadTable(rows);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/montant d'opération/);
  });
});
