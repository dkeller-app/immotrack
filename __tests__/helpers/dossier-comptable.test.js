import { describe, it, expect } from 'vitest';
import { _buildMvtRows, _toFEC, _csvCell } from '../../js/core/export-comptable.js';
import {
  _dcZipName, _dcFactureDir, _dcExtFromMime, _dcMontantSlug, _dcCatSlug,
  _dcFactureName, _dcResolveDoc, _dcBuildPlan, _dcIndexCsv, _dcApplyFetchFailure
} from '../../js/core/dossier-comptable.js';

const STD_CATS = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Taxe foncière (et taxes annexes)', ligne2044: '227', type: 'charge' }
];

const LOGEMENTS = [
  { ref: 'A2', entity: 'SCI Keller' },
  { ref: 'B1', entity: 'Didier Keller' }
];

const DOCS = [
  { id: 501, name: 'facture-loyer.pdf', mime: 'application/pdf', idbKey: 'k501' },
  { id: 502, name: 'scan', mime: 'image/jpeg', idbKey: 'k502' },
  { id: 503, name: 'perdu.pdf', mime: 'application/pdf' } // ni idbKey ni cloud → binaire perdu
];

const MVTS = [
  { id: 1, date: '2026-01-05', cat: 'Loyers encaissés', cr: 720, qui: 'A2', lib: 'Loyer janv.', pjId: 501 },
  { id: 2, date: '2026-04-18', cat: 'Travaux de réparation et d\'entretien', db: 240, qui: 'A2', lib: 'Entretien', pjId: 502 },
  { id: 3, date: '2026-03-15', cat: 'Travaux de réparation et d\'entretien', db: 180, qui: 'A2', lib: 'Chaudière' }, // sans PJ
  { id: 4, date: '2026-05-11', cat: 'Loyers encaissés', cr: 650, qui: 'B1', lib: 'Loyer mai', pjId: 503 }, // PJ binaire perdu
  { id: 5, date: '2026-06-01', cat: 'Taxe foncière (et taxes annexes)', db: 410, qui: 'SCI:SCI Keller', lib: 'TF acompte' } // global sans lot
];

const ctx = () => ({ documents: DOCS, logements: LOGEMENTS, extractionYmd: '2026-08-28', entityNom: 'Tous', from: '2026-01-01', to: '2026-12-31' });
const plan = () => _dcBuildPlan(_buildMvtRows(MVTS, STD_CATS), ctx());

describe('_dcZipName (décision #1)', () => {
  it('bailleur + date extraction', () => {
    expect(_dcZipName('SCI Keller', '2026-08-28')).toBe('Dossier-comptable_SCI-Keller_2026-08-28.zip');
  });
  it('Tous / vide → Tous-bailleurs', () => {
    expect(_dcZipName('Tous', '2026-08-28')).toBe('Dossier-comptable_Tous-bailleurs_2026-08-28.zip');
    expect(_dcZipName('', '2026-08-28')).toBe('Dossier-comptable_Tous-bailleurs_2026-08-28.zip');
  });
  it('accents retirés', () => {
    expect(_dcZipName('Éric Immobilier', '2026-08-28')).toBe('Dossier-comptable_Eric-Immobilier_2026-08-28.zip');
  });
});

describe('_dcFactureDir (décision #2)', () => {
  it('Bailleur - Lot', () => {
    expect(_dcFactureDir('SCI Keller', 'A2')).toBe('SCI Keller - A2');
  });
  it('sans lot → _general', () => {
    expect(_dcFactureDir('SCI Keller', '')).toBe('SCI Keller - _general');
  });
  it('retire les séparateurs de chemin', () => {
    expect(_dcFactureDir('A/B', 'C\\D')).toBe('A B - C D');
  });
});

describe('_dcExtFromMime — vrai type, jamais forcé .pdf', () => {
  it('nom prioritaire', () => {
    expect(_dcExtFromMime('application/octet-stream', 'photo.JPG')).toBe('.jpg');
  });
  it('repli mime', () => {
    expect(_dcExtFromMime('application/pdf', 'scan')).toBe('.pdf');
    expect(_dcExtFromMime('image/jpeg', 'scan')).toBe('.jpg');
    expect(_dcExtFromMime('image/png', '')).toBe('.png');
  });
});

describe('_dcMontantSlug', () => {
  it('entier sans décimale', () => { expect(_dcMontantSlug(720)).toBe('720'); });
  it('décimale via tiret', () => { expect(_dcMontantSlug(142.5)).toBe('142-5'); });
});

