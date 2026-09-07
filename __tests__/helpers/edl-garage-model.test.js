/**
 * Tests edl-garage-model — modèle EDL réduit garage/parking/box/stockage (CDC-EDL-GARAGE).
 */
import { describe, it, expect } from 'vitest';
import {
  EDL_GARAGE_ELEMENTS, garageEdlLabel, buildGarageEdlPieces
} from '../../js/core/edl-garage-model.js';

describe('EDL_GARAGE_ELEMENTS — liste validée (Didier)', () => {
  it('exactement porte/serrure/huisserie/sol/plafond/toiture/éclairage/prise', () => {
    expect(EDL_GARAGE_ELEMENTS).toEqual([
      'Porte', 'Serrure', 'Huisserie', 'Sol', 'Plafond', 'Toiture', 'Éclairage', 'Prise électrique'
    ]);
  });
  it('ne contient PAS « clé et bip » (géré dans Moyens d\'accès) ni rubrique inventée', () => {
    const j = EDL_GARAGE_ELEMENTS.join(' ').toLowerCase();
    expect(j).not.toMatch(/cl[ée]|bip|badge/);
    expect(j).not.toMatch(/n° d'emplacement|délimitation|marquage/);
  });
  it('est figée (immutable)', () => {
    expect(Object.isFrozen(EDL_GARAGE_ELEMENTS)).toBe(true);
  });
});

describe('garageEdlLabel — libellé par nature', () => {
  it('un libellé par nature, défaut Box', () => {
    expect(garageEdlLabel('place')).toMatch(/stationnement/i);
    expect(garageEdlLabel('box')).toBe('Box');
    expect(garageEdlLabel('garage')).toBe('Garage');
    expect(garageEdlLabel('stockage')).toMatch(/stockage/i);
    expect(garageEdlLabel('cave')).toBe('Box');
    expect(garageEdlLabel()).toBe('Box');
  });
});

describe('buildGarageEdlPieces — structure _edlP', () => {
  it('un seul bloc, éléments = la liste validée, MÊME liste pour toutes les natures', () => {
    for (const n of ['place', 'box', 'garage', 'stockage']) {
      const p = buildGarageEdlPieces(n);
      expect(p).toHaveLength(1);
      expect(p[0].elements.map(e => e.nom)).toEqual([...EDL_GARAGE_ELEMENTS]);
    }
  });
  it('chaque élément a les champs entrée ET sortie (forme du moteur EDL)', () => {
    const el = buildGarageEdlPieces('box')[0].elements[0];
    expect(el).toMatchObject({ nom: 'Porte', etatE: '', obsE: '', etatS: '', obsS: '' });
    expect(Array.isArray(el.photosE)).toBe(true);
    expect(Array.isArray(el.photosS)).toBe(true);
  });
  it('le libellé du bloc suit la nature', () => {
    expect(buildGarageEdlPieces('garage')[0].nom).toBe('Garage');
    expect(buildGarageEdlPieces('place')[0].nom).toMatch(/stationnement/i);
  });
  it('photos indépendantes entre éléments (pas de référence partagée)', () => {
    const p = buildGarageEdlPieces('box')[0].elements;
    p[0].photosE.push('x');
    expect(p[1].photosE).toHaveLength(0);
  });
});
