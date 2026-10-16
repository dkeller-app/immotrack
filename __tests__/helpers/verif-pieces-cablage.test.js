// __tests__/helpers/verif-pieces-cablage.test.js — VERIF-DOCUMENTS : câblage réel dans le monolithe (code extrait
// de js/app/app-part1.js / app-part2.js et exécuté avec des doublures) : déclenchement, enregistrement sur la pièce,
// minimisation (dossier refusé non relu), constats dans « Points à vérifier », échappement des gestionnaires on…=.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as DeuxDDoc from '../../js/core/deux-d-doc.js';
import * as VerifPieces from '../../js/core/verif-pieces.js';
import * as PiecesCand from '../../js/core/pieces-candidature.js';
import * as ReglesBulletin from '../../js/core/regles-bulletin.js';
import * as LecturePhoto from '../../js/core/lecture-photo.js';
import * as LecturePhotoClient from '../../js/core/lecture-photo-client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const SRC = ['_candVerifReglages', '_candAvecDelai', '_candVerifActuelle', '_ensureZxing', '_canvasVersGris', '_zxingLecteur', '_lecturePhotoClient', '_candVerifEtat', '_candVerifBadgeHtml', '_candIaPieces', '_candIaAnalyse', '_candVerifLigneHtml', '_candVerifResumeHtml', '_candVerifLignesHtml', '_candVerifCopier', '_candVerifDetail', '_candVerifDatePdf', '_candPointsAVerifier']
  .map((n) => extraireFonction(P1, n)).join('\n') + '\n'
  + 'async ' + extraireFonction(P1, '_tddocConfiance') + '\n'
  + 'async ' + extraireFonction(P1, '_lirePhotoCanvas') + '\n'
  + 'async ' + extraireFonction(P1, '_candVerifierPieces') + '\n'
  + extraireFonction(P2, '_candSetPieceType');