describe('_dcFactureName + collisions', () => {
  it('AAAA-MM-JJ_categorie_montant.ext', () => {
    expect(_dcFactureName('2026-06-02', 'Assurance PNO', 142, '.pdf')).toBe('2026-06-02_assurance-pno_142.pdf');
  });
  it('suffixe _2, _3 sur collision dans un même dossier', () => {
    const used = new Set();
    const a = _dcFactureName('2026-01-05', 'Loyer', 720, '.pdf', used);
    const b = _dcFactureName('2026-01-05', 'Loyer', 720, '.pdf', used);
    const c = _dcFactureName('2026-01-05', 'Loyer', 720, '.pdf', used);
    expect(a).toBe('2026-01-05_loyer_720.pdf');
    expect(b).toBe('2026-01-05_loyer_720_2.pdf');
    expect(c).toBe('2026-01-05_loyer_720_3.pdf');
  });
});

describe('_dcResolveDoc', () => {
  it('pjId → doc avec binaire', () => {
    const r = _dcResolveDoc({ pjId: 501 }, DOCS);
    expect(r.hasBinary).toBe(true);
    expect(r.mime).toBe('application/pdf');
  });
  it('pjId orphelin (doc supprimé) → null', () => {
    expect(_dcResolveDoc({ pjId: 999 }, DOCS)).toBe(null);
  });
  it('doc sans idbKey/cloud → hasBinary false', () => {
    expect(_dcResolveDoc({ pjId: 503 }, DOCS).hasBinary).toBe(false);
  });
  it('legacy dataB64', () => {
    const r = _dcResolveDoc({ pj: { dataB64: 'data:application/pdf;base64,AAAA', name: 'x.pdf', mime: 'application/pdf' } }, DOCS);
    expect(r.legacy).toBe(true);
    expect(r.hasBinary).toBe(true);
  });
  it('aucune PJ → null', () => {
    expect(_dcResolveDoc({}, DOCS)).toBe(null);
  });
});

describe('_dcBuildPlan (décisions #3 #4)', () => {
  it('compteurs mouvements / factures / manquantes', () => {
    const p = plan();
    expect(p.counts.mouvements).toBe(5);
    expect(p.counts.factures).toBe(2);   // 501 (ok) + 502 (ok)
    expect(p.counts.manquantes).toBe(3); // 3 sans PJ, 503 binaire perdu, 5 sans PJ
  });

  it('bailleur/lot résolus depuis les logements', () => {
    const p = plan();
    const r1 = p.rows.find(r => r.num === 1);
    expect(r1.bailleur).toBe('SCI Keller');
    expect(r1.lot).toBe('A2');
    expect(r1.filePath).toBe('factures/SCI Keller - A2/2026-01-05_loyers-encaisses_720.pdf');
  });

  it('mouvement global (SCI:) → _general', () => {
    const p = plan();
    const rg = p.rows.find(r => r.num === 5);
    expect(rg.bailleur).toBe('SCI Keller');
    expect(rg.lot).toBe('_general');
    expect(rg.hasPj).toBe(false);
  });

  it('extension réelle : entretien 502 = .jpg', () => {
    const p = plan();
    const r2 = p.rows.find(r => r.num === 2);
    expect(r2.fileName).toBe('2026-04-18_travaux-de-reparation-et-d-entretien_240.jpg');
  });

  it('pieceRefByNum : nom fichier si présente, M+num si absente', () => {
    const p = plan();
    expect(p.pieceRefByNum[1]).toBe('2026-01-05_loyers-encaisses_720.pdf');
    expect(p.pieceRefByNum[3]).toBe('M3'); // sans PJ
    expect(p.pieceRefByNum[4]).toBe('M4'); // binaire perdu
  });

  it('null-safe', () => {
    const p = _dcBuildPlan(null, ctx());
    expect(p.counts.mouvements).toBe(0);
    expect(p.rows).toEqual([]);
  });
});

describe('_dcIndexCsv (décision #4)', () => {
  it('en-tête daté + colonnes', () => {
    const csv = _dcIndexCsv(plan());
    const lines = csv.split('\n');
    expect(lines[0]).toContain("date d'extraction : 2026-08-28");
    expect(lines[0]).toContain('période : 2026-01-01 → 2026-12-31');
    expect(lines[1]).toBe('ecriture_num,date,bailleur,lot,categorie,libelle,montant,piece_ref,fichier,facture');
  });
  it('ligne présente + ligne ABSENTE', () => {
    const csv = _dcIndexCsv(plan());
    expect(csv).toContain('GL000001,2026-01-05,SCI Keller,A2,Loyers encaissés,Loyer janv.,720.00,2026-01-05_loyers-encaisses_720.pdf');
    expect(csv).toMatch(/GL000003,.*,ABSENTE/);
    expect(csv).toContain('—'); // colonnes fichier vides pour les manquantes
  });
});

