// __tests__/helpers/verif-pieces.test.js — VERIF-DOCUMENTS : assemblage des vérifications d'une pièce
// (2D-Doc + indices techniques), constats des « Points à vérifier », état affiché sous la pièce.
import { describe, it, expect } from 'vitest';
import { pieceConcernee, aAnalyser, identiteAttendue, anneesAvisAttendues, construireVerif, etatAffiche, constatsDePiece, detail, VERSION_VERIF } from '../../js/core/verif-pieces.js';

const INTERDITS = /fraude|frauduleu|\bfaux\b|fausse|falsifi|suspect|douteu|(?<!véri)fiable|truqu|mensong|\bscore\b|\bnote\b/i;
const CAND = { id: 'c1', nom: 'Marchal-Oberlin', prenom: 'Inès', garant: { nom: 'Oberlin', prenom: 'Paul' } };
const AVIS = { id: 'd1', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.1', mime: 'application/pdf', originalName: 'avis.pdf', uploadedAt: '2026-10-12T10:00:00Z' };
const ENT = { version: '04', ac: 'FR06', certificat: 'FPE3', type: '28', dateSignature: new Date('2026-07-24T00:00:00Z') };
const CHAMPS = [{ id: '46', libelle: 'Déclarant 1', valeur: 'MARCHAL OBERLIN INES' }, { id: '41', libelle: 'Revenu fiscal de référence', valeur: '33870' },
  { id: '43', libelle: 'Nombre de parts', valeur: '1' }, { id: '44', libelle: 'Référence d\'avis d\'impôt', valeur: '2600000000001' },
  { id: '47', libelle: 'Numéro fiscal du déclarant 1', valeur: '0000000000001' }, { id: '45', libelle: 'Année des revenus', valeur: '2025' },
  { id: '4Y', libelle: 'Adresse', valeur: '1 RUE DES LILAS 68000 COLMAR' }];
const VALIDE = { etat: 'valide', code: 'valide', motif: 'Signature valide…', entete: ENT, champs: CHAMPS, certificat: { ac: 'FR06', id: 'FPE3', du: '2025-03-06', au: '2028-03-05' }, revocation: { du: '2026-10-14', au: '2026-10-17' } };
const TEXTE = 'Déclarant 1 | MARCHAL OBERLIN INES | Revenu fiscal de référence | 33 870 € | Référence de l\'avis | 26 00 000 000 001 | Numéro fiscal 00 00 000 000 001';
const META = { producteur: 'DGFiP', createur: 'DGFiP', creeLe: 'D:20260724080000Z', modifieLe: 'D:20260724080000Z' };
const NOW = new Date('2026-10-12T18:42:00Z');
const v = (analyse, resultats, doc = AVIS) => construireVerif({ doc, candidat: CAND, analyse, resultats, maintenant: NOW });

describe('pièces concernées et relance', () => {
  it('ni pièce d\'identité, ni format hors PDF / JPEG / PNG, ni pièce supprimée', () => {
    expect(pieceConcernee(AVIS)).toBe(true);
    expect(pieceConcernee({ ...AVIS, category: 'identite' })).toBe(false);
    expect(pieceConcernee({ ...AVIS, category: 'garant', pieceType: 'II.A.1' })).toBe(false);
    expect(pieceConcernee({ ...AVIS, mime: 'application/msword' })).toBe(false);
    expect(pieceConcernee({ ...AVIS, _deleted: true })).toBe(false);
    expect(pieceConcernee({ ...AVIS, parentType: 'bail' })).toBe(false);
    expect(pieceConcernee({ ...AVIS, mime: 'image/jpeg' })).toBe(true);
  });
  it('analyse à faire : jamais faite, autre version, reportée depuis plus d\'une heure', () => {
    expect(aAnalyser(AVIS)).toBe(true);
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString() } }, NOW.getTime())).toBe(false);
    expect(aAnalyser({ ...AVIS, verif: { v: 0, le: NOW.toISOString() } }, NOW.getTime())).toBe(true);
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString(), reessayer: true } }, NOW.getTime() + 30 * 60000)).toBe(false);
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString(), reessayer: true } }, NOW.getTime() + 61 * 60000)).toBe(true);
  });
  it('identité attendue : garant pour les pièces du garant', () => {
    expect(identiteAttendue(AVIS, CAND)).toEqual({ nom: 'Marchal-Oberlin', prenom: 'Inès', qui: 'candidat' });
    expect(identiteAttendue({ ...AVIS, category: 'garant', pieceType: 'II.E.1' }, CAND)).toEqual({ nom: 'Oberlin', prenom: 'Paul', qui: 'garant' });
  });
  it('années de revenus attendues selon la date de réception', () => {
    expect(anneesAvisAttendues('2026-10-12').slice(0, 2)).toEqual([2025, 2024]);
    expect(anneesAvisAttendues('2026-03-01').slice(0, 2)).toEqual([2024, 2023]);
  });
});

