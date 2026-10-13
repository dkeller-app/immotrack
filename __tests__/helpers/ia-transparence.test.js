/**
 * __tests__/helpers/ia-transparence.test.js — chantier EDL-VOIX-IA, lot A2 (transparence, RGPD).
 * Décisions Didier 13/10 : rétention zéro (constante unique basculable), mention discrète dans le PDF
 * seulement si au moins une proposition a été acceptée.
 */
import { describe, it, expect } from 'vitest';
import * as T from '../../js/core/ia-transparence.js';

const TUTOIE = /\b(tu|te|toi|ton|ta|tes|vous|votre|vos)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('notice de première utilisation', () => {
  it('rétention zéro (défaut décidé le 13/10) : « ne conserve ni l’enregistrement ni le texte »', () => {
    expect(T.RETENTION_ZERO).toBe(true);
    const n = T.notice();
    const tout = [n.intro, ...n.sections.map((s) => s.texte)].join(' ');
    expect(tout).toContain('ne conserve ni l’enregistrement ni le texte');
    expect(tout).not.toContain('30 jours');
  });
  it('bascule par la seule constante : sans rétention zéro, « 30 jours au plus »', () => {
    const tout = T.notice({ retentionZero: false }).sections.map((s) => s.texte).join(' ');
    expect(tout).toContain('30 jours au plus');
    expect(tout).not.toContain('rétention zéro');
  });
  it('dit la finalité, le fournisseur UE, le sort de l’audio, et demande de prévenir les présents', () => {
    const tout = JSON.stringify(T.notice());
    expect(tout).toContain('Mistral AI');
    expect(tout).toContain('Union européenne');
    expect(tout).toContain('L’enregistrement n’est pas conservé');
    expect(tout).toContain('prévenir le locataire');
    expect(tout).toContain('Rien n’est inscrit sans validation');
  });
  it('ton neutre (M-13) et zéro emoji (M-9)', () => {
    for (const rz of [true, false]) {
      const textes = [JSON.stringify(T.notice({ retentionZero: rz })), T.MENTION_PROPOSITION, T.MENTION_PDF, JSON.stringify(T.BANDEAU_PROPOSITIONS)];
      for (const t of textes) { expect(t).not.toMatch(TUTOIE); expect(t).not.toMatch(EMOJI); }
    }
  });
});

describe('mentions', () => {
  it('chaque proposition : « Proposé par l’IA, à vérifier »', () => {
    expect(T.MENTION_PROPOSITION).toBe('Proposé par l’IA, à vérifier');
  });
  it('PDF : texte validé le 13/10', () => {
    expect(T.MENTION_PDF).toBe('Observations préparées avec une aide à la dictée (IA), relues et validées par les parties.');
  });
});

describe('marquage lisible par machine et déclenchement de la mention PDF', () => {
  it('marqueIA : booléens + horodatage + modèle, jamais de contenu', () => {
    const m = T.marqueIA({ etat: "État d'usage", obs: 'Rayures.', modele: 'mistral-small', maintenant: new Date('2026-10-13T10:00:00Z') });
    expect(m).toEqual({ etat: true, obs: true, at: '2026-10-13T10:00:00.000Z', modele: 'mistral-small' });
  });
  it('edlAAideIA : faux sans aucune proposition acceptée', () => {
    expect(T.edlAAideIA(null)).toBe(false);
    expect(T.edlAAideIA({ pieces: [{ elements: [{ nom: 'Sol', etatE: 'Bon état' }] }] })).toBe(false);
    expect(T.edlAAideIA({ pieces: [{ elements: [{ iaE: { etat: false, obs: false } }] }], compteursIA: {} })).toBe(false);
  });
  it('edlAAideIA : vrai dès une valeur d’élément (entrée ou sortie) ou un relevé inscrit depuis l’IA', () => {
    expect(T.edlAAideIA({ pieces: [{ elements: [{ iaE: { etat: false, obs: true } }] }] })).toBe(true);
    expect(T.edlAAideIA({ pieces: [{ elements: [{}, { iaS: { etat: true, obs: false } }] }] })).toBe(true);
    expect(T.edlAAideIA({ pieces: [], compteursIA: { 'elec-hp': { at: 'x' } } })).toBe(true);
  });
});
