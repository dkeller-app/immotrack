// Jeu de RÉFÉRENCE de la dictée d'EDL : la cuisine de Didier (test réel du 12/10/2026).
// Transcription brute Whisper de 59 s (PROPRYO-COM/tests vidéos/transcription-cuisine.txt), avec ses
// erreurs, et le brouillon attendu (PROPRYO-COM/tests vidéos/brouillon-edl/brouillon-edl-cuisine.md)
// ramené aux 25 éléments du modèle « Cuisine » d'EDL_TPL.
import { FAKE_TEXTE } from '../../src/ai/fake.js';

export const CUISINE_ELEMENTS = ['Sol', 'Plinthes', 'Murs', 'Plafond', 'Fenêtre', 'Volet / Store', 'Porte, clé et poignée',
  'Évier', 'Robinetterie évier', 'Meubles bas (portes, étagères, tiroirs)', 'Meubles hauts (portes, étagères, tiroirs)',
  'Plan de travail', 'Crédence', 'Plaques de cuisson', 'Hotte aspirante', 'Four', 'Réfrigérateur', 'Lave-vaisselle',
  'Radiateur et thermostat', 'Prises électriques (+ caches)', 'Interrupteurs (+ caches)', 'Prise Internet (RJ45)',
  'Éclairage', 'VMC / Aération', 'Autres observations'];

export const CUISINE_TEXTE = FAKE_TEXTE;

export const CUISINE_INPUT = {
  piece: 'Cuisine', mode: 'entree', texte: CUISINE_TEXTE,
  elements: CUISINE_ELEMENTS.map((nom, i) => ({ id: String(i), nom, note: nom === 'Autres observations' })),
};

export const CUISINE_ATTENDU = {
  elements: CUISINE_ELEMENTS,
  propositions: {
    'Sol': { etat: null, mots: ['carrelage'] },
    'Porte, clé et poignée': { etat: null, mots: ['porte', 'vitree'] },
    'Évier': { etat: "État d'usage", mots: ['rayures'] },
    'Meubles bas (portes, étagères, tiroirs)': { etat: null, mots: ['deux placards'] },
    'Meubles hauts (portes, étagères, tiroirs)': { etat: null, mots: ['compter'] },
    'Plan de travail': { etat: null, mots: ['trois tiroirs'] },
    'Crédence': { etat: null, mots: ['faience'] },
    'Plaques de cuisson': { etat: "État d'usage", mots: ['rayures'] },
    'Four': { etat: null, mots: ['vapeur'] },
    'Réfrigérateur': { etat: null, mots: ['congelateur'] },
    'Lave-vaisselle': { etat: null, mots: ['verifier'] },
    'Prises électriques (+ caches)': { etat: null, mots: ['prises'] },
    'Éclairage': { etat: null, mots: ['point lumineux'] },
  },
  corrections: [
    { entendu: "car l'âge", compris: 'carrelage' },
    { entendu: 'faillance', compris: 'faïence' },
    { entendu: 'un de la vaisselle', compris: 'lave-vaisselle' },
    { entendu: 'nom de placard', compris: 'nombre de placards' },
  ],
  aAjouter: ['machine à café'],
};
