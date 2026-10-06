/**
 * __tests__/helpers/stockage-message-vrai.test.js — CDC-STOCKAGE lot 3, gate G4 (S-6, D1 B) + §3.7.
 *
 * « Le message dit la vérité. » Quand la copie de l'appareil (miroir) ne peut pas être écrite :
 *   - EN LIGNE (cloud) : la modification part au cloud → saveDB rend VRAI, un avis UNIQUE par session,
 *     jamais « PAS enregistrée » ; les appelants (journal de bail, avenant, EDL) n'annulent plus rien ;
 *   - HORS LIGNE / réseau coupé, sandbox, ancien mode local : le miroir était la seule destination →
 *     FAUX et « PAS enregistrée » (invariant 19l, inchangé ici).
 * Partie pure (verdictEchecMiroir, modeMiroir, etatCopieAppareil) + le VRAI saveDB extrait d'index.html
 * et EXÉCUTÉ avec le vrai module, un faux localStorage à quota, et le vrai `_miroirEchec`.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as Stockage from '../../js/core/stockage-local.js';
import { creerMiroir } from '../../js/core/miroir-local.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';
import { extraireFonction } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const T = Stockage.TEXTES_ECHEC_MIROIR;

describe('G4 — verdictEchecMiroir : table §3.3 (3 modes × EDL / non-EDL)', () => {
  for (const quoi of ['edl', 'logement', undefined]) {
    it(`cloud en ligne (${quoi || 'non étiquetée'}) : VRAI, avis unique, jamais « PAS enregistrée »`, () => {
      const v = Stockage.verdictEchecMiroir({ mode: 'cloud-en-ligne', quoi });
      if (quoi === 'edl') {
        expect(v).toEqual({ retour: false, type: 'err', unique: 'edl', message: T.edl });           // sans IndexedDB : pas durable
        expect(Stockage.verdictEchecMiroir({ mode: 'cloud-en-ligne', quoi, miroirIdb: true }).retour).toBe(true);
        return;
      }
      expect(v).toEqual({ retour: true, type: 'warn', unique: 'copie', message: T.enLigne });
      expect(v.message).not.toMatch(/PAS enregistrée/);
      expect(v.message).toMatch(/bien enregistrée dans le cloud/);
    });
    it(`cloud hors ligne (${quoi || 'non étiquetée'}) : FAUX, « PAS enregistrée »`, () => {
      expect(Stockage.verdictEchecMiroir({ mode: 'cloud-hors-ligne', quoi })).toEqual({ retour: false, type: 'err', unique: false, message: T.horsLigne });
    });
    it(`sandbox / local (${quoi || 'non étiquetée'}) : FAUX, « PAS enregistrée »`, () => {
      expect(Stockage.verdictEchecMiroir({ mode: 'local', sandbox: true, quoi })).toMatchObject({ retour: false, message: T.sandbox });
      expect(Stockage.verdictEchecMiroir({ mode: 'local', sandbox: false, quoi })).toMatchObject({ retour: false, message: T.local });
    });
  }
  it('mode inconnu : traité comme une PERTE (jamais un enregistrement qu’on ne peut prouver)', () => {
    expect(Stockage.verdictEchecMiroir({ mode: null }).retour).toBe(false);
    expect(Stockage.verdictEchecMiroir({}).retour).toBe(false);
  });
  it('les textes perdus disent « PAS enregistrée » ; aucun ne tutoie (charte M-13)', () => {
    for (const k of ['horsLigne', 'sandbox', 'local', 'sessionMorte']) expect(T[k]).toMatch(/n’est PAS enregistrée/);
    for (const k of ['edl', 'reseauCoupe']) expect(T[k]).toMatch(/pas encore en sécurité/);
    expect(Stockage.verdictEchecMiroir({ mode: 'cloud-reseau-coupe' })).toEqual({ retour: false, type: 'err', unique: false, message: T.reseauCoupe });
    expect(Stockage.verdictEchecMiroir({ mode: 'cloud-session-morte', quoi: 'edl', miroirIdb: true })).toEqual({ retour: false, type: 'err', unique: false, message: T.sessionMorte });
    expect(Stockage.verdictEchecMiroir({ mode: 'cloud-en-ligne', quoi: 'edl-photo' }).retour).toBe(false);
    for (const t of Object.values(T)) expect(t).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
  });
  it('modeMiroir : cloud + hors ligne ou réseau coupé → hors ligne ; cloud en ligne ; sans cloud → local', () => {
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: true })).toBe('cloud-en-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: undefined })).toBe('cloud-en-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: true, enLigne: true })).toBe('cloud-hors-ligne');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: false })).toBe('cloud-reseau-coupe');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: false, enLigne: true, sessionMorte: true })).toBe('cloud-session-morte');
    expect(Stockage.modeMiroir({ cloud: true, horsLigne: true, enLigne: false, sessionMorte: true })).toBe('cloud-hors-ligne');
    expect(Stockage.modeMiroir({ cloud: false, horsLigne: false, enLigne: true })).toBe('local');
  });
});

describe('§3.7 — etatCopieAppareil : les 5 états de la maquette', () => {
  const MAINT = new Date(2026, 9, 6, 16, 0).getTime();
  const H1432 = new Date(2026, 9, 6, 14, 32).getTime();
  const VEILLE = new Date(2026, 9, 5, 14, 32).getTime();
  const e = o => Stockage.etatCopieAppareil(Object.assign({ cloud: true, sandbox: false, maintenant: MAINT }, o));
  it('A — à jour (IndexedDB), avec l’heure de la dernière mise à jour', () => {
    expect(e({ backend: 'indexeddb', dernierOk: H1432 })).toEqual({ etat: 'a-jour', libelle: 'À jour', ton: 'grn', explication: 'Dernière mise à jour aujourd’hui à 14:32.' });
  });
  it('B — mode réduit (repli localStorage)', () => {
    expect(e({ backend: 'localStorage' })).toMatchObject({ etat: 'reduit', ton: 'blu', libelle: 'Mode réduit' });
  });
  it('C — pas à jour : depuis la dernière écriture RÉUSSIE ; date complète si un autre jour', () => {
    const c = e({ backend: 'indexeddb', dernierOk: VEILLE, echecDepuis: H1432 });
    expect(c).toMatchObject({ etat: 'pas-a-jour', ton: 'blu', libelle: 'Pas à jour depuis le 05/10 à 14:32' });
    expect(c.explication).toBe('Le stockage de cet appareil est plein. Les modifications sont bien enregistrées dans le cloud ; sans réseau, cet appareil afficherait les données du 05/10 à 14:32.');
    expect(e({ echecDepuis: H1432 }).libelle).toBe('Pas à jour depuis 14:32');
    const hl = e({ echecDepuis: H1432, enLigne: false });                  // hors ligne : pas de « bien enregistrées »
    expect(hl.etat).toBe('pas-a-jour');
    expect(hl.explication).not.toMatch(/bien enregistrées/);
  });
  it('priorité : pas à jour > incomplète > mode réduit > à jour', () => {
    expect(e({ backend: 'localStorage', copieIncomplete: true, echecDepuis: H1432 }).etat).toBe('pas-a-jour');
    expect(e({ backend: 'localStorage', copieIncomplete: true }).etat).toBe('incomplete');
    expect(e({ backend: 'localStorage' }).etat).toBe('reduit');
  });
  it('D — incomplète ; E — base de test ; sans cloud hors sandbox : base locale', () => {
    expect(e({ copieIncomplete: true })).toMatchObject({ etat: 'incomplete', ton: 'blu', libelle: 'Incomplète' });
    expect(e({ cloud: false, sandbox: true })).toMatchObject({ etat: 'test', ton: 'gry', libelle: 'Base de test' });
    expect(e({ cloud: false, sandbox: false })).toMatchObject({ etat: 'local', ton: 'gry' });
  });
  it('aucun texte d’état ne tutoie (M-13)', () => {
    for (const o of [{}, { backend: 'localStorage' }, { copieIncomplete: true }, { echecDepuis: H1432 }, { cloud: false, sandbox: true }]) {
      const x = e(o);
      expect(x.libelle + ' ' + x.explication).not.toMatch(/\b(tu|ton|ta|tes|toi)\b/i);
    }
  });
  it('enMo : virgule décimale, jamais « 0,0 Mo » pour un contenu non vide', () => {
    expect(Stockage.enMo(2_469_835)).toBe('2,4 Mo');
    expect(Stockage.enMo(50_000)).toBe('< 0,1 Mo');
    expect(Stockage.enMo(0)).toBe('0,0 Mo');
    expect(Stockage.occupationStockage(() => { throw new Error('SecurityError'); })).toBe(0);
  });
});

// ── Le VRAI saveDB, avec le VRAI _miroirEchec ───────────────────────────────────────────────

let HTML;
beforeAll(() => { HTML = readFileSync(resolve(repoRoot, 'index.html'), 'utf8'); });

/** Les déclarations d'état du bloc, telles qu'écrites dans l'app (de `let _saveDBQuotaAt` à `_miroirNoterOk`). */
function etatDeclare() {
  const i = HTML.indexOf('let _saveDBQuotaAt = 0;');
  const j = HTML.indexOf('function _miroirNoterOk(', i);
  if (i < 0 || j < 0) throw new Error('déclarations du bloc introuvables');
  return HTML.slice(i, j);
}

