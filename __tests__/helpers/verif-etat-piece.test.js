// __tests__/helpers/verif-etat-piece.test.js — VERIF-LISIBLE (v15.750) : un état par pièce (OK / À vérifier /
// Non vérifiable, ou Non lue / En attente), quelques lignes courtes au clic, une ligne de résumé des pièces.
// Décisions Didier 15-16/10 : « bon ou pas bon, pas de blabla » ; vert seulement pour la signature officielle vérifiée ;
// aucun mot « IA » tant qu'aucune lecture n'a eu lieu ; règles de lecture consommées sans liste de codes en dur.
import { describe, it, expect } from 'vitest';
import { construireVerif, actualiser, etatPiece, resumePieces, ETATS_PIECE } from '../../js/core/verif-pieces.js';
import { MENTION_PROPOSITION } from '../../js/core/ia-transparence.js';

const INTERDITS = /fraude|frauduleu|\bfaux\b|fausse|falsifi|suspect|douteu|(?<!véri)fiable|truqu|mensong|\bscore\b|\bnote\b/i;
const CAND = { id: 'c1', nom: 'Marchal-Oberlin', prenom: 'Inès', garant: { nom: 'Oberlin', prenom: 'Paul' } };
const AVIS = { id: 'd1', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.1', mime: 'application/pdf', originalName: 'avis.pdf', uploadedAt: '2026-10-12T10:00:00Z' };
const BUL = { id: 'd2', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.2', mime: 'application/pdf', originalName: 'bulletin-aout.pdf', uploadedAt: '2026-10-12T10:00:00Z' };
const ENT = { version: '04', ac: 'FR06', certificat: 'FPE3', type: '28', dateSignature: new Date('2026-07-24T00:00:00Z') };
const CHAMPS = [{ id: '46', libelle: 'Déclarant 1', valeur: 'MARCHAL OBERLIN INES' }, { id: '41', libelle: 'Revenu fiscal de référence', valeur: '33870' },
  { id: '43', libelle: 'Nombre de parts', valeur: '1' }, { id: '44', libelle: 'Référence d\'avis d\'impôt', valeur: '2600000000001' },
  { id: '47', libelle: 'Numéro fiscal du déclarant 1', valeur: '0000000000001' }, { id: '45', libelle: 'Année des revenus', valeur: '2025' }];
const VALIDE = { etat: 'valide', code: 'valide', motif: 'Signature valide…', entete: ENT, champs: CHAMPS, certificat: { ac: 'FR06', id: 'FPE3', du: '2025-03-06', au: '2028-03-05' }, revocation: { du: '2026-10-14', au: '2026-10-17' } };
const TEXTE = 'Déclarant 1 | MARCHAL OBERLIN INES | Revenu fiscal de référence | 33 870 € | Référence de l\'avis | 26 00 000 000 001 | Numéro fiscal 00 00 000 000 001';
const META = { producteur: 'DGFiP', createur: 'DGFiP', creeLe: 'D:20260724080000Z', modifieLe: 'D:20260724080000Z' };
const META_MODIF = { producteur: 'PDF Editor 12', createur: 'Silae Paie', creeLe: 'D:20260901080000Z', modifieLe: 'D:20261012080000Z' };
const NOW = new Date('2026-10-12T18:42:00Z');
const ver = (doc, analyse, resultats) => actualiser(doc, construireVerif({ doc, candidat: CAND, analyse, resultats, maintenant: NOW }), CAND, NOW);
const textes = (e) => e.lignes.map((l) => l.texte);
const sansMotIa = (e) => [e.mot, ...textes(e), e.note || ''].forEach((t) => { expect(t).not.toMatch(/\bIA\b|intelligence artificielle/i); });

describe('avis d\'imposition', () => {
  it('signé par la DGFiP, données et nom identiques → « OK » vert, lignes courtes', () => {
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: true, codes: ['x'], texte: TEXTE, metadonnees: META, enregistrements: 1, superpositions: [] }, [VALIDE]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e).toMatchObject({ etat: 'ok', mot: 'OK', vert: true });
    expect(textes(e)).toEqual(['Signature de la DGFiP vérifiée', 'Données signées retrouvées dans le fichier', 'Nom identique au candidat', 'Avis de l\'année attendue', 'Rien relevé dans le fichier', 'Dernier avis émis : à voir sur impots.gouv']);
    expect(e.lignes.filter((l) => l.vert).map((l) => l.texte)).toEqual(['Signature de la DGFiP vérifiée']);
    expect(e.impots).toEqual({ numeroFiscal: '0000000000001', referenceAvis: '2600000000001' });
    sansMotIa(e);
  });
  it('donnée signée absente du texte → « À vérifier », jamais vert', () => {
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: true, codes: ['x'], texte: TEXTE.replace('33 870', '43 870'), metadonnees: META, enregistrements: 1, superpositions: [] }, [VALIDE]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e).toMatchObject({ etat: 'averif', mot: 'À vérifier', vert: false });
    expect(e.lignes.find((l) => l.type === 'ecart').texte).toBe('Revenu fiscal de référence signé absent du fichier');
  });
  it('nom différent du candidat → « À vérifier »', () => {
    const autre = { ...VALIDE, champs: CHAMPS.map((c) => (c.id === '46' ? { ...c, valeur: 'DUPONT CAMILLE' } : c)) };
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: false, codes: ['x'], texte: '' }, [autre]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e.etat).toBe('averif');
    expect(textes(e)).toContain('Nom différent de celui du candidat');
  });
  it('photo sans code lisible → « Non vérifiable » + impots.gouv', () => {
    const photo = { ...AVIS, mime: 'image/jpeg', originalName: 'avis.jpg' };
    const d = { ...photo, verif: ver(photo, { estPdf: false, codes: [], texte: '' }, []) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e).toMatchObject({ etat: 'nonverif', mot: 'Non vérifiable', vert: false });
    expect(textes(e)[0]).toBe('Code officiel illisible sur la photo');
    expect(e.impots).toEqual({});
  });
  it('PDF sans code : « Non vérifiable » même si rien n\'est relevé dans le fichier', () => {
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: true, codes: [], texte: TEXTE, metadonnees: META, enregistrements: 1, superpositions: [] }, []) };
    expect(etatPiece({ doc: d, verif: d.verif }).etat).toBe('nonverif');
  });
  it('signature non conforme → « À vérifier »', () => {
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: false, codes: ['x'], texte: '' }, [{ etat: 'invalide', code: 'signature', motif: 'La signature ne correspond pas aux données du code.', entete: ENT }]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e.etat).toBe('averif');
    expect(textes(e)[0]).toBe('Signature non conforme au code officiel');
  });
  it('autorité inconnue → « Non vérifiable », raison courte', () => {
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: false, codes: ['x'], texte: '' }, [{ etat: 'non_verifiable', code: 'ac_inconnue', motif: 'L\'autorité « ZZ00 » ne figure pas…', entete: { ...ENT, ac: 'ZZ00' } }]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e.etat).toBe('nonverif');
    expect(textes(e)[0]).toBe('Signature non vérifiable : émetteur absent de la liste de l\'État');
  });
});

