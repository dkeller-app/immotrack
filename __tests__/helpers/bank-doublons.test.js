/**
 * bank-doublons.test.js — CHANTIER IMPORT-MOUVEMENTS, étape 3 « Doublons ».
 * CDC : docs/CDC-IMPORT.md section ⑥.
 *
 * ⑥.1 le FITID est la stratégie n° 1 en OFX, et tranche dans les DEUX sens.
 * ⑥.2 doublons certains écartés en silence · doublons probables à trancher,
 *     qui BLOQUENT la validation tant qu'ils ne le sont pas.
 */
import { describe, it, expect } from 'vitest';
import { _bankDedup, _bankUndecidedDuplicates, _bankIsAutomatable } from '../../js/core/bank-import.js';

const mv = (o) => ({ id: 1, date: '2026-08-05', lib: 'X', db: 0, cr: 0, _source: 'bank_import', ...o });

describe('⑥.1 FITID — stratégie n° 1 en OFX, tranche dans les deux sens', () => {
  it('MÊME FITID = doublon CERTAIN, même si la banque a retouché le libellé', () => {
    // Cas réel : « VIR EN COURS » réémis en « VIR DUPONT DEFINITIF » → empreinte
    // différente, mais la banque dit que c'est la même opération.
    const base = [mv({ id: 7, lib: 'VIR EN COURS', cr: 850, fitid: 'TX-2026-0805-01', _fingerprint: 'fitid:TX-2026-0805-01' })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR DUPONT DEFINITIF', debit: 0, credit: 850, fitid: 'TX-2026-0805-01', _fingerprint: 'fitid:TX-2026-0805-01' }], base);
    expect(r[0].isDuplicate).toBe(true);
    expect(r[0].dupLevel).toBe('certain');
    expect(r[0].duplicateOf).toBe('7');
    expect(r[0].duplicateReason).toMatch(/FITID/);
  });

  it('FITID DIFFÉRENT = PAS un doublon, même à date et montant identiques', () => {
    // Deux vrais loyers de 850 € le même jour, deux locataires : la banque leur donne
    // deux identifiants → aucune raison d'en faire disparaître un.
    const base = [mv({ id: 7, cr: 850, fitid: 'TX-A', _fingerprint: 'fitid:TX-A' })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR MARTIN', debit: 0, credit: 850, fitid: 'TX-B', _fingerprint: 'fitid:TX-B' }], base);
    expect(r[0].isDuplicate).toBe(false);
  });

  it('Le FITID tranche AVANT l\'empreinte (il ne passe plus en second rang)', () => {
    const base = [mv({ id: 7, cr: 850, fitid: 'TX-A' })];   // pas d'empreinte stockée
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'L', debit: 0, credit: 850, fitid: 'TX-A' }], base);
    expect(r[0].dupLevel).toBe('certain');
    expect(r[0].duplicateReason).toMatch(/FITID/);
  });

  it("La preuve négative du FITID n'est utilisée QUE si la base porte des FITID", () => {
    // Base 100 % Excel / saisie manuelle : l'absence de FITID correspondant ne prouve
    // rien — on doit retomber sur la ressemblance, pas déclarer « pas un doublon ».
    const base = [mv({ id: 7, cr: 850 })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'L', debit: 0, credit: 850, fitid: 'TX-NEUF' }], base);
    expect(r[0].isDuplicate).toBe(true);
    expect(r[0].dupLevel).toBe('probable');
  });
});