const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Échappement réel de l'app (_lyQ, app-part2.js) : d'abord pour la chaîne JS (\ et '), puis pour le HTML. */
const lyQ = (s) => escHtml(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
/** Décodage HTML d'une valeur d'attribut (ce que fait le navigateur avant d'exécuter le gestionnaire). */
const decoder = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Exécute le JavaScript d'un attribut on…= et rend les arguments reçus par la fonction appelée. */
function appelDe(html, attr, fn) {
  const re = new RegExp(attr + '="([^"]*' + fn + '\\([^"]*)"');
  const m = html.match(re); if (!m) throw new Error('gestionnaire absent : ' + fn);
  const recus = [];
  new Function(fn, 'self', decoder(m[1]).replace(/\bthis\b/g, 'self'))((...a) => recus.push(a), { value: 'I.D.1' });
  return recus[0];
}

function monter(DB, { analyse, binaire = 'data:application/pdf;base64,JVBERg==', horsLigne = false, relais = null } = {}) {
  const j = { saves: 0, toasts: [], fiche: 0, fetches: [], lus: 0, modale: null };
  const dom = { 'vp-title': { textContent: '' }, 'vp-body': { innerHTML: '' }, 'vp-foot': { innerHTML: '' }, 'ov-fiche-candidat': { classList: { contains: () => false } }, 'ov-verif-piece': { classList: { contains: () => false } } };
  const window = {
    DeuxDDoc, VerifPieces, PiecesCand, ReglesBulletin, ZXing: { DecodeHintType: { TRY_HARDER: 3, POSSIBLE_FORMATS: 2 }, BarcodeFormat: { DATA_MATRIX: 5 }, MultiFormatReader: function () { this.setHints = () => {}; } }, __immoHorsLigne: horsLigne,
    LecturePhoto, LecturePhotoClient,
    LecturePieces: { analyserFichier: async (fichier, d) => { j.lus++; j.deps = d; if (analyse instanceof Error) throw analyse; return analyse; } },
    pdfjsLib: {}
  };
  const deps = {
    DB, window, document: {}, navigator: { onLine: !horsLigne, clipboard: { writeText: async () => {} } }, AbortController, setTimeout, clearTimeout, console: { warn() {} },
    fetch: async (u) => { j.fetches.push(u); if (relais) return { ok: true, json: async () => relais }; throw new Error('pas de réseau'); },
    _relayCfg: () => ({ base: 'https://relais.test' }), _attachmentLoadBinary: async () => binaire, _ensurePdfjsLoaded: async () => {},
    _dataUrlToUint8: () => new Uint8Array([1, 2, 3]), createImageBitmap: async () => ({ width: 1, height: 1 }), Blob,
    _stamp: (o) => { o._modifiedAt = 'stamp'; }, saveDB: () => { j.saves++; }, showToast: (m) => j.toasts.push(m),
    openFicheCandidat: () => { j.fiche++; }, openM: (id) => { j.modale = id; }, el: (id) => dom[id] || null, escHtml,
    _uiIcon: (n) => '<svg data-i="' + n + '"></svg>', _lyQ: lyQ, fd: (s) => s.split('-').reverse().join('/'),
    _auditLog: () => {}, _ficheCandidatOuverte: 'c1', _candVerifEnCours: new Set(), _candVerifPiecesEnCours: new Set(),
    _tddocMagasin: null, _tddocMagasinLe: 0, _tddocMagasinPromesse: null, _zxingPromesse: null, Worker: function () { throw new Error('pas de Worker ici'); }
  };
  const noms = Object.keys(deps).filter((n) => !['_tddocMagasin', '_tddocMagasinLe', '_tddocMagasinPromesse', '_zxingPromesse'].includes(n));
  const prelude = 'let _tddocMagasin = null, _tddocMagasinLe = 0, _tddocMagasinPromesse = null; let _zxingPromesse = null; let _lecturePhotoCli = null; let _candIaOcr = { actif: null, le: 0 };\n';
  const exp = '\nreturn { _candVerifierPieces, _candVerifLigneHtml, _candVerifResumeHtml, _candVerifDetail, _candPointsAVerifier, _candSetPieceType, _candVerifReglages };';
  const app = new Function(...noms, prelude + SRC + exp)(...noms.map((n) => deps[n]));
  return { app, j, dom };
}
const AVIS = (o = {}) => Object.assign({ id: 'd1', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.1', mime: 'application/pdf', originalName: 'avis.pdf', uploadedAt: '2026-10-12T10:00:00Z' }, o);
const parc = (docs = [AVIS()], statut = 'enCours') => ({ params: {}, candidats: [{ id: 'c1', nom: 'Marchal', prenom: 'Inès', statut }], documents: docs });
const SANS_CODE = { illisible: false, estPdf: true, codes: [], texte: '', metadonnees: { createur: 'Paie', creeLe: 'D:20260701', modifieLe: 'D:20261001' }, enregistrements: 1, superpositions: [] };

describe('LECTURE-PHOTOS : lecteur réglé une fois, lecteur de photos branché', () => {
  it('la lecture d\'une pièce reçoit le lecteur de photos (Worker, repli sur le fil principal)', async () => {
    const DB = parc([AVIS({ mime: 'image/jpeg', originalName: 'avis.jpg' })]);
    const { app, j } = monter(DB, { analyse: { illisible: false, estPdf: false, codes: [], texte: '' } });
    await app._candVerifierPieces('c1');
    expect(typeof j.deps.lirePhoto).toBe('function'); expect(typeof j.deps.lire).toBe('function');
    expect(DB.documents[0].verif.lecteurPhoto).toBe(VerifPieces.LECTEUR_PHOTO);
  });
  it('bogue v15.744 corrigé : plus de setHints() suivi de decode(bitmap) sans réglages ; un seul lecteur (lecture-photo.js)', () => {
    expect(P1).not.toMatch(/setHints\(hints\)/);
    expect(extraireFonction(P1, '_zxingLecteur')).toContain('LecturePhoto.lecteurZxing(ZX)');
  });
});

describe('déclenchement et enregistrement', () => {
  it('avis sans code lisible : vérification posée sur la pièce, constats V4 + T1, une sauvegarde, fiche rafraîchie', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    const v = DB.documents[0].verif;
    expect(v).toMatchObject({ v: VerifPieces.VERSION_VERIF, illisible: false, deuxDDoc: null });
    expect(v.constats.map((c) => c.code)).toEqual(['V4', 'T1']);
    expect(DB.documents[0]._modifiedAt).toBe('stamp');
    expect(j.saves).toBe(1); expect(j.fiche).toBe(1);
    await app._candVerifierPieces('c1');                         // déjà vérifiée : rien de plus
    expect(j.lus).toBe(1); expect(j.saves).toBe(1);
  });
  it('code lu : la liste de confiance vient du relais ; une autorité inconnue ne donne jamais « valide »', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { analyse: { ...SANS_CODE, codes: ['DC04FR000001FFFF25472801FR432,75\x1d\x1fAAAA'] }, relais: { source: 'relais', autorites: {} } });
    await app._candVerifierPieces('c1');
    expect(j.fetches).toEqual(['https://relais.test/api/2ddoc/confiance', 'js/vendor/2ddoc-instantane.json']);   // autorités absentes du relais : complétées par l'instantané
    expect(DB.documents[0].verif.deuxDDoc).toMatchObject({ etat: 'non_verifiable', code: 'ac_inconnue' });
  });
  it('relais injoignable : repli sur l\'instantané embarqué', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { analyse: { ...SANS_CODE, codes: ['DC04FR000001FFFF25472801FR432,75\x1d\x1fAAAA'] } });
    await app._candVerifierPieces('c1');
    expect(j.fetches).toEqual(['https://relais.test/api/2ddoc/confiance', 'js/vendor/2ddoc-instantane.json']);
    expect(DB.documents[0].verif.deuxDDoc.etat).not.toBe('valide');
  });
  it('minimisation : dossier refusé jamais relu ; pièce d\'identité jamais lue', async () => {
    const DB = parc([AVIS(), AVIS({ id: 'd2', category: 'identite', pieceType: 'I.A.1' })], 'refuse');
    const { app, j } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    expect(j.lus).toBe(0);
    DB.candidats[0].statut = 'enCours';
    await app._candVerifierPieces('c1');
    expect(j.lus).toBe(1);
    expect(DB.documents[1].verif).toBeUndefined();
  });
  it('jamais bloquant : binaire absent, lecture en échec, réglage coupé → rien d\'enregistré', async () => {
    { const DB = parc(); const { app, j } = monter(DB, { binaire: null, analyse: SANS_CODE });
      await app._candVerifierPieces('c1');
      expect(DB.documents[0].verif).toBeUndefined(); expect(j.saves).toBe(0); }
    // LECTURE-PHOTOS : lecture en échec ou pas finie → aucune vérification écrite, pièce « reportée » (pas de relecture en
    // boucle à chaque ouverture : au plus une fois par heure)
    for (const analyse of [new Error('pdf'), { illisible: false, estPdf: false, codes: [], texte: '', inacheve: true }]) {
      const DB = parc([AVIS({ mime: 'image/jpeg' })]); const { app, j } = monter(DB, { analyse });
      await app._candVerifierPieces('c1');
      expect(DB.documents[0].verif).toBeUndefined(); expect(DB.documents[0].verifReportee).toBeTruthy(); expect(j.saves).toBe(1);
      await app._candVerifierPieces('c1');
      expect(j.lus).toBe(1);                                              // pas relue aussitôt
    }
    const DB = parc(); DB.params.verifPieces = { locaux: false };
    const { app, j } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    expect(j.lus).toBe(0);
    expect(app._candVerifLigneHtml(DB.documents[0])).toBe('');
  });
  it('pièce supprimée pendant la lecture (purge) : le résultat n\'est pas réécrit', async () => {
    const DB = parc();
    const { app } = monter(DB, { analyse: SANS_CODE });
    const p = app._candVerifierPieces('c1'); DB.documents[0]._deleted = true; await p;
    expect(DB.documents[0].verif).toBeUndefined();
  });
});

