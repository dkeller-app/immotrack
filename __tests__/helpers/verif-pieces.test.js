// __tests__/helpers/verif-pieces.test.js — VERIF-DOCUMENTS : assemblage des vérifications d'une pièce
// (2D-Doc + indices techniques), constats des « Points à vérifier », état affiché sous la pièce.
import { describe, it, expect } from 'vitest';
import { pieceConcernee, aAnalyser, identiteAttendue, anneesAvisAttendues, construireVerif, etatAffiche, constatsDePiece, detail, VERSION_VERIF, LECTEUR_PHOTO } from '../../js/core/verif-pieces.js';

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
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString(), lecteurPhoto: LECTEUR_PHOTO } }, NOW.getTime())).toBe(false);
    expect(aAnalyser({ ...AVIS, verif: { v: 0, le: NOW.toISOString() } }, NOW.getTime())).toBe(true);
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString(), reessayer: true, lecteurPhoto: LECTEUR_PHOTO } }, NOW.getTime() + 30 * 60000)).toBe(false);
    expect(aAnalyser({ ...AVIS, verif: { v: VERSION_VERIF, le: NOW.toISOString(), reessayer: true, lecteurPhoto: LECTEUR_PHOTO } }, NOW.getTime() + 61 * 60000)).toBe(true);
  });
  it('LECTURE-PHOTOS : une pièce lue avant le lecteur de photos, sans code trouvé, est relue une fois', () => {
    const avant = { v: VERSION_VERIF, le: NOW.toISOString(), illisible: false, deuxDDoc: null };
    expect(aAnalyser({ ...AVIS, mime: 'image/jpeg', verif: avant }, NOW.getTime())).toBe(true);
    expect(aAnalyser({ ...AVIS, mime: 'image/jpeg', verif: { ...avant, lecteurPhoto: LECTEUR_PHOTO } }, NOW.getTime())).toBe(false);
    expect(aAnalyser({ ...AVIS, verif: { ...avant, deuxDDoc: { etat: 'valide' } } }, NOW.getTime())).toBe(false);   // code déjà lu : rien à refaire
    expect(aAnalyser({ ...AVIS, verif: { ...avant, illisible: true } }, NOW.getTime())).toBe(false);
    expect(construireVerif({ doc: AVIS, candidat: {}, analyse: { estPdf: false, codes: [] }, resultats: [] }).lecteurPhoto).toBe(LECTEUR_PHOTO);
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
  it('état vert « Signature 2D-Doc vérifiée » (DGFiP : FPE* sous FR06), aucun constat', () => {
    const e = etatAffiche(AVIS, ver);
    expect(e).toMatchObject({ etat: 'signature_valide', libelle: 'Signature 2D-Doc vérifiée', positif: true });
    expect(e.phrase).toBe('avis d\'impôt sur les revenus de la DGFiP, revenus 2025 ; données retrouvées dans le texte du fichier ; nom identique à l\'identité déclarée.');
    expect(ver.constats).toEqual([]);
  });
  it('minimisation : l\'adresse n\'est pas conservée ; références pour impots.gouv gardées', () => {
    expect(ver.deuxDDoc.champs.map((c) => c.id)).not.toContain('4Y');
    expect(JSON.stringify(ver)).not.toContain('LILAS');
    expect(ver.deuxDDoc.svair).toEqual({ numeroFiscal: '0000000000001', referenceAvis: '2600000000001' });
  });
  it('détail : lignes signées formatées, révocation et certificat datés', () => {
    const d = detail(AVIS, ver);
    expect(d.deuxDDoc.lignes.find((l) => l.libelle === 'Revenu fiscal de référence')).toEqual({ libelle: 'Revenu fiscal de référence', valeur: '33 870 €', comparaison: 'Retrouvé dans le texte du fichier' });
    expect(d.deuxDDoc.validite).toBe('du 06/03/2025 au 05/03/2028');
    expect(d.deuxDDoc.revocation).toBe('liste de révocation du 14/10/2026, valable jusqu\'au 17/10/2026');
  });
});

