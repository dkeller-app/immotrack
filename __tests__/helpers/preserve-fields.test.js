// « Aucun champ laissé derrière » — audit BIENS, constats C2 (Critique) et I5.
//
// saveImm et saveEnt RECONSTRUISENT leur objet depuis le formulaire puis remplacent l'ancien.
// Tout champ sans input y disparaissait SANS TOMBSTONE ET SANS UNDO. Le pire cas, vécu :
// `compteursCollectifs` est le SEUL stockage des compteurs collectifs d'un immeuble, de leurs
// relevés et de leurs factures — ouvrir « Modifier l'immeuble » et enregistrer effaçait toutes
// les charges communes de l'immeuble.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { _preserverChampsExistants } from '../../js/core/preserve-fields.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  if (end === -1) return null;
  return src.slice(start, end + 2).replace(/\r/g, '');
}

describe('_preserverChampsExistants — le cœur du correctif', () => {
  it('reporte les champs absents de l\'objet reconstruit', () => {
    const reconstruit = { id: 1, nom: 'FERRETTE' };
    const existant = { id: 1, nom: 'ANCIEN', compteursCollectifs: [{ id: 9 }], contenance: 350 };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.compteursCollectifs).toEqual([{ id: 9 }]);
    expect(reconstruit.contenance).toBe(350);
  });

  it('n\'écrase JAMAIS ce que le formulaire a produit (même une valeur vide ou fausse)', () => {
    const reconstruit = { nom: '', nbLots: 0, syndic: null, notes: '' };
    _preserverChampsExistants(reconstruit, { nom: 'ANCIEN', nbLots: 5, syndic: { nom: 'X' }, notes: 'vieilles notes' });
    expect(reconstruit).toEqual({ nom: '', nbLots: 0, syndic: null, notes: '' });
  });

  it('CAS VÉCU — « Modifier l\'immeuble » puis Enregistrer ne perd plus les charges communes', () => {
    const existant = {
      id: 11, nom: 'FERRETTE', adr: '14 rue', annee: 1968,
      compteursCollectifs: [{ id: 1, nom: 'Eau froide générale', releves: [{ date: '2026-01-01', index: 412 }], factures: [{ mvt: 77 }] }],
      contenance: 350, surfaceTotale: 268, _espaceId: 'ESP-SCI-PARTAGEE', _deleted: false
    };
    // ce que la modale reconstruit (aucun input pour les 5 derniers champs)
    const reconstruit = { id: 11, nom: 'FERRETTE', adr: '14 rue de Ferrette', annee: 1968 };
    _preserverChampsExistants(reconstruit, existant);
    expect(reconstruit.compteursCollectifs[0].releves).toHaveLength(1);
    expect(reconstruit.compteursCollectifs[0].factures).toHaveLength(1);
    expect(reconstruit.contenance).toBe(350);
    expect(reconstruit.surfaceTotale).toBe(268);
    expect(reconstruit.adr).toBe('14 rue de Ferrette');   // la saisie gagne
  });

  it('MULTI-ESPACE — le tag de provenance _espaceId survit (partage SCI)', () => {
    const r = { id: 1, nom: 'SCI X' };
    _preserverChampsExistants(r, { id: 1, nom: 'SCI X', _espaceId: 'ESP-TIERS', capital: 1000 });
    expect(r._espaceId).toBe('ESP-TIERS');
    expect(r.capital).toBe(1000);
  });

  it('un tombstone n\'est pas ressuscité par une simple édition', () => {
    const r = { id: 1, nom: 'X' };
    _preserverChampsExistants(r, { id: 1, nom: 'X', _deleted: true, _deletedAt: '2026-01-01' });
    expect(r._deleted).toBe(true);
    expect(r._deletedAt).toBe('2026-01-01');
  });

  it('entrées dégradées : rend la cible telle quelle', () => {
    expect(_preserverChampsExistants(null, { a: 1 })).toBe(null);
    const r = { a: 1 };
    expect(_preserverChampsExistants(r, null)).toBe(r);
    expect(_preserverChampsExistants(r, undefined)).toEqual({ a: 1 });
  });

  it('refuse les clés de pollution de prototype', () => {
    const r = {};
    const sale = JSON.parse('{"__proto__":{"pollue":1},"ok":2}');
    _preserverChampsExistants(r, sale);
    expect({}.pollue).toBeUndefined();
    expect(r.ok).toBe(2);
  });

  it('IDEMPOTENCE — un second passage ne change rien', () => {
    const r = { a: 1 };
    const e = { a: 9, b: 2, c: 3 };
    _preserverChampsExistants(r, e);
    const apres = JSON.parse(JSON.stringify(r));
    _preserverChampsExistants(r, e);
    expect(r).toEqual(apres);
  });
});

describe('branchement dans les 2 modales qui reconstruisent leur objet', () => {
  it('saveImm préserve les champs de l\'immeuble existant', () => {
    const src = extractFn(html, 'saveImm');
    expect(src).toBeTruthy();
    expect(src).toContain('_preserverChampsExistants(im, existingIm);');
    // l'ancienne protection nominative d'_espaceId, seule, ne suffisait pas
    expect(src).not.toContain('if (existingIm && existingIm._espaceId != null) im._espaceId = existingIm._espaceId;');
  });

  it('saveEnt préserve les champs du bailleur existant', () => {
    const src = extractFn(html, 'saveEnt');
    expect(src).toBeTruthy();
    expect(src).toContain('_preserverChampsExistants(ent, existing);');
  });

  it('la préservation intervient AVANT l\'écriture en base (sinon elle ne sert à rien)', () => {
    const imm = extractFn(html, 'saveImm');
    expect(imm.indexOf('_preserverChampsExistants(im, existingIm);'))
      .toBeLessThan(imm.indexOf('ent.immeubles[parseInt(idx)] = im;'));
    const ent = extractFn(html, 'saveEnt');
    expect(ent.indexOf('_preserverChampsExistants(ent, existing);'))
      .toBeLessThan(ent.indexOf('DB.entites[i]=ent;'));
  });
});

describe('non-divergence — le shadow inline est identique au module', () => {
  it('index.html porte exactement la fonction de js/core/preserve-fields.js', () => {
    const moduleSrc = readFileSync(resolve(repoRoot, 'js/core/preserve-fields.js'), 'utf8').replace(/^export /gm, '');
    const inline = extractFn(html, '_preserverChampsExistants');
    const fromModule = extractFn(moduleSrc, '_preserverChampsExistants');
    expect(inline).toBeTruthy();
    expect(fromModule).toBeTruthy();
    expect(inline).toBe(fromModule);
  });
});

describe('_renderAttachmentSection — le filtre par catégorie (audit I1)', () => {
  it('la catégorie est bien appliquée au filtre, pas seulement transmise à l\'uploader', () => {
    // Sans ça, la pastille Photos de la fiche immeuble listait les PDF juridiques et la pastille
    // Documents listait les photos — les compteurs, eux, filtraient : les listes les contredisaient.
    const src = extractFn(html, '_renderAttachmentSection');
    expect(src).toBeTruthy();
    expect(src).toContain('(!category || d.category === category)');
  });
});