describe('scénario A : avis signé, données et nom identiques', () => {
  const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE, metadonnees: META, enregistrements: 1, superpositions: [] }, [VALIDE]);
  it('état vert « Signature de l\'État vérifiée », aucun constat', () => {
    const e = etatAffiche(AVIS, ver);
    expect(e).toMatchObject({ etat: 'signature_valide', libelle: 'Signature de l\'État vérifiée', positif: true });
    expect(e.phrase).toBe('avis d\'impôt sur les revenus de la DGFiP, revenus 2025 ; données identiques au texte imprimé ; nom identique à l\'identité déclarée.');
    expect(ver.constats).toEqual([]);
  });
  it('minimisation : l\'adresse n\'est pas conservée ; références pour impots.gouv gardées', () => {
    expect(ver.deuxDDoc.champs.map((c) => c.id)).not.toContain('4Y');
    expect(JSON.stringify(ver)).not.toContain('LILAS');
    expect(ver.deuxDDoc.svair).toEqual({ numeroFiscal: '0000000000001', referenceAvis: '2600000000001' });
  });
  it('détail : lignes signées formatées, révocation et certificat datés', () => {
    const d = detail(AVIS, ver);
    expect(d.deuxDDoc.lignes.find((l) => l.libelle === 'Revenu fiscal de référence')).toEqual({ libelle: 'Revenu fiscal de référence', valeur: '33 870 €', comparaison: 'Identique au texte imprimé' });
    expect(d.deuxDDoc.validite).toBe('du 06/03/2025 au 05/03/2028');
    expect(d.deuxDDoc.revocation).toBe('liste de révocation du 14/10/2026, valable jusqu\'au 17/10/2026');
  });
});

describe('écarts sur un avis signé', () => {
  it('valeur signée absente du texte imprimé → état neutre « Écart relevé » + constat V5', () => {
    const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE.replace('33 870', '43 870'), metadonnees: META }, [VALIDE]);
    expect(etatAffiche(AVIS, ver)).toMatchObject({ etat: 'ecart', positif: false });
    const c = ver.constats.find((x) => x.code === 'V5');
    expect(c.detail).toBe('Revenu fiscal de référence inscrit dans le code signé : 33 870. Cette valeur n\'apparaît pas dans le texte du document.');
  });
  it('nom signé différent de l\'identité déclarée → V6, avec explication possible', () => {
    const ver = v({ estPdf: false, codes: ['x'], texte: '' }, [{ ...VALIDE, champs: CHAMPS.map((c) => (c.id === '46' ? { ...c, valeur: 'DUPONT CAMILLE' } : c)) }]);
    expect(etatAffiche(AVIS, ver).etat).toBe('ecart');
    expect(ver.constats.find((x) => x.code === 'V6').detail).toContain('Un avis commun, un nom d\'usage ou un changement d\'état civil peut l\'expliquer.');
  });
  it('photo : pas de texte imprimé → aucune comparaison inventée', () => {
    const ver = v({ estPdf: false, codes: ['x'], texte: '' }, [VALIDE], { ...AVIS, mime: 'image/jpeg' });
    expect(ver.deuxDDoc.comparaisons).toEqual([]);
    expect(etatAffiche({ ...AVIS, mime: 'image/jpeg' }, ver).etat).toBe('signature_valide');
  });
  it('avis trop ancien → V7 (décret : dernier ou avant-dernier avis)', () => {
    const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE, metadonnees: META }, [{ ...VALIDE, champs: CHAMPS.map((c) => (c.id === '45' ? { ...c, valeur: '2021' } : c)) }]);
    expect(ver.constats.find((x) => x.code === 'V7').detail).toBe('Le décret n° 2015-1437 prévoit le dernier ou l\'avant-dernier avis d\'imposition. Pour une pièce reçue le 12/10/2026, il s\'agit en principe des revenus 2025 ou 2024.');
  });
});