describe('écarts sur un avis signé', () => {
  it('valeur signée absente du texte imprimé → état neutre « Écart relevé » + constat V5', () => {
    const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE.replace('33 870', '43 870'), metadonnees: META }, [VALIDE]);
    expect(etatAffiche(AVIS, ver)).toMatchObject({ etat: 'ecart', positif: false });
    const c = ver.constats.find((x) => x.code === 'V5');
    expect(c.detail).toBe('Revenu fiscal de référence inscrit dans le code signé : 33 870. Cette valeur n\'apparaît pas dans le texte du fichier (couche texte du PDF).');
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

describe('relectures du 14/10 (Opus, Fable)', async () => {
  const { typeLu, estDgfip, actualiser } = await import('../../js/core/verif-pieces.js');
  it('liste blanche : jamais de pièce portant une photo ou une identité, jamais une pièce de caution sans type', () => {
    for (const t of ['I.A.1', 'II.A.2', 'I.C.5', 'I.C.7', 'II.B.2', 'II.D.5', 'VISALE']) expect(typeLu(t, 'x'), t).toBe(false);
    for (const t of ['I.B.1', 'I.C.1', 'I.D.1', 'I.D.2', 'II.B.1', 'II.C.2', 'II.D.1', 'II.E.1', 'II.E.3']) expect(typeLu(t, 'x'), t).toBe(true);
    expect(typeLu('', 'ressources')).toBe(true); expect(typeLu('', 'garant')).toBe(false); expect(typeLu('', 'identite')).toBe(false);
    expect(pieceConcernee({ ...AVIS, category: 'garant', pieceType: '' })).toBe(false);
    expect(pieceConcernee({ ...AVIS, category: 'garant', pieceType: 'II.B.2' })).toBe(false);
  });
  it('un DataMatrix qui n\'est pas un 2D-Doc n\'est pas « code présent » : l\'avis reste « aucun code lisible » (V4, impots.gouv)', () => {
    const ver = v({ estPdf: true, codes: ['ARCHIVE-123'] }, [{ etat: 'illisible', code: 'entete', motif: 'Le code lu n\'est pas un 2D-Doc lisible.' }]);
    expect(ver.deuxDDoc).toBeNull();
    expect(ver.constats.map((c) => c.code)).toEqual(['V4']);
    expect(ver.constats[0].svair).toBe(true);
  });
  it('« de la DGFiP » seulement pour FPE* sous FR04 / FR06 et un avis d\'impôt ; sinon autorité et certificat nommés', () => {
    expect(estDgfip({ ac: 'FR06', certificat: 'FPE3', type: '28' })).toBe(true);
    expect(estDgfip({ ac: 'FR03', certificat: 'FPE3', type: '28' })).toBe(false);
    expect(estDgfip({ ac: 'FR06', certificat: 'FPE3', type: '01' })).toBe(false);
    const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE }, [{ ...VALIDE, entete: { ...ENT, ac: 'FR07', certificat: 'FPE1' } }]);
    expect(etatAffiche(AVIS, ver).phrase).toMatch(/^avis d'impôt sur les revenus \(autorité FR07, certificat FPE1\)/);
  });
  it('avis portant le code signé d\'un autre document (facture) : constat V8, état neutre', () => {
    const ver = v({ estPdf: true, codes: ['x'], texte: TEXTE }, [{ ...VALIDE, entete: { ...ENT, ac: 'FR03', certificat: 'EDFD', type: '01' }, champs: [] }]);
    expect(ver.constats.map((c) => c.code)).toContain('V8');
    expect(etatAffiche(AVIS, ver)).toMatchObject({ etat: 'ecart', positif: false });
  });
  it('photo d\'un avis signé : la phrase dit que les montants imprimés n\'ont pas été comparés et donne le revenu signé', () => {
    const ver = v({ estPdf: false, codes: ['x'], texte: '' }, [VALIDE], { ...AVIS, mime: 'image/jpeg' });
    expect(etatAffiche({ ...AVIS, mime: 'image/jpeg' }, ver).phrase).toContain('montants imprimés non comparés (image ou PDF sans texte) ; revenu fiscal de référence signé : 33\u00a0870 €, à comparer avec la pièce');
  });
  it('un code valide et un code non conforme sur la même pièce : le second n\'est pas tu', () => {
    const ver = v({ estPdf: true, codes: ['a', 'b'], texte: TEXTE }, [VALIDE, { etat: 'invalide', code: 'signature', motif: 'x', entete: ENT }]);
    expect(ver.constats.map((c) => c.code)).toContain('V2');
    expect(etatAffiche(AVIS, ver).etat).toBe('ecart');
  });
  it('affichage à jour : nom déclaré corrigé et type changé pris en compte sans relire le fichier', () => {
    const ver = v({ estPdf: false, codes: ['x'], texte: '' }, [{ ...VALIDE, champs: CHAMPS.map((c) => (c.id === '46' ? { ...c, valeur: 'DUPONT CAMILLE' } : c)) }]);
    expect(ver.constats.map((c) => c.code)).toEqual(['V6']);
    const a = actualiser(AVIS, ver, { ...CAND, nom: 'Dupont', prenom: 'Camille' });
    expect(a.constats).toEqual([]); expect(a.deuxDDoc.identite).toBe('concorde');
    expect(actualiser({ ...AVIS, category: 'identite', pieceType: 'I.A.1' }, ver, CAND).constats).toEqual([]);
    expect(ver.constats.map((c) => c.code)).toEqual(['V6']);            // l'objet stocké n'est pas modifié
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

describe('lot 3 : état d\'une pièce lue par l\'IA', async () => {
  const { etatIa, typeLectureIa } = await import('../../js/core/verif-pieces.js');
  const { noticeBulletins } = await import('../../js/core/ia-transparence.js');
  const BUL = { ...AVIS, pieceType: 'I.D.2', originalName: 'bulletin-aout.pdf' };
  const base = { etat: 'aucun_controle', libelle: '', phrase: 'Aucun code 2D-Doc, aucun indice technique relevé.', positif: false, icone: 'info', detail: true };
  it('types lus : bulletins et contrat (candidat et garant), rien d\'autre', () => {
    expect(['I.D.2', 'II.E.3', 'I.C.1', 'II.D.1', 'I.D.1', ''].map((t) => typeLectureIa({ pieceType: t }))).toEqual(['bulletin', 'bulletin', 'contrat', 'contrat', null, null]);
  });
  it('non lancée : proposée seulement si la lecture est disponible ; jamais verte', () => {
    expect(etatIa(BUL, null, base, false)).toBe(base);
    expect(etatIa(BUL, { etat: 'ia_non_lancee' }, base, true)).toMatchObject({ etat: 'ia_non_lancee', libelle: 'Lecture par l\'IA non lancée', positif: false });
  });
  it('écart, sans écart, illisible, reportée : libellés factuels, mention « lu par l\'IA, à vérifier »', () => {
    const ec = etatIa(BUL, { etat: 'ecart', regles: [], constats: [{ titre: 'Bulletin août 2026 : le net à payer ne correspond pas au net avant impôt moins l\'impôt prélevé à la source.' }] }, base, true);
    expect(ec).toMatchObject({ etat: 'ecart', libelle: 'Écart relevé', positif: false });
    expect(ec.phrase).toBe('le net à payer ne correspond pas au net avant impôt moins l\'impôt prélevé à la source (lu par l\'IA, à vérifier).');
    expect(etatIa(BUL, { etat: 'sans_ecart', regles: [1, 2, 3], constats: [] }, base, true).phrase).toBe('3 règles appliquées (calculs, cumuls, nom, employeur) (lu par l\'IA, à vérifier).');
    expect(etatIa(BUL, { etat: 'illisible' }, base, true).libelle).toBe('Lecture impossible');
    expect(etatIa(BUL, { etat: 'ia_erreur' }, base, true).etat).toBe('reportee');
    expect(etatIa({ ...BUL, pieceType: 'I.C.1' }, { etat: 'lu' }, base, true).phrase).toContain('date d\'entrée');
  });
  it('une signature de l\'État vérifiée reste prioritaire, sauf écart relevé par les règles', () => {
    const sig = { etat: 'signature_valide', positif: true };
    expect(etatIa(BUL, { etat: 'sans_ecart', regles: [], constats: [] }, sig, true)).toBe(sig);
    expect(etatIa(BUL, { etat: 'ecart', regles: [], constats: [] }, sig, true).etat).toBe('ecart');
  });
  it('notice : ce qui part, qui lit, ce qui est gardé ; ton neutre ; rétention selon la constante', () => {
    const n = noticeBulletins({ retentionZero: false });
    const t = JSON.stringify(n);
    expect(t).toContain('première page de chaque bulletin');
    expect(t).toContain('30 jours au plus');
    expect(t).not.toMatch(/\b(tu|vous|votre|vos)\b/i);
    expect(JSON.stringify(noticeBulletins({ retentionZero: true }))).toContain('ne conserve ni les images ni le texte');
  });
});
