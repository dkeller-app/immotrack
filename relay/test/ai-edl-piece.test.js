import { describe, it, expect } from 'vitest';
import * as T from '../src/ai/tasks/edl-piece.js';
import { tache, TACHES } from '../src/ai/tasks/index.js';
import { CUISINE_INPUT } from './fixtures/edl-cuisine.js';

const entree = () => T.validerEntree(CUISINE_INPUT).input;

describe('tâche edl-piece — entrée', () => {
  it('registre : la tâche est enregistrée, une tâche inconnue est refusée', () => {
    expect(tache('edl-piece')).toBe(TACHES['edl-piece']);
    expect(tache('inconnue')).toBe(null);
    expect(tache('__proto__')).toBe(null);
    expect(tache('constructor')).toBe(null);
  });
  it('accepte la pièce de référence', () => {
    const v = T.validerEntree(CUISINE_INPUT);
    expect(v.ok).toBe(true);
    expect(v.input.elements).toHaveLength(25);
    expect(v.input.elements[24].note).toBe(true);
  });
  it('refuse texte vide, trop long, éléments invalides ou en double', () => {
    expect(T.validerEntree({ ...CUISINE_INPUT, texte: '  ' }).raison).toBe('texte_vide');
    expect(T.validerEntree({ ...CUISINE_INPUT, texte: 'x'.repeat(20001) }).raison).toBe('texte_trop_long');
    expect(T.validerEntree({ ...CUISINE_INPUT, elements: 'x' }).ok).toBe(false);
    expect(T.validerEntree({ ...CUISINE_INPUT, elements: [{ id: '1', nom: 'A' }, { id: '1', nom: 'B' }] }).ok).toBe(false);
    expect(T.validerEntree({ ...CUISINE_INPUT, elements: [{ id: 'a b', nom: 'A' }] }).ok).toBe(false);
    expect(T.validerEntree({ ...CUISINE_INPUT, elements: Array.from({ length: 121 }, (_, i) => ({ id: String(i), nom: 'x' })) }).ok).toBe(false);
    expect(T.validerEntree(null).ok).toBe(false);
  });
  it('mode : sortie ou entree (défaut prudent : entree)', () => {
    expect(T.validerEntree({ ...CUISINE_INPUT, mode: 'sortie' }).input.mode).toBe('sortie');
    expect(T.validerEntree({ ...CUISINE_INPUT, mode: 'nimporte' }).input.mode).toBe('entree');
  });
  it('messages : liste des éléments par id + transcription, états autorisés dans la consigne', () => {
    const m = T.messages(entree());
    expect(m[0].role).toBe('system');
    for (const e of T.EDL_ETATS) expect(m[0].content).toContain(JSON.stringify(e));
    const u = JSON.parse(m[1].content);
    expect(u.elements[0]).toEqual({ id: '0', nom: 'Sol' });
    expect(u.elements[24]).toEqual({ id: '24', nom: 'Autres observations', note: true });
    expect(u.transcription).toContain('faillance');
  });
  it('schéma strict : additionalProperties false + tous les champs requis', () => {
    const p = T.jsonSchema.properties.propositions.items;
    expect(p.additionalProperties).toBe(false);
    expect(p.required.sort()).toEqual(Object.keys(p.properties).sort());
    expect(p.properties.etat.enum).toEqual([...T.EDL_ETATS, null]);
  });
});

