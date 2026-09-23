/**
 * R0-G — la fiche logement classait l'argent sur le LIBELLÉ, pas au référentiel.
 *
 * `/loyer/i.test(m.cat)` se trompait dans les deux sens :
 *  · l'« Indemnité GLI / loyers impayés » (ligne 2044 n° 213, une recette diverse) passait pour
 *    un loyer encaissé, alors que Finances la range ailleurs ;
 *  · et le complément `!/loyer/i` comptait comme CHARGE du lot tout débit dont le libellé ne
 *    contient pas le mot — restitution de dépôt de garantie, virement interne, acquisition.
 *
 * ⚠️ Le référentiel N'EST PAS recopié ici : il est LU dans index.html. Une première version de
 * ce fichier en gardait une copie, qui s'est révélée fausse sur trois entrées — et le test
 * « prouvait » alors une croyance fausse, reprise telle quelle dans un message de commit.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

/** Le corps d'une fonction du monolithe, du `function X(` à son `\n}`. */
const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) return null;
  const j = html.indexOf('\n}', i);
  return j === -1 ? null : html.slice(i, j + 2);
};

/** LE référentiel de l'app, évalué depuis index.html — jamais une copie. */
function referentiel() {
  const i = html.indexOf('const STD_CATEGORIES = [');
  const j = html.indexOf('\n];', i);
  if (i === -1 || j === -1) throw new Error('STD_CATEGORIES introuvable — le test ne teste plus rien');
  return new Function(html.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')();
}

/**
 * Extrait les trois lecteurs d'index.html et les exécute. La tranche est délimitée par ses
 * deux bouts exacts : `corpsDe` coupe au premier `\n}`, ce qui avalerait la fonction suivante.
 */
function charger(alias) {
  const debut = 'function _finLotCatRole(';
  const fin = "function _finLotEstCharge(m) { return _finLotCatRole(m && m.cat) === 'charge'; }";
  const i = html.indexOf(debut), j = html.indexOf(fin, i);
  if (i === -1 || j === -1) throw new Error('lecteurs introuvables — le test ne teste plus rien');
  const src = html.slice(i, j + fin.length);
  const STD = referentiel();
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
  let M, STD;
  beforeAll(() => { M = charger(); STD = referentiel(); });

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
    // Le moteur compte la mensualité entière (`isEcheance` → `b.pret`, dans les charges) et met
    // les intérêts dans `b.interets`, qui n'entre ni dans `charges` ni dans `cashflowReel`.
    expect(M._finLotCatRole('Prêt')).toBe('charge');
    expect(M._finLotCatRole("Prêt — Intérêts d'emprunt")).toBe(null);
  });

  it('les frais bancaires SONT une charge — c’est la seule entrée qui porte `gestionCharge`', () => {
    // Le moteur les compte (`b.gestionHF`, inclus dans `b.charges`). Un commentaire du dépôt
    // prétend le contraire en parlant de « CFE / taxe vacance » : ce libellé est périmé.
    const flagues = STD.filter(c => c.gestionCharge).map(c => c.nom);
    expect(flagues).toEqual(['Frais bancaires']);
    expect(M._finLotCatRole('Frais bancaires')).toBe('charge');
  });

  it('les charges récupérables directes comptent, bien qu’elles n’aient pas de ligne 2044', () => {
    const recup = STD.filter(c => c.recup).map(c => c.nom);
    expect(recup.length).toBe(1);
    expect(M._finLotCatRole(recup[0])).toBe('charge');
  });

  it('toute catégorie de ligne 221→230 compte en charge — balayage du référentiel entier', () => {
    const lignesCharge = ['221', '223', '224', '224bis', '225', '226', '227', '229', '230'];
    const vues = STD.filter(c => lignesCharge.includes(c.ligne2044));
    expect(vues.length).toBeGreaterThan(5);
    for (const c of vues) expect(M._finLotCatRole(c.nom), c.nom).toBe('charge');
  });

  it('les postes « non déductibles » sortent du solde — et c’est assumé, pas un oubli', () => {
    // Ce sont de vraies sorties d'argent que le moteur ne compte pas. La fiche suit le moteur.
    for (const c of ['Travaux de construction / agrandissement (non déductible)', 'Divers (non déductible)']) {
      expect(M._finLotEstCharge({ cat: c }), c).toBe(false);
    }
  });

  it('aucune catégorie du référentiel ne fait planter le classifieur', () => {
    for (const c of STD) {
      expect(() => M._finLotCatRole(c.nom), c.nom).not.toThrow();
      expect(['loyer', 'recette', 'charge', null]).toContain(M._finLotCatRole(c.nom));
    }
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

  const MVTS = [
    { cat: 'Loyers encaissés', cr: 9000, db: 0 },
    { cat: 'Indemnité GLI / loyers impayés', cr: 900, db: 0 },   // recette, pas un loyer
    { cat: 'Charges de copropriété', cr: 0, db: 1200 },
    { cat: 'Taxe foncière (et taxes annexes)', cr: 0, db: 800 },
    { cat: 'Dépôt de garantie (reçu / restitué)', cr: 0, db: 1500 }, // ni charge, ni recette
    { cat: 'Virement interne (non déclarable)', cr: 0, db: 3000 }
  ];

  it('le solde ne compte plus le dépôt restitué ni le virement interne', () => {
    const enc = MVTS.filter(M._finLotEstLoyer).reduce((s, m) => s + (+m.cr || 0), 0);
    const dep = MVTS.filter(m => M._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + (+m.db || 0), 0);
    expect(enc).toBe(9000);
    expect(dep).toBe(2000);
    expect(enc - dep).toBe(7000);

    // Ce que la règle du libellé donnait : +900 € de GLI comptés en loyer, et 4 500 € de dépôt
    // et de virement interne comptés en charges. Soit 3 600 € d'écart sur le solde affiché.
    const encAvant = MVTS.filter(m => /loyer/i.test(m.cat || '')).reduce((s, m) => s + (+m.cr || 0), 0);
    const depAvant = MVTS.filter(m => !/loyer/i.test(m.cat || '')).reduce((s, m) => s + (+m.db || 0), 0);
    expect(encAvant - depAvant).toBe(3400);
  });

  it('le graphe du même panneau somme EXACTEMENT au « Solde net » affiché au-dessus', () => {
    // Le graphe est rendu 30 px sous les KPI. Il sommait tous les cr et tous les db sans rien
    // classer : après R0-G, il annonçait 3 400 € là où le KPI disait 7 000 €.
    const parMois = [1, 2].map(mo => {
      const duMois = mo === 1 ? MVTS.slice(0, 3) : MVTS.slice(3);
      const cr = duMois.filter(M._finLotEstLoyer).reduce((s, m) => s + (+m.cr || 0), 0);
      const db = duMois.filter(m => M._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + (+m.db || 0), 0);
      return cr - db;
    });
    expect(parMois.reduce((a, b) => a + b, 0)).toBe(7000);
  });

  it('la source du graphe est bien celle des KPI, pas une somme brute', () => {
    const corps = corpsDe('_renderComptaCashFlowChart');
    expect(corps).toBeTruthy();
    expect(corps, 'le graphe est reparti sur une somme brute').toMatch(/_finLotEstLoyer/);
    expect(corps).toMatch(/_finLotEstCharge/);
    expect(corps, 'les mouvements supprimés sont recomptés').toMatch(/filter\(_isAlive\)/);
    expect(corps, 'la quote-part des compteurs collectifs manque').toMatch(/_lotCcQuotePartMois/);
  });
});

