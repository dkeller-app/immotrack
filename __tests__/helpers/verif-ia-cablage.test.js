// __tests__/helpers/verif-ia-cablage.test.js — VERIF-DOCUMENTS lots 3-4 : câblage réel (code extrait de app-part1.js et
// exécuté avec des doublures) de la lecture des bulletins par l'IA (à la demande), des corrections journalisées, des
// réglages ; et texte d'information du candidat sur la page publique (relay/public/dossier.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as VerifPieces from '../../js/core/verif-pieces.js';
import * as ReglesBulletin from '../../js/core/regles-bulletin.js';
import * as DeuxDDoc from '../../js/core/deux-d-doc.js';
import * as IaTransparence from '../../js/core/ia-transparence.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const NOMS = ['_candVerifReglages', '_candIaClient', '_candIaPieces', '_candIaAnalyse', '_candIaAFaire', '_candIaLotHtml', '_candIaOuvrir', '_candIaDetailHtml', '_candIaCorriger',
  '_candVerifEtat', '_candVrfIco', '_candVerifLigneHtml', '_candVerifConstats', '_candVerifParams', 'rParamsCandidatures', '_candVerifReglerLocaux', '_candVerifReglerIa', '_candVerifReglerModeIa', '_candVerifNoticeIa', '_candVerifActiverIa'];
const SRC = NOMS.map((n) => extraireFonction(P1, n)).join('\n') + '\nasync ' + extraireFonction(P1, '_candIaDispo') + '\nasync ' + extraireFonction(P1, '_candIaLancer');
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LU_AOUT = { lisible: true, periode: '2026-08', salarie: 'DUPONT Camille', employeur: 'C', siret: '00000000100017', dateEntree: null, brut: 2950, netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: null, impotTaux: null, impotMontant: 98.36, netAPayer: 2140, netImposable: null, cumulNetImposable: null };

