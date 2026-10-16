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
const NOMS = ['_candVerifReglages', '_candAvecDelai', '_candVerifActuelle', '_candIaClient', '_candIaPieces', '_candIaAnalyse', '_candIaAFaire', '_candIaLotHtml', '_candIaOuvrir', '_candIaDetailHtml', '_candIaCorriger',
  '_candVerifEtat', '_candVerifBadgeHtml', '_candVerifLigneHtml', '_candVerifResumeHtml', '_candVerifParams', 'rParamsCandidatures', '_candVerifReglerLocaux', '_candVerifReglerIa', '_candVerifReglerModeIa', '_candVerifNoticeIa', '_candVerifActiverIa'];
const SRC = NOMS.map((n) => extraireFonction(P1, n)).join('\n') + '\nasync ' + extraireFonction(P1, '_candIaDispo') + '\nasync ' + extraireFonction(P1, '_candIaServiceOuvert') + '\nasync ' + extraireFonction(P1, '_candIaLancer');
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LU_AOUT = { lisible: true, periode: '2026-08', salarie: 'DUPONT Camille', employeur: 'C', siret: '00000000100016', dateEntree: null, heures: 151.67, tauxHoraire: 19.4501, salaireBase: 2950, brut: 2950, totalCotisations: 658.6, autresLignes: [],
  lignes: [{ libelle: 'Complémentaire santé', base: 4005, taux: 0.8, montant: 32.04 }, { libelle: 'Sécurité sociale plafonnée', base: 2950, taux: 6.9, montant: 203.55 }, { libelle: 'Sécurité sociale déplafonnée', base: 2950, taux: 0.4, montant: 11.8 }, { libelle: 'Complémentaire tranche 1', base: 2950, taux: 3.15, montant: 92.93 }, { libelle: 'CEG tranche 1', base: 2950, taux: 0.86, montant: 25.37 }, { libelle: 'CSG déductible', base: 3019.69, taux: 6.8, montant: 205.34 }, { libelle: 'CSG/CRDS non déductible', base: 3019.69, taux: 2.9, montant: 87.57 }],
  netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: null, impotTaux: null, impotMontant: 98.36, netAPayer: 2140, netImposable: null, cumulNetImposable: null };

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
    _ficheCandidatOuverte: 'c1', _candVerifDetail: () => {}, _candIaEnCours: new Set(), _candVerifierPieces: async () => { j.locales = (j.locales || 0) + 1; }
  };
  const noms = Object.keys(deps);
  const app = new Function(...noms, 'let _candIaOcr = { actif: null, le: 0 };\n' + SRC + '\nreturn { ' + NOMS.concat(['_candIaDispo', '_candIaServiceOuvert', '_candIaLancer']).join(', ') + ' };')(...noms.map((n) => deps[n]));
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
  it('lecture : une page par pièce, valeurs posées sur la pièce, audit sans contenu ; net à payer incohérent → « Non vérifiable », jamais « À vérifier »', async () => {
    const DB = parc();
    const { app, j } = monter(DB);
    await app._candIaLancer('c1');
    expect(j.appels).toEqual([['bulletin-paie', 'bulletin', 1]]);
    expect(DB.documents[0].verifIa).toMatchObject({ type: 'bulletin', lu: { netAPayer: 2140 }, corrections: {} });
    expect(j.audits[0][3]).toBe('lecture par l\'IA (page 1, bulletin)');
    expect(JSON.stringify(j.audits)).not.toMatch(/2140|DUPONT/);
    const e = app._candVerifEtat(DB.documents[0]);
    expect(e).toMatchObject({ etat: 'nonverif', vert: false });
    expect(e.lignes.filter((l) => l.type === 'ecart')).toEqual([]);
    expect(e.lignes.some((l) => l.texte === 'Non lu : net à payer et impôt prélevé')).toBe(true);
    expect(e.note).toBe(IaTransparence.MENTION_PROPOSITION + '.');
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('<span>Non vérifiable</span>');
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
  it('page impossible à préparer sous la taille admise : rien n\'est envoyé, lecture reportée (pas « illisible »)', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { image: null });
    await app._candIaLancer('c1');
    expect(j.appels).toEqual([]);
    expect(DB.documents[0].verifIa).toMatchObject({ erreur: 'rendu' });
    expect(app._candVerifEtat(DB.documents[0]).lignes.map((l) => l.texte)).toContain('Lecture reportée');
  });
  it('contrôle local lancé avant la lecture ; un avis reconnu par son code 2D-Doc n\'est jamais envoyé, même typé « bulletin »', async () => {
    const DB = parc([BUL({ verif: { v: 1, le: '2026-10-11', deuxDDoc: { etat: 'valide', type: '28' }, constats: [] } })]);
    const { app, j } = monter(DB);
    await app._candIaLancer('c1');
    expect(j.locales).toBe(1);
    expect(j.appels).toEqual([]);
  });
  it('dossier refusé pendant la lecture : arrêt avant l\'envoi suivant', async () => {
    const DB = parc([BUL(), BUL({ id: 'b2', originalName: 'b2.pdf' })]);
    const { app, j } = monter(DB, { structurer: () => { DB.candidats[0].statut = 'refuse'; return { ok: true, data: LU_AOUT }; } });
    await app._candIaLancer('c1');
    expect(j.appels.length).toBe(1);
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
    expect(app._candVerifEtat(DB.documents[0]).lignes.some((l) => l.type === 'ecart')).toBe(false);
    expect(app._candVerifLigneHtml(DB.documents[0])).toContain('<span>OK</span>');
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
  it('service de lecture fermé : aucune mention d\'IA, case désactivée « Bientôt disponible » ; ouvert : réglage complet', async () => {
    const DB = { params: {}, candidats: [], documents: [] };
    const ferme = monter(DB, { statut: { ok: true, ocr: { actif: false } } });
    await ferme.app._candIaServiceOuvert(true);
    ferme.app.rParamsCandidatures();
    const h = ferme.dom['params-candidatures'].innerHTML;
    expect(h).toContain('Bientôt disponible'); expect(h).toContain('<input type="checkbox" disabled>');
    expect(h).not.toMatch(/\bIA\b|Mistral|notice/i);
    const ouvert = monter(DB);
    await ouvert.app._candIaServiceOuvert(true);
    ouvert.app.rParamsCandidatures();
    expect(ouvert.dom['params-candidatures'].innerHTML).toContain('Lecture des bulletins de salaire par l\'IA');
  });
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
    expect(D).toContain('si le propriétaire l\'active');
    const v = readFileSync(resolve(root, 'relay/src/dossier-page.js'), 'utf8').match(/ASSET_VERSION = '(\d+)'/);
    expect(+v[1]).toBeGreaterThanOrEqual(4);                       // monté à chaque changement de la page (LECTURE-PHOTOS : 5)
  });
});

describe('Paramètres : l\'onglet « Candidatures » ouvre son propre panneau (setTab apparie onglets et panneaux par position)', () => {
  it('ordre des panneaux = ordre des onglets dans #p-params', () => {
    const fd = require('node:fs').openSync(resolve(root, 'index.html'), 'r');
    const html = require('node:fs').readFileSync(fd, 'utf8'); require('node:fs').closeSync(fd);
    const i = html.indexOf('id="p-params"'); const j = html.indexOf('<div class="page"', i + 10);
    const zone = html.slice(i, j > 0 ? j : undefined);
    const onglets = [...zone.matchAll(/onclick="setParamsTab\('([a-z]+)'/g)].map((m) => m[1]);
    const panneaux = [...zone.matchAll(/class="tab-panel[^"]*" id="tp-([a-z]+)"/g)].map((m) => m[1]);
    expect(onglets).toContain('candidatures');
    expect(panneaux.slice(0, onglets.length)).toEqual(onglets.map((o) => (o === 'modele' ? 'modele' : o)));
  });
});
