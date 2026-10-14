/**
 * __tests__/helpers/edl-dictee.test.js — chantier EDL-VOIX-IA : logique pure de la dictée d'EDL.
 * Volume réel : la cuisine (25 éléments du modèle).
 */
import { describe, it, expect } from 'vitest';
import * as D from '../../js/core/edl-dictee.js';

const CUISINE = { nom: 'Cuisine', elements: ['Sol', 'Plinthes', 'Murs', 'Plafond', 'Fenêtre', 'Volet / Store', 'Porte, clé et poignée', 'Évier', 'Robinetterie évier', 'Meubles bas (portes, étagères, tiroirs)', 'Meubles hauts (portes, étagères, tiroirs)', 'Plan de travail', 'Crédence', 'Plaques de cuisson', 'Hotte aspirante', 'Four', 'Réfrigérateur', 'Lave-vaisselle', 'Radiateur et thermostat', 'Prises électriques (+ caches)', 'Interrupteurs (+ caches)', 'Prise Internet (RJ45)', 'Éclairage', 'VMC / Aération', 'Autres observations'].map((nom) => ({ nom, etatE: '', obsE: '', etatS: '', obsS: '' })) };

describe('entrée envoyée à l’IA', () => {
  it('pièce : 25 éléments, id = position, ligne « note » marquée', () => {
    const e = D.entreePiece(CUISINE, false);
    expect(e.piece).toBe('Cuisine');
    expect(e.mode).toBe('entree');
    expect(e.elements).toHaveLength(25);
    expect(e.elements[7]).toEqual({ id: '7', nom: 'Évier', note: false });
    expect(e.elements[24]).toEqual({ id: '24', nom: 'Autres observations', note: true });
  });
  it('sortie ; éléments sans nom ignorés (l’id reste la position réelle)', () => {
    const p = { nom: '  ', elements: [{ nom: 'Sol' }, { nom: '' }, { nom: ' Murs  ' }] };
    const e = D.entreePiece(p, true);
    expect(e.mode).toBe('sortie');
    expect(e.piece).toBe('Pièce');
    expect(e.elements).toEqual([{ id: '0', nom: 'Sol', note: false }, { id: '2', nom: 'Murs', note: false }]);
  });
  it('nom d’élément trop long : non proposé à l’IA (sinon le relais refuserait toute la dictée)', () => {
    const e = D.entreePiece({ nom: 'P', elements: [{ nom: 'x'.repeat(121) }, { nom: 'Sol' }] }, false);
    expect(e.elements).toEqual([{ id: '1', nom: 'Sol', note: false }]);
  });
  it('compteurs : aucun élément', () => {
    expect(D.entreeCompteurs(true)).toEqual({ piece: 'Compteurs', mode: 'sortie', elements: [] });
  });
  it('aucune donnée de la pièce autre que les noms (pas d’observation existante envoyée)', () => {
    const p = { nom: 'Séjour', elements: [{ nom: 'Sol', obsE: 'Locataire M. Dupont, allergique' }] };
    expect(JSON.stringify(D.entreePiece(p, false))).not.toContain('Dupont');
  });
});

// ── Lot B2 : inscrire, annuler, ajouter — sans jamais toucher l'entrée signée, une note, un EDL signé ──
const el = (o = {}) => ({ nom: 'Évier', etatE: '', obsE: '', etatS: '', obsS: '', photosE: [], photosS: [], ...o });
const PROP = { elementId: '7', etat: "État d'usage", observation: 'Évier style ancien, rayures.', source: 'vasque évier style ancien avec rayures', justification: '« avec rayures »', aVerifier: null };
const T0 = new Date('2026-10-14T09:00:00Z');