function monter(DB, { statut = { ok: true, ocr: { actif: true } }, structurer, binaire = 'data:application/pdf;base64,JVBERg==', image = 'data:image/jpeg;base64,AAAA' } = {}) {
  const j = { saves: 0, toasts: [], fiche: 0, appels: [], audits: [], modale: null, fermes: 0 };
  const inputs = [];
  const dom = { 'vp-title': { textContent: '' }, 'vp-body': { innerHTML: '' }, 'vp-foot': { innerHTML: '' }, 'params-candidatures': { innerHTML: '' }, 'ov-fiche-candidat': { classList: { contains: () => false } } };
  const client = { statut: async () => statut, structurer: async (t, input) => { j.appels.push([t, input.type, input.images.length]); return structurer ? structurer(input) : { ok: true, data: LU_AOUT, rejets: 0, modele: 'mistral-ocr' }; } };
  const window = { VerifPieces, ReglesBulletin, DeuxDDoc, IaTransparence, IaClient: { creerClientIA: () => client },
    LecturePieces: { pageVersImage: async () => image }, pdfjsLib: {} };
  const deps = {
    DB, window, document: { createElement: () => ({ getContext: () => ({}) }), querySelectorAll: () => inputs }, createImageBitmap: async () => ({}), Blob, console: { warn() {} },
    _relayCfg: () => ({ base: 'https://relais.test', getToken: async () => 'jwt' }), _attachmentLoadBinary: async () => binaire, _ensurePdfjsLoaded: async () => {}, _dataUrlToUint8: () => new Uint8Array([1]),
    _stamp: (o) => { o._modifiedAt = 'stamp'; }, saveDB: () => { j.saves++; }, showToast: (m) => j.toasts.push(m), openFicheCandidat: () => { j.fiche++; }, openM: (id) => { j.modale = id; }, closeM: () => { j.fermes++; },
    el: (id) => dom[id] || null, escHtml, _lyQ: (s) => escHtml(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")),_uiIcon: (n) => '<svg data-i="' + n + '"></svg>', fd: (s) => s.split('-').reverse().join('/'), _auditLog: (...a) => j.audits.push(a),
    _ficheCandidatOuverte: 'c1', _candVerifDetail: () => {}, _candIaEnCours: new Set()
  };
  const noms = Object.keys(deps);
  const app = new Function(...noms, 'let _candIaOcr = { actif: null, le: 0 };\n' + SRC + '\nreturn { ' + NOMS.concat(['_candIaDispo', '_candIaLancer']).join(', ') + ' };')(...noms.map((n) => deps[n]));
  return { app, j, dom, inputs };
}
const BUL = (o = {}) => Object.assign({ id: 'b1', parentType: 'candidat', parentId: 'c1', category: 'ressources', pieceType: 'I.D.2', mime: 'application/pdf', originalName: 'bulletin-aout.pdf', uploadedAt: '2026-10-11T10:00:00Z' }, o);
const parc = (docs = [BUL()], statut = 'enCours', ia = true) => ({ params: { verifPieces: { ia, noticeIaLue: '2026-10-13' } }, candidats: [{ id: 'c1', nom: 'Dupont', prenom: 'Camille', statut }], documents: docs });

describe('lecture des bulletins par l\'IA — à la demande', () => {
  it('réglage IA coupé : ni bouton, ni appel', async () => {
    const DB = parc([BUL()], 'enCours', false);
    const { app, j } = monter(DB);
    expect(app._candIaLotHtml(DB.candidats[0])).toBe('');
    await app._candIaLancer('c1');
    expect(j.appels).toEqual([]);
  });
  it('bouton proposé seulement quand le relais annonce la lecture ouverte ; écran listant exactement ce qui part', async () => {
    const DB = parc([BUL(), BUL({ id: 'a1', pieceType: 'I.D.1', originalName: 'avis.pdf' }), BUL({ id: 'k1', pieceType: 'I.C.1', originalName: 'contrat.pdf' }), BUL({ id: 'i1', category: 'identite', pieceType: 'I.A.1', originalName: 'cni.pdf' })]);
    const { app, j, dom } = monter(DB);
    expect(app._candIaLotHtml(DB.candidats[0])).toBe('');        // statut inconnu : interrogé en arrière-plan
    await app._candIaDispo(true);
    const lot = app._candIaLotHtml(DB.candidats[0]);
    expect(lot).toContain('1 bulletin de salaire et la première page du contrat de travail');
    app._candIaOuvrir('c1');
    expect(j.modale).toBe('ov-verif-piece');
    expect(dom['vp-body'].innerHTML).toContain('bulletin-aout.pdf'); expect(dom['vp-body'].innerHTML).toContain('contrat.pdf');
    expect(dom['vp-body'].innerHTML).not.toContain('avis.pdf'); expect(dom['vp-body'].innerHTML).not.toContain('cni.pdf');
    expect(dom['vp-body'].innerHTML).toContain('30 jours au plus');
  });
  it('lecture : une page par pièce, valeurs posées sur la pièce, audit sans contenu, constat B1 dans « Points à vérifier »', async () => {
    const DB = parc();
    const { app, j } = monter(DB);
    await app._candIaLancer('c1');
    expect(j.appels).toEqual([['bulletin-paie', 'bulletin', 1]]);
    expect(DB.documents[0].verifIa).toMatchObject({ type: 'bulletin', lu: { netAPayer: 2140 }, corrections: {} });
    expect(j.audits[0][3]).toBe('lecture par l\'IA (page 1, bulletin)');
    expect(JSON.stringify(j.audits)).not.toMatch(/2140|DUPONT/);
    const pts = app._candVerifConstats(DB.candidats[0]);
    expect(pts.map((p) => p.code)).toEqual(['B1']);
    expect(pts[0].date).toBe('lu le ' + new Date().toISOString().slice(0, 10).split('-').reverse().join('/'));
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('Écart relevé');
    await app._candIaLancer('c1');                                   // déjà lue : rien de plus
    expect(j.appels.length).toBe(1);
  });
  it('dossier refusé : jamais envoyé ; lecture fermée côté relais : aucun appel ni écriture', async () => {
    const DB = parc([BUL()], 'refuse');
    const a = monter(DB); await a.app._candIaLancer('c1'); expect(a.j.appels).toEqual([]);
    const DB2 = parc();
    const b = monter(DB2, { statut: { ok: true, ocr: { actif: false } } }); await b.app._candIaLancer('c1');
    expect(b.j.appels).toEqual([]); expect(DB2.documents[0].verifIa).toBeUndefined();
  });
  it('quota ou hors ligne : arrêt sans écrire ; panne ponctuelle : lecture reportée sur la pièce', async () => {
    const DB = parc([BUL(), BUL({ id: 'b2', originalName: 'b2.pdf' })]);
    const a = monter(DB, { structurer: () => ({ ok: false, code: 'quota' }) }); await a.app._candIaLancer('c1');
    expect(a.j.appels.length).toBe(1); expect(DB.documents.every((d) => !d.verifIa)).toBe(true);
    expect(a.j.toasts.at(-1)).toContain('Limite de lectures du jour');
    const DB2 = parc();
    const b = monter(DB2, { structurer: () => ({ ok: false, code: 'unavailable' }) }); await b.app._candIaLancer('c1');
    expect(DB2.documents[0].verifIa).toMatchObject({ erreur: 'unavailable' });
    expect(b.app._candIaLotHtml(DB2.candidats[0])).toContain("Lire avec l'IA");   // la pièce reste à relire
  });
  it('page impossible à rendre sous la taille admise : rien n\'est envoyé, pièce « illisible »', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { image: null });
    await app._candIaLancer('c1');
    expect(j.appels).toEqual([]);
    expect(DB.documents[0].verifIa.lu).toEqual({ lisible: false });
  });
  it('pièce supprimée pendant la lecture : résultat non écrit', async () => {
    const DB = parc();
    const { app } = monter(DB, { structurer: () => { DB.documents[0]._deleted = true; return { ok: true, data: LU_AOUT }; } });
    await app._candIaLancer('c1');
    expect(DB.documents[0].verifIa).toBeUndefined();
  });
});