describe('⑥.2 Deux niveaux : certains écartés en silence, probables à trancher', () => {
  it('Empreinte identique (Excel) = doublon CERTAIN', () => {
    const base = [mv({ id: 9, cr: 850, _fingerprint: 'abc123' })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'L', debit: 0, credit: 850, _fingerprint: 'abc123' }], base);
    expect(r[0].dupLevel).toBe('certain');
  });

  it('Ressemblance (date ±3 j + montant ±1 €) = PROBABLE, jamais écarté d\'office', () => {
    const base = [mv({ id: 9, date: '2026-08-05', cr: 850, _fingerprint: 'aaa' })];
    const r = _bankDedup([{ date: '2026-08-07', libelle: 'VIR MARTIN', debit: 0, credit: 850, _fingerprint: 'bbb' }], base);
    expect(r[0].isDuplicate).toBe(true);
    expect(r[0].dupLevel).toBe('probable');
  });

  it('Relevé déjà importé PUIS DÉCOUPÉ = probable (somme des parts du jour)', () => {
    const base = [
      mv({ id: 1, date: '2026-08-05', cr: 850 }),
      mv({ id: 2, date: '2026-08-05', cr: 720 }),
      mv({ id: 3, date: '2026-08-05', db: 120 }),
    ];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR GERANCE', debit: 0, credit: 1450, _fingerprint: 'zz' }], base);
    expect(r[0].dupLevel).toBe('probable');
    expect(r[0].duplicateReason).toMatch(/découpé/);
  });

  it('Au-delà des tolérances, ce n\'est pas un doublon', () => {
    const base = [mv({ id: 9, date: '2026-08-01', cr: 850 })];
    const r = _bankDedup([{ date: '2026-08-20', libelle: 'L', debit: 0, credit: 850 }], base);
    expect(r[0].isDuplicate).toBe(false);
  });

  it('Un mouvement supprimé (tombstone) ne fait pas doublon', () => {
    const base = [mv({ id: 9, cr: 850, _fingerprint: 'abc', _deleted: true })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'L', debit: 0, credit: 850, _fingerprint: 'abc' }], base);
    expect(r[0].isDuplicate).toBe(false);
  });
});

describe('⑧.1 _bankUndecidedDuplicates — un probable non tranché bloque la validation', () => {
  const lines = [
    { isDuplicate: true, dupLevel: 'certain' },
    { isDuplicate: true, dupLevel: 'probable' },
    { isDuplicate: false },
  ];

  it('Un doublon CERTAIN ne bloque rien : il est écarté sans clic', () => {
    expect(_bankUndecidedDuplicates([lines[0], lines[2]])).toBe(0);
  });

  it('Un doublon PROBABLE non tranché bloque', () => {
    expect(_bankUndecidedDuplicates(lines)).toBe(1);
  });

  it('« Importer quand même » le débloque', () => {
    expect(_bankUndecidedDuplicates([{ isDuplicate: true, dupLevel: 'probable', _userKeep: true }])).toBe(0);
  });

  it('« Confirmer le doublon » le débloque aussi', () => {
    expect(_bankUndecidedDuplicates([{ isDuplicate: true, dupLevel: 'probable', _dupConfirmed: true }])).toBe(0);
  });

  it('Une ligne exclue à la main ne bloque plus', () => {
    expect(_bankUndecidedDuplicates([{ isDuplicate: true, dupLevel: 'probable', _userExclude: true }])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  R-B v2 / BUG 10 — « Reconnus » = règles uniquement
// ═══════════════════════════════════════════════════════════════════

describe('R-B v2 _bankIsAutomatable — bug 10 : une proposition ne classe jamais seule', () => {
  const base = { date: '2026-08-05' };

  it('BUG 10 — une ligne complétée par une PROPOSITION reste à compléter', () => {
    // Avant : catégorie + bien remplis suffisaient à basculer en « Reconnus »,
    // même quand c'était l'heuristique qui les avait posés.
    expect(_bankIsAutomatable({ ...base, suggestedCat: 'Loyers encaissés', suggestedQui: 'FER-001', _byRule: false })).toBe(false);
  });

  it('Une ligne classée par une RÈGLE est automatisable', () => {
    expect(_bankIsAutomatable({ ...base, _byRule: true })).toBe(true);
  });

  it("Une ligne validée ou éditée par l'utilisateur est automatisable", () => {
    expect(_bankIsAutomatable({ ...base, _reviewed: true })).toBe(true);
    expect(_bankIsAutomatable({ ...base, _userEdited: true })).toBe(true);
  });

  it('Un découpage est un acte de l\'utilisateur', () => {
    expect(_bankIsAutomatable({ ...base, _sp: [{ montant: 10 }] })).toBe(true);
  });

  it('Sans date, jamais automatisable (la synchro rejetterait le mouvement en silence)', () => {
    expect(_bankIsAutomatable({ date: '', _byRule: true })).toBe(false);
  });

  it('Un conflit de règles non arbitré bloque (⑦.2)', () => {
    expect(_bankIsAutomatable({ ...base, _byRule: true, _ruleConflicts: [{ field: 'cat', rules: [{}, {}] }] })).toBe(false);
  });

  it('Une proposition ambiguë bloque (⑦.5 b)', () => {
    expect(_bankIsAutomatable({ ...base, _reviewed: true, _ambiguous: true })).toBe(false);
  });

  it('Une DATE DOUTEUSE ne bloque PAS (⑧.1) — elle reste signalée par son badge', () => {
    expect(_bankIsAutomatable({ ...base, _byRule: true, _dateDouteuse: 'date éloignée…' })).toBe(true);
  });
});

describe('⑥.1 Le FITID n\'est unique QUE chez une banque — index limité au compte', () => {
  it('Un même FITID sur un AUTRE compte ne fait pas doublon certain', () => {
    // Deux banques peuvent émettre « 000000001 ». Sans filtrage par compte, une
    // opération légitime serait écartée comme doublon certain, sans un clic.
    const base = [mv({ id: 7, cr: 850, fitid: '000000001', _bankAccountId: 1 })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR AUTRE BANQUE', debit: 0, credit: 500, fitid: '000000001' }],
      base, { accountId: 2 });
    expect(r[0].dupLevel).not.toBe('certain');
  });

  it('Sur le MÊME compte, le FITID tranche toujours', () => {
    const base = [mv({ id: 7, cr: 850, fitid: '000000001', _bankAccountId: 1 })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'X', debit: 0, credit: 850, fitid: '000000001' }],
      base, { accountId: 1 });
    expect(r[0].dupLevel).toBe('certain');
  });

  it('Les mouvements legacy sans compte restent reconnus (aucune régression de dédup)', () => {
    const base = [mv({ id: 7, cr: 850, fitid: 'TX-A' })];   // importé avant le suivi par compte
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'X', debit: 0, credit: 850, fitid: 'TX-A' }],
      base, { accountId: 3 });
    expect(r[0].dupLevel).toBe('certain');
  });
});

