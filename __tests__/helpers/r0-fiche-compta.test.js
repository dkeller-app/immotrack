/**
 * R0-G — la fiche logement classait l'argent sur le LIBELLÉ, pas au référentiel.
 *
 * `/loyer/i.test(m.cat)` se trompait dans les deux sens :
 *  · l'« Indemnité GLI / loyers impayés » (ligne 2044 n° 213, une recette diverse) passait pour
 *    un loyer encaissé, alors que Finances la range ailleurs ;
 *  · et le complément `!/loyer/i` comptait comme CHARGE du lot tout débit dont le libellé ne
 *    contient pas le mot — restitution de dépôt de garantie, virement interne, acquisition.
 *
 * CDC-FINANCES §0bis : une seule définition de l'argent. Ces tests EXÉCUTENT le classifieur
 * extrait d'index.html contre le référentiel réel de l'app.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) return null;
  const j = html.indexOf('\n}', i);
  return j === -1 ? null : html.slice(i, j + 2);
};

/**
 * Le référentiel RÉEL de l'app, relevé dans le navigateur sur `window.STD_CATEGORIES`
 * (23 entrées). C'est lui qui donne son sens au classement — un faux inventé ici ne
 * prouverait rien.
 */
const STD = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Indemnité GLI / loyers impayés', ligne2044: '213', type: 'recette' },
  { nom: 'Recettes diverses', ligne2044: '213', type: 'recette' },
  { nom: 'Frais de gestion / honoraires / comptabilité', ligne2044: '221', type: 'charge' },
  { nom: "Primes d'assurance (PNO, GLI)", ligne2044: '223', type: 'charge' },
  { nom: 'Travaux (entretien, réparation, amélioration)', ligne2044: '224', type: 'charge' },
  { nom: 'Travaux de rénovation énergétique', ligne2044: '224bis', type: 'charge' },
  { nom: 'Charges récupérables non récupérées', ligne2044: '225', type: 'charge' },
  { nom: "Indemnités d'éviction / relogement", ligne2044: '226', type: 'charge' },
  { nom: 'Taxe foncière (et taxes annexes)', ligne2044: '227', type: 'charge' },
  { nom: 'Charges de copropriété', ligne2044: '229', type: 'charge' },
  { nom: 'Régularisation provisions copro N-1', ligne2044: '230', type: 'charge' },
  { nom: "Prêt — Intérêts d'emprunt", ligne2044: '250', type: 'charge' },
  { nom: 'Charges récupérables (eau, énergie…)', ligne2044: '', type: 'special', recup: true },
  { nom: 'CFE / taxe logements vacants', ligne2044: '', type: 'special', gestionCharge: true },
  { nom: 'Prêt', ligne2044: '', type: 'special' },
  { nom: 'Frais bancaires', ligne2044: '', type: 'special' },
  { nom: 'Acquisition / cession de bien', ligne2044: '', type: 'special' },
  { nom: 'Dépôt de garantie (reçu / restitué)', ligne2044: '', type: 'special' },
  { nom: 'Virement interne (non déclarable)', ligne2044: '', type: 'special' },
  { nom: 'CCA / distribution SCI', ligne2044: '', type: 'special' },
  { nom: 'Divers (non déductible)', ligne2044: '', type: 'special' },
  { nom: 'Acompte de charges (départ)', ligne2044: '', type: 'special' }
];

/** Extrait le classifieur d'index.html et l'exécute. `alias` simule `DB.catAlias`. */
function charger(alias) {
  const src = [corpsDe('_finLotCatRole'), corpsDe('_finLotEstLoyer'), corpsDe('_finLotEstCharge')].join('\n');
  if (src.includes('null\nnull')) throw new Error('classifieur introuvable');
  const _finCatMere = (nom) => {
    if (!nom) return null;
    const std = STD.find(c => c.nom === nom);
    if (std) return std;
    const m = (alias || {})[nom];
    return m ? (STD.find(c => c.nom === m) || null) : null;
  };
  return new Function('_finCatMere', src + '\nreturn { _finLotCatRole, _finLotEstLoyer, _finLotEstCharge };')(_finCatMere);
}