describe('corrections du bailleur', () => {
  it('valeur corrigée : priment sur la lecture, règles recalculées, audit avec les seuls noms de champs', async () => {
    const DB = parc();
    const { app, j, inputs } = monter(DB);
    await app._candIaLancer('c1');
    inputs.push({ getAttribute: () => 'netAPayer', value: '2 193,04' }, { getAttribute: () => 'brut', value: '2950' });
    app._candIaCorriger('b1');
    expect(DB.documents[0].verifIa.corrections).toMatchObject({ netAPayer: { avant: 2140, apres: 2193.04 } });
    expect(DB.documents[0].verifIa.corrections.brut).toBeUndefined();
    expect(j.audits.at(-1)[3]).toBe('correction de la lecture IA : netAPayer');
    expect(app._candVerifConstats(DB.candidats[0])).toEqual([]);
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('Aucun écart relevé');
  });
  it('saisie non reconnue : rien n\'est enregistré', async () => {
    const DB = parc();
    const { app, j, inputs } = monter(DB);
    await app._candIaLancer('c1'); const s0 = j.saves;
    inputs.push({ getAttribute: () => 'netAPayer', value: 'deux mille' });
    app._candIaCorriger('b1');
    expect(DB.documents[0].verifIa.corrections).toEqual({}); expect(j.saves).toBe(s0);
  });
});

describe('Paramètres › Candidatures', () => {
  it('première activation de la lecture IA : notice à valider ; ensuite réglage du mode', () => {
    const DB = { params: {}, candidats: [], documents: [] };
    const { app, j, dom } = monter(DB);
    app.rParamsCandidatures();
    expect(dom['params-candidatures'].innerHTML).toContain('Contrôles sur l\'appareil');
    expect(dom['params-candidatures'].innerHTML).toContain('Aucun score, aucun classement, aucun refus automatique');
    app._candVerifReglerIa(true);
    expect(DB.params.verifPieces.ia).toBeUndefined();               // pas activée sans la notice
    expect(j.modale).toBe('ov-verif-piece'); expect(dom['vp-foot'].innerHTML).toContain('Activer la lecture');
    app._candVerifActiverIa();
    expect(DB.params.verifPieces).toMatchObject({ ia: true }); expect(DB.params.verifPieces.noticeIaLue).toBeTruthy();
    app._candVerifReglerModeIa('reception');
    expect(app._candVerifReglages()).toEqual({ locaux: true, ia: true, iaMode: 'reception' });
    app._candVerifReglerLocaux(false);
    expect(app._candVerifReglages().locaux).toBe(false);
  });
});

describe('page publique de dépôt : information du candidat', () => {
  const D = readFileSync(resolve(root, 'relay/public/dossier.js'), 'utf8');
  it('contrôles annoncés avant le dépôt et dans la mention RGPD (2D-Doc, IA Mistral UE, conservation, opposition)', () => {
    expect(D).toContain('<b>Contrôles des pièces.</b>');
    expect(D).toContain('signature du code 2D-Doc des pièces qui en portent un');
    expect(D).toContain('Mistral AI, sous-traitant, lecture dans l\'Union européenne, conservation 30 jours au plus');
    expect(D).toContain('aucune pièce supplémentaire n\'est demandée');
    expect(D).toContain('opposition');
    expect(readFileSync(resolve(root, 'relay/src/dossier-page.js'), 'utf8')).toMatch(/ASSET_VERSION = '3'/);
  });
});
