// P0-1 (chantier BIENS) — « supprimer le pane Présentation efface 10 champs en silence »
//
// Avant ce correctif, _logpReadFromForm() lisait TOUT le formulaire logement par el(id) et
// renvoyait '' / false quand l'input n'existait pas dans le DOM ; saveParamLog réaffectait
// ensuite sans condition. Conséquence : retirer ou déplacer un pane effaçait
//   log.presentation · log.quartier · log.locationInfo · log.dgRef · log.irlRef
// et surtout imm.equipementsCommuns de l'IMMEUBLE PARENT, remis à tout-false au premier
// enregistrement de n'importe quel logement — y compris à chaque bien créé par le fil rouge.
//
// Ces tests exécutent la VRAIE fonction extraite d'index.html (pas une réplique), avec un
// DOM simulé, et vérifient qu'un champ absent du formulaire n'est plus jamais écrit.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { _logpApplyPartial } from '../../js/core/logp-partial.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

/** Extrait une fonction top-level (déclarée colonne 0, fermée par `}` colonne 0). */
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  if (end === -1) return null;
  return src.slice(start, end + 2).replace(/\r/g, '');
}

let indexHtml, readFromForm;

// ── DOM simulé : map id → {value, checked} ────────────────────────────────────
function makeEl(dom) {
  return (id) => (Object.prototype.hasOwnProperty.call(dom, id) ? dom[id] : null);
}

/** Formulaire Présentation COMPLET (tous les ids de l'onglet), valeurs neutres. */
function domComplet(over) {
  const d = {};
  const chk = (id, v) => { d[id] = { checked: !!v }; };
  const val = (id, v) => { d[id] = { value: v === undefined ? '' : String(v) }; };
  ['ascenseur', 'interphone', 'digicode', 'gardien', 'videosurv', 'parking_commun', 'local_velos', 'jardin_commun']
    .forEach(k => chk('logp-ec-' + k, false));
  ['equipee', 'four', 'plaques', 'hotte', 'lave_vaisselle', 'micro_ondes', 'frigo'].forEach(k => chk('logp-cu-' + k, false));
  ['bain', 'douche', 'wc_separe', 'lave_linge', 'seche_linge'].forEach(k => chk('logp-sa-' + k, false));
  ['fibre', 'adsl', 'cable', 'tnt'].forEach(k => chk('logp-te-' + k, false));
  ['balcon', 'terrasse', 'loggia', 'jardin'].forEach(k => { val('logp-ext-' + k + '-p', '0'); val('logp-ext-' + k + '-s', ''); });
  ['cave', 'grenier', 'parking', 'garage', 'buanderie', 'cellier', 'localVelos', 'atelier']
    .forEach(k => { chk('logp-an-' + k + '-p', false); val('logp-an-' + k + '-num', ''); });
  val('logp-an-parking-type', 'place');
  ['exposition', 'vue', 'luminosite', 'calme', 'caractere'].forEach(k => val('logp-pres-' + k, ''));
  ['metro', 'tramway', 'bus', 'gare', 'boulangerie', 'supermarche', 'pharmacie', 'marche'].forEach(k => val('logp-q-' + k, ''));
  ['ecoles_primaires', 'college', 'lycee', 'parc', 'restaurants', 'sport', 'hopital'].forEach(k => chk('logp-q-s-' + k, false));
  val('logp-q-reperes', '');
  ['centre-historique', 'quartier-residentiel', 'quartier-etudiant', 'quartier-affaires', 'bord-de-mer', 'proche-nature', 'quartier-festif', 'haut-de-gamme']
    .forEach(k => chk('logp-q-c-' + k, false));
  val('logp-loc-dispo', '');
  ['caution_solidaire', 'visale', 'gli', 'garant_perso'].forEach(k => chk('logp-loc-g-' + k, false));
  ['hcRef', 'chRef', 'dgRef', 'irlRef'].forEach(k => val('logp-loc-' + k, ''));
  return Object.assign(d, over || {});
}

function read(dom, drafts) {
  return readFromForm(makeEl(dom), drafts || { ec: [], cu: [], an: [] });
}

