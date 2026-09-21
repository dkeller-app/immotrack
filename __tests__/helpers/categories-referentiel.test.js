import { describe, it, expect } from 'vitest';
import { _isLoyerCategory, _isChargeRecupCategory, catCtxFromDb, appDbFrom, makeCatCtxCache } from '../../js/core/utils.js';

/**
 * R0-D (AUDIT-GLOBAL) — Les classifieurs de catégories doivent voir le VRAI référentiel
 * de l'app, alias compris.
 *
 * Règle M-1 (CDC-FINANCES §3) : « Toute catégorie perso est un ALIAS d'une des 23 catégories
 * mères du référentiel STD_CATEGORIES. » L'app résout donc un nom de catégorie en trois temps :
 *   1. nom exact dans STD_CATEGORIES ;
 *   2. sinon `DB.catAlias[nom]` → catégorie mère → sa ligne 2044 ;
 *   3. sinon `DB.catMapping[nom]` / `params.legal2044Mapping[nom]` ('__ignore' = hors 2044).
 *
 * Le module ne connaissait que l'étape 1, sur une liste de 8 entrées codées en dur — et
 * `js/main.js` l'imposait à l'app en écrasant la version riche. Conséquence : un encaissement
 * rangé dans une catégorie perso était compté par Finances et ignoré par Loyers/quittance.
 *
 * Ces tests décrivent le comportement ATTENDU du module : il reçoit le référentiel et les
 * tables d'alias par injection (même patron que `_computeFinancesMonthly`, qui reçoit
 * `catLigne`), et ne code plus aucun référentiel en dur.
 */

// Extrait fidèle du référentiel réel (index.html, STD_CATEGORIES) — seules les entrées utiles.
const STD = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Indemnité GLI / loyers impayés', ligne2044: '213', type: 'recette' },
  { nom: 'Charges de copropriété', ligne2044: '229', type: 'charge' },
  { nom: 'Charges récupérables (eau, énergie…)', ligne2044: '', type: 'special', recup: true },
  { nom: 'Charges récupérables non récupérées', ligne2044: '225', type: 'charge' },
  { nom: 'Régularisation provisions copro N-1', ligne2044: '230', type: 'deduction' },
  { nom: 'Travaux (entretien, réparation, amélioration)', ligne2044: '224', type: 'charge' },
];

describe('R0-D — le classifieur résout les ALIAS de catégorie', () => {
  it('une catégorie perso aliasée vers « Loyers encaissés » compte comme un loyer', () => {
    const ctx = { stdCats: STD, alias: { 'Loyer F3 Ferrette': 'Loyers encaissés' } };
    expect(_isLoyerCategory('Loyer F3 Ferrette', ctx)).toBe(true);
  });

  it('une catégorie perso aliasée vers une recette NON-loyer (213) ne compte pas comme un loyer', () => {
    const ctx = { stdCats: STD, alias: { 'Assurance loyers impayés': 'Indemnité GLI / loyers impayés' } };
    expect(_isLoyerCategory('Assurance loyers impayés', ctx)).toBe(false);
  });

  it('le mapping legacy (catMapping) rattache encore une catégorie à la ligne 211', () => {
    const ctx = { stdCats: STD, mapping: { 'LOYER (ancien import)': '211' } };
    expect(_isLoyerCategory('LOYER (ancien import)', ctx)).toBe(true);
  });

  it("le mapping legacy '__ignore' sort la catégorie du 2044, donc des loyers", () => {
    const ctx = { stdCats: STD, mapping: { 'Écriture technique': '__ignore' } };
    expect(_isLoyerCategory('Écriture technique', ctx)).toBe(false);
  });

  it('une catégorie perso aliasée vers une charge récupérable est bien récupérable', () => {
    const ctx = { stdCats: STD, alias: { 'Eau froide immeuble': 'Charges récupérables (eau, énergie…)' } };
    expect(_isChargeRecupCategory('Eau froide immeuble', ctx)).toBe(true);
  });

  it('le mapping legacy vers 229 (provisions copro) rend la catégorie récupérable', () => {
    const ctx = { stdCats: STD, mapping: { 'PROVISIONS COPRO (ancien import)': '229' } };
    expect(_isChargeRecupCategory('PROVISIONS COPRO (ancien import)', ctx)).toBe(true);
  });

  it('le mapping legacy vers 225 (part bailleur) ne rend PAS la catégorie récupérable', () => {
    const ctx = { stdCats: STD, mapping: { 'Part bailleur (ancien import)': '225' } };
    expect(_isChargeRecupCategory('Part bailleur (ancien import)', ctx)).toBe(false);
  });

  it('une catégorie perso sans alias ni mapping ne devient pas un loyer par accident', () => {
    const ctx = { stdCats: STD, alias: {}, mapping: {} };
    expect(_isLoyerCategory('Truc inconnu', ctx)).toBe(false);
    expect(_isChargeRecupCategory('Truc inconnu', ctx)).toBe(false);
  });
});

