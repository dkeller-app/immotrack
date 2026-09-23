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
  const dNet = 'function _finLotNet(', fNet = "\n}";
  const iN = html.indexOf(dNet), jN = html.indexOf(fNet, iN);
  if (iN === -1 || jN === -1) throw new Error('_finLotNet introuvable — le test ne teste plus rien');
  const src = html.slice(i, j + fin.length) + '\n' + html.slice(iN, jN + fNet.length);
  const STD = referentiel();
  const _finCatMere = (nom) => {
    if (!nom) return null;
    const std = STD.find(c => c.nom === nom);
    if (std) return std;
    const m = (alias || {})[nom];
    return m ? (STD.find(c => c.nom === m) || null) : null;
  };
  return new Function('_finCatMere', src + '\nreturn { _finLotCatRole, _finLotEstLoyer, _finLotEstCharge, _finLotNet };')(_finCatMere);
}

describe('_finLotCatRole — le référentiel répond, jamais le libellé', () => {
  let M, STD;
  beforeAll(() => { M = charger(); STD = referentiel(); });

  it('le référentiel lu est bien le référentiel entier', () => {
    // Sans ce compte, « balaie les 23 entrées réelles » reste une affirmation invérifiable :
    // une extraction tronquée passerait pour un référentiel complet.
    expect(STD.length).toBe(23);
    expect(STD.every(c => c && typeof c.nom === 'string' && c.nom)).toBe(true);
  });

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
    // La formule de l'écran, au NET — recopier `(+m.cr||0)` ici rejouerait la version périmée.
    const enc = MVTS.filter(M._finLotEstLoyer).reduce((s, m) => s + M._finLotNet(m), 0);
    const dep = MVTS.filter(m => M._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + M._finLotNet(m, 'charge'), 0);
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
    // Refaire l'addition à la main des deux côtés ne prouverait rien : (a₁+a₂)−(b₁+b₂) égale
    // (a₁−b₁)+(a₂−b₂) pour n'importe quel classifieur. On EXÉCUTE donc les deux fonctions du
    // monolithe, avec la quote-part des compteurs collectifs — c'est elle que le graphe
    // n'avait pas, et c'est par là que l'écart revenait.
    const mvts = MVTS.map((m, i) => ({ ...m, id: 'm' + i, qui: 'A-1', date: '2026-0' + (i + 1) + '-05' }));
    const ccParMois = [0, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // 300 € de quote-part en mars
    const M2 = charger();

    const soldeKpi = mvts.filter(M2._finLotEstLoyer).reduce((s, m) => s + M2._finLotNet(m), 0)
      - (mvts.filter(m => M2._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + M2._finLotNet(m, 'charge'), 0)
         + ccParMois.reduce((a, b) => a + b, 0));

    const sommeBarres = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((total, mo) => {
      const duMois = mvts.filter(m => m.date.slice(5, 7) === String(mo).padStart(2, '0'));
      const cr = duMois.filter(M2._finLotEstLoyer).reduce((s, m) => s + M2._finLotNet(m), 0);
      const db = duMois.filter(m => M2._finLotEstCharge(m) && !m.compteurCcId).reduce((s, m) => s + M2._finLotNet(m, 'charge'), 0)
        + (ccParMois[mo - 1] || 0);
      return total + (cr - db);
    }, 0);

    expect(soldeKpi).toBe(6700);       // 7 000 € moins la quote-part de mars
    expect(sommeBarres).toBe(soldeKpi);
  });

  it('un loyer RENDU au locataire ne s’évapore pas du solde', () => {
    // Le moteur travaille en net (`cr − db` sur la ligne 211). Les surfaces sommaient `cr` seul :
    // un trop-perçu restitué — un DÉBIT sur « Loyers encaissés » — n'était compté nulle part,
    // ni en moins-value de loyer, ni en charge. 900 € disparaissaient.
    const mvts = [
      { cat: 'Loyers encaissés', cr: 10800, db: 0 },
      { cat: 'Loyers encaissés', cr: 0, db: 900 }   // trop-perçu rendu en avril
    ];
    const enc = mvts.filter(M._finLotEstLoyer).reduce((s, m) => s + M._finLotNet(m), 0);
    expect(enc).toBe(9900);
    const encAvant = mvts.filter(M._finLotEstLoyer).reduce((s, m) => s + (+m.cr || 0), 0);
    expect(encAvant).toBe(10800);   // ce que l'ancienne somme donnait
  });

  it('une indemnité d’assurance vient en déduction des travaux, comme dans Finances', () => {
    const mvts = [
      { cat: 'Travaux (entretien, réparation, amélioration)', cr: 0, db: 2000 },
      { cat: 'Travaux (entretien, réparation, amélioration)', cr: 800, db: 0 }  // remboursement
    ];
    const dep = mvts.filter(M._finLotEstCharge).reduce((s, m) => s + M._finLotNet(m, 'charge'), 0);
    expect(dep).toBe(1200);
  });

  it('`_finLotNet` ne rend jamais NaN sur des entrées dégradées', () => {
    expect(M._finLotNet(null)).toBe(0);
    expect(M._finLotNet({})).toBe(0);
    expect(M._finLotNet({ cr: 'abc', db: null }, 'charge')).toBe(0);
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

describe('La quote-part des compteurs collectifs — exécutée, pas relue', () => {
  /** Extrait `_lotCcQuotePartMois` d'index.html et l'exécute avec des dépendances contrôlées. */
  function quotePart(mouvements, estCharge) {
    const src = corpsDe('_lotCcQuotePartMois');
    if (!src) throw new Error('helper introuvable — le test ne teste plus rien');
    const M = charger();
    const DB = {
      logements: [{ ref: 'A-1', imm: 'Résidence' }, { ref: 'A-2', imm: 'Résidence' }],
      mouvements,
      entites: [{ immeubles: [{ nom: 'Résidence', compteursCollectifs: [{ id: 'cc1' }] }] }]
    };
    const noms = ['DB', '_isAlive', '_ccLogsInScope', '_calcCcQuotePart', '_finLotEstCharge', '_finLotNet'];
    const f = new Function(...noms, src + '\nreturn _lotCcQuotePartMois;');
    return f(DB,
      (x) => !!x && !x._deleted,
      (cc, lots) => lots,
      () => ({ ratio: 0.25, exclu: false }),
      estCharge || M._finLotEstCharge,
      M._finLotNet)('A-1', 2026);
  }

  it('un AVOIR du fournisseur vient en déduction de la quote-part', () => {
    // Le helper sommait `m.db` seul : l'avoir était ignoré et le lot payait trop.
    const r = quotePart([
      { id: 'a', compteurCcId: 'cc1', date: '2026-03-10', db: 1200, cr: 0, cat: 'Charges récupérables (eau, énergie…)' },
      { id: 'b', compteurCcId: 'cc1', date: '2026-06-10', db: 0, cr: 300, cat: 'Charges récupérables (eau, énergie…)' }
    ]);
    expect(r[2]).toBe(300);      // mars : 25 % de 1 200
    expect(r[5]).toBe(-75);      // juin : 25 % de −300
    expect(r.reduce((a, b) => a + b, 0)).toBe(225);   // net, pas 300
  });

  it('un mouvement de compteur non rattaché au référentiel est RETENU, pas perdu', () => {
    const r = quotePart([
      { id: 'a', compteurCcId: 'cc1', date: '2026-03-10', db: 1200, cr: 0, cat: 'Charges récupérables (eau, énergie…)' },
      { id: 'z', compteurCcId: 'cc1', date: '2026-04-10', db: 800, cr: 0, cat: 'TRUC NON RATTACHÉ' }
    ]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(300);          // le non classé n'entre pas
    expect(r.nonClasses.map(m => m.id)).toEqual(['z']);      // mais il est signalé
  });

  it('un mouvement supprimé ou hors année ne compte pas', () => {
    const r = quotePart([
      { id: 'a', compteurCcId: 'cc1', date: '2026-03-10', db: 1200, cr: 0, cat: 'Charges récupérables (eau, énergie…)', _deleted: true },
      { id: 'b', compteurCcId: 'cc1', date: '2025-03-10', db: 800, cr: 0, cat: 'Charges récupérables (eau, énergie…)' }
    ]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(0);
    expect(r.nonClasses.length).toBe(0);
  });

  it('une date tronquée ne crée pas d’entrée fantôme', () => {
    // `NaN < 0` et `NaN > 11` sont tous deux faux : l'ancien garde ne gardait rien.
    const r = quotePart([{ id: 'a', compteurCcId: 'cc1', date: '2026', db: 1200, cr: 0, cat: 'Charges récupérables (eau, énergie…)' }]);
    expect(r.length).toBe(12);
    expect(r.every(v => typeof v === 'number' && !Number.isNaN(v))).toBe(true);
    expect(r.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('Le « manque à gagner » du lot — borné à ce qui était attendu', () => {
  /** Exécute les deux lignes du monolithe qui le calculent. */
  function manque(loyerAttendu, loyersEnc) {
    const i = html.indexOf('  const manqueAGagner = Math.min(');
    const fin = '    : 0;';
    const j = html.indexOf(fin, i);
    if (i === -1 || j === -1) throw new Error('calcul introuvable — le test ne teste plus rien');
    return new Function('loyerAttendu', 'loyersEnc',
      html.slice(i, j + fin.length) + '\nreturn { manqueAGagner, vacancePct };')(loyerAttendu, loyersEnc);
  }

  it('un trop-perçu restitué ne fait pas manquer PLUS que ce qui était attendu', () => {
    // `loyersEnc` est un net depuis le passage au signe : −900 € donnait un manque de 9 000 €
    // sur 8 100 € attendus, et un « % » de 111 écrêté en silence à 100.
    const r = manque(8100, -900);
    expect(r.manqueAGagner).toBe(8100);
    expect(r.vacancePct).toBe(100);
  });

  it('le cas ordinaire n’est pas touché', () => {
    expect(manque(8100, 5400).manqueAGagner).toBe(2700);
    expect(manque(8100, 5400).vacancePct).toBe(33);
    expect(manque(8100, 8100).manqueAGagner).toBe(0);
    expect(manque(0, 0).vacancePct).toBe(0);
  });

  it('plus encaissé qu’attendu (avance) ne donne jamais un manque négatif', () => {
    expect(manque(8100, 9000).manqueAGagner).toBe(0);
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

  it('les surfaces du lot comptent en NET, plus en `cr` seul', () => {
    for (const nom of ['_renderLogFicheHeroStats', '_renderComptaKPIsForLog', '_renderComptaCashFlowChart']) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' est reparti sur une somme de `cr` seuls').not.toMatch(/\+\(\+m?v?\.cr\|\|0\)/);
      expect(corps, nom + ' ne lit plus le net').toMatch(/_finLotNet\(/);
    }
  });

  it('le quatrième site — code mort, mais corrigé comme les autres', () => {
    // `_computeComptaBailleur` n'a aucun appelant (`setEntFicheTab` redirige « compta » vers
    // « immeubles » depuis 764c7c9). Il avait pourtant été passé au référentiel avec les trois
    // autres : l'oublier au passage au net laissait DEUX règles dans la même série.
    // Ses autres `(+x.cr||0)` sont un JOURNAL de trésorerie — encaissé et dépensé y sont deux
    // colonnes distinctes, les mettre au net n'aurait aucun sens.
    const corps = corpsDe('_computeComptaBailleur');
    expect(corps).toBeTruthy();
    const ligne = corps.split('\n').find(l => l.includes('loyerEncaisse +='));
    expect(ligne, 'la ligne des loyers encaissés a disparu').toBeTruthy();
    expect(ligne, 'elle est repartie sur `cr` seul').toMatch(/_finLotNet\(m\)/);
  });

  it('un mouvement SANS catégorie ne se voit pas proposer un écran qui l’ignore', () => {
    // `_finOpenCatMapping` indexe par nom de catégorie et saute les mouvements qui n'en ont pas
    // (:56086) : leur offrir « Rattacher » ouvrait un écran répondant « tout est déjà rattaché ».
    const corps = corpsDe('_renderComptaKPIsForLog');
    expect(corps, 'les deux causes ne sont plus distinguées').toMatch(/_sansCat/);
    expect(corps, 'le second geste a disparu').toMatch(/_goFromLogFiche\('mouvements'\)/);
    // Le montant annoncé est le NET : une correction de saisie (900 cr et 900 db) ne retire
    // rien des totaux, l'annoncer 1 800 € serait faux.
    expect(corps, 'le montant est reparti sur |cr|+|db|').not.toMatch(/Math\.abs\(\+m\.cr\|\|0\)/);
    expect(corps).toMatch(/Math\.abs\(_finLotNet\(m\)\)/);
  });

  it('un compteur collectif non classé est signalé, pas perdu', () => {
    // La quote-part classe maintenant comme les charges directes. Sans ce filet, un mouvement
    // de compteur non rattaché disparaîtrait du total SANS que l'écran le dise — le défaut
    // qu'on venait de fermer, réintroduit par la porte d'à côté.
    const helper = corpsDe('_lotCcQuotePartMois');
    expect(helper, 'le helper ne classe plus').toMatch(/_finLotEstCharge\(m\)/);
    expect(helper, 'le helper ne retient plus ce qu’il écarte').toMatch(/out\.nonClasses\.push\(m\)/);
    const kpi = corpsDe('_renderComptaKPIsForLog');
    expect(kpi, 'l’avertissement ignore les compteurs collectifs').toMatch(/ccMoisKpi\.nonClasses/);
  });

  it('la fiche AVERTIT quand des mouvements du lot ne sont rattachés à rien', () => {
    // Sinon l'écran affiche « Solde net 0 € » avec quatorze mouvements sur le compte, sans rien
    // dire. Finances ouvre d'office le rattachement ; la fiche d'un lot ne disait rien.
    const corps = corpsDe('_renderComptaKPIsForLog');
    expect(corps, 'l’avertissement a disparu').toMatch(/nonClasses/);
    expect(corps, 'il faut proposer LE geste existant, pas en inventer un').toMatch(/_finOpenCatMapping\(\)/);
    expect(corps, 'l’avertissement n’est pas rendu').toMatch(/\$\{avertNonClasses\}/);
    // Design system : une classe existante, pas un style inventé ni un hex en dur.
    expect(corps).toMatch(/class="alert warn"/);
    expect(corps, 'couleur en dur dans l’avertissement').not.toMatch(/#[0-9a-fA-F]{3,6}/);
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