/** Logement réel, tous les champs que P0-1 protège renseignés. */
function logPeuple() {
  return {
    ref: 'L-001', entity: 'SCI Test', imm: 'IMM-A',
    equipements: {
      cuisine: { equipee: true, four: true, plaques: false, customs: ['Îlot central'] },
      sanitaires: { douche: true, bain: false, customs: [] },
      technologies: { fibre: true, customs: [] }
    },
    exterieurs: { balcon: { present: true, surface: 6 }, loggia: { present: false } },
    annexes: { cave: { present: true, num: 'C12' }, parking: { present: true, num: 'P3', type: 'box' }, customs: ['Local poussettes'] },
    presentation: { exposition: 'sud', vue: 'degagee', luminosite: 'forte', calme: 'calme', caractere_ancien: 'oui' },
    quartier: { transports: { metro: 5 }, commerces: { boulangerie: '2' }, services: { parc: true }, reperes: ['Parc du Château'], caractere: ['quartier-residentiel'] },
    locationInfo: { disponibilite: '2026-09-01', garanties_acceptees: ['visale', 'gli'] },
    loyerHcRef: '750', chargesRef: '60', dgRef: '750', irlRef: 'T2 2025',
    hc: 750, ch: 60, dg: 750
  };
}

beforeAll(() => {
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const src = extractFn(indexHtml, '_logpReadFromForm');
  expect(src, '_logpReadFromForm introuvable dans index.html').toBeTruthy();
  // eslint-disable-next-line no-new-func
  readFromForm = new Function('el', '_logpCustomsDraft', src + '\nreturn _logpReadFromForm();');
});

describe('P0-1 — _logpReadFromForm() est PARTIEL (aucun champ absent du DOM n\'est renvoyé)', () => {
  it('DOM vide : aucune clé logement, aucun equipementsCommuns', () => {
    const presa = read({});
    expect(presa.log).toEqual({});
    expect(presa.equipementsCommuns).toBeUndefined();
  });

  it('RÉGRESSION — enregistrer un logement sans le pane ne modifie AUCUN champ stocké', () => {
    const log = logPeuple();
    const avant = JSON.parse(JSON.stringify(log));
    const presa = read({});
    _logpApplyPartial(log, presa.log);
    expect(log).toEqual(avant);
  });

  it('RÉGRESSION — l\'immeuble parent n\'est pas touché quand le bloc equipementsCommuns est absent', () => {
    // Le pane retiré (ou seulement l'onglet Identité affiché) ne doit pas remettre
    // imm.equipementsCommuns à tout-false — bug vécu à chaque bien créé par le fil rouge.
    const presa = read(domComplet());       // formulaire complet mais SANS les cases ec
    expect(presa.equipementsCommuns).toBeTruthy();
    const sansEc = domComplet();
    ['ascenseur', 'interphone', 'digicode', 'gardien', 'videosurv', 'parking_commun', 'local_velos', 'jardin_commun']
      .forEach(k => { delete sansEc['logp-ec-' + k]; });
    expect(read(sansEc).equipementsCommuns).toBeUndefined();
  });

  it('le garde-fou côté saveParamLog est bien en place (propagation conditionnée)', () => {
    expect(indexHtml).toContain('if (presa.equipementsCommuns && log.entity && log.imm) {');
    expect(indexHtml).toContain('_logpApplyPartial(log, presa.log);');
    // plus aucune réaffectation inconditionnelle des groupes
    expect(indexHtml).not.toContain('log.presentation = presa.log.presentation;');
    expect(indexHtml).not.toContain('log.quartier = presa.log.quartier;');
    expect(indexHtml).not.toContain('log.locationInfo = presa.log.locationInfo;');
  });

  it('un seul champ présent → une seule clé renvoyée', () => {
    const presa = read({ 'logp-loc-dgRef': { value: '900' } });
    expect(Object.keys(presa.log)).toEqual(['dgRef']);
    expect(presa.log.dgRef).toBe('900');
  });

  it('champ présent mais vidé/décoché → la valeur EST écrasée (pas de merge fantôme)', () => {
    const log = logPeuple();
    const dom = domComplet();
    _logpApplyPartial(log, read(dom).log);
    expect(log.equipements.cuisine.equipee).toBe(false);
    expect(log.equipements.cuisine.four).toBe(false);
    expect(log.presentation.exposition).toBe('');
    expect(log.locationInfo.garanties_acceptees).toEqual([]);
    expect(log.quartier.transports).toEqual({});
    expect(log.exterieurs.balcon).toEqual({ present: false, surface: 0 });
    expect(log.annexes.cave).toEqual({ present: false, num: '' });
  });

  it('formulaire complet rempli → mêmes valeurs qu\'avant le correctif', () => {
    const dom = domComplet({
      'logp-cu-four': { checked: true },
      'logp-ext-balcon-p': { value: '1' }, 'logp-ext-balcon-s': { value: '7.5' },
      'logp-an-parking-p': { checked: true }, 'logp-an-parking-num': { value: 'P3' }, 'logp-an-parking-type': { value: 'box' },
      'logp-pres-exposition': { value: 'sud' },
      'logp-q-metro': { value: '4' }, 'logp-q-reperes': { value: 'Parc\n\nGare ' },
      'logp-q-c-bord-de-mer': { checked: true },
      'logp-loc-dispo': { value: '2026-10-01' }, 'logp-loc-g-visale': { checked: true },
      'logp-loc-hcRef': { value: '810' }, 'logp-loc-irlRef': { value: 'T1 2026' },
      'logp-ec-ascenseur': { checked: true }
    });
    const presa = read(dom, { ec: ['Local poubelles'], cu: ['Îlot'], an: ['Casier'] });
    expect(presa.equipementsCommuns.ascenseur).toBe(true);
    expect(presa.equipementsCommuns.customs).toEqual(['Local poubelles']);
    expect(presa.log['equipements.cuisine'].four).toBe(true);
    expect(presa.log['equipements.cuisine'].customs).toEqual(['Îlot']);
    expect(presa.log['exterieurs.balcon']).toEqual({ present: true, surface: 7.5 });
    expect(presa.log['annexes.parking']).toEqual({ present: true, num: 'P3', type: 'box' });
    expect(presa.log['annexes.customs']).toEqual(['Casier']);
    expect(presa.log['presentation.exposition']).toBe('sud');
    expect(presa.log['quartier.transports']).toEqual({ metro: 4 });
    expect(presa.log['quartier.reperes']).toEqual(['Parc', 'Gare']);
    expect(presa.log['quartier.caractere']).toEqual(['bord-de-mer']);
    expect(presa.log['locationInfo.disponibilite']).toBe('2026-10-01');
    expect(presa.log['locationInfo.garanties_acceptees']).toEqual(['visale']);
    expect(presa.log.loyerHcRef).toBe('810');
    expect(presa.log.irlRef).toBe('T1 2026');
  });
});

