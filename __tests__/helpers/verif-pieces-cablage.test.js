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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const SRC = ['_candVerifReglages', '_ensureZxing', '_zxingLecteur', '_candVerifLigneHtml', '_candVerifConstats', '_candVerifCopier', '_candVerifDetail', '_candVerifDatePdf', '_candPointsAVerifier']
  .map((n) => extraireFonction(P1, n)).join('\n') + '\n'
  + 'async ' + extraireFonction(P1, '_tddocConfiance') + '\n'
  + 'async ' + extraireFonction(P1, '_candVerifierPieces') + '\n'
  + extraireFonction(P2, '_candSetPieceType');

const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    DeuxDDoc, VerifPieces, PiecesCand, ZXing: { DecodeHintType: { TRY_HARDER: 3, POSSIBLE_FORMATS: 2 }, BarcodeFormat: { DATA_MATRIX: 5 }, MultiFormatReader: function () { this.setHints = () => {}; } }, __immoHorsLigne: horsLigne,
    LecturePieces: { analyserFichier: async () => { j.lus++; if (analyse instanceof Error) throw analyse; return analyse; } },
    pdfjsLib: {}
  };
  const deps = {
    DB, window, document: {}, navigator: { onLine: !horsLigne, clipboard: { writeText: async () => {} } }, AbortController, setTimeout, clearTimeout, console: { warn() {} },
    fetch: async (u) => { j.fetches.push(u); if (relais) return { ok: true, json: async () => relais }; throw new Error('pas de réseau'); },
    _relayCfg: () => ({ base: 'https://relais.test' }), _attachmentLoadBinary: async () => binaire, _ensurePdfjsLoaded: async () => {},
    _dataUrlToUint8: () => new Uint8Array([1, 2, 3]), createImageBitmap: async () => ({ width: 1, height: 1 }), Blob,
    _stamp: (o) => { o._modifiedAt = 'stamp'; }, saveDB: () => { j.saves++; }, showToast: (m) => j.toasts.push(m),
    openFicheCandidat: () => { j.fiche++; }, openM: (id) => { j.modale = id; }, el: (id) => dom[id] || null, escHtml,
    _uiIcon: (n) => '<svg data-i="' + n + '"></svg>', _lyQ: (s) => String(s), fd: (s) => s.split('-').reverse().join('/'),
    _auditLog: () => {}, _ficheCandidatOuverte: 'c1', _candVerifEnCours: new Set(), _candVerifPiecesEnCours: new Set(),
    _tddocMagasin: null, _tddocMagasinLe: 0, _tddocMagasinPromesse: null, _zxingPromesse: null
  };
  const noms = Object.keys(deps).filter((n) => !['_tddocMagasin', '_tddocMagasinLe', '_tddocMagasinPromesse', '_zxingPromesse'].includes(n));
  const prelude = 'let _tddocMagasin = null, _tddocMagasinLe = 0, _tddocMagasinPromesse = null; let _zxingPromesse = null;\n';
  const exp = '\nreturn { _candVerifierPieces, _candVerifLigneHtml, _candVerifDetail, _candPointsAVerifier, _candSetPieceType, _candVerifReglages };';
  const app = new Function(...noms, prelude + SRC + exp)(...noms.map((n) => deps[n]));
  return { app, j, dom };
}
const AVIS = (o = {}) => Object.assign({ id: 'd1', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.1', mime: 'application/pdf', originalName: 'avis.pdf', uploadedAt: '2026-10-12T10:00:00Z' }, o);
const parc = (docs = [AVIS()], statut = 'enCours') => ({ params: {}, candidats: [{ id: 'c1', nom: 'Marchal', prenom: 'Inès', statut }], documents: docs });
const SANS_CODE = { illisible: false, estPdf: true, codes: [], texte: '', metadonnees: { createur: 'Paie', creeLe: 'D:20260701', modifieLe: 'D:20261001' }, enregistrements: 1, superpositions: [] };

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
    expect(j.fetches).toEqual(['https://relais.test/api/2ddoc/confiance']);
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
    for (const o of [{ binaire: null, analyse: SANS_CODE }, { analyse: new Error('pdf') }]) {
      const DB = parc(); const { app, j } = monter(DB, o);
      await app._candVerifierPieces('c1');
      expect(DB.documents[0].verif).toBeUndefined(); expect(j.saves).toBe(0);
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

describe('affichage et « Points à vérifier »', () => {
  it('ligne sous la pièce, détail en couche, constats repris avec actions (impots.gouv + détail), sans total', async () => {
    const DB = parc();
    const { app, j, dom } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    const ligne = app._candVerifLigneHtml(DB.documents[0]);
    expect(ligne).toContain('Non vérifiable automatiquement');
    expect(ligne).not.toContain('cand-vrf ok');
    const pts = app._candPointsAVerifier(DB.candidats[0]);
    expect(pts.map((p) => p.code)).toEqual(['V4', 'T1']);
    expect(pts[0].actionsHtml).toContain('Vérifier sur impots.gouv');
    app._candVerifDetail('d1');
    expect(j.modale).toBe('ov-verif-piece');
    expect(dom['vp-body'].innerHTML).toContain('Informations internes du fichier (sans IA)');
    expect(dom['vp-body'].innerHTML).toContain('01/07/2026');
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
  it('ligne « Vérification » et « Points à vérifier » : l\'identifiant arrive intact à la fonction', async () => {
    const DB = parc([AVIS({ id: HOSTILE })]);
    const { app } = monter(DB, { analyse: SANS_CODE });
    await app._candVerifierPieces('c1');
    expect(appelDe(app._candVerifLigneHtml(DB.documents[0]), 'onclick', '_candVerifDetail')).toEqual([HOSTILE]);
    const pts = app._candPointsAVerifier(DB.candidats[0]);
    expect(appelDe(pts[0].actionsHtml, 'onclick', '_candVerifDetail')).toEqual([HOSTILE]);
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
    expect(f).toContain('onchange="_candSetPieceType(\' + escHtml(JSON.stringify(d.id)) + \', this.value)"');
    const attr = '_candSetPieceType(' + escHtml(JSON.stringify(HOSTILE)) + ', this.value)';
    const recus = []; new Function('_candSetPieceType', 'self', decoder(attr).replace(/\bthis\b/g, 'self'))((...x) => recus.push(x), { value: 'I.D.1' });
    expect(recus[0]).toEqual([HOSTILE, 'I.D.1']);
    // l'ancienne forme (guillemets seuls) cassait la chaîne JS sur « &quot; » contenu dans l'identifiant
    const ancien = '_candSetPieceType(' + JSON.stringify(HOSTILE).replace(/"/g, '&quot;') + ', this.value)';
    expect(() => new Function('_candSetPieceType', 'self', decoder(ancien).replace(/\bthis\b/g, 'self'))(() => {}, {})).toThrow();
  });
  it('aucune chaîne JS entre apostrophes avec escHtml collé dans les nouveaux gestionnaires', () => {
    for (const n of ['_candVerifLigneHtml', '_candVerifConstats', '_candVerifDetail']) {
      expect(extraireFonction(P1, n), n).not.toMatch(/\(\\'' \+ escHtml\(/);
    }
  });
});