describe('bulletin de salaire', () => {
  const pdf = (meta) => ({ ...BUL, verif: ver(BUL, { estPdf: true, codes: [], texte: 'x', metadonnees: meta, enregistrements: 1, superpositions: [] }, []) });
  it('rien relevé, lecture non faite → « OK » neutre, montants non contrôlés, aucun mot IA', () => {
    const d = pdf(META);
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e).toMatchObject({ etat: 'ok', mot: 'OK', vert: false });
    expect(textes(e)).toEqual(['Pas de signature officielle sur la pièce', 'Rien relevé dans le fichier', 'Montants non contrôlés']);
    sansMotIa(e);
  });
  it('fichier modifié après sa création → « À vérifier »', () => {
    const d = pdf(META_MODIF);
    const e = etatPiece({ doc: d, verif: d.verif });
    expect(e.etat).toBe('averif');
    expect(textes(e)).toContain('Fichier modifié 41 jours après sa création');
  });
  it('règles de lecture quelconques : ok / écart / non lu, sans liste de codes en dur', () => {
    const d = pdf(META);
    const ia = { etat: 'ecart', regles: [{ code: 'ZZ1', ok: true, titre: 'Règle A respectée.' }, { code: 'ZZ2', ok: false, titre: 'Règle B non respectée.' }, { code: 'ZZ3', ok: null, titre: 'Règle C.' }],
      constats: [{ code: 'ZZ2', titre: 'Bulletin août 2026 : règle B non respectée.' }, { code: 'ZZ9', titre: 'Bulletin août 2026 : autre point.' }] };
    const e = etatPiece({ doc: d, verif: d.verif, ia, iaLue: true });
    expect(e.etat).toBe('averif');
    expect(e.lignes.filter((l) => l.lu)).toEqual([
      { type: 'ok', texte: 'Règle A respectée', lu: true }, { type: 'ecart', texte: 'Règle B non respectée', lu: true },
      { type: 'non', texte: 'Non lu : règle C', lu: true }, { type: 'ecart', texte: 'Autre point', lu: true }]);
    expect(e.note).toBe(MENTION_PROPOSITION + '.');
  });
  it('lecture abstenue (page douteuse) → jamais « À vérifier » à cause d\'elle', () => {
    const d = pdf(META);
    const e = etatPiece({ doc: d, verif: d.verif, ia: { etat: 'illisible', regles: [], constats: [] }, iaLue: true });
    expect(e.etat).toBe('ok');
    expect(textes(e)).toContain('Non lu : page illisible');
  });
  it('image sans code ni lecture → « Non vérifiable » (rien n\'a pu être contrôlé)', () => {
    const img = { ...BUL, mime: 'image/png' };
    const d = { ...img, verif: ver(img, { estPdf: false, codes: [], texte: '' }, []) };
    expect(etatPiece({ doc: d, verif: d.verif }).etat).toBe('nonverif');
  });
});