describe('AUDIT C2 — la preuve négative du FITID ne vaut que face à un FITID', () => {
  it('Une période importée en Excel puis recouverte par un OFX N\'EST PAS comptée deux fois', () => {
    // Base mixte : un mouvement Excel (sans fitid) + un mouvement OFX (avec fitid) sur
    // le même compte. La ligne OFX au FITID inconnu doit rester confrontée à l'empreinte
    // et à l'heuristique — sinon l'argent est compté deux fois, sans un mot.
    const base = [
      mv({ id: 1, date: '2026-08-05', cr: 850, _bankAccountId: 1 }),                  // importé en Excel
      mv({ id: 2, date: '2026-08-20', db: 40, fitid: 'TX-Z', _bankAccountId: 1 }),    // importé en OFX
    ];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR LOYER', debit: 0, credit: 850, fitid: 'TX-NEUF' }],
      base, { accountId: 1 });
    expect(r[0].isDuplicate).toBe(true);
    expect(r[0].dupLevel).toBe('probable');
  });

  it('Face à un mouvement qui PORTE un autre FITID, la preuve négative joue', () => {
    const base = [mv({ id: 1, date: '2026-08-05', cr: 850, fitid: 'TX-A', _bankAccountId: 1 })];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR AUTRE LOCATAIRE', debit: 0, credit: 850, fitid: 'TX-B' }],
      base, { accountId: 1 });
    expect(r[0].isDuplicate).toBe(false);
  });
});

describe('AUDIT I5 — la somme des parts du jour est scopée au compte importé', () => {
  it("Les parts d'un AUTRE compte ne bloquent plus la validation", () => {
    const base = [
      mv({ id: 1, date: '2026-08-05', cr: 850, _bankAccountId: 2 }),
      mv({ id: 2, date: '2026-08-05', cr: 600, _bankAccountId: 2 }),
    ];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR GERANCE', debit: 0, credit: 1450, _fingerprint: 'zz' }],
      base, { accountId: 1 });
    expect(r[0].isDuplicate).toBe(false);
  });

  it('Sur le même compte, la détection du relevé découpé joue toujours', () => {
    const base = [
      mv({ id: 1, date: '2026-08-05', cr: 850, _bankAccountId: 1 }),
      mv({ id: 2, date: '2026-08-05', cr: 600, _bankAccountId: 1 }),
    ];
    const r = _bankDedup([{ date: '2026-08-05', libelle: 'VIR GERANCE', debit: 0, credit: 1450, _fingerprint: 'zz' }],
      base, { accountId: 1 });
    expect(r[0].dupLevel).toBe('probable');
  });
});
