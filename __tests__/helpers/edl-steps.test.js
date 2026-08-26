/**
 * __tests__/helpers/edl-steps.test.js — chantier EDL-TÉLÉPHONE, étape 2 (CDC §2.1/§2.2).
 *
 * Le cœur : faire de l'EDL ENTIER un parcours à étapes (l'admin cesse d'être un mur de
 * 6 884 px permanent). Tests de comportement sur le module pur (jamais d'extrait de
 * source d'index.html).
 */
import { describe, it, expect } from 'vitest';
import {
  ADMIN_HEAD, buildSteps, sectionVisible, stepGlobalLabel, firstPieceStep,
} from '../../js/core/edl-steps.js';

describe('buildSteps — l\'ordre validé (CDC §2.2)', () => {
  it('logement nu, 7 pièces → 12 étapes, admin puis pièces puis fin', () => {
    const steps = buildSteps({ mobilierEnabled: false, pieceCount: 7 });
    expect(steps).toHaveLength(12);
    expect(steps.map(s => s.id)).toEqual([
      'infos', 'compteurs', 'cles', 'daaf',
      'piece:0', 'piece:1', 'piece:2', 'piece:3', 'piece:4', 'piece:5', 'piece:6',
      'fin',
    ]);
    // ordre exact des 4 têtes administratives
    expect(steps.slice(0, 4).map(s => s.id)).toEqual(['infos', 'compteurs', 'cles', 'daaf']);
    // la fin est TOUJOURS la dernière
    expect(steps[steps.length - 1].id).toBe('fin');
  });

  it('logement meublé → l\'étape mobilier s\'insère APRÈS le DAAF, AVANT les pièces (13 étapes)', () => {
    const steps = buildSteps({ mobilierEnabled: true, pieceCount: 7 });
    expect(steps).toHaveLength(13);
    const ids = steps.map(s => s.id);
    expect(ids.indexOf('mobilier')).toBe(4);            // juste après daaf (index 3)
    expect(ids.indexOf('mobilier')).toBeLessThan(ids.indexOf('piece:0'));
  });

  it('logement nu → AUCUNE étape mobilier (pas d\'étape vide, CDC §2.2)', () => {
    const steps = buildSteps({ mobilierEnabled: false, pieceCount: 3 });
    expect(steps.some(s => s.id === 'mobilier')).toBe(false);
  });

  it('les pièces portent leur nom réel et leur pieceIdx', () => {
    const steps = buildSteps({ pieceNames: ['Entrée', 'Séjour', 'Cuisine'] });
    const pieces = steps.filter(s => s.kind === 'piece');
    expect(pieces.map(p => p.nom)).toEqual(['Entrée', 'Séjour', 'Cuisine']);
    expect(pieces.map(p => p.pieceIdx)).toEqual([0, 1, 2]);
  });

  it('pièce sans nom → libellé de repli « Pièce N »', () => {
    const steps = buildSteps({ pieceNames: ['', '  '] });
    expect(steps.filter(s => s.kind === 'piece').map(p => p.nom)).toEqual(['Pièce 1', 'Pièce 2']);
  });

  it('zéro pièce → juste les 4 admin + fin', () => {
    const steps = buildSteps({ pieceCount: 0 });
    expect(steps.map(s => s.id)).toEqual(['infos', 'compteurs', 'cles', 'daaf', 'fin']);
  });

  it('ADMIN_HEAD fige l\'ordre des 4 sections administratives de tête', () => {
    expect(ADMIN_HEAD.map(s => s.id)).toEqual(['infos', 'compteurs', 'cles', 'daaf']);
  });
});

describe('sectionVisible — une seule étape à l\'écran (invariant §2.10 nº2)', () => {
  it('une section ordinaire n\'est visible que sur SON étape', () => {
    expect(sectionVisible('compteurs', 'compteurs', false)).toBe(true);
    expect(sectionVisible('compteurs', 'cles', false)).toBe(false);
    expect(sectionVisible('cles', 'daaf', false)).toBe(false);
    expect(sectionVisible('fin', 'fin', false)).toBe(true);
  });

  it('mobilier ACTIVÉ : la section mobilier n\'apparaît que sur l\'étape mobilier', () => {
    expect(sectionVisible('mobilier', 'mobilier', true, true)).toBe(true);
    expect(sectionVisible('mobilier', 'infos', true, true)).toBe(false);
    expect(sectionVisible('mobilier', 'compteurs', true, true)).toBe(false);
  });

  it('mobilier DÉSACTIVÉ : la section (réduite à l\'interrupteur) se replie dans Infos', () => {
    // atteignable sur Infos pour pouvoir cocher « meublé », nulle part ailleurs
    expect(sectionVisible('mobilier', 'infos', false, true)).toBe(true);
    expect(sectionVisible('mobilier', 'mobilier', false, true)).toBe(false);
    expect(sectionVisible('mobilier', 'compteurs', false, true)).toBe(false);
  });
});

describe('stepGlobalLabel — « Étape N / total » borné', () => {
  it('formate 1-based', () => {
    expect(stepGlobalLabel(0, 12)).toBe('Étape 1 / 12');
    expect(stepGlobalLabel(1, 12)).toBe('Étape 2 / 12');
    expect(stepGlobalLabel(11, 12)).toBe('Étape 12 / 12');
  });
  it('borne les débordements et gère le vide', () => {
    expect(stepGlobalLabel(99, 12)).toBe('Étape 12 / 12');
    expect(stepGlobalLabel(-3, 12)).toBe('Étape 1 / 12');
    expect(stepGlobalLabel(0, 0)).toBe('');
    expect(stepGlobalLabel(NaN, 12)).toBe('');
  });
});

describe('firstPieceStep', () => {
  it('rend l\'index de la première pièce', () => {
    expect(firstPieceStep(buildSteps({ pieceCount: 7 }))).toBe(4);
    expect(firstPieceStep(buildSteps({ mobilierEnabled: true, pieceCount: 7 }))).toBe(5);
  });
  it('rend -1 sans pièce', () => {
    expect(firstPieceStep(buildSteps({ pieceCount: 0 }))).toBe(-1);
  });
});
