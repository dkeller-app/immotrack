/**
 * bank-regles-refonte.test.js — REGLES-REFONTE (lot D, maquettes validées le 06/10).
 * Sujet : docs/subjects/RETOURS-2026-10-05.md (lot D + « Décisions Didier du 06/10 »),
 * comportement attendu : mockups/REGLES-REFONTE/README.md, CDC : docs/CDC-IMPORT.md §⑦.
 *
 * Phase 3 = module pur (js/core/bank-import.js) : modèle refondu, correspondance par mots,
 * compte strict, condition de montant, exceptions, migration, doublons, identité par id,
 * tombstone par id, aperçu, mots du libellé. Le branchement de l'interface est la phase 6.
 */
import { describe, it, expect } from 'vitest';
import {
  _bankRuleMatch, _bankApplyRules, _bankRulePreview,
  _bankRuleIsV2, _bankRuleLineKey, _bankRuleMotif, _bankMotsDuLibelle,
  _bankRuleBuild, _bankRuleToDraft, _bankRuleAddException, _bankRuleRemoveException,
  _bankMigrateRules, _bankRuleIdxById, _bankRuleById, _bankRuleFindForTrace,
  _bankRuleTombstone, _bankRulesMergeById, _bankRuleExactDuplicate,
  _bankRulesDuplicates, _bankRulesFuse, _bankRuleApercu, _bankRuleNewId,
  _bankFingerprintRow,
} from '../../js/core/bank-import.js';

const NOW = '2026-10-06T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_test_' + (++_n);

const L = (libelle, montant, extra = {}) => Object.assign({
  libelle, date: '2026-09-15', credit: montant > 0 ? montant : 0, debit: montant < 0 ? -montant : 0,
}, extra);

/** Règle refondue construite par le module (comme le fera la fenêtre). */
const R = (draft) => {
  const b = _bankRuleBuild(Object.assign({ compte: 'CIC' }, draft), { newId, now: NOW });
  if (!b.ok) throw new Error('règle invalide : ' + b.errors.join(','));
  return b.rule;
};

// ═══════════════════════════════════════════════════════════════════
//  Correspondance : tous les mots, sans ordre, casse/accents ignorés
// ═══════════════════════════════════════════════════════════════════