describe('pièces hors contrôle, attente, résumé', () => {
  it('pièce d\'identité → « Non lue », hors du résumé', () => {
    const e = etatPiece({ doc: { ...AVIS, category: 'identite', pieceType: 'I.A.1' }, verif: null });
    expect(e).toMatchObject({ etat: 'nonlue', mot: 'Non lue', vert: false });
    expect(textes(e)).toEqual(['Pièce d\'identité : jamais lue, à comparer à l\'œil']);
  });
  it('pas encore vérifiée → « En attente », hors du résumé', () => {
    expect(etatPiece({ doc: AVIS, verif: null })).toMatchObject({ etat: 'attente', mot: 'En attente' });
  });
  it('fichier illisible → « Non vérifiable »', () => {
    expect(etatPiece({ doc: AVIS, verif: { v: 1, le: NOW.toISOString(), illisible: true, constats: [] } }).etat).toBe('nonverif');
  });
  it('résumé : compte des pièces, jamais un avis sur la personne', () => {
    const r = resumePieces(['ok', 'ok', 'averif', 'nonverif', 'nonlue', 'attente'].map((etat) => ({ etat })));
    expect(r).toEqual({ ok: 2, averif: 1, nonverif: 1, texte: '2 OK · 1 à vérifier · 1 non vérifiable' });
    expect(resumePieces([{ etat: 'ok' }]).texte).toBe('1 OK');
    expect(resumePieces([{ etat: 'nonlue' }]).texte).toBe('');
    expect(resumePieces([{ etat: 'nonverif' }, { etat: 'nonverif' }]).texte).toBe('0 OK · 2 non vérifiables');
  });
  it('vocabulaire : mots fermés, aucun mot de jugement', () => {
    expect(Object.values(ETATS_PIECE)).toEqual(['OK', 'À vérifier', 'Non vérifiable', 'Non lue', 'En attente']);
    const d = { ...AVIS, verif: ver(AVIS, { estPdf: true, codes: ['x'], texte: TEXTE, metadonnees: META_MODIF, enregistrements: 3, superpositions: [{ page: 1, textes: ['31 540', '41 540'] }] }, [VALIDE]) };
    const e = etatPiece({ doc: d, verif: d.verif });
    [e.mot, ...textes(e)].forEach((t) => expect(t).not.toMatch(INTERDITS));
  });
});