describe('R0-D — le PONT app→module (catCtxFromDb) est fidèle à l\'ancien inline', () => {
  // L'ancien inline lisait : (DB.catMapping||{})[cat] || (params.legal2044Mapping||{})[cat] || null
  // → repli CLÉ PAR CLÉ, y compris quand catMapping porte la clé avec une valeur FALSY.
  it('une valeur vide dans catMapping laisse le wizard 2044 reprendre la main (parité)', () => {
    const db = { catMapping: { 'Loyer F3': '' }, params: { legal2044Mapping: { 'Loyer F3': '211' } } };
    expect(_isLoyerCategory('Loyer F3', catCtxFromDb(db, STD))).toBe(true);
  });

  it('catMapping prime sur le wizard 2044 quand il porte une vraie valeur', () => {
    const db = { catMapping: { 'Truc': '229' }, params: { legal2044Mapping: { 'Truc': '211' } } };
    expect(_isLoyerCategory('Truc', catCtxFromDb(db, STD))).toBe(false);
    expect(_isChargeRecupCategory('Truc', catCtxFromDb(db, STD))).toBe(true);
  });

  it("une clé __proto__ dans un mapping ne reclasse AUCUNE catégorie en loyer", () => {
    const db = { params: { legal2044Mapping: JSON.parse('{"__proto__":{"Ma categorie":"211"}}') } };
    const ctx = catCtxFromDb(db, STD);
    expect(_isLoyerCategory('Ma categorie', ctx)).toBe(false);
    expect(Object.getPrototypeOf(ctx.mapping)).toBe(null);
  });

  it('le pont transmet le référentiel et les alias de l\'app', () => {
    const db = { catAlias: { 'Loyer F3 Ferrette': 'Loyers encaissés' } };
    expect(_isLoyerCategory('Loyer F3 Ferrette', catCtxFromDb(db, STD))).toBe(true);
  });

  it('sans DB ni référentiel, le pont ne jette pas', () => {
    expect(() => catCtxFromDb(null, null)).not.toThrow();
    expect(_isLoyerCategory('Loyers', catCtxFromDb(null, null))).toBe(true);
  });

  it('une catégorie STD garde sa nature même si un alias prétend la remapper', () => {
    // STD est figée (index.html) : un alias ne peut pas reclasser une catégorie mère.
    const db = { catAlias: { 'Loyers encaissés': 'Charges de copropriété' } };
    expect(_isLoyerCategory('Loyers encaissés', catCtxFromDb(db, STD))).toBe(true);
  });
});

