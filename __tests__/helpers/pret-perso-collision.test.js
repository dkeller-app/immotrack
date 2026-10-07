// V3-REFONTE-LOYERS v15.333 — collision « Prêt », corrigée v15.727 : `_migrerCollisionPretPerso(db)`.
//
// Défaut (audit 07/10, prouvé sur la sauvegarde réelle du 05/10) : la parade v15.333 supposait que
// « Prêt » dans DB.categories était forcément une catégorie PERSONNELLE. Or depuis v15.332 « Prêt » est
// le STD (échéance entière, hors 2044), réinjecté par la migration douce à chaque démarrage. Une base dont
// legal2044Mapping['Prêt'] valait '250' (repli regex de _default2044Mapping, /pr[êe]t/) voyait, à chaque
// initDB (sandbox, file://, démo, sauvegarde réimportée), ses 52 échéances renommées « Prêt (perso) » et
// comptées en intérêts d'emprunt (ligne 250, FEC 661100) : 45 991,18 €, dont 13 650 € chez SMARTOSAURUS.
//
// Correctif : la parade ne joue que sur une base ANTÉRIEURE à v15.332 (l'ancien STD
// « Prêt — Capital remboursé » encore listé, et non rattaché à une famille). Ces tests exécutent la VRAIE
// fonction, extraite de l'index assemblé, et classent le résultat avec LE résolveur 2044 de l'app.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { _catLigne2044, catCtxFromDb } from '../../js/core/utils.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

function extractFn(html, signature) {
  const start = html.indexOf(`function ${signature} {`);
  if (start === -1) return null;
  const end = html.indexOf('\n}', start);
  return end === -1 ? null : html.slice(start, end + 2);
}

let indexHtml, migrer, STD_CATEGORIES;

beforeAll(() => {
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const src = extractFn(indexHtml, '_migrerCollisionPretPerso(db)');
  if (src) migrer = new Function(`${src}\nreturn _migrerCollisionPretPerso;`)();
  // Le référentiel RÉEL (pas une copie) : c'est lui qui dit que « Prêt » est hors 2044.
  const s0 = indexHtml.indexOf('const STD_CATEGORIES = [');
  const s1 = indexHtml.indexOf('\n];', s0);
  STD_CATEGORIES = new Function(`${indexHtml.slice(s0, s1 + 3)}\nreturn STD_CATEGORIES;`)();
});

const ligne = (db, cat) => _catLigne2044(cat, catCtxFromDb(db, STD_CATEGORIES));

// Base au format ACTUEL (≥ v15.332), forme de la sauvegarde réelle du 05/10 : le STD « Prêt » est
// listé, legal2044Mapping garde une vieille clé 'Prêt' = '250' (et même la clé de l'ancien STD, mais
// celui-ci n'est plus dans la liste des catégories).
function baseActuelle() {
  return {
    categories: ['Loyers encaissés', "Prêt — Intérêts d'emprunt", 'Prêt', 'Frais bancaires'],
    catMapping: {},
    catAlias: { Gestion: 'Frais de gestion / honoraires / comptabilité' },
    params: { legal2044Mapping: { 'Prêt': '250', 'Prêt — Capital remboursé': '', "Prêt — Intérêts d'emprunt": '250' } },
    mouvements: [
      { id: 1, cat: 'Prêt', db: 1474.33, cr: 0, lib: 'ECH PRET CAP+IN 01400 213174 08', imm: 'Freyming' },
      { id: 2, cat: 'Prêt', db: 2537.52, cr: 0, lib: '86292030837 ECHEANCE 05/07/26', imm: 'Ferrette' },
      { id: 3, cat: 'Loyers encaissés', db: 0, cr: 650, lib: 'VIR LOYER', imm: 'Ferrette' },
    ],
    importRules: [{ cat: 'Prêt', pattern: '213174 08' }, { cat: 'Prêt', pattern: '8629203083' }],
  };
}

// Base ANTÉRIEURE à v15.332 (forme de la sauvegarde réelle du 16/06) : l'ancien STD
// « Prêt — Capital remboursé » est listé, « Prêt » est donc une catégorie personnelle.
function baseAnterieure() {
  return {
    categories: ['Loyers encaissés', "Prêt — Intérêts d'emprunt", 'Prêt — Capital remboursé', 'Prêt'],
    params: { legal2044Mapping: { 'Prêt': '250', 'Prêt — Capital remboursé': '' } },
    mouvements: [
      { id: 1, cat: 'Prêt', db: 300, cr: 0, lib: 'INTERETS' },
      { id: 2, cat: 'Prêt — Capital remboursé', db: 900, cr: 0, lib: 'CAPITAL' },
    ],
    importRules: [{ cat: 'Prêt', pattern: 'INTERETS' }],
  };
}