describe('scénario B et autres états', () => {
  it('avis sans code lisible → « Non vérifiable automatiquement » + V4 avec renvoi au service manuel', () => {
    const ver = v({ estPdf: false, codes: [], texte: '' }, []);
    expect(etatAffiche(AVIS, ver)).toMatchObject({ etat: 'non_verifiable', libelle: 'Non vérifiable automatiquement' });
    expect(ver.constats[0]).toMatchObject({ code: 'V4', svair: true });
  });
  it('code non conforme → V2 ; révocation inconnue → « Vérification reportée », sans constat', () => {
    const inv = v({ estPdf: true, codes: ['x'], texte: '' }, [{ etat: 'invalide', code: 'signature', motif: 'La signature ne correspond pas aux données du code.', entete: ENT }]);
    expect(etatAffiche(AVIS, inv)).toMatchObject({ etat: 'code_non_conforme', positif: false });
    expect(inv.constats[0].code).toBe('V2');
    const rep = v({ estPdf: true, codes: ['x'], texte: '' }, [{ etat: 'non_verifiable', code: 'revocation_inconnue', reessayer: true, motif: 'La liste de révocation de l\'autorité n\'a pas pu être contrôlée : vérification reportée.', entete: ENT }]);
    expect(rep.reessayer).toBe(true);
    expect(etatAffiche(AVIS, rep)).toMatchObject({ etat: 'reportee', phrase: 'la liste de révocation de l\'autorité n\'a pas pu être contrôlée.' });
    expect(rep.constats).toEqual([]);
  });
  it('autorité inconnue (code de test, autre pays) → V3 « non vérifiable »', () => {
    const ver = v({ estPdf: true, codes: ['x'] }, [{ etat: 'non_verifiable', code: 'ac_inconnue', motif: 'L\'autorité « FR00 » ne figure pas dans la liste de confiance de France Titres.', entete: { ...ENT, ac: 'FR00' } }]);
    expect(etatAffiche(AVIS, ver).etat).toBe('non_verifiable');
    expect(ver.constats[0].code).toBe('V3');
  });
  it('plusieurs codes sur la pièce : le résultat valide l\'emporte', () => {
    const ver = v({ estPdf: true, codes: ['a', 'b'], texte: TEXTE }, [{ etat: 'illisible', code: 'entete', motif: '…', entete: {} }, VALIDE]);
    expect(ver.deuxDDoc.etat).toBe('valide');
  });
  it('fichier illisible → « Lecture impossible », aucun constat', () => {
    const ver = v({ illisible: true }, []);
    expect(etatAffiche(AVIS, ver)).toMatchObject({ etat: 'illisible', libelle: 'Lecture impossible' });
    expect(ver.constats).toEqual([]);
  });
  it('justificatif de domicile sans code, PDF modifié → « Indice technique »', () => {
    const dom = { ...AVIS, category: 'domicile', pieceType: 'I.B.1', originalName: 'quittances.pdf' };
    const ver = v({ estPdf: true, codes: [], metadonnees: { createur: 'X', creeLe: 'D:20260701', modifieLe: 'D:20261001' }, enregistrements: 1 }, [], dom);
    expect(etatAffiche(dom, ver)).toMatchObject({ etat: 'indice', libelle: 'Indice technique' });
    expect(ver.constats[0].titre).toBe('« quittances.pdf » : le fichier a été modifié après sa création.');
    const propre = v({ estPdf: true, codes: [], metadonnees: META, enregistrements: 1 }, [], dom);
    expect(etatAffiche(dom, propre)).toMatchObject({ etat: 'aucun_controle', phrase: 'Aucun code 2D-Doc, aucun indice technique relevé.' });
  });
  it('pièce non concernée et analyse pas encore faite', () => {
    expect(etatAffiche({ ...AVIS, category: 'identite' }, null).etat).toBe('aucun_controle');
    expect(etatAffiche(AVIS, null).etat).toBe('en_attente');
  });
});

describe('formulation', () => {
  it('aucun constat ni état ne porte de mot de jugement ; chaque constat a une source et une date', () => {
    const cas = [
      v({ estPdf: true, codes: ['x'], texte: TEXTE.replace('33 870', '1'), metadonnees: { createur: 'A', creeLe: 'D:20260101', modifieLe: 'D:20260301' }, enregistrements: 3, superpositions: [{ page: 1, textes: ['a', 'b'] }] }, [{ ...VALIDE, champs: CHAMPS.map((c) => (c.id === '46' ? { ...c, valeur: 'X Y' } : c.id === '45' ? { ...c, valeur: '2019' } : c)) }]),
      v({ estPdf: true, codes: ['x'] }, [{ etat: 'invalide', code: 'revoque', motif: 'Le certificat qui a signé ce code a été révoqué par son autorité : la signature n\'est pas reconnue.', entete: ENT }]),
      v({ estPdf: false, codes: [] }, [])
    ];
    let n = 0;
    for (const ver of cas) {
      const e = etatAffiche(AVIS, ver); expect(e.libelle + e.phrase).not.toMatch(INTERDITS);
      for (const c of ver.constats) { n++; expect(c.titre + c.detail).not.toMatch(INTERDITS); expect(c.source).toBeTruthy(); expect(c.date).toMatch(/^le \d\d\/\d\d\/\d{4}$/); }
    }
    expect(n).toBeGreaterThanOrEqual(8);
  });
  it('constatsDePiece sans vérification → rien', () => {
    expect(constatsDePiece(AVIS, null)).toEqual([]);
  });
});
