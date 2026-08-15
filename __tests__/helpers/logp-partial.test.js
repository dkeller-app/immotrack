// P0-1 (chantier BIENS) — « supprimer le pane Présentation efface 10 champs en silence »
//
// Avant ce correctif, _logpReadFromForm() lisait TOUT le formulaire logement par el(id) et
// renvoyait '' / false quand l'input n'existait pas dans le DOM ; saveParamLog réaffectait
// ensuite sans condition. Conséquence : retirer ou déplacer un pane effaçait
//   log.presentation · log.quartier · log.locationInfo · log.dgRef · log.irlRef
// et imm.equipementsCommuns de l'IMMEUBLE PARENT.
//
// Portée exacte de P0-1 (audit 14/08) : ce correctif pose le GARDE-FOU. Il ne suffisait pas à
// lui seul à fermer la perte d'imm.equipementsCommuns, puisque les cases logp-ec-* restaient
// dans le DOM — c'est leur retrait (étape 4, suppression du pane Présentation) qui la ferme.
// Le garde-fou reste indispensable : sans lui, ce même retrait EFFAÇAIT les données.
//
// Ces tests exécutent la VRAIE fonction extraite d'index.html (pas une réplique), avec un
// DOM simulé, et vérifient qu'un champ absent du formulaire n'est plus jamais écrit.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { _logpApplyPartial, _logpPushLoyerRef } from '../../js/core/logp-partial.js';

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

/** Formulaire COMPLET (tous les ids logp-* de la modale), valeurs neutres. */
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
    _logpPushLoyerRef(log, presa.log, false);
    expect(log).toEqual(avant);
  });

  it('RÉGRESSION — l\'immeuble parent n\'est pas touché quand le bloc equipementsCommuns est absent', () => {
    expect(read(domComplet()).equipementsCommuns).toBeTruthy();
    const sansEc = domComplet();
    ['ascenseur', 'interphone', 'digicode', 'gardien', 'videosurv', 'parking_commun', 'local_velos', 'jardin_commun']
      .forEach(k => { delete sansEc['logp-ec-' + k]; });
    expect(read(sansEc).equipementsCommuns).toBeUndefined();
  });

  it('INVENTAIRE des clés produites par un formulaire complet — un champ oublié lors d\'un futur déplacement se voit ici', () => {
    expect(Object.keys(read(domComplet()).log).sort()).toEqual([
      'annexes.atelier', 'annexes.buanderie', 'annexes.cave', 'annexes.cellier', 'annexes.customs',
      'annexes.garage', 'annexes.grenier', 'annexes.localVelos', 'annexes.parking',
      'chargesRef', 'dgRef',
      'equipements.cuisine', 'equipements.sanitaires', 'equipements.technologies',
      'exterieurs.balcon', 'exterieurs.jardin_privatif', 'exterieurs.loggia', 'exterieurs.terrasse',
      'irlRef',
      'locationInfo.disponibilite', 'locationInfo.garanties_acceptees',
      'loyerHcRef',
      'presentation.calme', 'presentation.caractere_ancien', 'presentation.exposition',
      'presentation.luminosite', 'presentation.vue',
      'quartier.caractere', 'quartier.commerces', 'quartier.reperes', 'quartier.services', 'quartier.transports'
    ]);
  });

  it('LIMITE CONNUE — la garde est au GROUPE, pas au champ : un groupe se déplace en ENTIER', () => {
    // Documenté volontairement : si on ne sortait du DOM QUE `logp-cu-four`, les 6 autres
    // cases cuisine repasseraient à false. Les groupes ne doivent donc jamais être scindés.
    const dom = domComplet({ 'logp-cu-equipee': { checked: true } });
    delete dom['logp-cu-four'];
    expect(read(dom).log['equipements.cuisine']).toBeTruthy();
    expect(read(dom).log['equipements.cuisine'].four).toBe(false);
    // en revanche, sortir le GROUPE entier ne renvoie plus rien
    ['equipee', 'four', 'plaques', 'hotte', 'lave_vaisselle', 'micro_ondes', 'frigo'].forEach(k => { delete dom['logp-cu-' + k]; });
    expect(read(dom).log['equipements.cuisine']).toBeUndefined();
  });

  it('le garde-fou côté saveParamLog est bien en place', () => {
    expect(indexHtml).toMatch(/if\s*\(presa\.equipementsCommuns\s*&&\s*log\.entity\s*&&\s*log\.imm\)/);
    expect(indexHtml).toMatch(/_logpApplyPartial\(\s*log\s*,\s*presa\.log\s*\)/);
    expect(indexHtml).toMatch(/_logpPushLoyerRef\(\s*log\s*,\s*presa\.log\s*,\s*_lrOcc\s*\)/);
    // plus aucune réaffectation inconditionnelle des groupes
    [/log\.presentation\s*=\s*presa\./, /log\.quartier\s*=\s*presa\./, /log\.locationInfo\s*=\s*presa\./,
     /log\.equipements\s*=\s*presa\./, /log\.annexes\s*=\s*presa\./, /log\.exterieurs\s*=\s*presa\./,
     /log\.dgRef\s*=\s*presa\./, /log\.irlRef\s*=\s*presa\./]
      .forEach(re => expect(indexHtml, 'réaffectation inconditionnelle restante : ' + re).not.toMatch(re));
  });

  it('un seul champ présent → une seule clé renvoyée', () => {
    const presa = read({ 'logp-loc-dgRef': { value: '900' } });
    expect(Object.keys(presa.log)).toEqual(['dgRef']);
    expect(presa.log.dgRef).toBe('900');
  });

  it('champ présent mais vidé/décoché → la valeur EST écrasée (pas de merge fantôme)', () => {
    const log = logPeuple();
    _logpApplyPartial(log, read(domComplet()).log);
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

  it('écrase un intermédiaire non-objet ou tableau plutôt que de l\'indexer', () => {
    const t = { annexes: 'texte legacy', exterieurs: ['legacy'] };
    _logpApplyPartial(t, { 'annexes.cave': { present: true }, 'exterieurs.balcon': { present: true } });
    expect(t.annexes).toEqual({ cave: { present: true } });
    expect(t.exterieurs).toEqual({ balcon: { present: true } });
  });

  it('refuse les segments de pollution de prototype, feuille comprise', () => {
    const t = {};
    _logpApplyPartial(t, { '__proto__.pollue': 1, 'constructor.prototype.x': 2, '__proto__': 3, 'a.constructor': 4 });
    expect({}.pollue).toBeUndefined();
    expect({}.x).toBeUndefined();
    expect(t).toEqual({});
  });

  it('retourne la cible telle quelle si elle n\'est pas un objet', () => {
    expect(_logpApplyPartial(null, { a: 1 })).toBe(null);
  });
});

