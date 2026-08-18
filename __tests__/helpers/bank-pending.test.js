// ⑧.1 v2 (SMOKE 14/08, décision user) — « il faut pouvoir valider et garder en mémoire ».
// Les lignes non prêtes ne bloquent plus l'import : snapshot + fusion à la reprise.
import { describe, it, expect } from 'vitest';
import { _bankPendingSnapshot, _bankMergePendingLines } from '../../js/core/bank-import.js';

describe('_bankPendingSnapshot — ⑧.1 v2', () => {
  const line = {
    date: '2026-07-10', libelle: 'FACT SGT26014000006013 DONT TVA', debit: 9.14, credit: 0,
    signedAmount: -9.14, _fingerprint: 'fp1', fitid: 'F1', _importSource: 'ofx',
    suggestedCat: 'Frais bancaires', suggestedQui: '', suggestedImm: '', suggestedCc: '',
    confidence: 0.72, matchSource: 'Mot-clé', _gerance: false,
    _userExclude: false, _reviewed: false, _userEdited: true, _affConflit: 'x',
  };
  it('garde la donnée bancaire et la saisie non validée', () => {
    const s = _bankPendingSnapshot(line);
    expect(s.date).toBe('2026-07-10');
    expect(s._fingerprint).toBe('fp1');
    expect(s.suggestedCat).toBe('Frais bancaires');
    expect(s._pending).toBe(true);
  });
  it('retire les drapeaux transitoires — sinon les règles créées entre-temps ne s\'appliqueraient plus à la reprise', () => {
    const s = _bankPendingSnapshot(line);
    expect(s._userEdited).toBeUndefined();
    expect(s._reviewed).toBeUndefined();
    expect(s._userExclude).toBeUndefined();
    expect(s._affConflit).toBeUndefined();
  });
  it('conserve un découpage non équilibré en cours', () => {
    const s = _bankPendingSnapshot({ date: 'd', libelle: 'l', _sp: [{ sens: 'cr', montant: 5 }] });
    expect(s._sp).toHaveLength(1);
  });
  it('null → null', () => { expect(_bankPendingSnapshot(null)).toBeNull(); });
});

describe('_bankMergePendingLines — ⑧.1 v2', () => {
  const file = [{ libelle: 'A', _fingerprint: 'fpA' }, { libelle: 'B', _fingerprint: 'fpB' }];
  it('ajoute les lignes en attente absentes du fichier, marquées _pending', () => {
    const out = _bankMergePendingLines(file, [{ libelle: 'C', _fingerprint: 'fpC' }]);
    expect(out).toHaveLength(3);
    expect(out[2]._pending).toBe(true);
    expect(out[0]._pending).toBeUndefined();          // les lignes du fichier ne sont pas marquées
  });
  it('le fichier GAGNE quand il recontient une ligne en attente (dédup par empreinte)', () => {
    const out = _bankMergePendingLines(file, [{ libelle: 'A (stock périmé)', _fingerprint: 'fpA' }]);
    expect(out).toHaveLength(2);
    expect(out[0].libelle).toBe('A');
  });
  it('idempotent : re-fusionner le même stock n\'ajoute rien (reclassement en cours de revue)', () => {
    const once = _bankMergePendingLines(file, [{ libelle: 'C', _fingerprint: 'fpC' }]);
    const twice = _bankMergePendingLines(once, [{ libelle: 'C', _fingerprint: 'fpC' }]);
    expect(twice).toHaveLength(3);
  });
  it('reprise SANS fichier : fusion sur base vide', () => {
    const out = _bankMergePendingLines([], [{ libelle: 'C', _fingerprint: 'fpC' }]);
    expect(out).toHaveLength(1);
    expect(out[0]._pending).toBe(true);
  });
  it('une ligne en attente sans empreinte est toujours reprise', () => {
    const out = _bankMergePendingLines(file, [{ libelle: 'D' }]);
    expect(out).toHaveLength(3);
  });
});