/** IndexedDB de laboratoire minimal pour le miroir du lot 4 (voir miroir-local.test.js). */
function fauxIdb() {
  let enr = null;
  return { get enr() { return enr; }, async existe() { return false; }, async lire() { return enr; },
    async ecrire(e) { enr = e; }, async effacer() { enr = null; }, async supprimerBase() { enr = null; } };
}

/** Monte saveDB + le bloc d'échec tels qu'écrits dans l'app. `miroir` : instance du miroir du lot 4 (sinon écrivain local). */
function monter({ cloud = true, horsLigne = false, enLigne = true, sessionMorte = false, sandbox = false, module = true, plein = true, miroir = null, stockage = null }) {
  const toasts = [];
  const envois = [];
  const st = stockage || fauxStockageQuota({ quota: plein ? 100 : Infinity });   // plein : rien ne tient
  const win = { __immoSupabaseMode: cloud, __immoHorsLigne: horsLigne, __immoSessionMorte: sessionMorte,
    __immoMarkDirty: () => envois.push(1), __immoEcritureHorsLigneOK: () => true };
  if (module) win._stockage = Stockage;
  if (miroir) win._miroirLocal = { miroir: () => miroir };
  const src = etatDeclare()
    + ['saveDB', '_miroirEcrire', '_miroirEcrireCloud', '_miroirNoterOk', '_miroirModeCourant', '_miroirIdbPlanifie', '_miroirEchec']
      .map(n => extraireFonction(HTML, n)).join('\n')
    + '\n' + HTML.slice(HTML.indexOf('window.__immoMiroirPasAJour = function'), HTML.indexOf('};', HTML.indexOf('window.__immoMiroirPasAJour = function')) + 2)
    + '\nreturn { saveDB, etat: () => ({ _miroirEchecDepuis, _miroirDernierOk, avis: [..._miroirAvisDonnes] }) };';
  const r = new Function('window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', 'navigator', 'showToast', '_isTestMode', 'console', src)(
    win, st, sandbox ? '_test_immotrack_v4' : 'immotrack_v4', { baux: {}, logements: [], edl: [], x: chaine(500) }, false,
    { onLine: enLigne }, (m, t) => toasts.push([t, m]), sandbox, { error() {}, info() {}, warn() {} });
  return Object.assign(r, { toasts, envois, st, win });
}