describe('_migrerCollisionPretPerso — extraction & câblage', () => {
  it('la fonction existe dans index.html assemblé', () => {
    expect(migrer, '_migrerCollisionPretPerso(db) introuvable').toBeTypeOf('function');
  });

  it("initDB l'appelle une fois, après les défauts et AVANT _CAT_MIGRATION (qui efface le marqueur)", () => {
    const i0 = indexHtml.indexOf('function initDB() {');
    const i1 = indexHtml.indexOf('\n}', i0);
    const corps = indexHtml.slice(i0, i1);
    const appel = corps.indexOf('_migrerCollisionPretPerso(DB);');
    expect(appel).toBeGreaterThan(-1);
    expect(corps.indexOf('_migrerCollisionPretPerso(DB);', appel + 1)).toBe(-1);
    expect(appel).toBeGreaterThan(corps.indexOf('_applyDataDefaults();'));
    expect(appel).toBeLessThan(corps.indexOf('const _CAT_MIGRATION = {'));
    // L'ancien bloc inline (critère « 'Prêt' listé = custom ») a disparu d'initDB.
    expect(corps.includes("const _NN = 'Prêt (perso)';")).toBe(false);
  });

  it("l'hydratation cloud (__immoSetDB) ne la lance pas : les données cloud ne passent jamais par là", () => {
    const i0 = indexHtml.indexOf('window.__immoSetDB = function(cloudDB) {');
    const corps = indexHtml.slice(i0, indexHtml.indexOf('\n};', i0));
    expect(i0).toBeGreaterThan(-1);
    expect(corps.includes('_migrerCollisionPretPerso')).toBe(false);
  });
});

describe('_migrerCollisionPretPerso — le « Prêt » STANDARD n\'est jamais renommé', () => {
  it('base actuelle avec legal2044Mapping[Prêt] = 250 : rien ne bouge, les échéances restent hors 2044', () => {
    const db = baseActuelle();
    const avant = JSON.stringify(db);
    expect(migrer(db)).toBe(false);
    expect(JSON.stringify(db)).toBe(avant);
    for (const m of db.mouvements.filter(x => x.cat === 'Prêt')) expect(ligne(db, m.cat)).toBe(null);
    expect(db.mouvements.some(m => m.cat === 'Prêt (perso)')).toBe(false);
  });

  it('même chose quand le vieux mapping est dans catMapping', () => {
    const db = baseActuelle();
    db.catMapping = { 'Prêt': '250' };
    const avant = JSON.stringify(db);
    expect(migrer(db)).toBe(false);
    expect(JSON.stringify(db)).toBe(avant);
  });

  it("la clé de l'ancien STD dans le MAPPING ne suffit pas : seul compte sa présence dans la liste", () => {
    const db = baseActuelle();
    expect('Prêt — Capital remboursé' in db.params.legal2044Mapping).toBe(true);
    expect(migrer(db)).toBe(false);
    expect(db.categories.includes('Prêt')).toBe(true);
  });

  it('une catégorie perso « Prêt — Capital remboursé » créée depuis (rattachée à une famille) ne réveille pas la parade', () => {
    const db = baseActuelle();
    db.categories.push('Prêt — Capital remboursé');
    db.catAlias['Prêt — Capital remboursé'] = 'Prêt';
    const avant = JSON.stringify(db);
    expect(migrer(db)).toBe(false);
    expect(JSON.stringify(db)).toBe(avant);
  });
});

describe('_migrerCollisionPretPerso — base antérieure à v15.332 : la catégorie perso est protégée', () => {
  it('renomme le custom « Prêt » mappé : mouvements, règles, liste et mapping', () => {
    const db = baseAnterieure();
    expect(migrer(db)).toBe(true);
    expect(db.mouvements.map(m => m.cat)).toEqual(['Prêt (perso)', 'Prêt — Capital remboursé']);
    expect(db.importRules[0].cat).toBe('Prêt (perso)');
    expect(db.categories.includes('Prêt')).toBe(false);
    expect(db.categories.includes('Prêt (perso)')).toBe(true);
    expect(db.params.legal2044Mapping['Prêt (perso)']).toBe('250');
    expect('Prêt' in db.params.legal2044Mapping).toBe(false);
    // Le rattachement de l'utilisateur est conservé (sans la parade, la précédence STD l'effaçait).
    expect(ligne(db, 'Prêt (perso)')).toBe('250');
  });

  it('mapping porté par catMapping : déplacé aussi', () => {
    const db = baseAnterieure();
    db.params.legal2044Mapping = {};
    db.catMapping = { 'Prêt': '224' };
    expect(migrer(db)).toBe(true);
    expect(db.catMapping).toEqual({ 'Prêt (perso)': '224' });
  });

  it("custom sans rattachement ('' ou '__ignore') : hors 2044 des deux côtés, on ne touche à rien", () => {
    for (const v of ['', '__ignore']) {
      const db = baseAnterieure();
      db.params.legal2044Mapping['Prêt'] = v;
      const avant = JSON.stringify(db);
      expect(migrer(db)).toBe(false);
      expect(JSON.stringify(db)).toBe(avant);
    }
  });

  it('idempotent : au démarrage suivant (STD « Prêt » ajouté, ancien STD retiré) plus rien ne bouge', () => {
    const db = baseAnterieure();
    migrer(db);
    // Ce que font _CAT_MIGRATION + migration douce dans le même initDB.
    db.mouvements.forEach(m => { if (m.cat === 'Prêt — Capital remboursé') m.cat = 'Prêt'; });
    db.categories = db.categories.filter(c => c !== 'Prêt — Capital remboursé').concat('Prêt');
    const apres = JSON.stringify(db);
    expect(migrer(db)).toBe(false);
    expect(JSON.stringify(db)).toBe(apres);
    expect(db.mouvements.map(m => m.cat)).toEqual(['Prêt (perso)', 'Prêt']);
  });

  it('base sans catégories ou sans « Prêt » : rien', () => {
    expect(migrer({})).toBe(false);
    expect(migrer({ categories: ['Loyers encaissés', 'Prêt — Capital remboursé'], params: { legal2044Mapping: { 'Prêt': '250' } } })).toBe(false);
  });
});