describe('_logpApplyPartial — merge par chemin pointé', () => {
  it('crée les objets intermédiaires manquants', () => {
    const t = {};
    _logpApplyPartial(t, { 'equipements.cuisine': { four: true } });
    expect(t).toEqual({ equipements: { cuisine: { four: true } } });
  });

  it('ne touche pas les frères et sœurs du chemin', () => {
    const t = { equipements: { cuisine: { four: true }, sanitaires: { douche: true } } };
    _logpApplyPartial(t, { 'equipements.cuisine': { four: false } });
    expect(t.equipements.sanitaires).toEqual({ douche: true });
  });

  it('remplace la feuille en entier (pas de fusion partielle)', () => {
    const t = { annexes: { cave: { present: true, num: 'C1' } } };
    _logpApplyPartial(t, { 'annexes.cave': { present: false, num: '' } });
    expect(t.annexes.cave).toEqual({ present: false, num: '' });
  });

  it('ignore les valeurs undefined et les partials vides', () => {
    const t = { a: 1 };
    _logpApplyPartial(t, { a: undefined, b: undefined });
    _logpApplyPartial(t, {});
    _logpApplyPartial(t, null);
    expect(t).toEqual({ a: 1 });
  });

  it('écrase un intermédiaire non-objet plutôt que de planter', () => {
    const t = { annexes: 'texte legacy' };
    _logpApplyPartial(t, { 'annexes.cave': { present: true } });
    expect(t.annexes).toEqual({ cave: { present: true } });
  });

  it('refuse les segments de pollution de prototype', () => {
    const t = {};
    _logpApplyPartial(t, { '__proto__.pollue': 1, 'constructor.prototype.x': 2 });
    expect({}.pollue).toBeUndefined();
    expect({}.x).toBeUndefined();
    expect(t).toEqual({});
  });

  it('retourne la cible telle quelle si elle n\'est pas un objet', () => {
    expect(_logpApplyPartial(null, { a: 1 })).toBe(null);
  });
});

describe('non-divergence — le shadow inline est identique au module', () => {
  it('index.html porte exactement la fonction de js/core/logp-partial.js', () => {
    const inline = extractFn(indexHtml, '_logpApplyPartial');
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/logp-partial.js'), 'utf8');
    const fromModule = extractFn(moduleSrc.replace('export function _logpApplyPartial', 'function _logpApplyPartial'), '_logpApplyPartial');
    expect(inline).toBeTruthy();
    expect(fromModule).toBeTruthy();
    expect(inline).toBe(fromModule);
  });
});
