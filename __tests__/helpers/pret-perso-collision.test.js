// Collision « Prêt » — parade v15.333 (renommage en « Prêt (perso) ») RETIRÉE en v15.727.
//
// Défaut (audit 07/10, prouvé sur la sauvegarde réelle du 05/10, en lecture seule) : la parade d'initDB
// supposait que « Prêt » dans DB.categories était forcément une catégorie PERSONNELLE. Depuis v15.332,
// « Prêt » est le STD (échéance entière, hors 2044). Avec un vieux legal2044Mapping['Prêt'] = '250' (repli
// regex de _default2044Mapping), chaque initDB local renommait les 52 échéances en « Prêt (perso) », comptées
// en intérêts (ligne 250, FEC 661100) : 45 991,18 €. Et sur la seule base ancienne réelle (16/06), le
// « Prêt » perso contenait lui aussi des échéances entières mappées '250' par le même repli.
//
// Décision (pilote, 07/10) : migration NEUTRE. Aucun renommage, sur aucune base : « Prêt » rejoint le STD
// (le référentiel prime sur le mapping), comme à l'import cloud (qui ne passe pas par initDB).
//
// Ces tests rejouent le VRAI segment « catégories » d'initDB (extrait de l'index assemblé : de
// _applyDataDefaults() à _applyParamDefaults()) sur des bases à la forme des sauvegardes réelles du
// 05/10 et du 16/06, puis lisent la ligne 250 avec LE moteur 2044 (_compute2044) et le mapping que lui
// passe Finances (_finMapping2044, extrait lui aussi). Aucun calcul local.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { _catLigne2044, catCtxFromDb } from '../../js/core/utils.js';
import { _compute2044 } from '../../js/core/legal-2044.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

let indexHtml, initDBCorps, segment, STD_CATEGORIES, rejouer, finMapping;

function between(src, a, b, from = 0) {
  const i = src.indexOf(a, from);
  if (i === -1) return null;
  const j = src.indexOf(b, i + a.length);
  return j === -1 ? null : src.slice(i + a.length, j);
}

beforeAll(() => {
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const i0 = indexHtml.indexOf('function initDB() {');
  initDBCorps = indexHtml.slice(i0, indexHtml.indexOf('\n}', i0));
  // Le segment « catégories » d'initDB, tel quel.
  segment = between(initDBCorps, '_applyDataDefaults();', '  // v15.452 BUG-DASHV4-CLOUD-HYDRATE');
  // Référentiel RÉEL + noms saisissables + helpers réels.
  const s0 = indexHtml.indexOf('const STD_CATEGORIES = [');
  const s1 = indexHtml.indexOf('\n];', s0);
  const n0 = indexHtml.indexOf('const STD_CATEGORY_NAMES = ');
  const n1 = indexHtml.indexOf('\n', n0);
  const fn = (name) => { const a = indexHtml.indexOf(`function ${name}(`); return indexHtml.slice(a, indexHtml.indexOf('\n}', a) + 2); };
  const prelude = `${indexHtml.slice(s0, s1 + 3)}\n${indexHtml.slice(n0, n1)}\n${fn('_stdCategoryByName')}\n${fn('_isStdCategory')}\n${fn('_finMapping2044')}\n`;
  const usine = new Function(`let DB;\n${prelude}
    return {
      STD_CATEGORIES,
      rejouer: (db) => { DB = db; ${segment}\n return DB; },
      finMapping: (db) => { DB = db; return _finMapping2044(); },
    };`);
  ({ STD_CATEGORIES, rejouer, finMapping } = usine());
});

const ligne = (db, cat) => _catLigne2044(cat, catCtxFromDb(db, STD_CATEGORIES));
const ligne250 = (db) => _compute2044(db.mouvements, STD_CATEGORIES, { mapping: finMapping(db) }).lignes['250'] || 0;
const rePret = /^Pr[eê]t/;

// Forme de la sauvegarde réelle du 05/10 (export cloud, ≥ v15.332) : STD « Prêt », vieux mapping '250'.
function base0510() {
  return {
    categories: ['Loyers encaissés', "Prêt — Intérêts d'emprunt", 'Prêt', 'Frais bancaires'],
    catMapping: {},
    catAlias: { Gestion: 'Frais de gestion / honoraires / comptabilité' },
    params: {
      legal2044Mapping: { 'Prêt': '250', 'Prêt — Capital remboursé': '', "Prêt — Intérêts d'emprunt": '250',
        "Prêt — Frais d'emprunt (dossier, hypothèque, cautionnement)": '250' },
      _deletedCategories: { 'Prêt — Capital remboursé': '2026-06-22T14:33:56.624Z' },
    },
    mouvements: [
      { id: 1, date: '2026-01-06', cat: 'Prêt', db: 1474.33, cr: 0, lib: 'ECH PRET CAP+IN 01400 213174 08', imm: 'Freyming', qui: '' },
      { id: 2, date: '2026-07-07', cat: 'Prêt', db: 2537.52, cr: 0, lib: '86292030837 ECHEANCE 05/07/26 — Remboursement de prêt', imm: 'Ferrette', qui: '' },
      { id: 3, date: '2026-09-03', cat: 'Prêt', db: 45.38, cr: 0, lib: 'ASSU. CAAE PRET HABITAT 09/26', imm: 'Ferrette', qui: '' },
      { id: 4, date: '2026-07-01', cat: 'Loyers encaissés', db: 0, cr: 650, lib: 'VIR LOYER', imm: 'Ferrette', qui: '' },
    ],
    importRules: [{ cat: 'Prêt', pattern: '213174 08' }, { cat: 'Prêt', pattern: '8629203083' }],
  };
}