describe('inscription d’une proposition acceptée', () => {
  it('entrée : etatE / obsE + marque iaE, valeur d’avant rendue pour l’annulation', () => {
    const x = el({ etatE: 'Bon état' });
    const r = D.calculerInscription(x, PROP, { modele: 'mistral-small', maintenant: T0 });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ etatE: "État d'usage", obsE: 'Évier style ancien, rayures.', iaE: { etat: true, obs: true, at: T0.toISOString(), modele: 'mistral-small' } });
    expect(r.avant).toEqual({ etatE: 'Bon état', obsE: '', iaE: null });
  });
  it('sortie : etatS / obsS seulement — l’entrée signée n’est jamais dans le patch', () => {
    const x = el({ etatE: 'Bon état', obsE: 'Signée.' });
    const r = D.calculerInscription(x, PROP, { sortie: true, maintenant: T0 });
    expect(Object.keys(r.patch).sort()).toEqual(['etatS', 'iaS', 'obsS']);
    D.appliquerPatch(x, r.patch);
    expect([x.etatE, x.obsE]).toEqual(['Bon état', 'Signée.']);
  });
  it('« État non dicté » : l’état existant est gardé, seule l’observation s’inscrit', () => {
    const x = el({ etatE: 'Bon état' });
    const r = D.calculerInscription(x, { ...PROP, etat: null, justification: null }, { maintenant: T0 });
    expect(r.patch.etatE).toBeUndefined();
    D.appliquerPatch(x, r.patch);
    expect(x.etatE).toBe('Bon état');
    expect(x.iaE).toMatchObject({ etat: false, obs: true });
  });
  it('ligne « note » : jamais d’état', () => {
    const r = D.calculerInscription(el({ nom: 'Autres observations' }), PROP, { maintenant: T0 });
    expect(r.patch.etatE).toBeUndefined();
    expect(r.patch.obsE).toBe(PROP.observation);
  });
  it('EDL signé : refus', () => {
    expect(D.calculerInscription(el(), PROP, { signe: true })).toEqual({ ok: false, raison: 'signe' });
  });
  it('choix de l’utilisateur (Modifier) : remplace la proposition, marqué « modifié »', () => {
    const r = D.calculerInscription(el(), PROP, { choix: { etat: 'Mauvais état', observation: '  Fêlé.  ' }, maintenant: T0 });
    expect(r.patch).toMatchObject({ etatE: 'Mauvais état', obsE: 'Fêlé.', iaE: { modifie: true } });
    expect(D.calculerInscription(el(), PROP, { choix: { etat: 'Inventé' } }).raison).toBe('etat');
    expect(D.calculerInscription(el(), PROP, { choix: { etat: null, observation: '' } }).raison).toBe('vide');
  });
  it('une marque d’une dictée précédente est gardée sur le champ non réécrit', () => {
    const x = el({ iaE: { etat: true, obs: false } });
    const r = D.calculerInscription(x, { ...PROP, etat: null }, { maintenant: T0 });
    expect(r.patch.iaE).toMatchObject({ etat: true, obs: true });
  });
});

describe('annulation', () => {
  it('restitue la valeur d’avant si personne n’a retouché', () => {
    const x = el({ etatE: 'Bon état', obsE: 'Avant.' });
    const r = D.calculerInscription(x, PROP, { maintenant: T0 });
    D.appliquerPatch(x, r.patch);
    const a = D.calculerAnnulation(x, { etatE: r.patch.etatE, obsE: r.patch.obsE }, r.avant, {});
    D.appliquerPatch(x, a.patch);
    expect([x.etatE, x.obsE, 'iaE' in x]).toEqual(['Bon état', 'Avant.', false]);
  });
  it('refuse si la valeur a été retouchée depuis (n’écrase jamais une saisie)', () => {
    const x = el();
    const r = D.calculerInscription(x, PROP, { maintenant: T0 });
    D.appliquerPatch(x, r.patch);
    x.obsE = 'Corrigé à la main.';
    expect(D.calculerAnnulation(x, { etatE: r.patch.etatE, obsE: r.patch.obsE }, r.avant, {})).toEqual({ ok: false, raison: 'modifie_depuis' });
  });
  it('ne restitue QUE les champs écrits (un champ saisi depuis reste)', () => {
    const x = el({ etatE: 'Bon état' });
    const r = D.calculerInscription(x, { ...PROP, etat: null }, { maintenant: T0 });
    D.appliquerPatch(x, r.patch);
    x.etatE = 'Neuf';
    const a = D.calculerAnnulation(x, { obsE: r.patch.obsE }, r.avant, {});
    D.appliquerPatch(x, a.patch);
    expect(x.etatE).toBe('Neuf');
    expect(x.obsE).toBe('');
  });
});

