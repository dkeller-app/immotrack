/**
 * bank-compte-reprise.test.js — CHANTIER IMPORT-MOUVEMENTS, étape 2
 * « Compte & reprise ». CDC : docs/CDC-IMPORT.md sections ④ et ⑤.
 *
 * Couvre : bailleur obligatoire (④.1) · garde-fou d'affectation inter-entités (④.1) ·
 * 10 empreintes de reprise (⑤.1) · import rétroactif (⑤.2) ·
 * BUG 2 : le pointeur ne recule jamais.
 */
import { describe, it, expect } from 'vitest';
import {
  _bankAccountBailleurOk, _bankAffectationConflict,
  _bankMigrateAccounts, _BANK_FP_MEMORY,
  _bankSliceAfterFingerprints, _bankIsRetroactive, _bankComputeLastImport,
} from '../../js/core/bank-import.js';

// ═══════════════════════════════════════════════════════════════════
//  ④.1 — Un compte appartient toujours à quelqu'un
// ═══════════════════════════════════════════════════════════════════

describe('④.1 _bankAccountBailleurOk — le bailleur est un fait, pas un filtre', () => {
  it('Un compte sans bailleur n\'est pas complet', () => {
    expect(_bankAccountBailleurOk({ id: 1, label: 'CM' }).ok).toBe(false);
  });

  it('Un compte avec bailleur est complet', () => {
    expect(_bankAccountBailleurOk({ bailleur: 'SCI DES TILLEULS' }).ok).toBe(true);
  });

  it('« Compte mixte — plusieurs bailleurs » est une échappatoire explicite', () => {
    const r = _bankAccountBailleurOk({ mixte: true });
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/mixte/);
  });
});