// Forme de la sauvegarde réelle du 16/06 (pré-v15.332) : l'ancien STD « Prêt — Capital remboursé »
// listé, « Prêt » = catégorie PERSO mappée '250' par le repli regex, contenant des échéances entières.
function base1606() {
  return {
    categories: ['Loyers encaissés', 'Charges', "Prêt — Intérêts d'emprunt",
      "Prêt — Frais d'emprunt (dossier, hypothèque, cautionnement)", 'Prêt — Capital remboursé', 'Prêt'],
    params: { legal2044Mapping: { 'Prêt': '250', 'Prêt — Capital remboursé': '', Charges: '225' } },
    mouvements: [
      { id: 1, date: '2026-03-06', cat: 'Prêt', db: 679.93, cr: 0, lib: 'ECH PRET CAP+IN 01400 213174 06', imm: 'Damelevières', qui: '' },
      { id: 2, date: '2026-03-06', cat: 'Prêt', db: 2289.89, cr: 0, lib: 'ECH PRET CAP+IN 01400 213174 07', imm: 'Damelevières', qui: '' },
      { id: 3, date: '2026-03-05', cat: 'Prêt', db: 247.96, cr: 0, lib: 'PRLV SEPA SAS MULTI IMPACT ASSURANCE DE PRET', imm: '', qui: '' },
      { id: 4, date: '2026-04-02', cat: 'Prêt — Capital remboursé', db: 900, cr: 0, lib: 'CAPITAL', imm: '', qui: '' },
      // Témoin : de VRAIS intérêts saisis à part → la ligne 250 n'est pas vide par construction.
      { id: 5, date: '2026-04-30', cat: "Prêt — Intérêts d'emprunt", db: 312.4, cr: 0, lib: 'INTERETS 2026 (attestation)', imm: '', qui: '' },
    ],
    importRules: [{ cat: 'Prêt', pattern: 'CAP+IN' }],
  };
}

describe('collision « Prêt » — parade retirée (garde-fous)', () => {
  it("l'index assemblé ne contient plus _migrerCollisionPretPerso", () => {
    expect(indexHtml.includes('_migrerCollisionPretPerso')).toBe(false);
  });

  it("aucun code ne renomme en 'Prêt (perso)' (plus de littéral JS de ce nom)", () => {
    expect(/['"`]Prêt \(perso\)['"`]/.test(indexHtml)).toBe(false);
    expect(/\.cat\s*=\s*_NN\b/.test(initDBCorps)).toBe(false);
  });

  it("le segment rejoué est bien celui d'initDB (_CAT_MIGRATION + migration douce)", () => {
    expect(segment).toBeTruthy();
    expect(segment.includes('const _CAT_MIGRATION = {')).toBe(true);
    expect(segment.includes('STD_CATEGORY_NAMES.forEach')).toBe(true);
  });
});

describe('base du 05/10 rejouée dans initDB', () => {
  it('aucun mouvement ni règle renommé ; « Prêt » reste hors 2044 ; ligne 250 = 0', () => {
    const db = rejouer(base0510());
    expect(db.mouvements.filter(m => rePret.test(m.cat)).map(m => m.cat)).toEqual(['Prêt', 'Prêt', 'Prêt']);
    expect(db.importRules.map(r => r.cat)).toEqual(['Prêt', 'Prêt']);
    expect(db.categories.includes('Prêt')).toBe(true);
    expect(db.categories.some(c => /perso/.test(c))).toBe(false);
    expect(ligne(db, 'Prêt')).toBe(null);
    expect(ligne250(db)).toBe(0);
  });

  it('le vieux mapping résiduel Prêt = 250 reste sans effet (le référentiel prime)', () => {
    const db = rejouer(base0510());
    expect(db.params.legal2044Mapping['Prêt']).toBe('250');
    expect('Prêt' in finMapping(db)).toBe(false);
  });

  it('rejouée deux fois : même résultat (idempotent)', () => {
    const une = JSON.stringify(rejouer(base0510()));
    expect(JSON.stringify(rejouer(JSON.parse(une)))).toBe(une);
  });
});

describe('base du 16/06 (pré-v15.332) rejouée dans initDB', () => {
  it('le « Prêt » perso rejoint le STD « Prêt » ; ligne 250 = les seuls vrais intérêts', () => {
    const db = rejouer(base1606());
    // L'ancien capital fusionne aussi dans « Prêt » (_CAT_MIGRATION) ; rien n'est renommé « (perso) ».
    expect(db.mouvements.map(m => m.cat)).toEqual(['Prêt', 'Prêt', 'Prêt', 'Prêt', "Prêt — Intérêts d'emprunt"]);
    expect(db.importRules.map(r => r.cat)).toEqual(['Prêt']);
    expect(db.categories.includes('Prêt')).toBe(true);
    expect(db.categories.includes('Prêt — Capital remboursé')).toBe(false);
    expect(db.categories.some(c => /perso/.test(c))).toBe(false);
    for (const m of db.mouvements.filter(x => x.cat === 'Prêt')) expect(ligne(db, m.cat)).toBe(null);
    // 312,40 € d'intérêts réels, pas 3 217,78 € d'échéances.
    expect(ligne250(db)).toBeCloseTo(312.4, 2);
  });

  it('même résultat qu\'à l\'import cloud (sans initDB) pour les échéances : hors 2044', () => {
    const cloud = base1606();
    const local = rejouer(base1606());
    for (const id of [1, 2, 3]) {
      const c = cloud.mouvements.find(m => m.id === id);
      const l = local.mouvements.find(m => m.id === id);
      expect(ligne(local, l.cat)).toBe(ligne(cloud, c.cat));
      expect(ligne(local, l.cat)).toBe(null);
    }
  });
});
