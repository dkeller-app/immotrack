/**
 * Réglages › Catégories : une catégorie perso se range dans une FAMILLE du référentiel
 * (GO Didier 06/10, maquette mockups/FINANCES-CATEGORIES/famille-reglages.html).
 *
 * Avant : la liste ne proposait que des lignes 2044 + « Hors résultat (caution, capital, non
 * déductible…) », qui rangeait tout en Divers — une caution finissait au cash-flow. Une catégorie
 * rangée hors 2044 s'affichait « non rattachée : à corriger » alors qu'elle était rangée.
 * Maintenant : LA liste des 23 familles (la même qu'à la création et qu'au rattachement Finances),
 * groupée selon l'effet RÉEL sur le cash-flow, et une ligne qui dit cet effet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'index.html'), 'utf8').replace(/\r/g, '');
const corps = (nom) => {
  const i = html.indexOf('function ' + nom + '('), j = html.indexOf('\n}', i);
  if (i < 0 || j < 0) throw new Error(nom + ' introuvable — le test ne teste plus rien');
  return html.slice(i, j + 2);
};
const tranche = (debut, fin) => {
  const i = html.indexOf(debut), j = html.indexOf(fin, i);
  if (i < 0 || j < 0) throw new Error(debut + ' introuvable');
  return html.slice(i, j + fin.length);
};
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Monte les VRAIES fonctions de l'app autour d'un DB. */
function monter(DB, appels = []) {
  const STD = new Function(tranche('const STD_CATEGORIES = [', '\n];') + '\nreturn STD_CATEGORIES;')();
  const src = [
    tranche('const _FIN_FAMILLE_GROUPES = [', '\n];'),
    ...['_finStdByLigne', '_finCatMere', '_finChargeHf', '_finLotCatRole', '_finFamilleEffet', '_finMereOptionsHtml',
      '_finFamilleEffetHtml', '_finRattacheCategorie', '_setCustomCatFamille', '_finMonthly'].map(corps)
  ].join('\n');
  const stdParNom = (nom) => STD.find(c => c.nom === nom);
  const deps = {
    window: { _computeFinancesMonthly, _dbGen: 1 }, DB, STD_CATEGORIES: STD, _stdCategoryByName: stdParNom, escHtml: esc,
    _finMonthlyCache: { gen: -1, m: new Map() }, _finScopeWeight: () => 1,
    _finCatLigne: (cat) => { const m = stdParNom(cat); return m && m.ligne2044 ? { ligne2044: m.ligne2044, type: m.type } : null; },
    _finBailHcChAt: () => ({ hc: 0, ch: 0 }), _finLotSuivi: () => null, _finActiveLotsInScope: () => [], _finIsRecupACharge: () => false,
    saveDB: () => appels.push('saveDB'), rParamsCats: () => appels.push('rParamsCats'), showToast: (t, k) => appels.push('toast:' + k)
  };
  const noms = Object.keys(deps);
  const M = new Function(...noms, src + '\nreturn { _FIN_FAMILLE_GROUPES, _finFamilleEffet, _finMereOptionsHtml, _finFamilleEffetHtml, _setCustomCatFamille, _finMonthly };')(
    ...noms.map(n => deps[n]));
  return { M, STD, deps };
}

describe('La liste des familles — groupée selon l’effet RÉEL sur le cash-flow', () => {
  let M, STD;
  beforeAll(() => { ({ M, STD } = monter({ mouvements: [] })); });

  it('chaque groupe dit vrai : 100 € dans une famille bougent le cash-flow ⇔ la liste dit « compte »', () => {
    // Recoupement avec le MOTEUR, famille par famille — pas avec une table recopiée.
    for (const c of STD) {
      const rec = c.type === 'recette';
      const { M: Mx, deps } = monter({ mouvements: [{ date: '2026-03-10', cat: c.nom, qui: 'L1', cr: rec ? 100 : 0, db: rec ? 0 : 100 }] });
      deps.window._dbGen = 2;
      const cf = Mx._finMonthly(2026, null, 12).annual.cashflowReel;
      expect(Math.abs(cf) > 0.005, c.nom).toBe(M._finFamilleEffet(c).compte);
    }
  });

  it('les quatre groupes contiennent exactement les familles de la maquette validée', () => {
    const par = {};
    for (const c of STD) (par[M._finFamilleEffet(c).groupe] = par[M._finFamilleEffet(c).groupe] || []).push(c.nom);
    expect(par.recette).toEqual(['Loyers encaissés', 'Indemnité GLI / loyers impayés', 'Recettes diverses']);
    expect(par.horsFiscal.sort()).toEqual(['Charges récupérables (eau, énergie…)', 'Divers (non déductible)', 'Frais bancaires', 'Prêt',
      'Travaux de construction / agrandissement (non déductible)'].sort());
    expect(par.horsCf.sort()).toEqual(['Acompte de charges (départ)', 'Acquisition / cession de bien', 'CCA / distribution SCI',
      'Dépôt de garantie (reçu / restitué)', "Prêt — Intérêts d'emprunt", 'Virement interne (non déclarable)'].sort());
    expect(par.declaree.length).toBe(9);
    expect(par.declaree.every(n => STD.find(c => c.nom === n).ligne2044)).toBe(true);
  });

  it('les 23 familles, chacune une fois, dans des groupes étiquetés', () => {
    const h = M._finMereOptionsHtml('Divers (non déductible)');
    const vals = [...h.matchAll(/<option value="([^"]*)"/g)].map(x => x[1]);
    expect(vals.length).toBe(23);
    expect(new Set(vals).size).toBe(23);
    expect((h.match(/<optgroup label=/g) || []).length).toBe(4);
  });

  it('création (M-1 bis) : sans famille courante, « choisir la famille » en tête et RIEN de pré-sélectionné', () => {
    const h = M._finMereOptionsHtml();
    expect(h.startsWith('<option value="">')).toBe(true);
    expect(h).not.toContain(' selected');
  });

  it('Réglages : la famille courante est sélectionnée, sans ligne « choisir »', () => {
    const h = M._finMereOptionsHtml('Dépôt de garantie (reçu / restitué)');
    expect(h).not.toContain('<option value="">');
    expect(h).toContain('<option value="Dépôt de garantie (reçu / restitué)" selected>');
    expect((h.match(/ selected/g) || []).length).toBe(1);
  });

  it('la ligne d’effet sous la liste', () => {
    expect(M._finFamilleEffetHtml('Divers (non déductible)')).toContain('hors 2044 · compte dans le cash-flow');
    expect(M._finFamilleEffetHtml('Dépôt de garantie (reçu / restitué)')).toContain('hors 2044 · hors cash-flow');
    expect(M._finFamilleEffetHtml('Recettes diverses')).toContain('2044 · 213 · compte dans le cash-flow');
    expect(M._finFamilleEffetHtml("Prêt — Intérêts d'emprunt")).toContain('2044 · 250 · hors cash-flow');
    expect(M._finFamilleEffetHtml('')).toContain('Sans famille');
  });
});