describe('Correspondance — mots choisis', () => {
  it('Tous les mots doivent figurer, SANS ordre ni adjacence', () => {
    const r = R({ mots: ['SYNDIC', 'SARAR'] });
    expect(_bankRuleMatch(r, L('VIR SARAR GESTION SYNDIC T3', -150), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SYNDIC SARAR', -150), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SARAR T3', -150), 'CIC')).toBe(false);   // un mot manque
  });

  it('Casse et accents ignorés, des deux côtés', () => {
    const r = R({ mots: ['Société', 'EAUX'] });
    expect(_bankRuleMatch(r, L('PRLV SEPA SOCIETE DES eaux', -40), 'CIC')).toBe(true);
    const r2 = R({ mots: ['SOCIETE'] });
    expect(_bankRuleMatch(r2, L('prlv société générale', -40), 'CIC')).toBe(true);
  });

  it('Une puce cochée est un MOT ENTIER (frontière de mot)', () => {
    const r = R({ mots: ['EDF'] });
    expect(_bankRuleMatch(r, L('PRLV EDF CLIENTS', -80), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('PRLV EDF-CLIENTS', -80), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('PRLV REDFORD', -80), 'CIC')).toBe(false);
    const marc = R({ mots: ['MARC'] });
    expect(_bankRuleMatch(marc, L('CB SUPERMARCHE', -30), 'CIC')).toBe(false);
  });

  it('Un mot saisi (« + mot ») est un MORCEAU de mot', () => {
    const r = R({ motsLibres: ['ELEC'] });
    expect(_bankRuleMatch(r, L('PRLV ELECTRICITE DE STRASBOURG', -60), 'CIC')).toBe(true);
    const mix = R({ mots: ['ES'], motsLibres: ['STRAS'] });
    expect(_bankRuleMatch(mix, L('PRLV ES ENERGIES STRASBOURG', -60), 'CIC')).toBe(true);
    expect(_bankRuleMatch(mix, L('PRLV ESSENCE STRASBOURG', -60), 'CIC')).toBe(false); // « ES » mot entier
  });

  it('Le sens s\'applique toujours', () => {
    const r = R({ mots: ['EDF'], sens: 'db' });
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('REMB EDF TROP PERCU', 42), 'CIC')).toBe(false);
  });

  it('Une règle sans aucun mot, supprimée, ou une ligne vide ne matchent jamais', () => {
    expect(_bankRuleMatch({ id: 'x', mots: [], motsLibres: [], compte: 'CIC' }, L('EDF', -1), 'CIC')).toBe(false);
    expect(_bankRuleMatch(Object.assign(R({ mots: ['EDF'] }), { _deleted: true }), L('EDF', -1), 'CIC')).toBe(false);
    expect(_bankRuleMatch(R({ mots: ['EDF'] }), L('', -1), 'CIC')).toBe(false);
    expect(_bankRuleMatch(R({ mots: ['EDF'] }), null, 'CIC')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Compte : une règle ne s'applique JAMAIS à un autre compte
// ═══════════════════════════════════════════════════════════════════

describe('Compte strict (corrige bank-import.js:848-856)', () => {
  it('Compte différent → jamais appliquée', () => {
    const r = R({ mots: ['EDF'], compte: 'CIC' });
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), 'BPOP')).toBe(false);
  });

  it('Compte inconnu (import sans compte, mouvement manuel) → jamais appliquée', () => {
    const r = R({ mots: ['EDF'] });
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), undefined)).toBe(false);
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), '')).toBe(false);
  });

  it('Une règle refondue sans compte ne s\'applique nulle part (jamais « tous les comptes »)', () => {
    const r = { id: 'x', mots: ['EDF'], motsLibres: [], compte: '' };
    expect(_bankRuleMatch(r, L('PRLV EDF', -80), 'CIC')).toBe(false);
  });

  it('CAS RÉEL — deux règles même motif, comptes différents : aucune confusion', () => {
    const cic = R({ mots: ['ICARUS'], compte: 'CIC', cat: 'Frais de gestion / honoraires / comptabilité', qui: 'SCI:Dupont' });
    const ca = R({ mots: ['ICARUS'], compte: 'CA', cat: 'Frais de gestion / honoraires / comptabilité', qui: 'SCI:Keller' });
    const rules = [cic, ca];
    const ligne = L('PRLV ICARUS EXPERTISE COMPTABLE', -240);
    const surCic = _bankApplyRules(rules, ligne, { accountId: 'CIC' });
    expect(surCic.matched).toEqual([cic]);
    expect(surCic.conflicts).toHaveLength(0);
    expect(surCic.aff.qui).toBe('SCI:Dupont');
    const surCa = _bankApplyRules(rules, ligne, { accountId: 'CA' });
    expect(surCa.matched).toEqual([ca]);
    expect(surCa.aff.qui).toBe('SCI:Keller');
    // Identité : chacune se retrouve par son id, plus par son motif.
    expect(cic.id).not.toBe(ca.id);
    expect(_bankRuleById(rules, ca.id)).toBe(ca);
    expect(_bankRuleIdxById(rules, cic.id)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Règles historiques : comportement EXACT d'avant
// ═══════════════════════════════════════════════════════════════════

describe('Règles historiques — inchangées tant qu\'elles ne sont pas réenregistrées', () => {
  const hist = { pattern: 'EDF CLIENTS', sens: '', compte: '', cat: 'Charges récupérables (eau, énergie…)' };

  it('Restent en sous-chaîne CONTIGUË (pas « tous les mots sans ordre »)', () => {
    expect(_bankRuleIsV2(hist)).toBe(false);
    expect(_bankRuleMatch(hist, L('PRLV EDF CLIENTS PARTICULIERS', -80), 'CIC')).toBe(true);
    expect(_bankRuleMatch(hist, L('PRLV CLIENTS EDF', -80), 'CIC')).toBe(false);
    expect(_bankRuleMatch({ pattern: 'ELEC' }, L('ELECTRICITE', -1), 'X')).toBe(true);   // morceau de mot
  });

  it('Compte vide = tous les comptes, y compris compte inconnu', () => {
    for (const acc of ['CIC', 'CA', undefined, '']) {
      expect(_bankRuleMatch(hist, L('PRLV EDF CLIENTS', -80), acc)).toBe(true);
    }
  });

  it('Après migration (id + badge), le comportement est IDENTIQUE', () => {
    const rules = [Object.assign({}, hist)];
    _bankMigrateRules(rules, { now: NOW });
    const m = rules[0];
    expect(m.id).toBeTruthy();
    expect(m.compteAChoisir).toBe(true);
    expect(_bankRuleIsV2(m)).toBe(false);
    for (const [lib, acc, attendu] of [
      ['PRLV EDF CLIENTS PARTICULIERS', 'CIC', true], ['PRLV EDF CLIENTS', 'CA', true],
      ['PRLV CLIENTS EDF', 'CIC', false], ['PRLV EDF CLIENTS', undefined, true],
    ]) {
      expect(_bankRuleMatch(m, L(lib, -80), acc)).toBe(_bankRuleMatch(hist, L(lib, -80), acc));
      expect(_bankRuleMatch(m, L(lib, -80), acc)).toBe(attendu);
    }
  });

  it('Historique liée à un compte : reste limitée à ce compte (BUG 8 déjà corrigé)', () => {
    const r = { pattern: 'EDF', compte: 'A' };
    expect(_bankRuleMatch(r, L('EDF', -1), 'A')).toBe(true);
    expect(_bankRuleMatch(r, L('EDF', -1), 'B')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Condition de montant
// ═══════════════════════════════════════════════════════════════════

describe('Condition de montant', () => {
  it('Montant exact (au centime)', () => {
    const r = R({ mots: ['SARAR'], montant: { type: 'exact', valeur: 150 } });
    expect(_bankRuleMatch(r, L('VIR SARAR', -150), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SARAR', -150.01), 'CIC')).toBe(false);
    expect(_bankRuleMatch(r, L('VIR SARAR', -4583.03), 'CIC')).toBe(false);
  });

  it('Plage (bornes incluses, une borne peut manquer)', () => {
    const r = R({ mots: ['SARAR'], montant: { type: 'plage', min: 100, max: 200 } });
    expect(_bankRuleMatch(r, L('VIR SARAR', -100), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SARAR', -200), 'CIC')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SARAR', -4583.03), 'CIC')).toBe(false);
    const max = R({ mots: ['SARAR'], montant: { type: 'plage', min: '', max: '500' } });
    expect(_bankRuleMatch(max, L('VIR SARAR', -150), 'CIC')).toBe(true);
    expect(_bankRuleMatch(max, L('VIR SARAR', -4583.03), 'CIC')).toBe(false);
  });

  describe('« = loyer CC » — valeur FOURNIE par l\'appelant', () => {
    const r = R({ mots: ['MARTIN'], sens: 'cr', qui: 'FER-101', cat: 'Loyers encaissés', montant: { type: 'loyerCC' } });

    it('Valeur fournie : égal → matche, différent → non', () => {
      const vus = [];
      const loyerCC = (qui, ym) => { vus.push([qui, ym]); return 680; };
      expect(_bankRuleMatch(r, L('VIR M MARTIN LOYER', 680), 'CIC', { loyerCC })).toBe(true);
      expect(_bankRuleMatch(r, L('VIR M MARTIN LOYER', 650), 'CIC', { loyerCC })).toBe(false);
      // le module interroge l'appelant avec le logement affecté et le mois de la ligne
      expect(vus[0]).toEqual(['FER-101', '2026-09']);
    });

    it('Valeur absente (pas de callback, null, NaN, exception) → ne matche pas, ne plante pas', () => {
      const ligne = L('VIR M MARTIN LOYER', 680);
      expect(_bankRuleMatch(r, ligne, 'CIC')).toBe(false);
      expect(_bankRuleMatch(r, ligne, 'CIC', {})).toBe(false);
      expect(_bankRuleMatch(r, ligne, 'CIC', { loyerCC: () => null })).toBe(false);
      expect(_bankRuleMatch(r, ligne, 'CIC', { loyerCC: () => undefined })).toBe(false);
      expect(_bankRuleMatch(r, ligne, 'CIC', { loyerCC: () => 'abc' })).toBe(false);
      expect(_bankRuleMatch(r, ligne, 'CIC', { loyerCC: () => { throw new Error('pas de bail'); } })).toBe(false);
    });

    it('Recette uniquement : une dépense du même montant ne matche jamais', () => {
      const r2 = Object.assign({}, r, { sens: '' });
      expect(_bankRuleMatch(r2, L('MARTIN', -680), 'CIC', { loyerCC: () => 680 })).toBe(false);
    });

    it('Passe par _bankApplyRules (opts.loyerCC)', () => {
      const res = _bankApplyRules([r], L('VIR M MARTIN LOYER', 680), { accountId: 'CIC', loyerCC: () => 680 });
      expect(res.byRule).toBe(true);
      expect(res.aff.qui).toBe('FER-101');
    });
  });

  it('Type de condition inconnu → ne matche pas (jamais d\'élargissement silencieux)', () => {
    const r = Object.assign(R({ mots: ['EDF'] }), { montant: { type: 'bizarre' } });
    expect(_bankRuleMatch(r, L('EDF', -1), 'CIC')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Exceptions — cas réel SARAR 4 583,03 €
// ═══════════════════════════════════════════════════════════════════

describe('Exceptions — CAS RÉEL SARAR 4 583,03 € décoché', () => {
  const lignes = [
    L('VIR SEPA SARAR SYNDIC CHARGES T3', -150, { date: '2026-07-05', _fingerprint: 'fp-07' }),
    L('VIR SEPA SARAR SYNDIC CHARGES T4', -150, { date: '2026-08-05', _fingerprint: 'fp-08' }),
    L('VIR SEPA SARAR SYNDIC TRAVAUX PEINTURE', -4583.03, { date: '2026-08-21', _fingerprint: 'fp-trav', suggestedCat: 'Travaux (entretien, réparation, amélioration)' }),
    L('VIR SEPA SARAR SYNDIC CHARGES T1', -150, { date: '2026-09-05', _fingerprint: 'fp-09' }),
  ];

  it('Décoché → exception mémorisée, la ligne n\'est JAMAIS classée par la règle', () => {
    const base = R({ mots: ['SARAR'], cat: 'Charges récupérables (eau, énergie…)' });
    const r = _bankRuleAddException(base, lignes[2], { now: NOW });
    expect(r).not.toBe(base);                        // copie : la règle d'origine est intacte
    expect(base.exceptions).toHaveLength(0);
    expect(r.exceptions).toHaveLength(1);
    expect(r.exceptions[0]).toMatchObject({ cle: 'fp-trav', date: '2026-08-21', montant: 4583.03, sens: 'db' });
    expect(r._modifiedAt).toBe(NOW);
    expect(_bankRuleMatch(r, lignes[2], 'CIC')).toBe(false);
    for (const i of [0, 1, 3]) expect(_bankRuleMatch(r, lignes[i], 'CIC')).toBe(true);
    // Ré-import du même relevé (même empreinte) : toujours exclue.
    expect(_bankRuleMatch(r, Object.assign({}, lignes[2]), 'CIC')).toBe(false);
    // Le mouvement en base issu de cette ligne (même _fingerprint) : exclu aussi.
    const mv = { lib: lignes[2].libelle, db: 4583.03, cr: 0, date: '2026-08-21', _fingerprint: 'fp-trav', _bankAccountId: 'CIC' };
    expect(_bankRuleLineKey(mv)).toBe('fp-trav');
    // _bankApplyRules ne la classe pas.
    expect(_bankApplyRules([r], lignes[2], { accountId: 'CIC' }).byRule).toBe(false);
  });

  it('L\'exception survit au réenregistrement de la règle (Modifier)', () => {
    const r = _bankRuleAddException(R({ mots: ['SARAR'] }), lignes[2], { now: NOW });
    const d = _bankRuleToDraft(r);
    d.mots = ['SARAR', 'SYNDIC'];
    const b = _bankRuleBuild(d, { base: r, now: NOW });
    expect(b.ok).toBe(true);
    expect(b.rule.id).toBe(r.id);
    expect(b.rule.exceptions.map(e => e.cle)).toEqual(['fp-trav']);
    expect(_bankRuleMatch(b.rule, lignes[2], 'CIC')).toBe(false);
  });

  it('Ajout idempotent ; suppression d\'une exception (Mes règles) la réactive', () => {
    const r1 = _bankRuleAddException(R({ mots: ['SARAR'] }), lignes[2], { now: NOW });
    expect(_bankRuleAddException(r1, lignes[2], { now: NOW })).toBe(r1);
    const r2 = _bankRuleRemoveException(r1, 'fp-trav', { now: NOW });
    expect(r2.exceptions).toHaveLength(0);
    expect(_bankRuleMatch(r2, lignes[2], 'CIC')).toBe(true);
    expect(_bankRuleRemoveException(r2, 'inconnue')).toBe(r2);
  });

  it('Sans empreinte : clé calculée (date | montant signé | libellé)', () => {
    const l = L('VIR SARAR', -4583.03, { date: '2026-08-21' });
    expect(_bankRuleLineKey(l)).toBe(_bankFingerprintRow('2026-08-21', -4583.03, 'VIR SARAR'));
    expect(_bankRuleLineKey({ libelle: 'X', fitid: 'ABC' })).toBe('fitid:ABC');
    const r = _bankRuleAddException(R({ mots: ['SARAR'] }), l, { now: NOW });
    expect(_bankRuleMatch(r, l, 'CIC')).toBe(false);
    expect(_bankRuleMatch(r, L('VIR SARAR', -150, { date: '2026-08-21' }), 'CIC')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Construction / validation
// ═══════════════════════════════════════════════════════════════════

describe('_bankRuleBuild — modèle et validations', () => {
  it('Compte OBLIGATOIRE pour toute nouvelle règle', () => {
    const b = _bankRuleBuild({ mots: ['EDF'], compte: '' }, { newId, now: NOW });
    expect(b.ok).toBe(false);
    expect(b.errors).toContain('compte');
    expect(b.rule).toBeNull();
  });

  it('Au moins un mot', () => {
    expect(_bankRuleBuild({ mots: [], motsLibres: ['  '], compte: 'CIC' }).errors).toContain('mots');
  });

  it('Modèle complet : id stable (jamais dérivé du motif), pattern d\'affichage, champs historiques', () => {
    const b = _bankRuleBuild({ mots: ['SARAR', 'sarar', ' SYNDIC '], motsLibres: ['TRAV EAUX', 'syndic'], sens: 'db', compte: 'CIC',
      cat: 'Charges de copropriété', imm: 'Ferrette' }, { newId: () => 'rg_fixe', now: NOW });
    expect(b.ok).toBe(true);
    expect(b.rule).toMatchObject({
      id: 'rg_fixe', mots: ['SARAR', 'SYNDIC'], motsLibres: ['TRAV', 'EAUX'], pattern: 'SARAR SYNDIC TRAV EAUX',
      sens: 'db', compte: 'CIC', montant: null, exceptions: [], cat: 'Charges de copropriété',
      qui: '', imm: 'Ferrette', compteurCcId: '', bailleurDuCompte: false, _modifiedAt: NOW, _createdAt: NOW,
    });
    expect(_bankRuleMotif(b.rule)).toBe('SARAR SYNDIC TRAV EAUX');
    // Modifier les mots ne change pas l'id.
    const b2 = _bankRuleBuild(Object.assign(_bankRuleToDraft(b.rule), { mots: ['SARAR'] }), { base: b.rule, newId: () => 'AUTRE', now: NOW });
    expect(b2.rule.id).toBe('rg_fixe');
  });

  it('« Le bailleur du compte » vide qui / imm / compteur', () => {
    const b = _bankRuleBuild({ mots: ['ICARUS'], compte: 'CIC', bailleurDuCompte: true, qui: 'FER-101', imm: 'X', compteurCcId: 'cc' });
    expect(b.rule).toMatchObject({ bailleurDuCompte: true, qui: '', imm: '', compteurCcId: '' });
  });

  it('Montant : exact / plage normalisés, saisies invalides refusées (rien corrigé en silence)', () => {
    const ok = (montant) => _bankRuleBuild({ mots: ['X'], compte: 'C', montant });
    expect(ok({ type: 'exact', valeur: '4 583,03' }).rule.montant).toEqual({ type: 'exact', valeur: 4583.03 });
    expect(ok({ type: 'plage', min: '100', max: 200 }).rule.montant).toEqual({ type: 'plage', min: 100, max: 200 });
    expect(ok({ type: 'exact', valeur: '' }).errors).toContain('montant');
    expect(ok({ type: 'plage', min: '', max: null }).errors).toContain('montant');
    expect(ok({ type: 'plage', min: 300, max: 200 }).errors).toContain('montant');
    expect(ok(null).rule.montant).toBeNull();
  });

  it('« = loyer CC » : recette ET logement affecté exigés', () => {
    const b = (d) => _bankRuleBuild(Object.assign({ mots: ['MARTIN'], compte: 'C', montant: { type: 'loyerCC' } }, d));
    expect(b({ sens: 'db', qui: 'FER-101' }).errors).toContain('montant-recette');
    expect(b({ sens: 'cr', qui: '' }).errors).toContain('montant-logement');
    expect(b({ sens: 'cr', qui: 'SCI:Dupont' }).errors).toContain('montant-logement');
    expect(b({ sens: 'cr', qui: 'FER-101' }).ok).toBe(true);
  });

  it('Réenregistrer une règle historique : passe au modèle refondu, garde son id, perd le badge', () => {
    const rules = [{ pattern: 'EDF CLIENTS', compte: '', cat: 'Charges récupérables (eau, énergie…)', extra: 'gardé' }];
    _bankMigrateRules(rules, { now: NOW });
    const hist = rules[0];
    const d = _bankRuleToDraft(hist);
    expect(d).toMatchObject({ historique: true, compteAChoisir: true, mots: [], motsLibres: ['EDF', 'CLIENTS'] });
    // Le compte est exigé à l'enregistrement.
    expect(_bankRuleBuild(d, { base: hist }).errors).toContain('compte');
    d.compte = 'CIC';
    const b = _bankRuleBuild(d, { base: hist, now: NOW });
    expect(b.ok).toBe(true);
    expect(b.rule.id).toBe(hist.id);
    expect(b.rule.compteAChoisir).toBeUndefined();
    expect(b.rule.extra).toBe('gardé');
    expect(_bankRuleIsV2(b.rule)).toBe(true);
    expect(_bankRuleMatch(b.rule, L('PRLV CLIENTS EDF', -1), 'CIC')).toBe(true);   // désormais sans ordre
    expect(_bankRuleMatch(b.rule, L('PRLV EDF CLIENTS', -1), 'CA')).toBe(false);   // et du seul compte choisi
  });

  it('_bankRuleNewId : opaque et unique', () => {
    const a = _bankRuleNewId(), b = _bankRuleNewId();
    expect(a).toMatch(/^rg_/);
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Migration idempotente
// ═══════════════════════════════════════════════════════════════════

describe('_bankMigrateRules — migration douce et idempotente', () => {
  const jeu = () => [
    { pattern: 'EDF', sens: 'db', compte: '', cat: 'Charges récupérables (eau, énergie…)' },
    { pattern: 'EDF', sens: 'db', compte: '', cat: 'Charges récupérables (eau, énergie…)' },   // doublon exact : gardé
    { pattern: 'ICARUS', compte: 'CIC', bailleurDuCompte: true },
    { _deleted: true, _deletedAt: '2026-01-01T00:00:00.000Z', pattern: 'VIEUX' },
    null,
  ];

  it('Attribue un id à chaque règle vivante, badge seulement sans compte, rien supprimé ni fusionné', () => {
    const rules = jeu();
    const res = _bankMigrateRules(rules, { now: NOW });
    expect(res).toEqual({ migrated: 3, skipped: 2 });
    expect(rules).toHaveLength(5);
    const ids = rules.slice(0, 3).map(r => r.id);
    expect(new Set(ids).size).toBe(3);                         // même contenu, ids distincts
    expect(rules[0]).toMatchObject({ pattern: 'EDF', compte: '', compteAChoisir: true, _modifiedAt: NOW });
    expect(rules[2].compte).toBe('CIC');
    expect(rules[2].compteAChoisir).toBeUndefined();
    expect(rules[3].id).toBeUndefined();                       // tombstone laissé tel quel
    expect(rules[4]).toBeNull();
  });

  it('Idempotente : une 2ᵉ passe ne change rien', () => {
    const rules = jeu();
    _bankMigrateRules(rules, { now: NOW });
    const snap = JSON.stringify(rules);
    expect(_bankMigrateRules(rules, { now: '2030-01-01T00:00:00.000Z' })).toEqual({ migrated: 0, skipped: 5 });
    expect(JSON.stringify(rules)).toBe(snap);
  });

  it('Même base migrée sur deux appareils → mêmes identifiants', () => {
    const a = jeu(), b = jeu();
    _bankMigrateRules(a, { now: NOW });
    _bankMigrateRules(b, { now: '2026-10-07T08:00:00.000Z' });
    expect(a.map(r => r && r.id)).toEqual(b.map(r => r && r.id));
  });

  it('Sûre sans importRules / entrée invalide', () => {
    expect(_bankMigrateRules(undefined)).toEqual({ migrated: 0, skipped: 0 });
    expect(_bankMigrateRules(null)).toEqual({ migrated: 0, skipped: 0 });
    const db = {};
    expect(_bankMigrateRules(db.importRules)).toEqual({ migrated: 0, skipped: 0 });
    expect(db.importRules).toBeUndefined();
  });

  it('Ne réattribue pas un id déjà présent et évite les collisions', () => {
    const rules = [{ id: 'rg_x', pattern: 'A', compte: 'C' }, { pattern: 'B' }];
    _bankMigrateRules(rules, { now: NOW });
    expect(rules[0].id).toBe('rg_x');
    expect(rules[0]._modifiedAt).toBeUndefined();
    expect(rules[1].id).not.toBe('rg_x');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Identité par id, tombstone par id, merge sans résurrection
// ═══════════════════════════════════════════════════════════════════

describe('Identité et suppression par identifiant', () => {
  it('_bankRuleIdxById ignore les tombstones et les règles sans id', () => {
    const rules = [{ pattern: 'A' }, { id: 'r1', pattern: 'B', _deleted: true }, { id: 'r1', pattern: 'B2' }];
    expect(_bankRuleIdxById(rules, 'r1')).toBe(2);
    expect(_bankRuleIdxById(rules, '')).toBe(-1);
    expect(_bankRuleIdxById(rules, undefined)).toBe(-1);
    expect(_bankRuleIdxById(null, 'r1')).toBe(-1);
    expect(_bankRuleById(rules, 'zz')).toBeNull();
  });

  it('Tombstone indexé sur l\'id (motif et compte gardés pour le journal)', () => {
    const r = R({ mots: ['EDF'], compte: 'CIC' });
    const t = _bankRuleTombstone(r, { now: NOW });
    expect(t).toEqual({ _deleted: true, _deletedAt: NOW, _modifiedAt: NOW, id: r.id, pattern: 'EDF', compte: 'CIC' });
    const rules = [r];
    rules[_bankRuleIdxById(rules, r.id)] = t;            // pose EN PLACE (jamais de splice)
    expect(_bankRuleIdxById(rules, r.id)).toBe(-1);
    expect(_bankRuleMatch(t, L('EDF', -1), 'CIC')).toBe(false);
  });

  it('Supprimer la règle d\'UN compte ne touche pas celle de même motif d\'un autre compte', () => {
    const cic = R({ mots: ['EDF'], compte: 'CIC' }), ca = R({ mots: ['EDF'], compte: 'CA' });
    const rules = [cic, ca];
    rules[_bankRuleIdxById(rules, ca.id)] = _bankRuleTombstone(ca, { now: NOW });
    expect(_bankRuleById(rules, cic.id)).toBe(cic);
    expect(_bankApplyRules(rules, L('PRLV EDF', -1), { accountId: 'CIC' }).matched).toEqual([cic]);
    expect(_bankApplyRules(rules, L('PRLV EDF', -1), { accountId: 'CA' }).matched).toEqual([]);
  });

  it('Merge : une règle supprimée NE RESSUSCITE PAS, même face à une modification plus récente', () => {
    const r = R({ mots: ['EDF'], compte: 'CIC' });
    const local = [_bankRuleTombstone(r, { now: '2026-10-06T10:00:00.000Z' })];
    const remote = [Object.assign({}, r, { cat: 'X', _modifiedAt: '2026-10-06T12:00:00.000Z' })];
    for (const out of [_bankRulesMergeById(local, remote), _bankRulesMergeById(remote, local)]) {
      expect(out).toHaveLength(1);
      expect(out[0]._deleted).toBe(true);
      expect(_bankRuleById(out, r.id)).toBeNull();
    }
  });

  it('Merge : même motif, comptes différents → deux règles distinctes ; le plus récent gagne par id', () => {
    const cic = R({ mots: ['EDF'], compte: 'CIC' }), ca = R({ mots: ['EDF'], compte: 'CA' });
    const caPlusRecent = Object.assign({}, ca, { cat: 'Nouvelle', _modifiedAt: '2026-10-07T00:00:00.000Z' });
    const out = _bankRulesMergeById([cic, ca], [caPlusRecent]);
    expect(out).toHaveLength(2);
    expect(_bankRuleById(out, cic.id)).toBe(cic);
    expect(_bankRuleById(out, ca.id).cat).toBe('Nouvelle');
    // Règles historiques sans id : clé motif + compte (pas de confusion entre comptes non plus).
    const h = _bankRulesMergeById([{ pattern: 'EDF', compte: 'A' }], [{ pattern: 'edf', compte: 'B' }]);
    expect(h).toHaveLength(2);
  });

  it('Merge : un tombstone historique (motif seul) n\'efface pas une règle qui a reçu un id', () => {
    const migree = [{ pattern: 'EDF' }];
    _bankMigrateRules(migree, { now: NOW });
    const out = _bankRulesMergeById(migree, [{ _deleted: true, pattern: 'EDF', _modifiedAt: NOW }]);
    expect(_bankRuleById(out, migree[0].id)).toBe(migree[0]);
  });

  it('Trace d\'un mouvement : par id, sinon par motif restreint au compte du mouvement', () => {
    const cic = R({ mots: ['EDF'], compte: 'CIC' }), ca = R({ mots: ['EDF'], compte: 'CA' });
    const hist = { id: 'h1', pattern: 'SYNDIC', compte: '' };
    const rules = [cic, ca, hist];
    expect(_bankRuleFindForTrace(rules, ca.id, 'CIC')).toBe(ca);       // l'id prime
    expect(_bankRuleFindForTrace(rules, 'EDF', 'CA')).toBe(ca);         // ancienne trace = motif
    expect(_bankRuleFindForTrace(rules, 'edf', 'CIC')).toBe(cic);
    expect(_bankRuleFindForTrace(rules, 'EDF', 'BPOP')).toBeNull();     // jamais la règle d'un autre compte
    expect(_bankRuleFindForTrace(rules, 'SYNDIC', 'BPOP')).toBe(hist);  // historique = tous comptes
    expect(_bankRuleFindForTrace(rules, '', 'CIC')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Doublons : refus, détection, fusion
// ═══════════════════════════════════════════════════════════════════

describe('Doublons', () => {
  it('Doublon EXACT refusé : la fonction renvoie la règle existante', () => {
    const existante = R({ mots: ['EDF', 'CLIENTS'], sens: 'db', cat: 'C' });
    const rules = [existante];
    const candidat = _bankRuleBuild({ mots: ['clients', 'édf'], sens: 'db', compte: 'CIC', cat: 'C' }, { newId, now: NOW }).rule;
    expect(_bankRuleExactDuplicate(rules, candidat)).toBe(existante);
    // Pas un doublon : autre compte, autre sens, autre résultat, autre montant.
    for (const d of [{ compte: 'CA' }, { sens: 'cr' }, { cat: 'Autre' }, { montant: { type: 'exact', valeur: 10 } }]) {
      const c = _bankRuleBuild(Object.assign({ mots: ['EDF', 'CLIENTS'], sens: 'db', compte: 'CIC', cat: 'C' }, d)).rule;
      expect(_bankRuleExactDuplicate(rules, c)).toBeNull();
    }
    // Une règle n'est pas son propre doublon (Modifier sans rien changer).
    expect(_bankRuleExactDuplicate(rules, existante)).toBeNull();
    expect(_bankRuleExactDuplicate(rules, Object.assign({}, existante))).toBeNull();
    // Une règle supprimée n'est pas un doublon.
    expect(_bankRuleExactDuplicate([_bankRuleTombstone(existante)], candidat)).toBeNull();
  });

  it('Détection : même compte, même résultat, motif de l\'une inclus dans l\'autre', () => {
    const large = R({ mots: ['EDF'], cat: 'C' });
    const precise = R({ mots: ['EDF', 'CLIENTS'], cat: 'C' });
    const autreCompte = R({ mots: ['EDF', 'CLIENTS'], cat: 'C', compte: 'CA' });
    const autreResultat = R({ mots: ['EDF', 'GAZ'], cat: 'Autre' });
    const sensOppose = R({ mots: ['EDF', 'REMB'], cat: 'C', sens: 'cr' });
    const sansRapport = R({ mots: ['SYNDIC'], cat: 'C' });
    const d = _bankRulesDuplicates([large, precise, autreCompte, autreResultat, sansRapport]);
    expect(d).toHaveLength(1);
    // Audit I2 : on garde la plus LARGE (elle attrape aussi toutes les lignes de la précise).
    expect(d[0].garder).toBe(large);
    expect(d[0].retirer).toBe(precise);
    // Sens opposés (dépense/recette) : jamais la même ligne → pas un doublon.
    const dbOnly = R({ mots: ['EDF'], cat: 'C', sens: 'db' });
    expect(_bankRulesDuplicates([dbOnly, sensOppose])).toHaveLength(0);
    // Tombstones ignorés.
    expect(_bankRulesDuplicates([large, _bankRuleTombstone(precise)])).toHaveLength(0);
  });

  it('Détection avec mot saisi (morceau) et règle historique', () => {
    const libre = R({ motsLibres: ['ELEC'], cat: 'C' });
    const mot = R({ mots: ['ELECTRICITE', 'STRASBOURG'], cat: 'C' });
    expect(_bankRulesDuplicates([libre, mot])[0].garder).toBe(libre);
    const hist = { id: 'h', pattern: 'EDF', compte: 'CIC', cat: 'C' };
    const v2 = R({ mots: ['EDF', 'CLIENTS'], cat: 'C' });
    const d = _bankRulesDuplicates([hist, v2]);
    expect(d).toHaveLength(1);
    expect(d[0].garder).toBe(hist);
  });

  it('Fusion (pure) : garde la plus LARGE (audit I2), réunit les exceptions, tombstone de l\'autre', () => {
    const l1 = L('EDF CLIENTS A', -1, { _fingerprint: 'k1' }), l2 = L('EDF CLIENTS B', -1, { _fingerprint: 'k2' });
    const large = _bankRuleAddException(R({ mots: ['EDF'], cat: 'C' }), l1, { now: NOW });
    const precise = _bankRuleAddException(R({ mots: ['EDF', 'CLIENTS'], cat: 'C' }), l2, { now: NOW });
    const avant = JSON.stringify([large, precise]);
    const f = _bankRulesFuse(large, precise, { now: '2026-10-06T11:00:00.000Z' });
    expect(JSON.stringify([large, precise])).toBe(avant);                 // entrées intactes
    expect(f.garder.id).toBe(large.id);
    expect(f.garder.exceptions.map(e => e.cle).sort()).toEqual(['k1', 'k2']);
    expect(f.garder._modifiedAt).toBe('2026-10-06T11:00:00.000Z');
    expect(f.retirer).toBe(precise);
    expect(f.tombstone).toMatchObject({ _deleted: true, id: precise.id });
    // Ordre des arguments indifférent.
    expect(_bankRulesFuse(precise, large, { now: NOW }).garder.id).toBe(large.id);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Aperçu — cases, ligne source, en base du même compte, natures
// ═══════════════════════════════════════════════════════════════════

describe('_bankRuleApercu — aperçu en direct', () => {
  const CHARGES = 'Charges récupérables (eau, énergie…)';
  const TRAVAUX = 'Travaux (entretien, réparation, amélioration)';
  const importLines = [
    L('VIR SEPA SARAR SYNDIC CHARGES T3', -150, { _fingerprint: 'i0', suggestedCat: CHARGES }),
    L('PRLV EDF CLIENTS', -80, { _fingerprint: 'i1', suggestedCat: CHARGES }),
    L('VIR SEPA SARAR SYNDIC TRAVAUX PEINTURE', -4583.03, { _fingerprint: 'i2', suggestedCat: TRAVAUX }),
    L('VIR SEPA SARAR SYNDIC CHARGES T4', -150, { _fingerprint: 'i3', suggestedCat: CHARGES }),
  ];
  const mouvements = [
    { lib: 'VIR SARAR SYNDIC', db: 150, cr: 0, cat: CHARGES, _bankAccountId: 'CIC', _fingerprint: 'm1' },
    { lib: 'VIR SARAR SYNDIC', db: 150, cr: 0, cat: 'Divers (non déductible)', _bankAccountId: 'CA', _fingerprint: 'm2' },
    { lib: 'VIR SARAR SYNDIC', db: 150, cr: 0, cat: CHARGES, _fingerprint: 'm3' },                         // manuel, sans compte
    { lib: 'VIR SARAR SYNDIC', db: 150, cr: 0, cat: CHARGES, _bankAccountId: 'CIC', _fingerprint: 'm4', _deleted: true },
  ];
  const ctx = { importLines, mouvements, accountId: 'CIC', sourceIndex: 0 };

  it('Lignes concernées cochées, source en tête cochée et verrouillée, en base du MÊME compte seulement', () => {
    const p = _bankRuleApercu(R({ mots: ['SARAR'] }), ctx);
    expect(p.lignes.map(x => x.index)).toEqual([0, 2, 3]);
    expect(p.lignes[0]).toMatchObject({ source: true, verrouille: true, coche: true, correspond: true });
    expect(p.lignes.slice(1).every(x => x.coche && !x.verrouille)).toBe(true);
    expect(p.nBase).toBe(1);                       // m1 seulement : ni CA, ni manuel, ni supprimé
    expect(p.baseCats).toEqual([CHARGES]);
    expect(p.sourceCorrespond).toBe(true);
  });

  it('Alerte « natures différentes » sur les lignes COCHÉES de l\'import ; décocher SARAR 4 583,03 € la lève', () => {
    const r = R({ mots: ['SARAR'] });
    const p = _bankRuleApercu(r, ctx);
    expect(p.natures.sort()).toEqual([CHARGES, TRAVAUX].sort());
    expect(p.mixed).toBe(true);
    expect(p.level).toBe('warn');
    const r2 = _bankRuleAddException(r, importLines[2], { now: NOW });
    const p2 = _bankRuleApercu(r2, ctx);
    expect(p2.lignes.find(x => x.index === 2)).toMatchObject({ coche: false, correspond: true });
    expect(p2.nCochees).toBe(2);
    expect(p2.mixed).toBe(false);
    expect(p2.level).toBe('ok');
  });

  it('Le compteur « en base » n\'entre pas dans l\'alerte (informatif)', () => {
    const mvs = [
      { lib: 'PRLV EDF', db: 80, cat: CHARGES, _bankAccountId: 'CIC', _fingerprint: 'a' },
      { lib: 'PRLV EDF', db: 80, cat: 'Divers (non déductible)', _bankAccountId: 'CIC', _fingerprint: 'b' },
    ];
    const p = _bankRuleApercu(R({ mots: ['EDF'] }), { importLines, mouvements: mvs, accountId: 'CIC' });
    expect(p.baseCats).toHaveLength(2);
    expect(p.mixed).toBe(false);
  });

  it('La ligne source n\'est jamais décochable, même si elle est en exception, et reste listée si elle ne correspond plus', () => {
    const r = _bankRuleAddException(R({ mots: ['SARAR'] }), importLines[0], { now: NOW });
    const p = _bankRuleApercu(r, ctx);
    expect(p.lignes[0]).toMatchObject({ index: 0, coche: true, verrouille: true });
    const autre = _bankRuleApercu(R({ mots: ['EDF'] }), ctx);           // la source (SARAR) ne correspond pas
    expect(autre.lignes[0]).toMatchObject({ index: 0, source: true, correspond: false, coche: true });
    expect(autre.sourceCorrespond).toBe(false);
    expect(autre.level).toBe('warn');
  });

  it('Source = mouvement enregistré (fiche) : incluse en tête, exclue du compteur en base', () => {
    const p = _bankRuleApercu(R({ mots: ['SARAR'] }), { mouvements, source: mouvements[0] });
    expect(p.lignes).toHaveLength(1);
    expect(p.lignes[0]).toMatchObject({ index: -1, source: true, correspond: true });
    expect(p.nBase).toBe(0);
    expect(p.mixed).toBe(false);                   // pas d'import : pas d'alerte de nature
  });

  it('Une règle d\'un autre compte ne voit ni les lignes de cet import ni ses mouvements', () => {
    const p = _bankRuleApercu(R({ mots: ['SARAR'], compte: 'CA' }), ctx);
    expect(p.lignes.map(x => x.index)).toEqual([0]);                    // seulement la source, signalée
    expect(p.lignes[0].correspond).toBe(false);
    expect(p.nBase).toBe(1);                                            // m2 (compte CA)
    expect(p.baseCats).toEqual(['Divers (non déductible)']);
  });

  it('Création à froid sans compte : rien d\'appliqué, compte signalé manquant', () => {
    const p = _bankRuleApercu({ mots: ['SARAR'], motsLibres: [] }, { mouvements });
    expect(p.compteManquant).toBe(true);
    expect(p.nBase).toBe(0);
    expect(p.level).toBe('warn');
  });

  it('Sans mot : aperçu vide, aucune alerte gratuite ; motif trop court signalé', () => {
    const p = _bankRuleApercu({ mots: [], motsLibres: [], compte: 'CIC' }, { importLines, accountId: 'CIC' });
    expect(p.vide).toBe(true);
    expect(p.lignes).toHaveLength(0);
    expect(p.level).toBe('');
    const court = _bankRuleApercu(R({ mots: ['EDF'] }), { importLines, accountId: 'CIC' });
    expect(court.tooShort).toBe(true);
  });

  it('Condition « = loyer CC » transmise à l\'aperçu', () => {
    const lignes = [L('VIR MARTIN LOYER', 680, { _fingerprint: 'x1' }), L('VIR MARTIN REGUL', 45, { _fingerprint: 'x2' })];
    const r = R({ mots: ['MARTIN'], sens: 'cr', qui: 'FER-101', montant: { type: 'loyerCC' } });
    expect(_bankRuleApercu(r, { importLines: lignes, accountId: 'CIC', loyerCC: () => 680 }).lignes.map(x => x.index)).toEqual([0]);
    expect(_bankRuleApercu(r, { importLines: lignes, accountId: 'CIC' }).lignes).toHaveLength(0);
  });
});

describe('_bankRulePreview (historique) — le compteur en base ne mélange plus les comptes', () => {
  it('Un mouvement d\'un autre compte n\'est plus compté « comme s\'il était du compte courant »', () => {
    const mouvements = [
      { lib: 'PRLV EDF', db: 80, cat: 'A', _bankAccountId: 'CIC' },
      { lib: 'PRLV EDF', db: 80, cat: 'B', _bankAccountId: 'CA' },
    ];
    const p = _bankRulePreview({ pattern: 'EDF', compte: 'CIC' }, { mouvements, accountId: 'CIC' });
    expect(p.nBase).toBe(1);                      // avant : 2 (CA testé comme CIC)
    expect(p.baseCats).toEqual(['A']);
    expect(p.mixed).toBe(false);                  // avant : « natures différentes »
    // Motif historique sans compte = tous les comptes (inchangé).
    expect(_bankRulePreview({ pattern: 'EDF' }, { mouvements, accountId: 'CIC' }).nBase).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Mots du libellé (puces)
// ═══════════════════════════════════════════════════════════════════

describe('_bankMotsDuLibelle — puces, rien de présélectionné', () => {
  it('Découpe en mots, dans l\'ordre, sans ponctuation', () => {
    expect(_bankMotsDuLibelle('PRLV SEPA EDF CLIENTS PARTICULIERS ECH/060826'))
      .toEqual(['PRLV', 'SEPA', 'EDF', 'CLIENTS', 'PARTICULIERS', 'ECH', '060826']);
    expect(_bankMotsDuLibelle("VIR L'ORÉE-001 4 583,03")).toEqual(['VIR', 'L', 'ORÉE', '001', '4', '583', '03']);
  });

  it('Sans doublon (casse et accents ignorés), la première graphie est gardée', () => {
    expect(_bankMotsDuLibelle('SARAR syndic Sarar SYNDIC société SOCIETE')).toEqual(['SARAR', 'syndic', 'société']);
  });

  it('Accents en forme décomposée (NFD) : un seul mot', () => {
    expect(_bankMotsDuLibelle('SOCIÉTÉ EAUX')).toEqual(['SOCIÉTÉ', 'EAUX']);
  });

  it('Libellé vide / absent → aucune puce', () => {
    expect(_bankMotsDuLibelle('')).toEqual([]);
    expect(_bankMotsDuLibelle(null)).toEqual([]);
    expect(_bankMotsDuLibelle(' -- / ')).toEqual([]);
  });

  it('Chaque puce cochée seule fait correspondre la ligne source (mot entier)', () => {
    const lib = 'PRLV SEPA EDF-CLIENTS ECH/060826';
    for (const w of _bankMotsDuLibelle(lib)) {
      expect(_bankRuleMatch(R({ mots: [w] }), L(lib, -1), 'CIC')).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Le MIRROR (js/helpers/bank-import.global.js, exécuté en file://) porte la refonte
// ═══════════════════════════════════════════════════════════════════

describe('Mirror navigateur — la refonte est dans le fichier que le navigateur charge', () => {
  it('compte strict, mots sans ordre, exception, migration, tombstone par id', async () => {
    const { readFileSync } = await import('node:fs');
    const vm = await import('node:vm');
    const { fileURLToPath } = await import('node:url');
    const chemin = fileURLToPath(new URL('../../js/helpers/bank-import.global.js', import.meta.url));
    const bac = { window: {}, console };
    vm.createContext(bac);
    vm.runInContext(readFileSync(chemin, 'utf8'), bac, { filename: chemin });
    const w = bac.window;
    for (const f of ['_bankRuleBuild', '_bankRuleApercu', '_bankMigrateRules', '_bankRuleIdxById',
      '_bankRuleTombstone', '_bankMotsDuLibelle', '_bankRulesDuplicates', '_bankRulesFuse']) {
      expect(typeof w[f], f).toBe('function');
    }
    const r = w._bankRuleBuild({ mots: ['SYNDIC', 'SARAR'], compte: 'CIC' }, { newId: () => 'm1', now: NOW }).rule;
    expect(w._bankRuleMatch(r, L('VIR SYNDIC X SARAR', -150), 'CIC')).toBe(true);
    expect(w._bankRuleMatch(r, L('VIR SYNDIC X SARAR', -150), 'CA')).toBe(false);
    const trav = L('SARAR SYNDIC TRAVAUX', -4583.03, { _fingerprint: 'trav' });
    expect(w._bankRuleMatch(w._bankRuleAddException(r, trav, { now: NOW }), trav, 'CIC')).toBe(false);
    const rules = [{ pattern: 'EDF' }];
    w._bankMigrateRules(rules, { now: NOW });
    expect(rules[0].compteAChoisir).toBe(true);
    expect(w._bankRuleIdxById([w._bankRuleTombstone(r, { now: NOW })], 'm1')).toBe(-1);
  });
});
