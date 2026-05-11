import { describe, it, expect } from 'vitest';
import { _buildEcritures, _buildGrandLivre, _toFEC, _journalToCsv, _grandLivreToCsv } from '../../js/core/export-comptable.js';

const STD_CATS = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Taxe foncière (et taxes annexes)', ligne2044: '227', type: 'charge' },
  { nom: 'Prêt — Intérêts d\'emprunt', ligne2044: '250', type: 'interet' }
];

const MVTS = [
  { date: '2025-01-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-001', lib: 'Loyer janvier' },
  { date: '2025-02-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-001', lib: 'Loyer février' },
  { date: '2025-03-20', cat: 'Travaux de réparation et d\'entretien', db: 200, qui: 'F-001', lib: 'Plomberie' },
  { date: '2025-04-10', cat: 'Taxe foncière (et taxes annexes)', db: 600, qui: 'F-001', lib: 'TF 2025' },
  { date: '2025-05-01', cat: 'Prêt — Intérêts d\'emprunt', db: 150, qui: 'SCI:Mon SCI', lib: 'Intérêts mai' }
];

describe('_buildEcritures', () => {
  it('partie double : 1 mvt = 2 écritures', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    expect(ecr).toHaveLength(MVTS.length * 2);
  });

  it('équilibre débit = crédit par numéro d\'écriture', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const byNum = {};
    ecr.forEach(e => {
      if (!byNum[e.num]) byNum[e.num] = { d: 0, c: 0 };
      byNum[e.num].d += e.debit;
      byNum[e.num].c += e.credit;
    });
    Object.values(byNum).forEach(({ d, c }) => {
      expect(d).toBe(c);
    });
  });

  it('loyer : crédit compte 706000 + débit compte 411000', () => {
    const ecr = _buildEcritures([MVTS[0]], STD_CATS);
    const credit = ecr.find(e => e.credit === 800);
    const debit = ecr.find(e => e.debit === 800);
    expect(credit.compte).toBe('706000');
    expect(debit.compte).toBe('411000');
  });

  it('travaux : débit compte 615200 + crédit compte 401000', () => {
    const ecr = _buildEcritures([MVTS[2]], STD_CATS);
    const debit = ecr.find(e => e.debit === 200);
    const credit = ecr.find(e => e.credit === 200);
    expect(debit.compte).toBe('615200');
    expect(credit.compte).toBe('401000');
  });

  it('intérêts emprunt : débit 661100', () => {
    const ecr = _buildEcritures([MVTS[4]], STD_CATS);
    const debit = ecr.find(e => e.debit === 150);
    expect(debit.compte).toBe('661100');
  });

  it('filtre par date', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS, { from: '2025-03-01', to: '2025-04-30' });
    // 2 mvts dans la fenêtre → 4 écritures
    expect(ecr).toHaveLength(4);
  });

  it('skip catégorie non mappée', () => {
    const mvts = [{ date: '2025-01-15', cat: 'Custom inconnue', cr: 500, qui: 'F-001' }];
    expect(_buildEcritures(mvts, STD_CATS)).toHaveLength(0);
  });

  it('null safe', () => {
    expect(_buildEcritures(null, STD_CATS)).toEqual([]);
    expect(_buildEcritures([], null)).toEqual([]);
  });
});

describe('_buildGrandLivre', () => {
  it('groupe par compte avec totaux', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const gl = _buildGrandLivre(ecr);
    expect(gl.length).toBeGreaterThan(0);
    // Compte 706000 : 2 loyers = 1600€ crédit
    const c706 = gl.find(c => c.compte === '706000');
    expect(c706.totalCredit).toBe(1600);
    expect(c706.totalDebit).toBe(0);
    expect(c706.solde).toBe(-1600);
  });

  it('compte 411 : reçoit tous les loyers en débit', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const gl = _buildGrandLivre(ecr);
    const c411 = gl.find(c => c.compte === '411000');
    expect(c411.totalDebit).toBe(1600);
  });

  it('triés par compte ascendant', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const gl = _buildGrandLivre(ecr);
    for (let i = 1; i < gl.length; i++) {
      expect(gl[i].compte >= gl[i-1].compte).toBe(true);
    }
  });
});

describe('_toFEC', () => {
  it('header FEC officiel 18 colonnes tab-séparé', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const fec = _toFEC(ecr);
    const firstLine = fec.split('\n')[0];
    const cols = firstLine.split('\t');
    expect(cols).toHaveLength(18);
    expect(cols[0]).toBe('JournalCode');
    expect(cols[1]).toBe('JournalLib');
    expect(cols[2]).toBe('EcritureNum');
    expect(cols[4]).toBe('CompteNum');
    expect(cols[10]).toBe('EcritureLib');
    expect(cols[11]).toBe('Debit');
    expect(cols[12]).toBe('Credit');
  });

  it('date format YYYYMMDD', () => {
    const ecr = _buildEcritures([MVTS[0]], STD_CATS);
    const fec = _toFEC(ecr);
    const dataLine = fec.split('\n')[1];
    const cols = dataLine.split('\t');
    expect(cols[3]).toBe('20250115');
  });

  it('montants format virgule décimale (FR)', () => {
    const ecr = _buildEcritures([MVTS[0]], STD_CATS);
    const fec = _toFEC(ecr);
    expect(fec).toContain('800,00');
    expect(fec).not.toContain('800.00');
  });

  it('EcritureNum format GL000001', () => {
    const ecr = _buildEcritures([MVTS[0]], STD_CATS);
    const fec = _toFEC(ecr);
    expect(fec).toContain('GL000001');
  });

  it('échappe tab/newline dans libellé', () => {
    const ecr = [{ date: '2025-01-15', num: 1, compte: '706000', libelleCompte: 'Test', lib: 'avec\ttab\nfin', debit: 0, credit: 100 }];
    const fec = _toFEC(ecr);
    expect(fec.split('\n')).toHaveLength(2); // pas de newline injectée
    expect(fec.split('\n')[1].split('\t')).toHaveLength(18); // pas de tab injecté
  });

  it('null safe', () => {
    const fec = _toFEC(null);
    expect(fec.split('\n')[0]).toContain('JournalCode');
  });
});

describe('_journalToCsv', () => {
  it('produit CSV avec header standard', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const csv = _journalToCsv(ecr);
    expect(csv.split('\n')[0]).toBe('date,num,compte,libelle_compte,tier,libelle,debit,credit');
    expect(csv.split('\n').length).toBe(ecr.length + 1);
  });

  it('escape virgules dans libellé', () => {
    const ecr = [{ date: '2025-01-15', num: 1, compte: '706000', libelleCompte: 'Test', lib: 'Loyer, janv', qui: '', debit: 0, credit: 100 }];
    const csv = _journalToCsv(ecr);
    expect(csv).toContain('"Loyer, janv"');
  });
});

describe('_grandLivreToCsv', () => {
  it('produit CSV avec solde progressif + totaux', () => {
    const ecr = _buildEcritures(MVTS, STD_CATS);
    const gl = _buildGrandLivre(ecr);
    const csv = _grandLivreToCsv(gl);
    expect(csv.split('\n')[0]).toBe('compte,libelle_compte,date,piece,libelle,debit,credit,solde_progression');
    expect(csv).toContain('TOTAL'); // lignes totaux
  });
});
