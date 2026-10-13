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
  it('compteurs : aucun élément', () => {
    expect(D.entreeCompteurs(true)).toEqual({ piece: 'Compteurs', mode: 'sortie', elements: [] });
  });
  it('aucune donnée de la pièce autre que les noms (pas d’observation existante envoyée)', () => {
    const p = { nom: 'Séjour', elements: [{ nom: 'Sol', obsE: 'Locataire M. Dupont, allergique' }] };
    expect(JSON.stringify(D.entreePiece(p, false))).not.toContain('Dupont');
  });
});