describe('R0-D — lire le DB VIVANT, pas le miroir `window.DB`', () => {
  // `DB` est déclaré en `let` au niveau script : il vit dans l'environnement lexical global et
  // n'est PAS une propriété de `window`. `window.DB` n'est qu'un miroir posé par `__immoSetDB`
  // (chemin cloud) — absent en session locale, et périmé après réassignation du `let DB`.
  // Le dépôt a déjà le bon mécanisme : `window.__immoGetDB()` (cf. js/app/supabase-entry.js:65-66).
  it('préfère le getter vivant __immoGetDB au miroir window.DB', () => {
    const vivant = { catAlias: { A: 'B' } }, miroir = { catAlias: {} };
    expect(appDbFrom({ __immoGetDB: () => vivant, DB: miroir })).toBe(vivant);
  });

  it('retombe sur window.DB quand le getter n\'existe pas', () => {
    const miroir = { catAlias: {} };
    expect(appDbFrom({ DB: miroir })).toBe(miroir);
  });

  it('le getter fait AUTORITÉ : s\'il répond « pas de DB », on n\'utilise pas le miroir', () => {
    // `window.DB` est posé par `__immoSetDB` et rien ne l'efface à la déconnexion : il peut
    // appartenir à un AUTRE espace. Classer avec son `catAlias` serait pire que ne pas classer.
    const miroirPerime = { catAlias: { 'Loyer F3 Ferrette': 'Loyers encaissés' } };
    expect(appDbFrom({ __immoGetDB: () => null, DB: miroirPerime })).toBe(null);
  });

  it('retombe sur window.DB si le getter jette', () => {
    const miroir = { catAlias: {} };
    expect(appDbFrom({ __immoGetDB: () => { throw new Error('boom'); }, DB: miroir })).toBe(miroir);
  });

  it('ne jette pas quand il n\'y a ni getter ni miroir', () => {
    expect(appDbFrom({})).toBe(null);
    expect(appDbFrom(null)).toBe(null);
  });

  it('bout en bout : un alias posé sur le DB vivant est vu par le classifieur', () => {
    const vivant = { catAlias: { 'Loyer F3 Ferrette': 'Loyers encaissés' } };
    const ctx = catCtxFromDb(appDbFrom({ __immoGetDB: () => vivant }), STD);
    expect(_isLoyerCategory('Loyer F3 Ferrette', ctx)).toBe(true);
  });
});

describe('R0-D — le contexte est mémoïsé sur _dbGen (le classement tourne dans des boucles)', () => {
  const win = (db, gen) => ({ __immoGetDB: () => db, STD_CATEGORIES: STD, _dbGen: gen });

  it('rend le même résultat que la construction directe', () => {
    const db = { catAlias: { 'Loyer F3': 'Loyers encaissés' } };
    const cache = makeCatCtxCache();
    expect(_isLoyerCategory('Loyer F3', cache(win(db, 1)))).toBe(true);
    expect(_isLoyerCategory('Loyer F3', catCtxFromDb(db, STD))).toBe(true);
  });

  it('réutilise le même contexte tant que _dbGen ne bouge pas', () => {
    const cache = makeCatCtxCache(), W = win({ catAlias: {} }, 7);
    expect(cache(W)).toBe(cache(W));
  });

  it('reconstruit dès que _dbGen change, et voit la nouvelle donnée', () => {
    const cache = makeCatCtxCache();
    const avant = cache(win({ catAlias: {} }, 1));
    const apres = cache(win({ catAlias: { 'Loyer F3': 'Loyers encaissés' } }, 2));
    expect(apres).not.toBe(avant);
    expect(_isLoyerCategory('Loyer F3', apres)).toBe(true);
  });

  it('invalide quand l\'objet DB est REMPLACÉ, même si _dbGen ne bouge pas', () => {
    // `index.html:59394` (adoption cross-onglet) fait `DB = newDB` puis rend, SANS bumper `_dbGen`.
    // Sans ce garde-fou, on classerait le nouvel état avec l'ancienne table d'alias.
    const cache = makeCatCtxCache();
    const ancien = cache(win({ catAlias: {} }, 3));
    const apres = cache(win({ catAlias: { 'Loyer F3': 'Loyers encaissés' } }, 3)); // même gen, autre objet
    expect(apres).not.toBe(ancien);
    expect(_isLoyerCategory('Loyer F3', apres)).toBe(true);
  });

  it('ne mémoïse JAMAIS si _dbGen est absent — la justesse prime sur la vitesse', () => {
    const cache = makeCatCtxCache();
    const W = { __immoGetDB: () => ({ catAlias: {} }), STD_CATEGORIES: STD };
    expect(cache(W)).not.toBe(cache(W));
  });
});

describe('R0-D — compatibilité ascendante de la signature', () => {
  it('la forme historique (2e argument = tableau de catégories) continue de fonctionner', () => {
    expect(_isLoyerCategory('Loyers encaissés', STD)).toBe(true);
    expect(_isLoyerCategory('Charges de copropriété', STD)).toBe(false);
    expect(_isChargeRecupCategory('Charges de copropriété', STD)).toBe(true);
  });

  it('sans 2e argument, les libellés legacy restent reconnus', () => {
    expect(_isLoyerCategory('Loyers')).toBe(true);
    expect(_isChargeRecupCategory('Charges')).toBe(true);
  });
});