describe('_logpPushLoyerRef — le loyer de référence ne pilote log.hc/ch/dg que sur un bien vacant', () => {
  const base = () => ({ ref: 'L1', loyerHcRef: '810', chargesRef: '75', dgRef: '810', irlRef: 'T1 2026', hc: 700, ch: 60, dg: 700 });
  const tout = { loyerHcRef: '810', chargesRef: '75', dgRef: '810', irlRef: 'T1 2026' };

  it('bien vacant + champs présents → pousse les 3 valeurs et signale le changement', () => {
    const log = base();
    expect(_logpPushLoyerRef(log, tout, false)).toBe(true);
    expect([log.hc, log.ch, log.dg]).toEqual([810, 75, 810]);
  });

  it('bien OCCUPÉ → ne touche à rien (c\'est le bail qui pilote)', () => {
    const log = base();
    expect(_logpPushLoyerRef(log, tout, true)).toBe(false);
    expect([log.hc, log.ch, log.dg]).toEqual([700, 60, 700]);
  });

  it('champ absent du formulaire → valeur stockée non repoussée', () => {
    const log = base();
    expect(_logpPushLoyerRef(log, { chargesRef: '75' }, false)).toBe(true);
    expect([log.hc, log.ch, log.dg]).toEqual([700, 75, 700]);
  });

  it('champ présent mais vidé → l\'ancienne valeur de log.hc est conservée', () => {
    const log = Object.assign(base(), { loyerHcRef: '' });
    expect(_logpPushLoyerRef(log, { loyerHcRef: '' }, false)).toBe(false);
    expect(log.hc).toBe(700);
  });

  it('irlRef seul ne déclenche RIEN — l\'IRL ne pilote ni hc, ni ch, ni dg (audit M1)', () => {
    const log = base();
    expect(_logpPushLoyerRef(log, { irlRef: 'T1 2026' }, false)).toBe(false);
    expect([log.hc, log.ch, log.dg]).toEqual([700, 60, 700]);
  });

  it('entrées dégradées', () => {
    expect(_logpPushLoyerRef(null, tout, false)).toBe(false);
    expect(_logpPushLoyerRef({}, null, false)).toBe(false);
  });
});

describe('non-divergence — les shadows inline sont identiques au module', () => {
  it('index.html porte exactement les fonctions de js/core/logp-partial.js', () => {
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/logp-partial.js'), 'utf8').replace(/^export /gm, '');
    ['_logpApplyPartial', '_logpPushLoyerRef'].forEach(nom => {
      const inline = extractFn(indexHtml, nom);
      const fromModule = extractFn(moduleSrc, nom);
      expect(inline, 'shadow inline manquant : ' + nom).toBeTruthy();
      expect(fromModule, 'fonction module manquante : ' + nom).toBeTruthy();
      expect(inline, 'divergence shadow/module sur ' + nom).toBe(fromModule);
    });
  });
});
