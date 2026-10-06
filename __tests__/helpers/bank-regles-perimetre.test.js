/**
 * bank-regles-perimetre.test.js — REGLES-REFONTE phase 5.
 * Sujet : docs/subjects/RETOURS-2026-10-05.md (lot D : D1, D6 + « Décisions Didier du 06/10 »).
 *
 *  A. compte d'une règle créée pendant un import : repris (lecture seule), sélecteur seulement
 *     sans compte (`_bankRuleCompteInitial`) ;
 *  B. périmètre par bailleur (`_bankPerimetre`, `_bankBauxDuPerimetre`) : logements, immeubles,
 *     SCI, baux ; compte mixte, périmètre immeuble, compte sans bailleur, « Voir tout » ;
 *  C. catégorie « Prêt — Assurance emprunteur » : visible, ligne 250 comptée avec les intérêts.
 * Le branchement (js/app/app-part*.js) est vérifié par les gardes de source en fin de fichier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  _bankRuleCompteInitial, _bankPerimetre, _bankBauxDuPerimetre, _bankMatchHeuristic,
} from '../../js/core/bank-import.js';
import { _compute2044 } from '../../js/core/legal-2044.js';

// ── Jeu de données fictif : deux bailleurs ───────────────────────────────────────────────────
const DATA = {
  entites: [
    { nom: 'SCI Dupont', type: 'SCI IR', immeubles: [{ nom: 'Ferrette', compteursCollectifs: [{ id: 'cc1', nom: 'Eau' }] }] },
    { nom: 'Didier Keller', type: 'Particulier', immeubles: [{ nom: 'Krutenau' }] },
    { nom: 'SCI Martin', type: 'SCI IR', immeubles: [] },
  ],
  logements: [
    { ref: 'F-101', imm: 'Ferrette', entity: 'SCI Dupont' },
    { ref: 'F-102', imm: 'Ferrette', entity: 'SCI Dupont' },
    { ref: 'K-1', imm: 'Krutenau', entity: 'Didier Keller' },
    { ref: 'ORPH', imm: '', entity: '' },                       // logement sans entité : propriétaire inconnu
  ],
};
const refs = per => DATA.logements.filter(l => per.logementOk(l)).map(l => l.ref);
const imms = per => ['Ferrette', 'Krutenau', 'Inconnu'].filter(i => per.immeubleOk(i));
const sci = per => DATA.entites.filter(e => per.entiteOk(e.nom)).map(e => e.nom);

describe('_bankRuleCompteInitial — le compte déjà choisi est repris (correction phase 4)', () => {
  it('règle créée « à froid » PENDANT un import : le compte de l\'import, lecture seule', () => {
    expect(_bankRuleCompteInitial({ importAccountId: 7 })).toEqual({ compte: '7', fixe: true, origine: 'import' });
  });
  it('à froid HORS import : sélecteur (aucun compte)', () => {
    expect(_bankRuleCompteInitial({})).toEqual({ compte: '', fixe: false, origine: 'aucun' });
    expect(_bankRuleCompteInitial({ importAccountId: null })).toMatchObject({ fixe: false });
    expect(_bankRuleCompteInitial({ importAccountId: '' })).toMatchObject({ fixe: false });
  });
  it('depuis une ligne d\'import : le compte de la ligne ; depuis un mouvement : son compte', () => {
    expect(_bankRuleCompteInitial({ lineAccountId: 3, importAccountId: 3 })).toMatchObject({ compte: '3', fixe: true, origine: 'ligne' });
    expect(_bankRuleCompteInitial({ mvAccountId: 'cpt_9' })).toEqual({ compte: 'cpt_9', fixe: true, origine: 'mouvement' });
  });
  it('le compte de la ligne/du mouvement prime sur celui de l\'import', () => {
    expect(_bankRuleCompteInitial({ mvAccountId: 'M', importAccountId: 'I' }).compte).toBe('M');
  });
  it('id 0 est un compte valide (pas « absent »)', () => {
    expect(_bankRuleCompteInitial({ importAccountId: 0 })).toMatchObject({ compte: '0', fixe: true });
  });
  it('règle existante : son compte en lecture seule ; règle historique sans compte : sélecteur, même pendant un import', () => {
    expect(_bankRuleCompteInitial({ edit: true, ruleCompte: 'A', importAccountId: 'B' })).toEqual({ compte: 'A', fixe: true, origine: 'regle' });
    expect(_bankRuleCompteInitial({ edit: true, ruleCompte: '', importAccountId: 'B' })).toEqual({ compte: '', fixe: false, origine: 'aucun' });
    expect(_bankRuleCompteInitial({ edit: true, ruleCompte: null })).toMatchObject({ fixe: false });
  });
});

describe('_bankPerimetre — le bailleur du compte limite toutes les listes', () => {
  const A = { id: 1, bailleur: 'SCI Dupont' };
  const B = { id: 2, bailleur: 'Didier Keller' };

  it('le bailleur A ne voit pas les biens de B (logements, immeubles, SCI)', () => {
    const p = _bankPerimetre(A, DATA);
    expect(p.mode).toBe('bailleur'); expect(p.limite).toBe(true); expect(p.elargi).toBe(false);
    expect(refs(p)).toEqual(['F-101', 'F-102', 'ORPH']);          // K-1 (autre bailleur) masqué
    expect(imms(p)).toEqual(['Ferrette', 'Inconnu']);              // Krutenau masqué
    expect(sci(p)).toEqual(['SCI Dupont']);
  });
  it('et réciproquement', () => {
    const p = _bankPerimetre(B, DATA);
    expect(refs(p)).toEqual(['K-1', 'ORPH']);
    expect(imms(p)).toEqual(['Krutenau', 'Inconnu']);
    expect(sci(p)).toEqual(['Didier Keller']);
  });
  it('un propriétaire INCONNU (logement sans entité, immeuble introuvable) n\'est jamais masqué en silence', () => {
    const p = _bankPerimetre(A, DATA);
    expect(p.logementOk(DATA.logements[3])).toBe(true);
    expect(p.immeubleOk('Inconnu')).toBe(true);
  });
  it('casse, accents et espaces ignorés sur le nom du bailleur', () => {
    const p = _bankPerimetre({ bailleur: '  sci DUPONT ' }, DATA);
    expect(refs(p)).toEqual(['F-101', 'F-102', 'ORPH']);
    expect(_bankPerimetre({ bailleur: 'Didier  Kéller' }, DATA).immeubleOk('Krutenau')).toBe(true);
  });
  it('immeuble partagé par deux bailleurs (même nom) : visible des deux', () => {
    const d = { entites: [{ nom: 'X', immeubles: [{ nom: 'Commun' }] }, { nom: 'Y', immeubles: [{ nom: 'Commun' }] }], logements: [] };
    expect(_bankPerimetre({ bailleur: 'X' }, d).immeubleOk('Commun')).toBe(true);
    expect(_bankPerimetre({ bailleur: 'Y' }, d).immeubleOk('Commun')).toBe(true);
    expect(_bankPerimetre({ bailleur: 'Z' }, d).immeubleOk('Commun')).toBe(false);
  });
  it('tombstones ignorés', () => {
    const d = { entites: [{ nom: 'X', immeubles: [{ nom: 'I' }], _deleted: true }], logements: [{ ref: 'L', imm: 'I', entity: 'Y', _deleted: true }] };
    expect(_bankPerimetre({ bailleur: 'Y' }, d).immeubleOk('I')).toBe(true);   // plus aucun propriétaire connu
  });

  it('compte MIXTE : plusieurs bailleurs, aucun filtre, pas d\'avertissement', () => {
    const p = _bankPerimetre({ id: 3, mixte: true, bailleur: '' }, DATA);
    expect(p.mode).toBe('mixte'); expect(p.limite).toBe(false); expect(p.warn).toBe('');
    expect(refs(p)).toEqual(['F-101', 'F-102', 'K-1', 'ORPH']);
    expect(sci(p)).toEqual(['SCI Dupont', 'Didier Keller', 'SCI Martin']);
  });
  it('compte mixte : le bailleur résiduel est ignoré (mixte gagne)', () => {
    expect(_bankPerimetre({ mixte: true, bailleur: 'SCI Dupont' }, DATA).limite).toBe(false);
  });

  it('compte à périmètre IMMEUBLE : cet immeuble seulement, SCI = son propriétaire', () => {
    const p = _bankPerimetre({ bailleur: 'SCI Dupont', scope: { niv: 'imm', cible: 'Ferrette' } }, DATA);
    expect(p.mode).toBe('imm'); expect(p.limite).toBe(true); expect(p.cible).toBe('Ferrette');
    expect(refs(p)).toEqual(['F-101', 'F-102']);                   // le logement sans immeuble n'est pas dans cet immeuble
    expect(imms(p)).toEqual(['Ferrette']);
    expect(sci(p)).toEqual(['SCI Dupont']);
  });
  it('compte mixte avec périmètre immeuble : l\'immeuble demandé est respecté', () => {
    const p = _bankPerimetre({ mixte: true, scope: { niv: 'imm', cible: 'Krutenau' } }, DATA);
    expect(p.mode).toBe('imm');
    expect(refs(p)).toEqual(['K-1']);
    expect(sci(p)).toEqual(['Didier Keller']);
  });
  it('périmètre immeuble dont le propriétaire est inconnu : les SCI ne sont pas masquées', () => {
    const p = _bankPerimetre({ scope: { niv: 'imm', cible: 'Fantôme' } }, DATA);
    expect(sci(p)).toEqual(['SCI Dupont', 'Didier Keller', 'SCI Martin']);
  });
  it('scope d\'un autre niveau (non immeuble) ignoré : on retombe sur le bailleur', () => {
    expect(_bankPerimetre({ bailleur: 'SCI Dupont', scope: { niv: 'sci', cible: 'X' } }, DATA).mode).toBe('bailleur');
  });

  it('compte SANS bailleur : comportement sûr = TOUT est proposé + avertissement (jamais de masquage silencieux)', () => {
    const p = _bankPerimetre({ id: 4, bailleur: '' }, DATA);
    expect(p.mode).toBe('sans-bailleur'); expect(p.limite).toBe(false);
    expect(p.warn).toMatch(/pas de bailleur/);
    expect(refs(p)).toEqual(['F-101', 'F-102', 'K-1', 'ORPH']);
    expect(_bankPerimetre({ bailleur: '   ' }, DATA).mode).toBe('sans-bailleur');
  });
  it('aucun compte (formulaire manuel) : tout, sans avertissement', () => {
    const p = _bankPerimetre(null, DATA);
    expect(p.mode).toBe('aucun-compte'); expect(p.limite).toBe(false); expect(p.warn).toBe('');
    expect(refs(p)).toHaveLength(4);
  });

  it('« Voir tout » : rien n\'est filtré, l\'état élargi est signalé ; sans « Voir tout » il n\'y a jamais élargissement', () => {
    const p = _bankPerimetre(A, DATA, { tout: true });
    expect(p.limite).toBe(false); expect(p.elargi).toBe(true);
    expect(refs(p)).toEqual(['F-101', 'F-102', 'K-1', 'ORPH']);
    expect(imms(p)).toEqual(['Ferrette', 'Krutenau', 'Inconnu']);
    expect(sci(p)).toEqual(['SCI Dupont', 'Didier Keller', 'SCI Martin']);
    expect(_bankPerimetre(A, DATA, { tout: false }).limite).toBe(true);
    expect(_bankPerimetre(A, DATA).limite).toBe(true);
  });
  it('« Voir tout » sur un compte mixte ou sans bailleur : pas d\'état « élargi » (rien à élargir)', () => {
    expect(_bankPerimetre({ mixte: true }, DATA, { tout: true }).elargi).toBe(false);
    expect(_bankPerimetre({ bailleur: '' }, DATA, { tout: true }).elargi).toBe(false);
  });
  it('données absentes : ne plante pas', () => {
    expect(() => _bankPerimetre(A, undefined)).not.toThrow();
    expect(_bankPerimetre(A, {}).logementOk({ ref: 'X', entity: 'Y' })).toBe(false);
  });
});

describe('_bankBauxDuPerimetre — locataires reconnus limités au bailleur du compte', () => {
  const BAUX = {
    'F-101': { ref: 'F-101', locataires: [{ nom: 'Sophie Arslan' }], hc: 700, ch: 40 },
    'F-102': { ref: 'F-102', locataires: [{ nom: 'Karim Sarar' }], hc: 650, ch: 30, cloture: true },   // ancien locataire, MÊME bailleur
    'K-1':   { ref: 'K-1',   locataires: [{ nom: 'Sophie Arslan' }], hc: 500, ch: 20 },                  // homonyme chez un AUTRE bailleur
    'GONE':  { ref: 'GONE',  locataires: [{ nom: 'Fantôme' }], cloture: true },                         // lot disparu : propriétaire inconnu
    'GONE2': { ref: 'GONE2', locataires: [{ nom: 'Autre' }], entity: 'Didier Keller', cloture: true },
  };
  const A = { bailleur: 'SCI Dupont' };

  it('bailleur A : ses baux (clos compris), pas ceux de B', () => {
    const out = _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA));
    expect(Object.keys(out)).toEqual(['F-101', 'F-102', 'GONE']);   // F-102 (clos, même bailleur) gardé ; K-1 et GONE2 (entité B) écartés
  });
  it('l\'ancien locataire (bail clos) du MÊME bailleur reste candidat', () => {
    const out = _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA));
    expect(out['F-102'].cloture).toBe(true);
  });
  it('« Voir tout » / compte mixte / sans bailleur : tous les baux', () => {
    expect(Object.keys(_bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA, { tout: true })))).toHaveLength(5);
    expect(Object.keys(_bankBauxDuPerimetre(BAUX, _bankPerimetre({ mixte: true }, DATA)))).toHaveLength(5);
    expect(Object.keys(_bankBauxDuPerimetre(BAUX, _bankPerimetre({ bailleur: '' }, DATA)))).toHaveLength(5);
  });
  it('sans périmètre : tout ; l\'entrée n\'est pas modifiée', () => {
    const copie = JSON.stringify(BAUX);
    expect(Object.keys(_bankBauxDuPerimetre(BAUX, null))).toHaveLength(5);
    _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA));
    expect(JSON.stringify(BAUX)).toBe(copie);
  });
  it('la proposition « locataire reconnu » ne mélange plus les bailleurs (homonyme chez B)', () => {
    const line = { libelle: 'VIR M SOPHIE ARSLAN LOYER', date: '2026-09-05', credit: 600, debit: 0 };
    const tous = _bankMatchHeuristic(line, { baux: BAUX });
    expect(tous.ambiguous).toBe(true);                               // avant : F-101 et K-1 côte à côte
    expect(tous.candidates.map(c => c.ref).sort()).toEqual(['F-101', 'K-1']);
    const perA = _bankMatchHeuristic(line, { baux: _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA)) });
    expect(perA.ambiguous).toBe(false);
    expect(perA.qui).toBe('F-101');
    // « Voir tout » (ponctuel) redonne le comportement d'avant
    const voirTout = _bankMatchHeuristic(line, { baux: _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA, { tout: true })) });
    expect(voirTout.ambiguous).toBe(true);
  });
  it('un virement de l\'ancien locataire du même bailleur est toujours reconnu', () => {
    const line = { libelle: 'VIR KARIM SARAR ARRIERES', date: '2026-09-05', credit: 300, debit: 0 };
    const perA = _bankMatchHeuristic(line, { baux: _bankBauxDuPerimetre(BAUX, _bankPerimetre(A, DATA)) });
    expect(perA.qui).toBe('F-102');
    expect(perA.source).toMatch(/ancien locataire/);
  });
});

// ─── C. Catégorie « Prêt — Assurance emprunteur » (D1) ──────────────────────────────────────────
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const part1 = fs.readFileSync(path.join(root, 'js', 'app', 'app-part1.js'), 'utf8').replace(/\r/g, '');
function referentiel() {
  const i = part1.indexOf('const STD_CATEGORIES = [');
  const j = part1.indexOf('\n];', i);
  if (i === -1 || j === -1) throw new Error('STD_CATEGORIES introuvable');
  return new Function(part1.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')();
}

describe('Catégorie « Prêt — Assurance emprunteur » (D1)', () => {
  const STD = referentiel();
  const AE = STD.find(c => c.nom === 'Prêt — Assurance emprunteur');
  const INT = STD.find(c => c.nom === "Prêt — Intérêts d'emprunt");

  it('existe, VISIBLE dans le sélecteur (ni pickerHidden ni auto), figée comme les autres standards', () => {
    expect(AE).toBeTruthy();
    expect(AE.pickerHidden).toBeFalsy(); expect(AE.auto).toBeFalsy();
    expect(AE).toMatchObject({ editable: false, deletable: false, std: true });
  });
  it('même famille que les intérêts : ligne 250, type « interet », niveau immeuble', () => {
    expect(AE).toMatchObject({ ligne2044: '250', type: INT.type, niv: INT.niv });
    expect(AE.type).toBe('interet'); expect(AE.niv).toBe('imm');
  });
  it('description honnête : double compte possible avec l\'attestation annuelle', () => {
    expect(AE.descHors).toBe("Assurance emprunteur prélevée à part de l'échéance. Si ta banque l'inclut déjà dans l'attestation annuelle d'intérêts, ne la saisis pas ici (double compte).");
  });
  it('« Prêt — Intérêts d\'emprunt » reste la PREMIÈRE catégorie de la ligne 250 (_finStdByLigne) et reste cachée', () => {
    expect(STD.find(c => c.ligne2044 === '250').nom).toBe("Prêt — Intérêts d'emprunt");
    expect(INT.pickerHidden).toBe(true);
  });
  it('le sélecteur la range dans le groupe « Prêt » (nom en « Prêt », ni recette, ni charge, ni récupérable)', () => {
    expect(AE.type !== 'recette' && AE.type !== 'charge' && !AE.recup && /^Prêt/.test(AE.nom)).toBe(true);
  });
  it('2044 : l\'assurance est comptée en ligne 250 avec les intérêts, pas en charge', () => {
    const mvts = [
      { id: 1, date: '2026-12-31', db: 1200, cr: 0, cat: "Prêt — Intérêts d'emprunt", qui: 'SCI:SCI Dupont' },
      { id: 2, date: '2026-03-05', db: 18.4, cr: 0, cat: 'Prêt — Assurance emprunteur', qui: 'SCI:SCI Dupont' },
      { id: 3, date: '2026-04-05', db: 18.4, cr: 0, cat: 'Prêt — Assurance emprunteur', qui: 'SCI:SCI Dupont' },
    ];
    const r = _compute2044(mvts, STD, { entityNom: 'SCI Dupont' });
    expect(r.lignes['250']).toBeCloseTo(1236.8, 2);
    expect(r.totalInterets).toBeCloseTo(1236.8, 2);
    expect(r.totalCharges).toBe(0);
    expect(r.nonMappes).toEqual([]);
  });
  it('le gel du référentiel : un seul objet figé (window.STD_CATEGORIES est la MÊME constante)', () => {
    expect(part1).toMatch(/STD_CATEGORIES\.forEach\(Object\.freeze\);\s*window\.STD_CATEGORIES = Object\.freeze\(STD_CATEGORIES\);/);
  });
  it('noms uniques dans le référentiel', () => {
    const noms = STD.map(c => c.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });
  it('une icône SVG lui est dédiée', () => {
    expect(part1).toContain("'Prêt — Assurance emprunteur': '<path");
  });
});

// ─── Gardes de source : le branchement de l'app ─────────────────────────────────────────────────
describe('Branchement app (gardes de source)', () => {
  const p2 = fs.readFileSync(path.join(root, 'js', 'app', 'app-part2.js'), 'utf8').replace(/\r/g, '');
  it('A. la fenêtre règle reprend le compte via _bankRuleCompteInitial (import en cours compris)', () => {
    expect(p2).toMatch(/window\._bankRuleCompteInitial\(\{ edit: false,[\s\S]{0,260}importAccountId: imp \? _currentBankAccount\.id : null \}\)/);
    expect(p2).toMatch(/compte, compteFixe: ci\.fixe, compteOrigine: ci\.origine/);
  });
  it('B. un seul calcul de périmètre : le module pur, pour la zone d\'affectation, le sélecteur d\'immeuble et les baux', () => {
    expect(part1).toMatch(/return window\._bankPerimetre\(acct, \{ entites: DB\.entites \|\| \[\], logements: DB\.logements \|\| \[\] \}, \{ tout: !!_affToutPar\[tgt\] \}\);/);
    expect(p2).toMatch(/return perimetre \? window\._bankBauxDuPerimetre\(out, perimetre\) : out;/);
    expect(p2).toContain('_bankPerimetreImport(!!(line && line._bauxTout))');
    expect(p2).toMatch(/_perBar\.immeubleOk\(im\)/);
  });
  it('B. plus aucune règle « ne JAMAIS scoper les règles » : le picker de logement filtre par le périmètre du compte', () => {
    expect(part1).not.toMatch(/ne JAMAIS scoper/);
    expect(part1).toMatch(/function _affPkListHtml\(id, tgt, q\) \{[\s\S]{0,900}per\.logementOk\(l\)/);
  });
  it('B. chaque liste filtrée offre « Voir tout » (zone d\'affectation, picker, proposition de locataire)', () => {
    expect(part1).toContain('_affPerimToggle');
    expect(part1).toContain('Voir tout');
    expect(p2).toContain('Chercher chez tous les bailleurs');
    expect(p2).toContain('function _bankProposTout(i, on)');
  });
  it('B. « Voir tout » retombe à chaque nouvelle revue / ouverture de règle / changement de compte', () => {
    expect((p2.match(/_affToutPar = \{\}/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(p2).toContain('delete _affToutPar.brule');
  });
  it('B. les sites liés à un compte (import, règle, découpage, fiche mouvement, Finances) résolvent leur compte', () => {
    for (const t of ['/^imp\\d+$/.test(t)', "t === 'brule'", '/^sp\\d+$/.test(t)', "t === 'mv'", "t === 'fdrAff'"]) expect(part1).toContain(t);
    expect(p2).toContain('window._fdrAffMvId = nvIds.length ? nvIds[0] : null');
  });
  it('B. tout texte venant du bailleur / de l\'immeuble est échappé dans les bandeaux', () => {
    expect(part1).toContain("escHtml(qui)");
    expect(p2).toContain("escHtml(per.warn)");
  });
});
