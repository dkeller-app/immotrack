/**
 * ASSURANCE EMPRUNTEUR (décision Didier 15/10) — une assurance de prêt prélevée À PART de l'échéance est
 * une vraie sortie d'argent : comptée au CASH-FLOW réel (charges du moteur Finances) ET en 2044 ligne 250
 * (base2044), à sa date (exclue de la répartition H-7 des intérêts au prorata des échéances).
 *
 * Comment un prêt est compté (moteur `js/core/finances-monthly.js`) :
 *   - l'ÉCHÉANCE « Prêt » (capital + intérêts, éventuellement l'assurance quand la banque l'y inclut)
 *     → `pret`, dans `charges` et le cash-flow, jamais en 2044 (elle contient le capital) ;
 *   - les INTÉRÊTS « Prêt — Intérêts d'emprunt » (attestation annuelle) → `interets`, en 2044 (250)
 *     seulement : ils sont DÉJÀ payés dans l'échéance (les compter au cash-flow serait un double compte) ;
 *   - l'ASSURANCE prélevée à part → `assuranceEmprunteur`, au cash-flow ET en 2044 (250) : elle n'est
 *     dans aucune échéance, aucun double compte avec `pret` ; le seul double compte possible est fiscal
 *     (attestation qui l'inclut + mouvements d'assurance) → alerte à la saisie (`_ligne250DejaComptee`).
 *
 * Tests d'identité : sans assurance, le moteur rend exactement les mêmes chiffres qu'avant.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _computeFinancesMonthly, _ligne250DejaComptee } from '../../js/core/finances-monthly.js';
import { _bankMatchHeuristic } from '../../js/core/bank-import.js';

const AE = 'Prêt — Assurance emprunteur';
const INT = "Prêt — Intérêts d'emprunt";
const catLigne = (cat) => ({
  'Loyer': { ligne2044: '211', type: 'recette' },
  [INT]: { ligne2044: '250', type: 'interet' },
  [AE]: { ligne2044: '250', type: 'interet' },
}[cat] || null);
const isEcheance = (m) => m.cat === 'Prêt';
const isAssuranceEmprunteur = (m) => m.cat === AE;
const mois = (k) => '2026-' + String(k).padStart(2, '0');

// Prêt : 12 échéances de 900 € (capital + intérêts), loyer 1 200 €/mois, attestation de 2 400 € d'intérêts au 31/12.
const pretSeul = [];
for (let k = 1; k <= 12; k++) {
  pretSeul.push({ date: mois(k) + '-05', cat: 'Prêt', qui: 'L1', db: 900, cr: 0 });
  pretSeul.push({ date: mois(k) + '-03', cat: 'Loyer', qui: 'L1', cr: 1200, db: 0 });
}
pretSeul.push({ date: '2026-12-31', cat: INT, qui: 'L1', db: 2400, cr: 0 });
// … plus une assurance emprunteur prélevée à part : 30 €/mois.
const avecAssurance = pretSeul.concat(Array.from({ length: 12 }, (_, k) => ({ date: mois(k + 1) + '-10', cat: AE, qui: 'L1', db: 30, cr: 0 })));
const base = { year: 2026, catLigne, isEcheance, lastMonth: 12, today: '2027-01-15' };

describe('Moteur Finances — prêt, intérêts et assurance emprunteur', () => {
  it('prêt avec échéance seule : l\'échéance au cash-flow, les intérêts en 2044 seulement (identique à avant)', () => {
    const avant = _computeFinancesMonthly({ ...base, mouvements: pretSeul });
    const apres = _computeFinancesMonthly({ ...base, mouvements: pretSeul, isAssuranceEmprunteur });
    expect(apres.annual).toEqual(avant.annual);
    expect(apres.annual.pret).toBe(10800);
    expect(apres.annual.charges).toBe(10800);                 // l'échéance entière, pas les intérêts en plus
    expect(apres.annual.interets).toBe(2400);
    expect(apres.annual.assuranceEmprunteur).toBe(0);
    expect(apres.annual.cashflowReel).toBe(14400 - 10800);     // 3 600
    expect(apres.annual.base2044).toBe(14400 - 2400);          // 12 000 : le capital n'est jamais déduit
  });

  it('prêt + assurance prélevée à part : +360 € de charges au cash-flow, −360 € de base 2044 (ligne 250)', () => {
    const r = _computeFinancesMonthly({ ...base, mouvements: avecAssurance, isAssuranceEmprunteur });
    expect(r.annual.assuranceEmprunteur).toBe(360);
    expect(r.annual.pret).toBe(10800);                         // l'échéance ne bouge pas
    expect(r.annual.interets).toBe(2400);                      // les intérêts de l'attestation, sans l'assurance
    expect(r.annual.charges).toBe(10800 + 360);
    expect(r.annual.cashflowReel).toBe(14400 - 10800 - 360);   // 3 240
    expect(r.annual.base2044).toBe(14400 - 2400 - 360);        // 11 640 : 250 = intérêts + assurance
    expect(r.interetsTotal).toBe(2400);
  });

  it('l\'assurance reste à sa date (pas de répartition H-7) ; les intérêts restent répartis au prorata des échéances', () => {
    const r = _computeFinancesMonthly({ ...base, mouvements: avecAssurance, isAssuranceEmprunteur });
    expect(r.months.map(m => m.assuranceEmprunteur)).toEqual(Array(12).fill(30));
    expect(r.months.map(m => m.interets)).toEqual(Array(12).fill(200));   // 2 400 / 12 échéances égales
    r.months.forEach(m => expect(m.cashflowReel).toBe(1200 - 900 - 30));
  });

  it('avant le 15/10 (résolveur absent) l\'assurance tombait dans les intérêts, hors cash-flow — le défaut garde cette parité', () => {
    const r = _computeFinancesMonthly({ ...base, mouvements: avecAssurance });
    expect(r.annual.assuranceEmprunteur).toBe(0);
    expect(r.annual.interets).toBe(2760);
    expect(r.annual.cashflowReel).toBe(3600);
    expect(r.annual.base2044).toBe(14400 - 2760);              // même base 2044 annuelle : seul le cash-flow change
  });

  it('une assurance datée après le dernier mois produit n\'est pas comptée en intérêts (c\'est un flux, il attend son mois)', () => {
    const mv = pretSeul.filter(m => m.date < '2026-07').concat([{ date: '2026-09-10', cat: AE, qui: 'L1', db: 30, cr: 0 }]);
    const r = _computeFinancesMonthly({ ...base, mouvements: mv, isAssuranceEmprunteur, lastMonth: 6 });
    expect(r.annual.interets).toBe(0);
    expect(r.annual.assuranceEmprunteur).toBe(0);
  });

  it('un remboursement d\'assurance (crédit) vient en déduction, comme pour toute charge', () => {
    const mv = avecAssurance.concat([{ date: '2026-06-20', cat: AE, qui: 'L1', db: 0, cr: 50 }]);
    const r = _computeFinancesMonthly({ ...base, mouvements: mv, isAssuranceEmprunteur });
    expect(r.annual.assuranceEmprunteur).toBe(310);
  });
});

describe('_ligne250DejaComptee — ce qui est déjà compté en ligne 250 (alerte de double compte)', () => {
  const genre = (cat) => cat === AE ? 'assurance' : (cat === INT ? 'interets' : null);
  it('attestation déjà saisie + assurances : pièces, totaux par genre, année et bien filtrés', () => {
    const mv = avecAssurance.concat([
      { id: 99, date: '2025-12-31', cat: INT, qui: 'L1', db: 2500, cr: 0 },       // autre année
      { id: 98, date: '2026-12-31', cat: INT, qui: 'L2', db: 1000, cr: 0 },       // autre bien
      { id: 97, date: '2026-03-10', cat: AE, qui: 'L1', db: 30, cr: 0, _deleted: true },
    ]).map((m, k) => Object.assign({ id: m.id != null ? m.id : k + 1, lib: m.cat }, m));
    const d = _ligne250DejaComptee({ mouvements: mv, year: 2026, genre, garder: m => m.qui === 'L1' });
    expect(d.lignes).toHaveLength(13);
    expect(d.totalInterets).toBe(2400);
    expect(d.totalAssurance).toBe(360);
    expect(d.total).toBe(2760);
    expect(d.lignes[d.lignes.length - 1]).toMatchObject({ date: '2026-12-31', genre: 'interets', montant: 2400 });
  });
  it('le mouvement en cours de modification n\'est pas compté contre lui-même', () => {
    const mv = [{ id: 1, date: '2026-12-31', cat: INT, qui: 'L1', db: 2400, cr: 0 }];
    expect(_ligne250DejaComptee({ mouvements: mv, year: 2026, genre, exclId: 1 }).lignes).toHaveLength(0);
    expect(_ligne250DejaComptee({ mouvements: mv, year: '2026', genre, exclId: '1' }).lignes).toHaveLength(0);
  });
});

describe('Proposition à l\'import : une assurance de prêt va en ligne 250, pas en PNO (223)', () => {
  const L = (libelle) => ({ date: '2026-10-05', libelle, debit: 32.1, credit: 0 });
  it.each(['PRLV SEPA CNP ASSURANCES PRET 4471', 'PRLV ASSURANCE EMPRUNTEUR', 'PRLV CARDIF ASSURANCE DE PRET', 'ASSURANCE CREDIT IMMO'])('%s', (lib) => {
    expect(_bankMatchHeuristic(L(lib)).cat).toBe(AE);
  });
  it('une assurance PNO reste une PNO', () => {
    expect(_bankMatchHeuristic(L('PRLV AXA ASSURANCE PNO')).cat).toBe("Primes d'assurance (PNO, GLI)");
  });
});

// ── Branchement de l'app : les vraies fonctions, extraites du source ─────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P1 = fs.readFileSync(path.join(ROOT, 'js/app/app-part1.js'), 'utf8');
const P2 = fs.readFileSync(path.join(ROOT, 'js/app/app-part2.js'), 'utf8');
const corps = (src, nom) => {
  const i = src.indexOf('\nfunction ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable');
  return src.slice(i + 1, src.indexOf('\n}', i + 1) + 2);
};

describe('Branchement — un seul décideur (_fin250Genre), lu par le moteur, la fiche du lot, le détail et l\'alerte', () => {
  it('le moteur reçoit l\'assurance par _fin250Genre', () => {
    expect(corps(P2, '_finMonthly')).toContain("isAssuranceEmprunteur: m => _fin250Genre(m && m.cat) === 'assurance'");
    expect(corps(P1, '_finLotCatRole')).toContain("_fin250Genre(cat) === 'assurance'");
    expect((corps(P2, '_finDrillLigne').match(/kind === 'assuranceEmprunteur' && _fin250Genre\(m\.cat\) === 'assurance'/g) || []).length).toBe(2);
    expect(P2).toContain("kind: 'assuranceEmprunteur'");
  });
  it('l\'alerte est branchée sur l\'assistant des intérêts ET sur l\'enregistrement d\'un mouvement', () => {
    expect(corps(P2, '_finCreditOpen')).toContain('_finCreditDejaRender();');
    const iS = P1.indexOf('\nasync function saveMv(');
    expect(iS).toBeGreaterThan(0);
    const saveMv = P1.slice(iS, P1.indexOf('\n}', iS + 1));
    // avant toute écriture (pièce jointe, journal, création) : l'utilisateur décide d'abord
    expect(saveMv.indexOf('_fin250ConfirmerSaisie(')).toBeGreaterThan(0);
    expect(saveMv.indexOf('_fin250ConfirmerSaisie(')).toBeLessThan(saveMv.indexOf('_attachmentSaveForMouvement('));
    expect(saveMv.indexOf('_fin250ConfirmerSaisie(')).toBeLessThan(saveMv.indexOf('_mvCreate('));
  });
});

describe('Alerte de double compte — texte, déclenchement, jamais bloquante', () => {
  const monter = (mouvements, confirmeRep = true) => {
    const appels = [];
    const STD = { [INT]: { nom: INT, ligne2044: '250' }, [AE]: { nom: AE, ligne2044: '250' }, 'Prêt': { nom: 'Prêt', ligne2044: '' } };
    const src = ['_fin250Genre', '_fin250Deja', '_fin250AlerteTexte', '_fin250ConfirmerSaisie'].map(n => corps(P2, n)).join('\n');
    const f = new Function('DB', 'window', '_finCatMere', 'fmt', 'confirm2', src + '\nreturn { _fin250Genre, _fin250AlerteTexte, _fin250ConfirmerSaisie, _fin250Deja };')(
      { mouvements }, { _ligne250DejaComptee }, (c) => STD[c] || null, (n) => n.toFixed(2).replace('.', ',') + ' €',
      (msg) => { appels.push(msg); return confirmeRep; });
    return { f, appels };
  };
  const attestation = { id: 1, date: '2026-12-31', lib: 'Intérêts 2026', cat: INT, qui: 'L1', db: 2400, cr: 0 };
  const assur = { id: 2, date: '2026-03-10', lib: 'PRLV CNP', cat: AE, qui: 'L1', db: 30, cr: 0 };

  it('saisir des intérêts quand une assurance existe déjà : message avec la pièce, le total et le risque', () => {
    const { f, appels } = monter([assur]);
    expect(f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1' }, null)).toBe(true);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toContain('déjà comptés pour 2026');
    expect(appels[0]).toContain('10/03/2026 · PRLV CNP');
    expect(appels[0]).toContain('Total déjà compté : 30,00 €');
    expect(appels[0]).toContain('inclut souvent l\'assurance emprunteur : ne pas la saisir deux fois');
    expect(appels[0]).not.toMatch(/\b(vous|votre|tu|ton|ta|tes)\b/i);
  });
  it('« Annuler » renvoie au formulaire (choix de l\'utilisateur) ; « OK » enregistre', () => {
    expect(monter([assur], false).f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1' })).toBe(false);
    expect(monter([assur], true).f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1' })).toBe(true);
  });
  it('saisir une assurance quand l\'attestation existe : alerte ; une assurance de plus sans attestation : rien', () => {
    let m = monter([attestation]);
    m.f._fin250ConfirmerSaisie({ cat: AE, date: '2026-04-10', qui: 'L1' });
    expect(m.appels).toHaveLength(1);
    m = monter([assur]);
    m.f._fin250ConfirmerSaisie({ cat: AE, date: '2026-04-10', qui: 'L1' });
    expect(m.appels).toHaveLength(0);
  });
  it('autre bien, autre année, catégorie hors 250, modification du même mouvement : rien', () => {
    const m = monter([attestation]);
    m.f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L2' });
    m.f._fin250ConfirmerSaisie({ cat: AE, date: '2025-04-10', qui: 'L1' });
    m.f._fin250ConfirmerSaisie({ cat: 'Prêt', date: '2026-04-10', qui: 'L1' });
    m.f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1' }, 1);
    expect(m.appels).toHaveLength(0);
  });
});

describe('Catégorie perso « Assurance crédit » : migration de données vers la famille « Prêt — Assurance emprunteur »', () => {
  const monter = (DB) => {
    const STD = [{ nom: AE }, { nom: INT }, { nom: "Primes d'assurance (PNO, GLI)" }];
    const src = corps(P2, '_finEstNomAssurancePret') + '\n' + corps(P2, '_finMigrateAssuranceEmprunteur');
    let saves = 0;
    const f = new Function('DB', '_stdCategoryByName', 'saveDB', src + '\nreturn { _finMigrateAssuranceEmprunteur };')(
      DB, (n) => STD.find(c => c.nom === n) || null, () => { saves++; });
    return { f, saves: () => saves };
  };
  it('une catégorie sans famille choisie est rattachée ; un choix explicite (alias, mapping validé, ligne 2044 posée) n\'est jamais modifié', () => {
    const DB = {
      categories: ['Assurance crédit', 'Assurance prêt CNP', 'Assurance PNO perso', 'Ma assurance credit choisie', 'Assurance de prêt'],
      mouvements: [{ cat: 'assurance emprunteur LCL', db: 20 }],
      catAlias: { 'Ma assurance credit choisie': "Primes d'assurance (PNO, GLI)" },
      // « Assurance crédit » a une ligne 2044 posée (223) — peut-être choisie dans l'assistant 2044 : intouchée.
      params: { legal2044Mapping: { 'Assurance crédit': '223', 'Assurance de prêt': '250' } },
    };
    const m = monter(DB);
    expect(m.f._finMigrateAssuranceEmprunteur()).toBe(3);
    expect(DB.catAlias['Assurance prêt CNP']).toBe(AE);
    expect(DB.catAlias['assurance emprunteur LCL']).toBe(AE);
    expect(DB.catAlias['Assurance de prêt']).toBe(AE);              // 250 posé : même ligne, entre au cash-flow
    expect(DB.catAlias['Assurance crédit']).toBeUndefined();
    expect(DB.params.legal2044Mapping['Assurance crédit']).toBe('223');   // jamais réécrit
    expect(DB.catAlias['Assurance PNO perso']).toBeUndefined();
    expect(DB.catAlias['Ma assurance credit choisie']).toBe("Primes d'assurance (PNO, GLI)");
    expect(m.saves()).toBe(1);
    expect(m.f._finMigrateAssuranceEmprunteur()).toBe(0);   // idempotente
    expect(m.saves()).toBe(1);
  });
  it('les assurances du BIEN chez une banque-assureur ne sont jamais prises pour une assurance de prêt', () => {
    const noms = ['Assurance Crédit Mutuel', 'Assurances du Crédit Mutuel (ACM)', 'Assurance PNO Crédit Agricole', 'Assurance GLI Crédit Agricole',
      'Assurance loyers impayés crédit', 'Assurance habitation prêtée', 'Assurance auto crédit', 'Assurance Crédit Lyonnais'];
    const DB = { categories: noms.slice(), mouvements: [], catAlias: {}, params: {} };
    expect(monter(DB).f._finMigrateAssuranceEmprunteur()).toBe(0);
    expect(DB.catAlias).toEqual({});
  });
});

describe('Proposition à l\'import : pas de faux positif sur une PNO / GLI / banque-assureur', () => {
  const L = (libelle) => ({ date: '2026-10-05', libelle, debit: 32.1, credit: 0 });
  it.each(['PRLV ASSURANCE CREDIT MUTUEL HABITATION', 'PRLV ACM ASSURANCES CREDIT MUTUEL PNO', 'PRLV ASSURANCES DU CREDIT MUTUEL AUTO',
    'CARDIF GARANTIE LOYERS IMPAYES', 'PRLV CNP ASSURANCES PNO'])('%s', (lib) => {
    expect(_bankMatchHeuristic(L(lib)).cat).not.toBe(AE);
  });
  it('le pluriel « ASSURANCES » est reconnu comme assurance du bien', () => {
    expect(_bankMatchHeuristic(L('PRLV CREDIT AGRICOLE ASSURANCES PACIFICA PNO')).cat).toBe("Primes d'assurance (PNO, GLI)");
  });
});

describe('Alerte — compléments des relectures', () => {
  const monter = (mouvements) => {
    const appels = [];
    const STD = { [INT]: { nom: INT, ligne2044: '250' }, [AE]: { nom: AE, ligne2044: '250' }, 'Prêt': { nom: 'Prêt', ligne2044: '' } };
    const src = ['_fin250Genre', '_fin250Deja', '_fin250AlerteTexte', '_fin250ConfirmerSaisie'].map(n => corps(P2, n)).join('\n');
    const f = new Function('DB', 'window', '_finCatMere', 'fmt', 'confirm2', src + '\nreturn { _fin250ConfirmerSaisie };')(
      { mouvements }, { _ligne250DejaComptee }, (c) => STD[c] || null, (n) => n.toFixed(2).replace('.', ',') + ' €',
      (msg) => { appels.push(msg); return true; });
    return { f, appels };
  };
  const ech = (k) => ({ id: 100 + k, date: '2026-0' + k + '-05', lib: 'ECHEANCE', cat: 'Prêt', qui: 'L1', db: 900, cr: 0 });
  it('première assurance de l\'année sur un bien qui a des échéances « Prêt » : risque de double compte au cash-flow', () => {
    const m = monter([ech(1), ech(2)]);
    m.f._fin250ConfirmerSaisie({ cat: AE, date: '2026-12-31', qui: 'L1', db: 360 });
    expect(m.appels).toHaveLength(1);
    expect(m.appels[0]).toContain('2 échéances « Prêt » déjà enregistrées pour ce bien en 2026');
    expect(m.appels[0]).toContain('comptée deux fois au cash-flow');
    expect(m.appels[0]).not.toMatch(/\b(vous|votre|tu|ton|ta|tes)\b/i);
    // les assurances suivantes de l'année ne redemandent rien
    const m2 = monter([ech(1), { id: 5, date: '2026-01-10', lib: 'CNP', cat: AE, qui: 'L1', db: 30, cr: 0 }]);
    m2.f._fin250ConfirmerSaisie({ cat: AE, date: '2026-02-10', qui: 'L1', db: 30 });
    expect(m2.appels).toHaveLength(0);
  });
  it('intérêts sur intérêts : le texte parle de la même attestation saisie deux fois, pas de l\'assurance', () => {
    const m = monter([{ id: 1, date: '2026-12-31', lib: 'Intérêts prêt 1', cat: INT, qui: 'L1', db: 1200, cr: 0 }]);
    m.f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1', db: 800 });
    expect(m.appels[0]).toContain('même attestation saisie deux fois');
    expect(m.appels[0]).not.toContain('inclut souvent l\'assurance');
  });
  it('modification sans changement (catégorie, date, montant) : rien ; sans logement ni immeuble : seulement les pièces sans bien', () => {
    const att = { id: 1, date: '2026-12-31', lib: 'Intérêts', cat: INT, qui: 'L1', db: 2400, cr: 0 };
    const assur = { id: 2, date: '2026-03-10', lib: 'CNP', cat: AE, qui: 'L1', db: 30, cr: 0 };
    const m = monter([att, assur]);
    m.f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: 'L1', db: 2400, cr: 0 }, 1);
    m.f._fin250ConfirmerSaisie({ cat: INT, date: '2026-12-31', qui: '', imm: '', db: 500 });
    expect(m.appels).toHaveLength(0);
  });
});

describe('Relecture adverse n°2 — import et noms de catégories', () => {
  const L = (libelle) => ({ date: '2026-10-05', libelle, debit: 32.1, credit: 0 });
  it('CNP / Cardif seuls : assurance emprunteur à confiance basse, jamais PNO', () => {
    for (const lib of ['PRLV SEPA CNP ASSURANCES', 'PRLV CARDIF ASSURANCES']) {
      const r = _bankMatchHeuristic(L(lib));
      expect(r.cat, lib).toBe(AE);
      expect(r.confidence, lib).toBe(0.6);
    }
  });
  it('une assurance de prêt chez une banque-assureur reste une assurance de prêt', () => {
    for (const lib of ['PRLV ASSURANCE EMPRUNTEUR CREDIT AGRICOLE', 'PRLV ASSURANCE PRET CREDIT MUTUEL']) expect(_bankMatchHeuristic(L(lib)).cat, lib).toBe(AE);
  });
  it('noms de catégories : prêt chez une banque oui, banque-assureur seule non, crédit à la consommation non', () => {
    const STD = [{ nom: AE }];
    const src = corps(P2, '_finEstNomAssurancePret') + '\n' + corps(P2, '_finMigrateAssuranceEmprunteur');
    const DB = { categories: ['Assurance prêt Crédit Foncier', 'Assurance emprunteur Crédit Agricole', 'Assurance crédit consommation', 'Assurance crédit'],
      mouvements: [], catAlias: {}, params: {} };
    new Function('DB', '_stdCategoryByName', 'saveDB', src + '\nreturn _finMigrateAssuranceEmprunteur;')(DB, n => STD.find(c => c.nom === n) || null, () => {})();
    expect(Object.keys(DB.catAlias).sort()).toEqual(['Assurance crédit', 'Assurance emprunteur Crédit Agricole', 'Assurance prêt Crédit Foncier']);
  });
});
