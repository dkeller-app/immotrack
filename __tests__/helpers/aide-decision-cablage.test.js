/**
 * AIDE-DECISION — CÂBLAGE : le vrai code de l'app (js/app/app-part1.js) avec le vrai module pur
 * (js/core/aide-decision-candidats.js). Prouve : bouton « Comparer » à partir de 2 dossiers en lice, ordre par
 * défaut = date de réception, tri seulement sur les dates et le taux d'effort, un mot pour les pièces (sans compte
 * ni couleur de verdict), repère fixé par le propriétaire (aucun par défaut, jamais suggéré), échappement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as AideDecision from '../../js/core/aide-decision-candidats.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (f) => readFileSync(resolve(root, f), 'utf8');
const P1 = lire('js/app/app-part1.js');
const ligne = (debut) => { const i = P1.indexOf(debut); if (i < 0) throw new Error('introuvable : ' + debut); return P1.slice(i, P1.indexOf('\n', i)); };
const FONCTIONS = ['_candCmpParams', '_candCmpRepere', '_candCmpLectureSeule', '_candCmpBouton', '_candCmpOuvert', '_candCmpRafraichir', '_candCmpPiecesAvecEtat', '_candCmpConstatsDossier',
  '_candCmpLignes', '_candCmpTrier', '_candCmpTrierColonne', '_candCmpPiecesHtml', '_candCmpTauxHtml', '_candCmpDossierHtml', '_candCmpGarantieHtml', '_candCmpRender',
  '_candCmpLigne', '_candCmpDetail', '_candCmpTaux', '_candCmpPieces', '_candCmpRepereOuvrir', '_candCmpRepereEnregistrer', '_candCmpOuvrirDossier', 'ouvrirComparaisonCandidats',
  '_candCategoriesFournies', '_candInitials', '_candContratLabel'];
const SRC = [ligne('let _candCmp = '), ligne('const _CAND_CMP_ICO_PIECES'), ligne('const _CAND_CMP_BTN_DOSSIER'), ligne('const _CAND_CAT_COURT')]
  .concat(FONCTIONS.map((n) => extraireFonction(P1, n))).join('\n');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function monter(DB, { radio = 'aucun', saisie = '', lectureSeule = false } = {}) {
  const j = { toasts: [], saves: 0, ouverts: [], fermes: [], fiches: [], verifs: [] };
  const mk = () => ({ innerHTML: '', textContent: '', value: '', classList: { _s: new Set(['hidden']), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } });
  const dom = { 'cand-cmp-btn': mk(), 'ov-cand-comparer': mk(), 'ov-cand-cmp-detail': mk(), 'cmp-body': mk(), 'cmp-title': mk(), 'cmpd-title': mk(), 'cmpd-body': mk(), 'cmpd-foot': mk(), 'cand-f-bien': mk(), 'cmp-rp-val': mk() };
  dom['cmp-rp-val'].value = saisie;
  const etatsTest = { ok: { etat: 'ok', mot: 'OK' }, averif: { etat: 'averif', mot: 'À vérifier', resume: { texte: 'Le net à payer ne correspond pas au calcul' } }, nonverif: { etat: 'nonverif', mot: 'Non vérifiable' } };
  const deps = {
    DB, window: { AideDecision, PiecesCand: { typesPourCategorie: (c) => ['identite', 'domicile', 'situation', 'ressources', 'garant'].includes(c) ? [{ id: 'x' }] : [] } },
    document: { querySelector: (q) => (q.includes(':checked') ? { value: radio } : null), querySelectorAll: () => [] },
    el: (id) => dom[id] || null, v: (id) => (dom[id] ? dom[id].value : ''), escHtml: esc,
    _uiIcon: (n) => '<svg data-i="' + n + '"></svg>', _lyQ: (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    fd: (s) => String(s).split('-').reverse().join('/'), fmt: (n) => String(n) + ' €', td: () => '2026-10-16',
    saveDB: () => { j.saves++; }, showToast: (m, t) => j.toasts.push([m, t]),
    openM: (id) => { j.ouverts.push(id); if (dom[id]) dom[id].classList.remove('hidden'); }, closeM: (id) => { j.fermes.push(id); if (dom[id]) dom[id].classList.add('hidden'); },
    openFicheCandidat: (id) => j.fiches.push(id),
    _candVerifEtat: (d) => etatsTest[d.etatTest] || null, _candVerifBadgeHtml: (e) => '<span>' + esc(e.mot) + '</span>',
    _candVerifReglages: () => ({ locaux: true, ia: false }), _candIaAnalyse: () => ({ constats: [] }),
    _candVerifierPieces: async (id) => { j.verifs.push(id); },
    _loyerCCBienDetail: () => ({ hc: 760, ch: 60, cc: 820 }), _logLabel: (l) => l.ref,
    _CAND_ST_LABEL: { recu: 'Reçu', enCours: 'En cours', valide: 'Validé' }, _CAND_ST_BADGE: {}, _appReadOnly: !!lectureSeule
  };
  const noms = Object.keys(deps);
  const exp = '\nreturn { ' + FONCTIONS.join(', ') + ', etat: () => _candCmp };';
  const app = new Function(...noms, SRC + exp)(...noms.map((n) => deps[n]));
  return { app, j, dom };
}

const docs = (id, cats, etat) => cats.map((c, i) => ({ id: id + '-' + i, parentType: 'candidat', parentId: id, category: c, etatTest: etat, originalName: c + '.pdf' }));
const TOUTES = ['identite', 'domicile', 'situation', 'ressources'];
const parc = () => ({
  params: {},
  logements: [{ ref: 'T3' }],
  candidats: [
    { id: 'cm', logRef: 'T3', statut: 'recu', prenom: 'Camille', nom: 'Martin', revenus: 2650, dateCreation: '2026-10-14T09:00:00Z', dateDebutSouhaitee: '2026-11-01' },
    { id: 'hl', logRef: 'T3', statut: 'enCours', prenom: 'Hugo', nom: 'Lefèvre', revenus: 2100, dateCreation: '2026-10-13T09:00:00Z', garant: { nom: 'Roux' }, piecesVerifiees: true },
    { id: 'lr', logRef: 'T3', statut: 'recu', prenom: 'Léa', nom: 'Roussel', revenus: 3300, dateCreation: '2026-10-09T09:00:00Z' },
    { id: 'rf', logRef: 'T3', statut: 'refuse', _archived: true, prenom: 'Refusé', nom: 'X', revenus: 9000, dateCreation: '2026-10-15T09:00:00Z' },
    { id: 'aut', logRef: 'T2', statut: 'recu', prenom: 'Autre', nom: 'Bien', revenus: 2000, dateCreation: '2026-10-15T09:00:00Z' }
  ],
  documents: [...docs('cm', TOUTES, 'ok'), ...docs('hl', TOUTES, 'averif'), ...docs('lr', ['identite', 'situation', 'ressources'], 'nonverif')]
});
const ordre = (html) => ['Camille Martin', 'Hugo Lefèvre', 'Léa Roussel'].map((n) => [n, html.indexOf(n)]).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);

describe('bouton « Comparer les N dossiers »', () => {
  it('caché sous 2 dossiers en lice, ou sans logement choisi', () => {
    const { app, dom } = monter(parc());
    app._candCmpBouton('T2'); expect(dom['cand-cmp-btn'].classList.contains('hidden')).toBe(true);
    app._candCmpBouton(''); expect(dom['cand-cmp-btn'].classList.contains('hidden')).toBe(true);
  });
  it('visible et compté sur les dossiers en lice seulement (refusé archivé exclu)', () => {
    const { app, dom } = monter(parc());
    app._candCmpBouton('T3');
    expect(dom['cand-cmp-btn'].classList.contains('hidden')).toBe(false);
    expect(dom['cand-cmp-btn'].innerHTML).toContain('Comparer les 3 dossiers');
  });
});

describe('vue « Comparer »', () => {
  const ouvrir = (opts) => { const m = monter(parc(), opts); m.dom['cand-f-bien'].value = 'T3'; m.app.ouvrirComparaisonCandidats(); return m; };
  it('s\'ouvre sur le logement filtré, vérifie les pièces de chaque dossier, ordre de réception', async () => {
    const { j, dom } = ouvrir();
    await new Promise((r) => setTimeout(r, 0));
    expect(j.ouverts).toContain('ov-cand-comparer');
    expect(j.verifs.sort()).toEqual(['cm', 'hl', 'lr']);
    const h = dom['cmp-body'].innerHTML;
    expect(ordre(h)).toEqual(['Camille Martin', 'Hugo Lefèvre', 'Léa Roussel']);
    expect(h).not.toContain('Refusé'); expect(h).not.toContain('Autre Bien');
    expect(h).toContain('loyer 760 € + 60 € de charges = 820 € charges comprises');
  });
  it('un état par critère : Complet / Manque, un mot de pièces sans compte ni vert, taux d\'effort, garantie', () => {
    const h = ouvrir().dom['cmp-body'].innerHTML;
    expect(h).toContain('Complet');
    expect(h).toContain('Manque : Domicile');
    for (const mot of ['OK', 'À vérifier', 'Non vérifiable']) expect(h).toContain('<span>' + esc(mot) + '</span>');
    expect(h).not.toMatch(/cand-vbdg[^"]*vert/);
    expect(h).not.toMatch(/\d+\s*(OK|à vérifier)/i);
    expect(h).toContain('<b>31 %</b>'); expect(h).toContain('<b>39 %</b>'); expect(h).toContain('<b>25 %</b>');
    expect(h).toContain('Garant'); expect(h).toContain('Aucune');
  });
  it('aucune note, aucun total, aucun classement ; seule la règle le dit', () => {
    const h = ouvrir().dom['cmp-body'].innerHTML.replace('sans note ni classement', '');
    expect(h).not.toMatch(/score|\/\s*100|classement|meilleur|rang|note\b|recommand/i);
  });
  it('sans repère : le chiffre seul, aucune marque ; Propryo ne propose aucun seuil', () => {
    const { app, dom } = ouvrir();
    const h = dom['cmp-body'].innerHTML;
    expect(h).toContain("Repère du taux d'effort : aucun");
    expect(h).not.toMatch(/dans le repère|au-dessus/);
    app._candCmpRepereOuvrir();
    expect(dom['cmpd-body'].innerHTML).not.toMatch(/\b(33|35|40|50)\s*%/);
    expect(dom['cmpd-body'].innerHTML).toContain('Aucun texte de loi ne fixe de seuil.');
  });
  it('tri au choix : taux d\'effort ; une clé interdite revient à l\'ordre de réception', () => {
    const { app, dom } = ouvrir();
    app._candCmpTrier('tauxEffort|asc');
    expect(ordre(dom['cmp-body'].innerHTML)).toEqual(['Léa Roussel', 'Camille Martin', 'Hugo Lefèvre']);
    app._candCmpTrierColonne('tauxEffort');
    expect(ordre(dom['cmp-body'].innerHTML)).toEqual(['Hugo Lefèvre', 'Camille Martin', 'Léa Roussel']);
    app._candCmpTrier('pieces|asc');
    expect(ordre(dom['cmp-body'].innerHTML)).toEqual(['Camille Martin', 'Hugo Lefèvre', 'Léa Roussel']);
    app._candCmpTrier('garantie|desc');
    expect(ordre(dom['cmp-body'].innerHTML)).toEqual(['Camille Martin', 'Hugo Lefèvre', 'Léa Roussel']);
  });
  it('en-têtes triables : dates et taux d\'effort seulement', () => {
    const h = ouvrir().dom['cmp-body'].innerHTML;
    const triables = [...h.matchAll(/_candCmpTrierColonne\('(\w+)'\)/g)].map((m) => m[1]);
    expect(triables.sort()).toEqual(['debut', 'recu', 'tauxEffort']);
  });
  it('détail du taux : calcul, ressources examinées, Défenseur des droits ; Visale seulement pour un dossier Visale', () => {
    const { app, dom } = ouvrir();
    app._candCmpTaux('hl');
    const h = dom['cmpd-body'].innerHTML;
    expect(h).toContain('820 € ÷ 2100 € = 39 %');
    expect(h).toContain('examinées');
    expect(h).toContain('allocations comprises');
    expect(h).toContain(AideDecision.SOURCES.defenseur.url);
    expect(h).not.toContain('visale.fr');
    expect(dom['cmpd-foot'].innerHTML).toContain('Ouvrir le dossier');
  });
  it('détail des pièces : chaque pièce avec son état et la raison', () => {
    const { app, dom } = ouvrir();
    app._candCmpPieces('hl');
    const h = dom['cmpd-body'].innerHTML;
    expect((h.match(/cmp-prow/g) || []).length).toBe(4);
    expect(h).toContain('Le net à payer ne correspond pas au calcul');
  });
  it('ouvrir un dossier : le détail se ferme, la fiche s\'ouvre (la décision se prend dans la fiche)', () => {
    const { app, j } = ouvrir();
    app._candCmpOuvrirDossier('lr');
    expect(j.fermes).toContain('ov-cand-cmp-detail');
    expect(j.fiches).toEqual(['lr']);
  });
});

describe('repère du taux d\'effort : celui du propriétaire', () => {
  it('enregistré dans les réglages du compte, le même pour tous les dossiers', () => {
    const DB = parc();
    const { app, j, dom } = monter(DB, { radio: 'repere', saisie: '35' });
    dom['cand-f-bien'].value = 'T3'; app.ouvrirComparaisonCandidats();
    app._candCmpRepereEnregistrer();
    expect(DB.params.aideDecision.repereTauxEffort).toBe(35);
    expect(j.saves).toBe(1);
    const h = dom['cmp-body'].innerHTML;
    expect((h.match(/dans le repère/g) || []).length).toBe(2);
    expect((h.match(/au-dessus/g) || []).length).toBe(1);
  });
  it('valeur hors limites : message, rien n\'est enregistré', () => {
    const DB = parc();
    const { app, j } = monter(DB, { radio: 'repere', saisie: '250' });
    app._candCmpRepereEnregistrer();
    expect(DB.params.aideDecision && DB.params.aideDecision.repereTauxEffort).toBeFalsy();
    expect(j.saves).toBe(0);
    expect(j.toasts[0][1]).toBe('warn');
  });
  it('« Aucun » retire le repère', () => {
    const DB = parc(); DB.params.aideDecision = { repereTauxEffort: 33 };
    const { app } = monter(DB, { radio: 'aucun' });
    app._candCmpRepereEnregistrer();
    expect('repereTauxEffort' in DB.params.aideDecision).toBe(false);
  });
});

describe('relecture adverse (16/10)', () => {
  const ouvrir = (opts) => { const m = monter(parc(), opts); m.dom['cand-f-bien'].value = 'T3'; m.app.ouvrirComparaisonCandidats(); return m; };
  it('« dans le repère » sans icône de validation ; « au-dessus du repère » dit de quoi', () => {
    const DB = parc(); DB.params.aideDecision = { repereTauxEffort: 35 };
    const { app, dom } = monter(DB); dom['cand-f-bien'].value = 'T3'; app.ouvrirComparaisonCandidats();
    const h = dom['cmp-body'].innerHTML;
    expect(h).toContain('au-dessus du repère');
    expect(h).not.toContain('<svg data-i="check"></svg>dans le repère');
    expect(h).toContain('<span class="cmp-rp">dans le repère</span>');
  });
  it('colonne « État des pièces » ; début souhaité dans les deux sens ; début dans la ligne étroite', () => {
    const h = ouvrir().dom['cmp-body'].innerHTML;
    expect(h).toContain('<th>État des pièces</th>');
    expect(h).toContain('value="debut|desc"');
    expect(h).toContain(' · début 01/11/2026 · ');
  });
  it('lecture seule : repère affiché, non modifiable', () => {
    const DB = parc();
    const { app, dom, j } = monter(DB, { lectureSeule: true, radio: 'repere', saisie: '35' });
    dom['cand-f-bien'].value = 'T3'; app.ouvrirComparaisonCandidats();
    expect(dom['cmp-body'].innerHTML).not.toContain('_candCmpRepereOuvrir()');
    app._candCmpRepereEnregistrer();
    expect(j.saves).toBe(0);
    expect(DB.params.aideDecision).toBeUndefined();
  });
  it('lire le repère ne crée rien dans les réglages', () => {
    const DB = parc(); const { app } = monter(DB);
    expect(app._candCmpRepere()).toBeNull();
    expect(DB.params.aideDecision).toBeUndefined();
  });
  it('le détail des pièces ouvert se met à jour au rafraîchissement', () => {
    const { app, dom } = ouvrir();
    app._candCmpPieces('cm');
    expect(app.etat().detail).toEqual({ type: 'pieces', id: 'cm' });
    dom['ov-cand-cmp-detail'].classList.remove('hidden');
    dom['cmpd-body'].innerHTML = 'périmé';
    app._candCmpRafraichir();
    expect(dom['cmpd-body'].innerHTML).toContain('cmp-prow');
  });
  it('modales ouvertes depuis la fiche (édition, bail) : la comparaison se ferme d’abord', () => {
    for (const n of ['_editCandidatFromFiche', 'convertCandidatToBail']) expect(extraireFonction(P1, n)).toContain("closeM('ov-cand-comparer')");
  });
  it('vérification des pièces : la comparaison ouverte est rafraîchie, la boucle s’arrête si elle est fermée', () => {
    expect(extraireFonction(P1, '_candVerifierPieces')).toContain('_candCmpRafraichir()');
    expect(extraireFonction(P1, 'ouvrirComparaisonCandidats')).toContain('if(!_candCmpOuvert()) break;');
  });
});

describe('échappement', () => {
  it('nom et identifiant hostiles neutralisés', () => {
    const DB = parc();
    DB.candidats[0].prenom = '<img src=x onerror=alert(1)>'; DB.candidats[0].id = "a'b";
    DB.documents.filter((d) => d.parentId === 'cm').forEach((d) => { d.parentId = "a'b"; });
    const { app, dom } = monter(DB);
    dom['cand-f-bien'].value = 'T3'; app.ouvrirComparaisonCandidats();
    const h = dom['cmp-body'].innerHTML;
    expect(h).not.toContain('<img src=x');
    expect(h).toContain("_candCmpOuvrirDossier('a\\'b')");
  });
});

describe('cohérence des libellés (app, fiche, page de dépôt du relais)', () => {
  it('fiche : taux d\'effort charges comprises, plus de ratio revenus / loyer', () => {
    const f = extraireFonction(P1, 'openFicheCandidat');
    expect(f).toContain('Taux d\'effort');
    expect(f).toContain('_loyerCCBienDetail(c.logRef);');
    expect(f).toContain('Ressources nettes mensuelles');
    expect(f).toContain('allocations comprises');
    expect(f).not.toMatch(/Ratio revenus|information, sans seuil/);
  });
  it('formulaire de l\'app et page de dépôt : ressources nettes mensuelles, allocations comprises', () => {
    expect(lire('index.html')).toContain('Ressources nettes mensuelles, allocations comprises (€)');
    const dep = lire('relay/public/dossier.js');
    expect(dep).toContain('Ressources nettes mensuelles, allocations comprises (€)');
    expect(dep).toContain('le propriétaire peut comparer les dossiers reçus pour ce logement sur des critères objectifs');
    expect(dep).toContain('sans note ni classement');
  });
  it('page de dépôt modifiée → ASSET_VERSION 6', () => {
    expect(lire('relay/src/dossier-page.js')).toContain("export const ASSET_VERSION = '6';");
  });
  it('module exposé et préchargé', () => {
    expect(lire('js/main.js')).toContain('window.AideDecision = AideDecision;');
    expect(lire('index.html')).toContain('<link rel="modulepreload" href="js/core/aide-decision-candidats.js">');
  });
});