describe('affichage : un état par pièce, détail au clic (VERIF-LISIBLE)', () => {
  it('avis sans code et fichier modifié : pastille « À vérifier » (jamais verte), résumé des pièces, détail en lignes courtes ; plus rien dans « Points à vérifier »', async () => {
    const DB = parc();
    const { app, j, dom } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    const ligne = app._candVerifLigneHtml(DB.documents[0]);
    expect(ligne).toContain('<span>À vérifier</span>');
    expect(ligne).toContain('class="cand-vbdg averif"');
    expect(ligne).not.toContain('vert');
    expect(app._candVerifResumeHtml(DB.candidats[0], DB.documents)).toContain('0 OK · 1 à vérifier');
    expect(app._candPointsAVerifier(DB.candidats[0])).toEqual([]);
    app._candVerifDetail('d1');
    expect(j.modale).toBe('ov-verif-piece');
    const corps = dom['vp-body'].innerHTML;
    expect(corps).toContain('Code officiel absent ou illisible');
    expect(corps).toContain('Fichier modifié 92 jours après sa création');
    expect(corps).toContain('Dernier avis émis : à voir sur impots.gouv');
    expect(corps).not.toMatch(/\bIA\b/);
    expect(dom['vp-foot'].innerHTML).toContain('Vérifier sur impots.gouv');
  });
  it('vert seulement pour une signature officielle vérifiée sans écart', () => {
    const DB = parc();
    DB.documents[0].verif = { v: 1, le: '2026-10-12T10:00:00Z', illisible: false, constats: [], indices: null,
      deuxDDoc: { etat: 'valide', type: '28', typeLibelle: 'Avis d\'impôt sur les revenus', ac: 'FR06', certificat: 'FPE3', champs: [], comparaisons: [], annee: '2025' } };
    const { app } = monter(DB, { analyse: SANS_CODE });
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('class="cand-vbdg ok vert"');
    DB.documents[0].verif.deuxDDoc.comparaisons = [{ id: '41', libelle: 'Revenu fiscal de référence', signe: '1', statut: 'absent' }];
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('class="cand-vbdg averif"');
  });
  it('changer le type de la pièce recalcule les constats sans relire le fichier', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    app._candSetPieceType('d1', 'I.D.2');
    expect(DB.documents[0].verif.constats.map((c) => c.code)).toEqual(['T1']);
    expect(j.lus).toBe(1);
  });
});

