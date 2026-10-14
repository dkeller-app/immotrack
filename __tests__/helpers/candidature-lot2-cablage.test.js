/**
 * CANDIDATURES-CONFORMITE lot 2 — CÂBLAGE : le vrai code de l'app (js/app/app-part1.js, app-part2.js)
 * avec les vrais modules purs (pieces-candidature, employeur). Prouve : points à vérifier factuels et
 * limités à la fiche, vérification de l'employeur (réseau simulé, hors ligne = reportée), bouclier
 * « pièce hors liste » NON bloquant, type de pièce contrôlé contre la liste du décret.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as PiecesCand from '../../js/core/pieces-candidature.js';
import * as Employeur from '../../js/core/employeur.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const SRC = ['_candPointsAVerifier', '_candPieceHorsListeConserver', '_complBouclier', '_complEnvoyerQuandMeme', '_candEmployeurSousLigneHtml']
  .map(n => extraireFonction(P1, n)).join('\n') + '\n'
  + 'async ' + extraireFonction(P1, '_candVerifierEmployeur') + '\n'
  + extraireFonction(P2, '_candSetPieceType');

const REP_FERMEE = { results: [{ siren: '552100554', nom_complet: 'PEUGEOT SA', etat_administratif: 'C', date_fermeture: '2021-01-16' }] };

function monter(DB, { fetchImpl, horsLigne = false, note = '' } = {}) {
  const j = { toasts: [], saves: 0, fetches: [], fiche: 0 };
  const dom = { 'compl-note': { value: note }, 'inv-body': { innerHTML: '' }, 'inv-foot': { innerHTML: '' }, 'inv-title': { textContent: '' } };
  const window = { PiecesCand, Employeur, __immoHorsLigne: horsLigne };
  const deps = {
    DB, window, navigator: { onLine: !horsLigne },
    fetch: async (url, o) => { j.fetches.push(url); return fetchImpl(url, o); },
    AbortController, setTimeout, clearTimeout, console: { warn() {} },
    _stamp: o => { o._modifiedAt = 'stamp'; }, saveDB: () => { j.saves++; },
    showToast: (m) => j.toasts.push(m), openFicheCandidat: () => { j.fiche++; },
    el: id => dom[id] || null, v: id => (dom[id] ? dom[id].value : ''),
    escHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    _uiIcon: n => '<svg data-i="' + n + '"></svg>', _lyQ: s => String(s), fd: s => s.split('-').reverse().join('/'),
    _auditLog: () => {}, _complCandCtxHtml: () => '<div class="bien-ctx"></div>', _ficheCandidatOuverte: null,
    _candVerifEnCours: new Set(), _invState: { candId: 'c1' }
  };
  const noms = Object.keys(deps);
  const exp = '\nreturn { _candPointsAVerifier, _candPieceHorsListeConserver, _complBouclier, _complEnvoyerQuandMeme, _candEmployeurSousLigneHtml, _candVerifierEmployeur, _candSetPieceType, inv: () => _invState };';
  const app = new Function(...noms, SRC + exp)(...noms.map(n => deps[n]));
  return { app, j, dom };
}

const parc = () => ({
  candidats: [{ id: 'c1', employeur: 'Endress+Hauser Flowtec AG', employeurSiren: '552 100 554' }],
  documents: [
    { id: 1, parentType: 'candidat', parentId: 'c1', category: 'garant', name: 'releve-compte-garant-sept.pdf', uploadedAt: '2026-10-10T08:00:00Z' },
    { id: 2, parentType: 'candidat', parentId: 'c1', category: 'ressources', name: 'bulletins-juil-aout-sept.pdf' },
    { id: 3, parentType: 'bail', parentId: 'c1', name: 'releve-compte.pdf' }
  ]
});

describe('employeur — vérification réelle du câblage', () => {
  it('fermé → constat enregistré puis point à vérifier daté et sourcé', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { fetchImpl: async () => ({ ok: true, json: async () => REP_FERMEE }) });
    await app._candVerifierEmployeur('c1');
    expect(j.fetches).toEqual(['https://recherche-entreprises.api.gouv.fr/search?q=552100554&page=1&per_page=1']);
    expect(DB.candidats[0].employeurVerif).toMatchObject({ id: '552100554', etat: 'ferme', nomOfficiel: 'PEUGEOT SA' });
    const p = app._candPointsAVerifier(DB.candidats[0]).find(x => x.code === 'C7');
    expect(p.titre).toMatch(/^L'employeur indiqué n'apparaît pas comme actif dans l'Annuaire des entreprises au \d{2}\/\d{2}\/\d{4}\.$/);
    expect(p.actionsHtml).toContain('Vérifier à nouveau');
  });
  it('déjà vérifié pour ce numéro → aucun nouvel appel ; force → nouvel appel', async () => {
    const DB = parc();
    const { app, j } = monter(DB, { fetchImpl: async () => ({ ok: true, json: async () => REP_FERMEE }) });
    await app._candVerifierEmployeur('c1'); await app._candVerifierEmployeur('c1');
    expect(j.fetches.length).toBe(1);
    await app._candVerifierEmployeur('c1', { force: true });
    expect(j.fetches.length).toBe(2);
  });
  it('hors ligne ou réseau en échec → reportée : rien d\'enregistré, aucune alerte', async () => {
    for (const o of [{ horsLigne: true, fetchImpl: async () => { throw new Error('x'); } }, { fetchImpl: async () => { throw new Error('net'); } }, { fetchImpl: async () => ({ ok: false, status: 503 }) }]) {
      const DB = parc();
      const { app } = monter(DB, o);
      await app._candVerifierEmployeur('c1');
      expect(DB.candidats[0].employeurVerif).toBeUndefined();
      expect(app._candPointsAVerifier(DB.candidats[0]).some(x => x.code === 'C7')).toBe(false);
    }
  });
  it('numéro invalide → constat local, sans réseau', async () => {
    const DB = parc(); DB.candidats[0].employeurSiren = '552100555';
    const { app, j } = monter(DB, { fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
    await app._candVerifierEmployeur('c1');
    expect(j.fetches).toEqual([]);
    expect(DB.candidats[0].employeurVerif.etat).toBe('invalide');
  });
  it('numéro changé depuis la vérification → l\'ancien constat n\'est plus affiché', () => {
    const DB = parc(); DB.candidats[0].employeurVerif = { id: '542051180', type: 'siren', etat: 'ferme', verifieLe: '2026-10-12T09:00:00Z' };
    const { app } = monter(DB);
    expect(app._candPointsAVerifier(DB.candidats[0]).some(x => x.code === 'C7')).toBe(false);
  });
});

describe('pièce reçue hors liste (C1)', () => {
  it('signalée pour la pièce du candidat seulement ; « Conserver » la retire des points', () => {
    const DB = parc();
    const { app } = monter(DB);
    const pts = app._candPointsAVerifier(DB.candidats[0]).filter(x => x.code === 'C1');
    expect(pts.length).toBe(1);
    expect(pts[0].detail).toContain('releve-compte-garant-sept.pdf');
    expect(pts[0].actionsHtml).toContain('Supprimer cette pièce');
    app._candPieceHorsListeConserver(1);
    expect(app._candPointsAVerifier(DB.candidats[0]).filter(x => x.code === 'C1').length).toBe(0);
  });
  it('aucun point ne porte de mot de jugement', () => {
    const DB = parc(); DB.candidats[0].employeurVerif = { id: '552100554', type: 'siren', etat: 'ferme', nomOfficiel: 'X', verifieLe: '2026-10-12T09:00:00Z' };
    const { app } = monter(DB);
    const txt = app._candPointsAVerifier(DB.candidats[0]).map(p => p.titre + ' ' + p.detail).join(' ').toLowerCase();
    expect(txt).not.toMatch(/suspect|fraud|faux|fiable|douteu|risqu/);
  });
});

describe('bouclier « pièce hors liste » sur la demande de complément — jamais bloquant', () => {
  it('texte propre → on continue', () => {
    const { app } = monter(parc(), { note: 'Avis d\'imposition page 2 illisible' });
    expect(app._complBouclier(() => {})).toBe(true);
  });
  it('pièce interdite → avertissement (texte légal + amende), puis « Envoyer quand même » poursuit', () => {
    const { app, dom } = monter(parc(), { note: 'Merci d\'ajouter les relevés bancaires et une photo d\'identité.' });
    let suite = 0;
    const f = () => { if (app._complBouclier(f)) suite++; };
    f();
    expect(suite).toBe(0);
    expect(dom['inv-body'].innerHTML).toContain('Cette demande vise des pièces hors de la liste autorisée.');
    expect(dom['inv-body'].innerHTML).toContain('3 000 € pour une personne physique et à 15 000 € pour une personne morale');
    expect(dom['inv-foot'].innerHTML).toContain('Envoyer quand même');
    expect(dom['inv-foot'].innerHTML).toContain('Modifier la demande');
    app._complEnvoyerQuandMeme();
    expect(suite).toBe(1);
    expect(app.inv().complNote).toContain('relevés bancaires');   // note conservée
  });
});

describe('type de pièce', () => {
  it('type de la liste du décret pour la catégorie → enregistré ; autre → refusé', () => {
    const DB = parc();
    const { app, j } = monter(DB);
    app._candSetPieceType(2, 'I.D.2');
    expect(DB.documents[1].pieceType).toBe('I.D.2');
    app._candSetPieceType(2, 'I.A.1');                       // identité, pas ressources
    expect(DB.documents[1].pieceType).toBe('I.D.2');
    expect(j.toasts.at(-1)).toMatch(/non reconnu/);
    app._candSetPieceType(2, '');                            // retour à « non précisé »
    expect('pieceType' in DB.documents[1]).toBe(false);
    app._candSetPieceType(3, 'I.D.2');                       // pièce de bail : ignorée
    expect(DB.documents[2].pieceType).toBeUndefined();
  });
});