describe('④.1 _bankAffectationConflict — un mouvement de la SCI X ne part pas chez Y', () => {
  it('Bloque un bien d\'une autre entité, avec un message qui nomme les deux', () => {
    const r = _bankAffectationConflict({ bailleur: 'SCI DES TILLEULS' }, 'SCI DU PARC');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SCI DES TILLEULS');
    expect(r.message).toContain('SCI DU PARC');
  });

  it('Laisse passer la même entité, insensible à la casse et aux accents', () => {
    expect(_bankAffectationConflict({ bailleur: 'SCI dés Tilleuls' }, 'SCI DES TILLEULS').ok).toBe(true);
  });

  it('Un compte mixte ne bloque rien (classement manuel assumé)', () => {
    expect(_bankAffectationConflict({ bailleur: 'SCI A', mixte: true }, 'SCI B').ok).toBe(true);
  });

  it('Une entité cible inconnue ne bloque rien (on n\'invente pas un conflit)', () => {
    expect(_bankAffectationConflict({ bailleur: 'SCI A' }, '').ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ⑤.1 — 10 empreintes, migration douce et idempotente
// ═══════════════════════════════════════════════════════════════════

describe('⑤.1 _bankMigrateAccounts — migration douce du pointeur unique vers 10 empreintes', () => {
  it('Transforme fingerprint en fingerprints[] sans rien perdre', () => {
    const accounts = [{ id: 1, lastImport: { date: '2026-08-31', fingerprint: 'fitid:AAA', count: 12 } }];
    const r = _bankMigrateAccounts(accounts);
    expect(r.migrated).toBe(1);
    expect(accounts[0].lastImport.fingerprints).toEqual(['fitid:AAA']);
    expect(accounts[0].lastImport.date).toBe('2026-08-31');
    expect(accounts[0].lastImport.count).toBe(12);
  });

  it('EST IDEMPOTENTE : deux passages ne changent rien de plus', () => {
    const accounts = [{ id: 1, lastImport: { date: '2026-08-31', fingerprint: 'fitid:AAA' } }];
    _bankMigrateAccounts(accounts);
    const snapshot = JSON.stringify(accounts);
    const second = _bankMigrateAccounts(accounts);
    expect(second.migrated).toBe(0);
    expect(JSON.stringify(accounts)).toBe(snapshot);
  });

  it('Ne touche ni aux comptes supprimés, ni aux comptes jamais importés', () => {
    const accounts = [{ id: 1, _deleted: true }, { id: 2, label: 'neuf' }];
    _bankMigrateAccounts(accounts);
    expect(accounts[1].lastImport).toBeUndefined();
  });
});

describe('⑤.1 _bankSliceAfterFingerprints — une empreinte retrouvée suffit', () => {
  const lines = ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({ date: '2026-08-0' + (i + 1), _fingerprint: k }));

  it('Coupe après la PLUS RÉCENTE des empreintes présentes', () => {
    const r = _bankSliceAfterFingerprints(lines, ['zzz', 'c', 'a']);
    expect(r.found).toBe(true);
    expect(r.matched).toBe('c');
    expect(r.after.map(l => l._fingerprint)).toEqual(['d', 'e']);
  });

  it("Résiste à la disparition de la dernière ligne : l'empreinte d'avant prend le relais", () => {
    const r = _bankSliceAfterFingerprints(lines, ['ligne-effacee', 'b']);
    expect(r.found).toBe(true);
    expect(r.after.map(l => l._fingerprint)).toEqual(['c', 'd', 'e']);
  });

  it('Aucune empreinte retrouvée → tout le fichier est proposé (filet : dédup)', () => {
    const r = _bankSliceAfterFingerprints(lines, ['x', 'y']);
    expect(r.found).toBe(false);
    expect(r.after).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ⑤.2 — BUG 2 : LE POINTEUR NE RECULE JAMAIS
// ═══════════════════════════════════════════════════════════════════

describe('⑤.2 _bankComputeLastImport — bug 2 : le pointeur ne recule jamais', () => {
  const aout = { date: '2026-08-31', fingerprint: 'fp-aout', fingerprints: ['fp-aout'], count: 100 };

  it('BUG 2 — importer JUIN après AOÛT ne fait plus reculer le pointeur', () => {
    const juin = [{ date: '2026-06-10', _fingerprint: 'fp-juin1' }, { date: '2026-06-30', _fingerprint: 'fp-juin2' }];
    const r = _bankComputeLastImport(juin, aout.count, aout);
    expect(r.date).toBe('2026-08-31');          // ← avant : '2026-06-30'
    expect(r.fingerprint).toBe('fp-aout');
  });

  it('Les empreintes du lot rétroactif sont quand même mémorisées', () => {
    const juin = [{ date: '2026-06-30', _fingerprint: 'fp-juin2' }];
    const r = _bankComputeLastImport(juin, aout.count, aout);
    expect(r.fingerprints).toContain('fp-juin2');
    expect(r.fingerprints).toContain('fp-aout');
  });

  it('Un import plus récent fait bien avancer le pointeur', () => {
    const sept = [{ date: '2026-09-15', _fingerprint: 'fp-sept' }];
    const r = _bankComputeLastImport(sept, aout.count, aout);
    expect(r.date).toBe('2026-09-15');
    expect(r.fingerprint).toBe('fp-sept');
    expect(r.fingerprints[0]).toBe('fp-sept');
  });

  it('Mémorise au plus 10 empreintes, les plus récentes en tête', () => {
    let li = null;
    for (let i = 1; i <= 14; i++) {
      li = _bankComputeLastImport([{ date: '2026-08-' + String(i).padStart(2, '0'), _fingerprint: 'fp' + i }], 0, li);
    }
    expect(li.fingerprints).toHaveLength(_BANK_FP_MEMORY);
    expect(li.fingerprints[0]).toBe('fp14');
    expect(li.fingerprints).not.toContain('fp1');
  });

  it('Le compteur cumulé continue de s\'incrémenter', () => {
    const r = _bankComputeLastImport([{ date: '2026-09-01', _fingerprint: 'x' }], 100, aout);
    expect(r.count).toBe(101);
  });

  it('Un lot vide laisse le pointeur intact (jamais de remise à zéro)', () => {
    expect(_bankComputeLastImport([], 100, aout)).toBe(aout);
  });
});

describe('⑤.2 _bankIsRetroactive — accepté et annoncé', () => {
  it('Reconnaît un fichier entièrement antérieur au dernier import', () => {
    const juin = [{ date: '2026-06-01' }, { date: '2026-06-30' }];
    expect(_bankIsRetroactive(juin, { date: '2026-08-31' })).toBe(true);
  });

  it('Un fichier qui déborde après le pointeur n\'est pas rétroactif', () => {
    expect(_bankIsRetroactive([{ date: '2026-09-02' }], { date: '2026-08-31' })).toBe(false);
  });

  it('Sans pointeur (premier import), la question ne se pose pas', () => {
    expect(_bankIsRetroactive([{ date: '2026-06-01' }], null)).toBe(false);
  });
});

describe('AUDIT I1 — un import rétroactif n\'efface pas la mémoire de reprise', () => {
  it('Après juin importé derrière août, les empreintes d\'août sont TOUJOURS là', () => {
    // Sinon l'import de septembre affiche « Reprise non retrouvée » — exactement ce
    // que les 10 empreintes de ⑤.1 devaient supprimer, déclenché par ⑤.2.
    const aout = Array.from({ length: 12 }, (_, i) => ({ date: '2026-08-' + String(i + 1).padStart(2, '0'), _fingerprint: 'aout' + i }));
    let li = _bankComputeLastImport(aout, 0, null);
    const juin = Array.from({ length: 12 }, (_, i) => ({ date: '2026-06-' + String(i + 1).padStart(2, '0'), _fingerprint: 'juin' + i }));
    li = _bankComputeLastImport(juin, li.count, li);
    expect(li.date).toBe('2026-08-12');            // le pointeur ne recule pas (bug 2)
    expect(li.fingerprints[0]).toBe('aout11');     // et la mémoire reste du côté récent
    expect(li.fingerprints).not.toContain('juin11');
  });

  it('Un import qui AVANCE met bien ses empreintes en tête', () => {
    let li = _bankComputeLastImport([{ date: '2026-08-31', _fingerprint: 'a' }], 0, null);
    li = _bankComputeLastImport([{ date: '2026-09-10', _fingerprint: 'b' }], li.count, li);
    expect(li.fingerprints[0]).toBe('b');
    expect(li.fingerprints).toContain('a');
  });
});