describe('retrouver l’élément, non cités, bilan', () => {
  const entree = D.entreePiece(CUISINE, false);
  it('par position si le nom correspond, sinon par nom, sinon -1 (jamais le mauvais élément)', () => {
    expect(D.retrouverElement(CUISINE, '7', entree)).toBe(7);
    const decale = { ...CUISINE, elements: [{ nom: 'Nouveau' }, ...CUISINE.elements] };
    expect(D.retrouverElement(decale, '7', entree)).toBe(8);
    const sans = { ...CUISINE, elements: CUISINE.elements.filter((x) => x.nom !== 'Évier') };
    expect(D.retrouverElement(sans, '7', entree)).toBe(-1);
    expect(D.retrouverElement(CUISINE, '99', entree)).toBe(-1);
  });
  it('éléments non cités = laissés tels quels', () => {
    const nc = D.nonCites(CUISINE, { propositions: [{ elementId: '7' }, { elementId: '0' }] }, entree);
    expect(nc).toHaveLength(23);
    expect(nc).not.toContain('Évier');
  });
  it('bilan des décisions (annuler = décision effacée)', () => {
    const r = { propositions: [{ elementId: '0' }, { elementId: '7' }], aAjouter: [{ nom: 'x' }], compteurs: [{ cle: 'gaz' }] };
    expect(D.bilanDecisions(r, { 'p:0': { statut: 'ok' }, 'p:7': null, 'a:0': { statut: 'ign' } })).toEqual({ total: 4, inscrites: 1, ignorees: 1, aValider: 2, propositions: 2 });
  });
  it('élément à ajouter : nouvel élément complet, marqué IA, du bon côté', () => {
    const x = D.nouvelElement({ nom: ' Machine à café ', etat: null, observation: 'Encastrée.' }, { sortie: true, maintenant: T0 });
    expect(x).toMatchObject({ nom: 'Machine à café', etatE: '', obsE: '', obsS: 'Encastrée.', photosE: [], photosS: [], iaS: { etat: false, obs: true } });
  });
});

describe('modèle de l’écran de relecture (volume réel)', () => {
  it('lignes, entrée signée en référence (sortie), compteurs', () => {
    const piece = JSON.parse(JSON.stringify(CUISINE));
    piece.elements[7].etatE = 'Bon état'; piece.elements[7].obsE = 'Signée.';
    const item = { entree: D.entreePiece(piece, true), decisions: {}, resultat: { propositions: [PROP], aAjouter: [], compteurs: [{ cle: 'eau-f', valeur: '456.3', source: 'eau froide 456,3' }], corrections: [{ entendu: 'vasque', compris: 'évier' }] } };
    const m = D.modeleRelecture({ item, piece, sortie: true, compteursActuels: { 'eau-f': '' }, compteursEntree: { 'eau-f': '431,8' } });
    expect(m.lignes[0]).toMatchObject({ cle: 'p:7', ei: 7, nom: 'Évier', entreeRef: { etat: 'Bon état', obs: 'Signée.' } });
    expect(m.lignes[0].corrections).toHaveLength(1);
    expect(m.compteurs[0]).toMatchObject({ libelle: 'Eau froide · index (m³)', valeur: '456,3', entree: '431,8', bloque: null });
    expect(m.nonCites).toHaveLength(24);
    expect(m.enAttente).toBe(1);
  });
  it('entrée avec saisie existante différente : « remplace » annoncé', () => {
    const piece = JSON.parse(JSON.stringify(CUISINE));
    piece.elements[7].etatE = 'Bon état';
    const item = { entree: D.entreePiece(piece, false), decisions: {}, resultat: { propositions: [PROP] } };
    expect(D.modeleRelecture({ item, piece }).lignes[0].remplace).toEqual({ etat: 'Bon état', obs: null, oui: true });
  });
});

// ── Lot B3 : relevés de compteurs dans les champs existants ──
describe('relevés de compteurs', () => {
  it('champ cible : entrée / sortie ; un N° de compteur est le même champ', () => {
    expect(D.champCompteur('elec-hp', false)).toBe('edl-cpt-elec-hp');
    expect(D.champCompteur('elec-hp', true)).toBe('edl-cpt-elec-hp-s');
    expect(D.champCompteur('gaz-num', true)).toBe('edl-cpt-gaz-num');
    expect(D.champCompteur('piscine', false)).toBe(null);
  });
  it('affichage français (virgule décimale) ; N° tel quel', () => {
    expect(D.valeurCompteurAffichee('eau-f', '456.3')).toBe('456,3');
    expect(D.valeurCompteurAffichee('gaz-num', '0123.4')).toBe('0123.4');
  });
  it('sortie : un N° de compteur (colonne d’entrée) n’est jamais écrit ; EDL signé : rien', () => {
    expect(D.peutInscrireCompteur('gaz-num', { sortie: true, valeurActuelle: '0123' })).toEqual({ ok: false, raison: 'numero_deja_note' });
    expect(D.peutInscrireCompteur('gaz-num', { sortie: true, valeurActuelle: '' })).toEqual({ ok: false, raison: 'numero_entree' });
    expect(D.peutInscrireCompteur('gaz-num', { sortie: false, valeurActuelle: '' }).ok).toBe(true);
    expect(D.peutInscrireCompteur('gaz', { signe: true }).raison).toBe('signe');
  });
  it('les 9 clés = les champs compteurs de l’EDL', () => {
    expect(Object.keys(D.COMPTEURS)).toEqual(['elec-num', 'elec-hp', 'elec-hc', 'gaz-num', 'gaz', 'eau-c-num', 'eau-c', 'eau-f-num', 'eau-f']);
  });
});