describe('G4 — câblage dans saveDB (miroir plein)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('EN LIGNE : VRAI, envoi au cloud marqué, UN SEUL avis même au-delà de 10 s, jamais « PAS enregistrée »', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 6, 14, 0));
    const m = monter({});
    expect(m.saveDB({ quoi: 'bail-modification' })).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 6, 14, 5));
    expect(m.saveDB({ quoi: 'logement' })).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 6, 15, 0));
    expect(m.saveDB()).toBe(true);
    expect(m.envois.length).toBe(3);
    expect(m.toasts).toEqual([['warn', T.enLigne]]);
    expect(m.etat()._miroirEchecDepuis).toBeGreaterThan(0);                // la carte le dira
  });
  it('avis en ligne puis PERTE (réseau coupé) moins de 10 s après : la perte est DITE', () => {
    const m = monter({});
    m.saveDB();
    m.win.__immoHorsLigne = true;
    expect(m.saveDB({ quoi: 'edl' })).toBe(false);
    expect(m.toasts).toEqual([['warn', T.enLigne], ['err', T.horsLigne]]);
  });
  it('perte puis avis en ligne moins de 10 s après : l’avis est donné aussi', () => {
    const m = monter({ horsLigne: true });
    m.saveDB({ quoi: 'edl' });
    m.win.__immoHorsLigne = false;
    m.saveDB();
    expect(m.toasts).toEqual([['err', T.horsLigne], ['warn', T.enLigne]]);
  });
  it('EDL EN LIGNE sans IndexedDB (repli localStorage plein) : FAUX — pas « Enregistré » sur un envoi en mémoire', () => {
    const m = monter({});
    expect(m.saveDB({ quoi: 'edl', autosave: true })).toBe(false);
    expect(m.saveDB({ quoi: 'edl', autosave: true })).toBe(false);
    expect(m.envois.length).toBe(2);                                        // il part quand même au cloud
    expect(m.toasts).toEqual([['err', T.edl]]);                             // une fois (autosave toutes les 2 s)
  });
  it('EDL EN LIGNE avec IndexedDB (miroir du lot 4, écriture planifiée malgré un journal refusé) : VRAI', async () => {
    const st = fauxStockageQuota({ quota: 10 });                          // même `_ecrit_at` ne tient pas
    const miroir = creerMiroir({ idb: fauxIdb(), stockage: st });
    await miroir.initialiser();
    expect(miroir.backend()).toBe('indexeddb');
    const m = monter({ stockage: st, miroir });
    expect(m.saveDB({ quoi: 'edl' })).toBe(true);
    expect(m.toasts).toEqual([['warn', T.enLigne]]);
  });
  it('HORS LIGNE (mode hors ligne) : FAUX et « PAS enregistrée » (19l)', () => {
    const m = monter({ horsLigne: true });
    expect(m.saveDB({ quoi: 'edl' })).toBe(false);
    expect(m.toasts).toEqual([['err', T.horsLigne]]);
  });
  it('RÉSEAU COUPÉ en cours de session (navigator.onLine = false) : FAUX, « pas encore en sécurité »', () => {
    const m = monter({ enLigne: false });
    expect(m.saveDB({ quoi: 'bail-modification' })).toBe(false);
    expect(m.toasts).toEqual([['err', T.reseauCoupe]]);
  });
  it('SESSION EXPIRÉE : FAUX, « PAS enregistrée », jamais « bien enregistrée dans le cloud »', () => {
    const m = monter({ sessionMorte: true });
    expect(m.saveDB({ quoi: 'avenant-modification' })).toBe(false);
    expect(m.toasts).toEqual([['err', T.sessionMorte]]);
  });
  it('SANDBOX : FAUX, texte de la base de test', () => {
    const m = monter({ cloud: false, sandbox: true });
    expect(m.saveDB()).toBe(false);
    expect(m.toasts).toEqual([['err', T.sandbox]]);
  });
  it('module absent : comportement d’avant (FAUX, « PAS enregistrée »), même en ligne', () => {
    const m = monter({ module: false });
    expect(m.saveDB()).toBe(false);
    expect(m.toasts[0][1]).toMatch(/PAS enregistrée/);
  });
  it('échec PUIS réussite : l’état revient « à jour » (échec effacé), dernière écriture datée', () => {
    let plein = true;
    const st = fauxStockageQuota({ quota: Infinity });
    const set = st.setItem.bind(st);
    st.setItem = (k, v) => { if (plein && String(k).startsWith('immotrack_v4')) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return set(k, v); };
    const m = monter({ stockage: st });
    m.saveDB();
    expect(m.etat()._miroirEchecDepuis).toBeGreaterThan(0);
    plein = false;
    expect(m.saveDB()).toBe(true);
    expect(m.etat()._miroirEchecDepuis).toBe(0);
    expect(m.etat()._miroirDernierOk).toBeGreaterThan(0);
  });
  it('un showToast qui lève ne fait JAMAIS sauter l’envoi au cloud', () => {
    const m = monter({});
    const casse = new Function('window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', 'navigator', 'showToast', '_isTestMode', 'console',
      etatDeclare() + ['saveDB', '_miroirEcrire', '_miroirEcrireCloud', '_miroirNoterOk', '_miroirModeCourant', '_miroirIdbPlanifie', '_miroirEchec']
        .map(n => extraireFonction(HTML, n)).join('\n') + '\nreturn saveDB;')(
      m.win, m.st, 'immotrack_v4', {}, false, { onLine: true }, () => { throw new Error('toast'); }, false, { error() {} });
    expect(casse()).toBe(true);
    expect(m.envois.length).toBe(1);
  });
});