describe('tâche edl-piece — sortie du modèle', () => {
  const ok = (o) => T.validerSortie(o, entree());
  it('structure illisible → refus propre', () => {
    expect(ok(null).ok).toBe(false);
    expect(ok([]).ok).toBe(false);
    expect(ok({ propositions: 'x' }).ok).toBe(false);
    expect(ok({}).ok).toBe(true);
  });
  it('garde une proposition conforme', () => {
    const r = ok({ propositions: [{ elementId: '7', etat: "État d'usage", observation: 'Évier style ancien, rayures.', source: 'vasque évier style ancien avec rayures', justification: '« avec rayures »', aVerifier: null }] });
    expect(r.data.propositions).toEqual([{ elementId: '7', etat: "État d'usage", observation: 'Évier style ancien, rayures.', source: 'vasque évier style ancien avec rayures', justification: '« avec rayures »', aVerifier: null }]);
    expect(r.rejets).toBe(0);
  });
  it('écarte : élément hors liste, doublon, état inconnu, extrait inventé, proposition vide', () => {
    const src = 'deux placards';
    const r = ok({ propositions: [
      { elementId: '99', etat: null, observation: 'x', source: src },
      { elementId: '9', etat: null, observation: 'Deux placards.', source: src },
      { elementId: '9', etat: null, observation: 'Encore.', source: src },
      { elementId: '1', etat: 'Excellent', observation: 'x', source: src, justification: 'j' },
      { elementId: '2', etat: null, observation: 'Murs repeints.', source: 'murs repeints à neuf' },
      { elementId: '3', etat: null, observation: null, source: src },
    ] });
    expect(r.data.propositions.map((p) => p.elementId)).toEqual(['9']);
    expect(r.rejets).toBe(5);
  });
  it('état sans justification → état retiré (l\'observation reste) ; ligne note → jamais d\'état', () => {
    const r = ok({ propositions: [
      { elementId: '13', etat: "État d'usage", observation: 'Rayures.', source: 'une plaque de cuisson avec rayures', justification: null },
      { elementId: '24', etat: 'Bon état', observation: 'Note.', source: 'des prises', justification: 'j' },
    ] });
    expect(r.data.propositions[0].etat).toBe(null);
    expect(r.data.propositions[0].justification).toBe(null);
    expect(r.data.propositions[1].etat).toBe(null);
  });
  it('jamais de coupe : une observation trop longue est écartée, pas tronquée', () => {
    const r = ok({ propositions: [{ elementId: '9', etat: null, observation: 'x'.repeat(401), source: 'deux placards' }] });
    expect(r.data.propositions).toEqual([]);
    expect(r.rejets).toBe(1);
  });
  it('à ajouter : nom nouveau seulement, extrait réel', () => {
    const r = ok({ aAjouter: [
      { nom: 'Machine à café encastrée', etat: null, observation: 'Associée au four.', source: 'avec machine à café', justification: null },
      { nom: 'four', etat: null, observation: null, source: 'four à vapeur' },
      { nom: 'Cave à vin', etat: null, observation: null, source: 'cave à vin' },
    ] });
    expect(r.data.aAjouter.map((a) => a.nom)).toEqual(['Machine à café encastrée']);
    expect(r.rejets).toBe(2);
  });
  it('compteurs : clé connue, valeur numérique normalisée, extrait réel', () => {
    const inp = T.validerEntree({ ...CUISINE_INPUT, texte: 'compteur électrique 12 345, eau froide 456,3, numéro du compteur gaz 01 23 45' }).input;
    const r = T.validerSortie({ compteurs: [
      { cle: 'elec-hp', valeur: '12 345', source: 'compteur électrique 12 345' },
      { cle: 'eau-f', valeur: '456,3', source: 'eau froide 456,3' },
      { cle: 'gaz-num', valeur: '01 23 45', source: 'numéro du compteur gaz 01 23 45', aVerifier: 'Vérifier.' },
      { cle: 'gaz', valeur: 'beaucoup', source: 'compteur électrique 12 345' },
      { cle: 'piscine', valeur: '3', source: 'eau froide 456,3' },
      { cle: 'elec-hp', valeur: '1', source: 'compteur électrique 12 345' },
    ] }, inp);
    expect(r.data.compteurs).toEqual([
      { cle: 'elec-hp', valeur: '12345', source: 'compteur électrique 12 345', aVerifier: null },
      { cle: 'eau-f', valeur: '456.3', source: 'eau froide 456,3', aVerifier: null },
      { cle: 'gaz-num', valeur: '012345', source: 'numéro du compteur gaz 01 23 45', aVerifier: 'Vérifier.' },
    ]);
    expect(r.rejets).toBe(3);
  });
  it('corrections : « entendu » doit figurer dans la transcription', () => {
    const r = ok({ corrections: [{ entendu: 'faillance', compris: 'faïence' }, { entendu: 'carrelage', compris: 'carrelage' }] });
    expect(r.data.corrections).toEqual([{ entendu: 'faillance', compris: 'faïence' }]);
  });
});