describe('_csvCell — garde anti-injection de formule', () => {
  it('préfixe apostrophe sur = + @', () => {
    expect(_csvCell('=1+1')).toBe("'=1+1");
    expect(_csvCell('+cmd')).toBe("'+cmd");
    expect(_csvCell('@x')).toBe("'@x");
  });
  it('préfixe - non suivi d\'un chiffre, mais PAS un nombre négatif', () => {
    expect(_csvCell('-cmd')).toBe("'-cmd");
    expect(_csvCell('-150.00')).toBe('-150.00'); // solde négatif légitime intact
  });
  it('quoting standard virgule/guillemet', () => {
    expect(_csvCell('a,b')).toBe('"a,b"');
    expect(_csvCell('he said "x"')).toBe('"he said ""x"""');
  });
  it('texte normal inchangé', () => {
    expect(_csvCell('Loyer janv.')).toBe('Loyer janv.');
  });
});

describe('_dcApplyFetchFailure — invariant FEC ↔ zip (degrade + recompute)', () => {
  it('dégrade une facture présente : counts, pieceRef, chemins', () => {
    const p = plan();
    const before = { fact: p.counts.factures, manq: p.counts.manquantes };
    const ok = _dcApplyFetchFailure(p, 1); // num 1 = présente
    expect(ok).toBe(true);
    const r = p.rows.find(x => x.num === 1);
    expect(r.hasPj).toBe(false);
    expect(r.fileName).toBe(null);
    expect(r.filePath).toBe(null);
    expect(r.status).toBe('ABSENTE');
    expect(p.pieceRefByNum[1]).toBe('M1');
    expect(p.counts.factures).toBe(before.fact - 1);
    expect(p.counts.manquantes).toBe(before.manq + 1);
  });
  it('idempotent + no-op sur num déjà absent / inconnu', () => {
    const p = plan();
    _dcApplyFetchFailure(p, 1);
    expect(_dcApplyFetchFailure(p, 1)).toBe(false); // déjà dégradée
    expect(_dcApplyFetchFailure(p, 3)).toBe(false); // déjà ABSENTE (sans PJ)
    expect(_dcApplyFetchFailure(p, 999)).toBe(false); // inconnu
  });
  it('après dégradation : index.csv et pieceRef restent cohérents (M+num des 2 côtés)', () => {
    const p = plan();
    _dcApplyFetchFailure(p, 1);
    const csv = _dcIndexCsv(p);
    // la ligne 1 est désormais ABSENTE, piece_ref = M1 (miroir du FEC), fichier = —
    expect(csv).toMatch(/GL000001,.*,M1,—,ABSENTE/);
    // le FEC construit avec ce pieceRefByNum met bien M1 en PieceRef
    const ecr = [{ date: '2026-01-05', num: 1, compte: '411000', libelleCompte: 'x', lib: 'l', qui: 'A2', debit: 720, credit: 0 }];
    const fec = _toFEC(ecr, { pieceRefByNum: p.pieceRefByNum });
    expect(fec.split('\n')[1].split('\t')[8]).toBe('M1');
  });
});

describe('_dcIndexCsv — piece_ref miroir du FEC (m2)', () => {
  it('ligne ABSENTE : piece_ref = M+num (pas —), fichier = —', () => {
    const csv = _dcIndexCsv(plan());
    expect(csv).toMatch(/GL000003,.*,M3,—,ABSENTE/); // mvt 3 sans PJ
  });
});

describe('_toFEC + pieceRefByNum (décision #3, non-régression)', () => {
  it('sans map : PieceRef = M+num (comportement historique)', () => {
    const rows = _buildMvtRows([MVTS[0]], STD_CATS);
    // écritures dérivées pour ce mvt (num=1)
    const ecr = [{ date: '2026-01-05', num: 1, compte: '411000', libelleCompte: 'x', lib: 'l', qui: 'A2', debit: 720, credit: 0 }];
    const fec = _toFEC(ecr);
    expect(fec.split('\n')[1].split('\t')[8]).toBe('M1'); // colonne PieceRef
    expect(rows).toHaveLength(1);
  });
  it('avec map : PieceRef = nom du fichier facture', () => {
    const p = plan();
    const ecr = [{ date: '2026-01-05', num: 1, compte: '411000', libelleCompte: 'x', lib: 'l', qui: 'A2', debit: 720, credit: 0 }];
    const fec = _toFEC(ecr, { pieceRefByNum: p.pieceRefByNum });
    expect(fec.split('\n')[1].split('\t')[8]).toBe('2026-01-05_loyers-encaisses_720.pdf');
  });
});