describe('__immoMiroirPasAJour — signaux hors saveDB (echec-repli du lot 4, rebase au login)', () => {
  it('en ligne : état « pas à jour » + avis unique ; silencieux : état seul ; hors ligne : rend faux (texte de l’appelant)', () => {
    const m = monter({});
    expect(m.win.__immoMiroirPasAJour({ silencieux: true })).toBe(true);
    expect(m.toasts).toEqual([]);
    expect(m.etat()._miroirEchecDepuis).toBeGreaterThan(0);
    expect(m.win.__immoMiroirPasAJour()).toBe(true);
    expect(m.win.__immoMiroirPasAJour()).toBe(true);
    expect(m.toasts).toEqual([['warn', T.enLigne]]);
    m.saveDB();                                                             // l'avis « copie » est déjà donné
    expect(m.toasts.length).toBe(1);
    const h = monter({ horsLigne: true });
    expect(h.win.__immoMiroirPasAJour()).toBe(false);
    expect(h.toasts).toEqual([]);
  });
  it('câblage dans supabase-entry : echec-repli en ligne → pas de toast propre ; rebase raté → signal silencieux ; session expirée posée', () => {
    const E = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8');
    expect(E).toMatch(/if \(s\.type === 'echec-repli'\) \{ try \{ if \(typeof window\.__immoMiroirPasAJour === 'function' && window\.__immoMiroirPasAJour\(\)\) return \} catch \(e\) \{\} \}/);
    expect(E).toMatch(/_ecrireMiroir\(db\) === false && typeof window\.__immoMiroirPasAJour === 'function'\) window\.__immoMiroirPasAJour\(\{ silencieux: true \}\)/);
    expect(E).toMatch(/_deadShown = true\s+window\.__immoSessionMorte = true/);
  });
});