describe('_finLotCatRole — le référentiel répond, jamais le libellé', () => {
  let M; beforeAll(() => { M = charger(); });

  it('« Loyers encaissés » est un loyer', () => {
    expect(M._finLotCatRole('Loyers encaissés')).toBe('loyer');
  });

  it('« Indemnité GLI / loyers impayés » n’est PAS un loyer — le libellé mentait', () => {
    // Le mot « loyers » est dans le nom : `/loyer/i` la comptait en loyer encaissé, alors que
    // Finances la range en recette diverse (ligne 213). Deux écrans, deux chiffres.
    expect(M._finLotCatRole('Indemnité GLI / loyers impayés')).toBe('recette');
    expect(M._finLotEstLoyer({ cat: 'Indemnité GLI / loyers impayés' })).toBe(false);
  });

  it('un dépôt de garantie restitué n’est PAS une charge du lot', () => {
    // `!/loyer/i` le comptait : restituer 1 500 € faisait chuter le « Solde » du lot d'autant.
    expect(M._finLotCatRole('Dépôt de garantie (reçu / restitué)')).toBe(null);
    expect(M._finLotEstCharge({ cat: 'Dépôt de garantie (reçu / restitué)' })).toBe(false);
  });

  it('un virement interne, une acquisition, un CCA ne sont pas des charges', () => {
    for (const c of ['Virement interne (non déclarable)', 'Acquisition / cession de bien', 'CCA / distribution SCI']) {
      expect(M._finLotEstCharge({ cat: c }), c).toBe(false);
    }
  });

  it('l’échéance de prêt est une charge ENTIÈRE, ses intérêts n’en sont pas une de plus', () => {
    // Le moteur compte la mensualité entière (`isEcheance` → `b.pret`, dans les charges) et
    // traite la ligne 250 comme une ventilation fiscale. La compter aussi doublerait.
    expect(M._finLotCatRole('Prêt')).toBe('charge');
    expect(M._finLotCatRole("Prêt — Intérêts d'emprunt")).toBe(null);
  });

  it('les charges récupérables directes et la CFE comptent, bien qu’elles n’aient pas de ligne 2044', () => {
    expect(M._finLotCatRole('Charges récupérables (eau, énergie…)')).toBe('charge');
    expect(M._finLotCatRole('CFE / taxe logements vacants')).toBe('charge');
  });

  it('toutes les lignes de charge 221→230 comptent', () => {
    const attendu = ['Frais de gestion / honoraires / comptabilité', "Primes d'assurance (PNO, GLI)",
      'Travaux (entretien, réparation, amélioration)', 'Travaux de rénovation énergétique',
      'Charges récupérables non récupérées', "Indemnités d'éviction / relogement",
      'Taxe foncière (et taxes annexes)', 'Charges de copropriété', 'Régularisation provisions copro N-1'];
    for (const c of attendu) expect(M._finLotCatRole(c), c).toBe('charge');
  });

  it('une catégorie PERSO hérite du rôle de sa mère', () => {
    // Règle M-1 : toute catégorie perso est un alias d'une des 23 mères. Le libellé ne dit rien.
    const A = charger({ 'Virement CB Marie': 'Loyers encaissés', 'Sinistre dégât des eaux': 'Indemnité GLI / loyers impayés' });
    expect(A._finLotCatRole('Virement CB Marie')).toBe('loyer');       // aucun « loyer » dans le nom
    expect(A._finLotCatRole('Sinistre dégât des eaux')).toBe('recette');
  });

  it('une catégorie rattachée à rien reste hors résultat, comme dans le moteur', () => {
    expect(M._finLotCatRole('Truc jamais classé')).toBe(null);
  });

  it('entrées dégradées : jamais d’exception', () => {
    expect(M._finLotCatRole(null)).toBe(null);
    expect(M._finLotCatRole('')).toBe(null);
    expect(M._finLotEstLoyer(null)).toBe(false);
    expect(M._finLotEstCharge(undefined)).toBe(false);
  });
});

describe('Le « Solde » de la fiche logement — la formule, sur un cas réel', () => {
  let M; beforeAll(() => { M = charger(); });

  it('une année avec loyers, GLI et restitution de dépôt', () => {
    const mvts = [
      { cat: 'Loyers encaissés', cr: 9000, db: 0 },
      { cat: 'Indemnité GLI / loyers impayés', cr: 900, db: 0 },   // recette, pas un loyer
      { cat: 'Charges de copropriété', cr: 0, db: 1200 },
      { cat: 'Taxe foncière (et taxes annexes)', cr: 0, db: 800 },
      { cat: 'Dépôt de garantie (reçu / restitué)', cr: 0, db: 1500 }, // ni charge, ni recette
      { cat: 'Virement interne (non déclarable)', cr: 0, db: 3000 }
    ];
    // La formule exacte de la fiche (`_renderLogFicheHeroStats`).
    const enc = mvts.filter(M._finLotEstLoyer).reduce((s, m) => s + (+m.cr || 0), 0);
    const dep = mvts.filter(m => M._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + (+m.db || 0), 0);
    expect(enc).toBe(9000);
    expect(dep).toBe(2000);
    expect(enc - dep).toBe(7000);

    // Ce que la règle du libellé donnait : +900 € de GLI comptés en loyer, et 4 500 € de dépôt
    // et de virement interne comptés en charges. Soit 3 600 € d'écart sur le solde affiché.
    const encAvant = mvts.filter(m => /loyer/i.test(m.cat || '')).reduce((s, m) => s + (+m.cr || 0), 0);
    const depAvant = mvts.filter(m => !/loyer/i.test(m.cat || '')).reduce((s, m) => s + (+m.db || 0), 0);
    expect(encAvant).toBe(9900);
    expect(depAvant).toBe(6500);
    expect(encAvant - depAvant).toBe(3400);
  });
});

describe('Aucune surface d’argent ne reclasse sur le libellé', () => {
  it('plus aucun `/loyer/i` exécuté dans index.html', () => {
    // Il n'en reste qu'un, dans le commentaire de `_finLotCatRole` qui raconte le défaut.
    const sansCommentaires = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(sansCommentaires).not.toMatch(/\/loyer\/i/);
  });

  it('les quatre sites corrigés appellent bien le lecteur partagé', () => {
    for (const nom of ['_computeComptaBailleur', '_renderLogFicheHeroStats', '_renderComptaKPIsForLog']) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' introuvable — le test ne teste plus rien').toBeTruthy();
      expect(corps, nom + ' ne lit plus le référentiel').toMatch(/_finLotEst(Loyer|Charge)/);
    }
  });
});