describe('Changer la famille d’une catégorie perso — `_setCustomCatFamille`', () => {
  it('passe par le rattachement unique : alias + miroirs 2044, enregistre, ré-affiche', () => {
    const appels = [];
    const DB = { catAlias: { 'Caution Dupont': 'Divers (non déductible)' }, catMapping: { 'Caution Dupont': '__ignore' }, params: {}, mouvements: [] };
    const { M } = monter(DB, appels);
    M._setCustomCatFamille('Caution Dupont', 'Dépôt de garantie (reçu / restitué)');
    expect(DB.catAlias['Caution Dupont']).toBe('Dépôt de garantie (reçu / restitué)');
    expect(DB.catMapping['Caution Dupont']).toBe('__ignore');
    expect(DB.params.legal2044Mapping['Caution Dupont']).toBe('__ignore');
    expect(appels).toEqual(['saveDB', 'rParamsCats', 'toast:ok']);
    M._setCustomCatFamille('Parking', 'Recettes diverses');
    expect(DB.catMapping.Parking).toBe('213');
    expect(DB.params.legal2044Mapping.Parking).toBe('213');
  });

  it('la caution sort du cash-flow dès qu’elle est rangée en dépôt de garantie', () => {
    const DB = { catAlias: { 'Caution Dupont': 'Divers (non déductible)' }, params: {},
      mouvements: [{ date: '2026-03-06', cat: 'Caution Dupont', qui: 'L1', cr: 0, db: 900 }] };
    const { M, deps } = monter(DB);
    expect(M._finMonthly(2026, null, 12).annual.charges).toBe(900);       // ancien « Hors résultat » = Divers
    M._setCustomCatFamille('Caution Dupont', 'Dépôt de garantie (reçu / restitué)');
    deps.window._dbGen++;
    expect(M._finMonthly(2026, null, 12).annual.charges).toBe(0);
  });

  it('une catégorie ne redevient jamais flottante : famille vide ou inconnue → rien n’est écrit', () => {
    const appels = [];
    const DB = { catAlias: { X: 'Divers (non déductible)' }, params: {}, mouvements: [] };
    const { M } = monter(DB, appels);
    M._setCustomCatFamille('X', '');
    M._setCustomCatFamille('X', 'Famille inventée');
    expect(DB.catAlias.X).toBe('Divers (non déductible)');
    expect(appels).not.toContain('saveDB');
    expect(appels.filter(a => a === 'toast:warn').length).toBe(2);
  });
});

describe('L’écran Réglages lit la famille — plus de « Hors résultat »', () => {
  it('la ligne d’une catégorie perso affiche SA famille et son effet', () => {
    const i = html.indexOf('const renderCustomRow = ({nom, idx}) => {'), j = html.indexOf('\n  };', i);
    expect(i).toBeGreaterThan(-1);
    const row = html.slice(i, j);
    expect(row).toContain('_finCatMere(nom)');
    expect(row).toContain('_finMereOptionsHtml(cur)');
    expect(row).toContain('_finFamilleEffetHtml(cur)');
    expect(row).toContain('_setCustomCatFamille(');
  });

  it('l’ancien éditeur « ligne 2044 / Hors résultat » a disparu de l’app', () => {
    for (const s of ['_setCustomCatMap', '_FIN_2044_OPTIONS', '_writeCatMap', 'Hors résultat (caution', 'mapping libre via le wizard 2044']) {
      expect(html, s).not.toContain(s);
    }
  });
});