describe('Appelants : plus d’annulation en ligne pour un miroir plein', () => {
  it('journal de bail et avenant annulent SEULEMENT sur un retour faux (que saveDB ne rend plus en ligne)', () => {
    const SRC1 = readFileSync(resolve(repoRoot, 'js/app/app-part1.js'), 'utf8');
    expect(SRC1).toMatch(/_okJ = saveDB\(\{ quoi: 'bail-modification' \}\)[\s\S]{0,200}if \(_okJ === false\)/);
    expect(SRC1).toMatch(/ok=\(typeof saveDB==='function'\)\?saveDB\(\{quoi:quoi\}\):true/);
  });
});

describe('Carte Réglages : la jauge « ~10 MB » a disparu, la carte est câblée', () => {
  it('plus de db-size-badge ni d’updateDBSizeBadge ; carte stockage-card présente et rendue à l’ouverture de Réglages', () => {
    const SRC2 = readFileSync(resolve(repoRoot, 'js/app/app-part2.js'), 'utf8');
    expect(HTML).not.toMatch(/db-size-badge|updateDBSizeBadge|getDBSizeKB|KB \/ ~10 MB<\/span>/);
    expect(HTML).toMatch(/id="stockage-card"/);
    expect((SRC2.match(/^\s*(?:rParamsRules\(\); rParamsBail\(\); )?_renderStockageCard\(\);/gm) || []).length).toBe(2);
  });
});