describe('Aucune surface d’argent ne reclasse sur le libellé', () => {
  it('plus aucun `/loyer/i` exécuté dans index.html', () => {
    // Il n'en reste qu'un, dans le commentaire de `_finLotCatRole` qui raconte le défaut.
    const sansCommentaires = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(sansCommentaires).not.toMatch(/\/loyer\/i/);
  });

  it('les trois sites corrigés appellent le lecteur partagé', () => {
    for (const nom of ['_computeComptaBailleur', '_renderLogFicheHeroStats', '_renderComptaKPIsForLog']) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' introuvable — le test ne teste plus rien').toBeTruthy();
      expect(corps, nom + ' ne lit plus le référentiel').toMatch(/_finLotEst(Loyer|Charge)/);
    }
  });

  it('la quote-part des compteurs collectifs n’est plus recopiée d’un écran à l’autre', () => {
    // Le héro de la fiche et les KPI de son onglet Compta en avaient chacun leur copie — la même
    // boucle sur les compteurs collectifs de l'immeuble, à 2 000 lignes d'écart. Le graphe du
    // même panneau, lui, n'en avait aucune et sous-estimait donc les charges.
    // (Les autres appels de `_calcCcQuotePart` — panneau Charges de l'immeuble, liste des
    //  mouvements d'un lot — sont d'autres surfaces, pas des copies de celle-ci.)
    for (const nom of ['_renderLogFicheHeroStats', '_renderComptaKPIsForLog', '_renderComptaCashFlowChart']) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' introuvable').toBeTruthy();
      expect(corps, nom + ' a repris sa propre copie de la boucle').not.toMatch(/_calcCcQuotePart\(/);
      expect(corps, nom + ' ne lit plus la quote-part').toMatch(/_lotCcQuotePartMois\(/);
    }
  });
});