describe('échappement des gestionnaires on…= (identifiant hostile)', () => {
  const HOSTILE = 'x"y&quot;z\'w</b>';
  it('pastille de la pièce : l\'identifiant arrive intact à la fonction', async () => {
    const DB = parc([AVIS({ id: HOSTILE })]);
    const { app } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    expect(appelDe(app._candVerifLigneHtml(DB.documents[0]), 'onclick', '_candVerifDetail')).toEqual([HOSTILE]);
  });
  it('pièce hors liste (C1) : boutons Supprimer et Conserver', () => {
    const DB = parc([AVIS({ id: HOSTILE, name: 'releve-compte.pdf', originalName: 'releve-compte.pdf', pieceType: '' })]);
    const { app } = monter(DB, { analyse: SANS_CODE });
    const c1 = app._candPointsAVerifier(DB.candidats[0]).find((p) => p.code === 'C1');
    expect(appelDe(c1.actionsHtml, 'onclick', '_candPieceHorsListeSupprimer')).toEqual([HOSTILE]);
    expect(appelDe(c1.actionsHtml, 'onclick', '_candPieceHorsListeConserver')).toEqual([HOSTILE]);
  });
  it('détail : « Vérifier à nouveau » et « Copier » reçoivent les valeurs exactes', async () => {
    const DB = parc([AVIS({ id: HOSTILE })]);
    DB.documents[0].verif = { v: 1, le: '2026-10-12T10:00:00Z', illisible: false, constats: [], indices: null,
      deuxDDoc: { etat: 'valide', type: '28', typeLibelle: 'Avis d\'impôt sur les revenus', ac: 'FR06', certificat: 'FPE3', champs: [], comparaisons: [], svair: { numeroFiscal: '00\'1"&2', referenceAvis: '26' } } };
    const { app, dom } = monter(DB, { analyse: SANS_CODE });
    app._candVerifDetail(HOSTILE);
    expect(appelDe(dom['vp-body'].innerHTML, 'onclick', '_candVerifCopier')).toEqual(['00\'1"&2']);
    const a = appelDe(dom['vp-foot'].innerHTML, 'onclick', '_candVerifierPieces');
    expect(a[0]).toBe('c1'); expect(a[1]).toMatchObject({ force: true, docId: HOSTILE });
  });
  it('type de la pièce (onchange de la liste) : forme sûre dans le rendu', () => {
    const f = extraireFonction(P2, '_renderCandidatPiecesGrouped');
    expect(f).toContain("onchange=\"_candSetPieceType(\\'' + _lyQ(d.id) + '\\', this.value)\"");
    const attr = '_candSetPieceType(\'' + lyQ(HOSTILE) + '\', this.value)';
    const recus = []; new Function('_candSetPieceType', 'self', decoder(attr).replace(/\bthis\b/g, 'self'))((...x) => recus.push(x), { value: 'I.D.1' });
    expect(recus[0]).toEqual([HOSTILE, 'I.D.1']);
    // l'ancienne forme (guillemets seuls) cassait la chaîne JS sur « &quot; » contenu dans l'identifiant
    const ancien = '_candSetPieceType(' + JSON.stringify(HOSTILE).replace(/"/g, '&quot;') + ', this.value)';
    expect(() => new Function('_candSetPieceType', 'self', decoder(ancien).replace(/\bthis\b/g, 'self'))(() => {}, {})).toThrow();
  });
  it('identifiant numérique (pièces créées par nid()) : retrouvé malgré le passage en chaîne', async () => {
    const DB = parc([AVIS({ id: 1760000000123 })]);
    const { app, j } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    const a = appelDe(app._candVerifLigneHtml(DB.documents[0]), 'onclick', '_candVerifDetail');
    expect(a).toEqual(['1760000000123']);
    app._candVerifDetail(a[0]);
    expect(j.modale).toBe('ov-verif-piece');
    app._candSetPieceType('1760000000123', 'I.D.2');
    expect(DB.documents[0].pieceType).toBe('I.D.2');
  });
  it('aucune chaîne JS entre apostrophes avec escHtml collé dans les nouveaux gestionnaires', () => {
    for (const n of ['_candVerifLigneHtml', '_candVerifResumeHtml', '_candVerifDetail', '_candVerifDossierDetail']) {
      expect(extraireFonction(P1, n), n).not.toMatch(/\(\\'' \+ escHtml\(/);
    }
  });
});

describe('relectures du 14/10 : constats recalculés, minimisation au changement de type, tombe sans données', () => {
  it('un constat stocké altéré en base (adresse javascript:) n\'est jamais affiché : les constats viennent du code', async () => {
    const DB = parc();
    const { app, dom } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    DB.documents[0].verif.constats = [{ code: 'X', titre: 'injecté', url: 'javascript:alert(1)', source: 's' }];
    app._candVerifDetail('d1');
    expect(dom['vp-body'].innerHTML + dom['vp-foot'].innerHTML).not.toMatch(/javascript:|injecté/);
    expect(app._candPointsAVerifier(DB.candidats[0])).toEqual([]);
  });
  it('pièce retypée en pièce d\'identité : résultats de vérification effacés, plus aucun constat', async () => {
    const DB = parc([AVIS({ category: 'ressources' })]);
    const { app } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    DB.documents[0].category = 'garant';
    app._candSetPieceType('d1', 'II.A.1');
    expect(DB.documents[0].verif).toBeUndefined();
    expect(app._candPointsAVerifier(DB.candidats[0])).toEqual([]);
  });
  it('suppression d\'une pièce (_attachmentDelete) : la tombe synchronisée ne garde ni verif ni verifIa', () => {
    const f = extraireFonction(P1, '_attachmentDelete');
    expect(f).toContain('delete doc.verif; delete doc.verifIa;');
  });
});
